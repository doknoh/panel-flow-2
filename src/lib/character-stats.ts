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
const JS_REGEX_CHARS = /[.*+?^${}()|[\]\\]/g

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

/**
 * Word-boundary check for character name matching in JavaScript.
 * Prevents false positives (e.g., "ART" matching "PART" or "STARTING").
 */
export function nameMatchesText(name: string, text: string): boolean {
  const escaped = name.replace(JS_REGEX_CHARS, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'i')
  return regex.test(text)
}

/**
 * Escape special characters for Supabase .ilike() filter values.
 * % and _ are wildcards in SQL LIKE patterns and must be escaped.
 */
function escapeForIlike(name: string): string {
  return name.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// --- Stats Computation ---

/**
 * Compute stats for ALL characters in a series using batch queries.
 * Uses Supabase client .or() with .ilike() patterns for panel text matching
 * (broad filter), then applies word-boundary matching in JavaScript for accuracy.
 * Returns a map of characterId -> CharacterStats.
 */
export async function computeAllCharacterStats(
  supabase: SupabaseClient,
  seriesId: string,
  characters: Array<{ id: string; name: string; aliases: string[] }>
): Promise<Map<string, CharacterStats>> {
  const results = new Map<string, CharacterStats>()

  if (characters.length === 0) return results

  // Build a map of lowercase name -> set of character IDs for O(1) lookup
  // Also build a list of pre-compiled word-boundary regexes per name
  const allNamesForQuery: string[] = []
  const nameToCharMap = new Map<string, Set<string>>() // lowercase name -> set of character IDs
  const nameRegexMap = new Map<string, RegExp>() // lowercase name -> word-boundary regex

  for (const char of characters) {
    const names = [char.name, ...(char.aliases || [])].filter(Boolean)
    for (const name of names) {
      allNamesForQuery.push(name)
      const lower = name.toLowerCase()
      if (!nameToCharMap.has(lower)) {
        nameToCharMap.set(lower, new Set())
        // Pre-compile word-boundary regex for this name
        const escaped = name.replace(JS_REGEX_CHARS, '\\$&')
        nameRegexMap.set(lower, new RegExp(`\\b${escaped}\\b`, 'i'))
      }
      nameToCharMap.get(lower)!.add(char.id)
    }
  }

  // Build OR conditions for ilike matching (broad filter, escaped for safety)
  const orConditions = allNamesForQuery
    .map(name => `visual_description.ilike.%${escapeForIlike(name)}%`)
    .join(',')

  // Query panels with nested joins to get series/issue/scene context
  const { data: panelData, error: panelError } = await supabase
    .from('panels')
    .select(
      'id, visual_description, page_id, page:page_id(id, scene_id, scene:scene_id(id, act_id, act:act_id(id, issue_id, issue:issue_id(id, series_id))))'
    )
    .or(orConditions)
    .not('visual_description', 'is', null)

  if (panelError) {
    console.error('[character-stats] Failed to query panels:', panelError.message)
  }

  // Query all dialogue blocks for characters in this series
  const characterIds = characters.map(c => c.id)
  const { data: dialogueData, error: dialogueError } = await supabase
    .from('dialogue_blocks')
    .select(
      'id, character_id, panel:panel_id(id, page:page_id(id, scene:scene_id(id, act:act_id(id, issue:issue_id(id, series_id)))))'
    )
    .in('character_id', characterIds)

  if (dialogueError) {
    console.error('[character-stats] Failed to query dialogues:', dialogueError.message)
  }

  // Initialize results for all characters (use Set for sceneIds deduplication)
  const sceneIdSets = new Map<string, Set<string>>()
  for (const char of characters) {
    results.set(char.id, {
      characterId: char.id,
      totalPanels: 0,
      totalDialogues: 0,
      issueBreakdown: {},
      sceneIds: [],
      computedAt: new Date().toISOString(),
    })
    sceneIdSets.set(char.id, new Set())
  }

  // Process panel mentions using nameToCharMap for O(names) lookup per panel
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
      const description = panel.visual_description || ''

      // Use nameToCharMap: for each known name, check word-boundary match
      // then attribute to all characters that share that name/alias
      const matchedCharIds = new Set<string>()
      for (const [lowerName, charIds] of nameToCharMap) {
        const regex = nameRegexMap.get(lowerName)
        if (regex && regex.test(description)) {
          for (const cid of charIds) {
            matchedCharIds.add(cid)
          }
        }
      }

      for (const charId of matchedCharIds) {
        const stats = results.get(charId)!
        stats.totalPanels += 1

        if (!stats.issueBreakdown[issueId]) {
          stats.issueBreakdown[issueId] = { panels: 0, dialogues: 0 }
        }
        stats.issueBreakdown[issueId].panels += 1

        if (sceneId) {
          sceneIdSets.get(charId)!.add(sceneId)
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

  // Convert sceneId Sets to arrays on the final results
  for (const [charId, sceneSet] of sceneIdSets) {
    const stats = results.get(charId)
    if (stats) {
      stats.sceneIds = Array.from(sceneSet)
    }
  }

  return results
}

// --- Cache Operations ---

export async function getCachedStats(
  supabase: SupabaseClient,
  seriesId: string
): Promise<Map<string, CharacterStats>> {
  const { data, error } = await supabase
    .from('character_stats_cache')
    .select('*')
    .eq('series_id', seriesId)

  if (error) {
    console.error('[character-stats] Failed to read cache:', error.message)
  }

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
  // TTL-based staleness: if oldest cache entry is more than 5 minutes old, recompute
  const { data: cacheData, error } = await supabase
    .from('character_stats_cache')
    .select('computed_at')
    .eq('series_id', seriesId)
    .order('computed_at', { ascending: true })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is expected when no cache exists
    console.error('[character-stats] Failed to check cache staleness:', error.message)
  }

  if (!cacheData) return true // No cache exists

  const cacheTime = new Date(cacheData.computed_at).getTime()
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  return cacheTime < fiveMinutesAgo
}

export async function writeStatsCache(
  supabase: SupabaseClient,
  seriesId: string,
  stats: Map<string, CharacterStats>
): Promise<void> {
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
    // Atomic upsert using UNIQUE(character_id) constraint
    const { error: upsertError } = await supabase
      .from('character_stats_cache')
      .upsert(rows, { onConflict: 'character_id' })

    if (upsertError) {
      console.error('[character-stats] Failed to upsert cache:', upsertError.message)
    }

    // Remove stale rows for characters that no longer exist in this series
    const currentCharIds = rows.map(r => r.character_id)
    const { error: cleanupError } = await supabase
      .from('character_stats_cache')
      .delete()
      .eq('series_id', seriesId)
      .not('character_id', 'in', `(${currentCharIds.join(',')})`)

    if (cleanupError) {
      console.error('[character-stats] Failed to clean stale cache rows:', cleanupError.message)
    }
  } else {
    // No characters: clear all cache rows for this series
    const { error } = await supabase
      .from('character_stats_cache')
      .delete()
      .eq('series_id', seriesId)

    if (error) {
      console.error('[character-stats] Failed to clear empty cache:', error.message)
    }
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
