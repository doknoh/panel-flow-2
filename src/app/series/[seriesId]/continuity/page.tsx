import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ContinuityChecker from './ContinuityChecker'
import Header from '@/components/ui/Header'

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
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Continuity Check"
        maxWidth="max-w-6xl"
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <ContinuityChecker series={series} />
      </main>
    </div>
  )
}
