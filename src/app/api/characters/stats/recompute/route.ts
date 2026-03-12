import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'
import { computeAllCharacterStats, writeStatsCache } from '@/lib/character-stats'
import { logger } from '@/lib/logger'
import { userCanAccessSeries } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.statsRecompute(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    const { seriesId } = await request.json()

    if (!seriesId) {
      return NextResponse.json(
        { error: 'seriesId is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this series
    const hasAccess = await userCanAccessSeries(supabase, user.id, seriesId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch all characters for the series
    const { data: characters, error: charError } = await supabase
      .from('characters')
      .select('id, name, aliases')
      .eq('series_id', seriesId)

    if (charError) {
      logger.error('Failed to fetch characters for stats recompute', {
        userId: user.id,
        seriesId,
        action: 'stats_recompute',
        error: charError.message,
      })
      return NextResponse.json(
        { error: 'Failed to fetch characters' },
        { status: 500 }
      )
    }

    const normalizedCharacters = (characters || []).map(c => ({
      id: c.id,
      name: c.name,
      aliases: c.aliases || [],
    }))

    // Compute stats for all characters
    const stats = await computeAllCharacterStats(
      supabase,
      seriesId,
      normalizedCharacters
    )

    // Write to cache
    await writeStatsCache(supabase, seriesId, stats)

    // Convert Map to plain object for JSON response
    const statsObject: Record<string, any> = {}
    for (const [charId, charStats] of stats) {
      statsObject[charId] = charStats
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Stats recompute complete', {
      userId: user.id,
      seriesId,
      action: 'stats_recompute',
      duration,
      characterCount: normalizedCharacters.length,
    })

    return NextResponse.json({
      stats: statsObject,
      characterCount: normalizedCharacters.length,
      computedAt: new Date().toISOString(),
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Stats recompute error', {
      action: 'stats_recompute',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to recompute stats' },
      { status: 500 }
    )
  }
}
