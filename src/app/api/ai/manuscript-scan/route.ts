import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { userCanAccessSeries } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Common ALL-CAPS words that are NOT character names in comic scripts
const COMMON_EXCLUSIONS = new Set([
  // Script directions
  'INT', 'EXT', 'CLOSE', 'WIDE', 'POV', 'CUT', 'FADE', 'PAN', 'ZOOM',
  'ANGLE', 'INSERT', 'CONT', 'CONTINUED', 'END', 'BEGIN', 'OPEN', 'SHOT',
  // Shot types
  'CU', 'MCU', 'ECU', 'MS', 'LS', 'ELS', 'WS', 'OTS', 'OS',
  // Page/panel terms
  'PAGE', 'PANEL', 'SPLASH', 'SPREAD', 'INSET', 'TIER',
  // Dialogue types
  'VO', 'SFX', 'CAP', 'CAPTION', 'WHISPER', 'SHOUT', 'THOUGHT',
  'ELECTRONIC', 'RADIO', 'BACKGROUND',
  // Orientation
  'LEFT', 'RIGHT',
  // Common actions/descriptors that appear in caps
  'THE', 'AND', 'BUT', 'FOR', 'NOT', 'ARE', 'WAS', 'HIS', 'HER',
  'HAS', 'HAD', 'WHO', 'ALL', 'CAN', 'OUT', 'DAY', 'GET', 'HIM',
  'GOT', 'LET', 'SAY', 'SHE', 'TOO', 'USE', 'WAY', 'OFF', 'OLD',
  'NEW', 'NOW', 'OUR', 'OWN', 'SET', 'TRY', 'RUN', 'TWO', 'HOW',
  'ACT', 'ADD', 'AGE', 'AGO', 'AID', 'AIM', 'AIR', 'ARM', 'ART',
  'ASK', 'BAD', 'BIG', 'BIT', 'BOX', 'BOY', 'CAR', 'COP', 'DIE',
  'DOG', 'EAR', 'EAT', 'EYE', 'FAR', 'FEW', 'GUN', 'GUY', 'HIT',
  'HOT', 'JOB', 'KEY', 'KID', 'LAY', 'LED', 'LIE', 'LOT', 'LOW',
  'MAN', 'MEN', 'MRS', 'ODD', 'PAY', 'PUT', 'RED', 'RID', 'SAT',
  'SIR', 'SIT', 'SIX', 'SON', 'TEN', 'TOP', 'WAR', 'WON', 'YES',
  // Scene/location descriptors
  'NIGHT', 'MORNING', 'EVENING', 'AFTERNOON', 'DAWN', 'DUSK',
  'LATER', 'SAME', 'CONTINUOUS', 'FLASHBACK', 'PRESENT',
  'INTERIOR', 'EXTERIOR', 'ESTABLISHING',
  // Common visual directions
  'BOOM', 'BANG', 'CRASH', 'SLAM', 'THUD', 'CRACK', 'SNAP',
  'CLICK', 'THWACK', 'WHACK', 'SMASH', 'BLAST', 'WHOOSH',
])

interface NameCandidate {
  name: string
  frequency: number
  contexts: string[]
}

export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.manuscriptScan(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    const { seriesId } = await request.json()

    if (!seriesId) {
      return NextResponse.json(
        { error: 'seriesId is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this series
    const hasAccess = await userCanAccessSeries(supabase, user.id, seriesId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // 1. Fetch existing characters (names + aliases for cross-reference)
    const { data: characters } = await supabase
      .from('characters')
      .select('id, name, display_name, aliases')
      .eq('series_id', seriesId)

    // 2. Fetch dismissed names
    const { data: dismissedNames } = await supabase
      .from('dismissed_character_names')
      .select('name')
      .eq('series_id', seriesId)

    // 3. Build set of known names (uppercased for comparison)
    const knownNames = new Set<string>()
    for (const char of (characters || [])) {
      knownNames.add(char.name.toUpperCase())
      if (char.display_name) {
        knownNames.add(char.display_name.toUpperCase())
      }
      if (char.aliases && Array.isArray(char.aliases)) {
        for (const alias of char.aliases) {
          if (alias) knownNames.add(alias.toUpperCase())
        }
      }
    }

    const dismissedSet = new Set<string>(
      (dismissedNames || []).map(d => d.name.toUpperCase())
    )

    // 4. Fetch all panels for the series using nested joins + JS filter
    const { data: allPanels } = await supabase
      .from('panels')
      .select(
        'id, visual_description, page:page_id(scene:scene_id(act:act_id(issue:issue_id(series_id))))'
      )
      .not('visual_description', 'is', null)

    const seriesPanels = (allPanels || []).filter(p => {
      const panelSeriesId = (p as any)?.page?.scene?.act?.issue?.series_id
      return panelSeriesId === seriesId
    })

    // 5. Pattern match ALL CAPS words in visual descriptions
    const capsRegex = /\b[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)*\b/g
    const nameFrequency = new Map<string, { count: number; contexts: string[] }>()

    for (const panel of seriesPanels) {
      const desc = panel.visual_description || ''
      const matches = desc.match(capsRegex)

      if (!matches) continue

      for (const match of matches) {
        const trimmed = match.trim()

        // Skip single characters or very long phrases (>4 words)
        const wordCount = trimmed.split(/\s+/).length
        if (trimmed.length < 2 || wordCount > 4) continue

        // Skip common exclusions
        if (COMMON_EXCLUSIONS.has(trimmed)) continue

        // Skip if individual words are all excluded
        if (wordCount > 1) {
          const words = trimmed.split(/\s+/)
          if (words.every((w: string) => COMMON_EXCLUSIONS.has(w))) continue
        }

        // Skip known character names
        if (knownNames.has(trimmed)) continue

        // Skip dismissed names
        if (dismissedSet.has(trimmed)) continue

        // Track frequency and collect context snippets
        const existing = nameFrequency.get(trimmed)
        if (existing) {
          existing.count += 1
          // Keep up to 3 context snippets
          if (existing.contexts.length < 3) {
            // Extract ~80 chars around the match for context
            const idx = desc.indexOf(trimmed)
            const contextStart = Math.max(0, idx - 30)
            const contextEnd = Math.min(desc.length, idx + trimmed.length + 50)
            const snippet = (contextStart > 0 ? '...' : '') +
              desc.slice(contextStart, contextEnd) +
              (contextEnd < desc.length ? '...' : '')
            existing.contexts.push(snippet)
          }
        } else {
          const idx = desc.indexOf(trimmed)
          const contextStart = Math.max(0, idx - 30)
          const contextEnd = Math.min(desc.length, idx + trimmed.length + 50)
          const snippet = (contextStart > 0 ? '...' : '') +
            desc.slice(contextStart, contextEnd) +
            (contextEnd < desc.length ? '...' : '')
          nameFrequency.set(trimmed, { count: 1, contexts: [snippet] })
        }
      }
    }

    // 6. Filter to names with 2+ occurrences, cap at 30 candidates
    const candidates: NameCandidate[] = []
    for (const [name, data] of nameFrequency) {
      if (data.count >= 2) {
        candidates.push({
          name,
          frequency: data.count,
          contexts: data.contexts,
        })
      }
    }
    candidates.sort((a, b) => b.frequency - a.frequency)
    const topCandidates = candidates.slice(0, 30)

    if (topCandidates.length === 0) {
      const duration = Math.round(performance.now() - start)
      logger.info('Manuscript scan complete — no candidates found', {
        userId: user.id,
        seriesId,
        action: 'manuscript_scan',
        duration,
        panelsScanned: seriesPanels.length,
      })

      return NextResponse.json({
        names: [],
        panelsScanned: seriesPanels.length,
        message: 'No new character name candidates found in the manuscript.',
      })
    }

    // 7. Send to Claude for AI disambiguation
    const existingCharList = (characters || [])
      .map(c => {
        const aliases = c.aliases?.length ? ` (aliases: ${c.aliases.join(', ')})` : ''
        return `- ${c.name}${aliases}`
      })
      .join('\n')

    const candidateList = topCandidates
      .map(c =>
        `"${c.name}" (appears ${c.frequency}x)\nContexts:\n${c.contexts.map(ctx => `  - ${ctx}`).join('\n')}`
      )
      .join('\n\n')

    const aiPrompt = `You are analyzing a comic book manuscript to find character names that may not be in the database yet.

EXISTING CHARACTERS (already tracked):
${existingCharList || '(none)'}

CANDIDATE NAMES FOUND IN ALL-CAPS IN VISUAL DESCRIPTIONS:
${candidateList}

For each candidate, determine whether it is likely:
1. A CHARACTER NAME (a person, creature, or entity that should be tracked)
2. NOT a character name (a location, object, action, sound effect, or script direction)

Return a JSON array of objects with these fields:
- "name": the candidate name exactly as provided
- "confidence": number 0.0 to 1.0 (how confident this is a character name)
- "reasoning": brief explanation (1 sentence)

Only include entries where confidence >= 0.3. Return valid JSON array only — no markdown, no explanation.`

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'You are a character name disambiguation assistant for a comic book script writing tool. Analyze capitalized words from visual descriptions and determine which are character names vs. other script elements. Return valid JSON only.',
      messages: [{ role: 'user', content: aiPrompt }],
    })

    const textBlock = aiResponse.content.find(b => b.type === 'text')
    const rawText = textBlock?.type === 'text' ? textBlock.text : null

    let aiResults: Array<{ name: string; confidence: number; reasoning: string }> = []
    if (rawText) {
      try {
        aiResults = JSON.parse(rawText)
      } catch {
        // Try extracting from code block
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          aiResults = JSON.parse(jsonMatch[1])
        } else {
          const arrayMatch = rawText.match(/\[[\s\S]*\]/)
          if (arrayMatch) {
            aiResults = JSON.parse(arrayMatch[0])
          }
        }
      }
    }

    // Merge AI results with frequency/context data
    const results = aiResults
      .filter(r => r.confidence >= 0.3)
      .map(r => {
        const candidate = topCandidates.find(c => c.name === r.name)
        return {
          name: r.name,
          frequency: candidate?.frequency ?? 0,
          confidence: r.confidence,
          reasoning: r.reasoning,
          contexts: candidate?.contexts ?? [],
        }
      })
      .sort((a, b) => b.confidence - a.confidence || b.frequency - a.frequency)

    const duration = Math.round(performance.now() - start)
    logger.info('Manuscript scan complete', {
      userId: user.id,
      seriesId,
      action: 'manuscript_scan',
      duration,
      panelsScanned: seriesPanels.length,
      candidatesFound: topCandidates.length,
      aiConfirmed: results.length,
    })

    return NextResponse.json({
      names: results,
      panelsScanned: seriesPanels.length,
      candidatesFound: topCandidates.length,
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Manuscript scan error', {
      action: 'manuscript_scan',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to scan manuscript' },
      { status: 500 }
    )
  }
}
