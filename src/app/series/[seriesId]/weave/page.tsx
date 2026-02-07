import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SeriesWeaveClient from './SeriesWeaveClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ seriesId: string }>
}

export default async function SeriesWeavePage({ params }: PageProps) {
  const { seriesId } = await params
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch series with all issues and their plotlines
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select(`
      id,
      title,
      logline,
      central_theme,
      plotlines (
        id,
        name,
        color,
        description,
        sort_order
      ),
      issues (
        id,
        number,
        title,
        summary,
        series_act,
        status,
        acts (
          id,
          sort_order,
          scenes (
            id,
            sort_order,
            plotline_id,
            pages (
              id,
              page_number,
              story_beat,
              plotline_id
            )
          )
        )
      )
    `)
    .eq('id', seriesId)
    .single()

  if (seriesError || !series) {
    redirect('/dashboard')
  }

  // Fetch plotline_issue_assignments junction table to get plotline assignments per issue
  const { data: plotlineIssues } = await supabase
    .from('plotline_issue_assignments')
    .select('*')
    .in('plotline_id', (series.plotlines || []).map((p: any) => p.id))

  // Sort issues by number
  const sortedIssues = (series.issues || []).sort((a: any, b: any) => a.number - b.number)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/series/${seriesId}`}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back
            </Link>
            <div>
              <h1 className="text-xl font-bold">{series.title}</h1>
              <p className="text-sm text-[var(--text-secondary)]">Series Weave — Plotlines Across All Issues</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <SeriesWeaveClient
        series={series}
        issues={sortedIssues}
        plotlines={series.plotlines || []}
        plotlineIssues={plotlineIssues || []}
      />
    </div>
  )
}
