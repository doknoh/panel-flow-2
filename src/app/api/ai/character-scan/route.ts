import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

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

    // 1. Fetch existing character data
    const { data: character } = await supabase
      .from('characters')
      .select('*')
      .eq('id', characterId)
      .single()

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // 2. Gather all visual descriptions mentioning this character
    const { data: panels } = await supabase
      .from('panels')
      .select('visual_description, page_id')
      .contains('characters_present', [characterId])
      .not('visual_description', 'is', null)
      .limit(50)

    // 3. Gather all dialogue for this character
    const { data: dialogues } = await supabase
      .from('dialogue_blocks')
      .select('text, dialogue_type, modifier')
      .eq('character_id', characterId)
      .not('text', 'is', null)
      .limit(100)

    const descriptions = (panels || []).map(p => p.visual_description).filter(Boolean)
    const dialogueTexts = (dialogues || []).map(d => d.text).filter(Boolean)

    if (descriptions.length === 0 && dialogueTexts.length === 0) {
      return NextResponse.json({
        suggestions: null,
        descriptionsAnalyzed: 0,
        dialoguesAnalyzed: 0,
        message: 'No script content found for this character. Add them to panels or dialogue first.',
      })
    }

    // 4. Build extraction prompt
    const prompt = `Analyze these comic script excerpts for the character "${character.name}" (display name: ${character.display_name || character.name}).

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

    // 5. Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You are a character analysis assistant for a comic book script writing tool. Extract character attributes strictly from the provided manuscript text. Never invent details not supported by the source material. Return valid JSON only — no markdown, no explanation, just the JSON object.',
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const rawText = textBlock?.type === 'text' ? textBlock.text : null

    // 6. Parse JSON response
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
