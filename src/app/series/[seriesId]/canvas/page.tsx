import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CanvasClient from './CanvasClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ seriesId: string }>
}

export default async function CanvasPage({ params }: PageProps) {
  const { seriesId } = await params
  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Fetch series with basic info
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select('id, title, user_id')
    .eq('id', seriesId)
    .single()

  if (seriesError || !series) {
    redirect('/dashboard')
  }

  // Fetch canvas items for this series
  const { data: canvasItems, error: itemsError } = await supabase
    .from('canvas_items')
    .select('*')
    .eq('series_id', seriesId)
    .eq('archived', false)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    console.error('Error fetching canvas items:', itemsError)
  }

  // Fetch characters for graduation modal
  const { data: characters } = await supabase
    .from('characters')
    .select('id, name, role')
    .eq('series_id', seriesId)
    .order('name')

  // Fetch locations for graduation modal
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .eq('series_id', seriesId)
    .order('name')

  return (
    <CanvasClient
      seriesId={seriesId}
      seriesTitle={series.title}
      initialItems={canvasItems || []}
      characters={characters || []}
      locations={locations || []}
    />
  )
}
