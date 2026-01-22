import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import VersionHistoryClient from './VersionHistoryClient'

interface PageProps {
  params: Promise<{ seriesId: string; issueId: string }>
}

export default async function VersionHistoryPage({ params }: PageProps) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get issue details
  const { data: issue } = await supabase
    .from('issues')
    .select('id, title, issue_number, series:series_id(id, title)')
    .eq('id', issueId)
    .single()

  if (!issue) redirect('/dashboard')

  // Get version snapshots (last 10)
  const { data: snapshots } = await supabase
    .from('version_snapshots')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false })
    .limit(10)

  // Handle series which could be null, array, or object
  const seriesRaw = issue.series as unknown
  const seriesData = Array.isArray(seriesRaw) ? seriesRaw[0] : seriesRaw
  const series = (seriesData as { id: string; title: string }) || { id: seriesId, title: 'Unknown Series' }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/series/${seriesId}/issues/${issueId}`}
            className="text-zinc-400 hover:text-white text-sm mb-2 inline-block"
          >
            &larr; Back to Editor
          </Link>
          <h1 className="text-2xl font-bold">Version History</h1>
          <p className="text-zinc-400 mt-1">
            {series.title} - Issue #{issue.issue_number}: {issue.title}
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <VersionHistoryClient
          issueId={issueId}
          seriesId={seriesId}
          initialSnapshots={snapshots || []}
        />
      </main>
    </div>
  )
}
