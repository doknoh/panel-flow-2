# Hover Interactions & Tooltips Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent hover effects and styled tooltips to every interactive element across the entire application.

**Architecture:** Three CSS utility classes (`.hover-lift`, `.hover-glow`, `.hover-fade`) in globals.css provide tiered hover treatments. A thin `<Tip>` component wraps Radix UI Tooltip for styled tooltips. Every interactive element gets the appropriate hover class + Tip wrapper, replacing all native `title` attributes.

**Tech Stack:** Tailwind CSS 4, Radix UI Tooltip, React 19, Next.js 16

**Spec:** `docs/superpowers/specs/2026-03-12-hover-interactions-design.md`

---

## Chunk 1: Foundation

### Task 1: Add hover utility classes to globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the three hover tier classes after the existing `.btn` classes (~line 302)**

```css
/* ── Hover Tiers ────────────────────────────────────────── */

/* Tier 1 — Primary actions: buttons that trigger actions */
.hover-lift {
  cursor: pointer;
  transition: all 150ms var(--ease-micro);
}
.hover-lift:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 12%, transparent);
}
.hover-lift:active {
  transform: scale(0.97);
  box-shadow: none;
}

/* Tier 2 — Navigation & selection: things you click to go somewhere */
.hover-glow {
  cursor: pointer;
  transition: all 150ms var(--ease-micro);
}
.hover-glow:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border-radius: 4px;
}

/* Tier 3 — Contextual: secondary actions, quiet feedback */
.hover-fade {
  cursor: pointer;
  transition: color 150ms var(--ease-micro);
}
.hover-fade:hover {
  color: var(--text-primary);
}

/* Tier 3 variant — Destructive: delete/remove actions */
.hover-fade-danger {
  cursor: pointer;
  transition: color 150ms var(--ease-micro);
}
.hover-fade-danger:hover {
  color: var(--color-error);
}
```

- [ ] **Step 2: Add tooltip styles**

```css
/* ── Tooltips ───────────────────────────────────────────── */

.tip-content {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.5px;
  padding: 5px 8px;
  border-radius: 4px;
  box-shadow: 0 4px 12px color-mix(in srgb, black 30%, transparent);
  animation: tooltip-enter 150ms var(--ease-out-expo);
  z-index: 50;
  max-width: 200px;
}

.tip-arrow {
  fill: var(--bg-primary);
}

@keyframes tooltip-enter {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **Step 3: Verify** — Run `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add src/app/globals.css
git commit -m "feat: add hover tier utility classes and tooltip styles"
```

---

### Task 2: Create the Tip component

**Files:**
- Create: `src/components/ui/Tip.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { ReactNode } from 'react'

interface TipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  delayDuration?: number
}

export function Tip({ content, children, side = 'top', delayDuration = 400 }: TipProps) {
  if (!content) return <>{children}</>

  return (
    <Tooltip.Root delayDuration={delayDuration}>
      <Tooltip.Trigger asChild>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={6} className="tip-content">
          {content}
          <Tooltip.Arrow className="tip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
```

- [ ] **Step 2: Verify** — Run `npx tsc --noEmit`

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/Tip.tsx
git commit -m "feat: add Tip tooltip wrapper component"
```

---

### Task 3: Add Tooltip.Provider to root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Wrap the app children in Tooltip.Provider**

Import `@radix-ui/react-tooltip` and wrap the outermost content in:
```tsx
<TooltipProvider delayDuration={400} skipDelayDuration={100}>
  {/* existing children */}
</TooltipProvider>
```

The `skipDelayDuration={100}` means once a user has seen one tooltip, subsequent tooltips on nearby elements appear almost instantly (like Gmail).

Note: Since layout.tsx is a server component, the Tooltip.Provider needs to be in a client component wrapper. Check if there's already a client Providers component that wraps ThemeProvider, ToastProvider, etc. If so, add TooltipProvider inside that. If not, create a thin client wrapper.

- [ ] **Step 2: Verify** — Run `npx tsc --noEmit`

- [ ] **Step 3: Commit**
```bash
git add src/app/layout.tsx
git commit -m "feat: add Radix Tooltip.Provider to app root"
```

---

## Chunk 2: Issue Editor (Core Writing Page)

### Task 4: IssueEditor.tsx — Header buttons and layout controls

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`

- [ ] **Step 1:** Import `{ Tip }` from `@/components/ui/Tip`

- [ ] **Step 2:** Add hover classes and Tip wrappers to all header interactive elements:
- ISSUE #XX back link → add `hover-glow` class + `<Tip content="Back to series">`
- FIND button → add `hover-lift` class + `<Tip content="Find & Replace (⌘F)">`. Remove any `title=` attribute
- VIEW button → `hover-lift` + `<Tip content="Switch view mode">`
- TOOLS button → `hover-lift` + `<Tip content="Keyboard shortcuts">`
- EXPORT button → `hover-lift` + `<Tip content="Export issue">`
- [+ ADD PANEL] button → `hover-lift` + `<Tip content="Add new panel (⌘Enter)">`
- Mobile view tabs (NAV/EDITOR/TOOLKIT) → `hover-glow`

- [ ] **Step 3: Verify** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add "src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx"
git commit -m "feat: add hover effects and tooltips to issue editor header"
```

---

### Task 5: PageEditor.tsx — Panel actions and controls

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx`

- [ ] **Step 1:** Import `{ Tip }` from `@/components/ui/Tip`

- [ ] **Step 2:** Add hover classes and Tip wrappers to all panel interactive elements:
- [DEL] button on panels → `hover-fade-danger` + `<Tip content="Delete panel">`
- SHOT TYPE dropdown trigger → `hover-glow` + `<Tip content="Panel shot type">`
- [+ DLG] → `hover-lift` + `<Tip content="Add dialogue">`
- [+ CAP] → `hover-lift` + `<Tip content="Add caption">`
- [+ SFX] → `hover-lift` + `<Tip content="Add sound effect">`
- [+ NOTES] → `hover-lift` + `<Tip content="Add artist notes">`
- Panel drag handles (::) → `hover-fade` + `<Tip content="Drag to reorder" side="left">`
- Dialogue speaker dropdowns → `hover-glow`
- Dialogue type dropdowns → `hover-glow`
- Caption type dropdowns → `hover-glow`
- Delete dialogue/caption/sfx buttons → `hover-fade-danger` + `<Tip content="Delete">`
- Breadcrumb links (ACT // SCENE) → `hover-glow`
- Page orientation badge → `<Tip content="Page reads from this side">`
- Remove any existing `title=` attributes that are replaced by Tips

- [ ] **Step 3: Verify** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add "src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx"
git commit -m "feat: add hover effects and tooltips to page editor panels"
```

---

### Task 6: NavigationTree.tsx — Left column nav items

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`

- [ ] **Step 1:** Import `{ Tip }` from `@/components/ui/Tip`

- [ ] **Step 2:** Add hover classes and Tip wrappers:
- Act labels → `hover-glow`
- Scene labels → `hover-glow` + `<Tip content={scene.title || 'Untitled scene'}>`
- Page labels → `hover-glow`
- + ADD SCENE buttons → `hover-lift` + `<Tip content="Add scene to this act">`
- + ADD PAGE buttons → `hover-lift` + `<Tip content="Add page to this scene">`
- + ACT button → `hover-lift` + `<Tip content="Add new act">`
- Collapse/expand chevrons → `hover-fade`
- Context menu dots (⋮) → `hover-fade` + `<Tip content="More options">`
- Multi-select checkboxes → `hover-fade`
- Page count badges → `<Tip content="Pages in scene">`

- [ ] **Step 3: Verify** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add "src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx"
git commit -m "feat: add hover effects and tooltips to navigation tree"
```

---

### Task 7: Toolkit.tsx — Right column tabs and content

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/Toolkit.tsx`

- [ ] **Step 1:** Import `{ Tip }` from `@/components/ui/Tip`

- [ ] **Step 2:** Add hover classes and Tip wrappers:
- Tab buttons (CTX/CHAR/LOC/VIS/ALRT/PACE/AI) → `hover-glow` + `<Tip content="Context">`, `<Tip content="Characters">`, `<Tip content="Locations">`, `<Tip content="Visuals">`, `<Tip content="Alerts">`, `<Tip content="Pacing">`, `<Tip content="AI Chat">`
- Character list items → `hover-glow` + `<Tip content="View character details">`
- Character arrow links (→) → `hover-fade` + `<Tip content="Go to character page">`
- ALL CHARACTERS toggle → `hover-lift`
- Edit/Cancel context toggle → `hover-fade`
- Save Context button → `hover-lift` + `<Tip content="Save issue context">`
- Status dropdown → `hover-glow` + `<Tip content="Issue status">`
- AI send button → `hover-lift` + `<Tip content="Send message">`
- AI clear button → `hover-fade` + `<Tip content="Clear conversation">`
- Location list items → `hover-glow`
- Alert dismiss buttons → `hover-fade` + `<Tip content="Dismiss">`
- Pacing refresh → `hover-fade` + `<Tip content="Refresh analysis">`
- Save insight button → `hover-lift` + `<Tip content="Save to project notes">`
- Remove any existing `title=` attributes replaced by Tips

- [ ] **Step 3: Verify** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add "src/app/series/[seriesId]/issues/[issueId]/Toolkit.tsx"
git commit -m "feat: add hover effects and tooltips to toolkit sidebar"
```

---

### Task 8: StatusBar, ScriptView, ZenMode, and other editor views

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/StatusBar.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/QuickNav.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageTypeSelector.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PreviousPageContext.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ZoomPanel.tsx`

- [ ] **Step 1:** Import `{ Tip }` in each file

- [ ] **Step 2:** StatusBar:
- UNDO button → `hover-fade` + `<Tip content="Undo (⌘Z)">`
- REDO button → `hover-fade` + `<Tip content="Redo (⌘⇧Z)">`
- Phase selector → `hover-glow` + `<Tip content="Writing phase">`
- SYNC indicator → `<Tip content="Auto-save status">`
- Remove existing `title=` attributes

- [ ] **Step 3:** ScriptView — all toolbar buttons, panel action buttons, page action buttons:
- Exit button → `hover-fade` + `<Tip content="Exit Script View (Esc)">`
- Copy button → `hover-lift` + `<Tip content="Copy script to clipboard">`
- PDF button → `hover-lift` + `<Tip content="Export to PDF">`
- Add page → `hover-lift` + `<Tip content="Add new page">`
- Delete page → `hover-fade-danger` + `<Tip content="Delete current page">`
- All panel/dialogue/caption/sfx buttons → same tier patterns as PageEditor
- Remove all existing `title=` attributes (there are ~15+)

- [ ] **Step 4:** ZenMode — any toolbar or navigation buttons

- [ ] **Step 5:** QuickNav — page jump buttons → `hover-glow`

- [ ] **Step 6:** PageTypeSelector — type option buttons → `hover-glow`, remove existing `title=`

- [ ] **Step 7:** PreviousPageContext — collapse toggle → `hover-fade`

- [ ] **Step 8:** ZoomPanel — zoom controls → `hover-fade`

- [ ] **Step 9: Verify** — `npx tsc --noEmit`

- [ ] **Step 10: Commit**
```bash
git add "src/app/series/[seriesId]/issues/[issueId]/StatusBar.tsx" \
  "src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx" \
  "src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx" \
  "src/app/series/[seriesId]/issues/[issueId]/QuickNav.tsx" \
  "src/app/series/[seriesId]/issues/[issueId]/PageTypeSelector.tsx" \
  "src/app/series/[seriesId]/issues/[issueId]/PreviousPageContext.tsx" \
  "src/app/series/[seriesId]/issues/[issueId]/ZoomPanel.tsx"
git commit -m "feat: add hover effects and tooltips to editor views and status bar"
```

---

## Chunk 3: Dashboard, Series Home, and World Building Pages

### Task 9: Dashboard and Series Home

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/AllowedUsersManager.tsx`
- Modify: `src/app/series/[seriesId]/page.tsx`
- Modify: `src/app/series/[seriesId]/CreateIssueButton.tsx`
- Modify: `src/app/series/[seriesId]/IssueGrid.tsx`
- Modify: `src/app/series/[seriesId]/SeriesMetadata.tsx` (if exists)

- [ ] **Step 1:** Import `{ Tip }` in each file

- [ ] **Step 2:** Dashboard:
- Series cards → `hover-glow`
- [+ NEW SERIES] → `hover-lift` + `<Tip content="Create new series">`
- Admin user buttons → `hover-lift` / `hover-fade-danger` for revoke

- [ ] **Step 3:** Series home:
- Issue grid cards → `hover-glow`
- Tool grid links → `hover-glow` + `<Tip content={tool.description}>`
- Edit metadata buttons → `hover-fade`
- CreateIssueButton → `hover-lift` + `<Tip content="Create new issue">`
- IssueGrid stat icons → convert existing `title=` to `<Tip>`

- [ ] **Step 4: Verify** — `npx tsc --noEmit`

- [ ] **Step 5: Commit**
```bash
git add src/app/dashboard/page.tsx src/app/dashboard/AllowedUsersManager.tsx \
  "src/app/series/[seriesId]/page.tsx" \
  "src/app/series/[seriesId]/CreateIssueButton.tsx" \
  "src/app/series/[seriesId]/IssueGrid.tsx"
git commit -m "feat: add hover effects and tooltips to dashboard and series home"
```

---

### Task 10: Characters, Locations, Plotlines, Notes pages

**Files:**
- Modify: `src/app/series/[seriesId]/characters/CharacterCard.tsx`
- Modify: `src/app/series/[seriesId]/characters/CharacterGrid.tsx`
- Modify: `src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx`
- Modify: `src/app/series/[seriesId]/characters/CharacterMiniCard.tsx`
- Modify: `src/app/series/[seriesId]/characters/MergeModal.tsx`
- Modify: `src/app/series/[seriesId]/characters/ManuscriptScanModal.tsx`
- Modify: `src/app/series/[seriesId]/locations/LocationList.tsx`
- Modify: `src/app/series/[seriesId]/plotlines/PlotlineList.tsx`
- Modify: `src/app/series/[seriesId]/notes/NotesList.tsx`

- [ ] **Step 1:** Import `{ Tip }` in each file

- [ ] **Step 2:** Characters — all CRUD buttons, role badges, filter/sort controls, detail panel buttons, delete → `hover-fade-danger`, create/add → `hover-lift`, cards → `hover-glow`. Convert existing `title=` attrs to `<Tip>`.

- [ ] **Step 3:** Locations — same pattern: cards → `hover-glow`, add → `hover-lift`, edit → `hover-fade`, delete → `hover-fade-danger`

- [ ] **Step 4:** Plotlines — same pattern + color picker buttons → `hover-glow`

- [ ] **Step 5:** Notes — same pattern

- [ ] **Step 6: Verify** — `npx tsc --noEmit`

- [ ] **Step 7: Commit**
```bash
git add "src/app/series/[seriesId]/characters/" \
  "src/app/series/[seriesId]/locations/" \
  "src/app/series/[seriesId]/plotlines/" \
  "src/app/series/[seriesId]/notes/"
git commit -m "feat: add hover effects and tooltips to world building pages"
```

---

## Chunk 4: Tool Pages and Remaining Routes

### Task 11: Canvas, Guide, Outline, Weave

**Files:**
- Modify: `src/app/series/[seriesId]/canvas/NotebookItem.tsx`
- Modify: `src/app/series/[seriesId]/canvas/NotebookClient.tsx`
- Modify: `src/app/series/[seriesId]/canvas/NotebookCorkBoard.tsx`
- Modify: `src/app/series/[seriesId]/canvas/NotebookListView.tsx`
- Modify: `src/app/series/[seriesId]/canvas/FiledNotesTab.tsx`
- Modify: `src/app/series/[seriesId]/canvas/GraduationModal.tsx`
- Modify: `src/app/series/[seriesId]/canvas/SendToPageModal.tsx`
- Modify: `src/app/series/[seriesId]/guide/GuidedMode.tsx`
- Modify: `src/app/series/[seriesId]/outline/OutlineView.tsx` (or similar)
- Modify: `src/app/series/[seriesId]/weave/WeaveClient.tsx` (or similar)
- Modify: `src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx`

- [ ] **Step 1:** Import `{ Tip }` in each file

- [ ] **Step 2:** Canvas — item cards → `hover-glow`, action buttons (archive, graduate, file) → `hover-lift`, color tags → `hover-fade` + Tip(color name)

- [ ] **Step 3:** Guide — session list items → `hover-glow`, start/resume → `hover-lift`, focus shift → `hover-glow`, extract insights → `hover-lift`

- [ ] **Step 4:** Outline — issue cards → `hover-glow`, action buttons → `hover-lift`

- [ ] **Step 5:** Weave — plotline rows → `hover-glow`, edit buttons → `hover-fade`, drag handles → `hover-fade`

- [ ] **Step 6: Verify** — `npx tsc --noEmit`

- [ ] **Step 7: Commit**
```bash
git add "src/app/series/[seriesId]/canvas/" \
  "src/app/series/[seriesId]/guide/" \
  "src/app/series/[seriesId]/outline/" \
  "src/app/series/[seriesId]/weave/" \
  "src/app/series/[seriesId]/issues/[issueId]/weave/"
git commit -m "feat: add hover effects and tooltips to canvas, guide, outline, and weave"
```

---

### Task 12: Analytics, Sessions, Continuity, Patterns, Character Arcs, Deadlines

**Files:**
- Modify: `src/app/series/[seriesId]/analytics/AnalyticsDashboard.tsx`
- Modify: `src/app/series/[seriesId]/analytics/PowerRankings.tsx`
- Modify: `src/app/series/[seriesId]/sessions/SessionHistory.tsx` (or similar)
- Modify: `src/app/series/[seriesId]/continuity/ContinuityChecker.tsx`
- Modify: `src/app/series/[seriesId]/patterns/PatternsClient.tsx`
- Modify: `src/app/series/[seriesId]/character-arcs/CharacterArcsView.tsx`
- Modify: `src/app/series/[seriesId]/deadlines/DeadlineDashboard.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/rhythm/RhythmClient.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/scene-analytics/SceneAnalyticsClient.tsx` (or similar)
- Modify: `src/app/series/[seriesId]/issues/[issueId]/history/VersionHistoryClient.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/import/ImportScript.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/blueprint/BlueprintEditor.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/read/ReadingView.tsx`

- [ ] **Step 1:** Import `{ Tip }` in each file

- [ ] **Step 2:** All pages follow the tier rules: action/trigger buttons → `hover-lift`, list/card/nav items → `hover-glow`, secondary/destructive → `hover-fade`/`hover-fade-danger`. Add Tip wrappers to every interactive element.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add "src/app/series/[seriesId]/analytics/" \
  "src/app/series/[seriesId]/sessions/" \
  "src/app/series/[seriesId]/continuity/" \
  "src/app/series/[seriesId]/patterns/" \
  "src/app/series/[seriesId]/character-arcs/" \
  "src/app/series/[seriesId]/deadlines/" \
  "src/app/series/[seriesId]/issues/[issueId]/rhythm/" \
  "src/app/series/[seriesId]/issues/[issueId]/scene-analytics/" \
  "src/app/series/[seriesId]/issues/[issueId]/history/" \
  "src/app/series/[seriesId]/issues/[issueId]/import/" \
  "src/app/series/[seriesId]/issues/[issueId]/blueprint/" \
  "src/app/series/[seriesId]/issues/[issueId]/read/"
git commit -m "feat: add hover effects and tooltips to analytics and tool pages"
```

---

## Chunk 5: Shared Components and Remaining Files

### Task 13: Shared components, modals, collaboration

**Files:**
- Modify: `src/components/ui/Header.tsx`
- Modify: `src/components/ui/ThemeToggle.tsx`
- Modify: `src/components/ui/ExportModal.tsx`
- Modify: `src/components/ui/ConfirmDialog.tsx`
- Modify: `src/components/ui/EmptyState.tsx`
- Modify: `src/components/ChatMessageContent.tsx`
- Modify: `src/components/CommandPalette.tsx`
- Modify: `src/components/ImageUploader.tsx`
- Modify: `src/components/PacingAnalyst.tsx`
- Modify: `src/components/PanelNoteIndicator.tsx`
- Modify: `src/components/PanelNotesList.tsx`
- Modify: `src/components/OutlineToggle.tsx`
- Modify: `src/components/SessionDebrief.tsx`
- Modify: `src/components/DescriptionAnalysis.tsx`
- Modify: `src/contexts/ToastContext.tsx`
- Modify: `src/app/series/[seriesId]/collaboration/ShareButton.tsx`
- Modify: `src/app/series/[seriesId]/collaboration/ShareModal.tsx`
- Modify: `src/app/series/[seriesId]/collaboration/CommentButton.tsx`
- Modify: `src/app/series/[seriesId]/collaboration/CommentsPanel.tsx`
- Modify: `src/app/series/[seriesId]/collaboration/CollaboratorAvatars.tsx`
- Modify: `src/app/login/LoginButton.tsx`
- Modify: `src/app/invite/[token]/AcceptInvitation.tsx`
- Modify: `src/app/pending-approval/page.tsx`

- [ ] **Step 1:** Import `{ Tip }` in each file

- [ ] **Step 2:** Header — back link → `hover-glow`, sign out → `hover-fade` + `<Tip content="Sign out">`

- [ ] **Step 3:** ThemeToggle — convert existing `title=` to `<Tip>`, add `hover-fade`

- [ ] **Step 4:** ExportModal — format buttons → `hover-glow`, cancel → `hover-fade`, export → `hover-lift`

- [ ] **Step 5:** ConfirmDialog — cancel button → `hover-fade`, confirm → `hover-lift` (or `hover-fade-danger` for destructive variant)

- [ ] **Step 6:** CommandPalette — result items → `hover-glow`

- [ ] **Step 7:** Toast dismiss → `hover-fade` (already has aria-label)

- [ ] **Step 8:** ChatMessageContent — tool proposal accept/reject buttons → `hover-lift` / `hover-fade-danger`

- [ ] **Step 9:** All collaboration components — share buttons, comment actions, invite buttons → appropriate tiers

- [ ] **Step 10:** Login/invite/pending — buttons → `hover-lift`

- [ ] **Step 11:** PanelNotesList — convert existing `title=` to `<Tip>`, add hover classes

- [ ] **Step 12: Verify** — `npx tsc --noEmit`

- [ ] **Step 13: Commit**
```bash
git add src/components/ src/contexts/ToastContext.tsx \
  "src/app/series/[seriesId]/collaboration/" \
  src/app/login/ src/app/invite/ src/app/pending-approval/
git commit -m "feat: add hover effects and tooltips to shared components and remaining pages"
```

---

## Chunk 6: Cleanup and Verification

### Task 14: Remove redundant inline Tailwind hover classes

**Files:**
- All files modified in Tasks 4-13

- [ ] **Step 1:** Search for inline Tailwind hover patterns that are now redundant because the CSS utility classes handle them. For example, if an element has `hover-lift` class AND inline `hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]`, the inline classes can be removed since `.hover-lift` handles that.

- [ ] **Step 2:** Remove only hover-related inline classes that duplicate what the utility class provides. Keep any hover classes that ADD to the utility (e.g., `hover:bg-specific-color` that the utility doesn't cover).

- [ ] **Step 3: Verify** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add -u
git commit -m "refactor: remove redundant inline hover classes replaced by utility classes"
```

---

### Task 15: Final verification and audit

- [ ] **Step 1:** Run `npx tsc --noEmit` — must pass clean

- [ ] **Step 2:** Search for any remaining `title=` attributes that should be `<Tip>` wrappers:
```bash
grep -r 'title=' src/ --include='*.tsx' | grep -v node_modules | grep -v '.test.'
```
Any remaining should be converted (unless they're on non-interactive elements like `<img>` or `<iframe>`).

- [ ] **Step 3:** Search for interactive elements without hover classes:
```bash
grep -r 'onClick' src/ --include='*.tsx' | grep -v 'hover-'
```
Audit the results — every `onClick` handler should have a hover class on its element (or a parent).

- [ ] **Step 4:** Final commit if any fixes needed
