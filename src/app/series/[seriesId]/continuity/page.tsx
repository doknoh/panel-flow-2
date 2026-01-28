import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ContinuityChecker from './ContinuityChecker'
import ThemeToggle from '@/components/ui/ThemeToggle'

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
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href={`/series/${seriesId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0">
              ←
            </Link>
            <span className="text-[var(--text-secondary)] truncate hidden sm:inline">{series.title}</span>
            <span className="text-[var(--text-muted)] hidden sm:inline">/</span>
            <h1 className="text-lg sm:text-xl font-bold">Continuity Check</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <ContinuityChecker series={series} />
      </main>
    </div>
  )
}
