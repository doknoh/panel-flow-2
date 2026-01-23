'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'

interface LooseEnd {
  id: string
  type: string
  description: string
  resolved: boolean
  resolved_at: string | null
}

interface Issue {
  id: string
  number: number
  title: string | null
}

interface Session {
  id: string
  series_id: string
  issue_id: string | null
  issue: Issue | null
  started_at: string
  ended_at: string | null
  summary: string | null
  progress: string | null
  todo: string | null
  words_written: number
  panels_created: number
  pages_created: number
  loose_ends: LooseEnd[]
}

interface SessionListProps {
  sessions: Session[]
  seriesId: string
}

export default function SessionList({ sessions: initialSessions, seriesId }: SessionListProps) {
  const [sessions, setSessions] = useState(initialSessions)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const { showToast } = useToast()

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    const start = new Date(startedAt)
    const end = endedAt ? new Date(endedAt) : new Date()
    const diffMs = end.getTime() - start.getTime()
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < 60) {
      return `${diffMins}m`
    }
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return `${hours}h ${mins}m`
  }

  const resolveLooseEnd = async (looseEndId: string, sessionId: string) => {
    const supabase = createClient()

    const { error } = await supabase
      .from('loose_ends')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', looseEndId)

    if (error) {
      showToast('Failed to resolve loose end', 'error')
      return
    }

    // Update local state
    setSessions(prev =>
      prev.map(session => {
        if (session.id === sessionId) {
          return {
            ...session,
            loose_ends: session.loose_ends.map(le =>
              le.id === looseEndId
                ? { ...le, resolved: true, resolved_at: new Date().toISOString() }
                : le
            ),
          }
        }
        return session
      })
    )

    showToast('Loose end resolved', 'success')
  }

  const looseEndTypeLabels: Record<string, string> = {
    untracked_character: 'New Character',
    untracked_location: 'New Location',
    continuity_flag: 'Continuity',
    page_alignment: 'Page Alignment',
    other: 'Other',
  }

  const looseEndTypeColors: Record<string, string> = {
    untracked_character: 'bg-blue-900/50 text-blue-300 border-blue-800',
    untracked_location: 'bg-purple-900/50 text-purple-300 border-purple-800',
    continuity_flag: 'bg-amber-900/50 text-amber-300 border-amber-800',
    page_alignment: 'bg-orange-900/50 text-orange-300 border-orange-800',
    other: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
        <p className="text-zinc-400 mb-2">No sessions recorded yet</p>
        <p className="text-zinc-500 text-sm">
          Sessions are automatically tracked when you write in the Issue Editor
        </p>
      </div>
    )
  }

  // Count unresolved loose ends across all sessions
  const unresolvedCount = sessions.reduce(
    (sum, session) => sum + session.loose_ends.filter(le => !le.resolved).length,
    0
  )

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-2xl font-bold">{sessions.length}</div>
          <div className="text-zinc-500 text-sm">Total Sessions</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {sessions.reduce((sum, s) => sum + s.words_written, 0).toLocaleString()}
          </div>
          <div className="text-zinc-500 text-sm">Words Written</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {sessions.reduce((sum, s) => sum + s.panels_created, 0)}
          </div>
          <div className="text-zinc-500 text-sm">Panels Created</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-400">{unresolvedCount}</div>
          <div className="text-zinc-500 text-sm">Unresolved Loose Ends</div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.map((session) => {
          const isExpanded = expandedSession === session.id
          const unresolvedLooseEnds = session.loose_ends.filter(le => !le.resolved)
          const resolvedLooseEnds = session.loose_ends.filter(le => le.resolved)

          return (
            <div
              key={session.id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              {/* Session Header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                onClick={() => setExpandedSession(isExpanded ? null : session.id)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-zinc-500">{isExpanded ? '▼' : '▶'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {format(new Date(session.started_at), 'MMM d, yyyy')}
                      </span>
                      <span className="text-zinc-500 text-sm">
                        {format(new Date(session.started_at), 'h:mm a')}
                      </span>
                      {session.issue && (
                        <span className="text-zinc-400 text-sm">
                          • Issue #{session.issue.number}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <span className="text-zinc-400">
                    {formatDuration(session.started_at, session.ended_at)}
                  </span>
                  {session.words_written > 0 && (
                    <span className="text-zinc-500">
                      {session.words_written.toLocaleString()} words
                    </span>
                  )}
                  {unresolvedLooseEnds.length > 0 && (
                    <span className="bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded text-xs">
                      {unresolvedLooseEnds.length} loose end{unresolvedLooseEnds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Session Details */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-zinc-800 space-y-4">
                  {/* Stats */}
                  <div className="flex gap-6 pt-3 text-sm">
                    <div>
                      <span className="text-zinc-500">Words:</span>{' '}
                      <span className="font-medium">{session.words_written.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Panels:</span>{' '}
                      <span className="font-medium">{session.panels_created}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Pages:</span>{' '}
                      <span className="font-medium">{session.pages_created}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Duration:</span>{' '}
                      <span className="font-medium">
                        {formatDuration(session.started_at, session.ended_at)}
                      </span>
                    </div>
                  </div>

                  {/* Progress */}
                  {session.progress && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-400 mb-1">Progress</h4>
                      <p className="text-sm text-zinc-300">{session.progress}</p>
                    </div>
                  )}

                  {/* Summary */}
                  {session.summary && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-400 mb-1">Summary</h4>
                      <p className="text-sm text-zinc-300">{session.summary}</p>
                    </div>
                  )}

                  {/* To-Do */}
                  {session.todo && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-400 mb-1">To-Do</h4>
                      <p className="text-sm text-zinc-300">{session.todo}</p>
                    </div>
                  )}

                  {/* Loose Ends */}
                  {session.loose_ends.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-zinc-400 mb-2">Loose Ends</h4>
                      <div className="space-y-2">
                        {unresolvedLooseEnds.map((looseEnd) => (
                          <div
                            key={looseEnd.id}
                            className={`flex items-center justify-between p-2 rounded border ${looseEndTypeColors[looseEnd.type]}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">
                                {looseEndTypeLabels[looseEnd.type]}
                              </span>
                              <span className="text-sm">{looseEnd.description}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                resolveLooseEnd(looseEnd.id, session.id)
                              }}
                              className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                            >
                              Resolve
                            </button>
                          </div>
                        ))}
                        {resolvedLooseEnds.length > 0 && (
                          <div className="pt-2 border-t border-zinc-800">
                            <p className="text-xs text-zinc-500 mb-2">
                              {resolvedLooseEnds.length} resolved
                            </p>
                            {resolvedLooseEnds.map((looseEnd) => (
                              <div
                                key={looseEnd.id}
                                className="flex items-center gap-2 text-sm text-zinc-500 line-through"
                              >
                                <span>✓</span>
                                <span>{looseEnd.description}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Link to issue */}
                  {session.issue && (
                    <div className="pt-2">
                      <Link
                        href={`/series/${seriesId}/issues/${session.issue.id}`}
                        className="text-sm text-blue-400 hover:text-blue-300"
                      >
                        Go to Issue #{session.issue.number} →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
