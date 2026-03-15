import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import WeaveView from './WeaveView'

export default async function WeavePage({
  params
}: {
  params: Promise<{ seriesId: string; issueId: string }>
}) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch issue with all nested data including panel content for summaries
  const { data: issue, error } = await supabase
    .from('issues')
    .select(`
      *,
      series:series_id (
        id,
        title
      ),
      acts (
        *,
        scenes (
          *,
          pages (
            id,
            page_number,
            sort_order,
            story_beat,
            intention,
            visual_motif,
            time_period,
            plotline_id,
            plotline:plotline_id (
              id,
              name,
              color
            ),
            panels (
              id,
              panel_number,
              sort_order,
              visual_description,
              dialogue_blocks (
                id,
                speaker_name,
                text,
                sort_order
              ),
              captions (
                id,
                caption_type,
                text,
                sort_order
              )
            )
          )
        )
      )
    `)
    .eq('id', issueId)
    .single()

  if (error) {
    console.error('Issue fetch error:', error)
    notFound()
  }

  // Fetch plotlines separately (since it's a reverse relationship)
  const { data: plotlines } = await supabase
    .from('plotlines')
    .select('*')
    .eq('issue_id', issueId)
    .order('sort_order')

  // Attach plotlines to issue
  const issueWithPlotlines = {
    ...issue,
    plotlines: plotlines || []
  }

  if (!issue) {
    notFound()
  }

  return (
    <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <WeaveView issue={issueWithPlotlines} seriesId={seriesId} />
    </div>
  )
}
