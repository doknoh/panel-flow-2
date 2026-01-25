'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchIssue, SearchMatch, replaceInText, highlightMatch } from '@/lib/search'
import { useToast } from '@/contexts/ToastContext'

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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

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
        onClose()
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
  }, [isOpen, matches, currentMatchIndex])

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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-zinc-900 rounded-lg shadow-xl w-full max-w-2xl border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="text-lg font-semibold">Find and Replace</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Search inputs */}
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-zinc-400 mb-1">Find</label>
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search text..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handlePrevious}
                disabled={matches.length === 0}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous (Shift+Enter)"
              >
                ↑
              </button>
              <button
                onClick={handleNext}
                disabled={matches.length === 0}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next (Enter)"
              >
                ↓
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Replace with</label>
            <input
              type="text"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              placeholder="Replacement text..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
              />
              Match case
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
              />
              Whole word
            </label>
          </div>
        </div>

        {/* Results count */}
        <div className="px-4 py-2 bg-zinc-800/50 border-t border-b border-zinc-700">
          {matches.length > 0 ? (
            <span className="text-sm text-zinc-300">
              {currentMatchIndex + 1} of {matches.length} matches
            </span>
          ) : searchTerm ? (
            <span className="text-sm text-zinc-500">No matches found</span>
          ) : (
            <span className="text-sm text-zinc-500">Enter search term</span>
          )}
        </div>

        {/* Current match preview */}
        {currentMatch && (
          <div className="p-4 border-b border-zinc-700">
            <div className="text-xs text-zinc-500 mb-1">
              Act {currentMatch.actNumber} • Page {currentMatch.pageNumber} • Panel {currentMatch.panelNumber}
              <span className="text-zinc-600 mx-1">•</span>
              {currentMatch.fieldName}
            </div>
            <div className="text-sm bg-zinc-800 rounded p-2 font-mono break-words">
              {(() => {
                const { before, match, after } = highlightMatch(
                  currentMatch.text,
                  currentMatch.matchStart,
                  currentMatch.matchEnd
                )
                // Truncate for display
                const maxContext = 50
                const displayBefore = before.length > maxContext ? '...' + before.slice(-maxContext) : before
                const displayAfter = after.length > maxContext ? after.slice(0, maxContext) + '...' : after
                return (
                  <>
                    <span className="text-zinc-400">{displayBefore}</span>
                    <span className="bg-yellow-500/30 text-yellow-200 px-0.5 rounded">{match}</span>
                    <span className="text-zinc-400">{displayAfter}</span>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Close
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleReplaceCurrent}
              disabled={matches.length === 0 || !replaceTerm || isReplacing}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={matches.length === 0 || !replaceTerm || isReplacing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Replace All ({matches.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
