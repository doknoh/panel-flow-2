'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from './ToastContext'
import { restorePageDeep, restoreSceneDeep, restoreActDeep } from '@/lib/undoHelpers'

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
  | 'panel_reorder'
  | 'page_add'
  | 'page_delete'
  | 'scene_add'
  | 'scene_delete'
  | 'act_add'
  | 'act_delete'
  | 'rename'
  | 'page_reorder'
  | 'scene_reorder'
  | 'act_reorder'
  | 'page_move'
  | 'scene_move'
  | 'page_duplicate'
  | 'scene_duplicate'
  | 'page_summary_update'
  // Batch operations
  | 'batch_page_delete'
  | 'batch_scene_delete'
  | 'batch_act_delete'
  | 'batch_page_add'
  | 'batch_scene_add'
  | 'batch_act_add'

interface BaseAction {
  type: UndoActionType
  timestamp: number
  description: string
}

// --- Panel operations ---

interface PanelFieldAction extends BaseAction {
  type: 'panel_field_update'
  panelId: string
  field: 'visual_description' | 'camera' | 'notes_to_artist'
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
  data: any
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
  data: any // Full panel data including dialogue/captions/sfx for restoration
}

interface PanelReorderAction extends BaseAction {
  type: 'panel_reorder'
  pageId: string
  previousOrder: { id: string; panel_number: number }[]
  newOrder: { id: string; panel_number: number }[]
}

// --- Page operations ---

interface PageAddAction extends BaseAction {
  type: 'page_add'
  pageId: string
  sceneId: string
  data: any
}

interface PageDeleteAction extends BaseAction {
  type: 'page_delete'
  pageId: string
  sceneId: string
  data: any // Full page data with nested panels/dialogue/captions/sfx
}

// --- Scene operations ---

interface SceneAddAction extends BaseAction {
  type: 'scene_add'
  sceneId: string
  actId: string
  data: any
}

interface SceneDeleteAction extends BaseAction {
  type: 'scene_delete'
  sceneId: string
  actId: string
  data: any // Full scene data with nested pages
}

// --- Act operations ---

interface ActAddAction extends BaseAction {
  type: 'act_add'
  actId: string
  issueId: string
  data: any
}

interface ActDeleteAction extends BaseAction {
  type: 'act_delete'
  actId: string
  issueId: string
  data: any // Full act data with nested scenes
}

// --- Rename ---

interface RenameAction extends BaseAction {
  type: 'rename'
  entityType: 'act' | 'scene' | 'page'
  entityId: string
  field: string
  oldValue: string
  newValue: string
}

// --- Reorder operations ---

interface PageReorderAction extends BaseAction {
  type: 'page_reorder'
  sceneId: string
  previousOrder: { id: string; sort_order: number }[]
  newOrder: { id: string; sort_order: number }[]
}

interface SceneReorderAction extends BaseAction {
  type: 'scene_reorder'
  actId: string
  previousOrder: { id: string; sort_order: number }[]
  newOrder: { id: string; sort_order: number }[]
}

interface ActReorderAction extends BaseAction {
  type: 'act_reorder'
  issueId: string
  previousOrder: { id: string; sort_order: number }[]
  newOrder: { id: string; sort_order: number }[]
}

// --- Move operations ---

interface PageMoveAction extends BaseAction {
  type: 'page_move'
  pageId: string
  fromSceneId: string
  toSceneId: string
  fromSortOrder: number
  toSortOrder: number
  fromScenePreviousOrders: { id: string; sort_order: number }[]
  toScenePreviousOrders: { id: string; sort_order: number }[]
}

interface SceneMoveAction extends BaseAction {
  type: 'scene_move'
  sceneId: string
  fromActId: string
  toActId: string
  fromSortOrder: number
  toSortOrder: number
  fromActPreviousOrders: { id: string; sort_order: number }[]
  toActPreviousOrders: { id: string; sort_order: number }[]
}

// --- Duplicate operations ---

interface PageDuplicateAction extends BaseAction {
  type: 'page_duplicate'
  newPageId: string
  sourcePageId: string
  sceneId: string
}

interface SceneDuplicateAction extends BaseAction {
  type: 'scene_duplicate'
  newSceneId: string
  sourceSceneId: string
  actId: string
}

// --- Page summary ---

interface PageSummaryUpdateAction extends BaseAction {
  type: 'page_summary_update'
  pageId: string
  oldValue: string | null
  newValue: string | null
}

// --- Batch operations ---

interface BatchPageDeleteAction extends BaseAction {
  type: 'batch_page_delete'
  items: Array<{ pageId: string; sceneId: string; data: any }>
}

interface BatchSceneDeleteAction extends BaseAction {
  type: 'batch_scene_delete'
  items: Array<{ sceneId: string; actId: string; data: any }>
}

interface BatchActDeleteAction extends BaseAction {
  type: 'batch_act_delete'
  items: Array<{ actId: string; issueId: string; data: any }>
}

interface BatchPageAddAction extends BaseAction {
  type: 'batch_page_add'
  items: Array<{ pageId: string; sceneId: string; data: any }>
}

interface BatchSceneAddAction extends BaseAction {
  type: 'batch_scene_add'
  items: Array<{ sceneId: string; actId: string; data: any }>
}

interface BatchActAddAction extends BaseAction {
  type: 'batch_act_add'
  items: Array<{ actId: string; issueId: string; data: any }>
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
  | PanelReorderAction
  | PageAddAction
  | PageDeleteAction
  | SceneAddAction
  | SceneDeleteAction
  | ActAddAction
  | ActDeleteAction
  | RenameAction
  | PageReorderAction
  | SceneReorderAction
  | ActReorderAction
  | PageMoveAction
  | SceneMoveAction
  | PageDuplicateAction
  | SceneDuplicateAction
  | PageSummaryUpdateAction
  | BatchPageDeleteAction
  | BatchSceneDeleteAction
  | BatchActDeleteAction
  | BatchPageAddAction
  | BatchSceneAddAction
  | BatchActAddAction

// Helper type for recording actions without timestamp
type RecordableAction = {
  type: UndoActionType
  description: string
  [key: string]: any
}

// Entity types for generic text edit tracking
type EditableEntityType = 'panel' | 'dialogue' | 'caption' | 'sfx'

interface UndoContextType {
  canUndo: boolean
  canRedo: boolean
  undoStack: UndoAction[]
  redoStack: UndoAction[]
  recordAction: (action: RecordableAction) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  clearHistory: () => void
  // For text debouncing (panel fields)
  startTextEdit: (panelId: string, field: string, initialValue: string | null) => void
  endTextEdit: (panelId: string, field: string, finalValue: string | null) => void
  // For generic text debouncing (dialogue, caption, sfx text fields)
  startGenericTextEdit: (entityType: EditableEntityType, entityId: string, field: string, initialValue: string | null, metadata?: Record<string, any>) => void
  endGenericTextEdit: (entityType: EditableEntityType, entityId: string, field: string, finalValue: string | null) => void
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

  // Track generic entity text edits (for dialogue, caption, sfx)
  const pendingGenericEdits = useRef<Map<string, {
    entityType: EditableEntityType
    entityId: string
    field: string
    initialValue: string | null
    metadata?: Record<string, any>
  }>>(new Map())

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
        field: field as 'visual_description' | 'camera' | 'notes_to_artist',
        oldValue: edit.initialValue,
        newValue: finalValue,
        description: `Update ${field.replace('_', ' ')}`,
      })
    }

    pendingTextEdits.current.delete(key)
  }, [recordAction])

  // Start tracking a generic entity text edit (for dialogue/caption/sfx)
  const startGenericTextEdit = useCallback((
    entityType: EditableEntityType,
    entityId: string,
    field: string,
    initialValue: string | null,
    metadata?: Record<string, any>
  ) => {
    const key = `${entityType}:${entityId}:${field}`
    const existing = pendingGenericEdits.current.get(key)

    // Don't start new tracking if we're already tracking this field
    if (!existing) {
      pendingGenericEdits.current.set(key, {
        entityType,
        entityId,
        field,
        initialValue,
        metadata,
      })
    }
  }, [])

  // End a generic text edit and record it if value changed
  const endGenericTextEdit = useCallback((
    entityType: EditableEntityType,
    entityId: string,
    field: string,
    finalValue: string | null
  ) => {
    const key = `${entityType}:${entityId}:${field}`
    const edit = pendingGenericEdits.current.get(key)

    if (edit && edit.initialValue !== finalValue) {
      // Record appropriate action based on entity type
      switch (entityType) {
        case 'dialogue':
          recordAction({
            type: 'dialogue_update',
            dialogueId: entityId,
            field,
            oldValue: edit.initialValue,
            newValue: finalValue,
            description: `Update dialogue ${field}`,
          })
          break
        case 'caption':
          recordAction({
            type: 'caption_update',
            captionId: entityId,
            field,
            oldValue: edit.initialValue,
            newValue: finalValue,
            description: `Update caption ${field}`,
          })
          break
        case 'sfx':
          recordAction({
            type: 'sfx_update',
            sfxId: entityId,
            oldValue: edit.initialValue || '',
            newValue: finalValue || '',
            description: 'Update sound effect',
          })
          break
        case 'panel':
          // For panels, use the existing panel_field_update
          recordAction({
            type: 'panel_field_update',
            panelId: entityId,
            field: field as 'visual_description' | 'camera' | 'notes_to_artist',
            oldValue: edit.initialValue,
            newValue: finalValue,
            description: `Update ${field.replace('_', ' ')}`,
          })
          break
      }
    }

    pendingGenericEdits.current.delete(key)
  }, [recordAction])

  const executeUndo = useCallback(async (action: UndoAction): Promise<UndoAction | null> => {
    const supabase = createClient()

    switch (action.type) {
      // === Panel field updates ===
      case 'panel_field_update': {
        const { error } = await supabase
          .from('panels')
          .update({ [action.field]: action.oldValue })
          .eq('id', action.panelId)
        if (error) throw error
        return { ...action, oldValue: action.newValue, newValue: action.oldValue }
      }

      // === Dialogue operations ===
      case 'dialogue_add': {
        const { error } = await supabase.from('dialogue_blocks').delete().eq('id', action.dialogueId)
        if (error) throw error
        return {
          type: 'dialogue_delete', dialogueId: action.dialogueId, panelId: action.panelId,
          data: action.data, timestamp: Date.now(), description: 'Delete dialogue',
        }
      }
      case 'dialogue_delete': {
        const { error } = await supabase.from('dialogue_blocks').insert({
          id: action.dialogueId, panel_id: action.panelId, ...action.data,
        })
        if (error) throw error
        return {
          type: 'dialogue_add', dialogueId: action.dialogueId, panelId: action.panelId,
          data: action.data, timestamp: Date.now(), description: 'Add dialogue',
        }
      }
      case 'dialogue_update': {
        const { error } = await supabase.from('dialogue_blocks')
          .update({ [action.field]: action.oldValue }).eq('id', action.dialogueId)
        if (error) throw error
        return { ...action, oldValue: action.newValue, newValue: action.oldValue }
      }

      // === Caption operations ===
      case 'caption_add': {
        const { error } = await supabase.from('captions').delete().eq('id', action.captionId)
        if (error) throw error
        return {
          type: 'caption_delete', captionId: action.captionId, panelId: action.panelId,
          data: action.data, timestamp: Date.now(), description: 'Delete caption',
        }
      }
      case 'caption_delete': {
        const { error } = await supabase.from('captions').insert({
          id: action.captionId, panel_id: action.panelId, ...action.data,
        })
        if (error) throw error
        return {
          type: 'caption_add', captionId: action.captionId, panelId: action.panelId,
          data: action.data, timestamp: Date.now(), description: 'Add caption',
        }
      }
      case 'caption_update': {
        const { error } = await supabase.from('captions')
          .update({ [action.field]: action.oldValue }).eq('id', action.captionId)
        if (error) throw error
        return { ...action, oldValue: action.newValue, newValue: action.oldValue }
      }

      // === SFX operations ===
      case 'sfx_add': {
        const { error } = await supabase.from('sound_effects').delete().eq('id', action.sfxId)
        if (error) throw error
        return {
          type: 'sfx_delete', sfxId: action.sfxId, panelId: action.panelId,
          data: action.data, timestamp: Date.now(), description: 'Delete sound effect',
        }
      }
      case 'sfx_delete': {
        const { error } = await supabase.from('sound_effects').insert({
          id: action.sfxId, panel_id: action.panelId, ...action.data,
        })
        if (error) throw error
        return {
          type: 'sfx_add', sfxId: action.sfxId, panelId: action.panelId,
          data: action.data, timestamp: Date.now(), description: 'Add sound effect',
        }
      }
      case 'sfx_update': {
        const { error } = await supabase.from('sound_effects')
          .update({ text: action.oldValue }).eq('id', action.sfxId)
        if (error) throw error
        return { ...action, oldValue: action.newValue, newValue: action.oldValue }
      }

      // === Panel add/delete/reorder ===
      case 'panel_add': {
        const { error } = await supabase.from('panels').delete().eq('id', action.panelId)
        if (error) throw error
        return {
          type: 'panel_delete', panelId: action.panelId, pageId: action.pageId,
          data: action.data, timestamp: Date.now(), description: 'Delete panel',
        }
      }
      case 'panel_delete': {
        // Restore the panel — extract children data
        const { dialogue_blocks, captions, sound_effects, ...panelFields } = action.data
        const { error } = await supabase.from('panels').insert({
          id: action.panelId, page_id: action.pageId, ...panelFields,
        })
        if (error) throw error

        // Restore children if present
        if (dialogue_blocks?.length) {
          for (const dlg of dialogue_blocks) {
            const { character, ...dlgFields } = dlg
            await supabase.from('dialogue_blocks').insert({ ...dlgFields, panel_id: action.panelId })
          }
        }
        if (captions?.length) {
          for (const cap of captions) {
            await supabase.from('captions').insert({ ...cap, panel_id: action.panelId })
          }
        }
        if (sound_effects?.length) {
          for (const sfx of sound_effects) {
            await supabase.from('sound_effects').insert({ ...sfx, panel_id: action.panelId })
          }
        }

        return {
          type: 'panel_add', panelId: action.panelId, pageId: action.pageId,
          data: action.data, timestamp: Date.now(), description: 'Add panel',
        }
      }
      case 'panel_reorder': {
        const reorderAction = action as PanelReorderAction
        if (reorderAction.previousOrder) {
          await Promise.all(
            reorderAction.previousOrder.map(({ id, panel_number }) =>
              supabase.from('panels').update({ sort_order: panel_number, panel_number }).eq('id', id)
            )
          )
        }
        return {
          type: 'panel_reorder' as const, pageId: reorderAction.pageId,
          previousOrder: reorderAction.newOrder, newOrder: reorderAction.previousOrder,
          timestamp: Date.now(), description: 'Reorder panels',
        }
      }

      // === Page add/delete ===
      case 'page_add': {
        const a = action as PageAddAction
        const { error } = await supabase.from('pages').delete().eq('id', a.pageId)
        if (error) throw error
        return {
          type: 'page_delete', pageId: a.pageId, sceneId: a.sceneId,
          data: a.data, timestamp: Date.now(), description: 'Delete page',
        }
      }
      case 'page_delete': {
        const a = action as PageDeleteAction
        await restorePageDeep(supabase, { id: a.pageId, ...a.data }, a.sceneId)
        return {
          type: 'page_add', pageId: a.pageId, sceneId: a.sceneId,
          data: a.data, timestamp: Date.now(), description: 'Add page',
        }
      }

      // === Scene add/delete ===
      case 'scene_add': {
        const a = action as SceneAddAction
        const { error } = await supabase.from('scenes').delete().eq('id', a.sceneId)
        if (error) throw error
        return {
          type: 'scene_delete', sceneId: a.sceneId, actId: a.actId,
          data: { ...a.data, pages: [] }, timestamp: Date.now(), description: 'Delete scene',
        }
      }
      case 'scene_delete': {
        const a = action as SceneDeleteAction
        await restoreSceneDeep(supabase, { id: a.sceneId, ...a.data }, a.actId)
        return {
          type: 'scene_add', sceneId: a.sceneId, actId: a.actId,
          data: a.data, timestamp: Date.now(), description: 'Add scene',
        }
      }

      // === Act add/delete ===
      case 'act_add': {
        const a = action as ActAddAction
        const { error } = await supabase.from('acts').delete().eq('id', a.actId)
        if (error) throw error
        return {
          type: 'act_delete', actId: a.actId, issueId: a.issueId,
          data: { ...a.data, scenes: [] }, timestamp: Date.now(), description: 'Delete act',
        }
      }
      case 'act_delete': {
        const a = action as ActDeleteAction
        await restoreActDeep(supabase, { id: a.actId, ...a.data }, a.issueId)
        return {
          type: 'act_add', actId: a.actId, issueId: a.issueId,
          data: a.data, timestamp: Date.now(), description: 'Add act',
        }
      }

      // === Rename ===
      case 'rename': {
        const a = action as RenameAction
        const table = a.entityType === 'act' ? 'acts'
          : a.entityType === 'scene' ? 'scenes' : 'pages'
        const { error } = await supabase.from(table)
          .update({ [a.field]: a.oldValue }).eq('id', a.entityId)
        if (error) throw error
        return { ...a, oldValue: a.newValue, newValue: a.oldValue }
      }

      // === Page reorder ===
      case 'page_reorder': {
        const a = action as PageReorderAction
        await Promise.all(
          a.previousOrder.map(({ id, sort_order }) =>
            supabase.from('pages').update({ sort_order }).eq('id', id)
          )
        )
        return {
          type: 'page_reorder' as const, sceneId: a.sceneId,
          previousOrder: a.newOrder, newOrder: a.previousOrder,
          timestamp: Date.now(), description: 'Reorder pages',
        }
      }

      // === Scene reorder ===
      case 'scene_reorder': {
        const a = action as SceneReorderAction
        await Promise.all(
          a.previousOrder.map(({ id, sort_order }) =>
            supabase.from('scenes').update({ sort_order }).eq('id', id)
          )
        )
        return {
          type: 'scene_reorder' as const, actId: a.actId,
          previousOrder: a.newOrder, newOrder: a.previousOrder,
          timestamp: Date.now(), description: 'Reorder scenes',
        }
      }

      // === Act reorder ===
      case 'act_reorder': {
        const a = action as ActReorderAction
        await Promise.all(
          a.previousOrder.map(({ id, sort_order }) =>
            supabase.from('acts').update({ sort_order }).eq('id', id)
          )
        )
        return {
          type: 'act_reorder' as const, issueId: a.issueId,
          previousOrder: a.newOrder, newOrder: a.previousOrder,
          timestamp: Date.now(), description: 'Reorder acts',
        }
      }

      // === Page move ===
      case 'page_move': {
        const a = action as PageMoveAction
        // Move page back to original scene
        const { error } = await supabase.from('pages')
          .update({ scene_id: a.fromSceneId, sort_order: a.fromSortOrder })
          .eq('id', a.pageId)
        if (error) throw error

        // Restore sort_orders in both scenes
        await Promise.all([
          ...a.fromScenePreviousOrders.map(({ id, sort_order }) =>
            supabase.from('pages').update({ sort_order }).eq('id', id)
          ),
          ...a.toScenePreviousOrders.map(({ id, sort_order }) =>
            supabase.from('pages').update({ sort_order }).eq('id', id)
          ),
        ])
        return {
          type: 'page_move' as const, pageId: a.pageId,
          fromSceneId: a.toSceneId, toSceneId: a.fromSceneId,
          fromSortOrder: a.toSortOrder, toSortOrder: a.fromSortOrder,
          fromScenePreviousOrders: a.toScenePreviousOrders,
          toScenePreviousOrders: a.fromScenePreviousOrders,
          timestamp: Date.now(), description: 'Move page',
        }
      }

      // === Scene move ===
      case 'scene_move': {
        const a = action as SceneMoveAction
        const { error } = await supabase.from('scenes')
          .update({ act_id: a.fromActId, sort_order: a.fromSortOrder })
          .eq('id', a.sceneId)
        if (error) throw error

        await Promise.all([
          ...a.fromActPreviousOrders.map(({ id, sort_order }) =>
            supabase.from('scenes').update({ sort_order }).eq('id', id)
          ),
          ...a.toActPreviousOrders.map(({ id, sort_order }) =>
            supabase.from('scenes').update({ sort_order }).eq('id', id)
          ),
        ])
        return {
          type: 'scene_move' as const, sceneId: a.sceneId,
          fromActId: a.toActId, toActId: a.fromActId,
          fromSortOrder: a.toSortOrder, toSortOrder: a.fromSortOrder,
          fromActPreviousOrders: a.toActPreviousOrders,
          toActPreviousOrders: a.fromActPreviousOrders,
          timestamp: Date.now(), description: 'Move scene',
        }
      }

      // === Duplicate operations (undo = delete the copy, non-redoable) ===
      case 'page_duplicate': {
        const a = action as PageDuplicateAction
        const { error } = await supabase.from('pages').delete().eq('id', a.newPageId)
        if (error) throw error
        return null // Non-redoable
      }
      case 'scene_duplicate': {
        const a = action as SceneDuplicateAction
        const { error } = await supabase.from('scenes').delete().eq('id', a.newSceneId)
        if (error) throw error
        return null // Non-redoable
      }

      // === Page summary update ===
      case 'page_summary_update': {
        const a = action as PageSummaryUpdateAction
        const { error } = await supabase.from('pages')
          .update({ page_summary: a.oldValue }).eq('id', a.pageId)
        if (error) throw error
        return { ...a, oldValue: a.newValue, newValue: a.oldValue }
      }

      // === Batch delete (undo = restore all) ===
      case 'batch_page_delete': {
        const a = action as BatchPageDeleteAction
        for (const item of a.items) {
          await restorePageDeep(supabase, { id: item.pageId, ...item.data }, item.sceneId)
        }
        return {
          type: 'batch_page_add' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Add ${a.items.length} pages`,
        }
      }
      case 'batch_scene_delete': {
        const a = action as BatchSceneDeleteAction
        for (const item of a.items) {
          await restoreSceneDeep(supabase, { id: item.sceneId, ...item.data }, item.actId)
        }
        return {
          type: 'batch_scene_add' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Add ${a.items.length} scenes`,
        }
      }
      case 'batch_act_delete': {
        const a = action as BatchActDeleteAction
        for (const item of a.items) {
          await restoreActDeep(supabase, { id: item.actId, ...item.data }, item.issueId)
        }
        return {
          type: 'batch_act_add' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Add ${a.items.length} acts`,
        }
      }

      // === Batch add (undo = delete all, i.e. reverse of batch delete undo) ===
      case 'batch_page_add': {
        const a = action as BatchPageAddAction
        for (const item of a.items) {
          await supabase.from('pages').delete().eq('id', item.pageId)
        }
        return {
          type: 'batch_page_delete' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Delete ${a.items.length} pages`,
        }
      }
      case 'batch_scene_add': {
        const a = action as BatchSceneAddAction
        for (const item of a.items) {
          await supabase.from('scenes').delete().eq('id', item.sceneId)
        }
        return {
          type: 'batch_scene_delete' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Delete ${a.items.length} scenes`,
        }
      }
      case 'batch_act_add': {
        const a = action as BatchActAddAction
        for (const item of a.items) {
          await supabase.from('acts').delete().eq('id', item.actId)
        }
        return {
          type: 'batch_act_delete' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Delete ${a.items.length} acts`,
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
    pendingGenericEdits.current.clear()
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
        startGenericTextEdit,
        endGenericTextEdit,
      }}
    >
      {children}
    </UndoContext.Provider>
  )
}
