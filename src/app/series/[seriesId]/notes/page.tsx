import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import NotesList from './NotesList'
import Header from '@/components/ui/Header'

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
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Project Notes"
      />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <NotesList seriesId={seriesId} initialNotes={notes || []} />
      </main>
    </div>
  )
}
