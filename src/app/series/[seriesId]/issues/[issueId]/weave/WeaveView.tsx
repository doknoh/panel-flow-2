'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
}

interface Page {
  id: string
  page_number: number
  sort_order: number
}

interface Scene {
  id: string
  title: string | null
  plotline_id: string | null
  plotline: Plotline | null
  pages: Page[]
  sort_order: number
  act_id: string
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
    plotlines: Plotline[]
  }
  acts: Act[]
}

interface WeaveViewProps {
  issue: Issue
  seriesId: string
}

interface SceneBlock {
  scene: Scene
  act: Act
  startPage: number
  endPage: number
  pageCount: number
  plotlineId: string | null
}

export default function WeaveView({ issue, seriesId }: WeaveViewProps) {
  const [isDraftMode, setIsDraftMode] = useState(false)
  const [hoveredScene, setHoveredScene] = useState<string | null>(null)
  const { showToast } = useToast()

  // Calculate scene blocks with their page ranges
  const { sceneBlocks, totalPages, plotlines } = useMemo(() => {
    const blocks: SceneBlock[] = []
    let currentPage = 1

    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (const act of sortedActs) {
      const sortedScenes = [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order)

      for (const scene of sortedScenes) {
        const pageCount = scene.pages?.length || 0
        if (pageCount > 0) {
          blocks.push({
            scene,
            act,
            startPage: currentPage,
            endPage: currentPage + pageCount - 1,
            pageCount,
            plotlineId: scene.plotline_id,
          })
          currentPage += pageCount
        }
      }
    }

    return {
      sceneBlocks: blocks,
      totalPages: Math.max(currentPage - 1, 1),
      plotlines: issue.series.plotlines || [],
    }
  }, [issue])

  // Group scenes by plotline for row-based rendering
  const plotlineRows = useMemo(() => {
    const rows = new Map<string | null, SceneBlock[]>()

    // Initialize rows for all plotlines
    for (const plotline of plotlines) {
      rows.set(plotline.id, [])
    }
    // Add a row for unassigned scenes
    rows.set(null, [])

    // Assign scenes to their plotline rows
    for (const block of sceneBlocks) {
      const row = rows.get(block.plotlineId) || []
      row.push(block)
      rows.set(block.plotlineId, row)
    }

    return rows
  }, [sceneBlocks, plotlines])

  // Calculate act boundaries for vertical dividers
  const actBoundaries = useMemo(() => {
    const boundaries: { page: number; title: string }[] = []
    let currentPage = 1

    const sortedActs = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

    for (let i = 0; i < sortedActs.length; i++) {
      const act = sortedActs[i]
      const actPages = (act.scenes || []).reduce(
        (sum, scene) => sum + (scene.pages?.length || 0),
        0
      )

      if (i > 0) {
        boundaries.push({
          page: currentPage,
          title: act.title || `Act ${act.number}`,
        })
      }

      currentPage += actPages
    }

    return boundaries
  }, [issue.acts])

  const CELL_WIDTH = 32 // pixels per page
  const ROW_HEIGHT = 48 // pixels per plotline row
  const HEADER_HEIGHT = 40

  // Show empty state if no content
  if (sceneBlocks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Issue #{issue.number} Structure</h2>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <div className="text-5xl mb-4 opacity-30">🧵</div>
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No content to weave yet</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
            The Weave view visualizes how your plotlines flow through scenes and pages.
            Add some content to your issue first, then come back to see the structure.
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
          <h2 className="text-lg font-semibold">Issue #{issue.number} Structure</h2>
          <span className="text-sm text-zinc-500">
            {totalPages} pages across {sceneBlocks.length} scene{sceneBlocks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDraftMode(!isDraftMode)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isDraftMode
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {isDraftMode ? 'Draft Mode (Editing)' : 'View Mode'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
        <span className="text-sm text-zinc-400">Plotlines:</span>
        {plotlines.map((plotline) => (
          <div key={plotline.id} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: plotline.color }}
            />
            <span className="text-sm">{plotline.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-zinc-600" />
          <span className="text-sm text-zinc-400">Unassigned</span>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div
            style={{
              minWidth: Math.max(totalPages * CELL_WIDTH + 150, 800),
              position: 'relative',
            }}
          >
            {/* Page Numbers Header */}
            <div
              className="flex border-b border-zinc-800 bg-zinc-800/50 sticky top-0 z-10"
              style={{ height: HEADER_HEIGHT }}
            >
              <div className="w-[140px] shrink-0 px-3 flex items-center text-sm font-medium text-zinc-400 border-r border-zinc-700">
                Plotline
              </div>
              <div className="flex-1 relative flex">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <div
                    key={pageNum}
                    className="flex items-center justify-center text-xs text-zinc-500 border-r border-zinc-800/50"
                    style={{ width: CELL_WIDTH }}
                  >
                    <span className={pageNum % 2 === 1 ? 'text-zinc-400' : ''}>
                      {pageNum}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* L/R Indicators */}
            <div className="flex border-b border-zinc-800 bg-zinc-900/50" style={{ height: 20 }}>
              <div className="w-[140px] shrink-0 border-r border-zinc-700" />
              <div className="flex-1 flex">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <div
                    key={pageNum}
                    className="flex items-center justify-center text-[10px] text-zinc-600 border-r border-zinc-800/50"
                    style={{ width: CELL_WIDTH }}
                  >
                    {pageNum % 2 === 1 ? 'R' : 'L'}
                  </div>
                ))}
              </div>
            </div>

            {/* Plotline Rows */}
            {plotlines.map((plotline) => {
              const blocks = plotlineRows.get(plotline.id) || []
              return (
                <div
                  key={plotline.id}
                  className="flex border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Plotline Label */}
                  <div className="w-[140px] shrink-0 px-3 flex items-center gap-2 border-r border-zinc-700">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: plotline.color }}
                    />
                    <span className="text-sm truncate">{plotline.name}</span>
                  </div>

                  {/* Scene Blocks */}
                  <div className="flex-1 relative">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {Array.from({ length: totalPages }, (_, i) => (
                        <div
                          key={i}
                          className="border-r border-zinc-800/30"
                          style={{ width: CELL_WIDTH }}
                        />
                      ))}
                    </div>

                    {/* Act boundaries */}
                    {actBoundaries.map((boundary) => (
                      <div
                        key={boundary.page}
                        className="absolute top-0 bottom-0 w-px bg-zinc-600 z-10"
                        style={{ left: (boundary.page - 1) * CELL_WIDTH }}
                      />
                    ))}

                    {/* Scene blocks */}
                    {blocks.map((block) => (
                      <Link
                        key={block.scene.id}
                        href={`/series/${seriesId}/issues/${issue.id}`}
                        className={`absolute top-1 bottom-1 rounded flex items-center px-2 overflow-hidden transition-all ${
                          hoveredScene === block.scene.id
                            ? 'ring-2 ring-white/50 z-20'
                            : 'hover:brightness-110'
                        }`}
                        style={{
                          left: (block.startPage - 1) * CELL_WIDTH + 2,
                          width: block.pageCount * CELL_WIDTH - 4,
                          backgroundColor: plotline.color,
                        }}
                        onMouseEnter={() => setHoveredScene(block.scene.id)}
                        onMouseLeave={() => setHoveredScene(null)}
                        title={`${block.scene.title || 'Untitled'} (Pages ${block.startPage}-${block.endPage})`}
                      >
                        <span className="text-xs font-medium truncate text-white drop-shadow">
                          {block.scene.title || 'Scene'}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Unassigned Row */}
            {(() => {
              const unassignedBlocks = plotlineRows.get(null) || []
              if (unassignedBlocks.length === 0) return null

              return (
                <div
                  className="flex border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="w-[140px] shrink-0 px-3 flex items-center gap-2 border-r border-zinc-700">
                    <div className="w-3 h-3 rounded-full shrink-0 bg-zinc-600" />
                    <span className="text-sm text-zinc-400 truncate">Unassigned</span>
                  </div>
                  <div className="flex-1 relative">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {Array.from({ length: totalPages }, (_, i) => (
                        <div
                          key={i}
                          className="border-r border-zinc-800/30"
                          style={{ width: CELL_WIDTH }}
                        />
                      ))}
                    </div>

                    {/* Scene blocks */}
                    {unassignedBlocks.map((block) => (
                      <Link
                        key={block.scene.id}
                        href={`/series/${seriesId}/issues/${issue.id}`}
                        className={`absolute top-1 bottom-1 rounded flex items-center px-2 overflow-hidden bg-zinc-600 transition-all ${
                          hoveredScene === block.scene.id
                            ? 'ring-2 ring-white/50 z-20'
                            : 'hover:brightness-110'
                        }`}
                        style={{
                          left: (block.startPage - 1) * CELL_WIDTH + 2,
                          width: block.pageCount * CELL_WIDTH - 4,
                        }}
                        onMouseEnter={() => setHoveredScene(block.scene.id)}
                        onMouseLeave={() => setHoveredScene(null)}
                        title={`${block.scene.title || 'Untitled'} (Pages ${block.startPage}-${block.endPage})`}
                      >
                        <span className="text-xs font-medium truncate text-white drop-shadow">
                          {block.scene.title || 'Scene'}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Hover Details Panel */}
      {hoveredScene && (() => {
        const block = sceneBlocks.find(b => b.scene.id === hoveredScene)
        if (!block) return null

        return (
          <div className="fixed bottom-6 right-6 bg-zinc-800 border border-zinc-700 rounded-lg p-4 shadow-xl max-w-sm z-50">
            <div className="flex items-start gap-3">
              {block.scene.plotline && (
                <div
                  className="w-3 h-3 rounded-full mt-1 shrink-0"
                  style={{ backgroundColor: block.scene.plotline.color }}
                />
              )}
              <div>
                <h4 className="font-semibold">{block.scene.title || 'Untitled Scene'}</h4>
                <p className="text-sm text-zinc-400 mt-1">
                  {block.act.title || `Act ${block.act.number}`}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  Pages {block.startPage}–{block.endPage} ({block.pageCount} page{block.pageCount !== 1 ? 's' : ''})
                </p>
                {block.scene.plotline && (
                  <p className="text-sm mt-2">
                    <span className="text-zinc-400">Plotline: </span>
                    {block.scene.plotline.name}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Draft Mode Instructions */}
      {isDraftMode && (
        <div className="p-4 bg-amber-900/20 border border-amber-800/50 rounded-lg">
          <h3 className="font-medium text-amber-400 mb-2">Draft Mode</h3>
          <p className="text-sm text-zinc-400">
            Drag-and-drop scene reordering coming soon. For now, use the Issue Editor to reorder scenes.
          </p>
        </div>
      )}
    </div>
  )
}
