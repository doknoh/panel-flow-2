import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VersionHistoryClient from './VersionHistoryClient'
import Header from '@/components/ui/Header'

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
    .select('id, title, number, series:series_id(id, title)')
    .eq('id', issueId)
    .single()

  if (!issue) redirect('/dashboard')

  // Get version snapshots (last 10) — only fetch list metadata, not full JSONB snapshot_data
  const { data: snapshots } = await supabase
    .from('version_snapshots')
    .select('id, created_at, description')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false })
    .limit(10)

  // Handle series which could be null, array, or object
  const seriesRaw = issue.series as unknown
  const seriesData = Array.isArray(seriesRaw) ? seriesRaw[0] : seriesRaw
  const series = (seriesData as { id: string; title: string }) || { id: seriesId, title: 'Unknown Series' }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}/issues/${issueId}`}
        backLabel={`Issue #${issue.number}`}
        title="Version History"
        maxWidth="max-w-4xl"
        subtitle={`${series.title} — Issue #${issue.number}: ${issue.title}`}
      />

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
