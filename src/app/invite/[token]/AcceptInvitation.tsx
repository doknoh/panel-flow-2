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
  seriesId,
  role,
  userId,
}: AcceptInvitationProps) {
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAccept = async () => {
    setAccepting(true)
    setError(null)

    try {
      // Create collaborator record
      const { error: collabError } = await supabase
        .from('series_collaborators')
        .insert({
          series_id: seriesId,
          user_id: userId,
          role: role,
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

      // Mark invitation as accepted
      const { error: updateError } = await supabase
        .from('collaboration_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitationId)

      if (updateError) {
        console.error('Error updating invitation:', updateError)
        // Non-fatal - continue anyway
      }

      // Redirect to the series
      router.push(`/series/${seriesId}`)
    } catch (err: any) {
      setError(err.message)
      setAccepting(false)
    }
  }

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={handleAccept}
        disabled={accepting}
        className="w-full bg-[var(--color-primary)] text-white py-3 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {accepting ? 'Accepting...' : 'Accept Invitation'}
      </button>
    </div>
  )
}
