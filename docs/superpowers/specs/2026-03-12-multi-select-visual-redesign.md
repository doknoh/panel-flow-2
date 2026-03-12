# Multi-Select Visual Redesign — NavigationTree

**Date:** 2026-03-12

---

## Problem

When multi-selecting pages in the NavigationTree (Cmd/Ctrl+click or Shift+click), the visual treatment is inconsistent and unpolished:

- The **active page** gets a solid primary-color fill with white text
- **Other selected pages** get a faint 15% primary wash with a 2px left border
- These two treatments look unrelated — there's no visual signal that the items belong to one selection group
- Text between selected items (descriptions, panel counts) gets visually caught in the selection zone

## Solution

Replace the current styling with a **hybrid grouping** approach:

- **Adjacent selected items** merge into a single rounded container with subtle internal dividers between each item. One border, one background — reads as one visual unit.
- **Non-adjacent selected items** each get their own individual rounded pill with identical tint + border treatment.
- **Mixed selections** combine both: runs of adjacent items form groups, isolated items get pills. E.g., selecting Pages 3, 4, 5, 8 produces one 3-item group + one solo pill.

## Visual Treatment

All selected items receive identical styling regardless of whether the item is the currently active/navigated-to page:

| Property | Value |
|----------|-------|
| Background | `var(--color-primary)` at ~12% opacity |
| Border | `var(--color-primary)` at ~35% opacity, 1px solid |
| Border radius | 8px for groups, 6px for solo pills |
| Text color | `var(--text-primary)` (brighter than default `--text-muted`) |
| Description text | Muted but visible |
| Internal dividers (groups only) | `var(--color-primary)` at ~20% opacity, 1px |

### Active Page Suppression

When `selectedIds.size > 0`, the solid-fill active page styling is suppressed — including child elements (panel count badge, options button) that currently use white-on-primary text colors. All selected items look identical. Once the selection is cleared (Escape, plain click, etc.), normal active page styling returns.

### Dark Mode

The opacity values (12% bg, 35% border) use CSS custom properties which adapt to theme automatically. The implementer should verify contrast in both light and dark themes and adjust opacities if needed.

## Scope

### Applies to all entity levels
Pages, scenes, and acts all use the same hybrid grouping logic and visual treatment.

### What changes
- **Page rendering** in NavigationTree: replace the current `className` logic for the multi-selected state with positional CSS classes for group membership
- **Scene rendering**: same treatment
- **Act rendering**: same treatment
- **New helper function**: compute adjacency groups from `selectedIds` + parent-scoped visible item ordering
- **Active page styling conditional**: wrap the solid-fill `isSelected` styling in a `selectedIds.size === 0` check, including child elements (panel count text, options button) that currently use white-on-primary colors

### What does NOT change
- Selection logic (Cmd/Ctrl+click, Shift+click, range selection)
- Drag-and-drop behavior
- Floating action bar
- Keyboard shortcuts (Escape, Delete/Backspace)
- Context menu behavior
- `SortableItem` component or dnd-kit integration

## Implementation Notes

### Adjacency Is Scoped to Parent Container

Adjacency grouping is scoped within the same parent: pages within the same scene, scenes within the same act. If the last page of Scene A and the first page of Scene B are both selected, they are **separate groups** (separate pills), not merged — because they live in different `SortableContext` containers in the DOM.

The `getSelectionGroups` helper receives parent-scoped ordered IDs (e.g., just the pages within one scene), not the global `getVisibleItemIds` list.

### Per-Item Positional CSS Classes (No Wrapper Div)

Rather than wrapping multiple `SortableItem` elements in a group container div (which would conflict with dnd-kit's SortableContext), the grouped look is achieved via **per-item positional CSS classes**:

| Position in group | Styling |
|-------------------|---------|
| **Solo** (group of 1) | `rounded-md` (6px), all borders, full tinted bg |
| **First in group** | `rounded-t-lg` (8px top), border-top + border-x, tinted bg |
| **Middle in group** | No rounding, border-x only, tinted bg, top divider line |
| **Last in group** | `rounded-b-lg` (8px bottom), border-bottom + border-x, tinted bg, top divider line |

Each item computes its own position-in-group and applies the appropriate classes. No new DOM wrapper needed. The internal dividers are achieved with a `border-top` on middle and last items using `var(--color-primary)` at ~20% opacity.

All positional items use a consistent left margin/padding inset from the normal tree indentation to create the visual "pill" shape.

### Adjacency Grouping Helper

```
function getSelectionGroups(
  selectedIds: Set<string>,
  orderedIdsInParent: string[]
): Map<string, 'solo' | 'first' | 'middle' | 'last'> {
  // Filter orderedIdsInParent to selected items only
  // Walk through and determine each item's position relative to adjacent selected siblings
  // Return a map of id → position for quick lookup during render
}
```

Called per parent container during render (once per scene for pages, once per act for scenes, once for the act list). Returns a Map for O(1) lookup when rendering each item.

### Page Summaries Within Groups

Page summary text (the `page.page_summary` content shown below each page row) is included inside the group's visual area — it receives the same tinted background. This is natural since the summary is part of the page's `SortableItem` and visually belongs to it.

### Scene Plotline Color Border

Scenes have a left plotline color border (`borderLeft: 3px solid ${color}`). During multi-selection, the plotline color border is preserved as an inner accent. The selection border wraps outside it. This means selected scenes have both the selection treatment (tinted bg, 1px border) and the plotline color stripe — the plotline stripe remains visible inside the pill/group.

### Collapsed-But-Selected Items

Grouping is recomputed on every render and only applies to currently visible items. Selected-but-collapsed items retain their selection state in `selectedIds` but receive no visual treatment until their parent is re-expanded.

### CSS Variables

No new CSS variables needed. Uses existing `--color-primary`, `--text-primary`, `--text-muted` theme variables with opacity modifiers via Tailwind arbitrary values (e.g., `bg-[var(--color-primary)]/12`).
