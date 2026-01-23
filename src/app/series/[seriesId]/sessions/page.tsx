import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import SessionList from './SessionList'

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
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white">
            ← {series.title}
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-xl font-bold">Session History</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <SessionList sessions={sessions || []} seriesId={seriesId} />
      </main>
    </div>
  )
}
