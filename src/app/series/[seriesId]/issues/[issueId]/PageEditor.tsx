'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useOffline } from '@/contexts/OfflineContext'
import { useUndo } from '@/contexts/UndoContext'
import PageTypeSelector from './PageTypeSelector'
import CommentButton from '../../collaboration/CommentButton'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Character {
  id: string
  name: string
}

interface Location {
  id: string
  name: string
}

interface DialogueBlock {
  id: string
  character_id: string | null
  dialogue_type: string
  text: string
  sort_order: number
  modifier: string | null
}

interface Caption {
  id: string
  caption_type: string
  text: string
  sort_order: number
}

interface SoundEffect {
  id: string
  text: string
  sort_order: number
}

interface Panel {
  id: string
  panel_number: number
  visual_description: string | null
  shot_type: string | null
  notes: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

type PageType = 'SINGLE' | 'SPLASH' | 'SPREAD_LEFT' | 'SPREAD_RIGHT'

interface PageForLinking {
  id: string
  page_number: number
  page_type: PageType
  linked_page_id: string | null
}

interface Page {
  id: string
  page_number: number
  page_type?: PageType
  linked_page_id?: string | null
  panels: Panel[]
}

interface PageContext {
  page: any
  act: { id: string; name: string; sort_order: number }
  scene: { id: string; name: string; sort_order: number; plotline_name?: string | null; total_pages?: number }
  pagePositionInScene?: number
}

interface PageEditorProps {
  page: Page
  pageContext?: PageContext | null
  characters: Character[]
  locations: Location[]
  scenePages?: PageForLinking[]
  onUpdate: () => void
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
}

// Word count helper
function countWords(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(word => word.length > 0).length
}

// Sortable panel wrapper (must be defined outside component to use hooks properly)
function SortablePanelCard({ id, children }: { id: string; children: (listeners: any) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={isDragging ? 'opacity-50 z-10 relative' : ''}>
      {children(listeners)}
    </div>
  )
}

export default function PageEditor({ page, pageContext, characters, locations, scenePages = [], onUpdate, setSaveStatus }: PageEditorProps) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [editingPanel, setEditingPanel] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Map<string, Panel>>(new Map())
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastPageIdRef = useRef<string | null>(null)
  const optimisticIdsRef = useRef<Set<string>>(new Set())
  const pendingFocusRef = useRef<string | null>(null)
  const focusStartValueRef = useRef<string>('') // Tracks text value when a field gains focus (for undo)
  const { showToast } = useToast()
  const { isOnline, queueChange, pendingChanges: offlinePending } = useOffline()
  const { recordAction, startTextEdit, endTextEdit } = useUndo()

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Auto-resize a textarea to fit its content
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, 36) + 'px'
  }, [])

  // Calculate word count for a panel
  const panelWordCount = useCallback((panel: Panel): number => {
    let count = countWords(panel.visual_description)
    for (const d of panel.dialogue_blocks || []) count += countWords(d.text)
    for (const c of panel.captions || []) count += countWords(c.text)
    for (const s of panel.sound_effects || []) count += countWords(s.text)
    return count
  }, [])

  // Find the last speaker ID used in any panel on this page
  const findLastSpeakerId = useCallback((): string | null => {
    for (let i = panels.length - 1; i >= 0; i--) {
      const dbs = panels[i].dialogue_blocks || []
      for (let j = dbs.length - 1; j >= 0; j--) {
        if (dbs[j].character_id) return dbs[j].character_id
      }
    }
    return null
  }, [panels])

  // Sync panels from props ONLY when page changes - local state is authoritative otherwise
  useEffect(() => {
    // Only sync from props when navigating to a different page
    if (lastPageIdRef.current !== page.id) {
      lastPageIdRef.current = page.id
      optimisticIdsRef.current.clear()
      const serverPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)
      setPanels(serverPanels)
      setEditingPanel(null)
    }
    // Don't overwrite local state if page ID hasn't changed -
    // local state contains optimistic updates (dialogues, captions, etc.)
  }, [page])

  // Save all pending changes - defined before scheduleAutoSave to avoid circular dependency
  const saveAllPendingChanges = useCallback(async () => {
    if (pendingChanges.size === 0) return

    // If offline, queue changes for later
    if (!isOnline) {
      Array.from(pendingChanges.values()).forEach(panel => {
        queueChange({
          table: 'panels',
          operation: 'update',
          data: {
            visual_description: panel.visual_description,
            shot_type: panel.shot_type,
            notes: panel.notes,
          },
          filter: { column: 'id', value: panel.id },
        })
      })
      setPendingChanges(new Map())
      setSaveStatus('saved')
      return
    }

    setSaveStatus('saving')
    const supabase = createClient()

    const updates = Array.from(pendingChanges.values()).map(panel =>
      supabase
        .from('panels')
        .update({
          visual_description: panel.visual_description,
          shot_type: panel.shot_type,
          notes: panel.notes,
        })
        .eq('id', panel.id)
    )

    try {
      await Promise.all(updates)
      setPendingChanges(new Map())
      setSaveStatus('saved')
    } catch (error) {
      console.error('Error saving panels:', error)
      setSaveStatus('unsaved')
      showToast('Failed to save changes', 'error')
    }
  }, [pendingChanges, setSaveStatus, showToast, isOnline, queueChange])

  // Auto-save with 2 second debounce
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      saveAllPendingChanges()
    }, 2000)
  }, [saveAllPendingChanges])

  // Manual save function (for Cmd+S)
  const manualSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    await saveAllPendingChanges()
    showToast('Changes saved', 'success')
  }, [saveAllPendingChanges, showToast])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Cmd+S: Save
      if (isMod && e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        manualSave()
        return
      }

      // Cmd+Enter: New panel
      if (isMod && e.key === 'Enter') {
        e.preventDefault()
        addPanel()
        return
      }

      // Cmd+D: New dialogue with smart defaults
      if (isMod && e.key === 'd' && !e.shiftKey) {
        e.preventDefault()
        // Add to active panel if editing, otherwise last panel
        const targetPanel = editingPanel
          ? panels.find(p => p.id === editingPanel)
          : panels[panels.length - 1]
        if (targetPanel) {
          if (!editingPanel) setEditingPanel(targetPanel.id)
          addDialogue(targetPanel.id, { defaultCharacterId: findLastSpeakerId(), autoFocus: true })
        }
        return
      }

      // Cmd+Shift+D: New sound effect (add to last panel)
      if (isMod && e.key === 'd' && e.shiftKey) {
        e.preventDefault()
        const lastPanel = panels[panels.length - 1]
        if (lastPanel) {
          addSoundEffect(lastPanel.id)
        }
        return
      }

      // Escape: deactivate panel editing (show all panels)
      if (e.key === 'Escape' && editingPanel) {
        const activeElement = document.activeElement
        const isInModal = activeElement?.closest('[role="dialog"]')
        if (!isInModal) {
          setEditingPanel(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [manualSave, panels, editingPanel, findLastSpeakerId])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  // Focus newly created dialogue text field
  useEffect(() => {
    if (pendingFocusRef.current) {
      const tempId = pendingFocusRef.current
      const timer = setTimeout(() => {
        const container = document.querySelector(`[data-dialogue-id="${tempId}"]`)
        const textarea = container?.querySelector('textarea') as HTMLTextAreaElement
        if (textarea) textarea.focus()
        pendingFocusRef.current = null
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [panels])

  const savePanel = useCallback(async (panel: Panel) => {
    setSaveStatus('saving')
    const supabase = createClient()

    const { error } = await supabase
      .from('panels')
      .update({
        visual_description: panel.visual_description,
        shot_type: panel.shot_type,
        notes: panel.notes,
      })
      .eq('id', panel.id)

    if (error) {
      console.error('Error saving panel:', error)
      setSaveStatus('unsaved')
    } else {
      setSaveStatus('saved')
    }
  }, [setSaveStatus])

  const addPanel = async () => {
    const supabase = createClient()
    const panelNumber = panels.length + 1

    // Generate a temporary ID for optimistic update
    const tempId = `temp-${Date.now()}`

    // Optimistically add the panel immediately
    const optimisticPanel: Panel = {
      id: tempId,
      panel_number: panelNumber,
      visual_description: '',
      shot_type: null,
      notes: null,
      dialogue_blocks: [],
      captions: [],
      sound_effects: [],
    }

    // Track this as an optimistic panel
    optimisticIdsRef.current.add(tempId)
    setPanels(prev => [...prev, optimisticPanel])

    const { data, error } = await supabase
      .from('panels')
      .insert({
        page_id: page.id,
        panel_number: panelNumber,
        sort_order: panelNumber,
        visual_description: '',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating panel:', error)
      showToast('Failed to create panel: ' + error.message, 'error')
      // Rollback optimistic update
      optimisticIdsRef.current.delete(tempId)
      setPanels(prev => prev.filter(p => p.id !== tempId))
      return
    }

    if (data) {
      // Replace temp panel with real one and track new ID as optimistic until server confirms
      optimisticIdsRef.current.delete(tempId)
      optimisticIdsRef.current.add(data.id)
      setPanels(prev => prev.map(p => p.id === tempId ? { ...optimisticPanel, id: data.id } : p))
      setEditingPanel(data.id)
      // Trigger background refresh for data consistency
      onUpdate()
    }
  }

  const updatePanelField = (panelId: string, field: string, value: string) => {
    setSaveStatus('unsaved')
    setPanels(prev => {
      const updated = prev.map(p =>
        p.id === panelId ? { ...p, [field]: value } : p
      )
      // Track pending changes
      const updatedPanel = updated.find(p => p.id === panelId)
      if (updatedPanel) {
        setPendingChanges(prev => new Map(prev).set(panelId, updatedPanel))
      }
      return updated
    })
    scheduleAutoSave()
  }

  // Auto-capitalize character names in visual descriptions
  const autoCapitalizeCharacterNames = useCallback((text: string): string => {
    if (!text || characters.length === 0) return text

    let result = text
    for (const character of characters) {
      // Create a regex that matches the character name as a whole word (case-insensitive)
      // but not if it's already all caps
      const name = character.name
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      // Match the name as a word boundary, case-insensitive
      const regex = new RegExp(`\\b(${escapedName})\\b`, 'gi')

      result = result.replace(regex, (match) => {
        // Only capitalize if not already all caps
        if (match === match.toUpperCase()) return match
        return match.toUpperCase()
      })
    }
    return result
  }, [characters])

  const handlePanelBlur = (panel: Panel) => {
    // Immediate save on blur (in addition to auto-save)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    savePanel(panel)
    setPendingChanges(prev => {
      const next = new Map(prev)
      next.delete(panel.id)
      return next
    })
  }

  // Handle visual description blur - auto-capitalize character names and record undo
  const handleVisualDescriptionBlur = (panel: Panel) => {
    const capitalizedText = autoCapitalizeCharacterNames(panel.visual_description || '')

    // Record the text edit for undo
    endTextEdit(panel.id, 'visual_description', capitalizedText)

    // Only update if text changed
    if (capitalizedText !== panel.visual_description) {
      const updatedPanel = { ...panel, visual_description: capitalizedText }
      setPanels(prev => prev.map(p => p.id === panel.id ? updatedPanel : p))
      handlePanelBlur(updatedPanel)
    } else {
      handlePanelBlur(panel)
    }
  }

  // Handle starting a text field edit (for undo tracking)
  const handleTextFieldFocus = (panelId: string, field: string, currentValue: string | null) => {
    startTextEdit(panelId, field, currentValue)
  }

  // Handle other panel field blur (notes, etc.) with undo recording
  const handleOtherFieldBlur = (panel: Panel, field: 'notes' | 'shot_type') => {
    endTextEdit(panel.id, field, panel[field] || null)
    handlePanelBlur(panel)
  }

  const addDialogue = async (panelId: string, options?: { defaultCharacterId?: string | null; autoFocus?: boolean }) => {
    const supabase = createClient()
    const panel = panels.find(p => p.id === panelId)
    const sortOrder = (panel?.dialogue_blocks?.length || 0) + 1
    const tempId = `temp-dialogue-${Date.now()}`
    const charId = options?.defaultCharacterId || null

    // Optimistically add the dialogue immediately
    const optimisticDialogue: DialogueBlock = {
      id: tempId,
      character_id: charId,
      dialogue_type: 'dialogue',
      text: '',
      sort_order: sortOrder,
      modifier: null,
    }
    setPanels(prev => prev.map(p =>
      p.id === panelId
        ? { ...p, dialogue_blocks: [...(p.dialogue_blocks || []), optimisticDialogue] }
        : p
    ))

    // Signal focus for keyboard flow
    if (options?.autoFocus) {
      pendingFocusRef.current = tempId
    }

    const { data, error } = await supabase
      .from('dialogue_blocks')
      .insert({
        panel_id: panelId,
        character_id: charId,
        dialogue_type: 'dialogue',
        text: '',
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding dialogue:', error)
      showToast('Failed to add dialogue: ' + error.message, 'error')
      // Rollback
      setPanels(prev => prev.map(p =>
        p.id === panelId
          ? { ...p, dialogue_blocks: (p.dialogue_blocks || []).filter(d => d.id !== tempId) }
          : p
      ))
    } else if (data) {
      // Replace temp with real ID
      setPanels(prev => prev.map(p =>
        p.id === panelId
          ? { ...p, dialogue_blocks: (p.dialogue_blocks || []).map(d => d.id === tempId ? { ...d, id: data.id } : d) }
          : p
      ))
      // Update focus ref to real ID
      if (pendingFocusRef.current === tempId) {
        pendingFocusRef.current = data.id
      }
      recordAction({
        type: 'dialogue_add',
        dialogueId: data.id,
        panelId,
        data: {
          dialogue_type: 'dialogue',
          text: '',
          sort_order: sortOrder,
          character_id: charId,
        },
        description: 'Add dialogue',
      })
      // Don't call onUpdate() - local state is already correct and refresh would overwrite it
    }
  }

  const updateDialogue = async (dialogueId: string, field: string, value: string, oldValue?: string) => {
    setSaveStatus('saving')
    const supabase = createClient()

    // Record undo action if we have the old value
    if (oldValue !== undefined && oldValue !== value) {
      recordAction({
        type: 'dialogue_update',
        dialogueId,
        field,
        oldValue,
        newValue: value,
        description: `Update dialogue ${field}`,
      })
    }

    const { error } = await supabase
      .from('dialogue_blocks')
      .update({ [field]: value })
      .eq('id', dialogueId)

    if (error) {
      setSaveStatus('unsaved')
    } else {
      setSaveStatus('saved')
      // Don't call onUpdate() - avoid overwriting local state
    }
  }

  const deleteDialogue = async (dialogueId: string, panelId: string, dialogueData?: any) => {
    const supabase = createClient()

    // Get the dialogue data for undo from local state
    const panel = panels.find(p => p.id === panelId)
    const localDialogue = panel?.dialogue_blocks?.find(d => d.id === dialogueId)
    const dataForUndo = dialogueData || localDialogue

    // Optimistically remove the dialogue immediately
    setPanels(prev => prev.map(p =>
      p.id === panelId
        ? { ...p, dialogue_blocks: (p.dialogue_blocks || []).filter(d => d.id !== dialogueId) }
        : p
    ))

    const { error } = await supabase.from('dialogue_blocks').delete().eq('id', dialogueId)

    if (error) {
      // Rollback: restore the dialogue
      if (dataForUndo) {
        setPanels(prev => prev.map(p =>
          p.id === panelId
            ? { ...p, dialogue_blocks: [...(p.dialogue_blocks || []), dataForUndo].sort((a, b) => a.sort_order - b.sort_order) }
            : p
        ))
      }
      showToast('Failed to delete dialogue: ' + error.message, 'error')
      return
    }

    if (dataForUndo) {
      recordAction({
        type: 'dialogue_delete',
        dialogueId,
        panelId,
        data: {
          dialogue_type: dataForUndo.dialogue_type,
          text: dataForUndo.text,
          sort_order: dataForUndo.sort_order,
          character_id: dataForUndo.character_id,
          modifier: dataForUndo.modifier,
        },
        description: 'Delete dialogue',
      })
    }
    // Don't call onUpdate() - local state is already correct
  }

  const addCaption = async (panelId: string) => {
    const supabase = createClient()
    const panel = panels.find(p => p.id === panelId)
    const sortOrder = (panel?.captions?.length || 0) + 1
    const tempId = `temp-caption-${Date.now()}`

    // Optimistically add the caption immediately
    const optimisticCaption: Caption = {
      id: tempId,
      caption_type: 'narrative',
      text: '',
      sort_order: sortOrder,
    }
    setPanels(prev => prev.map(p =>
      p.id === panelId
        ? { ...p, captions: [...(p.captions || []), optimisticCaption] }
        : p
    ))

    const { data, error } = await supabase
      .from('captions')
      .insert({
        panel_id: panelId,
        caption_type: 'narrative',
        text: '',
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding caption:', error)
      showToast('Failed to add caption: ' + error.message, 'error')
      // Rollback
      setPanels(prev => prev.map(p =>
        p.id === panelId
          ? { ...p, captions: (p.captions || []).filter(c => c.id !== tempId) }
          : p
      ))
    } else if (data) {
      // Replace temp with real ID
      setPanels(prev => prev.map(p =>
        p.id === panelId
          ? { ...p, captions: (p.captions || []).map(c => c.id === tempId ? { ...c, id: data.id } : c) }
          : p
      ))
      recordAction({
        type: 'caption_add',
        captionId: data.id,
        panelId,
        data: {
          caption_type: 'narrative',
          text: '',
          sort_order: sortOrder,
        },
        description: 'Add caption',
      })
      // Don't call onUpdate() - local state is already correct
    }
  }

  const updateCaption = async (captionId: string, field: string, value: string, oldValue?: string) => {
    setSaveStatus('saving')
    const supabase = createClient()

    if (oldValue !== undefined && oldValue !== value) {
      recordAction({
        type: 'caption_update',
        captionId,
        field,
        oldValue,
        newValue: value,
        description: `Update caption ${field}`,
      })
    }

    const { error } = await supabase
      .from('captions')
      .update({ [field]: value })
      .eq('id', captionId)

    if (error) {
      setSaveStatus('unsaved')
    } else {
      setSaveStatus('saved')
      // Don't call onUpdate() - avoid overwriting local state
    }
  }

  const deleteCaption = async (captionId: string, panelId: string) => {
    const supabase = createClient()

    // Get the caption data for undo from local state
    const panel = panels.find(p => p.id === panelId)
    const localCaption = panel?.captions?.find(c => c.id === captionId)

    // Optimistically remove the caption immediately
    setPanels(prev => prev.map(p =>
      p.id === panelId
        ? { ...p, captions: (p.captions || []).filter(c => c.id !== captionId) }
        : p
    ))

    const { error } = await supabase.from('captions').delete().eq('id', captionId)

    if (error) {
      // Rollback: restore the caption
      if (localCaption) {
        setPanels(prev => prev.map(p =>
          p.id === panelId
            ? { ...p, captions: [...(p.captions || []), localCaption].sort((a, b) => a.sort_order - b.sort_order) }
            : p
        ))
      }
      showToast('Failed to delete caption: ' + error.message, 'error')
      return
    }

    if (localCaption) {
      recordAction({
        type: 'caption_delete',
        captionId,
        panelId,
        data: {
          caption_type: localCaption.caption_type,
          text: localCaption.text,
          sort_order: localCaption.sort_order,
        },
        description: 'Delete caption',
      })
    }
    // Don't call onUpdate() - local state is already correct
  }

  const addSoundEffect = async (panelId: string) => {
    const supabase = createClient()
    const panel = panels.find(p => p.id === panelId)
    const sortOrder = (panel?.sound_effects?.length || 0) + 1
    const tempId = `temp-sfx-${Date.now()}`

    // Optimistically add the sound effect immediately
    const optimisticSfx: SoundEffect = {
      id: tempId,
      text: '',
      sort_order: sortOrder,
    }
    setPanels(prev => prev.map(p =>
      p.id === panelId
        ? { ...p, sound_effects: [...(p.sound_effects || []), optimisticSfx] }
        : p
    ))

    const { data, error } = await supabase
      .from('sound_effects')
      .insert({
        panel_id: panelId,
        text: '',
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding sound effect:', error)
      showToast('Failed to add sound effect: ' + error.message, 'error')
      // Rollback
      setPanels(prev => prev.map(p =>
        p.id === panelId
          ? { ...p, sound_effects: (p.sound_effects || []).filter(s => s.id !== tempId) }
          : p
      ))
    } else if (data) {
      // Replace temp with real ID
      setPanels(prev => prev.map(p =>
        p.id === panelId
          ? { ...p, sound_effects: (p.sound_effects || []).map(s => s.id === tempId ? { ...s, id: data.id } : s) }
          : p
      ))
      recordAction({
        type: 'sfx_add',
        sfxId: data.id,
        panelId,
        data: {
          text: '',
          sort_order: sortOrder,
        },
        description: 'Add sound effect',
      })
      // Don't call onUpdate() - local state is already correct
    }
  }

  const updateSoundEffect = async (sfxId: string, text: string, oldText?: string) => {
    setSaveStatus('saving')
    const supabase = createClient()

    if (oldText !== undefined && oldText !== text) {
      recordAction({
        type: 'sfx_update',
        sfxId,
        oldValue: oldText,
        newValue: text,
        description: 'Update sound effect',
      })
    }

    const { error } = await supabase
      .from('sound_effects')
      .update({ text })
      .eq('id', sfxId)

    if (error) {
      setSaveStatus('unsaved')
    } else {
      setSaveStatus('saved')
      // Don't call onUpdate() - avoid overwriting local state
    }
  }

  const deleteSoundEffect = async (sfxId: string, panelId: string) => {
    const supabase = createClient()

    // Get the sfx data for undo from local state
    const panel = panels.find(p => p.id === panelId)
    const localSfx = panel?.sound_effects?.find(s => s.id === sfxId)

    // Optimistically remove the sound effect immediately
    setPanels(prev => prev.map(p =>
      p.id === panelId
        ? { ...p, sound_effects: (p.sound_effects || []).filter(s => s.id !== sfxId) }
        : p
    ))

    const { error } = await supabase.from('sound_effects').delete().eq('id', sfxId)

    if (error) {
      // Rollback: restore the sound effect
      if (localSfx) {
        setPanels(prev => prev.map(p =>
          p.id === panelId
            ? { ...p, sound_effects: [...(p.sound_effects || []), localSfx].sort((a, b) => a.sort_order - b.sort_order) }
            : p
        ))
      }
      showToast('Failed to delete sound effect: ' + error.message, 'error')
      return
    }

    if (localSfx) {
      recordAction({
        type: 'sfx_delete',
        sfxId,
        panelId,
        data: {
          text: localSfx.text,
          sort_order: localSfx.sort_order,
        },
        description: 'Delete sound effect',
      })
    }
    // Don't call onUpdate() - local state is already correct
  }

  const deletePanel = async (panelId: string) => {
    // Get full panel data for undo (including dialogue, captions, sfx)
    const panel = panels.find(p => p.id === panelId)

    // Confirm deletion if panel has content
    const hasContent = panel?.visual_description ||
                       (panel?.dialogue_blocks?.length ?? 0) > 0 ||
                       (panel?.captions?.length ?? 0) > 0 ||
                       (panel?.sound_effects?.length ?? 0) > 0

    if (hasContent) {
      const confirmed = window.confirm('Delete this panel? This action can be undone.')
      if (!confirmed) return
    }

    // Clear editing state if this panel was active
    if (editingPanel === panelId) setEditingPanel(null)

    // Optimistically remove the panel immediately
    setPanels(prev => prev.filter(p => p.id !== panelId))

    const supabase = createClient()
    const { error } = await supabase.from('panels').delete().eq('id', panelId)

    if (error) {
      // Rollback: restore the panel
      if (panel) {
        setPanels(prev => [...prev, panel].sort((a, b) => a.panel_number - b.panel_number))
      }
      showToast('Failed to delete panel: ' + error.message, 'error')
      return
    }

    if (panel) {
      recordAction({
        type: 'panel_delete',
        panelId,
        pageId: page.id,
        data: {
          panel_number: panel.panel_number,
          visual_description: panel.visual_description,
          shot_type: panel.shot_type,
          notes: panel.notes,
          sort_order: panel.panel_number,
        },
        description: 'Delete panel',
      })
    }

    // Background refresh for consistency
    onUpdate()
  }

  // Handle drag end for panel reordering
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = panels.findIndex(p => p.id === active.id)
    const newIndex = panels.findIndex(p => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(panels, oldIndex, newIndex).map((p, i) => ({ ...p, panel_number: i + 1 }))
    setPanels(reordered)

    // Persist new order
    setSaveStatus('saving')
    const supabase = createClient()
    try {
      await Promise.all(reordered.map((p, i) =>
        supabase.from('panels').update({ sort_order: i + 1, panel_number: i + 1 }).eq('id', p.id)
      ))
      setSaveStatus('saved')
      onUpdate()
    } catch (error) {
      console.error('Error reordering panels:', error)
      setSaveStatus('unsaved')
      showToast('Failed to reorder panels', 'error')
    }
  }

  // Compute page orientation
  const pageOrientation = page.page_number % 2 === 0 ? 'left' : 'right'

  return (
    <div className="p-6">
      {/* Context breadcrumb — "Page 12 (left) • Act II • Tracy subplot • 4 of 6 pages in scene" */}
      {pageContext && (
        <div className="mb-2 text-xs text-[var(--text-muted)] flex items-center gap-1.5 font-mono">
          <span className="text-[var(--text-secondary)] font-semibold">
            Page {page.page_number}
          </span>
          <span className="text-[var(--text-muted)]">({pageOrientation})</span>
          <span className="text-[var(--text-muted)]">•</span>
          <span className="text-[var(--text-secondary)]">{pageContext.act.name || `Act ${pageContext.act.sort_order + 1}`}</span>
          {pageContext.scene.plotline_name && (
            <>
              <span className="text-[var(--text-muted)]">•</span>
              <span className="text-[var(--text-secondary)]">{pageContext.scene.plotline_name}</span>
            </>
          )}
          {pageContext.pagePositionInScene && pageContext.scene.total_pages && (
            <>
              <span className="text-[var(--text-muted)]">•</span>
              <span>{pageContext.pagePositionInScene} of {pageContext.scene.total_pages} in scene</span>
            </>
          )}
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Page {page.page_number}</h2>
          <PageTypeSelector
            pageId={page.id}
            currentType={page.page_type || 'SINGLE'}
            currentLinkedPageId={page.linked_page_id || null}
            scenePages={scenePages}
            onUpdate={onUpdate}
          />
          <CommentButton entityType="page" entityId={page.id} />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-[var(--text-muted)] space-x-3">
            <span>⌘S save</span>
            <span>⌘↵ panel</span>
            <span>⌘D dialog</span>
            <span>⌘⇧D sfx</span>
          </div>
          <button
            onClick={addPanel}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-3 py-1.5 rounded text-sm text-white"
          >
            + Add Panel
          </button>
        </div>
      </div>

      {panels.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-secondary)] border border-[var(--border)] border-dashed rounded-lg">
          <div className="text-4xl mb-4 opacity-30">🎬</div>
          <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">Ready to create your first panel</h3>
          <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
            Panels are the building blocks of your comic. Add visual descriptions, dialogue, captions, and sound effects.
          </p>
          <button
            onClick={addPanel}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            + Create First Panel
          </button>
          <p className="text-xs text-[var(--text-muted)] mt-4">
            or press <kbd className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded font-mono">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded font-mono">↵</kbd>
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panels.map(p => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {panels.map((panel) => {
                const isActive = editingPanel === panel.id
                const isAnyActive = editingPanel !== null
                const isCollapsed = isAnyActive && !isActive
                const wordCount = panelWordCount(panel)

                return (
                  <SortablePanelCard key={panel.id} id={panel.id}>
                    {(dragListeners) => (
                      <div
                        className={`bg-[var(--bg-secondary)] border rounded-lg overflow-hidden transition-all duration-150 ${
                          isActive
                            ? 'border-l-4 border-l-[var(--color-primary)] border-t-[var(--border)] border-r-[var(--border)] border-b-[var(--border)] shadow-md'
                            : isCollapsed
                              ? 'border-[var(--border)] opacity-60 hover:opacity-90 cursor-pointer'
                              : 'border-[var(--border)]'
                        }`}
                        onFocus={() => { if (!isActive) setEditingPanel(panel.id) }}
                        onClick={() => { if (isCollapsed) setEditingPanel(panel.id) }}
                      >
                        {/* Panel Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
                          <div className="flex items-center gap-3">
                            {/* Drag Handle */}
                            <span
                              {...dragListeners}
                              className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-secondary)] select-none"
                              title="Drag to reorder"
                              onClick={(e) => e.stopPropagation()}
                            >
                              ⠿
                            </span>
                            <span
                              className="font-semibold cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingPanel(isActive ? null : panel.id)
                              }}
                            >
                              Panel {panel.panel_number}
                            </span>
                            {/* Word Count Badge */}
                            <span className="text-[10px] bg-[var(--bg-primary)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full font-mono tabular-nums">
                              {wordCount}w
                            </span>
                            <CommentButton entityType="panel" entityId={panel.id} />
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={panel.shot_type || ''}
                              onChange={(e) => {
                                updatePanelField(panel.id, 'shot_type', e.target.value)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm"
                            >
                              <option value="">Shot Type</option>
                              <option value="wide">Wide Shot</option>
                              <option value="medium">Medium Shot</option>
                              <option value="close">Close-Up</option>
                              <option value="extreme_close">Extreme Close-Up</option>
                              <option value="bird">Bird&apos;s Eye</option>
                              <option value="worm">Worm&apos;s Eye</option>
                              <option value="pov">POV</option>
                            </select>
                            <button
                              onClick={(e) => { e.stopPropagation(); deletePanel(panel.id) }}
                              className="text-[var(--text-muted)] hover:text-[var(--color-error)] text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Collapsed Preview — visible when another panel is active */}
                        {isCollapsed && (
                          <div className="px-4 py-2">
                            {panel.visual_description ? (
                              <p className="text-sm text-[var(--text-muted)] italic truncate">
                                {panel.visual_description.slice(0, 120)}{panel.visual_description.length > 120 ? '...' : ''}
                              </p>
                            ) : (
                              <p className="text-sm text-[var(--text-disabled)] italic">No description yet</p>
                            )}
                            {(panel.dialogue_blocks?.length > 0 || panel.captions?.length > 0) && (
                              <div className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                                {panel.dialogue_blocks?.length > 0 && <span>{panel.dialogue_blocks.length} dialogue</span>}
                                {panel.dialogue_blocks?.length > 0 && panel.captions?.length > 0 && <span> · </span>}
                                {panel.captions?.length > 0 && <span>{panel.captions.length} caption{panel.captions.length !== 1 ? 's' : ''}</span>}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Full Editor — visible when this panel is active or no panel is focused */}
                        {!isCollapsed && (
                          <div className="p-4 space-y-4">
                            {/* Visual Description */}
                            <div>
                              <label className="block text-sm text-[var(--text-secondary)] mb-1">
                                Visual Description
                                <span className="text-[var(--text-muted)] font-normal ml-2">(character names auto-capitalize)</span>
                              </label>
                              <textarea
                                value={panel.visual_description || ''}
                                ref={(el) => { if (el) requestAnimationFrame(() => autoResize(el)) }}
                                onFocus={() => handleTextFieldFocus(panel.id, 'visual_description', panel.visual_description)}
                                onChange={(e) => {
                                  updatePanelField(panel.id, 'visual_description', e.target.value)
                                  autoResize(e.target)
                                }}
                                onBlur={() => handleVisualDescriptionBlur(panel)}
                                placeholder="Describe what the reader sees in this panel..."
                                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm overflow-hidden focus:border-[var(--color-primary)] focus:outline-none"
                                style={{ minHeight: '60px' }}
                              />
                            </div>

                            {/* Dialogue Blocks */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm text-[var(--text-secondary)]">Dialogue</label>
                                <button
                                  onClick={() => addDialogue(panel.id)}
                                  className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                                >
                                  + Add Dialogue
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(panel.dialogue_blocks || [])
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((dialogue) => (
                                    <div key={dialogue.id} data-dialogue-id={dialogue.id} className="bg-[var(--bg-tertiary)] rounded p-3 space-y-2">
                                      <div className="flex gap-2">
                                        <select
                                          value={dialogue.character_id || ''}
                                          onChange={(e) => {
                                            const newValue = e.target.value || null
                                            // Sync local state for accordion safety
                                            setPanels(prev => prev.map(p => ({
                                              ...p,
                                              dialogue_blocks: (p.dialogue_blocks || []).map(d =>
                                                d.id === dialogue.id ? { ...d, character_id: newValue } : d
                                              )
                                            })))
                                            updateDialogue(dialogue.id, 'character_id', e.target.value)
                                          }}
                                          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm flex-1"
                                        >
                                          <option value="">Select Character</option>
                                          {characters.map((char) => (
                                            <option key={char.id} value={char.id}>{char.name}</option>
                                          ))}
                                        </select>
                                        <select
                                          value={dialogue.dialogue_type}
                                          onChange={(e) => {
                                            // Sync local state
                                            setPanels(prev => prev.map(p => ({
                                              ...p,
                                              dialogue_blocks: (p.dialogue_blocks || []).map(d =>
                                                d.id === dialogue.id ? { ...d, dialogue_type: e.target.value } : d
                                              )
                                            })))
                                            updateDialogue(dialogue.id, 'dialogue_type', e.target.value)
                                          }}
                                          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm"
                                        >
                                          <option value="dialogue">Dialogue</option>
                                          <option value="thought">Thought</option>
                                          <option value="whisper">Whisper</option>
                                          <option value="shout">Shout</option>
                                          <option value="off_panel">Off-Panel</option>
                                          <option value="electronic">Electronic</option>
                                        </select>
                                        <button
                                          onClick={() => deleteDialogue(dialogue.id, panel.id)}
                                          className="text-[var(--text-muted)] hover:text-[var(--color-error)] px-2"
                                        >
                                          ×
                                        </button>
                                      </div>
                                      <textarea
                                        defaultValue={dialogue.text}
                                        ref={(el) => { if (el) requestAnimationFrame(() => autoResize(el)) }}
                                        onFocus={(e) => { focusStartValueRef.current = e.target.value }}
                                        onInput={(e) => {
                                          autoResize(e.target as HTMLTextAreaElement)
                                          // Sync local state live for word count badge
                                          const newText = (e.target as HTMLTextAreaElement).value
                                          setPanels(prev => prev.map(p => ({
                                            ...p,
                                            dialogue_blocks: (p.dialogue_blocks || []).map(d =>
                                              d.id === dialogue.id ? { ...d, text: newText } : d
                                            )
                                          })))
                                        }}
                                        onBlur={(e) => {
                                          const newText = e.target.value
                                          updateDialogue(dialogue.id, 'text', newText, focusStartValueRef.current)
                                        }}
                                        placeholder="Enter dialogue..."
                                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm overflow-hidden focus:border-[var(--color-primary)] focus:outline-none"
                                        style={{ minHeight: '36px' }}
                                      />
                                    </div>
                                  ))}
                              </div>
                            </div>

                            {/* Captions */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm text-[var(--text-secondary)]">Captions</label>
                                <button
                                  onClick={() => addCaption(panel.id)}
                                  className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                                >
                                  + Add Caption
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(panel.captions || [])
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((caption) => (
                                    <div key={caption.id} className="bg-[var(--bg-tertiary)] rounded p-3 space-y-2">
                                      <div className="flex gap-2">
                                        <select
                                          value={caption.caption_type}
                                          onChange={(e) => {
                                            // Sync local state
                                            setPanels(prev => prev.map(p => ({
                                              ...p,
                                              captions: (p.captions || []).map(c =>
                                                c.id === caption.id ? { ...c, caption_type: e.target.value } : c
                                              )
                                            })))
                                            updateCaption(caption.id, 'caption_type', e.target.value)
                                          }}
                                          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm"
                                        >
                                          <option value="narrative">Narrative</option>
                                          <option value="location">Location</option>
                                          <option value="time">Time</option>
                                          <option value="editorial">Editorial</option>
                                        </select>
                                        <button
                                          onClick={() => deleteCaption(caption.id, panel.id)}
                                          className="text-[var(--text-muted)] hover:text-[var(--color-error)] px-2 ml-auto"
                                        >
                                          ×
                                        </button>
                                      </div>
                                      <textarea
                                        defaultValue={caption.text}
                                        ref={(el) => { if (el) requestAnimationFrame(() => autoResize(el)) }}
                                        onFocus={(e) => { focusStartValueRef.current = e.target.value }}
                                        onInput={(e) => {
                                          autoResize(e.target as HTMLTextAreaElement)
                                          // Sync local state live for word count badge
                                          const newText = (e.target as HTMLTextAreaElement).value
                                          setPanels(prev => prev.map(p => ({
                                            ...p,
                                            captions: (p.captions || []).map(c =>
                                              c.id === caption.id ? { ...c, text: newText } : c
                                            )
                                          })))
                                        }}
                                        onBlur={(e) => {
                                          const newText = e.target.value
                                          updateCaption(caption.id, 'text', newText, focusStartValueRef.current)
                                        }}
                                        placeholder="Enter caption text..."
                                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm overflow-hidden focus:border-[var(--color-primary)] focus:outline-none"
                                        style={{ minHeight: '36px' }}
                                      />
                                    </div>
                                  ))}
                              </div>
                            </div>

                            {/* Sound Effects */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm text-[var(--text-secondary)]">Sound Effects</label>
                                <button
                                  onClick={() => addSoundEffect(panel.id)}
                                  className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                                >
                                  + Add SFX
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(panel.sound_effects || [])
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((sfx) => (
                                    <div key={sfx.id} className="bg-[var(--bg-tertiary)] rounded p-3 flex gap-2 items-center">
                                      <input
                                        type="text"
                                        defaultValue={sfx.text}
                                        onFocus={(e) => { focusStartValueRef.current = e.target.value }}
                                        onInput={(e) => {
                                          // Sync local state live for word count badge
                                          const newText = (e.target as HTMLInputElement).value
                                          setPanels(prev => prev.map(p => ({
                                            ...p,
                                            sound_effects: (p.sound_effects || []).map(s =>
                                              s.id === sfx.id ? { ...s, text: newText } : s
                                            )
                                          })))
                                        }}
                                        onBlur={(e) => {
                                          const newText = e.target.value
                                          updateSoundEffect(sfx.id, newText, focusStartValueRef.current)
                                        }}
                                        placeholder="CRASH!, BANG!, WHOOSH!..."
                                        className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm font-bold uppercase focus:border-[var(--color-primary)] focus:outline-none"
                                      />
                                      <button
                                        onClick={() => deleteSoundEffect(sfx.id, panel.id)}
                                        className="text-[var(--text-muted)] hover:text-[var(--color-error)] px-2"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            </div>

                            {/* Panel Notes */}
                            <div>
                              <label className="block text-sm text-[var(--text-secondary)] mb-1">Artist Notes (Optional)</label>
                              <textarea
                                value={panel.notes || ''}
                                ref={(el) => { if (el) requestAnimationFrame(() => autoResize(el)) }}
                                onFocus={() => handleTextFieldFocus(panel.id, 'notes', panel.notes)}
                                onChange={(e) => {
                                  updatePanelField(panel.id, 'notes', e.target.value)
                                  autoResize(e.target)
                                }}
                                onBlur={() => handleOtherFieldBlur(panel, 'notes')}
                                placeholder="Additional notes for the artist..."
                                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm overflow-hidden focus:border-[var(--color-primary)] focus:outline-none"
                                style={{ minHeight: '36px' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </SortablePanelCard>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
