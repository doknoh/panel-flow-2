'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface FlatPage {
  page: {
    id: string
    page_number: number
    sort_order: number
    story_beat: string | null
    intention: string | null
    page_type?: 'SINGLE' | 'SPLASH' | 'SPREAD_LEFT' | 'SPREAD_RIGHT'
    linked_page_id?: string | null
    panels?: Array<{
      id: string
      visual_description: string | null
      dialogue_blocks?: Array<{ speaker_name: string | null; text: string | null }>
      captions?: Array<{ text: string | null }>
    }>
    plotline_id: string | null
    plotline: { id: string; name: string; color: string } | null
  }
  scene: {
    id: string
    title: string | null
    plotline_id: string | null
    plotline: { id: string; name: string; color: string } | null
  }
  act: { id: string }
  globalPageNumber: number
  orientation: 'left' | 'right'
  isSpread?: boolean
}

interface WeavePageCardProps {
  page: FlatPage
  isFirstPage: boolean
  isSelected: boolean
  isActive: boolean
  isJustMoved: boolean
  onSelect: (pageId: string, event: React.MouseEvent) => void
  onClick: (pageId: string) => void
  panelCount: number
  wordCount: number
}

export function WeavePageCard({
  page,
  isFirstPage,
  isSelected,
  isActive,
  isJustMoved,
  onSelect,
  onClick,
  panelCount,
  wordCount,
}: WeavePageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.page.id,
    disabled: isFirstPage,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const plotlineColor =
    page.page.plotline?.color ?? page.scene.plotline?.color ?? 'var(--border)'

  // Determine ring class
  let ringClass = ''
  if (isJustMoved) {
    ringClass = 'ring-2 ring-[var(--color-success)]'
  } else if (isActive) {
    ringClass = 'ring-2 ring-[var(--color-primary)] shadow-[var(--shadow-md)]'
  } else if (isSelected) {
    ringClass = 'ring-2 ring-[var(--color-primary)]'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group relative flex flex-col bg-[var(--bg-elevated)] border border-[var(--border-subtle)] cursor-pointer select-none overflow-hidden',
        ringClass,
      ]
        .filter(Boolean)
        .join(' ')}
      // Fixed dimensions: 86×118px
      // Using inline style for exact pixel sizes
      onClick={() => onClick(page.page.id)}
    >
      {/* Fixed size wrapper */}
      <div style={{ width: 86, height: 118, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Plotline color bar — 4px top border */}
        <div
          style={{
            height: 4,
            backgroundColor: plotlineColor,
            flexShrink: 0,
          }}
        />

        {/* Card body */}
        <div className="flex flex-col flex-1 px-1.5 pt-1 pb-1 overflow-hidden">
          {/* Top row: drag handle + page number + orientation */}
          <div className="flex items-center gap-0.5 mb-0.5">
            {/* Drag handle — 6-dot grip, 2×3 grid of circles */}
            {!isFirstPage && (
              <button
                {...attributes}
                {...listeners}
                className="flex-shrink-0 cursor-grab active:cursor-grabbing focus:outline-none"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, padding: '1px' }}
                aria-label={`Drag page ${page.globalPageNumber}`}
                onClick={(e) => e.stopPropagation()}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full bg-[var(--border)] group-hover:bg-[var(--text-muted)] transition-colors"
                    style={{ width: 2.5, height: 2.5 }}
                  />
                ))}
              </button>
            )}

            {/* Page number */}
            <span
              className="text-[var(--text-primary)] leading-none"
              style={{
                fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
                fontSize: 24,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {page.globalPageNumber}
            </span>

            {/* Orientation badge */}
            <div
              className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <span
                className="text-white leading-none"
                style={{ fontSize: 6, fontWeight: 700 }}
              >
                {page.orientation === 'left' ? 'L' : 'R'}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div
            className="font-mono text-[var(--text-muted)] mb-0.5"
            style={{ fontSize: 7 }}
          >
            {panelCount}p · {wordCount}w
          </div>

          {/* Story beat preview */}
          {page.page.story_beat && (
            <div
              className="font-mono text-[var(--text-secondary)] overflow-hidden"
              style={{
                fontSize: 6.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {page.page.story_beat}
            </div>
          )}
        </div>

        {/* Checkbox — absolute top-right */}
        <button
          className="absolute top-1.5 right-1.5 flex-shrink-0 flex items-center justify-center focus:outline-none"
          style={{
            width: 13,
            height: 13,
            border: isSelected ? 'none' : '1.5px solid var(--border)',
            borderRadius: 2,
            backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
            cursor: isFirstPage ? 'not-allowed' : 'pointer',
            opacity: isFirstPage ? 0.4 : 1,
          }}
          aria-label={`Select page ${page.globalPageNumber}`}
          disabled={isFirstPage}
          onClick={(e) => {
            e.stopPropagation()
            if (!isFirstPage) onSelect(page.page.id, e)
          }}
        >
          {isSelected && (
            <svg
              width="9"
              height="7"
              viewBox="0 0 9 7"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 3L3.5 5.5L8 1"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
