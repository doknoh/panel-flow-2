import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SeriesWeaveClient from './SeriesWeaveClient'
import Header from '@/components/ui/Header'

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
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Series Weave"
        maxWidth="max-w-6xl"
      />

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
