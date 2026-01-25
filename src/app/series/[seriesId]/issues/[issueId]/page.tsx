import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import IssueEditor from './IssueEditor'

export default async function IssuePage({
  params
}: {
  params: Promise<{ seriesId: string; issueId: string }>
}) {
  const { seriesId, issueId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch issue with all nested data
  const { data: issue, error } = await supabase
    .from('issues')
    .select(`
      *,
      series:series_id (
        id,
        title,
        characters (*),
        locations (*)
      ),
      acts (
        *,
        scenes (
          *,
          pages (
            *,
            panels (
              *,
              dialogue_blocks (*),
              captions (*),
              sound_effects (*)
            )
          )
        )
      )
    `)
    .eq('id', issueId)
    .single()

  if (error) {
    console.error('Issue fetch error:', error)
    notFound()
  }

  if (!issue) {
    console.error('Issue not found for id:', issueId)
    notFound()
  }

  return <IssueEditor issue={issue} seriesId={seriesId} />
}
