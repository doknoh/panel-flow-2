import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import CharacterArcsView from './CharacterArcsView'
import Header from '@/components/ui/Header'

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
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Character Arcs"
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <CharacterArcsView
          series={series}
          characterStates={characterStates || []}
        />
      </main>
    </div>
  )
}
