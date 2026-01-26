import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ContinuityChecker from './ContinuityChecker'

export default async function ContinuityPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch series with all content needed for continuity checking
  const { data: series, error } = await supabase
    .from('series')
    .select(`
      *,
      characters (id, name),
      locations (id, name),
      issues (
        id,
        number,
        title,
        acts (
          number,
          scenes (
            title,
            pages (
              page_number,
              panels (
                visual_description,
                dialogue_blocks (
                  character_id,
                  text
                ),
                captions (
                  caption_type,
                  text
                )
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-4">
          <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white shrink-0">
            ←
          </Link>
          <span className="text-zinc-400 truncate hidden sm:inline">{series.title}</span>
          <span className="text-zinc-600 hidden sm:inline">/</span>
          <h1 className="text-lg sm:text-xl font-bold">Continuity Check</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <ContinuityChecker series={series} />
      </main>
    </div>
  )
}
