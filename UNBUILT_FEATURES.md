# Unbuilt Features — Gap Analysis

These 9 features were in the original CLAUDE.md spec (or identified during development) but haven't been fully implemented. Each section details what was planned, what exists today, and what's missing so you can decide if it's worth building.

---

## 1. Spread/Mirror Page Auto-Linking

### What was spec'd
When a writer creates a double-page spread, the system should automatically create two linked pages that move as a unit. Mirror pages (two pages designed to visually echo each other) should work the same way. Spreads must land on even-odd pairs (left-right). If a spread starts on an odd page, the system warns and suggests a fix. Export should render spreads as `PAGES [N]-[N+1] (DOUBLE-PAGE SPREAD)` and mirrors with an artist note.

### What exists today
- **Schema:** `page_type` column supports `SINGLE`, `SPLASH`, `SPREAD_LEFT`, `SPREAD_RIGHT`. A `linked_page_id` FK exists. A `validate_spread_link()` trigger ensures SPREAD_LEFT links to SPREAD_RIGHT and vice versa.
- **UI:** `PageTypeSelector.tsx` has a dropdown with all 4 types and a modal to manually link two pages as a spread. You can also set the type without linking.
- **Drag:** Pages are dragged individually in the Weave view. Linked spread pages do NOT move together.
- **Export:** All three export functions (PDF, DOCX, TXT) have zero spread/mirror awareness. Every page renders as `PAGE [N] (orientation)` regardless of type.

### What's missing
| Gap | Impact |
|-----|--------|
| **MIRROR page types** — no schema value, no UI option, no export handling | Writers can't mark mirror pages at all |
| **Auto-create paired page** — creating a SPREAD_LEFT doesn't auto-create the SPREAD_RIGHT | Writer must manually create and link both pages |
| **Co-movement during drag** — spread pages move independently in Weave | Reordering can split a spread across non-adjacent positions |
| **Even-odd pair validation** — no warning if spread lands on wrong pages | Spread could end up on two left pages |
| **Export formatting** — no `PAGES [N]-[N+1] (DOUBLE-PAGE SPREAD)` header | Artist doesn't see spread/mirror designation in exported script |

### Recommendation context
Spreads and mirrors are structural tools that matter for the artist. The current manual-link workflow functions but is fragile. The biggest practical gap is the export formatting — if the artist can't see spread designations in the script, they might miss them.

---

## 2. Mobile Voice Ideation

### What was spec'd
A dedicated mobile "Voice Mode" screen integrated with WhisperFlow (the writer's existing voice-to-text tool). The writer opens the app on mobile, selects a project/issue, enters Voice Mode, sees current issue context and an AI chat interface with a voice input button. Speak → transcribe → AI responds → read → speak again. Any AI response can be saved to Project Notes.

### What exists today
- **Nothing.** Zero voice/microphone/WhisperFlow code anywhere in the codebase.
- The IssueEditor has a mobile-responsive tab layout (NAV/EDITOR/TOOLKIT tabs on small screens), but this is just responsive design for the existing editor — not a voice ideation mode.
- The Guided Mode (`/series/[seriesId]/guide`) handles the AI conversation part of this workflow but with text input only.

### What's missing
| Gap | Impact |
|-----|--------|
| **Voice input integration** — no Web Speech API, MediaRecorder, or WhisperFlow hook | Writer can't dictate ideas into the app |
| **Dedicated mobile voice screen** — no simplified mobile UI for voice + AI | Mobile ideation requires typing, defeating the purpose |
| **Transcription pipeline** — no audio → text processing | No way to convert voice riffs into structured text |

### Recommendation context
The writer's ideation process involves 8-10 minute voice riffs. Currently this happens outside the app (WhisperFlow → paste transcript → Guided Mode). The question is whether to build native voice capture or keep the external tool workflow. WhisperFlow already produces good transcripts — the value-add of in-app voice would be the seamless context (the AI already has the project loaded) and the ability to save insights directly. A lighter alternative: a "Paste Transcript" button in Guided Mode that formats voice dumps for the AI.

---

## 3. Contextual Tooltips (Motifs & Speech Patterns)

### What was spec'd
When the cursor is in a visual description field, a small icon appears that expands to show the current issue's motifs. When the cursor is in a dialogue field with a character selected, hovering shows that character's speech patterns. Present but not intrusive.

### What exists today
- **Motifs** are displayed in the Toolkit sidebar as a static section of issue context. Always visible when the sidebar is open, regardless of cursor position.
- **Speech patterns** exist as data on character records (`speech_patterns` field). Character voice profiles have a dedicated page (`/characters/[characterId]/voice`). But no tooltip or popup appears in the dialogue editor when a speaker is selected.
- The editor's `onFocus` handlers only trigger undo tracking, not contextual display.

### What's missing
| Gap | Impact |
|-----|--------|
| **Cursor-triggered motif tooltip** on description fields | Writer must open sidebar to check motifs while writing descriptions |
| **Speaker-triggered speech pattern tooltip** on dialogue fields | Writer must navigate to character page to check voice patterns |
| **Non-intrusive overlay UI** — small icon that expands on hover | No contextual reminders exist in the editor flow |

### Recommendation context
This is a "nice to have" quality-of-life feature. The information IS accessible — just not contextually. The writer has to context-switch (open sidebar, navigate to character page) rather than getting a quick reminder in-flow. The question is whether context-switching is enough friction to justify building this, or whether the sidebar already serves the purpose. The TipTap integration makes this more feasible now — you could use TipTap's BubbleMenu or FloatingMenu extensions to show contextual info near the cursor.

---

## 4. Scene Header Context Bar

### What was spec'd
When entering a page, a persistent header shows:
```
Page 12 (left) · Act II · Tracy subplot · 4 of 6 pages in scene
```
Orients the writer without requiring them to hold structural position in memory.

### What exists today
- **PageEditor.tsx** (lines 1298-1317) renders a context breadcrumb above the page header showing: `ACT [N] // [plotline name] // [X] OF [Y] IN SCENE`
- **PreviousPageContext.tsx** shows a collapsible summary of the previous page's content (panels, descriptions, dialogue) — beyond what was spec'd.

### What's missing
| Gap | Impact |
|-----|--------|
| **Page orientation** not in the breadcrumb line | Shown separately in the page header, but not in the context line |
| **Scene title** not shown | Only plotline name appears; scene title is absent from the breadcrumb |

### Recommendation context
This is **largely built**. The breadcrumb shows act, plotline, and page position within scene. The gaps are minor formatting differences. This could be considered done with a small tweak to add orientation and scene title to the breadcrumb.

---

## 5. Export Options Modal

### What was spec'd
Export to PDF or Google Doc with options: Include Summary (Yes/No), Include Artist Notes (Yes/No), Include Internal Notes (Never). An `ExportModal.tsx` component with format selection and toggles.

### What exists today
- **Three export formats:** PDF (`exportPdf.ts`), DOCX (`exportDocx.ts`), and TXT (`exportTxt.ts`).
- The export functions accept option parameters (`includeNotes`, `authorName`, etc.) in their signatures.
- **No export modal.** The IssueEditor has a dropdown menu with three items (PDF, Word Doc, Plain Text) that immediately trigger export with default settings.
- **No Google Docs API integration.** DOCX file download instead (universally compatible with Google Docs, Word, etc.).

### What's missing
| Gap | Impact |
|-----|--------|
| **Export options modal** — no UI to toggle summary, artist notes, etc. | Writer can't customize what's included in export |
| **Include Summary toggle** — always included (or always excluded) | No control over whether TL;DR appears at top |
| **Include Artist Notes toggle** — parameter exists in code but not wired to UI | Notes always exported (or never), depending on default |
| **Native Google Doc** — DOCX substituted | Writer must open .docx in Google Docs manually; no direct "Save to Drive" |

### Recommendation context
The DOCX substitution is fine — .docx opens natively in Google Docs and maintains formatting. The real gap is the options modal. The export function signatures already accept the toggles; this is purely a UI wiring task. A simple modal with checkboxes would close this gap in an afternoon.

---

## 6. Writer Insights (Guided Mode Extraction)

### What was spec'd
After meaningful Guided Mode conversations, the AI extracts structured insights about the writer:
```typescript
interface WriterInsight {
  insight_type: 'preference' | 'strength' | 'pattern' | 'trigger'
  category: string        // 'motivation', 'arc', 'theme', etc.
  description: string
  confidence: number      // 0.0-1.0
  evidence_session_ids: string[]
}
```
Insights with confidence ≥ 0.6 are saved. These feed into every AI interaction for personalized guidance.

### What exists today
- **Schema matches the spec exactly.** `writer_insights` table with all specified columns plus `updated_at`.
- **Writing works.** The `/api/guide/extract` route correctly parses AI-extracted insights, filters by confidence ≥ 0.6, and inserts into the table.
- **Reading is broken.** `writer_insights` is never queried anywhere in the codebase. The AI context assembler (`context-assembler.ts`) reads from `writer_profiles` (a separate table with a narrative portrait of the writer) — NOT from `writer_insights`.
- **Two parallel systems:** `writer_insights` (structured, per-session, spec'd) and `writer_profiles` (narrative, synthesized, not spec'd) both exist but don't talk to each other.

### What's missing
| Gap | Impact |
|-----|--------|
| **No read-back of insights** — inserted but never queried | Extracted insights are dead data |
| **Not fed into AI context** — context assembler reads `writer_profiles`, not `writer_insights` | AI doesn't benefit from Guided Mode extractions |
| **No UI to view/manage insights** — no page to see what's been extracted | Writer can't review or correct AI's observations |

### Recommendation context
This is a data pipeline gap. The extraction works, the storage works, but the loop isn't closed. Two options: (A) Wire `writer_insights` into the AI context assembler alongside `writer_profiles`, or (B) feed `writer_insights` into the `writer_profiles` synthesis so they inform the narrative portrait. Option B is probably cleaner since the narrative portrait is already being used effectively.

---

## 7. Outline-Script Divergence Detection

### What was spec'd
The system passively compares outline to scripts and flags specific divergences: "Outline says X happens in Act II, but script doesn't include this." The writer can update outline, update script, or dismiss the flag.

### What exists today
- **"Sync from Scripts" button** in OutlineView.tsx triggers AI analysis of all issue scripts.
- AI generates proposed outline metadata (summary, themes, act beat summaries).
- A **diff view modal** shows current vs. proposed values side-by-side with checkboxes to cherry-pick updates.
- Changes are applied to the database when confirmed.

### What's missing
| Gap | Impact |
|-----|--------|
| **Passive/automatic detection** — requires manual "Sync" click | Writer doesn't know outline is stale until they check |
| **Specific divergence callouts** — shows old vs. new text, not "X is missing" | Writer sees a diff, not actionable flags |
| **Bidirectional sync** — only script → outline | Can't push outline changes down to scripts |
| **Dismiss mechanism** — no way to mark known divergences as intentional | Would re-flag every time sync is run |

### Recommendation context
The existing "Sync from Scripts" is genuinely useful and covers the most common case (outline gets stale as scripts evolve). The missing pieces are about automation (detect drift without manual trigger) and specificity (flag individual divergences rather than showing a full diff). The bidirectional sync (outline → script) is architecturally complex since outlines are summaries, not source material. The spec's "The Script Is Truth" principle suggests script → outline is the right direction anyway. A realistic next step would be adding a staleness indicator ("Outline last synced 3 days ago, 12 pages changed since") rather than full passive detection.

---

## 8. Weave Draft-Mode / Commit Flow

### What was spec'd
The Weave view has two modes:
- **Edit Mode (Draft):** Drag scene blocks to reorder freely. Visual guides show drop targets. Page numbers preview in real-time. Conflicts highlighted. **Nothing saves until "Commit."**
- **Commit:** Click "Commit Changes" → system shows a continuity report (pages that changed orientation, reveals now on wrong page side, plotline gap warnings, continuity issues). Writer confirms or cancels. On confirm → changes save and propagate.

### What exists today
- **Full drag-and-drop reordering** works via `@dnd-kit` in WeaveView.tsx.
- **Immediate optimistic save:** Every drag instantly updates local state AND fires a background database save. No draft mode, no commit step.
- Page numbers recalculate in real-time during drag (via `renumberPages.ts`).

### What's missing
| Gap | Impact |
|-----|--------|
| **Draft mode** — changes save immediately, no undo/revert | Writer can't experiment freely and cancel |
| **Commit button** — no confirmation step | No checkpoint before structural changes propagate |
| **Continuity report** — no analysis on commit | Writer doesn't see what broke (orientation changes, reveal alignment, plotline gaps) |
| **Conflict highlighting** — no visual warnings during drag | Spread landing wrong, reveal on wrong side not surfaced |
| **Cancel/revert** — no way to undo a weave session | Must manually undo each drag |

### Recommendation context
The immediate-save pattern works fine for small adjustments but violates the spec's "Draft Mode → Commit" design principle. The real value is the continuity report — knowing what structural consequences your reordering has before committing. Without it, the writer might accidentally break reveal placement or split a spread. The question is whether this matters enough to build given the app's undo system. If undo can roll back weave changes, the practical impact is lower. But the continuity report itself (orientation changes, reveal alignment) would be valuable regardless of the save pattern.

---

## 9. Four-Beat Page Craft UI Validation

### What was spec'd
The four-beat reading loop (reveal → bridge → pickup → cliffhanger) is now encoded in `curriculum.ts` as the AI's craft framework for evaluating page architecture. The AI knows these rules and applies them during Page Craft, Weave, and Editing phases. But the UI has no visual representation of this framework — no warnings, no beat labels, no structural analysis.

### What exists today
- **AI knowledge:** `curriculum.ts` contains the full four-beat framework with `PAGE_ARCHITECTURE_RULES.fourBeatLoop`, splash/spread rules, and modular scene unit patterns. The AI uses these during conversation.
- **Page `story_beat` field:** The `pages` table has a `story_beat` column that could store which beat a page represents, but it's not populated or displayed in a four-beat context.
- **WeaveView:** Shows scene blocks as colored bars on a page timeline. No beat analysis, no four-beat loop visualization.
- **PageEditor:** Shows page number and orientation (LEFT/RIGHT) but no beat position within the spread.

### What's missing
| Gap | Impact |
|-----|--------|
| **Beat position labels in PageEditor** — no indicator showing "this is the REVEAL page" or "this is the CLIFFHANGER page" | Writer doesn't see four-beat context while writing |
| **story_beat warnings** — if a page's `story_beat` is "reveal" but it's at the bottom of the page, no warning fires | Writer can't see structural misalignment |
| **WeaveView four-beat overlay** — no visual layer showing reveal/bridge/pickup/cliffhanger positions across the issue | Writer can't see the reading loop rhythm at a glance |
| **Spread-level analysis** — no grouping of left-right pairs as dramatic units | Each page is treated independently in the UI |
| **Scene unit sizing indicators** — no visual feedback on whether scene page counts form clean modular units (1, 2, 3, or 4 pages) | Writer can't see rhythm fragmentation |

### Recommendation context
The AI already enforces these rules in conversation — it will flag buried reveals, wasted page turns, and broken cliffhangers when the writer is in Page Craft or Editing phase. The question is whether the UI should also surface this visually. The highest-impact addition would be a simple spread-level indicator in the WeaveView: group pages into left-right pairs and label the four beats. This would let the writer see the reading loop rhythm across the whole issue at a glance, complementing what the AI says in conversation. The PageEditor beat labels would be lower priority since the AI already provides this feedback contextually.
