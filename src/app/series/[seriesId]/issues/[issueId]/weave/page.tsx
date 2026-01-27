import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
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
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/series/${seriesId}/issues/${issueId}`}
              className="text-zinc-400 hover:text-white"
            >
              ← Issue #{issue.number}
            </Link>
            <span className="text-zinc-600">/</span>
            <h1 className="text-xl font-bold">The Weave</h1>
          </div>
          <div className="text-sm text-zinc-400">
            Arrange story beats across pages and spreads
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <WeaveView issue={issueWithPlotlines} seriesId={seriesId} />
      </main>
    </div>
  )
}
