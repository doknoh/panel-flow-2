import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scaffoldPanelsFromBeat } from '@/lib/ai/scaffold'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pageId, seriesId } = await req.json()
  if (!pageId || !seriesId) {
    return NextResponse.json({ error: 'Missing pageId or seriesId' }, { status: 400 })
  }

  // Fetch the page with its scene context via the structural hierarchy
  const { data: page } = await supabase
    .from('pages')
    .select(`
      id, story_beat, page_number,
      scene:scene_id(
        id, title, name, characters, plotline_id, location_id,
        act:act_id(
          issue:issue_id(series_id)
        )
      )
    `)
    .eq('id', pageId)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  // Verify series ownership
  const scene = (page as any).scene
  if (scene?.act?.issue?.series_id !== seriesId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve plotline name
  let plotlineName: string | undefined
  if (scene?.plotline_id) {
    const { data: plotline } = await supabase
      .from('plotlines')
      .select('name')
      .eq('id', scene.plotline_id)
      .single()
    plotlineName = plotline?.name || undefined
  }

  // Resolve location name
  let locationName: string | undefined
  if (scene?.location_id) {
    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', scene.location_id)
      .single()
    locationName = location?.name || undefined
  }

  // Resolve character names from scene's characters array (array of character IDs)
  let characterNames: string[] = []
  const sceneCharacterIds: string[] = scene?.characters || []
  if (sceneCharacterIds.length > 0) {
    const { data: chars } = await supabase
      .from('characters')
      .select('name')
      .in('id', sceneCharacterIds)
    characterNames = (chars || []).map((c: { name: string }) => c.name)
  }

  // Get writer profile
  const { data: profile } = await supabase
    .from('writer_profiles')
    .select('profile_text')
    .eq('user_id', user.id)
    .single()

  const panels = await scaffoldPanelsFromBeat({
    storyBeat: page.story_beat || '',
    sceneContext: {
      title: scene?.title || scene?.name,
      plotline: plotlineName,
      characters: characterNames,
      location: locationName,
    },
    writerProfile: profile?.profile_text || null,
  })

  return NextResponse.json({ panels })
}
