'use client'

import { useMemo } from 'react'
import { useUndo } from '@/contexts/UndoContext'

interface StatusBarProps {
  issue: any
  selectedPageId: string | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(word => word.length > 0).length
}

function countCharacters(text: string | null | undefined): number {
  if (!text) return 0
  return text.length
}

export default function StatusBar({ issue, selectedPageId, saveStatus }: StatusBarProps) {
  const { canUndo, canRedo, undo, redo, undoStack, redoStack } = useUndo()
  const stats = useMemo(() => {
    let issueWords = 0
    let issueCharacters = 0
    let pageWords = 0
    let pageCharacters = 0
    let totalPanels = 0
    let totalPages = 0
    let pagePanels = 0

    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          totalPages++
          const isSelectedPage = page.id === selectedPageId

          for (const panel of page.panels || []) {
            totalPanels++
            if (isSelectedPage) pagePanels++

            // Count visual description words
            const descWords = countWords(panel.visual_description)
            const descChars = countCharacters(panel.visual_description)
            issueWords += descWords
            issueCharacters += descChars
            if (isSelectedPage) {
              pageWords += descWords
              pageCharacters += descChars
            }

            // Count dialogue words
            for (const dialogue of panel.dialogue_blocks || []) {
              const dlgWords = countWords(dialogue.text)
              const dlgChars = countCharacters(dialogue.text)
              issueWords += dlgWords
              issueCharacters += dlgChars
              if (isSelectedPage) {
                pageWords += dlgWords
                pageCharacters += dlgChars
              }
            }

            // Count caption words
            for (const caption of panel.captions || []) {
              const capWords = countWords(caption.text)
              const capChars = countCharacters(caption.text)
              issueWords += capWords
              issueCharacters += capChars
              if (isSelectedPage) {
                pageWords += capWords
                pageCharacters += capChars
              }
            }

            // Count SFX words
            for (const sfx of panel.sound_effects || []) {
              const sfxWords = countWords(sfx.text)
              const sfxChars = countCharacters(sfx.text)
              issueWords += sfxWords
              issueCharacters += sfxChars
              if (isSelectedPage) {
                pageWords += sfxWords
                pageCharacters += sfxChars
              }
            }
          }
        }
      }
    }

    return {
      issueWords,
      issueCharacters,
      pageWords,
      pageCharacters,
      totalPanels,
      totalPages,
      pagePanels,
    }
  }, [issue, selectedPageId])

  const selectedPage = useMemo(() => {
    if (!selectedPageId) return null
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = scene.pages?.find((p: any) => p.id === selectedPageId)
        if (page) return page
      }
    }
    return null
  }, [issue, selectedPageId])

  return (
    <div className="h-8 bg-[var(--bg-secondary)] border-t border-[var(--border)] px-4 flex items-center justify-between text-xs text-[var(--text-secondary)] shrink-0">
      {/* Left side - Page stats */}
      <div className="flex items-center gap-4">
        {selectedPage && (
          <>
            <span>
              Page {selectedPage.page_number}
              <span className="text-[var(--text-muted)] mx-1">•</span>
              {stats.pagePanels} panel{stats.pagePanels !== 1 ? 's' : ''}
            </span>
            <span className="text-[var(--text-muted)]">|</span>
            <span>
              {stats.pageWords.toLocaleString()} words
              <span className="text-[var(--text-muted)] mx-1">•</span>
              {stats.pageCharacters.toLocaleString()} chars
            </span>
          </>
        )}
      </div>

      {/* Center - Undo/Redo */}
      <div className="flex items-center gap-2">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
            canUndo
              ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
              : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed'
          }`}
          title="Undo (⌘Z)"
        >
          ↩ Undo
          {undoStack.length > 0 && (
            <span className="text-[var(--text-muted)]">({undoStack.length})</span>
          )}
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
            canRedo
              ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
              : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed'
          }`}
          title="Redo (⌘⇧Z)"
        >
          ↪ Redo
          {redoStack.length > 0 && (
            <span className="text-[var(--text-muted)]">({redoStack.length})</span>
          )}
        </button>
      </div>

      {/* Right side - Issue stats and save status */}
      <div className="flex items-center gap-4">
        <span>
          Issue: {stats.totalPages} page{stats.totalPages !== 1 ? 's' : ''}
          <span className="text-[var(--text-muted)] mx-1">•</span>
          {stats.totalPanels} panel{stats.totalPanels !== 1 ? 's' : ''}
          <span className="text-[var(--text-muted)] mx-1">•</span>
          {stats.issueWords.toLocaleString()} words
        </span>
        <span className="text-[var(--text-muted)]">|</span>
        <span className={`flex items-center gap-1 ${
          saveStatus === 'saved' ? 'text-green-500' :
          saveStatus === 'saving' ? 'text-yellow-500' :
          'text-red-500'
        }`}>
          {saveStatus === 'saved' && (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              Saved
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              Saving...
            </>
          )}
          {saveStatus === 'unsaved' && (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              Unsaved
            </>
          )}
        </span>
      </div>
    </div>
  )
}
