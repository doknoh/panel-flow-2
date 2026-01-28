import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import NotesList from './NotesList'
import ThemeToggle from '@/components/ui/ThemeToggle'

export default async function NotesPage({ params }: { params: Promise<{ seriesId: string }> }) {
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

  const { data: notes } = await supabase
    .from('project_notes')
    .select('*')
    .eq('series_id', seriesId)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/series/${seriesId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              ← {series.title}
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <h1 className="text-xl font-bold">Project Notes</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <NotesList seriesId={seriesId} initialNotes={notes || []} />
      </main>
    </div>
  )
}
