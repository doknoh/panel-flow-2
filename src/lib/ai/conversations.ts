/**
 * Conversation management utilities for AI chat.
 * Handles saving, loading, and managing AI conversations and tool stats.
 */

import { createClient } from '@/lib/supabase/server'

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  toolProposals?: Array<{
    toolUseId: string
    name: string
    input: Record<string, unknown>
    status: string
  }>
}

interface ToolOutcome {
  toolName: string
  accepted: boolean
  entityType?: string
  entityId?: string
  timestamp: string
}

/**
 * Save or update an AI conversation.
 */
export async function saveConversation(params: {
  conversationId?: string
  userId: string
  seriesId: string
  issueId?: string
  pageId?: string
  messages: ConversationMessage[]
  toolOutcomes?: ToolOutcome[]
  mode?: 'ask' | 'guide'
}): Promise<string | null> {
  const supabase = await createClient()
  const { conversationId, userId, seriesId, issueId, pageId, messages, toolOutcomes, mode = 'ask' } = params

  if (conversationId) {
    // Update existing
    const { error } = await supabase
      .from('ai_conversations')
      .update({
        messages: messages as any,
        tool_outcomes: (toolOutcomes || []) as any,
      })
      .eq('id', conversationId)
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to update conversation:', error)
      return null
    }
    return conversationId
  } else {
    // Create new
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: userId,
        series_id: seriesId,
        issue_id: issueId || null,
        page_id: pageId || null,
        messages: messages as any,
        tool_outcomes: (toolOutcomes || []) as any,
        mode,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create conversation:', error)
      return null
    }
    return data?.id || null
  }
}

/**
 * Load recent conversations for a series (for sidebar display).
 */
export async function loadRecentConversations(
  seriesId: string,
  limit: number = 10
): Promise<Array<{
  id: string
  synthesized_summary: string | null
  mode: string
  created_at: string
  updated_at: string
}>> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('ai_conversations')
    .select('id, synthesized_summary, mode, created_at, updated_at')
    .eq('series_id', seriesId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  return (data || []) as Array<{
    id: string
    synthesized_summary: string | null
    mode: string
    created_at: string
    updated_at: string
  }>
}

/**
 * Load conversation summaries for context assembly.
 */
export async function loadConversationSummaries(
  seriesId: string,
  limit: number = 5
): Promise<string[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('ai_conversations')
    .select('synthesized_summary')
    .eq('series_id', seriesId)
    .not('synthesized_summary', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit)

  return (data || [])
    .map((d: any) => d.synthesized_summary as string)
    .filter(Boolean)
}

/**
 * Update tool acceptance stats for the writer profile.
 */
export async function updateToolStats(
  userId: string,
  toolName: string,
  accepted: boolean
): Promise<void> {
  const supabase = await createClient()

  // Fetch current profile
  const { data: profile } = await supabase
    .from('writer_profiles')
    .select('tool_stats')
    .eq('user_id', userId)
    .single()

  if (!profile) {
    // Create profile with initial stats
    const toolStats = {
      [toolName]: { proposed: 1, accepted: accepted ? 1 : 0 },
    }

    await supabase
      .from('writer_profiles')
      .insert({
        user_id: userId,
        tool_stats: toolStats as any,
      })
    return
  }

  // Update existing stats
  const stats = (profile as { tool_stats: Record<string, { proposed: number; accepted: number }> }).tool_stats || {}
  const current = stats[toolName] || { proposed: 0, accepted: 0 }

  stats[toolName] = {
    proposed: current.proposed + 1,
    accepted: current.accepted + (accepted ? 1 : 0),
  }

  await supabase
    .from('writer_profiles')
    .update({ tool_stats: stats as any })
    .eq('user_id', userId)
}

/**
 * Check if profile synthesis is due (every 5 conversations).
 */
export async function shouldSynthesizeProfile(userId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('writer_profiles')
    .select('conversations_since_synthesis')
    .eq('user_id', userId)
    .single()

  if (!data) return false

  const profile = data as { conversations_since_synthesis: number }
  return profile.conversations_since_synthesis >= 5
}
