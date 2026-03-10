import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import SessionList from './SessionList'
import Header from '@/components/ui/Header'

export default async function SessionsPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select('id, title')
    .eq('id', seriesId)
    .single()

  if (seriesError || !series) {
    notFound()
  }

  // Fetch sessions with loose ends
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      *,
      issue:issue_id (id, number, title),
      loose_ends (*)
    `)
    .eq('series_id', seriesId)
    .order('started_at', { ascending: false })
    .limit(50)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Session History"
        maxWidth="max-w-6xl"
      />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <SessionList sessions={sessions || []} seriesId={seriesId} />
      </main>
    </div>
  )
}
