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

  // Compute global page numbers from sort order (not stale DB values)
  const pageNumberMap = useMemo(() => {
    const map = new Map<string, number>()
    let position = 1
    const sortedActs = [...(issue.acts || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    for (const act of sortedActs) {
      const sortedScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
      for (const scene of sortedScenes) {
        const sortedPages = [...(scene.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
        for (const page of sortedPages) {
          map.set(page.id, position)
          position++
        }
      }
    }
    return map
  }, [issue])

  const selectedPage = useMemo(() => {
    if (!selectedPageId) return null
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = scene.pages?.find((p: any) => p.id === selectedPageId)
        if (page) {
          const computed = pageNumberMap.get(page.id)
          if (computed !== undefined) {
            return { ...page, page_number: computed }
          }
          return page
        }
      }
    }
    return null
  }, [issue, selectedPageId, pageNumberMap])

  return (
    <div className="h-8 bg-[var(--bg-primary)] border-t border-[var(--text-primary)] px-4 flex items-center justify-between type-meta shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Left side - Page stats */}
      <div className="flex items-center gap-3">
        {selectedPage && (
          <>
            <span>
              PG: {String(selectedPage.page_number).padStart(2, '0')}
              <span className="type-separator">{'\/\/'}</span>
              PNL: {stats.pagePanels}
              <span className="type-separator">{'\/\/'}</span>
              WRD: {stats.pageWords.toLocaleString()}
              <span className="type-separator">{'\/\/'}</span>
              CHR: {stats.pageCharacters.toLocaleString()}
            </span>
          </>
        )}
      </div>

      {/* Center - Undo/Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`px-2 py-0.5 type-micro font-mono flex items-center gap-1 transition-all duration-150 ease-out border ${
            canUndo
              ? 'border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] active:scale-[0.97]'
              : 'border-transparent text-[var(--text-disabled)] cursor-not-allowed'
          }`}
          title="Undo (⌘Z)"
          aria-label={`Undo${undoStack.length > 0 ? ` (${undoStack.length} actions available)` : ''}`}
        >
          [UNDO{undoStack.length > 0 ? ` ${undoStack.length}` : ''}]
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={`px-2 py-0.5 type-micro font-mono flex items-center gap-1 transition-all duration-150 ease-out border ${
            canRedo
              ? 'border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] active:scale-[0.97]'
              : 'border-transparent text-[var(--text-disabled)] cursor-not-allowed'
          }`}
          title="Redo (⌘⇧Z)"
          aria-label={`Redo${redoStack.length > 0 ? ` (${redoStack.length} actions available)` : ''}`}
        >
          [REDO{redoStack.length > 0 ? ` ${redoStack.length}` : ''}]
        </button>
      </div>

      {/* Right side - Issue stats and save status */}
      <div className="flex items-center gap-3">
        <span>
          ISSUE: {stats.totalPages} PGS
          <span className="type-separator">{'\/\/'}</span>
          {stats.totalPanels} PNLS
          <span className="type-separator">{'\/\/'}</span>
          {stats.issueWords.toLocaleString()} WRDS
        </span>
        <span className="type-separator">{'\/\/'}</span>
        <span
          role="status"
          aria-live="polite"
          aria-label={`Save status: ${saveStatus === 'saved' ? 'All changes saved' : saveStatus === 'saving' ? 'Saving changes' : 'Unsaved changes'}`}
          className={`flex items-center gap-1.5 ${
            saveStatus === 'saved' ? 'text-[var(--color-success)]' :
            saveStatus === 'saving' ? 'text-[var(--color-warning)]' :
            'text-[var(--color-error)]'
          }`}
        >
          {saveStatus === 'saved' && (
            <>
              <span className="inline-block w-[3px] h-[3px] bg-[var(--color-success)]" aria-hidden="true" />
              SYNC: SAVED
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <span className="inline-block w-[3px] h-[3px] bg-[var(--color-warning)] animate-pulse" aria-hidden="true" />
              SYNC: ACTIVE
            </>
          )}
          {saveStatus === 'unsaved' && (
            <>
              <span className="inline-block w-[3px] h-[3px] bg-[var(--color-error)]" aria-hidden="true" />
              SYNC: PENDING
            </>
          )}
        </span>
      </div>
    </div>
  )
}
