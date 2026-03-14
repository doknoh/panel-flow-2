# Multi-Select Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inconsistent multi-select styling in NavigationTree with a hybrid grouping approach — adjacent selected items merge into rounded containers, non-adjacent ones get individual pills.

**Architecture:** A pure `getSelectionGroups` helper computes each selected item's position-in-group (solo/first/middle/last). Render code applies positional CSS classes per item — no wrapper divs added to the DOM tree, no changes to dnd-kit integration. Active page styling is suppressed during multi-select.

**Tech Stack:** React, Tailwind CSS (arbitrary values with CSS variables), @dnd-kit

**Spec:** `docs/superpowers/specs/2026-03-12-multi-select-visual-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/selection-groups.ts` | Create | Pure helper: compute position-in-group for selected items |
| `src/lib/selection-groups.test.ts` | Create | Tests for the helper |
| `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx` | Modify | Apply positional classes to page/scene/act rendering |

---

## Chunk 1: Selection Groups Helper

### Task 1: Create `getSelectionGroups` helper with TDD

**Files:**
- Create: `src/lib/selection-groups.ts`
- Create: `src/lib/selection-groups.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/selection-groups.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { getSelectionGroups } from './selection-groups'

describe('getSelectionGroups', () => {
  test('returns empty map when no items are selected', () => {
    const result = getSelectionGroups(new Set(), ['a', 'b', 'c'])
    expect(result.size).toBe(0)
  })

  test('single selected item returns solo', () => {
    const result = getSelectionGroups(new Set(['b']), ['a', 'b', 'c'])
    expect(result.get('b')).toBe('solo')
    expect(result.size).toBe(1)
  })

  test('two adjacent selected items return first and last', () => {
    const result = getSelectionGroups(new Set(['b', 'c']), ['a', 'b', 'c', 'd'])
    expect(result.get('b')).toBe('first')
    expect(result.get('c')).toBe('last')
  })

  test('three adjacent selected items return first, middle, last', () => {
    const result = getSelectionGroups(new Set(['a', 'b', 'c']), ['a', 'b', 'c', 'd'])
    expect(result.get('a')).toBe('first')
    expect(result.get('b')).toBe('middle')
    expect(result.get('c')).toBe('last')
  })

  test('two non-adjacent selected items both return solo', () => {
    const result = getSelectionGroups(new Set(['a', 'c']), ['a', 'b', 'c', 'd'])
    expect(result.get('a')).toBe('solo')
    expect(result.get('c')).toBe('solo')
  })

  test('mixed: adjacent group + isolated item', () => {
    // Pages 1,2,3 adjacent + Page 5 isolated
    const result = getSelectionGroups(
      new Set(['p1', 'p2', 'p3', 'p5']),
      ['p1', 'p2', 'p3', 'p4', 'p5']
    )
    expect(result.get('p1')).toBe('first')
    expect(result.get('p2')).toBe('middle')
    expect(result.get('p3')).toBe('last')
    expect(result.get('p5')).toBe('solo')
  })

  test('two separate groups', () => {
    const result = getSelectionGroups(
      new Set(['a', 'b', 'd', 'e']),
      ['a', 'b', 'c', 'd', 'e']
    )
    expect(result.get('a')).toBe('first')
    expect(result.get('b')).toBe('last')
    expect(result.get('d')).toBe('first')
    expect(result.get('e')).toBe('last')
  })

  test('all items selected forms one group', () => {
    const result = getSelectionGroups(
      new Set(['a', 'b', 'c']),
      ['a', 'b', 'c']
    )
    expect(result.get('a')).toBe('first')
    expect(result.get('b')).toBe('middle')
    expect(result.get('c')).toBe('last')
  })

  test('selected items not in orderedIds are ignored', () => {
    const result = getSelectionGroups(
      new Set(['a', 'z']),
      ['a', 'b', 'c']
    )
    expect(result.get('a')).toBe('solo')
    expect(result.has('z')).toBe(false)
  })

  test('empty orderedIds returns empty map', () => {
    const result = getSelectionGroups(new Set(['a']), [])
    expect(result.size).toBe(0)
  })

  test('large middle group', () => {
    const result = getSelectionGroups(
      new Set(['b', 'c', 'd', 'e']),
      ['a', 'b', 'c', 'd', 'e', 'f']
    )
    expect(result.get('b')).toBe('first')
    expect(result.get('c')).toBe('middle')
    expect(result.get('d')).toBe('middle')
    expect(result.get('e')).toBe('last')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/selection-groups.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/selection-groups.ts`:

```typescript
export type GroupPosition = 'solo' | 'first' | 'middle' | 'last'

/**
 * Compute each selected item's position within its adjacency group.
 *
 * Adjacent selected items form groups. Within a group:
 * - Single item → 'solo'
 * - First item → 'first'
 * - Last item → 'last'
 * - Everything between → 'middle'
 *
 * @param selectedIds - Set of currently selected item IDs
 * @param orderedIdsInParent - Ordered IDs within the same parent container
 *   (e.g., pages within one scene, scenes within one act)
 * @returns Map of selected ID → position for O(1) lookup during render
 */
export function getSelectionGroups(
  selectedIds: Set<string>,
  orderedIdsInParent: string[]
): Map<string, GroupPosition> {
  const result = new Map<string, GroupPosition>()

  // Filter to only selected items in this parent, preserving order
  const selected = orderedIdsInParent.filter(id => selectedIds.has(id))
  if (selected.length === 0) return result

  // Build groups of consecutive items
  const groups: string[][] = []
  let currentGroup: string[] = [selected[0]]

  for (let i = 1; i < selected.length; i++) {
    const prevIndex = orderedIdsInParent.indexOf(selected[i - 1])
    const currIndex = orderedIdsInParent.indexOf(selected[i])

    if (currIndex === prevIndex + 1) {
      // Adjacent — continue group
      currentGroup.push(selected[i])
    } else {
      // Gap — start new group
      groups.push(currentGroup)
      currentGroup = [selected[i]]
    }
  }
  groups.push(currentGroup)

  // Assign positions
  for (const group of groups) {
    if (group.length === 1) {
      result.set(group[0], 'solo')
    } else {
      result.set(group[0], 'first')
      for (let i = 1; i < group.length - 1; i++) {
        result.set(group[i], 'middle')
      }
      result.set(group[group.length - 1], 'last')
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/selection-groups.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/selection-groups.ts src/lib/selection-groups.test.ts
git commit -m "feat: add getSelectionGroups helper for multi-select visual grouping"
```

---

## Chunk 2: Update NavigationTree Page Rendering

### Task 2: Apply positional group classes to pages

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`

The page rendering is at lines 2256-2377. Each page is inside a `<SortableItem>` within a per-scene `<SortableContext>` (line 2255).

- [ ] **Step 1: Add import**

At the top of NavigationTree.tsx, add after the existing imports:

```typescript
import { getSelectionGroups, GroupPosition } from '@/lib/selection-groups'
```

- [ ] **Step 2: Add CSS helper function**

Add this function near the top of the file (after the `SortableItem` component, around line 83):

```typescript
/** Build className for a multi-selected item based on its group position */
function selectionGroupClass(position: GroupPosition | undefined, level: 'page' | 'scene' | 'act'): string {
  if (!position) return ''

  // Indentation margins: pages are deeper than scenes, scenes deeper than acts
  const marginLeft = level === 'page' ? 'ml-8' : level === 'scene' ? 'ml-4' : 'ml-1'
  const marginRight = 'mr-1.5'
  const bg = 'bg-[var(--color-primary)]/12'
  const textClass = 'text-[var(--text-primary)]'

  switch (position) {
    case 'solo':
      return `${marginLeft} ${marginRight} ${bg} ${textClass} rounded-md border border-[var(--color-primary)]/35`
    case 'first':
      return `${marginLeft} ${marginRight} ${bg} ${textClass} rounded-t-lg border-t border-x border-[var(--color-primary)]/35`
    case 'middle':
      return `${marginLeft} ${marginRight} ${bg} ${textClass} border-x border-[var(--color-primary)]/35 border-t border-t-[var(--color-primary)]/20`
    case 'last':
      return `${marginLeft} ${marginRight} ${bg} ${textClass} rounded-b-lg border-b border-x border-[var(--color-primary)]/35 border-t border-t-[var(--color-primary)]/20`
  }
}
```

- [ ] **Step 3: Compute page groups per scene**

Inside the scene rendering loop (around line 2184, after `const scenePageCount = sortedPages.length`), add:

```typescript
const pageGroups = selectionType === 'page' && selectedIds.size > 0
  ? getSelectionGroups(selectedIds, sortedPages.map((p: any) => p.id))
  : new Map<string, GroupPosition>()
```

- [ ] **Step 4: Update page row className**

Replace the page row div's className (lines 2271-2277):

**Current:**
```typescript
className={`flex items-center gap-2 pl-10 pr-2 py-1 cursor-pointer transition-colors group ${
  isSelected
    ? 'bg-[var(--color-primary)] text-white'
    : selectedIds.has(page.id)
      ? 'bg-[var(--color-primary)]/15 border-l-2 border-[var(--color-primary)] text-[var(--text-primary)]'
      : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]'
}`}
```

**New:**
```typescript
className={`flex items-center gap-2 pr-2 py-1 cursor-pointer transition-colors group ${
  pageGroups.has(page.id)
    ? `pl-3 ${selectionGroupClass(pageGroups.get(page.id), 'page')}`
    : isSelected && selectedIds.size === 0
      ? 'pl-10 bg-[var(--color-primary)] text-white'
      : 'pl-10 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]'
}`}
```

Key changes:
- When page is in a selection group: reduced left padding (`pl-3`) since the group margin provides indentation, plus positional group classes
- Active page styling: only applies when `selectedIds.size === 0` (no multi-select active)
- Default styling: unchanged

- [ ] **Step 5: Update panel count badge styling**

Replace line 2299:

**Current:**
```typescript
<span className={`type-micro tabular-nums ${isSelected ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
```

**New:**
```typescript
<span className={`type-micro tabular-nums ${isSelected && selectedIds.size === 0 ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
```

- [ ] **Step 6: Update options button styling**

Replace lines 2315-2318:

**Current:**
```typescript
className={`opacity-0 group-hover:opacity-100 p-0.5 transition-opacity ${
  isSelected
    ? 'hover:bg-white/20 text-white/60 hover:text-white'
    : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
}`}
```

**New:**
```typescript
className={`opacity-0 group-hover:opacity-100 p-0.5 transition-opacity ${
  isSelected && selectedIds.size === 0
    ? 'hover:bg-white/20 text-white/60 hover:text-white'
    : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
}`}
```

- [ ] **Step 7: Update page summary indentation for grouped pages**

The page summary sections (lines 2325-2376) use `ml-10` for indentation. When a page is in a selection group, the summary should align with the group's reduced indentation. Replace every instance of `className="ml-10` in the page summary section with a dynamic class:

Replace lines 2327, 2346, and 2362:
```typescript
// Where the page summary divs use ml-10, change to:
className={`${pageGroups.has(page.id) ? 'ml-3 pl-0' : 'ml-10'} mt-0.5 mb-1 ...rest of classes`}
```

Specifically:
- Line 2327 (editing textarea wrapper): `className={`${pageGroups.has(page.id) ? 'ml-3' : 'ml-10'} mt-0.5 mb-1`}`
- Line 2346 (summary display): `className={`${pageGroups.has(page.id) ? 'ml-3' : 'ml-10'} mt-0.5 mb-1 cursor-pointer group/pagesummary`}`
- Line 2362 (summarize link): `className={`${pageGroups.has(page.id) ? 'ml-3' : 'ml-10'} mt-0.5 mb-1 cursor-pointer`}`

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx
git commit -m "feat: apply positional group classes to page multi-select"
```

---

## Chunk 3: Update Scene and Act Rendering

### Task 3: Apply positional group classes to scenes

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`

Scene rendering is at lines 2183-2250, inside a per-act `<SortableContext>`.

- [ ] **Step 1: Compute scene groups per act**

Inside the act rendering loop (around line 2109, after `const actPageCount = ...`), add:

```typescript
const sceneGroups = selectionType === 'scene' && selectedIds.size > 0
  ? getSelectionGroups(selectedIds, sortedScenes.map((s: any) => s.id))
  : new Map<string, GroupPosition>()
```

Where `sortedScenes` is defined at line 2184 (the existing sorted scenes array for the current act). Note: `sortedScenes` is actually defined inside the `expandedActs.has(act.id)` block. Move the `getSelectionGroups` call to inside that same block, right after `sortedScenes` is computed:

```typescript
const sortedScenes = [...(act.scenes || [])].sort(...)
const sceneGroups = selectionType === 'scene' && selectedIds.size > 0
  ? getSelectionGroups(selectedIds, sortedScenes.map((s: any) => s.id))
  : new Map<string, GroupPosition>()
```

- [ ] **Step 2: Update scene header className**

Replace the scene header div's className (lines 2192-2194):

**Current:**
```typescript
className={`flex items-center gap-2 pl-6 pr-2 py-1.5 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors group ${
  dragOverContainerId === scene.id && activeDragItem?.type === 'page' ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
} ${selectedIds.has(scene.id) ? 'bg-[var(--color-primary)]/15 ring-1 ring-inset ring-[var(--color-primary)]' : ''}`}
```

**New:**
```typescript
className={`flex items-center gap-2 pr-2 py-1.5 cursor-pointer transition-colors group ${
  dragOverContainerId === scene.id && activeDragItem?.type === 'page' ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
} ${sceneGroups.has(scene.id)
    ? `pl-2 ${selectionGroupClass(sceneGroups.get(scene.id), 'scene')}`
    : 'pl-6 hover:bg-[var(--bg-secondary)]'
}`}
```

Key changes:
- Selected scenes: reduced left padding (`pl-2`) + positional group classes
- Removed old `bg-[var(--color-primary)]/15 ring-1 ring-inset ring-[var(--color-primary)]` treatment
- Hover bg only applies to unselected scenes
- The plotline color left border (line 2195 `style={{ borderLeft: ... }}`) remains unchanged — it renders as an inner accent within the group styling

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx
git commit -m "feat: apply positional group classes to scene multi-select"
```

### Task 4: Apply positional group classes to acts

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`

Act rendering is at lines 2113-2178. Acts live in a top-level `<SortableContext>`.

- [ ] **Step 1: Compute act groups once before the act loop**

Before the act mapping (find the `SortableContext` for acts, around line 2095), add:

```typescript
const sortedActIds = sortedActs.map((a: any) => a.id)
const actGroups = selectionType === 'act' && selectedIds.size > 0
  ? getSelectionGroups(selectedIds, sortedActIds)
  : new Map<string, GroupPosition>()
```

Where `sortedActs` is the sorted acts array used in the act `SortableContext`.

- [ ] **Step 2: Update act header className**

Replace the act header div's className (lines 2118-2120):

**Current:**
```typescript
className={`flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors group ${
  dragOverContainerId === act.id && (activeDragItem?.type === 'scene' || activeDragItem?.type === 'page') ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
} ${selectedIds.has(act.id) ? 'bg-[var(--color-primary)]/15 border-l-2 border-l-[var(--color-primary)]' : ''}`}
```

**New:**
```typescript
className={`flex items-center gap-2 py-2 cursor-pointer transition-colors group ${
  dragOverContainerId === act.id && (activeDragItem?.type === 'scene' || activeDragItem?.type === 'page') ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
} ${actGroups.has(act.id)
    ? `px-2 ${selectionGroupClass(actGroups.get(act.id), 'act')}`
    : 'px-2 hover:bg-[var(--bg-secondary)]'
}`}
```

Key changes:
- Selected acts: positional group classes replace old `bg/border-l` treatment
- Hover bg only on unselected acts

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (including the new selection-groups tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx
git commit -m "feat: apply positional group classes to act multi-select"
```

---

## Chunk 4: Visual Verification and Polish

### Task 5: Visual verification and margin tuning

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx` (if tuning needed)

- [ ] **Step 1: Start dev server and test in browser**

Run: `npm run dev`

Test these scenarios:
1. **Single page selected** (Cmd+click one page) → solo pill with rounded corners
2. **Two adjacent pages** (Shift+click) → connected group with internal divider
3. **Three+ adjacent pages** → group with first/middle/last rounding
4. **Non-adjacent pages** (Cmd+click two separate pages) → two individual pills
5. **Mixed** (Cmd+click three adjacent + one isolated) → one group + one pill
6. **Single scene** → solo pill
7. **Adjacent scenes** → connected group
8. **Single act** → solo pill
9. **Adjacent acts** → connected group
10. **Active page suppression** → when multi-selecting, the solid-fill active page becomes a group member
11. **Clear selection** (Escape or plain click) → active page solid fill returns
12. **Dark mode** → verify opacity values produce acceptable contrast
13. **Drag-and-drop** → verify dragging still works with the new styling

- [ ] **Step 2: Tune margins if needed**

The `ml-8` / `ml-4` / `ml-1` values in `selectionGroupClass` may need adjustment based on the actual visual indentation. Tweak these values until the pills/groups feel naturally inset from the tree hierarchy without breaking alignment.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "polish: tune multi-select group margins and verify visual output"
```

- [ ] **Step 4: Run full verification**

Run: `npx tsc --noEmit && npx vitest run`
Expected: TypeScript clean, all tests pass
