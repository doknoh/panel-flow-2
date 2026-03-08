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

interface SynthesizeRequestBody {
  conversationId: string
}

/**
 * Synthesize a conversation summary after it ends.
 * Reads the full message history and generates a 3-5 sentence abstract.
 */
export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.aiSynthesize(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    const body = (await request.json()) as SynthesizeRequestBody
    const { conversationId } = body

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
    }

    // Fetch conversation
    const { data: conversation, error: convError } = await supabase
      .from('ai_conversations')
      .select('id, user_id, messages, synthesized_summary')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const conv = conversation as { id: string; user_id: string; messages: any[]; synthesized_summary: string | null }

    if (conv.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Skip if already synthesized
    if (conv.synthesized_summary) {
      return NextResponse.json({ summary: conv.synthesized_summary })
    }

    const messages = conv.messages || []
    if (messages.length < 2) {
      return NextResponse.json({ summary: null, message: 'Not enough messages to synthesize' })
    }

    // Build transcript for Claude
    const transcript = messages
      .map((m: any) => `${m.role === 'user' ? 'WRITER' : 'EDITOR'}: ${m.content}`)
      .join('\n\n')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are synthesizing a conversation between a comic book writer and their AI editor. Generate a concise 3-5 sentence summary that captures:
1. What was discussed (topics, characters, story elements)
2. Any decisions made or insights reached
3. Open questions or areas that need further exploration

Write in third person, past tense. Be specific about the project details discussed, not generic.`,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${transcript}`,
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const summary = textBlock?.type === 'text' ? textBlock.text : null

    if (summary) {
      // Save synthesis
      await supabase
        .from('ai_conversations')
        .update({ synthesized_summary: summary })
        .eq('id', conversationId)

      // Increment writer profile conversation counter
      const { data: profileData } = await supabase
        .from('writer_profiles')
        .select('conversations_since_synthesis')
        .eq('user_id', user.id)
        .single()

      if (profileData) {
        const count = (profileData as { conversations_since_synthesis: number }).conversations_since_synthesis
        await supabase
          .from('writer_profiles')
          .update({ conversations_since_synthesis: count + 1 })
          .eq('user_id', user.id)
      } else {
        // Create profile if it doesn't exist
        await supabase
          .from('writer_profiles')
          .insert({
            user_id: user.id,
            conversations_since_synthesis: 1,
          })
      }
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Conversation synthesized', {
      userId: user.id,
      action: 'synthesize',
      conversationId,
      duration,
    })

    return NextResponse.json({ summary })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Synthesize error', {
      action: 'synthesize',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to synthesize conversation' },
      { status: 500 }
    )
  }
}
