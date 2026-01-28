'use client'

import { useState, useEffect } from 'react'

export type ViewMode = 'outline' | 'draft'

interface OutlineToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  className?: string
}

export default function OutlineToggle({ mode, onChange, className = '' }: OutlineToggleProps) {
  return (
    <div className={`flex gap-1 bg-[var(--bg-tertiary)] rounded-lg p-0.5 ${className}`}>
      <button
        onClick={() => onChange('outline')}
        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
          mode === 'outline'
            ? 'bg-purple-600 text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        title="View and edit story structure"
      >
        Outline
      </button>
      <button
        onClick={() => onChange('draft')}
        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
          mode === 'draft'
            ? 'bg-green-600 text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        title="Write panel descriptions and dialogue"
      >
        Draft
      </button>
    </div>
  )
}

// Custom hook for persisting view mode
export function useViewMode(key: string = 'panel-flow-view-mode'): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>('draft')

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(key)
    if (stored === 'outline' || stored === 'draft') {
      setMode(stored)
    }
  }, [key])

  // Save to localStorage when changed
  const handleSetMode = (newMode: ViewMode) => {
    setMode(newMode)
    localStorage.setItem(key, newMode)
  }

  return [mode, handleSetMode]
}
