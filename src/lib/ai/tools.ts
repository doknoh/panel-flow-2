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
        const updates: Record<string, unknown> = {}
        if (input.physical_description) updates.physical_description = input.physical_description
        if (input.speech_patterns) updates.speech_patterns = input.speech_patterns
        if (input.relationships) updates.relationships = input.relationships
        if (input.arc_notes) updates.arc_notes = input.arc_notes

        const { data, error } = await supabase
          .from('characters')
          .update(updates)
          .eq('id', input.characterId as string)
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
        const { data, error } = await supabase
          .from('panel_notes')
          .insert({
            user_id: userId,
            panel_id: input.panelId as string,
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
        const updates: Record<string, unknown> = {}
        if (input.title) updates.title = input.title
        if (input.notes) updates.notes = input.notes

        const { data, error } = await supabase
          .from('scenes')
          .update(updates)
          .eq('id', input.sceneId as string)
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
        const { data, error } = await supabase
          .from('panels')
          .update({ visual_description: input.visual_description as string })
          .eq('id', input.panelId as string)
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
        // Get next order for dialogue blocks in this panel
        const { data: maxDialogue } = await supabase
          .from('dialogue_blocks')
          .select('order')
          .eq('panel_id', input.panelId as string)
          .order('order', { ascending: false })
          .limit(1)
          .single()

        const nextOrder = ((maxDialogue as { order: number } | null)?.order ?? 0) + 1

        const { data, error } = await supabase
          .from('dialogue_blocks')
          .insert({
            panel_id: input.panelId as string,
            speaker_name: input.speaker_name as string,
            text: input.text as string,
            delivery_type: (input.delivery_type as string) || 'STANDARD',
            order: nextOrder,
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

      default:
        return { success: false, result: `Unknown tool: ${toolName}` }
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error)
    return { success: false, result: `Failed to execute ${toolName}` }
  }
}
