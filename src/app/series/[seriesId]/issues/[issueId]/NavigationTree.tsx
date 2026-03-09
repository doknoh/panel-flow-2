'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { useUndo } from '@/contexts/UndoContext'
import { fetchPageDeepData, fetchSceneDeepData, fetchActDeepData } from '@/lib/undoHelpers'
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

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
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
    opacity: isDragging ? 0.3 : 1,
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
  const editInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const pageSummaryInputRef = useRef<HTMLTextAreaElement>(null)
  const { showToast } = useToast()
  const { recordAction } = useUndo()

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

    const confirmed = window.confirm(
      `Delete "${actTitle}"?\n\nThis will permanently delete ${act?.scenes?.length || 0} scene(s) and ${pageCount} page(s).`
    )
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
    const confirmed = window.confirm(
      `Delete "${sceneTitle}"?\n\nThis will permanently delete ${pageCount} page(s).`
    )
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
    const confirmed = window.confirm(`Delete Page ${pageNumber}?\n\nThis will permanently delete all panels on this page.`)
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

      if (overType === 'scene') {
        // Dropping on another scene
        const overLocation = findSceneLocation(overId)
        if (!overLocation) return

        if (sourceLocation.actId === overLocation.actId) {
          // Same act - reorder scenes
          await handleSceneDragEnd(sourceLocation.actId, event)
        } else {
          // Different act - move scene to that act, inserting at the hovered scene's position
          await moveSceneToAct(activeId, overLocation.actId, overId)
        }
      } else if (overType === 'act') {
        // Dropping on an act header - move to that act
        if (sourceLocation.actId !== overId) {
          await moveSceneToAct(activeId, overId)
        }
      }
    } else if (dragItem.type === 'page') {
      const sourceLocation = findPageLocation(activeId)
      if (!sourceLocation) return

      if (overType === 'page') {
        // Dropping on another page
        const overLocation = findPageLocation(overId)
        if (!overLocation) return

        if (sourceLocation.sceneId === overLocation.sceneId) {
          // Same scene - reorder pages
          await handlePageDragEnd(sourceLocation.sceneId, event)
        } else {
          // Different scene - move page to that scene, inserting at the hovered page's position
          await movePageToScene(activeId, overLocation.sceneId, overId)
        }
      } else if (overType === 'scene') {
        // Dropping on a scene header - move to that scene (append at end)
        if (sourceLocation.sceneId !== overId) {
          await movePageToScene(activeId, overId)
        }
      } else if (overType === 'act') {
        // Dropping page on an act header
        const targetAct = (issue.acts || []).find((a: any) => a.id === overId)
        if (!targetAct) return

        const targetScenes = (targetAct.scenes || []).sort((a: any, b: any) => a.sort_order - b.sort_order)

        if (targetScenes.length > 0) {
          // Act has scenes - move to the first scene
          await movePageToScene(activeId, targetScenes[0].id)
        } else {
          // Act has no scenes - create one first, then move the page
          const supabase = createClient()
          const { data: newScene, error: sceneError } = await supabase
            .from('scenes')
            .insert({
              act_id: overId,
              title: 'Scene 1',
              sort_order: 1,
            })
            .select()
            .single()

          if (sceneError || !newScene) {
            showToast('Failed to create scene for page move', 'error')
            return
          }

          // Update local state with the new scene
          setIssue((prev: any) => ({
            ...prev,
            acts: prev.acts.map((a: any) =>
              a.id === overId
                ? { ...a, scenes: [...(a.scenes || []), { ...newScene, pages: [] }] }
                : a
            ),
          }))

          // Now move the page to the new scene
          await movePageToScene(activeId, newScene.id)
          showToast('Created scene and moved page', 'success')
        }
      }
    }
  }

  // --- Computed values ---

  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

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
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, title })
    setContextSubmenu(null)
  }

  const closeContextMenu = () => {
    setContextMenu(null)
    setContextSubmenu(null)
  }

  // --- Render ---

  return (
    <div className="p-3">
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

                return (
                  <SortableItem key={act.id} id={act.id}>
                    <div>
                      {/* Act Header */}
                      <div
                        className={`flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors group ${
                          dragOverContainerId === act.id && (activeDragItem?.type === 'scene' || activeDragItem?.type === 'page') ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
                        }`}
                        onClick={() => !editingItemId && toggleAct(act.id)}
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
                            className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] px-1 py-0.5 text-sm font-extrabold uppercase tracking-tight focus:border-[var(--color-primary)] focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="text-sm font-extrabold uppercase tracking-tight text-[var(--text-primary)] flex-1"
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
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (contextMenu?.id === act.id) {
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

                              return (
                                <SortableItem key={scene.id} id={scene.id}>
                                  <div>
                                    {/* Scene Header */}
                                    <div
                                      className={`flex items-center gap-2 pl-6 pr-2 py-1.5 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors group ${
                                        dragOverContainerId === scene.id && activeDragItem?.type === 'page' ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
                                      }`}
                                      style={{ borderLeft: `3px solid ${scene.plotline?.color || 'transparent'}` }}
                                      onClick={() => !editingItemId && toggleScene(scene.id)}
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
                                          className="text-xs font-bold text-[var(--text-secondary)] flex-1 truncate"
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
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (contextMenu?.id === scene.id) {
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

                                            return (
                                              <SortableItem key={page.id} id={page.id}>
                                                <div
                                                  onClick={() => !editingItemId && onSelectPage(page.id)}
                                                  onContextMenu={(e) => handleContextMenu(e, 'page', page.id, page.title || '')}
                                                  className={`flex items-center gap-2 pl-10 pr-2 py-1 cursor-pointer transition-colors group ${
                                                    isSelected
                                                      ? 'bg-[var(--color-primary)] text-white'
                                                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]'
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
                                                      {getPageDisplayName(page)}
                                                    </span>
                                                  )}
                                                  <span className={`type-micro tabular-nums ${isSelected ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                                                    {panelCount} pnl
                                                  </span>
                                                  <button
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      if (contextMenu?.id === page.id) {
                                                        closeContextMenu()
                                                      } else {
                                                        const rect = e.currentTarget.getBoundingClientRect()
                                                        setContextMenu({ x: rect.left, y: rect.bottom, type: 'page', id: page.id, title: page.title || '' })
                                                        setContextSubmenu(null)
                                                      }
                                                    }}
                                                    className={`opacity-0 group-hover:opacity-100 p-0.5 transition-opacity ${
                                                      isSelected
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
                                                  <div className="ml-10 mt-0.5 mb-1">
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
                                                    className="ml-10 mt-0.5 mb-1 cursor-pointer group/pagesummary"
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
                                                    className="ml-10 mt-0.5 mb-1 cursor-pointer"
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
              if (type === 'act') {
                const act = (issue.acts || []).find((a: any) => a.id === id)
                return (
                  <div className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg text-sm font-extrabold uppercase tracking-tight text-[var(--text-primary)]">
                    {act?.name || 'Act'}
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
                  </div>
                )
              }
              if (type === 'page') {
                const pos = pagePositionMap.get(id)
                return (
                  <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg type-label text-[var(--text-primary)] tabular-nums">
                    Page {pos || '?'}
                  </div>
                )
              }
              return null
            })()}
          </DragOverlay>
        </DndContext>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="dropdown-panel fixed z-50 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
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
                if (contextMenu.type === 'page') {
                  duplicatePage(contextMenu.id)
                } else {
                  duplicateScene(contextMenu.id)
                }
                closeContextMenu()
              }}
              className="dropdown-item text-xs"
            >
              Duplicate
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
              onMouseEnter={() => setContextSubmenu('move-to-act')}
              onMouseLeave={() => setContextSubmenu(null)}
            >
              <button
                className="dropdown-item text-xs justify-between"
              >
                <span>Move to Act</span>
                <ChevronRight className="w-3 h-3 opacity-40" />
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
              onMouseEnter={() => setContextSubmenu('move-to-scene')}
              onMouseLeave={() => setContextSubmenu(null)}
            >
              <button
                className="dropdown-item text-xs justify-between"
              >
                <span>Move to Scene</span>
                <ChevronRight className="w-3 h-3 opacity-40" />
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
              if (contextMenu.type === 'act') {
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
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
