'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  differenceInDays,
  differenceInMinutes,
  format,
  addDays,
  isPast,
  isAfter,
  parseISO
} from 'date-fns'
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Target,
  X
} from 'lucide-react'

interface Session {
  id: string
  started_at: string
  ended_at: string | null
  words_written: number
  panels_created: number
  pages_created: number
}

interface Issue {
  id: string
  number: number
  title: string
  status: string
  deadline: string | null
  target_page_count: number | null
  production_status: string | null
  acts: Array<{
    id: string
    scenes: Array<{
      id: string
      pages: Array<{ id: string }>
    }>
  }>
}

interface Velocity {
  wordsPerHour: number
  pagesPerDay: number
  activeDays: number
  totalSessionHours: number
}

interface DeadlineDashboardProps {
  seriesId: string
  issues: Issue[]
  sessions: Session[]
}

// Count total pages in an issue
function countPages(issue: Issue): number {
  return (issue.acts || []).reduce((total, act) =>
    total + (act.scenes || []).reduce((sceneTotal, scene) =>
      sceneTotal + (scene.pages || []).length, 0
    ), 0
  )
}

// Project completion date based on velocity
function projectCompletion(issue: Issue, velocity: Velocity): Date | null {
  if (!velocity.pagesPerDay || velocity.pagesPerDay === 0) return null

  const currentPages = countPages(issue)
  const targetPages = issue.target_page_count || 22
  const remainingPages = Math.max(0, targetPages - currentPages)

  if (remainingPages === 0) return new Date()

  const daysNeeded = remainingPages / velocity.pagesPerDay
  return addDays(new Date(), Math.ceil(daysNeeded))
}

// Get deadline status
function getDeadlineStatus(issue: Issue, velocity: Velocity): 'complete' | 'on_track' | 'at_risk' | 'overdue' | 'no_deadline' {
  if (issue.status === 'complete') return 'complete'
  if (!issue.deadline) return 'no_deadline'

  const deadline = parseISO(issue.deadline)
  const projected = projectCompletion(issue, velocity)

  if (isPast(deadline)) return 'overdue'
  if (projected && isAfter(projected, deadline)) return 'at_risk'
  return 'on_track'
}

const statusConfig = {
  complete: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle, label: 'Complete' },
  on_track: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: CheckCircle, label: 'On Track' },
  at_risk: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: AlertTriangle, label: 'At Risk' },
  overdue: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertTriangle, label: 'Overdue' },
  no_deadline: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: Clock, label: 'No Deadline' },
}

export default function DeadlineDashboard({ seriesId, issues, sessions }: DeadlineDashboardProps) {
  const router = useRouter()
  const supabase = createClient()
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null)
  const [saving, setSaving] = useState(false)

  // Calculate velocity from recent sessions
  const velocity = useMemo<Velocity>(() => {
    const fourteenDaysAgo = addDays(new Date(), -14)

    const recentSessions = sessions.filter(s =>
      s.ended_at && new Date(s.ended_at) >= fourteenDaysAgo
    )

    const totalMinutes = recentSessions.reduce((sum, s) =>
      sum + differenceInMinutes(new Date(s.ended_at!), new Date(s.started_at)), 0
    )
    const totalWords = recentSessions.reduce((sum, s) => sum + (s.words_written || 0), 0)
    const totalPages = recentSessions.reduce((sum, s) => sum + (s.pages_created || 0), 0)

    const uniqueDays = new Set(recentSessions.map(s =>
      format(new Date(s.started_at), 'yyyy-MM-dd')
    )).size

    return {
      wordsPerHour: totalMinutes > 0 ? (totalWords / totalMinutes) * 60 : 0,
      pagesPerDay: uniqueDays > 0 ? totalPages / uniqueDays : 0,
      activeDays: uniqueDays,
      totalSessionHours: totalMinutes / 60,
    }
  }, [sessions])

  // Sort issues by number
  const sortedIssues = useMemo(() =>
    [...issues].sort((a, b) => a.number - b.number),
    [issues]
  )

  // Find at-risk issues
  const atRiskIssues = useMemo(() =>
    sortedIssues.filter(issue => {
      const status = getDeadlineStatus(issue, velocity)
      return status === 'at_risk' || status === 'overdue'
    }),
    [sortedIssues, velocity]
  )

  // Find next deadline
  const nextDeadline = useMemo(() => {
    const upcoming = sortedIssues
      .filter(i => i.deadline && !isPast(parseISO(i.deadline)) && i.status !== 'complete')
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    return upcoming[0] || null
  }, [sortedIssues])

  // Overall progress
  const overallProgress = useMemo(() => {
    const completed = sortedIssues.filter(i => i.status === 'complete').length
    return { completed, total: sortedIssues.length }
  }, [sortedIssues])

  // Save deadline
  const handleSaveDeadline = async (deadline: string | null, targetPages: number | null) => {
    if (!editingIssue) return

    setSaving(true)
    try {
      await supabase
        .from('issues')
        .update({
          deadline,
          target_page_count: targetPages
        })
        .eq('id', editingIssue.id)

      router.refresh()
      setEditingIssue(null)
    } catch (error) {
      console.error('Failed to save deadline:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Velocity Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Your Pace */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-3">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-medium">Your Pace</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold">
              {velocity.pagesPerDay > 0 ? velocity.pagesPerDay.toFixed(1) : '—'} <span className="text-sm font-normal text-[var(--text-secondary)]">pages/day</span>
            </div>
            <div className="text-lg text-[var(--text-secondary)]">
              {velocity.wordsPerHour > 0 ? Math.round(velocity.wordsPerHour) : '—'} <span className="text-sm">words/hour</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-[var(--text-muted)]">
            Based on {velocity.activeDays} active days (last 2 weeks)
          </div>
        </div>

        {/* Next Deadline */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-3">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">Next Deadline</span>
          </div>
          {nextDeadline ? (
            <>
              <div className="text-2xl font-bold">Issue #{nextDeadline.number}</div>
              <div className="text-lg text-[var(--text-secondary)]">
                {format(parseISO(nextDeadline.deadline!), 'MMM d, yyyy')}
              </div>
              <div className="mt-3 text-xs text-[var(--text-muted)]">
                {differenceInDays(parseISO(nextDeadline.deadline!), new Date())} days remaining
              </div>
            </>
          ) : (
            <div className="text-[var(--text-muted)]">No upcoming deadlines</div>
          )}
        </div>

        {/* Overall Progress */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-3">
            <Target className="w-4 h-4" />
            <span className="text-sm font-medium">Overall Progress</span>
          </div>
          <div className="text-2xl font-bold">
            {overallProgress.completed}/{overallProgress.total} <span className="text-sm font-normal text-[var(--text-secondary)]">issues</span>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${overallProgress.total > 0 ? (overallProgress.completed / overallProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* At-Risk Alerts */}
      {atRiskIssues.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-yellow-400 mb-3">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">At-Risk Deadlines</span>
          </div>
          <div className="space-y-2">
            {atRiskIssues.map(issue => {
              const projected = projectCompletion(issue, velocity)
              const deadline = parseISO(issue.deadline!)
              const daysLate = projected ? differenceInDays(projected, deadline) : 0
              const currentPages = countPages(issue)
              const targetPages = issue.target_page_count || 22
              const remainingPages = targetPages - currentPages
              const daysUntilDeadline = differenceInDays(deadline, new Date())
              const requiredPace = daysUntilDeadline > 0 ? remainingPages / daysUntilDeadline : remainingPages

              return (
                <div key={issue.id} className="text-sm">
                  <span className="font-medium">Issue #{issue.number}</span>
                  {' '}projected {projected ? format(projected, 'MMM d') : 'unknown'}
                  {daysLate > 0 && <span className="text-yellow-400"> ({daysLate} days late)</span>}
                  <div className="text-[var(--text-muted)] text-xs mt-1">
                    Need {requiredPace.toFixed(1)} pages/day (vs current {velocity.pagesPerDay.toFixed(1)}) to meet deadline
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Issue Timeline */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Issue Timeline</h2>
        <div className="space-y-3">
          {sortedIssues.map(issue => {
            const status = getDeadlineStatus(issue, velocity)
            const config = statusConfig[status]
            const StatusIcon = config.icon
            const currentPages = countPages(issue)
            const targetPages = issue.target_page_count || 22
            const progress = Math.min(100, (currentPages / targetPages) * 100)
            const projected = projectCompletion(issue, velocity)

            return (
              <div
                key={issue.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                onClick={() => setEditingIssue(issue)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">#{issue.number}</span>
                    <span className="text-[var(--text-secondary)]">{issue.title}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${config.bg} ${config.text}`}>
                    <StatusIcon className="w-3 h-3" />
                    {config.label}
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-2">
                  <div className="flex-1">
                    <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${status === 'complete' ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)] w-24 text-right">
                    {currentPages}/{targetPages} pages
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <div>
                    {issue.deadline ? (
                      <>Due: {format(parseISO(issue.deadline), 'MMM d, yyyy')}</>
                    ) : (
                      <span className="italic">Click to set deadline</span>
                    )}
                  </div>
                  {projected && status !== 'complete' && status !== 'no_deadline' && (
                    <div>
                      Projected: {format(projected, 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Deadline Editor Modal */}
      {editingIssue && (
        <DeadlineEditor
          issue={editingIssue}
          onSave={handleSaveDeadline}
          onClose={() => setEditingIssue(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

// Deadline Editor Modal Component
function DeadlineEditor({
  issue,
  onSave,
  onClose,
  saving
}: {
  issue: Issue
  onSave: (deadline: string | null, targetPages: number | null) => void
  onClose: () => void
  saving: boolean
}) {
  const [deadline, setDeadline] = useState(issue.deadline || '')
  const [targetPages, setTargetPages] = useState(issue.target_page_count?.toString() || '22')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Edit Deadline — Issue #{issue.number}</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Deadline Date
            </label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Target Page Count
            </label>
            <input
              type="number"
              value={targetPages}
              onChange={e => setTargetPages(e.target.value)}
              min="1"
              max="100"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
            />
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Standard comic issue is 22 pages
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(
              deadline || null,
              targetPages ? parseInt(targetPages) : null
            )}
            disabled={saving}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
