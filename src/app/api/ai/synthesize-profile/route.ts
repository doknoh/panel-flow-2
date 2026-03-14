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

/**
 * Re-synthesize the writer profile based on recent conversations.
 * Called every ~5 conversations to keep the profile evolving.
 */
export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.aiSynthesizeProfile(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    // Fetch writer profile
    const { data: profile } = await supabase
      .from('writer_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No writer profile found' }, { status: 404 })
    }

    const writerProfile = profile as {
      id: string
      profile_text: string | null
      tool_stats: Record<string, { proposed: number; accepted: number }>
      conversations_since_synthesis: number
      ai_draft_edits?: any[]
    }

    // Fetch recent conversation summaries
    const { data: recentConversations } = await supabase
      .from('ai_conversations')
      .select('synthesized_summary, tool_outcomes, mode, created_at')
      .eq('user_id', user.id)
      .not('synthesized_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversations = (recentConversations || []) as Array<{
      synthesized_summary: string
      tool_outcomes: any[]
      mode: string
      created_at: string
    }>

    if (conversations.length === 0) {
      return NextResponse.json({
        profile: writerProfile.profile_text,
        message: 'Not enough conversations to synthesize profile',
      })
    }

    // Fetch confirmed writer insights from Guided Mode extractions
    const { data: writerInsights } = await supabase
      .from('writer_insights')
      .select('insight_type, category, description, confidence')
      .eq('user_id', user.id)
      .gte('confidence', 0.6)
      .order('confidence', { ascending: false })
      .limit(20)

    const insights = (writerInsights || []) as Array<{
      insight_type: string
      category: string | null
      description: string
      confidence: number
    }>

    // Build context for profile synthesis
    const summaries = conversations
      .map((c, i) => `Session ${i + 1} (${c.mode} mode): ${c.synthesized_summary}`)
      .join('\n\n')

    const insightsText = insights.length > 0
      ? insights
          .map(i => `- [${i.insight_type}${i.category ? `/${i.category}` : ''}] ${i.description} (confidence: ${i.confidence})`)
          .join('\n')
      : ''

    const toolStatsText = Object.entries(writerProfile.tool_stats || {})
      .map(([tool, stats]) => {
        const s = stats as { proposed: number; accepted: number }
        const rate = s.proposed > 0 ? Math.round((s.accepted / s.proposed) * 100) : 0
        return `- ${tool}: ${s.accepted}/${s.proposed} accepted (${rate}%)`
      })
      .join('\n')

    // Build draft edit context for synthesis
    const draftEdits = writerProfile.ai_draft_edits || []
    let draftEditContext = ''
    if (draftEdits.length > 0) {
      const recentEdits = draftEdits.slice(-50) // last 50 for token budget
      draftEditContext = `\n\n## AI Draft Edit Patterns (${draftEdits.length} total edits, showing recent ${recentEdits.length})
The writer has edited AI-drafted panel descriptions. Each entry shows what the AI wrote vs. what the writer changed it to. Analyze these diffs to identify concrete style preferences:

${recentEdits.map((e: any, i: number) =>
  `Edit ${i + 1}:\n  AI wrote: "${e.original}"\n  Writer changed to: "${e.edited}"`
).join('\n\n')}

Look for patterns like:
- Does the writer consistently add/remove camera directions?
- Does the writer shorten or lengthen descriptions?
- Does the writer prefer specific vocabulary or sentence structures?
- Does the writer add character actions that the AI missed?
- What does the writer delete vs. keep?`
    }

    const previousProfile = writerProfile.profile_text || 'No previous profile.'

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are building an evolving portrait of a comic book writer based on their AI editing sessions. Synthesize what you know into a concise writer profile (3-5 paragraphs) that captures:

1. Their writing style and preferences
2. How they use the AI (what tools they accept/reject)
3. Their creative patterns (what they focus on, how they work)
4. Areas where they're strong and areas they might benefit from more attention

Write in second person ("You tend to...") to create a personal profile.
Keep it specific and actionable — this will be fed back to the AI to personalize future sessions.

If draft edit patterns are provided, extract CONCRETE style preferences from them. For example:
- "Writer consistently replaces generic camera directions ('We see') with specific shot types ('Close on', 'Wide shot of')"
- "Writer shortens AI descriptions by ~40%, preferring punchy sentence fragments over full sentences"
- "Writer always adds sensory details (sounds, textures, lighting) that the AI omits"
These concrete observations should be woven into the portrait and will be used to improve future AI drafts.`,
      messages: [
        {
          role: 'user',
          content: `Previous profile:\n${previousProfile}\n\nRecent session summaries:\n${summaries}\n\nTool acceptance rates:\n${toolStatsText || 'No tool data yet.'}\n\nConfirmed writer insights (extracted from Guided Mode sessions):\n${insightsText || 'No insights extracted yet.'}${draftEditContext}\n\nUpdate the writer profile based on all of this information. Pay special attention to the confirmed writer insights — these are patterns the AI has identified and the writer has validated through conversation.`,
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const newProfile = textBlock?.type === 'text' ? textBlock.text : null

    if (newProfile) {
      await supabase
        .from('writer_profiles')
        .update({
          profile_text: newProfile,
          conversations_since_synthesis: 0,
          last_synthesized_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Writer profile synthesized', {
      userId: user.id,
      action: 'synthesize_profile',
      duration,
      conversationCount: conversations.length,
    })

    return NextResponse.json({ profile: newProfile })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Profile synthesis error', {
      action: 'synthesize_profile',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to synthesize profile' },
      { status: 500 }
    )
  }
}
