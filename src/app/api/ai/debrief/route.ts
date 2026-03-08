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

interface DebriefRequestBody {
  seriesId: string
  issueId: string
  stats: {
    duration_minutes: number
    words_written: number
    panels_created: number
    pages_touched: number
  }
}

/**
 * Generate an AI session debrief summarizing what was accomplished,
 * what's strong, and what to focus on next session.
 */
export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.aiDebrief(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    const body = (await request.json()) as DebriefRequestBody
    const { seriesId, issueId, stats } = body

    if (!seriesId || !issueId) {
      return NextResponse.json({ error: 'Missing seriesId or issueId' }, { status: 400 })
    }

    if (!stats) {
      return NextResponse.json({ error: 'Missing stats' }, { status: 400 })
    }

    // Fetch issue details
    const { data: issue, error: issueError } = await supabase
      .from('issues')
      .select('id, number, title, series_id')
      .eq('id', issueId)
      .single()

    if (issueError || !issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    if (issue.series_id !== seriesId) {
      return NextResponse.json({ error: 'Issue does not belong to series' }, { status: 400 })
    }

    // Fetch acts with scenes and page counts for context
    const { data: acts, error: actsError } = await supabase
      .from('acts')
      .select(`
        id,
        number,
        title,
        sort_order,
        scenes (
          id,
          title,
          sort_order,
          pages (
            id
          )
        )
      `)
      .eq('issue_id', issueId)
      .order('sort_order')

    if (actsError) {
      logger.error('Failed to fetch acts for debrief', {
        action: 'debrief',
        issueId,
        error: actsError.message,
      })
    }

    // Build issue context summary
    const issueContext = buildIssueContext(issue, acts || [])

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a session debrief assistant for a comic book script writing app called Panel Flow. The writer just finished a writing session. Generate a 2-3 paragraph session debrief that:

1. Summarizes what was accomplished based on the session stats (duration, words written, panels created, pages touched)
2. Notes what's strong in the current state of the issue based on its structure
3. Suggests what to focus on in the next session

Be specific and encouraging but honest. Use a warm, professional tone. Reference the issue title and structure when relevant. Keep it concise — this is a quick recap, not a full analysis.`,
      messages: [
        {
          role: 'user',
          content: `Generate a session debrief for this writing session:

SESSION STATS:
- Duration: ${stats.duration_minutes} minutes
- Words written: ${stats.words_written}
- Panels created: ${stats.panels_created}
- Pages touched: ${stats.pages_touched}

ISSUE CONTEXT:
${issueContext}`,
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const debrief = textBlock?.type === 'text' ? textBlock.text : null

    const duration = Math.round(performance.now() - start)
    logger.info('Session debrief generated', {
      userId: user.id,
      action: 'debrief',
      issueId,
      duration,
    })

    return NextResponse.json({ debrief })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Debrief error', {
      action: 'debrief',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to generate session debrief' },
      { status: 500 }
    )
  }
}

interface ActWithScenes {
  id: string
  number: number | null
  title: string | null
  sort_order: number
  scenes: {
    id: string
    title: string | null
    sort_order: number
    pages: { id: string }[]
  }[] | null
}

function buildIssueContext(
  issue: { id: string; number: number; title: string },
  acts: ActWithScenes[]
): string {
  const sortedActs = [...acts].sort((a, b) => a.sort_order - b.sort_order)

  let context = `Issue #${issue.number}: "${issue.title}"\n`

  if (sortedActs.length === 0) {
    context += 'No acts or scenes defined yet.\n'
    return context
  }

  for (const act of sortedActs) {
    const actLabel = act.title || act.number ? `Act ${act.number || '?'}` : 'Act'
    const actTitle = act.title ? ` — ${act.title}` : ''
    context += `\n${actLabel}${actTitle}\n`

    const scenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)
    if (scenes.length === 0) {
      context += '  (no scenes)\n'
    } else {
      for (const scene of scenes) {
        const pageCount = scene.pages?.length || 0
        const sceneTitle = scene.title || 'Untitled scene'
        context += `  - ${sceneTitle} (${pageCount} page${pageCount !== 1 ? 's' : ''})\n`
      }
    }
  }

  const totalPages = sortedActs.reduce((sum, act) => {
    return sum + (act.scenes || []).reduce((s, scene) => s + (scene.pages?.length || 0), 0)
  }, 0)
  const totalScenes = sortedActs.reduce((sum, act) => sum + (act.scenes?.length || 0), 0)

  context += `\nTotal: ${sortedActs.length} acts, ${totalScenes} scenes, ${totalPages} pages\n`

  return context
}
