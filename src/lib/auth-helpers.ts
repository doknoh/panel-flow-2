import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Verify that a user owns (or is a collaborator on) the given series.
 * Returns true if allowed, false if denied.
 */
export async function userCanAccessSeries(
  supabase: SupabaseClient,
  userId: string,
  seriesId: string
): Promise<boolean> {
  // Check ownership
  const { data: series } = await supabase
    .from('series')
    .select('user_id')
    .eq('id', seriesId)
    .single()

  if (!series) return false
  if (series.user_id === userId) return true

  // Check collaboration
  const { data: collab } = await supabase
    .from('series_collaborators')
    .select('id')
    .eq('series_id', seriesId)
    .eq('user_id', userId)
    .single()

  return !!collab
}
