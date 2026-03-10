import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import LocationList from './LocationList'
import Header from '@/components/ui/Header'

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
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Header
        variant="subpage"
        backHref={`/series/${seriesId}`}
        backLabel={series.title}
        title="Locations"
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <LocationList seriesId={seriesId} initialLocations={locations || []} />
      </main>
    </div>
  )
}
