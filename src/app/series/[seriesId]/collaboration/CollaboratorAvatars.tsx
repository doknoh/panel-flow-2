'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Collaborator {
  id: string
  user_id: string
  role: 'editor' | 'commenter' | 'viewer'
  accepted_at: string | null
}

interface CollaboratorAvatarsProps {
  seriesId: string
  maxDisplay?: number
}

export default function CollaboratorAvatars({ seriesId, maxDisplay = 3 }: CollaboratorAvatarsProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchCollaborators = async () => {
      const { data, error } = await supabase
        .from('series_collaborators')
        .select('id, user_id, role, accepted_at')
        .eq('series_id', seriesId)
        .not('accepted_at', 'is', null)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setCollaborators(data)
      }
      setLoading(false)
    }

    fetchCollaborators()
  }, [seriesId, supabase])

  if (loading || collaborators.length === 0) {
    return null
  }

  const displayedCollaborators = collaborators.slice(0, maxDisplay)
  const remainingCount = collaborators.length - maxDisplay

  const roleColors: Record<string, string> = {
    editor: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
    commenter: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
    viewer: 'bg-gray-500/20 border-gray-500/50 text-gray-400',
  }

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {displayedCollaborators.map((collab) => (
          <div
            key={collab.id}
            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-medium ${roleColors[collab.role]}`}
            title={`${collab.role.charAt(0).toUpperCase() + collab.role.slice(1)}`}
          >
            {collab.user_id.substring(0, 2).toUpperCase()}
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="w-7 h-7 rounded-full bg-[var(--bg-tertiary)] border-2 border-[var(--border)] flex items-center justify-center text-xs text-[var(--text-muted)]">
            +{remainingCount}
          </div>
        )}
      </div>
      <span className="ml-2 text-xs text-[var(--text-muted)]">
        {collaborators.length} collaborator{collaborators.length !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
