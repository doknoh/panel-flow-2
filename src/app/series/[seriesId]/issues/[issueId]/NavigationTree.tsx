'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

export default function NavigationTree({ issue, plotlines, selectedPageId, onSelectPage, onRefresh }: NavigationTreeProps) {
  const [expandedActs, setExpandedActs] = useState<Set<string>>(new Set(issue.acts?.map((a: any) => a.id) || []))
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set())
  const [isMounted, setIsMounted] = useState(false)
  const [editingScenePlotline, setEditingScenePlotline] = useState<string | null>(null)

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

  const addAct = async () => {
    const supabase = createClient()
    const actNumber = (issue.acts?.length || 0) + 1

    const { error } = await supabase.from('acts').insert({
      issue_id: issue.id,
      number: actNumber,
      title: `Act ${actNumber}`,
      sort_order: actNumber,
    })

    if (!error) onRefresh()
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

    if (!error) {
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

    if (!error && data) {
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
        <p className="text-sm text-zinc-500 text-center py-4">
          No acts yet. Click "+ Act" to create one.
        </p>
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
                      onClick={() => toggleAct(act.id)}
                    >
                      <span className="text-zinc-500 text-xs">
                        {expandedActs.has(act.id) ? '▼' : '▶'}
                      </span>
                      <span className="font-medium text-sm flex-1">
                        {act.title || `Act ${act.number}`}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); addScene(act.id) }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-white"
                      >
                        +
                      </button>
                    </div>

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
                                    onClick={() => toggleScene(scene.id)}
                                  >
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
                                    <span className="text-sm text-zinc-300 flex-1 truncate">
                                      {scene.title || 'Untitled Scene'}
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); addPage(scene.id) }}
                                      className="opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-white"
                                    >
                                      +
                                    </button>
                                  </div>
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
                                              <div
                                                onClick={() => onSelectPage(page.id)}
                                                className={`px-2 py-1 rounded cursor-grab active:cursor-grabbing text-sm ${
                                                  selectedPageId === page.id
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                                }`}
                                              >
                                                Page {page.page_number}
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
