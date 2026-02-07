'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
  sort_order: number
}

interface PlotlineIssue {
  id: string
  plotline_id: string
  issue_id: string
  first_appearance: boolean
  climax_issue: boolean
  resolution_issue: boolean
  notes: string | null
}

interface Page {
  id: string
  page_number: number
  story_beat: string | null
  plotline_id: string | null
}

interface Scene {
  id: string
  sort_order: number
  plotline_id: string | null
  pages: Page[]
}

interface Act {
  id: string
  sort_order: number
  scenes: Scene[]
}

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  series_act: 'BEGINNING' | 'MIDDLE' | 'END' | null
  status: string
  acts: Act[]
}

interface Series {
  id: string
  title: string
  logline: string | null
  central_theme: string | null
}

interface SeriesWeaveClientProps {
  series: Series
  issues: Issue[]
  plotlines: Plotline[]
  plotlineIssues: PlotlineIssue[]
}

// Preset colors for plotlines
const PLOTLINE_COLORS = [
  '#EAB308', // yellow
  '#EF4444', // red
  '#3B82F6', // blue
  '#22C55E', // green
  '#A855F7', // purple
  '#F97316', // orange
  '#14B8A6', // teal
  '#EC4899', // pink
]

export default function SeriesWeaveClient({
  series,
  issues,
  plotlines,
  plotlineIssues,
}: SeriesWeaveClientProps) {
  const [editingCell, setEditingCell] = useState<{ plotlineId: string; issueId: string } | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const { showToast } = useToast()

  // Build a map of plotline-issue data
  const plotlineIssueMap = useMemo(() => {
    const map = new Map<string, PlotlineIssue>()
    for (const pi of plotlineIssues) {
      map.set(`${pi.plotline_id}-${pi.issue_id}`, pi)
    }
    return map
  }, [plotlineIssues])

  // Calculate page counts per plotline per issue
  const plotlinePageCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const issue of issues) {
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          for (const page of scene.pages || []) {
            if (page.plotline_id) {
              const key = `${page.plotline_id}-${issue.id}`
              counts.set(key, (counts.get(key) || 0) + 1)
            }
          }
        }
      }
    }

    return counts
  }, [issues])

  // Get cell data
  const getCellData = (plotlineId: string, issueId: string) => {
    const key = `${plotlineId}-${issueId}`
    const plotlineIssue = plotlineIssueMap.get(key)
    const pageCount = plotlinePageCounts.get(key) || 0

    return {
      pageCount,
      firstAppearance: plotlineIssue?.first_appearance || false,
      climax: plotlineIssue?.climax_issue || false,
      resolution: plotlineIssue?.resolution_issue || false,
      notes: plotlineIssue?.notes || null,
      hasData: pageCount > 0 || !!plotlineIssue,
    }
  }

  // Toggle cell marker
  const toggleMarker = async (plotlineId: string, issueId: string, marker: 'first_appearance' | 'climax_issue' | 'resolution_issue') => {
    const key = `${plotlineId}-${issueId}`
    const existing = plotlineIssueMap.get(key)
    const supabase = createClient()

    if (existing) {
      // Update existing
      const newValue = !existing[marker]
      const { error } = await supabase
        .from('plotline_issue_assignments')
        .update({ [marker]: newValue })
        .eq('id', existing.id)

      if (error) {
        showToast('Failed to update marker', 'error')
      } else {
        // Update local map
        plotlineIssueMap.set(key, { ...existing, [marker]: newValue })
        showToast(`${marker.replace('_', ' ')} ${newValue ? 'marked' : 'unmarked'}`, 'success')
      }
    } else {
      // Create new
      const { data, error } = await supabase
        .from('plotline_issue_assignments')
        .insert({
          plotline_id: plotlineId,
          issue_id: issueId,
          [marker]: true,
        })
        .select()
        .single()

      if (error) {
        showToast('Failed to create marker', 'error')
      } else if (data) {
        plotlineIssueMap.set(key, data)
        showToast(`${marker.replace('_', ' ')} marked`, 'success')
      }
    }
  }

  // Save notes
  const saveNotes = async (plotlineId: string, issueId: string) => {
    const key = `${plotlineId}-${issueId}`
    const existing = plotlineIssueMap.get(key)
    const supabase = createClient()

    if (existing) {
      const { error } = await supabase
        .from('plotline_issue_assignments')
        .update({ notes: editNotes || null })
        .eq('id', existing.id)

      if (error) {
        showToast('Failed to save notes', 'error')
      } else {
        plotlineIssueMap.set(key, { ...existing, notes: editNotes || null })
        showToast('Notes saved', 'success')
      }
    } else {
      const { data, error } = await supabase
        .from('plotline_issue_assignments')
        .insert({
          plotline_id: plotlineId,
          issue_id: issueId,
          notes: editNotes || null,
        })
        .select()
        .single()

      if (error) {
        showToast('Failed to save notes', 'error')
      } else if (data) {
        plotlineIssueMap.set(key, data)
        showToast('Notes saved', 'success')
      }
    }

    setEditingCell(null)
    setEditNotes('')
  }

  // Series arc labels
  const getSeriesActLabel = (seriesAct: Issue['series_act']) => {
    switch (seriesAct) {
      case 'BEGINNING': return 'Setup'
      case 'MIDDLE': return 'Confrontation'
      case 'END': return 'Resolution'
      default: return ''
    }
  }

  const getSeriesActColor = (seriesAct: Issue['series_act']) => {
    switch (seriesAct) {
      case 'BEGINNING': return 'text-green-400'
      case 'MIDDLE': return 'text-amber-400'
      case 'END': return 'text-red-400'
      default: return 'text-[var(--text-muted)]'
    }
  }

  return (
    <div className="p-6">
      {/* Legend */}
      <div className="mb-6 flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-green-500/30 border border-green-500"></span>
          <span className="text-[var(--text-secondary)]">First Appearance</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-amber-500/30 border border-amber-500"></span>
          <span className="text-[var(--text-secondary)]">Climax</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-purple-500/30 border border-purple-500"></span>
          <span className="text-[var(--text-secondary)]">Resolution</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">|</span>
          <span className="text-[var(--text-secondary)]">Click cell to add notes</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--bg-primary)] z-10 p-3 text-left text-sm font-medium text-[var(--text-secondary)] border-b border-[var(--border)] min-w-[200px]">
                Plotline
              </th>
              {issues.map((issue) => (
                <th
                  key={issue.id}
                  className="p-3 text-center text-sm font-medium border-b border-[var(--border)] min-w-[120px]"
                >
                  <Link
                    href={`/series/${series.id}/issues/${issue.id}/weave`}
                    className="hover:text-blue-400 transition-colors"
                  >
                    <div className="font-bold">#{issue.number}</div>
                    {issue.title && (
                      <div className="text-xs text-[var(--text-secondary)] truncate max-w-[100px]">
                        {issue.title}
                      </div>
                    )}
                    {issue.series_act && (
                      <div className={`text-xs mt-1 ${getSeriesActColor(issue.series_act)}`}>
                        {getSeriesActLabel(issue.series_act)}
                      </div>
                    )}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plotlines.length === 0 ? (
              <tr>
                <td
                  colSpan={issues.length + 1}
                  className="p-8 text-center text-[var(--text-muted)]"
                >
                  <div className="text-4xl mb-4 opacity-30">🧵</div>
                  <p>No plotlines defined yet.</p>
                  <Link
                    href={`/series/${series.id}/plotlines`}
                    className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
                  >
                    Create your first plotline →
                  </Link>
                </td>
              </tr>
            ) : (
              plotlines
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((plotline) => (
                  <tr key={plotline.id} className="group">
                    {/* Plotline name */}
                    <td className="sticky left-0 bg-[var(--bg-primary)] z-10 p-3 border-b border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: plotline.color }}
                        />
                        <span className="font-medium">{plotline.name}</span>
                      </div>
                      {plotline.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                          {plotline.description}
                        </p>
                      )}
                    </td>

                    {/* Issue cells */}
                    {issues.map((issue) => {
                      const cellData = getCellData(plotline.id, issue.id)
                      const isEditing = editingCell?.plotlineId === plotline.id && editingCell?.issueId === issue.id

                      return (
                        <td
                          key={issue.id}
                          className="p-2 border-b border-[var(--border)] relative"
                        >
                          <div
                            className={`
                              min-h-[80px] rounded-lg p-2 cursor-pointer transition-all
                              ${cellData.hasData
                                ? 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                                : 'bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-dashed border-[var(--border)]'
                              }
                            `}
                            style={{
                              borderLeftColor: cellData.pageCount > 0 ? plotline.color : undefined,
                              borderLeftWidth: cellData.pageCount > 0 ? '3px' : undefined,
                            }}
                            onClick={() => {
                              setEditingCell({ plotlineId: plotline.id, issueId: issue.id })
                              setEditNotes(cellData.notes || '')
                            }}
                          >
                            {/* Page count */}
                            {cellData.pageCount > 0 && (
                              <div className="text-xs text-[var(--text-secondary)] mb-2">
                                {cellData.pageCount} page{cellData.pageCount !== 1 ? 's' : ''}
                              </div>
                            )}

                            {/* Markers */}
                            <div className="flex flex-wrap gap-1 mb-2">
                              {cellData.firstAppearance && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/50">
                                  1st
                                </span>
                              )}
                              {cellData.climax && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/50">
                                  Climax
                                </span>
                              )}
                              {cellData.resolution && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/50">
                                  Resolution
                                </span>
                              )}
                            </div>

                            {/* Notes preview */}
                            {cellData.notes && (
                              <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                                {cellData.notes}
                              </p>
                            )}

                            {/* Empty state */}
                            {!cellData.hasData && (
                              <div className="text-xs text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                                Click to add
                              </div>
                            )}
                          </div>

                          {/* Edit modal */}
                          {isEditing && (
                            <div
                              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
                              onClick={(e) => {
                                if (e.target === e.currentTarget) {
                                  setEditingCell(null)
                                }
                              }}
                            >
                              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 w-full max-w-md mx-4 border border-[var(--border)]">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: plotline.color }}
                                    />
                                    <span className="font-medium">{plotline.name}</span>
                                    <span className="text-[var(--text-muted)]">×</span>
                                    <span>Issue #{issue.number}</span>
                                  </div>
                                  <button
                                    onClick={() => setEditingCell(null)}
                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                  >
                                    ✕
                                  </button>
                                </div>

                                {/* Markers */}
                                <div className="flex gap-2 mb-4">
                                  <button
                                    onClick={() => toggleMarker(plotline.id, issue.id, 'first_appearance')}
                                    className={`px-3 py-1.5 rounded text-sm ${
                                      cellData.firstAppearance
                                        ? 'bg-green-500/20 text-green-400 border border-green-500'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]'
                                    }`}
                                  >
                                    1st Appearance
                                  </button>
                                  <button
                                    onClick={() => toggleMarker(plotline.id, issue.id, 'climax_issue')}
                                    className={`px-3 py-1.5 rounded text-sm ${
                                      cellData.climax
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]'
                                    }`}
                                  >
                                    Climax
                                  </button>
                                  <button
                                    onClick={() => toggleMarker(plotline.id, issue.id, 'resolution_issue')}
                                    className={`px-3 py-1.5 rounded text-sm ${
                                      cellData.resolution
                                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]'
                                    }`}
                                  >
                                    Resolution
                                  </button>
                                </div>

                                {/* Notes */}
                                <div className="mb-4">
                                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                                    Notes for this plotline in Issue #{issue.number}
                                  </label>
                                  <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="What happens with this plotline in this issue?"
                                    className="w-full h-24 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded p-2 text-sm resize-none focus:outline-none focus:border-blue-500"
                                  />
                                </div>

                                {/* Actions */}
                                <div className="flex justify-between items-center">
                                  <Link
                                    href={`/series/${series.id}/issues/${issue.id}/weave`}
                                    className="text-sm text-blue-400 hover:text-blue-300"
                                  >
                                    Open Issue Weave →
                                  </Link>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setEditingCell(null)}
                                      className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => saveNotes(plotline.id, issue.id)}
                                      className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* Empty issues state */}
      {issues.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <div className="text-5xl mb-4 opacity-30">📚</div>
          <p className="mb-2">No issues in this series yet.</p>
          <Link
            href={`/series/${series.id}`}
            className="text-blue-400 hover:text-blue-300"
          >
            Create your first issue →
          </Link>
        </div>
      )}
    </div>
  )
}
