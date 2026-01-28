'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'

interface Plotline {
  id: string
  name: string
  color: string
}

interface ProposedOutline {
  issueId: string
  issueNumber: number
  currentSummary: string | null
  proposedSummary: string
  currentThemes: string | null
  proposedThemes: string
  acts: {
    actNumber: number
    currentTitle: string | null
    proposedTitle: string
    currentBeatSummary: string | null
    proposedBeatSummary: string
  }[]
}

interface DialogueBlock {
  text: string
  character_id: string | null
}

interface Caption {
  text: string
  caption_type: string
}

interface Panel {
  visual_description: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
}

interface Page {
  page_number: number
  panels: Panel[]
}

interface Scene {
  id: string
  title: string | null
  plotline: Plotline | null
  pages: Page[]
  sort_order: number
}

interface Act {
  id: string
  title: string | null
  number: number
  scenes: Scene[]
  sort_order: number
  beat_summary: string | null
  intention: string | null
}

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  themes: string | null
  status: string
  acts: Act[]
}

interface Series {
  id: string
  title: string
  logline: string | null
  central_theme: string | null
  outline_notes: string | null
  plotlines: Plotline[]
  issues: Issue[]
}

interface OutlineViewProps {
  series: Series
}

export default function OutlineView({ series }: OutlineViewProps) {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedSummaries, setGeneratedSummaries] = useState<Map<string, string>>(new Map())
  const [isSyncing, setIsSyncing] = useState(false)
  const [proposedOutlines, setProposedOutlines] = useState<ProposedOutline[]>([])
  const [showDiffView, setShowDiffView] = useState(false)
  const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(new Set())
  const [editingSeriesNotes, setEditingSeriesNotes] = useState(false)
  const [seriesNotes, setSeriesNotes] = useState(series.outline_notes || '')
  const { showToast } = useToast()

  // Save series outline notes
  const saveSeriesNotes = async () => {
    const supabase = createClient()
    const { error } = await supabase
      .from('series')
      .update({ outline_notes: seriesNotes.trim() || null })
      .eq('id', series.id)

    if (error) {
      showToast('Failed to save notes', 'error')
    } else {
      showToast('Notes saved', 'success')
      setEditingSeriesNotes(false)
    }
  }

  const toggleIssue = (issueId: string) => {
    const newExpanded = new Set(expandedIssues)
    if (newExpanded.has(issueId)) {
      newExpanded.delete(issueId)
    } else {
      newExpanded.add(issueId)
    }
    setExpandedIssues(newExpanded)
  }

  const expandAll = () => {
    setExpandedIssues(new Set(series.issues.map(i => i.id)))
  }

  const collapseAll = () => {
    setExpandedIssues(new Set())
  }

  // Calculate stats for an issue
  const getIssueStats = (issue: Issue) => {
    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
    let totalPages = 0
    let totalPanels = 0
    let totalWords = 0

    for (const act of sortedActs) {
      for (const scene of (act.scenes || [])) {
        for (const page of (scene.pages || [])) {
          totalPages++
          for (const panel of (page.panels || [])) {
            totalPanels++
            // Count words in visual descriptions
            if (panel.visual_description) {
              totalWords += panel.visual_description.split(/\s+/).length
            }
            // Count words in dialogue
            for (const dialogue of (panel.dialogue_blocks || [])) {
              if (dialogue.text) {
                totalWords += dialogue.text.split(/\s+/).length
              }
            }
            // Count words in captions
            for (const caption of (panel.captions || [])) {
              if (caption.text) {
                totalWords += caption.text.split(/\s+/).length
              }
            }
          }
        }
      }
    }

    return { totalPages, totalPanels, totalWords, actCount: sortedActs.length }
  }

  // Generate summary from script content
  const generateSummaryFromScript = (issue: Issue): string => {
    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
    const summaryParts: string[] = []

    for (const act of sortedActs) {
      const actTitle = act.title || `Act ${act.number}`
      const sceneDescriptions: string[] = []

      const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

      for (const scene of sortedScenes) {
        if (scene.title) {
          // Get first visual description as a hint
          const firstPage = scene.pages?.[0]
          const firstPanel = firstPage?.panels?.[0]
          const hint = firstPanel?.visual_description
            ? ` - ${firstPanel.visual_description.slice(0, 100)}${firstPanel.visual_description.length > 100 ? '...' : ''}`
            : ''
          sceneDescriptions.push(`${scene.title}${hint}`)
        }
      }

      if (sceneDescriptions.length > 0) {
        summaryParts.push(`**${actTitle}:** ${sceneDescriptions.join('; ')}`)
      }
    }

    return summaryParts.join('\n\n') || 'No content yet.'
  }

  // AI-powered summary generation (uses the chat API)
  const generateAISummary = async (issue: Issue) => {
    setIsGenerating(true)

    try {
      // Collect all script content for the issue
      const scriptContent: string[] = []
      const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

      for (const act of sortedActs) {
        scriptContent.push(`\n--- ${act.title || `ACT ${act.number}`} ---\n`)

        const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

        for (const scene of sortedScenes) {
          if (scene.title) {
            scriptContent.push(`\nSCENE: ${scene.title}`)
          }

          for (const page of (scene.pages || [])) {
            scriptContent.push(`\nPage ${page.page_number}:`)

            for (const panel of (page.panels || [])) {
              if (panel.visual_description) {
                scriptContent.push(panel.visual_description)
              }
              for (const dialogue of (panel.dialogue_blocks || [])) {
                if (dialogue.text) {
                  scriptContent.push(`"${dialogue.text}"`)
                }
              }
            }
          }
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Based on this comic script for Issue #${issue.number}, write a concise 2-3 sentence summary of what happens in this issue. Focus on the main plot points and character arcs. Here's the script:\n\n${scriptContent.join('\n')}`,
          context: {
            seriesTitle: series.title,
            issueNumber: issue.number,
            issueTitle: issue.title,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to generate summary')

      const data = await response.json()
      setGeneratedSummaries(prev => new Map(prev).set(issue.id, data.response))
      showToast('Summary generated', 'success')
    } catch (error) {
      console.error('Error generating summary:', error)
      showToast('Failed to generate summary', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Save generated summary to issue
  const saveSummary = async (issueId: string) => {
    const summary = generatedSummaries.get(issueId)
    if (!summary) return

    const supabase = createClient()
    const { error } = await supabase
      .from('issues')
      .update({ summary })
      .eq('id', issueId)

    if (error) {
      showToast('Failed to save summary', 'error')
    } else {
      showToast('Summary saved', 'success')
      // Clear from generated summaries
      setGeneratedSummaries(prev => {
        const next = new Map(prev)
        next.delete(issueId)
        return next
      })
    }
  }

  // Sync outline from scripts - generates proposed updates for all issues
  const syncOutlineFromScripts = async () => {
    setIsSyncing(true)
    setProposedOutlines([])
    setAcceptedChanges(new Set())

    try {
      const proposed: ProposedOutline[] = []

      for (const issue of series.issues) {
        // Collect all script content for the issue
        const scriptContent: string[] = []
        const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

        for (const act of sortedActs) {
          scriptContent.push(`\n--- ${act.title || `ACT ${act.number}`} ---\n`)
          const sortedScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

          for (const scene of sortedScenes) {
            if (scene.title) scriptContent.push(`SCENE: ${scene.title}`)
            for (const page of (scene.pages || [])) {
              for (const panel of (page.panels || [])) {
                if (panel.visual_description) scriptContent.push(panel.visual_description)
                for (const dialogue of (panel.dialogue_blocks || [])) {
                  if (dialogue.text) scriptContent.push(`"${dialogue.text}"`)
                }
              }
            }
          }
        }

        if (scriptContent.length < 10) continue // Skip issues with no content

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Analyze this comic script and generate outline metadata. Return ONLY valid JSON (no markdown).

Script for Issue #${issue.number}:
${scriptContent.join('\n').slice(0, 8000)}

Return this exact JSON structure:
{
  "summary": "2-3 sentence summary of what happens",
  "themes": "Key themes explored in this issue",
  "acts": [
    {"number": 1, "title": "Suggested act title", "beatSummary": "Key beats in this act"}
  ]
}`,
            context: { seriesTitle: series.title },
          }),
        })

        if (!response.ok) continue

        const data = await response.json()
        const jsonStr = data.response.replace(/```json\n?/g, '').replace(/```\n?/g, '')
        const startIdx = jsonStr.indexOf('{')
        const endIdx = jsonStr.lastIndexOf('}')

        try {
          const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx + 1))

          proposed.push({
            issueId: issue.id,
            issueNumber: issue.number,
            currentSummary: issue.summary,
            proposedSummary: parsed.summary || '',
            currentThemes: issue.themes,
            proposedThemes: parsed.themes || '',
            acts: sortedActs.map((act, idx) => ({
              actNumber: act.number,
              currentTitle: act.title,
              proposedTitle: parsed.acts?.[idx]?.title || act.title || `Act ${act.number}`,
              currentBeatSummary: act.beat_summary,
              proposedBeatSummary: parsed.acts?.[idx]?.beatSummary || '',
            })),
          })
        } catch {
          console.error('Failed to parse AI response for issue', issue.number)
        }
      }

      setProposedOutlines(proposed)
      setShowDiffView(true)
      showToast(`Generated proposals for ${proposed.length} issues`, 'success')
    } catch (error) {
      console.error('Error syncing outline:', error)
      showToast('Failed to sync outline', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  // Accept a specific change
  const toggleAcceptChange = (changeId: string) => {
    setAcceptedChanges(prev => {
      const next = new Set(prev)
      if (next.has(changeId)) {
        next.delete(changeId)
      } else {
        next.add(changeId)
      }
      return next
    })
  }

  // Accept all changes
  const acceptAllChanges = () => {
    const allIds: string[] = []
    for (const po of proposedOutlines) {
      if (po.proposedSummary !== po.currentSummary) allIds.push(`${po.issueId}-summary`)
      if (po.proposedThemes !== po.currentThemes) allIds.push(`${po.issueId}-themes`)
      for (const act of po.acts) {
        if (act.proposedBeatSummary !== act.currentBeatSummary) {
          allIds.push(`${po.issueId}-act-${act.actNumber}-beat`)
        }
      }
    }
    setAcceptedChanges(new Set(allIds))
  }

  // Apply accepted changes to database
  const applyAcceptedChanges = async () => {
    const supabase = createClient()
    let updated = 0

    for (const po of proposedOutlines) {
      const issueUpdates: Record<string, string> = {}

      if (acceptedChanges.has(`${po.issueId}-summary`)) {
        issueUpdates.summary = po.proposedSummary
      }
      if (acceptedChanges.has(`${po.issueId}-themes`)) {
        issueUpdates.themes = po.proposedThemes
      }

      if (Object.keys(issueUpdates).length > 0) {
        await supabase.from('issues').update(issueUpdates).eq('id', po.issueId)
        updated++
      }

      // Update acts
      for (const act of po.acts) {
        if (acceptedChanges.has(`${po.issueId}-act-${act.actNumber}-beat`)) {
          const issue = series.issues.find(i => i.id === po.issueId)
          const actRecord = issue?.acts?.find((a: any) => a.number === act.actNumber)
          if (actRecord) {
            await supabase.from('acts').update({ beat_summary: act.proposedBeatSummary }).eq('id', actRecord.id)
            updated++
          }
        }
      }
    }

    showToast(`Applied ${updated} changes`, 'success')
    setShowDiffView(false)
    setProposedOutlines([])
    setAcceptedChanges(new Set())
    // Trigger a page refresh to show updated data
    window.location.reload()
  }

  const statusColors: Record<string, string> = {
    outline: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
    drafting: 'bg-blue-900 text-blue-300',
    revision: 'bg-amber-900 text-amber-300',
    complete: 'bg-green-900 text-green-300',
  }

  return (
    <div className="space-y-8">
      {/* Series Header */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2">{series.title}</h2>
        {series.logline && (
          <p className="text-[var(--text-secondary)] text-lg mb-4">{series.logline}</p>
        )}
        {series.central_theme && (
          <p className="text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-secondary)]">Central Theme: </span>
            {series.central_theme}
          </p>
        )}

        {/* Series Outline Notes */}
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Series Outline Notes</span>
            <button
              onClick={() => setEditingSeriesNotes(!editingSeriesNotes)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {editingSeriesNotes ? 'Cancel' : 'Edit'}
            </button>
          </div>
          {editingSeriesNotes ? (
            <div className="space-y-2">
              <textarea
                value={seriesNotes}
                onChange={(e) => setSeriesNotes(e.target.value)}
                placeholder="High-level outline notes for the entire series..."
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-vertical min-h-[100px] focus:border-purple-500 focus:outline-none"
                rows={4}
              />
              <button
                onClick={saveSeriesNotes}
                className="text-sm bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded"
              >
                Save Notes
              </button>
            </div>
          ) : series.outline_notes ? (
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{series.outline_notes}</p>
          ) : (
            <p className="text-sm text-[var(--text-secondary)] italic">No outline notes yet. Click Edit to add.</p>
          )}
        </div>

        {/* Plotlines */}
        {series.plotlines.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <span className="text-sm text-[var(--text-secondary)] mr-3">Plotlines:</span>
            <div className="inline-flex flex-wrap gap-2 mt-2">
              {series.plotlines.map((plotline) => (
                <span
                  key={plotline.id}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm"
                  style={{ backgroundColor: plotline.color + '30', color: plotline.color }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: plotline.color }}
                  />
                  {plotline.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Diff View Modal */}
      {showDiffView && proposedOutlines.length > 0 && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-xl font-bold">Review Proposed Outline Changes</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={acceptAllChanges}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Select All
                </button>
                <button
                  onClick={() => setAcceptedChanges(new Set())}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowDiffView(false)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {proposedOutlines.map((po) => (
                <div key={po.issueId} className="border border-[var(--border)] rounded-lg overflow-hidden">
                  <div className="bg-[var(--bg-tertiary)] px-4 py-2 font-medium">
                    Issue #{po.issueNumber}
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Summary diff */}
                    {po.proposedSummary !== po.currentSummary && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={acceptedChanges.has(`${po.issueId}-summary`)}
                            onChange={() => toggleAcceptChange(`${po.issueId}-summary`)}
                            className="rounded"
                          />
                          <span className="text-sm font-medium text-[var(--text-secondary)]">Summary</span>
                        </label>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="bg-red-900/20 border border-red-800/30 rounded p-3">
                            <div className="text-red-400 text-xs mb-1">Current</div>
                            <p className="text-[var(--text-secondary)]">{po.currentSummary || <em className="text-[var(--text-secondary)]">Empty</em>}</p>
                          </div>
                          <div className="bg-green-900/20 border border-green-800/30 rounded p-3">
                            <div className="text-green-400 text-xs mb-1">Proposed</div>
                            <p className="text-[var(--text-secondary)]">{po.proposedSummary}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Themes diff */}
                    {po.proposedThemes !== po.currentThemes && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={acceptedChanges.has(`${po.issueId}-themes`)}
                            onChange={() => toggleAcceptChange(`${po.issueId}-themes`)}
                            className="rounded"
                          />
                          <span className="text-sm font-medium text-[var(--text-secondary)]">Themes</span>
                        </label>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="bg-red-900/20 border border-red-800/30 rounded p-3">
                            <div className="text-red-400 text-xs mb-1">Current</div>
                            <p className="text-[var(--text-secondary)]">{po.currentThemes || <em className="text-[var(--text-secondary)]">Empty</em>}</p>
                          </div>
                          <div className="bg-green-900/20 border border-green-800/30 rounded p-3">
                            <div className="text-green-400 text-xs mb-1">Proposed</div>
                            <p className="text-[var(--text-secondary)]">{po.proposedThemes}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Act beat summaries */}
                    {po.acts.filter(a => a.proposedBeatSummary !== a.currentBeatSummary).map((act) => (
                      <div key={act.actNumber} className="space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={acceptedChanges.has(`${po.issueId}-act-${act.actNumber}-beat`)}
                            onChange={() => toggleAcceptChange(`${po.issueId}-act-${act.actNumber}-beat`)}
                            className="rounded"
                          />
                          <span className="text-sm font-medium text-[var(--text-secondary)]">
                            Act {act.actNumber} Beat Summary
                          </span>
                        </label>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="bg-red-900/20 border border-red-800/30 rounded p-3">
                            <div className="text-red-400 text-xs mb-1">Current</div>
                            <p className="text-[var(--text-secondary)]">{act.currentBeatSummary || <em className="text-[var(--text-secondary)]">Empty</em>}</p>
                          </div>
                          <div className="bg-green-900/20 border border-green-800/30 rounded p-3">
                            <div className="text-green-400 text-xs mb-1">Proposed</div>
                            <p className="text-[var(--text-secondary)]">{act.proposedBeatSummary}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-tertiary)]">
              <span className="text-sm text-[var(--text-secondary)]">
                {acceptedChanges.size} changes selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDiffView(false)}
                  className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  onClick={applyAcceptedChanges}
                  disabled={acceptedChanges.size === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed rounded font-medium"
                >
                  Apply Selected Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Issues ({series.issues.length})</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={syncOutlineFromScripts}
            disabled={isSyncing}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-[var(--bg-tertiary)] px-3 py-1 rounded"
          >
            {isSyncing ? 'Syncing...' : 'Sync from Scripts'}
          </button>
          <button
            onClick={expandAll}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Issues List */}
      <div className="space-y-4">
        {series.issues.map((issue) => {
          const isExpanded = expandedIssues.has(issue.id)
          const stats = getIssueStats(issue)
          const generatedSummary = generatedSummaries.get(issue.id)

          return (
            <div
              key={issue.id}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              {/* Issue Header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                onClick={() => toggleIssue(issue.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-secondary)]">{isExpanded ? '▼' : '▶'}</span>
                  <span className="font-semibold">Issue #{issue.number}</span>
                  {issue.title && (
                    <span className="text-[var(--text-secondary)]">— {issue.title}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColors[issue.status] || statusColors.outline}`}>
                    {issue.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                  <span>{stats.totalPages} pages</span>
                  <span>{stats.totalPanels} panels</span>
                  <span>{stats.totalWords.toLocaleString()} words</span>
                  <Link
                    href={`/series/${series.id}/issues/${issue.id}`}
                    className="text-blue-400 hover:text-blue-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Edit →
                  </Link>
                </div>
              </div>

              {/* Issue Content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-[var(--border)]">
                  {/* Summary Section */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-[var(--text-secondary)]">Summary</h4>
                      <button
                        onClick={() => generateAISummary(issue)}
                        disabled={isGenerating}
                        className="text-xs text-blue-400 hover:text-blue-300 disabled:text-[var(--text-muted)]"
                      >
                        {isGenerating ? 'Generating...' : 'Generate with AI'}
                      </button>
                    </div>

                    {generatedSummary ? (
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded text-sm">
                          <p className="text-[var(--text-secondary)]">{generatedSummary}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveSummary(issue.id)}
                            className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
                          >
                            Save Summary
                          </button>
                          <button
                            onClick={() => setGeneratedSummaries(prev => {
                              const next = new Map(prev)
                              next.delete(issue.id)
                              return next
                            })}
                            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    ) : issue.summary ? (
                      <p className="text-sm text-[var(--text-secondary)]">{issue.summary}</p>
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)] italic">No summary yet</p>
                    )}
                  </div>

                  {/* Themes */}
                  {issue.themes && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">Themes</h4>
                      <p className="text-sm text-[var(--text-secondary)]">{issue.themes}</p>
                    </div>
                  )}

                  {/* Act Breakdown */}
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Structure</h4>
                    <div className="space-y-2">
                      {[...(issue.acts || [])]
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((act) => {
                          const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)
                          const actPages = sortedScenes.reduce(
                            (sum, scene) => sum + (scene.pages?.length || 0),
                            0
                          )

                          return (
                            <div key={act.id} className="pl-4 border-l-2 border-[var(--border)]">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {act.title || `Act ${act.number}`}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)]">
                                  ({actPages} pages, {sortedScenes.length} scenes)
                                </span>
                              </div>
                              {act.intention && (
                                <p className="text-xs text-purple-400/70 mt-0.5">
                                  → {act.intention}
                                </p>
                              )}
                              {act.beat_summary && (
                                <p className="text-xs text-[var(--text-secondary)] italic mt-0.5">
                                  {act.beat_summary}
                                </p>
                              )}
                              <div className="mt-1 space-y-0.5">
                                {sortedScenes.map((scene) => (
                                  <div
                                    key={scene.id}
                                    className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                                  >
                                    {scene.plotline && (
                                      <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: scene.plotline.color }}
                                      />
                                    )}
                                    <span>{scene.title || 'Untitled Scene'}</span>
                                    <span className="text-[var(--text-muted)]">
                                      ({scene.pages?.length || 0} pg)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {series.issues.length === 0 && (
        <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <p className="text-[var(--text-secondary)]">No issues yet</p>
          <Link
            href={`/series/${series.id}`}
            className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
          >
            Go to series page to create issues
          </Link>
        </div>
      )}
    </div>
  )
}
