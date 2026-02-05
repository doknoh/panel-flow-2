'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import CommentsPanel from './CommentsPanel'

interface CommentButtonProps {
  entityType: 'page' | 'panel'
  entityId: string
  className?: string
}

export default function CommentButton({ entityType, entityId, className = '' }: CommentButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Fetch initial comment count
  useEffect(() => {
    const fetchCount = async () => {
      const { count, error } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('resolved_at', null)

      if (!error) {
        setCommentCount(count || 0)
      }
      setLoading(false)
    }

    fetchCount()
  }, [entityType, entityId, supabase])

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 text-sm hover:text-[var(--color-primary)] transition-colors ${
          commentCount > 0
            ? 'text-[var(--color-primary)]'
            : 'text-[var(--text-muted)]'
        } ${className}`}
        title={`${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
      >
        <svg
          className="w-4 h-4"
          fill={commentCount > 0 ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {!loading && commentCount > 0 && (
          <span className="text-xs font-medium">{commentCount}</span>
        )}
      </button>

      <CommentsPanel
        entityType={entityType}
        entityId={entityId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCommentCountChange={setCommentCount}
      />
    </>
  )
}
