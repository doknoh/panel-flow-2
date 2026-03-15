# Weave Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign both the issue-level weave (flatplan with spread pairing, scene regions, side drawer) and series-level weave (matrix with density bars, markers, totals row) to match the approved mockups.

**Architecture:** The 1,680-line `WeaveView.tsx` is decomposed into 7 focused sub-components extracted into a `components/` directory alongside it. Business logic (DnD, selection, save handlers, spread computation) stays in the parent but is slimmed down. The 538-line `SeriesWeaveClient.tsx` gets a visual refresh in-place. All components use CSS variables from `globals.css` for theme support — no hardcoded colors.

**Tech Stack:** React 19, Tailwind CSS 4, dnd-kit (core 6.3, sortable 10.0), Supabase client, CSS custom properties for theming.

**Design Reference:** Approved mockups in the MAIN repo (not the worktree) at `/Users/noahcallahan-bever/projects/panel-flow-2/.superpowers/brainstorm/6869-1773527485/`:
- `design-revised-flatplan.html` — issue weave flatplan (dark + light themes, spread pairing, drag handles, scene breaks)
- `design-series-weave.html` — series weave matrix (dark + light, density bars, markers, totals)
- `design-issue-weave.html` — earlier issue weave iteration (drawer design)
- `design-split-spread.html` — split-scene spread edge case
- `design-drag-handles.html` — drag handle placement options

**Font strategy:** The mockup uses Helvetica Neue and Courier Prime. Use inline `style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}` for display type and `font-mono` Tailwind class for Courier (the project already loads monospace). Do NOT use `font-['Helvetica_Neue']` Tailwind syntax — it doesn't work reliably.

---

## File Structure

### New Files
| File | Purpose | ~Lines |
|------|---------|--------|
| `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeavePageCard.tsx` | Individual page card — 86×118px flatplan card with drag handle, checkbox, plotline bar, stats, beat preview | 180 |
| `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveSpread.tsx` | Spread pair container — spine, scene-break gradient, number labels below | 120 |
| `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveSceneRegion.tsx` | Scene wrapper — color-tinted background, scene label with select-all | 60 |
| `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveDrawer.tsx` | Side detail panel — page stats, editable story beat + plotline, read-only intention/characters/scene, "Open in Editor" link | 200 |
| `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveHeader.tsx` | Header bar — back link, title, page/spread counts, "Manage Plotlines" button | 70 |
| `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveSelectionToolbar.tsx` | Selection actions — count display, "Move to Scene," "Assign Plotline," "Deselect All" | 80 |
| `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeavePlotlineManager.tsx` | Plotline CRUD panel — extracted from WeaveView (color picker, create, delete) | 130 |
| `src/lib/weave-spreads.ts` | Spread computation utility — pure function extracting spread grouping logic from WeaveView | 80 |
| `src/lib/weave-spreads.test.ts` | Tests for spread computation | 120 |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx` | Major rewrite: remove inline SortablePage/InsideCover, import sub-components, new layout with 3-per-row spreads inside scene regions, side drawer integration. Drops from ~1,680 to ~500 lines. |
| `src/app/series/[seriesId]/weave/SeriesWeaveClient.tsx` | Visual refresh: density bars, bold page counts, marker badge pills, totals row, series arc labels, CSS variable theming. Same structure, better aesthetics. |
| `src/app/globals.css` | Add weave-specific CSS custom properties if needed (scene region opacity, card dimensions) |

---

## Chunk 1: Foundation — Extract & Build Utilities

### Task 1: Extract spread computation into utility

**Files:**
- Create: `src/lib/weave-spreads.ts`
- Create: `src/lib/weave-spreads.test.ts`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx` (remove inline spread code, import utility)

The spread computation logic (lines 1078-1193 of WeaveView.tsx) is a pure function that groups flat pages into spread pairs. Extract it so it can be tested independently and reused by the new layout.

- [ ] **Step 1: Create `src/lib/weave-spreads.ts`**

Export the `SpreadGroup` interface and `computeSpreads` function. The function takes a `FlatPage[]` and returns `SpreadGroup[]`. Copy the algorithm from WeaveView.tsx lines 1078-1193 verbatim, but:
- Export `SpreadGroup` interface with fields: `left: FlatPage | null`, `right: FlatPage | null`, `isFirst: boolean`, `isLinkedSpread: boolean`, `isSplash: boolean`
- Export `FlatPage` interface (or import from a shared types file if one exists — check first)
- The function signature: `computeSpreads(flatPages: FlatPage[]): SpreadGroup[]`

Note: Scene grouping is done inline in WeaveView (Task 9), not in this utility, because it depends on component state and the scene lookup structure.

- [ ] **Step 2: Write tests in `src/lib/weave-spreads.test.ts`**

```typescript
import { describe, test, expect } from 'vitest'
import { computeSpreads } from './weave-spreads'

// Test cases:
// 1. Empty array returns empty
// 2. Single page → first spread (null left, page right)
// 3. Two pages → first spread (null + p1) + second spread (p2 left, empty right)
// 4. Three pages → first spread (null + p1) + second spread (p2 + p3)
// 5. SPREAD_LEFT + SPREAD_RIGHT linked → isLinkedSpread true
// 6. SPLASH page → isSplash true, solo spread
// 7. Mixed types: SINGLE, SPLASH, LINKED in sequence
// 8. Odd number of pages: last page is solo on left with empty right
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/lib/weave-spreads.test.ts`

- [ ] **Step 4: Update WeaveView.tsx to import from utility**

Replace the inline spread computation with `import { computeSpreads, SpreadGroup } from '@/lib/weave-spreads'`. Remove the local `SpreadGroup` interface and the spread computation block (~115 lines removed).

- [ ] **Step 5: Verify the existing weave page still works**

Run: `npx next build` (or dev server) — ensure no TypeScript errors. Visually verify the weave page still renders.

- [ ] **Step 6: Commit**

```bash
git add src/lib/weave-spreads.ts src/lib/weave-spreads.test.ts src/app/series/\[seriesId\]/issues/\[issueId\]/weave/WeaveView.tsx
git commit -m "refactor: extract spread computation into testable utility"
```

---

### Task 2: Extract WeavePlotlineManager

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeavePlotlineManager.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx`

Extract the plotline manager panel (create, delete, color picker) into its own component.

- [ ] **Step 1: Create `WeavePlotlineManager.tsx`**

Props interface:
```typescript
interface WeavePlotlineManagerProps {
  plotlines: Plotline[]
  onCreatePlotline: (name: string) => void
  onDeletePlotline: (id: string) => void
  onUpdateColor: (id: string, color: string) => void
}
```

Move the plotline manager JSX from WeaveView.tsx (the `showPlotlineManager` conditional block, ~80 lines) into this component. The component manages its own local state for `newPlotlineName`, `editingPlotlineId`, `editingPlotlineColor`. The `PLOTLINE_COLORS` constant moves here too.

Use CSS variables: `bg-[var(--bg-secondary)]`, `text-[var(--text-primary)]`, `border-[var(--border)]`, etc.

- [ ] **Step 2: Update WeaveView.tsx to use WeavePlotlineManager**

Replace inline plotline manager JSX with `<WeavePlotlineManager>`, passing the three handlers as props. Remove local state for `newPlotlineName`, `editingPlotlineId`, `editingPlotlineColor` from WeaveView.

- [ ] **Step 3: Verify plotline creation, deletion, and color changes work**

Visual test: open weave, toggle plotline manager, create a plotline, change its color, delete it.

- [ ] **Step 4: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/components/WeavePlotlineManager.tsx src/app/series/\[seriesId\]/issues/\[issueId\]/weave/WeaveView.tsx
git commit -m "refactor: extract WeavePlotlineManager component"
```

---

### Task 3: Build WeavePageCard component

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeavePageCard.tsx`

Build the new flatplan-style page card (86×118px). This replaces the old `SortablePage` component (~325 lines) with a smaller, tighter design matching the approved mockup.

- [ ] **Step 1: Create `WeavePageCard.tsx`**

Props interface:
```typescript
interface WeavePageCardProps {
  page: FlatPage
  isFirstPage: boolean
  isSelected: boolean
  isActive: boolean           // currently viewed in drawer
  isJustMoved: boolean
  plotlines: Plotline[]
  onSelect: (pageId: string, event: React.MouseEvent) => void
  onClick: (pageId: string) => void  // opens drawer
  panelCount: number
  wordCount: number
}
```

Visual structure (matching mockup):
1. **Plotline color bar** — 4px top border using plotline color. Multi-plotline: split bar (flex row of colored segments).
2. **Checkbox** — top-right, 13×13px. `border-[var(--border)]` unchecked, `bg-[var(--color-primary)]` checked with white checkmark.
3. **Drag handle + page number + orientation** — top-left row. 6-dot grip pattern (2×3 grid of 2.5px circles, `bg-[var(--border)]` at rest, `bg-[var(--text-muted)]` on card hover). Page number in Helvetica 24px weight-900 `text-[var(--text-primary)]` via inline style. Orientation badge: tiny "L" or "R" circle (based on `page.orientation`) in 6px text, `bg-[var(--color-primary)]` with white text, positioned next to the page number.
4. **Stats** — `{panelCount}p · {wordCount}w` in `font-mono` 7px `text-[var(--text-muted)]`.
5. **Story beat preview** — 1-2 lines, Courier 6.5px `text-[var(--text-secondary)]`, overflow hidden.

Card container:
- Width: 86px, height: 118px
- Background: `bg-[var(--bg-elevated)]` (white in light, dark card in dark)
- Border: `border border-[var(--border-subtle)]`
- When selected: `ring-2 ring-[var(--color-primary)]`
- When active (drawer): `ring-2 ring-[var(--color-primary)] shadow-[var(--shadow-md)]`
- When just moved: `ring-2 ring-[var(--color-success)]`

Use `useSortable` from dnd-kit (same as current SortablePage) for drag functionality. Disable drag on `isFirstPage`.

- [ ] **Step 2: Verify it renders at correct size**

Temporarily render a `WeavePageCard` in a test harness or storybook-style page to confirm dimensions and layout match mockup.

- [ ] **Step 3: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/components/WeavePageCard.tsx
git commit -m "feat: add WeavePageCard component (flatplan card design)"
```

---

### Task 4: Build WeaveSpread component

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveSpread.tsx`

Renders a spread pair: left card + spine + right card, with page numbers below.

- [ ] **Step 1: Create `WeaveSpread.tsx`**

Props interface:
```typescript
interface WeaveSpreadProps {
  spread: SpreadGroup
  children: React.ReactNode  // The two WeavePageCard children
  leftScene?: Scene | null
  rightScene?: Scene | null
}
```

Visual structure:
1. **Vertical container** — flex-col, align-items center
2. **Horizontal pair** — flex-row, gap 0
   - Left card area: `border-radius: 3px 0 0 3px` (or InsideCover placeholder for first spread)
   - **Spine**: 3px wide, gradient `bg-[var(--border)]` → `bg-[var(--bg-primary)]` → `bg-[var(--border)]`
   - Right card area: `border-radius: 0 3px 3px 0`
3. **Scene-break spine** — When `leftScene?.id !== rightScene?.id` AND both exist: 4px spine with gradient from left scene's plotline color to right scene's plotline color. Small "SCENE BREAK" label below in Courier 7px `text-[var(--text-muted)]`.
4. **Page numbers below** — Centered under each page, Courier 9px `font-weight: 700` `text-[var(--text-secondary)]`. On scene breaks, numbers use respective plotline colors.

- [ ] **Step 2: Test that spine renders correctly in both regular and scene-break modes**

Visual verification in dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/components/WeaveSpread.tsx
git commit -m "feat: add WeaveSpread component with spine and scene-break indicator"
```

---

## Chunk 2: New UI Components

### Task 5: Build WeaveDrawer component

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveDrawer.tsx`

The persistent right-side detail panel. Shows full page details when a page is clicked. Editable: story beat + plotline. Read-only: stats, intention, characters, scene.

- [ ] **Step 1: Create `WeaveDrawer.tsx`**

Props interface:
```typescript
interface WeaveDrawerProps {
  page: FlatPage | null              // null = drawer closed
  panelCount: number
  wordCount: number
  dialogueRatio: number              // percentage
  plotlines: Plotline[]
  onClose: () => void
  onSaveStoryBeat: (pageId: string, value: string) => void
  onAssignPlotline: (pageId: string, plotlineId: string | null) => void
  seriesId: string
  issueId: string
}
```

Visual structure (matching mockup side drawer):
1. **Header** — `PAGE {N}` in Helvetica 22px weight-900, orientation badge (RIGHT/LEFT) in Courier 9px, close button ✕
2. **Plotline selector** — Color dot + `<select>` dropdown with plotline options. Editable.
3. **Stats row** — PANELS / WORDS / DIALOGUE as three columns. Label in Helvetica 7px weight-700 `text-[var(--text-muted)]`, value in Courier 14px weight-700 `text-[var(--text-primary)]`. Separated by `border-b border-[var(--border-subtle)]`.
4. **Story beat** — Label "STORY BEAT", editable `<textarea>` with `bg-[var(--bg-primary)]` `border-[var(--border)]`. Courier 11px. Auto-saves on blur via `onSaveStoryBeat`.
5. **Characters** — Label "CHARACTERS", pills showing unique speaker names extracted from `page.panels[].dialogue_blocks[].speaker_name`. Deduplicate and uppercase. `font-mono` 9px, `bg-[var(--bg-tertiary)]` pills. Read-only.
6. **Intention** — Label "INTENTION", value in Courier 10px `text-[var(--color-primary)]`. Read-only.
7. **Scene** — Label "SCENE", scene name in plotline color. Read-only.
8. **Spacer** — flex-1
9. **Action button** — "OPEN IN EDITOR →" full-width button, `bg-[var(--color-primary)]` white text. Links to `/series/{seriesId}/issues/{issueId}?page={pageId}`.

Drawer container: `w-[260px] bg-[var(--bg-secondary)] border-l-2 border-[var(--color-primary)]`

- [ ] **Step 2: Handle the `page === null` case**

When no page is selected, either hide the drawer entirely (full-width flatplan) or show an empty state message. Recommend: hide the drawer and let the flatplan take full width, so the layout is `flex: 1` for flatplan + conditional 260px drawer.

- [ ] **Step 3: Verify drawer renders correctly with sample data**

Visual verification in dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/components/WeaveDrawer.tsx
git commit -m "feat: add WeaveDrawer side panel with editable story beat and plotline"
```

---

### Task 6: Build WeaveHeader and WeaveSelectionToolbar

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveHeader.tsx`
- Create: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveSelectionToolbar.tsx`

- [ ] **Step 1: Create `WeaveHeader.tsx`**

Props:
```typescript
interface WeaveHeaderProps {
  issueNumber: number
  pageCount: number
  spreadCount: number
  showPlotlineManager: boolean
  onTogglePlotlineManager: () => void
  seriesId: string
  issueId: string
}
```

Visual structure:
- Left: `← ISSUE #{N}` link (Helvetica 11px weight-800 `text-[var(--text-muted)]`) + `//` separator + `THE WEAVE` (Helvetica 18px weight-900 `text-[var(--text-primary)]`)
- Right: `{pageCount} PAGES · {spreadCount} SPREADS` (Courier 10px `text-[var(--text-muted)]`) + divider + `MANAGE PLOTLINES` button (Helvetica 10px weight-700 `text-[var(--color-primary)]`)

- [ ] **Step 2: Create `WeaveSelectionToolbar.tsx`**

Props:
```typescript
interface WeaveSelectionToolbarProps {
  selectedCount: number
  scenes: Scene[]
  plotlines: Plotline[]
  onMoveToScene: (sceneId: string) => void
  onAssignPlotline: (plotlineId: string) => void
  onDeselectAll: () => void
}
```

Visual structure:
- Left: `{N} PAGES SELECTED` (Courier 10px `text-[var(--color-primary)]`)
- Right: `MOVE TO SCENE ▾` dropdown + `ASSIGN PLOTLINE ▾` dropdown + `DESELECT ALL` button (`text-[var(--color-error)]`)
- Container: `bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded`
- Only rendered when `selectedCount > 0`

Both dropdowns should use Radix `<Select>` for accessibility (already in the project's dependencies).

- [ ] **Step 3: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/components/WeaveHeader.tsx src/app/series/\[seriesId\]/issues/\[issueId\]/weave/components/WeaveSelectionToolbar.tsx
git commit -m "feat: add WeaveHeader and WeaveSelectionToolbar components"
```

---

### Task 7: Build WeaveSceneRegion component

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveSceneRegion.tsx`

Wraps a group of spreads belonging to the same scene with a color-tinted background.

- [ ] **Step 1: Create `WeaveSceneRegion.tsx`**

Props:
```typescript
interface WeaveSceneRegionProps {
  scene: Scene
  plotlineColor: string           // resolved color string
  pageCount: number
  onSelectAll: (sceneId: string) => void
  children: React.ReactNode       // WeaveSpread components
}
```

Visual structure:
1. **Container** — `border-radius: 6px`, padding 12px 14px, margin-bottom 4px. Background: `rgba({plotlineColor}, 0.03)` in dark mode, `rgba({plotlineColor}, 0.04)` in light mode. Use inline style for dynamic plotline color opacity.
2. **Scene label row** — flex between:
   - Left: Color dot (8px circle in plotline color) + scene name (Helvetica 9px weight-700 in plotline color, uppercase)
   - Right: `{pageCount} pages · click to select all` (Courier 8px `text-[var(--text-muted)]`)
   - Entire row is clickable → calls `onSelectAll(scene.id)`
3. **Spreads container** — flex-row, flex-wrap, gap 32px. Renders children (WeaveSpread components).

The `rgba` with dynamic color: parse hex to RGB, apply as inline `backgroundColor` style. Add a `hexToRgba(hex: string, alpha: number): string` utility to `src/lib/utils.ts` (where other general utilities live). Implementation: `const r = parseInt(hex.slice(1,3), 16)` etc., return `rgba(r, g, b, alpha)`.

- [ ] **Step 2: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/components/WeaveSceneRegion.tsx
git commit -m "feat: add WeaveSceneRegion with color-tinted background"
```

---

## Chunk 3: Assembly — Rewrite WeaveView

### Task 8: Compute page stats (panel count, word count) for cards and drawer

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx`

The new cards need panel count and word count per page. The drawer needs dialogue ratio. Currently, `generatePageSummary` extracts text but doesn't count. Add memoized stats computation.

- [ ] **Step 1: Add stats computation to WeaveView**

```typescript
const pageStats = useMemo(() => {
  const stats = new Map<string, { panelCount: number; wordCount: number; dialogueRatio: number }>()
  for (const fp of baseFlatPages) {
    const panels = fp.page.panels || []
    const panelCount = panels.length
    let totalWords = 0
    let dialogueWords = 0
    for (const panel of panels) {
      // Visual description words
      const descWords = (panel.visual_description || '').trim().split(/\s+/).filter(Boolean).length
      totalWords += descWords
      // Dialogue words
      for (const db of panel.dialogue_blocks || []) {
        const dw = (db.text || '').trim().split(/\s+/).filter(Boolean).length
        totalWords += dw
        dialogueWords += dw
      }
      // Caption words
      for (const cap of panel.captions || []) {
        const cw = (cap.text || '').trim().split(/\s+/).filter(Boolean).length
        totalWords += cw
      }
    }
    stats.set(fp.page.id, {
      panelCount,
      wordCount: totalWords,
      dialogueRatio: totalWords > 0 ? Math.round((dialogueWords / totalWords) * 100) : 0,
    })
  }
  return stats
}, [baseFlatPages])
```

- [ ] **Step 2: Verify stats compute correctly**

Add a console.log temporarily to spot-check a page with known content. Remove after verification.

- [ ] **Step 3: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/WeaveView.tsx
git commit -m "feat: add memoized page stats computation for weave cards"
```

---

### Task 9: Group spreads by scene for scene-region rendering

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx`

The new layout renders spreads grouped into scene regions. Need to compute this grouping.

- [ ] **Step 1: Add scene-grouped spreads computation**

After computing `spreads` from `computeSpreads(flatPages)`, group them by scene:

```typescript
const sceneGroupedSpreads = useMemo(() => {
  const groups: Array<{ scene: Scene; spreads: SpreadGroup[] }> = []
  let currentScene: Scene | null = null
  let currentGroup: SpreadGroup[] = []

  for (const spread of spreads) {
    // Determine the scene for this spread (use left page's scene, or right if left is null/IFC)
    const spreadPage = spread.left || spread.right
    const scene = spreadPage ? spreadPage.scene : null

    if (scene && scene.id !== currentScene?.id) {
      // New scene — flush current group
      if (currentScene && currentGroup.length > 0) {
        groups.push({ scene: currentScene, spreads: currentGroup })
      }
      currentScene = scene
      currentGroup = [spread]
    } else {
      currentGroup.push(spread)
    }
  }
  // Flush final group
  if (currentScene && currentGroup.length > 0) {
    groups.push({ scene: currentScene, spreads: currentGroup })
  }

  return groups
}, [spreads])
```

- [ ] **Step 2: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/WeaveView.tsx
git commit -m "feat: compute scene-grouped spreads for region rendering"
```

---

### Task 10: Rewrite WeaveView layout with new components

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx`

This is the big assembly task. Replace the current JSX rendering with the new component hierarchy.

- [ ] **Step 1: Update imports**

```typescript
import { WeaveHeader } from './components/WeaveHeader'
import { WeaveSelectionToolbar } from './components/WeaveSelectionToolbar'
import { WeaveSceneRegion } from './components/WeaveSceneRegion'
import { WeaveSpread } from './components/WeaveSpread'
import { WeavePageCard } from './components/WeavePageCard'
import { WeaveDrawer } from './components/WeaveDrawer'
import { WeavePlotlineManager } from './components/WeavePlotlineManager'
import { computeSpreads } from '@/lib/weave-spreads'
```

- [ ] **Step 2: Add drawer state**

```typescript
const [activeDrawerPageId, setActiveDrawerPageId] = useState<string | null>(null)
```

The active drawer page is the page currently shown in the drawer (different from DnD's `activePageId`).

- [ ] **Step 3: Rewrite the main JSX**

New structure:
```tsx
<div className="h-screen flex flex-col bg-[var(--bg-primary)]">
  <WeaveHeader
    issueNumber={issue.number}
    pageCount={flatPages.length}
    spreadCount={spreads.length}
    showPlotlineManager={showPlotlineManager}
    onTogglePlotlineManager={() => setShowPlotlineManager(!showPlotlineManager)}
    seriesId={seriesId}
    issueId={issue.id}
  />

  {showPlotlineManager && (
    <WeavePlotlineManager
      plotlines={issue.plotlines || []}
      onCreatePlotline={createPlotline}
      onDeletePlotline={deletePlotline}
      onUpdateColor={updatePlotlineColor}
    />
  )}

  {selectedPageIds.size > 0 && (
    <WeaveSelectionToolbar
      selectedCount={selectedPageIds.size}
      scenes={allScenes}
      plotlines={issue.plotlines || []}
      onMoveToScene={handleMoveToScene}
      onAssignPlotline={handleBatchAssignPlotline}
      onDeselectAll={clearSelection}
    />
  )}

  <div className="flex-1 flex overflow-hidden">
    {/* Main flatplan area */}
    <div className="flex-1 overflow-auto p-5">
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {sceneGroupedSpreads.map(({ scene, spreads: sceneSpreads }) => (
            <WeaveSceneRegion
              key={scene.id}
              scene={scene}
              plotlineColor={getPlotlineColor(scene.plotline_id)}
              pageCount={getScenePageCount(scene.id)}
              onSelectAll={handleSelectScene}
            >
              {sceneSpreads.map((spread, i) => (
                <WeaveSpread
                  key={spread.left?.page.id || spread.right?.page.id || i}
                  spread={spread}
                  leftScene={spread.left?.scene}
                  rightScene={spread.right?.scene}
                >
                  {/* Left card */}
                  {spread.isFirst && !spread.left ? (
                    <InsideCover />
                  ) : spread.left ? (
                    <WeavePageCard
                      page={spread.left}
                      isFirstPage={spread.isFirst && !!spread.right}
                      isSelected={selectedPageIds.has(spread.left.page.id)}
                      isActive={activeDrawerPageId === spread.left.page.id}
                      isJustMoved={justMovedPageIds.has(spread.left.page.id)}
                      plotlines={issue.plotlines || []}
                      onSelect={handleSelectPage}
                      onClick={setActiveDrawerPageId}
                      panelCount={pageStats.get(spread.left.page.id)?.panelCount ?? 0}
                      wordCount={pageStats.get(spread.left.page.id)?.wordCount ?? 0}
                    />
                  ) : null}
                  {/* Right card */}
                  {spread.right ? (
                    <WeavePageCard
                      page={spread.right}
                      isFirstPage={spread.isFirst}
                      isSelected={selectedPageIds.has(spread.right.page.id)}
                      isActive={activeDrawerPageId === spread.right.page.id}
                      isJustMoved={justMovedPageIds.has(spread.right.page.id)}
                      plotlines={issue.plotlines || []}
                      onSelect={handleSelectPage}
                      onClick={setActiveDrawerPageId}
                      panelCount={pageStats.get(spread.right.page.id)?.panelCount ?? 0}
                      wordCount={pageStats.get(spread.right.page.id)?.wordCount ?? 0}
                    />
                  ) : null}
                </WeaveSpread>
              ))}
            </WeaveSceneRegion>
          ))}
        </SortableContext>
        <DragOverlay>
          {/* Simplified drag preview */}
        </DragOverlay>
      </DndContext>
    </div>

    {/* Side drawer */}
    {activeDrawerPageId && (
      <WeaveDrawer
        page={pageMap.get(activeDrawerPageId) || null}
        panelCount={pageStats.get(activeDrawerPageId)?.panelCount ?? 0}
        wordCount={pageStats.get(activeDrawerPageId)?.wordCount ?? 0}
        dialogueRatio={pageStats.get(activeDrawerPageId)?.dialogueRatio ?? 0}
        plotlines={issue.plotlines || []}
        onClose={() => setActiveDrawerPageId(null)}
        onSaveStoryBeat={savePageField}
        onAssignPlotline={assignPlotline}
        seriesId={seriesId}
        issueId={issue.id}
      />
    )}
  </div>
</div>
```

- [ ] **Step 4: Remove the old SortablePage component and InsideCover (keep InsideCover if small)**

Delete the ~325-line SortablePage component definition from WeaveView.tsx. Keep InsideCover (9 lines) or move it into WeaveSpread.

- [ ] **Step 5: Remove old scene units strip, plotline gap analysis, and instructions block**

These sections (~87 + ~15 lines) are being replaced by the scene regions and drawer. If plotline gap analysis is valuable, it can be added back later as a separate component.

- [ ] **Step 6: Remove old plotline legend (replaced by scene region labels)**

- [ ] **Step 7: Verify the page renders without TypeScript errors**

Run: `npx tsc --noEmit`

- [ ] **Step 8: Verify visually in dev server**

Navigate to an issue's weave page. Confirm:
- Header renders with correct stats
- Scene regions show with color tints
- Spreads are paired correctly (3 per row)
- Page cards show drag handle, checkbox, page number, stats, beat
- Clicking a card opens the drawer
- Drawer shows correct data
- Story beat editing works in drawer
- Plotline assignment works in drawer
- Checkboxes toggle selection
- Selection toolbar appears when pages are selected
- Drag and drop still works
- Scene label click selects all pages in scene

- [ ] **Step 9: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/
git commit -m "feat: rewrite WeaveView layout with flatplan components"
```

---

### Task 11: Add batch actions (Move to Scene, Assign Plotline)

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx`

The selection toolbar has "Move to Scene" and "Assign Plotline" batch actions. These need handler functions.

- [ ] **Step 1: Add `handleMoveToScene` function**

```typescript
const handleMoveToScene = useCallback(async (targetSceneId: string) => {
  const pagesToMove = Array.from(selectedPageIds)
  if (pagesToMove.length === 0) return

  // Find target scene's last page sort_order for positioning
  const targetScene = allScenes.find(s => s.id === targetSceneId)
  if (!targetScene) return

  // Optimistic: update issue state to move pages to target scene
  // (This requires updating the scene_id on each page — check if pages have scene_id or if it's inferred)
  // NOTE: In the current schema, pages belong to scenes via the nested structure.
  // Moving a page to a different scene requires updating the page's scene association.
  // Check the database schema — if pages have a direct scene_id FK, update it.
  // If not, this may require re-parenting through the acts/scenes hierarchy.

  const supabase = createClient()
  const updates = pagesToMove.map(pageId =>
    supabase.from('pages').update({ scene_id: targetSceneId }).eq('id', pageId)
  )
  const results = await Promise.all(updates)
  const errors = results.filter(r => r.error)
  if (errors.length > 0) {
    showToast('Failed to move some pages', 'error')
  } else {
    showToast(`Moved ${pagesToMove.length} pages`, 'success')
    clearSelection()
    router.refresh()
  }
}, [selectedPageIds, allScenes, clearSelection, router, showToast])
```

**Confirmed:** The `pages` table has a `scene_id` FK column (see `IssueEditor.tsx` line 807). After moving pages, call `router.refresh()` to trigger re-fetch and renumbering. The existing renumber logic in `renumberPages.ts` handles sort_order recalculation — the API endpoint at `/api/issues/[issueId]/renumber` can be called after the move completes.

- [ ] **Step 2: Add `handleBatchAssignPlotline` function**

```typescript
const handleBatchAssignPlotline = useCallback(async (plotlineId: string) => {
  const pagesToUpdate = Array.from(selectedPageIds)
  if (pagesToUpdate.length === 0) return

  // Optimistic update
  setIssue(prev => {
    // Deep clone and update plotline_id on each selected page
    // ... (same pattern as existing assignPlotline but for multiple pages)
  })

  const supabase = createClient()
  const results = await Promise.all(
    pagesToUpdate.map(pageId =>
      supabase.from('pages').update({ plotline_id: plotlineId }).eq('id', pageId)
    )
  )
  const errors = results.filter(r => r.error)
  if (errors.length > 0) {
    showToast('Failed to assign plotline to some pages', 'error')
    router.refresh()
  } else {
    showToast(`Assigned plotline to ${pagesToUpdate.length} pages`, 'success')
    clearSelection()
  }
}, [selectedPageIds, clearSelection, router, showToast])
```

- [ ] **Step 3: Compute `allScenes` for the selection toolbar**

```typescript
const allScenes = useMemo(() => {
  const scenes: Scene[] = []
  for (const act of issue.acts || []) {
    for (const scene of act.scenes || []) {
      scenes.push(scene)
    }
  }
  return scenes.sort((a, b) => a.sort_order - b.sort_order)
}, [issue])
```

- [ ] **Step 4: Verify batch actions work**

Select 3 pages, use "Assign Plotline" dropdown, confirm all 3 update. Select 2 pages, use "Move to Scene," confirm they move.

- [ ] **Step 5: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/WeaveView.tsx
git commit -m "feat: add batch actions for move-to-scene and assign-plotline"
```

---

## Chunk 4: Series-Level Weave Refresh

### Task 12: Restyle SeriesWeaveClient header and grid structure

**Files:**
- Modify: `src/app/series/[seriesId]/weave/SeriesWeaveClient.tsx`

Update the series weave to match the approved mockup. This is a visual refresh — same data, same interactions, better styling.

- [ ] **Step 1: Update the header**

Replace the current header with:
- Left: `← {series.title}` (Helvetica 11px weight-800 `text-[var(--text-muted)]`) + `//` + `SERIES WEAVE` (Helvetica 18px weight-900 `text-[var(--text-primary)]`)
- Right: `{issues.length} ISSUES · {plotlines.length} PLOTLINES` (Courier 10px `text-[var(--text-muted)]`) + `MANAGE PLOTLINES` link

- [ ] **Step 2: Update column headers (issues)**

Each issue column header:
- Issue number: `#{N}` in Helvetica 16px weight-900 `text-[var(--text-primary)]`
- Title: Courier 8px `text-[var(--text-muted)]`, truncated
- Series act: Helvetica 7px weight-700, color-coded (SETUP green, CONFRONTATION amber, RESOLUTION red)

- [ ] **Step 3: Update row headers (plotlines)**

Each plotline row header:
- Color dot (8px circle)
- Name in Helvetica 10px weight-700, color matching plotline, uppercase
- Sticky left with `bg-[var(--bg-primary)]`

- [ ] **Step 4: Commit**

```bash
git add src/app/series/\[seriesId\]/weave/SeriesWeaveClient.tsx
git commit -m "feat: restyle series weave header and grid structure"
```

---

### Task 13: Add density bars, bold counts, and marker badges

**Files:**
- Modify: `src/app/series/[seriesId]/weave/SeriesWeaveClient.tsx`

- [ ] **Step 1: Compute max page count for density bar scaling**

```typescript
const maxPageCount = useMemo(() => {
  let max = 0
  for (const count of plotlinePageCounts.values()) {
    if (count > max) max = count
  }
  return max || 1 // avoid divide by zero
}, [plotlinePageCounts])
```

- [ ] **Step 2: Redesign filled cells**

For each cell with `pageCount > 0`:
```tsx
<div className="bg-[var(--bg-elevated)] rounded border-l-[3px] p-2 min-h-[64px] cursor-pointer shadow-[var(--shadow-sm)]"
     style={{ borderLeftColor: plotline.color }}>
  {/* Page count */}
  <div className="flex justify-between items-baseline">
    <span className="text-[16px] font-black text-[var(--text-primary)] tracking-tight"
          style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}>
      {cellData.pageCount}
    </span>
    <span className="font-mono text-[8px] text-[var(--text-muted)]">pages</span>
  </div>
  {/* Density bar */}
  <div className="h-1 bg-[var(--bg-tertiary)] rounded-sm mt-1.5 overflow-hidden">
    <div className="h-full rounded-sm opacity-70"
         style={{ width: `${(cellData.pageCount / maxPageCount) * 100}%`, backgroundColor: plotline.color }} />
  </div>
  {/* Marker badges */}
  <div className="mt-1.5 flex gap-1 flex-wrap">
    {cellData.firstAppearance && (
      <span className="text-[7px] font-extrabold tracking-wider text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded-sm">1ST</span>
    )}
    {cellData.climax && (
      <span className="text-[7px] font-extrabold tracking-wider text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-1.5 py-0.5 rounded-sm">CLIMAX</span>
    )}
    {cellData.resolution && (
      <span className="text-[7px] font-extrabold tracking-wider text-[var(--color-error)] bg-[var(--color-error)]/10 px-1.5 py-0.5 rounded-sm">RESOLVED</span>
    )}
  </div>
</div>
```

- [ ] **Step 3: Redesign empty cells**

```tsx
<div className="bg-[var(--bg-secondary)] rounded min-h-[64px] cursor-pointer flex items-center justify-center border border-dashed border-[var(--border-subtle)]">
  <span className="font-mono text-[8px] text-[var(--text-disabled)]">—</span>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/series/\[seriesId\]/weave/SeriesWeaveClient.tsx
git commit -m "feat: add density bars, bold counts, and marker badges to series weave"
```

---

### Task 14: Add totals row and polish

**Files:**
- Modify: `src/app/series/[seriesId]/weave/SeriesWeaveClient.tsx`

- [ ] **Step 1: Compute per-issue totals**

```typescript
const issueTotals = useMemo(() => {
  const totals = new Map<string, number>()
  for (const issue of issues) {
    let total = 0
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        total += (scene.pages || []).length
      }
    }
    totals.set(issue.id, total)
  }
  return totals
}, [issues])
```

- [ ] **Step 2: Add totals row after the last plotline row**

```tsx
<tr>
  <td className="p-2 pt-3 sticky left-0 z-[1] bg-[var(--bg-primary)] border-t-2 border-[var(--border)]">
    <span className="text-[8px] font-bold text-[var(--text-muted)] tracking-widest uppercase"
          style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}>TOTAL</span>
  </td>
  {issues.map(iss => (
    <td key={iss.id} className="pt-3 text-center border-t-2 border-[var(--border)]">
      <span className="text-sm font-black text-[var(--text-secondary)] tracking-tight"
            style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}>
        {issueTotals.get(iss.id) || 0}
      </span>
      <div className="font-mono text-[7px] text-[var(--text-muted)] mt-0.5">pages</div>
    </td>
  ))}
</tr>
```

- [ ] **Step 3: Remove the old legend section** (the marker badges are now self-explanatory in the cells)

- [ ] **Step 4: Update the table's border-collapse and spacing**

```tsx
<table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
```

- [ ] **Step 5: Verify both themes look correct**

Toggle between light and dark mode. Confirm:
- Cell backgrounds contrast correctly with the page background
- Plotline colors are visible in both modes
- Density bars render correctly
- Marker badges are legible
- Totals row is clearly separated

- [ ] **Step 6: Commit**

```bash
git add src/app/series/\[seriesId\]/weave/SeriesWeaveClient.tsx
git commit -m "feat: add totals row and polish series weave styling"
```

---

## Chunk 5: Theme Integration & Polish

### Task 15: Ensure all new components use CSS variables correctly

**Files:**
- Modify: All new components in `src/app/series/[seriesId]/issues/[issueId]/weave/components/`
- Possibly modify: `src/app/globals.css`

- [ ] **Step 1: Audit each component for hardcoded colors**

Search all new files for any hex color that isn't a plotline color. Replace with CSS variables:
- Background → `var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-elevated)`
- Text → `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`
- Borders → `var(--border)`, `var(--border-subtle)`
- Semantic → `var(--color-primary)`, `var(--color-success)`, `var(--color-warning)`, `var(--color-error)`
- Shadows → `var(--shadow-sm)`, `var(--shadow-md)`

Plotline colors ARE dynamic and use inline styles — that's correct and should stay.

- [ ] **Step 2: Test light mode**

Toggle to light mode and verify every component:
- WeavePageCard backgrounds are white, text is dark
- WeaveSpread spine uses appropriate neutral color
- WeaveSceneRegion tints are visible but subtle
- WeaveDrawer has proper contrast
- WeaveHeader is legible

- [ ] **Step 3: Test dark mode**

Toggle to dark mode and verify the same list.

- [ ] **Step 4: Add any missing CSS variables to globals.css**

If the weave needs specific variables not covered by the existing set (unlikely), add them under both `:root` and `.dark` selectors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: ensure all weave components use CSS variables for theme support"
```

---

### Task 16: Multi-plotline bars and DragOverlay polish

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeavePageCard.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx`

- [ ] **Step 1: Implement multi-plotline bar in WeavePageCard**

When a page has multiple plotlines (from panels with different characters/plotlines, or from scene convergence), render a split color bar:

```tsx
// If page has a single plotline:
<div className="absolute top-0 left-0 right-0 h-1 rounded-t"
     style={{ backgroundColor: plotlineColor }} />

// If scene has multiple plotlines converging (check page.panels for different plotline assignments):
<div className="absolute top-0 left-0 right-0 h-1 flex rounded-t overflow-hidden">
  {plotlineColors.map((color, i) => (
    <div key={i} className="flex-1" style={{ backgroundColor: color }} />
  ))}
</div>
```

Note: The current data model assigns plotline_id at the page level, not panel level. Multi-plotline bars are aspirational — for now, use the page's single plotline_id. If the scene has a different plotline than the page, show both.

- [ ] **Step 2: Polish the DragOverlay**

Replace the current DragOverlay content with a simplified version matching the new card size:

```tsx
<DragOverlay>
  {activePageId && (() => {
    const fp = pageMap.get(activePageId)
    if (!fp) return null
    const count = selectedPageIds.has(activePageId) ? selectedPageIds.size : 1
    return (
      <div className="relative">
        {count > 1 && (
          <>
            <div className="absolute -top-1 -left-1 w-[86px] h-[118px] bg-[var(--bg-tertiary)] rounded opacity-60 rotate-2" />
            <div className="absolute -top-0.5 -left-0.5 w-[86px] h-[118px] bg-[var(--bg-tertiary)] rounded opacity-80 rotate-1" />
          </>
        )}
        <div className="w-[86px] h-[118px] bg-[var(--bg-elevated)] border border-[var(--color-primary)] rounded shadow-lg p-2 relative">
          <div className="text-2xl font-black text-[var(--text-primary)]"
               style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}>
            {fp.globalPageNumber}
          </div>
          {count > 1 && (
            <div className="absolute top-1 right-1 bg-[var(--color-primary)] text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {count}
            </div>
          )}
        </div>
      </div>
    )
  })()}
</DragOverlay>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/weave/
git commit -m "feat: polish multi-plotline bars and drag overlay for new card design"
```

---

### Task 17: Final testing, accessibility, and cleanup

**Files:**
- All weave files
- `src/lib/weave-spreads.test.ts`

- [ ] **Step 1: Run all existing tests**

```bash
npx vitest run
```

Ensure all 212+ tests still pass.

- [ ] **Step 2: Run the spread computation tests**

```bash
npx vitest run src/lib/weave-spreads.test.ts
```

- [ ] **Step 3: Check TypeScript compilation**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 4: Accessibility check**

Verify:
- Checkboxes have `aria-label="Select page {N}"`
- Drag handles have `aria-label="Drag page {N}"`
- Drawer has `role="complementary"` and `aria-label="Page detail"`
- Scene region labels are semantic (use `<h3>` or `aria-label`)
- Color is never the only way to convey information (markers have text labels, not just color)

- [ ] **Step 5: Clean up any remaining old code**

Remove:
- Old `SortablePage` component (if not already deleted)
- Old inline spread computation (if not already removed)
- Unused imports
- Console.log statements
- Commented-out code

- [ ] **Step 6: Final visual verification**

Check both issue weave and series weave in:
- Light mode
- Dark mode
- With real data (THE LAST SIGNAL issue #3)
- With empty issue (no pages)
- With many pages (39+ pages)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: final cleanup and accessibility for weave redesign"
```

---

## Review Errata

These are known issues and edge cases the implementing engineer should be aware of:

1. **E1: Page scene_id column** — CONFIRMED: `pages` table has `scene_id` FK. The batch move approach in Task 11 is viable. After moving pages, call the renumber API to fix sort_order.

2. **E2: InsideCover in new layout** — The InsideCover placeholder (IFC) is a simple centered text element. In the new flatplan, it should match the 86×118px card dimensions with the same border-radius pattern (3px 0 0 3px for left side of first spread).

3. **E3: First page immutability** — Page 1 (the first page after the inside cover) cannot be reordered, selected, or dragged. This constraint must be maintained in all new components. The WeavePageCard should disable its checkbox and drag handle when `isFirstPage` is true.

4. **E4: Orientation auto-calculation** — When pages are reordered via drag-and-drop, orientation (LEFT/RIGHT) must be recalculated based on new position. The current logic in `flatPages` memo handles this — ensure it's preserved.

5. **E5: Story beat auto-save** — The drawer's story beat textarea should auto-save on blur, not require a save button. Use the existing `savePageField` function with field `'story_beat'`.

6. **E6: Plotline color as inline style** — Plotline colors are dynamic user-assigned hex values, not theme colors. They must always be applied as inline `style={{ backgroundColor: color }}` or `style={{ borderColor: color }}`, never as Tailwind classes.

7. **E7: Scene region for split-scene spreads** — When a spread straddles two scenes, the spread is rendered inside the FIRST scene's region (left page's scene). The right page shows its own plotline color bar, and the spine gets the transition gradient. Do NOT duplicate the spread in both scene regions.

8. **E8: Test file location** — Tests for `weave-spreads.ts` go in `src/lib/weave-spreads.test.ts` following the existing codebase pattern of co-located test files (not a separate `tests/` directory).

9. **E9: Font families** — Use inline `style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}` for display type (page numbers, headers, labels). Use `font-mono` Tailwind class for monospace text (stats, story beats, data labels). Helvetica Neue is a system font on macOS — the fallback to `Helvetica, sans-serif` covers other platforms.

10. **E10: Selection toolbar dropdowns** — The "Move to Scene" and "Assign Plotline" dropdowns in WeaveSelectionToolbar should use Radix UI `<Select>` components (already a project dependency) for accessibility. Import from `@radix-ui/react-select`.

11. **E11: Font references** — Do NOT use `font-['Helvetica_Neue',sans-serif]` Tailwind syntax — it does not work. Use inline `style={{ fontFamily: "'Helvetica Neue', Helvetica, sans-serif" }}` for display type (page numbers, headers). Use `font-mono` class for Courier/monospace text (stats, beats, labels).

12. **E12: Spine gradient theming** — The spine between pages in a spread must use CSS variables, not hardcoded hex colors. Use `var(--border)` → `var(--bg-primary)` → `var(--border)` for the gradient so it works in both themes.

13. **E13: Empty scenes** — Scenes with zero pages should NOT render a scene region. The `sceneGroupedSpreads` computation naturally excludes them since it derives groups from spreads (which require pages).

14. **E14: WeavePageCard in test harness** — If testing WeavePageCard in isolation (Task 3, Step 2), wrap it in `<DndContext><SortableContext items={[id]}>` to avoid runtime errors from `useSortable`.

15. **E15: Splash pages at scene boundaries** — A splash page takes a full spread (left page + empty right). If it's the last page of a scene, there is no right page for the spine gradient scene-break effect. The spread should render normally with no scene-break indicator. The next scene's first spread starts fresh.
