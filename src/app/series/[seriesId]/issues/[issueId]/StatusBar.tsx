'use client'

import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { useUndo } from '@/contexts/UndoContext'
import { createClient } from '@/lib/supabase/client'
import { type WritingPhase, PHASE_LABELS } from '@/lib/ai/phases'
import { Tip } from '@/components/ui/Tip'

const WRITING_PHASES: WritingPhase[] = [
  'ideation', 'structure', 'weave', 'page_craft', 'drafting', 'editing', 'art_prompts',
]

const BALLOON_WORD_LIMIT = 35

interface StatusBarProps {
  issue: any
  issueId: string
  selectedPageId: string | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
  writingPhase: string | null
  onPhaseChange: (phase: string) => void
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(word => word.length > 0).length
}

function countCharacters(text: string | null | undefined): number {
  if (!text) return 0
  return text.length
}

export default function StatusBar({ issue, issueId, selectedPageId, saveStatus, writingPhase, onPhaseChange }: StatusBarProps) {
  const { canUndo, canRedo, undo, redo, undoStack, redoStack } = useUndo()
  const prevSaveStatusRef = useRef(saveStatus)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [isPhaseOpen, setIsPhaseOpen] = useState(false)
  const phaseRef = useRef<HTMLDivElement>(null)

  // Detect saving → saved transition for micro-animation
  useEffect(() => {
    if (prevSaveStatusRef.current === 'saving' && saveStatus === 'saved') {
      setShowSaveConfirm(true)
      const timer = setTimeout(() => setShowSaveConfirm(false), 400)
      return () => clearTimeout(timer)
    }
    prevSaveStatusRef.current = saveStatus
  }, [saveStatus])

  // Close phase dropdown on outside click
  useEffect(() => {
    if (!isPhaseOpen) return
    function handleClick(e: MouseEvent) {
      if (phaseRef.current && !phaseRef.current.contains(e.target as Node)) {
        setIsPhaseOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isPhaseOpen])

  const handlePhaseSelect = useCallback(async (phase: WritingPhase) => {
    setIsPhaseOpen(false)
    onPhaseChange(phase)
    const supabase = createClient()
    await supabase.from('issues').update({ writing_phase: phase }).eq('id', issueId)
  }, [issueId, onPhaseChange])

  const stats = useMemo(() => {
    let issueWords = 0
    let issueCharacters = 0
    let pageWords = 0
    let pageCharacters = 0
    let totalPanels = 0
    let totalPages = 0
    let pagePanels = 0
    let maxBalloonWords = 0

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

            // Count dialogue words + track max balloon
            for (const dialogue of panel.dialogue_blocks || []) {
              const dlgWords = countWords(dialogue.text)
              const dlgChars = countCharacters(dialogue.text)
              issueWords += dlgWords
              issueCharacters += dlgChars
              if (isSelectedPage) {
                pageWords += dlgWords
                pageCharacters += dlgChars
                if (dlgWords > maxBalloonWords) maxBalloonWords = dlgWords
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
      maxBalloonWords,
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

  const currentPhase = (writingPhase || 'drafting') as WritingPhase
  const phaseLabel = PHASE_LABELS[currentPhase]
  const balloonOverLimit = stats.maxBalloonWords > BALLOON_WORD_LIMIT

  return (
    <div className="h-8 bg-[var(--bg-primary)] border-t border-[var(--text-primary)] px-4 flex items-center justify-between type-meta shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* Left side - Phase selector + Page stats */}
      <div className="flex items-center gap-3">
        {/* Phase selector */}
        <div ref={phaseRef} className="relative">
          <Tip content="Writing phase" side="top">
            <button
              onClick={() => setIsPhaseOpen(!isPhaseOpen)}
              className="hover-glow px-2 py-0.5 type-micro font-mono border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] active:scale-[0.97]"
            >
              [{phaseLabel.short}]
            </button>
          </Tip>
          {isPhaseOpen && (
            <div className="absolute bottom-full left-0 mb-1 bg-[var(--bg-primary)] border border-[var(--border-strong)] shadow-lg z-50 min-w-[160px]">
              {WRITING_PHASES.map((phase) => {
                const label = PHASE_LABELS[phase]
                const isActive = phase === currentPhase
                return (
                  <button
                    key={phase}
                    onClick={() => handlePhaseSelect(phase)}
                    className={`w-full px-3 py-1.5 text-left type-micro font-mono transition-colors ${
                      isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="inline-block w-8">{label.short}</span>
                    <span className="text-[var(--text-tertiary)]">{label.full}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selectedPage && (
          <span>
            PG: {String(selectedPage.page_number).padStart(2, '0')}
            <span className="type-separator">{'\/\/'}</span>
            PNL: {stats.pagePanels}
            <span className="type-separator">{'\/\/'}</span>
            WRD: {stats.pageWords.toLocaleString()}
            {stats.maxBalloonWords > 0 && (
              <>
                <span className="type-separator">{'\/\/'}</span>
                <span className={balloonOverLimit ? 'text-[var(--color-warning)]' : ''}>
                  BLN: {stats.maxBalloonWords}w
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Center - Undo/Redo */}
      <div className="flex items-center gap-1">
        <Tip content="Undo (⌘Z)">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`hover-fade px-2 py-0.5 type-micro font-mono flex items-center gap-1 transition-all duration-150 ease-out border ${
              canUndo
                ? 'border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] active:scale-[0.97]'
                : 'border-transparent text-[var(--text-disabled)] cursor-not-allowed'
            }`}
            aria-label={`Undo${undoStack.length > 0 ? ` (${undoStack.length} actions available)` : ''}`}
          >
            [UNDO{undoStack.length > 0 ? ` ${undoStack.length}` : ''}]
          </button>
        </Tip>
        <Tip content="Redo (⌘⇧Z)">
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`hover-fade px-2 py-0.5 type-micro font-mono flex items-center gap-1 transition-all duration-150 ease-out border ${
              canRedo
                ? 'border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] active:scale-[0.97]'
                : 'border-transparent text-[var(--text-disabled)] cursor-not-allowed'
            }`}
            aria-label={`Redo${redoStack.length > 0 ? ` (${redoStack.length} actions available)` : ''}`}
          >
            [REDO{redoStack.length > 0 ? ` ${redoStack.length}` : ''}]
          </button>
        </Tip>
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
        <Tip content="Auto-save status">
          <span
            role="status"
            aria-live="polite"
            aria-label={`Save status: ${saveStatus === 'saved' ? 'All changes saved' : saveStatus === 'saving' ? 'Saving changes' : 'Unsaved changes'}`}
            className={`flex items-center gap-1.5 transition-colors duration-200 ${
              saveStatus === 'saved' ? 'text-[var(--color-success)]' :
              saveStatus === 'saving' ? 'text-[var(--color-warning)]' :
              'text-[var(--color-error)]'
            }`}
          >
          <span
            className={`inline-block w-[3px] h-[3px] transition-colors duration-200 ${
              showSaveConfirm ? 'animate-save-confirm' : ''
            } ${
              saveStatus === 'saved' ? 'bg-[var(--color-success)]' :
              saveStatus === 'saving' ? 'bg-[var(--color-warning)] animate-pulse' :
              'bg-[var(--color-error)]'
            }`}
            aria-hidden="true"
          />
          {saveStatus === 'saved' ? 'SYNC: SAVED' :
           saveStatus === 'saving' ? 'SYNC: ACTIVE' :
           'SYNC: PENDING'}
          </span>
        </Tip>
      </div>
    </div>
  )
}
