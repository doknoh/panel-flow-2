'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { jsPDF } from 'jspdf'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useUndo } from '@/contexts/UndoContext'
import CharacterAutocomplete from '@/components/CharacterAutocomplete'
import TypeSelector from '@/components/TypeSelector'
import FindReplaceModal from './FindReplaceModal'
import {
  wrapSelection,
  parseMarkdownToReact,
  countWords,
  getWordCountClass,
  parseMarkdownForPdf,
  stripMarkdown
} from '@/lib/markdown'

// ============================================================================
// Types
// ============================================================================

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

type Scope = 'panel' | 'page' | 'scene' | 'act' | 'issue'

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
  const [focusedBlockIndex, setFocusedBlockIndex] = useState<number>(0)
  const [currentPageId, setCurrentPageId] = useState<string | null>(selectedPageId)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const blockRefs = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement>>(new Map())
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { showToast } = useToast()
  const { recordAction, startGenericTextEdit, endGenericTextEdit, undo, redo, canUndo, canRedo } = useUndo()
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
      case 'panel':
        // Just the first panel of current page (or focused panel)
        return allBlocks.filter(b => b.pageId === currentPage!.id).slice(0, 5) // Approx one panel
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
  const deleteDialogue = useCallback(async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'dialogue') return

    const dialogueId = block.id.replace('dialogue-', '')

    // Confirm if non-empty
    if (block.content.trim()) {
      const confirmed = window.confirm('Delete this dialogue? This can be undone with ⌘Z.')
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

    showToast('Dialogue deleted', 'success')
  }, [blocks, supabase, showToast, recordAction])

  // Delete a caption
  const deleteCaption = useCallback(async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'caption') return

    const captionId = block.id.replace('caption-', '')

    // Confirm if non-empty
    if (block.content.trim()) {
      const confirmed = window.confirm('Delete this caption? This can be undone with ⌘Z.')
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

    showToast('Caption deleted', 'success')
  }, [blocks, supabase, showToast, recordAction])

  // Delete a sound effect
  const deleteSoundEffect = useCallback(async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.type !== 'sfx') return

    const sfxId = block.id.replace('sfx-', '')

    // Confirm if non-empty
    if (block.content.trim()) {
      const confirmed = window.confirm('Delete this sound effect? This can be undone with ⌘Z.')
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

    showToast('Sound effect deleted', 'success')
  }, [blocks, supabase, showToast, recordAction])

  // Delete a panel (with all its children)
  const deletePanel = useCallback(async (panelId: string) => {
    // Find all blocks belonging to this panel
    const panelBlocks = blocks.filter(b => b.panelId === panelId)
    const visualBlock = panelBlocks.find(b => b.type === 'visual')

    if (!visualBlock) return

    // Check if panel has any content
    const hasContent = panelBlocks.some(b => b.content.trim())
    if (hasContent) {
      const confirmed = window.confirm(
        'Delete this panel and all its contents (dialogue, captions, sound effects)? This can be undone with ⌘Z.'
      )
      if (!confirmed) return
    }

    // Gather all children data for undo restoration
    const dialogueBlocks = panelBlocks
      .filter(b => b.type === 'dialogue')
      .map(b => ({
        id: b.id.replace('dialogue-', ''),
        panel_id: panelId,
        text: b.content,
        character_id: b.characterId,
        dialogue_type: b.dialogueType,
        sort_order: b.sortOrder,
      }))

    const captions = panelBlocks
      .filter(b => b.type === 'caption')
      .map(b => ({
        id: b.id.replace('caption-', ''),
        panel_id: panelId,
        text: b.content,
        caption_type: b.captionType,
        sort_order: b.sortOrder,
      }))

    const soundEffects = panelBlocks
      .filter(b => b.type === 'sfx')
      .map(b => ({
        id: b.id.replace('sfx-', ''),
        panel_id: panelId,
        text: b.content,
        sort_order: b.sortOrder,
      }))

    // Store full panel data including children
    const fullPanelData = {
      id: panelId,
      page_id: visualBlock.pageId,
      panel_number: visualBlock.panelNumber,
      visual_description: visualBlock.content,
      sort_order: visualBlock.sortOrder,
      dialogue_blocks: dialogueBlocks,
      captions: captions,
      sound_effects: soundEffects,
    }

    // Optimistic removal
    setBlocks(prev => prev.filter(b => b.panelId !== panelId))

    // Delete from DB (cascade will handle children)
    const { error } = await supabase
      .from('panels')
      .delete()
      .eq('id', panelId)

    if (error) {
      // Rollback - re-add all panel blocks
      setBlocks(prev => {
        const newBlocks = [...prev]
        // Find position to insert (after page header or at end of page blocks)
        const pageBlocks = prev.filter(b => b.pageId === visualBlock.pageId)
        const insertIndex = pageBlocks.length > 0
          ? prev.findIndex(b => b.id === pageBlocks[pageBlocks.length - 1]?.id) + 1
          : prev.length
        newBlocks.splice(insertIndex, 0, ...panelBlocks)
        return newBlocks
      })
      showToast('Failed to delete panel', 'error')
      return
    }

    // Record undo action with full data for restoration
    recordAction({
      type: 'panel_delete',
      panelId,
      pageId: visualBlock.pageId,
      data: fullPanelData,
      description: 'Delete panel',
    })

    showToast('Panel deleted', 'success')
  }, [blocks, supabase, showToast, recordAction])

  // ============================================================================
  // Page Operations
  // ============================================================================

  // Helper to find scene ID for current page
  const findSceneForPage = useCallback((pageId: string): { sceneId: string; scenePages: Page[] } | null => {
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = scene.pages?.find((p: Page) => p.id === pageId)
        if (page) {
          return { sceneId: scene.id, scenePages: scene.pages || [] }
        }
      }
    }
    return null
  }, [issue])

  // Add a new page to the current scene
  const addPage = useCallback(async () => {
    if (!currentPageId) return

    const sceneInfo = findSceneForPage(currentPageId)
    if (!sceneInfo) {
      showToast('Could not find scene for current page', 'error')
      return
    }

    const { sceneId, scenePages } = sceneInfo
    const maxPageNumber = Math.max(0, ...scenePages.map(p => p.page_number))
    const maxSortOrder = Math.max(0, ...scenePages.map(p => p.sort_order))
    const newPageNumber = maxPageNumber + 1
    const newSortOrder = maxSortOrder + 1

    // Insert page into DB
    const { data: newPage, error: pageError } = await supabase
      .from('pages')
      .insert({
        scene_id: sceneId,
        page_number: newPageNumber,
        sort_order: newSortOrder,
      })
      .select()
      .single()

    if (pageError || !newPage) {
      showToast('Failed to create page', 'error')
      return
    }

    // Auto-create first empty panel
    const { data: newPanel, error: panelError } = await supabase
      .from('panels')
      .insert({
        page_id: newPage.id,
        panel_number: 1,
        sort_order: 1,
        visual_description: '',
      })
      .select()
      .single()

    if (panelError) {
      // Rollback page creation
      await supabase.from('pages').delete().eq('id', newPage.id)
      showToast('Failed to create panel for new page', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'page_add',
      pageId: newPage.id,
      sceneId,
      data: {
        page_number: newPageNumber,
        sort_order: newSortOrder,
        panelId: newPanel?.id,
      },
      description: 'Add page',
    })

    // Refresh and navigate to new page
    onRefresh()
    setCurrentPageId(newPage.id)
    onNavigate(newPage.id)
    showToast('Page added', 'success')
  }, [currentPageId, findSceneForPage, supabase, showToast, recordAction, onRefresh, onNavigate])

  // Delete current page (with all panels and their children)
  const deletePage = useCallback(async () => {
    if (!currentPageId) return

    const sceneInfo = findSceneForPage(currentPageId)
    if (!sceneInfo) {
      showToast('Could not find scene for current page', 'error')
      return
    }

    const { scenePages } = sceneInfo

    // Don't allow deleting the last page in a scene
    if (scenePages.length <= 1) {
      showToast('Cannot delete the last page in a scene', 'error')
      return
    }

    // Find page data
    const currentPage = scenePages.find(p => p.id === currentPageId)
    if (!currentPage) return

    // Check if page has content
    const pageBlocks = blocks.filter(b => b.pageId === currentPageId)
    const hasContent = pageBlocks.some(b => b.content.trim())

    if (hasContent) {
      const confirmed = window.confirm(
        'Delete this page and all its panels? This can be undone with ⌘Z.'
      )
      if (!confirmed) return
    }

    // Gather full page data for undo restoration
    const fullPageData = {
      id: currentPageId,
      scene_id: sceneInfo.sceneId,
      page_number: currentPage.page_number,
      sort_order: currentPage.sort_order,
      title: currentPage.title,
      panels: currentPage.panels?.map(panel => ({
        ...panel,
        dialogue_blocks: panel.dialogue_blocks,
        captions: panel.captions,
        sound_effects: panel.sound_effects,
      })),
    }

    // Find adjacent page to navigate to
    const currentIndex = scenePages.findIndex(p => p.id === currentPageId)
    const adjacentPage = scenePages[currentIndex + 1] || scenePages[currentIndex - 1]

    // Delete from DB (cascade will handle panels and children)
    const { error } = await supabase
      .from('pages')
      .delete()
      .eq('id', currentPageId)

    if (error) {
      showToast('Failed to delete page', 'error')
      return
    }

    // Record undo action
    recordAction({
      type: 'page_delete',
      pageId: currentPageId,
      sceneId: sceneInfo.sceneId,
      data: fullPageData,
      description: 'Delete page',
    })

    // Navigate to adjacent page
    if (adjacentPage) {
      setCurrentPageId(adjacentPage.id)
      onNavigate(adjacentPage.id)
    }

    onRefresh()
    showToast('Page deleted', 'success')
  }, [currentPageId, findSceneForPage, blocks, supabase, showToast, recordAction, onRefresh, onNavigate])

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
  const exportToPdf = useCallback(() => {
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
  // Navigation
  // ============================================================================

  const navigateToPage = useCallback(async (direction: 'prev' | 'next') => {
    await forceSaveAll()

    // Find all pages in order
    const allPages: Page[] = []
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          allPages.push(page)
        }
      }
    }

    const currentIndex = allPages.findIndex(p => p.id === currentPageId)
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (newIndex >= 0 && newIndex < allPages.length) {
      setCurrentPageId(allPages[newIndex].id)
      setFocusedBlockIndex(0)
      onNavigate(allPages[newIndex].id)
    }
  }, [currentPageId, issue, forceSaveAll, onNavigate])

  // ============================================================================
  // Keyboard shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Escape to close find/replace or exit
      if (e.key === 'Escape') {
        e.preventDefault()
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

      // Cmd+Shift+Arrow for page navigation
      if (isMod && e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault()
        navigateToPage('next')
        return
      }

      if (isMod && e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateToPage('prev')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [forceSaveAll, onExit, navigateToPage, showToast, canUndo, canRedo, undo, redo, onRefresh, findReplaceOpen])

  // ============================================================================
  // Find & Replace navigation
  // ============================================================================

  const handleNavigateToPanel = useCallback((pageId: string, panelId: string) => {
    // Update scope to show the target page
    setCurrentPageId(pageId)
    onNavigate(pageId)

    // Find and scroll to the panel's visual block
    const blockId = `visual-${panelId}`
    const blockRef = blockRefs.current.get(blockId)
    if (blockRef) {
      blockRef.scrollIntoView({ behavior: 'smooth', block: 'center' })
      blockRef.focus()
    } else {
      // If ref not immediately available (e.g., page change), wait for render
      setTimeout(() => {
        const ref = blockRefs.current.get(blockId)
        if (ref) {
          ref.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ref.focus()
        }
      }, 100)
    }
  }, [onNavigate])

  // ============================================================================
  // Get page position info
  // ============================================================================

  const getPagePositionInfo = useMemo(() => {
    let totalPages = 0
    let currentPageNum = 0

    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          totalPages++
          if (page.id === currentPageId) {
            currentPageNum = totalPages
          }
        }
      }
    }

    return { currentPageNum, totalPages }
  }, [issue, currentPageId])

  // ============================================================================
  // Render
  // ============================================================================

  const editableBlocks = blocks.filter(b => b.type !== 'page-header')

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[#1a1a1a] z-50 flex flex-col overflow-hidden"
      style={{ fontFamily: "'Courier Prime', 'Courier New', monospace" }}
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-[#1a1a1a]">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                await forceSaveAll()
                onExit()
              }}
              className="text-gray-400 hover:text-white transition-colors"
              title="Exit Script View (Esc)"
            >
              ← Exit
            </button>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400 text-sm">
              {issue.series?.title} • Issue #{issue.number}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Scope selector */}
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded px-2 py-1"
            >
              <option value="page">Page</option>
              <option value="scene">Scene</option>
              <option value="act">Act</option>
              <option value="issue">Full Issue</option>
            </select>

            {/* Export options */}
            <div className="flex items-center gap-1">
              <button
                onClick={copyToClipboard}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                title="Copy script to clipboard"
              >
                📋 Copy
              </button>
              <button
                onClick={exportToPdf}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                title="Export to PDF"
              >
                📄 PDF
              </button>
            </div>

            {/* Save status */}
            <span className={`text-xs ${
              saveStatus === 'saved' ? 'text-green-500' :
              saveStatus === 'saving' ? 'text-blue-400' :
              'text-amber-500'
            }`}>
              {saveStatus === 'saved' ? '✓ Saved' :
               saveStatus === 'saving' ? 'Saving...' :
               '• Unsaved'}
            </span>

            {/* Page navigation */}
            {scope === 'page' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <button
                  onClick={() => navigateToPage('prev')}
                  className="hover:text-white disabled:opacity-30"
                  disabled={getPagePositionInfo.currentPageNum <= 1}
                >
                  ‹
                </button>
                <span>
                  Page {getPagePositionInfo.currentPageNum} of {getPagePositionInfo.totalPages}
                </span>
                <button
                  onClick={() => navigateToPage('next')}
                  className="hover:text-white disabled:opacity-30"
                  disabled={getPagePositionInfo.currentPageNum >= getPagePositionInfo.totalPages}
                >
                  ›
                </button>
                <span className="text-gray-600 mx-1">|</span>
                <button
                  onClick={addPage}
                  className="hover:text-green-400 transition-colors"
                  title="Add new page"
                >
                  + Page
                </button>
                <button
                  onClick={deletePage}
                  className="hover:text-red-400 transition-colors"
                  title="Delete current page"
                >
                  − Page
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Script content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {blocks.length === 0 ? (
            <div className="text-center text-gray-500 py-20">
              <p className="text-lg">No content to display</p>
              <p className="text-sm mt-2">Add pages and panels in the Issue Editor first</p>
            </div>
          ) : (
            <div className="space-y-1">
              {blocks.map((block, index) => {
                // Determine if this is the last block in its panel (for showing action bar)
                const isLastBlockInPanel = (() => {
                  if (!block.panelId) return false
                  const nextBlock = blocks[index + 1]
                  return !nextBlock || nextBlock.panelId !== block.panelId
                })()

                // Determine if this is the last block in its page (for showing add panel button)
                const isLastBlockInPage = (() => {
                  if (!block.pageId) return false
                  const nextBlock = blocks[index + 1]
                  return !nextBlock || nextBlock.pageId !== block.pageId
                })()

                return (
                  <ScriptBlockComponent
                    key={block.id}
                    block={block}
                    characters={characters}
                    isFocused={index === focusedBlockIndex}
                    onFocus={() => {
                      setFocusedBlockIndex(index)
                      handleBlockFocus(block)
                    }}
                    onBlur={() => handleBlockBlur(block)}
                    onChange={(content) => updateBlock(block.id, content)}
                    onCharacterChange={(charId) => changeDialogueCharacter(block.id, charId)}
                    onDialogueTypeChange={(newType) => changeDialogueType(block.id, newType)}
                    onCaptionTypeChange={(newType) => changeCaptionType(block.id, newType)}
                    onAddDialogue={block.panelId && block.pageId ? () => addDialogue(block.panelId!, block.pageId!) : undefined}
                    onAddCaption={block.panelId && block.pageId ? () => addCaption(block.panelId!, block.pageId!) : undefined}
                    onAddSfx={block.panelId && block.pageId ? () => addSoundEffect(block.panelId!, block.pageId!) : undefined}
                    onAddPanel={block.pageId ? () => addPanel(block.pageId!) : undefined}
                    onDeleteDialogue={block.type === 'dialogue' ? () => deleteDialogue(block.id) : undefined}
                    onDeleteCaption={block.type === 'caption' ? () => deleteCaption(block.id) : undefined}
                    onDeleteSfx={block.type === 'sfx' ? () => deleteSoundEffect(block.id) : undefined}
                    onDeletePanel={block.panelId ? () => deletePanel(block.panelId!) : undefined}
                    isLastBlockInPanel={isLastBlockInPanel}
                    isLastBlockInPage={isLastBlockInPage}
                    registerRef={(el) => {
                      if (el) {
                        blockRefs.current.set(block.id, el)
                      } else {
                        blockRefs.current.delete(block.id)
                      }
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer with hints */}
      <div className="flex-shrink-0 border-t border-gray-800 bg-[#1a1a1a]">
        <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-center text-gray-600 text-xs gap-6">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">⌘Z</kbd> Undo
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">⌘⇧Z</kbd> Redo
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">⌘S</kbd> Save
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">⌘F</kbd> Find
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">⌘⇧←/→</kbd> Prev/Next page
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Esc</kbd> Exit
          </span>
        </div>
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
  isFocused: boolean
  onFocus: () => void
  onBlur: () => void
  onChange: (content: string) => void
  onCharacterChange?: (characterId: string | null) => void
  onDialogueTypeChange?: (newType: string) => void
  onCaptionTypeChange?: (newType: string) => void
  onAddDialogue?: () => void
  onAddCaption?: () => void
  onAddSfx?: () => void
  onAddPanel?: () => void
  onDeleteDialogue?: () => void
  onDeleteCaption?: () => void
  onDeleteSfx?: () => void
  onDeletePanel?: () => void
  isLastBlockInPanel?: boolean
  isLastBlockInPage?: boolean
  registerRef: (el: HTMLTextAreaElement | HTMLInputElement | null) => void
}

// Memoized word count badge to prevent recalculation on every render
const WordCountBadge = React.memo(function WordCountBadge({
  content,
  className = '',
  showWarnings = true
}: {
  content: string
  className?: string
  showWarnings?: boolean
}) {
  const wc = useMemo(() => countWords(content), [content])

  if (!content) return null

  const warningText = showWarnings
    ? wc >= 35 ? ' - too many for letterer!' : wc >= 25 ? ' - getting wordy' : ''
    : ''

  return (
    <div className={`absolute right-0 top-0 -mt-5 ${className}`}>
      <span
        className={`text-xs font-mono ${getWordCountClass(wc)}`}
        title={`${wc} words${warningText}`}
      >
        {wc}w
      </span>
    </div>
  )
})

// Memoized inline word count for SFX
const InlineWordCount = React.memo(function InlineWordCount({ content }: { content: string }) {
  const wc = useMemo(() => countWords(content), [content])

  if (!content) return null

  return (
    <span
      className={`text-xs font-mono ${getWordCountClass(wc)}`}
      title={`${wc} words`}
    >
      {wc}w
    </span>
  )
})

const ScriptBlockComponent = React.memo(function ScriptBlockComponent({
  block,
  characters,
  isFocused,
  onFocus,
  onBlur,
  onChange,
  onCharacterChange,
  onDialogueTypeChange,
  onCaptionTypeChange,
  onAddDialogue,
  onAddCaption,
  onAddSfx,
  onAddPanel,
  onDeleteDialogue,
  onDeleteCaption,
  onDeleteSfx,
  onDeletePanel,
  isLastBlockInPanel,
  isLastBlockInPage,
  registerRef,
}: ScriptBlockComponentProps) {
  // ============================================================================
  // Markdown formatting handlers (Cmd+B for bold, Cmd+I for italic)
  // ============================================================================

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    content: string,
    onContentChange: (newContent: string) => void
  ) => {
    const isMod = e.metaKey || e.ctrlKey
    const target = e.target as HTMLTextAreaElement | HTMLInputElement

    // Cmd+B for bold
    if (isMod && e.key === 'b') {
      e.preventDefault()
      e.stopPropagation()
      applyFormatting(target, content, '**', onContentChange)
      return
    }

    // Cmd+I for italic
    if (isMod && e.key === 'i') {
      e.preventDefault()
      e.stopPropagation()
      applyFormatting(target, content, '*', onContentChange)
      return
    }
  }

  // Auto-resize textarea to fit content
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }

  const applyFormatting = (
    target: HTMLTextAreaElement | HTMLInputElement,
    content: string,
    wrapper: '**' | '*',
    onContentChange: (newContent: string) => void
  ) => {
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0

    // Handle empty content - insert markers with cursor between
    if (!content) {
      const newContent = wrapper + wrapper
      onContentChange(newContent)
      requestAnimationFrame(() => {
        target.focus()
        target.setSelectionRange(wrapper.length, wrapper.length)
      })
      return
    }

    // If no selection, find word boundaries
    let actualStart = start
    let actualEnd = end

    if (start === end) {
      // Find word boundaries
      let wordStart = start
      let wordEnd = end

      while (wordStart > 0 && !/\s/.test(content[wordStart - 1])) {
        wordStart--
      }
      while (wordEnd < content.length && !/\s/.test(content[wordEnd])) {
        wordEnd++
      }

      // Check if we found a word (not just whitespace)
      const selectedText = content.slice(wordStart, wordEnd)
      if (!selectedText.trim()) {
        // Cursor is in whitespace - insert markers at cursor position
        const before = content.slice(0, start)
        const after = content.slice(start)
        const newContent = before + wrapper + wrapper + after
        onContentChange(newContent)
        requestAnimationFrame(() => {
          target.focus()
          target.setSelectionRange(start + wrapper.length, start + wrapper.length)
        })
        return
      }

      actualStart = wordStart
      actualEnd = wordEnd
    }

    const result = wrapSelection(content, actualStart, actualEnd, wrapper)
    onContentChange(result.text)

    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      target.focus()
      target.setSelectionRange(result.newStart, result.newEnd)
    })
  }

  // Page header - non-editable
  if (block.type === 'page-header') {
    return (
      <div className="mt-8 first:mt-0 mb-4">
        <div className="text-white font-bold text-lg">
          {block.content}
        </div>
        {block.actName && block.sceneName && (
          <div className="text-gray-500 text-xs mt-1">
            {block.actName} › {block.sceneName}
          </div>
        )}
      </div>
    )
  }

  // Visual description (with panel header)
  if (block.type === 'visual') {
    return (
      <div className="mt-4 group/panel">
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
          <span>PANEL {block.panelNumber}:</span>
          <button
            onClick={onDeletePanel}
            className="opacity-0 group-hover/panel:opacity-100 text-xs text-gray-600 hover:text-red-400 transition-all px-1"
            title="Delete this panel"
          >
            ×
          </button>
        </div>
        <div className="relative">
          <textarea
            ref={(el) => { registerRef(el); autoResize(el) }}
            value={block.content}
            onChange={(e) => onChange(e.target.value)}
            onInput={(e) => autoResize(e.target as HTMLTextAreaElement)}
            onKeyDown={(e) => handleTextareaKeyDown(e, block.content, onChange)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Describe what we see in this panel... (Cmd+B bold, Cmd+I italic)"
            className="w-full bg-transparent text-white resize-none focus:outline-none focus:bg-gray-900/30 rounded px-2 py-1 -ml-2 min-h-[60px] leading-relaxed overflow-hidden"
            style={{ caretColor: '#fff' }}
          />
          {/* Word count indicator - memoized for performance */}
          <WordCountBadge content={block.content} showWarnings={false} />
        </div>

        {/* Action bar for adding content to this panel - shown after visual description */}
        {isLastBlockInPanel && (
          <div className="flex items-center gap-2 mt-2 ml-2">
            <button
              onClick={onAddDialogue}
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add dialogue to this panel"
            >
              + Dialogue
            </button>
            <button
              onClick={onAddCaption}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add caption to this panel"
            >
              + Caption
            </button>
            <button
              onClick={onAddSfx}
              className="text-xs text-gray-500 hover:text-purple-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add sound effect to this panel"
            >
              + SFX
            </button>
          </div>
        )}

        {/* Add Panel button at end of page */}
        {isLastBlockInPage && (
          <div className="mt-6 pt-4 border-t border-gray-800">
            <button
              onClick={onAddPanel}
              className="text-xs text-gray-500 hover:text-green-400 transition-colors px-3 py-1.5 rounded border border-gray-700 hover:border-green-600 hover:bg-gray-800"
              title="Add new panel to this page"
            >
              + Add Panel
            </button>
          </div>
        )}
      </div>
    )
  }

  // Dialogue
  if (block.type === 'dialogue') {
    return (
      <div className="mt-3 ml-16 group/dialogue">
        <div className="text-center relative">
          <div className="inline-flex items-center gap-1">
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
            <button
              onClick={onDeleteDialogue}
              className="opacity-0 group-hover/dialogue:opacity-100 text-xs text-gray-600 hover:text-red-400 transition-all px-1 ml-1"
              title="Delete this dialogue"
            >
              ×
            </button>
          </div>
        </div>
        <div className="relative">
          <textarea
            ref={(el) => { registerRef(el); autoResize(el) }}
            value={block.content}
            onChange={(e) => onChange(e.target.value)}
            onInput={(e) => autoResize(e.target as HTMLTextAreaElement)}
            onKeyDown={(e) => handleTextareaKeyDown(e, block.content, onChange)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Dialogue... (Cmd+B bold, Cmd+I italic)"
            className="w-full max-w-md mx-auto block bg-transparent text-white resize-none focus:outline-none focus:bg-gray-900/30 rounded px-2 py-1 text-center min-h-[40px] leading-relaxed overflow-hidden"
            style={{ caretColor: '#fff' }}
          />
          {/* Word count indicator - memoized for performance */}
          <WordCountBadge content={block.content} showWarnings={true} />
        </div>

        {/* Action bar for adding content to this panel */}
        {isLastBlockInPanel && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <button
              onClick={onAddDialogue}
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add dialogue to this panel"
            >
              + Dialogue
            </button>
            <button
              onClick={onAddCaption}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add caption to this panel"
            >
              + Caption
            </button>
            <button
              onClick={onAddSfx}
              className="text-xs text-gray-500 hover:text-purple-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add sound effect to this panel"
            >
              + SFX
            </button>
          </div>
        )}

        {/* Add Panel button at end of page */}
        {isLastBlockInPage && (
          <div className="mt-6 pt-4 border-t border-gray-800 text-center">
            <button
              onClick={onAddPanel}
              className="text-xs text-gray-500 hover:text-green-400 transition-colors px-3 py-1.5 rounded border border-gray-700 hover:border-green-600 hover:bg-gray-800"
              title="Add new panel to this page"
            >
              + Add Panel
            </button>
          </div>
        )}
      </div>
    )
  }

  // Caption
  if (block.type === 'caption') {
    return (
      <div className="mt-3 ml-4 group/caption">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-amber-600 text-xs uppercase tracking-wider">CAPTION</span>
          <TypeSelector
            type="caption"
            value={block.captionType || null}
            onChange={(newType) => onCaptionTypeChange?.(newType)}
          />
          <button
            onClick={onDeleteCaption}
            className="opacity-0 group-hover/caption:opacity-100 text-xs text-gray-600 hover:text-red-400 transition-all px-1"
            title="Delete this caption"
          >
            ×
          </button>
        </div>
        <div className="relative">
          <textarea
            ref={(el) => { registerRef(el); autoResize(el) }}
            value={block.content}
            onChange={(e) => onChange(e.target.value)}
            onInput={(e) => autoResize(e.target as HTMLTextAreaElement)}
            onKeyDown={(e) => handleTextareaKeyDown(e, block.content, onChange)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Caption text... (Cmd+B bold, Cmd+I italic)"
            className="w-full bg-transparent text-amber-400 italic resize-none focus:outline-none focus:bg-gray-900/30 rounded px-2 py-1 -ml-2 min-h-[30px] leading-relaxed overflow-hidden"
            style={{ caretColor: '#fbbf24' }}
          />
          {/* Word count indicator - memoized for performance */}
          <WordCountBadge content={block.content} showWarnings={false} />
        </div>

        {/* Action bar for adding content to this panel */}
        {isLastBlockInPanel && (
          <div className="flex items-center gap-2 mt-2 ml-2">
            <button
              onClick={onAddDialogue}
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add dialogue to this panel"
            >
              + Dialogue
            </button>
            <button
              onClick={onAddCaption}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add caption to this panel"
            >
              + Caption
            </button>
            <button
              onClick={onAddSfx}
              className="text-xs text-gray-500 hover:text-purple-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add sound effect to this panel"
            >
              + SFX
            </button>
          </div>
        )}

        {/* Add Panel button at end of page */}
        {isLastBlockInPage && (
          <div className="mt-6 pt-4 border-t border-gray-800">
            <button
              onClick={onAddPanel}
              className="text-xs text-gray-500 hover:text-green-400 transition-colors px-3 py-1.5 rounded border border-gray-700 hover:border-green-600 hover:bg-gray-800"
              title="Add new panel to this page"
            >
              + Add Panel
            </button>
          </div>
        )}
      </div>
    )
  }

  // Sound effect
  if (block.type === 'sfx') {
    return (
      <div className="mt-2 ml-4 group/sfx">
        <div className="flex items-center gap-2">
          <span className="text-purple-500 text-xs uppercase tracking-wider">SFX:</span>
          <input
            ref={(el) => registerRef(el)}
            type="text"
            value={block.content}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => handleTextareaKeyDown(e, block.content, onChange)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Sound effect... (Cmd+B bold, Cmd+I italic)"
            className="flex-1 bg-transparent text-purple-400 font-bold focus:outline-none focus:bg-gray-900/30 rounded px-2 py-1"
            style={{ caretColor: '#a855f7' }}
          />
          {/* Inline word count for SFX - memoized */}
          <InlineWordCount content={block.content} />
          <button
            onClick={onDeleteSfx}
            className="opacity-0 group-hover/sfx:opacity-100 text-xs text-gray-600 hover:text-red-400 transition-all px-1"
            title="Delete this sound effect"
          >
            ×
          </button>
        </div>

        {/* Action bar for adding content to this panel */}
        {isLastBlockInPanel && (
          <div className="flex items-center gap-2 mt-2 ml-2">
            <button
              onClick={onAddDialogue}
              className="text-xs text-gray-500 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add dialogue to this panel"
            >
              + Dialogue
            </button>
            <button
              onClick={onAddCaption}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add caption to this panel"
            >
              + Caption
            </button>
            <button
              onClick={onAddSfx}
              className="text-xs text-gray-500 hover:text-purple-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
              title="Add sound effect to this panel"
            >
              + SFX
            </button>
          </div>
        )}

        {/* Add Panel button at end of page */}
        {isLastBlockInPage && (
          <div className="mt-6 pt-4 border-t border-gray-800">
            <button
              onClick={onAddPanel}
              className="text-xs text-gray-500 hover:text-green-400 transition-colors px-3 py-1.5 rounded border border-gray-700 hover:border-green-600 hover:bg-gray-800"
              title="Add new panel to this page"
            >
              + Add Panel
            </button>
          </div>
        )}
      </div>
    )
  }

  return null
})
