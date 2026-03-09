'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SessionDebriefProps {
  isOpen: boolean
  onClose: () => void
  seriesId: string
  issueId: string
  stats: {
    duration_minutes: number
    words_written: number
    panels_created: number
    pages_touched: number
  }
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours === 0) return `${mins}m`
  return `${hours}h ${mins}m`
}

export default function SessionDebrief({
  isOpen,
  onClose,
  seriesId,
  issueId,
  stats,
}: SessionDebriefProps) {
  const [debriefText, setDebriefText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchDebrief = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDebriefText('')
    setSaved(false)

    try {
      const response = await fetch('/api/ai/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId,
          issueId,
          stats,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate debrief')
      }

      const data = await response.json()
      setDebriefText(data.debrief || data.text || '')
    } catch (err: any) {
      setError(err.message || 'Failed to generate session debrief')
    } finally {
      setLoading(false)
    }
  }, [seriesId, issueId, stats])

  useEffect(() => {
    if (isOpen) {
      fetchDebrief()
    }
  }, [isOpen, fetchDebrief])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        throw new Error('Not authenticated')
      }

      const endedAt = new Date()
      const startedAt = new Date(endedAt.getTime() - stats.duration_minutes * 60 * 1000)

      const { error: insertError } = await supabase.from('sessions').insert({
        user_id: userData.user.id,
        series_id: seriesId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        summary: debriefText,
        stats: {
          words_written: stats.words_written,
          panels_created: stats.panels_created,
          pages_touched: stats.pages_touched,
          time_spent_minutes: stats.duration_minutes,
        },
      })

      if (insertError) throw insertError

      setSaved(true)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err: any) {
      setError(err.message || 'Failed to save session')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] z-50 modal-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-full max-w-xl mx-4 shadow-2xl overflow-hidden modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Session Debrief
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl active:scale-[0.97] transition-all duration-150 ease-out"
          >
            ×
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-px bg-[var(--border)]">
          <div className="bg-[var(--bg-tertiary)] p-3 text-center">
            <div className="text-lg font-semibold text-[var(--text-primary)]">
              {formatDuration(stats.duration_minutes)}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Duration</div>
          </div>
          <div className="bg-[var(--bg-tertiary)] p-3 text-center">
            <div className="text-lg font-semibold text-[var(--text-primary)]">
              {stats.words_written.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Words</div>
          </div>
          <div className="bg-[var(--bg-tertiary)] p-3 text-center">
            <div className="text-lg font-semibold text-[var(--text-primary)]">
              {stats.panels_created}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Panels</div>
          </div>
          <div className="bg-[var(--bg-tertiary)] p-3 text-center">
            <div className="text-lg font-semibold text-[var(--text-primary)]">
              {stats.pages_touched}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Pages</div>
          </div>
        </div>

        {/* Debrief Content */}
        <div className="p-4 min-h-[120px] max-h-[40vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
              <div className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
              Generating debrief...
            </div>
          )}

          {error && (
            <div className="bg-[var(--color-error)]/10 border border-[var(--color-error)]/50 rounded-lg p-3 text-sm text-[var(--color-error)]">
              {error}
            </div>
          )}

          {!loading && !error && debriefText && (
            <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {debriefText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] active:scale-[0.97] transition-all duration-150 ease-out"
          >
            Skip
          </button>

          {saved ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-success)] font-medium px-4 py-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Saved
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || loading || !debriefText}
              className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 active:scale-[0.97] transition-all duration-150 ease-out"
            >
              {saving ? 'Saving...' : 'Save to Sessions'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
