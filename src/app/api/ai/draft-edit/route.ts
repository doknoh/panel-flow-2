import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimitResult = rateLimiters.general(user.id)
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    const { original, edited, panelId } = await req.json()
    if (!original || !edited || !panelId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // F23: Use atomic RPC to avoid race conditions on concurrent edits
    const { error } = await supabase.rpc('append_draft_edit', {
      p_user_id: user.id,
      p_edit: JSON.stringify({ original, edited, panelId, timestamp: new Date().toISOString() }),
    })

    if (error) {
      console.error('Failed to append draft edit:', error)
      return NextResponse.json({ error: 'Failed to save draft edit' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Draft edit error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
