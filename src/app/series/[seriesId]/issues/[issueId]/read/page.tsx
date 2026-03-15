import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ReadingView from './ReadingView'

export const dynamic = 'force-dynamic'

export default async function ReadPage({
  params,
}: {
  params: Promise<{ seriesId: string; issueId: string }>
}) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch issue with series title
  const { data: issueData, error: issueError } = await supabase
    .from('issues')
    .select(`
      number,
      title,
      summary,
      series:series_id (
        id,
        title
      )
    `)
    .eq('id', issueId)
    .single()

  if (issueError || !issueData) {
    console.error('Issue fetch error:', issueError)
    notFound()
  }

  // Fetch acts/scenes/pages/panels structure with all nested content
  const { data: actsData, error: actsError } = await supabase
    .from('acts')
    .select(`
      sort_order,
      scenes (
        sort_order,
        pages (
          page_number,
          sort_order,
          page_type,
          panels (
            panel_number,
            sort_order,
            visual_description,
            camera,
            dialogue_blocks (
              character_id,
              speaker_name,
              dialogue_type,
              text,
              delivery_instruction,
              sort_order
            ),
            captions (
              caption_type,
              text,
              sort_order
            ),
            sound_effects (
              text,
              sort_order
            )
          )
        )
      )
    `)
    .eq('issue_id', issueId)
    .order('sort_order', { ascending: true })

  if (actsError) {
    console.error('Acts fetch error:', actsError)
  }

  // Fetch characters for the series to resolve character_id to display_name
  const seriesRaw = issueData.series as unknown
  const seriesData = Array.isArray(seriesRaw) ? seriesRaw[0] : seriesRaw
  const series = (seriesData as { id: string; title: string }) || { id: seriesId, title: 'Untitled Series' }

  const { data: charactersData } = await supabase
    .from('characters')
    .select('id, name, display_name')
    .eq('series_id', series.id)

  // Map characters to use display_name with fallback to name
  const characters = (charactersData || []).map(c => ({
    id: c.id,
    display_name: (c.display_name || c.name || 'UNKNOWN').toUpperCase(),
  }))

  // Sort nested data since Supabase nested selects don't guarantee order
  const acts = (actsData || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(act => ({
      ...act,
      scenes: (act.scenes || [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        .map((scene: { sort_order: number; pages: Array<{ page_number: number; sort_order: number; page_type: string; panels: Array<{ panel_number: number; sort_order: number; visual_description: string | null; camera: string | null; dialogue_blocks: Array<{ character_id: string | null; speaker_name: string | null; dialogue_type: string; text: string; delivery_instruction: string | null; sort_order: number }>; captions: Array<{ caption_type: string; text: string; sort_order: number }>; sound_effects: Array<{ text: string; sort_order: number }> }> }> }) => ({
          ...scene,
          pages: (scene.pages || [])
            .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
            .map((page: { page_number: number; sort_order: number; page_type: string; panels: Array<{ panel_number: number; sort_order: number; visual_description: string | null; camera: string | null; dialogue_blocks: Array<{ character_id: string | null; speaker_name: string | null; dialogue_type: string; text: string; delivery_instruction: string | null; sort_order: number }>; captions: Array<{ caption_type: string; text: string; sort_order: number }>; sound_effects: Array<{ text: string; sort_order: number }> }> }) => ({
              ...page,
              panels: (page.panels || [])
                .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
                .map((panel: { panel_number: number; sort_order: number; visual_description: string | null; camera: string | null; dialogue_blocks: Array<{ character_id: string | null; speaker_name: string | null; dialogue_type: string; text: string; delivery_instruction: string | null; sort_order: number }>; captions: Array<{ caption_type: string; text: string; sort_order: number }>; sound_effects: Array<{ text: string; sort_order: number }> }) => ({
                  ...panel,
                  dialogue_blocks: (panel.dialogue_blocks || [])
                    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
                  captions: (panel.captions || [])
                    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
                  sound_effects: (panel.sound_effects || [])
                    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
                })),
            })),
        })),
    }))

  const issue = {
    number: issueData.number,
    title: issueData.title,
    summary: issueData.summary,
    acts,
  }

  return (
    <ReadingView
      seriesTitle={series.title}
      seriesId={seriesId}
      issueId={issueId}
      issue={issue}
      characters={characters}
    />
  )
}
