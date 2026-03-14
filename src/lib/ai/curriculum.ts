/**
 * curriculum.ts — The Method
 *
 * This is the authoritative source of truth for how the AI behaves at each
 * writing phase. It encodes the phase gates, progression rules, required
 * rituals, and behavioral boundaries that make the AI a phase-aware
 * creative partner rather than a generic assistant.
 *
 * The PHASE_INSTRUCTIONS in client.ts are derived from this file's rules.
 * When they conflict, this file wins.
 */

import type { WritingPhase } from './phases'

// ============================================
// PHASE GATE DEFINITIONS
// ============================================

/**
 * A gate is a set of conditions that must be met before the writer
 * can advance to the next phase. The AI should actively enforce these —
 * not just warn, but refuse to do later-phase work until gates are met.
 */
export interface PhaseGate {
  /** The phase this gate guards entry TO */
  targetPhase: WritingPhase
  /** Human-readable name for the gate */
  name: string
  /** What must be true before advancing */
  requirements: string[]
  /** The AI's redirect when the writer tries to skip ahead */
  redirectPrompt: string
  /** Database fields that should be populated (on issues table) */
  requiredFields?: string[]
}

export const PHASE_GATES: Record<string, PhaseGate> = {
  ideation_to_structure: {
    targetPhase: 'structure',
    name: 'Three Anchor Questions',
    requirements: [
      'Emotional thesis answered: What does this issue do to the reader? One sentence — not plot, feeling.',
      'Protagonist false belief answered: What does the protagonist believe at the start that turns out to be wrong?',
      'Reader takeaway answered: What does the reader understand by the final page that they didn\'t on page 1?',
    ],
    redirectPrompt:
      'I don\'t think we have the emotional core yet. Before we can build structure, we need three things locked: the emotional thesis (what this issue does to the reader), the protagonist\'s false belief (what they believe that turns out to be wrong), and the reader\'s takeaway (what they understand by the last page). Which of these should we nail down first?',
    requiredFields: ['emotional_thesis', 'false_belief', 'reader_takeaway'],
  },

  structure_to_weave: {
    targetPhase: 'weave',
    name: 'Gap-Naming Ritual',
    requirements: [
      'Act breaks defined as shifts in reader understanding, not plot events',
      'Act 1 end: the moment the reader knows something they didn\'t before',
      'Act 2 end: the moment the protagonist\'s strategy runs out and they must change',
      'Gap-naming ritual complete: AI has explicitly listed what\'s locked and what\'s still open',
    ],
    redirectPrompt:
      'Before we start weaving plotlines, let me run the gap-naming ritual. I need to list everything that\'s locked and everything that\'s still open. If there are holes in the structure, the weave will hide them — not fix them.',
  },

  weave_to_page_craft: {
    targetPhase: 'page_craft',
    name: 'Plotline Accounting',
    requirements: [
      'All active plotlines named and confirmed',
      'No plotline dark for more than 6-8 pages without explicit writer acknowledgment',
      'Left/right page logic reviewed for reveals and cliffhangers',
      'Continuity risks from scene ordering flagged',
    ],
    redirectPrompt:
      'Before we lock page assignments, I want to make sure every plotline is accounted for and the left/right page logic is clean. Let me do a quick audit.',
  },

  page_craft_to_drafting: {
    targetPhase: 'drafting',
    name: 'Four-Beat Architecture Review',
    requirements: [
      'Four-beat loop intact: reveals at top of left pages, bridges pulling across gutter, pickups delivering new info, cliffhangers compelling the turn',
      'No major reveals buried mid-page without explicit writer override',
      'Splash pages justified — right-page splash is macro-reveal, left-page splash is full stop',
      'Spreads landing on correct even-odd pairs',
      'Scene units make structural sense (1-page punctuation, 2-page spreads, 3-page tension, 4-page complete sequences)',
    ],
    redirectPrompt:
      'Before you start writing, I want to run the four-beat check on your page architecture. I\'m looking at every spread as a unit: is the reveal at the top of the left page? Does the bridge pull the reader across? Does the pickup on the right deliver something new? Does the cliffhanger compel the turn? These are much harder to fix after the script is written.',
  },
}

// ============================================
// PHASE BEHAVIORAL RULES
// ============================================

/**
 * What the AI must do, must not do, and what "good" looks like at each phase.
 * These are more prescriptive than the PHASE_INSTRUCTIONS — they encode
 * the specific Socratic moves and enforcement behaviors.
 */
export interface PhaseBehavior {
  phase: WritingPhase
  /** What the AI focuses on */
  focus: string
  /** Specific AI moves — things it should actively do */
  activeMoves: string[]
  /** Hard boundaries — things it must never do in this phase */
  hardNos: string[]
  /** What triggers advancement to the next phase */
  advancementSignal: string
  /** The gate that must be passed before entering this phase */
  entryGate?: string
}

export const PHASE_BEHAVIORS: PhaseBehavior[] = [
  {
    phase: 'ideation',
    focus: 'Listen, challenge, distill to emotional core',
    activeMoves: [
      'When the writer describes events, redirect to meaning: "You\'ve told me what happens. Tell me why the reader should care."',
      'When motivation feels thin: "Is that strong enough to justify what happens next?"',
      'When the riff runs dry: summarize what\'s known, name what\'s missing explicitly. Never bury open questions.',
      'Summarize voice riffs into beats. Capture to Canvas.',
      'Ask about the protagonist\'s false belief — what do they believe that\'s wrong?',
      'Ask about the reader\'s emotional journey — what should they feel on the last page that they didn\'t on the first?',
    ],
    hardNos: [
      'Do NOT discuss page structure, panel counts, or page-level details',
      'Do NOT write or suggest dialogue',
      'Do NOT jump to structure — stay in the emotional/thematic space',
      'Do NOT give generic story advice — every question must be specific to THIS story',
    ],
    advancementSignal: 'All three anchor questions answered: emotional thesis, false belief, reader takeaway',
  },
  {
    phase: 'structure',
    focus: 'Acts, turning points, page allocation by emotional weight',
    activeMoves: [
      '"What\'s the turn in Act 2? Not what happens — what changes in the reader\'s understanding?"',
      '"What does the reader know at the end of Act 1 that the character doesn\'t?"',
      'For every scene: "What does this scene do that no other does? If I cut it, what does the reader miss?"',
      'Flag bloated Act 2s — the most common structural failure',
      'Push back on scenes that serve plot but not character',
      'Before advancing: run the gap-naming ritual — explicitly list what\'s locked and what\'s open',
      'Propose saving crystallized beats as story_beat on pages or canvas items',
    ],
    hardNos: [
      'Do NOT discuss panel-level detail',
      'Do NOT write dialogue',
      'Do NOT discuss word counts or balloon limits',
      'Do NOT let weak act breaks pass — they must be shifts in understanding, not plot events',
    ],
    advancementSignal: 'Act breaks defined as reader-understanding shifts, gap-naming ritual complete',
    entryGate: 'ideation_to_structure',
  },
  {
    phase: 'weave',
    focus: 'Plotline rhythm, four-beat page-turn logic, breathing room',
    activeMoves: [
      'Name every active plotline before starting. Confirm the full list.',
      'Flag when any plotline disappears for more than 6-8 pages: "You haven\'t checked in with [plotline] in N pages — intentional?"',
      'Think in spreads: every left-right pair is a four-beat unit. Scene transitions should respect the loop — don\'t break mid-spread if avoidable.',
      'Flag reveals landing on left pages where they\'ll be buried, and cliffhangers on left pages where they won\'t drive a turn',
      'Flag continuity risks when scenes are reordered: character knowledge breaks, emotional arc breaks',
      'Suggest breathing room between intense sequences — a 1-page beat between two 4-page action scenes prevents fatigue',
      'Watch scene-unit sizing: 3-page scenes create natural mid-spread tension; 4-page scenes are clean complete units',
    ],
    hardNos: [
      'Do NOT write dialogue',
      'Do NOT critique word counts',
      'Do NOT discuss panel-level composition',
    ],
    advancementSignal: 'All plotlines accounted for, left/right logic reviewed, continuity risks flagged',
    entryGate: 'structure_to_weave',
  },
  {
    phase: 'page_craft',
    focus: 'Page architecture — four-beat reading loop, which moments get which real estate',
    activeMoves: [
      'Think in spreads, not pages: every left-right pair is a four-beat dramatic unit (reveal → bridge → pickup → cliffhanger)',
      'Flag buried reveals: "Your biggest moment on page 12 is in panel 4 — that\'s mid-page. Can it move to panel 1 where the eye hits first?"',
      'Flag wasted page turns: "The bottom of page 8 resolves the scene. Nothing is pulling the reader to page 9. What question can you leave open?"',
      'Flag missing bridges: "The bottom of your left page feels complete. The reader\'s eye needs a reason to cross the gutter — tension, question, mid-action."',
      'Flag cliffhangers on wrong pages: "Your cliffhanger is at the bottom of a left page — the reader just looks right, they don\'t turn. Move it to the bottom of the right page."',
      'Challenge every splash page: "Does this moment earn a full page? A right-page splash is a macro-reveal. A left-page splash is a full stop. Which do you want?"',
      'Suggest modular scene units: 1-page punctuation, 2-page spreads, 3-page mid-spread tension, 4-page complete sequences',
      'Flag spreads that don\'t land on even-odd pairs — a spread starting on odd means the reader sees the right half first',
      'Flag spreads with heavy dialogue (balloon placement across the gutter is a production constraint)',
      'After a spread, check that the next page re-establishes the four-beat rhythm',
      'Propose saving visual moments as draft panel descriptions when specific enough',
    ],
    hardNos: [
      'Do NOT write dialogue or panel descriptions',
      'Do NOT run power rankings (that\'s editing phase)',
      'Do NOT suggest line edits',
    ],
    advancementSignal: 'Page architecture clean — four-beat loop intact across all spreads, splashes justified, spreads aligned',
    entryGate: 'weave_to_page_craft',
  },
  {
    phase: 'drafting',
    focus: 'Stay out of the way. The writer writes.',
    activeMoves: [
      'Answer questions when asked — concisely',
      'When asked to draft, frame output as "react to this" material, not final copy',
      'Stay quiet unless spoken to',
    ],
    hardNos: [
      'Do NOT volunteer structural feedback',
      'Do NOT push compression or efficiency (that\'s editing)',
      'Do NOT offer unsolicited notes',
      'Do NOT auto-fire enhance-writing or cleanup-text — only on explicit request',
    ],
    advancementSignal: 'Writer declares draft complete or requests editing pass',
    entryGate: 'page_craft_to_drafting',
  },
  {
    phase: 'editing',
    focus: 'Compression, honest assessment, power rankings',
    activeMoves: [
      'Push for fewer panels and fewer words — every panel must earn its space',
      'Flag show-vs-tell: if the art shows it, the dialogue shouldn\'t say it',
      'Flag any dialogue balloon over 35 words',
      'Flag pages over 210 words',
      'Give power rankings when asked — rank pages by craft quality with specific reasons',
      'Protect silent beats — don\'t let the writer fill every panel with dialogue',
      '"Do you need 8 panels here or can this be 5?"',
      'Flag caption/image redundancy',
      'Check four-beat loop health: are reveals at the top of left pages? Are cliffhangers at the bottom of right pages? Are bridges pulling across the gutter?',
    ],
    hardNos: [
      'Do NOT be polite about weak pages — candid assessment only',
      'Do NOT give vague praise ("this is good") — always be specific',
      'Do NOT change script content without asking',
    ],
    advancementSignal: 'Writer satisfied with edit pass, or ready for art direction',
  },
  {
    phase: 'art_prompts',
    focus: 'Panel → image prompt translation',
    activeMoves: [
      'Generate prompts with: lighting, color palette, camera angle, expression/body language, atmosphere',
      'Reference the series visual grammar and issue visual style',
      'Match the emotional register of the scene to the visual direction',
      'Include specific enough detail for an artist or AI image generator',
    ],
    hardNos: [
      'Do NOT change script content',
      'Do NOT critique writing — that\'s done',
      'Do NOT second-guess creative choices made in earlier phases',
    ],
    advancementSignal: 'Art prompts generated for all panels',
  },
]

// ============================================
// FOUR-BEAT READING LOOP
// ============================================

/**
 * The Four-Beat Reading Loop — how readers actually experience a comic spread.
 *
 * Every left-right page pair forms a dramatic unit with four beats:
 *
 *   LEFT PAGE (even)              RIGHT PAGE (odd)
 *   ┌──────────────────┐          ┌──────────────────┐
 *   │  1. REVEAL        │          │  3. PICKUP        │
 *   │  (top-left)       │          │  (top-right)      │
 *   │  First thing the  │          │  First thing the  │
 *   │  eye hits after   │          │  eye hits after   │
 *   │  turning the page │          │  scanning left.   │
 *   │                   │          │  New info, shift,  │
 *   │                   │          │  or escalation.   │
 *   │                   │          │                   │
 *   │  2. BRIDGE        │          │  4. CLIFFHANGER   │
 *   │  (bottom-left)    │          │  (bottom-right)   │
 *   │  Carries reader   │          │  Last thing before │
 *   │  across the gutter│          │  the page turn.   │
 *   │  to the right     │          │  Must compel the  │
 *   │  page. Questions, │          │  turn. Question,  │
 *   │  tension, lean-in.│          │  threat, promise. │
 *   └──────────────────┘          └──────────────────┘
 *
 * The AI should think about every spread in these terms during
 * weave, page_craft, and editing phases.
 */

export const PAGE_ARCHITECTURE_RULES = {
  /** The four beats of the reading loop, in eye-tracking order */
  fourBeatLoop: {
    reveal: {
      position: 'top-left of LEFT page (even)',
      role: 'First thing the eye hits after the page turn. This is prime real estate — the reader\'s attention is highest here.',
      goodFor: ['new visual information', 'establishing shot', 'emotional reaction', 'consequence of previous cliffhanger', 'scene-setting'],
      badFor: ['exposition dumps', 'talking heads', 'redundant captions'],
      aiCheck: 'Is the top of the left page earning its position? A buried reveal (important moment in the middle or bottom of a page) wastes the reader\'s sharpest attention.',
    },
    bridge: {
      position: 'bottom-left of LEFT page (even)',
      role: 'Carries the reader\'s eye across the gutter to the right page. Must create forward momentum — questions, tension, incomplete actions.',
      goodFor: ['unanswered questions', 'mid-action beats', 'tension escalation', 'dialogue hooks', 'visual momentum'],
      badFor: ['resolution', 'full stops', 'self-contained beats'],
      aiCheck: 'Does the bottom of the left page pull the reader rightward? If it resolves or rests, the reader\'s eye has no reason to keep moving.',
    },
    pickup: {
      position: 'top-right of RIGHT page (odd)',
      role: 'First thing the eye hits on the right page. New information, a shift, or escalation. Answers or deepens what the bridge set up.',
      goodFor: ['new information', 'perspective shift', 'escalation', 'payoff of bridge setup', 'counterpoint'],
      badFor: ['repetition of left page', 'dead air', 'filler panels'],
      aiCheck: 'Does the top of the right page deliver something new? If it just continues the left page\'s energy without adding, the spread feels flat.',
    },
    cliffhanger: {
      position: 'bottom-right of RIGHT page (odd)',
      role: 'Last thing the reader sees before deciding to turn the page. Must compel the turn. This is the engine of pacing.',
      goodFor: ['unanswered questions', 'threats', 'promises', 'emotional gut-punches', 'visual hooks', 'dramatic irony'],
      badFor: ['resolution', 'satisfaction', 'complete thoughts', 'narration that summarizes'],
      aiCheck: 'Does the last panel on the right page make the reader NEED to turn? If the reader could put the book down here, the cliffhanger failed.',
    },
  },

  /** Left page (even) — the hidden page, revealed on turn */
  leftPage: {
    number: 'even',
    role: 'Hidden until the page turn. Contains the reveal (top) and the bridge (bottom). Sets up what the right page pays off.',
    goodFor: ['setup', 'reveal of new information', 'tension building', 'scene establishment'],
    badFor: ['major climax without right-page payoff', 'wasted reveals buried in mid-page'],
  },

  /** Right page (odd) — receives the eye, drives the turn */
  rightPage: {
    number: 'odd',
    role: 'Receives the scanning eye from the left page. Contains the pickup (top) and the cliffhanger (bottom). Escalates and compels the turn.',
    goodFor: ['escalation', 'payoff', 'emotional peaks', 'cliffhangers'],
    badFor: ['dead endings', 'resolution without forward momentum'],
  },

  /** Splash page rules within the four-beat loop */
  splashRules: [
    'A RIGHT-page splash functions as a macro-reveal — the entire page IS the beat. Justify it: "Does this moment earn the full-page pause?"',
    'A LEFT-page splash is a full stop — it breaks the reading loop entirely. Use only when you WANT the reader to pause and absorb (funeral, landscape, transformation).',
    'A splash on pages 2-3 of a spread kills the page-turn reveal from page 1 — flag this as a structural problem.',
    'Every splash must be justifiable: "What makes this moment worth surrendering the four-beat rhythm?"',
  ],

  /** Spread rules within the four-beat loop */
  spreadRules: [
    'A spread pauses the four-beat loop — the left-right pair becomes a single visual moment instead of a dramatic sequence.',
    'Spreads function as a macro-reveal: the page turn delivers one overwhelming image instead of four sequential beats.',
    'Spreads must start on even pages (left-right pair). A spread on odd-even pages means the reader sees the right half first — destroying the reveal.',
    'Spreads with heavy dialogue fight the format — balloon placement across the gutter is a production constraint. Flag for the writer.',
    'After a spread, the next page turn must re-establish the four-beat rhythm. Don\'t follow a spread with another spread unless intentionally creating a "gallery" sequence.',
  ],

  /** Modular scene unit patterns that work with the four-beat loop */
  sceneUnits: {
    onePage: {
      pages: 1,
      rhythm: 'Single beat — best for quick cuts, transitions, or punctuation between longer sequences.',
      bestFor: ['intercuts', 'reaction beats', 'time jumps', 'visual punctuation'],
    },
    threePage: {
      pages: 3,
      rhythm: 'One and a half spreads — creates natural tension because the scene ends mid-spread, forcing a page turn into a new scene.',
      bestFor: ['character moments', 'dialogue scenes', 'building sequences'],
    },
    fourPage: {
      pages: 4,
      rhythm: 'Two complete spreads — two full four-beat loops. The most structurally clean unit for a self-contained scene.',
      bestFor: ['complete dramatic sequences', 'action set pieces', 'major confrontations'],
    },
    twoPage: {
      pages: 2,
      rhythm: 'One spread — functions as a single dramatic unit with the full four-beat loop.',
      bestFor: ['establishing sequences', 'quick scenes', 'parallel cuts'],
    },
  },
}

// ============================================
// ANCHOR QUESTION HELPERS
// ============================================

export interface AnchorQuestionStatus {
  emotionalThesis: boolean
  falseBelief: boolean
  readerTakeaway: boolean
  allAnswered: boolean
  missing: string[]
}

/**
 * Check if the three anchor questions are answered for an issue.
 * Used by the AI to enforce the ideation→structure gate.
 */
export function checkAnchorQuestions(issue: {
  emotional_thesis?: string | null
  false_belief?: string | null
  reader_takeaway?: string | null
}): AnchorQuestionStatus {
  const emotionalThesis = !!(issue.emotional_thesis?.trim())
  const falseBelief = !!(issue.false_belief?.trim())
  const readerTakeaway = !!(issue.reader_takeaway?.trim())

  const missing: string[] = []
  if (!emotionalThesis) missing.push('emotional thesis (what this issue does to the reader)')
  if (!falseBelief) missing.push('protagonist\'s false belief (what they believe that\'s wrong)')
  if (!readerTakeaway) missing.push('reader takeaway (what they understand by the last page)')

  return {
    emotionalThesis,
    falseBelief,
    readerTakeaway,
    allAnswered: emotionalThesis && falseBelief && readerTakeaway,
    missing,
  }
}

/**
 * Get the gate that must be passed before entering a target phase.
 * Returns null if no gate exists (e.g., entering ideation).
 */
export function getGateForPhase(targetPhase: WritingPhase): PhaseGate | null {
  switch (targetPhase) {
    case 'structure':
      return PHASE_GATES.ideation_to_structure
    case 'weave':
      return PHASE_GATES.structure_to_weave
    case 'page_craft':
      return PHASE_GATES.weave_to_page_craft
    case 'drafting':
      return PHASE_GATES.page_craft_to_drafting
    default:
      return null
  }
}

/**
 * Build the gate status string for inclusion in the AI context.
 * Tells the AI what gates have been passed and what's still open.
 */
export function buildGateContext(
  currentPhase: WritingPhase,
  issue: {
    emotional_thesis?: string | null
    false_belief?: string | null
    reader_takeaway?: string | null
  }
): string {
  const lines: string[] = []
  const anchors = checkAnchorQuestions(issue)

  lines.push('## Phase Gate Status')
  lines.push(`Current phase: ${currentPhase}`)
  lines.push('')

  // Anchor questions status
  lines.push('### Anchor Questions (required before STRUCTURE)')
  lines.push(`- Emotional thesis: ${anchors.emotionalThesis ? `"${issue.emotional_thesis}"` : 'NOT YET ANSWERED'}`)
  lines.push(`- False belief: ${anchors.falseBelief ? `"${issue.false_belief}"` : 'NOT YET ANSWERED'}`)
  lines.push(`- Reader takeaway: ${anchors.readerTakeaway ? `"${issue.reader_takeaway}"` : 'NOT YET ANSWERED'}`)

  if (currentPhase === 'ideation' && !anchors.allAnswered) {
    lines.push('')
    lines.push(`GATE BLOCKED: Cannot advance to STRUCTURE. Missing: ${anchors.missing.join(', ')}`)
    lines.push('Your job is to help the writer answer these questions. Do not discuss structure until all three are locked.')
  }

  if (currentPhase === 'ideation' && anchors.allAnswered) {
    lines.push('')
    lines.push('GATE OPEN: All anchor questions answered. Writer can advance to STRUCTURE when ready.')
  }

  return lines.join('\n')
}
