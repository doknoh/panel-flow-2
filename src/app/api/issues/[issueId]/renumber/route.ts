import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userCanAccessSeries } from '@/lib/auth-helpers'
import { rateLimiters } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const { issueId } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateLimit = rateLimiters.general(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before renumbering.' },
        { status: 429 }
      )
    }

    // Fetch the full issue structure with acts, scenes, and pages
    const { data: issue, error: fetchError } = await supabase
      .from('issues')
      .select(`
        id,
        series_id,
        acts (
          id,
          sort_order,
          scenes (
            id,
            sort_order,
            pages (
              id,
              sort_order,
              page_number
            )
          )
        )
      `)
      .eq('id', issueId)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Verify user has access to this series
    const hasAccess = await userCanAccessSeries(supabase, user.id, issue.series_id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Sort acts by sort_order
    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

    // Fetch the full structure including panels for panel renumbering
    const { data: fullIssue, error: fullError } = await supabase
      .from('issues')
      .select(`
        id,
        acts (
          id,
          sort_order,
          scenes (
            id,
            sort_order,
            pages (
              id,
              sort_order,
              page_number,
              panels (
                id,
                sort_order,
                panel_number
              )
            )
          )
        )
      `)
      .eq('id', issueId)
      .single()

    if (fullError || !fullIssue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Sort everything by sort_order
    const sortedFullActs = [...(fullIssue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

    // Collect all page updates and panel updates
    const pageUpdates: { id: string; page_number: number }[] = []
    const panelUpdates: { id: string; panel_number: number }[] = []
    let currentPageNumber = 1
    let currentPanelNumber = 1

    for (const act of sortedFullActs) {
      const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

      for (const scene of sortedScenes) {
        const sortedPages = [...(scene.pages || [])].sort((a, b) => a.sort_order - b.sort_order)

        for (const page of sortedPages) {
          pageUpdates.push({
            id: page.id,
            page_number: currentPageNumber,
          })

          // Renumber panels within this page (continuous across issue)
          const sortedPanels = [...(page.panels || [])].sort((a, b) => a.sort_order - b.sort_order)
          for (const panel of sortedPanels) {
            panelUpdates.push({
              id: panel.id,
              panel_number: currentPanelNumber,
            })
            currentPanelNumber++
          }

          currentPageNumber++
        }
      }
    }

    // Update all pages and panels in parallel
    const allUpdates: PromiseLike<any>[] = []

    if (pageUpdates.length > 0) {
      allUpdates.push(
        ...pageUpdates.map(({ id, page_number }) =>
          supabase.from('pages').update({ page_number }).eq('id', id)
        )
      )
    }

    if (panelUpdates.length > 0) {
      allUpdates.push(
        ...panelUpdates.map(({ id, panel_number }) =>
          supabase.from('panels').update({ panel_number }).eq('id', id)
        )
      )
    }

    if (allUpdates.length > 0) {
      const results = await Promise.all(allUpdates)
      const errors = results.filter(r => r.error)

      if (errors.length > 0) {
        return NextResponse.json({
          error: `${errors.length} update(s) failed`,
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      pagesUpdated: pageUpdates.length,
      panelsUpdated: panelUpdates.length,
      newPageOrder: pageUpdates.map(p => p.page_number),
      newPanelOrder: panelUpdates.map(p => p.panel_number)
    })
  } catch (error) {
    console.error('Renumber route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
