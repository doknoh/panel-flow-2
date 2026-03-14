# Hover Interactions & Tooltips — Design Spec

**Date:** 2026-03-12
**Status:** Approved

## Goal

Every interactive element across the entire application should provide visual feedback on hover and a styled tooltip explaining its function. The app should feel like Gmail — intuitive, responsive, and self-documenting.

## Design Decisions

### Three Hover Tiers (CSS utility classes in globals.css)

**Tier 1 — `.hover-lift` (Primary actions)**
- Treatment: border brightens, text brightens, subtle background tint, translateY(-1px) lift, shadow glow
- Active state: scale(0.97) press
- Used for: Action buttons ([+ ADD PANEL], [+ DLG], [+ CAP], [+ SFX], [+ NOTES], FIND, VIEW, TOOLS, EXPORT, ALL CHARACTERS, Save, Submit, Create)

**Tier 2 — `.hover-glow` (Navigation & selection)**
- Treatment: text brightens, subtle background highlight, border-radius
- No lift, no shadow
- Used for: Nav tree items (pages, scenes, acts), toolkit tabs, character/location list items, dropdown triggers, breadcrumb links, card elements

**Tier 3 — `.hover-fade` / `.hover-fade-danger` (Contextual & destructive)**
- Treatment: text color brightens (or turns red for danger)
- Minimal — just enough to signal interactivity
- Used for: [DEL] buttons, drag handles, collapse chevrons, undo/redo, dark mode toggle, secondary icon buttons

### Tooltip Component (`<Tip>`)

- Wraps Radix UI Tooltip (already a dependency, currently unused)
- Props: `content` (string), `side` (top/bottom/left/right, default top), `delayDuration` (default 400ms)
- Uses `asChild` — no extra DOM wrapper
- Styled in globals.css to match app design: monospace font, 10px, app border/background colors, subtle shadow
- Replaces ALL native `title` attributes across the app
- Root layout wrapped in `<Tooltip.Provider>` once

### Implementation Approach

- CSS utility classes for hover effects (one className addition per element)
- `<Tip>` component wrapper for tooltips (minimal JSX change per element)
- Applied independently — an element can have hover class only, tooltip only, or both
- Sweep covers every page in the application, not just the issue editor

## Scope — Full Element Inventory

### Issue Editor (`/series/[seriesId]/issues/[issueId]`)

**IssueEditor.tsx (header + layout):**
- ISSUE #XX back link → hover-glow + Tip("Back to series")
- FIND button → hover-lift + Tip("Find & Replace (⌘F)")
- VIEW button → hover-lift + Tip("Switch view mode")
- TOOLS button → hover-lift + Tip("Keyboard shortcuts")
- EXPORT button → hover-lift + Tip("Export issue")
- Dark mode toggle → hover-fade + Tip("Toggle dark mode")
- Mobile view tabs (NAV/EDITOR/TOOLKIT) → hover-glow

**PageEditor.tsx (center column):**
- [+ ADD PANEL] → hover-lift + Tip("Add new panel (⌘Enter)")
- [DEL] on panels → hover-fade-danger + Tip("Delete panel")
- SHOT TYPE dropdown → hover-glow + Tip("Panel shot type")
- Page type selector (Single/Splash/Spread) → hover-glow + Tip(type description)
- [+ DLG] → hover-lift + Tip("Add dialogue")
- [+ CAP] → hover-lift + Tip("Add caption")
- [+ SFX] → hover-lift + Tip("Add sound effect")
- [+ NOTES] → hover-lift + Tip("Add artist notes")
- Panel drag handles (::) → hover-fade + Tip("Drag to reorder")
- Breadcrumb links → hover-glow
- Page orientation badge → Tip("Page reads from this side")
- Dialogue speaker dropdown → hover-glow
- Dialogue type dropdown → hover-glow
- Caption type dropdown → hover-glow
- Delete dialogue/caption/sfx buttons → hover-fade-danger

**NavigationTree.tsx (left column):**
- Act labels → hover-glow + Tip(act name)
- Scene labels → hover-glow + Tip(scene description)
- Page labels → hover-glow
- + ADD SCENE → hover-lift + Tip("Add scene to this act")
- + ADD PAGE → hover-lift + Tip("Add page to this scene")
- + ACT → hover-lift + Tip("Add new act")
- Collapse chevrons → hover-fade
- Context menu dots (⋮) → hover-fade + Tip("More options")
- Multi-select checkboxes → hover-fade

**Toolkit.tsx (right column):**
- Tab buttons (CTX/CHAR/LOC/VIS/ALRT/PACE/AI) → hover-glow + Tip(full tab name)
- Character list items → hover-glow + Tip("View character details")
- Character arrows (→) → hover-fade + Tip("Go to character page")
- ALL CHARACTERS toggle → hover-lift
- Edit/Cancel context toggle → hover-fade
- Save Context button → hover-lift + Tip("Save issue context")
- Status dropdown → hover-glow + Tip("Issue status")
- AI send button → hover-lift + Tip("Send message")
- AI clear button → hover-fade + Tip("Clear conversation")
- Location list items → hover-glow
- Alert dismiss buttons → hover-fade + Tip("Dismiss")
- Pacing refresh → hover-fade + Tip("Refresh analysis")

**StatusBar (bottom):**
- UNDO → hover-fade + Tip("Undo (⌘Z)")
- REDO → hover-fade + Tip("Redo (⌘⇧Z)")
- Phase selector → hover-glow + Tip("Writing phase")
- SYNC status → Tip("Auto-save status")

### ScriptView, ZenMode, BlueprintView
- All action buttons → appropriate tier + Tip
- All toolbar buttons → hover-lift + Tip
- All panel action buttons → follow same patterns as PageEditor

### Dashboard (`/dashboard`)
- Series cards → hover-glow (full card)
- [+ NEW SERIES] button → hover-lift + Tip("Create new series")
- Admin: user management buttons → hover-lift
- Admin: revoke buttons → hover-fade-danger + Tip("Revoke access")

### Series Home (`/series/[seriesId]`)
- Issue grid cards → hover-glow
- Tool grid links → hover-glow + Tip(tool description)
- Metadata edit buttons → hover-fade + Tip("Edit")
- World building links (Characters, Locations, Plotlines) → hover-glow

### Characters Page (`/series/[seriesId]/characters`)
- Character cards → hover-glow
- + Add button → hover-lift
- Edit/delete buttons → hover-fade / hover-fade-danger
- Filter/sort controls → hover-glow
- Detail panel buttons → appropriate tier
- Voice profile button → hover-lift

### Locations, Plotlines, Notes Pages
- Same patterns: cards → hover-glow, add → hover-lift, edit → hover-fade, delete → hover-fade-danger

### Canvas (`/series/[seriesId]/canvas`)
- Canvas items → hover-glow
- Action buttons (archive, graduate, file) → hover-lift
- Color tags → hover-fade + Tip(color name)

### Guide (`/series/[seriesId]/guide`)
- Session list items → hover-glow
- Start/resume buttons → hover-lift
- Focus shift buttons → hover-glow
- Extract insights button → hover-lift

### Outline, Weave, Analytics, Sessions, Continuity, Patterns, Character Arcs, Deadlines, Collaboration
- All follow the same tier rules: action buttons → hover-lift, list/nav items → hover-glow, secondary/destructive → hover-fade/hover-fade-danger
- All interactive elements get Tip wrappers with descriptive text

### Modals & Dialogs (app-wide)
- Confirm buttons → hover-lift
- Cancel buttons → hover-fade
- Close (X) buttons → hover-fade + Tip("Close")
- Form submit buttons → hover-lift

### Shared Components
- CommandPalette items → hover-glow
- Toast dismiss → hover-fade
- ErrorDisplay retry → hover-lift
- EmptyState action buttons → hover-lift

## Non-Goals

- No animation beyond 150ms transitions (keep it snappy)
- No hover effects on non-interactive elements (text, labels, static content)
- No changes to the existing color system — hover classes use existing CSS variables
- No mobile hover states (touch devices don't hover — the existing TouchSensor and tap behavior is sufficient)

## Technical Notes

- Tooltip.Provider wraps root layout once (delayDuration=400, skipDelayDuration=100)
- Tooltip portal renders at document root (avoids z-index/overflow issues)
- Tooltip animation: 150ms ease-out entry, matches dropdown panel pattern
- All hover classes use `var(--ease-micro)` for consistent feel
- Existing inline Tailwind hover classes should be replaced with the utility classes where possible to reduce duplication
