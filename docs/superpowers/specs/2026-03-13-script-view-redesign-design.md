# Script View Redesign — Design Spec

**Date:** 2026-03-13
**Goal:** Redesign Script View to feel like a professional screenplay editor — consistent header, single adaptive toolbar, keyboard-first flow, continuous scroll.

---

## Problems Being Solved

1. **Inconsistent header** — Script View header is a one-off layout that doesn't match the standard site header (different font, different button styling, different structure)
2. **Per-field rich text toolbars** — Every panel description has its own B/I/U/S toolbar. Dialogue and captions show toolbars on focus. This clutters the view and breaks the screenplay feel.
3. **Typography mismatch** — Page numbers use heavy monospace styling instead of Helvetica/system font like the standard page editor
4. **Page-by-page navigation** — Current view navigates one page at a time. Should be a single continuous scroll of the entire scope.

---

## Design Decisions

### 1. Header — Match Site Standard

The Script View header adopts the same pattern used across the rest of the site:

- **Font:** System sans-serif (not Courier)
- **Style:** Uppercase, tracked letters, consistent with site-wide `type-meta` / `type-micro` classes
- **Left side:** Back link (`← ISSUE #N`), series title
- **Right side:** Scope selector dropdown (Page/Scene/Act/Full Issue), COPY button, EXPORT button, save status indicator
- **No page-by-page nav in header** — removed because the view is now continuous scroll

The scope selector controls how much of the issue is rendered in the scroll. "Full Issue" shows everything. "Act" shows one act. Etc.

### 2. Single Adaptive Toolbar — Sticky Below Header

One toolbar bar, fixed below the header, that adapts to the currently focused field:

| Focused Field | Toolbar Shows | Context Label |
|---------------|---------------|---------------|
| Panel description | B, I, U, S \| •, 1. \| H, ", <>, — | `EDITING: PANEL N DESCRIPTION` |
| Dialogue | B, I | `EDITING: PANEL N → CHARACTER NAME` |
| Caption | B, I | `EDITING: PANEL N CAPTION` |
| SFX | *(toolbar hidden)* | — |
| No focus | *(toolbar hidden)* | — |

The right side of the toolbar shows a context label so you know exactly what you're editing.

**Note:** Artist notes are not rendered in Script View (the focus is on script content only — descriptions, dialogue, captions, SFX). Artist notes remain accessible in the main editor.

**Architecture:** The adaptive toolbar tracks the currently focused TipTap editor via a React ref + onFocus callback. Each `ScriptEditor` instance calls `onFocus(editor)` when focused, and the parent `ScriptView` passes that editor reference to the standalone `ScriptEditorToolbar`. Toolbar button `onMouseDown` uses `e.preventDefault()` to prevent blur on the active editor — this is the standard TipTap pattern for external toolbars.

**When nothing is focused:** The toolbar bar hides entirely (the header remains). This keeps the view clean and maximizes reading space.

### 3. Typography — Dual Font System

- **Structural elements** (page headers, panel labels, act/scene context, toolbar, header) → System sans-serif (`-apple-system, 'Helvetica Neue', sans-serif`)
- **Script body** (descriptions, dialogue, captions, SFX) → Monospace (`'Courier Prime', 'Courier New', monospace`)

This mirrors how professional screenplays work: the body is Courier, but page numbers and structural markers use a different face.

Page header specifically:
- Font: System sans-serif, 22px, font-weight 800, uppercase, tracked
- Format: `PAGE 1 (RIGHT)` with orientation de-emphasized (lower weight, lower opacity)
- Underline: 2px solid border-bottom

Panel labels:
- Font: System sans-serif, 10px, font-weight 700, uppercase, letter-spacing 2px
- Format: `PANEL 1`, `PANEL 2`, etc. (no `// VISUAL` suffix — the Script View is always visual description first)

### 4. Continuous Scroll

The entire scope (page/scene/act/full issue) renders as one continuous scrollable document. No page-by-page navigation. Page breaks are visual markers in the flow (the `PAGE N (ORIENTATION)` headers), not hard stops.

Scrolling is natural browser scroll. The header and toolbar remain sticky at the top.

### 5. Tab Navigation — Keyboard-First Flow

Tab moves through every editable field in strict reading order:

```
Panel 1 description
  → Panel 1 dialogue(s) (if any)
  → Panel 1 caption(s) (if any)
  → Panel 1 SFX (if any)
  → Panel 1 quick-add menu
Panel 2 description
  → Panel 2 dialogue(s)
  → ...
```

**Shift+Tab** goes backward through the same sequence.

When Tab reaches the last field on a page, it continues to the first panel of the next page (no page boundary — it's all one scroll).

**Tab inside TipTap editors:** Tab is always intercepted for field navigation. It never triggers list indentation in Script View. (List indentation uses toolbar buttons instead.) This is a Script View–specific override; the main editor retains default Tab behavior.

**Initial focus:** When Script View opens, focus goes to the first panel description in the rendered scope.

**End of scope:** When Tab reaches the quick-add menu of the very last panel, pressing Tab again does nothing (focus stays on the menu). The writer can Esc to dismiss or scroll manually.

### 6. Quick-Add Menu — Inline After Each Panel

When you Tab past the last existing field in a panel (or past the description if the panel has no sub-fields), a slim inline menu appears:

```
  D Dialogue  ·  C Caption  ·  S SFX  ·  P + Panel  ·  Tab → next panel
```

- Press `D` → creates a dialogue block, cursor drops into speaker field (uses existing `CharacterAutocomplete` component for speaker selection), then Tab into dialogue text
- Press `C` → creates a caption block (default type: `NARRATIVE`), cursor drops into caption text
- Press `S` → creates an SFX block, cursor drops into SFX text
- Press `P` → creates a new panel after the current one (auto-renumbers), cursor drops into its description
- Press `Tab` without selecting → moves to next panel description
- Press `Esc` → dismisses menu, stays on current panel
- Any other key is ignored

The menu is visually minimal — small text, muted color, appears inline below the panel content. It does not take up space when not active. The letters `D`, `C`, `S`, `P` are clickable as well (for mouse users).

**Speaker and type selection for existing blocks:** The `CharacterAutocomplete` and `TypeSelector` components remain available inline on dialogue and caption blocks. Clicking the speaker name on a dialogue block opens the autocomplete. Clicking the caption type label (e.g., `CAP (NARRATIVE)`) opens the type selector. These are rendered as clickable labels, not separate widgets — they blend into the screenplay layout.

### 7. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Next field / show quick-add menu |
| `Shift+Tab` | Previous field |
| `⌘S` | Save |
| `⌘Z` | Undo |
| `⌘⇧Z` | Redo |
| `⌘F` | Find & Replace |
| `⌘⌫` | Delete focused block (dialogue/caption/SFX) with confirmation |
| `Esc` | Exit Script View (with auto-save) |

**Deletion:** `⌘⌫` (Cmd+Backspace) deletes the currently focused sub-block (dialogue, caption, or SFX). A confirmation toast appears briefly with an undo option ("Deleted dialogue — Undo"). Panel descriptions cannot be deleted this way (deleting a panel requires exiting to the main editor). This keeps Script View focused on writing flow while preventing accidental data loss.

Footer bar shows keyboard hints (same as current, minus page nav shortcuts).

### 8. Visual Hierarchy — Block Styling

All field types use left-border color coding (same as current, carried forward):

| Block Type | Border Color | Indentation |
|------------|-------------|-------------|
| Panel description | `var(--text-secondary)` (gray) | None (left-aligned with 2px left border + 14px padding) |
| Dialogue | `var(--color-primary)` at 40% (blue tint) | 40px left margin |
| Caption | `var(--color-warning)` at 40% (amber tint) | 40px left margin |
| SFX | `var(--accent-hover)` at 40% (orange tint) | 40px left margin, bold, no border |

Dialogue blocks show the speaker name as a clickable label above the text (sans-serif, uppercase, tracked, in the border color). Clicking the name opens `CharacterAutocomplete` inline. Dialogue type suffixes (e.g., `(V.O.)`, `(O.S.)`) display next to the speaker name — clicking opens `TypeSelector`.

Caption blocks show the caption type (e.g., `CAP (NARRATIVE)`) as a clickable label — clicking opens `TypeSelector` for the caption type.

SFX is rendered inline as `SFX: TEXT` in bold monospace with accent color.

### 9. Active Field Highlighting

When a field is focused:
- Left border brightens to full color (from 40% to 100%)
- Subtle background tint appears (the field's color at ~8% opacity)
- Panel label color brightens to match

When no field is focused, everything stays muted — clean reading view.

### 10. What's Removed

Compared to the current Script View, the following are **removed**:

- Per-field rich text toolbars (replaced by single adaptive toolbar)
- Page-by-page navigation (← → arrows, PG X OF Y counter)
- Add Page / Delete Page buttons (+PG/-PG) — structural page operations done in main editor
- Per-panel delete buttons in the toolbar area (replaced by `⌘⌫` shortcut for sub-blocks)
- Per-panel `+ Dialogue` / `+ Caption` / `+ SFX` text buttons (replaced by Tab quick-add menu)
- `+ Add Panel` button (replaced by `P` in quick-add menu)
- Monospace font on structural elements (page headers, panel labels)
- Theme toggle (available via main editor; Script View uses current theme)
- Artist notes display (kept in main editor only)
- Word count display on individual fields (word counts available via pacing analysis)

### 11. What's Kept

- Full-screen overlay (`fixed inset-0 z-50`)
- Monospace font for script body (Courier Prime)
- Left-border color coding for block types
- Indentation hierarchy (descriptions flush, dialogue/caption/SFX indented)
- Keyboard shortcut footer bar
- Scope selector (Page/Scene/Act/Full Issue)
- Copy/Export functionality
- Auto-save on exit
- Find & Replace (⌘F) — `FindReplaceModal` adapted for continuous scroll (scrolls to match instead of page navigation)
- Undo/Redo integration (including undo for quick-add creations and `⌘⌫` deletions)
- CharacterAutocomplete for dialogue speaker selection
- TypeSelector for dialogue type and caption type

---

## File Impact

| File | Change |
|------|--------|
| `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx` | Major rewrite — header, toolbar, continuous scroll, tab navigation, quick-add menu |
| `src/components/editor/ScriptEditor.tsx` | Add `externalToolbar` prop to hide built-in toolbar; add `onEditorFocus` callback to report focused editor to parent |
| `src/components/editor/ScriptEditorToolbar.tsx` | Ensure toolbar works standalone (receives `editor` prop from parent, uses `onMouseDown={e.preventDefault}` to keep editor focus) |
| `src/app/series/[seriesId]/issues/[issueId]/FindReplaceModal.tsx` | Adapt match navigation for continuous scroll (scroll-to-element instead of page change) |
| `src/components/CharacterAutocomplete.tsx` | No changes needed — used as-is in quick-add dialogue flow |
| `src/components/TypeSelector.tsx` | No changes needed — used as-is for inline type editing |
| `src/app/globals.css` | Add/update Script View specific styles for new layout |
