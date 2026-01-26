'use client'

import { useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
  sort_order: number
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
]

interface FlatPage {
  page: Page
  scene: Scene
  act: Act
  globalPageNumber: number
  orientation: 'left' | 'right'
}

export default function WeaveView({ issue, seriesId }: WeaveViewProps) {
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'story_beat' | 'time_period' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showPlotlineManager, setShowPlotlineManager] = useState(false)
  const [newPlotlineName, setNewPlotlineName] = useState('')
  const { showToast } = useToast()
  const router = useRouter()

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
    // Page 1: Right (cover/opening)
    // Pages 2-3: Left-Right (first spread)
    // Pages 4-5: Left-Right (second spread)
    // etc.
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
  const spreads = useMemo(() => {
    const result: { left: FlatPage | null; right: FlatPage | null; spreadNumber: number }[] = []

    if (flatPages.length === 0) return result

    // Page 1 is a solo right page (opening)
    if (flatPages.length >= 1) {
      result.push({ left: null, right: flatPages[0], spreadNumber: 0 })
    }

    // Remaining pages form spreads (2-3, 4-5, 6-7, etc.)
    for (let i = 1; i < flatPages.length; i += 2) {
      const leftPage = flatPages[i] || null
      const rightPage = flatPages[i + 1] || null
      result.push({
        left: leftPage,
        right: rightPage,
        spreadNumber: result.length,
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

  // Render a single page cell
  const renderPageCell = (fp: FlatPage | null, orientation: 'left' | 'right') => {
    if (!fp) {
      return (
        <div className={`w-[280px] h-[120px] ${orientation === 'left' ? 'border-r border-zinc-700' : ''}`}>
          {/* Empty cell */}
        </div>
      )
    }

    const { page, scene, act, globalPageNumber } = fp
    const plotline = page.plotline || scene.plotline
    const bgColor = plotline?.color || '#3F3F46' // zinc-700 default

    const isEditing = editingPageId === page.id

    return (
      <div
        className={`w-[280px] min-h-[120px] p-3 relative group transition-all ${
          orientation === 'left' ? 'border-r border-zinc-700' : ''
        }`}
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

        {/* Time period (like Year column in Excel) */}
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
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs mb-2"
            placeholder="Time period (e.g., 2023)"
            autoFocus
          />
        ) : (
          <div
            className="text-xs text-zinc-400 mb-2 cursor-pointer hover:text-zinc-300 min-h-[18px]"
            onClick={() => {
              setEditingPageId(page.id)
              setEditingField('time_period')
              setEditValue(page.time_period || '')
            }}
          >
            {page.time_period || <span className="opacity-0 group-hover:opacity-50">+ Time</span>}
          </div>
        )}

        {/* Story beat (main content) */}
        {isEditing && editingField === 'story_beat' ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => savePageField(page.id, 'story_beat', editValue)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setEditingPageId(null); setEditingField(null) }
            }}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm resize-none"
            placeholder="Story beat..."
            rows={3}
            autoFocus
          />
        ) : (
          <div
            className="text-sm text-zinc-200 cursor-pointer hover:bg-white/5 rounded px-1 py-0.5 -mx-1 min-h-[60px]"
            onClick={() => {
              setEditingPageId(page.id)
              setEditingField('story_beat')
              setEditValue(page.story_beat || '')
            }}
          >
            {page.story_beat || (
              <span className="text-zinc-500 italic opacity-0 group-hover:opacity-100">
                Click to add story beat...
              </span>
            )}
          </div>
        )}

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
  }

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
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                style={{ backgroundColor: pl.color + '30', borderColor: pl.color, borderWidth: 1 }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pl.color }} />
                <span>{pl.name}</span>
                <button
                  onClick={() => deletePlotline(pl.id)}
                  className="text-zinc-400 hover:text-red-400 ml-1"
                >
                  ×
                </button>
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

      {/* Spreads View */}
      <div className="space-y-4">
        {spreads.map((spread, spreadIdx) => {
          // Check if this is the start of a new act
          const leftActStart = spread.left && actStartPages.get(spread.left.act.id) === spread.left.globalPageNumber
          const rightActStart = spread.right && actStartPages.get(spread.right.act.id) === spread.right.globalPageNumber
          const isActStart = leftActStart || rightActStart
          const actTitle = (leftActStart ? spread.left?.act : spread.right?.act)?.title

          return (
            <div key={spreadIdx}>
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
              <div className="flex justify-center">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex">
                  {/* Gutter indicator for non-first spreads */}
                  {spreadIdx > 0 && spread.left && (
                    <>
                      {renderPageCell(spread.left, 'left')}
                      {/* Gutter/spine */}
                      <div className="w-2 bg-zinc-800 flex items-center justify-center">
                        <div className="w-px h-full bg-zinc-700" />
                      </div>
                      {renderPageCell(spread.right, 'right')}
                    </>
                  )}
                  {/* First spread (just page 1) */}
                  {spreadIdx === 0 && (
                    <div className="flex">
                      <div className="w-[280px] h-[120px] bg-zinc-800/50 flex items-center justify-center border-r border-zinc-700">
                        <span className="text-zinc-600 text-sm">Inside cover</span>
                      </div>
                      <div className="w-2 bg-zinc-800 flex items-center justify-center">
                        <div className="w-px h-full bg-zinc-700" />
                      </div>
                      {renderPageCell(spread.right, 'right')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Final page indicator (if odd number of pages) */}
        {flatPages.length > 1 && flatPages.length % 2 === 0 && (
          <div className="flex justify-center">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex">
              {renderPageCell(flatPages[flatPages.length - 1], 'left')}
              <div className="w-2 bg-zinc-800 flex items-center justify-center">
                <div className="w-px h-full bg-zinc-700" />
              </div>
              <div className="w-[280px] h-[120px] bg-zinc-800/50 flex items-center justify-center">
                <span className="text-zinc-600 text-sm">Back cover</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <h3 className="font-medium text-zinc-300 mb-2">How to use The Weave</h3>
        <ul className="text-sm text-zinc-500 space-y-1">
          <li>• Click on any page to add a <strong>story beat</strong> — what happens on that page</li>
          <li>• Use the dropdown to assign pages to <strong>plotlines</strong> (A plot, B plot, etc.)</li>
          <li>• Add <strong>time periods</strong> if your story jumps in time</li>
          <li>• Pages are shown in spreads as they&apos;ll appear in the physical comic</li>
          <li>• Click &quot;Edit →&quot; to jump to the full page editor</li>
        </ul>
      </div>
    </div>
  )
}
