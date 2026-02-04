'use client'

import { useState } from 'react'

interface DialogueBlock {
  speaker_name: string | null
  text: string | null
}

interface Panel {
  panel_number: number
  visual_description: string | null
  dialogue_blocks: DialogueBlock[]
}

interface PreviousPage {
  page_number: number
  story_beat: string | null
  panels: Panel[]
}

interface PreviousPageContextProps {
  previousPage: PreviousPage | null
  sceneName?: string | null
}

export default function PreviousPageContext({ previousPage, sceneName }: PreviousPageContextProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!previousPage) return null

  const sortedPanels = [...previousPage.panels].sort((a, b) => a.panel_number - b.panel_number)
  const lastPanel = sortedPanels[sortedPanels.length - 1]
  const lastDialogue = lastPanel?.dialogue_blocks?.[lastPanel.dialogue_blocks.length - 1]

  // Create a summary of what happened
  const getSummary = () => {
    if (lastDialogue?.text) {
      const speaker = lastDialogue.speaker_name ? `${lastDialogue.speaker_name}: ` : ''
      const text = lastDialogue.text.length > 60
        ? lastDialogue.text.slice(0, 60) + '...'
        : lastDialogue.text
      return `"${text}"`
    }
    if (lastPanel?.visual_description) {
      const desc = lastPanel.visual_description.length > 60
        ? lastPanel.visual_description.slice(0, 60) + '...'
        : lastPanel.visual_description
      return desc
    }
    return null
  }

  const summary = getSummary()

  return (
    <div className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-secondary)]/80 to-transparent">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">←</span>
          <span className="font-medium">Page {previousPage.page_number}</span>
          {sceneName && (
            <span className="text-xs text-[var(--text-muted)]">({sceneName})</span>
          )}
          {summary && (
            <span className="text-[var(--text-muted)] italic hidden sm:inline">
              {summary}
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{isExpanded ? '▲ Less' : '▼ More'}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-3 max-h-64 overflow-y-auto">
          {/* Story beat if present */}
          {previousPage.story_beat && (
            <div className="bg-purple-900/20 border border-purple-800/30 rounded px-3 py-2">
              <span className="text-xs font-medium text-purple-400">Story Beat:</span>
              <p className="text-sm text-[var(--text-secondary)] mt-1">{previousPage.story_beat}</p>
            </div>
          )}

          {/* Panel breakdown */}
          <div className="space-y-2">
            {sortedPanels.map(panel => (
              <div key={panel.panel_number} className="bg-[var(--bg-tertiary)]/50 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">
                    Panel {panel.panel_number}
                  </span>
                </div>

                {/* Visual description */}
                {panel.visual_description && (
                  <p className="text-xs text-[var(--text-muted)] mb-2 leading-relaxed">
                    {panel.visual_description}
                  </p>
                )}

                {/* Dialogue */}
                {panel.dialogue_blocks.length > 0 && (
                  <div className="space-y-1 border-l-2 border-blue-500/30 pl-2">
                    {panel.dialogue_blocks.map((d, i) => (
                      <div key={i} className="text-xs">
                        {d.speaker_name && (
                          <span className="font-medium text-blue-400">{d.speaker_name}: </span>
                        )}
                        <span className="text-[var(--text-secondary)]">
                          "{d.text}"
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Page stats */}
          <div className="text-xs text-[var(--text-muted)] flex gap-4 pt-2 border-t border-[var(--border)]">
            <span>{sortedPanels.length} panels</span>
            <span>
              {sortedPanels.reduce((sum, p) => sum + p.dialogue_blocks.length, 0)} dialogue blocks
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Helper function to find the previous page in an issue structure
 */
export function findPreviousPage(
  acts: any[],
  currentPageId: string
): { page: any; sceneName: string | null } | null {
  // Flatten all pages with their scene context
  const allPages: { page: any; sceneName: string; sceneOrder: number; actOrder: number }[] = []

  for (const act of acts || []) {
    for (const scene of act.scenes || []) {
      for (const page of scene.pages || []) {
        allPages.push({
          page,
          sceneName: scene.name || scene.title || `Scene ${scene.sort_order + 1}`,
          sceneOrder: scene.sort_order,
          actOrder: act.sort_order,
        })
      }
    }
  }

  // Sort by act order, then scene order, then page number
  allPages.sort((a, b) => {
    if (a.actOrder !== b.actOrder) return a.actOrder - b.actOrder
    if (a.sceneOrder !== b.sceneOrder) return a.sceneOrder - b.sceneOrder
    return a.page.page_number - b.page.page_number
  })

  // Find current page index
  const currentIndex = allPages.findIndex(p => p.page.id === currentPageId)

  if (currentIndex <= 0) return null

  const prev = allPages[currentIndex - 1]
  return {
    page: {
      page_number: prev.page.page_number,
      story_beat: prev.page.story_beat || prev.page.intention,
      panels: (prev.page.panels || []).map((panel: any) => ({
        panel_number: panel.panel_number,
        visual_description: panel.visual_description,
        dialogue_blocks: (panel.dialogue_blocks || []).map((d: any) => ({
          speaker_name: d.character?.name || d.speaker_name || null,
          text: d.text,
        })),
      })),
    },
    sceneName: prev.sceneName,
  }
}
