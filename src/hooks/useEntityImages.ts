'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getImageUrl } from '@/lib/supabase/storage'

/**
 * Image attachment data structure matching the database schema
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
  url?: string
}

type EntityType = 'character' | 'location' | 'series' | 'page'

/**
 * Hook for fetching and managing images for an entity
 *
 * @param entityType - Type of entity (character, location, series, page)
 * @param entityId - UUID of the entity
 * @returns Images array, loading state, error, and refresh function
 */
export function useEntityImages(entityType: EntityType, entityId: string | null) {
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchImages = useCallback(async () => {
    if (!entityId) {
      setImages([])
      return
    }

    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('image_attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('sort_order', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setImages([])
    } else {
      // Add URLs to images
      const imagesWithUrls = (data || []).map((img) => ({
        ...img,
        url: getImageUrl(img.storage_path),
      }))
      setImages(imagesWithUrls)
    }

    setLoading(false)
  }, [entityType, entityId])

  // Fetch images when entityId changes
  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  return {
    images,
    setImages,
    loading,
    error,
    refresh: fetchImages,
  }
}

/**
 * Get the primary image for an entity, or null if none exists
 */
export function getPrimaryImage(images: ImageAttachment[]): ImageAttachment | null {
  return images.find((img) => img.is_primary) || images[0] || null
}
