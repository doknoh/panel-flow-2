import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamMessage, buildContextString, buildSystemPrompt } from '@/lib/ai/client'
import { assembleContext, assembleWriterContext } from '@/lib/ai/context-assembler'
import { createStreamFromGenerator, getSSEHeaders } from '@/lib/ai/streaming'
import { rateLimiters } from '@/lib/rate-limit'
import { estimateTokens, truncateToTokenBudget } from '@/lib/ai/token-budget'
import { EDITOR_TOOLS } from '@/lib/ai/tools'
import { logger } from '@/lib/logger'
import type Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

interface RequestBody {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  seriesId: string
  issueId?: string
  pageId?: string
  mode?: 'ask' | 'guide'
  conversationId?: string
}

export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Rate limiting
    const rateLimit = rateLimiters.chat(user.id)
    if (!rateLimit.success) {
      return new Response(
        `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`,
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) },
        }
      )
    }

    const body = (await request.json()) as RequestBody
    const { messages, seriesId, issueId, pageId, mode = 'ask', conversationId } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response('Messages are required', { status: 400 })
    }

    if (!seriesId) {
      return new Response('Series ID is required', { status: 400 })
    }

    // Verify user has access to this series
    const { data: series } = await supabase
      .from('series')
      .select('user_id')
      .eq('id', seriesId)
      .single()

    if (!series) {
      return new Response('Series not found', { status: 404 })
    }

    // Check ownership or collaboration
    const seriesData = series as { user_id: string }
    if (seriesData.user_id !== user.id) {
      const { data: collab } = await supabase
        .from('series_collaborators')
        .select('id')
        .eq('series_id', seriesId)
        .eq('user_id', user.id)
        .single()

      if (!collab) {
        return new Response('Access denied', { status: 403 })
      }
    }

    // Assemble context from the database (server-side)
    const [context, writerContext] = await Promise.all([
      assembleContext(seriesId, issueId, pageId),
      assembleWriterContext(user.id, seriesId, issueId),
    ])

    const rawContextString = buildContextString(context)
    const systemPrompt = buildSystemPrompt(mode, writerContext)
    const contextString = truncateToTokenBudget(rawContextString, estimateTokens(systemPrompt))

    // Convert messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

    // Save/update conversation record
    let activeConversationId = conversationId
    if (conversationId) {
      await supabase
        .from('ai_conversations')
        .update({
          messages: messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('user_id', user.id)
    } else {
      const { data: newConv } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          series_id: seriesId,
          issue_id: issueId || null,
          page_id: pageId || null,
          messages: messages,
          mode,
        })
        .select('id')
        .single()
      activeConversationId = newConv?.id || null
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Chat API streaming started', {
      userId: user.id,
      seriesId,
      action: 'chat',
      duration,
    })

    // Create streaming response with tools
    const generator = streamMessage(anthropicMessages, systemPrompt, contextString, EDITOR_TOOLS)
    const stream = createStreamFromGenerator(generator)

    const sseHeaders = getSSEHeaders() as Record<string, string>
    if (activeConversationId) {
      sseHeaders['X-Conversation-Id'] = activeConversationId
    }

    return new Response(stream, { headers: sseHeaders })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Chat API error', {
      action: 'chat',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    )
  }
}
