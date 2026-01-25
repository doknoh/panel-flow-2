import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AnalyticsClient from './AnalyticsClient'

export default async function AnalyticsPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch series with all content for analytics
  const { data: series, error } = await supabase
    .from('series')
    .select(`
      *,
      characters (*),
      issues (
        *,
        acts (
          *,
          scenes (
            *,
            pages (
              *,
              panels (
                *,
                dialogue_blocks (*),
                captions (*)
              )
            )
          )
        )
      )
    `)
    .eq('id', seriesId)
    .single()

  if (error || !series) {
    notFound()
  }

  // Fetch sessions for this series
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('series_id', seriesId)
    .order('started_at', { ascending: false })

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white">
            ← {series.title}
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-xl font-bold">Analytics</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <AnalyticsClient series={series} sessions={sessions || []} />
      </main>
    </div>
  )
}
