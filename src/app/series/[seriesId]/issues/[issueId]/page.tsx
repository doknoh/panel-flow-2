import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import IssueEditor from './IssueEditor'

export const dynamic = 'force-dynamic'

export default async function IssuePage({
  params
}: {
  params: Promise<{ seriesId: string; issueId: string }>
}) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch issue and series data first (lighter query)
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

  if (issueError) {
    console.error('Issue fetch error:', issueError)
    notFound()
  }

  if (!issueData) {
    console.error('Issue not found for id:', issueId)
    notFound()
  }

  // Fetch acts/scenes/pages structure and plotlines separately
  // (avoids timeout on large issues and prevents FK join failures on plotline_id)
  const [actsResult, plotlinesResult] = await Promise.all([
    supabase
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
      .order('sort_order', { ascending: true }),
    supabase
      .from('plotlines')
      .select('*')
      .eq('series_id', seriesId)
      .order('sort_order')
  ])

  if (actsResult.error) {
    console.error('Acts fetch error:', actsResult.error)
  }

  // Resolve plotline names onto scenes from separately-fetched plotlines
  const actsDataRaw = actsResult.data || []
  const plotlineMap = new Map((plotlinesResult.data || []).map(p => [p.id, p]))
  for (const act of actsDataRaw) {
    for (const scene of ((act as any).scenes || [])) {
      scene.plotline = scene.plotline_id ? plotlineMap.get(scene.plotline_id) || null : null
    }
  }

  // Sort all nested relations by sort_order (PostgREST only sorts top-level .order())
  const actsData = actsDataRaw
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((act: any) => ({
      ...act,
      scenes: (act.scenes || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((scene: any) => ({
          ...scene,
          pages: (scene.pages || [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((page: any) => ({
              ...page,
              panels: (page.panels || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
            }))
        }))
    }))

  // Merge plotlines into series data
  if (plotlinesResult.data) {
    (issueData as any).series.plotlines = plotlinesResult.data
  }

  // Combine the data
  const issue = {
    ...issueData,
    acts: actsData
  }

  return <IssueEditor issue={issue} seriesId={seriesId} />
}
