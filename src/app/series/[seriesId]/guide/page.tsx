import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import GuidedMode from './GuidedMode'

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ seriesId: string }>
  searchParams: Promise<{ issue?: string; scene?: string; page?: string; session?: string }>
}) {
  const { seriesId } = await params
  const { issue: issueId, scene: sceneId, page: pageId, session: sessionId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch series with context (excluding deep panel data for performance)
  // Note: plotlines are per-issue, so fetch them within issues
  const { data: series, error } = await supabase
    .from('series')
    .select(`
      *,
      characters (*),
      locations (*),
      issues (
        *,
        plotlines (*),
        acts (
          *,
          scenes (
            *,
            pages (
              id, page_number, intention, page_summary
            )
          )
        )
      )
    `)
    .eq('id', seriesId)
    .single()

  if (error || !series) {
    console.error('Guide page error:', { error, seriesId, hasUser: !!user })
    notFound()
  }

  // Fetch session (if provided), writer insights, and recent sessions in parallel
  const sessionPromise = (async () => {
    if (!sessionId) return { session: null, messages: [] as any[] }
    const { data: session } = await supabase
      .from('guided_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!session) return { session: null, messages: [] as any[] }

    const { data: messages } = await supabase
      .from('guided_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    return { session, messages: messages || [] }
  })()

  const writerInsightsPromise = supabase
    .from('writer_insights')
    .select('*')
    .eq('user_id', user.id)

  const recentSessionsPromise = supabase
    .from('guided_sessions')
    .select('*')
    .eq('series_id', seriesId)
    .eq('user_id', user.id)
    .order('last_active_at', { ascending: false })
    .limit(5)

  const [sessionResult, { data: writerInsights }, { data: recentSessions }] = await Promise.all([
    sessionPromise,
    writerInsightsPromise,
    recentSessionsPromise,
  ])

  const existingSession = sessionResult.session
  const sessionMessages = sessionResult.messages

  return (
    <GuidedMode
      series={series}
      issueId={issueId}
      sceneId={sceneId}
      pageId={pageId}
      existingSession={existingSession}
      sessionMessages={sessionMessages}
      writerInsights={writerInsights || []}
      recentSessions={recentSessions || []}
      userId={user.id}
    />
  )
}
