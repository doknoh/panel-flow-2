import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Header from '@/components/ui/Header'
import { getCachedStats, isStatsCacheStale } from '@/lib/character-stats'
import type { CharacterWithStats } from '@/lib/character-stats'
import CharacterGrid from './CharacterGrid'

export default async function CharactersPage({ params }: { params: Promise<{ seriesId: string }> }) {
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

  // Fetch characters, cached stats, issues, plotlines, and staleness in parallel
  const [
    { data: characters },
    cachedStats,
    stale,
    { data: issues },
    { data: plotlines },
  ] = await Promise.all([
    supabase
      .from('characters')
      .select('*')
      .eq('series_id', seriesId)
      .order('name'),
    getCachedStats(supabase, seriesId),
    isStatsCacheStale(supabase, seriesId),
    supabase
      .from('issues')
      .select('id, number, title')
      .eq('series_id', seriesId)
      .order('number'),
    supabase
      .from('plotlines')
      .select('id, name')
      .eq('series_id', seriesId)
      .order('sort_order'),
  ])

  // Merge characters with their cached stats
  const charactersWithStats: CharacterWithStats[] = (characters || []).map(c => ({
    id: c.id,
    name: c.name,
    display_name: c.display_name ?? null,
    role: c.role ?? null,
    aliases: c.aliases ?? [],
    physical_description: c.physical_description ?? null,
    background: c.background ?? null,
    personality_traits: c.personality_traits ?? null,
    speech_patterns: c.speech_patterns ?? null,
    relationships: c.relationships ?? null,
    arc_notes: c.arc_notes ?? null,
    age: c.age ?? null,
    eye_color: c.eye_color ?? null,
    hair_color_style: c.hair_color_style ?? null,
    height: c.height ?? null,
    build: c.build ?? null,
    skin_tone: c.skin_tone ?? null,
    distinguishing_marks: c.distinguishing_marks ?? null,
    style_wardrobe: c.style_wardrobe ?? null,
    first_appearance: c.first_appearance ?? null,
    color: c.color ?? null,
    created_at: c.created_at,
    updated_at: c.updated_at,
    stats: cachedStats.get(c.id) ?? null,
  }))

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Characters"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <CharacterGrid
          seriesId={seriesId}
          initialCharacters={charactersWithStats}
          initialStats={cachedStats}
          issues={(issues || []).map(i => ({ id: i.id, number: i.number, title: i.title || '' }))}
          plotlines={(plotlines || []).map(p => ({ id: p.id, name: p.name }))}
          initialStale={stale}
        />
      </main>
    </div>
  )
}
