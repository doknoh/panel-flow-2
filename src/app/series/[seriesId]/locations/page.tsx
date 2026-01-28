import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import LocationList from './LocationList'
import ThemeToggle from '@/components/ui/ThemeToggle'

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
      <header className="border-b border-[var(--border)] px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href={`/series/${seriesId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0">
              ←
            </Link>
            <span className="text-[var(--text-secondary)] truncate hidden sm:inline">{series.title}</span>
            <span className="text-[var(--text-muted)] hidden sm:inline">/</span>
            <h1 className="text-lg sm:text-xl font-bold">Locations</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <LocationList seriesId={seriesId} initialLocations={locations || []} />
      </main>
    </div>
  )
}
