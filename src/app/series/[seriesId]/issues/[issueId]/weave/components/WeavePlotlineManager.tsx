'use client'

import { useState } from 'react'
import { Tip } from '@/components/ui/Tip'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
  sort_order: number
}

interface WeavePlotlineManagerProps {
  plotlines: Plotline[]
  onCreatePlotline: (name: string) => void
  onDeletePlotline: (id: string) => void
  onUpdateColor: (id: string, color: string) => void
}

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

export function WeavePlotlineManager({
  plotlines,
  onCreatePlotline,
  onDeletePlotline,
  onUpdateColor,
}: WeavePlotlineManagerProps) {
  const [newPlotlineName, setNewPlotlineName] = useState('')
  const [editingPlotlineId, setEditingPlotlineId] = useState<string | null>(null)
  const [editingPlotlineColor, setEditingPlotlineColor] = useState('')

  const handleCreate = () => {
    if (!newPlotlineName.trim()) return
    onCreatePlotline(newPlotlineName.trim())
    setNewPlotlineName('')
  }

  return (
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
            <Tip content="Change color">
            <button
              className="w-5 h-5 rounded-full border-2 border-white/40 hover:scale-110 hover-fade transition-transform shadow-sm"
              style={{ backgroundColor: pl.color }}
              onClick={() => {
                setEditingPlotlineId(editingPlotlineId === pl.id ? null : pl.id)
                setEditingPlotlineColor(pl.color)
              }}
            />
            </Tip>
            <span className="font-medium">{pl.name}</span>
            <Tip content="Delete plotline">
            <button
              onClick={() => onDeletePlotline(pl.id)}
              className="text-[var(--text-secondary)] hover-fade-danger ml-1 text-lg leading-none"
            >
              ×
            </button>
            </Tip>

            {editingPlotlineId === pl.id && (
              <div className="absolute top-full left-0 mt-2 p-3 bg-[var(--bg-tertiary)] rounded-lg shadow-xl border border-[var(--border)] z-50">
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {PLOTLINE_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 hover-fade ${
                        editingPlotlineColor === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => onUpdateColor(pl.id, color)}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={editingPlotlineColor}
                  onChange={(e) => setEditingPlotlineColor(e.target.value)}
                  onBlur={() => onUpdateColor(pl.id, editingPlotlineColor)}
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
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New plotline (e.g., A Plot - Marshall's Story)"
          className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={handleCreate}
          disabled={!newPlotlineName.trim()}
          className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] hover-lift disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] rounded-lg text-sm font-medium"
        >
          Add
        </button>
      </div>
    </div>
  )
}
