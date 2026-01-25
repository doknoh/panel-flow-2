import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import NotesList from './NotesList'

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
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white">
            ← {series.title}
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-xl font-bold">Project Notes</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <NotesList seriesId={seriesId} initialNotes={notes || []} />
      </main>
    </div>
  )
}
