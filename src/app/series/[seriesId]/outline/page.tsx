import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import OutlineView from './OutlineView'
import ThemeToggle from '@/components/ui/ThemeToggle'

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
      plotlines (*),
      issues (
        *,
        acts (
          *,
          scenes (
            *,
            plotline:plotline_id (*),
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

  // Sort issues by number
  if (series.issues) {
    series.issues.sort((a: any, b: any) => a.number - b.number)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/series/${seriesId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              ← {series.title}
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <h1 className="text-xl font-bold">Series Outline</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <OutlineView series={series} />
      </main>
    </div>
  )
}
