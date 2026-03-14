'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchIssue, SearchMatch, replaceInText, highlightMatch } from '@/lib/search'
import { useToast } from '@/contexts/ToastContext'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { Tip } from '@/components/ui/Tip'

interface FindReplaceModalProps {
  issue: any
  isOpen: boolean
  onClose: () => void
  onNavigateToPanel: (pageId: string, panelId: string) => void
  onRefresh: () => void
}

export default function FindReplaceModal({
  issue,
  isOpen,
  onClose,
  onNavigateToPanel,
  onRefresh,
}: FindReplaceModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [isReplacing, setIsReplacing] = useState(false)
  const [showReplaceAllConfirm, setShowReplaceAllConfirm] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const focusTrapRef = useFocusTrap(isOpen)
  const { showToast } = useToast()

  // Dragging state
  const [position, setPosition] = useState({ x: -1, y: 80 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  // Initialize position on first open (right-aligned)
  useEffect(() => {
    if (isOpen && position.x === -1) {
      setPosition({ x: window.innerWidth - 480 - 16, y: 80 })
    }
  }, [isOpen, position.x])

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
      searchInputRef.current.select()
    }
  }, [isOpen])

  // Search when term or options change
  useEffect(() => {
    if (searchTerm.length >= 1) {
      const results = searchIssue(issue, searchTerm, { matchCase, wholeWord })
      setMatches(results)
      setCurrentMatchIndex(0)
    } else {
      setMatches([])
      setCurrentMatchIndex(0)
    }
  }, [searchTerm, matchCase, wholeWord, issue])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        if (showReplaceAllConfirm) {
          setShowReplaceAllConfirm(false)
        } else {
          onClose()
        }
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          handlePrevious()
        } else {
          handleNext()
        }
      } else if (e.key === 'F3' || (e.key === 'g' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        if (e.shiftKey) {
          handlePrevious()
        } else {
          handleNext()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, matches, currentMatchIndex, showReplaceAllConfirm])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-drag-handle]')) return

    setIsDragging(true)
    const rect = panelRef.current?.getBoundingClientRect()
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 480, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleNext = useCallback(() => {
    if (matches.length === 0) return
    const nextIndex = (currentMatchIndex + 1) % matches.length
    setCurrentMatchIndex(nextIndex)
    navigateToMatch(nextIndex)
  }, [matches, currentMatchIndex])

  const handlePrevious = useCallback(() => {
    if (matches.length === 0) return
    const prevIndex = currentMatchIndex === 0 ? matches.length - 1 : currentMatchIndex - 1
    setCurrentMatchIndex(prevIndex)
    navigateToMatch(prevIndex)
  }, [matches, currentMatchIndex])

  const navigateToMatch = (index: number) => {
    const match = matches[index]
    if (!match) return

    // Find the page ID for this panel
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          const panel = page.panels?.find((p: any) => p.id === match.panelId)
          if (panel) {
            onNavigateToPanel(page.id, match.panelId)
            return
          }
        }
      }
    }
  }

  const handleReplaceCurrent = async () => {
    if (matches.length === 0 || !replaceTerm) return
    const match = matches[currentMatchIndex]
    if (!match) return

    setIsReplacing(true)
    const supabase = createClient()

    try {
      const newText = replaceInText(match.text, searchTerm, replaceTerm, { matchCase, wholeWord })

      // Update the appropriate field based on match type
      if (match.type === 'visual_description') {
        await supabase
          .from('panels')
          .update({ visual_description: newText })
          .eq('id', match.panelId)
      } else if (match.type === 'notes') {
        await supabase
          .from('panels')
          .update({ notes: newText })
          .eq('id', match.panelId)
      } else if (match.type === 'dialogue' && match.dialogueBlockId) {
        await supabase
          .from('dialogue_blocks')
          .update({ text: newText })
          .eq('id', match.dialogueBlockId)
      } else if (match.type === 'caption' && match.captionId) {
        await supabase
          .from('captions')
          .update({ text: newText })
          .eq('id', match.captionId)
      } else if (match.type === 'sfx' && match.sfxId) {
        await supabase
          .from('sound_effects')
          .update({ text: newText })
          .eq('id', match.sfxId)
      }

      showToast('Replaced 1 match', 'success')
      onRefresh()
    } catch (error) {
      showToast('Failed to replace', 'error')
    } finally {
      setIsReplacing(false)
    }
  }

  const handleReplaceAll = async () => {
    if (matches.length === 0 || !replaceTerm) return

    setIsReplacing(true)
    setShowReplaceAllConfirm(false)
    const supabase = createClient()
    let replacedCount = 0

    try {
      // Group matches by their target
      const panelUpdates = new Map<string, { visual_description?: string; notes?: string }>()
      const dialogueUpdates = new Map<string, string>()
      const captionUpdates = new Map<string, string>()
      const sfxUpdates = new Map<string, string>()

      for (const match of matches) {
        const newText = replaceInText(match.text, searchTerm, replaceTerm, { matchCase, wholeWord })

        if (match.type === 'visual_description') {
          const existing = panelUpdates.get(match.panelId) || {}
          panelUpdates.set(match.panelId, { ...existing, visual_description: newText })
          replacedCount++
        } else if (match.type === 'notes') {
          const existing = panelUpdates.get(match.panelId) || {}
          panelUpdates.set(match.panelId, { ...existing, notes: newText })
          replacedCount++
        } else if (match.type === 'dialogue' && match.dialogueBlockId) {
          dialogueUpdates.set(match.dialogueBlockId, newText)
          replacedCount++
        } else if (match.type === 'caption' && match.captionId) {
          captionUpdates.set(match.captionId, newText)
          replacedCount++
        } else if (match.type === 'sfx' && match.sfxId) {
          sfxUpdates.set(match.sfxId, newText)
          replacedCount++
        }
      }

      // Execute all updates
      for (const [panelId, update] of panelUpdates) {
        await supabase.from('panels').update(update).eq('id', panelId)
      }

      for (const [dialogueId, text] of dialogueUpdates) {
        await supabase.from('dialogue_blocks').update({ text }).eq('id', dialogueId)
      }

      for (const [captionId, text] of captionUpdates) {
        await supabase.from('captions').update({ text }).eq('id', captionId)
      }

      for (const [sfxId, text] of sfxUpdates) {
        await supabase.from('sound_effects').update({ text }).eq('id', sfxId)
      }

      showToast(`Replaced ${replacedCount} matches`, 'success')
      setMatches([])
      setSearchTerm('')
      setReplaceTerm('')
      onRefresh()
    } catch (error) {
      showToast('Failed to replace all', 'error')
    } finally {
      setIsReplacing(false)
    }
  }

  if (!isOpen) return null

  const currentMatch = matches[currentMatchIndex]

  return (
    <>
      {/* Floating panel - no backdrop, allows editing underneath */}
      <div
        ref={(node) => {
          // Assign to both panelRef (drag) and focusTrapRef (focus trapping)
          (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          (focusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        role="dialog"
        aria-label="Find and Replace"
        className="fixed z-50 bg-[var(--bg-secondary)] rounded-lg shadow-xl w-[460px] border border-[var(--border)]"
        style={{
          left: position.x,
          top: position.y,
          cursor: isDragging ? 'grabbing' : undefined,
        }}
        onMouseDown={handleDragStart}
      >
        {/* Draggable header */}
        <div
          data-drag-handle
          className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Find & Replace</span>
            {matches.length > 0 && (
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {currentMatchIndex + 1}/{matches.length}
              </span>
            )}
            {searchTerm && matches.length === 0 && (
              <span className="text-xs text-[var(--text-muted)]">No matches</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none px-1"
            aria-label="Close find and replace"
          >
            x
          </button>
        </div>

        {/* Compact search area */}
        <div className="p-3 space-y-2">
          {/* Find row */}
          <div className="flex gap-1.5 items-center">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Find..."
              className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <Tip content="Previous (Shift+Enter)">
              <button
                onClick={handlePrevious}
                disabled={matches.length === 0}
                className="px-2 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded text-sm hover-glow disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous match"
              >
                ↑
              </button>
            </Tip>
            <Tip content="Next (Enter)">
              <button
                onClick={handleNext}
                disabled={matches.length === 0}
                className="px-2 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded text-sm hover-glow disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next match"
              >
                ↓
              </button>
            </Tip>
          </div>

          {/* Replace row */}
          <div className="flex gap-1.5 items-center">
            <input
              type="text"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              placeholder="Replace..."
              className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <Tip content="Replace current match">
              <button
                onClick={handleReplaceCurrent}
                disabled={matches.length === 0 || !replaceTerm || isReplacing}
                className="px-2 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded text-xs hover-lift disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Replace
              </button>
            </Tip>
            <Tip content="Replace all matches">
              <button
                onClick={() => setShowReplaceAllConfirm(true)}
                disabled={matches.length === 0 || !replaceTerm || isReplacing}
                className="px-2 py-1.5 bg-[var(--color-primary)] hover:opacity-90 rounded text-xs hover-lift disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                All ({matches.length})
              </button>
            </Tip>
          </div>

          {/* Options row */}
          <div className="flex gap-3 pt-0.5">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--border)] bg-[var(--bg-tertiary)]"
              />
              Case
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--border)] bg-[var(--bg-tertiary)]"
              />
              Whole word
            </label>
          </div>
        </div>

        {/* Current match preview */}
        {currentMatch && (
          <div className="px-3 pb-3 border-t border-[var(--border)] pt-2">
            <div className="text-[10px] text-[var(--text-muted)] mb-1">
              Act {currentMatch.actNumber} / Page {currentMatch.pageNumber} / Panel {currentMatch.panelNumber}
              <span className="mx-1">-</span>
              {currentMatch.fieldName}
            </div>
            <div className="text-xs bg-[var(--bg-tertiary)] rounded px-2 py-1.5 font-mono break-words leading-relaxed">
              {(() => {
                const { before, match, after } = highlightMatch(
                  currentMatch.text,
                  currentMatch.matchStart,
                  currentMatch.matchEnd
                )
                const maxContext = 40
                const displayBefore = before.length > maxContext ? '...' + before.slice(-maxContext) : before
                const displayAfter = after.length > maxContext ? after.slice(0, maxContext) + '...' : after
                return (
                  <>
                    <span className="text-[var(--text-secondary)]">{displayBefore}</span>
                    <span className="bg-[var(--color-warning)]/30 text-[var(--color-warning)] px-0.5 rounded">{match}</span>
                    <span className="text-[var(--text-secondary)]">{displayAfter}</span>
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Replace All confirmation dialog */}
      {showReplaceAllConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowReplaceAllConfirm(false)} />
          <div className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl border border-[var(--border)] p-5 max-w-sm w-full mx-4">
            <h3 className="text-sm font-semibold mb-2">Replace All?</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              This will replace <strong>{matches.length}</strong> occurrence{matches.length !== 1 ? 's' : ''} of
              {' '}<span className="font-mono text-[var(--color-warning)]">&quot;{searchTerm}&quot;</span> with
              {' '}<span className="font-mono text-[var(--color-primary)]">&quot;{replaceTerm}&quot;</span>.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReplaceAllConfirm(false)}
                className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleReplaceAll}
                className="px-3 py-1.5 text-sm bg-[var(--color-primary)] hover:opacity-90 rounded"
              >
                Replace All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
