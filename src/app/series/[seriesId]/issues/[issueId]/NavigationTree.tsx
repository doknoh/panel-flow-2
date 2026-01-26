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
  plotlines: Plotline[]
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onRefresh: () => void
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
      className={isDragging ? 'ring-2 ring-blue-500 ring-opacity-50 rounded shadow-lg bg-zinc-800/90' : ''}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export default function NavigationTree({ issue, plotlines, selectedPageId, onSelectPage, onRefresh }: NavigationTreeProps) {
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
  const [movingPageId, setMovingPageId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const summaryInputRef = useRef<HTMLTextAreaElement>(null)
  const beatSummaryInputRef = useRef<HTMLTextAreaElement>(null)
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

  // Save act title
  const saveActTitle = async (actId: string) => {
    const trimmedTitle = editingTitle.trim()
    if (!trimmedTitle) {
      showToast('Act title cannot be empty', 'error')
      return
    }

    const supabase = createClient()
    const { error } = await supabase
      .from('acts')
      .update({ title: trimmedTitle })
      .eq('id', actId)

    if (error) {
      showToast(`Failed to rename act: ${error.message}`, 'error')
    } else {
      onRefresh()
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

    const supabase = createClient()
    const { error } = await supabase
      .from('scenes')
      .update({ title: trimmedTitle })
      .eq('id', sceneId)

    if (error) {
      showToast(`Failed to rename scene: ${error.message}`, 'error')
    } else {
      onRefresh()
    }
    setEditingSceneId(null)
  }

  // Start editing scene summary
  const startEditingSceneSummary = (sceneId: string, currentSummary: string) => {
    setEditingSceneSummaryId(sceneId)
    setEditingSummary(currentSummary || '')
    setTimeout(() => summaryInputRef.current?.focus(), 0)
  }

  // Save scene summary
  const saveSceneSummary = async (sceneId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('scenes')
      .update({ scene_summary: editingSummary.trim() || null })
      .eq('id', sceneId)

    if (error) {
      showToast(`Failed to save summary: ${error.message}`, 'error')
    } else {
      onRefresh()
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
    const supabase = createClient()
    const { error } = await supabase
      .from('acts')
      .update({ beat_summary: editingBeatSummary.trim() || null })
      .eq('id', actId)

    if (error) {
      showToast(`Failed to save beat summary: ${error.message}`, 'error')
    } else {
      onRefresh()
    }
    setEditingActBeatSummaryId(null)
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
    const supabase = createClient()
    const actNumber = (issue.acts?.length || 0) + 1

    const { error } = await supabase.from('acts').insert({
      issue_id: issue.id,
      number: actNumber,
      title: `Act ${actNumber}`,
      sort_order: actNumber,
    })

    if (error) {
      showToast(`Failed to create act: ${error.message}`, 'error')
    } else {
      onRefresh()
    }
  }

  const deleteAct = async (actId: string, actTitle: string) => {
    const act = issue.acts?.find((a: any) => a.id === actId)
    const pageCount = act?.scenes?.reduce((sum: number, s: any) => sum + (s.pages?.length || 0), 0) || 0

    const confirmed = window.confirm(
      `Delete "${actTitle}"?\n\nThis will permanently delete ${act?.scenes?.length || 0} scene(s) and ${pageCount} page(s).`
    )
    if (!confirmed) return

    const supabase = createClient()
    const { error } = await supabase.from('acts').delete().eq('id', actId)
    if (error) {
      showToast(`Failed to delete act: ${error.message}`, 'error')
    } else {
      onRefresh()
    }
  }

  const deleteScene = async (sceneId: string, sceneTitle: string, pageCount: number) => {
    const confirmed = window.confirm(
      `Delete "${sceneTitle}"?\n\nThis will permanently delete ${pageCount} page(s).`
    )
    if (!confirmed) return

    const supabase = createClient()
    const { error } = await supabase.from('scenes').delete().eq('id', sceneId)
    if (error) {
      showToast(`Failed to delete scene: ${error.message}`, 'error')
    } else {
      onRefresh()
    }
  }

  const deletePage = async (pageId: string, pageNumber: number) => {
    const confirmed = window.confirm(`Delete Page ${pageNumber}?\n\nThis will permanently delete all panels on this page.`)
    if (!confirmed) return

    const supabase = createClient()
    const { error } = await supabase.from('pages').delete().eq('id', pageId)
    if (error) {
      showToast(`Failed to delete page: ${error.message}`, 'error')
    } else {
      if (selectedPageId === pageId) {
        onSelectPage('')
      }
      onRefresh()
    }
  }

  const addScene = async (actId: string) => {
    const supabase = createClient()
    const act = issue.acts?.find((a: any) => a.id === actId)
    const sceneCount = act?.scenes?.length || 0

    const { error } = await supabase.from('scenes').insert({
      act_id: actId,
      title: `Scene ${sceneCount + 1}`,
      sort_order: sceneCount + 1,
    })

    if (error) {
      showToast(`Failed to create scene: ${error.message}`, 'error')
    } else {
      setExpandedActs(new Set([...expandedActs, actId]))
      onRefresh()
    }
  }

  const addPage = async (sceneId: string) => {
    const supabase = createClient()

    const allPages = issue.acts?.flatMap((a: any) =>
      a.scenes?.flatMap((s: any) => s.pages || []) || []
    ) || []
    const pageNumber = allPages.length + 1

    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const pagesInScene = scene?.pages?.length || 0

    const { data, error } = await supabase.from('pages').insert({
      scene_id: sceneId,
      page_number: pageNumber,
      sort_order: pagesInScene + 1,
    }).select().single()

    if (error) {
      showToast(`Failed to create page: ${error.message}`, 'error')
    } else if (data) {
      setExpandedScenes(new Set([...expandedScenes, sceneId]))
      onRefresh()
      onSelectPage(data.id)
    }
  }

  const handleActDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)
    const oldIndex = sortedActs.findIndex((a) => a.id === active.id)
    const newIndex = sortedActs.findIndex((a) => a.id === over.id)

    const reordered = arrayMove(sortedActs, oldIndex, newIndex)

    const supabase = createClient()
    const updates = reordered.map((act, index) =>
      supabase.from('acts').update({ sort_order: index + 1 }).eq('id', act.id)
    )

    await Promise.all(updates)
    onRefresh()
  }

  const handleSceneDragEnd = async (actId: string, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const act = issue.acts?.find((a: any) => a.id === actId)
    const sortedScenes = [...(act?.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    const oldIndex = sortedScenes.findIndex((s: any) => s.id === active.id)
    const newIndex = sortedScenes.findIndex((s: any) => s.id === over.id)

    const reordered = arrayMove(sortedScenes, oldIndex, newIndex)

    const supabase = createClient()
    const updates = reordered.map((scene: any, index: number) =>
      supabase.from('scenes').update({ sort_order: index + 1 }).eq('id', scene.id)
    )

    await Promise.all(updates)
    onRefresh()
  }

  const handlePageDragEnd = async (sceneId: string, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const scene = issue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    const sortedPages = [...(scene?.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    const oldIndex = sortedPages.findIndex((p: any) => p.id === active.id)
    const newIndex = sortedPages.findIndex((p: any) => p.id === over.id)

    const reordered = arrayMove(sortedPages, oldIndex, newIndex)

    const supabase = createClient()
    const updates = reordered.map((page: any, index: number) =>
      supabase.from('pages').update({ sort_order: index + 1 }).eq('id', page.id)
    )

    await Promise.all(updates)
    onRefresh()
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

    const { error } = await supabase
      .from('pages')
      .update({
        scene_id: targetSceneId,
        sort_order: newSortOrder,
      })
      .eq('id', pageId)

    if (error) {
      showToast(`Failed to move page: ${error.message}`, 'error')
    } else {
      showToast('Page moved successfully', 'success')
      setMovingPageId(null)
      onRefresh()
    }
  }

  // Get all scenes for the move dropdown
  const allScenes = issue.acts?.flatMap((act: any) =>
    (act.scenes || []).map((scene: any) => ({
      ...scene,
      actTitle: act.title || `Act ${act.number}`,
    }))
  ) || []

  const updateScenePlotline = async (sceneId: string, plotlineId: string | null) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('scenes')
      .update({ plotline_id: plotlineId })
      .eq('id', sceneId)

    if (!error) {
      onRefresh()
    }
    setEditingScenePlotline(null)
  }

  const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-zinc-400 uppercase tracking-wide">Structure</h3>
        <button
          onClick={addAct}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded"
        >
          + Act
        </button>
      </div>

      {sortedActs.length === 0 ? (
        <div className="text-center py-8 px-4">
          <div className="text-3xl mb-3 opacity-30">📖</div>
          <p className="text-sm text-zinc-400 mb-2">Start your story structure</p>
          <p className="text-xs text-zinc-500 mb-4">Acts organize your issue into beginning, middle, and end.</p>
          <button
            onClick={addAct}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded transition-colors"
          >
            + Create First Act
          </button>
        </div>
      ) : !isMounted ? (
        // Simple render during SSR to avoid hydration mismatch
        <div className="space-y-1">
          {sortedActs.map((act: any) => (
            <div key={act.id}>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer group">
                <span className="text-zinc-500 text-xs">▶</span>
                <span className="font-medium text-sm flex-1">{act.title || `Act ${act.number}`}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActDragEnd}>
          <SortableContext items={sortedActs.map(a => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {sortedActs.map((act: any) => (
                <SortableItem key={act.id} id={act.id}>
                  <div>
                    {/* Act Header */}
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-grab active:cursor-grabbing group"
                      onClick={() => !editingActId && toggleAct(act.id)}
                    >
                      <span className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Drag to reorder">
                        ⋮⋮
                      </span>
                      <span className="text-zinc-500 text-xs">
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
                          className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-sm font-medium focus:border-blue-500 focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="font-medium text-sm flex-1 cursor-text"
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            startEditingAct(act.id, act.title || `Act ${act.number}`)
                          }}
                        >
                          {act.title || `Act ${act.number}`}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditingAct(act.id, act.title || `Act ${act.number}`)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-white px-1"
                        title="Rename act"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); addScene(act.id) }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-white px-1"
                        title="Add scene"
                      >
                        +
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteAct(act.id, act.title || `Act ${act.number}`) }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-red-400 px-1"
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
                            className="w-full text-xs bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-zinc-300 resize-none focus:border-blue-500 focus:outline-none"
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
                          <p className="text-xs text-zinc-500 italic line-clamp-2 group-hover/beatsummary:text-zinc-400">
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
                          <p className="text-xs text-zinc-600 italic hover:text-zinc-500">
                            + Add beat summary
                          </p>
                        </div>
                      )
                    )}

                    {/* Scenes */}
                    {expandedActs.has(act.id) && (
                      <div className="ml-4">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleSceneDragEnd(act.id, e)}>
                          <SortableContext items={(act.scenes || []).map((s: any) => s.id)} strategy={verticalListSortingStrategy}>
                            {(act.scenes || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((scene: any) => (
                              <SortableItem key={scene.id} id={scene.id}>
                                <div>
                                  {/* Scene Header */}
                                  <div
                                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800 cursor-grab active:cursor-grabbing group"
                                    onClick={() => !editingSceneId && toggleScene(scene.id)}
                                  >
                                    <span className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs" title="Drag to reorder">
                                      ⋮⋮
                                    </span>
                                    <span className="text-zinc-500 text-xs">
                                      {expandedScenes.has(scene.id) ? '▼' : '▶'}
                                    </span>
                                    {/* Plotline color indicator */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingScenePlotline(editingScenePlotline === scene.id ? null : scene.id)
                                      }}
                                      className="w-3 h-3 rounded-full flex-shrink-0 border border-zinc-600 hover:border-zinc-400"
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
                                        className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-sm focus:border-blue-500 focus:outline-none"
                                        autoFocus
                                      />
                                    ) : (
                                      <span
                                        className="text-sm text-zinc-300 flex-1 truncate cursor-text"
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
                                      className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-white px-1"
                                      title="Rename scene"
                                    >
                                      ✎
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); addPage(scene.id) }}
                                      className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-white px-1"
                                      title="Add page"
                                    >
                                      +
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteScene(scene.id, scene.title || 'Untitled Scene', scene.pages?.length || 0) }}
                                      className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-red-400 px-1"
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
                                          if (e.key === 'Escape') {
                                            e.preventDefault()
                                            setEditingSceneSummaryId(null)
                                          } else if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            saveSceneSummary(scene.id)
                                          }
                                        }}
                                        placeholder="One-sentence scene summary..."
                                        className="w-full text-xs bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-zinc-300 resize-none focus:border-blue-500 focus:outline-none"
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
                                      <p className="text-xs text-zinc-500 italic line-clamp-2 group-hover/summary:text-zinc-400">
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
                                      <p className="text-xs text-zinc-600 italic hover:text-zinc-500">
                                        + Add summary
                                      </p>
                                    </div>
                                  )}

                                  {/* Plotline selector dropdown */}
                                  {editingScenePlotline === scene.id && (
                                    <div className="ml-6 mt-1 mb-2 bg-zinc-800 border border-zinc-700 rounded p-2">
                                      <div className="text-xs text-zinc-400 mb-2">Assign plotline:</div>
                                      <div className="space-y-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            updateScenePlotline(scene.id, null)
                                          }}
                                          className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${
                                            !scene.plotline_id ? 'bg-zinc-700' : 'hover:bg-zinc-700'
                                          }`}
                                        >
                                          <span className="w-2 h-2 rounded-full border border-zinc-500" />
                                          <span className="text-zinc-400">None</span>
                                        </button>
                                        {plotlines.map((plotline) => (
                                          <button
                                            key={plotline.id}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              updateScenePlotline(scene.id, plotline.id)
                                            }}
                                            className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 ${
                                              scene.plotline?.id === plotline.id ? 'bg-zinc-700' : 'hover:bg-zinc-700'
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
                                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handlePageDragEnd(scene.id, e)}>
                                        <SortableContext items={(scene.pages || []).map((p: any) => p.id)} strategy={verticalListSortingStrategy}>
                                          {(scene.pages || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((page: any) => (
                                            <SortableItem key={page.id} id={page.id}>
                                              <div>
                                                <div
                                                  onClick={() => onSelectPage(page.id)}
                                                  className={`px-2 py-1 rounded cursor-grab active:cursor-grabbing text-sm flex items-center gap-1 group/page ${
                                                    selectedPageId === page.id
                                                      ? 'bg-blue-600 text-white'
                                                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                                  }`}
                                                >
                                                  <span className={`text-xs opacity-0 group-hover/page:opacity-100 transition-opacity ${selectedPageId === page.id ? 'text-blue-200' : 'text-zinc-600'}`} title="Drag to reorder">
                                                    ⋮⋮
                                                  </span>
                                                  <span className="flex-1">Page {page.page_number}</span>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      setMovingPageId(movingPageId === page.id ? null : page.id)
                                                    }}
                                                    className={`opacity-0 group-hover/page:opacity-100 text-xs px-1 ${
                                                      selectedPageId === page.id
                                                        ? 'text-blue-200 hover:text-white'
                                                        : 'text-zinc-500 hover:text-white'
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
                                                        : 'text-zinc-500 hover:text-red-400'
                                                    }`}
                                                    title="Delete page"
                                                  >
                                                    ×
                                                  </button>
                                                </div>
                                                {/* Move to scene dropdown */}
                                                {movingPageId === page.id && (
                                                  <div className="ml-4 mt-1 mb-2 bg-zinc-800 border border-zinc-700 rounded p-2 max-h-48 overflow-y-auto">
                                                    <div className="text-xs text-zinc-400 mb-2">Move to scene:</div>
                                                    <div className="space-y-1">
                                                      {allScenes.filter((s: any) => s.id !== scene.id).map((targetScene: any) => (
                                                        <button
                                                          key={targetScene.id}
                                                          onClick={(e) => {
                                                            e.stopPropagation()
                                                            movePageToScene(page.id, targetScene.id)
                                                          }}
                                                          className="w-full text-left text-xs px-2 py-1 rounded hover:bg-zinc-700 flex items-center gap-2"
                                                        >
                                                          <span className="text-zinc-500">{targetScene.actTitle} →</span>
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
                                      </DndContext>
                                    </div>
                                  )}
                                </div>
                              </SortableItem>
                            ))}
                          </SortableContext>
                        </DndContext>
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
