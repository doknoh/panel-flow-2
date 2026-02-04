'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  uploadImage,
  deleteImage,
  getImageUrl,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
} from '@/lib/supabase/storage'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

/**
 * Image attachment data structure
 */
export interface ImageAttachment {
  id: string
  storage_path: string
  filename: string
  mime_type: string
  file_size: number
  caption: string | null
  is_primary: boolean
  sort_order: number
  url?: string // Computed from storage_path
}

interface ImageUploaderProps {
  /** Type of entity this image belongs to */
  entityType: 'character' | 'location' | 'series' | 'page'
  /** UUID of the entity */
  entityId: string
  /** Existing images for this entity */
  existingImages: ImageAttachment[]
  /** Callback when images change (add, remove, reorder) */
  onImagesChange: (images: ImageAttachment[]) => void
  /** Maximum number of images allowed (default: 10) */
  maxImages?: number
  /** Show compact view (for sidebar use) */
  compact?: boolean
}

/**
 * ImageUploader Component
 *
 * Provides drag-and-drop image upload with:
 * - Multiple file support
 * - Primary image designation
 * - Image deletion
 * - Caption editing
 * - Grid display of existing images
 */
export default function ImageUploader({
  entityType,
  entityId,
  existingImages,
  onImagesChange,
  maxImages = 10,
  compact = false,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [editingCaption, setEditingCaption] = useState<string | null>(null)
  const [captionValue, setCaptionValue] = useState('')
  const { showToast } = useToast()

  /**
   * Handle file drop/selection
   */
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      // Check if we'd exceed max images
      if (existingImages.length + acceptedFiles.length > maxImages) {
        showToast(`Maximum ${maxImages} images allowed`, 'error')
        return
      }

      setUploading(true)
      const supabase = createClient()
      const newImages: ImageAttachment[] = []

      for (const file of acceptedFiles) {
        // Upload to storage
        const result = await uploadImage(file, entityType, entityId)

        if (result) {
          // Save metadata to database
          const { data, error } = await supabase
            .from('image_attachments')
            .insert({
              entity_type: entityType,
              entity_id: entityId,
              storage_path: result.path,
              filename: file.name,
              mime_type: file.type,
              file_size: file.size,
              is_primary: existingImages.length === 0 && newImages.length === 0, // First image is primary
              sort_order: existingImages.length + newImages.length,
            })
            .select()
            .single()

          if (data && !error) {
            newImages.push({
              ...data,
              url: result.url,
            })
          } else {
            console.error('Failed to save image metadata:', error)
            // Clean up the uploaded file
            await deleteImage(result.path)
          }
        }
      }

      if (newImages.length > 0) {
        onImagesChange([...existingImages, ...newImages])
        showToast(
          `${newImages.length} image${newImages.length > 1 ? 's' : ''} uploaded`,
          'success'
        )
      }

      setUploading(false)
    },
    [entityType, entityId, existingImages, maxImages, onImagesChange, showToast]
  )

  /**
   * Configure dropzone
   */
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ALLOWED_EXTENSIONS,
    },
    maxSize: MAX_FILE_SIZE,
    disabled: uploading,
  })

  /**
   * Delete an image
   */
  const handleDelete = async (image: ImageAttachment) => {
    const supabase = createClient()

    // Delete from storage
    await deleteImage(image.storage_path)

    // Delete from database
    await supabase.from('image_attachments').delete().eq('id', image.id)

    // Update state
    const remaining = existingImages.filter((i) => i.id !== image.id)

    // If we deleted the primary and there are others, make the first one primary
    if (image.is_primary && remaining.length > 0) {
      remaining[0].is_primary = true
      await supabase
        .from('image_attachments')
        .update({ is_primary: true })
        .eq('id', remaining[0].id)
    }

    onImagesChange(remaining)
    showToast('Image removed', 'success')
  }

  /**
   * Set an image as primary
   */
  const handleSetPrimary = async (image: ImageAttachment) => {
    if (image.is_primary) return

    const supabase = createClient()

    // Update in database (trigger handles clearing old primary)
    await supabase
      .from('image_attachments')
      .update({ is_primary: true })
      .eq('id', image.id)

    // Update local state
    onImagesChange(
      existingImages.map((i) => ({
        ...i,
        is_primary: i.id === image.id,
      }))
    )

    showToast('Primary image updated', 'success')
  }

  /**
   * Save caption for an image
   */
  const handleSaveCaption = async (image: ImageAttachment) => {
    const supabase = createClient()

    await supabase
      .from('image_attachments')
      .update({ caption: captionValue || null })
      .eq('id', image.id)

    onImagesChange(
      existingImages.map((i) =>
        i.id === image.id ? { ...i, caption: captionValue || null } : i
      )
    )

    setEditingCaption(null)
    setCaptionValue('')
  }

  /**
   * Get display URL for an image
   */
  const getDisplayUrl = (image: ImageAttachment): string => {
    return image.url || getImageUrl(image.storage_path)
  }

  // Compact view for sidebars
  if (compact) {
    return (
      <div className="space-y-2">
        {/* Thumbnail grid */}
        {existingImages.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {existingImages.map((image) => (
              <div
                key={image.id}
                className={`relative w-12 h-12 rounded overflow-hidden group ${
                  image.is_primary ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                <img
                  src={getDisplayUrl(image)}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => handleDelete(image)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Mini upload button */}
        {existingImages.length < maxImages && (
          <div
            {...getRootProps()}
            className={`border border-dashed rounded p-2 text-center cursor-pointer transition-colors text-xs ${
              isDragActive
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
            }`}
          >
            <input {...getInputProps()} />
            {uploading ? '...' : '+ Add image'}
          </div>
        )}
      </div>
    )
  }

  // Full view
  return (
    <div className="space-y-4">
      {/* Existing images grid */}
      {existingImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {existingImages.map((image) => (
            <div
              key={image.id}
              className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                image.is_primary
                  ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                  : 'border-transparent hover:border-[var(--border)]'
              }`}
            >
              {/* Image */}
              <img
                src={getDisplayUrl(image)}
                alt={image.filename}
                className="w-full h-full object-cover"
              />

              {/* Primary badge */}
              {image.is_primary && (
                <div className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                  PRIMARY
                </div>
              )}

              {/* Hover overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                <div className="flex gap-2">
                  {!image.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(image)}
                      className="p-2 bg-blue-500 hover:bg-blue-600 rounded-full text-white text-sm transition-colors"
                      title="Set as primary"
                    >
                      ★
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingCaption(image.id)
                      setCaptionValue(image.caption || '')
                    }}
                    className="p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-full text-white text-sm transition-colors"
                    title="Edit caption"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(image)}
                    className="p-2 bg-red-500 hover:bg-red-600 rounded-full text-white text-sm transition-colors"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>

                {/* Caption display */}
                {image.caption && (
                  <p className="text-xs text-white/80 text-center line-clamp-2 mt-1">
                    {image.caption}
                  </p>
                )}
              </div>

              {/* Caption editor */}
              {editingCaption === image.id && (
                <div className="absolute inset-0 bg-black/90 p-3 flex flex-col">
                  <textarea
                    value={captionValue}
                    onChange={(e) => setCaptionValue(e.target.value)}
                    placeholder="Add a caption..."
                    className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded p-2 text-sm resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setEditingCaption(null)}
                      className="flex-1 py-1 text-sm text-[var(--text-secondary)] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveCaption(image)}
                      className="flex-1 py-1 text-sm bg-blue-500 hover:bg-blue-600 rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload dropzone */}
      {existingImages.length < maxImages && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
            isDragActive
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-[var(--border)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/50'
          } ${uploading ? 'opacity-50 cursor-wait' : ''}`}
        >
          <input {...getInputProps()} />

          {uploading ? (
            <div className="space-y-2">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-[var(--text-muted)]">Uploading...</p>
            </div>
          ) : isDragActive ? (
            <div className="space-y-2">
              <div className="text-4xl">📸</div>
              <p className="text-sm text-blue-400">Drop images here</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-4xl opacity-50">🖼️</div>
              <p className="text-sm text-[var(--text-secondary)]">
                Drag & drop images, or click to select
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                PNG, JPG, GIF, WebP • Max {MAX_FILE_SIZE / 1024 / 1024}MB
              </p>
            </div>
          )}
        </div>
      )}

      {/* Image count */}
      <p className="text-xs text-[var(--text-muted)] text-center">
        {existingImages.length} / {maxImages} images
      </p>
    </div>
  )
}
