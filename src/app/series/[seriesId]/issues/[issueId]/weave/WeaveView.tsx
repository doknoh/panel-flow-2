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
const PAGE_WIDTH = 180
const PAGE_HEIGHT = 260

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

    if (dialogues.length === 0 && captions.length === 0 && panel.visual_description) {
      const desc = panel.visual_description
      const snippet = desc.length > 50 ? desc.substring(0, 50) + '...' : desc
      summaryParts.push(snippet)
    }
  }

  return summaryParts.slice(0, 2).join(' • ') || null
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

// Drag handle component - always visible
function DragHandle({ listeners, attributes }: { listeners: any; attributes: any }) {
  return (
    <div
      {...attributes}
      {...listeners}
      className="flex flex-col items-center justify-center w-8 cursor-grab active:cursor-grabbing hover:bg-zinc-700/50 rounded transition-colors py-4"
      title="Drag to reorder"
    >
      <div className="flex flex-col gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
            <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Sortable spread component
function SortableSpread({
  spread,
  spreadIdx,
  renderPageCell,
  isActStart,
  actTitle,
  plotlines,
}: {
  spread: Spread
  spreadIdx: number
  renderPageCell: (fp: FlatPage | null, orientation: 'left' | 'right', isDragging?: boolean) => React.ReactNode
  isActStart: boolean
  actTitle: string | null | undefined
  plotlines: Plotline[]
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
        <div className="flex items-center gap-4 py-6 mb-2">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
          <span className="text-sm font-semibold text-zinc-300 px-4 py-1.5 bg-zinc-800 border border-zinc-700 rounded-full">
            {actTitle || `Act ${spreadIdx > 0 ? 'II' : 'I'}`}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
        </div>
      )}

      {/* Spread container */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {/* Drag handle - always visible */}
        {spreadIdx > 0 && (
          <DragHandle listeners={listeners} attributes={attributes} />
        )}
        {spreadIdx === 0 && <div className="w-8" />}

        <div
          className={`flex rounded-lg overflow-hidden transition-all ${
            isDragging
              ? 'ring-2 ring-blue-500 shadow-xl shadow-blue-500/20'
              : 'ring-1 ring-zinc-700 hover:ring-zinc-600'
          }`}
        >
          {/* First spread (page 1 with inside cover) */}
          {spreadIdx === 0 && (
            <>
              <div
                className="flex items-center justify-center bg-zinc-900/80 border-r border-zinc-700"
                style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
              >
                <span className="text-zinc-600 text-xs">Inside cover</span>
              </div>
              {/* Spine */}
              <div className="w-3 bg-zinc-800 flex items-center justify-center">
                <div className="w-px h-[90%] bg-zinc-600" />
              </div>
              {renderPageCell(spread.right, 'right', isDragging)}
            </>
          )}

          {/* Regular spreads */}
          {spreadIdx > 0 && spread.left && (
            <>
              {renderPageCell(spread.left, 'left', isDragging)}
              {/* Spine */}
              <div className="w-3 bg-zinc-800 flex items-center justify-center">
                <div className="w-px h-[90%] bg-zinc-600" />
              </div>
              {renderPageCell(spread.right, 'right', isDragging)}
            </>
          )}
        </div>

        {/* Spacer to balance layout */}
        <div className="w-8" />
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
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
            orientation: 'right',
          })
        }
      }
    }

    // Set orientations
    for (let i = 0; i < pages.length; i++) {
      const pageNum = i + 1
      if (pageNum === 1) {
        pages[i].orientation = 'right'
      } else {
        pages[i].orientation = pageNum % 2 === 0 ? 'left' : 'right'
      }
    }

    return pages
  }, [issue])

  // Group pages into spreads
  const spreads = useMemo<Spread[]>(() => {
    const result: Spread[] = []
    if (flatPages.length === 0) return result

    if (flatPages.length >= 1) {
      result.push({
        left: null,
        right: flatPages[0],
        spreadNumber: 0,
        id: `spread-0-${flatPages[0].page.id}`,
      })
    }

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

  const actStartPages = useMemo(() => {
    const starts: Map<string, number> = new Map()
    for (const fp of flatPages) {
      if (!starts.has(fp.act.id)) {
        starts.set(fp.act.id, fp.globalPageNumber)
      }
    }
    return starts
  }, [flatPages])

  const plotlines = issue.plotlines || []

  // Handle drag end
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveSpreadId(null)

    if (!over || active.id === over.id) return

    const activeIdx = spreads.findIndex(s => s.id === active.id)
    const overIdx = spreads.findIndex(s => s.id === over.id)

    if (activeIdx === -1 || overIdx === -1) return
    if (activeIdx === 0 || overIdx === 0) {
      showToast('Cannot reorder the opening page', 'error')
      return
    }

    setIsSaving(true)

    const newSpreads = [...spreads]
    const [movedSpread] = newSpreads.splice(activeIdx, 1)
    newSpreads.splice(overIdx, 0, movedSpread)

    const newPageOrder: string[] = []
    for (const spread of newSpreads) {
      if (spread.left) newPageOrder.push(spread.left.page.id)
      if (spread.right) newPageOrder.push(spread.right.page.id)
    }

    const supabase = createClient()

    try {
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

  // Render a single page cell - comic book proportions
  const renderPageCell = useCallback((fp: FlatPage | null, orientation: 'left' | 'right', isDragging?: boolean) => {
    if (!fp) {
      return (
        <div
          className="bg-zinc-900/50"
          style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
        />
      )
    }

    const { page, scene, globalPageNumber } = fp
    const plotline = page.plotline || scene.plotline
    const plotlineColor = plotline?.color

    const isEditing = editingPageId === page.id
    const autoSummary = !page.story_beat ? generatePageSummary(page) : null

    return (
      <div
        className={`relative flex flex-col group transition-all ${isDragging ? 'opacity-60' : ''}`}
        style={{
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          backgroundColor: plotlineColor ? `${plotlineColor}15` : '#18181b',
        }}
      >
        {/* Plotline color bar - thick and prominent */}
        {plotlineColor && (
          <div
            className="absolute top-0 left-0 right-0 h-2"
            style={{ backgroundColor: plotlineColor }}
          />
        )}

        {/* Page content */}
        <div className={`flex-1 p-3 flex flex-col ${plotlineColor ? 'pt-4' : ''}`}>
          {/* Header: Page number + orientation */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-white">{globalPageNumber}</span>
              <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium ${
                orientation === 'left'
                  ? 'bg-zinc-700/80 text-zinc-300'
                  : 'bg-zinc-600/80 text-zinc-200'
              }`}>
                {orientation === 'left' ? 'L' : 'R'}
              </span>
            </div>

            {/* Plotline selector */}
            <select
              value={page.plotline_id || ''}
              onChange={(e) => assignPlotline(page.id, e.target.value || null)}
              className="text-[10px] bg-zinc-800/80 border border-zinc-600 rounded px-1 py-0.5 max-w-[70px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              style={plotlineColor ? { borderColor: plotlineColor } : {}}
            >
              <option value="">—</option>
              {plotlines.map(pl => (
                <option key={pl.id} value={pl.id}>{pl.name}</option>
              ))}
            </select>
          </div>

          {/* Metadata row: Time period & Visual motif */}
          <div className="flex items-center gap-3 mb-3 min-h-[18px]">
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
                className="flex-1 bg-zinc-800 border border-zinc-500 rounded px-1.5 py-0.5 text-[10px]"
                placeholder="Year/Era"
                autoFocus
              />
            ) : (
              <button
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-0.5"
                onClick={() => {
                  setEditingPageId(page.id)
                  setEditingField('time_period')
                  setEditValue(page.time_period || '')
                }}
              >
                {page.time_period ? (
                  <span className="text-amber-400/80 font-medium">{page.time_period}</span>
                ) : (
                  <span className="opacity-0 group-hover:opacity-60">+ time</span>
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
                className="flex-1 bg-zinc-800 border border-zinc-500 rounded px-1.5 py-0.5 text-[10px]"
                placeholder="Motif"
                autoFocus
              />
            ) : (
              <button
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-0.5"
                onClick={() => {
                  setEditingPageId(page.id)
                  setEditingField('visual_motif')
                  setEditValue(page.visual_motif || '')
                }}
              >
                {page.visual_motif ? (
                  <span className="text-purple-400/80 font-medium">{page.visual_motif}</span>
                ) : (
                  <span className="opacity-0 group-hover:opacity-60">+ motif</span>
                )}
              </button>
            )}
          </div>

          {/* Story beat - main content area */}
          <div className="flex-1 min-h-0">
            {isEditing && editingField === 'story_beat' ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => savePageField(page.id, 'story_beat', editValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setEditingPageId(null); setEditingField(null) }
                }}
                className="w-full h-full bg-zinc-800 border border-zinc-500 rounded px-2 py-1.5 text-xs resize-none"
                placeholder="Story beat..."
                autoFocus
              />
            ) : (
              <div
                className="h-full cursor-pointer hover:bg-white/5 rounded p-1 -m-1 overflow-hidden"
                onClick={() => {
                  setEditingPageId(page.id)
                  setEditingField('story_beat')
                  setEditValue(page.story_beat || '')
                }}
              >
                {page.story_beat ? (
                  <p className="text-xs text-zinc-200 leading-relaxed line-clamp-6">{page.story_beat}</p>
                ) : autoSummary ? (
                  <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-5 italic">{autoSummary}</p>
                ) : (
                  <p className="text-[11px] text-zinc-600 italic opacity-0 group-hover:opacity-100">
                    Click to add story beat...
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer: Scene name + Edit link */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800">
            <span className="text-[10px] text-zinc-600 truncate max-w-[100px]">
              {scene.title || scene.name || 'Scene'}
            </span>
            <Link
              href={`/series/${seriesId}/issues/${issue.id}?page=${page.id}`}
              className="text-[10px] text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Edit →
            </Link>
          </div>
        </div>
      </div>
    )
  }, [editingPageId, editingField, editValue, plotlines, seriesId, issue.id])

  const activeSpread = activeSpreadId ? spreads.find(s => s.id === activeSpreadId) : null

  // Empty state
  if (flatPages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center max-w-md">
          <div className="text-6xl mb-4 opacity-30">🧵</div>
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No pages to weave yet</h3>
          <p className="text-sm text-zinc-500 mb-6">
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

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-300 font-medium">
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
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium transition-colors"
        >
          {showPlotlineManager ? 'Hide' : 'Manage'} Plotlines
        </button>
      </div>

      {/* Plotline Manager */}
      {showPlotlineManager && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="font-semibold text-zinc-200 mb-4">Plotlines</h3>
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
                  className="text-zinc-400 hover:text-red-400 ml-1 text-lg leading-none"
                >
                  ×
                </button>

                {editingPlotlineId === pl.id && (
                  <div className="absolute top-full left-0 mt-2 p-3 bg-zinc-800 rounded-lg shadow-xl border border-zinc-600 z-50">
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
              <span className="text-sm text-zinc-500 py-2">No plotlines yet — create one to start color-coding your pages</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPlotlineName}
              onChange={(e) => setNewPlotlineName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createPlotline()}
              placeholder="New plotline (e.g., A Plot - Marshall's Story)"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={createPlotline}
              disabled={!newPlotlineName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium transition-colors"
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
              <span className="text-sm text-zinc-400">{pl.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Spreads View */}
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
          <div className="py-4">
            {spreads.map((spread, spreadIdx) => {
              const leftActStart = !!(spread.left && actStartPages.get(spread.left.act.id) === spread.left.globalPageNumber)
              const rightActStart = !!(spread.right && actStartPages.get(spread.right.act.id) === spread.right.globalPageNumber)
              const isActStart = leftActStart || rightActStart
              const actTitle = (leftActStart ? spread.left?.act : spread.right?.act)?.title

              return (
                <SortableSpread
                  key={spread.id}
                  spread={spread}
                  spreadIdx={spreadIdx}
                  renderPageCell={renderPageCell}
                  isActStart={isActStart}
                  actTitle={actTitle}
                  plotlines={plotlines}
                />
              )
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeSpread && (
            <div className="flex rounded-lg overflow-hidden ring-2 ring-blue-500 shadow-2xl shadow-blue-500/30 transform scale-105">
              {activeSpread.spreadNumber === 0 && (
                <>
                  <div
                    className="flex items-center justify-center bg-zinc-900/80"
                    style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
                  >
                    <span className="text-zinc-600 text-xs">Inside cover</span>
                  </div>
                  <div className="w-3 bg-zinc-800" />
                  {renderPageCell(activeSpread.right, 'right', true)}
                </>
              )}
              {activeSpread.spreadNumber > 0 && activeSpread.left && (
                <>
                  {renderPageCell(activeSpread.left, 'left', true)}
                  <div className="w-3 bg-zinc-800" />
                  {renderPageCell(activeSpread.right, 'right', true)}
                </>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Instructions - collapsible */}
      <details className="bg-zinc-900/30 border border-zinc-800 rounded-lg">
        <summary className="px-4 py-3 text-sm text-zinc-400 cursor-pointer hover:text-zinc-300">
          How to use The Weave
        </summary>
        <div className="px-4 pb-4 text-sm text-zinc-500 space-y-1.5">
          <p>• <strong className="text-zinc-400">Drag the handle</strong> on the left of any spread to reorder</p>
          <p>• <strong className="text-zinc-400">Click any page</strong> to add a story beat</p>
          <p>• <strong className="text-zinc-400">Assign plotlines</strong> via the dropdown (hover to see)</p>
          <p>• <strong className="text-zinc-400">Add time periods</strong> for time jumps</p>
          <p>• <strong className="text-zinc-400">Add visual motifs</strong> to track imagery themes</p>
          <p>• Pages show as physical spreads (Left/Right)</p>
        </div>
      </details>
    </div>
  )
}
