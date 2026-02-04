'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import ImageUploader, { ImageAttachment } from '@/components/ImageUploader'
import { useEntityImages } from '@/hooks/useEntityImages'

interface Location {
  id: string
  name: string
  description: string | null
  visual_description: string | null
  significance: string | null
}

interface LocationListProps {
  seriesId: string
  initialLocations: Location[]
}

export default function LocationList({ seriesId, initialLocations }: LocationListProps) {
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<Partial<Location>>({})
  const { showToast } = useToast()

  // Image management for the location being edited
  const { images, setImages, loading: imagesLoading } = useEntityImages(
    'location',
    editingId
  )

  const refreshLocations = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('series_id', seriesId)
      .order('name')

    if (data) setLocations(data)
  }

  const startCreate = () => {
    setIsCreating(true)
    setEditingId(null)
    setForm({
      name: '',
      description: '',
      visual_description: '',
      significance: '',
    })
  }

  const startEdit = (location: Location) => {
    setEditingId(location.id)
    setIsCreating(false)
    setForm({
      name: location.name,
      description: location.description || '',
      visual_description: location.visual_description || '',
      significance: location.significance || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setIsCreating(false)
    setForm({})
  }

  const saveLocation = async () => {
    const trimmedName = form.name?.trim()
    if (!trimmedName) {
      showToast('Location name cannot be empty', 'error')
      return
    }

    const supabase = createClient()

    if (isCreating) {
      const tempId = `temp-loc-${Date.now()}`
      const newLocation: Location = {
        id: tempId,
        name: trimmedName,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        significance: form.significance?.trim() || null,
      }

      // Optimistic update FIRST
      setLocations(prev => [...prev, newLocation].sort((a, b) => a.name.localeCompare(b.name)))
      cancelEdit()
      showToast('Location created', 'success')

      // Then persist to database
      const { data, error } = await supabase.from('locations').insert({
        series_id: seriesId,
        name: trimmedName,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        significance: form.significance?.trim() || null,
      }).select().single()

      if (error) {
        // Rollback on error
        setLocations(prev => prev.filter(l => l.id !== tempId))
        showToast('Failed to create location: ' + error.message, 'error')
      } else if (data) {
        // Replace temp ID with real ID
        setLocations(prev => prev.map(l => l.id === tempId ? data : l))
      }
    } else if (editingId) {
      // Store previous value for rollback
      const previousLocation = locations.find(l => l.id === editingId)
      const updatedLocation: Location = {
        id: editingId,
        name: trimmedName,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        significance: form.significance?.trim() || null,
      }

      // Optimistic update FIRST
      setLocations(prev => prev.map(l => l.id === editingId ? updatedLocation : l).sort((a, b) => a.name.localeCompare(b.name)))
      cancelEdit()
      showToast('Location updated', 'success')

      // Then persist to database
      const { error } = await supabase.from('locations').update({
        name: trimmedName,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        significance: form.significance?.trim() || null,
      }).eq('id', editingId)

      if (error) {
        // Rollback on error
        if (previousLocation) {
          setLocations(prev => prev.map(l => l.id === editingId ? previousLocation : l))
        }
        showToast('Failed to update location: ' + error.message, 'error')
      }
    }
  }

  const deleteLocation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this location?')) return

    // Store for rollback
    const deletedLocation = locations.find(l => l.id === id)

    // Optimistic update FIRST
    setLocations(prev => prev.filter(l => l.id !== id))
    showToast('Location deleted', 'success')

    // Then persist to database
    const supabase = createClient()
    const { error } = await supabase.from('locations').delete().eq('id', id)

    if (error) {
      // Rollback on error
      if (deletedLocation) {
        setLocations(prev => [...prev, deletedLocation].sort((a, b) => a.name.localeCompare(b.name)))
      }
      showToast('Failed to delete location: ' + error.message, 'error')
    }
  }

  const renderForm = () => (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 sm:p-6 mb-6">
      <h3 className="font-semibold mb-4">{isCreating ? 'New Location' : 'Edit Location'}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Name *</label>
          <input
            type="text"
            value={form.name || ''}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="Location name"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={2}
            placeholder="General description of this location"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Visual Description</label>
          <textarea
            value={form.visual_description || ''}
            onChange={(e) => setForm(prev => ({ ...prev, visual_description: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={3}
            placeholder="Detailed visual description for artists"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Story Significance</label>
          <textarea
            value={form.significance || ''}
            onChange={(e) => setForm(prev => ({ ...prev, significance: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={2}
            placeholder="Why is this location important to the story?"
          />
        </div>

        {/* Reference Images */}
        {!isCreating && editingId && (
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">Reference Images</label>
            {imagesLoading ? (
              <div className="text-center py-4 text-[var(--text-muted)]">Loading images...</div>
            ) : (
              <ImageUploader
                entityType="location"
                entityId={editingId}
                existingImages={images}
                onImagesChange={setImages}
                maxImages={10}
              />
            )}
          </div>
        )}

        {isCreating && (
          <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 text-sm text-[var(--text-secondary)]">
            <p>💡 Save the location first, then you can add reference images.</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={saveLocation}
            disabled={!form.name?.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--border)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
          >
            {isCreating ? 'Create Location' : 'Save Changes'}
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
      <div className="flex items-center justify-between mb-6">
        <p className="text-[var(--text-secondary)]">{locations.length} location{locations.length !== 1 ? 's' : ''}</p>
        {!isCreating && !editingId && (
          <button
            onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            + New Location
          </button>
        )}
      </div>

      {(isCreating || editingId) && renderForm()}

      {locations.length === 0 && !isCreating ? (
        <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <div className="text-5xl mb-4 opacity-30">🏛️</div>
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No locations yet</h3>
          <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mb-6">
            Locations appear in autocomplete when describing panel settings.
            Define their visual details to maintain consistency across scenes.
          </p>
          <button
            onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            Create Your First Location
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((location) => (
            <div
              key={location.id}
              className={`bg-[var(--bg-secondary)] border rounded-lg p-4 ${
                editingId === location.id ? 'border-blue-500' : 'border-[var(--border)]'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg">{location.name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(location)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteLocation(location.id)}
                    className="text-[var(--text-secondary)] hover:text-red-400 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {location.description && (
                <p className="text-[var(--text-secondary)] text-sm mb-2">{location.description}</p>
              )}
              {location.visual_description && (
                <p className="text-[var(--text-muted)] text-sm line-clamp-2">
                  <span className="text-[var(--text-secondary)]">Visual: </span>
                  {location.visual_description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
