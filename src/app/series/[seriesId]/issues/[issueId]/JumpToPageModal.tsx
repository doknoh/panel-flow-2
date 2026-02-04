'use client'

import { useState, useEffect, useRef } from 'react'

interface Page {
  id: string
  pageNumber: number
  sceneName: string
  actName: string
}

interface JumpToPageModalProps {
  isOpen: boolean
  onClose: () => void
  pages: Page[]
  onSelectPage: (pageId: string) => void
  currentPageId: string | null
}

export default function JumpToPageModal({
  isOpen,
  onClose,
  pages,
  onSelectPage,
  currentPageId,
}: JumpToPageModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter pages based on search
  const filteredPages = pages.filter(page => {
    const query = searchQuery.toLowerCase()
    return (
      page.pageNumber.toString().includes(query) ||
      page.sceneName.toLowerCase().includes(query) ||
      page.actName.toLowerCase().includes(query)
    )
  })

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, filteredPages.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredPages[selectedIndex]) {
            onSelectPage(filteredPages[selectedIndex].id)
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredPages, selectedIndex, onSelectPage, onClose])

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-full max-w-md mx-4 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="p-3 border-b border-[var(--border)]">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Jump to page... (type page number or scene name)"
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Results list */}
        <div className="max-h-[40vh] overflow-y-auto">
          {filteredPages.length === 0 ? (
            <div className="p-4 text-center text-[var(--text-muted)] text-sm">
              No pages found
            </div>
          ) : (
            <div className="py-1">
              {filteredPages.map((page, index) => (
                <button
                  key={page.id}
                  onClick={() => {
                    onSelectPage(page.id)
                    onClose()
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center gap-3 transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-600/30 text-white'
                      : 'hover:bg-[var(--bg-tertiary)]'
                  } ${page.id === currentPageId ? 'border-l-2 border-blue-500' : ''}`}
                >
                  <span className="font-mono text-sm font-medium w-8 text-center bg-[var(--bg-tertiary)] rounded py-0.5">
                    {page.pageNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{page.sceneName}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate">{page.actName}</div>
                  </div>
                  {page.id === currentPageId && (
                    <span className="text-xs text-blue-400">current</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="p-2 border-t border-[var(--border)] flex items-center justify-center gap-4 text-xs text-[var(--text-muted)]">
          <span><kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded">↑↓</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded">↵</kbd> select</span>
          <span><kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
