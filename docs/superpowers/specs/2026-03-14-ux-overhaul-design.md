# Panel Flow UX Overhaul — Design Spec

**Date:** 2026-03-14
**Approach:** Hybrid (C) — immediate comfort fixes, then foundation for larger features
**Priority Order:** Ship 1-2 fast, then build infrastructure for 3-6

---

## 1. Font Size & Readability Controls

**Problem:** Light fonts cause eye strain. No way to adjust text size.

**Solution:** Global font scale setting (Small / Medium / Large) accessible from the app header, next to theme toggle.

**Implementation:**
- Three presets set a CSS custom property on `<html>`: `--font-scale: 1.0 | 1.15 | 1.3`
- All UI text inherits from this variable: button labels, dropdown text, toolbar icons, breadcrumbs, modal content, sidebar labels, navigation tree, editor fields, panel cards, dialogue blocks
- Persisted in `localStorage` (display preference, no database needed)
- Does NOT affect: app logo, export formatting (stays fixed to spec)

**Font scaling mechanism:** Set `font-size` on `<html>` using the scale variable (e.g., `font-size: calc(16px * var(--font-scale))`). Convert all editor CSS from `px` to `rem` so they scale naturally. Current hardcoded values in `globals.css`:
- `.script-editor .ProseMirror`: 14px → 0.875rem
- `.script-editor--dialogue .ProseMirror`: 13px → 0.8125rem
- `.script-editor--sfx .ProseMirror`: 13px → 0.8125rem

All other Tailwind `text-sm`, `text-base`, `text-xs` classes already use rem units and will scale automatically when the root font-size changes. This is the cleanest approach for Tailwind 4.

---

## 2. Sequential Reading & Editing Flow

**Problem:** Reading through an issue page-by-page is the primary near-term workflow. Current editor requires too many clicks and provides insufficient context for sustained reading sessions.

### 2a. Keyboard-Driven Page Flow
- Subtle crossfade transition (150ms) on page navigation (Cmd+Up/Down) instead of hard swap
- Tab from last panel on a page advances to first panel of next page
- Persistent position indicator in editor header: "Page 12 of 38 — Act 2, Scene 3"

### 2b. Glance-Back Context
- **Quick peek:** Replaces the existing Alt+Arrow toggle peek (`IssueEditor.tsx` line ~852). New behavior: Cmd+Shift+Left/Right shows the previous/next page as a translucent overlay while held, dismisses on key release. This avoids conflict with macOS Alt menu shortcuts and the existing Alt+Arrow implementation. The existing `peekPageId` state can be reused — the change is from toggle to hold-to-show.
- **Floating reference:** Alt+Click any page in nav tree to open it in a floating read-only panel alongside current page. Dismiss with Escape. Lightweight precursor to full dual-page view.

### 2c. Edit-in-Place Friction Reduction
- **Navigate mode:** The page editor container gets a `tabIndex={0}` and captures arrow key events when no TipTap editor is focused. Up/Down arrows move a visible focus ring between panel cards. Enter focuses the first editable field (visual description) inside the highlighted panel — at which point TipTap takes over arrow key handling for cursor movement. Escape blurs the TipTap editor and returns focus to the panel container (navigate mode). This is the same pattern as VS Code's list/editor focus split.
- **Field cycling within a panel:** Tab moves through fields within a panel (description → dialogue 1 → dialogue 2 → ... → captions → sfx → notes). Shift+Tab goes backward. Tab from the last field in a panel moves to the next panel's first field.
- **Auto-advance:** After blurring a field (finishing an edit), focus moves to the next logical field rather than nowhere.

---

## 3. Dual-Page View

**Problem:** Comics are read in left-right pairs. Spreads need simultaneous editing. Issue 4's mirrored parallel sequences (8 pairs across 16 pages — Stan/Marshall vs. Michael/Karen) require panel-level side-by-side comparison.

### 3a. Spread Mode
- Pages marked SPREAD_LEFT / SPREAD_RIGHT auto-open together when navigating to either one
- Both pages fully editable side by side
- Driven by existing `linked_page_id` field — no new data model

### 3b. Mirror Mode

**Data model:** New column `mirror_page_id UUID REFERENCES pages(id)` on the `pages` table, nullable. Bidirectional — both pages in a pair point at each other (same pattern as `linked_page_id` for spreads). A validation trigger ensures: (a) a page cannot mirror itself, (b) mirror pairs are reciprocal, (c) a page cannot be both a spread partner and a mirror simultaneously. Migration adds the column + trigger + index.

**Behavior:**
- User manually links mirror pairs via the PageTypeSelector or a new "Link mirror" action in the nav tree context menu
- When viewing a mirrored pair, panels align horizontally: panel 1 left beside panel 1 right, panel 2 left beside panel 2 right
- Visual diff indicators with concrete criteria:
  - **Green:** Same panel count AND same `characters_present` set on corresponding panels
  - **Yellow:** Different panel count, OR corresponding panels have different `characters_present`, OR one panel has dialogue while its mirror does not
  - Indicators shown per-panel-pair, not per-page

### 3c. Ad-Hoc Compare
- The Alt+Click floating panel from 2b can be promoted to full split view via "expand to split" button
- Compare any two arbitrary pages side by side, both editable

### Layout
- Editor column splits into two independently-scrolling panes. Nav tree highlights both active pages.
- Toggle for vertical stacking on smaller screens or when toolkit is open
- No three-page view. Two is the unit of comics.
- AI may suggest mirror pairs during Socratic sessions in the future; for now, manual linking only.

---

## 4. Socratic → Scaffold Pipeline

**Problem:** Productive AI sessions generate structural decisions and creative material that sits in the chat log unless the writer manually extracts it. The editor presents blank boxes instead of AI-drafted starting points.

### 4a. Real-Time Capture During Socratic Sessions
- Updated system prompt and phase logic so AI actively proposes placements as decisions crystallize: "That sounds like the beat for page 8 — want me to save it?"
- On confirmation, AI executes existing tools immediately (`update_scene_metadata`, `draft_panel_description`, `save_canvas_beat`, etc.)
- Running sidebar tally of captured output: "4 story beats placed, 2 scene descriptions updated, 1 new character created"

### 4b. Post-Session Extraction Sweep
- "Harvest" button (or triggered on session end) causes AI to review full conversation
- Identifies actionable material not captured in real-time
- Batch review UI: items grouped by type (story beats, scene descriptions, panel drafts, project notes, character insights), each with proposed destination
- Writer approves, rejects, or redirects each item
- Approved items written to database in one pass

### 4c. Page Scaffolding from Beats
- New action: "Draft panels from beats" — available per-page or for a range of pages
- AI reads story beat, scene context, characters involved, and writer profile
- Generates draft panel descriptions at adaptive density:
  - Sparse/directional when beat is high-level
  - Fuller when beat includes specific visual cues from Socratic session
- Draft content visually distinct in editor: different background color + "DRAFT" badge
- Badge disappears once writer edits the field
- Dialogue only drafted if Socratic session produced specific lines; otherwise left empty

### 4d. Implementation Notes
- **4b API:** Post-session extraction uses a new `/api/guide/harvest` route. It receives the conversation ID, loads messages from `guided_messages`, and sends them to Claude with an extraction-focused system prompt. Token budget: conversation content only (no full project context needed since we're extracting, not generating). Batch review UI is an inline section at the bottom of the guide view, not a modal.
- **4c fallback:** If "Draft panels from beats" is triggered on a page with no `story_beat`, the AI falls back to scene-level context (scene title, plotline, characters, location). If the scene also has no metadata, the action is disabled with a tooltip: "Add a story beat or scene description first."
- **4c conflicts:** If a page already has panel content, "Draft panels" is disabled. The writer must clear existing panels first (with undo support) or use the per-panel `draft_panel_description` tool for individual empty panels.

### Constraints
- Never overwrites existing writer content
- Never drafts without explicit trigger (no surprise auto-generation)
- Draft badges are visual only — no "AI content" flag in database. Once edited, it's yours.

---

## 5. Import Pipeline Polish

**Problem:** Post-import cleanup required extensive manual/SQL work for character linking, name normalization, and structural enrichment. Focused on current user + a few friends, not mass-market.

### 5a. Character Resolution UI Improvements
- **Searchable character dropdown** in mapping step — type-to-filter instead of scrolling
- **Alias-aware matching** — import checks `aliases[]` array on existing characters, not just `name` and `display_name`
- **Confidence indicators** — green (exact match), yellow (alias/fuzzy match, confirm?), red (no match, create new?)
- **Bulk actions** — "Confirm all green matches" and "Create all unmatched as new characters" buttons

### 5b. Post-Import Enrichment Checklist
- Shown after import completes, before entering editor
- Status items:
  - Characters linked: X/Y (N need attention) → click to resolve
  - Plotlines assigned: 0/N scenes → click to open weave view
  - Visual descriptions capitalized: status
  - Story beats populated: 0/N pages → "Want AI to suggest beats from script content?"
- Dismissable — not a blocker, just surfaces the enrichment gap

### 5c. Batch Character Operations
- **Rename everywhere:** Updates the character record's `display_name` (or `name`), then propagates in two passes:
  1. **dialogue_blocks:** Updates `speaker_name` to `UPPER(new_display_name)` on all rows where `character_id` matches. Rows with NULL `character_id` are not touched (they're unlinked and the old speaker name may refer to someone else).
  2. **visual_description:** Uses `regexp_replace` to swap the old ALL CAPS name for the new ALL CAPS name (word-boundary-safe) across all panels in the series.
  This is the FK-based approach — safe because it only touches rows already linked to the character. One action in the UI.
- Merge already exists via MergeModal. No changes needed.

### Constraints
- No new format detection patterns (8 formats sufficient)
- No screenplay-to-comic auto-conversion
- No multi-file import (one issue at a time)

---

## 6. Active Writer Learning System

**Problem:** The writer profile exists but is a passive personality modifier. It should actively improve AI draft quality over time by learning the writer's specific patterns.

### 6a. What It Learns
- **Panel density preferences** — average panels per page, variance by scene type (action vs. quiet)
- **Description style** — camera direction vocabulary, visual language patterns ("Close on," "Wide shot of," "POV")
- **Dialogue-to-description ratio** — balance per page, variance by scene type
- **Escalation patterns** — how tension builds across sequences (pacing, recurring motifs, progressive intensity)
- **Character voice fingerprints** — statistical dialogue patterns per character beyond what's in the character record

### 6b. How It Learns
- When the AI drafts panel content (via Section 4c), the original AI text is stored in a session-scoped in-memory map (`Map<panelId, originalDraft>`), keyed to the browser session. This is ephemeral — not persisted to the database — and only lives until the tab is closed or the session ends.
- When the writer edits a drafted field and blurs, the system diffs the original AI text against the final text and appends the diff to an `ai_draft_edits` array on the `writer_profiles` record (JSONB, capped at last 200 edits to bound size).
- The periodic writer profile synthesis prompt is updated to analyze these diffs and extract concrete style preferences (e.g., "writer consistently replaces generic camera directions with specific shot types," "writer shortens AI descriptions by ~40%").
- Over time, AI drafts converge on writer's voice and require less editing.

### 6c. How It Surfaces
- No new UI. Learning is invisible — drafts just get better.
- Existing writer profile page shows updated portrait so writer can see what AI thinks it knows
- Writer can correct inaccuracies in the portrait

### Constraints
- All prompt-level adaptation using profile as context. No fine-tuning or model training.
- No productivity metrics tracking (editing speed, session duration). Not surveillance.
- Existing tool_stats tracking of proposal acceptance/rejection stays as-is.

---

## Implementation Approach

**Phase 1 — Immediate Comfort (ship fast):**
- Section 1: Font size controls
- Section 2: Sequential reading & editing flow

**Phase 2 — Layout & AI Foundation:**
- Section 3: Dual-page view
- Section 4: Socratic → scaffold pipeline

**Phase 3 — Polish & Intelligence:**
- Section 5: Import pipeline polish
- Section 6: Active writer learning system

Phase 1 enables the writer to comfortably read and refine existing issues now. Phase 2 builds the infrastructure that Sections 3-6 share (flexible layout engine, AI extraction framework). Phase 3 layers on import improvements and the learning system.
