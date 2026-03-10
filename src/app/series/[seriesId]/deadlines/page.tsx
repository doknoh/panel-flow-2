import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import DeadlineDashboard from './DeadlineDashboard'
import Header from '@/components/ui/Header'

export default async function DeadlinesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch series with issues and their page counts
  const { data: series, error } = await supabase
    .from('series')
    .select(`
      id,
      title,
      issues (
        id,
        number,
        title,
        status,
        deadline,
        target_page_count,
        production_status,
        acts (
          id,
          scenes (
            id,
            pages (id)
          )
        )
      )
    `)
    .eq('id', seriesId)
    .single()

  if (error || !series) {
    notFound()
  }

  // Fetch completed sessions for velocity calculation
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('series_id', seriesId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Deadlines"
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <DeadlineDashboard
          seriesId={seriesId}
          issues={series.issues || []}
          sessions={sessions || []}
        />
      </main>
    </div>
  )
}
