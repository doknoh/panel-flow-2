import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const start = performance.now()

  try {
    const { characterId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.voiceData(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    // Fetch character to verify access and get series_id
    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('id, name, series_id')
      .eq('id', characterId)
      .single()

    if (charError || !character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    // Fetch all dialogue for this character with context joins
    // Note: issues table column is `number` (not `issue_number`)
    const { data: dialogueData, error: dialogueError } = await supabase
      .from('dialogue_blocks')
      .select(`
        id,
        text,
        dialogue_type,
        delivery_instruction,
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

    if (dialogueError) {
      logger.error('Failed to fetch dialogue for voice data', {
        userId: user.id,
        characterId,
        action: 'voice_data',
        error: dialogueError.message,
      })
    }

    // Fetch existing voice profile
    const { data: profile } = await supabase
      .from('character_voice_profiles')
      .select('*')
      .eq('character_id', characterId)
      .single()

    // Fetch non-dismissed dialogue flags
    // Note: column is `dismissed` (not `is_dismissed`)
    const { data: flags } = await supabase
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

    // Flatten dialogue data for client
    const dialogues = (dialogueData || []).map((d: any) => ({
      id: d.id,
      text: d.text || '',
      dialogueType: d.dialogue_type,
      deliveryInstruction: d.delivery_instruction,
      issueNumber: d.panel?.page?.scene?.act?.issue?.number ?? null,
      issueTitle: d.panel?.page?.scene?.act?.issue?.title ?? null,
      issueId: d.panel?.page?.scene?.act?.issue?.id ?? null,
      pageNumber: d.panel?.page?.page_number ?? null,
      sceneName: d.panel?.page?.scene?.name ?? null,
    })).filter((d: any) => d.text.length > 0)

    const duration = Math.round(performance.now() - start)
    logger.info('Voice data loaded', {
      userId: user.id,
      characterId,
      action: 'voice_data',
      duration,
      dialogueCount: dialogues.length,
    })

    return NextResponse.json({
      dialogues,
      profile: profile || null,
      flags: flags || [],
      dialogueCount: dialogues.length,
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Voice data error', {
      action: 'voice_data',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to load voice data' },
      { status: 500 }
    )
  }
}
