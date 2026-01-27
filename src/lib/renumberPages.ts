import { createClient } from '@/lib/supabase/client'

/**
 * Recalculates page_number for all pages in an issue.
 *
 * page_number = (sum of all pages in previous scenes) + position_within_scene
 *
 * This should be called after any operation that affects page ordering:
 * - Dragging pages within a scene
 * - Moving pages between scenes
 * - Adding or deleting pages
 * - Reordering scenes or acts
 */
export async function renumberPagesInIssue(issueId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

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
    console.error('Failed to fetch issue for renumbering:', fetchError)
    return { success: false, error: fetchError?.message || 'Issue not found' }
  }

  // Sort acts by sort_order
  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  // Collect all pages in order with their new page_number
  const pageUpdates: { id: string; page_number: number }[] = []
  let currentPageNumber = 1

  for (const act of sortedActs) {
    // Sort scenes within act by sort_order
    const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const scene of sortedScenes) {
      // Sort pages within scene by sort_order
      const sortedPages = [...(scene.pages || [])].sort((a, b) => a.sort_order - b.sort_order)

      for (const page of sortedPages) {
        // Only update if page_number is different
        if (page.page_number !== currentPageNumber) {
          pageUpdates.push({
            id: page.id,
            page_number: currentPageNumber,
          })
        }
        currentPageNumber++
      }
    }
  }

  // Batch update all pages that need renumbering
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
      console.error('Some page updates failed:', errors)
      return { success: false, error: `${errors.length} page(s) failed to update` }
    }
  }

  return { success: true }
}

/**
 * Renumber panels within a page after reordering.
 *
 * panel_number within page = position (1, 2, 3, etc.)
 *
 * Note: For export, panel numbers restart at 1 on each page.
 * The internal panel_number is for issue-wide tracking.
 */
export async function renumberPanelsInPage(pageId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  const { data: panels, error: fetchError } = await supabase
    .from('panels')
    .select('id, sort_order, panel_number')
    .eq('page_id', pageId)
    .order('sort_order', { ascending: true })

  if (fetchError) {
    return { success: false, error: fetchError.message }
  }

  const panelUpdates: { id: string; panel_number: number }[] = []
  let panelNum = 1

  for (const panel of panels || []) {
    if (panel.panel_number !== panelNum) {
      panelUpdates.push({ id: panel.id, panel_number: panelNum })
    }
    panelNum++
  }

  if (panelUpdates.length > 0) {
    const updatePromises = panelUpdates.map(({ id, panel_number }) =>
      supabase
        .from('panels')
        .update({ panel_number })
        .eq('id', id)
    )

    await Promise.all(updatePromises)
  }

  return { success: true }
}

/**
 * Renumber all panels in an issue after major structural changes.
 *
 * panel_number = (sum of all panels on previous pages) + position_on_page
 */
export async function renumberPanelsInIssue(issueId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  // Fetch full issue structure
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

  if (fetchError || !issue) {
    return { success: false, error: fetchError?.message || 'Issue not found' }
  }

  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
  const panelUpdates: { id: string; panel_number: number }[] = []
  let currentPanelNumber = 1

  for (const act of sortedActs) {
    const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const scene of sortedScenes) {
      const sortedPages = [...(scene.pages || [])].sort((a, b) => a.sort_order - b.sort_order)

      for (const page of sortedPages) {
        const sortedPanels = [...(page.panels || [])].sort((a, b) => a.sort_order - b.sort_order)

        for (const panel of sortedPanels) {
          if (panel.panel_number !== currentPanelNumber) {
            panelUpdates.push({ id: panel.id, panel_number: currentPanelNumber })
          }
          currentPanelNumber++
        }
      }
    }
  }

  if (panelUpdates.length > 0) {
    const updatePromises = panelUpdates.map(({ id, panel_number }) =>
      supabase
        .from('panels')
        .update({ panel_number })
        .eq('id', id)
    )

    await Promise.all(updatePromises)
  }

  return { success: true }
}
