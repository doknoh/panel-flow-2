import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VoiceProfileClient from './VoiceProfileClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ seriesId: string; characterId: string }>
}

export default async function VoiceProfilePage({ params }: PageProps) {
  const { seriesId, characterId } = await params
  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Fetch character
  const { data: character, error: charError } = await supabase
    .from('characters')
    .select('id, name, role, description')
    .eq('id', characterId)
    .single()

  if (charError || !character) {
    console.error('Error fetching character:', charError)
    redirect(`/series/${seriesId}/characters`)
  }

  // Fetch series info
  const { data: series } = await supabase
    .from('series')
    .select('id, title')
    .eq('id', seriesId)
    .single()

  // Fetch all dialogue for this character across all issues
  const { data: dialogueData } = await supabase
    .from('dialogue_blocks')
    .select(`
      id,
      text,
      panel:panel_id (
        id,
        page:page_id (
          id,
          page_number,
          scene:scene_id (
            id,
            name,
            act:act_id (
              id,
              name,
              issue:issue_id (
                id,
                number,
                title
              )
            )
          )
        )
      )
    `)
    .eq('character_id', characterId)
    .not('text', 'is', null)

  // Flatten dialogue with context
  const dialogues = (dialogueData || []).map((d: any) => ({
    id: d.id,
    text: d.text || '',
    issueNumber: d.panel?.page?.scene?.act?.issue?.number,
    pageNumber: d.panel?.page?.page_number,
    sceneName: d.panel?.page?.scene?.name,
  })).filter((d: any) => d.text.length > 0)

  // Fetch existing voice profile if any
  const { data: existingProfile } = await supabase
    .from('character_voice_profiles')
    .select('*')
    .eq('character_id', characterId)
    .single()

  // Fetch existing dialogue flags
  const { data: existingFlags } = await supabase
    .from('dialogue_flags')
    .select(`
      id,
      dialogue_id,
      flag_type,
      message,
      flagged_word,
      suggested_alternative,
      severity,
      dismissed
    `)
    .eq('character_id', characterId)
    .eq('dismissed', false)

  return (
    <VoiceProfileClient
      seriesId={seriesId}
      seriesTitle={series?.title || 'Series'}
      character={character}
      dialogues={dialogues}
      existingProfile={existingProfile}
      existingFlags={existingFlags || []}
    />
  )
}
