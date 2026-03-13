'use client'

import { Tip } from '@/components/ui/Tip'

interface PanelNoteIndicatorProps {
  noteCount: number
  onClick: () => void
}

export default function PanelNoteIndicator({ noteCount, onClick }: PanelNoteIndicatorProps) {
  if (noteCount === 0) return null

  return (
    <Tip content={`${noteCount} note${noteCount !== 1 ? 's' : ''}`}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium transition-all duration-150 ease-out active:scale-[0.95] hover:opacity-90 hover-fade"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--color-warning)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Sticky note icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <path
            d="M3 1.5h10A1.5 1.5 0 0 1 14.5 3v7.586a1.5 1.5 0 0 1-.44 1.06l-3.414 3.415a1.5 1.5 0 0 1-1.06.439H3A1.5 1.5 0 0 1 1.5 14V3A1.5 1.5 0 0 1 3 1.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 9.5v4l4-4h-4Z"
            fill="currentColor"
            opacity="0.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span>{noteCount}</span>
      </button>
    </Tip>
  )
}
