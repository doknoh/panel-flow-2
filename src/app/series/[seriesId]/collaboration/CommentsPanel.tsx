'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Comment {
  id: string
  entity_type: 'page' | 'panel'
  entity_id: string
  user_id: string
  content: string
  parent_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
  // Joined data
  user_email?: string
  replies?: Comment[]
}

interface CommentsPanelProps {
  entityType: 'page' | 'panel'
  entityId: string
  isOpen: boolean
  onClose: () => void
  onCommentCountChange?: (count: number) => void
}

export default function CommentsPanel({
  entityType,
  entityId,
  isOpen,
  onClose,
  onCommentCountChange,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null)
    })
  }, [supabase])

  // Fetch comments
  useEffect(() => {
    if (!isOpen) return

    const fetchComments = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching comments:', error)
        setLoading(false)
        return
      }

      // Organize into threads (parent comments with replies)
      const parentComments = data?.filter(c => !c.parent_id) || []
      const replies = data?.filter(c => c.parent_id) || []

      const threaded = parentComments.map(parent => ({
        ...parent,
        replies: replies.filter(r => r.parent_id === parent.id),
      }))

      setComments(threaded)
      onCommentCountChange?.(data?.filter(c => !c.resolved_at).length || 0)
      setLoading(false)
    }

    fetchComments()
  }, [isOpen, entityType, entityId, supabase, onCommentCountChange])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || submitting || !currentUserId) return

    setSubmitting(true)

    const { data, error } = await supabase
      .from('comments')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        user_id: currentUserId,
        content: newComment.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating comment:', error)
      setSubmitting(false)
      return
    }

    setComments(prev => [...prev, { ...data, replies: [] }])
    setNewComment('')
    setSubmitting(false)
    onCommentCountChange?.(comments.filter(c => !c.resolved_at).length + 1)
  }

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim() || submitting || !currentUserId) return

    setSubmitting(true)

    const { data, error } = await supabase
      .from('comments')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        user_id: currentUserId,
        content: replyContent.trim(),
        parent_id: parentId,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating reply:', error)
      setSubmitting(false)
      return
    }

    setComments(prev =>
      prev.map(c =>
        c.id === parentId
          ? { ...c, replies: [...(c.replies || []), data] }
          : c
      )
    )
    setReplyingTo(null)
    setReplyContent('')
    setSubmitting(false)
  }

  const handleResolve = async (commentId: string) => {
    const { error } = await supabase
      .from('comments')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: currentUserId,
      })
      .eq('id', commentId)

    if (error) {
      console.error('Error resolving comment:', error)
      return
    }

    setComments(prev =>
      prev.map(c =>
        c.id === commentId
          ? { ...c, resolved_at: new Date().toISOString() }
          : c
      )
    )
    onCommentCountChange?.(comments.filter(c => c.id !== commentId && !c.resolved_at).length)
  }

  const handleUnresolve = async (commentId: string) => {
    const { error } = await supabase
      .from('comments')
      .update({
        resolved_at: null,
        resolved_by: null,
      })
      .eq('id', commentId)

    if (error) {
      console.error('Error unresolving comment:', error)
      return
    }

    setComments(prev =>
      prev.map(c =>
        c.id === commentId ? { ...c, resolved_at: null, resolved_by: null } : c
      )
    )
  }

  const handleDelete = async (commentId: string, parentId?: string | null) => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)

    if (error) {
      console.error('Error deleting comment:', error)
      return
    }

    if (parentId) {
      // It's a reply, remove from parent's replies
      setComments(prev =>
        prev.map(c =>
          c.id === parentId
            ? { ...c, replies: c.replies?.filter(r => r.id !== commentId) }
            : c
        )
      )
    } else {
      // It's a parent comment
      setComments(prev => prev.filter(c => c.id !== commentId))
    }
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  if (!isOpen) return null

  const unresolvedCount = comments.filter(c => !c.resolved_at).length
  const resolvedCount = comments.filter(c => c.resolved_at).length

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col z-40 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div>
          <h3 className="font-semibold">Comments</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {unresolvedCount} open{resolvedCount > 0 && `, ${resolvedCount} resolved`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl"
        >
          ×
        </button>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-8 text-[var(--text-muted)]">Loading...</div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)]">
            <div className="text-3xl mb-2 opacity-50">💬</div>
            <p>No comments yet</p>
            <p className="text-sm">Start a conversation</p>
          </div>
        ) : (
          comments.map(comment => (
            <div
              key={comment.id}
              className={`rounded-lg border ${
                comment.resolved_at
                  ? 'border-green-500/30 bg-green-500/5 opacity-60'
                  : 'border-[var(--border)] bg-[var(--bg-tertiary)]'
              }`}
            >
              {/* Main Comment */}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center text-xs text-[var(--color-primary)]">
                      {comment.user_id.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatDate(comment.created_at)}
                    </span>
                    {comment.resolved_at && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        ✓ Resolved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!comment.resolved_at ? (
                      <button
                        onClick={() => handleResolve(comment.id)}
                        className="text-xs text-[var(--text-muted)] hover:text-green-400"
                        title="Mark as resolved"
                      >
                        ✓
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnresolve(comment.id)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Reopen"
                      >
                        ↩
                      </button>
                    )}
                    {comment.user_id === currentUserId && (
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="text-xs text-[var(--text-muted)] hover:text-red-400"
                        title="Delete"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.content}</p>

                {/* Reply button */}
                {!comment.resolved_at && (
                  <button
                    onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--color-primary)] mt-2"
                  >
                    Reply
                  </button>
                )}
              </div>

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="border-t border-[var(--border)] pl-6 pr-3 py-2 space-y-2">
                  {comment.replies.map(reply => (
                    <div key={reply.id} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-xs text-[var(--color-primary)]">
                          {reply.user_id.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatDate(reply.created_at)}
                        </span>
                        {reply.user_id === currentUserId && (
                          <button
                            onClick={() => handleDelete(reply.id, comment.id)}
                            className="text-xs text-[var(--text-muted)] hover:text-red-400 ml-auto"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <p className="text-[var(--text-secondary)] whitespace-pre-wrap">
                        {reply.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              {replyingTo === comment.id && (
                <div className="border-t border-[var(--border)] p-3">
                  <textarea
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--color-primary)]"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setReplyingTo(null)
                        setReplyContent('')
                      }}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReply(comment.id)}
                      disabled={!replyContent.trim() || submitting}
                      className="bg-[var(--color-primary)] text-white px-3 py-1 rounded text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Comment Input */}
      <div className="border-t border-[var(--border)] p-4">
        <form onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--color-primary)]"
            rows={3}
          />
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Comment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
