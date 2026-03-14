import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Max characters of conversation text to send to Claude (~100K chars ≈ ~25K tokens)
const MAX_CONVERSATION_CHARS = 100_000

interface HarvestItem {
  type: 'story_beat' | 'scene_description' | 'panel_draft' | 'character_detail' | 'location_detail' | 'project_note' | 'dialogue_line'
  content: string
  destination: string
  confidence: 'high' | 'medium' | 'low'
}

export async function POST(req: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // F14: Rate limiting — harvest calls Claude API, treat as heavy AI operation
    const rateLimit = rateLimiters.aiHeavy(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before harvesting.' },
        { status: 429 }
      )
    }

    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    // Load guided session messages, verifying ownership via user_id join on guided_sessions
    const { data: session, error: sessionError } = await supabase
      .from('guided_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { data: messages, error } = await supabase
      .from('guided_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error || !messages?.length) {
      return NextResponse.json({ error: 'No messages found' }, { status: 404 })
    }

    // Build conversation text for extraction
    let conversationText = messages
      .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n\n')

    // F15: Handle large conversations — truncate to most recent messages if over limit
    if (conversationText.length > MAX_CONVERSATION_CHARS) {
      logger.warn('Harvest conversation truncated due to length', {
        userId: user.id,
        action: 'harvest',
        sessionId,
        originalLength: conversationText.length,
        truncatedLength: MAX_CONVERSATION_CHARS,
      })

      // Rebuild from the end, keeping the most recent messages
      const truncatedMessages: typeof messages = []
      let charCount = 0
      for (let i = messages.length - 1; i >= 0; i--) {
        const line = `[${messages[i].role.toUpperCase()}]: ${messages[i].content}`
        if (charCount + line.length + 2 > MAX_CONVERSATION_CHARS) break
        truncatedMessages.unshift(messages[i])
        charCount += line.length + 2
      }

      conversationText = truncatedMessages
        .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n\n')
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are reviewing a creative writing session conversation. Extract ALL actionable items that were discussed but NOT yet saved to the project database. Group them by type.

For each item, provide:
- type: one of "story_beat", "scene_description", "panel_draft", "character_detail", "location_detail", "project_note", "dialogue_line"
- content: the actual content to save
- destination: where it should go (e.g., "Page 8 story beat", "Scene 3 description", "New character: Marcus")
- confidence: how certain you are this was decided vs. just explored (high/medium/low)

Only extract items that feel DECIDED in the conversation, not exploratory musings. If the writer workshopped 5 versions of a line and settled on one, extract only the final version.

Return JSON array: [{ type, content, destination, confidence }]
Return an empty array [] if nothing actionable was left uncaptured.`,
      messages: [{ role: 'user', content: conversationText }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON array from response
    let items: HarvestItem[] = []
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        items = JSON.parse(match[0]) as HarvestItem[]
      }
    } catch {
      items = []
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Harvest completed', {
      userId: user.id,
      action: 'harvest',
      sessionId,
      duration,
      itemsFound: items.length,
    })

    return NextResponse.json({ items })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Harvest error', {
      action: 'harvest',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to harvest session' },
      { status: 500 }
    )
  }
}
