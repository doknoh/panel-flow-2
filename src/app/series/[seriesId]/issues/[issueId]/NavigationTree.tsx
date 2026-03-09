'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
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
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging
        ? 'ring-2 ring-[var(--color-primary)] scale-[1.02] shadow-lg bg-[var(--bg-secondary)] animate-drag-overlay'
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
  const { showToast } = useToast()

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

    try {
      const supabase = createClient()

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
        }
      }
    } catch (err) {
      console.error('Unexpected error saving title:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingItemId(null)
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
    }
  }

  const deleteAct = async (actId: string, actTitle: string) => {
    const act = issue.acts?.find((a: any) => a.id === actId)
    const pageCount = act?.scenes?.reduce((sum: number, s: any) => sum + (s.pages?.length || 0), 0) || 0

    const confirmed = window.confirm(
      `Delete "${actTitle}"?\n\nThis will permanently delete ${act?.scenes?.length || 0} scene(s) and ${pageCount} page(s).`
    )
    if (!confirmed) return

    // Optimistic delete FIRST
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.filter((a: any) => a.id !== actId),
    }))

    const supabase = createClient()
    const { error } = await supabase.from('acts').delete().eq('id', actId)
    if (error) {
      // Rollback on error
      if (act) {
        setIssue((prev: any) => ({
          ...prev,
          acts: [...prev.acts, act].sort((a: any, b: any) => a.sort_order - b.sort_order),
        }))
      }
      showToast(`Failed to delete act: ${error.message}`, 'error')
    }
  }

  const deleteScene = async (sceneId: string, sceneTitle: string, pageCount: number) => {
    const confirmed = window.confirm(
      `Delete "${sceneTitle}"?\n\nThis will permanently delete ${pageCount} page(s).`
    )
    if (!confirmed) return

    // Find the scene for potential rollback
    let deletedScene: any = null
    let parentActId: string | null = null
    for (const act of issue.acts || []) {
      const scene = (act.scenes || []).find((s: any) => s.id === sceneId)
      if (scene) {
        deletedScene = scene
        parentActId = act.id
        break
      }
    }

    // Optimistic delete FIRST
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).filter((s: any) => s.id !== sceneId),
      })),
    }))

    const supabase = createClient()
    const { error } = await supabase.from('scenes').delete().eq('id', sceneId)
    if (error) {
      // Rollback on error
      if (deletedScene && parentActId) {
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) =>
            a.id === parentActId
              ? { ...a, scenes: [...(a.scenes || []), deletedScene].sort((x: any, y: any) => x.sort_order - y.sort_order) }
              : a
          ),
        }))
      }
      showToast(`Failed to delete scene: ${error.message}`, 'error')
    }
  }

  const deletePage = async (pageId: string, pageNumber: number) => {
    const confirmed = window.confirm(`Delete Page ${pageNumber}?\n\nThis will permanently delete all panels on this page.`)
    if (!confirmed) return

    // Find the page for potential rollback
    let deletedPage: any = null
    let parentSceneId: string | null = null
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = (scene.pages || []).find((p: any) => p.id === pageId)
        if (page) {
          deletedPage = page
          parentSceneId = scene.id
          break
        }
      }
      if (deletedPage) break
    }

    // Optimistic delete FIRST
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

    const supabase = createClient()
    const { error } = await supabase.from('pages').delete().eq('id', pageId)
    if (error) {
      // Rollback on error
      if (deletedPage && parentSceneId) {
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) =>
              s.id === parentSceneId
                ? { ...s, pages: [...(s.pages || []), deletedPage].sort((x: any, y: any) => x.sort_order - y.sort_order) }
                : s
            ),
          })),
        }))
      }
      showToast(`Failed to delete page: ${error.message}`, 'error')
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
    }
  }

  // --- Drag-and-drop handlers ---

  const handleActDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const sortedActsLocal = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
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
      supabase.from('acts').update({ sort_order: index + 1 }).eq('id', act.id)
    )
    await Promise.all(updates)
    showToast('Acts reordered', 'success')
  }

  const handleSceneDragEnd = async (actId: string, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const act = issue.acts?.find((a: any) => a.id === actId)
    const sortedScenes = [...(act?.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
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
      supabase.from('scenes').update({ sort_order: index + 1 }).eq('id', scene.id)
    )
    await Promise.all(updates)
    showToast('Scenes reordered', 'success')
  }

  const handlePageDragEnd = async (sceneId: string, event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const sortedPages = [...(scene?.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
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
      // Revert optimistic update on error by refreshing
      await onRefresh()
      return
    }

    if (successCount === 0) {
      showToast('No pages were updated - check permissions', 'error')
      await onRefresh()
      return
    }

    showToast(`Reordered ${successCount} pages`, 'success')
  }

  const movePageToScene = async (pageId: string, targetSceneId: string) => {
    const supabase = createClient()

    // Get target scene to calculate new sort_order
    const targetScene = issue.acts?.flatMap((a: any) => a.scenes || [])
      .find((s: any) => s.id === targetSceneId)

    if (!targetScene) {
      showToast('Target scene not found', 'error')
      return
    }

    // New sort_order is at the end of the target scene
    const newSortOrder = (targetScene.pages?.length || 0) + 1

    const { error, data } = await supabase
      .from('pages')
      .update({
        scene_id: targetSceneId,
        sort_order: newSortOrder,
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

    // Optimistic update - move the page in local state immediately
    setIssue((prev: any) => {
      // Find and remove the page from its current scene
      let movedPage: any = null
      const updatedActs = prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).map((s: any) => {
          const pageInScene = (s.pages || []).find((p: any) => p.id === pageId)
          if (pageInScene) {
            movedPage = { ...pageInScene, scene_id: targetSceneId, sort_order: newSortOrder }
            return { ...s, pages: s.pages.filter((p: any) => p.id !== pageId) }
          }
          return s
        }),
      }))

      // Add the page to the target scene
      if (movedPage) {
        return {
          ...prev,
          acts: updatedActs.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) =>
              s.id === targetSceneId
                ? { ...s, pages: [...(s.pages || []), movedPage] }
                : s
            ),
          })),
        }
      }
      return prev
    })

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

    // Refresh to ensure state is fully synced after move
    await onRefresh()
  }

  // Move scene to a different act
  const moveSceneToAct = async (sceneId: string, targetActId: string) => {
    const supabase = createClient()
    const sourceLocation = findSceneLocation(sceneId)
    if (!sourceLocation) {
      showToast('Scene not found', 'error')
      return
    }

    // If same act, do nothing
    if (sourceLocation.actId === targetActId) return

    // Get target act to calculate new sort_order
    const targetAct = (issue.acts || []).find((a: any) => a.id === targetActId)
    if (!targetAct) {
      showToast('Target act not found', 'error')
      return
    }

    // New sort_order is at the end of the target act
    const newSortOrder = ((targetAct.scenes || []).length || 0) + 1

    const { error } = await supabase
      .from('scenes')
      .update({
        act_id: targetActId,
        sort_order: newSortOrder,
      })
      .eq('id', sceneId)

    if (error) {
      showToast(`Failed to move scene: ${error.message}`, 'error')
      return
    }

    // Optimistic update - move the scene in local state
    setIssue((prev: any) => {
      let movedScene: any = null
      // Remove from source act
      const updatedActs = prev.acts.map((a: any) => {
        if (a.id === sourceLocation.actId) {
          movedScene = (a.scenes || []).find((s: any) => s.id === sceneId)
          if (movedScene) {
            movedScene = { ...movedScene, act_id: targetActId, sort_order: newSortOrder }
          }
          return { ...a, scenes: (a.scenes || []).filter((s: any) => s.id !== sceneId) }
        }
        return a
      })

      // Add to target act
      if (movedScene) {
        return {
          ...prev,
          acts: updatedActs.map((a: any) =>
            a.id === targetActId
              ? { ...a, scenes: [...(a.scenes || []), movedScene] }
              : a
          ),
        }
      }
      return prev
    })

    // Expand the target act
    setExpandedActs(new Set([...expandedActs, targetActId]))
    showToast('Scene moved successfully', 'success')

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
          // Different act - move scene to that act
          await moveSceneToAct(activeId, overLocation.actId)
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
          // Different scene - move page to that scene
          await movePageToScene(activeId, overLocation.sceneId)
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
                  <span className="text-sm font-bold uppercase tracking-wide text-[var(--text-primary)] flex-1">
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
          collisionDetection={closestCenter}
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
                            className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] px-1 py-0.5 text-sm font-bold uppercase tracking-wide focus:border-[var(--color-primary)] focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="text-sm font-bold uppercase tracking-wide text-[var(--text-primary)] flex-1"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              startEditing(act.id, act.name || `Act ${act.number}`)
                            }}
                          >
                            {act.name || `Act ${act.number}`}
                          </span>
                        )}
                        <span className="ml-auto type-micro tabular-nums text-[var(--text-muted)]">{actPageCount} pg</span>
                      </div>

                      {/* Expanded Act Content */}
                      {expandedActs.has(act.id) && (
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
                                          className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] px-1 py-0.5 text-xs font-medium focus:border-[var(--color-primary)] focus:outline-none"
                                          autoFocus
                                        />
                                      ) : (
                                        <span
                                          className="text-xs font-medium text-[var(--text-secondary)] flex-1 truncate"
                                          onDoubleClick={(e) => {
                                            e.stopPropagation()
                                            startEditing(scene.id, scene.title || 'Untitled Scene')
                                          }}
                                        >
                                          {scene.title || 'Untitled Scene'}
                                        </span>
                                      )}
                                      <span className="ml-auto type-micro tabular-nums text-[var(--text-muted)]">{scenePageCount} pg</span>
                                    </div>

                                    {/* Expanded Scene Content - Pages */}
                                    {expandedScenes.has(scene.id) && (
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
                                                </div>
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
                                    )}
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
                      )}
                    </div>
                  </SortableItem>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* Rename - available for all types */}
          <button
            onClick={() => {
              startEditing(contextMenu.id, contextMenu.title)
              closeContextMenu()
            }}
            className="w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Rename
          </button>

          {/* Move to Act - only for scenes */}
          {contextMenu.type === 'scene' && (
            <div
              className="relative"
              onMouseEnter={() => setContextSubmenu('move-to-act')}
              onMouseLeave={() => setContextSubmenu(null)}
            >
              <button
                className="w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors flex items-center justify-between"
              >
                <span>Move to Act</span>
                <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
              {contextSubmenu === 'move-to-act' && (
                <div className="absolute left-full top-0 bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg py-1 min-w-[140px]">
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
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          isCurrent
                            ? 'text-[var(--text-disabled)] cursor-default'
                            : 'cursor-pointer hover:bg-[var(--bg-secondary)]'
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
                className="w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors flex items-center justify-between"
              >
                <span>Move to Scene</span>
                <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
              {contextSubmenu === 'move-to-scene' && (
                <div className="absolute left-full top-0 bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg py-1 min-w-[180px] max-h-64 overflow-y-auto">
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
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            isCurrent
                              ? 'text-[var(--text-disabled)] cursor-default'
                              : 'cursor-pointer hover:bg-[var(--bg-secondary)]'
                          }`}
                        >
                          <span className="text-[var(--text-muted)]">{act.name || `Act ${act.number}`} &rarr; </span>
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
          <div className="my-1 border-t border-[var(--border)]" />

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
            className="w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg-secondary)] text-[var(--color-error)] transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
