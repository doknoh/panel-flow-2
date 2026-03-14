# Phase 1: Immediate Comfort Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor comfortable for sustained reading and editing sessions — font scaling and navigation flow improvements.

**Architecture:** Font scaling uses the same Context + localStorage + CSS variable pattern as the existing ThemeContext. Reading flow improvements are keyboard event and focus management changes in IssueEditor and PageEditor. No database changes. No new dependencies.

**Tech Stack:** React Context, CSS custom properties, TipTap focus management, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-03-14-ux-overhaul-design.md` (Sections 1 & 2)

---

## Chunk 1: Font Scale System

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/contexts/FontScaleContext.tsx` | Context provider, localStorage persistence, CSS variable application |
| Create | `src/components/ui/FontScaleToggle.tsx` | Three-option toggle UI (Small / Medium / Large) |
| Create | `src/lib/font-scale.ts` | Constants and types for font scale presets |
| Create | `src/lib/font-scale.test.ts` | Unit tests for scale utilities |
| Modify | `src/app/Providers.tsx` | Wrap children with FontScaleProvider |
| Modify | `src/app/globals.css` | Convert hardcoded px font-sizes to rem |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx` | Add FontScaleToggle to header |

---

### Task 1: Font Scale Constants and Types

**Files:**
- Create: `src/lib/font-scale.ts`
- Test: `src/lib/font-scale.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/lib/font-scale.test.ts
import { describe, it, expect } from 'vitest'
import {
  FONT_SCALE_PRESETS,
  FontScaleKey,
  getNextFontScale,
  getFontScaleLabel,
  FONT_SCALE_STORAGE_KEY,
  DEFAULT_FONT_SCALE,
} from './font-scale'

describe('font-scale', () => {
  it('has three presets: small, medium, large', () => {
    expect(Object.keys(FONT_SCALE_PRESETS)).toEqual(['small', 'medium', 'large'])
  })

  it('small preset is 1.0 (current default)', () => {
    expect(FONT_SCALE_PRESETS.small).toBe(1.0)
  })

  it('medium preset is 1.15', () => {
    expect(FONT_SCALE_PRESETS.medium).toBe(1.15)
  })

  it('large preset is 1.3', () => {
    expect(FONT_SCALE_PRESETS.large).toBe(1.3)
  })

  it('default font scale is small', () => {
    expect(DEFAULT_FONT_SCALE).toBe('small')
  })

  it('cycles through presets: small → medium → large → small', () => {
    expect(getNextFontScale('small')).toBe('medium')
    expect(getNextFontScale('medium')).toBe('large')
    expect(getNextFontScale('large')).toBe('small')
  })

  it('returns human-readable labels', () => {
    expect(getFontScaleLabel('small')).toBe('Small')
    expect(getFontScaleLabel('medium')).toBe('Medium')
    expect(getFontScaleLabel('large')).toBe('Large')
  })

  it('storage key is panel-flow-font-scale', () => {
    expect(FONT_SCALE_STORAGE_KEY).toBe('panel-flow-font-scale')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/font-scale.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/font-scale.ts
export type FontScaleKey = 'small' | 'medium' | 'large'

export const FONT_SCALE_PRESETS: Record<FontScaleKey, number> = {
  small: 1.0,
  medium: 1.15,
  large: 1.3,
}

export const DEFAULT_FONT_SCALE: FontScaleKey = 'small'
export const FONT_SCALE_STORAGE_KEY = 'panel-flow-font-scale'

const SCALE_ORDER: FontScaleKey[] = ['small', 'medium', 'large']

export function getNextFontScale(current: FontScaleKey): FontScaleKey {
  const idx = SCALE_ORDER.indexOf(current)
  return SCALE_ORDER[(idx + 1) % SCALE_ORDER.length]
}

export function getFontScaleLabel(key: FontScaleKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/font-scale.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/font-scale.ts src/lib/font-scale.test.ts
git commit -m "feat: add font scale presets and utility functions"
```

---

### Task 2: FontScaleContext Provider

**Files:**
- Create: `src/contexts/FontScaleContext.tsx`

- [ ] **Step 1: Create the context provider**

Follow the exact pattern from `src/contexts/ThemeContext.tsx`:
- State: `fontScaleKey` (FontScaleKey), `mounted` (boolean)
- On mount: read `localStorage.getItem('panel-flow-font-scale')`, default to `'small'`
- Apply: `document.documentElement.style.setProperty('--font-scale', String(FONT_SCALE_PRESETS[key]))`
- Expose: `{ fontScaleKey, setFontScale, cycleFontScale }`
- Hydration guard: render `{children}` only when `mounted === true`, otherwise `<div style={{ visibility: 'hidden' }}>{children}</div>`

```typescript
// src/contexts/FontScaleContext.tsx
'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import {
  FontScaleKey,
  FONT_SCALE_PRESETS,
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STORAGE_KEY,
  getNextFontScale,
} from '@/lib/font-scale'

interface FontScaleContextType {
  fontScaleKey: FontScaleKey
  setFontScale: (key: FontScaleKey) => void
  cycleFontScale: () => void
}

const FontScaleContext = createContext<FontScaleContextType | undefined>(undefined)

function applyFontScale(key: FontScaleKey) {
  document.documentElement.style.setProperty('--font-scale', String(FONT_SCALE_PRESETS[key]))
}

export function FontScaleProvider({ children }: { children: ReactNode }) {
  const [fontScaleKey, setFontScaleKey] = useState<FontScaleKey>(DEFAULT_FONT_SCALE)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(FONT_SCALE_STORAGE_KEY) as FontScaleKey | null
    const initial = stored && stored in FONT_SCALE_PRESETS ? stored : DEFAULT_FONT_SCALE
    setFontScaleKey(initial)
    applyFontScale(initial)
    setMounted(true)
  }, [])

  const setFontScale = useCallback((key: FontScaleKey) => {
    setFontScaleKey(key)
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, key)
    applyFontScale(key)
  }, [])

  const cycleFontScale = useCallback(() => {
    setFontScale(getNextFontScale(fontScaleKey))
  }, [fontScaleKey, setFontScale])

  return (
    <FontScaleContext.Provider value={{ fontScaleKey, setFontScale, cycleFontScale }}>
      {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
    </FontScaleContext.Provider>
  )
}

export function useFontScale() {
  const context = useContext(FontScaleContext)
  if (context === undefined) {
    throw new Error('useFontScale must be used within a FontScaleProvider')
  }
  return context
}
```

- [ ] **Step 2: Add FontScaleProvider to Providers.tsx**

In `src/app/Providers.tsx`, import `FontScaleProvider` and wrap it inside `ThemeProvider`:

```typescript
import { FontScaleProvider } from '@/contexts/FontScaleContext'

// In the return, wrap after ThemeProvider:
<ThemeProvider>
  <FontScaleProvider>
    <Tooltip.Provider delayDuration={400} skipDelayDuration={100}>
      {/* ... existing children ... */}
    </Tooltip.Provider>
  </FontScaleProvider>
</ThemeProvider>
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/FontScaleContext.tsx src/app/Providers.tsx
git commit -m "feat: add FontScaleContext with localStorage persistence"
```

---

### Task 3: Convert CSS from px to rem

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the root font-size rule using --font-scale**

There is no existing `html` selector in globals.css. Add one immediately after the `:root` block (around line 82, before any `.dark` rules):

```css
html {
  --font-scale: 1;
  font-size: calc(16px * var(--font-scale, 1));
}
```

The `--font-scale: 1` default makes the design system self-documenting. The FontScaleContext will override this via JavaScript. All rem values throughout the app will scale automatically when `--font-scale` changes.

- [ ] **Step 2: Convert hardcoded px font-sizes in script editor to rem**

Replace these values in `globals.css`:

| Line | Selector | Old | New |
|------|----------|-----|-----|
| 923 | `.script-editor .ProseMirror` | `font-size: 14px` | `font-size: 0.875rem` |
| 932-936 | `.script-editor--dialogue .ProseMirror, .script-editor--caption .ProseMirror` (combined selector) | `font-size: 13px` | `font-size: 0.8125rem` |
| 938-940 | `.script-editor--sfx .ProseMirror` | `font-size: 13px` | `font-size: 0.8125rem` |
| 946-948 | `.script-editor--notes .ProseMirror` | `font-size: 13px` | `font-size: 0.8125rem` |

- [ ] **Step 3: Convert hardcoded px font-sizes in zen mode to rem**

| Line | Selector | Old | New |
|------|----------|-----|-----|
| 1154 | `.zen-mode .script-editor--description .script-editor__content` | `font-size: 19px` | `font-size: 1.1875rem` |
| 1161 | `.zen-mode .script-editor--dialogue .script-editor__content` | `font-size: 16px` | `font-size: 1rem` |
| 1169 | `.zen-mode .script-editor--caption .script-editor__content` | `font-size: 16px` | `font-size: 1rem` |
| 1179 | `.zen-mode .script-editor--sfx .script-editor__content` | `font-size: 13px` | `font-size: 0.8125rem` |
| 1187 | `.zen-mode .script-editor--notes .script-editor__content` | `font-size: 15px` | `font-size: 0.9375rem` |

**Note:** These zen mode selectors target `.script-editor__content`, NOT `.ProseMirror`. The base editor rules (Step 2) target `.ProseMirror`. Both need conversion.

- [ ] **Step 4: Convert remaining hardcoded px font-sizes to rem**

| Line | Selector | Old | New |
|------|----------|-----|-----|
| 359 | `.tip-content` | `font-size: 10px` | `font-size: 0.625rem` |
| 608 | `.dropdown-item` | `font-size: 13px` | `font-size: 0.8125rem` |
| 628 | `.dropdown-shortcut` | `font-size: 11px` | `font-size: 0.6875rem` |
| 1080 | `.script-editor__word-count` | `font-size: 10px` | `font-size: 0.625rem` |
| 1251 | `.mention-dropdown-name` | `font-size: 10px` | `font-size: 0.625rem` |
| 1257 | `.mention-dropdown-role` | `font-size: 10px` | `font-size: 0.625rem` |
| 1272 | `.script-header` | `font-size: 10px` | `font-size: 0.625rem` |
| 1287 | `.script-toolbar` | `font-size: 10px` | `font-size: 0.625rem` |
| 1294 | `.script-page-header` | `font-size: 22px` | `font-size: 1.375rem` |
| 1312 | `.script-context-line` | `font-size: 10px` | `font-size: 0.625rem` |
| 1322 | `.script-panel-label` | `font-size: 10px` | `font-size: 0.625rem` |
| 1344 | `.script-block-description` | `font-size: 13px` | `font-size: 0.8125rem` |
| 1359 | `.script-block-dialogue .speaker-label` | `font-size: 10px` | `font-size: 0.625rem` |
| 1374 | `.script-block-dialogue .dialogue-text` | `font-size: 13px` | `font-size: 0.8125rem` |
| 1389 | `.script-block-caption .caption-label` | `font-size: 10px` | `font-size: 0.625rem` |
| 1404 | `.script-block-caption .caption-text` | `font-size: 13px` | `font-size: 0.8125rem` |
| 1418 | `.script-block-sfx .sfx-text` | `font-size: 13px` | `font-size: 0.8125rem` |
| 1467 | `.script-quick-add` | `font-size: 10px` | `font-size: 0.625rem` |
| ~1500 | `.script-quick-add .quick-add-key kbd` | `font-size: 10px` | `font-size: 0.625rem` |
| 1516 | `.script-footer` | `font-size: 9px` | `font-size: 0.5625rem` |
| ~1528 | `.script-footer kbd` | `font-size: 9px` | `font-size: 0.5625rem` |

- [ ] **Step 5: Verify the dev server renders correctly at default scale**

Run: `npm run dev`
Open the issue editor page. Everything should look identical to before (scale 1.0 = 16px root = same rem values as the old px values).

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: convert all font-sizes from px to rem for global scaling"
```

---

### Task 4: FontScaleToggle UI Component

**Files:**
- Create: `src/components/ui/FontScaleToggle.tsx`

- [ ] **Step 1: Create the toggle component**

Follow the pattern from `src/components/ui/ThemeToggle.tsx` — same button styling, same Tip tooltip wrapper. Three-state cycle on click.

```typescript
// src/components/ui/FontScaleToggle.tsx
'use client'

import { useFontScale } from '@/contexts/FontScaleContext'
import { getFontScaleLabel } from '@/lib/font-scale'
import { Tip } from '@/components/ui/Tip'
import { Type } from 'lucide-react'

interface FontScaleToggleProps {
  className?: string
}

export default function FontScaleToggle({ className = '' }: FontScaleToggleProps) {
  const { fontScaleKey, cycleFontScale } = useFontScale()
  const label = getFontScaleLabel(fontScaleKey)

  return (
    <Tip content={`Font size: ${label} (click to cycle)`}>
      <button
        onClick={cycleFontScale}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg active:scale-[0.97] transition-all duration-150 ease-out hover:bg-[var(--bg-tertiary)] hover-fade ${className}`}
        aria-label={`Font size: ${label}. Click to change.`}
      >
        <Type className="w-4 h-4 text-[var(--text-secondary)]" />
        <span className="text-xs font-medium text-[var(--text-secondary)] min-w-[1.5rem]">
          {label[0]}
        </span>
      </button>
    </Tip>
  )
}
```

- [ ] **Step 2: Add FontScaleToggle to the IssueEditor header**

In `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`, find where `ThemeToggle` is rendered (line ~1083, in the header's right-side controls area). Add `FontScaleToggle` next to it.

Import at top of file:
```typescript
import FontScaleToggle from '@/components/ui/FontScaleToggle'
```

Add next to ThemeToggle in the header's right-side controls.

- [ ] **Step 3: Verify all three scales work in the browser**

Open the issue editor. Click the font scale toggle:
- Small (S): everything at current size
- Medium (M): ~15% larger — text, buttons, labels all scale
- Large (L): ~30% larger — comfortable reading at distance

Verify: TipTap editors scale, navigation tree scales, panel cards scale, toolbar text scales, dropdown menus scale.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/FontScaleToggle.tsx src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
git commit -m "feat: add font scale toggle to editor header"
```

---

## Chunk 2: Sequential Reading & Editing Flow

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx` | Page transition animation, position indicator, peek shortcut change |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx` | Navigate mode, focus ring, Tab cycling, auto-advance |
| Modify | `src/app/globals.css` | Page crossfade animation, focus ring styles, navigate mode styles |

---

### Task 5: Page Position Indicator

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`

- [ ] **Step 1: Compute position data**

In IssueEditor, near the existing `selectedPageContext` useMemo (line ~104), add a computed `pagePosition` value:

```typescript
const pagePosition = useMemo(() => {
  if (!selectedPageId || allPages.length === 0) return null
  const index = allPages.findIndex(p => p.id === selectedPageId)
  if (index === -1) return null
  const page = allPages[index]
  const actName = selectedPageContext?.act?.name || ''
  const sceneTitle = selectedPageContext?.scene?.title || ''
  return {
    current: index + 1,
    total: allPages.length,
    pageNumber: page.pageNumber,
    actName,
    sceneTitle,
  }
}, [selectedPageId, allPages, selectedPageContext])
```

- [ ] **Step 2: Render position indicator in editor column header**

Above the PageEditor component in the center column, render a persistent breadcrumb:

```tsx
{pagePosition && (
  <div className="px-4 py-1.5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)] flex items-center justify-between">
    <span>
      Page {pagePosition.pageNumber} of {pagePosition.total}
      {pagePosition.actName && ` — ${pagePosition.actName}`}
      {pagePosition.sceneTitle && `, ${pagePosition.sceneTitle}`}
    </span>
    <span className="text-[var(--text-muted)]">
      {pagePosition.current}/{pagePosition.total}
    </span>
  </div>
)}
```

- [ ] **Step 3: Verify in browser**

Navigate between pages using Cmd+Up/Down. The position indicator should update immediately showing current page number, total pages, act name, and scene title.

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
git commit -m "feat: add persistent page position indicator to editor header"
```

---

### Task 6: Page Transition Crossfade

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`

- [ ] **Step 1: Add crossfade animation class to globals.css**

Near the existing `@keyframes page-enter` (line 454), add:

```css
@keyframes page-crossfade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-page-crossfade {
  animation: page-crossfade 150ms ease-out;
}
```

- [ ] **Step 2: Replace the existing page-enter animation with the crossfade**

In IssueEditor at line ~1148, the existing PageEditor wrapper already has:
```tsx
<div key={selectedPage.id} className="flex-1 overflow-y-auto" style={{ animation: 'page-enter 150ms ease-out' }}>
```

**Replace** the inline `style` animation with the new class. Do NOT add a second wrapper — that would cause a double-animation glitch:

```tsx
<div key={selectedPage.id} className="flex-1 overflow-y-auto animate-page-crossfade">
  <PageEditor
    page={selectedPage}
    {/* ...existing props */}
  />
</div>
```

The `key` change already causes React to remount, triggering the CSS animation on each page change. We're just swapping the animation from slide-up-and-fade to pure crossfade.

- [ ] **Step 3: Verify in browser**

Navigate between pages with Cmd+Up/Down. Each page change should have a subtle 150ms fade-in instead of an instant swap.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
git commit -m "feat: add subtle crossfade transition on page navigation"
```

---

### Task 7: Hold-to-Peek Page Preview

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`

- [ ] **Step 1: Replace Alt+Arrow toggle with Cmd+Shift+Arrow hold-to-show**

In the keyboard handler (line ~852), replace the existing Alt+Arrow block. Add both `keydown` and `keyup` handlers:

In the existing `handleKeyDown`. **Important:** Guard against intercepting text selection inside TipTap editors:
```typescript
// Cmd+Shift+Left/Right = Hold-to-peek previous/next page
if (isMod && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
  // Don't intercept when user is editing text (Cmd+Shift+Arrow is "select to line start/end")
  const activeElement = document.activeElement
  const isInput = activeElement instanceof HTMLInputElement ||
                 activeElement instanceof HTMLTextAreaElement ||
                 activeElement?.getAttribute('contenteditable') === 'true'
  if (isInput) return // Let text selection work normally

  e.preventDefault()
  if (!selectedPageId || allPages.length === 0) return
  const currentIndex = allPages.findIndex(p => p.id === selectedPageId)
  if (currentIndex === -1) return
  const peekIndex = e.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1
  if (peekIndex >= 0 && peekIndex < allPages.length) {
    setPeekPageId(allPages[peekIndex].id)
  }
  return
}
```

Add a new `handleKeyUp` handler in the same useEffect:
```typescript
const handleKeyUp = (e: KeyboardEvent) => {
  // Release peek when modifier keys released
  if (peekPageId && (e.key === 'Meta' || e.key === 'Control' || e.key === 'Shift' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    setPeekPageId(null)
  }
}

window.addEventListener('keydown', handleKeyDown)
window.addEventListener('keyup', handleKeyUp)
return () => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
}
```

- [ ] **Step 2: Remove the old Alt+Arrow block** (lines 852-863 in current code)

Delete the `if (e.altKey && !isMod && ...)` block.

- [ ] **Step 3: Verify in browser**

Hold Cmd+Shift+Left: previous page appears as overlay. Release: overlay disappears. Hold Cmd+Shift+Right: next page overlay. The existing peek overlay rendering should already handle the display.

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
git commit -m "feat: replace page peek with hold-to-show Cmd+Shift+Arrow"
```

---

### Task 8: Navigate Mode (Arrow Key Panel Navigation)

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx`
- Modify: `src/app/globals.css`

This is the most complex task. Implements the VS Code list/editor focus split pattern.

- [ ] **Step 1: Add navigate mode styles to globals.css**

```css
/* Navigate mode focus ring */
.panel-card--focused {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 8px;
}

.panel-card--focused .panel-card__inner {
  background: var(--bg-tertiary);
}
```

- [ ] **Step 2: Add navigate mode state to PageEditor**

At the top of the PageEditor component, add:

```typescript
const [navigateMode, setNavigateMode] = useState(true) // start in navigate mode
const [focusedPanelIndex, setFocusedPanelIndex] = useState(0)
const containerRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 2b: Reset navigate state on page change**

Add a reset effect so focusedPanelIndex doesn't point to a non-existent panel when the page changes:

```typescript
useEffect(() => {
  setFocusedPanelIndex(0)
  setNavigateMode(true)
}, [page.id])
```

- [ ] **Step 3: Add keyboard handler for navigate mode**

Add a new `onKeyDown` handler on the panel container div. **Important:** Use `panels[focusedPanelIndex].id` for DOM queries, not a numeric index, because the existing codebase uses `data-panel-id` (UUID) not `data-panel-index`:

```typescript
const focusedPanelId = panels[focusedPanelIndex]?.id

const handleContainerKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (!navigateMode) return // TipTap handles keys when editing

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setFocusedPanelIndex(prev => Math.min(prev + 1, panels.length - 1))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    setFocusedPanelIndex(prev => Math.max(prev - 1, 0))
  } else if (e.key === 'Enter') {
    e.preventDefault()
    setNavigateMode(false)
    // Focus the first editable field in the focused panel
    const panelEl = document.querySelector(`[data-panel-id="${focusedPanelId}"] .ProseMirror`)
    if (panelEl instanceof HTMLElement) {
      panelEl.focus()
    }
  }
}, [navigateMode, panels.length, focusedPanelIndex, focusedPanelId])
```

- [ ] **Step 4: Handle Escape to return to navigate mode**

In the existing keyboard shortcuts (line ~472 in PageEditor), the Escape handler already exists. Extend it:

```typescript
// Escape = exit editing, return to navigate mode
if (e.key === 'Escape') {
  e.preventDefault()
  setNavigateMode(true)
  setEditingPanel(null) // Critical: un-collapse all panels so navigate mode shows full list
  containerRef.current?.focus()
  return
}
```

**Note:** The existing Escape handler at line ~472 already does `setEditingPanel(null)`. Merge these two Escape handlers into one — don't create a competing handler. Add `setNavigateMode(true)` and `containerRef.current?.focus()` to the existing handler.

- [ ] **Step 5: Apply focus ring class to the focused panel card**

In the panel rendering loop, add a conditional class. The existing codebase uses `data-panel-id` with the panel UUID — keep that, and also add `data-panel-index` for index-based queries:

```tsx
<div
  data-panel-id={panel.id}
  data-panel-index={index}
  className={`panel-card ${navigateMode && index === focusedPanelIndex ? 'panel-card--focused' : ''}`}
>
```

- [ ] **Step 6: Add tabIndex and ref to the panel container**

On the outermost scrollable div that contains all panels:

```tsx
<div
  ref={containerRef}
  tabIndex={0}
  onKeyDown={handleContainerKeyDown}
  className="panel-container outline-none"
>
```

- [ ] **Step 7: Handle focus events to toggle navigate mode**

When a TipTap editor gains focus, exit navigate mode. When it loses focus and container regains focus, re-enter navigate mode:

```typescript
// When any TipTap editor in a panel gains focus
const handleEditorFocusIn = useCallback(() => {
  setNavigateMode(false)
}, [])

// Track: when blur happens and container gets focus back
useEffect(() => {
  const container = containerRef.current
  if (!container) return
  const handleFocusIn = (e: FocusEvent) => {
    if (e.target === container) {
      setNavigateMode(true)
    }
  }
  container.addEventListener('focusin', handleFocusIn)
  return () => container.removeEventListener('focusin', handleFocusIn)
}, [])
```

- [ ] **Step 8: Verify in browser**

1. Click on the panel area — navigate mode active, focus ring on first panel
2. Arrow Down — focus ring moves to next panel
3. Enter — first TipTap editor in that panel gains focus, navigate mode off
4. Type some text — works normally
5. Escape — navigate mode re-activates, focus ring returns to that panel
6. Arrow Up — moves up

- [ ] **Step 9: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx src/app/globals.css
git commit -m "feat: add navigate mode with arrow key panel traversal"
```

---

### Task 9: Tab Cycling Between Fields

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx`

- [ ] **Step 0: Add onNavigateToPage prop to PageEditor**

Add to the PageEditor props interface (line ~108-118):
```typescript
onNavigateToPage?: (direction: 'prev' | 'next') => void
```

Pass it from IssueEditor at both the desktop (line ~1149) and mobile (line ~1218) PageEditor instances:
```tsx
<PageEditor
  {/* ...existing props */}
  onNavigateToPage={navigateToPage}
/>
```

- [ ] **Step 1: Add Tab key handling**

Add the Tab handler to the **window-level keydown handler** in PageEditor (line ~430, the existing `useEffect` that handles Cmd+S, Cmd+Enter, etc.). ProseMirror does not have a default Tab handler, so Tab should bubble, but using the window-level handler ensures capture regardless:

```typescript
// Tab = move to next field within panel, then next panel
if (e.key === 'Tab' && !navigateMode) {
  e.preventDefault()
  const currentPanelId = panels[focusedPanelIndex]?.id
  const focusableFields = Array.from(
    document.querySelectorAll(`[data-panel-id="${currentPanelId}"] .ProseMirror`)
  ) as HTMLElement[]

  const currentFieldIndex = focusableFields.indexOf(document.activeElement as HTMLElement)

  if (e.shiftKey) {
    // Move backward
    if (currentFieldIndex > 0) {
      focusableFields[currentFieldIndex - 1].focus()
    } else if (focusedPanelIndex > 0) {
      // Move to last field of previous panel
      const newIndex = focusedPanelIndex - 1
      setFocusedPanelIndex(newIndex)
      requestAnimationFrame(() => {
        const prevPanelId = panels[newIndex]?.id
        const prevFields = Array.from(
          document.querySelectorAll(`[data-panel-id="${prevPanelId}"] .ProseMirror`)
        ) as HTMLElement[]
        prevFields[prevFields.length - 1]?.focus()
      })
    }
  } else {
    // Move forward
    if (currentFieldIndex < focusableFields.length - 1) {
      focusableFields[currentFieldIndex + 1].focus()
    } else if (focusedPanelIndex < panels.length - 1) {
      // Move to first field of next panel
      const newIndex = focusedPanelIndex + 1
      setFocusedPanelIndex(newIndex)
      requestAnimationFrame(() => {
        const nextPanelId = panels[newIndex]?.id
        const nextFields = Array.from(
          document.querySelectorAll(`[data-panel-id="${nextPanelId}"] .ProseMirror`)
        ) as HTMLElement[]
        nextFields[0]?.focus()
      })
    }
  }
}
```

**Note:** Uses `data-panel-id` (UUID) for DOM queries, consistent with Step 5 of Task 8. Uses extracted `newIndex` variable in `requestAnimationFrame` callbacks to avoid stale closure issues.

- [ ] **Step 2: Handle Tab from last panel on page to trigger page advance**

After the Tab handler, if we're at the last field of the last panel and Tab is pressed (forward), call the `onNavigateToPage` callback:

```typescript
// If we're on the last field of the last panel, Tab advances to next page
if (!e.shiftKey && focusedPanelIndex === panels.length - 1 && currentFieldIndex === focusableFields.length - 1) {
  onNavigateToPage?.('next')
  return
}
```

This requires adding `onNavigateToPage` as a prop to PageEditor, passed from IssueEditor's `navigateToPage` function.

- [ ] **Step 3: Verify in browser**

1. Enter edit mode on panel 1's description
2. Press Tab — focus moves to dialogue block (if any), then caption, then SFX, then notes
3. Tab from last field in panel 1 — focus jumps to panel 2's description
4. Shift+Tab — goes backward
5. Tab from last field of last panel on page — navigates to next page

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
git commit -m "feat: add Tab cycling through fields and cross-panel navigation"
```

---

### Task 10: Auto-Advance on Blur

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx`

- [ ] **Step 1: Track the active field position for auto-advance**

This is simpler than Tab cycling. When a TipTap editor blurs naturally (user clicks elsewhere), if the blur was from finishing an edit (not from clicking a specific other element), advance focus to the next logical field.

In the ScriptEditor's `onBlur` callback chain in PageEditor, after save completes:

```typescript
// Auto-advance: if blur wasn't caused by clicking another focusable element,
// move focus to next field
const handleAutoAdvance = useCallback((panelIndex: number, fieldType: string) => {
  requestAnimationFrame(() => {
    const active = document.activeElement
    // If focus went to body or the container (not another field), advance
    if (active === document.body || active === containerRef.current) {
      // Let navigate mode take over — don't force advance
      setNavigateMode(true)
      containerRef.current?.focus()
    }
  })
}, [])
```

This is intentionally conservative — auto-advance only re-enters navigate mode rather than jumping to the next field. The user then uses Arrow/Enter or Tab to continue. This avoids the annoying behavior of forced focus jumps when you're trying to click elsewhere.

- [ ] **Step 2: Verify in browser**

1. Edit a panel description, click elsewhere (not on another field) — navigate mode activates, focus ring appears
2. Edit a dialogue block, click elsewhere — same behavior
3. Edit a field, then click on a different field — focus goes where you clicked (no interference)

- [ ] **Step 3: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx
git commit -m "feat: auto-return to navigate mode on field blur"
```

---

### Task 11: Floating Reference Panel (Alt+Click)

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add floating reference state to IssueEditor**

```typescript
const [floatingRefPageId, setFloatingRefPageId] = useState<string | null>(null)
```

- [ ] **Step 2: Pass Alt+Click handler to NavigationTree**

Add a prop to NavigationTree for the alt-click handler:

```typescript
<NavigationTree
  {/* ...existing props */}
  onAltClickPage={(pageId: string) => setFloatingRefPageId(pageId)}
/>
```

- [ ] **Step 3: Handle Alt+Click in NavigationTree**

In NavigationTree's page click handler, detect Alt key:

```typescript
const handlePageClick = (pageId: string, e: React.MouseEvent) => {
  if (e.altKey) {
    onAltClickPage?.(pageId)
  } else {
    onSelectPage(pageId)
  }
}
```

- [ ] **Step 4: Render floating reference panel**

In IssueEditor, render a floating read-only panel when `floatingRefPageId` is set:

```tsx
{floatingRefPageId && (
  <div className="floating-reference-panel">
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-primary)]">
      <span className="text-xs font-medium text-[var(--text-muted)]">
        Reference: Page {allPages.find(p => p.id === floatingRefPageId)?.pageNumber}
      </span>
      <button
        onClick={() => setFloatingRefPageId(null)}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        ✕ Close (Esc)
      </button>
    </div>
    <div className="p-3 overflow-y-auto max-h-[60vh] text-sm opacity-90">
      {/* Render read-only panel summaries for the referenced page */}
      <ReadOnlyPagePreview page={allPages.find(p => p.id === floatingRefPageId)} />
    </div>
  </div>
)}
```

- [ ] **Step 5: Add Escape to dismiss floating panel**

In the keyboard handler. **Important:** Place this AFTER navigate mode Escape handling, not before — so that if the user is editing a field, Escape first exits editing (navigate mode), and a second Escape dismisses the floating panel:

```typescript
// Only dismiss floating panel when already in navigate mode (not actively editing)
if (e.key === 'Escape' && floatingRefPageId && !document.activeElement?.getAttribute('contenteditable')) {
  e.preventDefault()
  setFloatingRefPageId(null)
  return
}
```

- [ ] **Step 6: Add floating panel styles to globals.css**

The floating panel must be positioned relative to the center editor column, not the viewport, to avoid overlapping the right toolkit panel. Render it inside the center column container with `position: absolute`:

```css
/* The center column needs position: relative for the floating panel */
.editor-center-column {
  position: relative;
}

.floating-reference-panel {
  position: absolute;
  right: 1rem;
  top: 4rem;
  width: 380px;
  max-height: calc(100% - 6rem);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  z-index: 40;
  overflow: hidden;
  animation: page-enter 150ms ease-out;
}
```

Add `editor-center-column` class to the center column wrapper div in IssueEditor. The z-index of 40 is below dropdowns (50) to avoid stacking issues.

- [ ] **Step 7: Extract ReadOnlyPagePreview from existing peek overlay**

The existing peek overlay (IssueEditor lines ~1450-1488) already renders exactly this — a read-only panel list with descriptions, dialogue, and captions. Extract that rendering logic into a shared `ReadOnlyPagePreview` component and use it in both the existing peek overlay AND the new floating reference panel. This avoids code duplication.

Create as a function component inside IssueEditor (or a new file `src/app/series/[seriesId]/issues/[issueId]/ReadOnlyPagePreview.tsx` if it exceeds ~50 lines). Props: `page` (the page object with nested panels/dialogue/captions).

**Also:** Remove interactive buttons ("Go to page") from the peek overlay since hold-to-show makes clicking impossible while holding modifier keys. Keep the floating reference panel's close button since it persists.

- [ ] **Step 8: Verify in browser**

1. Alt+Click a page in the nav tree — floating panel appears on the right
2. Shows read-only panel summaries for that page
3. Press Escape — panel dismisses
4. Alt+Click while floating panel is open — swaps to new page
5. Regular click — navigates as normal, no floating panel

- [ ] **Step 9: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx src/app/globals.css
git commit -m "feat: add floating reference panel via Alt+Click in nav tree"
```

---

### Task 12: Update Keyboard Shortcuts Help

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/KeyboardShortcutsModal.tsx`

- [ ] **Step 1: Update the shortcuts help**

In `KeyboardShortcutsModal.tsx`, the shortcuts data structure is a static array (line ~11-42). Update it:
- The Alt+Arrow peek shortcut is NOT currently listed (confirmed by grep), so no removal needed
- Add: Cmd+Shift+Left/Right (hold to peek previous/next page)
- Add: Alt+Click page in nav tree (open floating reference)
- Add: Arrow Up/Down (navigate between panels — when not editing)
- Add: Enter (edit focused panel)
- Add: Escape (return to navigate mode)
- Add: Tab/Shift+Tab (cycle between fields)
- Update the font scale control description

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/KeyboardShortcutsModal.tsx
git commit -m "docs: update keyboard shortcuts help with new navigation controls"
```

---

### Task 13: Final Integration Test

- [ ] **Step 1: Full flow verification**

Run through the complete reading workflow:
1. Open any issue
2. Set font to Large — everything scales, no layout breakage
3. Navigate to page 1 with Cmd+Down — crossfade transition, position indicator updates
4. Arrow Down through panels — focus ring moves
5. Enter on a panel — edit mode, cursor in description
6. Tab through fields — moves through description → dialogue → captions → SFX → notes
7. Tab from last panel — goes to next panel
8. Escape — back to navigate mode
9. Cmd+Down — next page with crossfade
10. Cmd+Shift+Left (hold) — peek at previous page overlay
11. Release — overlay gone
12. Alt+Click page 15 in nav tree — floating reference panel shows
13. Escape — floating panel dismisses
14. Set font back to Small — everything returns to original size

- [ ] **Step 2: Verify no regressions**

Run: `npx vitest run`
Verify all existing tests pass.

Run: `npm run build`
Verify no TypeScript errors or build failures.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — font scaling and sequential reading flow"
```
