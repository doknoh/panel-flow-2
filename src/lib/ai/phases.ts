/**
 * phases.ts — Shared phase types and labels.
 *
 * This module is safe to import from client components.
 * It has NO dependency on the Anthropic SDK or any server-only modules.
 */

export type WritingPhase = 'ideation' | 'structure' | 'weave' | 'page_craft' | 'drafting' | 'editing' | 'art_prompts'

export const PHASE_LABELS: Record<WritingPhase, { short: string; full: string }> = {
  ideation: { short: 'IDE', full: 'Ideation' },
  structure: { short: 'STR', full: 'Structure' },
  weave: { short: 'WVE', full: 'Weave' },
  page_craft: { short: 'PGC', full: 'Page Craft' },
  drafting: { short: 'DFT', full: 'Drafting' },
  editing: { short: 'EDT', full: 'Editing' },
  art_prompts: { short: 'ART', full: 'Art Prompts' },
}
