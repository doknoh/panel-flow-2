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
              id, page_number, intention, summary
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

  // If a session ID is provided, fetch it
  let existingSession = null
  let sessionMessages: any[] = []

  if (sessionId) {
    const { data: session } = await supabase
      .from('guided_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (session) {
      existingSession = session

      const { data: messages } = await supabase
        .from('guided_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      sessionMessages = messages || []
    }
  }

  // Fetch writer insights for this user
  const { data: writerInsights } = await supabase
    .from('writer_insights')
    .select('*')
    .eq('user_id', user.id)

  // Fetch recent guided sessions for this series
  const { data: recentSessions } = await supabase
    .from('guided_sessions')
    .select('*')
    .eq('series_id', seriesId)
    .eq('user_id', user.id)
    .order('last_active_at', { ascending: false })
    .limit(5)

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
