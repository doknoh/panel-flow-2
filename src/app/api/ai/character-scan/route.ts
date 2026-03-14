import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { userCanAccessSeries } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const maxDuration = 30

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.aiCharacterScan(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    const { characterId, seriesId } = await request.json()

    if (!characterId || !seriesId) {
      return NextResponse.json({ error: 'Missing characterId or seriesId' }, { status: 400 })
    }

    // Verify user has access to this series
    const hasAccess = await userCanAccessSeries(supabase, user.id, seriesId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // 1. Fetch existing character data (including aliases)
    const { data: character } = await supabase
      .from('characters')
      .select('*')
      .eq('id', characterId)
      .single()

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // 2. Build list of all names to search for (primary + display + aliases)
    const allNames: string[] = [character.name]
    if (character.aliases && Array.isArray(character.aliases)) {
      for (const alias of character.aliases) {
        if (alias && !allNames.includes(alias)) {
          allNames.push(alias)
        }
      }
    }
    if (
      character.display_name &&
      !allNames.includes(character.display_name)
    ) {
      allNames.push(character.display_name)
    }

    // 3. Query panels via nested joins, then filter in JS with word-boundary regex
    const { data: allPanels } = await supabase
      .from('panels')
      .select(
        'visual_description, page_id, page:page_id(scene:scene_id(act:act_id(issue:issue_id(series_id))))'
      )
      .not('visual_description', 'is', null)

    const nameRegexes = allNames.map(name => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`\\b${escaped}\\b`, 'i')
    })

    const matchingPanels = (allPanels || []).filter(p => {
      const panelSeriesId = (p as any)?.page?.scene?.act?.issue?.series_id
      if (panelSeriesId !== seriesId) return false
      const desc = p.visual_description || ''
      return nameRegexes.some(regex => regex.test(desc))
    }).slice(0, 50)

    // 4. Gather all dialogue for this character
    const { data: dialogues } = await supabase
      .from('dialogue_blocks')
      .select('text, dialogue_type, delivery_instruction')
      .eq('character_id', characterId)
      .not('text', 'is', null)
      .limit(100)

    const descriptions = matchingPanels.map(p => p.visual_description).filter(Boolean)
    const dialogueTexts = (dialogues || []).map(d => d.text).filter(Boolean)

    if (descriptions.length === 0 && dialogueTexts.length === 0) {
      return NextResponse.json({
        suggestions: null,
        descriptionsAnalyzed: 0,
        dialoguesAnalyzed: 0,
        message: 'No script content found for this character. Add them to panels or dialogue first.',
      })
    }

    // 5. Build extraction prompt (includes aliases)
    const aliasNote = character.aliases?.length
      ? ` (also known as: ${character.aliases.join(', ')})`
      : ''
    const prompt = `Analyze these comic script excerpts for the character "${character.name}"${aliasNote} (display name: ${character.display_name || character.name}).

VISUAL DESCRIPTIONS WHERE THIS CHARACTER APPEARS:
${descriptions.join('\n---\n')}

DIALOGUE FROM THIS CHARACTER:
${dialogueTexts.join('\n---\n')}

Based ONLY on what is explicitly stated or clearly implied in these excerpts, extract the following attributes:

- age (text, e.g. "mid-30s" or "early 20s" — NOT a number)
- eye_color (text)
- hair_color_style (text, color and style together)
- height (text, e.g. "tall", "5'11\"")
- build (text, e.g. "athletic", "slight", "stocky")
- skin_tone (text)
- distinguishing_marks (text — scars, tattoos, birthmarks, prosthetics)
- style_wardrobe (text — typical clothing, accessories, signature look)
- physical_description (1-2 sentence prose summary for the artist)
- personality_traits (key traits observed from behavior and dialogue)
- speech_patterns (verbal tics, vocabulary level, rhythm — analyze actual dialogue)
- relationships (connections to other characters mentioned)
- arc_notes (any character development or arc revealed)

Rules:
- Only extract what is IN the manuscript text. Do NOT invent or assume details.
- If a field cannot be determined from the text, set it to null.
- For speech_patterns, analyze the actual dialogue samples provided.
- Be specific and concise.
- Return valid JSON only.

Return a single JSON object with these field names as keys.`

    // 6. Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You are a character analysis assistant for a comic book script writing tool. Extract character attributes strictly from the provided manuscript text. Never invent details not supported by the source material. Return valid JSON only — no markdown, no explanation, just the JSON object.',
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const rawText = textBlock?.type === 'text' ? textBlock.text : null

    // 7. Parse JSON response
    let suggestions = null
    if (rawText) {
      try {
        // Try direct parse first
        suggestions = JSON.parse(rawText)
      } catch {
        // Extract JSON from possible markdown code block
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[1])
        } else {
          // Try to find JSON object in text
          const objectMatch = rawText.match(/\{[\s\S]*\}/)
          if (objectMatch) {
            suggestions = JSON.parse(objectMatch[0])
          }
        }
      }
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Character scan complete', {
      userId: user.id,
      characterId,
      action: 'character_scan',
      duration,
      descriptionsAnalyzed: descriptions.length,
      dialoguesAnalyzed: dialogueTexts.length,
    })

    return NextResponse.json({
      suggestions,
      descriptionsAnalyzed: descriptions.length,
      dialoguesAnalyzed: dialogueTexts.length,
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Character scan error', {
      action: 'character_scan',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to scan character' },
      { status: 500 }
    )
  }
}
