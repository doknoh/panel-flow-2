import { SupabaseClient } from '@supabase/supabase-js'
import { fetchPageDeepData, fetchSceneDeepData, fetchActDeepData } from './undoHelpers'

export interface BatchDeleteResult {
  success: boolean
  error?: string
  deletedItems: Array<{ id: string; parentId: string; data: any }>
}

export async function batchDeletePages(
  supabase: SupabaseClient,
  pageIds: string[],
  issue: any
): Promise<BatchDeleteResult> {
  // Deep-fetch all pages in parallel for undo
  const fetchResults = await Promise.allSettled(
    pageIds.map(id => fetchPageDeepData(supabase, id))
  )

  const items: Array<{ id: string; parentId: string; data: any }> = []
  for (let i = 0; i < pageIds.length; i++) {
    const result = fetchResults[i]
    const parentSceneId = findPageParentScene(pageIds[i], issue)
    if (result.status === 'fulfilled' && parentSceneId) {
      items.push({ id: pageIds[i], parentId: parentSceneId, data: result.value })
    }
  }

  // Delete all pages in parallel
  const deleteResults = await Promise.allSettled(
    pageIds.map(id => supabase.from('pages').delete().eq('id', id))
  )

  const errors = deleteResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
  if (errors.length > 0) {
    const firstError = errors[0]
    const msg = firstError.status === 'rejected'
      ? (firstError.reason as Error).message
      : firstError.value.error?.message || 'Unknown error'
    return { success: false, error: msg, deletedItems: items }
  }

  return { success: true, deletedItems: items }
}

export async function batchDeleteScenes(
  supabase: SupabaseClient,
  sceneIds: string[],
  issue: any
): Promise<BatchDeleteResult> {
  const fetchResults = await Promise.allSettled(
    sceneIds.map(id => fetchSceneDeepData(supabase, id))
  )

  const items: Array<{ id: string; parentId: string; data: any }> = []
  for (let i = 0; i < sceneIds.length; i++) {
    const result = fetchResults[i]
    const parentActId = findSceneParentAct(sceneIds[i], issue)
    if (result.status === 'fulfilled' && parentActId) {
      items.push({ id: sceneIds[i], parentId: parentActId, data: result.value })
    }
  }

  const deleteResults = await Promise.allSettled(
    sceneIds.map(id => supabase.from('scenes').delete().eq('id', id))
  )

  const errors = deleteResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
  if (errors.length > 0) {
    const firstError = errors[0]
    const msg = firstError.status === 'rejected'
      ? (firstError.reason as Error).message
      : firstError.value.error?.message || 'Unknown error'
    return { success: false, error: msg, deletedItems: items }
  }

  return { success: true, deletedItems: items }
}

export async function batchDeleteActs(
  supabase: SupabaseClient,
  actIds: string[],
  issue: any
): Promise<BatchDeleteResult> {
  const fetchResults = await Promise.allSettled(
    actIds.map(id => fetchActDeepData(supabase, id))
  )

  const items: Array<{ id: string; parentId: string; data: any }> = []
  for (let i = 0; i < actIds.length; i++) {
    const result = fetchResults[i]
    if (result.status === 'fulfilled') {
      items.push({ id: actIds[i], parentId: issue.id, data: result.value })
    }
  }

  const deleteResults = await Promise.allSettled(
    actIds.map(id => supabase.from('acts').delete().eq('id', id))
  )

  const errors = deleteResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
  if (errors.length > 0) {
    const firstError = errors[0]
    const msg = firstError.status === 'rejected'
      ? (firstError.reason as Error).message
      : firstError.value.error?.message || 'Unknown error'
    return { success: false, error: msg, deletedItems: items }
  }

  return { success: true, deletedItems: items }
}

// Helper: find page's parent scene ID
function findPageParentScene(pageId: string, issue: any): string | null {
  for (const act of issue.acts || []) {
    for (const scene of act.scenes || []) {
      if ((scene.pages || []).some((p: any) => p.id === pageId)) {
        return scene.id
      }
    }
  }
  return null
}

// Helper: find scene's parent act ID
function findSceneParentAct(sceneId: string, issue: any): string | null {
  for (const act of issue.acts || []) {
    if ((act.scenes || []).some((s: any) => s.id === sceneId)) {
      return act.id
    }
  }
  return null
}
