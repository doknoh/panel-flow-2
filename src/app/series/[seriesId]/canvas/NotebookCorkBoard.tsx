'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Tip } from '@/components/ui/Tip'
import NotebookItem from './NotebookItem'
import { CanvasItemData, FilingTarget, ItemType, ITEM_TYPE_CONFIG, ITEM_TYPE_ICONS } from './NotebookClient'
import { Plus } from 'lucide-react'

interface NotebookCorkBoardProps {
  items: CanvasItemData[]
  allItems: CanvasItemData[]
  onUpdate: (id: string, updates: Partial<CanvasItemData>) => void
  onArchive: (id: string) => void
  onGraduate: (item: CanvasItemData) => void
  onOpenFiling: (itemId: string) => void
  onUnfileItem: (id: string) => void
  onPositionUpdate: (id: string, x: number, y: number) => void
  onCreateAtPosition: (type: ItemType, x: number, y: number) => void
  filingTargets: FilingTarget[]
}

const BOARD_WIDTH = 4000
const BOARD_HEIGHT = 3000

const AUTO_LAYOUT_COLUMNS = 5
const AUTO_LAYOUT_SPACING_X = 260
const AUTO_LAYOUT_SPACING_Y = 200
const AUTO_LAYOUT_START_X = 50
const AUTO_LAYOUT_START_Y = 50

const ZOOM_MIN = 0.3
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

const NOTE_WIDTH = 220

function getRotation(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % 7) - 3
}

export default function NotebookCorkBoard({
  items,
  allItems,
  onUpdate,
  onArchive,
  onGraduate,
  onOpenFiling,
  onUnfileItem,
  onPositionUpdate,
  onCreateAtPosition,
  filingTargets,
}: NotebookCorkBoardProps) {
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const [panStartX, setPanStartX] = useState(0)
  const [panStartY, setPanStartY] = useState(0)
  const [dragItem, setDragItem] = useState<{
    id: string
    startX: number
    startY: number
    offsetX: number
    offsetY: number
  } | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasAutoLayoutRun = useRef(false)

  // Auto-layout unpositioned items on mount
  useEffect(() => {
    if (hasAutoLayoutRun.current) return
    hasAutoLayoutRun.current = true

    const unpositioned = items.filter(
      item => item.cork_board_x === null || item.cork_board_y === null
    )
    if (unpositioned.length === 0) return

    const positionedCount = items.filter(i => i.cork_board_x !== null).length

    unpositioned.forEach((item, index) => {
      const gridIndex = positionedCount + index
      const col = gridIndex % AUTO_LAYOUT_COLUMNS
      const row = Math.floor(gridIndex / AUTO_LAYOUT_COLUMNS)
      const x = AUTO_LAYOUT_START_X + col * AUTO_LAYOUT_SPACING_X + (Math.random() * 20 - 10)
      const y = AUTO_LAYOUT_START_Y + row * AUTO_LAYOUT_SPACING_Y + (Math.random() * 20 - 10)
      onUpdate(item.id, { cork_board_x: x, cork_board_y: y })
      onPositionUpdate(item.id, x, y)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Zoom via scroll wheel
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom(prev => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta)))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // Pan: mouse down on background (not on notes)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-notebook-item]')) {
      setIsPanning(true)
      setPanStartX(e.clientX - panX * zoom)
      setPanStartY(e.clientY - panY * zoom)
    }
  }, [panX, panY, zoom])

  // Mouse move: pan or drag item
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPanX((e.clientX - panStartX) / zoom)
      setPanY((e.clientY - panStartY) / zoom)
    }
    if (dragItem) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (e.clientX - rect.left) / zoom - panX - dragItem.offsetX
      const y = (e.clientY - rect.top) / zoom - panY - dragItem.offsetY
      onUpdate(dragItem.id, {
        cork_board_x: Math.max(0, Math.min(x, BOARD_WIDTH - NOTE_WIDTH)),
        cork_board_y: Math.max(0, y),
      })
    }
  }, [isPanning, panStartX, panStartY, zoom, dragItem, panX, panY, onUpdate])

  // Mouse up: stop pan or drag
  const handleMouseUp = useCallback(() => {
    if (dragItem) {
      const item = items.find(i => i.id === dragItem.id)
      if (item && item.cork_board_x != null && item.cork_board_y != null) {
        onPositionUpdate(dragItem.id, item.cork_board_x, item.cork_board_y)
      }
      setDragItem(null)
    }
    setIsPanning(false)
  }, [dragItem, items, onPositionUpdate])

  // Double-click on background to create a new note
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    // Allow double-click on the board, container, or any non-note element (e.g. grid background)
    const target = e.target as HTMLElement
    // Block if clicking on a note (any element with a note-item parent)
    if (target.closest('[data-notebook-item]')) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / zoom - panX
    const y = (e.clientY - rect.top) / zoom - panY
    onCreateAtPosition('dialogue', x, y)
  }, [zoom, panX, panY, onCreateAtPosition])

  // Start dragging a note
  const handleNoteMouseDown = useCallback((e: React.MouseEvent, itemId: string, itemX: number, itemY: number) => {
    e.stopPropagation()
    const itemRect = e.currentTarget.getBoundingClientRect()
    setDragItem({
      id: itemId,
      startX: itemX,
      startY: itemY,
      offsetX: (e.clientX - itemRect.left) / zoom,
      offsetY: (e.clientY - itemRect.top) / zoom,
    })
  }, [zoom])

  // Fit all items into the viewport
  const handleFitToContent = useCallback(() => {
    if (items.length === 0) return

    const xs = items.map(i => i.cork_board_x ?? 0)
    const ys = items.map(i => i.cork_board_y ?? 0)

    const minX = Math.min(...xs) - 50
    const minY = Math.min(...ys) - 50
    const maxX = Math.max(...xs) + NOTE_WIDTH + 50
    const maxY = Math.max(...ys) + 250

    const contentWidth = maxX - minX
    const contentHeight = maxY - minY

    const containerWidth = containerRef.current?.clientWidth ?? 1200
    const containerHeight = containerRef.current?.clientHeight ?? 800

    const fitZoom = Math.min(
      containerWidth / contentWidth,
      containerHeight / contentHeight,
      1.5
    )

    setZoom(Math.max(ZOOM_MIN, Math.min(fitZoom, 1.5)))
    setPanX(-minX)
    setPanY(-minY)
  }, [items])

  // Determine cursor style
  const getCursorStyle = (): string => {
    if (dragItem) return 'cursor-grabbing'
    if (isPanning) return 'cursor-grabbing'
    return 'cursor-grab'
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden w-full select-none ${getCursorStyle()}`}
      style={{ height: 'calc(100vh - 120px)' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Board surface with blueprint grid */}
      <div
        ref={boardRef}
        className="absolute"
        style={{
          width: `${BOARD_WIDTH}px`,
          height: `${BOARD_HEIGHT}px`,
          transformOrigin: '0 0',
          transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
          willChange: 'transform',
          backgroundColor: 'var(--bg-secondary)',
          backgroundImage: [
            'linear-gradient(var(--border) 1px, transparent 1px)',
            'linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '50px 50px',
        }}
      >
        {/* Rendered notes */}
        {items.map(item => {
          const x = item.cork_board_x ?? 0
          const y = item.cork_board_y ?? 0
          const rotation = getRotation(item.id)

          return (
            <div
              key={item.id}
              data-notebook-item
              className="absolute select-none"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: `${NOTE_WIDTH}px`,
                transform: `rotate(${rotation}deg)`,
                zIndex: dragItem?.id === item.id ? 100 : 1,
                cursor: 'move',
              }}
              onMouseDown={(e) => handleNoteMouseDown(e, item.id, x, y)}
            >
              <NotebookItem
                item={item}
                variant="sticky"
                onUpdate={onUpdate}
                onArchive={onArchive}
                onGraduate={onGraduate}
                onOpenFiling={onOpenFiling}
                onUnfileItem={onUnfileItem}
                filingTargets={filingTargets}
              />
            </div>
          )
        })}
      </div>

      {/* Empty state overlay */}
      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-none">
            <Plus size={32} className="mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="type-label text-[var(--text-muted)]">DOUBLE-CLICK TO ADD A NOTE</p>
            <p className="type-micro text-[var(--text-muted)] mt-1">or use the + Add Idea button above</p>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-1.5 shadow-lg z-10">
        <Tip content="Zoom out">
          <button
            onClick={() => setZoom(prev => Math.max(ZOOM_MIN, prev - ZOOM_STEP))}
            className="type-micro text-[var(--text-muted)] hover:text-[var(--text-primary)] hover-fade px-1"
          >
            -
          </button>
        </Tip>
        <span className="type-micro text-[var(--text-secondary)] min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Tip content="Zoom in">
          <button
            onClick={() => setZoom(prev => Math.min(ZOOM_MAX, prev + ZOOM_STEP))}
            className="type-micro text-[var(--text-muted)] hover:text-[var(--text-primary)] hover-fade px-1"
          >
            +
          </button>
        </Tip>
        <Tip content="Fit all notes in view">
          <button
            onClick={handleFitToContent}
            className="type-micro text-[var(--text-muted)] hover:text-[var(--text-primary)] hover-fade px-1 ml-1 border-l border-[var(--border)] pl-2"
          >
            FIT
          </button>
        </Tip>
      </div>
    </div>
  )
}
