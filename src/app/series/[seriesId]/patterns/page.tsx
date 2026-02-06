import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PatternsClient from './PatternsClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ seriesId: string }>
}

export default async function PatternsPage({ params }: PageProps) {
  const { seriesId } = await params
  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Fetch series with plotlines
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .select(`
      id,
      title,
      plotlines (
        id,
        name,
        color,
        description
      ),
      characters (
        id,
        name,
        role
      )
    `)
    .eq('id', seriesId)
    .single()

  if (seriesError || !series) {
    console.error('Error fetching series:', seriesError)
    redirect('/dashboard')
  }

  // Fetch plotline assignments
  const { data: plotlineAssignments } = await supabase
    .from('plotline_issue_assignments')
    .select(`
      id,
      plotline_id,
      issue_id,
      first_appearance,
      climax_issue,
      resolution_issue,
      notes,
      issue:issue_id (
        id,
        number
      )
    `)
    .in('plotline_id', (series.plotlines || []).map((p: any) => p.id))

  // Fetch all issues with their full content for character tracking
  const { data: issues } = await supabase
    .from('issues')
    .select(`
      id,
      number,
      title,
      acts (
        id,
        scenes (
          id,
          pages (
            id,
            page_number,
            panels (
              id,
              visual_description,
              dialogue_blocks (
                id,
                text,
                character_id
              )
            )
          )
        )
      )
    `)
    .eq('series_id', seriesId)
    .order('number')

  // Build plotline data with assignments
  const plotlinesWithAssignments = (series.plotlines || []).map((plotline: any) => ({
    ...plotline,
    plotline_issue_assignments: (plotlineAssignments || [])
      .filter((a: any) => a.plotline_id === plotline.id)
      .map((a: any) => ({
        issue_id: a.issue_id,
        issue_number: a.issue?.number || 0,
        first_appearance: a.first_appearance || false,
        climax_issue: a.climax_issue || false,
        resolution_issue: a.resolution_issue || false,
        notes: a.notes,
      })),
  }))

  // Build series data structure for analysis
  const seriesData = {
    id: series.id,
    title: series.title,
    plotlines: plotlinesWithAssignments,
    characters: series.characters || [],
    issues: (issues || []).map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      acts: issue.acts || [],
    })),
  }

  return (
    <PatternsClient
      seriesId={seriesId}
      seriesTitle={series.title}
      seriesData={seriesData}
    />
  )
}
