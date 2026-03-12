import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamMessage, buildContextString, buildSystemPrompt } from '@/lib/ai/client'
import { assembleContext, assembleWriterContext } from '@/lib/ai/context-assembler'
import { createStreamFromGenerator, getSSEHeaders } from '@/lib/ai/streaming'
import { rateLimiters } from '@/lib/rate-limit'
import { estimateTokens, truncateToTokenBudget } from '@/lib/ai/token-budget'
import { EDITOR_TOOLS } from '@/lib/ai/tools'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

// Build initial prompt based on session type and context
function buildInitialPrompt(data: {
  sessionType: string
  focusArea?: string
  analysis?: any
  seriesTitle: string
  issueNumber?: number
  issueTitle?: string | null
}): string {
  const { sessionType, focusArea, analysis, seriesTitle, issueNumber, issueTitle } = data

  // Special case: series_concept focus for new series
  if (focusArea === 'series_concept') {
    return `You're starting a new guided session with a writer who just created a new series called "${seriesTitle}".

This is a SERIES CONCEPT session. The writer is at the very beginning - they have a title but haven't developed the logline or central theme yet. Your job is to help them discover and articulate:

1. What this story is REALLY about (the core concept/logline)
2. What theme or idea they want to explore (the central theme)

Start by welcoming them and expressing genuine curiosity about their idea. Then ask your first question - something that gets at the heart of what excites them about this story.

Remember: You're helping them DISCOVER their story through conversation. The logline and theme should emerge naturally from what they tell you. Don't ask for a logline directly - help them find it.

Introduce yourself briefly (you're their editor), and ask your first Socratic question. ONE question at a time, and make it feel like a conversation, not an interview.`
  }

  let prompt = `You're starting a new guided session with a writer working on "${seriesTitle}".`

  if (issueNumber) {
    prompt += ` Currently focused on Issue #${issueNumber}${issueTitle ? ` ("${issueTitle}")` : ''}.`
  }

  if (analysis) {
    prompt += ` The project is ${analysis.overallScore}% complete.`
    if (analysis.suggestedFocus) {
      prompt += ` The biggest opportunity is in ${analysis.suggestedFocus}.`
    }
  }

  switch (sessionType) {
    case 'character_deep_dive':
      prompt += `\n\nThis is a CHARACTER DEEP DIVE session. Start by asking about a specific character - either one that needs development or one they want to explore. Focus on motivation, arc, voice, and relationships.`
      break

    case 'outline':
      prompt += `\n\nThis is a STORY STRUCTURE session. Start by understanding where they are in the outlining process. Focus on acts, turning points, emotional beats, and pacing.`
      break

    case 'world_building':
      prompt += `\n\nThis is a WORLD BUILDING session. Start by exploring the physical and emotional landscape of the story. Focus on locations, atmosphere, rules of the world, and how environment shapes character.`
      break

    case 'general':
    default:
      prompt += `\n\nThis is an OPEN EXPLORATION session. Based on the analysis, identify the most valuable area to explore and start there. Be direct about what you see as the biggest opportunity.`
  }

  prompt += `\n\nIntroduce yourself briefly (you're their editor), acknowledge where they are in the project, and ask your first Socratic question. Remember: ONE question at a time, and make it specific to their project.`

  return prompt
}

interface GuideRequestBody {
  sessionId: string
  seriesId: string
  issueId?: string
  pageId?: string
  isInitial?: boolean
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  userMessage?: string
  sessionType?: string
  focusArea?: string
  analysis?: any
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

    const body = (await request.json()) as GuideRequestBody
    const {
      seriesId,
      issueId,
      pageId,
      isInitial,
      messages,
      userMessage,
      sessionType = 'general',
      focusArea,
      analysis,
    } = body

    if (!seriesId) {
      return new Response('Missing required fields', { status: 400 })
    }

    // Verify user has access to this series
    const { data: series } = await supabase
      .from('series')
      .select('user_id, title')
      .eq('id', seriesId)
      .single()

    if (!series) {
      return new Response('Series not found', { status: 404 })
    }

    const seriesData = series as { user_id: string; title: string }
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

    // Get issue info if specified
    let issueNumber: number | undefined
    let issueTitle: string | null | undefined
    if (issueId) {
      const { data: issueData } = await supabase
        .from('issues')
        .select('number, title')
        .eq('id', issueId)
        .single()
      if (issueData) {
        issueNumber = (issueData as { number: number; title: string | null }).number
        issueTitle = (issueData as { number: number; title: string | null }).title
      }
    }

    // Assemble context server-side
    const [context, writerContext] = await Promise.all([
      assembleContext(seriesId, issueId, pageId),
      assembleWriterContext(user.id, seriesId, issueId),
    ])
    const rawContextString = buildContextString(context)
    const systemPrompt = buildSystemPrompt('guide', writerContext)
    const contextString = truncateToTokenBudget(rawContextString, estimateTokens(systemPrompt))

    // Build messages array for Claude
    const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    if (isInitial) {
      claudeMessages.push({
        role: 'user',
        content: buildInitialPrompt({
          sessionType,
          focusArea,
          analysis,
          seriesTitle: seriesData.title,
          issueNumber,
          issueTitle,
        }),
      })
    } else {
      // Include conversation history
      if (messages && messages.length > 0) {
        messages.forEach((m) => {
          claudeMessages.push({
            role: m.role,
            content: m.content,
          })
        })
      }

      // Add the new user message if not already included
      if (userMessage && (!messages || messages[messages.length - 1]?.content !== userMessage)) {
        claudeMessages.push({
          role: 'user',
          content: userMessage,
        })
      }
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Guide API streaming started', {
      userId: user.id,
      action: 'guide',
      duration,
      isInitial,
      sessionType,
    })

    // Stream the response with tool support
    const generator = streamMessage(claudeMessages, systemPrompt, contextString, EDITOR_TOOLS)
    const stream = createStreamFromGenerator(generator)

    return new Response(stream, {
      headers: getSSEHeaders(),
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Guide API error', {
      action: 'guide',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response(
      'Internal server error',
      { status: 500 }
    )
  }
}
