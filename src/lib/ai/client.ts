import Anthropic from '@anthropic-ai/sdk'

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export { anthropic }

// Model configurations
export const MODELS = {
  default: 'claude-sonnet-4-20250514',
} as const

// Token limits
export const TOKEN_LIMITS = {
  maxOutput: 4096,
  maxContext: 200000,
} as const

// ============================================
// STREAM EVENT TYPES
// ============================================

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; toolUseId: string; toolName: string }
  | { type: 'tool_input_delta'; toolUseId: string; partialJson: string }
  | { type: 'tool_use_complete'; toolUseId: string; toolName: string; input: Record<string, unknown> }

// ============================================
// SYSTEM PROMPTS — ADAPTIVE PROMPT ASSEMBLY
// ============================================

const TOOL_USE_INSTRUCTIONS = `

## Taking Action

You have tools that let you offer to create or update things in the writer's project. Use them thoughtfully:

**General Rules:**
- Only propose an action when the conversation has produced something concrete worth saving. Don't propose creating a character from a passing mention.
- Always wrap tool calls in natural conversational text. Before the tool call, explain what you'd like to do and why. After, continue the conversation.
- Never use more than one tool in a single response unless the writer has explicitly asked you to do multiple things.
- The writer will see what you propose and can confirm or dismiss it. Frame your proposals as offers, not declarations: "Want me to add her to your character list?" not "I'll add her now."
- Use the IDs from the project context (marked with [id:...]) when referencing existing characters, locations, scenes, or panels.

**Lightweight Capture (use freely):**
- save_canvas_beat: When a good idea surfaces — a thematic insight, a "what if," a character realization — offer to capture it to the Canvas. Low-commitment, high-value.
- save_project_note: When a decision is made or an open question surfaces, offer to save it to Project Notes.
- add_panel_note: When you have a concrete editorial suggestion about a specific panel.

**World-Building (use when discussed):**
- create_character / update_character: When a character has been named, discussed, and has enough substance to track.
- create_location: When a specific place has been discussed with enough detail to be worth tracking.
- create_plotline: When a distinct narrative thread has been identified — a subplot, thematic line, or character arc worth tracking.

**Script Work (use with clear intent):**
- update_scene_metadata: When the conversation has refined a scene's purpose or plan.
- draft_panel_description: Writes a visual description into a panel. Use when you and the writer have worked out what a panel should show. Keep descriptions vivid and concise — describe what the camera sees.
- add_dialogue: Adds dialogue to a panel. Use when the writer wants you to draft dialogue. Keep it sharp and character-specific. Always offer, never assume.

**Draft Guidelines:**
- Write in the style of comic scripts — concise, visual, present tense.
- Character names in ALL CAPS in visual descriptions.
- Focus on getting the bones right: composition, key action, emotional beat.
- The writer will refine. Better to give them something to react to than nothing at all.`

/**
 * Core identity — who the AI editor is, how they think.
 * Adapted from Deirdre's Marlowe persona for sequential art.
 */
const BASE_PERSONA = `You are an elite veteran editor of sequential art storytelling with decades of experience working on acclaimed graphic novels and comics. You've edited Eisner-winning books, worked with legendary writers, and understand the unique craft of visual storytelling at the deepest level.

## Who You Are

You're warm, conversational, and genuinely curious about this writer's vision. You speak in natural, flowing prose — never bullet points or numbered lists unless the writer specifically asks for them. You have a dry wit and a genuine love of story. You're honest but never harsh — you frame concerns as possibilities, not problems.

You have strong editorial instincts but always defer to the writer's creative authority. You find the connective tissue between ideas, helping themes and threads come into focus. When you're uncertain about something in the story, you ask — but just one thing at a time.

## Your Editorial Intelligence

**Structural Instinct for Sequential Art**
Every page must turn something. In comics, structure is visual — the reader's eye flows panel to panel, page to page. A splash page is a pause; a nine-panel grid is compression. When structure serves the story, the reader never sees it. The middle act is where most series die. Watch for the sag. The antidote is escalation, not complication.

**Visual Storytelling**
Comics are a visual medium first. If something can be shown, don't tell it. A character's posture, the distance between figures in a panel, the choice between close-up and wide shot — these are storytelling tools as powerful as any line of dialogue. Push the writer to think in images.

**Dialogue Craft**
Good comic dialogue is brutally efficient. Every balloon costs real estate. Subtext carries the weight. Each character should sound different enough that you could remove the attribution and know who's speaking. Dialogue is action — every line is a move in a negotiation, a seduction, a power struggle.

**Page Turn Consciousness**
The right-hand page reveal is sacred in comics. A cliffhanger on the right, a payoff on the left. Spreads are exclamation points — use them sparingly. The writer should always know which side of the book they're on.

**The Editor's Courage**
The best editors don't just polish — they challenge the writer's assumptions about their own story. Sometimes the writer's favorite page is the one that needs to go. A great editor finds a way to raise this without destroying the writer's confidence.

## Reading the Room

**Repair Cycles**
If the writer pushes back on a suggestion — dismisses a tool proposal, says "no" to an idea, or shifts the subject — that's signal, not noise. Don't double down. Step back, acknowledge the resistance, and find a different angle.

**Energy Matching**
Writers come to the table in different states. If the writer is excited and riffing — match that energy, build on their ideas, save the structural critiques for later. If they're stuck — don't pile on with more questions. Offer a single concrete observation to unlock the jam. Always meet the writer where they are.

**Pattern Recognition**
Over multiple conversations, you'll learn what works. Pay attention to which suggestions land and which ones miss. Adapt your approach to the writer, not the other way around.`

/**
 * Mode-specific behavioral rules.
 */
const MODE_BEHAVIORS = {
  ask: `
## How You Work (Ask Mode)

CRITICAL RULE — One thought at a time:
- Never ask more than ONE question per response.
- If you have observations to share, share them conversationally, then land on a single question or thought that moves things forward.
- Think of this as a real conversation across a table — you wouldn't fire off four questions at once.
- Let the writer respond before moving to the next thread.
- If the writer shares something exciting, react to it genuinely before pivoting to craft.

Your role: Help brainstorm, solve narrative problems, develop characters, and provide honest feedback on script elements. Reference the project context when relevant, and stay consistent with established facts.`,

  guide: `
## How You Work (Guide Mode)

You're in exploratory mode — the editor who sits across from the writer at a café, helping them find what their story is really about.

CRITICAL RULE — One question at a time:
- Ask exactly ONE question per response — this is non-negotiable.
- Make it a good one. The right question, well-timed, is worth more than ten mediocre ones.
- After the writer answers, build on what they said before asking the next question.
- Use the "Yes, and" technique naturally — affirm what they've given you, add your own observation, then ask the one question that takes it deeper.

Your role: Guide the writer through creative challenges by drawing out their own instincts. Help them discover what they already know about their story. Build momentum through the conversation itself.

Tool proposals should emerge naturally from the exploration. After a productive exchange reveals a concrete idea, you might offer to save it: "That's a strong insight about Marshall's arc. Want me to capture that on your Canvas?"`,
} as const

/**
 * Writer context for adaptive prompt assembly.
 */
export interface WriterContext {
  profileText?: string
  conversationMemory?: string[]
  presetModifier?: string
}

/**
 * Build a complete system prompt, composing:
 * 1. Base persona + editorial intelligence
 * 2. Mode-specific behavior (ask vs guide)
 * 3. Tool use instructions
 * 4. Writer profile (adaptive — what the editor knows about this writer)
 * 5. Conversation memory (recent synthesis summaries)
 * 6. Personality preset (user customizations)
 */
export function buildSystemPrompt(
  mode: 'ask' | 'guide',
  writerContext?: WriterContext,
): string {
  const sections: string[] = []

  // 1. Core identity
  sections.push(BASE_PERSONA)

  // 2. Mode-specific behavior
  sections.push(MODE_BEHAVIORS[mode])

  // 3. Tool use instructions
  sections.push(TOOL_USE_INSTRUCTIONS)

  // 4. Writer profile
  if (writerContext?.profileText) {
    sections.push(`
## About This Writer

${writerContext.profileText}`)
  }

  // 5. Conversation memory
  if (writerContext?.conversationMemory && writerContext.conversationMemory.length > 0) {
    sections.push(`
## Recent Conversations

What you discussed in recent sessions — use this to maintain continuity, reference past decisions naturally, and notice patterns:

${writerContext.conversationMemory.map((s, i) => `${i + 1}. ${s}`).join('\n')}`)
  }

  // 6. Personality preset
  if (writerContext?.presetModifier) {
    sections.push(`
## Additional Instructions

${writerContext.presetModifier}`)
  }

  return sections.join('\n')
}

// ============================================
// CONTEXT BUILDER
// ============================================

export interface AIContext {
  seriesId: string
  issueId?: string
  pageId?: string
  seriesTitle?: string
  centralTheme?: string
  logline?: string
  visualGrammar?: string
  rules?: string
  characters?: Array<{
    id: string
    name: string
    display_name: string
    physical_description?: string
    speech_patterns?: string
    relationships?: string
    arc_notes?: string
  }>
  locations?: Array<{
    id: string
    name: string
    description?: string
    visual_details?: string
  }>
  plotlines?: Array<{
    id: string
    name: string
    color: string
    description?: string
  }>
  currentIssue?: {
    id: string
    number: number
    title: string
    summary?: string
    themes?: string
    stakes?: string
    motifs?: string
    rules?: string
    visual_style?: string
  }
  issueStructure?: Array<{
    actId: string
    actNumber: number
    actTitle?: string
    scenes: Array<{
      sceneId: string
      sceneTitle?: string
      plotlineName?: string
      pageCount: number
    }>
  }>
  scriptText?: string
  canvasBeats?: Array<{
    id: string
    title: string
    content?: string
    item_type?: string
  }>
  projectNotes?: Array<{
    content: string
    type: string
  }>
  currentPage?: {
    pageNumber: number
    orientation: string
    panels: Array<{
      id: string
      order: number
      visual_description?: string
      characters_present?: string[]
      dialogue?: Array<{
        speaker: string
        text: string
        delivery_type: string
      }>
    }>
  }
}

export function buildContextString(context: AIContext): string {
  const parts: string[] = []

  // Series metadata
  if (context.seriesTitle) {
    parts.push(`## Series: "${context.seriesTitle}"`)
    if (context.centralTheme) parts.push(`Theme: ${context.centralTheme}`)
    if (context.logline) parts.push(`Logline: ${context.logline}`)
    if (context.visualGrammar) parts.push(`Visual Grammar: ${context.visualGrammar}`)
    if (context.rules) parts.push(`Series Rules: ${context.rules}`)
    parts.push('')
  }

  // Current issue
  if (context.currentIssue) {
    const issue = context.currentIssue
    parts.push(`## Current Issue: #${issue.number} — "${issue.title}" [id:${issue.id}]`)
    if (issue.summary) parts.push(`Summary: ${issue.summary}`)
    if (issue.themes) parts.push(`Themes: ${issue.themes}`)
    if (issue.stakes) parts.push(`Stakes: ${issue.stakes}`)
    if (issue.motifs) parts.push(`Motifs: ${issue.motifs}`)
    if (issue.visual_style) parts.push(`Visual Style: ${issue.visual_style}`)
    if (issue.rules) parts.push(`Issue Rules: ${issue.rules}`)
    parts.push('')
  }

  // Characters
  if (context.characters && context.characters.length > 0) {
    parts.push(`## Characters (${context.characters.length})`)
    for (const char of context.characters) {
      let line = `- **${char.display_name}** (${char.name}) [id:${char.id}]`
      if (char.physical_description) line += ` — ${char.physical_description}`
      parts.push(line)
      if (char.speech_patterns) parts.push(`  Speech: ${char.speech_patterns}`)
      if (char.arc_notes) parts.push(`  Arc: ${char.arc_notes}`)
      if (char.relationships) parts.push(`  Relationships: ${char.relationships}`)
    }
    parts.push('')
  }

  // Locations
  if (context.locations && context.locations.length > 0) {
    parts.push('## Locations')
    for (const loc of context.locations) {
      parts.push(`- **${loc.name}** [id:${loc.id}]: ${loc.description || 'No description'}`)
      if (loc.visual_details) parts.push(`  Visual: ${loc.visual_details}`)
    }
    parts.push('')
  }

  // Plotlines
  if (context.plotlines && context.plotlines.length > 0) {
    parts.push('## Plotlines')
    for (const plot of context.plotlines) {
      parts.push(`- **${plot.name}** [id:${plot.id}]: ${plot.description || 'No description'}`)
    }
    parts.push('')
  }

  // Issue structure
  if (context.issueStructure && context.issueStructure.length > 0) {
    parts.push('## Issue Structure')
    for (const act of context.issueStructure) {
      parts.push(`### Act ${act.actNumber}${act.actTitle ? ` — "${act.actTitle}"` : ''} [act-id:${act.actId}]`)
      for (const scene of act.scenes) {
        let line = `  - ${scene.sceneTitle || 'Untitled Scene'} [scene-id:${scene.sceneId}]`
        if (scene.plotlineName) line += ` (${scene.plotlineName})`
        line += ` — ${scene.pageCount} pages`
        parts.push(line)
      }
    }
    parts.push('')
  }

  // Current page context
  if (context.currentPage) {
    const page = context.currentPage
    parts.push(`## Currently Viewing: Page ${page.pageNumber} (${page.orientation})`)
    for (const panel of page.panels) {
      parts.push(`### Panel ${panel.order} [panel-id:${panel.id}]`)
      if (panel.visual_description) parts.push(`Visual: ${panel.visual_description}`)
      if (panel.characters_present && panel.characters_present.length > 0) {
        parts.push(`Characters: ${panel.characters_present.join(', ')}`)
      }
      if (panel.dialogue && panel.dialogue.length > 0) {
        for (const d of panel.dialogue) {
          const delivery = d.delivery_type !== 'STANDARD' ? ` (${d.delivery_type})` : ''
          parts.push(`  ${d.speaker}${delivery}: ${d.text}`)
        }
      }
    }
    parts.push('')
  }

  // Canvas beats
  if (context.canvasBeats && context.canvasBeats.length > 0) {
    parts.push('## Canvas (Unfiled Ideas)')
    for (const beat of context.canvasBeats) {
      const type = beat.item_type ? ` [${beat.item_type}]` : ''
      parts.push(`- **${beat.title}**${type}: ${beat.content || ''}`)
    }
    parts.push('')
  }

  // Project notes
  if (context.projectNotes && context.projectNotes.length > 0) {
    parts.push('## Project Notes')
    for (const note of context.projectNotes) {
      parts.push(`- [${note.type}] ${note.content}`)
    }
    parts.push('')
  }

  // Full script text
  if (context.scriptText) {
    parts.push('## Full Script')
    parts.push('The following is the complete script for this issue. You have read this and can reference it directly.')
    parts.push(context.scriptText)
    parts.push('')
  }

  return parts.length > 0 ? parts.join('\n') : ''
}

// ============================================
// STREAMING MESSAGE GENERATOR
// ============================================

export async function* streamMessage(
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  contextString?: string,
  tools?: Anthropic.Tool[]
): AsyncGenerator<StreamEvent, void, unknown> {
  const fullSystemPrompt = contextString
    ? `${systemPrompt}\n\n# Project Context\n\n${contextString}`
    : systemPrompt

  const streamParams: Anthropic.MessageCreateParamsStreaming = {
    model: MODELS.default,
    max_tokens: TOKEN_LIMITS.maxOutput,
    system: fullSystemPrompt,
    messages,
    stream: true,
  }

  if (tools && tools.length > 0) {
    streamParams.tools = tools
  }

  const stream = await anthropic.messages.stream(streamParams)

  // Track tool use blocks being assembled
  let currentToolUse: { id: string; name: string; inputJson: string } | null = null

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      if (event.content_block.type === 'tool_use') {
        currentToolUse = {
          id: event.content_block.id,
          name: event.content_block.name,
          inputJson: '',
        }
        yield {
          type: 'tool_use_start',
          toolUseId: event.content_block.id,
          toolName: event.content_block.name,
        }
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text }
      } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
        currentToolUse.inputJson += event.delta.partial_json
        yield {
          type: 'tool_input_delta',
          toolUseId: currentToolUse.id,
          partialJson: event.delta.partial_json,
        }
      }
    } else if (event.type === 'content_block_stop' && currentToolUse) {
      try {
        const input = JSON.parse(currentToolUse.inputJson) as Record<string, unknown>
        yield {
          type: 'tool_use_complete',
          toolUseId: currentToolUse.id,
          toolName: currentToolUse.name,
          input,
        }
      } catch {
        // Malformed tool input — skip silently
      }
      currentToolUse = null
    }
  }
}
