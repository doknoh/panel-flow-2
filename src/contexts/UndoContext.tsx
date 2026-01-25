'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from './ToastContext'

// Action types for all undoable operations
export type UndoActionType =
  | 'panel_field_update'
  | 'dialogue_add'
  | 'dialogue_update'
  | 'dialogue_delete'
  | 'caption_add'
  | 'caption_update'
  | 'caption_delete'
  | 'sfx_add'
  | 'sfx_update'
  | 'sfx_delete'
  | 'panel_add'
  | 'panel_delete'
  | 'page_add'
  | 'page_delete'
  | 'scene_add'
  | 'scene_delete'
  | 'act_add'
  | 'act_delete'

interface BaseAction {
  type: UndoActionType
  timestamp: number
  description: string
}

interface PanelFieldAction extends BaseAction {
  type: 'panel_field_update'
  panelId: string
  field: 'visual_description' | 'shot_type' | 'notes'
  oldValue: string | null
  newValue: string | null
}

interface DialogueAddAction extends BaseAction {
  type: 'dialogue_add'
  dialogueId: string
  panelId: string
  data: any
}

interface DialogueUpdateAction extends BaseAction {
  type: 'dialogue_update'
  dialogueId: string
  field: string
  oldValue: any
  newValue: any
}

interface DialogueDeleteAction extends BaseAction {
  type: 'dialogue_delete'
  dialogueId: string
  panelId: string
  data: any // Full dialogue data for restoration
}

interface CaptionAddAction extends BaseAction {
  type: 'caption_add'
  captionId: string
  panelId: string
  data: any
}

interface CaptionUpdateAction extends BaseAction {
  type: 'caption_update'
  captionId: string
  field: string
  oldValue: any
  newValue: any
}

interface CaptionDeleteAction extends BaseAction {
  type: 'caption_delete'
  captionId: string
  panelId: string
  data: any
}

interface SfxAddAction extends BaseAction {
  type: 'sfx_add'
  sfxId: string
  panelId: string
  data: any
}

interface SfxUpdateAction extends BaseAction {
  type: 'sfx_update'
  sfxId: string
  oldValue: string
  newValue: string
}

interface SfxDeleteAction extends BaseAction {
  type: 'sfx_delete'
  sfxId: string
  panelId: string
  data: any
}

interface PanelAddAction extends BaseAction {
  type: 'panel_add'
  panelId: string
  pageId: string
  data: any
}

interface PanelDeleteAction extends BaseAction {
  type: 'panel_delete'
  panelId: string
  pageId: string
  data: any // Full panel data including dialogue/captions for restoration
}

export type UndoAction =
  | PanelFieldAction
  | DialogueAddAction
  | DialogueUpdateAction
  | DialogueDeleteAction
  | CaptionAddAction
  | CaptionUpdateAction
  | CaptionDeleteAction
  | SfxAddAction
  | SfxUpdateAction
  | SfxDeleteAction
  | PanelAddAction
  | PanelDeleteAction

// Helper type for recording actions without timestamp
type RecordableAction = {
  type: UndoActionType
  description: string
  [key: string]: any
}

interface UndoContextType {
  canUndo: boolean
  canRedo: boolean
  undoStack: UndoAction[]
  redoStack: UndoAction[]
  recordAction: (action: RecordableAction) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  clearHistory: () => void
  // For text debouncing
  startTextEdit: (panelId: string, field: string, initialValue: string | null) => void
  endTextEdit: (panelId: string, field: string, finalValue: string | null) => void
}

const UndoContext = createContext<UndoContextType | null>(null)

const MAX_UNDO_STACK = 100
const TEXT_DEBOUNCE_MS = 1000

export function useUndo() {
  const context = useContext(UndoContext)
  if (!context) {
    throw new Error('useUndo must be used within an UndoProvider')
  }
  return context
}

export function UndoProvider({ children, onRefresh }: { children: ReactNode; onRefresh?: () => void }) {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const [redoStack, setRedoStack] = useState<UndoAction[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const { showToast } = useToast()

  // Track ongoing text edits for debouncing
  const pendingTextEdits = useRef<Map<string, { field: string; initialValue: string | null; timer: NodeJS.Timeout | null }>>(new Map())

  const recordAction = useCallback((action: RecordableAction) => {
    const fullAction = { ...action, timestamp: Date.now() } as UndoAction

    setUndoStack(prev => {
      const newStack = [...prev, fullAction]
      // Keep only last MAX_UNDO_STACK actions
      if (newStack.length > MAX_UNDO_STACK) {
        return newStack.slice(-MAX_UNDO_STACK)
      }
      return newStack
    })

    // Clear redo stack when new action is recorded
    setRedoStack([])
  }, [])

  // Start tracking a text edit (for debouncing)
  const startTextEdit = useCallback((panelId: string, field: string, initialValue: string | null) => {
    const key = `${panelId}:${field}`
    const existing = pendingTextEdits.current.get(key)

    // Don't start new tracking if we're already tracking this field
    if (!existing) {
      pendingTextEdits.current.set(key, {
        field,
        initialValue,
        timer: null,
      })
    }
  }, [])

  // End a text edit and record it if value changed
  const endTextEdit = useCallback((panelId: string, field: string, finalValue: string | null) => {
    const key = `${panelId}:${field}`
    const edit = pendingTextEdits.current.get(key)

    if (edit && edit.initialValue !== finalValue) {
      recordAction({
        type: 'panel_field_update',
        panelId,
        field: field as 'visual_description' | 'shot_type' | 'notes',
        oldValue: edit.initialValue,
        newValue: finalValue,
        description: `Update ${field.replace('_', ' ')}`,
      })
    }

    pendingTextEdits.current.delete(key)
  }, [recordAction])

  const executeUndo = useCallback(async (action: UndoAction): Promise<UndoAction | null> => {
    const supabase = createClient()

    switch (action.type) {
      case 'panel_field_update': {
        const { error } = await supabase
          .from('panels')
          .update({ [action.field]: action.oldValue })
          .eq('id', action.panelId)

        if (error) throw error

        // Return the reverse action for redo
        return {
          ...action,
          oldValue: action.newValue,
          newValue: action.oldValue,
        }
      }

      case 'dialogue_add': {
        // Undo add = delete
        const { error } = await supabase
          .from('dialogue_blocks')
          .delete()
          .eq('id', action.dialogueId)

        if (error) throw error

        return {
          type: 'dialogue_delete',
          dialogueId: action.dialogueId,
          panelId: action.panelId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Delete dialogue',
        }
      }

      case 'dialogue_delete': {
        // Undo delete = restore
        const { error } = await supabase
          .from('dialogue_blocks')
          .insert({
            id: action.dialogueId,
            panel_id: action.panelId,
            ...action.data,
          })

        if (error) throw error

        return {
          type: 'dialogue_add',
          dialogueId: action.dialogueId,
          panelId: action.panelId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Add dialogue',
        }
      }

      case 'dialogue_update': {
        const { error } = await supabase
          .from('dialogue_blocks')
          .update({ [action.field]: action.oldValue })
          .eq('id', action.dialogueId)

        if (error) throw error

        return {
          ...action,
          oldValue: action.newValue,
          newValue: action.oldValue,
        }
      }

      case 'caption_add': {
        const { error } = await supabase
          .from('captions')
          .delete()
          .eq('id', action.captionId)

        if (error) throw error

        return {
          type: 'caption_delete',
          captionId: action.captionId,
          panelId: action.panelId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Delete caption',
        }
      }

      case 'caption_delete': {
        const { error } = await supabase
          .from('captions')
          .insert({
            id: action.captionId,
            panel_id: action.panelId,
            ...action.data,
          })

        if (error) throw error

        return {
          type: 'caption_add',
          captionId: action.captionId,
          panelId: action.panelId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Add caption',
        }
      }

      case 'caption_update': {
        const { error } = await supabase
          .from('captions')
          .update({ [action.field]: action.oldValue })
          .eq('id', action.captionId)

        if (error) throw error

        return {
          ...action,
          oldValue: action.newValue,
          newValue: action.oldValue,
        }
      }

      case 'sfx_add': {
        const { error } = await supabase
          .from('sound_effects')
          .delete()
          .eq('id', action.sfxId)

        if (error) throw error

        return {
          type: 'sfx_delete',
          sfxId: action.sfxId,
          panelId: action.panelId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Delete sound effect',
        }
      }

      case 'sfx_delete': {
        const { error } = await supabase
          .from('sound_effects')
          .insert({
            id: action.sfxId,
            panel_id: action.panelId,
            ...action.data,
          })

        if (error) throw error

        return {
          type: 'sfx_add',
          sfxId: action.sfxId,
          panelId: action.panelId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Add sound effect',
        }
      }

      case 'sfx_update': {
        const { error } = await supabase
          .from('sound_effects')
          .update({ text: action.oldValue })
          .eq('id', action.sfxId)

        if (error) throw error

        return {
          ...action,
          oldValue: action.newValue,
          newValue: action.oldValue,
        }
      }

      case 'panel_add': {
        // Delete the panel (and cascade will handle children)
        const { error } = await supabase
          .from('panels')
          .delete()
          .eq('id', action.panelId)

        if (error) throw error

        return {
          type: 'panel_delete',
          panelId: action.panelId,
          pageId: action.pageId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Delete panel',
        }
      }

      case 'panel_delete': {
        // Restore the panel
        const { error } = await supabase
          .from('panels')
          .insert({
            id: action.panelId,
            page_id: action.pageId,
            ...action.data,
          })

        if (error) throw error

        return {
          type: 'panel_add',
          panelId: action.panelId,
          pageId: action.pageId,
          data: action.data,
          timestamp: Date.now(),
          description: 'Add panel',
        }
      }

      default:
        return null
    }
  }, [])

  const undo = useCallback(async () => {
    if (undoStack.length === 0 || isProcessing) return

    setIsProcessing(true)
    const action = undoStack[undoStack.length - 1]

    try {
      const reverseAction = await executeUndo(action)

      // Remove from undo stack
      setUndoStack(prev => prev.slice(0, -1))

      // Add reverse action to redo stack
      if (reverseAction) {
        setRedoStack(prev => [...prev, reverseAction])
      }

      showToast(`Undo: ${action.description}`, 'info')
      onRefresh?.()
    } catch (error) {
      console.error('Undo failed:', error)
      showToast('Undo failed', 'error')
    } finally {
      setIsProcessing(false)
    }
  }, [undoStack, isProcessing, executeUndo, showToast, onRefresh])

  const redo = useCallback(async () => {
    if (redoStack.length === 0 || isProcessing) return

    setIsProcessing(true)
    const action = redoStack[redoStack.length - 1]

    try {
      const reverseAction = await executeUndo(action)

      // Remove from redo stack
      setRedoStack(prev => prev.slice(0, -1))

      // Add reverse action to undo stack
      if (reverseAction) {
        setUndoStack(prev => [...prev, reverseAction])
      }

      showToast(`Redo: ${action.description}`, 'info')
      onRefresh?.()
    } catch (error) {
      console.error('Redo failed:', error)
      showToast('Redo failed', 'error')
    } finally {
      setIsProcessing(false)
    }
  }, [redoStack, isProcessing, executeUndo, showToast, onRefresh])

  const clearHistory = useCallback(() => {
    setUndoStack([])
    setRedoStack([])
    pendingTextEdits.current.clear()
  }, [])

  return (
    <UndoContext.Provider
      value={{
        canUndo: undoStack.length > 0 && !isProcessing,
        canRedo: redoStack.length > 0 && !isProcessing,
        undoStack,
        redoStack,
        recordAction,
        undo,
        redo,
        clearHistory,
        startTextEdit,
        endTextEdit,
      }}
    >
      {children}
    </UndoContext.Provider>
  )
}
