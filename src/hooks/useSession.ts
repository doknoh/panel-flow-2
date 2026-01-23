'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SessionStats {
  wordsWritten: number
  panelsCreated: number
  pagesCreated: number
}

interface UseSessionOptions {
  seriesId: string
  issueId: string
  userId: string
  onSessionEnd?: (sessionId: string) => void
}

interface LooseEnd {
  type: 'untracked_character' | 'untracked_location' | 'continuity_flag' | 'page_alignment' | 'other'
  description: string
}

export function useSession({ seriesId, issueId, userId, onSessionEnd }: UseSessionOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [stats, setStats] = useState<SessionStats>({
    wordsWritten: 0,
    panelsCreated: 0,
    pagesCreated: 0,
  })
  const [isActive, setIsActive] = useState(false)
  const looseEndsRef = useRef<LooseEnd[]>([])
  const startTimeRef = useRef<Date | null>(null)

  // Start a new session
  const startSession = useCallback(async () => {
    if (sessionId) return // Already have a session

    const supabase = createClient()

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: userId,
        series_id: seriesId,
        issue_id: issueId,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to start session:', error)
      return
    }

    setSessionId(data.id)
    setIsActive(true)
    startTimeRef.current = new Date()
    console.log('Session started:', data.id)
  }, [sessionId, userId, seriesId, issueId])

  // End the current session
  const endSession = useCallback(async (generateSummary = true) => {
    if (!sessionId) return

    const supabase = createClient()

    // Calculate duration
    const endTime = new Date()

    // Prepare update data
    const updateData: Record<string, any> = {
      ended_at: endTime.toISOString(),
      words_written: stats.wordsWritten,
      panels_created: stats.panelsCreated,
      pages_created: stats.pagesCreated,
    }

    // Generate simple progress summary
    const progressParts: string[] = []
    if (stats.wordsWritten > 0) {
      progressParts.push(`Wrote ${stats.wordsWritten.toLocaleString()} words`)
    }
    if (stats.panelsCreated > 0) {
      progressParts.push(`Created ${stats.panelsCreated} panel${stats.panelsCreated !== 1 ? 's' : ''}`)
    }
    if (stats.pagesCreated > 0) {
      progressParts.push(`Added ${stats.pagesCreated} page${stats.pagesCreated !== 1 ? 's' : ''}`)
    }
    if (progressParts.length > 0) {
      updateData.progress = progressParts.join('. ') + '.'
    }

    // Update session
    const { error } = await supabase
      .from('sessions')
      .update(updateData)
      .eq('id', sessionId)

    if (error) {
      console.error('Failed to end session:', error)
      return
    }

    // Add any loose ends
    if (looseEndsRef.current.length > 0) {
      const looseEndInserts = looseEndsRef.current.map((le) => ({
        session_id: sessionId,
        type: le.type,
        description: le.description,
      }))

      await supabase.from('loose_ends').insert(looseEndInserts)
    }

    console.log('Session ended:', sessionId)
    onSessionEnd?.(sessionId)

    // Reset state
    setSessionId(null)
    setIsActive(false)
    setStats({ wordsWritten: 0, panelsCreated: 0, pagesCreated: 0 })
    looseEndsRef.current = []
    startTimeRef.current = null
  }, [sessionId, stats, onSessionEnd])

  // Track activity
  const trackWords = useCallback((count: number) => {
    setStats((prev) => ({ ...prev, wordsWritten: prev.wordsWritten + count }))
  }, [])

  const trackPanel = useCallback(() => {
    setStats((prev) => ({ ...prev, panelsCreated: prev.panelsCreated + 1 }))
  }, [])

  const trackPage = useCallback(() => {
    setStats((prev) => ({ ...prev, pagesCreated: prev.pagesCreated + 1 }))
  }, [])

  // Add loose end
  const addLooseEnd = useCallback((looseEnd: LooseEnd) => {
    looseEndsRef.current.push(looseEnd)
  }, [])

  // Auto-start session on mount
  useEffect(() => {
    startSession()
  }, []) // Intentionally only run once on mount

  // Auto-end session on unmount or page leave
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable session end on page leave
      if (sessionId) {
        const supabase = createClient()
        const endTime = new Date().toISOString()

        // We can't use async in beforeunload, so we'll use sendBeacon
        // This is a best-effort attempt
        navigator.sendBeacon?.(
          `/api/end-session`,
          JSON.stringify({
            sessionId,
            endTime,
            stats,
          })
        )
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // End session on unmount
      endSession(false)
    }
  }, [sessionId, stats])

  return {
    sessionId,
    isActive,
    stats,
    trackWords,
    trackPanel,
    trackPage,
    addLooseEnd,
    endSession,
  }
}
