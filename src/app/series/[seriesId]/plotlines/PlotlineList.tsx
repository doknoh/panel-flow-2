'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface Plotline {
  id: string
  name: string
  color: string
  description: string | null
  sort_order: number
}

interface PlotlineListProps {
  seriesId: string
  initialPlotlines: Plotline[]
}

// Predefined color palette for plotlines
const PLOTLINE_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Gray', value: '#71717a' },
]

export default function PlotlineList({ seriesId, initialPlotlines }: PlotlineListProps) {
  const [plotlines, setPlotlines] = useState<Plotline[]>(initialPlotlines)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<Partial<Plotline>>({})
  const { showToast } = useToast()

  const refreshPlotlines = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('plotlines')
      .select('*')
      .eq('series_id', seriesId)
      .order('sort_order')

    if (data) setPlotlines(data)
  }

  const getNextColor = () => {
    // Pick a color that's not already used, or cycle through
    const usedColors = new Set(plotlines.map(p => p.color))
    const availableColor = PLOTLINE_COLORS.find(c => !usedColors.has(c.value))
    return availableColor?.value || PLOTLINE_COLORS[plotlines.length % PLOTLINE_COLORS.length].value
  }

  const startCreate = () => {
    setIsCreating(true)
    setEditingId(null)
    setForm({
      name: '',
      color: getNextColor(),
      description: '',
    })
  }

  const startEdit = (plotline: Plotline) => {
    setEditingId(plotline.id)
    setIsCreating(false)
    setForm({
      name: plotline.name,
      color: plotline.color,
      description: plotline.description || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setIsCreating(false)
    setForm({})
  }

  const savePlotline = async () => {
    const trimmedName = form.name?.trim()
    if (!trimmedName) {
      showToast('Plotline name cannot be empty', 'error')
      return
    }

    const supabase = createClient()

    if (isCreating) {
      const tempId = `temp-plotline-${Date.now()}`
      const newPlotline: Plotline = {
        id: tempId,
        name: trimmedName,
        color: form.color || '#3b82f6',
        description: form.description?.trim() || null,
        sort_order: plotlines.length,
      }

      // Optimistic update FIRST
      setPlotlines(prev => [...prev, newPlotline])
      cancelEdit()
      showToast('Plotline created', 'success')

      // Then persist to database
      const { data, error } = await supabase.from('plotlines').insert({
        series_id: seriesId,
        name: trimmedName,
        color: form.color,
        description: form.description?.trim() || null,
        sort_order: plotlines.length,
      }).select().single()

      if (error) {
        // Rollback on error
        setPlotlines(prev => prev.filter(p => p.id !== tempId))
        showToast('Failed to create plotline: ' + error.message, 'error')
      } else if (data) {
        // Replace temp ID with real ID
        setPlotlines(prev => prev.map(p => p.id === tempId ? data : p))
      }
    } else if (editingId) {
      // Store previous value for rollback
      const previousPlotline = plotlines.find(p => p.id === editingId)
      const updatedPlotline: Plotline = {
        id: editingId,
        name: trimmedName,
        color: form.color || previousPlotline?.color || '#3b82f6',
        description: form.description?.trim() || null,
        sort_order: previousPlotline?.sort_order || 0,
      }

      // Optimistic update FIRST
      setPlotlines(prev => prev.map(p => p.id === editingId ? updatedPlotline : p))
      cancelEdit()
      showToast('Plotline updated', 'success')

      // Then persist to database
      const { error } = await supabase.from('plotlines').update({
        name: trimmedName,
        color: form.color,
        description: form.description?.trim() || null,
      }).eq('id', editingId)

      if (error) {
        // Rollback on error
        if (previousPlotline) {
          setPlotlines(prev => prev.map(p => p.id === editingId ? previousPlotline : p))
        }
        showToast('Failed to update plotline: ' + error.message, 'error')
      }
    }
  }

  const deletePlotline = async (id: string) => {
    if (!confirm('Are you sure you want to delete this plotline? Scenes assigned to it will be unassigned.')) return

    // Store for rollback
    const deletedPlotline = plotlines.find(p => p.id === id)

    // Optimistic update FIRST
    setPlotlines(prev => prev.filter(p => p.id !== id))
    showToast('Plotline deleted', 'success')

    // Then persist to database
    const supabase = createClient()
    const { error } = await supabase.from('plotlines').delete().eq('id', id)

    if (error) {
      // Rollback on error
      if (deletedPlotline) {
        setPlotlines(prev => [...prev, deletedPlotline].sort((a, b) => a.sort_order - b.sort_order))
      }
      showToast('Failed to delete plotline: ' + error.message, 'error')
    }
  }

  const renderForm = () => (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 sm:p-6 mb-6">
      <h3 className="font-semibold mb-4">{isCreating ? 'New Plotline' : 'Edit Plotline'}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Name *</label>
          <input
            type="text"
            value={form.name || ''}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Marshall IRL, Tracy Solo, B-Plot"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {PLOTLINE_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, color: color.value }))}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  form.color === color.value
                    ? 'border-white scale-110'
                    : 'border-transparent hover:border-[var(--text-muted)]'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={3}
            placeholder="Brief description of this plotline's focus"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={savePlotline}
            disabled={!form.name?.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--border)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
          >
            {isCreating ? 'Create Plotline' : 'Save Changes'}
          </button>
          <button
            onClick={cancelEdit}
            className="bg-[var(--border)] hover:bg-[var(--bg-tertiary)] px-4 py-2 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <p className="text-[var(--text-secondary)] mb-2">
          Plotlines help you track different narrative threads in your story.
          Assign plotlines to scenes to visualize how your story weaves together.
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <p className="text-[var(--text-secondary)]">{plotlines.length} plotline{plotlines.length !== 1 ? 's' : ''}</p>
        {!isCreating && !editingId && (
          <button
            onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            + New Plotline
          </button>
        )}
      </div>

      {(isCreating || editingId) && renderForm()}

      {plotlines.length === 0 && !isCreating ? (
        <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <div className="text-5xl mb-4 opacity-30">🧵</div>
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No plotlines yet</h3>
          <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mb-6">
            Plotlines help track narrative threads across your series.
            Assign them to scenes and visualize how your story weaves together.
          </p>
          <button
            onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            Create Your First Plotline
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {plotlines.map((plotline) => (
            <div
              key={plotline.id}
              className={`bg-[var(--bg-secondary)] border rounded-lg p-4 ${
                editingId === plotline.id ? 'border-blue-500' : 'border-[var(--border)]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div
                    className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: plotline.color }}
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{plotline.name}</h3>
                    {plotline.description && (
                      <p className="text-[var(--text-secondary)] text-sm mt-1">{plotline.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => startEdit(plotline)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePlotline(plotline.id)}
                    className="text-[var(--text-secondary)] hover:text-red-400 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
