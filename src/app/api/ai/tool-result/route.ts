import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamMessage, buildContextString, buildSystemPrompt } from '@/lib/ai/client'
import { assembleContext, assembleWriterContext } from '@/lib/ai/context-assembler'
import { createStreamFromGenerator, getSSEHeaders } from '@/lib/ai/streaming'
import { rateLimiters } from '@/lib/rate-limit'
import { estimateTokens, truncateToTokenBudget } from '@/lib/ai/token-budget'
import { EDITOR_TOOLS, executeToolCall } from '@/lib/ai/tools'
import { updateToolStats } from '@/lib/ai/conversations'
import { logger } from '@/lib/logger'
import type Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ToolResultRequestBody {
  // Full conversation history (simple text messages up to the assistant's tool_use response)
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  // The assistant's text content that preceded the tool call
  assistantText: string
  // Tool call details
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  confirmed: boolean
  // Context params
  seriesId: string
  issueId?: string
  pageId?: string
  mode?: 'ask' | 'guide'
}

export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Rate limit
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

    const body = (await request.json()) as ToolResultRequestBody
    const {
      messages,
      assistantText,
      toolUseId,
      toolName,
      toolInput,
      confirmed,
      seriesId,
      issueId,
      pageId,
      mode = 'ask',
    } = body

    if (!seriesId || !toolUseId || !toolName) {
      return new Response('Missing required fields', { status: 400 })
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

    // Execute tool if confirmed
    let toolResultContent: string
    if (confirmed) {
      const result = await executeToolCall(toolName, toolInput, seriesId, user.id)
      toolResultContent = result.success
        ? result.result
        : `Error: ${result.result}`

      // Track tool outcome in conversation
      logger.info('Tool executed', {
        userId: user.id,
        action: 'tool_execute',
        toolName,
        confirmed: true,
      })
    } else {
      toolResultContent = 'The writer chose not to do this right now.'
      logger.info('Tool dismissed', {
        userId: user.id,
        action: 'tool_dismiss',
        toolName,
      })
    }

    // Track tool acceptance stats (fire and forget)
    updateToolStats(user.id, toolName, confirmed).catch(() => {})

    // Assemble context for continuation
    const [context, writerContext] = await Promise.all([
      assembleContext(seriesId, issueId, pageId),
      assembleWriterContext(user.id, seriesId),
    ])
    const rawContextString = buildContextString(context)
    const systemPrompt = buildSystemPrompt(mode, writerContext)
    const contextString = truncateToTokenBudget(rawContextString, estimateTokens(systemPrompt))

    // Build Anthropic-format messages with tool_use and tool_result blocks
    // First: all prior conversation messages (simple text)
    const anthropicMessages: Anthropic.MessageParam[] = (messages || []).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    // Then: the assistant message that contains both text AND the tool_use block
    const assistantContentBlocks: (Anthropic.TextBlock | Anthropic.ToolUseBlock)[] = []
    if (assistantText) {
      assistantContentBlocks.push({
        type: 'text',
        text: assistantText,
      } as Anthropic.TextBlock)
    }
    assistantContentBlocks.push({
      type: 'tool_use',
      id: toolUseId,
      name: toolName,
      input: toolInput,
    } as Anthropic.ToolUseBlock)

    anthropicMessages.push({
      role: 'assistant',
      content: assistantContentBlocks,
    })

    // Then: the user message with the tool_result
    anthropicMessages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: toolResultContent,
        },
      ],
    })

    const duration = Math.round(performance.now() - start)
    logger.info('Tool result API streaming started', {
      userId: user.id,
      action: 'tool_result',
      toolName,
      confirmed,
      duration,
    })

    // Stream the continuation
    const generator = streamMessage(anthropicMessages, systemPrompt, contextString, EDITOR_TOOLS)
    const stream = createStreamFromGenerator(generator)

    return new Response(stream, {
      headers: getSSEHeaders(),
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Tool result API error', {
      action: 'tool_result',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    )
  }
}
