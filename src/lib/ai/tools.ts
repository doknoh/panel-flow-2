import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

// ============================================
// TOOL DEFINITIONS — Comic Script Specific
// ============================================

export const EDITOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_character',
    description:
      'Create a new character in the series. Use when the writer has described or named a character they want to track. Always wrap this in conversational text explaining what you want to create and why.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: "The character's full name",
        },
        display_name: {
          type: 'string',
          description: 'How it appears in script (e.g., "MARSHALL"). All caps.',
        },
        physical_description: {
          type: 'string',
          description: 'Physical appearance for artist reference',
        },
        speech_patterns: {
          type: 'string',
          description: 'Verbal tics, vocabulary, rhythm of dialogue',
        },
        arc_notes: {
          type: 'string',
          description: 'Brief character arc summary, if discussed',
        },
      },
      required: ['name', 'display_name'],
    },
  },
  {
    name: 'update_character',
    description:
      "Update an existing character's details. Use when the conversation has refined a character who already exists. Reference the character by their ID from the project context.",
    input_schema: {
      type: 'object' as const,
      properties: {
        characterId: {
          type: 'string',
          description: "The character's ID from the project context",
        },
        physical_description: {
          type: 'string',
          description: 'Updated physical description',
        },
        speech_patterns: {
          type: 'string',
          description: 'Updated speech patterns',
        },
        relationships: {
          type: 'string',
          description: 'Updated relationship notes',
        },
        arc_notes: {
          type: 'string',
          description: 'Updated character arc notes',
        },
        age: {
          type: 'string',
          description: 'Character age or age range (e.g. "mid-30s")',
        },
        eye_color: {
          type: 'string',
          description: 'Eye color description',
        },
        hair_color_style: {
          type: 'string',
          description: 'Hair color and style',
        },
        height: {
          type: 'string',
          description: 'Height (e.g. "tall", "5\'11\\"")',
        },
        build: {
          type: 'string',
          description: 'Body build (e.g. "athletic", "stocky")',
        },
        skin_tone: {
          type: 'string',
          description: 'Skin tone description',
        },
        distinguishing_marks: {
          type: 'string',
          description: 'Scars, tattoos, birthmarks, etc.',
        },
        style_wardrobe: {
          type: 'string',
          description: 'Typical clothing, accessories, look',
        },
      },
      required: ['characterId'],
    },
  },
  {
    name: 'create_location',
    description:
      'Create a new location in the series. Use when the writer has described a place they want to track.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'The location name',
        },
        description: {
          type: 'string',
          description: 'A description of the location',
        },
        visual_details: {
          type: 'string',
          description: 'Visual details for the artist',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_plotline',
    description:
      'Create a new plotline (narrative thread) to track across the series. Use when the conversation has identified a distinct subplot or thematic line worth tracking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Short name for the plotline (e.g., "Marshall IRL", "Tracy Solo")',
        },
        description: {
          type: 'string',
          description: 'What this plotline is about — the central tension or question',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'save_canvas_beat',
    description:
      "Save an idea, observation, or creative spark to the Canvas as a beat. Perfect for capturing thoughts from conversation before they slip away. Beats float at the series level and can be filed to scenes later.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Short title capturing the essence of the idea',
        },
        content: {
          type: 'string',
          description: 'The idea, observation, or note in more detail',
        },
        item_type: {
          type: 'string',
          enum: ['beat', 'idea', 'theme', 'worldbuilding', 'research', 'general'],
          description: 'Category for organizing the beat',
        },
        color_tag: {
          type: 'string',
          enum: ['yellow', 'blue', 'green', 'pink', 'purple', 'orange'],
          description: 'Color tag for visual organization',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'add_panel_note',
    description:
      'Add an AI editorial note on a specific panel. Use when you have a concrete suggestion about panel composition, dialogue, or visual storytelling. The note will appear as an AI suggestion the writer can accept or dismiss.',
    input_schema: {
      type: 'object' as const,
      properties: {
        panelId: {
          type: 'string',
          description: 'The panel ID to attach the note to (from project context)',
        },
        content: {
          type: 'string',
          description: 'The editorial suggestion or observation',
        },
      },
      required: ['panelId', 'content'],
    },
  },
  {
    name: 'update_scene_metadata',
    description:
      "Update an existing scene's metadata — title, intention, or summary. Use when the conversation has refined the purpose or plan for a scene.",
    input_schema: {
      type: 'object' as const,
      properties: {
        sceneId: {
          type: 'string',
          description: 'The scene ID from the project context',
        },
        title: {
          type: 'string',
          description: 'Updated scene title/slug',
        },
        notes: {
          type: 'string',
          description: 'Updated scene notes or intention',
        },
      },
      required: ['sceneId'],
    },
  },
  {
    name: 'draft_panel_description',
    description:
      'Draft a visual description for a panel. Use when you and the writer have discussed what a panel should show and the writer wants you to draft it. Keep descriptions vivid but concise — describe what the camera sees.',
    input_schema: {
      type: 'object' as const,
      properties: {
        panelId: {
          type: 'string',
          description: 'The panel ID to draft into',
        },
        visual_description: {
          type: 'string',
          description: 'The visual description for the panel. Write it as what the artist sees — not notes, not an outline.',
        },
      },
      required: ['panelId', 'visual_description'],
    },
  },
  {
    name: 'add_dialogue',
    description:
      'Add a dialogue block to a panel. Use when the writer wants you to draft dialogue for a specific panel. Keep dialogue sharp and character-specific.',
    input_schema: {
      type: 'object' as const,
      properties: {
        panelId: {
          type: 'string',
          description: 'The panel ID to add dialogue to',
        },
        speaker_name: {
          type: 'string',
          description: 'Speaker name in ALL CAPS (e.g., "MARSHALL")',
        },
        text: {
          type: 'string',
          description: 'The dialogue text',
        },
        delivery_type: {
          type: 'string',
          enum: ['STANDARD', 'VO', 'OS', 'BACKGROUND'],
          description: 'Delivery type for the dialogue',
        },
      },
      required: ['panelId', 'speaker_name', 'text'],
    },
  },
  {
    name: 'save_project_note',
    description:
      'Save an insight, decision, or open question to Project Notes. Use when the conversation surfaces something worth preserving for future reference.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'The note content',
        },
        type: {
          type: 'string',
          enum: ['OPEN_QUESTION', 'DECISION', 'AI_INSIGHT', 'GENERAL'],
          description: 'The type of note',
        },
      },
      required: ['content'],
    },
  },

  // ============================================
  // PHASE 3: ANALYTICS & INTELLIGENCE TOOLS
  // ============================================

  {
    name: 'generate_power_rankings',
    description:
      'Analyze multiple issues and rank them by quality across structural coherence, character voice consistency, theme resonance, page turn effectiveness, dialogue efficiency, and visual description clarity. Returns structured script data for each issue so you can provide a detailed comparative analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'The issue IDs to analyze and compare. Provide at least 2.',
        },
      },
      required: ['issueIds'],
    },
  },
  {
    name: 'track_character_state',
    description:
      'Record a character\'s emotional and plot state at a specific point in the story. Use after discussing a character\'s arc or state in a particular issue. The writer should confirm the interpretation before saving.',
    input_schema: {
      type: 'object' as const,
      properties: {
        characterId: {
          type: 'string',
          description: 'The character ID from the project context',
        },
        issueId: {
          type: 'string',
          description: 'The issue where this state applies',
        },
        emotional_state: {
          type: 'string',
          description: 'The character\'s emotional state (e.g., "desperate but determined", "quietly furious", "hopeful with reservations")',
        },
        plot_position: {
          type: 'string',
          description: 'Where the character stands in terms of agency and safety (e.g., "in control", "out of control", "trapped", "rising")',
        },
        summary: {
          type: 'string',
          description: 'One sentence summarizing this character\'s state and arc position in this issue',
        },
      },
      required: ['characterId', 'issueId', 'emotional_state', 'plot_position', 'summary'],
    },
  },
  {
    name: 'continuity_check',
    description:
      'Run a continuity check across an issue or the entire series. Returns script content and structure data so you can analyze for potential continuity issues: character knowledge gaps, location inconsistencies, timeline breaks, and emotional reactions without setup.',
    input_schema: {
      type: 'object' as const,
      properties: {
        seriesId: {
          type: 'string',
          description: 'The series ID to check',
        },
        scope: {
          type: 'string',
          enum: ['issue', 'series'],
          description: 'Whether to check a single issue or the entire series',
        },
        issueId: {
          type: 'string',
          description: 'Required when scope is "issue" — the specific issue to check',
        },
      },
      required: ['seriesId', 'scope'],
    },
  },
  {
    name: 'extract_outline',
    description:
      'Generate an outline from existing script content for a specific issue. Returns the full script text and structure so you can produce a structured outline with act breaks, scene summaries, and page allocations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueId: {
          type: 'string',
          description: 'The issue to extract an outline from',
        },
      },
      required: ['issueId'],
    },
  },
  {
    name: 'draft_scene_summary',
    description:
      'Summarize a scene\'s content based on its pages, panels, dialogue, and captions. Returns the scene data so you can provide a concise summary of what happens.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sceneId: {
          type: 'string',
          description: 'The scene ID to summarize',
        },
      },
      required: ['sceneId'],
    },
  },

  // ============================================
  // ACTIVE CAPTURE TOOL
  // ============================================

  {
    name: 'update_page_story_beat',
    description: 'Save a story beat to a specific page. Use when a beat crystallizes during conversation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pageId: { type: 'string', description: 'The page ID from the project context' },
        story_beat: { type: 'string', description: 'The story beat text' },
      },
      required: ['pageId', 'story_beat'],
    },
  },

  // ============================================
  // ART PROMPTS PHASE TOOL
  // ============================================

  {
    name: 'generate_art_prompt',
    description:
      'Generate an image/art prompt for a specific panel, translating the script description into a detailed visual brief for the artist or AI image generator. Includes lighting, color palette, camera angle, expression/body language, and atmosphere. Use during the Art Prompts phase or when the writer asks for visual direction on a panel.',
    input_schema: {
      type: 'object' as const,
      properties: {
        panelId: {
          type: 'string',
          description: 'The panel ID to generate an art prompt for',
        },
        prompt: {
          type: 'string',
          description: 'The full art/image prompt describing the visual in detail',
        },
        style_notes: {
          type: 'string',
          description: 'Overall artistic style direction (e.g., "Moebius-influenced linework", "muted realism")',
        },
        lighting: {
          type: 'string',
          description: 'Lighting description (e.g., "harsh fluorescent overhead", "warm golden hour rim light")',
        },
        color_palette: {
          type: 'string',
          description: 'Color direction (e.g., "desaturated blues and grays with a single warm accent", "high contrast B&W")',
        },
        camera_notes: {
          type: 'string',
          description: 'Camera angle and framing (e.g., "low angle looking up — gives character power", "extreme close-up on hands")',
        },
        mood: {
          type: 'string',
          description: 'Emotional atmosphere (e.g., "claustrophobic tension", "quiet devastation", "manic energy")',
        },
      },
      required: ['panelId', 'prompt'],
    },
  },
]

// ============================================
// TOOL EXECUTOR
// ============================================

export interface ToolResult {
  success: boolean
  result: string
  entityId?: string
  entityType?: string
}

// Verify an entity belongs to the given series before modifying it
async function verifyEntityOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  entityId: string,
  seriesId: string,
  seriesIdColumn = 'series_id'
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', entityId)
    .eq(seriesIdColumn, seriesId)
    .single()
  return !!data
}

// Verify a panel belongs to a page in a scene in an act in an issue belonging to this series
async function verifyPanelInSeries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  panelId: string,
  seriesId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('panels')
    .select('page_id, pages!inner(scene_id, scenes!inner(act_id, acts!inner(issue_id, issues!inner(series_id))))')
    .eq('id', panelId)
    .single()
  if (!data) return false
  // Walk the join to verify series_id
  const pages = data.pages as any
  return pages?.scenes?.acts?.issues?.series_id === seriesId
}

// Verify a scene belongs to this series
async function verifySceneInSeries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sceneId: string,
  seriesId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('scenes')
    .select('act_id, acts!inner(issue_id, issues!inner(series_id))')
    .eq('id', sceneId)
    .single()
  if (!data) return false
  const acts = data.acts as any
  return acts?.issues?.series_id === seriesId
}

// Verify a page belongs to this series via page → scene → act → issue → series chain
async function verifyPageInSeries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pageId: string,
  seriesId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('pages')
    .select('scene_id, scenes!inner(act_id, acts!inner(issue_id, issues!inner(series_id)))')
    .eq('id', pageId)
    .single()
  if (!data) return false
  const scenes = data.scenes as any
  return scenes?.acts?.issues?.series_id === seriesId
}

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  seriesId: string,
  userId: string
): Promise<ToolResult> {
  const supabase = await createClient()

  try {
    switch (toolName) {
      case 'create_character': {
        const { data, error } = await supabase
          .from('characters')
          .insert({
            series_id: seriesId,
            name: input.name as string,
            display_name: input.display_name as string,
            physical_description: (input.physical_description as string) || null,
            speech_patterns: (input.speech_patterns as string) || null,
            arc_notes: (input.arc_notes as string) || null,
          })
          .select('id, name')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Created character "${data.name}"`,
          entityId: data.id,
          entityType: 'character',
        }
      }

      case 'update_character': {
        const charId = input.characterId as string
        if (!charId) return { success: false, result: 'Missing characterId' }
        const charOwned = await verifyEntityOwnership(supabase, 'characters', charId, seriesId)
        if (!charOwned) return { success: false, result: 'Character not found in this series' }

        const updates: Record<string, unknown> = {}
        if (input.physical_description) updates.physical_description = input.physical_description
        if (input.speech_patterns) updates.speech_patterns = input.speech_patterns
        if (input.relationships) updates.relationships = input.relationships
        if (input.arc_notes) updates.arc_notes = input.arc_notes
        if (input.age) updates.age = input.age
        if (input.eye_color) updates.eye_color = input.eye_color
        if (input.hair_color_style) updates.hair_color_style = input.hair_color_style
        if (input.height) updates.height = input.height
        if (input.build) updates.build = input.build
        if (input.skin_tone) updates.skin_tone = input.skin_tone
        if (input.distinguishing_marks) updates.distinguishing_marks = input.distinguishing_marks
        if (input.style_wardrobe) updates.style_wardrobe = input.style_wardrobe

        const { data, error } = await supabase
          .from('characters')
          .update(updates)
          .eq('id', charId)
          .select('id, name')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Updated character "${data.name}"`,
          entityId: data.id,
          entityType: 'character',
        }
      }

      case 'create_location': {
        const { data, error } = await supabase
          .from('locations')
          .insert({
            series_id: seriesId,
            name: input.name as string,
            description: (input.description as string) || null,
            visual_details: (input.visual_details as string) || null,
          })
          .select('id, name')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Created location "${data.name}"`,
          entityId: data.id,
          entityType: 'location',
        }
      }

      case 'create_plotline': {
        // Generate a color for the plotline
        const colors = ['#EF4444', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6', '#F97316']
        const { data: existingPlotlines } = await supabase
          .from('plotlines')
          .select('color')
          .eq('series_id', seriesId)

        const usedColors = (existingPlotlines || []).map((p: { color: string }) => p.color)
        const color = colors.find(c => !usedColors.includes(c)) || colors[0]

        const { data, error } = await supabase
          .from('plotlines')
          .insert({
            series_id: seriesId,
            name: input.name as string,
            description: (input.description as string) || null,
            color,
          })
          .select('id, name')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Created plotline "${data.name}"`,
          entityId: data.id,
          entityType: 'plotline',
        }
      }

      case 'save_canvas_beat': {
        // Get max sort_order
        const { data: maxOrder } = await supabase
          .from('canvas_items')
          .select('sort_order')
          .eq('series_id', seriesId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single()

        const nextOrder = ((maxOrder as { sort_order: number } | null)?.sort_order ?? -1) + 1

        const { data, error } = await supabase
          .from('canvas_items')
          .insert({
            series_id: seriesId,
            user_id: userId,
            title: input.title as string,
            content: input.content as string,
            item_type: (input.item_type as string) || 'beat',
            color_tag: (input.color_tag as string) || 'yellow',
            source: 'ai',
            sort_order: nextOrder,
          })
          .select('id, title')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Saved to canvas: "${data.title}"`,
          entityId: data.id,
          entityType: 'canvas_item',
        }
      }

      case 'add_panel_note': {
        const notesPanelId = input.panelId as string
        if (!notesPanelId || !input.content) return { success: false, result: 'Missing panelId or content' }
        const notesPanelOwned = await verifyPanelInSeries(supabase, notesPanelId, seriesId)
        if (!notesPanelOwned) return { success: false, result: 'Panel not found in this series' }

        const { data, error } = await supabase
          .from('panel_notes')
          .insert({
            user_id: userId,
            panel_id: notesPanelId,
            source: 'ai',
            content: input.content as string,
            status: 'pending',
          })
          .select('id')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: 'Added editorial note to panel',
          entityId: data.id,
          entityType: 'panel_note',
        }
      }

      case 'update_scene_metadata': {
        const sceneId = input.sceneId as string
        if (!sceneId) return { success: false, result: 'Missing sceneId' }
        const sceneOwned = await verifySceneInSeries(supabase, sceneId, seriesId)
        if (!sceneOwned) return { success: false, result: 'Scene not found in this series' }

        const updates: Record<string, unknown> = {}
        if (input.title) updates.title = input.title
        if (input.notes) updates.notes = input.notes

        const { data, error } = await supabase
          .from('scenes')
          .update(updates)
          .eq('id', sceneId)
          .select('id, title')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Updated scene "${data.title}"`,
          entityId: data.id,
          entityType: 'scene',
        }
      }

      case 'draft_panel_description': {
        const draftPanelId = input.panelId as string
        if (!draftPanelId || !input.visual_description) return { success: false, result: 'Missing panelId or visual_description' }
        const draftPanelOwned = await verifyPanelInSeries(supabase, draftPanelId, seriesId)
        if (!draftPanelOwned) return { success: false, result: 'Panel not found in this series' }

        const { data, error } = await supabase
          .from('panels')
          .update({ visual_description: input.visual_description as string })
          .eq('id', draftPanelId)
          .select('id, panel_number')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Drafted description for panel ${data.panel_number}`,
          entityId: data.id,
          entityType: 'panel',
        }
      }

      case 'add_dialogue': {
        const dialoguePanelId = input.panelId as string
        if (!dialoguePanelId || !input.speaker_name || !input.text) return { success: false, result: 'Missing panelId, speaker_name, or text' }
        const dialoguePanelOwned = await verifyPanelInSeries(supabase, dialoguePanelId, seriesId)
        if (!dialoguePanelOwned) return { success: false, result: 'Panel not found in this series' }

        // Get next order for dialogue blocks in this panel
        const { data: maxDialogue } = await supabase
          .from('dialogue_blocks')
          .select('sort_order')
          .eq('panel_id', dialoguePanelId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single()

        const nextOrder = ((maxDialogue as { sort_order: number } | null)?.sort_order ?? 0) + 1

        const { data, error } = await supabase
          .from('dialogue_blocks')
          .insert({
            panel_id: dialoguePanelId,
            speaker_name: input.speaker_name as string,
            text: input.text as string,
            dialogue_type: (input.delivery_type as string) || 'dialogue',
            sort_order: nextOrder,
            balloon_number: 1,
          })
          .select('id')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Added dialogue for ${input.speaker_name}`,
          entityId: data.id,
          entityType: 'dialogue_block',
        }
      }

      case 'save_project_note': {
        const { data, error } = await supabase
          .from('project_notes')
          .insert({
            series_id: seriesId,
            content: input.content as string,
            type: (input.type as string) || 'AI_INSIGHT',
            resolved: false,
          })
          .select('id')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: 'Saved project note',
          entityId: data.id,
          entityType: 'project_note',
        }
      }

      // ============================================
      // PHASE 3: ANALYTICS & INTELLIGENCE EXECUTORS
      // ============================================

      case 'generate_power_rankings': {
        const issueIds = input.issueIds as string[]
        if (!issueIds || issueIds.length < 2) {
          return { success: false, result: 'Need at least 2 issue IDs to compare' }
        }

        const issueData: Array<{ id: string; number: number; title: string; summary?: string; scriptText: string }> = []

        for (const id of issueIds) {
          // Verify each issue belongs to this series
          const { data: issue } = await supabase
            .from('issues')
            .select('id, number, title, summary')
            .eq('id', id)
            .eq('series_id', seriesId)
            .single()

          if (!issue) continue
          const i = issue as { id: string; number: number; title: string; summary?: string }

          // Build script text for this issue
          let scriptText = ''
          const { data: acts } = await supabase
            .from('acts')
            .select('id, number')
            .eq('issue_id', id)
            .order('number')

          if (acts) {
            for (const act of acts as Array<{ id: string; number: number }>) {
              const { data: scenes } = await supabase
                .from('scenes')
                .select('id, title, sort_order')
                .eq('act_id', act.id)
                .order('sort_order')

              if (!scenes) continue
              for (const scene of scenes as Array<{ id: string; title?: string; sort_order: number }>) {
                scriptText += `\n--- Scene: ${scene.title || 'Untitled'} (Act ${act.number}) ---\n`
                const { data: pages } = await supabase
                  .from('pages')
                  .select('id, page_number, orientation, sort_order')
                  .eq('scene_id', scene.id)
                  .order('sort_order')

                if (!pages) continue
                for (const page of pages as Array<{ id: string; page_number: number; orientation: string }>) {
                  scriptText += `PAGE ${page.page_number} (${page.orientation?.toLowerCase() || 'right'})\n`
                  const { data: panels } = await supabase
                    .from('panels')
                    .select('id, sort_order, visual_description, sfx')
                    .eq('page_id', page.id)
                    .order('sort_order')

                  if (!panels) continue
                  for (const panel of panels as Array<{ id: string; sort_order: number; visual_description?: string; sfx?: string }>) {
                    scriptText += `PANEL ${panel.sort_order}: ${panel.visual_description || '(No description)'}\n`
                    const { data: dialogue } = await supabase
                      .from('dialogue_blocks')
                      .select('speaker_name, text, dialogue_type, sort_order')
                      .eq('panel_id', panel.id)
                      .order('sort_order')
                    if (dialogue) {
                      for (const d of dialogue as Array<{ speaker_name?: string; text: string; dialogue_type: string }>) {
                        const speaker = d.speaker_name || 'UNKNOWN'
                        const delivery = d.dialogue_type !== 'dialogue' ? ` (${d.dialogue_type})` : ''
                        scriptText += `${speaker}${delivery}: ${d.text}\n`
                      }
                    }
                    const { data: captions } = await supabase
                      .from('captions')
                      .select('text, sort_order')
                      .eq('panel_id', panel.id)
                      .order('sort_order')
                    if (captions) {
                      for (const cap of captions as Array<{ text: string }>) {
                        scriptText += `CAP: ${cap.text}\n`
                      }
                    }
                    if (panel.sfx) scriptText += `SFX: ${panel.sfx}\n`
                    scriptText += '\n'
                  }
                }
              }
            }
          }

          issueData.push({
            id: i.id,
            number: i.number,
            title: i.title,
            summary: i.summary || undefined,
            scriptText: scriptText.substring(0, 50000), // Cap each issue
          })
        }

        const resultText = issueData.map(issue =>
          `## Issue #${issue.number}: "${issue.title}"\n${issue.summary ? `Summary: ${issue.summary}\n` : ''}\n${issue.scriptText}`
        ).join('\n\n---\n\n')

        return {
          success: true,
          result: `Power rankings data for ${issueData.length} issues:\n\n${resultText}`,
        }
      }

      case 'track_character_state': {
        const stateCharId = input.characterId as string
        const stateIssueId = input.issueId as string
        if (!stateCharId || !stateIssueId) return { success: false, result: 'Missing characterId or issueId' }

        // Verify character belongs to series
        const charInSeries = await verifyEntityOwnership(supabase, 'characters', stateCharId, seriesId)
        if (!charInSeries) return { success: false, result: 'Character not found in this series' }

        // Verify issue belongs to series
        const { data: issueCheck } = await supabase.from('issues').select('id').eq('id', stateIssueId).eq('series_id', seriesId).single()
        if (!issueCheck) return { success: false, result: 'Issue not found in this series' }

        const { data, error } = await supabase
          .from('character_states')
          .upsert({
            character_id: stateCharId,
            issue_id: stateIssueId,
            emotional_state: input.emotional_state as string,
            plot_position: input.plot_position as string,
            arc_summary: input.summary as string,
          }, {
            onConflict: 'character_id,issue_id',
          })
          .select('id')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Tracked character state for this issue`,
          entityId: data.id,
          entityType: 'character_state',
        }
      }

      case 'continuity_check': {
        const scope = input.scope as string
        // Always use the authenticated seriesId — never trust AI-provided seriesId
        const targetSeriesId = seriesId
        let report = ''

        if (scope === 'issue') {
          const targetIssueId = input.issueId as string
          if (!targetIssueId) return { success: false, result: 'issueId is required when scope is "issue"' }

          // Fetch issue metadata — verify it belongs to this series
          const { data: issue } = await supabase
            .from('issues')
            .select('number, title')
            .eq('id', targetIssueId)
            .eq('series_id', seriesId)
            .single()

          if (!issue) return { success: false, result: 'Issue not found' }
          const i = issue as { number: number; title: string }
          report += `Continuity check for Issue #${i.number}: "${i.title}"\n\n`

          // Fetch all characters in the series
          const { data: characters } = await supabase
            .from('characters')
            .select('id, display_name, relationships, arc_notes')
            .eq('series_id', targetSeriesId)

          if (characters) {
            report += `Characters in series: ${(characters as Array<{ display_name: string }>).map(c => c.display_name).join(', ')}\n\n`
          }

          // Fetch the issue structure and script
          const { data: acts } = await supabase
            .from('acts')
            .select('id, number, name')
            .eq('issue_id', targetIssueId)
            .order('number')

          if (acts) {
            for (const act of acts as Array<{ id: string; number: number; name?: string }>) {
              report += `### Act ${act.number}${act.name ? `: ${act.name}` : ''}\n`
              const { data: scenes } = await supabase
                .from('scenes')
                .select('id, title, plotline_id, sort_order')
                .eq('act_id', act.id)
                .order('sort_order')

              if (scenes) {
                for (const scene of scenes as Array<{ id: string; title?: string; sort_order: number }>) {
                  report += `Scene: ${scene.title || 'Untitled'}\n`
                  const { data: pages } = await supabase
                    .from('pages')
                    .select('id, page_number, sort_order')
                    .eq('scene_id', scene.id)
                    .order('sort_order')

                  if (pages) {
                    for (const page of pages as Array<{ id: string; page_number: number }>) {
                      const { data: panels } = await supabase
                        .from('panels')
                        .select('id, sort_order, visual_description')
                        .eq('page_id', page.id)
                        .order('sort_order')

                      if (panels) {
                        for (const panel of panels as Array<{ id: string; sort_order: number; visual_description?: string }>) {
                          report += `  Page ${page.page_number}, Panel ${panel.sort_order}: ${panel.visual_description || '(empty)'}\n`
                          const { data: dialogue } = await supabase
                            .from('dialogue_blocks')
                            .select('speaker_name, text, dialogue_type')
                            .eq('panel_id', panel.id)
                            .order('sort_order')
                          if (dialogue) {
                            for (const d of dialogue as Array<{ speaker_name?: string; text: string }>) {
                              report += `    ${d.speaker_name || 'UNKNOWN'}: ${d.text}\n`
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } else {
          // Series scope — fetch summaries of all issues
          const { data: issues } = await supabase
            .from('issues')
            .select('id, number, title, summary')
            .eq('series_id', targetSeriesId)
            .order('number')

          if (issues) {
            report += `Series continuity check across ${(issues as unknown[]).length} issues:\n\n`
            for (const issue of issues as Array<{ id: string; number: number; title: string; summary?: string }>) {
              report += `Issue #${issue.number}: "${issue.title}" — ${issue.summary || 'No summary'}\n`
            }
          }

          // Fetch all characters
          const { data: characters } = await supabase
            .from('characters')
            .select('id, display_name, relationships, arc_notes, first_appearance')
            .eq('series_id', targetSeriesId)

          if (characters) {
            report += `\nCharacters:\n`
            for (const c of characters as Array<{ display_name: string; relationships?: string; arc_notes?: string; first_appearance?: string }>) {
              report += `- ${c.display_name}${c.first_appearance ? ` (first: ${c.first_appearance})` : ''}${c.arc_notes ? ` — Arc: ${c.arc_notes}` : ''}\n`
            }
          }

          // Fetch character states across issues
          const { data: states } = await supabase
            .from('character_states')
            .select('character_id, issue_id, emotional_state, plot_position, arc_summary')
            .order('issue_id')

          if (states && (states as unknown[]).length > 0) {
            report += `\nCharacter States Across Issues:\n`
            for (const s of states as Array<{ character_id: string; issue_id: string; emotional_state: string; plot_position: string; arc_summary: string }>) {
              report += `- Character ${s.character_id} in Issue ${s.issue_id}: ${s.emotional_state} / ${s.plot_position} — ${s.arc_summary}\n`
            }
          }
        }

        // Cap the report
        if (report.length > 100000) {
          report = report.substring(0, 100000) + '\n\n[Report truncated due to length]'
        }

        return {
          success: true,
          result: report,
        }
      }

      case 'extract_outline': {
        const targetIssueId = input.issueId as string
        if (!targetIssueId) return { success: false, result: 'Missing issueId' }

        const { data: issue } = await supabase
          .from('issues')
          .select('id, number, title, summary, themes, stakes, motifs')
          .eq('id', targetIssueId)
          .eq('series_id', seriesId)
          .single()

        if (!issue) return { success: false, result: 'Issue not found' }
        const i = issue as { id: string; number: number; title: string; summary?: string; themes?: string; stakes?: string; motifs?: string }

        let outlineData = `Issue #${i.number}: "${i.title}"\n`
        if (i.summary) outlineData += `Summary: ${i.summary}\n`
        if (i.themes) outlineData += `Themes: ${i.themes}\n`
        if (i.stakes) outlineData += `Stakes: ${i.stakes}\n`
        if (i.motifs) outlineData += `Motifs: ${i.motifs}\n`
        outlineData += '\n'

        const { data: acts } = await supabase
          .from('acts')
          .select('id, number, name, beat_summary')
          .eq('issue_id', targetIssueId)
          .order('number')

        if (acts) {
          for (const act of acts as Array<{ id: string; number: number; name?: string; beat_summary?: string }>) {
            outlineData += `## Act ${act.number}${act.name ? `: ${act.name}` : ''}\n`
            if (act.beat_summary) outlineData += `Beat Summary: ${act.beat_summary}\n`

            const { data: scenes } = await supabase
              .from('scenes')
              .select('id, title, plotline_id, notes, sort_order')
              .eq('act_id', act.id)
              .order('sort_order')

            if (scenes) {
              for (const scene of scenes as Array<{ id: string; title?: string; plotline_id?: string; notes?: string }>) {
                outlineData += `  - Scene: ${scene.title || 'Untitled'}\n`
                if (scene.notes) outlineData += `    Notes: ${scene.notes}\n`

                // Count pages and panels
                const { count: pageCount } = await supabase
                  .from('pages')
                  .select('id', { count: 'exact', head: true })
                  .eq('scene_id', scene.id)

                outlineData += `    Pages: ${pageCount || 0}\n`

                // Get a brief summary of what happens in this scene
                const { data: pages } = await supabase
                  .from('pages')
                  .select('id, page_number, sort_order')
                  .eq('scene_id', scene.id)
                  .order('sort_order')

                if (pages) {
                  for (const page of pages as Array<{ id: string; page_number: number }>) {
                    const { data: panels } = await supabase
                      .from('panels')
                      .select('visual_description, sort_order')
                      .eq('page_id', page.id)
                      .order('sort_order')

                    if (panels) {
                      for (const panel of panels as Array<{ visual_description?: string; sort_order: number }>) {
                        if (panel.visual_description) {
                          outlineData += `    P${page.page_number}.${panel.sort_order}: ${panel.visual_description}\n`
                        }
                      }
                    }
                  }
                }
              }
            }
            outlineData += '\n'
          }
        }

        // Cap output
        if (outlineData.length > 80000) {
          outlineData = outlineData.substring(0, 80000) + '\n\n[Data truncated due to length]'
        }

        return {
          success: true,
          result: outlineData,
        }
      }

      case 'draft_scene_summary': {
        const targetSceneId = input.sceneId as string
        if (!targetSceneId) return { success: false, result: 'Missing sceneId' }

        // Verify scene belongs to this series
        const summarySceneOwned = await verifySceneInSeries(supabase, targetSceneId, seriesId)
        if (!summarySceneOwned) return { success: false, result: 'Scene not found in this series' }

        const { data: scene } = await supabase
          .from('scenes')
          .select('id, title, notes, sort_order')
          .eq('id', targetSceneId)
          .single()

        if (!scene) return { success: false, result: 'Scene not found' }
        const s = scene as { id: string; title?: string; notes?: string }

        let sceneData = `Scene: ${s.title || 'Untitled'}\n`
        if (s.notes) sceneData += `Notes: ${s.notes}\n`
        sceneData += '\n'

        const { data: pages } = await supabase
          .from('pages')
          .select('id, page_number, orientation, sort_order')
          .eq('scene_id', targetSceneId)
          .order('sort_order')

        if (pages) {
          for (const page of pages as Array<{ id: string; page_number: number; orientation: string }>) {
            sceneData += `PAGE ${page.page_number} (${page.orientation?.toLowerCase() || 'right'})\n`

            const { data: panels } = await supabase
              .from('panels')
              .select('id, sort_order, visual_description, camera, sfx')
              .eq('page_id', page.id)
              .order('sort_order')

            if (panels) {
              for (const panel of panels as Array<{ id: string; sort_order: number; visual_description?: string; camera?: string; sfx?: string }>) {
                sceneData += `PANEL ${panel.sort_order}: ${panel.visual_description || '(No description)'}\n`
                if (panel.camera) sceneData += `[Camera: ${panel.camera}]\n`

                const { data: dialogue } = await supabase
                  .from('dialogue_blocks')
                  .select('speaker_name, text, dialogue_type, sort_order')
                  .eq('panel_id', panel.id)
                  .order('sort_order')

                if (dialogue) {
                  for (const d of dialogue as Array<{ speaker_name?: string; text: string; dialogue_type: string }>) {
                    const speaker = d.speaker_name || 'UNKNOWN'
                    const delivery = d.dialogue_type !== 'dialogue' ? ` (${d.dialogue_type})` : ''
                    sceneData += `${speaker}${delivery}: ${d.text}\n`
                  }
                }

                const { data: captions } = await supabase
                  .from('captions')
                  .select('text, sort_order')
                  .eq('panel_id', panel.id)
                  .order('sort_order')

                if (captions) {
                  for (const cap of captions as Array<{ text: string }>) {
                    sceneData += `CAP: ${cap.text}\n`
                  }
                }

                if (panel.sfx) sceneData += `SFX: ${panel.sfx}\n`
                sceneData += '\n'
              }
            }
          }
        }

        return {
          success: true,
          result: sceneData,
          entityId: targetSceneId,
          entityType: 'scene',
        }
      }

      case 'generate_art_prompt': {
        const artPanelId = input.panelId as string
        if (!artPanelId || !input.prompt) return { success: false, result: 'Missing panelId or prompt' }

        // Verify panel belongs to this series
        const artPanelOwned = await verifyPanelInSeries(supabase, artPanelId, seriesId)
        if (!artPanelOwned) return { success: false, result: 'Panel not found in this series' }

        // Fetch the panel to include context in the result
        const { data: panel } = await supabase
          .from('panels')
          .select('id, sort_order, visual_description, camera')
          .eq('id', artPanelId)
          .single()

        if (!panel) return { success: false, result: 'Panel not found' }
        const p = panel as { id: string; sort_order: number; visual_description?: string; camera?: string }

        // Upsert — replace existing art prompt for this panel
        const { data: artPrompt, error } = await supabase
          .from('art_prompts')
          .upsert({
            panel_id: artPanelId,
            prompt: input.prompt as string,
            style_notes: (input.style_notes as string) || null,
            lighting: (input.lighting as string) || null,
            color_palette: (input.color_palette as string) || null,
            camera_notes: (input.camera_notes as string) || null,
            mood: (input.mood as string) || null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'panel_id',
          })
          .select('id')
          .single()

        if (error) return { success: false, result: error.message }
        return {
          success: true,
          result: `Generated art prompt for panel ${p.sort_order}:\n\nPrompt: ${input.prompt}\n${input.lighting ? `Lighting: ${input.lighting}\n` : ''}${input.color_palette ? `Color: ${input.color_palette}\n` : ''}${input.camera_notes ? `Camera: ${input.camera_notes}\n` : ''}${input.mood ? `Mood: ${input.mood}\n` : ''}${input.style_notes ? `Style: ${input.style_notes}\n` : ''}`,
          entityId: artPrompt.id,
          entityType: 'art_prompt',
        }
      }

      case 'update_page_story_beat': {
        const { pageId, story_beat } = input as { pageId: string; story_beat: string }
        if (!pageId || !story_beat) return { success: false, result: 'Missing pageId or story_beat' }

        // Verify page belongs to this series via page → scene → act → issue → series chain
        const pageOwned = await verifyPageInSeries(supabase, pageId, seriesId)
        if (!pageOwned) return { success: false, result: 'Page not found in this series' }

        const { error } = await supabase
          .from('pages')
          .update({ story_beat })
          .eq('id', pageId)

        if (error) return { success: false, result: error.message }
        return { success: true, result: 'Story beat saved to page.' }
      }

      default:
        return { success: false, result: `Unknown tool: ${toolName}` }
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error)
    return { success: false, result: `Failed to execute ${toolName}` }
  }
}
