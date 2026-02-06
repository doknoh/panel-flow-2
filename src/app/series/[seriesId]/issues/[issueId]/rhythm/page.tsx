import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RhythmClient from './RhythmClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ seriesId: string; issueId: string }>
}

export default async function RhythmPage({ params }: PageProps) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Fetch issue with full hierarchy
  const { data: issue, error } = await supabase
    .from('issues')
    .select(`
      id,
      number,
      title,
      series:series_id (
        id,
        title
      ),
      acts (
        id,
        name,
        sort_order,
        scenes (
          id,
          name,
          title,
          sort_order,
          pages (
            id,
            page_number,
            page_type,
            panels (
              id,
              visual_description,
              dialogue_blocks (
                id,
                text
              ),
              captions (
                id,
                text
              )
            )
          )
        )
      )
    `)
    .eq('id', issueId)
    .single()

  if (error || !issue) {
    console.error('Error fetching issue:', error)
    redirect(`/series/${seriesId}`)
  }

  // Sort acts and their children
  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
  for (const act of sortedActs) {
    act.scenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    for (const scene of act.scenes) {
      scene.pages = [...(scene.pages || [])].sort((a: any, b: any) => a.page_number - b.page_number)
    }
  }

  return (
    <RhythmClient
      seriesId={seriesId}
      seriesTitle={(issue.series as any)?.title || 'Series'}
      issueId={issueId}
      issueNumber={issue.number}
      issueTitle={issue.title}
      acts={sortedActs}
    />
  )
}
