'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'

interface PlotlineAssignment {
  issue_id: string
  first_appearance: boolean
  climax_issue: boolean
  resolution_issue: boolean
  notes: string | null
}

interface Plotline {
  id: string
  name: string
  color: string
  plotline_issue_assignments?: PlotlineAssignment[]
}

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  status: string
  series_act: 'BEGINNING' | 'MIDDLE' | 'END' | null
  themes: string | null
}

interface Series {
  id: string
  title: string
  plotlines: Plotline[]
  issues: Issue[]
}

interface SeriesTimelineProps {
  series: Series
  onRefresh?: () => void
}

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  outline: { bg: 'bg-slate-800', border: 'border-slate-600', text: 'text-slate-300' },
  drafting: { bg: 'bg-blue-900/50', border: 'border-blue-500', text: 'text-blue-300' },
  revision: { bg: 'bg-amber-900/50', border: 'border-amber-500', text: 'text-amber-300' },
  complete: { bg: 'bg-green-900/50', border: 'border-green-500', text: 'text-green-300' },
}

const actLabels: Record<string, { label: string; color: string }> = {
  BEGINNING: { label: 'Act 1: Beginning', color: 'text-blue-400' },
  MIDDLE: { label: 'Act 2: Middle', color: 'text-purple-400' },
  END: { label: 'Act 3: End', color: 'text-red-400' },
}

export default function SeriesTimeline({ series, onRefresh }: SeriesTimelineProps) {
  const [selectedPlotline, setSelectedPlotline] = useState<string | null>(null)
  const [editingAssignment, setEditingAssignment] = useState<{
    plotlineId: string
    issueId: string
  } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { showToast } = useToast()

  // Group issues by series_act
  const groupedIssues = useMemo(() => {
    const beginning = series.issues.filter(i => i.series_act === 'BEGINNING')
    const middle = series.issues.filter(i => i.series_act === 'MIDDLE')
    const end = series.issues.filter(i => i.series_act === 'END')
    const unassigned = series.issues.filter(i => !i.series_act)
    return { beginning, middle, end, unassigned }
  }, [series.issues])

  // Build a map of plotline -> issue assignments
  const plotlineIssueMap = useMemo(() => {
    const map = new Map<string, Map<string, PlotlineAssignment>>()
    for (const plotline of series.plotlines) {
      const issueMap = new Map<string, PlotlineAssignment>()
      for (const assignment of (plotline.plotline_issue_assignments || [])) {
        issueMap.set(assignment.issue_id, assignment)
      }
      map.set(plotline.id, issueMap)
    }
    return map
  }, [series.plotlines])

  // Check if a plotline appears in an issue
  const plotlineAppearsInIssue = (plotlineId: string, issueId: string): PlotlineAssignment | null => {
    return plotlineIssueMap.get(plotlineId)?.get(issueId) || null
  }

  // Toggle plotline assignment for an issue
  const togglePlotlineAssignment = async (plotlineId: string, issueId: string) => {
    setIsSaving(true)
    const supabase = createClient()
    const existing = plotlineAppearsInIssue(plotlineId, issueId)

    if (existing) {
      // Remove assignment
      const { error } = await supabase
        .from('plotline_issue_assignments')
        .delete()
        .eq('plotline_id', plotlineId)
        .eq('issue_id', issueId)

      if (error) {
        showToast('Failed to remove plotline', 'error')
      } else {
        showToast('Plotline removed from issue', 'success')
        onRefresh?.()
      }
    } else {
      // Add assignment
      const { error } = await supabase
        .from('plotline_issue_assignments')
        .insert({
          plotline_id: plotlineId,
          issue_id: issueId,
          first_appearance: false,
          climax_issue: false,
          resolution_issue: false,
        })

      if (error) {
        showToast('Failed to add plotline', 'error')
      } else {
        showToast('Plotline added to issue', 'success')
        onRefresh?.()
      }
    }
    setIsSaving(false)
  }

  // Update assignment markers
  const updateAssignmentMarker = async (
    plotlineId: string,
    issueId: string,
    marker: 'first_appearance' | 'climax_issue' | 'resolution_issue',
    value: boolean
  ) => {
    setIsSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('plotline_issue_assignments')
      .update({ [marker]: value })
      .eq('plotline_id', plotlineId)
      .eq('issue_id', issueId)

    if (error) {
      showToast('Failed to update marker', 'error')
    } else {
      onRefresh?.()
    }
    setIsSaving(false)
  }

  // Render an issue card
  const renderIssueCard = (issue: Issue) => {
    const colors = statusColors[issue.status] || statusColors.outline

    return (
      <div
        key={issue.id}
        className={`relative ${colors.bg} border-2 ${colors.border} rounded-lg p-3 min-w-[160px] max-w-[200px] transition-all hover:scale-105`}
      >
        {/* Issue number and status */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold">#{issue.number}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.text} bg-black/20`}>
            {issue.status}
          </span>
        </div>

        {/* Title */}
        {issue.title && (
          <h4 className="font-medium text-sm line-clamp-1 mb-1">{issue.title}</h4>
        )}

        {/* Summary preview */}
        {issue.summary && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-2">
            {issue.summary}
          </p>
        )}

        {/* Plotline dots */}
        <div className="flex flex-wrap gap-1 mt-2">
          {series.plotlines.map(plotline => {
            const assignment = plotlineAppearsInIssue(plotline.id, issue.id)
            if (!assignment && selectedPlotline !== plotline.id) return null

            return (
              <button
                key={plotline.id}
                onClick={() => {
                  if (selectedPlotline === plotline.id) {
                    togglePlotlineAssignment(plotline.id, issue.id)
                  } else {
                    setEditingAssignment({ plotlineId: plotline.id, issueId: issue.id })
                  }
                }}
                disabled={isSaving}
                className={`w-4 h-4 rounded-full transition-all flex items-center justify-center text-[8px] font-bold ${
                  assignment
                    ? 'ring-2 ring-white/50'
                    : 'opacity-30 ring-1 ring-white/20'
                }`}
                style={{ backgroundColor: plotline.color }}
                title={`${plotline.name}${assignment?.first_appearance ? ' (First)' : ''}${assignment?.climax_issue ? ' (Climax)' : ''}${assignment?.resolution_issue ? ' (Resolution)' : ''}`}
              >
                {assignment?.first_appearance && '1'}
                {assignment?.climax_issue && '!'}
                {assignment?.resolution_issue && '✓'}
              </button>
            )
          })}
        </div>

        {/* Link to issue */}
        <Link
          href={`/series/${series.id}/issues/${issue.id}`}
          className="absolute inset-0 rounded-lg"
          title={`Edit Issue #${issue.number}`}
        />
      </div>
    )
  }

  // Render a section of issues
  const renderIssueSection = (issues: Issue[], label: string, colorClass: string) => {
    if (issues.length === 0) return null

    return (
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium mb-3 ${colorClass}`}>{label}</div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {issues
            .sort((a, b) => a.number - b.number)
            .map(issue => renderIssueCard(issue))}
        </div>
      </div>
    )
  }

  // Render plotline ribbon
  const renderPlotlineRibbons = () => {
    if (!selectedPlotline) return null

    const plotline = series.plotlines.find(p => p.id === selectedPlotline)
    if (!plotline) return null

    // Get all issues where this plotline appears, sorted by issue number
    const appearances = series.issues
      .filter(issue => plotlineAppearsInIssue(plotline.id, issue.id))
      .sort((a, b) => a.number - b.number)

    if (appearances.length < 2) return null

    return (
      <div className="relative h-8 mb-4">
        <div
          className="absolute h-2 rounded-full"
          style={{
            backgroundColor: plotline.color + '60',
            left: '10%',
            right: '10%',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-[10%]">
          {appearances.map((issue, idx) => {
            const assignment = plotlineAppearsInIssue(plotline.id, issue.id)
            return (
              <div
                key={issue.id}
                className="flex flex-col items-center"
                style={{ flex: idx === 0 || idx === appearances.length - 1 ? '0 0 auto' : 1 }}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 border-white"
                  style={{ backgroundColor: plotline.color }}
                />
                <span className="text-[10px] text-[var(--text-secondary)] mt-1">
                  #{issue.number}
                  {assignment?.first_appearance && ' (Start)'}
                  {assignment?.climax_issue && ' (Climax)'}
                  {assignment?.resolution_issue && ' (End)'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Plotline Legend / Selector */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-[var(--text-secondary)]">Filter by plotline:</span>
          <button
            onClick={() => setSelectedPlotline(null)}
            className={`px-3 py-1 rounded-full text-sm transition-all ${
              selectedPlotline === null
                ? 'bg-white/20 ring-2 ring-white/50'
                : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80'
            }`}
          >
            All
          </button>
          {series.plotlines.map(plotline => (
            <button
              key={plotline.id}
              onClick={() => setSelectedPlotline(
                selectedPlotline === plotline.id ? null : plotline.id
              )}
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm transition-all ${
                selectedPlotline === plotline.id
                  ? 'ring-2 ring-white/50'
                  : 'hover:ring-1 hover:ring-white/20'
              }`}
              style={{
                backgroundColor: plotline.color + '40',
              }}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: plotline.color }}
              />
              {plotline.name}
            </button>
          ))}
        </div>
        {selectedPlotline && (
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Click on issue plotline dots to add/remove this plotline
          </p>
        )}
      </div>

      {/* Plotline ribbon visualization */}
      {renderPlotlineRibbons()}

      {/* Timeline sections */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6">
        <div className="flex gap-8">
          {renderIssueSection(groupedIssues.beginning, actLabels.BEGINNING.label, actLabels.BEGINNING.color)}
          {groupedIssues.beginning.length > 0 && groupedIssues.middle.length > 0 && (
            <div className="w-px bg-[var(--border)] self-stretch" />
          )}
          {renderIssueSection(groupedIssues.middle, actLabels.MIDDLE.label, actLabels.MIDDLE.color)}
          {groupedIssues.middle.length > 0 && groupedIssues.end.length > 0 && (
            <div className="w-px bg-[var(--border)] self-stretch" />
          )}
          {renderIssueSection(groupedIssues.end, actLabels.END.label, actLabels.END.color)}
        </div>

        {/* Unassigned issues */}
        {groupedIssues.unassigned.length > 0 && (
          <div className="mt-6 pt-6 border-t border-[var(--border)]">
            <div className="text-sm text-[var(--text-muted)] mb-3">
              Unassigned to series arc ({groupedIssues.unassigned.length} issues)
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {groupedIssues.unassigned
                .sort((a, b) => a.number - b.number)
                .map(issue => renderIssueCard(issue))}
            </div>
          </div>
        )}

        {series.issues.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[var(--text-muted)]">No issues yet</p>
            <Link
              href={`/series/${series.id}`}
              className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
            >
              Create your first issue
            </Link>
          </div>
        )}
      </div>

      {/* Assignment Editor Modal */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 max-w-sm w-full">
            <h3 className="font-bold mb-4">
              Edit Plotline Assignment
            </h3>
            {(() => {
              const plotline = series.plotlines.find(p => p.id === editingAssignment.plotlineId)
              const issue = series.issues.find(i => i.id === editingAssignment.issueId)
              const assignment = plotlineAppearsInIssue(editingAssignment.plotlineId, editingAssignment.issueId)

              if (!plotline || !issue) return null

              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: plotline.color }}
                    />
                    <span className="font-medium">{plotline.name}</span>
                    <span className="text-[var(--text-secondary)]">in Issue #{issue.number}</span>
                  </div>

                  {assignment ? (
                    <>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={assignment.first_appearance}
                            onChange={(e) => updateAssignmentMarker(
                              editingAssignment.plotlineId,
                              editingAssignment.issueId,
                              'first_appearance',
                              e.target.checked
                            )}
                            disabled={isSaving}
                            className="rounded"
                          />
                          First Appearance
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={assignment.climax_issue}
                            onChange={(e) => updateAssignmentMarker(
                              editingAssignment.plotlineId,
                              editingAssignment.issueId,
                              'climax_issue',
                              e.target.checked
                            )}
                            disabled={isSaving}
                            className="rounded"
                          />
                          Climax Issue
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={assignment.resolution_issue}
                            onChange={(e) => updateAssignmentMarker(
                              editingAssignment.plotlineId,
                              editingAssignment.issueId,
                              'resolution_issue',
                              e.target.checked
                            )}
                            disabled={isSaving}
                            className="rounded"
                          />
                          Resolution Issue
                        </label>
                      </div>

                      <button
                        onClick={() => {
                          togglePlotlineAssignment(editingAssignment.plotlineId, editingAssignment.issueId)
                          setEditingAssignment(null)
                        }}
                        disabled={isSaving}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Remove from this issue
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        togglePlotlineAssignment(editingAssignment.plotlineId, editingAssignment.issueId)
                        setEditingAssignment(null)
                      }}
                      disabled={isSaving}
                      className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded text-sm"
                    >
                      Add plotline to this issue
                    </button>
                  )}

                  <button
                    onClick={() => setEditingAssignment(null)}
                    className="w-full bg-[var(--bg-tertiary)] hover:bg-[var(--border)] py-2 rounded text-sm"
                  >
                    Close
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
