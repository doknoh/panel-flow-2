import { createClient } from '@/lib/supabase/server'
import type { AIContext, WriterContext, WritingPhase } from './client'
import { buildGateContext } from './curriculum'
import { logger } from '@/lib/logger'

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

  // Run all independent queries in parallel
  const [profileResult, summariesResult, presetResult, seriesResult, charactersResult, plotlinesResult, issueCountResult, issueResult] = await Promise.all([
    // 1. Writer profile text
    withTimeout(
      supabase
        .from('writer_profiles')
        .select('profile_text')
        .eq('user_id', userId)
        .single(),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch writer profile', { error: err instanceof Error ? err.message : String(err) });
      return { data: null };
    }),

    // 2. Recent conversation summaries
    withTimeout(
      supabase
        .from('ai_conversations')
        .select('synthesized_summary, updated_at')
        .eq('user_id', userId)
        .eq('series_id', seriesId)
        .not('synthesized_summary', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(5),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch conversation summaries', { error: err instanceof Error ? err.message : String(err) });
      return { data: null };
    }),

    // 3. Default personality preset
    withTimeout(
      supabase
        .from('ai_personality_presets')
        .select('system_prompt_modifier')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single(),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch personality preset', { error: err instanceof Error ? err.message : String(err) });
      return { data: null };
    }),

    // 4. Series metadata
    withTimeout(
      supabase
        .from('series')
        .select('title, central_theme, logline, visual_grammar, rules')
        .eq('id', seriesId)
        .single(),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch series metadata', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // 5. Character names
    withTimeout(
      supabase
        .from('characters')
        .select('display_name, aliases')
        .eq('series_id', seriesId)
        .limit(30),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch characters', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // 6. Plotline names
    withTimeout(
      supabase
        .from('plotlines')
        .select('name')
        .eq('series_id', seriesId),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch plotlines', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // 7. Issue count
    withTimeout(
      supabase
        .from('issues')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', seriesId),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch issue count', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null, count: null };
    }),

    // 8. Current issue metadata (if issueId provided)
    issueId
      ? withTimeout(
          supabase
            .from('issues')
            .select('number, title, themes, motifs, writing_phase, emotional_thesis, false_belief, reader_takeaway')
            .eq('id', issueId)
            .single(),
          DB_TIMEOUT,
        ).catch((err) => {
          logger.error('Failed to fetch current issue metadata', { error: err instanceof Error ? err.message : String(err), issueId });
          return { data: null };
        })
      : Promise.resolve({ data: null }),
  ])

  // Process writer profile
  const profile = profileResult.data
  if (profile && (profile as { profile_text: string }).profile_text) {
    context.profileText = (profile as { profile_text: string }).profile_text
  }

  // Process conversation summaries
  const summaries = summariesResult.data
  if (summaries && (summaries as Array<{ synthesized_summary: string }>).length > 0) {
    context.conversationMemory = (summaries as Array<{ synthesized_summary: string }>).map(
      s => s.synthesized_summary
    )
  }

  // Process personality preset
  const preset = presetResult.data
  if (preset && (preset as { system_prompt_modifier: string }).system_prompt_modifier) {
    context.presetModifier = (preset as { system_prompt_modifier: string }).system_prompt_modifier
  }

  // Process series metadata
  const seriesContext: WriterContext['seriesContext'] = {}

  const series = seriesResult.data
  if (series) {
    const s = series as { title: string; central_theme?: string; logline?: string; visual_grammar?: string; rules?: string }
    seriesContext.title = s.title
    seriesContext.centralTheme = s.central_theme || undefined
    seriesContext.logline = s.logline || undefined
    seriesContext.visualGrammar = s.visual_grammar || undefined
    seriesContext.rules = s.rules || undefined
  }

  // Process character names
  const characters = charactersResult.data
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

  // Process plotline names
  const plotlines = plotlinesResult.data
  if (plotlines && (plotlines as unknown[]).length > 0) {
    seriesContext.plotlineNames = (plotlines as Array<{ name: string }>).map(p => p.name)
  }

  // Process issue count
  const issueCountData = issueCountResult as { count?: number | null }
  seriesContext.issueCount = issueCountData.count || 0

  // Process current issue metadata
  if (issueId && issueResult.data) {
    const i = issueResult.data as {
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

  // Only set if we got meaningful data
  if (seriesContext.title) {
    context.seriesContext = seriesContext
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

  // Parallelize all independent series-level queries
  const [seriesResult, charactersResult, locationsResult, plotlinesResult, canvasResult, notesResult] = await Promise.all([
    // Fetch series metadata
    withTimeout(
      supabase
        .from('series')
        .select('title, central_theme, logline, visual_grammar, rules')
        .eq('id', seriesId)
        .single(),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch series metadata (context)', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // Fetch characters (capped at 30)
    withTimeout(
      supabase
        .from('characters')
        .select('id, name, display_name, aliases, physical_description, speech_patterns, relationships, arc_notes')
        .eq('series_id', seriesId)
        .limit(30),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch characters (context)', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // Fetch locations (capped at 20)
    withTimeout(
      supabase
        .from('locations')
        .select('id, name, description, visual_details')
        .eq('series_id', seriesId)
        .limit(20),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch locations (context)', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // Fetch plotlines
    withTimeout(
      supabase
        .from('plotlines')
        .select('id, name, color, description')
        .eq('series_id', seriesId),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch plotlines (context)', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // Fetch canvas beats (unfiled, most recent)
    withTimeout(
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
    ).catch((err) => {
      logger.error('Failed to fetch canvas items (context)', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),

    // Fetch unresolved project notes
    withTimeout(
      supabase
        .from('project_notes')
        .select('content, type')
        .eq('series_id', seriesId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(20),
      DB_TIMEOUT,
    ).catch((err) => {
      logger.error('Failed to fetch project notes (context)', { error: err instanceof Error ? err.message : String(err), seriesId });
      return { data: null };
    }),
  ])

  const series = seriesResult.data
  if (series) {
    const s = series as { title: string; central_theme?: string; logline?: string; visual_grammar?: string; rules?: string }
    context.seriesTitle = s.title
    context.centralTheme = s.central_theme || undefined
    context.logline = s.logline || undefined
    context.visualGrammar = s.visual_grammar || undefined
    context.rules = s.rules || undefined
  }

  const characters = charactersResult.data
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

  const locations = locationsResult.data
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

  const plotlines = plotlinesResult.data
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

  const canvasBeats = canvasResult.data
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

  const { data: notes } = notesResult as { data: Array<{ content: string; type: string }> | null }

  if (notes && (notes as unknown[]).length > 0) {
    context.projectNotes = (notes as Array<{ content: string; type: string }>).map(n => ({
      content: n.content,
      type: n.type,
    }))
  }

  // Issue-specific context — run all 4 independent queries in parallel
  if (issueId) {
    const [issueResult, actsResult, _scriptResult, otherIssuesResult] = await Promise.all([
      // 1. Issue metadata
      withTimeout(
        supabase
          .from('issues')
          .select('id, number, title, summary, themes, stakes, motifs, rules, visual_style')
          .eq('id', issueId)
          .single(),
        DB_TIMEOUT,
      ).catch((err) => {
        logger.error('Failed to fetch issue metadata (context)', { error: err instanceof Error ? err.message : String(err), issueId });
        return { data: null };
      }),

      // 2. Acts with scenes structure
      withTimeout(
        supabase
          .from('acts')
          .select('id, number, title, scenes(id, title, plotline_id, sort_order, pages(id))')
          .eq('issue_id', issueId)
          .order('number'),
        DB_TIMEOUT,
      ).catch((err) => {
        logger.error('Failed to fetch acts structure (context)', { error: err instanceof Error ? err.message : String(err), issueId });
        return { data: null };
      }),

      // 3. Full script text (writes directly to context.scriptText)
      assembleScriptText(supabase, issueId, context),

      // 4. Other issues in series
      withTimeout(
        supabase
          .from('issues')
          .select('id, number, title, summary, status')
          .eq('series_id', seriesId)
          .neq('id', issueId)
          .order('number'),
        DB_TIMEOUT,
      ).catch((err) => {
        logger.error('Failed to fetch other issues (context)', { error: err instanceof Error ? err.message : String(err), seriesId });
        return { data: null };
      }),
    ])

    // Process issue metadata
    const issue = issueResult.data
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

    // Process acts structure
    const actsWithScenes = actsResult.data
    if (actsWithScenes && (actsWithScenes as unknown[]).length > 0) {
      const plotlineMap = new Map(
        (context.plotlines || []).map(p => [p.id, p.name])
      )

      context.issueStructure = (actsWithScenes as Array<{
        id: string; number: number; title?: string;
        scenes: Array<{ id: string; title?: string; plotline_id?: string; sort_order: number; pages: Array<{ id: string }> }>
      }>).map(act => ({
        actId: act.id,
        actNumber: act.number,
        actTitle: act.title || undefined,
        scenes: [...(act.scenes || [])].sort((a, b) => a.sort_order - b.sort_order).map(scene => ({
          sceneId: scene.id,
          sceneTitle: scene.title || undefined,
          plotlineName: scene.plotline_id ? plotlineMap.get(scene.plotline_id) : undefined,
          pageCount: (scene.pages || []).length,
        })),
      }))
    }

    // Process other issues (script text already written to context by assembleScriptText)
    const otherIssues = otherIssuesResult?.data
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
  }

  // Current page context
  if (pageId) {
    await assembleCurrentPage(supabase, pageId, context)
  }

  return context
}

/**
 * Assemble the full script text for an issue using a single nested query
 * instead of N+1 loops (previously ~500 queries, now 1 query)
 */
async function assembleScriptText(
  supabase: Awaited<ReturnType<typeof createClient>>,
  issueId: string,
  context: AIContext
) {
  // Single query: fetch the entire issue tree with all nested content
  const { data: acts } = await withTimeout(
    supabase
      .from('acts')
      .select(`
        id, number,
        scenes (
          id, title, sort_order,
          pages (
            id, page_number, orientation, sort_order,
            panels (
              id, sort_order, visual_description, camera,
              dialogue_blocks (speaker_name, character_id, text, delivery_type, delivery_instruction, balloon_number, sort_order),
              captions (text, caption_type, sort_order),
              sound_effects (text, sort_order)
            )
          )
        )
      `)
      .eq('issue_id', issueId)
      .order('number'),
    DB_TIMEOUT,
  )

  if (!acts || (acts as unknown[]).length === 0) return

  let scriptText = ''

  // Sort and iterate through the tree (Supabase nested sorts aren't guaranteed)
  const sortedActs = [...(acts as any[])].sort((a, b) => a.number - b.number)

  for (const act of sortedActs) {
    const sortedScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

    for (const scene of sortedScenes) {
      const sortedPages = [...(scene.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

      for (const page of sortedPages) {
        scriptText += `\nPAGE ${page.page_number} (${page.orientation?.toLowerCase() || 'right'})\n`

        const sortedPanels = [...(page.panels || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

        for (const panel of sortedPanels) {
          scriptText += `PANEL ${panel.sort_order}: ${panel.visual_description || '(No description)'}\n`
          if (panel.camera) scriptText += `[Camera: ${panel.camera}]\n`

          // Dialogue
          const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
          for (const d of sortedDialogue) {
            let speaker = d.speaker_name || 'UNKNOWN'
            if (d.delivery_type === 'VO') speaker += ' (V.O.)'
            else if (d.delivery_type === 'OS') speaker += ' (O.S.)'
            if (d.delivery_instruction) speaker += ` [${d.delivery_instruction}]`
            if (d.balloon_number > 1) speaker += ` ${d.balloon_number}`
            scriptText += `${speaker}: ${d.text}\n`
          }

          // Captions
          const sortedCaptions = [...(panel.captions || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
          for (const cap of sortedCaptions) {
            const capType = cap.caption_type ? ` (${cap.caption_type.toUpperCase()})` : ''
            scriptText += `CAP${capType}: ${cap.text}\n`
          }

          // Sound effects
          const sortedSfx = [...(panel.sound_effects || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
          for (const s of sortedSfx) {
            scriptText += `SFX: ${s.text}\n`
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
 * Single nested query instead of per-panel loops
 */
async function assembleCurrentPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pageId: string,
  context: AIContext
) {
  // Single query: fetch page with all nested panel content
  const { data: page } = await withTimeout(
    supabase
      .from('pages')
      .select(`
        page_number, orientation,
        panels (
          id, sort_order, visual_description, camera,
          dialogue_blocks (speaker_name, text, delivery_type, delivery_instruction, sort_order),
          captions (text, caption_type, sort_order),
          sound_effects (text, sort_order)
        )
      `)
      .eq('id', pageId)
      .single(),
    DB_TIMEOUT,
  )

  if (!page) return

  const p = page as {
    page_number: number; orientation: string;
    panels: Array<{
      id: string; sort_order: number; visual_description?: string; camera?: string;
      dialogue_blocks: Array<{ speaker_name?: string; text: string; delivery_type: string; delivery_instruction?: string; sort_order: number }>;
      captions: Array<{ text: string; caption_type: string; sort_order: number }>;
      sound_effects: Array<{ text: string; sort_order: number }>;
    }>
  }

  const sortedPanels = [...(p.panels || [])].sort((a, b) => a.sort_order - b.sort_order)

  const panelContexts = sortedPanels.map(panel => {
    const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a, b) => a.sort_order - b.sort_order)
    const sortedCaptions = [...(panel.captions || [])].sort((a, b) => a.sort_order - b.sort_order)
    const sortedSfx = [...(panel.sound_effects || [])].sort((a, b) => a.sort_order - b.sort_order)

    return {
      id: panel.id,
      order: panel.sort_order,
      visual_description: panel.visual_description || undefined,
      camera: panel.camera || undefined,
      characters_present: undefined as string[] | undefined,
      dialogue: sortedDialogue.length > 0
        ? sortedDialogue.map(d => ({
            speaker: d.speaker_name || 'UNKNOWN',
            text: d.text,
            delivery_type: d.delivery_type,
            delivery_instruction: d.delivery_instruction || undefined,
          }))
        : undefined,
      captions: sortedCaptions.length > 0
        ? sortedCaptions.map(c => ({
            text: c.text,
            type: c.caption_type || 'narrative',
          }))
        : undefined,
      sound_effects: sortedSfx.length > 0
        ? sortedSfx.map(s => s.text)
        : undefined,
    }
  })

  context.currentPage = {
    pageNumber: p.page_number,
    orientation: p.orientation || 'RIGHT',
    panels: panelContexts,
  }
}
