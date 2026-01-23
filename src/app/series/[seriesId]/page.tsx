import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import IssueGrid from './IssueGrid'
import CreateIssueButton from './CreateIssueButton'

export default async function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch series with issues
  const { data: series, error } = await supabase
    .from('series')
    .select(`
      *,
      issues (*)
    `)
    .eq('id', seriesId)
    .single()

  if (error || !series) {
    notFound()
  }

  // Fetch characters, locations, and plotlines counts
  const [{ count: characterCount }, { count: locationCount }, { count: plotlineCount }] = await Promise.all([
    supabase.from('characters').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
    supabase.from('locations').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
    supabase.from('plotlines').select('*', { count: 'exact', head: true }).eq('series_id', seriesId),
  ])

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
        <div className="mb-8">
          {series.logline && (
            <p className="text-zinc-400 text-lg mb-4">{series.logline}</p>
          )}
          {series.central_theme && (
            <p className="text-zinc-500">
              <span className="font-medium">Theme:</span> {series.central_theme}
            </p>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{series.issues?.length || 0}</div>
            <div className="text-zinc-500 text-sm">Issues</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{characterCount || 0}</div>
            <div className="text-zinc-500 text-sm">Characters</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{locationCount || 0}</div>
            <div className="text-zinc-500 text-sm">Locations</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{plotlineCount || 0}</div>
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

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-4">
          <Link
            href={`/series/${seriesId}/characters`}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
          >
            <h3 className="font-medium mb-1">Characters</h3>
            <p className="text-zinc-500 text-sm">Manage your character database</p>
          </Link>
          <Link
            href={`/series/${seriesId}/locations`}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
          >
            <h3 className="font-medium mb-1">Locations</h3>
            <p className="text-zinc-500 text-sm">Manage your location database</p>
          </Link>
          <Link
            href={`/series/${seriesId}/plotlines`}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
          >
            <h3 className="font-medium mb-1">Plotlines</h3>
            <p className="text-zinc-500 text-sm">Define narrative threads</p>
          </Link>
        </div>
      </main>
    </div>
  )
}
