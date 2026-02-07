'use client'

import { useState, useEffect, useRef } from 'react'
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
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'ring-2 ring-[var(--color-primary)] ring-opacity-50 rounded shadow-lg bg-[var(--bg-secondary)]' : ''}
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
  const [editingScenePlotline, setEditingScenePlotline] = useState<string | null>(null)
  const [editingActId, setEditingActId] = useState<string | null>(null)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingSceneSummaryId, setEditingSceneSummaryId] = useState<string | null>(null)
  const [editingSummary, setEditingSummary] = useState('')
  const [editingActBeatSummaryId, setEditingActBeatSummaryId] = useState<string | null>(null)
  const [editingBeatSummary, setEditingBeatSummary] = useState('')
  const [editingActIntentionId, setEditingActIntentionId] = useState<string | null>(null)
  const [editingActIntention, setEditingActIntention] = useState('')
  const [editingSceneIntentionId, setEditingSceneIntentionId] = useState<string | null>(null)
  const [editingSceneIntention, setEditingSceneIntention] = useState('')
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editingPageTitle, setEditingPageTitle] = useState('')
  const [movingPageId, setMovingPageId] = useState<string | null>(null)
  const [activeDragItem, setActiveDragItem] = useState<{
    id: string
    type: 'act' | 'scene' | 'page'
    sourceId: string
  } | null>(null)
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const pageInputRef = useRef<HTMLInputElement>(null)
  const summaryInputRef = useRef<HTMLTextAreaElement>(null)
  const beatSummaryInputRef = useRef<HTMLTextAreaElement>(null)
  const actIntentionRef = useRef<HTMLTextAreaElement>(null)
  const sceneIntentionRef = useRef<HTMLTextAreaElement>(null)
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

  // Start editing an act title
  const startEditingAct = (actId: string, currentTitle: string) => {
    setEditingActId(actId)
    setEditingSceneId(null)
    setEditingTitle(currentTitle)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  // Start editing a scene title
  const startEditingScene = (sceneId: string, currentTitle: string) => {
    setEditingSceneId(sceneId)
    setEditingActId(null)
    setEditingTitle(currentTitle)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  // Save act title (database column is 'name')
  const saveActTitle = async (actId: string) => {
    const trimmedTitle = editingTitle.trim()
    if (!trimmedTitle) {
      showToast('Act title cannot be empty', 'error')
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('acts')
        .update({ name: trimmedTitle })
        .eq('id', actId)

      if (error) {
        console.error('Act title save error:', error)
        showToast(`Failed to rename act: ${error.message}`, 'error')
      } else {
        // Optimistic update - update the act name in local state immediately
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) =>
            a.id === actId ? { ...a, name: trimmedTitle } : a
          ),
        }))
      }
    } catch (err) {
      console.error('Unexpected error saving act title:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingActId(null)
  }

  // Save scene title
  const saveSceneTitle = async (sceneId: string) => {
    const trimmedTitle = editingTitle.trim()
    if (!trimmedTitle) {
      showToast('Scene title cannot be empty', 'error')
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('scenes')
        .update({ title: trimmedTitle })
        .eq('id', sceneId)

      if (error) {
        console.error('Scene title save error:', error)
        showToast(`Failed to rename scene: ${error.message}`, 'error')
      } else {
        // Optimistic update - update the scene title in local state immediately
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) =>
              s.id === sceneId ? { ...s, title: trimmedTitle } : s
            ),
          })),
        }))
      }
    } catch (err) {
      console.error('Unexpected error saving scene title:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingSceneId(null)
  }

  // Start editing page title
  const startEditingPage = (pageId: string, currentTitle: string) => {
    setEditingPageId(pageId)
    setEditingPageTitle(currentTitle)
    setTimeout(() => pageInputRef.current?.select(), 0)
  }

  // Save page title
  const savePageTitle = async (pageId: string) => {
    const trimmedTitle = editingPageTitle.trim()
    if (!trimmedTitle) {
      showToast('Page title cannot be empty', 'error')
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('pages')
        .update({ title: trimmedTitle })
        .eq('id', pageId)

      if (error) {
        console.error('Page title save error:', error)
        showToast(`Failed to rename page: ${error.message}`, 'error')
      } else {
        // Optimistic update - update the page title in local state immediately
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) => ({
              ...s,
              pages: (s.pages || []).map((p: any) =>
                p.id === pageId ? { ...p, title: trimmedTitle } : p
              ),
            })),
          })),
        }))
      }
    } catch (err) {
      console.error('Unexpected error saving page title:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingPageId(null)
  }

  // Start editing scene summary
  const startEditingSceneSummary = (sceneId: string, currentSummary: string) => {
    setEditingSceneSummaryId(sceneId)
    setEditingSummary(currentSummary || '')
    setTimeout(() => summaryInputRef.current?.focus(), 0)
  }

  // Save scene summary
  const saveSceneSummary = async (sceneId: string) => {
    try {
      const supabase = createClient()
      const trimmedSummary = editingSummary.trim() || null
      const { error } = await supabase
        .from('scenes')
        .update({ scene_summary: trimmedSummary })
        .eq('id', sceneId)

      if (error) {
        console.error('Scene summary save error:', error)
        showToast(`Failed to save summary: ${error.message}`, 'error')
      } else {
        // Optimistic update
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) =>
              s.id === sceneId ? { ...s, scene_summary: trimmedSummary } : s
            ),
          })),
        }))
        showToast('Summary saved', 'success')
      }
    } catch (err) {
      console.error('Unexpected error saving summary:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingSceneSummaryId(null)
  }

  // Start editing act beat summary
  const startEditingActBeatSummary = (actId: string, currentBeatSummary: string) => {
    setEditingActBeatSummaryId(actId)
    setEditingBeatSummary(currentBeatSummary || '')
    setTimeout(() => beatSummaryInputRef.current?.focus(), 0)
  }

  // Save act beat summary
  const saveActBeatSummary = async (actId: string) => {
    try {
      const supabase = createClient()
      const trimmedSummary = editingBeatSummary.trim() || null
      const { error } = await supabase
        .from('acts')
        .update({ beat_summary: trimmedSummary })
        .eq('id', actId)

      if (error) {
        console.error('Act beat summary save error:', error)
        showToast(`Failed to save beat summary: ${error.message}`, 'error')
      } else {
        // Optimistic update
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) =>
            a.id === actId ? { ...a, beat_summary: trimmedSummary } : a
          ),
        }))
        showToast('Beat summary saved', 'success')
      }
    } catch (err) {
      console.error('Unexpected error saving beat summary:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingActBeatSummaryId(null)
  }

  // Start editing act intention
  const startEditingActIntention = (actId: string, currentIntention: string) => {
    setEditingActIntentionId(actId)
    setEditingActIntention(currentIntention || '')
    setTimeout(() => actIntentionRef.current?.focus(), 0)
  }

  // Save act intention
  const saveActIntention = async (actId: string) => {
    try {
      const supabase = createClient()
      const trimmedIntention = editingActIntention.trim() || null
      const { error } = await supabase
        .from('acts')
        .update({ intention: trimmedIntention })
        .eq('id', actId)

      if (error) {
        console.error('Act intention save error:', error)
        showToast(`Failed to save intention: ${error.message}`, 'error')
      } else {
        // Optimistic update
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) =>
            a.id === actId ? { ...a, intention: trimmedIntention } : a
          ),
        }))
        showToast('Intention saved', 'success')
      }
    } catch (err) {
      console.error('Unexpected error saving act intention:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingActIntentionId(null)
  }

  // Start editing scene intention
  const startEditingSceneIntention = (sceneId: string, currentIntention: string) => {
    setEditingSceneIntentionId(sceneId)
    setEditingSceneIntention(currentIntention || '')
    setTimeout(() => sceneIntentionRef.current?.focus(), 0)
  }

  // Save scene intention
  const saveSceneIntention = async (sceneId: string) => {
    try {
      const supabase = createClient()
      const trimmedIntention = editingSceneIntention.trim() || null
      const { error } = await supabase
        .from('scenes')
        .update({ intention: trimmedIntention })
        .eq('id', sceneId)

      if (error) {
        console.error('Scene intention save error:', error)
        showToast(`Failed to save intention: ${error.message}`, 'error')
      } else {
        // Optimistic update
        setIssue((prev: any) => ({
          ...prev,
          acts: prev.acts.map((a: any) => ({
            ...a,
            scenes: (a.scenes || []).map((s: any) =>
              s.id === sceneId ? { ...s, intention: trimmedIntention } : s
            ),
          })),
        }))
        showToast('Intention saved', 'success')
      }
    } catch (err) {
      console.error('Unexpected error saving scene intention:', err)
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
    setEditingSceneIntentionId(null)
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingActId(null)
    setEditingSceneId(null)
    setEditingTitle('')
    setEditingSceneSummaryId(null)
    setEditingSummary('')
    setEditingActBeatSummaryId(null)
    setEditingBeatSummary('')
    setEditingActIntentionId(null)
    setEditingActIntention('')
    setEditingSceneIntentionId(null)
    setEditingSceneIntention('')
    setEditingPageId(null)
    setEditingPageTitle('')
  }

  // Handle key press in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent, saveFunc: () => void) => {
    // Stop propagation to prevent dnd-kit from capturing keys (especially space)
    e.stopPropagation()

    if (e.key === 'Enter') {
      e.preventDefault()
      saveFunc()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    }
  }

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
      title: `Page ${pageNumber}`,
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
      title: `Page ${pageNumber}`,
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

  const handleActDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
    const oldIndex = sortedActs.findIndex((a) => a.id === active.id)
    const newIndex = sortedActs.findIndex((a) => a.id === over.id)

    const reordered = arrayMove(sortedActs, oldIndex, newIndex)

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
    setMovingPageId(null)
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
      // Pages can drop on other pages (same/different scene) or on scene headers
      if (overType === 'page') {
        const overLocation = findPageLocation(overId)
        setDragOverContainerId(overLocation?.sceneId || null)
      } else if (overType === 'scene') {
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
      }
    }
  }

  // Get all scenes for the move dropdown
  const allScenes = issue.acts?.flatMap((act: any) =>
    (act.scenes || []).map((scene: any) => ({
      ...scene,
      actTitle: act.name || `Act ${act.number}`,
    }))
  ) || []

  const updateScenePlotline = async (sceneId: string, plotlineId: string | null) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('scenes')
      .update({ plotline_id: plotlineId })
      .eq('id', sceneId)

    if (!error) {
      // Optimistic update - update the scene's plotline in local state
      const plotline = plotlineId ? plotlines.find(p => p.id === plotlineId) : null
      setIssue((prev: any) => ({
        ...prev,
        acts: prev.acts.map((a: any) => ({
          ...a,
          scenes: (a.scenes || []).map((s: any) =>
            s.id === sceneId ? { ...s, plotline_id: plotlineId, plotline } : s
          ),
        })),
      }))
    }
    setEditingScenePlotline(null)
  }

  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-[var(--text-secondary)] uppercase tracking-wide">Structure</h3>
        <button
          onClick={addAct}
          className="text-xs bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] px-2 py-1 rounded"
        >
          + Act
        </button>
      </div>

      {sortedActs.length === 0 ? (
        <div className="text-center py-8 px-4">
          <div className="text-3xl mb-3 opacity-30">📖</div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">Start your story structure</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">Acts organize your issue into beginning, middle, and end.</p>
          <button
            onClick={addAct}
            className="text-xs bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-3 py-1.5 rounded transition-colors"
          >
            + Create First Act
          </button>
        </div>
      ) : !isMounted ? (
        // Simple render during SSR to avoid hydration mismatch
        <div className="space-y-1">
          {sortedActs.map((act: any) => (
            <div key={act.id}>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--bg-secondary)] cursor-pointer group">
                <span className="text-[var(--text-muted)] text-xs">▶</span>
                <span className="font-medium text-sm flex-1">{act.name || `Act ${act.number}`}</span>
              </div>
            </div>
          ))}
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
            <div className="space-y-1">
              {sortedActs.map((act: any) => (
                <SortableItem key={act.id} id={act.id}>
                  <div>
                    {/* Act Header */}
                    <div
                      className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--bg-secondary)] cursor-grab active:cursor-grabbing group ${
                        dragOverContainerId === act.id && activeDragItem?.type === 'scene' ? 'ring-2 ring-blue-400 bg-blue-500/10' : ''
                      }`}
                      onClick={() => !editingActId && toggleAct(act.id)}
                    >
                      <span className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" title="Drag to reorder">
                        ⋮⋮
                      </span>
                      <span className="text-[var(--text-muted)] text-xs">
                        {expandedActs.has(act.id) ? '▼' : '▶'}
                      </span>
                      {editingActId === act.id ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={() => saveActTitle(act.id)}
                          onKeyDown={(e) => handleEditKeyDown(e, () => saveActTitle(act.id))}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-1 py-0.5 text-sm font-medium focus:border-[var(--color-primary)] focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="font-medium text-sm flex-1 cursor-text"
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            startEditingAct(act.id, act.name || `Act ${act.number}`)
                          }}
                        >
                          {act.name || `Act ${act.number}`}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditingAct(act.id, act.name || `Act ${act.number}`)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1"
                        title="Rename act"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); addScene(act.id) }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1"
                        title="Add scene"
                      >
                        +
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteAct(act.id, act.name || `Act ${act.number}`) }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-secondary)] hover:text-red-400 px-1"
                        title="Delete act"
                      >
                        ×
                      </button>
                    </div>

                    {/* Act Beat Summary */}
                    {expandedActs.has(act.id) && (
                      editingActBeatSummaryId === act.id ? (
                        <div className="ml-4 mt-1 mb-2">
                          <textarea
                            ref={beatSummaryInputRef}
                            value={editingBeatSummary}
                            onChange={(e) => setEditingBeatSummary(e.target.value)}
                            onBlur={() => saveActBeatSummary(act.id)}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setEditingActBeatSummaryId(null)
                              } else if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                saveActBeatSummary(act.id)
                              }
                            }}
                            placeholder="Key beats in this act (not panel-level detail)..."
                            className="w-full text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-secondary)] resize-none focus:border-[var(--color-primary)] focus:outline-none"
                            rows={2}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : act.beat_summary ? (
                        <div
                          className="ml-4 mt-0.5 mb-1 cursor-pointer group/beatsummary"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingActBeatSummary(act.id, act.beat_summary)
                          }}
                        >
                          <p className="text-xs text-[var(--text-muted)] italic line-clamp-2 group-hover/beatsummary:text-[var(--text-secondary)]">
                            {act.beat_summary}
                          </p>
                        </div>
                      ) : (
                        <div
                          className="ml-4 mt-0.5 mb-1 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingActBeatSummary(act.id, '')
                          }}
                        >
                          <p className="text-xs text-[var(--text-muted)] italic hover:text-[var(--text-muted)]">
                            + Add beat summary
                          </p>
                        </div>
                      )
                    )}

                    {/* Act Intention */}
                    {expandedActs.has(act.id) && (
                      editingActIntentionId === act.id ? (
                        <div className="ml-4 mt-1 mb-2">
                          <textarea
                            ref={actIntentionRef}
                            value={editingActIntention}
                            onChange={(e) => setEditingActIntention(e.target.value)}
                            onBlur={() => saveActIntention(act.id)}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setEditingActIntentionId(null)
                              } else if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                saveActIntention(act.id)
                              }
                            }}
                            placeholder="What this act needs to accomplish..."
                            className="w-full text-xs bg-purple-900/30 border border-purple-700/50 rounded px-2 py-1 text-[var(--text-secondary)] resize-none focus:border-purple-500 focus:outline-none"
                            rows={2}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : act.intention ? (
                        <div
                          className="ml-4 mt-0.5 mb-1 cursor-pointer group/actintention"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingActIntention(act.id, act.intention)
                          }}
                        >
                          <p className="text-xs text-purple-400/70 line-clamp-2 group-hover/actintention:text-purple-300">
                            → {act.intention}
                          </p>
                        </div>
                      ) : (
                        <div
                          className="ml-4 mt-0.5 mb-1 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingActIntention(act.id, '')
                          }}
                        >
                          <p className="text-xs text-purple-600/50 hover:text-purple-500">
                            + Add intention
                          </p>
                        </div>
                      )
                    )}

                    {/* Scenes */}
                    {expandedActs.has(act.id) && (
                      <div className="ml-4">
                        <SortableContext items={(act.scenes || []).map((s: any) => s.id)} strategy={verticalListSortingStrategy}>
                          {(act.scenes || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((scene: any) => (
                            <SortableItem key={scene.id} id={scene.id}>
                              <div>
                                {/* Scene Header */}
                                <div
                                  className={`flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--bg-secondary)] cursor-grab active:cursor-grabbing group ${
                                    dragOverContainerId === scene.id && activeDragItem?.type === 'page' ? 'ring-2 ring-blue-400 bg-blue-500/10' : ''
                                  }`}
                                  onClick={() => !editingSceneId && toggleScene(scene.id)}
                                >
                                    <span className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity text-xs" title="Drag to reorder">
                                      ⋮⋮
                                    </span>
                                    <span className="text-[var(--text-muted)] text-xs">
                                      {expandedScenes.has(scene.id) ? '▼' : '▶'}
                                    </span>
                                    {/* Plotline color indicator */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingScenePlotline(editingScenePlotline === scene.id ? null : scene.id)
                                      }}
                                      className="w-3 h-3 rounded-full flex-shrink-0 border border-[var(--border)] hover:border-[var(--border)]"
                                      style={{ backgroundColor: scene.plotline?.color || 'transparent' }}
                                      title={scene.plotline?.name || 'No plotline assigned'}
                                    />
                                    {editingSceneId === scene.id ? (
                                      <input
                                        ref={editInputRef}
                                        type="text"
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        onBlur={() => saveSceneTitle(scene.id)}
                                        onKeyDown={(e) => handleEditKeyDown(e, () => saveSceneTitle(scene.id))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-1 py-0.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        autoFocus
                                      />
                                    ) : (
                                      <span
                                        className="text-sm text-[var(--text-secondary)] flex-1 truncate cursor-text"
                                        onDoubleClick={(e) => {
                                          e.stopPropagation()
                                          startEditingScene(scene.id, scene.title || 'Untitled Scene')
                                        }}
                                      >
                                        {scene.title || 'Untitled Scene'}
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        startEditingScene(scene.id, scene.title || 'Untitled Scene')
                                      }}
                                      className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1"
                                      title="Rename scene"
                                    >
                                      ✎
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); addPage(scene.id) }}
                                      className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1"
                                      title="Add page"
                                    >
                                      +
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteScene(scene.id, scene.title || 'Untitled Scene', scene.pages?.length || 0) }}
                                      className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-secondary)] hover:text-red-400 px-1"
                                      title="Delete scene"
                                    >
                                      ×
                                    </button>
                                  </div>
                                  {/* Scene Summary */}
                                  {editingSceneSummaryId === scene.id ? (
                                    <div className="ml-6 mt-1 mb-2">
                                      <textarea
                                        ref={summaryInputRef}
                                        value={editingSummary}
                                        onChange={(e) => setEditingSummary(e.target.value)}
                                        onBlur={() => saveSceneSummary(scene.id)}
                                        onKeyDown={(e) => {
                                          e.stopPropagation() // Prevent space/other keys from bubbling
                                          if (e.key === 'Escape') {
                                            e.preventDefault()
                                            setEditingSceneSummaryId(null)
                                          } else if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            saveSceneSummary(scene.id)
                                          }
                                        }}
                                        placeholder="One-sentence scene summary..."
                                        className="w-full text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-secondary)] resize-none focus:border-[var(--color-primary)] focus:outline-none"
                                        rows={2}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  ) : scene.scene_summary ? (
                                    <div
                                      className="ml-6 mt-0.5 mb-1 cursor-pointer group/summary"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        startEditingSceneSummary(scene.id, scene.scene_summary)
                                      }}
                                    >
                                      <p className="text-xs text-[var(--text-muted)] italic line-clamp-2 group-hover/summary:text-[var(--text-secondary)]">
                                        {scene.scene_summary}
                                      </p>
                                    </div>
                                  ) : (
                                    <div
                                      className="ml-6 mt-0.5 mb-1 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        startEditingSceneSummary(scene.id, '')
                                      }}
                                    >
                                      <p className="text-xs text-[var(--text-muted)] italic hover:text-[var(--text-muted)]">
                                        + Add summary
                                      </p>
                                    </div>
                                  )}

                                  {/* Scene Intention */}
                                  {editingSceneIntentionId === scene.id ? (
                                    <div className="ml-6 mt-1 mb-2">
                                      <textarea
                                        ref={sceneIntentionRef}
                                        value={editingSceneIntention}
                                        onChange={(e) => setEditingSceneIntention(e.target.value)}
                                        onBlur={() => saveSceneIntention(scene.id)}
                                        onKeyDown={(e) => {
                                          e.stopPropagation()
                                          if (e.key === 'Escape') {
                                            e.preventDefault()
                                            setEditingSceneIntentionId(null)
                                          } else if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            saveSceneIntention(scene.id)
                                          }
                                        }}
                                        placeholder="What this scene needs to accomplish..."
                                        className="w-full text-xs bg-purple-900/30 border border-purple-700/50 rounded px-2 py-1 text-[var(--text-secondary)] resize-none focus:border-purple-500 focus:outline-none"
                                        rows={2}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  ) : scene.intention ? (
                                    <div
                                      className="ml-6 mt-0.5 mb-1 cursor-pointer group/sceneintention"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        startEditingSceneIntention(scene.id, scene.intention)
                                      }}
                                    >
                                      <p className="text-xs text-purple-400/70 line-clamp-2 group-hover/sceneintention:text-purple-300">
                                        → {scene.intention}
                                      </p>
                                    </div>
                                  ) : (
                                    <div
                                      className="ml-6 mt-0.5 mb-1 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        startEditingSceneIntention(scene.id, '')
                                      }}
                                    >
                                      <p className="text-xs text-purple-600/50 hover:text-purple-500">
                                        + Add intention
                                      </p>
                                    </div>
                                  )}

                                  {/* Plotline selector dropdown */}
                                  {editingScenePlotline === scene.id && (
                                    <div className="ml-6 mt-1 mb-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded p-2">
                                      <div className="text-xs text-[var(--text-secondary)] mb-2">Assign plotline:</div>
                                      <div className="space-y-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            updateScenePlotline(scene.id, null)
                                          }}
                                          className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${
                                            !scene.plotline_id ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'
                                          }`}
                                        >
                                          <span className="w-2 h-2 rounded-full border border-[var(--border)]" />
                                          <span className="text-[var(--text-secondary)]">None</span>
                                        </button>
                                        {plotlines.map((plotline) => (
                                          <button
                                            key={plotline.id}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              updateScenePlotline(scene.id, plotline.id)
                                            }}
                                            className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${
                                              scene.plotline?.id === plotline.id ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'
                                            }`}
                                          >
                                            <span
                                              className="w-2 h-2 rounded-full flex-shrink-0"
                                              style={{ backgroundColor: plotline.color }}
                                            />
                                            <span className="truncate">{plotline.name}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Pages */}
                                  {expandedScenes.has(scene.id) && (
                                    <div className="ml-4">
                                      <SortableContext items={(scene.pages || []).map((p: any) => p.id)} strategy={verticalListSortingStrategy}>
                                          {(scene.pages || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((page: any) => (
                                            <SortableItem key={page.id} id={page.id}>
                                              <div>
                                                <div
                                                  onClick={() => !editingPageId && onSelectPage(page.id)}
                                                  className={`px-2 py-1 rounded cursor-grab active:cursor-grabbing text-sm flex items-center gap-1 group/page ${
                                                    selectedPageId === page.id
                                                      ? 'bg-blue-600 text-white'
                                                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                                                  }`}
                                                >
                                                  <span className={`text-xs opacity-0 group-hover/page:opacity-100 transition-opacity ${selectedPageId === page.id ? 'text-blue-200' : 'text-[var(--text-muted)]'}`} title="Drag to reorder">
                                                    ⋮⋮
                                                  </span>
                                                  {editingPageId === page.id ? (
                                                    <input
                                                      ref={pageInputRef}
                                                      type="text"
                                                      value={editingPageTitle}
                                                      onChange={(e) => setEditingPageTitle(e.target.value)}
                                                      onBlur={() => savePageTitle(page.id)}
                                                      onKeyDown={(e) => handleEditKeyDown(e, () => savePageTitle(page.id))}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-1 py-0.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                                                      autoFocus
                                                    />
                                                  ) : (
                                                    <span
                                                      className="flex-1 truncate cursor-text"
                                                      onDoubleClick={(e) => {
                                                        e.stopPropagation()
                                                        startEditingPage(page.id, page.title || `Page ${page.page_number}`)
                                                      }}
                                                    >
                                                      {page.title || `Page ${page.page_number}`}
                                                    </span>
                                                  )}
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      startEditingPage(page.id, page.title || `Page ${page.page_number}`)
                                                    }}
                                                    className={`opacity-0 group-hover/page:opacity-100 text-xs px-1 ${
                                                      selectedPageId === page.id
                                                        ? 'text-blue-200 hover:text-[var(--text-primary)]'
                                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                                    }`}
                                                    title="Rename page"
                                                  >
                                                    ✎
                                                  </button>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      setMovingPageId(movingPageId === page.id ? null : page.id)
                                                    }}
                                                    className={`opacity-0 group-hover/page:opacity-100 text-xs px-1 ${
                                                      selectedPageId === page.id
                                                        ? 'text-blue-200 hover:text-[var(--text-primary)]'
                                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                                    }`}
                                                    title="Move to scene"
                                                  >
                                                    ↗
                                                  </button>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); deletePage(page.id, page.page_number) }}
                                                    className={`opacity-0 group-hover/page:opacity-100 text-xs px-1 ${
                                                      selectedPageId === page.id
                                                        ? 'text-blue-200 hover:text-red-300'
                                                        : 'text-[var(--text-muted)] hover:text-red-400'
                                                    }`}
                                                    title="Delete page"
                                                  >
                                                    ×
                                                  </button>
                                                </div>
                                                {/* Move to scene dropdown */}
                                                {movingPageId === page.id && (
                                                  <div className="ml-4 mt-1 mb-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded p-2 max-h-48 overflow-y-auto">
                                                    <div className="text-xs text-[var(--text-secondary)] mb-2">Move to scene:</div>
                                                    <div className="space-y-1">
                                                      {allScenes.filter((s: any) => s.id !== scene.id).map((targetScene: any) => (
                                                        <button
                                                          key={targetScene.id}
                                                          onClick={(e) => {
                                                            e.stopPropagation()
                                                            movePageToScene(page.id, targetScene.id)
                                                          }}
                                                          className="w-full text-left text-xs px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] flex items-center gap-2"
                                                        >
                                                          <span className="text-[var(--text-muted)]">{targetScene.actTitle} →</span>
                                                          <span className="truncate">{targetScene.title || 'Untitled Scene'}</span>
                                                        </button>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            </SortableItem>
                                          ))}
                                        </SortableContext>
                                    </div>
                                  )}
                              </div>
                            </SortableItem>
                          ))}
                        </SortableContext>
                      </div>
                    )}
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
