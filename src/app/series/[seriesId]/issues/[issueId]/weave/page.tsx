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
  const { data: issue, error } = await supabase
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
          plotline:plotline_id (*),
          pages (
            id,
            page_number,
            sort_order,
            story_beat,
            intention,
            visual_motif,
            time_period,
            plotline_id,
            plotline:plotline_id (*)
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
