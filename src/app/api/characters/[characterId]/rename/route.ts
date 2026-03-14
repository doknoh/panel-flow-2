import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const { characterId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimitResult = rateLimiters.general(user.id)
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    const { newDisplayName } = await req.json()
    if (!newDisplayName?.trim()) {
      return NextResponse.json({ error: 'newDisplayName required' }, { status: 400 })
    }

    // Get current character info
    const { data: character, error: charErr } = await supabase
      .from('characters')
      .select('id, name, display_name, series_id')
      .eq('id', characterId)
      .single()

    if (charErr || !character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // F18: Permission check — user must be series owner or an editor collaborator
    const { data: access } = await supabase
      .from('series_collaborators')
      .select('role')
      .eq('series_id', character.series_id)
      .eq('user_id', user.id)
      .in('role', ['owner', 'editor'])
      .maybeSingle()

    const { data: series } = await supabase
      .from('series').select('user_id').eq('id', character.series_id).single()

    if (!access && series?.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const oldDisplayName = character.display_name || character.name
    const newUpper = newDisplayName.toUpperCase()
    const oldUpper = oldDisplayName.toUpperCase()

    // 1. Update the character record
    const { error: updateCharErr } = await supabase
      .from('characters')
      .update({ display_name: newDisplayName })
      .eq('id', characterId)

    if (updateCharErr) {
      return NextResponse.json({ error: 'Failed to update character' }, { status: 500 })
    }

    // 2. Update dialogue_blocks speaker_name where character_id matches.
    // Note: only linked blocks (those with a character_id FK) are renamed here.
    // Unlinked blocks where the user manually typed the speaker name are not affected.
    const { error: updateDialogueErr } = await supabase
      .from('dialogue_blocks')
      .update({ speaker_name: newUpper })
      .eq('character_id', characterId)

    if (updateDialogueErr) {
      return NextResponse.json({ error: 'Failed to update dialogue blocks' }, { status: 500 })
    }

    // 3. Update visual descriptions via RPC (regexp_replace across all panels in series)
    const { error: rpcErr } = await supabase.rpc('rename_character_in_descriptions', {
      p_series_id: character.series_id,
      p_old_name: oldUpper,
      p_new_name: newUpper,
    })

    if (rpcErr) {
      return NextResponse.json({ error: 'Failed to update panel descriptions' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      oldName: oldDisplayName,
      newName: newDisplayName,
    })
  } catch (err) {
    console.error('[rename] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
