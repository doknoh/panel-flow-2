import { SupabaseClient } from '@supabase/supabase-js'

// --- Types ---

export interface CharacterStats {
  characterId: string
  totalPanels: number
  totalDialogues: number
  issueBreakdown: Record<string, { panels: number; dialogues: number }>
  sceneIds: string[]
  computedAt: string
}

export interface CharacterWithStats {
  id: string
  name: string
  display_name: string | null
  role: string | null
  aliases: string[]
  physical_description: string | null
  background: string | null
  personality_traits: string | null
  speech_patterns: string | null
  relationships: string | null
  arc_notes: string | null
  age: string | null
  eye_color: string | null
  hair_color_style: string | null
  height: string | null
  build: string | null
  skin_tone: string | null
  distinguishing_marks: string | null
  style_wardrobe: string | null
  first_appearance: string | null
  color: string | null
  created_at: string
  updated_at: string
  stats: CharacterStats | null
}

interface StatsRow {
  id: string
  character_id: string
  series_id: string
  total_panels: number
  total_dialogues: number
  issue_breakdown: Record<string, { panels: number; dialogues: number }>
  scene_ids: string[]
  computed_at: string
}

// --- Regex Helpers ---

const POSTGRES_REGEX_CHARS = /[.*+?^${}()|[\]\\'/]/g

export function escapeRegexForPostgres(name: string): string {
  return name.replace(POSTGRES_REGEX_CHARS, '\\$&')
}

export function buildNameMatchCondition(
  primaryName: string,
  aliases: string[]
): string {
  const allNames = [primaryName, ...aliases]
  const conditions = allNames.map(name => {
    const escaped = escapeRegexForPostgres(name)
    return `visual_description ~* '\\m${escaped}\\M'`
  })
  return `(${conditions.join(' OR ')})`
}

// --- Stats Computation ---

/**
 * Compute stats for ALL characters in a series using batch queries.
 * Uses Supabase client .or() with .ilike() patterns for panel text matching,
 * then filters to the correct series in JavaScript.
 * Returns a map of characterId -> CharacterStats.
 */
export async function computeAllCharacterStats(
  supabase: SupabaseClient,
  seriesId: string,
  characters: Array<{ id: string; name: string; aliases: string[] }>
): Promise<Map<string, CharacterStats>> {
  const results = new Map<string, CharacterStats>()

  if (characters.length === 0) return results

  // Collect all unique names across all characters for a single batch query
  const allNamesForQuery: string[] = []
  const nameToCharMap = new Map<string, Set<string>>() // lowercase name -> set of character IDs

  for (const char of characters) {
    const names = [char.name, ...(char.aliases || [])].filter(Boolean)
    for (const name of names) {
      allNamesForQuery.push(name)
      const lower = name.toLowerCase()
      if (!nameToCharMap.has(lower)) {
        nameToCharMap.set(lower, new Set())
      }
      nameToCharMap.get(lower)!.add(char.id)
    }
  }

  // Build OR conditions for ilike matching
  const orConditions = allNamesForQuery
    .map(name => `visual_description.ilike.%${name}%`)
    .join(',')

  // Query panels with nested joins to get series/issue/scene context
  const { data: panelData } = await supabase
    .from('panels')
    .select(
      'id, visual_description, page_id, page:page_id(id, scene_id, scene:scene_id(id, act_id, act:act_id(id, issue_id, issue:issue_id(id, series_id))))'
    )
    .or(orConditions)
    .not('visual_description', 'is', null)

  // Query all dialogue blocks for characters in this series
  const characterIds = characters.map(c => c.id)
  const { data: dialogueData } = await supabase
    .from('dialogue_blocks')
    .select(
      'id, character_id, panel:panel_id(id, page:page_id(id, scene:scene_id(id, act:act_id(id, issue:issue_id(id, series_id)))))'
    )
    .in('character_id', characterIds)

  // Initialize results for all characters
  for (const char of characters) {
    results.set(char.id, {
      characterId: char.id,
      totalPanels: 0,
      totalDialogues: 0,
      issueBreakdown: {},
      sceneIds: [],
      computedAt: new Date().toISOString(),
    })
  }

  // Process panel mentions
  if (panelData && Array.isArray(panelData)) {
    for (const panel of panelData) {
      // Navigate nested joins to find series_id and issue_id
      const page = panel.page as any
      const scene = page?.scene
      const act = scene?.act
      const issue = act?.issue

      // Filter to correct series
      if (!issue || issue.series_id !== seriesId) continue

      const issueId = issue.id as string
      const sceneId = scene?.id as string
      const description = (panel.visual_description || '').toLowerCase()

      // Check which characters are mentioned in this panel
      for (const char of characters) {
        const names = [char.name, ...(char.aliases || [])].filter(Boolean)
        const mentioned = names.some(name =>
          description.includes(name.toLowerCase())
        )

        if (mentioned) {
          const stats = results.get(char.id)!
          stats.totalPanels += 1

          if (!stats.issueBreakdown[issueId]) {
            stats.issueBreakdown[issueId] = { panels: 0, dialogues: 0 }
          }
          stats.issueBreakdown[issueId].panels += 1

          if (sceneId && !stats.sceneIds.includes(sceneId)) {
            stats.sceneIds.push(sceneId)
          }
        }
      }
    }
  }

  // Process dialogue blocks
  if (dialogueData && Array.isArray(dialogueData)) {
    for (const d of dialogueData) {
      const charId = d.character_id as string
      const panel = d.panel as any
      const page = panel?.page
      const scene = page?.scene
      const act = scene?.act
      const issue = act?.issue

      // Filter to correct series
      if (!issue || issue.series_id !== seriesId) continue

      const issueId = issue.id as string
      const stats = results.get(charId)
      if (!stats) continue

      stats.totalDialogues += 1

      if (!stats.issueBreakdown[issueId]) {
        stats.issueBreakdown[issueId] = { panels: 0, dialogues: 0 }
      }
      stats.issueBreakdown[issueId].dialogues += 1
    }
  }

  return results
}

// --- Cache Operations ---

export async function getCachedStats(
  supabase: SupabaseClient,
  seriesId: string
): Promise<Map<string, CharacterStats>> {
  const { data } = await supabase
    .from('character_stats_cache')
    .select('*')
    .eq('series_id', seriesId)

  const results = new Map<string, CharacterStats>()
  if (data) {
    for (const row of data as StatsRow[]) {
      results.set(row.character_id, {
        characterId: row.character_id,
        totalPanels: row.total_panels,
        totalDialogues: row.total_dialogues,
        issueBreakdown: row.issue_breakdown || {},
        sceneIds: row.scene_ids || [],
        computedAt: row.computed_at,
      })
    }
  }
  return results
}

export async function isStatsCacheStale(
  supabase: SupabaseClient,
  seriesId: string
): Promise<boolean> {
  // Get oldest cache entry
  const { data: cacheData } = await supabase
    .from('character_stats_cache')
    .select('computed_at')
    .eq('series_id', seriesId)
    .order('computed_at', { ascending: true })
    .limit(1)
    .single()

  if (!cacheData) return true // No cache exists

  // Get recent panels and filter to series in JavaScript
  const { data: recentPanels } = await supabase
    .from('panels')
    .select(
      'updated_at, page:page_id(scene:scene_id(act:act_id(issue:issue_id(series_id))))'
    )
    .order('updated_at', { ascending: false })
    .limit(100)

  if (!recentPanels || recentPanels.length === 0) {
    return false // No panels exist, cache is fine
  }

  // Filter to panels belonging to this series
  const seriesPanels = recentPanels.filter(p => {
    const page = (p as any).page
    const scene = page?.scene
    const act = scene?.act
    const issue = act?.issue
    return issue?.series_id === seriesId
  })

  if (seriesPanels.length === 0) {
    return false // No panels for this series
  }

  // Compare latest panel update with cache timestamp
  const latestUpdate = new Date(seriesPanels[0].updated_at).getTime()
  const cacheTime = new Date(cacheData.computed_at).getTime()
  return latestUpdate > cacheTime
}

export async function writeStatsCache(
  supabase: SupabaseClient,
  seriesId: string,
  stats: Map<string, CharacterStats>
): Promise<void> {
  // Delete existing cache for this series
  await supabase
    .from('character_stats_cache')
    .delete()
    .eq('series_id', seriesId)

  // Insert new cache rows
  const rows = Array.from(stats.values()).map(s => ({
    character_id: s.characterId,
    series_id: seriesId,
    total_panels: s.totalPanels,
    total_dialogues: s.totalDialogues,
    issue_breakdown: s.issueBreakdown,
    scene_ids: s.sceneIds,
    computed_at: s.computedAt,
  }))

  if (rows.length > 0) {
    await supabase.from('character_stats_cache').insert(rows)
  }
}

// --- Relationship Extraction ---

/**
 * Extract relationship references from a character's `relationships` text field.
 * Returns character IDs of referenced characters whose names appear in the text.
 */
export function extractRelationshipRefs(
  relationshipsText: string | null,
  allCharacters: Array<{
    id: string
    name: string
    display_name: string | null
    aliases: string[]
  }>
): string[] {
  if (!relationshipsText) return []

  const refs: string[] = []
  for (const char of allCharacters) {
    const namesToCheck = [
      char.display_name || char.name,
      char.name,
      ...(char.aliases || []),
    ]
    for (const name of namesToCheck) {
      if (name && relationshipsText.toLowerCase().includes(name.toLowerCase())) {
        refs.push(char.id)
        break // Only add once per character
      }
    }
  }
  return refs
}
