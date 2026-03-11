'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import ScriptEditor from '@/components/editor/ScriptEditor'

interface Panel {
  id: string
  panel_number: number
  sort_order: number
  visual_description: string | null
  camera: string | null
  internal_notes: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

interface DialogueBlock {
  id: string
  character_id: string | null
  text: string | null
  dialogue_type: string | null
  delivery_instruction: string | null
  sort_order: number
  character?: { id: string; name: string } | null
}

interface Caption {
  id: string
  text: string | null
  caption_type: string | null
  sort_order: number
}

interface SoundEffect {
  id: string
  text: string | null
  sort_order: number
}

interface Character {
  id: string
  name: string
}

interface SceneContext {
  actName: string
  sceneName: string
  plotlineName?: string | null
  pagePositionInScene?: number
  totalPagesInScene?: number
}

interface ZenModeProps {
  page: {
    id: string
    page_number: number
    panels: Panel[]
  }
  characters: Character[]
  pagePosition: string // e.g., "Page 5 of 22"
  sceneContext?: SceneContext | null
  onExit: () => void
  onSave: () => void
  onNavigate: (direction: 'prev' | 'next') => void
}

export default function ZenMode({
  page,
  characters,
  pagePosition,
  sceneContext,
  onExit,
  onSave,
  onNavigate,
}: ZenModeProps) {
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0)
  const [panels, setPanels] = useState<Panel[]>(page.panels || [])
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [sessionWordCount, setSessionWordCount] = useState(0)
  const initialWordCountRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  const currentPanel = panels[currentPanelIndex]

  // Update panels when page changes
  useEffect(() => {
    setPanels(page.panels || [])
    setCurrentPanelIndex(0)
  }, [page.id])

  // Track initial word count on mount
  useEffect(() => {
    const totalWords = (page.panels || []).reduce((sum, p) => {
      const desc = (p.visual_description || '').trim()
      return sum + (desc ? desc.split(/\s+/).length : 0)
    }, 0)
    initialWordCountRef.current = totalWords
  }, [])

  // Update session word count when panels change
  useEffect(() => {
    const currentTotal = panels.reduce((sum, p) => {
      const desc = (p.visual_description || '').trim()
      return sum + (desc ? desc.split(/\s+/).length : 0)
    }, 0)
    const delta = currentTotal - initialWordCountRef.current
    setSessionWordCount(Math.max(0, delta))
  }, [panels])

  // Focus textarea on mount and panel change
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [currentPanelIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Escape to exit
      if (e.key === 'Escape') {
        e.preventDefault()
        if (hasChanges) {
          saveCurrentPanel().then(() => onExit())
        } else {
          onExit()
        }
        return
      }

      // Cmd/Ctrl + Shift + Z to exit (same shortcut that entered)
      if (isMod && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        if (hasChanges) {
          saveCurrentPanel().then(() => onExit())
        } else {
          onExit()
        }
        return
      }

      // Tab or Cmd+Down to go to next panel
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        goToNextPanel()
        return
      }

      // Shift+Tab or Cmd+Up to go to previous panel
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        goToPrevPanel()
        return
      }

      // Cmd + Arrow keys for panel navigation
      if (isMod && e.key === 'ArrowDown' && !e.shiftKey) {
        e.preventDefault()
        goToNextPanel()
        return
      }

      if (isMod && e.key === 'ArrowUp' && !e.shiftKey) {
        e.preventDefault()
        goToPrevPanel()
        return
      }

      // Cmd + Shift + Arrow for page navigation
      if (isMod && e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault()
        if (hasChanges) {
          saveCurrentPanel().then(() => onNavigate('next'))
        } else {
          onNavigate('next')
        }
        return
      }

      if (isMod && e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        if (hasChanges) {
          saveCurrentPanel().then(() => onNavigate('prev'))
        } else {
          onNavigate('prev')
        }
        return
      }

      // Cmd + S to save
      if (isMod && e.key === 's') {
        e.preventDefault()
        saveCurrentPanel()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPanelIndex, hasChanges, panels])

  const goToNextPanel = useCallback(async () => {
    if (hasChanges) {
      await saveCurrentPanel()
    }
    if (currentPanelIndex < panels.length - 1) {
      setCurrentPanelIndex(currentPanelIndex + 1)
    } else {
      // At last panel, go to next page
      onNavigate('next')
    }
  }, [currentPanelIndex, panels.length, hasChanges, onNavigate])

  const goToPrevPanel = useCallback(async () => {
    if (hasChanges) {
      await saveCurrentPanel()
    }
    if (currentPanelIndex > 0) {
      setCurrentPanelIndex(currentPanelIndex - 1)
    } else {
      // At first panel, go to previous page
      onNavigate('prev')
    }
  }, [currentPanelIndex, hasChanges, onNavigate])

  const saveCurrentPanel = async () => {
    if (!currentPanel || !hasChanges) return

    setIsSaving(true)
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from('panels')
        .update({
          visual_description: currentPanel.visual_description,
          internal_notes: currentPanel.internal_notes,
        })
        .eq('id', currentPanel.id)

      if (error) throw error

      setHasChanges(false)
      onSave()
    } catch (error) {
      console.error('Failed to save:', error)
      showToast('Failed to save changes', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const updatePanelField = (field: 'visual_description' | 'internal_notes', value: string) => {
    setPanels(prev => prev.map((p, i) =>
      i === currentPanelIndex ? { ...p, [field]: value } : p
    ))
    setHasChanges(true)
  }

  if (!currentPanel) {
    return (
      <div className="fixed inset-0 bg-[var(--bg-primary)] z-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[var(--text-secondary)] mb-4">No panels on this page</p>
          <button
            onClick={onExit}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Press Escape to exit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[var(--bg-primary)] z-50 flex flex-col overflow-hidden"
    >
      {/* Close button */}
      <button
        onClick={onExit}
        className="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        title="Exit Zen Mode (Esc)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Minimal header bar */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="type-micro text-[var(--text-secondary)]">
              PAGE {page.page_number} {'//'}  PANEL {currentPanel.panel_number}
            </span>
            {sceneContext && (
              <>
                <span className="text-[var(--border)]">/</span>
                <span className="type-micro text-[var(--text-muted)]">
                  {sceneContext.actName} {'//'}  {sceneContext.sceneName}
                  {sceneContext.plotlineName && (
                    <span className="text-[var(--color-primary)] ml-1">({sceneContext.plotlineName})</span>
                  )}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="type-micro text-[var(--color-warning)]">UNSAVED</span>
            )}
            {isSaving && (
              <span className="type-micro text-[var(--color-primary)]">SAVING...</span>
            )}
            <span className="type-micro text-[var(--text-muted)]">{pagePosition}</span>
          </div>
        </div>
      </div>

      {/* Main writing area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-12">
          {/* Panel indicator dots */}
          <div className="flex items-center justify-center gap-1.5 mb-10">
            {panels.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  if (hasChanges) {
                    saveCurrentPanel().then(() => setCurrentPanelIndex(i))
                  } else {
                    setCurrentPanelIndex(i)
                  }
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentPanelIndex
                    ? 'w-6 bg-[var(--color-primary)]'
                    : 'w-1.5 bg-[var(--border)] hover:bg-[var(--text-muted)]'
                }`}
              />
            ))}
          </div>

          {/* Characters present in current panel */}
          {(() => {
            const charIds = new Set<string>()
            for (const d of currentPanel.dialogue_blocks) {
              if (d.character?.id) charIds.add(d.character.id)
              else if (d.character_id) charIds.add(d.character_id)
            }
            const presentChars = characters.filter(c => charIds.has(c.id))
            if (presentChars.length === 0) return null
            return (
              <div className="flex items-center justify-center gap-2 mb-8">
                <span className="type-micro text-[var(--text-muted)]">CHARACTERS:</span>
                {presentChars.map(c => (
                  <span key={c.id} className="type-micro text-[var(--color-primary)]">{c.name.toUpperCase()}</span>
                ))}
              </div>
            )
          })()}

          {/* Previous panel context */}
          {currentPanelIndex > 0 && panels[currentPanelIndex - 1] && (
            <div className="opacity-30 text-sm text-[var(--text-muted)] mb-8 pb-6 border-b border-[var(--border)]">
              <span className="type-micro block mb-2">PANEL {panels[currentPanelIndex - 1].panel_number}</span>
              <p className="line-clamp-2 leading-relaxed">{panels[currentPanelIndex - 1].visual_description || 'No description'}</p>
            </div>
          )}

          {/* Visual Description — main writing surface */}
          <div className="mb-8">
            <label className="type-micro text-[var(--text-muted)] block mb-3">
              VISUAL DESCRIPTION
            </label>
            <ScriptEditor
              variant="description"
              initialContent={currentPanel.visual_description || ''}
              onUpdate={(md) => updatePanelField('visual_description', md)}
              placeholder="Describe what we see in this panel..."
              className="zen-editor"
            />
          </div>

          {/* Existing dialogue (read-only reference) */}
          {currentPanel.dialogue_blocks.length > 0 && (
            <div className="mb-8 pt-6 border-t border-[var(--border)]">
              <label className="type-micro text-[var(--text-muted)] block mb-3">
                DIALOGUE
              </label>
              <div className="space-y-3">
                {currentPanel.dialogue_blocks.map((d) => (
                  <div key={d.id} className="pl-4 border-l-2 border-[var(--color-primary)]/30">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {(d.character?.name || 'Unknown').toUpperCase()}:
                    </span>{' '}
                    <span className="text-sm text-[var(--text-secondary)] leading-relaxed">{d.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Captions (read-only reference) */}
          {currentPanel.captions.length > 0 && (
            <div className="mb-8 pt-6 border-t border-[var(--border)]">
              <label className="type-micro text-[var(--text-muted)] block mb-3">
                CAPTIONS
              </label>
              <div className="space-y-2">
                {currentPanel.captions.map((c) => (
                  <div key={c.id} className="pl-4 border-l-2 border-[var(--color-warning)]/30 text-sm text-[var(--text-secondary)] italic">
                    {c.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Internal Notes */}
          <div className="pt-6 border-t border-[var(--border)]">
            <label className="type-micro text-[var(--text-muted)] block mb-3">
              INTERNAL NOTES
            </label>
            <ScriptEditor
              variant="notes"
              initialContent={currentPanel.internal_notes || ''}
              onUpdate={(md) => updatePanelField('internal_notes', md)}
              placeholder="Internal notes..."
              className="zen-editor zen-editor--notes"
            />
          </div>

          {/* Next panel context */}
          {currentPanelIndex < panels.length - 1 && panels[currentPanelIndex + 1] && (
            <div className="opacity-30 text-sm text-[var(--text-muted)] mt-8 pt-6 border-t border-[var(--border)]">
              <span className="type-micro block mb-2">PANEL {panels[currentPanelIndex + 1].panel_number}</span>
              <p className="line-clamp-2 leading-relaxed">{panels[currentPanelIndex + 1].visual_description || 'No description'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="border-t border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="max-w-2xl mx-auto px-6 py-2.5 flex items-center justify-between">
          <span className="type-micro text-[var(--text-muted)]">
            +{sessionWordCount} WORDS THIS SESSION
          </span>
          <div className="flex items-center gap-4 type-micro text-[var(--text-muted)]">
            <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-[10px]">Tab</kbd> Next</span>
            <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-[10px]">Shift+Tab</kbd> Prev</span>
            <span><kbd className="px-1.5 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-[10px]">Esc</kbd> Exit</span>
          </div>
        </div>
      </div>
    </div>
  )
}
