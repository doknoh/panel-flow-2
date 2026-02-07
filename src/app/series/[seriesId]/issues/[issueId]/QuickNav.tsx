'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

interface Page {
  id: string
  page_number: number
  sort_order: number
  panels: Array<{
    id: string
    panel_number: number
    visual_description: string | null
    dialogue_blocks: Array<{
      character?: { name: string } | null
      text: string | null
    }>
  }>
}

interface Scene {
  id: string
  title: string | null
  pages: Page[]
}

interface Act {
  id: string
  name: string | null
  scenes: Scene[]
}

interface QuickNavProps {
  acts: Act[]
  currentSelection: {
    actId: string | null
    sceneId: string | null
    pageId: string | null
    panelId: string | null
  }
  onNavigate: (type: 'act' | 'scene' | 'page' | 'panel', id: string) => void
  isOpen: boolean
  onClose: () => void
}

interface NavItem {
  type: 'act' | 'scene' | 'page' | 'panel'
  id: string
  label: string
  sublabel?: string
  indent: number
  pageNumber?: number
  panelNumber?: number
}

export default function QuickNav({
  acts,
  currentSelection,
  onNavigate,
  isOpen,
  onClose,
}: QuickNavProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build flat list of all navigable items
  const allItems = useMemo((): NavItem[] => {
    const items: NavItem[] = []

    for (const act of acts) {
      items.push({
        type: 'act',
        id: act.id,
        label: act.name || 'Unnamed Act',
        indent: 0,
      })

      for (const scene of act.scenes || []) {
        items.push({
          type: 'scene',
          id: scene.id,
          label: scene.title || 'Unnamed Scene',
          sublabel: act.name || 'Unnamed Act',
          indent: 1,
        })

        for (const page of scene.pages || []) {
          items.push({
            type: 'page',
            id: page.id,
            label: `Page ${page.page_number}`,
            sublabel: `${page.panels.length} panel${page.panels.length !== 1 ? 's' : ''}`,
            indent: 2,
            pageNumber: page.page_number,
          })

          for (const panel of page.panels || []) {
            // Get first dialogue or visual description preview
            const preview = panel.dialogue_blocks?.[0]?.text
              || panel.visual_description
              || 'No content'

            items.push({
              type: 'panel',
              id: panel.id,
              label: `P${page.page_number}:${panel.panel_number}`,
              sublabel: preview.slice(0, 50) + (preview.length > 50 ? '...' : ''),
              indent: 3,
              pageNumber: page.page_number,
              panelNumber: panel.panel_number,
            })
          }
        }
      }
    }

    return items
  }, [acts])

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems

    const lowerQuery = query.toLowerCase()

    // Special queries
    if (lowerQuery.startsWith('p')) {
      // Page number search (e.g., "p5" or "page 5")
      const pageMatch = lowerQuery.match(/^p(?:age)?\s*(\d+)/)
      if (pageMatch) {
        const pageNum = parseInt(pageMatch[1])
        return allItems.filter(item =>
          item.pageNumber === pageNum
        )
      }
    }

    if (lowerQuery.startsWith('panel') || lowerQuery.match(/^\d+:\d+/)) {
      // Panel search (e.g., "panel 3" or "5:2")
      const panelMatch = lowerQuery.match(/(\d+):(\d+)/) || lowerQuery.match(/panel\s*(\d+)/)
      if (panelMatch) {
        if (panelMatch[2]) {
          // Page:Panel format
          const pageNum = parseInt(panelMatch[1])
          const panelNum = parseInt(panelMatch[2])
          return allItems.filter(item =>
            item.pageNumber === pageNum && item.panelNumber === panelNum
          )
        } else {
          // Just panel number
          const panelNum = parseInt(panelMatch[1])
          return allItems.filter(item =>
            item.type === 'panel' && item.panelNumber === panelNum
          )
        }
      }
    }

    // General text search
    return allItems.filter(item =>
      item.label.toLowerCase().includes(lowerQuery) ||
      item.sublabel?.toLowerCase().includes(lowerQuery)
    )
  }, [allItems, query])

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredItems])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          const item = filteredItems[selectedIndex]
          onNavigate(item.type, item.id)
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredItems, selectedIndex, onNavigate, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="border-b border-[var(--border)]">
          <div className="flex items-center px-4 py-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--text-muted)] mr-3"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Jump to page, panel, or scene... (e.g., 'p5', '3:2', 'scene')"
              className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto"
        >
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--text-muted)]">
              No results found
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => {
                  onNavigate(item.type, item.id)
                  onClose()
                }}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-[var(--bg-secondary)]'
                }`}
                style={{ paddingLeft: `${1 + item.indent * 1}rem` }}
              >
                <span className={`text-xs font-mono uppercase ${
                  index === selectedIndex ? 'text-blue-200' : 'text-[var(--text-muted)]'
                }`}>
                  {item.type === 'act' && '📑'}
                  {item.type === 'scene' && '🎬'}
                  {item.type === 'page' && '📄'}
                  {item.type === 'panel' && '🖼'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.label}</div>
                  {item.sublabel && (
                    <div className={`text-xs truncate ${
                      index === selectedIndex ? 'text-blue-200' : 'text-[var(--text-secondary)]'
                    }`}>
                      {item.sublabel}
                    </div>
                  )}
                </div>
                {item.type === 'panel' && (
                  <span className={`text-xs ${
                    index === selectedIndex ? 'text-blue-200' : 'text-[var(--text-muted)]'
                  }`}>
                    Page {item.pageNumber}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t border-[var(--border)] px-4 py-2 flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span>
            <kbd className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded">↑↓</kbd> Navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded">Enter</kbd> Select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded">Esc</kbd> Close
          </span>
          <span className="ml-auto">
            Try: <code className="text-blue-400">p5</code>, <code className="text-blue-400">3:2</code>, <code className="text-blue-400">scene name</code>
          </span>
        </div>
      </div>
    </div>
  )
}
