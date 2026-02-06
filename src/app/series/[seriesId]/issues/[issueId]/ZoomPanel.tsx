'use client'

import { useMemo } from 'react'

interface ZoomPanelProps {
  seriesTitle: string
  seriesId: string
  issue: {
    id: string
    number: number
    title: string | null
    acts: any[]
  }
  selectedPageId: string | null
  selectedPanelId?: string | null
  onSelectPage: (pageId: string) => void
  onClose: () => void
}

interface PageInfo {
  id: string
  pageNumber: number
  isLeft: boolean
  pageType: string
}

interface HierarchyLevel {
  type: 'series' | 'issue' | 'act' | 'scene' | 'page' | 'panel'
  id: string
  label: string
  icon: string
  isActive: boolean
  depth: number
  metadata?: string
  onClick?: () => void
}

export default function ZoomPanel({
  seriesTitle,
  seriesId,
  issue,
  selectedPageId,
  selectedPanelId,
  onSelectPage,
  onClose,
}: ZoomPanelProps) {
  // Build the context hierarchy
  const hierarchy = useMemo(() => {
    const levels: HierarchyLevel[] = []

    // Series level
    levels.push({
      type: 'series',
      id: seriesId,
      label: seriesTitle,
      icon: '📚',
      isActive: false,
      depth: 0,
    })

    // Issue level
    levels.push({
      type: 'issue',
      id: issue.id,
      label: `Issue #${issue.number}${issue.title ? `: ${issue.title}` : ''}`,
      icon: '📖',
      isActive: false,
      depth: 1,
    })

    // Find current selection context
    let currentAct: any = null
    let currentScene: any = null
    let currentPage: any = null

    for (const act of (issue.acts || [])) {
      for (const scene of (act.scenes || [])) {
        const page = (scene.pages || []).find((p: any) => p.id === selectedPageId)
        if (page) {
          currentAct = act
          currentScene = scene
          currentPage = page
          break
        }
      }
      if (currentPage) break
    }

    // Add Act level
    for (const act of (issue.acts || [])) {
      const isCurrentAct = act.id === currentAct?.id
      levels.push({
        type: 'act',
        id: act.id,
        label: act.name || `Act ${act.sort_order + 1}`,
        icon: '🎭',
        isActive: isCurrentAct,
        depth: 2,
        metadata: `${(act.scenes || []).length} scene${(act.scenes || []).length !== 1 ? 's' : ''}`,
      })

      // Add scenes for current act (or all if expanded)
      if (isCurrentAct) {
        for (const scene of (act.scenes || [])) {
          const isCurrentScene = scene.id === currentScene?.id
          levels.push({
            type: 'scene',
            id: scene.id,
            label: scene.name || 'Untitled Scene',
            icon: '🎬',
            isActive: isCurrentScene,
            depth: 3,
            metadata: `${(scene.pages || []).length} page${(scene.pages || []).length !== 1 ? 's' : ''}`,
          })

          // Add pages for current scene
          if (isCurrentScene) {
            for (const page of (scene.pages || [])) {
              const isCurrentPage = page.id === selectedPageId
              const pageNum = page.page_number || 1
              const isLeftPage = pageNum % 2 === 0
              const pageType = page.page_type || 'SINGLE'
              const pageTypeLabel =
                pageType === 'SPLASH' ? ' (Splash)' :
                pageType === 'SPREAD_LEFT' || pageType === 'SPREAD_RIGHT' ? ' (Spread)' : ''

              levels.push({
                type: 'page',
                id: page.id,
                label: `Page ${pageNum}${pageTypeLabel}`,
                icon: '📄',
                isActive: isCurrentPage,
                depth: 4,
                metadata: isLeftPage ? '(L)' : '(R)',
                onClick: () => onSelectPage(page.id),
              })

              // Add panels for current page
              if (isCurrentPage && page.panels) {
                for (let i = 0; i < page.panels.length; i++) {
                  const panel = page.panels[i]
                  const isCurrentPanel = panel.id === selectedPanelId
                  const hasDialogue = (panel.dialogue_blocks || []).length > 0
                  const hasCaptions = (panel.captions || []).length > 0

                  let panelMeta = ''
                  if (hasDialogue && hasCaptions) panelMeta = '💬📝'
                  else if (hasDialogue) panelMeta = '💬'
                  else if (hasCaptions) panelMeta = '📝'
                  else panelMeta = '🖼️'

                  levels.push({
                    type: 'panel',
                    id: panel.id,
                    label: `Panel ${i + 1}`,
                    icon: panelMeta,
                    isActive: isCurrentPanel,
                    depth: 5,
                  })
                }
              }
            }
          }
        }
      }
    }

    return levels
  }, [seriesId, seriesTitle, issue, selectedPageId, selectedPanelId, onSelectPage])

  // Get sibling pages for quick navigation
  const siblingPages = useMemo(() => {
    if (!selectedPageId) return []

    for (const act of (issue.acts || [])) {
      for (const scene of (act.scenes || [])) {
        const pageIndex = (scene.pages || []).findIndex((p: any) => p.id === selectedPageId)
        if (pageIndex !== -1) {
          return (scene.pages || []).map((p: any) => ({
            id: p.id,
            pageNumber: p.page_number || 1,
            isLeft: (p.page_number || 1) % 2 === 0,
            pageType: p.page_type || 'SINGLE',
          }))
        }
      }
    }
    return []
  }, [issue.acts, selectedPageId])

  const currentPageIndex = siblingPages.findIndex((p: PageInfo) => p.id === selectedPageId)
  const prevPage = currentPageIndex > 0 ? siblingPages[currentPageIndex - 1] : null
  const nextPage = currentPageIndex < siblingPages.length - 1 ? siblingPages[currentPageIndex + 1] : null

  return (
    <div className="fixed right-4 top-20 z-50 w-72 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-sm">📍</span>
          <span className="font-medium text-sm">Context Ladder</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Hierarchy Tree */}
      <div className="max-h-80 overflow-y-auto py-2">
        {hierarchy.map((level, index) => (
          <div
            key={`${level.type}-${level.id}-${index}`}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm
              ${level.isActive ? 'bg-blue-500/20 text-blue-300' : 'text-[var(--text-secondary)]'}
              ${level.onClick ? 'cursor-pointer hover:bg-[var(--bg-tertiary)]' : ''}
            `}
            style={{ paddingLeft: `${12 + level.depth * 16}px` }}
            onClick={level.onClick}
          >
            {/* Connector line */}
            {level.depth > 0 && (
              <span className="text-[var(--text-muted)] opacity-30">└</span>
            )}
            <span>{level.icon}</span>
            <span className="truncate flex-1">{level.label}</span>
            {level.metadata && (
              <span className="text-xs text-[var(--text-muted)] shrink-0">{level.metadata}</span>
            )}
            {level.isActive && (
              <span className="text-blue-400 shrink-0">◀</span>
            )}
          </div>
        ))}
      </div>

      {/* Quick Navigation */}
      {selectedPageId && (
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-tertiary)]">
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => prevPage && onSelectPage(prevPage.id)}
              disabled={!prevPage}
              className={`px-2 py-1 rounded transition-colors ${
                prevPage
                  ? 'hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                  : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
              }`}
            >
              ◀ Prev Page
            </button>
            <span className="text-[var(--text-muted)]">
              {currentPageIndex + 1} / {siblingPages.length}
            </span>
            <button
              onClick={() => nextPage && onSelectPage(nextPage.id)}
              disabled={!nextPage}
              className={`px-2 py-1 rounded transition-colors ${
                nextPage
                  ? 'hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                  : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
              }`}
            >
              Next Page ▶
            </button>
          </div>
          <div className="mt-2 text-center text-xs text-[var(--text-muted)]">
            <kbd className="px-1 py-0.5 bg-[var(--bg-primary)] rounded">⌘↑</kbd> / <kbd className="px-1 py-0.5 bg-[var(--bg-primary)] rounded">⌘↓</kbd> Navigate
          </div>
        </div>
      )}
    </div>
  )
}
