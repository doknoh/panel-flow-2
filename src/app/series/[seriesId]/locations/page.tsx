import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import LocationList from './LocationList'

export default async function LocationsPage({ params }: { params: Promise<{ seriesId: string }> }) {
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

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('series_id', seriesId)
    .order('name')

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-4">
          <Link href={`/series/${seriesId}`} className="text-zinc-400 hover:text-white shrink-0">
            ←
          </Link>
          <span className="text-zinc-400 truncate hidden sm:inline">{series.title}</span>
          <span className="text-zinc-600 hidden sm:inline">/</span>
          <h1 className="text-lg sm:text-xl font-bold">Locations</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <LocationList seriesId={seriesId} initialLocations={locations || []} />
      </main>
    </div>
  )
}
