import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ImportScript from './ImportScript'

export default async function ImportPage({
  params
}: {
  params: Promise<{ seriesId: string; issueId: string }>
}) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch issue and series info
  const { data: issueData, error } = await supabase
    .from('issues')
    .select(`
      id,
      number,
      title,
      series:series_id (
        id,
        title,
        characters (id, name),
        locations (id, name)
      )
    `)
    .eq('id', issueId)
    .single()

  if (error) {
    console.error('Import page query error:', error)
    notFound()
  }

  if (!issueData) {
    console.error('Import page: No issue data found for issueId:', issueId)
    notFound()
  }

  // Fetch acts/scenes structure separately (more reliable for nested relations)
  // Include panels for diff comparison during re-import
  const { data: actsData, error: actsError } = await supabase
    .from('acts')
    .select(`
      id,
      name,
      sort_order,
      scenes (
        id,
        title,
        sort_order,
        pages (
          id,
          page_number,
          panels (
            id,
            panel_number,
            visual_description
          )
        )
      )
    `)
    .eq('issue_id', issueId)
    .order('sort_order')

  // Debug: Log what we got from the acts query
  console.log('Import page - Acts query result:', { actsData, actsError, issueId })

  // Normalize the series data (Supabase returns it as an object, not array)
  const issue = {
    ...issueData,
    series: Array.isArray(issueData.series) ? issueData.series[0] : issueData.series,
    acts: actsData || [],
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link
            href={`/series/${seriesId}/issues/${issueId}`}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← Issue #{issue.number}
          </Link>
          <span className="text-[var(--text-muted)]">/</span>
          <h1 className="text-xl font-bold">Import Script</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <ImportScript issue={issue} seriesId={seriesId} />
      </main>
    </div>
  )
}
