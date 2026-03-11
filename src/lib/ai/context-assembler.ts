import { createClient } from '@/lib/supabase/server'
import type { AIContext, WriterContext, WritingPhase } from './client'
import { buildGateContext } from './curriculum'

const DB_TIMEOUT = 8000

// Helper to add timeout to supabase queries
async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Database query timeout')), ms)
  )
  return Promise.race([promise, timeout])
}

// ============================================
// WRITER CONTEXT ASSEMBLY
// ============================================

/**
 * Assemble writer-specific context for adaptive prompt assembly.
 * Fetches the writer profile, recent conversation summaries,
 * active personality preset, and series metadata for project-specific awareness.
 */
export async function assembleWriterContext(
  userId: string,
  seriesId: string,
  issueId?: string,
): Promise<WriterContext> {
  const supabase = await createClient()
  const context: WriterContext = {}

  try {
    // Fetch writer profile text
    const { data: profile } = await withTimeout(
      supabase
        .from('writer_profiles')
        .select('profile_text')
        .eq('user_id', userId)
        .single(),
      DB_TIMEOUT,
    )

    if (profile && (profile as { profile_text: string }).profile_text) {
      context.profileText = (profile as { profile_text: string }).profile_text
    }
  } catch {
    // No writer profile yet — that's fine
  }

  try {
    // Fetch recent conversation summaries for this series
    const { data: summaries } = await withTimeout(
      supabase
        .from('ai_conversations')
        .select('synthesized_summary, updated_at')
        .eq('user_id', userId)
        .eq('series_id', seriesId)
        .not('synthesized_summary', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(5),
      DB_TIMEOUT,
    )

    if (summaries && (summaries as Array<{ synthesized_summary: string }>).length > 0) {
      context.conversationMemory = (summaries as Array<{ synthesized_summary: string }>).map(
        s => s.synthesized_summary
      )
    }
  } catch {
    // No conversation summaries yet
  }

  try {
    // Fetch default personality preset
    const { data: preset } = await withTimeout(
      supabase
        .from('ai_personality_presets')
        .select('system_prompt_modifier')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single(),
      DB_TIMEOUT,
    )

    if (preset && (preset as { system_prompt_modifier: string }).system_prompt_modifier) {
      context.presetModifier = (preset as { system_prompt_modifier: string }).system_prompt_modifier
    }
  } catch {
    // No preset set
  }

  // Fetch series metadata for project-specific awareness in the system prompt
  try {
    const seriesContext: WriterContext['seriesContext'] = {}

    const { data: series } = await withTimeout(
      supabase
        .from('series')
        .select('title, central_theme, logline, visual_grammar, rules')
        .eq('id', seriesId)
        .single(),
      DB_TIMEOUT,
    )

    if (series) {
      const s = series as { title: string; central_theme?: string; logline?: string; visual_grammar?: string; rules?: string }
      seriesContext.title = s.title
      seriesContext.centralTheme = s.central_theme || undefined
      seriesContext.logline = s.logline || undefined
      seriesContext.visualGrammar = s.visual_grammar || undefined
      seriesContext.rules = s.rules || undefined
    }

    // Fetch character names for system prompt awareness
    const { data: characters } = await withTimeout(
      supabase
        .from('characters')
        .select('display_name, aliases')
        .eq('series_id', seriesId)
        .limit(30),
      DB_TIMEOUT,
    )

    if (characters && (characters as unknown[]).length > 0) {
      const charList = characters as Array<{ display_name: string; aliases?: string[] }>
      seriesContext.characterCount = charList.length
      seriesContext.characterNames = charList.map(c => {
        const aliases = (c.aliases || []).filter(Boolean)
        if (aliases.length > 0) {
          return `${c.display_name} (aka ${aliases.join(', ')})`
        }
        return c.display_name
      })
    }

    // Fetch plotline names
    const { data: plotlines } = await withTimeout(
      supabase
        .from('plotlines')
        .select('name')
        .eq('series_id', seriesId),
      DB_TIMEOUT,
    )

    if (plotlines && (plotlines as unknown[]).length > 0) {
      seriesContext.plotlineNames = (plotlines as Array<{ name: string }>).map(p => p.name)
    }

    // Fetch issue count
    const { count: issueCount } = await withTimeout(
      supabase
        .from('issues')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', seriesId),
      DB_TIMEOUT,
    )

    seriesContext.issueCount = issueCount || 0

    // Fetch current issue metadata if provided
    if (issueId) {
      const { data: issue } = await withTimeout(
        supabase
          .from('issues')
          .select('number, title, themes, motifs, writing_phase, emotional_thesis, false_belief, reader_takeaway')
          .eq('id', issueId)
          .single(),
        DB_TIMEOUT,
      )

      if (issue) {
        const i = issue as {
          number: number; title: string; themes?: string; motifs?: string;
          writing_phase?: string; emotional_thesis?: string; false_belief?: string; reader_takeaway?: string
        }
        seriesContext.currentIssueNumber = i.number
        seriesContext.currentIssueTitle = i.title
        seriesContext.currentIssueThemes = i.themes || undefined
        seriesContext.currentIssueMotifs = i.motifs || undefined
        // Pass writing phase through for phase-aware AI behavior
        if (i.writing_phase) {
          context.currentPhase = i.writing_phase as WritingPhase
          // Build gate context with anchor questions for phase enforcement
          context.gateContext = buildGateContext(i.writing_phase as WritingPhase, {
            emotional_thesis: i.emotional_thesis,
            false_belief: i.false_belief,
            reader_takeaway: i.reader_takeaway,
          })
        }
      }
    }

    // Only set if we got meaningful data
    if (seriesContext.title) {
      context.seriesContext = seriesContext
    }
  } catch {
    // Series metadata fetch failed — non-critical, continue without it
  }

  return context
}

// ============================================
// WORLD/PROJECT CONTEXT ASSEMBLY
// ============================================

/**
 * Assemble full project context for AI conversations from the database.
 * Fetches series, characters, locations, plotlines, issue structure,
 * current page, canvas beats, project notes, and full script text.
 */
export async function assembleContext(
  seriesId: string,
  issueId?: string,
  pageId?: string,
): Promise<AIContext> {
  const supabase = await createClient()
  const context: AIContext = { seriesId, issueId, pageId }

  // Fetch series metadata
  const { data: series } = await withTimeout(
    supabase
      .from('series')
      .select('title, central_theme, logline, visual_grammar, rules')
      .eq('id', seriesId)
      .single(),
    DB_TIMEOUT,
  )

  if (series) {
    const s = series as { title: string; central_theme?: string; logline?: string; visual_grammar?: string; rules?: string }
    context.seriesTitle = s.title
    context.centralTheme = s.central_theme || undefined
    context.logline = s.logline || undefined
    context.visualGrammar = s.visual_grammar || undefined
    context.rules = s.rules || undefined
  }

  // Fetch characters (capped at 30)
  const { data: characters } = await withTimeout(
    supabase
      .from('characters')
      .select('id, name, display_name, aliases, physical_description, speech_patterns, relationships, arc_notes')
      .eq('series_id', seriesId)
      .limit(30),
    DB_TIMEOUT,
  )

  if (characters && (characters as unknown[]).length > 0) {
    context.characters = (characters as Array<{
      id: string; name: string; display_name: string; aliases?: string[];
      physical_description?: string; speech_patterns?: string;
      relationships?: string; arc_notes?: string
    }>).map(c => ({
      id: c.id,
      name: c.name,
      display_name: c.display_name,
      aliases: (c.aliases || []).filter(Boolean).length > 0 ? c.aliases!.filter(Boolean) : undefined,
      physical_description: c.physical_description || undefined,
      speech_patterns: c.speech_patterns || undefined,
      relationships: c.relationships || undefined,
      arc_notes: c.arc_notes || undefined,
    }))
  }

  // Fetch locations (capped at 20)
  const { data: locations } = await withTimeout(
    supabase
      .from('locations')
      .select('id, name, description, visual_details')
      .eq('series_id', seriesId)
      .limit(20),
    DB_TIMEOUT,
  )

  if (locations && (locations as unknown[]).length > 0) {
    context.locations = (locations as Array<{
      id: string; name: string; description?: string; visual_details?: string
    }>).map(l => ({
      id: l.id,
      name: l.name,
      description: l.description || undefined,
      visual_details: l.visual_details || undefined,
    }))
  }

  // Fetch plotlines
  const { data: plotlines } = await withTimeout(
    supabase
      .from('plotlines')
      .select('id, name, color, description')
      .eq('series_id', seriesId),
    DB_TIMEOUT,
  )

  if (plotlines && (plotlines as unknown[]).length > 0) {
    context.plotlines = (plotlines as Array<{
      id: string; name: string; color: string; description?: string
    }>).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      description: p.description || undefined,
    }))
  }

  // Fetch canvas beats (unfiled, most recent)
  const { data: canvasBeats } = await withTimeout(
    supabase
      .from('canvas_items')
      .select('id, title, content, item_type')
      .eq('series_id', seriesId)
      .eq('archived', false)
      .is('filed_to_scene_id', null)
      .is('filed_to_page_id', null)
      .order('created_at', { ascending: false })
      .limit(20),
    DB_TIMEOUT,
  )

  if (canvasBeats && (canvasBeats as unknown[]).length > 0) {
    context.canvasBeats = (canvasBeats as Array<{
      id: string; title: string; content?: string; item_type?: string
    }>).map(b => ({
      id: b.id,
      title: b.title,
      content: b.content || undefined,
      item_type: b.item_type || undefined,
    }))
  }

  // Fetch unresolved project notes
  const { data: notes } = await withTimeout(
    supabase
      .from('project_notes')
      .select('content, type')
      .eq('series_id', seriesId)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(20),
    DB_TIMEOUT,
  )

  if (notes && (notes as unknown[]).length > 0) {
    context.projectNotes = (notes as Array<{ content: string; type: string }>).map(n => ({
      content: n.content,
      type: n.type,
    }))
  }

  // Issue-specific context
  if (issueId) {
    // Fetch issue metadata
    const { data: issue } = await withTimeout(
      supabase
        .from('issues')
        .select('id, number, title, summary, themes, stakes, motifs, rules, visual_style')
        .eq('id', issueId)
        .single(),
      DB_TIMEOUT,
    )

    if (issue) {
      const i = issue as {
        id: string; number: number; title: string; summary?: string;
        themes?: string; stakes?: string; motifs?: string; rules?: string; visual_style?: string
      }
      context.currentIssue = {
        id: i.id,
        number: i.number,
        title: i.title,
        summary: i.summary || undefined,
        themes: i.themes || undefined,
        stakes: i.stakes || undefined,
        motifs: i.motifs || undefined,
        rules: i.rules || undefined,
        visual_style: i.visual_style || undefined,
      }
    }

    // Fetch issue structure: acts → scenes with page counts
    const { data: acts } = await withTimeout(
      supabase
        .from('acts')
        .select('id, number, title')
        .eq('issue_id', issueId)
        .order('number'),
      DB_TIMEOUT,
    )

    if (acts && (acts as unknown[]).length > 0) {
      const plotlineMap = new Map(
        (context.plotlines || []).map(p => [p.id, p.name])
      )

      const structure: AIContext['issueStructure'] = []

      for (const act of acts as Array<{ id: string; number: number; title?: string }>) {
        const { data: scenes } = await withTimeout(
          supabase
            .from('scenes')
            .select('id, title, plotline_id, sort_order')
            .eq('act_id', act.id)
            .order('sort_order'),
          DB_TIMEOUT,
        )

        const sceneEntries = []
        for (const scene of (scenes || []) as Array<{
          id: string; title?: string; plotline_id?: string; sort_order: number
        }>) {
          // Count pages in this scene
          const { count } = await withTimeout(
            supabase
              .from('pages')
              .select('id', { count: 'exact', head: true })
              .eq('scene_id', scene.id),
            DB_TIMEOUT,
          )

          sceneEntries.push({
            sceneId: scene.id,
            sceneTitle: scene.title || undefined,
            plotlineName: scene.plotline_id ? plotlineMap.get(scene.plotline_id) : undefined,
            pageCount: count || 0,
          })
        }

        structure.push({
          actId: act.id,
          actNumber: act.number,
          actTitle: act.title || undefined,
          scenes: sceneEntries,
        })
      }

      context.issueStructure = structure
    }

    // Build full script text for the issue
    await assembleScriptText(supabase, issueId, context)

    // Fetch brief summaries of OTHER issues in the same series for cross-issue awareness
    try {
      const { data: otherIssues } = await withTimeout(
        supabase
          .from('issues')
          .select('id, number, title, summary, status')
          .eq('series_id', seriesId)
          .neq('id', issueId)
          .order('number'),
        DB_TIMEOUT,
      )

      if (otherIssues && (otherIssues as unknown[]).length > 0) {
        context.otherIssues = (otherIssues as Array<{
          id: string; number: number; title: string; summary?: string; status: string
        }>).map(i => ({
          id: i.id,
          number: i.number,
          title: i.title,
          summary: i.summary || undefined,
          status: i.status,
        }))
      }
    } catch {
      // Non-critical — continue without cross-issue context
    }
  }

  // Current page context
  if (pageId) {
    await assembleCurrentPage(supabase, pageId, context)
  }

  return context
}

/**
 * Assemble the full script text for an issue
 */
async function assembleScriptText(
  supabase: Awaited<ReturnType<typeof createClient>>,
  issueId: string,
  context: AIContext
) {
  // Get all pages for this issue via acts → scenes → pages
  const { data: acts } = await withTimeout(
    supabase
      .from('acts')
      .select('id, number')
      .eq('issue_id', issueId)
      .order('number'),
    DB_TIMEOUT,
  )

  if (!acts || (acts as unknown[]).length === 0) return

  let scriptText = ''

  for (const act of acts as Array<{ id: string; number: number }>) {
    const { data: scenes } = await withTimeout(
      supabase
        .from('scenes')
        .select('id, title, sort_order')
        .eq('act_id', act.id)
        .order('sort_order'),
      DB_TIMEOUT,
    )

    if (!scenes) continue

    for (const scene of scenes as Array<{ id: string; title?: string; sort_order: number }>) {
      const { data: pages } = await withTimeout(
        supabase
          .from('pages')
          .select('id, page_number, orientation, sort_order')
          .eq('scene_id', scene.id)
          .order('sort_order'),
        DB_TIMEOUT,
      )

      if (!pages) continue

      for (const page of pages as Array<{
        id: string; page_number: number; orientation: string; sort_order: number
      }>) {
        scriptText += `\nPAGE ${page.page_number} (${page.orientation?.toLowerCase() || 'right'})\n`

        const { data: panels } = await withTimeout(
          supabase
            .from('panels')
            .select('id, sort_order, visual_description, camera')
            .eq('page_id', page.id)
            .order('sort_order'),
          DB_TIMEOUT,
        )

        if (!panels) continue

        for (const panel of panels as Array<{
          id: string; sort_order: number; visual_description?: string; camera?: string
        }>) {
          scriptText += `PANEL ${panel.sort_order}: ${panel.visual_description || '(No description)'}\n`
          if (panel.camera) scriptText += `[Camera: ${panel.camera}]\n`

          // Get dialogue
          const { data: dialogue } = await withTimeout(
            supabase
              .from('dialogue_blocks')
              .select('speaker_name, character_id, text, delivery_type, delivery_instruction, balloon_number, sort_order')
              .eq('panel_id', panel.id)
              .order('sort_order'),
            DB_TIMEOUT,
          )

          if (dialogue) {
            for (const d of dialogue as Array<{
              speaker_name?: string; character_id?: string; text: string;
              delivery_type: string; delivery_instruction?: string;
              balloon_number: number; sort_order: number
            }>) {
              let speaker = d.speaker_name || 'UNKNOWN'
              if (d.delivery_type === 'VO') speaker += ' (V.O.)'
              else if (d.delivery_type === 'OS') speaker += ' (O.S.)'
              if (d.delivery_instruction) speaker += ` [${d.delivery_instruction}]`
              if (d.balloon_number > 1) speaker += ` ${d.balloon_number}`
              scriptText += `${speaker}: ${d.text}\n`
            }
          }

          // Get captions
          const { data: captions } = await withTimeout(
            supabase
              .from('captions')
              .select('text, caption_type, sort_order')
              .eq('panel_id', panel.id)
              .order('sort_order'),
            DB_TIMEOUT,
          )

          if (captions) {
            for (const cap of captions as Array<{ text: string; caption_type: string; sort_order: number }>) {
              const capType = cap.caption_type ? ` (${cap.caption_type.toUpperCase()})` : ''
              scriptText += `CAP${capType}: ${cap.text}\n`
            }
          }

          // Get sound effects
          const { data: sfx } = await withTimeout(
            supabase
              .from('sound_effects')
              .select('text, sort_order')
              .eq('panel_id', panel.id)
              .order('sort_order'),
            DB_TIMEOUT,
          )

          if (sfx) {
            for (const s of sfx as Array<{ text: string; sort_order: number }>) {
              scriptText += `SFX: ${s.text}\n`
            }
          }

          scriptText += '\n'
        }
      }
    }
  }

  // Cap at 300k characters
  const MAX_SCRIPT_CHARS = 300000
  const fullLength = scriptText.length
  if (fullLength > MAX_SCRIPT_CHARS) {
    scriptText = scriptText.substring(0, MAX_SCRIPT_CHARS) +
      `\n\n[Note: Script text was truncated due to length. The full script contains ${fullLength.toLocaleString()} characters but only the first ${MAX_SCRIPT_CHARS.toLocaleString()} were included. Later pages may be missing from context.]`
  }

  if (scriptText.trim()) {
    context.scriptText = scriptText
  }
}

/**
 * Assemble context for the page the writer is currently viewing
 */
async function assembleCurrentPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pageId: string,
  context: AIContext
) {
  const { data: page } = await withTimeout(
    supabase
      .from('pages')
      .select('page_number, orientation')
      .eq('id', pageId)
      .single(),
    DB_TIMEOUT,
  )

  if (!page) return

  const p = page as { page_number: number; orientation: string }

  const { data: panels } = await withTimeout(
    supabase
      .from('panels')
      .select('id, sort_order, visual_description, camera')
      .eq('page_id', pageId)
      .order('sort_order'),
    DB_TIMEOUT,
  )

  if (!panels) return

  const charMap = new Map(
    (context.characters || []).map(c => [c.id, c.display_name])
  )

  const panelContexts = []
  for (const panel of panels as Array<{
    id: string; sort_order: number; visual_description?: string; camera?: string
  }>) {
    // Get characters present
    const { data: panelChars } = await withTimeout(
      supabase
        .from('panel_characters')
        .select('character_id')
        .eq('panel_id', panel.id),
      DB_TIMEOUT,
    )

    const characterNames = ((panelChars || []) as Array<{ character_id: string }>)
      .map(pc => charMap.get(pc.character_id))
      .filter(Boolean) as string[]

    // Get dialogue
    const { data: dialogue } = await withTimeout(
      supabase
        .from('dialogue_blocks')
        .select('speaker_name, text, delivery_type, delivery_instruction, sort_order')
        .eq('panel_id', panel.id)
        .order('sort_order'),
      DB_TIMEOUT,
    )

    // Get captions
    const { data: captions } = await withTimeout(
      supabase
        .from('captions')
        .select('text, caption_type, sort_order')
        .eq('panel_id', panel.id)
        .order('sort_order'),
      DB_TIMEOUT,
    )

    // Get sound effects
    const { data: sfx } = await withTimeout(
      supabase
        .from('sound_effects')
        .select('text, sort_order')
        .eq('panel_id', panel.id)
        .order('sort_order'),
      DB_TIMEOUT,
    )

    panelContexts.push({
      id: panel.id,
      order: panel.sort_order,
      visual_description: panel.visual_description || undefined,
      camera: panel.camera || undefined,
      characters_present: characterNames.length > 0 ? characterNames : undefined,
      dialogue: dialogue && (dialogue as unknown[]).length > 0
        ? (dialogue as Array<{ speaker_name?: string; text: string; delivery_type: string; delivery_instruction?: string }>).map(d => ({
            speaker: d.speaker_name || 'UNKNOWN',
            text: d.text,
            delivery_type: d.delivery_type,
            delivery_instruction: d.delivery_instruction || undefined,
          }))
        : undefined,
      captions: captions && (captions as unknown[]).length > 0
        ? (captions as Array<{ text: string; caption_type: string }>).map(c => ({
            text: c.text,
            type: c.caption_type || 'narrative',
          }))
        : undefined,
      sound_effects: sfx && (sfx as unknown[]).length > 0
        ? (sfx as Array<{ text: string }>).map(s => s.text)
        : undefined,
    })
  }

  context.currentPage = {
    pageNumber: p.page_number,
    orientation: p.orientation || 'RIGHT',
    panels: panelContexts,
  }
}
