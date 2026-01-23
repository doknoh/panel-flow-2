import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import CharacterArcsView from './CharacterArcsView'

export default async function CharacterArcsPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch series with characters, issues, and character states
  const { data: series, error } = await supabase
    .from('series')
    .select(`
      *,
      characters (*),
      issues (
        id,
        number,
        title,
        acts (
          scenes (
            pages (
              page_number,
              panels (
                visual_description,
                dialogue_blocks (
                  character_id,
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

  // Fetch character states separately
  const { data: characterStates } = await supabase
    .from('character_states')
    .select('*')
    .in('character_id', (series.characters || []).map((c: any) => c.id))

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white">
            ← {series.title}
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-xl font-bold">Character Arcs</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <CharacterArcsView
          series={series}
          characterStates={characterStates || []}
        />
      </main>
    </div>
  )
}
