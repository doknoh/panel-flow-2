'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Card dimensions in rem — scales with font toggle, maintains 1:1.54 aspect ratio
const CARD_W = '5.375rem'  // 86px at 1x
const CARD_H = '8.25rem'   // 132px at 1x

interface FlatPage {
  page: {
    id: string
    page_number: number
    sort_order: number
    page_summary: string | null
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

export { CARD_W, CARD_H }

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
      onClick={() => onClick(page.page.id)}
    >
      {/* Scalable size wrapper — rem units so it grows with font toggle */}
      <div style={{ width: CARD_W, height: CARD_H, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Plotline color bar */}
        <div
          style={{
            height: '0.25rem',
            backgroundColor: plotlineColor,
            flexShrink: 0,
          }}
        />

        {/* Card body */}
        <div className="flex flex-col flex-1" style={{ padding: '0.3125rem 0.375rem 0.25rem' }}>
          {/* Top row: drag handle + stats */}
          <div className="flex items-center gap-1" style={{ marginBottom: '0.1875rem', paddingRight: '0.875rem' }}>
            {/* Drag handle */}
            {!isFirstPage && (
              <button
                {...attributes}
                {...listeners}
                className="flex-shrink-0 cursor-grab active:cursor-grabbing focus:outline-none"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.09375rem', padding: '0.0625rem' }}
                aria-label={`Drag page ${page.globalPageNumber}`}
                onClick={(e) => e.stopPropagation()}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full bg-[var(--border)] group-hover:bg-[var(--text-muted)] transition-colors"
                    style={{ width: '0.15625rem', height: '0.15625rem' }}
                  />
                ))}
              </button>
            )}

            {/* Stats */}
            <div
              className="font-mono text-[var(--text-muted)] truncate"
              style={{ fontSize: '0.4375rem' }}
            >
              {panelCount}p · {wordCount}w
            </div>
          </div>

          {/* Page summary / story beat preview */}
          {(page.page.page_summary || page.page.story_beat) && (
            <div
              className="text-[var(--text-secondary)]"
              style={{
                fontSize: '0.5rem',
                fontWeight: 500,
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 6,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {page.page.page_summary || page.page.story_beat}
            </div>
          )}
        </div>

        {/* Checkbox — absolute top-right */}
        <button
          className="absolute flex-shrink-0 flex items-center justify-center focus:outline-none"
          style={{
            top: '0.375rem',
            right: '0.25rem',
            width: '0.8125rem',
            height: '0.8125rem',
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
