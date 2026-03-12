'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useUndo } from '@/contexts/UndoContext'
import { fetchPageDeepData, fetchSceneDeepData, fetchActDeepData } from '@/lib/undoHelpers'
import { batchDeletePages, batchDeleteScenes, batchDeleteActs } from '@/lib/batchActions'
import ConfirmDialog, { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  CollisionDetection,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight } from 'lucide-react'
import { getSelectionGroups, GroupPosition } from '@/lib/selection-groups'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
}

interface NavigationTreeProps {
  issue: any
  setIssue: React.Dispatch<React.SetStateAction<any>>
  plotlines: Plotline[]
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onRefresh: () => Promise<void> | void
}

function SortableItem({ id, children, isPartOfMultiDrag }: { id: string; children: React.ReactNode; isPartOfMultiDrag?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isPartOfMultiDrag ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging
        ? 'ring-1 ring-[var(--border-strong)] ring-dashed bg-[var(--bg-secondary)]'
        : 'transition-all duration-150 ease-out'
      }
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

/** Shared margin/border constants for selection group styling */
const GROUP_MARGIN: Record<'page' | 'scene' | 'act', string> = { page: 'ml-8', scene: 'ml-4', act: 'ml-1' }
const GROUP_BG = 'bg-[var(--color-primary)]/12'
const GROUP_BORDER = 'border-[var(--color-primary)]/35'
const GROUP_DIVIDER = 'border-t border-t-[var(--color-primary)]/20'

/** Build className for a multi-selected item based on its group position */
function selectionGroupClass(position: GroupPosition | undefined, level: 'page' | 'scene' | 'act', hasSummaryBelow = false): string {
  if (!position) return ''

  const base = `${GROUP_MARGIN[level]} mr-1.5 ${GROUP_BG} text-[var(--text-primary)]`

  switch (position) {
    case 'solo':
      // When summary follows, row only gets top rounding — summary gets bottom rounding
      return hasSummaryBelow
        ? `${base} rounded-t-md border-t border-x ${GROUP_BORDER}`
        : `${base} rounded-md border ${GROUP_BORDER}`
    case 'first':
      return `${base} rounded-t-lg border-t border-x ${GROUP_BORDER}`
    case 'middle':
      return `${base} border-x ${GROUP_BORDER} ${GROUP_DIVIDER}`
    case 'last':
      // When summary follows, row loses bottom rounding — summary gets it
      return hasSummaryBelow
        ? `${base} border-x ${GROUP_BORDER} ${GROUP_DIVIDER}`
        : `${base} rounded-b-lg border-b border-x ${GROUP_BORDER} ${GROUP_DIVIDER}`
  }
}

/** Build className for a page summary div inside a selection group */
function selectionGroupSummaryClass(position: GroupPosition | undefined, level: 'page' | 'scene' | 'act'): string {
  if (!position) return ''

  const base = `${GROUP_MARGIN[level]} mr-1.5 ${GROUP_BG} px-3 pb-1.5`

  switch (position) {
    case 'solo':
      return `${base} rounded-b-md border-b border-x ${GROUP_BORDER}`
    case 'first':
    case 'middle':
      return `${base} border-x ${GROUP_BORDER}`
    case 'last':
      return `${base} rounded-b-lg border-b border-x ${GROUP_BORDER}`
  }
}

export default function NavigationTree({ issue, setIssue, plotlines, selectedPageId, onSelectPage, onRefresh }: NavigationTreeProps) {
  const [expandedActs, setExpandedActs] = useState<Set<string>>(new Set(issue.acts?.map((a: any) => a.id) || []))
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set())
  const [isMounted, setIsMounted] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemTitle, setEditingItemTitle] = useState('')
  const [editingPageSummaryId, setEditingPageSummaryId] = useState<string | null>(null)
  const [editingPageSummary, setEditingPageSummary] = useState('')
  const [summarizingPageIds, setSummarizingPageIds] = useState<Set<string>>(new Set())
  const [activeDragItem, setActiveDragItem] = useState<{
    id: string
    type: 'act' | 'scene' | 'page'
    sourceId: string
  } | null>(null)
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; type: 'act' | 'scene' | 'page'; id: string; title: string
  } | null>(null)
  const [contextSubmenu, setContextSubmenu] = useState<'move-to-act' | 'move-to-scene' | null>(null)
  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionType, setSelectionType] = useState<'page' | 'scene' | 'act' | null>(null)
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [showMovePopover, setShowMovePopover] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const pageSummaryInputRef = useRef<HTMLTextAreaElement>(null)
  const { showToast } = useToast()
  const { recordAction } = useUndo()
  const { confirm, dialogProps } = useConfirmDialog()

  // Only enable drag-drop after client mount to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Custom collision detection: prefer pointerWithin (precise for nested layouts),
  // fall back to closestCenter when pointer isn't directly over any droppable
  const hierarchyAwareCollision: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    return closestCenter(args)
  }, [])

  // Helper functions for finding item locations in the tree
  const findPageLocation = (pageId: string): { actId: string; sceneId: string; page: any } | null => {
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = (scene.pages || []).find((p: any) => p.id === pageId)
        if (page) {
          return { actId: act.id, sceneId: scene.id, page }
        }
      }
    }
    return null
  }

  const findSceneLocation = (sceneId: string): { actId: string; scene: any } | null => {
    for (const act of issue.acts || []) {
      const scene = (act.scenes || []).find((s: any) => s.id === sceneId)
      if (scene) {
        return { actId: act.id, scene }
      }
    }
    return null
  }

  const getItemType = (itemId: string): 'act' | 'scene' | 'page' | null => {
    // Check if it's an act
    if ((issue.acts || []).some((a: any) => a.id === itemId)) {
      return 'act'
    }
    // Check if it's a scene
    for (const act of issue.acts || []) {
      if ((act.scenes || []).some((s: any) => s.id === itemId)) {
        return 'scene'
      }
    }
    // Check if it's a page
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if ((scene.pages || []).some((p: any) => p.id === itemId)) {
          return 'page'
        }
      }
    }
    return null
  }

  // --- Multi-select helpers ---

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectionType(null)
    setLastClickedId(null)
    setShowMovePopover(false)
  }, [])

  const getVisibleItemIds = useCallback((type: 'page' | 'scene' | 'act'): string[] => {
    const ids: string[] = []
    const sorted = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

    if (type === 'act') {
      return sorted.map(a => a.id)
    }

    for (const act of sorted) {
      const sortedScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
      if (type === 'scene') {
        if (expandedActs.has(act.id)) {
          ids.push(...sortedScenes.map((s: any) => s.id))
        }
      } else {
        // pages
        for (const scene of sortedScenes) {
          if (expandedActs.has(act.id) && expandedScenes.has(scene.id)) {
            const sortedPages = [...(scene.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
            ids.push(...sortedPages.map((p: any) => p.id))
          }
        }
      }
    }
    return ids
  }, [issue.acts, expandedActs, expandedScenes])

  const handleMultiSelectClick = useCallback((
    itemId: string,
    itemType: 'page' | 'scene' | 'act',
    e: React.MouseEvent
  ) => {
    const isMetaKey = e.metaKey || e.ctrlKey
    const isShiftKey = e.shiftKey

    if (!isMetaKey && !isShiftKey) {
      // Plain click — clear multi-selection, navigate as usual, but
      // remember this item as the anchor for future shift+click ranges
      setSelectedIds(new Set())
      setSelectionType(null)
      setShowMovePopover(false)
      setLastClickedId(itemId)
      return false // signals caller to do normal navigation
    }

    if (isMetaKey) {
      // Cmd/Ctrl+click: toggle item in selection
      if (selectionType && selectionType !== itemType) {
        // Different type — start new selection
        setSelectedIds(new Set([itemId]))
        setSelectionType(itemType)
        setLastClickedId(itemId)
        return true
      }

      const newSelected = new Set(selectedIds)
      if (newSelected.has(itemId)) {
        newSelected.delete(itemId)
        if (newSelected.size === 0) {
          setSelectionType(null)
        }
      } else {
        newSelected.add(itemId)
      }
      setSelectedIds(newSelected)
      setSelectionType(itemType)
      setLastClickedId(itemId)
      return true
    }

    if (isShiftKey) {
      // Shift+click: range selection
      if (selectionType && selectionType !== itemType) {
        // Different type — start new selection
        setSelectedIds(new Set([itemId]))
        setSelectionType(itemType)
        setLastClickedId(itemId)
        return true
      }

      const visibleIds = getVisibleItemIds(itemType)
      // Use lastClickedId, or fall back to the currently active page
      // (handles the case where user navigated via URL, not a tree click)
      const anchorId = lastClickedId || (itemType === 'page' ? selectedPageId : null) || itemId
      const anchorIndex = visibleIds.indexOf(anchorId)
      const currentIndex = visibleIds.indexOf(itemId)

      if (anchorIndex === -1 || currentIndex === -1) {
        setSelectedIds(new Set([itemId]))
        setSelectionType(itemType)
        setLastClickedId(itemId)
        return true
      }

      const start = Math.min(anchorIndex, currentIndex)
      const end = Math.max(anchorIndex, currentIndex)
      const rangeIds = visibleIds.slice(start, end + 1)

      setSelectedIds(new Set(rangeIds))
      setSelectionType(itemType)
      // Don't update lastClickedId on shift+click (anchor stays)
      return true
    }

    return false
  }, [selectedIds, selectionType, lastClickedId, selectedPageId, clearSelection, getVisibleItemIds])

  const toggleAct = (actId: string) => {
    const newExpanded = new Set(expandedActs)
    if (newExpanded.has(actId)) {
      newExpanded.delete(actId)
    } else {
      newExpanded.add(actId)
    }
    setExpandedActs(newExpanded)
  }

  const toggleScene = (sceneId: string) => {
    const newExpanded = new Set(expandedScenes)
    if (newExpanded.has(sceneId)) {
      newExpanded.delete(sceneId)
    } else {
      newExpanded.add(sceneId)
    }
    setExpandedScenes(newExpanded)
  }

  // Auto-expand to show selected page
  useEffect(() => {
    if (!selectedPageId) return
    const loc = findPageLocation(selectedPageId)
    if (loc) {
      setExpandedActs(prev => new Set([...prev, loc.actId]))
      setExpandedScenes(prev => new Set([...prev, loc.sceneId]))
    }
  }, [selectedPageId])

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      // Ignore clicks on three-dot trigger buttons — let their onClick handle the toggle
      if ((e.target as HTMLElement).closest?.('[data-context-trigger]')) return
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
        setContextSubmenu(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setContextSubmenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  // Clear multi-selection on Escape
  useEffect(() => {
    if (selectedIds.size === 0) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !contextMenu) {
        clearSelection()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedIds.size, contextMenu, clearSelection])

  // Close move popover on click outside
  useEffect(() => {
    if (!showMovePopover) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-move-popover]')) {
        setShowMovePopover(false)
      }
    }
    // Slight delay to not close immediately on the button click that opened it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showMovePopover])

  // --- Unified title editing ---

  const startEditing = (id: string, title: string) => {
    setEditingItemId(id)
    setEditingItemTitle(title)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const cancelEditing = () => {
    setEditingItemId(null)
    setEditingItemTitle('')
  }

  const saveTitle = async () => {
    if (!editingItemId) return
    const trimmedTitle = editingItemTitle.trim()
    if (!trimmedTitle) {
      showToast('Title cannot be empty', 'error')
      return
    }

    const itemType = getItemType(editingItemId)
    const id = editingItemId

    // Capture old value for undo
    let oldValue = ''
    if (itemType === 'act') {
      oldValue = issue.acts?.find((a: any) => a.id === id)?.name || ''
    } else if (itemType === 'scene') {
      oldValue = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === id)?.title || ''
    } else if (itemType === 'page') {
      oldValue = issue.acts?.flatMap((a: any) => (a.scenes || []).flatMap((s: any) => s.pages || [])).find((p: any) => p.id === id)?.title || ''
    }

    try {
      const supabase = createClient()
      const field = itemType === 'act' ? 'name' : 'title'

      if (itemType === 'act') {
        const { error } = await supabase
          .from('acts')
          .update({ name: trimmedTitle })
          .eq('id', id)

        if (error) {
          console.error('Act title save error:', error)
          showToast(`Failed to rename act: ${error.message}`, 'error')
        } else {
          setIssue((prev: any) => ({
            ...prev,
            acts: prev.acts.map((a: any) =>
              a.id === id ? { ...a, name: trimmedTitle } : a
            ),
          }))
          if (oldValue !== trimmedTitle) {
            recordAction({ type: 'rename', entityType: 'act', entityId: id, field, oldValue, newValue: trimmedTitle, description: `Rename act` })
          }
        }
      } else if (itemType === 'scene') {
        const { error } = await supabase
          .from('scenes')
          .update({ title: trimmedTitle })
          .eq('id', id)

        if (error) {
          console.error('Scene title save error:', error)
          showToast(`Failed to rename scene: ${error.message}`, 'error')
        } else {
          setIssue((prev: any) => ({
            ...prev,
            acts: prev.acts.map((a: any) => ({
              ...a,
              scenes: (a.scenes || []).map((s: any) =>
                s.id === id ? { ...s, title: trimmedTitle } : s
              ),
            })),
          }))
          if (oldValue !== trimmedTitle) {
            recordAction({ type: 'rename', entityType: 'scene', entityId: id, field, oldValue, newValue: trimmedTitle, description: `Rename scene` })
          }
        }
      } else if (itemType === 'page') {
        const { error } = await supabase
          .from('pages')
          .update({ title: trimmedTitle })
          .eq('id', id)

        if (error) {
          console.error('Page title save error:', error)
          showToast(`Failed to rename page: ${error.message}`, 'error')
        } else {
          setIssue((prev: any) => ({
            ...prev,
            acts: prev.acts.map((a: any) => ({
              ...a,
              scenes: (a.scenes || []).map((s: any) => ({
                ...s,
                pages: (s.pages || []).map((p: any) =>
                  p.id === id ? { ...p, title: trimmedTitle } : p
                ),
              })),
            })),
          }))
          if (oldValue !== trimmedTitle) {
            recordAction({ type: 'rename', entityType: 'page', entityId: id, field, oldValue, newValue: trimmedTitle, description: `Rename page` })
          }
        }
      }
    } catch (err) {
      console.error('Unexpected error saving title:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingItemId(null)
  }

  // --- Page summary editing (separate from title editing) ---

  const startEditingPageSummary = (pageId: string, currentSummary: string) => {
    setEditingPageSummaryId(pageId)
    setEditingPageSummary(currentSummary || '')
    setTimeout(() => pageSummaryInputRef.current?.focus(), 0)
  }

  const savePageSummary = async (pageId: string) => {
    // Capture old value for undo
    const oldSummary = issue.acts?.flatMap((a: any) => (a.scenes || []).flatMap((s: any) => s.pages || []))
      .find((p: any) => p.id === pageId)?.page_summary || null

    try {
      const supabase = createClient()
      const trimmedSummary = editingPageSummary.trim() || null
      const { error } = await supabase
        .from('pages')
        .update({ page_summary: trimmedSummary })
        .eq('id', pageId)

      if (error) {
        showToast(`Failed to save summary: ${error.message}`, 'error')
      } else {
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) => ({
              ...s,
              pages: (s.pages || []).map((p: any) =>
                p.id === pageId ? { ...p, page_summary: trimmedSummary } : p
              ),
            })),
          })),
        }))
        if (oldSummary !== trimmedSummary) {
          recordAction({ type: 'page_summary_update', pageId, oldValue: oldSummary, newValue: trimmedSummary, description: 'Update page summary' })
        }
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingPageSummaryId(null)
  }

  const generatePageSummary = async (pageId: string) => {
    setSummarizingPageIds(prev => new Set(prev).add(pageId))
    try {
      const res = await fetch(`/api/pages/${pageId}/summarize`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.summary) {
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) => ({
              ...s,
              pages: (s.pages || []).map((p: any) =>
                p.id === pageId ? { ...p, page_summary: data.summary } : p
              ),
            })),
          })),
        }))
      }
    } catch (err) {
      console.error('Failed to generate page summary:', err)
    }
    setSummarizingPageIds(prev => {
      const next = new Set(prev)
      next.delete(pageId)
      return next
    })
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation to prevent dnd-kit from capturing keys (especially space)
    e.stopPropagation()

    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    }
  }

  // --- CRUD operations ---

  const addAct = async () => {
    const actNumber = (issue.acts?.length || 0) + 1
    const tempId = `temp-act-${Date.now()}`

    // Optimistic update FIRST - add immediately with temp ID
    const optimisticAct = {
      id: tempId,
      issue_id: issue.id,
      number: actNumber,
      name: `Act ${actNumber}`,
      sort_order: actNumber,
      scenes: [],
    }
    setIssue((prev: any) => ({
      ...prev,
      acts: [...(prev.acts || []), optimisticAct],
    }))
    setExpandedActs(new Set([...expandedActs, tempId]))

    // Then persist to database
    const supabase = createClient()
    // Note: acts table has number (NOT NULL) but no 'name' column
    const { data: newAct, error } = await supabase.from('acts').insert({
      issue_id: issue.id,
      number: actNumber,
      sort_order: actNumber,
    }).select().single()

    if (error) {
      // Rollback on error
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.filter((a: any) => a.id !== tempId),
      }))
      showToast(`Failed to create act: ${error.message}`, 'error')
    } else if (newAct) {
      // Replace temp ID with real ID
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => a.id === tempId ? { ...a, id: newAct.id } : a),
      }))
      setExpandedActs(prev => {
        const next = new Set(prev)
        next.delete(tempId)
        next.add(newAct.id)
        return next
      })
      recordAction({ type: 'act_add', actId: newAct.id, issueId: issue.id, data: { number: actNumber, sort_order: actNumber }, description: 'Add act' })
    }
  }

  const deleteAct = async (actId: string, actTitle: string) => {
    const act = issue.acts?.find((a: any) => a.id === actId)
    const pageCount = act?.scenes?.reduce((sum: number, s: any) => sum + (s.pages?.length || 0), 0) || 0

    const confirmed = await confirm({
      title: `Delete "${actTitle}"?`,
      description: `This will permanently delete ${act?.scenes?.length || 0} scene(s) and ${pageCount} page(s).`,
    })
    if (!confirmed) return

    // Deep-fetch full nested data BEFORE delete for undo
    const supabase = createClient()
    let deepData: any = null
    try {
      deepData = await fetchActDeepData(supabase, actId)
    } catch (e) {
      console.error('Failed to fetch act data for undo:', e)
    }

    const { error } = await supabase.from('acts').delete().eq('id', actId)
    if (error) {
      showToast(`Failed to delete act: ${error.message}`, 'error')
      return
    }

    // Optimistic delete after DB success
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.filter((a: any) => a.id !== actId),
    }))

    if (deepData) {
      recordAction({ type: 'act_delete', actId, issueId: issue.id, data: deepData, description: `Delete "${actTitle}"` })
    }
  }

  const deleteScene = async (sceneId: string, sceneTitle: string, pageCount: number) => {
    const confirmed = await confirm({
      title: `Delete "${sceneTitle}"?`,
      description: `This will permanently delete ${pageCount} page(s).`,
    })
    if (!confirmed) return

    // Find the parent act
    let parentActId: string | null = null
    for (const act of issue.acts || []) {
      if ((act.scenes || []).find((s: any) => s.id === sceneId)) {
        parentActId = act.id
        break
      }
    }

    // Deep-fetch full nested data BEFORE delete for undo
    const supabase = createClient()
    let deepData: any = null
    try {
      deepData = await fetchSceneDeepData(supabase, sceneId)
    } catch (e) {
      console.error('Failed to fetch scene data for undo:', e)
    }

    const { error } = await supabase.from('scenes').delete().eq('id', sceneId)
    if (error) {
      showToast(`Failed to delete scene: ${error.message}`, 'error')
      return
    }

    // Optimistic delete after DB success
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).filter((s: any) => s.id !== sceneId),
      })),
    }))

    if (deepData && parentActId) {
      recordAction({ type: 'scene_delete', sceneId, actId: parentActId, data: deepData, description: `Delete "${sceneTitle}"` })
    }
  }

  const deletePage = async (pageId: string, pageNumber: number) => {
    const confirmed = await confirm({
      title: `Delete Page ${pageNumber}?`,
      description: 'This will permanently delete all panels on this page.',
    })
    if (!confirmed) return

    // Find parent scene
    let parentSceneId: string | null = null
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if ((scene.pages || []).find((p: any) => p.id === pageId)) {
          parentSceneId = scene.id
          break
        }
      }
      if (parentSceneId) break
    }

    // Deep-fetch full nested data BEFORE delete for undo
    const supabase = createClient()
    let deepData: any = null
    try {
      deepData = await fetchPageDeepData(supabase, pageId)
    } catch (e) {
      console.error('Failed to fetch page data for undo:', e)
    }

    const { error } = await supabase.from('pages').delete().eq('id', pageId)
    if (error) {
      showToast(`Failed to delete page: ${error.message}`, 'error')
      return
    }

    // Optimistic delete after DB success
    if (selectedPageId === pageId) {
      onSelectPage('')
    }
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).map((s: any) => ({
          ...s,
          pages: (s.pages || []).filter((p: any) => p.id !== pageId),
        })),
      })),
    }))

    if (deepData && parentSceneId) {
      recordAction({ type: 'page_delete', pageId, sceneId: parentSceneId, data: deepData, description: `Delete Page ${pageNumber}` })
    }
  }

  const addScene = async (actId: string) => {
    const act = issue.acts?.find((a: any) => a.id === actId)
    const sceneCount = act?.scenes?.length || 0
    const tempId = `temp-scene-${Date.now()}`

    // Optimistic update FIRST
    const optimisticScene = {
      id: tempId,
      act_id: actId,
      title: `Scene ${sceneCount + 1}`,
      sort_order: sceneCount + 1,
      pages: [],
    }
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) =>
        a.id === actId
          ? { ...a, scenes: [...(a.scenes || []), optimisticScene] }
          : a
      ),
    }))
    setExpandedActs(new Set([...expandedActs, actId]))

    // Then persist to database
    const supabase = createClient()
    const { data: newScene, error } = await supabase.from('scenes').insert({
      act_id: actId,
      title: `Scene ${sceneCount + 1}`,
      sort_order: sceneCount + 1,
    }).select().single()

    if (error) {
      // Rollback on error
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) =>
          a.id === actId
            ? { ...a, scenes: (a.scenes || []).filter((s: any) => s.id !== tempId) }
            : a
        ),
      }))
      showToast(`Failed to create scene: ${error.message}`, 'error')
    } else if (newScene) {
      // Replace temp ID with real ID
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) =>
          a.id === actId
            ? { ...a, scenes: (a.scenes || []).map((s: any) => s.id === tempId ? { ...s, id: newScene.id } : s) }
            : a
        ),
      }))
      recordAction({ type: 'scene_add', sceneId: newScene.id, actId, data: { title: `Scene ${sceneCount + 1}`, sort_order: sceneCount + 1 }, description: 'Add scene' })
    }
  }

  const addPage = async (sceneId: string) => {
    const allPages = issue.acts?.flatMap((a: any) =>
      a.scenes?.flatMap((s: any) => s.pages || []) || []
    ) || []
    const pageNumber = allPages.length + 1

    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const pagesInScene = scene?.pages?.length || 0
    const tempId = `temp-page-${Date.now()}`

    // Optimistic update FIRST
    const optimisticPage = {
      id: tempId,
      scene_id: sceneId,
      page_number: pageNumber,
      sort_order: pagesInScene + 1,
      title: null, // No default title - will show as just "(position)"
      panels: [],
    }
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).map((s: any) =>
          s.id === sceneId
            ? { ...s, pages: [...(s.pages || []), optimisticPage] }
            : s
        ),
      })),
    }))
    setExpandedScenes(new Set([...expandedScenes, sceneId]))
    onSelectPage(tempId)

    // Then persist to database
    const supabase = createClient()
    const { data: newPage, error } = await supabase.from('pages').insert({
      scene_id: sceneId,
      page_number: pageNumber,
      sort_order: pagesInScene + 1,
      // No title - will display as just "(position)"
    }).select().single()

    if (error) {
      // Rollback on error
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => ({
          ...a,
          scenes: (a.scenes || []).map((s: any) =>
            s.id === sceneId
              ? { ...s, pages: (s.pages || []).filter((p: any) => p.id !== tempId) }
              : s
          ),
        })),
      }))
      onSelectPage('')
      showToast(`Failed to create page: ${error.message}`, 'error')
    } else if (newPage) {
      // Replace temp ID with real ID
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => ({
          ...a,
          scenes: (a.scenes || []).map((s: any) =>
            s.id === sceneId
              ? { ...s, pages: (s.pages || []).map((p: any) => p.id === tempId ? { ...p, id: newPage.id } : p) }
              : s
          ),
        })),
      }))
      onSelectPage(newPage.id)
      recordAction({ type: 'page_add', pageId: newPage.id, sceneId, data: { page_number: pageNumber, sort_order: pagesInScene + 1 }, description: 'Add page' })
    }
  }

  // --- Duplicate handlers ---

  const duplicatePage = async (pageId: string) => {
    const supabase = createClient()
    const location = findPageLocation(pageId)
    if (!location) { showToast('Page not found', 'error'); return }
    const { sceneId } = location

    // Fetch full page data with panels, dialogue, captions from DB
    const { data: sourcePage, error: fetchError } = await supabase
      .from('pages')
      .select('*, panels(*, dialogue_blocks(*), captions(*))')
      .eq('id', pageId)
      .single()

    if (fetchError || !sourcePage) {
      showToast(`Failed to fetch page: ${fetchError?.message}`, 'error')
      return
    }

    // Bump sort_order for all subsequent pages in this scene
    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const pagesAfter = (scene?.pages || []).filter((p: any) => p.sort_order > sourcePage.sort_order)
    if (pagesAfter.length > 0) {
      await Promise.all(pagesAfter.map((p: any) =>
        supabase.from('pages').update({ sort_order: p.sort_order + 1 }).eq('id', p.id)
      ))
    }

    // Insert the new page
    const { data: newPage, error: pageError } = await supabase.from('pages').insert({
      scene_id: sceneId,
      page_number: sourcePage.page_number,
      sort_order: sourcePage.sort_order + 1,
      title: sourcePage.title ? `${sourcePage.title} (copy)` : null,
      page_type: sourcePage.page_type,
      template: sourcePage.template,
      notes_to_artist: sourcePage.notes_to_artist,
      page_summary: sourcePage.page_summary,
    }).select().single()

    if (pageError || !newPage) {
      showToast(`Failed to duplicate page: ${pageError?.message}`, 'error')
      await onRefresh()
      return
    }

    // Deep copy panels with their dialogue blocks and captions
    for (const panel of (sourcePage.panels || []).sort((a: any, b: any) => a.order - b.order)) {
      const { data: newPanel } = await supabase.from('panels').insert({
        page_id: newPage.id,
        order: panel.order,
        visual_description: panel.visual_description,
        characters_present: panel.characters_present,
        location_id: panel.location_id,
        sfx: panel.sfx,
        panel_size: panel.panel_size,
        camera: panel.camera,
        notes_to_artist: panel.notes_to_artist,
        internal_notes: panel.internal_notes,
      }).select().single()

      if (newPanel) {
        // Copy dialogue blocks
        for (const dlg of (panel.dialogue_blocks || []).sort((a: any, b: any) => a.order - b.order)) {
          await supabase.from('dialogue_blocks').insert({
            panel_id: newPanel.id,
            order: dlg.order,
            speaker_id: dlg.speaker_id,
            speaker_name: dlg.speaker_name,
            delivery_type: dlg.delivery_type,
            delivery_instruction: dlg.delivery_instruction,
            balloon_number: dlg.balloon_number,
            text: dlg.text,
          })
        }
        // Copy captions
        for (const cap of (panel.captions || []).sort((a: any, b: any) => a.order - b.order)) {
          await supabase.from('captions').insert({
            panel_id: newPanel.id,
            order: cap.order,
            type: cap.type,
            text: cap.text,
          })
        }
      }
    }

    showToast('Page duplicated', 'success')
    recordAction({ type: 'page_duplicate', newPageId: newPage.id, sourcePageId: pageId, sceneId, description: 'Duplicate page' })
    await onRefresh()
    onSelectPage(newPage.id)
  }

  const duplicateScene = async (sceneId: string) => {
    const supabase = createClient()
    const location = findSceneLocation(sceneId)
    if (!location) { showToast('Scene not found', 'error'); return }
    const { actId } = location

    // Fetch full scene data with pages, panels, dialogue, captions
    const { data: sourceScene, error: fetchError } = await supabase
      .from('scenes')
      .select('*, pages(*, panels(*, dialogue_blocks(*), captions(*)))')
      .eq('id', sceneId)
      .single()

    if (fetchError || !sourceScene) {
      showToast(`Failed to fetch scene: ${fetchError?.message}`, 'error')
      return
    }

    // Bump sort_order for all subsequent scenes in this act
    const act = (issue.acts || []).find((a: any) => a.id === actId)
    const scenesAfter = (act?.scenes || []).filter((s: any) => s.sort_order > sourceScene.sort_order)
    if (scenesAfter.length > 0) {
      await Promise.all(scenesAfter.map((s: any) =>
        supabase.from('scenes').update({ sort_order: s.sort_order + 1 }).eq('id', s.id)
      ))
    }

    // Insert the new scene
    const { data: newScene, error: sceneError } = await supabase.from('scenes').insert({
      act_id: actId,
      title: sourceScene.title ? `${sourceScene.title} (copy)` : 'Untitled Scene (copy)',
      sort_order: sourceScene.sort_order + 1,
      plotline_id: sourceScene.plotline_id,
      location_id: sourceScene.location_id,
      target_page_count: sourceScene.target_page_count,
      notes: sourceScene.notes,
    }).select().single()

    if (sceneError || !newScene) {
      showToast(`Failed to duplicate scene: ${sceneError?.message}`, 'error')
      await onRefresh()
      return
    }

    // Deep copy all pages with their panels, dialogue, and captions
    const sortedPages = (sourceScene.pages || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
    for (const page of sortedPages) {
      const { data: newPage } = await supabase.from('pages').insert({
        scene_id: newScene.id,
        page_number: page.page_number,
        sort_order: page.sort_order,
        title: page.title,
        page_type: page.page_type,
        template: page.template,
        notes_to_artist: page.notes_to_artist,
        page_summary: page.page_summary,
      }).select().single()

      if (newPage) {
        for (const panel of (page.panels || []).sort((a: any, b: any) => a.order - b.order)) {
          const { data: newPanel } = await supabase.from('panels').insert({
            page_id: newPage.id,
            order: panel.order,
            visual_description: panel.visual_description,
            characters_present: panel.characters_present,
            location_id: panel.location_id,
            sfx: panel.sfx,
            panel_size: panel.panel_size,
            camera: panel.camera,
            notes_to_artist: panel.notes_to_artist,
            internal_notes: panel.internal_notes,
          }).select().single()

          if (newPanel) {
            for (const dlg of (panel.dialogue_blocks || []).sort((a: any, b: any) => a.order - b.order)) {
              await supabase.from('dialogue_blocks').insert({
                panel_id: newPanel.id,
                order: dlg.order,
                speaker_id: dlg.speaker_id,
                speaker_name: dlg.speaker_name,
                delivery_type: dlg.delivery_type,
                delivery_instruction: dlg.delivery_instruction,
                balloon_number: dlg.balloon_number,
                text: dlg.text,
              })
            }
            for (const cap of (panel.captions || []).sort((a: any, b: any) => a.order - b.order)) {
              await supabase.from('captions').insert({
                panel_id: newPanel.id,
                order: cap.order,
                type: cap.type,
                text: cap.text,
              })
            }
          }
        }
      }
    }

    const pageCount = sortedPages.length
    showToast(`Scene duplicated with ${pageCount} page${pageCount !== 1 ? 's' : ''}`, 'success')
    recordAction({ type: 'scene_duplicate', newSceneId: newScene.id, sourceSceneId: sceneId, actId, description: 'Duplicate scene' })
    await onRefresh()
  }

  const addPageAfter = async (pageId: string) => {
    const location = findPageLocation(pageId)
    if (!location) return
    const { sceneId } = location
    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const sourcePage = (scene?.pages || []).find((p: any) => p.id === pageId)
    if (!sourcePage) return

    const supabase = createClient()

    // Bump sort_order for all subsequent pages
    const pagesAfter = (scene?.pages || []).filter((p: any) => p.sort_order > sourcePage.sort_order)
    if (pagesAfter.length > 0) {
      await Promise.all(pagesAfter.map((p: any) =>
        supabase.from('pages').update({ sort_order: p.sort_order + 1 }).eq('id', p.id)
      ))
    }

    const allPages = issue.acts?.flatMap((a: any) =>
      a.scenes?.flatMap((s: any) => s.pages || []) || []
    ) || []

    const { data: newPage, error } = await supabase.from('pages').insert({
      scene_id: sceneId,
      page_number: allPages.length + 1,
      sort_order: sourcePage.sort_order + 1,
    }).select().single()

    if (error) {
      showToast(`Failed to add page: ${error.message}`, 'error')
      await onRefresh()
      return
    }

    showToast('Page added', 'success')
    if (newPage) {
      recordAction({ type: 'page_add', pageId: newPage.id, sceneId, data: { page_number: allPages.length + 1, sort_order: sourcePage.sort_order + 1 }, description: 'Add page' })
    }
    await onRefresh()
    if (newPage) onSelectPage(newPage.id)
  }

  const addSceneAfter = async (sceneId: string) => {
    const location = findSceneLocation(sceneId)
    if (!location) return
    const { actId } = location
    const act = (issue.acts || []).find((a: any) => a.id === actId)
    const sourceScene = (act?.scenes || []).find((s: any) => s.id === sceneId)
    if (!sourceScene) return

    const supabase = createClient()

    // Bump sort_order for subsequent scenes
    const scenesAfter = (act?.scenes || []).filter((s: any) => s.sort_order > sourceScene.sort_order)
    if (scenesAfter.length > 0) {
      await Promise.all(scenesAfter.map((s: any) =>
        supabase.from('scenes').update({ sort_order: s.sort_order + 1 }).eq('id', s.id)
      ))
    }

    const sceneCount = act?.scenes?.length || 0
    const { data: newScene, error } = await supabase.from('scenes').insert({
      act_id: actId,
      title: `Scene ${sceneCount + 1}`,
      sort_order: sourceScene.sort_order + 1,
    }).select().single()

    if (error) {
      showToast(`Failed to add scene: ${error.message}`, 'error')
      await onRefresh()
      return
    }

    showToast('Scene added', 'success')
    if (newScene) {
      recordAction({ type: 'scene_add', sceneId: newScene.id, actId, data: { title: `Scene ${sceneCount + 1}`, sort_order: sourceScene.sort_order + 1 }, description: 'Add scene' })
    }
    await onRefresh()
    if (newScene) {
      setExpandedScenes(new Set([...expandedScenes, newScene.id]))
    }
  }

  // --- Drag-and-drop handlers ---

  const handleActDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const sortedActsLocal = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
    const previousOrder = sortedActsLocal.map((a) => ({ id: a.id, sort_order: a.sort_order }))
    const oldIndex = sortedActsLocal.findIndex((a) => a.id === active.id)
    const newIndex = sortedActsLocal.findIndex((a) => a.id === over.id)

    const reordered = arrayMove(sortedActsLocal, oldIndex, newIndex)

    // Optimistic update - update local state immediately
    const reorderedWithSortOrder = reordered.map((act, index) => ({
      ...act,
      sort_order: index + 1,
    }))
    setIssue((prev: any) => ({
      ...prev,
      acts: reorderedWithSortOrder,
    }))

    // Then persist to database
    const supabase = createClient()
    const updates = reordered.map((act, index) =>
      supabase.from('acts').update({ sort_order: index + 1 }).eq('id', act.id).select('id, sort_order')
    )
    const results = await Promise.all(updates)
    const errors = results.filter(r => r.error)
    const successCount = results.filter(r => r.data && r.data.length > 0).length

    if (errors.length > 0) {
      showToast(`Failed to reorder acts: ${errors[0].error?.message}`, 'error')
      await onRefresh()
      return
    }
    if (successCount === 0) {
      showToast('No acts were updated - check permissions', 'error')
      await onRefresh()
      return
    }
    const newOrder = reorderedWithSortOrder.map((a) => ({ id: a.id, sort_order: a.sort_order }))
    recordAction({ type: 'act_reorder', issueId: issue.id, previousOrder, newOrder, description: 'Reorder acts' })
    showToast('Acts reordered', 'success')
  }

  const handleSceneDragEnd = async (actId: string, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const act = issue.acts?.find((a: any) => a.id === actId)
    const sortedScenes = [...(act?.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    const previousOrder = sortedScenes.map((s: any) => ({ id: s.id, sort_order: s.sort_order }))
    const oldIndex = sortedScenes.findIndex((s: any) => s.id === active.id)
    const newIndex = sortedScenes.findIndex((s: any) => s.id === over.id)

    const reordered = arrayMove(sortedScenes, oldIndex, newIndex)

    // Optimistic update - update local state immediately
    const reorderedWithSortOrder = reordered.map((scene: any, index: number) => ({
      ...scene,
      sort_order: index + 1,
    }))
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) =>
        a.id === actId ? { ...a, scenes: reorderedWithSortOrder } : a
      ),
    }))

    // Then persist to database
    const supabase = createClient()
    const updates = reordered.map((scene: any, index: number) =>
      supabase.from('scenes').update({ sort_order: index + 1 }).eq('id', scene.id).select('id, sort_order')
    )
    const results = await Promise.all(updates)
    const errors = results.filter(r => r.error)
    const successCount = results.filter(r => r.data && r.data.length > 0).length

    if (errors.length > 0) {
      showToast(`Failed to reorder scenes: ${errors[0].error?.message}`, 'error')
      await onRefresh()
      return
    }
    if (successCount === 0) {
      showToast('No scenes were updated - check permissions', 'error')
      await onRefresh()
      return
    }
    const newOrder = reorderedWithSortOrder.map((s: any) => ({ id: s.id, sort_order: s.sort_order }))
    recordAction({ type: 'scene_reorder', actId, previousOrder, newOrder, description: 'Reorder scenes' })
    showToast('Scenes reordered', 'success')
  }

  const handlePageDragEnd = async (sceneId: string, event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const sortedPages = [...(scene?.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    const previousOrder = sortedPages.map((p: any) => ({ id: p.id, sort_order: p.sort_order }))
    const oldIndex = sortedPages.findIndex((p: any) => p.id === active.id)
    const newIndex = sortedPages.findIndex((p: any) => p.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      showToast('Could not find pages to reorder', 'error')
      return
    }

    const reordered = arrayMove(sortedPages, oldIndex, newIndex)

    // Optimistic update - update local state immediately
    const reorderedWithSortOrder = reordered.map((page: any, index: number) => ({
      ...page,
      sort_order: index + 1,
    }))
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).map((s: any) =>
          s.id === sceneId ? { ...s, pages: reorderedWithSortOrder } : s
        ),
      })),
    }))

    // Then persist to database
    const supabase = createClient()
    const updates = reordered.map((page: any, index: number) =>
      supabase
        .from('pages')
        .update({ sort_order: index + 1 })
        .eq('id', page.id)
        .select('id, sort_order')
    )

    const results = await Promise.all(updates)
    const errors = results.filter(r => r.error)
    const successCount = results.filter(r => r.data && r.data.length > 0).length

    if (errors.length > 0) {
      showToast(`Failed to update ${errors.length} page(s): ${errors[0].error?.message}`, 'error')
      await onRefresh()
      return
    }

    if (successCount === 0) {
      showToast('No pages were updated - check permissions', 'error')
      await onRefresh()
      return
    }

    const newOrder = reorderedWithSortOrder.map((p: any) => ({ id: p.id, sort_order: p.sort_order }))
    recordAction({ type: 'page_reorder', sceneId, previousOrder, newOrder, description: 'Reorder pages' })
    showToast(`Reordered ${successCount} pages`, 'success')
  }

  const movePageToScene = async (pageId: string, targetSceneId: string, insertBeforePageId?: string) => {
    const supabase = createClient()

    // Get source scene info for undo
    let fromSceneId: string | null = null
    let fromSortOrder = 0
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = (scene.pages || []).find((p: any) => p.id === pageId)
        if (page) {
          fromSceneId = scene.id
          fromSortOrder = page.sort_order
          break
        }
      }
      if (fromSceneId) break
    }
    const fromScenePreviousOrders = fromSceneId
      ? (issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === fromSceneId)?.pages || [])
          .map((p: any) => ({ id: p.id, sort_order: p.sort_order }))
      : []

    // Get target scene to calculate new sort_order
    const targetScene = issue.acts?.flatMap((a: any) => a.scenes || [])
      .find((s: any) => s.id === targetSceneId)

    if (!targetScene) {
      showToast('Target scene not found', 'error')
      return
    }

    const toScenePreviousOrders = (targetScene.pages || []).map((p: any) => ({ id: p.id, sort_order: p.sort_order }))
    const existingPages = [...(targetScene.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

    // Calculate insertion index: before the target page, or at end
    let insertIndex = existingPages.length // default: append to end
    if (insertBeforePageId) {
      const targetIdx = existingPages.findIndex((p: any) => p.id === insertBeforePageId)
      if (targetIdx !== -1) insertIndex = targetIdx
    }

    // Move the page into the list at the insertion point
    const { error, data } = await supabase
      .from('pages')
      .update({
        scene_id: targetSceneId,
        sort_order: insertIndex + 1, // temporary, will be recalculated
      })
      .eq('id', pageId)
      .select('id, scene_id, sort_order')

    if (error) {
      showToast(`Failed to move page: ${error.message}`, 'error')
      return
    }

    // Verify the update actually happened
    if (!data || data.length === 0) {
      showToast('Move failed - no rows updated (check permissions)', 'error')
      return
    }

    // Verify the scene_id was actually changed
    if (data[0].scene_id !== targetSceneId) {
      showToast(`Move failed - page still in original scene`, 'error')
      return
    }

    // Optimistic update - move the page in local state at the correct position
    setIssue((prev: any) => {
      // Find and remove the page from its current scene
      let movedPage: any = null
      const updatedActs = prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).map((s: any) => {
          const pageInScene = (s.pages || []).find((p: any) => p.id === pageId)
          if (pageInScene) {
            movedPage = { ...pageInScene, scene_id: targetSceneId }
            return { ...s, pages: s.pages.filter((p: any) => p.id !== pageId) }
          }
          return s
        }),
      }))

      // Insert the page at the correct position in the target scene
      if (movedPage) {
        return {
          ...prev,
          acts: updatedActs.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) => {
              if (s.id !== targetSceneId) return s
              const sorted = [...(s.pages || [])].sort((x: any, y: any) => x.sort_order - y.sort_order)
              sorted.splice(insertIndex, 0, movedPage)
              // Recalculate sort_order for all pages in this scene
              const renumbered = sorted.map((p: any, i: number) => ({ ...p, sort_order: i + 1 }))
              return { ...s, pages: renumbered }
            }),
          })),
        }
      }
      return prev
    })

    // Recalculate sort_order for all pages in the target scene in the database
    // (the moved page may have displaced others)
    const refreshedScene = issue.acts?.flatMap((a: any) => a.scenes || [])
      .find((s: any) => s.id === targetSceneId)
    if (refreshedScene) {
      const allPages = [...(refreshedScene.pages || [])].filter((p: any) => p.id !== pageId)
      allPages.splice(insertIndex, 0, { id: pageId })
      const sortUpdates = allPages.map((p: any, i: number) =>
        supabase.from('pages').update({ sort_order: i + 1 }).eq('id', p.id)
      )
      await Promise.all(sortUpdates)
    }

    // Expand the target scene so user can see the moved page
    setExpandedScenes(new Set([...expandedScenes, targetSceneId]))
    // Also expand the act containing the target scene
    const targetAct = issue.acts?.find((a: any) =>
      a.scenes?.some((s: any) => s.id === targetSceneId)
    )
    if (targetAct) {
      setExpandedActs(new Set([...expandedActs, targetAct.id]))
    }
    showToast('Page moved successfully', 'success')

    // Record undo action for page move
    if (fromSceneId) {
      recordAction({
        type: 'page_move',
        pageId,
        fromSceneId,
        toSceneId: targetSceneId,
        fromSortOrder,
        toSortOrder: insertIndex + 1,
        fromScenePreviousOrders,
        toScenePreviousOrders,
        description: 'Move page',
      })
    }

    // Refresh to ensure state is fully synced after move
    await onRefresh()
  }

  // Move scene to a different act
  const moveSceneToAct = async (sceneId: string, targetActId: string, insertBeforeSceneId?: string) => {
    const supabase = createClient()
    const sourceLocation = findSceneLocation(sceneId)
    if (!sourceLocation) {
      showToast('Scene not found', 'error')
      return
    }

    // If same act, do nothing
    if (sourceLocation.actId === targetActId) return

    // Capture source scene's sort_order for undo
    const fromActId = sourceLocation.actId
    const sourceAct = (issue.acts || []).find((a: any) => a.id === fromActId)
    const sourceScene = (sourceAct?.scenes || []).find((s: any) => s.id === sceneId)
    const fromSortOrder = sourceScene?.sort_order ?? 0
    const fromActPreviousOrders = (sourceAct?.scenes || []).map((s: any) => ({ id: s.id, sort_order: s.sort_order }))

    // Get target act to calculate insertion position
    const targetAct = (issue.acts || []).find((a: any) => a.id === targetActId)
    if (!targetAct) {
      showToast('Target act not found', 'error')
      return
    }

    const toActPreviousOrders = (targetAct.scenes || []).map((s: any) => ({ id: s.id, sort_order: s.sort_order }))
    const existingScenes = [...(targetAct.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

    // Calculate insertion index: before the target scene, or at end
    let insertIndex = existingScenes.length // default: append to end
    if (insertBeforeSceneId) {
      const targetIdx = existingScenes.findIndex((s: any) => s.id === insertBeforeSceneId)
      if (targetIdx !== -1) insertIndex = targetIdx
    }

    const { error, data } = await supabase
      .from('scenes')
      .update({
        act_id: targetActId,
        sort_order: insertIndex + 1,
      })
      .eq('id', sceneId)
      .select('id, act_id, sort_order')

    if (error) {
      showToast(`Failed to move scene: ${error.message}`, 'error')
      return
    }

    if (!data || data.length === 0) {
      showToast('Move failed - no rows updated (check permissions)', 'error')
      return
    }

    // Optimistic update - move the scene in local state at the correct position
    setIssue((prev: any) => {
      let movedScene: any = null
      // Remove from source act
      const updatedActs = prev.acts.map((a: any) => {
        if (a.id === sourceLocation.actId) {
          movedScene = (a.scenes || []).find((s: any) => s.id === sceneId)
          if (movedScene) {
            movedScene = { ...movedScene, act_id: targetActId }
          }
          return { ...a, scenes: (a.scenes || []).filter((s: any) => s.id !== sceneId) }
        }
        return a
      })

      // Insert at the correct position in the target act
      if (movedScene) {
        return {
          ...prev,
          acts: updatedActs.map((a: any) => {
            if (a.id !== targetActId) return a
            const sorted = [...(a.scenes || [])].sort((x: any, y: any) => x.sort_order - y.sort_order)
            sorted.splice(insertIndex, 0, movedScene)
            // Recalculate sort_order for all scenes in this act
            const renumbered = sorted.map((s: any, i: number) => ({ ...s, sort_order: i + 1 }))
            return { ...a, scenes: renumbered }
          }),
        }
      }
      return prev
    })

    // Recalculate sort_order for all scenes in the target act in the database
    const allScenes = [...existingScenes.filter((s: any) => s.id !== sceneId)]
    allScenes.splice(insertIndex, 0, { id: sceneId })
    const sortUpdates = allScenes.map((s: any, i: number) =>
      supabase.from('scenes').update({ sort_order: i + 1 }).eq('id', s.id)
    )
    await Promise.all(sortUpdates)

    // Expand the target act
    setExpandedActs(new Set([...expandedActs, targetActId]))
    showToast('Scene moved successfully', 'success')

    // Record undo action for scene move
    recordAction({
      type: 'scene_move',
      sceneId,
      fromActId,
      toActId: targetActId,
      fromSortOrder,
      toSortOrder: insertIndex + 1,
      fromActPreviousOrders,
      toActPreviousOrders,
      description: 'Move scene',
    })

    // Refresh to ensure state is fully synced after move
    await onRefresh()
  }

  // Unified drag handlers for cross-container drag-and-drop
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const itemId = active.id as string
    const itemType = getItemType(itemId)

    if (!itemType) return

    // If dragging an item that's not in the selection, clear selection
    // and drag just that item (standard OS behavior)
    if (selectedIds.size > 0 && !selectedIds.has(itemId)) {
      clearSelection()
    }

    let sourceId = ''
    if (itemType === 'page') {
      const loc = findPageLocation(itemId)
      sourceId = loc?.sceneId || ''
    } else if (itemType === 'scene') {
      const loc = findSceneLocation(itemId)
      sourceId = loc?.actId || ''
    } else {
      sourceId = 'root'
    }

    setActiveDragItem({ id: itemId, type: itemType, sourceId })
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over, active } = event
    if (!over || !activeDragItem) {
      setDragOverContainerId(null)
      return
    }

    const overId = over.id as string
    const overType = getItemType(overId)

    // Determine valid drop container based on what's being dragged
    if (activeDragItem.type === 'page') {
      // Pages can drop on other pages, scene headers, or act headers
      if (overType === 'page') {
        const overLocation = findPageLocation(overId)
        setDragOverContainerId(overLocation?.sceneId || null)
      } else if (overType === 'scene') {
        setDragOverContainerId(overId)
      } else if (overType === 'act') {
        // Can drop page on act (will move to first scene or create one)
        setDragOverContainerId(overId)
      } else {
        setDragOverContainerId(null)
      }
    } else if (activeDragItem.type === 'scene') {
      // Scenes can drop on other scenes (same/different act) or on act headers
      if (overType === 'scene') {
        const overLocation = findSceneLocation(overId)
        setDragOverContainerId(overLocation?.actId || null)
      } else if (overType === 'act') {
        setDragOverContainerId(overId)
      } else {
        setDragOverContainerId(null)
      }
    } else {
      setDragOverContainerId(null)
    }
  }

  const handleUnifiedDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const dragItem = activeDragItem

    // Clear drag state
    setActiveDragItem(null)
    setDragOverContainerId(null)

    if (!over || !dragItem || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string
    const overType = getItemType(overId)

    if (dragItem.type === 'act') {
      // Reorder acts
      await handleActDragEnd(event)
    } else if (dragItem.type === 'scene') {
      const sourceLocation = findSceneLocation(activeId)
      if (!sourceLocation) return

      // Collect all scene IDs to move (multi-selected or just the dragged one)
      const sceneIdsToMove = (selectedIds.size > 1 && selectedIds.has(activeId) && selectionType === 'scene')
        ? (() => {
            const ids = Array.from(selectedIds)
            const visibleIds = getVisibleItemIds('scene')
            ids.sort((a, b) => visibleIds.indexOf(a) - visibleIds.indexOf(b))
            return ids
          })()
        : [activeId]

      if (overType === 'act') {
        // Move scene(s) to target act
        for (const id of sceneIdsToMove) {
          const loc = findSceneLocation(id)
          if (loc && loc.actId !== overId) {
            await moveSceneToAct(id, overId)
          }
        }
        if (sceneIdsToMove.length > 1) clearSelection()
      } else if (overType === 'scene') {
        const overLocation = findSceneLocation(overId)
        if (!overLocation) return

        if (sceneIdsToMove.length === 1) {
          // Single scene — use existing logic
          if (sourceLocation.actId === overLocation.actId) {
            await handleSceneDragEnd(sourceLocation.actId, event)
          } else {
            await moveSceneToAct(activeId, overLocation.actId)
          }
        } else {
          // Multi-scene: move all to target act
          for (const id of sceneIdsToMove) {
            const loc = findSceneLocation(id)
            if (loc && loc.actId !== overLocation.actId) {
              await moveSceneToAct(id, overLocation.actId)
            }
          }
          clearSelection()
        }
      }
    } else if (dragItem.type === 'page') {
      const sourceLocation = findPageLocation(activeId)
      if (!sourceLocation) return

      // Collect all page IDs to move (either multi-selected or just the dragged one)
      // Sort by visual position to maintain relative order during multi-drop
      const pageIdsToMove = (selectedIds.size > 1 && selectedIds.has(activeId) && selectionType === 'page')
        ? (() => {
            const ids = Array.from(selectedIds)
            const visibleIds = getVisibleItemIds('page')
            ids.sort((a, b) => visibleIds.indexOf(a) - visibleIds.indexOf(b))
            return ids
          })()
        : [activeId]

      if (overType === 'page') {
        const overLocation = findPageLocation(overId)
        if (!overLocation) return

        if (pageIdsToMove.length === 1) {
          // Single page — use existing logic
          if (sourceLocation.sceneId === overLocation.sceneId) {
            await handlePageDragEnd(sourceLocation.sceneId, event)
          } else {
            await movePageToScene(activeId, overLocation.sceneId, overId)
          }
        } else {
          // Multi-page drop — move all to target scene
          for (const id of pageIdsToMove) {
            if (id !== overId) {
              await movePageToScene(id, overLocation.sceneId)
            }
          }
          clearSelection()
        }
      } else if (overType === 'scene') {
        if (pageIdsToMove.length === 1) {
          if (sourceLocation.sceneId !== overId) {
            await movePageToScene(activeId, overId)
          }
        } else {
          for (const id of pageIdsToMove) {
            await movePageToScene(id, overId)
          }
          clearSelection()
        }
      } else if (overType === 'act') {
        // Keep existing act drop logic but apply to all selected pages
        const targetAct = (issue.acts || []).find((a: any) => a.id === overId)
        if (!targetAct) return

        const targetScenes = (targetAct.scenes || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
        let targetSceneId = targetScenes[0]?.id

        if (!targetSceneId) {
          const supabase = createClient()
          const { data: newScene, error: sceneError } = await supabase
            .from('scenes').insert({ act_id: overId, title: 'Scene 1', sort_order: 1 }).select().single()
          if (sceneError || !newScene) {
            showToast('Failed to create scene for page move', 'error')
            return
          }
          setIssue((prev: any) => ({
            ...prev,
            acts: prev.acts.map((a: any) => a.id === overId
              ? { ...a, scenes: [...(a.scenes || []), { ...newScene, pages: [] }] }
              : a
            ),
          }))
          targetSceneId = newScene.id
        }

        for (const id of pageIdsToMove) {
          await movePageToScene(id, targetSceneId)
        }
        if (pageIdsToMove.length > 1) clearSelection()
      }
    }
  }

  // --- Computed values ---

  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
  const actGroups = selectionType === 'act' && selectedIds.size > 0
    ? getSelectionGroups(selectedIds, sortedActs.map((a: any) => a.id))
    : new Map<string, GroupPosition>()

  // Calculate global page position map (page.id -> position number across entire issue)
  const pagePositionMap = useMemo(() => {
    const map = new Map<string, number>()
    let position = 1
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
  }, [sortedActs])

  // Helper to get display name for a page
  const getPageDisplayName = (page: any) => {
    const position = pagePositionMap.get(page.id) || '?'
    const hasCustomTitle = page.title && !page.title.match(/^Page \d+$/i)
    if (hasCustomTitle) {
      return `Page ${position}: ${page.title}`
    }
    return `Page ${position}`
  }

  // --- Context menu handlers ---

  const handleContextMenu = (
    e: React.MouseEvent,
    type: 'act' | 'scene' | 'page',
    id: string,
    title: string
  ) => {
    e.preventDefault()
    e.stopPropagation()
    // If right-clicking an item not in the current selection, clear selection
    if (selectedIds.size > 0 && !selectedIds.has(id)) {
      clearSelection()
    }
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, title })
    setContextSubmenu(null)
  }

  const closeContextMenu = () => {
    setContextMenu(null)
    setContextSubmenu(null)
  }

  // --- Batch actions ---

  const handleBatchDelete = useCallback(async () => {
    if (!selectionType || selectedIds.size === 0) return

    const count = selectedIds.size
    const typeLabel = selectionType === 'page' ? 'page' : selectionType === 'scene' ? 'scene' : 'act'
    const description = selectionType === 'page'
      ? `This will permanently delete all panels on these pages.`
      : selectionType === 'scene'
        ? `This will permanently delete all pages and panels in these scenes.`
        : `This will permanently delete all scenes, pages, and panels in these acts.`

    const confirmed = await confirm({
      title: `Delete ${count} ${typeLabel}${count !== 1 ? 's' : ''}?`,
      description,
    })
    if (!confirmed) return

    const supabase = createClient()
    const ids = Array.from(selectedIds)

    if (selectionType === 'page') {
      const result = await batchDeletePages(supabase, ids, issue)
      if (!result.success) {
        showToast(`Failed to delete pages: ${result.error}`, 'error')
        await onRefresh()
        return
      }

      // Deselect deleted pages
      if (selectedPageId && ids.includes(selectedPageId)) {
        onSelectPage('')
      }

      // Optimistic UI update
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => ({
          ...a,
          scenes: (a.scenes || []).map((s: any) => ({
            ...s,
            pages: (s.pages || []).filter((p: any) => !ids.includes(p.id)),
          })),
        })),
      }))

      // Record batch undo
      recordAction({
        type: 'batch_page_delete',
        items: result.deletedItems.map(item => ({ pageId: item.id, sceneId: item.parentId, data: item.data })),
        description: `Delete ${count} pages`,
      })
    } else if (selectionType === 'scene') {
      const result = await batchDeleteScenes(supabase, ids, issue)
      if (!result.success) {
        showToast(`Failed to delete scenes: ${result.error}`, 'error')
        await onRefresh()
        return
      }

      // Deselect if current page was in deleted scenes
      const deletedPageIds = new Set<string>()
      for (const act of issue.acts || []) {
        for (const scene of act.scenes || []) {
          if (ids.includes(scene.id)) {
            for (const page of scene.pages || []) {
              deletedPageIds.add(page.id)
            }
          }
        }
      }
      if (selectedPageId && deletedPageIds.has(selectedPageId)) {
        onSelectPage('')
      }

      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => ({
          ...a,
          scenes: (a.scenes || []).filter((s: any) => !ids.includes(s.id)),
        })),
      }))

      recordAction({
        type: 'batch_scene_delete',
        items: result.deletedItems.map(item => ({ sceneId: item.id, actId: item.parentId, data: item.data })),
        description: `Delete ${count} scenes`,
      })
    } else if (selectionType === 'act') {
      const result = await batchDeleteActs(supabase, ids, issue)
      if (!result.success) {
        showToast(`Failed to delete acts: ${result.error}`, 'error')
        await onRefresh()
        return
      }

      // Deselect if current page was in deleted acts
      const deletedPageIds = new Set<string>()
      for (const act of issue.acts || []) {
        if (ids.includes(act.id)) {
          for (const scene of act.scenes || []) {
            for (const page of scene.pages || []) {
              deletedPageIds.add(page.id)
            }
          }
        }
      }
      if (selectedPageId && deletedPageIds.has(selectedPageId)) {
        onSelectPage('')
      }

      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.filter((a: any) => !ids.includes(a.id)),
      }))

      recordAction({
        type: 'batch_act_delete',
        items: result.deletedItems.map(item => ({ actId: item.id, issueId: item.parentId, data: item.data })),
        description: `Delete ${count} acts`,
      })
    }

    clearSelection()
    showToast(`Deleted ${count} ${typeLabel}${count !== 1 ? 's' : ''}`, 'success')
  }, [selectionType, selectedIds, issue, selectedPageId, onSelectPage, setIssue, onRefresh, clearSelection, showToast, recordAction, confirm])

  const handleBatchMove = () => {
    setShowMovePopover(prev => !prev)
  }

  const handleBatchDuplicate = async () => {
    if (!selectionType || selectedIds.size === 0) return

    // Sort IDs by visual position to maintain relative order
    const ids = Array.from(selectedIds)
    const visibleIds = getVisibleItemIds(selectionType)
    ids.sort((a, b) => visibleIds.indexOf(a) - visibleIds.indexOf(b))
    const count = ids.length

    if (selectionType === 'page') {
      for (const id of ids) {
        await duplicatePage(id)
      }
    } else if (selectionType === 'scene') {
      for (const id of ids) {
        await duplicateScene(id)
      }
    }
    // Acts don't have duplicate in the existing system

    clearSelection()
    showToast(`Duplicated ${count} ${selectionType}${count !== 1 ? 's' : ''}`, 'success')
  }

  // Batch delete on Delete/Backspace when items selected
  useEffect(() => {
    if (selectedIds.size < 2) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't trigger when editing text
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        e.preventDefault()
        handleBatchDelete()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds.size, handleBatchDelete])

  const isContextMenuItemMultiSelected = contextMenu && selectedIds.has(contextMenu.id) && selectedIds.size > 1

  // --- Render ---

  return (
    <div className="p-3 select-none">
      <ConfirmDialog {...dialogProps} />
      <div className="flex items-center justify-between mb-3">
        <h3 className="type-label">STRUCTURE</h3>
        <button
          onClick={addAct}
          className="type-micro text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          title="Add act"
        >
          + Act
        </button>
      </div>

      {sortedActs.length === 0 ? (
        <div className="text-center py-8 px-4">
          <p className="type-label mb-2">No structure yet</p>
          <p className="type-meta mb-4">Acts organize your issue into beginning, middle, and end.</p>
          <button
            onClick={addAct}
            className="type-micro border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] px-3 py-1.5 active:scale-[0.97] transition-all duration-150 ease-out"
          >
            Create First Act
          </button>
        </div>
      ) : !isMounted ? (
        // Simple render during SSR to avoid hydration mismatch
        <div className="space-y-0.5">
          {sortedActs.map((act: any) => {
            const actPageCount = (act.scenes || []).reduce(
              (sum: number, s: any) => sum + (s.pages?.length || 0), 0
            )
            return (
              <div key={act.id}>
                <div className="flex items-center gap-2 px-2 py-2 hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors">
                  <ChevronRight className={`w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${expandedActs.has(act.id) ? 'rotate-90' : ''}`} />
                  <span className="text-sm font-extrabold uppercase tracking-tight text-[var(--text-primary)] flex-1">
                    {act.name || `Act ${act.number}`}
                  </span>
                  <span className="type-micro tabular-nums text-[var(--text-muted)]">{actPageCount} pg</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <DndContext
          id="unified-navigation-dnd"
          sensors={sensors}
          collisionDetection={hierarchyAwareCollision}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleUnifiedDragEnd}
        >
          <SortableContext items={sortedActs.map(a => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {sortedActs.map((act: any) => {
                const sortedScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
                const actPageCount = sortedScenes.reduce(
                  (sum: number, s: any) => sum + (s.pages?.length || 0), 0
                )
                const sceneGroups = selectionType === 'scene' && selectedIds.size > 0
                  ? getSelectionGroups(selectedIds, sortedScenes.map((s: any) => s.id))
                  : new Map<string, GroupPosition>()

                return (
                  <SortableItem key={act.id} id={act.id} isPartOfMultiDrag={!!(activeDragItem && selectedIds.size > 1 && selectedIds.has(act.id) && activeDragItem.id !== act.id)}>
                    <div>
                      {/* Act Header */}
                      <div
                        className={`flex items-center gap-2 py-2 cursor-pointer transition-colors group ${
                          dragOverContainerId === act.id && (activeDragItem?.type === 'scene' || activeDragItem?.type === 'page') ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
                        } ${actGroups.has(act.id)
                            ? `px-2 ${selectionGroupClass(actGroups.get(act.id), 'act')}`
                            : 'px-2 hover:bg-[var(--bg-secondary)]'
                        }`}
                        onClick={(e) => {
                          if (editingItemId) return
                          if (e.metaKey || e.ctrlKey || e.shiftKey) {
                            handleMultiSelectClick(act.id, 'act', e)
                          } else {
                            clearSelection()
                            toggleAct(act.id)
                          }
                        }}
                        onContextMenu={(e) => handleContextMenu(e, 'act', act.id, act.name || `Act ${act.number}`)}
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${expandedActs.has(act.id) ? 'rotate-90' : ''}`} />
                        {editingItemId === act.id ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingItemTitle}
                            onChange={(e) => setEditingItemTitle(e.target.value)}
                            onBlur={() => saveTitle()}
                            onKeyDown={handleEditKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] px-1 py-0.5 type-label focus:border-[var(--color-primary)] focus:outline-none"
                            style={{ fontSize: '0.8125rem' }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="type-label text-[var(--text-primary)] flex-1"
                            style={{ fontSize: '0.8125rem' }}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              startEditing(act.id, act.name || `Act ${act.number}`)
                            }}
                          >
                            {act.name || `Act ${act.number}`}
                          </span>
                        )}
                        <span className="ml-auto type-micro tabular-nums text-[var(--text-muted)]">{actPageCount} pg</span>
                        <button
                          data-context-trigger
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (contextMenu?.id === act.id && contextMenu?.type === 'act') {
                              closeContextMenu()
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setContextMenu({ x: rect.left, y: rect.bottom, type: 'act', id: act.id, title: act.name || `Act ${act.number}` })
                              setContextSubmenu(null)
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--bg-tertiary)] transition-opacity text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          aria-label="Act options"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>
                        </button>
                      </div>

                      {/* Expanded Act Content */}
                      <div className={`collapse-target ${expandedActs.has(act.id) ? 'expanded' : ''}`}>
                        <div>
                          <SortableContext items={sortedScenes.map((s: any) => s.id)} strategy={verticalListSortingStrategy}>
                            {sortedScenes.map((scene: any) => {
                              const sortedPages = [...(scene.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
                              const scenePageCount = sortedPages.length
                              const pageGroups = selectionType === 'page' && selectedIds.size > 0
                                ? getSelectionGroups(selectedIds, sortedPages.map((p: any) => p.id))
                                : new Map<string, GroupPosition>()

                              return (
                                <SortableItem key={scene.id} id={scene.id} isPartOfMultiDrag={!!(activeDragItem && selectedIds.size > 1 && selectedIds.has(scene.id) && activeDragItem.id !== scene.id)}>
                                  <div>
                                    {/* Scene Header */}
                                    <div
                                      className={`flex items-center gap-2 pr-2 py-1.5 cursor-pointer transition-colors group ${
                                        dragOverContainerId === scene.id && activeDragItem?.type === 'page' ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
                                      } ${sceneGroups.has(scene.id)
                                          ? `pl-2 ${selectionGroupClass(sceneGroups.get(scene.id), 'scene')}`
                                          : 'pl-6 hover:bg-[var(--bg-secondary)]'
                                      }`}
                                      style={{ borderLeft: `3px solid ${scene.plotline?.color || 'transparent'}` }}
                                      onClick={(e) => {
                                        if (editingItemId) return
                                        if (e.metaKey || e.ctrlKey || e.shiftKey) {
                                          handleMultiSelectClick(scene.id, 'scene', e)
                                        } else {
                                          clearSelection()
                                          toggleScene(scene.id)
                                        }
                                      }}
                                      onContextMenu={(e) => handleContextMenu(e, 'scene', scene.id, scene.title || 'Untitled Scene')}
                                    >
                                      <ChevronRight className={`w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0 transition-transform duration-150 ${expandedScenes.has(scene.id) ? 'rotate-90' : ''}`} />
                                      {editingItemId === scene.id ? (
                                        <input
                                          ref={editInputRef}
                                          type="text"
                                          value={editingItemTitle}
                                          onChange={(e) => setEditingItemTitle(e.target.value)}
                                          onBlur={() => saveTitle()}
                                          onKeyDown={handleEditKeyDown}
                                          onClick={(e) => e.stopPropagation()}
                                          className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] px-1 py-0.5 text-xs font-bold focus:border-[var(--color-primary)] focus:outline-none"
                                          autoFocus
                                        />
                                      ) : (
                                        <span
                                          className="text-xs font-bold text-[var(--text-primary)] flex-1 truncate"
                                          onDoubleClick={(e) => {
                                            e.stopPropagation()
                                            startEditing(scene.id, scene.title || 'Untitled Scene')
                                          }}
                                        >
                                          {scene.title || 'Untitled Scene'}
                                        </span>
                                      )}
                                      <span className="ml-auto type-micro tabular-nums text-[var(--text-muted)]">{scenePageCount} pg</span>
                                      <button
                                        data-context-trigger
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (contextMenu?.id === scene.id && contextMenu?.type === 'scene') {
                                            closeContextMenu()
                                          } else {
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            setContextMenu({ x: rect.left, y: rect.bottom, type: 'scene', id: scene.id, title: scene.title || 'Untitled Scene' })
                                            setContextSubmenu(null)
                                          }
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--bg-tertiary)] transition-opacity text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                        aria-label="Scene options"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>
                                      </button>
                                    </div>

                                    {/* Expanded Scene Content - Pages */}
                                    <div className={`collapse-target ${expandedScenes.has(scene.id) ? 'expanded' : ''}`}>
                                      <div>
                                        <SortableContext items={sortedPages.map((p: any) => p.id)} strategy={verticalListSortingStrategy}>
                                          {sortedPages.map((page: any) => {
                                            const panelCount = page.panels?.length || 0
                                            const isSelected = selectedPageId === page.id
                                            const hasVisibleSummary = !!(editingPageSummaryId === page.id || page.page_summary || (page.panels || []).length > 0)

                                            return (
                                              <SortableItem key={page.id} id={page.id} isPartOfMultiDrag={!!(activeDragItem && selectedIds.size > 1 && selectedIds.has(page.id) && activeDragItem.id !== page.id)}>
                                                <div
                                                  onClick={(e) => {
                                                    if (editingItemId) return
                                                    const handled = handleMultiSelectClick(page.id, 'page', e)
                                                    if (!handled) {
                                                      onSelectPage(page.id)
                                                    }
                                                  }}
                                                  onContextMenu={(e) => handleContextMenu(e, 'page', page.id, page.title || '')}
                                                  className={`flex items-center gap-2 pr-2 py-1 cursor-pointer transition-colors group ${
                                                    pageGroups.has(page.id)
                                                      ? `pl-3 ${selectionGroupClass(pageGroups.get(page.id), 'page', hasVisibleSummary)}`
                                                      : isSelected && selectedIds.size === 0
                                                        ? 'pl-10 bg-[var(--color-primary)] text-white'
                                                        : 'pl-10 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]'
                                                  }`}
                                                >
                                                  {editingItemId === page.id ? (
                                                    <input
                                                      ref={editInputRef}
                                                      type="text"
                                                      value={editingItemTitle}
                                                      onChange={(e) => setEditingItemTitle(e.target.value)}
                                                      onBlur={() => saveTitle()}
                                                      onKeyDown={handleEditKeyDown}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] px-1 py-0.5 text-xs focus:border-[var(--color-primary)] focus:outline-none text-[var(--text-primary)]"
                                                      autoFocus
                                                    />
                                                  ) : (
                                                    <span className="text-xs flex-1 truncate">
                                                      <span className="font-bold">{`Page ${pagePositionMap.get(page.id) || '?'}`}</span>
                                                      {page.title && !page.title.match(/^Page \d+$/i) && (
                                                        <span className="font-normal text-[var(--text-muted)]">: {page.title}</span>
                                                      )}
                                                    </span>
                                                  )}
                                                  <span className={`type-micro tabular-nums ${isSelected && selectedIds.size === 0 ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                                                    {panelCount} pnl
                                                  </span>
                                                  <button
                                                    data-context-trigger
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      if (contextMenu?.id === page.id && contextMenu?.type === 'page') {
                                                        closeContextMenu()
                                                      } else {
                                                        const rect = e.currentTarget.getBoundingClientRect()
                                                        setContextMenu({ x: rect.left, y: rect.bottom, type: 'page', id: page.id, title: page.title || '' })
                                                        setContextSubmenu(null)
                                                      }
                                                    }}
                                                    className={`opacity-0 group-hover:opacity-100 p-0.5 transition-opacity ${
                                                      isSelected && selectedIds.size === 0
                                                        ? 'hover:bg-white/20 text-white/60 hover:text-white'
                                                        : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                                    }`}
                                                    aria-label="Page options"
                                                  >
                                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>
                                                  </button>
                                                </div>
                                                {/* Page Summary */}
                                                {editingPageSummaryId === page.id ? (
                                                  <div className={pageGroups.has(page.id)
                                                    ? selectionGroupSummaryClass(pageGroups.get(page.id), 'page')
                                                    : 'ml-10 mt-0.5 mb-1'
                                                  }>
                                                    <textarea
                                                      ref={pageSummaryInputRef}
                                                      value={editingPageSummary}
                                                      onChange={(e) => setEditingPageSummary(e.target.value)}
                                                      onBlur={() => savePageSummary(page.id)}
                                                      onKeyDown={(e) => {
                                                        e.stopPropagation()
                                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); savePageSummary(page.id) }
                                                        if (e.key === 'Escape') setEditingPageSummaryId(null)
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--color-primary)] focus:outline-none resize-none"
                                                      rows={1}
                                                      placeholder="Page summary..."
                                                    />
                                                  </div>
                                                ) : page.page_summary ? (
                                                  <div
                                                    className={`${pageGroups.has(page.id)
                                                      ? selectionGroupSummaryClass(pageGroups.get(page.id), 'page')
                                                      : 'ml-10 mt-0.5 mb-1'
                                                    } cursor-pointer group/pagesummary`}
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      startEditingPageSummary(page.id, page.page_summary)
                                                    }}
                                                  >
                                                    <p className={`text-xs italic line-clamp-1 ${
                                                      summarizingPageIds.has(page.id)
                                                        ? 'text-[var(--color-primary)] animate-pulse'
                                                        : 'text-[var(--text-muted)] group-hover/pagesummary:text-[var(--text-secondary)]'
                                                    }`}>
                                                      {page.page_summary}
                                                    </p>
                                                  </div>
                                                ) : (page.panels || []).length > 0 ? (
                                                  <div
                                                    className={`${pageGroups.has(page.id)
                                                      ? selectionGroupSummaryClass(pageGroups.get(page.id), 'page')
                                                      : 'ml-10 mt-0.5 mb-1'
                                                    } cursor-pointer`}
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      generatePageSummary(page.id)
                                                    }}
                                                  >
                                                    <p className={`text-xs italic ${
                                                      summarizingPageIds.has(page.id)
                                                        ? 'text-[var(--color-primary)] animate-pulse'
                                                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                                    }`}>
                                                      {summarizingPageIds.has(page.id) ? '✦ Summarizing...' : '✦ Summarize'}
                                                    </p>
                                                  </div>
                                                ) : null}
                                              </SortableItem>
                                            )
                                          })}
                                        </SortableContext>

                                        {/* Add Page link */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            addPage(scene.id)
                                          }}
                                          className="w-full text-left pl-10 pr-2 py-1 type-micro text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                                        >
                                          + Add Page
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </SortableItem>
                              )
                            })}
                          </SortableContext>

                          {/* Add Scene link */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              addScene(act.id)
                            }}
                            className="w-full text-left pl-6 pr-2 py-1.5 type-micro text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                          >
                            + Add Scene
                          </button>
                        </div>
                      </div>
                    </div>
                  </SortableItem>
                )
              })}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeDragItem && (() => {
              const { id, type } = activeDragItem
              const isMultiDrag = selectedIds.size > 1 && selectedIds.has(id) && selectionType === type
              const dragCount = isMultiDrag ? selectedIds.size : 1

              if (type === 'act') {
                const act = (issue.acts || []).find((a: any) => a.id === id)
                return (
                  <div className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg text-sm font-extrabold uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                    {act?.name || 'Act'}
                    {dragCount > 1 && (
                      <span className="bg-[var(--color-primary)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{dragCount}</span>
                    )}
                  </div>
                )
              }
              if (type === 'scene') {
                const loc = findSceneLocation(id)
                const plotline = loc?.scene?.plotline_id ? plotlines.find(p => p.id === loc.scene.plotline_id) : null
                return (
                  <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg flex items-center gap-2">
                    {plotline && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: plotline.color }} />}
                    <span className="type-label text-[var(--text-primary)]">{loc?.scene?.title || 'Scene'}</span>
                    {dragCount > 1 && (
                      <span className="bg-[var(--color-primary)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{dragCount}</span>
                    )}
                  </div>
                )
              }
              if (type === 'page') {
                const pos = pagePositionMap.get(id)
                return (
                  <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg type-label text-[var(--text-primary)] tabular-nums flex items-center gap-2">
                    Page {pos || '?'}
                    {dragCount > 1 && (
                      <span className="bg-[var(--color-primary)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{dragCount}</span>
                    )}
                  </div>
                )
              }
              return null
            })()}
          </DragOverlay>
        </DndContext>
      )}

      {/* Multi-select action bar */}
      {selectedIds.size >= 2 && (
        <div className="sticky bottom-0 bg-[var(--bg-elevated)] border-t-2 border-[var(--color-primary)] px-3 py-2.5 flex items-center justify-between z-10 animate-in slide-in-from-bottom-2 duration-200">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {selectedIds.size} {selectionType}{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-1.5">
            <div className="relative" data-move-popover>
              <button
                onClick={() => handleBatchMove()}
                className="px-2.5 py-1 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
              >
                Move
              </button>
              {showMovePopover && selectionType === 'page' && (
                <div className="absolute bottom-full mb-1 right-0 dropdown-panel py-1 min-w-[200px] max-h-48 overflow-y-auto z-50">
                  {sortedActs.map((act: any) => {
                    const actScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
                    return actScenes.map((scene: any) => {
                      // Disable scenes where all selected pages already live
                      const allPagesInThisScene = Array.from(selectedIds).every(id =>
                        (scene.pages || []).some((p: any) => p.id === id)
                      )
                      return (
                        <button
                          key={scene.id}
                          disabled={allPagesInThisScene}
                          onClick={async () => {
                            const ids = Array.from(selectedIds)
                            for (const id of ids) {
                              await movePageToScene(id, scene.id)
                            }
                            clearSelection()
                            setShowMovePopover(false)
                            showToast(`Moved ${ids.length} pages to ${scene.title || 'scene'}`, 'success')
                          }}
                          className={`dropdown-item text-xs ${allPagesInThisScene ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <span className="opacity-50">{act.name || `Act ${act.number}`} → </span>
                          {scene.title || 'Untitled Scene'}
                          {allPagesInThisScene && <span className="ml-1 opacity-60">(current)</span>}
                        </button>
                      )
                    })
                  })}
                </div>
              )}
              {showMovePopover && selectionType === 'scene' && (
                <div className="absolute bottom-full mb-1 right-0 dropdown-panel py-1 min-w-[160px] z-50">
                  {sortedActs.map((act: any) => {
                    // Disable acts where all selected scenes already live
                    const allScenesInThisAct = Array.from(selectedIds).every(id =>
                      (act.scenes || []).some((s: any) => s.id === id)
                    )
                    return (
                      <button
                        key={act.id}
                        disabled={allScenesInThisAct}
                        onClick={async () => {
                          const ids = Array.from(selectedIds)
                          for (const id of ids) {
                            await moveSceneToAct(id, act.id)
                          }
                          clearSelection()
                          setShowMovePopover(false)
                          showToast(`Moved ${ids.length} scenes to ${act.name || 'act'}`, 'success')
                        }}
                        className={`dropdown-item text-xs ${allScenesInThisAct ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {act.name || `Act ${act.number}`}
                        {allScenesInThisAct && <span className="ml-1 opacity-60">(current)</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => handleBatchDuplicate()}
              className="px-2.5 py-1 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
            >
              Duplicate
            </button>
            <button
              onClick={() => handleBatchDelete()}
              className="px-2.5 py-1 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 rounded transition-colors"
            >
              Delete
            </button>
            <button
              onClick={clearSelection}
              className="px-1.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)] rounded transition-colors ml-1"
              aria-label="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="dropdown-panel fixed z-50 py-1 min-w-[160px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 250),
          }}
        >
          {/* Rename - available for all types */}
          <button
            onClick={() => {
              startEditing(contextMenu.id, contextMenu.title)
              closeContextMenu()
            }}
            className="dropdown-item text-xs"
          >
            Rename
          </button>

          {/* Duplicate - for scenes and pages */}
          {(contextMenu.type === 'scene' || contextMenu.type === 'page') && (
            <button
              onClick={() => {
                if (isContextMenuItemMultiSelected) {
                  handleBatchDuplicate()
                } else if (contextMenu.type === 'page') {
                  duplicatePage(contextMenu.id)
                } else {
                  duplicateScene(contextMenu.id)
                }
                closeContextMenu()
              }}
              className="dropdown-item text-xs"
            >
              {isContextMenuItemMultiSelected
                ? `Duplicate ${selectedIds.size} ${selectionType}${selectedIds.size !== 1 ? 's' : ''}`
                : 'Duplicate'
              }
            </button>
          )}

          {/* Add Below - for scenes and pages */}
          {contextMenu.type === 'page' && (
            <button
              onClick={() => {
                addPageAfter(contextMenu.id)
                closeContextMenu()
              }}
              className="dropdown-item text-xs"
            >
              Add Page Below
            </button>
          )}
          {contextMenu.type === 'scene' && (
            <button
              onClick={() => {
                addSceneAfter(contextMenu.id)
                closeContextMenu()
              }}
              className="dropdown-item text-xs"
            >
              Add Scene Below
            </button>
          )}

          {/* Move to Act - only for scenes */}
          {contextMenu.type === 'scene' && (
            <div
              className="relative"
              onMouseEnter={() => !isContextMenuItemMultiSelected ? setContextSubmenu('move-to-act') : undefined}
              onMouseLeave={() => setContextSubmenu(null)}
            >
              <button
                onClick={() => {
                  if (isContextMenuItemMultiSelected) {
                    handleBatchMove()
                    closeContextMenu()
                  }
                }}
                className="dropdown-item text-xs justify-between"
              >
                {isContextMenuItemMultiSelected
                  ? <span>{`Move ${selectedIds.size} ${selectionType}${selectedIds.size !== 1 ? 's' : ''}`}</span>
                  : <span>Move to Act</span>
                }
                {!isContextMenuItemMultiSelected && <ChevronRight className="w-3 h-3 opacity-40" />}
              </button>
              {contextSubmenu === 'move-to-act' && (
                <div className="dropdown-panel absolute left-full top-0 py-1 min-w-[140px]">
                  {sortedActs.map((act: any) => {
                    const sceneLocation = findSceneLocation(contextMenu.id)
                    const isCurrent = sceneLocation?.actId === act.id
                    return (
                      <button
                        key={act.id}
                        onClick={() => {
                          if (!isCurrent) {
                            moveSceneToAct(contextMenu.id, act.id)
                          }
                          closeContextMenu()
                        }}
                        disabled={isCurrent}
                        className={`dropdown-item text-xs ${
                          isCurrent
                            ? 'opacity-40 cursor-default'
                            : ''
                        }`}
                      >
                        {act.name || `Act ${act.number}`}
                        {isCurrent && ' (current)'}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Move to Scene - only for pages */}
          {contextMenu.type === 'page' && (
            <div
              className="relative"
              onMouseEnter={() => !isContextMenuItemMultiSelected ? setContextSubmenu('move-to-scene') : undefined}
              onMouseLeave={() => setContextSubmenu(null)}
            >
              <button
                onClick={() => {
                  if (isContextMenuItemMultiSelected) {
                    handleBatchMove()
                    closeContextMenu()
                  }
                }}
                className="dropdown-item text-xs justify-between"
              >
                {isContextMenuItemMultiSelected
                  ? <span>{`Move ${selectedIds.size} ${selectionType}${selectedIds.size !== 1 ? 's' : ''}`}</span>
                  : <span>Move to Scene</span>
                }
                {!isContextMenuItemMultiSelected && <ChevronRight className="w-3 h-3 opacity-40" />}
              </button>
              {contextSubmenu === 'move-to-scene' && (
                <div className="dropdown-panel absolute left-full top-0 py-1 min-w-[180px] max-h-64 overflow-y-auto">
                  {sortedActs.map((act: any) => {
                    const actScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
                    return actScenes.map((scene: any) => {
                      const pageLocation = findPageLocation(contextMenu.id)
                      const isCurrent = pageLocation?.sceneId === scene.id
                      return (
                        <button
                          key={scene.id}
                          onClick={() => {
                            if (!isCurrent) {
                              movePageToScene(contextMenu.id, scene.id)
                            }
                            closeContextMenu()
                          }}
                          disabled={isCurrent}
                          className={`dropdown-item text-xs ${
                            isCurrent
                              ? 'opacity-40 cursor-default'
                              : ''
                          }`}
                        >
                          <span className="opacity-50">{act.name || `Act ${act.number}`} &rarr; </span>
                          {scene.title || 'Untitled Scene'}
                          {isCurrent && ' (current)'}
                        </button>
                      )
                    })
                  })}
                </div>
              )}
            </div>
          )}

          {/* Separator */}
          <div className="dropdown-separator my-1" />

          {/* Delete */}
          <button
            onClick={() => {
              if (isContextMenuItemMultiSelected) {
                handleBatchDelete()
              } else if (contextMenu.type === 'act') {
                deleteAct(contextMenu.id, contextMenu.title)
              } else if (contextMenu.type === 'scene') {
                const sceneLocation = findSceneLocation(contextMenu.id)
                const scene = sceneLocation?.scene
                deleteScene(contextMenu.id, contextMenu.title, scene?.pages?.length || 0)
              } else if (contextMenu.type === 'page') {
                const position = pagePositionMap.get(contextMenu.id) || 0
                deletePage(contextMenu.id, position)
              }
              closeContextMenu()
            }}
            className="dropdown-item text-xs !text-red-400 hover:!text-red-300"
          >
            {isContextMenuItemMultiSelected
              ? `Delete ${selectedIds.size} ${selectionType}${selectedIds.size !== 1 ? 's' : ''}`
              : 'Delete'
            }
          </button>
        </div>
      )}
    </div>
  )
}
