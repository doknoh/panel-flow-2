'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import IssueGrid from './IssueGrid'
import CreateIssueButton from './CreateIssueButton'
import SeriesMetadata from './SeriesMetadata'

interface SeriesPageClientProps {
  seriesId: string
}

export default function SeriesPageClient({ seriesId }: SeriesPageClientProps) {
  const [series, setSeries] = useState<any>(null)
  const [counts, setCounts] = useState({ characters: 0, locations: 0, plotlines: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      // Fetch series with issues
      const { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select(`
          *,
          issues (
            id,
            number,
            title,
            tagline,
            status,
            updated_at,
            acts (
              scenes (
                pages (
                  id,
                  panels (id, word_count)
                )
              )
            )
          )
        `)
        .eq('id', seriesId)
        .single()

      if (seriesError || !seriesData) {
        setError('Series not found')
        setLoading(false)
        return
      }

      setSeries(seriesData)

      // Fetch counts
      const [{ count: characterCount }, { count: locationCount }, { count: plotlineCount }] = await Promise.all([
        supabase.from('characters').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
        supabase.from('locations').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
        supabase.from('plotlines').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
      ])

      setCounts({
        characters: characterCount || 0,
        locations: locationCount || 0,
        plotlines: plotlineCount || 0,
      })

      setLoading(false)
    }

    fetchData()
  }, [seriesId])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (error || !series) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Series Not Found</h1>
          <p className="text-zinc-400 mb-4">This series doesn&apos;t exist or you don&apos;t have access.</p>
          <Link href="/dashboard" className="text-blue-500 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-zinc-400 hover:text-white">
              ← Dashboard
            </Link>
            <span className="text-zinc-600">/</span>
            <h1 className="text-xl font-bold">{series.title}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Series Info */}
        <SeriesMetadata
          seriesId={seriesId}
          initialLogline={series.logline}
          initialTheme={series.central_theme}
          initialVisualGrammar={series.visual_grammar}
          initialRules={series.rules}
        />

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{series.issues?.length || 0}</div>
            <div className="text-zinc-500 text-sm">Issues</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{counts.characters}</div>
            <div className="text-zinc-500 text-sm">Characters</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{counts.locations}</div>
            <div className="text-zinc-500 text-sm">Locations</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{counts.plotlines}</div>
            <div className="text-zinc-500 text-sm">Plotlines</div>
          </div>
        </div>

        {/* Issues Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Issues</h2>
            <CreateIssueButton seriesId={seriesId} issueCount={series.issues?.length || 0} />
          </div>
          <IssueGrid issues={series.issues || []} seriesId={seriesId} />
        </div>

        {/* Series Tools */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-zinc-400">Tools</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Link
              href={`/series/${seriesId}/outline`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">📋</div>
              <h3 className="font-medium mb-1">Series Outline</h3>
              <p className="text-zinc-500 text-sm">Plan structure with AI summaries</p>
            </Link>
            <Link
              href={`/series/${seriesId}/analytics`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">📊</div>
              <h3 className="font-medium mb-1">Analytics</h3>
              <p className="text-zinc-500 text-sm">Stats, progress, and insights</p>
            </Link>
            <Link
              href={`/series/${seriesId}/sessions`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🕐</div>
              <h3 className="font-medium mb-1">Session History</h3>
              <p className="text-zinc-500 text-sm">Track progress and loose ends</p>
            </Link>
            <Link
              href={`/series/${seriesId}/continuity`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🔍</div>
              <h3 className="font-medium mb-1">Continuity Check</h3>
              <p className="text-zinc-500 text-sm">Detect errors and inconsistencies</p>
            </Link>
            <Link
              href={`/series/${seriesId}/notes`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">📝</div>
              <h3 className="font-medium mb-1">Project Notes</h3>
              <p className="text-zinc-500 text-sm">Questions, decisions, insights</p>
            </Link>
          </div>
        </div>

        {/* World Building */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-zinc-400">World Building</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href={`/series/${seriesId}/characters`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">👤</div>
              <h3 className="font-medium mb-1">Characters</h3>
              <p className="text-zinc-500 text-sm">Manage character database</p>
            </Link>
            <Link
              href={`/series/${seriesId}/character-arcs`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">📈</div>
              <h3 className="font-medium mb-1">Character Arcs</h3>
              <p className="text-zinc-500 text-sm">Track emotional journeys</p>
            </Link>
            <Link
              href={`/series/${seriesId}/locations`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🏛️</div>
              <h3 className="font-medium mb-1">Locations</h3>
              <p className="text-zinc-500 text-sm">Manage location database</p>
            </Link>
            <Link
              href={`/series/${seriesId}/plotlines`}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">🧵</div>
              <h3 className="font-medium mb-1">Plotlines</h3>
              <p className="text-zinc-500 text-sm">Define narrative threads</p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
