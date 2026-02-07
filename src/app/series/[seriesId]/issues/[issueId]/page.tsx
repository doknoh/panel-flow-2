import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import IssueEditor from './IssueEditor'

export const dynamic = 'force-dynamic'

export default async function IssuePage({
  params
}: {
  params: Promise<{ seriesId: string; issueId: string }>
}) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch issue and series data first (lighter query)
  const { data: issueData, error: issueError } = await supabase
    .from('issues')
    .select(`
      *,
      series:series_id (
        id,
        title,
        central_theme,
        logline,
        characters (*),
        locations (*),
        plotlines (*)
      )
    `)
    .eq('id', issueId)
    .single()

  if (issueError) {
    console.error('Issue fetch error:', issueError)
    notFound()
  }

  if (!issueData) {
    console.error('Issue not found for id:', issueId)
    notFound()
  }

  // Fetch acts/scenes/pages structure separately (avoids timeout on large issues)
  const { data: actsData, error: actsError } = await supabase
    .from('acts')
    .select(`
      *,
      scenes (
        *,
        pages (
          *,
          panels (
            *,
            dialogue_blocks (*, character:character_id (id, name)),
            captions (*),
            sound_effects (*)
          )
        )
      )
    `)
    .eq('issue_id', issueId)
    .order('sort_order', { ascending: true })

  if (actsError) {
    console.error('Acts fetch error:', actsError)
    // Don't 404, just provide empty acts - the editor can handle this
  }

  // Combine the data
  const issue = {
    ...issueData,
    acts: actsData || []
  }

  return <IssueEditor issue={issue} seriesId={seriesId} />
}
