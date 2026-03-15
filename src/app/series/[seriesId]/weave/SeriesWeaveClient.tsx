'use client'

import { useState, useMemo } from 'react'
import { Tip } from '@/components/ui/Tip'
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

// Derive series arc from issue number and total issues
const getSeriesArcFromPosition = (issueNumber: number, totalIssues: number): 'SETUP' | 'CONFRONTATION' | 'RESOLUTION' => {
  const position = issueNumber / totalIssues
  if (position <= 0.33) return 'SETUP'
  if (position <= 0.66) return 'CONFRONTATION'
  return 'RESOLUTION'
}

// Fallback: use series_act field if available, otherwise derive from position
const getSeriesArc = (issue: Issue, totalIssues: number): 'SETUP' | 'CONFRONTATION' | 'RESOLUTION' => {
  if (issue.series_act === 'BEGINNING') return 'SETUP'
  if (issue.series_act === 'MIDDLE') return 'CONFRONTATION'
  if (issue.series_act === 'END') return 'RESOLUTION'
  return getSeriesArcFromPosition(issue.number, totalIssues)
}

const getSeriesArcColor = (arc: 'SETUP' | 'CONFRONTATION' | 'RESOLUTION') => {
  switch (arc) {
    case 'SETUP': return 'text-[var(--color-success)]'
    case 'CONFRONTATION': return 'text-amber-400'
    case 'RESOLUTION': return 'text-[var(--color-error)]'
  }
}

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

  // Compute max page count for density bar scaling
  const maxPageCount = useMemo(() => {
    let max = 0
    for (const count of plotlinePageCounts.values()) {
      if (count > max) max = count
    }
    return max || 1
  }, [plotlinePageCounts])

  // Compute per-issue total page counts
  const issueTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const issue of issues) {
      let total = 0
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          total += (scene.pages || []).length
        }
      }
      totals.set(issue.id, total)
    }
    return totals
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

  const totalIssues = issues.length

  return (
    <div>
      {/* Header */}
      <div className="px-6 pt-4 pb-3 flex justify-between items-baseline">
        <div>
          <Link
            href={`/series/${series.id}`}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors tracking-widest uppercase"
            style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '11px', fontWeight: 800 }}
          >
            ← {series.title}
          </Link>
          <span className="text-[var(--text-disabled)] mx-2">//</span>
          <span
            className="text-[var(--text-primary)] tracking-tight uppercase"
            style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '18px', fontWeight: 900 }}
          >
            SERIES WEAVE
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-[var(--text-muted)] tracking-wider">
            {issues.length} ISSUES · {plotlines.length} PLOTLINES
          </span>
          {plotlines.length > 0 && (
            <>
              <div className="w-px h-3.5 bg-[var(--border)]" />
              <Link
                href={`/series/${series.id}/plotlines`}
                className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] tracking-wider uppercase transition-colors"
                style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}
              >
                MANAGE PLOTLINES
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="px-6 pb-6 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
          <thead>
            <tr>
              {/* Plotline column header */}
              <th className="sticky left-0 z-[2] bg-[var(--bg-primary)] p-2 text-left min-w-[140px]">
                <span
                  className="text-[var(--text-muted)] tracking-widest uppercase"
                  style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '8px', fontWeight: 700 }}
                >
                  PLOTLINES
                </span>
              </th>
              {issues.map((issue) => {
                const arc = getSeriesArc(issue, totalIssues)
                return (
                  <th key={issue.id} className="p-1.5 text-center min-w-[100px]">
                    <Link
                      href={`/series/${series.id}/issues/${issue.id}/weave`}
                      className="block hover:opacity-80 transition-opacity"
                    >
                      <div
                        className="text-[var(--text-primary)] tracking-tight leading-none"
                        style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '16px', fontWeight: 900 }}
                      >
                        #{issue.number}
                      </div>
                      {issue.title && (
                        <div className="font-mono text-[var(--text-muted)] mt-0.5 truncate max-w-[90px] mx-auto" style={{ fontSize: '8px' }}>
                          {issue.title}
                        </div>
                      )}
                      <div
                        className={`mt-0.5 tracking-wider uppercase leading-none ${getSeriesArcColor(arc)}`}
                        style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '7px', fontWeight: 700 }}
                      >
                        {arc}
                      </div>
                    </Link>
                  </th>
                )
              })}
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
                    className="text-[var(--color-primary)] hover:text-[var(--accent-hover)] text-sm mt-2 inline-block"
                  >
                    Create your first plotline →
                  </Link>
                </td>
              </tr>
            ) : (
              <>
                {plotlines
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((plotline) => (
                    <tr key={plotline.id}>
                      {/* Plotline name */}
                      <td className="p-2 sticky left-0 z-[1] bg-[var(--bg-primary)]">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="shrink-0 rounded-full"
                            style={{ width: '8px', height: '8px', backgroundColor: plotline.color }}
                          />
                          <span
                            className="uppercase tracking-wide whitespace-nowrap"
                            style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif", fontSize: '10px', fontWeight: 700, color: plotline.color }}
                          >
                            {plotline.name}
                          </span>
                        </div>
                      </td>

                      {/* Issue cells */}
                      {issues.map((issue) => {
                        const cellData = getCellData(plotline.id, issue.id)
                        const isEditing = editingCell?.plotlineId === plotline.id && editingCell?.issueId === issue.id

                        return (
                          <td key={issue.id} className="p-0 relative">
                            {cellData.pageCount > 0 ? (
                              <div
                                className="bg-[var(--bg-elevated)] rounded border-l-[3px] p-2 min-h-[64px] cursor-pointer shadow-[var(--shadow-sm)]"
                                style={{ borderLeftColor: plotline.color }}
                                onClick={() => {
                                  setEditingCell({ plotlineId: plotline.id, issueId: issue.id })
                                  setEditNotes(cellData.notes || '')
                                }}
                              >
                                {/* Page count */}
                                <div className="flex justify-between items-baseline">
                                  <span
                                    className="text-[16px] font-black text-[var(--text-primary)] tracking-tight"
                                    style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}
                                  >
                                    {cellData.pageCount}
                                  </span>
                                  <span className="font-mono text-[8px] text-[var(--text-muted)]">pages</span>
                                </div>
                                {/* Density bar */}
                                <div className="h-1 bg-[var(--bg-tertiary)] rounded-sm mt-1.5 overflow-hidden">
                                  <div
                                    className="h-full rounded-sm opacity-70"
                                    style={{ width: `${(cellData.pageCount / maxPageCount) * 100}%`, backgroundColor: plotline.color }}
                                  />
                                </div>
                                {/* Marker badges */}
                                <div className="mt-1.5 flex gap-1 flex-wrap">
                                  {cellData.firstAppearance && (
                                    <span className="text-[7px] font-extrabold tracking-wider text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded-sm">1ST</span>
                                  )}
                                  {cellData.climax && (
                                    <span className="text-[7px] font-extrabold tracking-wider text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-1.5 py-0.5 rounded-sm">CLIMAX</span>
                                  )}
                                  {cellData.resolution && (
                                    <span className="text-[7px] font-extrabold tracking-wider text-[var(--color-error)] bg-[var(--color-error)]/10 px-1.5 py-0.5 rounded-sm">RESOLVED</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div
                                className="bg-[var(--bg-secondary)] rounded min-h-[64px] cursor-pointer flex items-center justify-center border border-dashed border-[var(--border-subtle)]"
                                onClick={() => {
                                  setEditingCell({ plotlineId: plotline.id, issueId: issue.id })
                                  setEditNotes(cellData.notes || '')
                                }}
                              >
                                <span className="font-mono text-[8px] text-[var(--text-disabled)]">—</span>
                              </div>
                            )}

                            {/* Edit modal */}
                            {isEditing && (
                              <div
                                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop"
                                onClick={(e) => {
                                  if (e.target === e.currentTarget) {
                                    setEditingCell(null)
                                  }
                                }}
                              >
                                <div className="bg-[var(--bg-secondary)] rounded-lg p-4 w-full max-w-md mx-4 border border-[var(--border)] modal-dialog">
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
                                    <Tip content="Close">
                                      <button
                                        onClick={() => setEditingCell(null)}
                                        className="text-[var(--text-muted)] hover-fade active:scale-[0.97] transition-all duration-150 ease-out"
                                        aria-label="Close editor"
                                      >
                                        ✕
                                      </button>
                                    </Tip>
                                  </div>

                                  {/* Markers */}
                                  <div className="flex gap-2 mb-4">
                                    <Tip content="Toggle first appearance marker">
                                      <button
                                        onClick={() => toggleMarker(plotline.id, issue.id, 'first_appearance')}
                                        className={`px-3 py-1.5 rounded text-sm hover-fade active:scale-[0.97] transition-all duration-150 ease-out ${
                                          cellData.firstAppearance
                                            ? 'bg-[var(--color-success)]/20 text-[var(--color-success)] border border-[var(--color-success)]'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]'
                                        }`}
                                      >
                                        1st Appearance
                                      </button>
                                    </Tip>
                                    <Tip content="Toggle climax marker">
                                      <button
                                        onClick={() => toggleMarker(plotline.id, issue.id, 'climax_issue')}
                                        className={`px-3 py-1.5 rounded text-sm hover-fade active:scale-[0.97] transition-all duration-150 ease-out ${
                                          cellData.climax
                                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]'
                                        }`}
                                      >
                                        Climax
                                      </button>
                                    </Tip>
                                    <Tip content="Toggle resolution marker">
                                      <button
                                        onClick={() => toggleMarker(plotline.id, issue.id, 'resolution_issue')}
                                        className={`px-3 py-1.5 rounded text-sm hover-fade active:scale-[0.97] transition-all duration-150 ease-out ${
                                          cellData.resolution
                                            ? 'bg-[var(--accent-hover)]/20 text-[var(--accent-hover)] border border-[var(--accent-hover)]'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]'
                                        }`}
                                      >
                                        Resolution
                                      </button>
                                    </Tip>
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
                                      className="w-full h-24 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded p-2 text-sm resize-none focus:outline-none focus:border-[var(--color-primary)]"
                                    />
                                  </div>

                                  {/* Actions */}
                                  <div className="flex justify-between items-center">
                                    <Link
                                      href={`/series/${series.id}/issues/${issue.id}/weave`}
                                      className="text-sm text-[var(--color-primary)] hover:text-[var(--accent-hover)]"
                                    >
                                      Open Issue Weave →
                                    </Link>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => setEditingCell(null)}
                                        className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-[0.97] transition-all duration-150 ease-out"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => saveNotes(plotline.id, issue.id)}
                                        className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:opacity-90 hover-lift rounded"
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
                  ))}

                {/* Totals row */}
                <tr>
                  <td className="p-2 pt-3 sticky left-0 z-[1] bg-[var(--bg-primary)] border-t-2 border-[var(--border)]">
                    <span
                      className="text-[8px] font-bold text-[var(--text-muted)] tracking-widest uppercase"
                      style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}
                    >
                      TOTAL
                    </span>
                  </td>
                  {issues.map(iss => (
                    <td key={iss.id} className="pt-3 text-center border-t-2 border-[var(--border)]">
                      <span
                        className="text-sm font-black text-[var(--text-secondary)] tracking-tight"
                        style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}
                      >
                        {issueTotals.get(iss.id) || 0}
                      </span>
                      <div className="font-mono text-[7px] text-[var(--text-muted)] mt-0.5">pages</div>
                    </td>
                  ))}
                </tr>
              </>
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
            className="text-[var(--color-primary)] hover:text-[var(--accent-hover)]"
          >
            Create your first issue →
          </Link>
        </div>
      )}
    </div>
  )
}
