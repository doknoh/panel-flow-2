import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/issues/[issueId]/renumber
 *
 * Previously updated stored page_number and panel_number columns.
 * These are now computed from sort_order in the frontend, so this
 * endpoint is a no-op retained for backwards compatibility.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params
  const supabase = await createClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // page_number and panel_number are now derived from sort_order
  // in the frontend. No DB updates needed.
  return NextResponse.json({
    success: true,
    pagesUpdated: 0,
    panelsUpdated: 0,
    message: 'Page/panel numbers are now computed from sort_order in the frontend.',
  })
}
