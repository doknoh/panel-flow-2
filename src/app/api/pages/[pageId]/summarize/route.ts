import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/rate-limit'
import { userCanAccessSeries } from '@/lib/auth-helpers'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.chat(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)) } }
      )
    }

    const { pageId } = await params

    // Fetch page with its panels, dialogue, captions, and sound effects
    const { data: page, error: pageError } = await supabase
      .from('pages')
      .select(`
        id,
        panels (
          id,
          sort_order,
          visual_description,
          dialogue_blocks (
            id,
            sort_order,
            speaker_name,
            text,
            delivery_type
          ),
          captions (
            id,
            sort_order,
            type,
            text
          ),
          sound_effects (
            id,
            text
          )
        )
      `)
      .eq('id', pageId)
      .single()

    if (pageError || !page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Verify user has access to this page's series
    const { data: pageOwnership } = await supabase
      .from('pages')
      .select('scene:scene_id(act:act_id(issue:issue_id(series_id)))')
      .eq('id', pageId)
      .single()

    const pageSeriesId = (pageOwnership as any)?.scene?.act?.issue?.series_id
    if (!pageSeriesId) {
      return NextResponse.json({ error: 'Page not linked to series' }, { status: 404 })
    }
    const hasAccess = await userCanAccessSeries(supabase, user.id, pageSeriesId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const panels = (page.panels || []).sort((a: any, b: any) => a.sort_order - b.sort_order)

    if (panels.length === 0) {
      return NextResponse.json({ error: 'No panels to summarize' }, { status: 400 })
    }

    // Build a concise text representation of the page
    const pageText = panels.map((panel: any, i: number) => {
      const parts: string[] = []
      if (panel.visual_description) parts.push(panel.visual_description)
      const dialogue = (panel.dialogue_blocks || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((d: any) => `${d.speaker_name || 'UNKNOWN'}: ${d.text}`)
      if (dialogue.length) parts.push(dialogue.join(' '))
      const captions = (panel.captions || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((c: any) => `CAP: ${c.text}`)
      if (captions.length) parts.push(captions.join(' '))
      const sfx = (panel.sound_effects || []).map((s: any) => s.text).filter(Boolean)
      if (sfx.length) parts.push(`SFX: ${sfx.join(', ')}`)
      return `Panel ${i + 1}: ${parts.join(' | ')}`
    }).join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Summarize this comic book page in 5-8 words. Just the action/event, no fluff. Return ONLY the summary, nothing else.\n\n${pageText}`,
      }],
    })

    const textContent = response.content.find(block => block.type === 'text')
    const summary = textContent?.type === 'text' ? textContent.text.trim() : ''

    if (!summary) {
      return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
    }

    // Save to database
    const { error: updateError } = await supabase
      .from('pages')
      .update({ page_summary: summary })
      .eq('id', pageId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save summary' }, { status: 500 })
    }

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('Page summarize error:', error)
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    )
  }
}
