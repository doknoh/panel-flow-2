# Multi-Select in NavigationTree

**Date:** 2026-03-11
**Status:** Approved

## Summary

Add multi-select capability to the NavigationTree component (left column of the issue editor) at all hierarchy levels — pages, scenes, and acts. Enables batch drag-and-drop, batch delete, batch move, and batch duplicate. Selection follows standard OS conventions (Cmd/Ctrl+click toggle, Shift+click range).

## Architecture

Local state in NavigationTree (no new context). Batch action logic extracted to `src/lib/batchActions.ts` to keep NavigationTree manageable.

## Selection State

Three new state variables in NavigationTree:

- `selectedIds: Set<string>` — all multi-selected item IDs
- `selectionType: 'page' | 'scene' | 'act' | null` — enforces same-type selection
- `lastClickedId: string | null` — anchor for Shift+click range selection

### Constraint

Only items of the same type can be multi-selected together. Cmd+clicking a page when scenes are selected clears the scene selection and starts a new page selection.

## Selection Interactions

| Input | Behavior |
|-------|----------|
| Click (no modifier) | Clears multi-selection, navigates to item as today |
| Cmd/Ctrl+Click | Toggle item in/out of selection. Must match existing `selectionType`. Does not change active page in editor. |
| Shift+Click | Select range from `lastClickedId` to clicked item. Same level only — walks the visible tree order for pages, scene list for scenes, act list for acts. |
| Escape | Clears multi-selection. Active page unchanged. |
| ✕ button on action bar | Same as Escape. |

## Visual Treatment

- **Active page** (editor shows this): solid primary background — unchanged from current behavior
- **Multi-selected items**: subtle highlighted background (`bg-[var(--color-primary)]/15`) with left border accent (`border-l-2 border-[var(--color-primary)]`)
- **During drag**: all selected items in the tree go to 30% opacity (matching current single-drag behavior)
- **Drag overlay**: compact card showing selected item names with count badge (e.g., "3 pages" with a circled "3")

## Floating Action Bar

Sticky bar at the bottom of the nav panel. Appears (slides up) when `selectedIds.size >= 2`.

**Layout:**
- Left: "N [type]s selected" label
- Right: **Move** | **Duplicate** | **Delete** | **✕** (clear selection)

**Keyboard shortcut:** `Backspace`/`Delete` key triggers batch delete when items are selected and focus is in the nav tree.

## Context Menu

When right-clicking a multi-selected item:
- Menu shows batch variants: "Delete 3 pages", "Move 3 pages", "Duplicate 3 pages"

When right-clicking an unselected item while multi-select is active:
- Clears multi-selection, shows standard single-item context menu

## Batch Drag-and-Drop

- Initiating drag on any selected item drags ALL selected items as a unit
- Drop logic inserts all items at the drop position, maintaining their relative order
- Cross-container moves supported: dragging selected pages onto a different scene moves all of them there
- Pages dragged onto an act header: creates a new scene in the act and moves pages there (extending existing behavior)
- Single undo action reverses the entire batch move

## Batch Delete

1. Confirmation dialog: "Delete N [type]s? This will permanently delete all content within these [type]s."
2. Deep-fetch all selected items in parallel (for undo restoration)
3. Delete all from database in parallel
4. Optimistic UI update removes all at once
5. Single undo action restores all items with original UUIDs and positions
6. If the active page is among deleted items, navigate to the nearest surviving page

## Batch Move (via Action Bar)

1. Click "Move" → popover lists valid target containers:
   - Pages → list of scenes (grouped by act)
   - Scenes → list of acts
   - Acts → not applicable (acts have no parent container)
2. On selection, move all items to the target, appending at the end
3. Auto-renumber sort orders in both source and target containers
4. Single undo action records previous positions for all items

## Batch Duplicate

1. Deep-fetch all selected items with full nested data
2. Insert copies with new UUIDs at the end of each item's current parent container
3. New duplicated items become the new selection (originals deselected)
4. Single undo action for cleanup (delete all duplicated items)

## Undo Action Types

New batch action types added to UndoContext:

```
batch_page_delete   | batch_scene_delete   | batch_act_delete
batch_page_move     | batch_scene_move
batch_page_add      | batch_scene_add      | batch_act_add
batch_page_reorder  | batch_scene_reorder  | batch_act_reorder
```

Each batch action stores the full array of affected items with their previous positions and nested data for restoration.

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `NavigationTree.tsx` | Modify | Add selection state, modify click handlers with modifier key detection, update drag start/end/overlay for multi-item, render floating action bar, update context menu for batch variants |
| `src/lib/batchActions.ts` | New | Batch delete, move, duplicate logic. Deep-fetch helpers for multiple items. Accepts supabase client, issue state setter, undo recorder. |
| `src/contexts/UndoContext.tsx` | Modify | Add batch action type interfaces, undo/redo case handlers for each batch type |
| `src/lib/undoHelpers.ts` | Modify | Add batch restore functions (loop over existing single-item restore functions) |

## Edge Cases

- **Mixed parents**: Selected pages may span multiple scenes. Batch move collects from all source scenes, inserts into target scene, renumbers all affected scenes.
- **Empty scenes after move**: If moving all pages out of a scene, the scene remains (empty). No auto-delete of empty containers.
- **Shift+click across collapsed sections**: Range selection only considers visible (expanded) items. Collapsed items are skipped.
- **Drag from unselected**: Dragging an item that is NOT in the current selection clears the selection and drags just that item (standard OS behavior).
- **Selection persistence**: Selection clears on: navigation to a different page (plain click), Escape, ✕ button, or any batch action completion. Selection persists across: expand/collapse of tree sections, adding new items.
