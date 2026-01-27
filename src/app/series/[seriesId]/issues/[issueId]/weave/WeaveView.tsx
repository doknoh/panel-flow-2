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
  verticalListSortingStrategy,
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

// Default plotline colors
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

// Generate a summary from page's panel content
function generatePageSummary(page: Page): string | null {
  if (!page.panels || page.panels.length === 0) return null

  const sortedPanels = [...page.panels].sort((a, b) => a.sort_order - b.sort_order)
  const summaryParts: string[] = []

  for (const panel of sortedPanels) {
    // Get dialogue speakers and snippets
    const dialogues = (panel.dialogue_blocks || [])
      .filter(d => d.text)
      .sort((a, b) => a.sort_order - b.sort_order)

    for (const d of dialogues) {
      const speaker = d.speaker_name || 'UNKNOWN'
      const text = d.text || ''
      // Truncate long dialogue
      const snippet = text.length > 40 ? text.substring(0, 40) + '...' : text
      summaryParts.push(`${speaker}: "${snippet}"`)
    }

    // Get captions
    const captions = (panel.captions || [])
      .filter(c => c.text)
      .sort((a, b) => a.sort_order - b.sort_order)

    for (const c of captions) {
      const text = c.text || ''
      const snippet = text.length > 50 ? text.substring(0, 50) + '...' : text
      summaryParts.push(`[${c.caption_type || 'caption'}] ${snippet}`)
    }

    // If no dialogue/captions, use visual description
    if (dialogues.length === 0 && captions.length === 0 && panel.visual_description) {
      const desc = panel.visual_description
      const snippet = desc.length > 60 ? desc.substring(0, 60) + '...' : desc
      summaryParts.push(snippet)
    }
  }

  // Return first 2-3 meaningful items
  return summaryParts.slice(0, 3).join(' • ') || null
}

interface FlatPage {
  page: Page
  scene: Scene
  act: Act
  globalPageNumber: number
  orientation: 'left' | 'right'
}

interface Spread {
  left: FlatPage | null
  right: FlatPage | null
  spreadNumber: number
  id: string
}

// Sortable spread component
function SortableSpread({
  spread,
  spreadIdx,
  actStartPages,
  renderPageCell,
  isActStart,
  actTitle,
}: {
  spread: Spread
  spreadIdx: number
  actStartPages: Map<string, number>
  renderPageCell: (fp: FlatPage | null, orientation: 'left' | 'right', isDragging?: boolean) => React.ReactNode
  isActStart: boolean
  actTitle: string | null | undefined
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: spread.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {/* Act divider */}
      {isActStart && spreadIdx > 0 && (
        <div className="flex items-center gap-4 py-4">
          <div className="flex-1 h-px bg-zinc-700" />
          <span className="text-sm font-medium text-zinc-400 px-3 py-1 bg-zinc-800 rounded">
            {actTitle || `Act ${spreadIdx > 0 ? 'II' : 'I'}`}
          </span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>
      )}

      {/* Spread container */}
      <div className="flex justify-center mb-4">
        <div
          className={`bg-zinc-900 border rounded-lg overflow-hidden flex relative group ${
            isDragging ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-zinc-800'
          }`}
        >
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="absolute -left-8 top-1/2 -translate-y-1/2 w-6 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <div className="flex flex-col gap-1">
              <div className="flex gap-0.5">
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
              </div>
              <div className="flex gap-0.5">
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
              </div>
              <div className="flex gap-0.5">
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
              </div>
            </div>
          </div>

          {/* Gutter indicator for non-first spreads */}
          {spreadIdx > 0 && spread.left && (
            <>
              {renderPageCell(spread.left, 'left', isDragging)}
              {/* Gutter/spine */}
              <div className="w-2 bg-zinc-800 flex items-center justify-center">
                <div className="w-px h-full bg-zinc-700" />
              </div>
              {renderPageCell(spread.right, 'right', isDragging)}
            </>
          )}
          {/* First spread (just page 1) */}
          {spreadIdx === 0 && (
            <div className="flex">
              <div className="w-[280px] h-[140px] bg-zinc-800/50 flex items-center justify-center border-r border-zinc-700">
                <span className="text-zinc-600 text-sm">Inside cover</span>
              </div>
              <div className="w-2 bg-zinc-800 flex items-center justify-center">
                <div className="w-px h-full bg-zinc-700" />
              </div>
              {renderPageCell(spread.right, 'right', isDragging)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WeaveView({ issue, seriesId }: WeaveViewProps) {
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'story_beat' | 'time_period' | 'visual_motif' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showPlotlineManager, setShowPlotlineManager] = useState(false)
  const [newPlotlineName, setNewPlotlineName] = useState('')
  const [editingPlotlineId, setEditingPlotlineId] = useState<string | null>(null)
  const [editingPlotlineColor, setEditingPlotlineColor] = useState('')
  const [activeSpreadId, setActiveSpreadId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { showToast } = useToast()
  const router = useRouter()

  // Sensors for drag and drop
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

  // Flatten all pages with their context
  const flatPages = useMemo<FlatPage[]>(() => {
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
            orientation: 'right', // Will be set below
          })
        }
      }
    }

    // Set orientations: Page 1 is right, then alternates in spreads
    for (let i = 0; i < pages.length; i++) {
      const pageNum = i + 1
      if (pageNum === 1) {
        pages[i].orientation = 'right'
      } else {
        // After page 1, even pages are left, odd are right
        pages[i].orientation = pageNum % 2 === 0 ? 'left' : 'right'
      }
    }

    return pages
  }, [issue])

  // Group pages into spreads
  const spreads = useMemo<Spread[]>(() => {
    const result: Spread[] = []

    if (flatPages.length === 0) return result

    // Page 1 is a solo right page (opening)
    if (flatPages.length >= 1) {
      result.push({
        left: null,
        right: flatPages[0],
        spreadNumber: 0,
        id: `spread-0-${flatPages[0].page.id}`,
      })
    }

    // Remaining pages form spreads (2-3, 4-5, 6-7, etc.)
    for (let i = 1; i < flatPages.length; i += 2) {
      const leftPage = flatPages[i] || null
      const rightPage = flatPages[i + 1] || null
      result.push({
        left: leftPage,
        right: rightPage,
        spreadNumber: result.length,
        id: `spread-${result.length}-${leftPage?.page.id || 'empty'}-${rightPage?.page.id || 'empty'}`,
      })
    }

    return result
  }, [flatPages])

  // Get act boundaries for visual separation
  const actStartPages = useMemo(() => {
    const starts: Map<string, number> = new Map()
    for (const fp of flatPages) {
      if (!starts.has(fp.act.id)) {
        starts.set(fp.act.id, fp.globalPageNumber)
      }
    }
    return starts
  }, [flatPages])

  // Plotlines from the issue
  const plotlines = issue.plotlines || []

  // Handle drag end - reorder pages
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveSpreadId(null)

    if (!over || active.id === over.id) return

    const activeIdx = spreads.findIndex(s => s.id === active.id)
    const overIdx = spreads.findIndex(s => s.id === over.id)

    if (activeIdx === -1 || overIdx === -1) return
    if (activeIdx === 0 || overIdx === 0) {
      // Don't allow moving the opening spread
      showToast('Cannot reorder the opening page', 'error')
      return
    }

    setIsSaving(true)

    // Collect all page IDs in order after the move
    const newSpreads = [...spreads]
    const [movedSpread] = newSpreads.splice(activeIdx, 1)
    newSpreads.splice(overIdx, 0, movedSpread)

    // Flatten to get new page order
    const newPageOrder: string[] = []
    for (const spread of newSpreads) {
      if (spread.left) newPageOrder.push(spread.left.page.id)
      if (spread.right) newPageOrder.push(spread.right.page.id)
    }

    // Update all page sort_orders in database
    const supabase = createClient()

    try {
      // Update each page's sort_order
      for (let i = 0; i < newPageOrder.length; i++) {
        const { error } = await supabase
          .from('pages')
          .update({ sort_order: i })
          .eq('id', newPageOrder[i])

        if (error) throw error
      }

      showToast('Pages reordered', 'success')
      router.refresh()
    } catch (error) {
      showToast('Failed to reorder pages', 'error')
      console.error('Reorder error:', error)
    } finally {
      setIsSaving(false)
    }
  }, [spreads, router, showToast])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveSpreadId(event.active.id as string)
  }, [])

  // Save page field
  const savePageField = async (pageId: string, field: string, value: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({ [field]: value || null })
      .eq('id', pageId)

    if (error) {
      showToast(`Failed to save ${field}`, 'error')
    } else {
      showToast('Saved', 'success')
      router.refresh()
    }
    setEditingPageId(null)
    setEditingField(null)
  }

  // Assign plotline to page
  const assignPlotline = async (pageId: string, plotlineId: string | null) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('pages')
      .update({ plotline_id: plotlineId })
      .eq('id', pageId)

    if (error) {
      showToast('Failed to assign plotline', 'error')
    } else {
      router.refresh()
    }
  }

  // Create new plotline
  const createPlotline = async () => {
    if (!newPlotlineName.trim()) return

    const supabase = createClient()
    const nextColor = PLOTLINE_COLORS[plotlines.length % PLOTLINE_COLORS.length]

    const { error } = await supabase
      .from('plotlines')
      .insert({
        issue_id: issue.id,
        name: newPlotlineName.trim(),
        color: nextColor,
        sort_order: plotlines.length,
      })

    if (error) {
      showToast('Failed to create plotline', 'error')
    } else {
      setNewPlotlineName('')
      showToast('Plotline created', 'success')
      router.refresh()
    }
  }

  // Delete plotline
  const deletePlotline = async (plotlineId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('plotlines')
      .delete()
      .eq('id', plotlineId)

    if (error) {
      showToast('Failed to delete plotline', 'error')
    } else {
      router.refresh()
    }
  }

  // Update plotline color
  const updatePlotlineColor = async (plotlineId: string, color: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('plotlines')
      .update({ color })
      .eq('id', plotlineId)

    if (error) {
      showToast('Failed to update color', 'error')
    } else {
      setEditingPlotlineId(null)
      router.refresh()
    }
  }

  // Render a single page cell
  const renderPageCell = useCallback((fp: FlatPage | null, orientation: 'left' | 'right', isDragging?: boolean) => {
    if (!fp) {
      return (
        <div className={`w-[280px] h-[140px] ${orientation === 'left' ? 'border-r border-zinc-700' : ''}`}>
          {/* Empty cell */}
        </div>
      )
    }

    const { page, scene, globalPageNumber } = fp
    const plotline = page.plotline || scene.plotline
    const bgColor = plotline?.color || '#3F3F46' // zinc-700 default

    const isEditing = editingPageId === page.id

    return (
      <div
        className={`w-[280px] min-h-[140px] p-3 relative group transition-all ${
          orientation === 'left' ? 'border-r border-zinc-700' : ''
        } ${isDragging ? 'opacity-50' : ''}`}
        style={{ backgroundColor: bgColor + '30' }}
      >
        {/* Page number and orientation badge */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{globalPageNumber}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              orientation === 'left' ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-600 text-zinc-200'
            }`}>
              {orientation.toUpperCase()}
            </span>
          </div>

          {/* Plotline selector */}
          <select
            value={page.plotline_id || ''}
            onChange={(e) => assignPlotline(page.id, e.target.value || null)}
            className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={plotline ? { borderColor: plotline.color } : {}}
          >
            <option value="">No plotline</option>
            {plotlines.map(pl => (
              <option key={pl.id} value={pl.id}>{pl.name}</option>
            ))}
          </select>
        </div>

        {/* Time period row */}
        <div className="flex items-center gap-2 mb-1">
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
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-xs"
              placeholder="Time period (e.g., 2023)"
              autoFocus
            />
          ) : (
            <div
              className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-300 flex items-center gap-1"
              onClick={() => {
                setEditingPageId(page.id)
                setEditingField('time_period')
                setEditValue(page.time_period || '')
              }}
            >
              <span className="text-zinc-600">⏰</span>
              {page.time_period || <span className="opacity-0 group-hover:opacity-50">+ Time</span>}
            </div>
          )}
        </div>

        {/* Visual motif row */}
        <div className="flex items-center gap-2 mb-2">
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
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-xs"
              placeholder="Visual motif (e.g., rain, mirrors)"
              autoFocus
            />
          ) : (
            <div
              className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-300 flex items-center gap-1"
              onClick={() => {
                setEditingPageId(page.id)
                setEditingField('visual_motif')
                setEditValue(page.visual_motif || '')
              }}
            >
              <span className="text-zinc-600">🎨</span>
              {page.visual_motif || <span className="opacity-0 group-hover:opacity-50">+ Motif</span>}
            </div>
          )}
        </div>

        {/* Story beat (main content) */}
        {(() => {
          // Generate summary from panel content if no story_beat is set
          const autoSummary = !page.story_beat ? generatePageSummary(page) : null
          const displayContent = page.story_beat || autoSummary

          if (isEditing && editingField === 'story_beat') {
            return (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => savePageField(page.id, 'story_beat', editValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setEditingPageId(null); setEditingField(null) }
                }}
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm resize-none"
                placeholder="Story beat..."
                rows={2}
                autoFocus
              />
            )
          }

          return (
            <div
              className="text-sm cursor-pointer hover:bg-white/5 rounded px-1 py-0.5 -mx-1 min-h-[40px]"
              onClick={() => {
                setEditingPageId(page.id)
                setEditingField('story_beat')
                setEditValue(page.story_beat || '')
              }}
            >
              {page.story_beat ? (
                <span className="text-zinc-200">{page.story_beat}</span>
              ) : autoSummary ? (
                <span className="text-zinc-400 text-xs leading-relaxed">{autoSummary}</span>
              ) : (
                <span className="text-zinc-500 italic opacity-0 group-hover:opacity-100">
                  Click to add story beat...
                </span>
              )}
            </div>
          )
        })()}

        {/* Scene/Act indicator */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] text-zinc-500">
          <span className="truncate">
            {scene.title || scene.name || 'Scene'}
          </span>
          <Link
            href={`/series/${seriesId}/issues/${issue.id}?page=${page.id}`}
            className="text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100"
          >
            Edit →
          </Link>
        </div>

        {/* Plotline color bar */}
        {plotline && (
          <div
            className="absolute top-0 left-0 right-0 h-1"
            style={{ backgroundColor: plotline.color }}
          />
        )}
      </div>
    )
  }, [editingPageId, editingField, editValue, plotlines, seriesId, issue.id, assignPlotline, savePageField])

  // Get active spread for drag overlay
  const activeSpread = activeSpreadId ? spreads.find(s => s.id === activeSpreadId) : null

  // Empty state
  if (flatPages.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <div className="text-5xl mb-4 opacity-30">🧵</div>
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No pages to weave yet</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
            The Weave shows your story beats arranged across physical page spreads.
            Add some pages to your issue first, then come back to arrange your story.
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

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">
            {flatPages.length} pages • {spreads.length} spreads
          </span>
          {isSaving && (
            <span className="text-sm text-blue-400 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          )}
        </div>
        <button
          onClick={() => setShowPlotlineManager(!showPlotlineManager)}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm transition-colors"
        >
          {showPlotlineManager ? 'Hide' : 'Manage'} Plotlines
        </button>
      </div>

      {/* Plotline Manager */}
      {showPlotlineManager && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="font-medium mb-3">Plotlines</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {plotlines.map((pl) => (
              <div
                key={pl.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm relative"
                style={{ backgroundColor: pl.color + '30', borderColor: pl.color, borderWidth: 1 }}
              >
                {/* Color picker button */}
                <button
                  className="w-4 h-4 rounded-full border-2 border-white/30 hover:scale-110 transition-transform"
                  style={{ backgroundColor: pl.color }}
                  onClick={() => {
                    setEditingPlotlineId(pl.id)
                    setEditingPlotlineColor(pl.color)
                  }}
                  title="Change color"
                />
                <span>{pl.name}</span>
                <button
                  onClick={() => deletePlotline(pl.id)}
                  className="text-zinc-400 hover:text-red-400 ml-1"
                >
                  ×
                </button>

                {/* Color picker dropdown */}
                {editingPlotlineId === pl.id && (
                  <div className="absolute top-full left-0 mt-2 p-2 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 z-50">
                    <div className="grid grid-cols-4 gap-1.5">
                      {PLOTLINE_COLORS.map((color) => (
                        <button
                          key={color}
                          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            editingPlotlineColor === color ? 'border-white' : 'border-transparent'
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
                      className="w-full h-6 mt-2 rounded cursor-pointer"
                    />
                  </div>
                )}
              </div>
            ))}
            {plotlines.length === 0 && (
              <span className="text-sm text-zinc-500">No plotlines yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPlotlineName}
              onChange={(e) => setNewPlotlineName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createPlotline()}
              placeholder="New plotline name (e.g., A Plot, B Plot...)"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={createPlotline}
              disabled={!newPlotlineName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 rounded text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      {plotlines.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <span className="text-sm text-zinc-400">Plotlines:</span>
          {plotlines.map((pl) => (
            <div key={pl.id} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: pl.color }} />
              <span className="text-sm">{pl.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Drag hint */}
      <div className="text-xs text-zinc-500 text-center">
        ⋮⋮ Drag spreads to reorder • Left/Right orientations update automatically
      </div>

      {/* Spreads View with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={spreads.map(s => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 pl-10">
            {spreads.map((spread, spreadIdx) => {
              // Check if this is the start of a new act
              const leftActStart = !!(spread.left && actStartPages.get(spread.left.act.id) === spread.left.globalPageNumber)
              const rightActStart = !!(spread.right && actStartPages.get(spread.right.act.id) === spread.right.globalPageNumber)
              const isActStart = leftActStart || rightActStart
              const actTitle = (leftActStart ? spread.left?.act : spread.right?.act)?.title

              return (
                <SortableSpread
                  key={spread.id}
                  spread={spread}
                  spreadIdx={spreadIdx}
                  actStartPages={actStartPages}
                  renderPageCell={renderPageCell}
                  isActStart={isActStart}
                  actTitle={actTitle}
                />
              )
            })}
          </div>
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeSpread && (
            <div className="bg-zinc-900 border border-blue-500 rounded-lg overflow-hidden flex shadow-2xl shadow-blue-500/30 transform scale-105">
              {activeSpread.spreadNumber > 0 && activeSpread.left && (
                <>
                  {renderPageCell(activeSpread.left, 'left', true)}
                  <div className="w-2 bg-zinc-800 flex items-center justify-center">
                    <div className="w-px h-full bg-zinc-700" />
                  </div>
                  {renderPageCell(activeSpread.right, 'right', true)}
                </>
              )}
              {activeSpread.spreadNumber === 0 && (
                <div className="flex">
                  <div className="w-[280px] h-[140px] bg-zinc-800/50 flex items-center justify-center border-r border-zinc-700">
                    <span className="text-zinc-600 text-sm">Inside cover</span>
                  </div>
                  <div className="w-2 bg-zinc-800 flex items-center justify-center">
                    <div className="w-px h-full bg-zinc-700" />
                  </div>
                  {renderPageCell(activeSpread.right, 'right', true)}
                </div>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Final page indicator (if odd number of pages) */}
      {flatPages.length > 1 && flatPages.length % 2 === 0 && (
        <div className="flex justify-center pl-10">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex">
            {renderPageCell(flatPages[flatPages.length - 1], 'left')}
            <div className="w-2 bg-zinc-800 flex items-center justify-center">
              <div className="w-px h-full bg-zinc-700" />
            </div>
            <div className="w-[280px] h-[140px] bg-zinc-800/50 flex items-center justify-center">
              <span className="text-zinc-600 text-sm">Back cover</span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <h3 className="font-medium text-zinc-300 mb-2">How to use The Weave</h3>
        <ul className="text-sm text-zinc-500 space-y-1">
          <li>• <strong>Drag spreads</strong> to reorder pages — Left/Right orientations update automatically</li>
          <li>• Click on any page to add a <strong>story beat</strong> — what happens on that page</li>
          <li>• Use the dropdown to assign pages to <strong>plotlines</strong> (A plot, B plot, etc.)</li>
          <li>• Add <strong>time periods</strong> if your story jumps in time</li>
          <li>• Add <strong>visual motifs</strong> to track recurring imagery themes</li>
          <li>• Pages are shown in spreads as they&apos;ll appear in the physical comic</li>
          <li>• Click &quot;Edit →&quot; to jump to the full page editor</li>
        </ul>
      </div>
    </div>
  )
}
