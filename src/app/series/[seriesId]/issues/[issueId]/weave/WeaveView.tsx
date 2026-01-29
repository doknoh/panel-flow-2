'use client'

import { useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
  sort_order: number
}

interface DialogueBlock {
  id: string
  speaker_name: string | null
  text: string | null
  sort_order: number
}

interface Caption {
  id: string
  caption_type: string | null
  text: string | null
  sort_order: number
}

interface Panel {
  id: string
  panel_number: number
  sort_order: number
  visual_description: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
}

interface Page {
  id: string
  page_number: number
  sort_order: number
  story_beat: string | null
  intention: string | null
  visual_motif: string | null
  time_period: string | null
  plotline_id: string | null
  plotline: Plotline | null
  panels?: Panel[]
}

interface Scene {
  id: string
  title: string | null
  name: string | null
  plotline_id: string | null
  plotline: Plotline | null
  pages: Page[]
  sort_order: number
  act_id: string
  intention: string | null
}

interface Act {
  id: string
  title: string | null
  number: number
  scenes: Scene[]
  sort_order: number
}

interface Issue {
  id: string
  number: number
  title: string | null
  series: {
    id: string
    title: string
  }
  plotlines: Plotline[]
  acts: Act[]
}

interface WeaveViewProps {
  issue: Issue
  seriesId: string
}

interface FlatPage {
  page: Page
  scene: Scene
  act: Act
  globalPageNumber: number
  orientation: 'left' | 'right'
}

// Default plotline colors - vibrant and distinct
const PLOTLINE_COLORS = [
  '#FACC15', // Yellow (A plot)
  '#F87171', // Red (B plot)
  '#60A5FA', // Blue (C plot)
  '#4ADE80', // Green (D plot)
  '#C084FC', // Purple (E plot)
  '#FB923C', // Orange
  '#2DD4BF', // Teal
  '#F472B6', // Pink
]

// Page dimensions - comic book aspect ratio (roughly 2:3)
const PAGE_WIDTH = 160
const PAGE_HEIGHT = 220

// Generate a summary from page's panel content
function generatePageSummary(page: Page): string | null {
  if (!page.panels || page.panels.length === 0) return null

  const sortedPanels = [...page.panels].sort((a, b) => a.sort_order - b.sort_order)
  const summaryParts: string[] = []

  for (const panel of sortedPanels) {
    const dialogues = (panel.dialogue_blocks || [])
      .filter(d => d.text)
      .sort((a, b) => a.sort_order - b.sort_order)

    for (const d of dialogues) {
      const speaker = d.speaker_name || 'UNKNOWN'
      const text = d.text || ''
      const snippet = text.length > 30 ? text.substring(0, 30) + '...' : text
      summaryParts.push(`${speaker}: "${snippet}"`)
    }

    const captions = (panel.captions || [])
      .filter(c => c.text)
      .sort((a, b) => a.sort_order - b.sort_order)

    for (const c of captions) {
      const text = c.text || ''
      const snippet = text.length > 40 ? text.substring(0, 40) + '...' : text
      summaryParts.push(`[${c.caption_type || 'caption'}] ${snippet}`)
    }

    if (panel.visual_description) {
      const desc = panel.visual_description
      const snippet = desc.length > 50 ? desc.substring(0, 50) + '...' : desc
      summaryParts.push(snippet)
    }

    if (summaryParts.length >= 3) break
  }

  if (summaryParts.length === 0) return null
  return summaryParts.slice(0, 3).join(' • ')
}

// Sortable individual page component
function SortablePage({
  fp,
  pageIndex,
  isFirstPage,
  isSelected,
  isPartOfSelection,
  selectionCount,
  isJustMoved,
  onSelect,
  onSelectScene,
  onAssignPlotline,
  plotlines,
  editingPageId,
  editingField,
  editValue,
  setEditValue,
  savePageField,
  setEditingPageId,
  setEditingField,
  seriesId,
  issueId,
}: {
  fp: FlatPage
  pageIndex: number
  isFirstPage: boolean
  isSelected: boolean
  isPartOfSelection: boolean
  selectionCount: number
  isJustMoved: boolean
  onSelect: (pageId: string, event: React.MouseEvent) => void
  onSelectScene: (sceneId: string) => void
  onAssignPlotline: (pageId: string, plotlineId: string | null) => void
  plotlines: Plotline[]
  editingPageId: string | null
  editingField: 'story_beat' | 'time_period' | 'visual_motif' | null
  editValue: string
  setEditValue: (v: string) => void
  savePageField: (pageId: string, field: string, value: string) => void
  setEditingPageId: (id: string | null) => void
  setEditingField: (f: 'story_beat' | 'time_period' | 'visual_motif' | null) => void
  seriesId: string
  issueId: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fp.page.id, disabled: isFirstPage })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : (isPartOfSelection && !isSelected ? 0.6 : 1),
    zIndex: isDragging ? 1000 : 1,
  }

  const { page, scene } = fp
  const plotline = page.plotline || scene.plotline
  const plotlineColor = plotline?.color

  // Calculate orientation based on position (page 1 is always right, then alternates)
  const orientation: 'left' | 'right' = pageIndex === 0 ? 'right' : (pageIndex % 2 === 1 ? 'left' : 'right')

  const isEditing = editingPageId === page.id
  const autoSummary = !page.story_beat ? generatePageSummary(page) : null

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Selection checkbox and drag handle */}
      {!isFirstPage && (
        <div className="absolute -top-2 left-0 right-0 z-10 flex items-center justify-between px-1">
          {/* Selection checkbox */}
          <button
            onClick={(e) => onSelect(page.id, e)}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              isSelected
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'bg-[var(--bg-tertiary)]/90 border-[var(--border)] hover:border-[var(--text-secondary)]'
            }`}
            title="Click to select, Shift+click for range, ⌘/Ctrl+click to toggle"
          >
            {isSelected && (
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className={`cursor-grab active:cursor-grabbing px-1.5 py-0.5 rounded transition-all flex items-center gap-1 ${
              isSelected ? 'bg-blue-500/80' : 'bg-[var(--bg-tertiary)]/90 opacity-0 group-hover:opacity-100'
            }`}
            title={isSelected && selectionCount > 1 ? `Drag ${selectionCount} pages` : 'Drag to reorder'}
          >
            <svg className="w-3 h-3 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="8" cy="6" r="2" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="8" cy="12" r="2" />
              <circle cx="16" cy="12" r="2" />
              <circle cx="8" cy="18" r="2" />
              <circle cx="16" cy="18" r="2" />
            </svg>
            {isSelected && selectionCount > 1 && (
              <span className="text-[10px] text-white font-medium">{selectionCount}</span>
            )}
          </div>
        </div>
      )}

      <div
        className={`relative flex flex-col transition-all duration-300 ${
          isDragging ? 'ring-2 ring-blue-500' : ''
        } ${isSelected ? 'ring-2 ring-blue-500' : ''} ${
          isPartOfSelection && !isSelected ? 'ring-1 ring-blue-400/50' : ''
        } ${isJustMoved ? 'ring-2 ring-green-400 shadow-lg shadow-green-500/30' : ''}`}
        style={{
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          backgroundColor: isJustMoved
            ? (plotlineColor ? `${plotlineColor}25` : '#1a2e1a')
            : (plotlineColor ? `${plotlineColor}15` : '#18181b'),
        }}
      >
        {/* Plotline color bar - thick and prominent */}
        {plotlineColor && (
          <div
            className="absolute top-0 left-0 right-0 h-1.5"
            style={{ backgroundColor: plotlineColor }}
          />
        )}

        {/* Page content */}
        <div className={`flex-1 p-2 flex flex-col ${plotlineColor ? 'pt-3' : ''}`}>
          {/* Header: Page number + orientation + plotline selector */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-white">{pageIndex + 1}</span>
              <span className={`text-[8px] uppercase tracking-wide px-1 py-0.5 rounded font-medium ${
                orientation === 'left'
                  ? 'bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)]'
                  : 'bg-[var(--bg-tertiary)]/80 text-[var(--text-primary)]'
              }`}>
                {orientation === 'left' ? 'L' : 'R'}
              </span>
            </div>

            {/* Plotline selector */}
            <select
              value={page.plotline_id || ''}
              onChange={(e) => onAssignPlotline(page.id, e.target.value || null)}
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] bg-[var(--bg-tertiary)]/80 border border-[var(--border)] rounded px-1 py-0.5 max-w-[55px] cursor-pointer"
              style={plotlineColor ? { borderColor: plotlineColor } : {}}
            >
              <option value="">—</option>
              {plotlines.map(pl => (
                <option key={pl.id} value={pl.id}>{pl.name}</option>
              ))}
            </select>
          </div>

          {/* Metadata row: Time period & Visual motif */}
          <div className="flex items-center gap-2 mb-1 min-h-[14px] flex-wrap">
            {/* Time period */}
            {isEditing && editingField === 'time_period' ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => savePageField(page.id, 'time_period', editValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') savePageField(page.id, 'time_period', editValue)
                  if (e.key === 'Escape') { setEditingPageId(null); setEditingField(null) }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-1 py-0.5 text-[9px]"
                placeholder="Year/Era"
                autoFocus
              />
            ) : (
              <button
                className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingPageId(page.id)
                  setEditingField('time_period')
                  setEditValue(page.time_period || '')
                }}
              >
                {page.time_period ? (
                  <span className="text-amber-400/80 font-medium">{page.time_period}</span>
                ) : (
                  <span className="opacity-0 group-hover:opacity-60">+time</span>
                )}
              </button>
            )}

            {/* Visual motif */}
            {isEditing && editingField === 'visual_motif' ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => savePageField(page.id, 'visual_motif', editValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') savePageField(page.id, 'visual_motif', editValue)
                  if (e.key === 'Escape') { setEditingPageId(null); setEditingField(null) }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-1 py-0.5 text-[9px]"
                placeholder="Motif"
                autoFocus
              />
            ) : (
              <button
                className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingPageId(page.id)
                  setEditingField('visual_motif')
                  setEditValue(page.visual_motif || '')
                }}
              >
                {page.visual_motif ? (
                  <span className="text-purple-400/80 font-medium">{page.visual_motif}</span>
                ) : (
                  <span className="opacity-0 group-hover:opacity-60">+motif</span>
                )}
              </button>
            )}
          </div>

          {/* Story beat - main content area */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {isEditing && editingField === 'story_beat' ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => savePageField(page.id, 'story_beat', editValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setEditingPageId(null); setEditingField(null) }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full h-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-1.5 py-1 text-[10px] resize-none"
                placeholder="Story beat..."
                autoFocus
              />
            ) : (
              <div
                className="h-full cursor-pointer hover:bg-white/5 rounded p-0.5 overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingPageId(page.id)
                  setEditingField('story_beat')
                  setEditValue(page.story_beat || '')
                }}
              >
                {page.story_beat ? (
                  <p className="text-[10px] text-[var(--text-primary)] leading-tight line-clamp-5">{page.story_beat}</p>
                ) : autoSummary ? (
                  <p className="text-[9px] text-[var(--text-muted)] leading-tight line-clamp-4 italic">{autoSummary}</p>
                ) : (
                  <p className="text-[9px] text-[var(--text-muted)] italic opacity-0 group-hover:opacity-100">
                    Click to add...
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer: Scene name (click to select scene) + Edit link */}
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--border)]">
            <button
              className="text-[8px] text-[var(--text-muted)] hover:text-blue-400 truncate max-w-[70px] transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onSelectScene(scene.id)
              }}
              title="Select all pages in this scene"
            >
              {scene.title || scene.name || 'Scene'}
            </button>
            <Link
              href={`/series/${seriesId}/issues/${issueId}?page=${page.id}`}
              className="text-[8px] text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              Edit→
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// Render the inside cover placeholder
function InsideCover() {
  return (
    <div
      className="flex items-center justify-center bg-[var(--bg-secondary)]/80 border-r border-[var(--border)]"
      style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
    >
      <span className="text-[var(--text-muted)] text-xs">Inside cover</span>
    </div>
  )
}

export default function WeaveView({ issue: initialIssue, seriesId }: WeaveViewProps) {
  // Local state for optimistic updates
  const [issue, setIssue] = useState<Issue>(initialIssue)
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'story_beat' | 'time_period' | 'visual_motif' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showPlotlineManager, setShowPlotlineManager] = useState(false)
  const [newPlotlineName, setNewPlotlineName] = useState('')
  const [editingPlotlineId, setEditingPlotlineId] = useState<string | null>(null)
  const [editingPlotlineColor, setEditingPlotlineColor] = useState('')
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [lastSelectedPageId, setLastSelectedPageId] = useState<string | null>(null)
  const [justMovedPageIds, setJustMovedPageIds] = useState<Set<string>>(new Set())
  // Local page order for instant drag-and-drop updates (array of page IDs)
  const [localPageOrder, setLocalPageOrder] = useState<string[] | null>(null)
  const { showToast } = useToast()
  const router = useRouter()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Compute base flatPages from issue structure (used as source of truth for page data)
  const baseFlatPages = useMemo<FlatPage[]>(() => {
    const pages: FlatPage[] = []
    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const act of sortedActs) {
      const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)
      for (const scene of sortedScenes) {
        const sortedPages = [...(scene.pages || [])].sort((a, b) => a.sort_order - b.sort_order)
        for (const page of sortedPages) {
          pages.push({
            page,
            scene,
            act,
            globalPageNumber: pages.length + 1,
            orientation: 'right',
          })
        }
      }
    }

    return pages
  }, [issue])

  // Create a map for quick page lookup
  const pageMap = useMemo(() => {
    const map = new Map<string, FlatPage>()
    for (const fp of baseFlatPages) {
      map.set(fp.page.id, fp)
    }
    return map
  }, [baseFlatPages])

  // Final flatPages: use localPageOrder if set, otherwise use baseFlatPages order
  const flatPages = useMemo<FlatPage[]>(() => {
    let pages: FlatPage[]

    if (localPageOrder) {
      // Use local order for instant updates
      pages = localPageOrder
        .map(id => pageMap.get(id))
        .filter((fp): fp is FlatPage => fp !== undefined)
    } else {
      pages = baseFlatPages
    }

    // Set orientations and global page numbers based on position
    return pages.map((fp, i) => ({
      ...fp,
      globalPageNumber: i + 1,
      orientation: i === 0 ? 'right' : (i % 2 === 1 ? 'left' : 'right'),
    }))
  }, [localPageOrder, baseFlatPages, pageMap])

  const plotlines = issue.plotlines || []

  // Handle page selection
  const handleSelectPage = useCallback((pageId: string, event: React.MouseEvent) => {
    const pageIdx = flatPages.findIndex(fp => fp.page.id === pageId)
    if (pageIdx === 0) return // Can't select page 1

    if (event.shiftKey && lastSelectedPageId) {
      // Range selection
      const lastIdx = flatPages.findIndex(fp => fp.page.id === lastSelectedPageId)
      const start = Math.min(pageIdx, lastIdx)
      const end = Math.max(pageIdx, lastIdx)
      const newSelection = new Set(selectedPageIds)
      for (let i = start; i <= end; i++) {
        if (i > 0) { // Skip page 1
          newSelection.add(flatPages[i].page.id)
        }
      }
      setSelectedPageIds(newSelection)
    } else if (event.metaKey || event.ctrlKey) {
      // Toggle selection
      const newSelection = new Set(selectedPageIds)
      if (newSelection.has(pageId)) {
        newSelection.delete(pageId)
      } else {
        newSelection.add(pageId)
      }
      setSelectedPageIds(newSelection)
      setLastSelectedPageId(pageId)
    } else {
      // Single selection (toggle if already selected alone)
      if (selectedPageIds.has(pageId) && selectedPageIds.size === 1) {
        setSelectedPageIds(new Set())
      } else {
        setSelectedPageIds(new Set([pageId]))
      }
      setLastSelectedPageId(pageId)
    }
  }, [flatPages, lastSelectedPageId, selectedPageIds])

  // Select all pages in a scene
  const handleSelectScene = useCallback((sceneId: string) => {
    const scenePagesIds = flatPages
      .filter(fp => fp.scene.id === sceneId && flatPages.indexOf(fp) > 0) // Exclude page 1
      .map(fp => fp.page.id)

    if (scenePagesIds.length === 0) return

    // If all scene pages are already selected, deselect them
    const allSelected = scenePagesIds.every(id => selectedPageIds.has(id))
    if (allSelected) {
      const newSelection = new Set(selectedPageIds)
      scenePagesIds.forEach(id => newSelection.delete(id))
      setSelectedPageIds(newSelection)
    } else {
      // Select all scene pages
      const newSelection = new Set(selectedPageIds)
      scenePagesIds.forEach(id => newSelection.add(id))
      setSelectedPageIds(newSelection)
    }
    showToast(allSelected ? 'Scene deselected' : `Selected ${scenePagesIds.length} pages`, 'success')
  }, [flatPages, selectedPageIds, showToast])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedPageIds(new Set())
    setLastSelectedPageId(null)
  }, [])

  // Handle drag end - reorder pages (including multi-select)
  // Uses optimistic UI update + batched database writes for responsiveness
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActivePageId(null)

    if (!over || active.id === over.id) return

    const activeIdx = flatPages.findIndex(fp => fp.page.id === active.id)
    const overIdx = flatPages.findIndex(fp => fp.page.id === over.id)

    if (activeIdx === -1 || overIdx === -1) return

    // Don't allow moving page 1
    if (activeIdx === 0) {
      showToast('Cannot move the first page', 'error')
      return
    }

    // Get pages to move (either selected pages or just the dragged one)
    let pagesToMove: string[] = []
    if (selectedPageIds.has(active.id as string) && selectedPageIds.size > 1) {
      // Moving multiple selected pages - maintain their relative order
      pagesToMove = flatPages
        .filter(fp => selectedPageIds.has(fp.page.id))
        .map(fp => fp.page.id)
    } else {
      pagesToMove = [active.id as string]
    }

    // Create new order
    const newPages = flatPages.filter(fp => !pagesToMove.includes(fp.page.id))

    // Find insert position
    let insertIdx = newPages.findIndex(fp => fp.page.id === over.id)
    if (insertIdx === -1) insertIdx = newPages.length

    // If dragging forward, adjust insert position
    if (activeIdx < overIdx) {
      insertIdx++
    }

    // Insert moved pages at new position
    const movedPages = flatPages.filter(fp => pagesToMove.includes(fp.page.id))
    newPages.splice(insertIdx, 0, ...movedPages)

    // Only update pages whose sort_order actually changed
    const updates: { id: string; sort_order: number }[] = []
    for (let i = 0; i < newPages.length; i++) {
      const originalIdx = flatPages.findIndex(fp => fp.page.id === newPages[i].page.id)
      if (originalIdx !== i) {
        updates.push({ id: newPages[i].page.id, sort_order: i })
      }
    }

    if (updates.length === 0) return

    // INSTANT OPTIMISTIC UPDATE: Update local page order immediately
    // This directly controls the rendering order, bypassing the nested structure
    const newPageOrder = newPages.map(fp => fp.page.id)
    setLocalPageOrder(newPageOrder)

    // Mark moved pages for visual highlight
    setJustMovedPageIds(new Set(pagesToMove))

    // Clear selection
    clearSelection()

    // Show brief feedback
    showToast(`${pagesToMove.length > 1 ? pagesToMove.length + ' pages' : 'Page'} moved`, 'success')

    // Batch database updates in the background
    const supabase = createClient()

    // Use Promise.all for parallel updates (much faster than sequential)
    try {
      await Promise.all(
        updates.map(({ id, sort_order }) =>
          supabase.from('pages').update({ sort_order }).eq('id', id)
        )
      )

      // Clear the "just moved" highlight after a delay
      setTimeout(() => {
        setJustMovedPageIds(new Set())
      }, 2000)
    } catch (error) {
      showToast('Failed to save reorder - please refresh', 'error')
      console.error('Reorder error:', error)
      setJustMovedPageIds(new Set())
      // On error, reset local page order to revert to server state
      setLocalPageOrder(null)
      router.refresh()
    }
  }, [flatPages, selectedPageIds, showToast, clearSelection, router])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActivePageId(event.active.id as string)
  }, [])

  const savePageField = async (pageId: string, field: string, value: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({ [field]: value || null })
      .eq('id', pageId)

    if (error) {
      showToast(`Failed to save ${field}`, 'error')
    } else {
      // Optimistic update - update local state immediately
      setIssue((prevIssue) => ({
        ...prevIssue,
        acts: prevIssue.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            pages: scene.pages.map((page) =>
              page.id === pageId ? { ...page, [field]: value || null } : page
            ),
          })),
        })),
      }))
      showToast('Saved', 'success')
    }
    setEditingPageId(null)
    setEditingField(null)
  }

  const assignPlotline = async (pageId: string, plotlineId: string | null) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({ plotline_id: plotlineId })
      .eq('id', pageId)

    if (error) {
      showToast('Failed to assign plotline', 'error')
    } else {
      // Optimistic update - update local state immediately
      const plotline = plotlineId ? issue.plotlines.find(p => p.id === plotlineId) || null : null
      setIssue((prevIssue) => ({
        ...prevIssue,
        acts: prevIssue.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            pages: scene.pages.map((page) =>
              page.id === pageId ? { ...page, plotline_id: plotlineId, plotline } : page
            ),
          })),
        })),
      }))
    }
  }

  const createPlotline = async () => {
    if (!newPlotlineName.trim()) return

    const supabase = createClient()
    const nextColor = PLOTLINE_COLORS[plotlines.length % PLOTLINE_COLORS.length]

    const { data: newPlotline, error } = await supabase
      .from('plotlines')
      .insert({
        issue_id: issue.id,
        name: newPlotlineName.trim(),
        color: nextColor,
        sort_order: plotlines.length,
      })
      .select()
      .single()

    if (error) {
      showToast('Failed to create plotline', 'error')
    } else if (newPlotline) {
      // Optimistic update - add the new plotline to local state
      setIssue((prevIssue) => ({
        ...prevIssue,
        plotlines: [...prevIssue.plotlines, newPlotline],
      }))
      showToast('Plotline created', 'success')
      setNewPlotlineName('')
    }
  }

  const deletePlotline = async (plotlineId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('plotlines')
      .delete()
      .eq('id', plotlineId)

    if (error) {
      showToast('Failed to delete plotline', 'error')
    } else {
      // Optimistic update - remove the plotline from local state
      setIssue((prevIssue) => ({
        ...prevIssue,
        plotlines: prevIssue.plotlines.filter(p => p.id !== plotlineId),
        // Also clear plotline_id from any pages that had it
        acts: prevIssue.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            pages: scene.pages.map((page) =>
              page.plotline_id === plotlineId ? { ...page, plotline_id: null, plotline: null } : page
            ),
          })),
        })),
      }))
      showToast('Plotline deleted', 'success')
    }
  }

  const updatePlotlineColor = async (plotlineId: string, color: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('plotlines')
      .update({ color })
      .eq('id', plotlineId)

    if (error) {
      showToast('Failed to update color', 'error')
    } else {
      // Optimistic update - update the plotline color in local state
      setIssue((prevIssue) => ({
        ...prevIssue,
        plotlines: prevIssue.plotlines.map(p =>
          p.id === plotlineId ? { ...p, color } : p
        ),
        // Also update the color for pages that reference this plotline
        acts: prevIssue.acts.map((act) => ({
          ...act,
          scenes: act.scenes.map((scene) => ({
            ...scene,
            pages: scene.pages.map((page) =>
              page.plotline_id === plotlineId && page.plotline
                ? { ...page, plotline: { ...page.plotline, color } }
                : page
            ),
          })),
        })),
      }))
      setEditingPlotlineId(null)
    }
  }

  const activePage = activePageId ? flatPages.find(fp => fp.page.id === activePageId) : null
  const selectedCount = selectedPageIds.size

  // Empty state
  if (flatPages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-12 text-center max-w-md">
          <div className="text-6xl mb-4 opacity-30">🧵</div>
          <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">No pages to weave yet</h3>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            The Weave shows your story beats arranged across physical page spreads.
            Add some pages to your issue first.
          </p>
          <Link
            href={`/series/${seriesId}/issues/${issue.id}`}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            ← Back to Editor
          </Link>
        </div>
      </div>
    )
  }

  // Group pages into visual spreads (for display only, drag is per-page)
  const spreads: { left: FlatPage | null; right: FlatPage | null; isFirst: boolean }[] = []

  // First spread: inside cover + page 1
  if (flatPages.length >= 1) {
    spreads.push({ left: null, right: flatPages[0], isFirst: true })
  }

  // Remaining spreads
  for (let i = 1; i < flatPages.length; i += 2) {
    spreads.push({
      left: flatPages[i] || null,
      right: flatPages[i + 1] || null,
      isFirst: false,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[var(--bg-secondary)]/50 border border-[var(--border)] rounded-lg px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--text-secondary)] font-medium">
            {flatPages.length} pages • {spreads.length} spreads
          </span>
          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-400 font-medium">
                {selectedCount} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-xs text-[var(--text-secondary)] hover:text-white px-2 py-0.5 bg-[var(--bg-tertiary)] rounded"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowPlotlineManager(!showPlotlineManager)}
          className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm font-medium transition-colors"
        >
          {showPlotlineManager ? 'Hide' : 'Manage'} Plotlines
        </button>
      </div>

      {/* Plotline Manager */}
      {showPlotlineManager && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4">Plotlines</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {plotlines.map((pl) => (
              <div
                key={pl.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm relative border"
                style={{
                  backgroundColor: pl.color + '20',
                  borderColor: pl.color + '60',
                }}
              >
                <button
                  className="w-5 h-5 rounded-full border-2 border-white/40 hover:scale-110 transition-transform shadow-sm"
                  style={{ backgroundColor: pl.color }}
                  onClick={() => {
                    setEditingPlotlineId(editingPlotlineId === pl.id ? null : pl.id)
                    setEditingPlotlineColor(pl.color)
                  }}
                  title="Change color"
                />
                <span className="font-medium">{pl.name}</span>
                <button
                  onClick={() => deletePlotline(pl.id)}
                  className="text-[var(--text-secondary)] hover:text-red-400 ml-1 text-lg leading-none"
                >
                  ×
                </button>

                {editingPlotlineId === pl.id && (
                  <div className="absolute top-full left-0 mt-2 p-3 bg-[var(--bg-tertiary)] rounded-lg shadow-xl border border-[var(--border)] z-50">
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {PLOTLINE_COLORS.map((color) => (
                        <button
                          key={color}
                          className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
                            editingPlotlineColor === color ? 'border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => updatePlotlineColor(pl.id, color)}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      value={editingPlotlineColor}
                      onChange={(e) => setEditingPlotlineColor(e.target.value)}
                      onBlur={() => updatePlotlineColor(pl.id, editingPlotlineColor)}
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>
                )}
              </div>
            ))}
            {plotlines.length === 0 && (
              <span className="text-sm text-[var(--text-muted)] py-2">No plotlines yet — create one to start color-coding your pages</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPlotlineName}
              onChange={(e) => setNewPlotlineName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createPlotline()}
              placeholder="New plotline (e.g., A Plot - Marshall's Story)"
              className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={createPlotline}
              disabled={!newPlotlineName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] rounded-lg text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Legend - always show if plotlines exist */}
      {plotlines.length > 0 && !showPlotlineManager && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2">
          {plotlines.map((pl) => (
            <div key={pl.id} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded shadow-sm"
                style={{ backgroundColor: pl.color }}
              />
              <span className="text-sm text-[var(--text-secondary)]">{pl.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pages View - Individual page dragging with multi-select */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={flatPages.map(fp => fp.page.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="py-4 space-y-8">
            {spreads.map((spread, spreadIdx) => (
              <div key={spreadIdx} className="flex items-center justify-center gap-1">
                {/* Left side */}
                {spread.isFirst ? (
                  <InsideCover />
                ) : spread.left ? (
                  <SortablePage
                    fp={spread.left}
                    pageIndex={flatPages.findIndex(fp => fp.page.id === spread.left!.page.id)}
                    isFirstPage={false}
                    isSelected={selectedPageIds.has(spread.left.page.id)}
                    isPartOfSelection={selectedCount > 0 && selectedPageIds.has(spread.left.page.id)}
                    selectionCount={selectedCount}
                    isJustMoved={justMovedPageIds.has(spread.left.page.id)}
                    onSelect={handleSelectPage}
                    onSelectScene={handleSelectScene}
                    onAssignPlotline={assignPlotline}
                    plotlines={plotlines}
                    editingPageId={editingPageId}
                    editingField={editingField}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    savePageField={savePageField}
                    setEditingPageId={setEditingPageId}
                    setEditingField={setEditingField}
                    seriesId={seriesId}
                    issueId={issue.id}
                  />
                ) : (
                  <div style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }} className="bg-[var(--bg-secondary)]/30" />
                )}

                {/* Spine */}
                <div className="w-2 bg-[var(--bg-tertiary)] flex items-center justify-center" style={{ height: PAGE_HEIGHT }}>
                  <div className="w-px h-[90%] bg-[var(--bg-tertiary)]" />
                </div>

                {/* Right side */}
                {spread.right ? (
                  <SortablePage
                    fp={spread.right}
                    pageIndex={flatPages.findIndex(fp => fp.page.id === spread.right!.page.id)}
                    isFirstPage={spread.isFirst}
                    isSelected={selectedPageIds.has(spread.right.page.id)}
                    isPartOfSelection={selectedCount > 0 && selectedPageIds.has(spread.right.page.id)}
                    selectionCount={selectedCount}
                    isJustMoved={justMovedPageIds.has(spread.right.page.id)}
                    onSelect={handleSelectPage}
                    onSelectScene={handleSelectScene}
                    onAssignPlotline={assignPlotline}
                    plotlines={plotlines}
                    editingPageId={editingPageId}
                    editingField={editingField}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    savePageField={savePageField}
                    setEditingPageId={setEditingPageId}
                    setEditingField={setEditingField}
                    seriesId={seriesId}
                    issueId={issue.id}
                  />
                ) : (
                  <div style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }} className="bg-[var(--bg-secondary)]/30" />
                )}
              </div>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activePage && (
            <div className="relative">
              {/* Show stack effect for multi-select */}
              {selectedPageIds.has(activePage.page.id) && selectedCount > 1 && (
                <>
                  <div
                    className="absolute top-2 left-2 rounded-lg bg-[var(--bg-tertiary)]/80"
                    style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
                  />
                  <div
                    className="absolute top-1 left-1 rounded-lg bg-[var(--bg-tertiary)]/80"
                    style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
                  />
                </>
              )}
              <div
                className="relative rounded-lg ring-2 ring-blue-500 shadow-2xl shadow-blue-500/30"
                style={{
                  width: PAGE_WIDTH,
                  height: PAGE_HEIGHT,
                  backgroundColor: activePage.page.plotline?.color ? `${activePage.page.plotline.color}15` : '#18181b',
                }}
              >
                {/* Badge showing count */}
                {selectedPageIds.has(activePage.page.id) && selectedCount > 1 && (
                  <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                    {selectedCount}
                  </div>
                )}
                {/* Simplified drag preview */}
                <div className="p-2 h-full flex flex-col">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-lg font-bold text-white">
                      {flatPages.findIndex(fp => fp.page.id === activePage.page.id) + 1}
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-[10px] text-[var(--text-secondary)] line-clamp-4">
                      {activePage.page.story_beat || generatePageSummary(activePage.page) || 'Page content...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Instructions - collapsible */}
      <details className="bg-[var(--bg-secondary)]/30 border border-[var(--border)] rounded-lg">
        <summary className="px-4 py-3 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-secondary)]">
          How to use The Weave
        </summary>
        <div className="px-4 pb-4 text-sm text-[var(--text-muted)] space-y-1.5">
          <p>• <strong className="text-[var(--text-secondary)]">Select pages</strong> with checkboxes (Shift+click for range, ⌘/Ctrl+click to toggle)</p>
          <p>• <strong className="text-[var(--text-secondary)]">Click scene name</strong> to select all pages in that scene</p>
          <p>• <strong className="text-[var(--text-secondary)]">Drag selected pages</strong> to reorder them together</p>
          <p>• <strong className="text-[var(--text-secondary)]">L/R orientation auto-updates</strong> based on position</p>
          <p>• <strong className="text-[var(--text-secondary)]">Click any page</strong> to add a story beat</p>
          <p>• <strong className="text-[var(--text-secondary)]">Assign plotlines</strong> via the dropdown</p>
        </div>
      </details>
    </div>
  )
}
