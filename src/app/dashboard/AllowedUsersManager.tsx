'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { Tip } from '@/components/ui/Tip'

interface AllowedUser {
  id: string
  email: string
  name: string | null
  notes: string | null
  created_at: string
}

export default function AllowedUsersManager({ currentUserEmail }: { currentUserEmail: string }) {
  const [users, setUsers] = useState<AllowedUser[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const { showToast } = useToast()

  const supabase = createClient()

  useEffect(() => {
    const fetchUsers = async () => {
      // Check if current user is admin
      const { data: adminCheck } = await supabase
        .from('allowed_users')
        .select('notes')
        .eq('email', currentUserEmail)
        .single()

      if (!adminCheck || adminCheck.notes !== 'Admin') {
        setIsAdmin(false)
        setLoading(false)
        return
      }

      setIsAdmin(true)

      // Fetch all allowed users
      const { data, error } = await supabase
        .from('allowed_users')
        .select('*')
        .order('created_at', { ascending: true })

      if (!error && data) {
        setUsers(data)
      }
      setLoading(false)
    }

    fetchUsers()
  }, [currentUserEmail, supabase])

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return

    setAdding(true)
    try {
      // Check for duplicate
      const existing = users.find(u => u.email.toLowerCase() === newEmail.toLowerCase().trim())
      if (existing) {
        showToast('This email already has access', 'error')
        setAdding(false)
        return
      }

      const { data: currentUser } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('allowed_users')
        .insert({
          email: newEmail.toLowerCase().trim(),
          name: newName.trim() || null,
          added_by: currentUser.user?.id || null,
        })
        .select()
        .single()

      if (error) throw error

      setUsers(prev => [...prev, data])
      setNewEmail('')
      setNewName('')
      setShowAddForm(false)
      showToast(`Access granted to ${newEmail}`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to add user', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveUser = async (userId: string, email: string) => {
    try {
      const { error } = await supabase
        .from('allowed_users')
        .delete()
        .eq('id', userId)

      if (error) throw error

      setUsers(prev => prev.filter(u => u.id !== userId))
      setConfirmRemoveId(null)
      showToast(`Revoked access for ${email}`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to remove user', 'error')
    }
  }

  if (loading || !isAdmin) return null

  return (
    <div className="mt-12 border-t border-[var(--border)] pt-8">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="hover-fade flex items-center gap-3 group"
      >
        <svg
          className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <h2 className="type-title text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
          APP ACCESS
        </h2>
        <span className="type-micro text-[var(--text-muted)]">
          {users.length} {users.length === 1 ? 'USER' : 'USERS'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-3">
          {/* User list */}
          <div className="space-y-1">
            {users.map(user => {
              const isSelf = user.email.toLowerCase() === currentUserEmail.toLowerCase()
              const isConfirming = confirmRemoveId === user.id

              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-2.5 px-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)] shrink-0">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{user.email}</span>
                        {user.notes === 'Admin' && (
                          <span className="type-micro px-1.5 py-0.5 text-[var(--color-primary)] border border-[var(--color-primary)]/30 shrink-0">
                            ADMIN
                          </span>
                        )}
                        {isSelf && (
                          <span className="type-micro text-[var(--text-muted)] shrink-0">YOU</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        {user.name && <span>{user.name}</span>}
                        {user.name && <span>·</span>}
                        <span>Added {new Date(user.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {!isSelf && (
                    <div className="shrink-0 ml-2">
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-error)]">Remove?</span>
                          <button
                            onClick={() => handleRemoveUser(user.id, user.email)}
                            className="hover-fade-danger type-micro px-2 py-1 text-[var(--color-error)] border border-[var(--color-error)]/30 hover:bg-[var(--color-error)]/10 active:scale-[0.97] transition-all duration-150"
                          >
                            YES
                          </button>
                          <button
                            onClick={() => setConfirmRemoveId(null)}
                            className="hover-fade type-micro px-2 py-1 text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all duration-150"
                          >
                            NO
                          </button>
                        </div>
                      ) : (
                        <Tip content="Revoke access">
                          <button
                            onClick={() => setConfirmRemoveId(user.id)}
                            className="hover-fade-danger opacity-0 group-hover:opacity-100 text-[var(--text-muted)] p-1 active:scale-[0.97] transition-all duration-150"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </Tip>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add user form */}
          {showAddForm ? (
            <form onSubmit={handleAddUser} className="flex gap-2 items-end">
              <div className="flex-1 min-w-0">
                <label className="type-micro text-[var(--text-muted)] block mb-1">EMAIL</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  autoFocus
                  required
                />
              </div>
              <div className="w-40">
                <label className="type-micro text-[var(--text-muted)] block mb-1">NAME (OPTIONAL)</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Name"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <button
                type="submit"
                disabled={adding || !newEmail.trim()}
                className="hover-lift type-label px-4 py-2 border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-50 shrink-0"
              >
                {adding ? '...' : 'ADD'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setNewEmail(''); setNewName('') }}
                className="hover-fade type-label px-3 py-2 text-[var(--text-muted)] active:scale-[0.97] transition-all duration-150 ease-out shrink-0"
              >
                CANCEL
              </button>
            </form>
          ) : (
            <Tip content="Add a user to the app access list">
              <button
                onClick={() => setShowAddForm(true)}
                className="hover-lift type-label px-4 py-2 border border-[var(--border)] hover:border-[var(--text-primary)] text-[var(--text-muted)]"
              >
                [+ GRANT ACCESS]
              </button>
            </Tip>
          )}

          <p className="type-micro text-[var(--text-muted)]">
            Only users listed here can sign in to Panel Flow. This is separate from per-series collaboration.
          </p>
        </div>
      )}
    </div>
  )
}
