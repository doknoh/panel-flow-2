import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params
  const supabase = await createClient()

  // Fetch the full issue structure with acts, scenes, and pages
  const { data: issue, error: fetchError } = await supabase
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
            page_number
          )
        )
      )
    `)
    .eq('id', issueId)
    .single()

  if (fetchError || !issue) {
    return NextResponse.json({ error: fetchError?.message || 'Issue not found' }, { status: 404 })
  }

  // Sort acts by sort_order
  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  // Collect all pages in order with their new page_number
  const pageUpdates: { id: string; page_number: number }[] = []
  let currentPageNumber = 1

  for (const act of sortedActs) {
    const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const scene of sortedScenes) {
      const sortedPages = [...(scene.pages || [])].sort((a, b) => a.sort_order - b.sort_order)

      for (const page of sortedPages) {
        pageUpdates.push({
          id: page.id,
          page_number: currentPageNumber,
        })
        currentPageNumber++
      }
    }
  }

  // Update all pages
  if (pageUpdates.length > 0) {
    const updatePromises = pageUpdates.map(({ id, page_number }) =>
      supabase
        .from('pages')
        .update({ page_number })
        .eq('id', id)
    )

    const results = await Promise.all(updatePromises)
    const errors = results.filter(r => r.error)

    if (errors.length > 0) {
      return NextResponse.json({
        error: `${errors.length} page(s) failed to update`,
        details: errors.map(e => e.error?.message)
      }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    pagesUpdated: pageUpdates.length,
    newOrder: pageUpdates.map(p => p.page_number)
  })
}
