'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useOffline } from '@/contexts/OfflineContext'
import { useUndo } from '@/contexts/UndoContext'

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

interface Page {
  id: string
  page_number: number
  panels: Panel[]
}

interface PageContext {
  page: any
  act: { id: string; name: string; sort_order: number }
  scene: { id: string; name: string; sort_order: number }
}

interface PageEditorProps {
  page: Page
  pageContext?: PageContext | null
  characters: Character[]
  locations: Location[]
  onUpdate: () => void
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
}

export default function PageEditor({ page, pageContext, characters, locations, onUpdate, setSaveStatus }: PageEditorProps) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [editingPanel, setEditingPanel] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Map<string, Panel>>(new Map())
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const { showToast } = useToast()
  const { isOnline, queueChange, pendingChanges: offlinePending } = useOffline()
  const { recordAction, startTextEdit, endTextEdit } = useUndo()

  useEffect(() => {
    const sortedPanels = [...(page.panels || [])].sort((a, b) => a.panel_number - b.panel_number)
    setPanels(sortedPanels)
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

      // Cmd+D: New dialogue (add to last panel)
      if (isMod && e.key === 'd' && !e.shiftKey) {
        e.preventDefault()
        const lastPanel = panels[panels.length - 1]
        if (lastPanel) {
          addDialogue(lastPanel.id)
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [manualSave, panels])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

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
      return
    }

    if (data) {
      onUpdate()
      setEditingPanel(data.id)
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

  const addDialogue = async (panelId: string) => {
    const supabase = createClient()
    const panel = panels.find(p => p.id === panelId)
    const sortOrder = (panel?.dialogue_blocks?.length || 0) + 1

    const { data, error } = await supabase
      .from('dialogue_blocks')
      .insert({
        panel_id: panelId,
        dialogue_type: 'dialogue',
        text: '',
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding dialogue:', error)
      showToast('Failed to add dialogue: ' + error.message, 'error')
    } else if (data) {
      // Record undo action
      recordAction({
        type: 'dialogue_add',
        dialogueId: data.id,
        panelId,
        data: {
          dialogue_type: 'dialogue',
          text: '',
          sort_order: sortOrder,
        },
        description: 'Add dialogue',
      })
      onUpdate()
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
      onUpdate()
    }
  }

  const deleteDialogue = async (dialogueId: string, panelId: string, dialogueData?: any) => {
    const supabase = createClient()

    // Get the dialogue data for undo if not provided
    let dataForUndo = dialogueData
    if (!dataForUndo) {
      const { data } = await supabase
        .from('dialogue_blocks')
        .select('*')
        .eq('id', dialogueId)
        .single()
      dataForUndo = data
    }

    const { error } = await supabase.from('dialogue_blocks').delete().eq('id', dialogueId)

    if (!error && dataForUndo) {
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

    onUpdate()
  }

  const addCaption = async (panelId: string) => {
    const supabase = createClient()
    const panel = panels.find(p => p.id === panelId)
    const sortOrder = (panel?.captions?.length || 0) + 1

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
    } else if (data) {
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
      onUpdate()
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
      onUpdate()
    }
  }

  const deleteCaption = async (captionId: string, panelId: string) => {
    const supabase = createClient()

    // Get the caption data for undo
    const { data: captionData } = await supabase
      .from('captions')
      .select('*')
      .eq('id', captionId)
      .single()

    const { error } = await supabase.from('captions').delete().eq('id', captionId)

    if (!error && captionData) {
      recordAction({
        type: 'caption_delete',
        captionId,
        panelId,
        data: {
          caption_type: captionData.caption_type,
          text: captionData.text,
          sort_order: captionData.sort_order,
        },
        description: 'Delete caption',
      })
    }

    onUpdate()
  }

  const addSoundEffect = async (panelId: string) => {
    const supabase = createClient()
    const panel = panels.find(p => p.id === panelId)
    const sortOrder = (panel?.sound_effects?.length || 0) + 1

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
    } else if (data) {
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
      onUpdate()
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
      onUpdate()
    }
  }

  const deleteSoundEffect = async (sfxId: string, panelId: string) => {
    const supabase = createClient()

    // Get the sfx data for undo
    const { data: sfxData } = await supabase
      .from('sound_effects')
      .select('*')
      .eq('id', sfxId)
      .single()

    const { error } = await supabase.from('sound_effects').delete().eq('id', sfxId)

    if (!error && sfxData) {
      recordAction({
        type: 'sfx_delete',
        sfxId,
        panelId,
        data: {
          text: sfxData.text,
          sort_order: sfxData.sort_order,
        },
        description: 'Delete sound effect',
      })
    }

    onUpdate()
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

    const supabase = createClient()

    const { error } = await supabase.from('panels').delete().eq('id', panelId)

    if (!error && panel) {
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
          // Note: Dialogue/captions/sfx would need to be restored separately
          // This is a simplified version that restores the panel structure
        },
        description: 'Delete panel',
      })
    }

    onUpdate()
  }

  return (
    <div className="p-6">
      {/* Context breadcrumb */}
      {pageContext && (
        <div className="mb-2 text-sm text-zinc-500 flex items-center gap-1.5">
          <span className="text-zinc-400">{pageContext.act.name || `Act ${pageContext.act.sort_order}`}</span>
          <span className="text-zinc-600">›</span>
          <span className="text-zinc-400">{pageContext.scene.name || `Scene ${pageContext.scene.sort_order}`}</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Page {page.page_number}</h2>
        <div className="flex items-center gap-3">
          <div className="text-xs text-zinc-500 space-x-3">
            <span>⌘S save</span>
            <span>⌘↵ panel</span>
            <span>⌘D dialog</span>
            <span>⌘⇧D sfx</span>
          </div>
          <button
            onClick={addPanel}
            className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-sm"
          >
            + Add Panel
          </button>
        </div>
      </div>

      {panels.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 border-dashed rounded-lg">
          <div className="text-4xl mb-4 opacity-30">🎬</div>
          <h3 className="text-lg font-medium text-zinc-300 mb-2">Ready to create your first panel</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
            Panels are the building blocks of your comic. Add visual descriptions, dialogue, captions, and sound effects.
          </p>
          <button
            onClick={addPanel}
            className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            + Create First Panel
          </button>
          <p className="text-xs text-zinc-600 mt-4">
            or press <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">↵</kbd>
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {panels.map((panel) => (
            <div key={panel.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
                <span className="font-semibold">Panel {panel.panel_number}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={panel.shot_type || ''}
                    onChange={(e) => {
                      updatePanelField(panel.id, 'shot_type', e.target.value)
                    }}
                    className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm"
                  >
                    <option value="">Shot Type</option>
                    <option value="wide">Wide Shot</option>
                    <option value="medium">Medium Shot</option>
                    <option value="close">Close-Up</option>
                    <option value="extreme_close">Extreme Close-Up</option>
                    <option value="bird">Bird's Eye</option>
                    <option value="worm">Worm's Eye</option>
                    <option value="pov">POV</option>
                  </select>
                  <button
                    onClick={() => deletePanel(panel.id)}
                    className="text-zinc-500 hover:text-red-400 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Visual Description */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Visual Description
                    <span className="text-zinc-500 font-normal ml-2">(character names auto-capitalize)</span>
                  </label>
                  <textarea
                    value={panel.visual_description || ''}
                    onFocus={() => handleTextFieldFocus(panel.id, 'visual_description', panel.visual_description)}
                    onChange={(e) => updatePanelField(panel.id, 'visual_description', e.target.value)}
                    onBlur={() => handleVisualDescriptionBlur(panel)}
                    placeholder="Describe what the reader sees in this panel..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-vertical focus:border-blue-500 focus:outline-none min-h-[100px]"
                    rows={5}
                  />
                </div>

                {/* Dialogue Blocks */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-zinc-400">Dialogue</label>
                    <button
                      onClick={() => addDialogue(panel.id)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      + Add Dialogue
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(panel.dialogue_blocks || [])
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((dialogue) => (
                        <div key={dialogue.id} className="bg-zinc-800 rounded p-3 space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={dialogue.character_id || ''}
                              onChange={(e) => updateDialogue(dialogue.id, 'character_id', e.target.value)}
                              className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm flex-1"
                            >
                              <option value="">Select Character</option>
                              {characters.map((char) => (
                                <option key={char.id} value={char.id}>{char.name}</option>
                              ))}
                            </select>
                            <select
                              value={dialogue.dialogue_type}
                              onChange={(e) => updateDialogue(dialogue.id, 'dialogue_type', e.target.value)}
                              className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm"
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
                              className="text-zinc-500 hover:text-red-400 px-2"
                            >
                              ×
                            </button>
                          </div>
                          <textarea
                            defaultValue={dialogue.text}
                            onBlur={(e) => updateDialogue(dialogue.id, 'text', e.target.value)}
                            placeholder="Enter dialogue..."
                            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm resize-none focus:border-blue-500 focus:outline-none"
                            rows={2}
                          />
                        </div>
                      ))}
                  </div>
                </div>

                {/* Captions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-zinc-400">Captions</label>
                    <button
                      onClick={() => addCaption(panel.id)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      + Add Caption
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(panel.captions || [])
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((caption) => (
                        <div key={caption.id} className="bg-zinc-800 rounded p-3 space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={caption.caption_type}
                              onChange={(e) => updateCaption(caption.id, 'caption_type', e.target.value)}
                              className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm"
                            >
                              <option value="narrative">Narrative</option>
                              <option value="location">Location</option>
                              <option value="time">Time</option>
                              <option value="editorial">Editorial</option>
                            </select>
                            <button
                              onClick={() => deleteCaption(caption.id, panel.id)}
                              className="text-zinc-500 hover:text-red-400 px-2 ml-auto"
                            >
                              ×
                            </button>
                          </div>
                          <textarea
                            defaultValue={caption.text}
                            onBlur={(e) => updateCaption(caption.id, 'text', e.target.value)}
                            placeholder="Enter caption text..."
                            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm resize-none focus:border-blue-500 focus:outline-none"
                            rows={2}
                          />
                        </div>
                      ))}
                  </div>
                </div>

                {/* Sound Effects */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-zinc-400">Sound Effects</label>
                    <button
                      onClick={() => addSoundEffect(panel.id)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      + Add SFX
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(panel.sound_effects || [])
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((sfx) => (
                        <div key={sfx.id} className="bg-zinc-800 rounded p-3 flex gap-2 items-center">
                          <input
                            type="text"
                            defaultValue={sfx.text}
                            onBlur={(e) => updateSoundEffect(sfx.id, e.target.value)}
                            placeholder="CRASH!, BANG!, WHOOSH!..."
                            className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm font-bold uppercase focus:border-blue-500 focus:outline-none"
                          />
                          <button
                            onClick={() => deleteSoundEffect(sfx.id, panel.id)}
                            className="text-zinc-500 hover:text-red-400 px-2"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Panel Notes */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Artist Notes (Optional)</label>
                  <textarea
                    value={panel.notes || ''}
                    onFocus={() => handleTextFieldFocus(panel.id, 'notes', panel.notes)}
                    onChange={(e) => updatePanelField(panel.id, 'notes', e.target.value)}
                    onBlur={() => handleOtherFieldBlur(panel, 'notes')}
                    placeholder="Additional notes for the artist..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
