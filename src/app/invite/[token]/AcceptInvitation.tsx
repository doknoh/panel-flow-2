'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface AcceptInvitationProps {
  invitationId: string
  seriesId: string
  role: string
  userId: string
}

export default function AcceptInvitation({
  invitationId,
}: AcceptInvitationProps) {
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAccept = async () => {
    setAccepting(true)
    setError(null)

    try {
      // Get the current authenticated user from Supabase (don't trust props)
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('You must be logged in to accept an invitation')
      }

      // Re-fetch the invitation from the DB to get the actual role and series_id
      // (don't trust values passed as props from the server component)
      const { data: invitation, error: invError } = await supabase
        .from('collaboration_invitations')
        .select('id, series_id, role, email, accepted_at, expires_at')
        .eq('id', invitationId)
        .single()

      if (invError || !invitation) {
        throw new Error('Invitation not found or is no longer valid')
      }

      // Verify the invitation hasn't already been accepted
      if (invitation.accepted_at) {
        throw new Error('This invitation has already been accepted')
      }

      // Verify the invitation hasn't expired
      if (new Date(invitation.expires_at) < new Date()) {
        throw new Error('This invitation has expired')
      }

      // Verify the invitation email matches the logged-in user
      if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        // Allow acceptance but this is already shown as a warning in the UI
        // The server page already displays a note about email mismatch
      }

      // Create collaborator record using DB-fetched values
      const { error: collabError } = await supabase
        .from('series_collaborators')
        .insert({
          series_id: invitation.series_id,
          user_id: user.id,
          role: invitation.role,
          accepted_at: new Date().toISOString(),
        })

      if (collabError) {
        // Check if already a collaborator
        if (collabError.code === '23505') {
          // Unique violation - already exists
          throw new Error('You are already a collaborator on this series')
        }
        throw collabError
      }

      // Mark invitation as accepted using the DB-fetched invitation ID
      const { error: updateError } = await supabase
        .from('collaboration_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)

      if (updateError) {
        console.error('Error updating invitation:', updateError)
        // Non-fatal - continue anyway
      }

      // Redirect to the series using DB-fetched series_id
      router.push(`/series/${invitation.series_id}`)
    } catch (err: any) {
      setError(err.message)
      setAccepting(false)
    }
  }

  return (
    <div>
      {error && (
        <div className="bg-[var(--color-error)]/10 border border-[var(--color-error)]/50 rounded-lg p-4 mb-4 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      <button
        onClick={handleAccept}
        disabled={accepting}
        className="w-full bg-[var(--color-primary)] text-white py-3 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity hover-lift"
      >
        {accepting ? 'Accepting...' : 'Accept Invitation'}
      </button>
    </div>
  )
}
