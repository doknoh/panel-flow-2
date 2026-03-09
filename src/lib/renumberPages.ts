/**
 * Renumbering utilities.
 *
 * page_number and panel_number are now derived from sort_order in the frontend
 * (via the correctedIssue pattern in IssueEditor). These functions are retained
 * as no-ops for backwards compatibility with any callers.
 */

export async function renumberPagesInIssue(_issueId: string): Promise<{ success: boolean; error?: string }> {
  // page_number is now computed from sort_order in the frontend.
  // No DB update needed.
  return { success: true }
}

export async function renumberPanelsInPage(_pageId: string): Promise<{ success: boolean; error?: string }> {
  // panel_number is now computed from sort_order in the frontend.
  // No DB update needed.
  return { success: true }
}

export async function renumberPanelsInIssue(_issueId: string): Promise<{ success: boolean; error?: string }> {
  // panel_number is now computed from sort_order in the frontend.
  // No DB update needed.
  return { success: true }
}
