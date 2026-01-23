'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'

interface Plotline {
  id: string
  name: string
  color: string
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
  const { showToast } = useToast()

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
      setGeneratedSummaries(prev => new Map(prev).set(issue.id, data.message))
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

  const statusColors: Record<string, string> = {
    outline: 'bg-zinc-700 text-zinc-300',
    drafting: 'bg-blue-900 text-blue-300',
    revision: 'bg-amber-900 text-amber-300',
    complete: 'bg-green-900 text-green-300',
  }

  return (
    <div className="space-y-8">
      {/* Series Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2">{series.title}</h2>
        {series.logline && (
          <p className="text-zinc-300 text-lg mb-4">{series.logline}</p>
        )}
        {series.central_theme && (
          <p className="text-zinc-500">
            <span className="font-medium text-zinc-400">Central Theme: </span>
            {series.central_theme}
          </p>
        )}

        {/* Plotlines */}
        {series.plotlines.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <span className="text-sm text-zinc-400 mr-3">Plotlines:</span>
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

      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Issues ({series.issues.length})</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-sm text-zinc-400 hover:text-white px-2 py-1"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-sm text-zinc-400 hover:text-white px-2 py-1"
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
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              {/* Issue Header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                onClick={() => toggleIssue(issue.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500">{isExpanded ? '▼' : '▶'}</span>
                  <span className="font-semibold">Issue #{issue.number}</span>
                  {issue.title && (
                    <span className="text-zinc-400">— {issue.title}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColors[issue.status] || statusColors.outline}`}>
                    {issue.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-zinc-500">
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
                <div className="px-4 pb-4 border-t border-zinc-800">
                  {/* Summary Section */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-zinc-400">Summary</h4>
                      <button
                        onClick={() => generateAISummary(issue)}
                        disabled={isGenerating}
                        className="text-xs text-blue-400 hover:text-blue-300 disabled:text-zinc-600"
                      >
                        {isGenerating ? 'Generating...' : 'Generate with AI'}
                      </button>
                    </div>

                    {generatedSummary ? (
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded text-sm">
                          <p className="text-zinc-300">{generatedSummary}</p>
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
                            className="text-xs text-zinc-400 hover:text-white px-3 py-1"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    ) : issue.summary ? (
                      <p className="text-sm text-zinc-300">{issue.summary}</p>
                    ) : (
                      <p className="text-sm text-zinc-500 italic">No summary yet</p>
                    )}
                  </div>

                  {/* Themes */}
                  {issue.themes && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-zinc-400 mb-1">Themes</h4>
                      <p className="text-sm text-zinc-300">{issue.themes}</p>
                    </div>
                  )}

                  {/* Act Breakdown */}
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-zinc-400 mb-2">Structure</h4>
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
                            <div key={act.id} className="pl-4 border-l-2 border-zinc-700">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {act.title || `Act ${act.number}`}
                                </span>
                                <span className="text-xs text-zinc-500">
                                  ({actPages} pages, {sortedScenes.length} scenes)
                                </span>
                              </div>
                              <div className="mt-1 space-y-0.5">
                                {sortedScenes.map((scene) => (
                                  <div
                                    key={scene.id}
                                    className="flex items-center gap-2 text-sm text-zinc-400"
                                  >
                                    {scene.plotline && (
                                      <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: scene.plotline.color }}
                                      />
                                    )}
                                    <span>{scene.title || 'Untitled Scene'}</span>
                                    <span className="text-zinc-600">
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
        <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
          <p className="text-zinc-400">No issues yet</p>
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
