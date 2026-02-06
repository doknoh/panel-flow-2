'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface Panel {
  id: string
  panel_number: number
  sort_order: number
  visual_description: string | null
  shot_type: string | null
  notes: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

interface DialogueBlock {
  id: string
  character_id: string | null
  text: string | null
  dialogue_type: string | null
  modifier: string | null
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

interface ZenModeProps {
  page: {
    id: string
    page_number: number
    panels: Panel[]
  }
  characters: Character[]
  pagePosition: string // e.g., "Page 5 of 22"
  onExit: () => void
  onSave: () => void
  onNavigate: (direction: 'prev' | 'next') => void
}

export default function ZenMode({
  page,
  characters,
  pagePosition,
  onExit,
  onSave,
  onNavigate,
}: ZenModeProps) {
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0)
  const [panels, setPanels] = useState<Panel[]>(page.panels || [])
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  const currentPanel = panels[currentPanelIndex]

  // Update panels when page changes
  useEffect(() => {
    setPanels(page.panels || [])
    setCurrentPanelIndex(0)
  }, [page.id])

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
          notes: currentPanel.notes,
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

  const updatePanelField = (field: 'visual_description' | 'notes', value: string) => {
    setPanels(prev => prev.map((p, i) =>
      i === currentPanelIndex ? { ...p, [field]: value } : p
    ))
    setHasChanges(true)
  }

  if (!currentPanel) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-xl mb-4">No panels on this page</p>
          <button
            onClick={onExit}
            className="text-sm text-gray-400 hover:text-white"
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
      className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden"
    >
      {/* Minimal header - fades on scroll/focus */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between text-gray-500 text-sm opacity-50 hover:opacity-100 transition-opacity z-10">
        <div className="flex items-center gap-4">
          <span className="font-mono">
            Page {page.page_number} • Panel {currentPanel.panel_number}
          </span>
          <span className="text-gray-600">{pagePosition}</span>
        </div>
        <div className="flex items-center gap-4">
          {hasChanges && (
            <span className="text-amber-500">Unsaved</span>
          )}
          {isSaving && (
            <span className="text-blue-400">Saving...</span>
          )}
          <button
            onClick={onExit}
            className="text-gray-500 hover:text-white transition-colors"
          >
            Exit Zen Mode
          </button>
        </div>
      </div>

      {/* Main writing area - centered with typewriter scroll */}
      <div className="flex-1 flex items-center justify-center px-8 py-20">
        <div className="w-full max-w-2xl space-y-8">
          {/* Panel indicator */}
          <div className="flex items-center justify-center gap-2">
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
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentPanelIndex
                    ? 'w-8 bg-white'
                    : 'bg-gray-700 hover:bg-gray-500'
                }`}
              />
            ))}
          </div>

          {/* Visual Description */}
          <div className="space-y-2">
            <label className="block text-gray-500 text-xs uppercase tracking-wider">
              Visual Description
            </label>
            <textarea
              ref={textareaRef}
              value={currentPanel.visual_description || ''}
              onChange={(e) => updatePanelField('visual_description', e.target.value)}
              placeholder="Describe what we see in this panel..."
              className="w-full bg-transparent text-white text-lg leading-relaxed resize-none focus:outline-none placeholder:text-gray-700 min-h-[200px]"
              style={{
                caretColor: '#fff',
              }}
            />
          </div>

          {/* Existing dialogue (read-only in zen mode for focus) */}
          {currentPanel.dialogue_blocks.length > 0 && (
            <div className="space-y-2 border-t border-gray-800 pt-6">
              <label className="block text-gray-500 text-xs uppercase tracking-wider">
                Dialogue
              </label>
              <div className="space-y-2">
                {currentPanel.dialogue_blocks.map((d) => (
                  <div key={d.id} className="text-gray-300">
                    <span className="text-blue-400 font-medium">
                      {d.character?.name || 'Unknown'}:
                    </span>{' '}
                    <span className="italic">{d.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Captions */}
          {currentPanel.captions.length > 0 && (
            <div className="space-y-2 border-t border-gray-800 pt-6">
              <label className="block text-gray-500 text-xs uppercase tracking-wider">
                Captions
              </label>
              <div className="space-y-2">
                {currentPanel.captions.map((c) => (
                  <div key={c.id} className="text-amber-400 italic">
                    {c.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2 border-t border-gray-800 pt-6">
            <label className="block text-gray-500 text-xs uppercase tracking-wider">
              Notes (Internal)
            </label>
            <textarea
              value={currentPanel.notes || ''}
              onChange={(e) => updatePanelField('notes', e.target.value)}
              placeholder="Internal notes..."
              className="w-full bg-transparent text-gray-400 text-sm leading-relaxed resize-none focus:outline-none placeholder:text-gray-700 min-h-[60px]"
            />
          </div>
        </div>
      </div>

      {/* Bottom hints - also fades */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-center text-gray-600 text-xs opacity-50 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-6">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Tab</kbd> Next panel
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Shift+Tab</kbd> Prev panel
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">⌘⇧→</kbd> Next page
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">⌘⇧←</kbd> Prev page
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Esc</kbd> Exit
          </span>
        </div>
      </div>
    </div>
  )
}
