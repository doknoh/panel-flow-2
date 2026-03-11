# Multi-Select Navigation Tree Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select to the NavigationTree with batch drag-and-drop, delete, move, and duplicate for pages, scenes, and acts.

**Architecture:** Local selection state in NavigationTree.tsx. Batch action logic in new `src/lib/batchActions.ts`. New batch undo types in UndoContext.

**Tech Stack:** React state, dnd-kit (existing), Supabase client (existing), existing undo system

**Spec:** `docs/superpowers/specs/2026-03-11-multi-select-navigation-tree-design.md`

---

## Chunk 1: Selection State & Click Handlers

### Task 1: Add selection state and click handler logic to NavigationTree

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx:82-106` (state declarations)

- [ ] **Step 1: Add selection state variables**

Add after the existing state declarations (line 100, after `contextSubmenu`):

```typescript
// Multi-select state
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
const [selectionType, setSelectionType] = useState<'page' | 'scene' | 'act' | null>(null)
const [lastClickedId, setLastClickedId] = useState<string | null>(null)
```

- [ ] **Step 2: Add selection helper functions**

Add after the `getItemType` function (after line 175):

```typescript
// --- Multi-select helpers ---

const clearSelection = useCallback(() => {
  setSelectedIds(new Set())
  setSelectionType(null)
  setLastClickedId(null)
}, [])

const getVisibleItemIds = useCallback((type: 'page' | 'scene' | 'act'): string[] => {
  const ids: string[] = []
  const sorted = [...(issue.acts || [])].sort((a, b) => a.sort_order - b.sort_order)

  if (type === 'act') {
    return sorted.map(a => a.id)
  }

  for (const act of sorted) {
    const sortedScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    if (type === 'scene') {
      if (expandedActs.has(act.id)) {
        ids.push(...sortedScenes.map((s: any) => s.id))
      }
    } else {
      // pages
      for (const scene of sortedScenes) {
        if (expandedActs.has(act.id) && expandedScenes.has(scene.id)) {
          const sortedPages = [...(scene.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
          ids.push(...sortedPages.map((p: any) => p.id))
        }
      }
    }
  }
  return ids
}, [issue.acts, expandedActs, expandedScenes])

const handleMultiSelectClick = useCallback((
  itemId: string,
  itemType: 'page' | 'scene' | 'act',
  e: React.MouseEvent
) => {
  const isMetaKey = e.metaKey || e.ctrlKey
  const isShiftKey = e.shiftKey

  if (!isMetaKey && !isShiftKey) {
    // Plain click — clear selection, navigate as usual
    clearSelection()
    return false // signals caller to do normal navigation
  }

  if (isMetaKey) {
    // Cmd/Ctrl+click: toggle item in selection
    if (selectionType && selectionType !== itemType) {
      // Different type — start new selection
      setSelectedIds(new Set([itemId]))
      setSelectionType(itemType)
      setLastClickedId(itemId)
      return true
    }

    const newSelected = new Set(selectedIds)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
      if (newSelected.size === 0) {
        setSelectionType(null)
      }
    } else {
      newSelected.add(itemId)
    }
    setSelectedIds(newSelected)
    setSelectionType(itemType)
    setLastClickedId(itemId)
    return true
  }

  if (isShiftKey) {
    // Shift+click: range selection
    if (selectionType && selectionType !== itemType) {
      // Different type — start new selection
      setSelectedIds(new Set([itemId]))
      setSelectionType(itemType)
      setLastClickedId(itemId)
      return true
    }

    const visibleIds = getVisibleItemIds(itemType)
    const anchorId = lastClickedId || itemId
    const anchorIndex = visibleIds.indexOf(anchorId)
    const currentIndex = visibleIds.indexOf(itemId)

    if (anchorIndex === -1 || currentIndex === -1) {
      setSelectedIds(new Set([itemId]))
      setSelectionType(itemType)
      setLastClickedId(itemId)
      return true
    }

    const start = Math.min(anchorIndex, currentIndex)
    const end = Math.max(anchorIndex, currentIndex)
    const rangeIds = visibleIds.slice(start, end + 1)

    setSelectedIds(new Set(rangeIds))
    setSelectionType(itemType)
    // Don't update lastClickedId on shift+click (anchor stays)
    return true
  }

  return false
}, [selectedIds, selectionType, lastClickedId, clearSelection, getVisibleItemIds])
```

- [ ] **Step 3: Add Escape key handler to clear selection**

Update the existing `handleKeyDown` effect (lines 220-225) to also handle Escape for selection clearing. Find the keydown handler inside the `contextMenu` effect and add a separate effect:

```typescript
// Clear multi-selection on Escape
useEffect(() => {
  if (selectedIds.size === 0) return

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !contextMenu) {
      clearSelection()
    }
  }

  document.addEventListener('keydown', handleEscape)
  return () => document.removeEventListener('keydown', handleEscape)
}, [selectedIds.size, contextMenu, clearSelection])
```

- [ ] **Step 4: Wire click handlers into page rendering**

Modify the page click handler at line 1878. Replace:
```typescript
onClick={() => !editingItemId && onSelectPage(page.id)}
```

With:
```typescript
onClick={(e) => {
  if (editingItemId) return
  const handled = handleMultiSelectClick(page.id, 'page', e)
  if (!handled) {
    onSelectPage(page.id)
  }
}}
```

- [ ] **Step 5: Wire click handlers into scene headers**

Modify the scene header click at line 1819. Replace:
```typescript
onClick={() => !editingItemId && toggleScene(scene.id)}
```

With:
```typescript
onClick={(e) => {
  if (editingItemId) return
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    handleMultiSelectClick(scene.id, 'scene', e)
  } else {
    clearSelection()
    toggleScene(scene.id)
  }
}}
```

- [ ] **Step 6: Wire click handlers into act headers**

Modify the act header click at line 1752. Replace:
```typescript
onClick={() => !editingItemId && toggleAct(act.id)}
```

With:
```typescript
onClick={(e) => {
  if (editingItemId) return
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    handleMultiSelectClick(act.id, 'act', e)
  } else {
    clearSelection()
    toggleAct(act.id)
  }
}}
```

- [ ] **Step 7: Update visual styles for multi-selected items**

**Pages (line 1880-1883):** Replace the className logic:
```typescript
className={`flex items-center gap-2 pl-10 pr-2 py-1 cursor-pointer transition-colors group ${
  isSelected
    ? 'bg-[var(--color-primary)] text-white'
    : selectedIds.has(page.id)
      ? 'bg-[var(--color-primary)]/15 border-l-2 border-[var(--color-primary)] text-[var(--text-primary)]'
      : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]'
}`}
```

**Scenes (line 1815-1816):** Add multi-select highlight. Update the className to include:
```typescript
className={`flex items-center gap-2 pl-6 pr-2 py-1.5 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors group ${
  dragOverContainerId === scene.id && activeDragItem?.type === 'page' ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
} ${selectedIds.has(scene.id) ? 'bg-[var(--color-primary)]/15 border-l-2 border-l-[var(--color-primary)]' : ''}`}
```

**Acts (line 1749-1751):** Add multi-select highlight. Update the className to include:
```typescript
className={`flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors group ${
  dragOverContainerId === act.id && (activeDragItem?.type === 'scene' || activeDragItem?.type === 'page') ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''
} ${selectedIds.has(act.id) ? 'bg-[var(--color-primary)]/15 border-l-2 border-l-[var(--color-primary)]' : ''}`}
```

- [ ] **Step 8: Verify dev server runs without errors**

Run: `npm run dev` (via preview_start)
Expected: No TypeScript errors, pages render correctly, Cmd+click selects/deselects items with visual highlighting

- [ ] **Step 9: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/NavigationTree.tsx
git commit -m "feat: add multi-select state and click handlers to NavigationTree

Cmd/Ctrl+click toggles items, Shift+click selects range.
Same-type constraint enforced. Escape clears selection.
Visual highlighting for multi-selected pages, scenes, and acts."
```

---

## Chunk 2: Floating Action Bar

### Task 2: Add floating action bar component

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx` (render section, after the `DndContext` closing tag at line 2057)

- [ ] **Step 1: Add floating action bar JSX**

Insert before the context menu section (before line 2060 `{/* Context Menu */}`):

```tsx
{/* Multi-select action bar */}
{selectedIds.size >= 2 && (
  <div className="sticky bottom-0 bg-[var(--bg-elevated)] border-t-2 border-[var(--color-primary)] px-3 py-2.5 flex items-center justify-between z-10 animate-in slide-in-from-bottom-2 duration-200">
    <span className="text-xs font-semibold text-[var(--text-primary)]">
      {selectedIds.size} {selectionType}{selectedIds.size !== 1 ? 's' : ''} selected
    </span>
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => handleBatchMove()}
        className="px-2.5 py-1 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
      >
        Move
      </button>
      <button
        onClick={() => handleBatchDuplicate()}
        className="px-2.5 py-1 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
      >
        Duplicate
      </button>
      <button
        onClick={() => handleBatchDelete()}
        className="px-2.5 py-1 text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 rounded transition-colors"
      >
        Delete
      </button>
      <button
        onClick={clearSelection}
        className="px-1.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)] rounded transition-colors ml-1"
        aria-label="Clear selection"
      >
        ✕
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Add stub functions for batch actions**

Add placeholder functions that we'll implement in the next chunk:

```typescript
// --- Batch action stubs (implemented in Task 3) ---

const handleBatchDelete = async () => {
  showToast('Batch delete coming soon', 'info')
}

const handleBatchMove = async () => {
  showToast('Batch move coming soon', 'info')
}

const handleBatchDuplicate = async () => {
  showToast('Batch duplicate coming soon', 'info')
}
```

- [ ] **Step 3: Add Delete/Backspace keyboard shortcut for batch delete**

Add a new effect for keyboard shortcuts:

```typescript
// Batch delete on Delete/Backspace when items selected
useEffect(() => {
  if (selectedIds.size < 2) return

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Don't trigger when editing text
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      e.preventDefault()
      handleBatchDelete()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [selectedIds.size, handleBatchDelete])
```

- [ ] **Step 4: Verify action bar appears on multi-select**

Run: `npm run dev` (via preview_start)
Expected: Selecting 2+ items with Cmd+click shows the sticky action bar at the bottom of the nav panel with Move, Duplicate, Delete, and ✕ buttons.

- [ ] **Step 5: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/NavigationTree.tsx
git commit -m "feat: add floating action bar for multi-select batch actions

Shows selection count and action buttons when 2+ items selected.
Delete/Backspace keyboard shortcut triggers batch delete."
```

---

## Chunk 3: Batch Actions Implementation

### Task 3: Create batch actions utility

**Files:**
- Create: `src/lib/batchActions.ts`

- [ ] **Step 1: Create the batchActions.ts file with batch delete**

```typescript
import { SupabaseClient } from '@supabase/supabase-js'
import { fetchPageDeepData, fetchSceneDeepData, fetchActDeepData } from './undoHelpers'

export interface BatchDeleteResult {
  success: boolean
  error?: string
  deletedItems: Array<{ id: string; parentId: string; data: any }>
}

export async function batchDeletePages(
  supabase: SupabaseClient,
  pageIds: string[],
  issue: any
): Promise<BatchDeleteResult> {
  // Deep-fetch all pages in parallel for undo
  const fetchResults = await Promise.allSettled(
    pageIds.map(id => fetchPageDeepData(supabase, id))
  )

  const items: Array<{ id: string; parentId: string; data: any }> = []
  for (let i = 0; i < pageIds.length; i++) {
    const result = fetchResults[i]
    const parentSceneId = findPageParentScene(pageIds[i], issue)
    if (result.status === 'fulfilled' && parentSceneId) {
      items.push({ id: pageIds[i], parentId: parentSceneId, data: result.value })
    }
  }

  // Delete all pages in parallel
  const deleteResults = await Promise.allSettled(
    pageIds.map(id => supabase.from('pages').delete().eq('id', id))
  )

  const errors = deleteResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
  if (errors.length > 0) {
    const firstError = errors[0]
    const msg = firstError.status === 'rejected'
      ? (firstError.reason as Error).message
      : firstError.value.error?.message || 'Unknown error'
    return { success: false, error: msg, deletedItems: items }
  }

  return { success: true, deletedItems: items }
}

export async function batchDeleteScenes(
  supabase: SupabaseClient,
  sceneIds: string[],
  issue: any
): Promise<BatchDeleteResult> {
  const fetchResults = await Promise.allSettled(
    sceneIds.map(id => fetchSceneDeepData(supabase, id))
  )

  const items: Array<{ id: string; parentId: string; data: any }> = []
  for (let i = 0; i < sceneIds.length; i++) {
    const result = fetchResults[i]
    const parentActId = findSceneParentAct(sceneIds[i], issue)
    if (result.status === 'fulfilled' && parentActId) {
      items.push({ id: sceneIds[i], parentId: parentActId, data: result.value })
    }
  }

  const deleteResults = await Promise.allSettled(
    sceneIds.map(id => supabase.from('scenes').delete().eq('id', id))
  )

  const errors = deleteResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
  if (errors.length > 0) {
    const firstError = errors[0]
    const msg = firstError.status === 'rejected'
      ? (firstError.reason as Error).message
      : firstError.value.error?.message || 'Unknown error'
    return { success: false, error: msg, deletedItems: items }
  }

  return { success: true, deletedItems: items }
}

export async function batchDeleteActs(
  supabase: SupabaseClient,
  actIds: string[],
  issue: any
): Promise<BatchDeleteResult> {
  const fetchResults = await Promise.allSettled(
    actIds.map(id => fetchActDeepData(supabase, id))
  )

  const items: Array<{ id: string; parentId: string; data: any }> = []
  for (let i = 0; i < actIds.length; i++) {
    const result = fetchResults[i]
    if (result.status === 'fulfilled') {
      items.push({ id: actIds[i], parentId: issue.id, data: result.value })
    }
  }

  const deleteResults = await Promise.allSettled(
    actIds.map(id => supabase.from('acts').delete().eq('id', id))
  )

  const errors = deleteResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
  if (errors.length > 0) {
    const firstError = errors[0]
    const msg = firstError.status === 'rejected'
      ? (firstError.reason as Error).message
      : firstError.value.error?.message || 'Unknown error'
    return { success: false, error: msg, deletedItems: items }
  }

  return { success: true, deletedItems: items }
}

// Helper: find page's parent scene ID
function findPageParentScene(pageId: string, issue: any): string | null {
  for (const act of issue.acts || []) {
    for (const scene of act.scenes || []) {
      if ((scene.pages || []).some((p: any) => p.id === pageId)) {
        return scene.id
      }
    }
  }
  return null
}

// Helper: find scene's parent act ID
function findSceneParentAct(sceneId: string, issue: any): string | null {
  for (const act of issue.acts || []) {
    if ((act.scenes || []).some((s: any) => s.id === sceneId)) {
      return act.id
    }
  }
  return null
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npm run dev` (via preview_start)
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/batchActions.ts
git commit -m "feat: add batchActions utility for batch delete operations

Parallel deep-fetch for undo data, parallel deletes, structured results."
```

### Task 4: Add batch undo types to UndoContext

**Files:**
- Modify: `src/contexts/UndoContext.tsx`

- [ ] **Step 1: Add batch action types to UndoActionType**

Add to the `UndoActionType` union (after line 37, after `'page_summary_update'`):

```typescript
  // Batch operations
  | 'batch_page_delete'
  | 'batch_scene_delete'
  | 'batch_act_delete'
  | 'batch_page_add'
  | 'batch_scene_add'
  | 'batch_act_add'
```

- [ ] **Step 2: Add batch action interfaces**

Add after `PageSummaryUpdateAction` (after line 270):

```typescript
// --- Batch operations ---

interface BatchPageDeleteAction extends BaseAction {
  type: 'batch_page_delete'
  items: Array<{ pageId: string; sceneId: string; data: any }>
}

interface BatchSceneDeleteAction extends BaseAction {
  type: 'batch_scene_delete'
  items: Array<{ sceneId: string; actId: string; data: any }>
}

interface BatchActDeleteAction extends BaseAction {
  type: 'batch_act_delete'
  items: Array<{ actId: string; issueId: string; data: any }>
}

interface BatchPageAddAction extends BaseAction {
  type: 'batch_page_add'
  items: Array<{ pageId: string; sceneId: string; data: any }>
}

interface BatchSceneAddAction extends BaseAction {
  type: 'batch_scene_add'
  items: Array<{ sceneId: string; actId: string; data: any }>
}

interface BatchActAddAction extends BaseAction {
  type: 'batch_act_add'
  items: Array<{ actId: string; issueId: string; data: any }>
}
```

- [ ] **Step 3: Add batch types to UndoAction union**

Add to the `UndoAction` type (after line 299, after `| SceneDuplicateAction`):

```typescript
  | BatchPageDeleteAction
  | BatchSceneDeleteAction
  | BatchActDeleteAction
  | BatchPageAddAction
  | BatchSceneAddAction
  | BatchActAddAction
```

- [ ] **Step 4: Add batch undo/redo handlers**

Add to the `executeUndo` switch statement (before the `default:` case at line 830):

```typescript
      // === Batch delete (undo = restore all) ===
      case 'batch_page_delete': {
        const a = action as BatchPageDeleteAction
        for (const item of a.items) {
          await restorePageDeep(supabase, { id: item.pageId, ...item.data }, item.sceneId)
        }
        return {
          type: 'batch_page_add' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Add ${a.items.length} pages`,
        }
      }
      case 'batch_scene_delete': {
        const a = action as BatchSceneDeleteAction
        for (const item of a.items) {
          await restoreSceneDeep(supabase, { id: item.sceneId, ...item.data }, item.actId)
        }
        return {
          type: 'batch_scene_add' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Add ${a.items.length} scenes`,
        }
      }
      case 'batch_act_delete': {
        const a = action as BatchActDeleteAction
        for (const item of a.items) {
          await restoreActDeep(supabase, { id: item.actId, ...item.data }, item.issueId)
        }
        return {
          type: 'batch_act_add' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Add ${a.items.length} acts`,
        }
      }

      // === Batch add (undo = delete all, i.e. reverse of batch delete undo) ===
      case 'batch_page_add': {
        const a = action as BatchPageAddAction
        for (const item of a.items) {
          await supabase.from('pages').delete().eq('id', item.pageId)
        }
        return {
          type: 'batch_page_delete' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Delete ${a.items.length} pages`,
        }
      }
      case 'batch_scene_add': {
        const a = action as BatchSceneAddAction
        for (const item of a.items) {
          await supabase.from('scenes').delete().eq('id', item.sceneId)
        }
        return {
          type: 'batch_scene_delete' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Delete ${a.items.length} scenes`,
        }
      }
      case 'batch_act_add': {
        const a = action as BatchActAddAction
        for (const item of a.items) {
          await supabase.from('acts').delete().eq('id', item.actId)
        }
        return {
          type: 'batch_act_delete' as const,
          items: a.items,
          timestamp: Date.now(),
          description: `Delete ${a.items.length} acts`,
        }
      }
```

- [ ] **Step 5: Verify UndoContext compiles**

Run: `npm run dev` (via preview_start)
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/contexts/UndoContext.tsx
git commit -m "feat: add batch undo/redo types for multi-select operations

Batch delete/add for pages, scenes, and acts with full deep restore."
```

### Task 5: Wire batch delete into NavigationTree

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`

- [ ] **Step 1: Import batchActions**

Add to imports at the top:
```typescript
import { batchDeletePages, batchDeleteScenes, batchDeleteActs } from '@/lib/batchActions'
```

- [ ] **Step 2: Replace handleBatchDelete stub**

Replace the `handleBatchDelete` stub function:

```typescript
const handleBatchDelete = async () => {
  if (!selectionType || selectedIds.size === 0) return

  const count = selectedIds.size
  const typeLabel = selectionType === 'page' ? 'page' : selectionType === 'scene' ? 'scene' : 'act'
  const description = selectionType === 'page'
    ? `This will permanently delete all panels on these pages.`
    : selectionType === 'scene'
      ? `This will permanently delete all pages and panels in these scenes.`
      : `This will permanently delete all scenes, pages, and panels in these acts.`

  const confirmed = await confirm({
    title: `Delete ${count} ${typeLabel}${count !== 1 ? 's' : ''}?`,
    description,
  })
  if (!confirmed) return

  const supabase = createClient()
  const ids = Array.from(selectedIds)

  if (selectionType === 'page') {
    const result = await batchDeletePages(supabase, ids, issue)
    if (!result.success) {
      showToast(`Failed to delete pages: ${result.error}`, 'error')
      await onRefresh()
      return
    }

    // Deselect deleted pages
    if (selectedPageId && ids.includes(selectedPageId)) {
      onSelectPage('')
    }

    // Optimistic UI update
    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).map((s: any) => ({
          ...s,
          pages: (s.pages || []).filter((p: any) => !ids.includes(p.id)),
        })),
      })),
    }))

    // Record batch undo
    recordAction({
      type: 'batch_page_delete',
      items: result.deletedItems.map(item => ({ pageId: item.id, sceneId: item.parentId, data: item.data })),
      description: `Delete ${count} pages`,
    })
  } else if (selectionType === 'scene') {
    const result = await batchDeleteScenes(supabase, ids, issue)
    if (!result.success) {
      showToast(`Failed to delete scenes: ${result.error}`, 'error')
      await onRefresh()
      return
    }

    // Deselect if current page was in deleted scenes
    const deletedPageIds = new Set<string>()
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if (ids.includes(scene.id)) {
          for (const page of scene.pages || []) {
            deletedPageIds.add(page.id)
          }
        }
      }
    }
    if (selectedPageId && deletedPageIds.has(selectedPageId)) {
      onSelectPage('')
    }

    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.map((a: any) => ({
        ...a,
        scenes: (a.scenes || []).filter((s: any) => !ids.includes(s.id)),
      })),
    }))

    recordAction({
      type: 'batch_scene_delete',
      items: result.deletedItems.map(item => ({ sceneId: item.id, actId: item.parentId, data: item.data })),
      description: `Delete ${count} scenes`,
    })
  } else if (selectionType === 'act') {
    const result = await batchDeleteActs(supabase, ids, issue)
    if (!result.success) {
      showToast(`Failed to delete acts: ${result.error}`, 'error')
      await onRefresh()
      return
    }

    // Deselect if current page was in deleted acts
    const deletedPageIds = new Set<string>()
    for (const act of issue.acts || []) {
      if (ids.includes(act.id)) {
        for (const scene of act.scenes || []) {
          for (const page of scene.pages || []) {
            deletedPageIds.add(page.id)
          }
        }
      }
    }
    if (selectedPageId && deletedPageIds.has(selectedPageId)) {
      onSelectPage('')
    }

    setIssue((prev: any) => ({
      ...prev,
      acts: prev.acts.filter((a: any) => !ids.includes(a.id)),
    }))

    recordAction({
      type: 'batch_act_delete',
      items: result.deletedItems.map(item => ({ actId: item.id, issueId: item.parentId, data: item.data })),
      description: `Delete ${count} acts`,
    })
  }

  clearSelection()
  showToast(`Deleted ${count} ${typeLabel}${count !== 1 ? 's' : ''}`, 'success')
}
```

- [ ] **Step 3: Replace handleBatchDuplicate stub**

Note: Each `duplicatePage`/`duplicateScene` call records its own individual undo entry. A true batch undo for duplicates would require refactoring those functions to accept an "suppress undo" flag — deferred to V2 if needed. The user can undo multiple times to reverse all duplications.

```typescript
const handleBatchDuplicate = async () => {
  if (!selectionType || selectedIds.size === 0) return

  // Sort IDs by visual position to maintain relative order
  const ids = Array.from(selectedIds)
  const visibleIds = getVisibleItemIds(selectionType)
  ids.sort((a, b) => visibleIds.indexOf(a) - visibleIds.indexOf(b))
  const count = ids.length

  if (selectionType === 'page') {
    for (const id of ids) {
      await duplicatePage(id)
    }
  } else if (selectionType === 'scene') {
    for (const id of ids) {
      await duplicateScene(id)
    }
  }
  // Acts don't have duplicate in the existing system

  clearSelection()
  showToast(`Duplicated ${count} ${selectionType}${count !== 1 ? 's' : ''}`, 'success')
}
```

- [ ] **Step 4: Replace handleBatchMove stub with move popover state**

Note: Each `movePageToScene`/`moveSceneToAct` call records its own individual undo entry. A true batch undo for moves would require refactoring those functions — deferred to V2 if needed. The user can undo multiple times to reverse all moves.

Add state for move popover:
```typescript
const [showMovePopover, setShowMovePopover] = useState(false)
```

Replace `handleBatchMove`:
```typescript
const handleBatchMove = () => {
  setShowMovePopover(prev => !prev)
}
```

Add the move popover JSX inside the action bar, wrapping the Move button:

```tsx
<div className="relative">
  <button
    onClick={() => handleBatchMove()}
    className="px-2.5 py-1 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
  >
    Move
  </button>
  {showMovePopover && selectionType === 'page' && (
    <div className="absolute bottom-full mb-1 right-0 dropdown-panel py-1 min-w-[200px] max-h-48 overflow-y-auto z-50">
      {sortedActs.map((act: any) => {
        const actScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
        return actScenes.map((scene: any) => (
          <button
            key={scene.id}
            onClick={async () => {
              const ids = Array.from(selectedIds)
              for (const id of ids) {
                await movePageToScene(id, scene.id)
              }
              clearSelection()
              setShowMovePopover(false)
              showToast(`Moved ${ids.length} pages to ${scene.title || 'scene'}`, 'success')
            }}
            className="dropdown-item text-xs"
          >
            <span className="opacity-50">{act.name || `Act ${act.number}`} → </span>
            {scene.title || 'Untitled Scene'}
          </button>
        ))
      })}
    </div>
  )}
  {showMovePopover && selectionType === 'scene' && (
    <div className="absolute bottom-full mb-1 right-0 dropdown-panel py-1 min-w-[160px] z-50">
      {sortedActs.map((act: any) => (
        <button
          key={act.id}
          onClick={async () => {
            const ids = Array.from(selectedIds)
            for (const id of ids) {
              await moveSceneToAct(id, act.id)
            }
            clearSelection()
            setShowMovePopover(false)
            showToast(`Moved ${ids.length} scenes to ${act.name || 'act'}`, 'success')
          }}
          className="dropdown-item text-xs"
        >
          {act.name || `Act ${act.number}`}
        </button>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 5: Close move popover on selection clear**

Update `clearSelection` to also close the popover:
```typescript
const clearSelection = useCallback(() => {
  setSelectedIds(new Set())
  setSelectionType(null)
  setLastClickedId(null)
  setShowMovePopover(false)
}, [])
```

- [ ] **Step 6: Verify batch actions work**

Run: `npm run dev` (via preview_start)
Expected: Multi-select pages, click Delete → confirmation → pages deleted. Move shows scene picker. Duplicate creates copies.

- [ ] **Step 7: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/NavigationTree.tsx src/lib/batchActions.ts
git commit -m "feat: implement batch delete, move, and duplicate for multi-select

Batch delete with confirmation and full undo support.
Move popover shows valid targets. Duplicate iterates existing functions."
```

---

## Chunk 4: Multi-Drag and Context Menu

### Task 6: Update drag handlers for multi-item drag

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`

- [ ] **Step 1: Update handleDragStart to include selection**

Replace `handleDragStart` (line 1464-1483):

```typescript
const handleDragStart = (event: DragStartEvent) => {
  const { active } = event
  const itemId = active.id as string
  const itemType = getItemType(itemId)

  if (!itemType) return

  // If dragging an item that's not in the selection, clear selection
  // and drag just that item (standard OS behavior)
  if (selectedIds.size > 0 && !selectedIds.has(itemId)) {
    clearSelection()
  }

  let sourceId = ''
  if (itemType === 'page') {
    const loc = findPageLocation(itemId)
    sourceId = loc?.sceneId || ''
  } else if (itemType === 'scene') {
    const loc = findSceneLocation(itemId)
    sourceId = loc?.actId || ''
  } else {
    sourceId = 'root'
  }

  setActiveDragItem({ id: itemId, type: itemType, sourceId })
}
```

- [ ] **Step 2: Update handleUnifiedDragEnd for multi-page drag**

The existing `handleUnifiedDragEnd` handles single items. We need to modify the page drop case to handle all selected pages.

In the page section (around line 1563-1627), after the `if (dragItem.type === 'page')` block, wrap the existing logic:

```typescript
    } else if (dragItem.type === 'page') {
      const sourceLocation = findPageLocation(activeId)
      if (!sourceLocation) return

      // Collect all page IDs to move (either multi-selected or just the dragged one)
      // Sort by visual position to maintain relative order during multi-drop
      const pageIdsToMove = (selectedIds.size > 1 && selectedIds.has(activeId) && selectionType === 'page')
        ? (() => {
            const ids = Array.from(selectedIds)
            const visibleIds = getVisibleItemIds('page')
            ids.sort((a, b) => visibleIds.indexOf(a) - visibleIds.indexOf(b))
            return ids
          })()
        : [activeId]

      if (overType === 'page') {
        const overLocation = findPageLocation(overId)
        if (!overLocation) return

        if (pageIdsToMove.length === 1) {
          // Single page — use existing logic
          if (sourceLocation.sceneId === overLocation.sceneId) {
            await handlePageDragEnd(sourceLocation.sceneId, event)
          } else {
            await movePageToScene(activeId, overLocation.sceneId, overId)
          }
        } else {
          // Multi-page drop — move all to target scene
          for (const id of pageIdsToMove) {
            if (id !== overId) {
              await movePageToScene(id, overLocation.sceneId)
            }
          }
          clearSelection()
        }
      } else if (overType === 'scene') {
        if (pageIdsToMove.length === 1) {
          if (sourceLocation.sceneId !== overId) {
            await movePageToScene(activeId, overId)
          }
        } else {
          for (const id of pageIdsToMove) {
            await movePageToScene(id, overId)
          }
          clearSelection()
        }
      } else if (overType === 'act') {
        // Keep existing act drop logic but apply to all selected pages
        const targetAct = (issue.acts || []).find((a: any) => a.id === overId)
        if (!targetAct) return

        const targetScenes = (targetAct.scenes || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
        let targetSceneId = targetScenes[0]?.id

        if (!targetSceneId) {
          const supabase = createClient()
          const { data: newScene, error: sceneError } = await supabase
            .from('scenes').insert({ act_id: overId, title: 'Scene 1', sort_order: 1 }).select().single()
          if (sceneError || !newScene) {
            showToast('Failed to create scene for page move', 'error')
            return
          }
          setIssue((prev: any) => ({
            ...prev,
            acts: prev.acts.map((a: any) => a.id === overId
              ? { ...a, scenes: [...(a.scenes || []), { ...newScene, pages: [] }] }
              : a
            ),
          }))
          targetSceneId = newScene.id
        }

        for (const id of pageIdsToMove) {
          await movePageToScene(id, targetSceneId)
        }
        if (pageIdsToMove.length > 1) clearSelection()
      }
    }
```

- [ ] **Step 3: Add multi-scene drag handling in handleUnifiedDragEnd**

After the page section, add scene multi-drag logic. Find the existing scene handling in `handleUnifiedDragEnd` (the `else if (dragItem.type === 'scene')` block) and wrap similarly:

```typescript
    } else if (dragItem.type === 'scene') {
      const sourceLocation = findSceneLocation(activeId)
      if (!sourceLocation) return

      // Collect all scene IDs to move (multi-selected or just the dragged one)
      const sceneIdsToMove = (selectedIds.size > 1 && selectedIds.has(activeId) && selectionType === 'scene')
        ? (() => {
            const ids = Array.from(selectedIds)
            const visibleIds = getVisibleItemIds('scene')
            ids.sort((a, b) => visibleIds.indexOf(a) - visibleIds.indexOf(b))
            return ids
          })()
        : [activeId]

      if (overType === 'act') {
        // Move scene(s) to target act
        for (const id of sceneIdsToMove) {
          const loc = findSceneLocation(id)
          if (loc && loc.actId !== overId) {
            await moveSceneToAct(id, overId)
          }
        }
        if (sceneIdsToMove.length > 1) clearSelection()
      } else if (overType === 'scene') {
        const overLocation = findSceneLocation(overId)
        if (!overLocation) return

        if (sceneIdsToMove.length === 1) {
          // Single scene — use existing logic
          if (sourceLocation.actId === overLocation.actId) {
            await handleSceneDragEnd(sourceLocation.actId, event)
          } else {
            await moveSceneToAct(activeId, overLocation.actId)
          }
        } else {
          // Multi-scene: move all to target act
          for (const id of sceneIdsToMove) {
            const loc = findSceneLocation(id)
            if (loc && loc.actId !== overLocation.actId) {
              await moveSceneToAct(id, overLocation.actId)
            }
          }
          clearSelection()
        }
      }
    }
```

Note: Each `moveSceneToAct` call records its own individual undo entry — same V1 pragmatic approach as batch move/duplicate. The user can undo multiple times to reverse all moves.

- [ ] **Step 4: Update DragOverlay for multi-item display**

Replace the DragOverlay content (around lines 2025-2056):

```tsx
<DragOverlay dropAnimation={null}>
  {activeDragItem && (() => {
    const { id, type } = activeDragItem
    const isMultiDrag = selectedIds.size > 1 && selectedIds.has(id) && selectionType === type
    const dragCount = isMultiDrag ? selectedIds.size : 1

    if (type === 'act') {
      const act = (issue.acts || []).find((a: any) => a.id === id)
      return (
        <div className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg text-sm font-extrabold uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-2">
          {act?.name || 'Act'}
          {dragCount > 1 && (
            <span className="bg-[var(--color-primary)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{dragCount}</span>
          )}
        </div>
      )
    }
    if (type === 'scene') {
      const loc = findSceneLocation(id)
      const plotline = loc?.scene?.plotline_id ? plotlines.find(p => p.id === loc.scene.plotline_id) : null
      return (
        <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg flex items-center gap-2">
          {plotline && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: plotline.color }} />}
          <span className="type-label text-[var(--text-primary)]">{loc?.scene?.title || 'Scene'}</span>
          {dragCount > 1 && (
            <span className="bg-[var(--color-primary)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{dragCount}</span>
          )}
        </div>
      )
    }
    if (type === 'page') {
      const pos = pagePositionMap.get(id)
      return (
        <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg type-label text-[var(--text-primary)] tabular-nums flex items-center gap-2">
          Page {pos || '?'}
          {dragCount > 1 && (
            <span className="bg-[var(--color-primary)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{dragCount}</span>
          )}
        </div>
      )
    }
    return null
  })()}
</DragOverlay>
```

- [ ] **Step 5: Update SortableItem opacity for multi-selected drag**

Modify SortableItem to accept and use a `isPartOfMultiDrag` prop. Replace the SortableItem component (lines 49-80):

```typescript
function SortableItem({ id, children, isPartOfMultiDrag }: { id: string; children: React.ReactNode; isPartOfMultiDrag?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isPartOfMultiDrag ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging
        ? 'ring-1 ring-[var(--border-strong)] ring-dashed bg-[var(--bg-secondary)]'
        : 'transition-all duration-150 ease-out'
      }
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}
```

Then, update the SortableItem usages to pass `isPartOfMultiDrag`:

For pages (line 1876):
```tsx
<SortableItem key={page.id} id={page.id} isPartOfMultiDrag={activeDragItem && selectedIds.size > 1 && selectedIds.has(page.id) && activeDragItem.id !== page.id}>
```

For scenes (line 1811):
```tsx
<SortableItem key={scene.id} id={scene.id} isPartOfMultiDrag={activeDragItem && selectedIds.size > 1 && selectedIds.has(scene.id) && activeDragItem.id !== scene.id}>
```

For acts (line 1745):
```tsx
<SortableItem key={act.id} id={act.id} isPartOfMultiDrag={activeDragItem && selectedIds.size > 1 && selectedIds.has(act.id) && activeDragItem.id !== act.id}>
```

- [ ] **Step 6: Verify multi-drag works**

Run: `npm run dev` (via preview_start)
Expected: Select multiple pages, drag one → all selected ghost at 30% opacity, overlay shows count badge. Drop moves all pages. Select multiple scenes, drag → moves all to target act.

- [ ] **Step 7: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/NavigationTree.tsx
git commit -m "feat: multi-item drag-and-drop with count badge overlay

Selected items ghost at 30% opacity during drag. Overlay shows item count.
Multi-page drop moves all selected pages to target scene."
```

### Task 7: Update context menu for batch operations

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx` (context menu section, lines 2060-2237)

- [ ] **Step 1: Add batch-aware context menu items**

Update the context menu rendering. When right-clicking a selected item while multi-select is active, show batch actions. When right-clicking an unselected item, clear selection and show single-item menu.

Add a computed value before the return statement:

```typescript
const isContextMenuItemMultiSelected = contextMenu && selectedIds.has(contextMenu.id) && selectedIds.size > 1
```

Update the `onContextMenu` handlers for pages, scenes, and acts to clear selection when right-clicking unselected items. Add this logic to the existing `handleContextMenu`:

```typescript
const handleContextMenu = (
  e: React.MouseEvent,
  type: 'act' | 'scene' | 'page',
  id: string,
  title: string
) => {
  e.preventDefault()
  e.stopPropagation()
  // If right-clicking an item not in the current selection, clear selection
  if (selectedIds.size > 0 && !selectedIds.has(id)) {
    clearSelection()
  }
  setContextMenu({ x: e.clientX, y: e.clientY, type, id, title })
  setContextSubmenu(null)
}
```

Then update the Delete button in the context menu (around line 2218-2235):

```tsx
<button
  onClick={() => {
    if (isContextMenuItemMultiSelected) {
      handleBatchDelete()
    } else if (contextMenu.type === 'act') {
      deleteAct(contextMenu.id, contextMenu.title)
    } else if (contextMenu.type === 'scene') {
      const sceneLocation = findSceneLocation(contextMenu.id)
      const scene = sceneLocation?.scene
      deleteScene(contextMenu.id, contextMenu.title, scene?.pages?.length || 0)
    } else if (contextMenu.type === 'page') {
      const position = pagePositionMap.get(contextMenu.id) || 0
      deletePage(contextMenu.id, position)
    }
    closeContextMenu()
  }}
  className="dropdown-item text-xs !text-red-400 hover:!text-red-300"
>
  {isContextMenuItemMultiSelected
    ? `Delete ${selectedIds.size} ${selectionType}${selectedIds.size !== 1 ? 's' : ''}`
    : 'Delete'
  }
</button>
```

Update the Move button (the existing "Move to..." submenu) similarly:

```tsx
{(contextMenu.type === 'scene' || contextMenu.type === 'page') && (
  <button
    onClick={() => {
      if (isContextMenuItemMultiSelected) {
        handleBatchMove()
        closeContextMenu()
      } else {
        // existing move submenu behavior
        setContextSubmenu('move')
      }
    }}
    className="dropdown-item text-xs"
  >
    {isContextMenuItemMultiSelected
      ? `Move ${selectedIds.size} ${selectionType}${selectedIds.size !== 1 ? 's' : ''}`
      : 'Move to...'
    }
  </button>
)}
```

Note: When the context menu "Move" is clicked in batch mode, it opens the same action bar Move popover. The single-item context menu retains its existing submenu behavior.

Update the Duplicate button similarly:

```tsx
{(contextMenu.type === 'scene' || contextMenu.type === 'page') && (
  <button
    onClick={() => {
      if (isContextMenuItemMultiSelected) {
        handleBatchDuplicate()
      } else if (contextMenu.type === 'page') {
        duplicatePage(contextMenu.id)
      } else {
        duplicateScene(contextMenu.id)
      }
      closeContextMenu()
    }}
    className="dropdown-item text-xs"
  >
    {isContextMenuItemMultiSelected
      ? `Duplicate ${selectedIds.size} ${selectionType}${selectedIds.size !== 1 ? 's' : ''}`
      : 'Duplicate'
    }
  </button>
)}
```

- [ ] **Step 2: Verify context menu shows batch variants**

Run: `npm run dev` (via preview_start)
Expected: Multi-select 3 pages, right-click one → "Delete 3 pages", "Duplicate 3 pages". Right-click unselected item → single-item menu.

- [ ] **Step 3: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/NavigationTree.tsx
git commit -m "feat: batch-aware context menu for multi-selected items

Right-click on multi-selected item shows batch actions with count.
Right-click on unselected item clears selection and shows single menu."
```

---

## Chunk 5: Final Polish & Verification

### Task 8: Edge cases and cleanup

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`

- [ ] **Step 1: Clear move popover on click outside**

Add an effect:
```typescript
useEffect(() => {
  if (!showMovePopover) return
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-move-popover]')) {
      setShowMovePopover(false)
    }
  }
  // Slight delay to not close immediately on the button click
  const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('click', handleClick)
  }
}, [showMovePopover])
```

Add `data-move-popover` attribute to the move button's parent `<div className="relative">`.

- [ ] **Step 2: Run full build check**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Manual verification checklist**

Run: `npm run dev` (via preview_start) and verify:
1. Cmd+click toggles pages/scenes/acts into selection with visual highlight
2. Shift+click selects a range of same-type items
3. Plain click clears selection and navigates normally
4. Escape clears selection
5. Action bar appears at 2+ selected items with correct count
6. Batch delete shows confirmation, deletes all, and is undoable
7. Batch duplicate creates copies of all selected items
8. Move popover shows valid targets and moves all selected items
9. Multi-drag shows count badge, all selected items ghost during drag
10. Context menu shows batch variants when right-clicking a selected item
11. Right-clicking unselected item clears selection

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: multi-select navigation tree polish and edge cases

Clear selection on structural changes, close move popover on outside click."
```
