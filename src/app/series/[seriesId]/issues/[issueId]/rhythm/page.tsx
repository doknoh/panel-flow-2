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

  // Fetch issue basic info first (lighter query)
  const { data: issueData, error: issueError } = await supabase
    .from('issues')
    .select(`
      id,
      number,
      title,
      series:series_id (
        id,
        title
      )
    `)
    .eq('id', issueId)
    .single()

  if (issueError || !issueData) {
    console.error('Error fetching issue:', issueError)
    redirect(`/series/${seriesId}`)
  }

  // Fetch acts/scenes/pages structure separately (avoids timeout on large issues)
  const { data: actsData, error: actsError } = await supabase
    .from('acts')
    .select(`
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
    `)
    .eq('issue_id', issueId)
    .order('sort_order', { ascending: true })

  if (actsError) {
    console.error('Acts fetch error:', actsError)
    // Don't redirect, just provide empty acts - the page can handle this
  }

  // Combine the data
  const issue = {
    ...issueData,
    acts: actsData || []
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
