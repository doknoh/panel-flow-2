import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Health check endpoint for monitoring
 * Returns status of critical dependencies
 */
export async function GET() {
  const checks = {
    status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    checks: {
      database: { status: 'unknown' as 'ok' | 'error', latencyMs: 0 },
      auth: { status: 'unknown' as 'ok' | 'error' },
    },
  }

  // Check database connectivity
  try {
    const start = performance.now()
    const supabase = await createClient()
    const { error } = await supabase.from('series').select('id').limit(1)
    checks.checks.database.latencyMs = Math.round(performance.now() - start)
    checks.checks.database.status = error ? 'error' : 'ok'
  } catch {
    checks.checks.database.status = 'error'
    checks.status = 'unhealthy'
  }

  // Check auth service
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.getSession()
    checks.checks.auth.status = error ? 'error' : 'ok'
  } catch {
    checks.checks.auth.status = 'error'
    checks.status = 'degraded'
  }

  // Determine overall status
  if (checks.checks.database.status === 'error') {
    checks.status = 'unhealthy'
  } else if (checks.checks.auth.status === 'error') {
    checks.status = 'degraded'
  }

  const statusCode = checks.status === 'healthy' ? 200 : checks.status === 'degraded' ? 200 : 503

  return NextResponse.json(checks, { status: statusCode })
}
