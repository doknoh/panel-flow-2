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
      const { error } = await supabase.from('plotlines').insert({
        series_id: seriesId,
        name: trimmedName,
        color: form.color,
        description: form.description?.trim() || null,
        sort_order: plotlines.length,
      })

      if (error) {
        showToast('Failed to create plotline: ' + error.message, 'error')
        return
      }
      showToast('Plotline created', 'success')
    } else if (editingId) {
      const { error } = await supabase.from('plotlines').update({
        name: trimmedName,
        color: form.color,
        description: form.description?.trim() || null,
      }).eq('id', editingId)

      if (error) {
        showToast('Failed to update plotline: ' + error.message, 'error')
        return
      }
      showToast('Plotline updated', 'success')
    }

    cancelEdit()
    refreshPlotlines()
  }

  const deletePlotline = async (id: string) => {
    if (!confirm('Are you sure you want to delete this plotline? Scenes assigned to it will be unassigned.')) return

    const supabase = createClient()
    const { error } = await supabase.from('plotlines').delete().eq('id', id)

    if (error) {
      showToast('Failed to delete plotline: ' + error.message, 'error')
      return
    }

    showToast('Plotline deleted', 'success')
    refreshPlotlines()
  }

  const renderForm = () => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-6 mb-6">
      <h3 className="font-semibold mb-4">{isCreating ? 'New Plotline' : 'Edit Plotline'}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Name *</label>
          <input
            type="text"
            value={form.name || ''}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Marshall IRL, Tracy Solo, B-Plot"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {PLOTLINE_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, color: color.value }))}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  form.color === color.value
                    ? 'border-white scale-110'
                    : 'border-transparent hover:border-zinc-500'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Description</label>
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={3}
            placeholder="Brief description of this plotline's focus"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={savePlotline}
            disabled={!form.name?.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
          >
            {isCreating ? 'Create Plotline' : 'Save Changes'}
          </button>
          <button
            onClick={cancelEdit}
            className="bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded"
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
        <p className="text-zinc-400 mb-2">
          Plotlines help you track different narrative threads in your story.
          Assign plotlines to scenes to visualize how your story weaves together.
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <p className="text-zinc-400">{plotlines.length} plotline{plotlines.length !== 1 ? 's' : ''}</p>
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
        <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="text-5xl mb-4 opacity-30">🧵</div>
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No plotlines yet</h3>
          <p className="text-zinc-500 text-sm max-w-md mx-auto mb-6">
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
              className={`bg-zinc-900 border rounded-lg p-4 ${
                editingId === plotline.id ? 'border-blue-500' : 'border-zinc-800'
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
                      <p className="text-zinc-400 text-sm mt-1">{plotline.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => startEdit(plotline)}
                    className="text-zinc-400 hover:text-white text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePlotline(plotline.id)}
                    className="text-zinc-400 hover:text-red-400 text-sm"
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
