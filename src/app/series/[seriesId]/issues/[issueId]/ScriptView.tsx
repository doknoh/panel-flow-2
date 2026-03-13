'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useUndo } from '@/contexts/UndoContext'
import ConfirmDialog, { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import CharacterAutocomplete from '@/components/CharacterAutocomplete'
import TypeSelector from '@/components/TypeSelector'
import FindReplaceModal from './FindReplaceModal'
import { stripMarkdown } from '@/lib/markdown'
import ScriptEditor from '@/components/editor/ScriptEditor'
import ScriptEditorToolbar from '@/components/editor/ScriptEditorToolbar'
import { Editor } from '@tiptap/react'

// ============================================================================
// Types
// ============================================================================

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

interface Panel {
  id: string
  panel_number: number
  sort_order: number
  visual_description: string | null
  camera: string | null
  notes_to_artist: string | null
  internal_notes: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

interface Page {
  id: string
  page_number: number
  title: string | null
  sort_order: number
  panels: Panel[]
}

interface Scene {
  id: string
  title: string | null
  sort_order: number
  pages: Page[]
}

interface Act {
  id: string
  name: string | null
  sort_order: number
  scenes: Scene[]
}

interface Character {
  id: string
  name: string
}

interface Issue {
  id: string
  number: number
  title: string | null
  acts: Act[]
  series: {
    id: string
    title: string
    characters?: Character[]
  }
}

// Block types for the script view
type BlockType = 'page-header' | 'panel-header' | 'visual' | 'dialogue' | 'caption' | 'sfx'

interface ScriptBlock {
  id: string
  type: BlockType
  content: string
  // Metadata for database operations
  pageId?: string
  panelId?: string
  pageNumber?: number
  panelNumber?: number
  orientation?: 'left' | 'right'
  // For dialogue
  characterId?: string | null
  characterName?: string
  dialogueType?: string | null
  // For captions
  captionType?: string | null
  // For sorting
  sortOrder: number
  // Parent references for context
  actName?: string
  sceneName?: string
}

type Scope = 'page' | 'scene' | 'act' | 'issue'

interface ScriptViewProps {
  issue: Issue
  selectedPageId: string | null
  onExit: () => void
  onRefresh: () => void
  onNavigate: (pageId: string) => void
}

// ============================================================================
// Component
// ============================================================================

export default function ScriptView({
  issue,
  selectedPageId,
  onExit,
  onRefresh,
  onNavigate,
}: ScriptViewProps) {
  // State
  const [scope, setScope] = useState<Scope>('page')
  const [blocks, setBlocks] = useState<ScriptBlock[]>([])
  const [pendingChanges, setPendingChanges] = useState<Map<string, ScriptBlock>>(new Map())
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [currentPageId, setCurrentPageId] = useState<string | null>(selectedPageId)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)

  // Sync currentPageId when selectedPageId changes from outside
  useEffect(() => {
    if (selectedPageId && selectedPageId !== currentPageId) {
      setCurrentPageId(selectedPageId)
    }
  }, [selectedPageId])

  // Active editor tracking for adaptive toolbar
  const [activeEditor, setActiveEditor] = useState<{
    editor: Editor
    blockId: string
    variant: 'description' | 'dialogue' | 'caption' | 'sfx'
    contextLabel: string
  } | null>(null)

  // Tab navigation state
  const [quickAddPanelId, setQuickAddPanelId] = useState<string | null>(null)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const editorRegistry = useRef<Map<string, Editor>>(new Map())
  const initialFocusSet = useRef(false)
  const pendingFocusRef = useRef<{ type: string; panelId: string } | null>(null)

  const { showToast } = useToast()
  const { recordAction, startGenericTextEdit, endGenericTextEdit, undo, redo, canUndo, canRedo } = useUndo()
  const { confirm, dialogProps } = useConfirmDialog()
  const supabase = createClient()
  const characters = issue.series?.characters || []

  // ============================================================================
  // Build blocks from issue data
  // ============================================================================

  const allBlocks = useMemo(() => {
    const result: ScriptBlock[] = []
    let sortOrder = 0

    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          const orientation = page.page_number % 2 === 1 ? 'right' : 'left'

          // Page header block
          result.push({
            id: `page-header-${page.id}`,
            type: 'page-header',
            content: `PAGE ${page.page_number} (${orientation})`,
            pageId: page.id,
            pageNumber: page.page_number,
            orientation,
            actName: act.name || `Act ${act.sort_order}`,
            sceneName: scene.title || 'Untitled Scene',
            sortOrder: sortOrder++,
          })

          for (const panel of page.panels || []) {
            // Panel header + visual description
            result.push({
              id: `visual-${panel.id}`,
              type: 'visual',
              content: panel.visual_description || '',
              pageId: page.id,
              panelId: panel.id,
              pageNumber: page.page_number,
              panelNumber: panel.panel_number,
              actName: act.name || `Act ${act.sort_order}`,
              sceneName: scene.title || 'Untitled Scene',
              sortOrder: sortOrder++,
            })

            // Dialogue blocks
            for (const dialogue of panel.dialogue_blocks || []) {
              const character = characters.find(c => c.id === dialogue.character_id)
              result.push({
                id: `dialogue-${dialogue.id}`,
                type: 'dialogue',
                content: dialogue.text || '',
                pageId: page.id,
                panelId: panel.id,
                characterId: dialogue.character_id,
                characterName: character?.name || dialogue.character?.name || 'UNKNOWN',
                dialogueType: dialogue.dialogue_type,
                pageNumber: page.page_number,
                panelNumber: panel.panel_number,
                sortOrder: sortOrder++,
              })
            }

            // Captions
            for (const caption of panel.captions || []) {
              result.push({
                id: `caption-${caption.id}`,
                type: 'caption',
                content: caption.text || '',
                pageId: page.id,
                panelId: panel.id,
                captionType: caption.caption_type,
                pageNumber: page.page_number,
                panelNumber: panel.panel_number,
                sortOrder: sortOrder++,
              })
            }

            // Sound effects
            for (const sfx of panel.sound_effects || []) {
              result.push({
                id: `sfx-${sfx.id}`,
                type: 'sfx',
                content: sfx.text || '',
                pageId: page.id,
                panelId: panel.id,
                pageNumber: page.page_number,
                panelNumber: panel.panel_number,
                sortOrder: sortOrder++,
              })
            }
          }
        }
      }
    }

    return result
  }, [issue, characters])

  // Get blocks filtered by scope
  const getBlocksForScope = useCallback(() => {
    if (scope === 'issue') {
      return allBlocks
    }

    // Find current page context
    let currentPage: Page | null = null
    let currentScene: Scene | null = null
    let currentAct: Act | null = null

    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          if (page.id === currentPageId) {
            currentPage = page
            currentScene = scene
            currentAct = act
            break
          }
        }
        if (currentPage) break
      }
      if (currentPage) break
    }

    if (!currentPage) {
      // Default to first page
      currentAct = issue.acts?.[0]
      currentScene = currentAct?.scenes?.[0]
      currentPage = currentScene?.pages?.[0]
      if (currentPage) {
        setCurrentPageId(currentPage.id)
      }
    }

    if (!currentPage) return allBlocks

    switch (scope) {
      case 'page':
        return allBlocks.filter(b => b.pageId === currentPage!.id)
      case 'scene':
        const scenePageIds = new Set(currentScene?.pages.map(p => p.id) || [])
        return allBlocks.filter(b => b.pageId && scenePageIds.has(b.pageId))
      case 'act':
        const actPageIds = new Set<string>()
        for (const scene of currentAct?.scenes || []) {
          for (const page of scene.pages || []) {
            actPageIds.add(page.id)
          }
        }
        return allBlocks.filter(b => b.pageId && actPageIds.has(b.pageId))
      default:
        return allBlocks
    }
  }, [allBlocks, scope, currentPageId, issue])

  // Initialize blocks
  useEffect(() => {
    setBlocks(getBlocksForScope())
  }, [getBlocksForScope])

  // ============================================================================
  // Tab navigation
  // ============================================================================

  // Build ordered list of editable block IDs with quick-add menu positions interleaved
  const tabOrder = useMemo(() => {
    const editableTypes = ['visual', 'dialogue', 'caption', 'sfx']
    const editable = blocks.filter(b => editableTypes.includes(b.type)).map(b => b.id)

    // Insert quick-add menu positions after the last editable block in each panel
    const withMenus: string[] = []
    let lastPanelId: string | null = null
    for (let i = 0; i < editable.length; i++) {
      const block = blocks.find(b => b.id === editable[i])!
      // If this block is in a new panel, insert a quick-add for the previous panel
      if (lastPanelId && block.panelId !== lastPanelId) {
        withMenus.push(`quick-add-${lastPanelId}`)
      }
      withMenus.push(editable[i])
      lastPanelId = block.panelId || null
    }
    // Final panel's quick-add
    if (lastPanelId) {
      withMenus.push(`quick-add-${lastPanelId}`)
    }

    return withMenus
  }, [blocks])

  // Pre-compute last editable block ID per panel (for quick-add menu placement)
  const panelLastBlockId = useMemo(() => {
    const lastMap = new Map<string, string>() // panelId -> last editable block id
    const editableTypes = ['visual', 'dialogue', 'caption', 'sfx']
    for (const b of blocks) {
      if (b.panelId && editableTypes.includes(b.type)) {
        lastMap.set(b.panelId, b.id)
      }
    }
    return lastMap
  }, [blocks])

  // Editor registry callbacks for programmatic focus
  const registerEditor = useCallback((blockId: string, editor: Editor) => {
    editorRegistry.current.set(blockId, editor)
  }, [])

  const unregisterEditor = useCallback((blockId: string) => {
    editorRegistry.current.delete(blockId)
  }, [])

  // Focus a specific block by ID (editor or quick-add menu)
  const focusBlock = useCallback((blockId: string) => {
    if (blockId.startsWith('quick-add-')) {
      const panelId = blockId.replace('quick-add-', '')
      setQuickAddPanelId(panelId)
      // Blur current editor
      activeEditor?.editor.commands.blur()
      // Scroll the quick-add menu into view
      const menuEl = document.getElementById(blockId)
      menuEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      setQuickAddPanelId(null)
      const editor = editorRegistry.current.get(blockId)
      if (editor) {
        editor.commands.focus()
        // Scroll into view
        const editorEl = document.getElementById(`editor-${blockId}`)
        editorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [activeEditor])

  // Set initial focus on first editable field when blocks are ready
  useEffect(() => {
    if (initialFocusSet.current) return
    if (tabOrder.length > 0 && !tabOrder[0].startsWith('quick-add-')) {
      initialFocusSet.current = true
      const timer = setTimeout(() => {
        focusBlock(tabOrder[0])
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [tabOrder, focusBlock])

  // Auto-focus newly created blocks after quick-add
  useEffect(() => {
    if (!pendingFocusRef.current) return
    const { type, panelId } = pendingFocusRef.current
    pendingFocusRef.current = null

    let attempts = 0
    const maxAttempts = 10
    const interval = setInterval(() => {
      attempts++

      let targetBlockId: string | undefined
      if (type === 'panel') {
        // For new panels, find the last visual block
        const visuals = blocks.filter(b => b.type === 'visual')
        targetBlockId = visuals[visuals.length - 1]?.id
      } else {
        // Find the last block of the given type in the specified panel
        const matching = blocks.filter(b => b.type === type && b.panelId === panelId)
        targetBlockId = matching[matching.length - 1]?.id
      }

      if (targetBlockId) {
        const editor = editorRegistry.current.get(targetBlockId)
        if (editor) {
          clearInterval(interval)
          editor.commands.focus()
          document.getElementById(`editor-${targetBlockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return
        }
        // Fallback: try DOM
        const el = document.getElementById(`editor-${targetBlockId}`)
        if (el) {
          clearInterval(interval)
          const prosemirror = el.querySelector('.ProseMirror') as HTMLElement | null
          prosemirror?.focus()
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [blocks])

  // ============================================================================
  // Save logic
  // ============================================================================

  const saveBlock = useCallback(async (block: ScriptBlock) => {
    setSaveStatus('saving')

    try {
      switch (block.type) {
        case 'visual':
          if (block.panelId) {
            await supabase
              .from('panels')
              .update({ visual_description: block.content })
              .eq('id', block.panelId)
          }
          break

        case 'dialogue':
          const dialogueId = block.id.replace('dialogue-', '')
          await supabase
            .from('dialogue_blocks')
            .update({ text: block.content })
            .eq('id', dialogueId)
          break

        case 'caption':
          const captionId = block.id.replace('caption-', '')
          await supabase
            .from('captions')
            .update({ text: block.content })
            .eq('id', captionId)
          break

        case 'sfx':
          const sfxId = block.id.replace('sfx-', '')
          await supabase
            .from('sound_effects')
            .update({ text: block.content })
            .eq('id', sfxId)
          break
      }

      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to save block:', error)
      showToast('Failed to save changes', 'error')
      setSaveStatus('unsaved')
    }
  }, [supabase, showToast])

  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    setSaveStatus('unsaved')

    saveTimeoutRef.current = setTimeout(async () => {
      const changes = Array.from(pendingChanges.values())
      if (changes.length === 0) return

      setSaveStatus('saving')

      try {
        await Promise.all(changes.map(block => saveBlock(block)))
        setPendingChanges(new Map())
        setSaveStatus('saved')
      } catch (error) {
        console.error('Auto-save failed:', error)
        setSaveStatus('unsaved')
      }
    }, 1500)
  }, [pendingChanges, saveBlock])

  const forceSaveAll = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    const changes = Array.from(pendingChanges.values())
    if (changes.length === 0) return

    setSaveStatus('saving')

    try {
      await Promise.all(changes.map(block => saveBlock(block)))
      setPendingChanges(new Map())
      setSaveStatus('saved')
    } catch (error) {
      console.error('Force save failed:', error)
      throw error
    }
  }, [pendingChanges, saveBlock])

  // ============================================================================
  // Block editing
  // ============================================================================

  // Track when user starts editing a field (for undo)
  const handleBlockFocus = useCallback((block: ScriptBlock) => {
    if (block.type === 'page-header') return

    // Determine the entity type for undo tracking
    const getEntityInfo = (): { entityType: 'panel' | 'dialogue' | 'caption' | 'sfx'; entityId: string } | null => {
      if (block.type === 'visual' && block.panelId) {
        return { entityType: 'panel', entityId: block.panelId }
      }
      if (block.type === 'dialogue') {
        const dialogueId = block.id.replace('dialogue-', '')
        return { entityType: 'dialogue', entityId: dialogueId }
      }
      if (block.type === 'caption') {
        const captionId = block.id.replace('caption-', '')
        return { entityType: 'caption', entityId: captionId }
      }
      if (block.type === 'sfx') {
        const sfxId = block.id.replace('sfx-', '')
        return { entityType: 'sfx', entityId: sfxId }
      }
      return null
    }

    const entityInfo = getEntityInfo()
    if (entityInfo) {
      const field = block.type === 'visual' ? 'visual_description' : 'text'
      startGenericTextEdit(entityInfo.entityType, entityInfo.entityId, field, block.content)
    }
  }, [startGenericTextEdit])

  // Track when user finishes editing a field (records undo if changed)
  const handleBlockBlur = useCallback((block: ScriptBlock) => {
    if (block.type === 'page-header') return

    // Determine the entity type for undo tracking
    const getEntityInfo = (): { entityType: 'panel' | 'dialogue' | 'caption' | 'sfx'; entityId: string } | null => {
      if (block.type === 'visual' && block.panelId) {
        return { entityType: 'panel', entityId: block.panelId }
      }
      if (block.type === 'dialogue') {
        const dialogueId = block.id.replace('dialogue-', '')
        return { entityType: 'dialogue', entityId: dialogueId }
      }
      if (block.type === 'caption') {
        const captionId = block.id.replace('caption-', '')
        return { entityType: 'caption', entityId: captionId }
      }
      if (block.type === 'sfx') {
        const sfxId = block.id.replace('sfx-', '')
        return { entityType: 'sfx', entityId: sfxId }
      }
      return null
    }

    const entityInfo = getEntityInfo()
    if (entityInfo) {
      const field = block.type === 'visual' ? 'visual_description' : 'text'
      endGenericTextEdit(entityInfo.entityType, entityInfo.entityId, field, block.content)
    }
  }, [endGenericTextEdit])

  // Called when any ScriptEditor instance receives focus
  const handleEditorFocus = useCallback((editor: Editor, blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    let variant: 'description' | 'dialogue' | 'caption' | 'sfx' = 'description'
    if (block?.type === 'dialogue') variant = 'dialogue'
    else if (block?.type === 'caption') variant = 'caption'
    else if (block?.type === 'sfx') variant = 'sfx'

    // Compute context label
    let contextLabel = ''
    if (block) {
      const panelNum = block.panelNumber || '?'
      if (variant === 'description') {
        contextLabel = `EDITING: PANEL ${panelNum} DESCRIPTION`
      } else if (variant === 'dialogue') {
        contextLabel = `EDITING: PANEL ${panelNum} → ${block.characterName || 'SELECT CHARACTER'}`
      } else if (variant === 'caption') {
        contextLabel = `EDITING: PANEL ${panelNum} CAPTION`
      }
      // SFX: no context label (toolbar hidden for SFX)
    }

    setActiveEditor({ editor, blockId, variant, contextLabel })
    // Dismiss any active quick-add menu when an editor is clicked/focused
    setQuickAddPanelId(null)
  }, [blocks])

  // When focus leaves the body+toolbar area entirely, clear active editor
  const handleBodyFocusOut = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    const body = bodyRef.current
    const toolbar = toolbarRef.current
    // If focus moved to another element within body or toolbar, keep active editor
    if (relatedTarget && (body?.contains(relatedTarget) || toolbar?.contains(relatedTarget))) {
      return
    }
    // Focus left the script area entirely — clear after brief delay
    // (delay allows toolbar button preventDefault to work)
    setTimeout(() => setActiveEditor(null), 150)
  }, [])

  const updateBlock = useCallback((blockId: string, newContent: string) => {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, content: newContent } : b
    ))

    const block = blocks.find(b => b.id === blockId)
    if (block && block.type !== 'page-header' && block.type !== 'panel-header') {
      const updatedBlock = { ...block, content: newContent }
      setPendingChanges(prev => new Map(prev).set(blockId, updatedBlock))
      scheduleAutoSave()
    }
  }, [blocks, scheduleAutoSave])

  // Change the character for a dialogue block
  const changeDialogueCharacter = useCallback(async (
    blockId: string,
    newCharacterId: string | null
  ) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'dialogue') return

    const dialogueId = block.id.replace('dialogue-', '')
    const oldCharacterId = block.characterId
    const newCharacterName = newCharacterId
      ? characters.find(c => c.id === newCharacterId)?.name || 'UNKNOWN'
      : 'UNKNOWN'

    // Optimistic update
    setBlocks(prev => prev.map(b =>
      b.id === blockId
        ? { ...b, characterId: newCharacterId, characterName: newCharacterName }
        : b
    ))

    // Save to DB
    const { error } = await supabase
      .from('dialogue_blocks')
      .update({ character_id: newCharacterId })
      .eq('id', dialogueId)

    if (error) {
      // Rollback
      const oldCharacterName = oldCharacterId
        ? characters.find(c => c.id === oldCharacterId)?.name || 'UNKNOWN'
        : 'UNKNOWN'
      setBlocks(prev => prev.map(b =>
        b.id === blockId
          ? { ...b, characterId: oldCharacterId, characterName: oldCharacterName }
          : b
      ))
      showToast('Failed to change character', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'dialogue_update',
      dialogueId,
      field: 'character_id',
      oldValue: oldCharacterId,
      newValue: newCharacterId,
      description: 'Change dialogue character',
    })
  }, [blocks, characters, supabase, showToast, recordAction])

  // Change the dialogue type for a dialogue block
  const changeDialogueType = useCallback(async (
    blockId: string,
    newType: string
  ) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'dialogue') return

    const dialogueId = block.id.replace('dialogue-', '')
    const oldType = block.dialogueType

    // Optimistic update
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, dialogueType: newType } : b
    ))

    // Save to DB
    const { error } = await supabase
      .from('dialogue_blocks')
      .update({ dialogue_type: newType })
      .eq('id', dialogueId)

    if (error) {
      // Rollback
      setBlocks(prev => prev.map(b =>
        b.id === blockId ? { ...b, dialogueType: oldType } : b
      ))
      showToast('Failed to change dialogue type', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'dialogue_update',
      dialogueId,
      field: 'dialogue_type',
      oldValue: oldType,
      newValue: newType,
      description: 'Change dialogue type',
    })
  }, [blocks, supabase, showToast, recordAction])

  // Change the caption type for a caption block
  const changeCaptionType = useCallback(async (
    blockId: string,
    newType: string
  ) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'caption') return

    const captionId = block.id.replace('caption-', '')
    const oldType = block.captionType

    // Optimistic update
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, captionType: newType } : b
    ))

    // Save to DB
    const { error } = await supabase
      .from('captions')
      .update({ caption_type: newType })
      .eq('id', captionId)

    if (error) {
      // Rollback
      setBlocks(prev => prev.map(b =>
        b.id === blockId ? { ...b, captionType: oldType } : b
      ))
      showToast('Failed to change caption type', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'caption_update',
      captionId,
      field: 'caption_type',
      oldValue: oldType,
      newValue: newType,
      description: 'Change caption type',
    })
  }, [blocks, supabase, showToast, recordAction])

  // ============================================================================
  // Structural Operations - ADD
  // ============================================================================

  // Generate a safe unique temp ID
  const generateTempId = useCallback((prefix: string) => {
    return `temp-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }, [])

  // Add a new dialogue block to a panel
  const addDialogue = useCallback(async (panelId: string, pageId: string) => {
    const tempId = generateTempId('dialogue')

    // Get the max sort_order for this panel's dialogue blocks
    const { data: maxOrder } = await supabase
      .from('dialogue_blocks')
      .select('sort_order')
      .eq('panel_id', panelId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const sortOrder = (maxOrder?.sort_order || 0) + 1

    // Find panel info for the optimistic block
    const panelBlock = blocks.find(b => b.panelId === panelId && b.type === 'visual')

    // Optimistic update - add to blocks
    const optimisticBlock: ScriptBlock = {
      id: `dialogue-${tempId}`,
      type: 'dialogue',
      content: '',
      pageId,
      panelId,
      pageNumber: panelBlock?.pageNumber,
      panelNumber: panelBlock?.panelNumber,
      characterId: null,
      characterName: 'SELECT CHARACTER',
      dialogueType: 'dialogue',
      sortOrder,
    }

    // Insert after the last block of this panel
    setBlocks(prev => {
      const panelBlocks = prev.filter(b => b.panelId === panelId)
      const lastPanelBlockIndex = prev.findIndex(b => b.id === panelBlocks[panelBlocks.length - 1]?.id)
      const newBlocks = [...prev]
      newBlocks.splice(lastPanelBlockIndex + 1, 0, optimisticBlock)
      return newBlocks
    })

    // Insert into DB
    const { data, error } = await supabase
      .from('dialogue_blocks')
      .insert({
        panel_id: panelId,
        text: '',
        character_id: null,
        dialogue_type: 'dialogue',
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      // Rollback
      setBlocks(prev => prev.filter(b => b.id !== `dialogue-${tempId}`))
      showToast('Failed to add dialogue', 'error')
      return
    }

    // Replace temp ID with real ID
    setBlocks(prev => prev.map(b =>
      b.id === `dialogue-${tempId}` ? { ...b, id: `dialogue-${data.id}` } : b
    ))

    // Record undo action (with real ID)
    recordAction({
      type: 'dialogue_add',
      dialogueId: data.id,
      panelId,
      data: {
        text: '',
        character_id: null,
        dialogue_type: 'dialogue',
        sort_order: sortOrder,
      },
      description: 'Add dialogue',
    })

    showToast('Dialogue added', 'success')
  }, [blocks, supabase, generateTempId, showToast, recordAction])

  // Add a new caption to a panel
  const addCaption = useCallback(async (panelId: string, pageId: string) => {
    const tempId = generateTempId('caption')

    // Get the max sort_order for this panel's captions
    const { data: maxOrder } = await supabase
      .from('captions')
      .select('sort_order')
      .eq('panel_id', panelId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const sortOrder = (maxOrder?.sort_order || 0) + 1

    // Find panel info for the optimistic block
    const panelBlock = blocks.find(b => b.panelId === panelId && b.type === 'visual')

    // Optimistic update
    const optimisticBlock: ScriptBlock = {
      id: `caption-${tempId}`,
      type: 'caption',
      content: '',
      pageId,
      panelId,
      pageNumber: panelBlock?.pageNumber,
      panelNumber: panelBlock?.panelNumber,
      captionType: 'narrative',
      sortOrder,
    }

    // Insert after the last block of this panel
    setBlocks(prev => {
      const panelBlocks = prev.filter(b => b.panelId === panelId)
      const lastPanelBlockIndex = prev.findIndex(b => b.id === panelBlocks[panelBlocks.length - 1]?.id)
      const newBlocks = [...prev]
      newBlocks.splice(lastPanelBlockIndex + 1, 0, optimisticBlock)
      return newBlocks
    })

    // Insert into DB
    const { data, error } = await supabase
      .from('captions')
      .insert({
        panel_id: panelId,
        text: '',
        caption_type: 'narrative',
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      // Rollback
      setBlocks(prev => prev.filter(b => b.id !== `caption-${tempId}`))
      showToast('Failed to add caption', 'error')
      return
    }

    // Replace temp ID with real ID
    setBlocks(prev => prev.map(b =>
      b.id === `caption-${tempId}` ? { ...b, id: `caption-${data.id}` } : b
    ))

    // Record undo action
    recordAction({
      type: 'caption_add',
      captionId: data.id,
      panelId,
      data: {
        text: '',
        caption_type: 'narrative',
        sort_order: sortOrder,
      },
      description: 'Add caption',
    })

    showToast('Caption added', 'success')
  }, [blocks, supabase, generateTempId, showToast, recordAction])

  // Add a new sound effect to a panel
  const addSoundEffect = useCallback(async (panelId: string, pageId: string) => {
    const tempId = generateTempId('sfx')

    // Get the max sort_order for this panel's sfx
    const { data: maxOrder } = await supabase
      .from('sound_effects')
      .select('sort_order')
      .eq('panel_id', panelId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const sortOrder = (maxOrder?.sort_order || 0) + 1

    // Find panel info for the optimistic block
    const panelBlock = blocks.find(b => b.panelId === panelId && b.type === 'visual')

    // Optimistic update
    const optimisticBlock: ScriptBlock = {
      id: `sfx-${tempId}`,
      type: 'sfx',
      content: '',
      pageId,
      panelId,
      pageNumber: panelBlock?.pageNumber,
      panelNumber: panelBlock?.panelNumber,
      sortOrder,
    }

    // Insert after the last block of this panel
    setBlocks(prev => {
      const panelBlocks = prev.filter(b => b.panelId === panelId)
      const lastPanelBlockIndex = prev.findIndex(b => b.id === panelBlocks[panelBlocks.length - 1]?.id)
      const newBlocks = [...prev]
      newBlocks.splice(lastPanelBlockIndex + 1, 0, optimisticBlock)
      return newBlocks
    })

    // Insert into DB
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
      // Rollback
      setBlocks(prev => prev.filter(b => b.id !== `sfx-${tempId}`))
      showToast('Failed to add sound effect', 'error')
      return
    }

    // Replace temp ID with real ID
    setBlocks(prev => prev.map(b =>
      b.id === `sfx-${tempId}` ? { ...b, id: `sfx-${data.id}` } : b
    ))

    // Record undo action
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

    showToast('Sound effect added', 'success')
  }, [blocks, supabase, generateTempId, showToast, recordAction])

  // Add a new panel to a page
  const addPanel = useCallback(async (pageId: string) => {
    const tempId = generateTempId('panel')

    // Get the max panel_number for this page
    const { data: maxPanel } = await supabase
      .from('panels')
      .select('panel_number, sort_order')
      .eq('page_id', pageId)
      .order('panel_number', { ascending: false })
      .limit(1)
      .single()

    const panelNumber = (maxPanel?.panel_number || 0) + 1
    const sortOrder = (maxPanel?.sort_order || 0) + 1

    // Find page info
    const pageBlock = blocks.find(b => b.pageId === pageId && b.type === 'page-header')

    // Optimistic update
    const optimisticBlock: ScriptBlock = {
      id: `visual-${tempId}`,
      type: 'visual',
      content: '',
      pageId,
      panelId: tempId,
      pageNumber: pageBlock?.pageNumber,
      panelNumber,
      actName: pageBlock?.actName,
      sceneName: pageBlock?.sceneName,
      sortOrder,
    }

    // Insert at the end of this page's blocks
    setBlocks(prev => {
      const pageBlocks = prev.filter(b => b.pageId === pageId)
      const lastPageBlockIndex = prev.findIndex(b => b.id === pageBlocks[pageBlocks.length - 1]?.id)
      const newBlocks = [...prev]
      newBlocks.splice(lastPageBlockIndex + 1, 0, optimisticBlock)
      return newBlocks
    })

    // Insert into DB
    const { data, error } = await supabase
      .from('panels')
      .insert({
        page_id: pageId,
        panel_number: panelNumber,
        sort_order: sortOrder,
        visual_description: '',
      })
      .select()
      .single()

    if (error) {
      // Rollback
      setBlocks(prev => prev.filter(b => b.id !== `visual-${tempId}`))
      showToast('Failed to add panel', 'error')
      return
    }

    // Replace temp ID with real ID
    setBlocks(prev => prev.map(b =>
      b.id === `visual-${tempId}`
        ? { ...b, id: `visual-${data.id}`, panelId: data.id }
        : b
    ))

    // Record undo action
    recordAction({
      type: 'panel_add',
      panelId: data.id,
      pageId,
      data: {
        panel_number: panelNumber,
        sort_order: sortOrder,
        visual_description: '',
      },
      description: 'Add panel',
    })

    showToast('Panel added', 'success')
  }, [blocks, supabase, generateTempId, showToast, recordAction])

  // ============================================================================
  // Structural Operations - DELETE
  // ============================================================================

  // Delete a dialogue block
  const deleteDialogue = useCallback(async (blockId: string, skipConfirm = false) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'dialogue') return

    const dialogueId = block.id.replace('dialogue-', '')

    // Confirm if non-empty (skip when triggered by keyboard shortcut)
    if (!skipConfirm && block.content.trim()) {
      const confirmed = await confirm({
        title: 'Delete this dialogue?',
        description: 'This can be undone with \u2318Z.',
      })
      if (!confirmed) return
    }

    // Store full data for undo
    const dialogueData = {
      id: dialogueId,
      panel_id: block.panelId,
      text: block.content,
      character_id: block.characterId,
      dialogue_type: block.dialogueType,
      sort_order: block.sortOrder,
    }

    // Optimistic removal
    setBlocks(prev => prev.filter(b => b.id !== blockId))

    // Delete from DB
    const { error } = await supabase
      .from('dialogue_blocks')
      .delete()
      .eq('id', dialogueId)

    if (error) {
      // Rollback - re-add the block
      setBlocks(prev => {
        const newBlocks = [...prev]
        // Find the right position to insert
        const panelBlocks = prev.filter(b => b.panelId === block.panelId)
        const insertIndex = panelBlocks.length > 0
          ? prev.findIndex(b => b.id === panelBlocks[panelBlocks.length - 1]?.id) + 1
          : prev.length
        newBlocks.splice(insertIndex, 0, block)
        return newBlocks
      })
      showToast('Failed to delete dialogue', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'dialogue_delete',
      dialogueId,
      panelId: block.panelId,
      data: dialogueData,
      description: 'Delete dialogue',
    })

    showToast('Deleted dialogue — ⌘Z to undo', 'success')
  }, [blocks, supabase, showToast, recordAction, confirm])

  // Delete a caption
  const deleteCaption = useCallback(async (blockId: string, skipConfirm = false) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'caption') return

    const captionId = block.id.replace('caption-', '')

    // Confirm if non-empty (skip when triggered by keyboard shortcut)
    if (!skipConfirm && block.content.trim()) {
      const confirmed = await confirm({
        title: 'Delete this caption?',
        description: 'This can be undone with \u2318Z.',
      })
      if (!confirmed) return
    }

    // Store full data for undo
    const captionData = {
      id: captionId,
      panel_id: block.panelId,
      text: block.content,
      caption_type: block.captionType,
      sort_order: block.sortOrder,
    }

    // Optimistic removal
    setBlocks(prev => prev.filter(b => b.id !== blockId))

    // Delete from DB
    const { error } = await supabase
      .from('captions')
      .delete()
      .eq('id', captionId)

    if (error) {
      // Rollback
      setBlocks(prev => {
        const newBlocks = [...prev]
        const panelBlocks = prev.filter(b => b.panelId === block.panelId)
        const insertIndex = panelBlocks.length > 0
          ? prev.findIndex(b => b.id === panelBlocks[panelBlocks.length - 1]?.id) + 1
          : prev.length
        newBlocks.splice(insertIndex, 0, block)
        return newBlocks
      })
      showToast('Failed to delete caption', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'caption_delete',
      captionId,
      panelId: block.panelId,
      data: captionData,
      description: 'Delete caption',
    })

    showToast('Deleted caption — ⌘Z to undo', 'success')
  }, [blocks, supabase, showToast, recordAction, confirm])

  // Delete a sound effect
  const deleteSoundEffect = useCallback(async (blockId: string, skipConfirm = false) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'sfx') return

    const sfxId = block.id.replace('sfx-', '')

    // Confirm if non-empty (skip when triggered by keyboard shortcut)
    if (!skipConfirm && block.content.trim()) {
      const confirmed = await confirm({
        title: 'Delete this sound effect?',
        description: 'This can be undone with \u2318Z.',
      })
      if (!confirmed) return
    }

    // Store full data for undo
    const sfxData = {
      id: sfxId,
      panel_id: block.panelId,
      text: block.content,
      sort_order: block.sortOrder,
    }

    // Optimistic removal
    setBlocks(prev => prev.filter(b => b.id !== blockId))

    // Delete from DB
    const { error } = await supabase
      .from('sound_effects')
      .delete()
      .eq('id', sfxId)

    if (error) {
      // Rollback
      setBlocks(prev => {
        const newBlocks = [...prev]
        const panelBlocks = prev.filter(b => b.panelId === block.panelId)
        const insertIndex = panelBlocks.length > 0
          ? prev.findIndex(b => b.id === panelBlocks[panelBlocks.length - 1]?.id) + 1
          : prev.length
        newBlocks.splice(insertIndex, 0, block)
        return newBlocks
      })
      showToast('Failed to delete sound effect', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'sfx_delete',
      sfxId,
      panelId: block.panelId,
      data: sfxData,
      description: 'Delete sound effect',
    })

    showToast('Deleted sound effect — ⌘Z to undo', 'success')
  }, [blocks, supabase, showToast, recordAction, confirm])

  // ============================================================================
  // Quick-add menu handler
  // ============================================================================

  const handleQuickAdd = useCallback(async (type: 'dialogue' | 'caption' | 'sfx' | 'panel', panelId: string, pageId: string) => {
    setQuickAddPanelId(null) // Dismiss menu immediately

    switch (type) {
      case 'dialogue':
        await addDialogue(panelId, pageId)
        break
      case 'caption':
        await addCaption(panelId, pageId)
        break
      case 'sfx':
        await addSoundEffect(panelId, pageId)
        break
      case 'panel':
        await addPanel(pageId)
        break
    }

    pendingFocusRef.current = { type, panelId }
  }, [addDialogue, addCaption, addSoundEffect, addPanel])

  // ============================================================================
  // Export Functions
  // ============================================================================

  // Generate script-formatted text for current scope
  const generateScriptText = useCallback(() => {
    const lines: string[] = []
    const characterMap = new Map(characters.map(c => [c.id, c.name]))

    for (const block of blocks) {
      switch (block.type) {
        case 'page-header':
          lines.push('')
          lines.push(block.content)
          lines.push('')
          break

        case 'visual':
          // Strip markdown for clean clipboard export
          lines.push(`PANEL ${block.panelNumber}: ${stripMarkdown(block.content || '') || '[Visual description]'}`)
          lines.push('')
          break

        case 'dialogue': {
          const charName = block.characterId
            ? characterMap.get(block.characterId)?.toUpperCase() || 'UNKNOWN'
            : 'UNKNOWN'
          const typeIndicator = block.dialogueType && block.dialogueType !== 'dialogue'
            ? ` (${block.dialogueType.toUpperCase()})`
            : ''
          lines.push(`                    ${charName}${typeIndicator}`)
          // Strip markdown and indent dialogue text
          const dialogueText = stripMarkdown(block.content || '')
          const words = dialogueText.split(' ')
          let currentLine = '          '
          for (const word of words) {
            if (currentLine.length + word.length + 1 > 60) {
              lines.push(currentLine)
              currentLine = '          ' + word
            } else {
              currentLine += (currentLine === '          ' ? '' : ' ') + word
            }
          }
          if (currentLine !== '          ') {
            lines.push(currentLine)
          }
          lines.push('')
          break
        }

        case 'caption': {
          const captionType = block.captionType && block.captionType !== 'narrative'
            ? ` (${block.captionType.toUpperCase()})`
            : ''
          // Strip markdown for clean clipboard export
          lines.push(`     CAPTION${captionType}: ${stripMarkdown(block.content || '')}`)
          lines.push('')
          break
        }

        case 'sfx':
          // Strip markdown for clean clipboard export
          lines.push(`     SFX: ${stripMarkdown(block.content || '').toUpperCase()}`)
          lines.push('')
          break
      }
    }

    return lines.join('\n')
  }, [blocks, characters])

  // Copy script to clipboard
  const copyToClipboard = useCallback(async () => {
    const scriptText = generateScriptText()
    try {
      await navigator.clipboard.writeText(scriptText)
      showToast('Script copied to clipboard', 'success')
    } catch {
      showToast('Failed to copy to clipboard', 'error')
    }
  }, [generateScriptText, showToast])

  // Export script to PDF
  const exportToPdf = useCallback(async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 72 // 1 inch margins
    const contentWidth = pageWidth - (margin * 2)
    let y = margin

    const characterMap = new Map(characters.map(c => [c.id, c.name]))

    // Use Courier for screenplay feel
    doc.setFont('courier', 'normal')

    const addText = (text: string, fontSize: number, isBold = false, xOffset = 0, maxWidth = contentWidth) => {
      doc.setFontSize(fontSize)
      doc.setFont('courier', isBold ? 'bold' : 'normal')

      const lines = doc.splitTextToSize(text, maxWidth - xOffset)

      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin + xOffset, y)
        y += fontSize * 1.2
      }
    }

    const addSpace = (pts: number) => {
      y += pts
      if (y > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
    }

    // Title
    doc.setFontSize(14)
    doc.setFont('courier', 'bold')
    doc.text(`${issue.series?.title || 'Untitled'} - Issue #${issue.number}`, pageWidth / 2, margin, { align: 'center' })
    y = margin + 36

    // Script content
    for (const block of blocks) {
      switch (block.type) {
        case 'page-header':
          addSpace(18)
          addText(block.content, 12, true)
          addSpace(12)
          break

        case 'visual':
          addText(`PANEL ${block.panelNumber}:`, 10, true)
          if (block.content) {
            addText(block.content, 10, false, 0)
          }
          addSpace(12)
          break

        case 'dialogue': {
          const charName = block.characterId
            ? characterMap.get(block.characterId)?.toUpperCase() || 'UNKNOWN'
            : 'UNKNOWN'
          const typeIndicator = block.dialogueType && block.dialogueType !== 'dialogue'
            ? ` (${block.dialogueType.toUpperCase()})`
            : ''

          // Center character name
          doc.setFontSize(10)
          doc.setFont('courier', 'bold')
          const charText = `${charName}${typeIndicator}`
          if (y > pageHeight - margin) {
            doc.addPage()
            y = margin
          }
          doc.text(charText, pageWidth / 2, y, { align: 'center' })
          y += 14

          // Dialogue text (indented)
          if (block.content) {
            addText(block.content, 10, false, 72, contentWidth - 144)
          }
          addSpace(12)
          break
        }

        case 'caption': {
          const captionType = block.captionType && block.captionType !== 'narrative'
            ? ` (${block.captionType.toUpperCase()})`
            : ''
          addText(`CAPTION${captionType}:`, 10, true, 36)
          if (block.content) {
            addText(block.content, 10, false, 36)
          }
          addSpace(8)
          break
        }

        case 'sfx':
          if (block.content) {
            addText(`SFX: ${block.content.toUpperCase()}`, 10, true, 36)
            addSpace(8)
          }
          break
      }
    }

    // Generate filename
    const seriesTitle = (issue.series?.title || 'Script').replace(/[^a-z0-9]/gi, '_')
    const scopeLabel = scope === 'issue' ? '' : `_${scope}`
    const filename = `${seriesTitle}_Issue${issue.number}${scopeLabel}.pdf`

    doc.save(filename)
    showToast('PDF exported', 'success')
  }, [blocks, characters, issue, scope, showToast])

  // ============================================================================
  // Keyboard shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Quick-add menu key commands (when menu is active)
      if (quickAddPanelId) {
        const pageId = blocks.find(b => b.panelId === quickAddPanelId)?.pageId
        if (!pageId) return

        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault()
          handleQuickAdd('dialogue', quickAddPanelId, pageId)
          return
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault()
          handleQuickAdd('caption', quickAddPanelId, pageId)
          return
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault()
          handleQuickAdd('sfx', quickAddPanelId, pageId)
          return
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault()
          handleQuickAdd('panel', quickAddPanelId, pageId)
          return
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setQuickAddPanelId(null)
          return
        }
        // Tab passes through to the Tab handler below
        // All other keys are ignored (per spec)
        if (e.key !== 'Tab') return
      }

      // Tab navigation — must come before other handlers for first priority
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        // Find current position in tab order
        const currentBlockId = activeEditor?.blockId || ''
        let currentIndex = tabOrder.indexOf(currentBlockId)
        // If in quick-add menu, find that position
        if (quickAddPanelId) {
          currentIndex = tabOrder.indexOf(`quick-add-${quickAddPanelId}`)
        }
        if (currentIndex === -1) currentIndex = -1 // Start from beginning

        if (e.shiftKey) {
          if (currentIndex > 0) {
            focusBlock(tabOrder[currentIndex - 1])
          }
        } else {
          if (currentIndex < tabOrder.length - 1) {
            focusBlock(tabOrder[currentIndex + 1])
          }
        }
        return
      }

      // Cmd+Backspace to delete focused block
      if (isMod && e.key === 'Backspace') {
        e.preventDefault()
        if (!activeEditor) return

        const block = blocks.find(b => b.id === activeEditor.blockId)
        if (!block) return

        // Only allow deletion of sub-blocks, not descriptions
        if (block.type === 'dialogue' || block.type === 'caption' || block.type === 'sfx') {
          // Move focus to previous field first
          const currentTabIdx = tabOrder.indexOf(activeEditor.blockId)
          if (currentTabIdx > 0) {
            const prevId = tabOrder[currentTabIdx - 1]
            if (!prevId.startsWith('quick-add-')) {
              const prevEditor = editorRegistry.current.get(prevId)
              setTimeout(() => prevEditor?.commands.focus(), 50)
            }
          }

          if (block.type === 'dialogue') {
            deleteDialogue(block.id, true)
          } else if (block.type === 'caption') {
            deleteCaption(block.id, true)
          } else if (block.type === 'sfx') {
            deleteSoundEffect(block.id, true)
          }
        }
        // For 'visual' (description) — do nothing, per spec
        return
      }

      // Escape to close find/replace or exit
      if (e.key === 'Escape') {
        e.preventDefault()
        if (quickAddPanelId) {
          setQuickAddPanelId(null)
          return
        }
        if (findReplaceOpen) {
          setFindReplaceOpen(false)
          return
        }
        await forceSaveAll()
        onExit()
        return
      }

      // Cmd+S to save
      if (isMod && e.key === 's') {
        e.preventDefault()
        await forceSaveAll()
        showToast('Saved', 'success')
        return
      }

      // Cmd+F to open find/replace
      if (isMod && e.key === 'f') {
        e.preventDefault()
        setFindReplaceOpen(true)
        return
      }

      // Cmd+Z for undo
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo) {
          await undo()
          onRefresh()
        }
        return
      }

      // Cmd+Shift+Z for redo
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (canRedo) {
          await redo()
          onRefresh()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [forceSaveAll, onExit, showToast, canUndo, canRedo, undo, redo, onRefresh, findReplaceOpen, tabOrder, focusBlock, quickAddPanelId, activeEditor, blocks, handleQuickAdd, deleteDialogue, deleteCaption, deleteSoundEffect])

  // ============================================================================
  // Find & Replace navigation
  // ============================================================================

  const handleNavigateToPanel = useCallback((pageId: string, panelId: string) => {
    // Update scope to show the target page (needed when scope is "page")
    setCurrentPageId(pageId)
    onNavigate(pageId)

    // Find and scroll to the panel's visual block using editor DOM IDs
    const blockId = `visual-${panelId}`
    const editorEl = document.getElementById(`editor-${blockId}`)
    if (editorEl) {
      editorEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Focus via editor registry, fallback to ProseMirror element
      const editor = editorRegistry.current.get(blockId)
      if (editor) {
        editor.commands.focus()
      } else {
        const pm = editorEl.querySelector('.ProseMirror') as HTMLElement | null
        pm?.focus()
      }
    } else {
      // If not immediately available (e.g., page change triggers re-render), wait
      setTimeout(() => {
        const el = document.getElementById(`editor-${blockId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const editor = editorRegistry.current.get(blockId)
          if (editor) {
            editor.commands.focus()
          } else {
            const pm = el.querySelector('.ProseMirror') as HTMLElement | null
            pm?.focus()
          }
        }
      }, 100)
    }
  }, [onNavigate])

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[var(--bg-primary)] z-50 flex flex-col overflow-hidden"
    >
      <ConfirmDialog {...dialogProps} />
      {/* Header */}
      <div className="script-header">
        <div className="flex items-center gap-3">
          <button
            onClick={async () => { await forceSaveAll(); onExit(); }}
            className="hover-fade opacity-60"
          >
            ← ISSUE #{issue.number}
          </button>
          <span className="opacity-25">|</span>
          <span className="opacity-80">{issue.series?.title || 'Untitled'}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Scope selector */}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="border border-[var(--border)] px-2.5 py-1 rounded bg-transparent text-[10px] tracking-[1.5px] uppercase hover-glow"
          >
            <option value="page">Page</option>
            <option value="scene">Scene</option>
            <option value="act">Act</option>
            <option value="issue">Full Issue</option>
          </select>
          {/* Copy */}
          <button onClick={copyToClipboard} className="border border-[var(--border)] px-2.5 py-1 rounded hover-lift text-[10px] tracking-[1.5px] uppercase">
            COPY
          </button>
          {/* Export */}
          <button onClick={exportToPdf} className="border border-[var(--border)] px-2.5 py-1 rounded hover-lift text-[10px] tracking-[1.5px] uppercase">
            EXPORT
          </button>
          {/* Save status */}
          <span className={`text-[9px] tracking-[0.5px] ${saveStatus === 'saved' ? 'opacity-40' : saveStatus === 'saving' ? 'opacity-60' : 'text-[var(--color-warning)]'}`}>
            {saveStatus === 'saved' ? 'SAVED' : saveStatus === 'saving' ? 'SAVING...' : 'UNSAVED'}
          </span>
        </div>
      </div>

      {/* Adaptive Toolbar — sticky below header */}
      {activeEditor && activeEditor.variant !== 'sfx' && (
        <div ref={toolbarRef} className="script-toolbar">
          <ScriptEditorToolbar
            editor={activeEditor.editor}
            variant={activeEditor.variant}
            contextLabel={activeEditor.contextLabel}
          />
        </div>
      )}

      {/* Script content */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto" onBlurCapture={handleBodyFocusOut}>
        <div className="script-body">
          {blocks.length === 0 ? (
            <div className="text-center text-[var(--text-muted)] py-20">
              <p className="type-section">No content to display</p>
              <p className="text-sm mt-2">Add pages and panels in the Issue Editor first</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(() => {
                // Compute active block info once for all blocks
                const activeBlock = activeEditor ? blocks.find(b => b.id === activeEditor.blockId) : null
                const curActiveBlockId = activeEditor?.blockId ?? null
                const curActiveBlockType = activeBlock?.type ?? null
                const curActiveBlockPanelId = activeBlock?.panelId ?? null

                return blocks.map((block) => {
                const isPanelLastBlock = block.panelId ? panelLastBlockId.get(block.panelId) === block.id : false

                return (
                  <React.Fragment key={block.id}>
                    <ScriptBlockComponent
                      block={block}
                      characters={characters}
                      onFocus={() => handleBlockFocus(block)}
                      onBlur={() => handleBlockBlur(block)}
                      onChange={(content) => updateBlock(block.id, content)}
                      onCharacterChange={(charId) => changeDialogueCharacter(block.id, charId)}
                      onDialogueTypeChange={(newType) => changeDialogueType(block.id, newType)}
                      onCaptionTypeChange={(newType) => changeCaptionType(block.id, newType)}
                      onEditorFocus={handleEditorFocus}
                      onRegisterEditor={registerEditor}
                      onUnregisterEditor={unregisterEditor}
                      activeBlockId={curActiveBlockId}
                      activeBlockType={curActiveBlockType}
                      activeBlockPanelId={curActiveBlockPanelId}
                    />
                    {isPanelLastBlock && block.panelId && (
                      <div
                        id={`quick-add-${block.panelId}`}
                        className={`script-quick-add ${quickAddPanelId === block.panelId ? 'is-visible' : ''}`}
                      >
                        <span className="quick-add-key" onClick={() => handleQuickAdd('dialogue', block.panelId!, block.pageId!)}>
                          <kbd>D</kbd> Dialogue
                        </span>
                        <span className="quick-add-separator">&middot;</span>
                        <span className="quick-add-key" onClick={() => handleQuickAdd('caption', block.panelId!, block.pageId!)}>
                          <kbd>C</kbd> Caption
                        </span>
                        <span className="quick-add-separator">&middot;</span>
                        <span className="quick-add-key" onClick={() => handleQuickAdd('sfx', block.panelId!, block.pageId!)}>
                          <kbd>S</kbd> SFX
                        </span>
                        <span className="quick-add-separator">&middot;</span>
                        <span className="quick-add-key" onClick={() => handleQuickAdd('panel', block.panelId!, block.pageId!)}>
                          <kbd>P</kbd> + Panel
                        </span>
                        <span className="quick-add-separator">&middot;</span>
                        <span className="opacity-40">Tab → next panel</span>
                      </div>
                    )}
                  </React.Fragment>
                )
              })
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Footer keyboard hints */}
      <div className="script-footer">
        <span><kbd>Tab</kbd> Next field</span>
        <span><kbd>⌘S</kbd> Save</span>
        <span><kbd>⌘Z</kbd> Undo</span>
        <span><kbd>⌘F</kbd> Find</span>
        <span><kbd>⌘⌫</kbd> Delete block</span>
        <span><kbd>Esc</kbd> Exit</span>
      </div>

      {/* Find & Replace Modal */}
      <FindReplaceModal
        issue={issue}
        isOpen={findReplaceOpen}
        onClose={() => setFindReplaceOpen(false)}
        onNavigateToPanel={handleNavigateToPanel}
        onRefresh={() => {
          onRefresh()
          // Rebuild blocks after replace
          setBlocks(getBlocksForScope())
        }}
      />
    </div>
  )
}

// ============================================================================
// Block Component
// ============================================================================

interface ScriptBlockComponentProps {
  block: ScriptBlock
  characters: Character[]
  onFocus: () => void
  onBlur: () => void
  onChange: (content: string) => void
  onCharacterChange?: (characterId: string | null) => void
  onDialogueTypeChange?: (newType: string) => void
  onCaptionTypeChange?: (newType: string) => void
  onEditorFocus: (editor: Editor, blockId: string) => void
  onRegisterEditor: (blockId: string, editor: Editor) => void
  onUnregisterEditor: (blockId: string) => void
  activeBlockId?: string | null
  activeBlockType?: string | null
  activeBlockPanelId?: string | null
}

const ScriptBlockComponent = React.memo(function ScriptBlockComponent({
  block,
  characters,
  onFocus,
  onBlur,
  onChange,
  onCharacterChange,
  onDialogueTypeChange,
  onCaptionTypeChange,
  onEditorFocus,
  onRegisterEditor,
  onUnregisterEditor,
  activeBlockId,
  activeBlockType,
  activeBlockPanelId,
}: ScriptBlockComponentProps) {
  const isActive = block.id === activeBlockId
  // Page header - non-editable
  if (block.type === 'page-header') {
    return (
      <div className="mb-6 mt-8 first:mt-0">
        <div className="script-page-header">
          PAGE {block.pageNumber} <span className="orientation">({block.orientation})</span>
        </div>
        {(block.actName || block.sceneName) && (
          <div className="script-context-line">
            {block.actName}{block.actName && block.sceneName && ' // '}{block.sceneName}
          </div>
        )}
      </div>
    )
  }

  // Visual description (with panel header)
  if (block.type === 'visual') {
    const activePanelClass = activeBlockPanelId === block.panelId
      ? `is-active-${activeBlockType === 'visual' ? 'description' : activeBlockType}`
      : ''
    return (
      <div className="mt-5">
        <div className={`script-panel-label ${activePanelClass}`}>
          PANEL {block.panelNumber}
        </div>
        <div id={`editor-${block.id}`} className={`script-block-description ${isActive ? 'is-active' : ''}`}>
          <ScriptEditor
            variant="description"
            initialContent={block.content || ''}
            onUpdate={(md) => onChange(md)}
            onFocus={onFocus}
            onBlur={() => onBlur?.()}
            onEditorFocus={(editor) => onEditorFocus(editor, block.id)}
            onRegisterEditor={(editor) => onRegisterEditor(block.id, editor)}
            onUnregisterEditor={() => onUnregisterEditor(block.id)}
            hideToolbar={true}
            placeholder="Describe what we see in this panel..."
            className="script-view-editor"
          />
        </div>
      </div>
    )
  }

  // Dialogue
  if (block.type === 'dialogue') {
    return (
      <div className="script-block-dialogue">
        <div className="speaker-label">
          <CharacterAutocomplete
            characters={characters}
            selectedId={block.characterId || null}
            onChange={(charId) => onCharacterChange?.(charId)}
            placeholder="SELECT CHARACTER"
          />
          <TypeSelector
            type="dialogue"
            value={block.dialogueType || null}
            onChange={(newType) => onDialogueTypeChange?.(newType)}
          />
        </div>
        <div id={`editor-${block.id}`} className={`dialogue-text ${isActive ? 'is-active' : ''}`}>
          <ScriptEditor
            variant="dialogue"
            initialContent={block.content || ''}
            onUpdate={(md) => onChange(md)}
            onFocus={onFocus}
            onBlur={() => onBlur?.()}
            onEditorFocus={(editor) => onEditorFocus(editor, block.id)}
            onRegisterEditor={(editor) => onRegisterEditor(block.id, editor)}
            onUnregisterEditor={() => onUnregisterEditor(block.id)}
            hideToolbar={true}
            placeholder="Dialogue..."
            className="script-view-editor"
          />
        </div>
      </div>
    )
  }

  // Caption
  if (block.type === 'caption') {
    return (
      <div className="script-block-caption">
        <div className="caption-label">
          CAP <TypeSelector
            type="caption"
            value={block.captionType || null}
            onChange={(newType) => onCaptionTypeChange?.(newType)}
          />
        </div>
        <div id={`editor-${block.id}`} className={`caption-text ${isActive ? 'is-active' : ''}`}>
          <ScriptEditor
            variant="caption"
            initialContent={block.content || ''}
            onUpdate={(md) => onChange(md)}
            onFocus={onFocus}
            onBlur={() => onBlur?.()}
            onEditorFocus={(editor) => onEditorFocus(editor, block.id)}
            onRegisterEditor={(editor) => onRegisterEditor(block.id, editor)}
            onUnregisterEditor={() => onUnregisterEditor(block.id)}
            hideToolbar={true}
            placeholder="Caption text..."
            className="script-view-editor"
          />
        </div>
      </div>
    )
  }

  // Sound effect
  if (block.type === 'sfx') {
    return (
      <div id={`editor-${block.id}`} className="script-block-sfx">
        <span className="sfx-text">SFX: </span>
        <ScriptEditor
          variant="sfx"
          initialContent={block.content || ''}
          onUpdate={(md) => onChange(md)}
          onFocus={onFocus}
          onBlur={() => onBlur?.()}
          onEditorFocus={(editor) => onEditorFocus(editor, block.id)}
          onRegisterEditor={(editor) => onRegisterEditor(block.id, editor)}
          onUnregisterEditor={() => onUnregisterEditor(block.id)}
          hideToolbar={true}
          placeholder="Sound effect..."
          className="script-view-editor script-view-editor--sfx"
        />
      </div>
    )
  }

  return null
})
