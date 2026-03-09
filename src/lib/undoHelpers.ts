import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Deep-fetch functions: snapshot full nested data BEFORE cascade deletes
// ============================================================

export async function fetchPageDeepData(supabase: SupabaseClient, pageId: string) {
  const { data, error } = await supabase
    .from('pages')
    .select(`
      *,
      panels (
        *,
        dialogue_blocks (*),
        captions (*),
        sound_effects (*)
      )
    `)
    .eq('id', pageId)
    .single()

  if (error) throw error
  return data
}

export async function fetchSceneDeepData(supabase: SupabaseClient, sceneId: string) {
  const { data, error } = await supabase
    .from('scenes')
    .select(`
      *,
      pages (
        *,
        panels (
          *,
          dialogue_blocks (*),
          captions (*),
          sound_effects (*)
        )
      )
    `)
    .eq('id', sceneId)
    .single()

  if (error) throw error
  return data
}

export async function fetchActDeepData(supabase: SupabaseClient, actId: string) {
  const { data, error } = await supabase
    .from('acts')
    .select(`
      *,
      scenes (
        *,
        pages (
          *,
          panels (
            *,
            dialogue_blocks (*),
            captions (*),
            sound_effects (*)
          )
        )
      )
    `)
    .eq('id', actId)
    .single()

  if (error) throw error
  return data
}

// ============================================================
// Deep-restore functions: re-insert full nested trees in FK order
// Uses ORIGINAL IDs so cross-references are preserved
// ============================================================

export async function restorePageDeep(supabase: SupabaseClient, pageData: any, sceneId: string) {
  // 1. Insert page (exclude nested relations)
  const { panels, ...pageFields } = pageData
  const { error: pageError } = await supabase.from('pages').insert({
    ...pageFields,
    scene_id: sceneId,
  })
  if (pageError) throw pageError

  // 2. Insert panels with their children
  for (const panel of (panels || []).sort((a: any, b: any) => (a.sort_order ?? a.order ?? 0) - (b.sort_order ?? b.order ?? 0))) {
    const { dialogue_blocks, captions, sound_effects, character, ...panelFields } = panel
    const { error: panelError } = await supabase.from('panels').insert({
      ...panelFields,
      page_id: pageData.id,
    })
    if (panelError) throw panelError

    // 3. Insert dialogue blocks
    for (const dlg of (dialogue_blocks || [])) {
      const { character: _char, ...dlgFields } = dlg
      const { error: dlgError } = await supabase.from('dialogue_blocks').insert({
        ...dlgFields,
        panel_id: panel.id,
      })
      if (dlgError) throw dlgError
    }

    // 4. Insert captions
    for (const cap of (captions || [])) {
      const { error: capError } = await supabase.from('captions').insert({
        ...cap,
        panel_id: panel.id,
      })
      if (capError) throw capError
    }

    // 5. Insert sound effects
    for (const sfx of (sound_effects || [])) {
      const { error: sfxError } = await supabase.from('sound_effects').insert({
        ...sfx,
        panel_id: panel.id,
      })
      if (sfxError) throw sfxError
    }
  }
}

export async function restoreSceneDeep(supabase: SupabaseClient, sceneData: any, actId: string) {
  const { pages, plotline, ...sceneFields } = sceneData
  const { error: sceneError } = await supabase.from('scenes').insert({
    ...sceneFields,
    act_id: actId,
  })
  if (sceneError) throw sceneError

  for (const page of (pages || []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    await restorePageDeep(supabase, page, sceneData.id)
  }
}

export async function restoreActDeep(supabase: SupabaseClient, actData: any, issueId: string) {
  const { scenes, ...actFields } = actData
  const { error: actError } = await supabase.from('acts').insert({
    ...actFields,
    issue_id: issueId,
  })
  if (actError) throw actError

  for (const scene of (scenes || []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    await restoreSceneDeep(supabase, scene, actData.id)
  }
}
