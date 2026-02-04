/**
 * Supabase Storage utilities for image attachments
 *
 * Handles uploading, deleting, and retrieving images from Supabase Storage.
 * Images are organized by user and entity type for easy management.
 */

import { createClient } from './client'

// Storage bucket name - must be created in Supabase dashboard
export const BUCKET_NAME = 'panel-flow-images'

// Maximum file size: 5MB
export const MAX_FILE_SIZE = 5 * 1024 * 1024

// Allowed MIME types
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]

// Allowed file extensions
export const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

export interface UploadResult {
  path: string
  url: string
}

export interface UploadError {
  message: string
  code?: string
}

/**
 * Validates a file before upload
 */
export function validateFile(file: File): UploadError | null {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      code: 'FILE_TOO_LARGE',
    }
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      message: `Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      code: 'INVALID_TYPE',
    }
  }

  return null
}

/**
 * Generates a unique storage path for an image
 *
 * Path format: {userId}/{entityType}/{entityId}/{timestamp}.{ext}
 */
function generateStoragePath(
  userId: string,
  entityType: string,
  entityId: string,
  filename: string
): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'png'
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 8)

  return `${userId}/${entityType}/${entityId}/${timestamp}-${randomSuffix}.${ext}`
}

/**
 * Uploads an image to Supabase Storage
 *
 * @param file - The file to upload
 * @param entityType - Type of entity (character, location, series, page)
 * @param entityId - UUID of the entity
 * @returns Upload result with path and public URL, or null on failure
 */
export async function uploadImage(
  file: File,
  entityType: 'character' | 'location' | 'series' | 'page',
  entityId: string
): Promise<UploadResult | null> {
  const supabase = createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error('Upload error: Not authenticated')
    return null
  }

  // Validate file
  const validationError = validateFile(file)
  if (validationError) {
    console.error('Upload error:', validationError.message)
    return null
  }

  // Generate storage path
  const storagePath = generateStoragePath(user.id, entityType, entityId, file.name)

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      cacheControl: '3600', // Cache for 1 hour
      upsert: false, // Don't overwrite existing files
    })

  if (error) {
    console.error('Storage upload error:', error.message)
    return null
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path)

  return {
    path: data.path,
    url: publicUrl,
  }
}

/**
 * Deletes an image from Supabase Storage
 *
 * @param storagePath - The path of the file to delete
 * @returns true if successful, false otherwise
 */
export async function deleteImage(storagePath: string): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath])

  if (error) {
    console.error('Storage delete error:', error.message)
    return false
  }

  return true
}

/**
 * Gets the public URL for an image
 *
 * @param storagePath - The storage path of the file
 * @returns The public URL
 */
export function getImageUrl(storagePath: string): string {
  const supabase = createClient()

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath)

  return data.publicUrl
}

/**
 * Deletes all images for a specific entity
 *
 * Useful when deleting a character, location, etc.
 *
 * @param entityType - Type of entity
 * @param entityId - UUID of the entity
 * @param userId - User ID for path construction
 */
export async function deleteAllEntityImages(
  entityType: 'character' | 'location' | 'series' | 'page',
  entityId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient()

  // List all files in the entity's folder
  const folderPath = `${userId}/${entityType}/${entityId}`

  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folderPath)

  if (listError) {
    console.error('Error listing files:', listError.message)
    return false
  }

  if (!files || files.length === 0) {
    return true // No files to delete
  }

  // Delete all files
  const filePaths = files.map(f => `${folderPath}/${f.name}`)

  const { error: deleteError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(filePaths)

  if (deleteError) {
    console.error('Error deleting files:', deleteError.message)
    return false
  }

  return true
}

/**
 * Copies an image to a new entity
 *
 * Useful when duplicating entities
 *
 * @param sourcePath - Original image path
 * @param targetEntityType - Type of target entity
 * @param targetEntityId - UUID of target entity
 * @returns New upload result or null
 */
export async function copyImage(
  sourcePath: string,
  targetEntityType: 'character' | 'location' | 'series' | 'page',
  targetEntityId: string
): Promise<UploadResult | null> {
  const supabase = createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error('Copy error: Not authenticated')
    return null
  }

  // Download the source file
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET_NAME)
    .download(sourcePath)

  if (downloadError || !fileData) {
    console.error('Error downloading source file:', downloadError?.message)
    return null
  }

  // Get filename from source path
  const filename = sourcePath.split('/').pop() || 'image.png'

  // Generate new path
  const newPath = generateStoragePath(user.id, targetEntityType, targetEntityId, filename)

  // Upload to new location
  const { data, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(newPath, fileData, {
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    console.error('Error uploading copied file:', uploadError.message)
    return null
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path)

  return {
    path: data.path,
    url: publicUrl,
  }
}
