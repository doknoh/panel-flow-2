import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import OutlinePageClient from './OutlinePageClient'
import Header from '@/components/ui/Header'

// Force dynamic to bypass stale cache
export const dynamic = 'force-dynamic'

export default async function OutlinePage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch series with all issues and their content
  const { data: series, error } = await supabase
    .from('series')
    .select(`
      *,
      plotlines (
        *,
        plotline_issue_assignments (*)
      ),
      issues (
        *,
        acts (
          *,
          scenes (
            *,
            plotline_id,
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

  if (error) {
    console.error('Outline page error:', error)
    notFound()
  }

  if (!series) {
    notFound()
  }

  // Fetch plotlines separately and attach to scenes
  const plotlineMap = new Map(series.plotlines?.map((p: { id: string }) => [p.id, p]) || [])
  if (series.issues) {
    for (const issue of series.issues) {
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          if (scene.plotline_id && plotlineMap.has(scene.plotline_id)) {
            scene.plotline = plotlineMap.get(scene.plotline_id)
          }
        }
      }
    }
  }

  // Sort issues by number
  if (series.issues) {
    series.issues.sort((a: any, b: any) => a.number - b.number)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Series Outline"
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <OutlinePageClient series={series} />
      </main>
    </div>
  )
}
