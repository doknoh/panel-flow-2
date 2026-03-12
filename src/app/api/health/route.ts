import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Health check endpoint for monitoring
 * Returns status of critical dependencies
 */
export async function GET() {
  let status: 'ok' | 'degraded' = 'ok'

  // Check database connectivity
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('series').select('id').limit(1)
    if (error) {
      status = 'degraded'
    }
  } catch {
    status = 'degraded'
  }

  // Check auth service
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.getSession()
    if (error) {
      status = 'degraded'
    }
  } catch {
    status = 'degraded'
  }

  const statusCode = status === 'ok' ? 200 : 503

  return NextResponse.json({ status }, { status: statusCode })
}
