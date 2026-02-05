'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Role = 'editor' | 'commenter' | 'viewer'

interface Collaborator {
  id: string
  user_id: string
  role: Role
  accepted_at: string | null
  created_at: string
  user_email?: string
  user_name?: string
}

interface Invitation {
  id: string
  email: string
  role: Role
  expires_at: string
  created_at: string
}

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  seriesId: string
  seriesTitle: string
}

const ROLE_LABELS: Record<Role, string> = {
  editor: 'Can Edit',
  commenter: 'Can Comment',
  viewer: 'View Only',
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  editor: 'Full editing access to all content',
  commenter: 'Can view and add feedback comments',
  viewer: 'Read-only access to all content',
}

export default function ShareModal({ isOpen, onClose, seriesId, seriesTitle }: ShareModalProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('viewer')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()

  // Fetch collaborators and invitations
  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch collaborators
        const { data: collabData, error: collabError } = await supabase
          .from('series_collaborators')
          .select('*')
          .eq('series_id', seriesId)
          .order('created_at', { ascending: false })

        if (collabError) throw collabError

        // Fetch user details for collaborators
        const collaboratorsWithUsers: Collaborator[] = []
        for (const collab of collabData || []) {
          // Get user email from auth.users via a function or just display user_id for now
          collaboratorsWithUsers.push({
            ...collab,
            user_email: collab.user_id.substring(0, 8) + '...',
          })
        }

        setCollaborators(collaboratorsWithUsers)

        // Fetch pending invitations
        const { data: inviteData, error: inviteError } = await supabase
          .from('collaboration_invitations')
          .select('*')
          .eq('series_id', seriesId)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })

        if (inviteError) throw inviteError
        setInvitations(inviteData || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, seriesId, supabase])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setInviting(true)
    setError(null)
    setSuccess(null)

    try {
      // Check if already a collaborator or invited
      const existingCollab = collaborators.find(
        c => c.user_email?.toLowerCase() === inviteEmail.toLowerCase()
      )
      if (existingCollab) {
        throw new Error('This user is already a collaborator')
      }

      const existingInvite = invitations.find(
        i => i.email.toLowerCase() === inviteEmail.toLowerCase()
      )
      if (existingInvite) {
        throw new Error('An invitation has already been sent to this email')
      }

      // Create invitation
      const { data, error: insertError } = await supabase
        .from('collaboration_invitations')
        .insert({
          series_id: seriesId,
          email: inviteEmail.toLowerCase().trim(),
          role: inviteRole,
          invited_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      setInvitations(prev => [data, ...prev])
      setInviteEmail('')
      setSuccess(`Invitation sent to ${inviteEmail}`)

      // TODO: Send email notification via API route
    } catch (err: any) {
      setError(err.message)
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    try {
      const { error } = await supabase
        .from('series_collaborators')
        .delete()
        .eq('id', collaboratorId)

      if (error) throw error

      setCollaborators(prev => prev.filter(c => c.id !== collaboratorId))
      setSuccess('Collaborator removed')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('collaboration_invitations')
        .delete()
        .eq('id', invitationId)

      if (error) throw error

      setInvitations(prev => prev.filter(i => i.id !== invitationId))
      setSuccess('Invitation cancelled')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleUpdateRole = async (collaboratorId: string, newRole: Role) => {
    try {
      const { error } = await supabase
        .from('series_collaborators')
        .update({ role: newRole })
        .eq('id', collaboratorId)

      if (error) throw error

      setCollaborators(prev =>
        prev.map(c => (c.id === collaboratorId ? { ...c, role: newRole } : c))
      )
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[10vh] z-50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold">Share "{seriesTitle}"</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Invite collaborators to work on this series
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Status messages */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 text-sm text-green-400">
              {success}
            </div>
          )}

          {/* Invite Form */}
          <form onSubmit={handleInvite} className="space-y-3">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              Invite by email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="artist@example.com"
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Role)}
                className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="viewer">View Only</option>
                <option value="commenter">Can Comment</option>
                <option value="editor">Can Edit</option>
              </select>
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {inviting ? '...' : 'Invite'}
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              They'll receive an email invitation to collaborate on this series.
            </p>
          </form>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                Pending Invitations
              </h3>
              <div className="space-y-2">
                {invitations.map(invite => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between bg-[var(--bg-tertiary)] rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-sm">
                        ✉
                      </div>
                      <div>
                        <div className="text-sm">{invite.email}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {ROLE_LABELS[invite.role]} • Expires{' '}
                          {new Date(invite.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelInvitation(invite.id)}
                      className="text-[var(--text-muted)] hover:text-red-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Collaborators */}
          <div>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Collaborators ({collaborators.length})
            </h3>
            {loading ? (
              <div className="text-center py-4 text-[var(--text-muted)]">Loading...</div>
            ) : collaborators.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <div className="text-3xl mb-2 opacity-50">👥</div>
                <p>No collaborators yet</p>
                <p className="text-sm">Invite someone to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {collaborators.map(collab => (
                  <div
                    key={collab.id}
                    className="flex items-center justify-between bg-[var(--bg-tertiary)] rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center text-[var(--color-primary)] text-sm">
                        {collab.user_email?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="text-sm">{collab.user_email}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {collab.accepted_at
                            ? `Joined ${new Date(collab.accepted_at).toLocaleDateString()}`
                            : 'Pending acceptance'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={collab.role}
                        onChange={e => handleUpdateRole(collab.id, e.target.value as Role)}
                        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-xs"
                      >
                        <option value="viewer">View Only</option>
                        <option value="commenter">Can Comment</option>
                        <option value="editor">Can Edit</option>
                      </select>
                      <button
                        onClick={() => handleRemoveCollaborator(collab.id)}
                        className="text-[var(--text-muted)] hover:text-red-400 text-sm p-1"
                        title="Remove collaborator"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role Descriptions */}
          <div className="border-t border-[var(--border)] pt-4">
            <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wide">
              Permission Levels
            </h4>
            <div className="space-y-1 text-xs text-[var(--text-muted)]">
              {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
                <div key={role} className="flex gap-2">
                  <span className="font-medium text-[var(--text-secondary)]">
                    {ROLE_LABELS[role as Role]}:
                  </span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
