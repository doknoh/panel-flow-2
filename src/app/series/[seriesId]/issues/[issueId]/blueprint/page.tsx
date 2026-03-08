import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BlueprintView from './BlueprintView'

export const dynamic = 'force-dynamic'

export default async function BlueprintPage({
  params,
}: {
  params: Promise<{ seriesId: string; issueId: string }>
}) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch issue with series data
  const { data: issueData, error: issueError } = await supabase
    .from('issues')
    .select(`
      *,
      series:series_id (
        id,
        title,
        central_theme,
        logline,
        characters (*),
        locations (*),
        plotlines (*)
      )
    `)
    .eq('id', issueId)
    .single()

  if (issueError || !issueData) {
    console.error('Issue fetch error:', issueError)
    notFound()
  }

  // Fetch acts/scenes/pages structure
  const { data: actsData, error: actsError } = await supabase
    .from('acts')
    .select(`
      *,
      scenes (
        *,
        pages (
          *,
          panels (
            *,
            dialogue_blocks (*, character:character_id (id, name)),
            captions (*),
            sound_effects (*)
          )
        )
      )
    `)
    .eq('issue_id', issueId)
    .order('sort_order', { ascending: true })

  if (actsError) {
    console.error('Acts fetch error:', actsError)
  }

  const issue = {
    ...issueData,
    acts: actsData || [],
  }

  return <BlueprintView issue={issue} seriesId={seriesId} />
}
