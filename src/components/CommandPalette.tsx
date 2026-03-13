'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandPalette, CommandPaletteResult } from '@/hooks/useCommandPalette'
import { useTheme } from '@/contexts/ThemeContext'

interface CommandPaletteProps {
  seriesId: string
  issueId?: string
}

const TYPE_LABELS: Record<CommandPaletteResult['type'], string> = {
  action: 'Actions',
  issue: 'Issues',
  character: 'Characters',
  location: 'Locations',
  plotline: 'Plotlines',
}

const TYPE_ORDER: CommandPaletteResult['type'][] = [
  'action',
  'issue',
  'character',
  'location',
  'plotline',
]

function TypeIcon({ type }: { type: CommandPaletteResult['type'] }) {
  const className = 'w-4 h-4 flex-shrink-0'

  switch (type) {
    case 'action':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    case 'issue':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    case 'character':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    case 'location':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    case 'plotline':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      )
  }
}

export default function CommandPalette({ seriesId, issueId }: CommandPaletteProps) {
  const router = useRouter()
  const { toggleTheme } = useTheme()
  const {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    results,
    selectedIndex,
    setSelectedIndex,
  } = useCommandPalette(seriesId)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Build a flat list of items with group headers for keyboard navigation
  const flatItems: CommandPaletteResult[] = results
  const groupedResults = groupByType(results)

  // Handle item selection
  const handleSelect = useCallback(
    (item: CommandPaletteResult) => {
      setIsOpen(false)

      if (item.id === 'toggle-theme') {
        toggleTheme()
        return
      }

      if (item.href) {
        router.push(item.href)
      }
    },
    [setIsOpen, toggleTheme, router]
  )

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatItems[selectedIndex]) {
            handleSelect(flatItems[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, flatItems, selectedIndex, setSelectedIndex, setIsOpen, handleSelect])

  if (!isOpen) return null

  // Build the flat index counter for rendering
  let flatIndex = -1

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] z-50 modal-backdrop"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-xl overflow-hidden shadow-2xl border border-[var(--border)] modal-dialog"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <svg
            className="w-5 h-5 flex-shrink-0 text-[var(--text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues, characters, locations, actions..."
            className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)] border border-[var(--border)] rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && query.trim() ? (
            <div className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            TYPE_ORDER.map((type) => {
              const items = groupedResults[type]
              if (!items || items.length === 0) return null

              return (
                <div key={type}>
                  {/* Group header */}
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {TYPE_LABELS[type]}
                    </span>
                  </div>

                  {/* Items */}
                  {items.map((item) => {
                    flatIndex++
                    const itemIndex = flatIndex
                    const isSelected = itemIndex === selectedIndex

                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        data-selected={isSelected}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={`w-full px-4 py-2 flex items-center gap-3 text-left transition-colors hover-glow ${
                          isSelected
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                        }`}
                      >
                        <span className={isSelected ? 'text-white/80' : 'text-[var(--text-muted)]'}>
                          <TypeIcon type={item.type} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {item.label}
                          </div>
                          {item.sublabel && (
                            <div
                              className={`text-xs truncate ${
                                isSelected ? 'text-white/60' : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {item.sublabel}
                            </div>
                          )}
                        </div>
                        {item.type === 'action' && !item.href && (
                          <span
                            className={`text-xs ${
                              isSelected ? 'text-white/50' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            action
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded font-mono">
              &uarr;&darr;
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded font-mono">
              &crarr;
            </kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded font-mono">
              esc
            </kbd>
            close
          </span>
        </div>
      </div>
    </div>
  )
}

/** Group results by type, preserving order within each group */
function groupByType(
  results: CommandPaletteResult[]
): Partial<Record<CommandPaletteResult['type'], CommandPaletteResult[]>> {
  const groups: Partial<Record<CommandPaletteResult['type'], CommandPaletteResult[]>> = {}

  for (const item of results) {
    if (!groups[item.type]) {
      groups[item.type] = []
    }
    groups[item.type]!.push(item)
  }

  return groups
}
