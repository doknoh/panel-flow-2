import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import SessionList from './SessionList'
import ThemeToggle from '@/components/ui/ThemeToggle'

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
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/series/${seriesId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              ← {series.title}
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <h1 className="text-xl font-bold">Session History</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <SessionList sessions={sessions || []} seriesId={seriesId} />
      </main>
    </div>
  )
}
