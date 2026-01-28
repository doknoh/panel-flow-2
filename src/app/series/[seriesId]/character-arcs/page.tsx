import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import CharacterArcsView from './CharacterArcsView'
import ThemeToggle from '@/components/ui/ThemeToggle'

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
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/series/${seriesId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              ← {series.title}
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <h1 className="text-xl font-bold">Character Arcs</h1>
          </div>
          <ThemeToggle />
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
