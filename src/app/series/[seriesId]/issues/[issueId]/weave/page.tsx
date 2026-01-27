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

  // Fetch issue with all nested data including plotlines and full page details
  // First try with new fields, fall back to basic query if migration hasn't run
  let issue: any = null
  let error: any = null

  // Try the full query with new fields
  const fullQuery = await supabase
    .from('issues')
    .select(`
      *,
      series:series_id (
        id,
        title
      ),
      plotlines (*),
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
            plotline_id
          )
        )
      )
    `)
    .eq('id', issueId)
    .single()

  if (fullQuery.error) {
    console.error('Full query failed, trying basic query:', fullQuery.error)
    // Fall back to basic query without new fields
    const basicQuery = await supabase
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
              sort_order
            )
          )
        )
      `)
      .eq('id', issueId)
      .single()

    issue = basicQuery.data
    error = basicQuery.error

    // Add empty plotlines array if not present
    if (issue && !issue.plotlines) {
      issue.plotlines = []
    }
  } else {
    issue = fullQuery.data
    // Ensure plotlines is an array
    if (issue && !issue.plotlines) {
      issue.plotlines = []
    }
  }

  if (error) {
    console.error('Issue fetch error:', error)
    notFound()
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
        <WeaveView issue={issue} seriesId={seriesId} />
      </main>
    </div>
  )
}
