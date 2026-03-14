# Script View Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Script View to feel like a professional screenplay editor — consistent header, single adaptive toolbar, keyboard-first tab flow, continuous scroll, inline quick-add menu.

**Architecture:** ScriptView.tsx gets a major rewrite while retaining its block-model data layer. Foundation changes to ScriptEditor (new `onEditorFocus` callback) and ScriptEditorToolbar (mouse event handling) enable the adaptive toolbar. The existing block-building/saving/undo logic is preserved; the rendering, navigation, and interaction layers are rebuilt.

**Tech Stack:** React 19, Next.js 16 (App Router), TipTap 3.20, Tailwind 4, Supabase, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-13-script-view-redesign-design.md`

---

## File Structure

### Modified Files

| File | Responsibility | Changes |
|------|---------------|---------|
| `src/components/editor/ScriptEditor.tsx` | TipTap rich text editor wrapper | Add `onEditorFocus` callback that passes Editor instance; add `onEditorBlur` callback |
| `src/components/editor/ScriptEditorToolbar.tsx` | Formatting toolbar buttons | Add `onMouseDown={e.preventDefault()}` to all buttons; add optional `contextLabel` prop |
| `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx` | Full-screen script editing view | Major rewrite: new header, adaptive toolbar, continuous scroll, tab navigation, quick-add menu, typography, active highlighting |
| `src/app/series/[seriesId]/issues/[issueId]/FindReplaceModal.tsx` | Find & replace floating panel | Change navigation from page-switch to scrollIntoView for continuous scroll |
| `src/app/globals.css` | Global styles | Add Script View–specific CSS classes for typography, toolbar, quick-add menu, active highlighting |

### Key Architecture Notes

- **Block model preserved:** The `allBlocks` useMemo that flattens the issue hierarchy into `ScriptBlock[]` remains unchanged. The scope-filtering in `getBlocksForScope` simplifies since continuous scroll removes the need for page-by-page filtering.
- **Editor ref tracking:** Each `ScriptEditor` instance calls `onEditorFocus(editor, blockId)` when focused. ScriptView stores the active editor + block metadata in a ref, then renders a standalone `ScriptEditorToolbar` in the sticky bar position, passing it the active editor.
- **Tab navigation:** A new `tabOrder` array (computed via useMemo) lists all editable block IDs in reading order. Tab/Shift+Tab are intercepted at the ScriptView level and programmatically focus the next/previous editor via `editor.commands.focus()`.
- **Quick-add menu:** Rendered as a lightweight inline div after each panel's last block. Activated when Tab reaches the end of a panel's fields. Responds to D/C/S/P/Tab/Esc keys. Creates blocks via existing `addDialogue`/`addCaption`/`addSoundEffect`/`addPanel` functions.

---

## Chunk 1: Foundation

### Task 1: ScriptEditor — Add `onEditorFocus` callback

**Files:**
- Modify: `src/components/editor/ScriptEditor.tsx`

The parent ScriptView needs to know which TipTap Editor instance is focused so it can render the adaptive toolbar. Currently `onFocus` fires with no arguments. We add a new `onEditorFocus` callback that passes the Editor instance.

- [ ] **Step 1: Add new props to ScriptEditor**

In `src/components/editor/ScriptEditor.tsx`, add two new optional props to the `ScriptEditorProps` interface:

```typescript
interface ScriptEditorProps {
  variant: 'description' | 'dialogue' | 'caption' | 'sfx' | 'notes'
  initialContent: string
  onUpdate: (markdown: string) => void
  onFocus?: () => void
  onBlur?: (markdown: string) => void
  onEditorFocus?: (editor: Editor) => void   // NEW
  onEditorBlur?: () => void                   // NEW
  placeholder?: string
  characters?: Character[]
  showWordCount?: boolean
  className?: string
  editable?: boolean
  speakerColor?: string
  hideToolbar?: boolean
}
```

- [ ] **Step 2: Add `Editor` type import**

Add `Editor` to the existing `@tiptap/react` import:

```typescript
import { useEditor, EditorContent, Editor } from '@tiptap/react'
```

- [ ] **Step 3: Wire up the callbacks**

Create stable refs for the new callbacks (same pattern as existing `onFocusRef` / `onBlurRef`):

```typescript
const onEditorFocusRef = useRef(onEditorFocus)
const onEditorBlurRef = useRef(onEditorBlur)
useEffect(() => { onEditorFocusRef.current = onEditorFocus }, [onEditorFocus])
useEffect(() => { onEditorBlurRef.current = onEditorBlur }, [onEditorBlur])
```

The `onFocus` handler in the `useEditor` config should only set `isFocused` (don't try to call `onEditorFocus` here — the `editor` variable isn't available yet inside the useEditor config). Keep the existing `onFocus` handler unchanged:

```typescript
onFocus: () => {
  setIsFocused(true)
  onFocusRef.current?.()
},
```

Add `onEditorBlurRef` call to the existing `onBlur` handler (keep the existing `({ editor: ed })` pattern for markdown extraction):

```typescript
onBlur: ({ editor: ed }) => {
  setIsFocused(false)
  const md = ((ed.storage as any).markdown as MarkdownStorage).getMarkdown()
  onBlurRef.current?.(md)
  onEditorBlurRef.current?.()
},
```

Fire `onEditorFocus` via a separate `useEffect` that watches `isFocused` and `editor` — this is the sole mechanism for reporting the editor instance to the parent:

```typescript
useEffect(() => {
  if (isFocused && editor && onEditorFocusRef.current) {
    onEditorFocusRef.current(editor)
  }
}, [isFocused, editor])
```

- [ ] **Step 4: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

Expected: No new type errors (the new props are optional, so existing callers don't need changes).

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ScriptEditor.tsx
git commit -m "feat(ScriptEditor): add onEditorFocus/onEditorBlur callbacks for external toolbar support"
```

---

### Task 2: ScriptEditorToolbar — Add preventDefault for external use

**Files:**
- Modify: `src/components/editor/ScriptEditorToolbar.tsx`

When the toolbar is rendered outside the ScriptEditor component (as a sticky bar), clicking a button would blur the active editor. Adding `onMouseDown={e => e.preventDefault()}` on each button prevents this. The `.focus()` call in each action chain then keeps the editor focused.

- [ ] **Step 1: Add `onMouseDown` to every toolbar button**

In `ScriptEditorToolbar.tsx`, find the button render (around line 153-170). Each button currently looks like:

```tsx
<button
  key={btn.label}
  onClick={btn.action}
  className={...}
  title={btn.title}
>
```

Add `onMouseDown` to prevent focus steal:

```tsx
<button
  key={btn.label}
  onClick={btn.action}
  onMouseDown={(e) => e.preventDefault()}
  className={...}
  title={btn.title}
>
```

This applies to every `<button>` in the toolbar — both the individual buttons and any group wrappers.

- [ ] **Step 2: Add optional `contextLabel` prop**

Add a new optional prop to show the editing context on the right side of the toolbar:

```typescript
interface ScriptEditorToolbarProps {
  editor: Editor
  variant: VariantType
  contextLabel?: string  // NEW — e.g., "EDITING: PANEL 3 DESCRIPTION"
}
```

Render the context label at the end of the toolbar row:

```tsx
{contextLabel && (
  <span className="ml-auto text-[var(--text-muted)] text-[9px] tracking-[0.5px] font-sans">
    {contextLabel}
  </span>
)}
```

- [ ] **Step 3: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/ScriptEditorToolbar.tsx
git commit -m "feat(ScriptEditorToolbar): add preventDefault on buttons + contextLabel for external toolbar use"
```

---

### Task 3: CSS — Script View typography and layout styles

**Files:**
- Modify: `src/app/globals.css`

Add CSS classes for the redesigned Script View. These are used by the ScriptView component in later tasks.

- [ ] **Step 1: Add Script View CSS classes to globals.css**

Add at the end of `globals.css`, after the existing `.script-view-editor` styles (around line 1211). This keeps all Script View styles together. These classes implement the design spec's typography and layout:

```css
/* ===== Script View Redesign ===== */

/* Header: matches site-wide standard */
.script-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  font-family: -apple-system, 'Helvetica Neue', sans-serif;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* Adaptive toolbar: sticky below header */
.script-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  flex-shrink: 0;
}

/* Page header in body: sans-serif structural element */
.script-page-header {
  font-family: -apple-system, 'Helvetica Neue', sans-serif;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  border-bottom: 2px solid var(--text-secondary);
  padding-bottom: 6px;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.script-page-header .orientation {
  font-weight: 400;
  opacity: 0.5;
}

/* Act/scene context below page header */
.script-context-line {
  font-family: -apple-system, 'Helvetica Neue', sans-serif;
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 24px;
}

/* Panel label: sans-serif structural */
.script-panel-label {
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 4px;
  transition: color 0.15s ease;
}

/* Script body container */
.script-body {
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px;
  max-width: 680px;
  margin: 0 auto;
  width: 100%;
}

/* Block types — base styles */
.script-block-description {
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  border-left: 2px solid color-mix(in srgb, var(--text-secondary) 40%, transparent);
  padding-left: 14px;
  color: var(--text-secondary);
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.script-block-dialogue {
  margin-left: 40px;
  margin-bottom: 6px;
}

.script-block-dialogue .speaker-label {
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-primary) 70%, transparent);
  margin-bottom: 2px;
  cursor: pointer;
}

.script-block-dialogue .speaker-label:hover {
  color: var(--color-primary);
}

.script-block-dialogue .dialogue-text {
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  border-left: 2px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
  padding-left: 12px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.script-block-caption {
  margin-left: 40px;
  margin-bottom: 6px;
}

.script-block-caption .caption-label {
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-warning) 70%, transparent);
  margin-bottom: 2px;
  cursor: pointer;
}

.script-block-caption .caption-label:hover {
  color: var(--color-warning);
}

.script-block-caption .caption-text {
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  border-left: 2px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
  padding-left: 12px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.script-block-sfx {
  margin-left: 40px;
}

.script-block-sfx .sfx-text {
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-hover);
  letter-spacing: 1px;
}

/* Active field highlighting */
.script-block-description.is-active {
  border-left-color: var(--text-secondary);
  background: color-mix(in srgb, var(--text-secondary) 8%, transparent);
  border-radius: 0 4px 4px 0;
  padding: 8px 8px 8px 14px;
}

.script-block-dialogue .dialogue-text.is-active {
  border-left-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  border-radius: 0 4px 4px 0;
  padding: 8px 8px 8px 12px;
}

.script-block-caption .caption-text.is-active {
  border-left-color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  border-radius: 0 4px 4px 0;
  padding: 8px 8px 8px 12px;
}

/* Active panel label brightens to match */
.script-panel-label.is-active-description {
  color: var(--text-secondary);
}
.script-panel-label.is-active-dialogue {
  color: var(--color-primary);
}
.script-panel-label.is-active-caption {
  color: var(--color-warning);
}
.script-panel-label.is-active-sfx {
  color: var(--accent-hover);
}

/* Quick-add menu */
.script-quick-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 6px 14px;
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  opacity: 0;
  height: 0;
  overflow: hidden;
  transition: opacity 0.15s ease, height 0.15s ease;
}

.script-quick-add.is-visible {
  opacity: 1;
  height: auto;
  padding: 8px 0 8px 14px;
}

.script-quick-add .quick-add-key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  transition: background 0.1s ease, color 0.1s ease;
}

.script-quick-add .quick-add-key:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.script-quick-add .quick-add-key kbd {
  font-family: -apple-system, sans-serif;
  font-weight: 600;
  font-size: 10px;
}

.script-quick-add .quick-add-separator {
  color: var(--text-muted);
  opacity: 0.3;
}

/* Footer keyboard hints */
.script-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 20px;
  border-top: 1px solid var(--border-subtle);
  font-family: -apple-system, sans-serif;
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.script-footer kbd {
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 3px;
  margin-right: 3px;
  font-family: -apple-system, sans-serif;
  font-size: 9px;
}
```

- [ ] **Step 2: Verify CSS parses correctly**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx next build 2>&1 | tail -20`

Expected: No CSS parse errors. (May have other warnings, but CSS should compile cleanly.)

Actually, a faster check:
Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors introduced.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add Script View redesign CSS classes (typography, toolbar, quick-add, active highlighting)"
```

---

## Chunk 2: ScriptView Core Rewrite

### Task 4: ScriptView — Header redesign + continuous scroll

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

This is the biggest task. It rewrites the header to match the site standard and converts the view from page-by-page to continuous scroll. The approach: keep ALL the data layer logic (types, state, block building, saving, undo, CRUD operations), and rewrite the rendering.

- [ ] **Step 1: Remove page navigation state and functions**

In ScriptView.tsx, remove or simplify:

1. The `navigateToPage` function (lines ~1645-1666) — no longer needed since there's no page-by-page nav.
2. The `addPage` function (lines ~1282-1350) — removed per spec (page operations done in main editor).
3. The `deletePage` function (lines ~1352-1433) — removed per spec.
4. The `findSceneForPage` helper (lines ~1269-1279) — only used by `addPage`/`deletePage`, now dead code.
5. The `getPagePositionInfo` useMemo (lines ~1772-1788) — no longer needed (no PG X OF Y display).
6. Remove `Cmd+Shift+ArrowRight/Left` keyboard shortcut handlers from the keydown listener.
7. Remove `'panel'` from the `Scope` type union (line ~126): change `type Scope = 'panel' | 'page' | 'scene' | 'act' | 'issue'` to `type Scope = 'page' | 'scene' | 'act' | 'issue'`.

Keep `currentPageId` state because the scope selector still uses it as the anchor for scene/act/page scope filtering.

- [ ] **Step 2: Simplify scope filtering for continuous scroll**

The `getBlocksForScope` function currently filters blocks by page. For continuous scroll, update it:

- `'issue'` scope already returns all blocks — no change.
- `'act'` scope already collects all page IDs in the act — no change.
- `'scene'` scope already collects all page IDs in the scene — no change.
- `'page'` scope still filters to a single page — keep as-is (scope selector can still show one page).

The scope selector continues to work the same way — it just controls how much of the document is in the scroll. Remove the `'panel'` scope option (it was never in the spec's scope selector).

- [ ] **Step 3: Rewrite the header**

Replace the current header render (lines ~1804-1916) with the site-standard header. The new header uses the `script-header` CSS class:

```tsx
{/* Header */}
<div className="script-header">
  <div className="flex items-center gap-3">
    <button
      onClick={() => { forceSaveAll(); onExit(); }}
      className="hover-fade opacity-60"
    >
      ← ISSUE #{issue.number}
    </button>
    <span className="opacity-25">|</span>
    <span className="opacity-80">{issue.series?.title || 'Untitled'}</span>
  </div>
  <div className="flex items-center gap-2">
    {/* Scope selector */}
    <select
      value={scope}
      onChange={(e) => setScope(e.target.value as Scope)}
      className="border border-[var(--border)] px-2.5 py-1 rounded bg-transparent text-[10px] tracking-[1.5px] uppercase hover-glow"
    >
      <option value="page">Page</option>
      <option value="scene">Scene</option>
      <option value="act">Act</option>
      <option value="issue">Full Issue</option>
    </select>
    {/* Copy */}
    <button onClick={copyToClipboard} className="border border-[var(--border)] px-2.5 py-1 rounded hover-lift text-[10px] tracking-[1.5px] uppercase">
      COPY
    </button>
    {/* Export */}
    <button onClick={exportToPdf} className="border border-[var(--border)] px-2.5 py-1 rounded hover-lift text-[10px] tracking-[1.5px] uppercase">
      EXPORT
    </button>
    {/* Save status */}
    <span className={`text-[9px] tracking-[0.5px] ${saveStatus === 'saved' ? 'opacity-40' : saveStatus === 'saving' ? 'opacity-60' : 'text-[var(--color-warning)]'}`}>
      {saveStatus === 'saved' ? 'SAVED' : saveStatus === 'saving' ? 'SAVING...' : 'UNSAVED'}
    </span>
  </div>
</div>
```

- [ ] **Step 4: Remove old page navigation UI from header**

Delete from the header render:
- ThemeToggle component import and usage
- Page navigation arrows (`‹`, `›`)
- `PG X OF Y` display
- `+PG` / `-PG` buttons
- The dark mode toggle

- [ ] **Step 5: Update the footer**

Replace the footer with the redesigned keyboard hints (remove page navigation shortcuts, add Tab and ⌘⌫):

```tsx
<div className="script-footer">
  <span><kbd>Tab</kbd> Next field</span>
  <span><kbd>⌘S</kbd> Save</span>
  <span><kbd>⌘Z</kbd> Undo</span>
  <span><kbd>⌘F</kbd> Find</span>
  <span><kbd>⌘⌫</kbd> Delete block</span>
  <span><kbd>Esc</kbd> Exit</span>
</div>
```

- [ ] **Step 6: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

Expected: No type errors. Some unused variable warnings are ok at this stage.

- [ ] **Step 7: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): redesign header to match site standard, enable continuous scroll"
```

---

### Task 5: ScriptView — Adaptive toolbar

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

Add state tracking for the active editor and render a single sticky toolbar below the header.

- [ ] **Step 1: Add active editor state**

Add new state/ref to track the currently focused editor:

```typescript
const [activeEditor, setActiveEditor] = useState<{ editor: Editor; blockId: string; variant: VariantType } | null>(null)
```

Import `Editor` from `@tiptap/react` and `VariantType` from the ScriptEditorToolbar (or define inline as `'description' | 'dialogue' | 'caption' | 'sfx'`).

- [ ] **Step 2: Create editor focus/blur handlers**

**Blur strategy:** Only update `activeEditor` on focus (never clear on blur). Use a `focusout` event on the body container that checks if focus moved outside both the body and the toolbar — only then clear `activeEditor` after a short delay (to allow toolbar button `preventDefault` to work).

Add refs for body and toolbar containers:

```typescript
const bodyRef = useRef<HTMLDivElement>(null)
const toolbarRef = useRef<HTMLDivElement>(null)
```

State type:

```typescript
const [activeEditor, setActiveEditor] = useState<{
  editor: Editor
  blockId: string
  variant: VariantType
  contextLabel: string
} | null>(null)
```

Focus handler (called when any ScriptEditor receives focus):

```typescript
const handleEditorFocus = useCallback((editor: Editor, blockId: string) => {
  const block = blocks.find(b => b.id === blockId)
  let variant: VariantType = 'description'
  if (block?.type === 'dialogue') variant = 'dialogue'
  else if (block?.type === 'caption') variant = 'caption'
  else if (block?.type === 'sfx') variant = 'sfx'

  // Compute context label
  let contextLabel = ''
  if (block) {
    const panelNum = block.panelNumber || '?'
    if (variant === 'description') {
      contextLabel = `EDITING: PANEL ${panelNum} DESCRIPTION`
    } else if (variant === 'dialogue') {
      contextLabel = `EDITING: PANEL ${panelNum} → ${block.characterName || 'SELECT CHARACTER'}`
    } else if (variant === 'caption') {
      contextLabel = `EDITING: PANEL ${panelNum} CAPTION`
    }
  }

  setActiveEditor({ editor, blockId, variant, contextLabel })
}, [blocks])
```

Blur handler (on the body container, uses `onBlurCapture` / React's `onFocusOut`):

```typescript
const handleBodyFocusOut = useCallback((e: React.FocusEvent) => {
  // If the new focus target is within the body or within the toolbar, keep active editor
  const relatedTarget = e.relatedTarget as HTMLElement | null
  const body = bodyRef.current
  const toolbar = toolbarRef.current
  if (relatedTarget && (body?.contains(relatedTarget) || toolbar?.contains(relatedTarget))) {
    return
  }
  // Focus left the script area entirely — clear after brief delay
  setTimeout(() => setActiveEditor(null), 150)
}, [])
```

- [ ] **Step 3: Render the adaptive toolbar**

Between the header and the body, render the toolbar conditionally:

```tsx
{/* Adaptive Toolbar — sticky below header */}
{activeEditor && activeEditor.variant !== 'sfx' && (
  <div ref={toolbarRef} className="script-toolbar">
    <ScriptEditorToolbar
      editor={activeEditor.editor}
      variant={activeEditor.variant}
      contextLabel={activeEditor.contextLabel}
    />
  </div>
)}
```

Import `ScriptEditorToolbar` at the top of the file.

- [ ] **Step 4: Pass `onEditorFocus` and `hideToolbar` to all ScriptEditor instances**

In the `ScriptBlockComponent` (the inner component that renders each block), update every `<ScriptEditor>` usage to pass:

```tsx
<ScriptEditor
  variant={...}
  initialContent={...}
  onUpdate={...}
  onFocus={...}
  onBlur={...}
  onEditorFocus={(editor) => onEditorFocus(editor, block.id)}
  hideToolbar={true}
  // ... other props
/>
```

The `onEditorFocus` callback needs to be passed as a prop from ScriptView to ScriptBlockComponent. Add it to the props interface:

```typescript
// In ScriptBlockComponent props
onEditorFocus: (editor: Editor, blockId: string) => void
```

- [ ] **Step 5: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): add adaptive toolbar that tracks focused editor"
```

---

### Task 6: ScriptView — Typography overhaul

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

Replace the current monospace rendering of page headers and panel labels with the dual font system. Apply the CSS classes added in Task 3.

- [ ] **Step 1: Update page header rendering**

In `ScriptBlockComponent`, find the `page-header` block type render. Replace the current monospace styling with:

```tsx
case 'page-header':
  return (
    <div className="mb-6 mt-8 first:mt-0">
      <div className="script-page-header">
        PAGE {block.pageNumber} <span className="orientation">({block.orientation})</span>
      </div>
      {(block.actName || block.sceneName) && (
        <div className="script-context-line">
          {block.actName}{block.actName && block.sceneName && ' // '}{block.sceneName}
        </div>
      )}
    </div>
  )
```

- [ ] **Step 2: Update panel label rendering**

In the `visual` block type render, replace the current `PNL N // VISUAL` label with:

```tsx
<div className={`script-panel-label ${activePanelClass}`}>
  PANEL {block.panelNumber}
</div>
```

Where `activePanelClass` is computed based on whether any field in this panel is the active editor:

```typescript
const activePanelClass = activeBlockId && activeBlockPanelId === block.panelId
  ? `is-active-${activeBlockType}`
  : ''
```

The `activeBlockId`, `activeBlockPanelId`, and `activeBlockType` come from the parent's `activeEditor` state, passed as props.

- [ ] **Step 3: Apply script body classes to description/dialogue/caption/sfx blocks**

Update each block type's rendering to use the CSS classes:

For **visual** (description):
```tsx
<div className={`script-block-description ${isActive ? 'is-active' : ''}`}>
  <ScriptEditor ... />
</div>
```

For **dialogue**:
```tsx
<div className="script-block-dialogue">
  <div className="speaker-label" onClick={() => onEditSpeaker(block)}>
    {block.characterName || 'SELECT CHARACTER'}
    {block.dialogueType && block.dialogueType !== 'dialogue' && (
      <span className="ml-1 opacity-70">({block.dialogueType.toUpperCase().replace('_', ' ')})</span>
    )}
  </div>
  <div className={`dialogue-text ${isActive ? 'is-active' : ''}`}>
    <ScriptEditor ... />
  </div>
</div>
```

For **caption**:
```tsx
<div className="script-block-caption">
  <div className="caption-label" onClick={() => onEditCaptionType(block)}>
    CAP ({(block.captionType || 'NARRATIVE').toUpperCase()})
  </div>
  <div className={`caption-text ${isActive ? 'is-active' : ''}`}>
    <ScriptEditor ... />
  </div>
</div>
```

For **sfx**:
```tsx
<div className="script-block-sfx">
  <span className="sfx-text">SFX: </span>
  <ScriptEditor ... />
</div>
```

- [ ] **Step 4: Wrap body in script-body class**

Replace the body container class with:

```tsx
<div ref={bodyRef} className="script-body" onFocusCapture={...} onBlurCapture={handleBodyFocusOut}>
  {/* blocks render here */}
</div>
```

- [ ] **Step 5: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): apply dual font typography system (sans-serif structural, Courier body)"
```

---

### Task 7: ScriptView — Remove old action bars and per-field toolbars

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

Remove the duplicated action bar UI from ScriptBlockComponent. This cleans up the rendering significantly since the same buttons were repeated in 4 block type renders.

- [ ] **Step 1: Remove per-block action bars**

In `ScriptBlockComponent`, for each block type (visual, dialogue, caption, sfx), remove:

1. The "Add Dialogue" / "Add Caption" / "Add SFX" buttons that appear when `isLastBlockInPanel` is true
2. The "+ Add Panel" button that appears when `isLastBlockInPage` is true
3. The per-block delete button (the trash icon that appears on hover)

These are all replaced by the quick-add menu (Task 9) and Cmd+Backspace (Task 10).

- [ ] **Step 2: Remove action-bar props from ScriptBlockComponent**

Remove from ScriptBlockComponent's props interface:
- `isLastBlockInPanel` and `isLastBlockInPage` (drove action bar visibility)
- `onAddDialogue`, `onAddCaption`, `onAddSfx` (quick-add menu handles additions at ScriptView level)
- `onAddPanel` (quick-add menu handles this)
- `onDeleteDialogue`, `onDeleteCaption`, `onDeleteSfx`, `onDeletePanel` (Cmd+Backspace handles deletion at ScriptView level)

Also remove from the parent's block-mapping logic where these props were computed and passed. Remove `showWordCount` from all ScriptEditor instances in ScriptBlockComponent (word counts removed per spec).

- [ ] **Step 3: Remove unused imports**

Clean up any imports that are no longer needed (e.g., `Plus`, `Trash2` from lucide-react if they were only used by action bars).

- [ ] **Step 4: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "refactor(ScriptView): remove per-field toolbars, action bars, and delete buttons"
```

---

## Chunk 3: Keyboard Flow

### Task 8: ScriptView — Tab navigation system

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

This is the core keyboard-first feature. Build an ordered list of editable field IDs, then intercept Tab/Shift+Tab to move between them using `editor.commands.focus()`.

- [ ] **Step 1: Build the tab order array**

Add a `useMemo` that computes the ordered list of editable block IDs from the current `blocks` array:

```typescript
const tabOrder = useMemo(() => {
  // Filter to only editable blocks (not page-header, not panel-header)
  // Order matches the blocks array order (which is already in reading order)
  const editableTypes = ['visual', 'dialogue', 'caption', 'sfx']
  const editable = blocks
    .filter(b => editableTypes.includes(b.type))
    .map(b => b.id)

  // Insert quick-add menu positions after the last editable block in each panel
  const withMenus: string[] = []
  let lastPanelId: string | null = null
  for (let i = 0; i < editable.length; i++) {
    const block = blocks.find(b => b.id === editable[i])!
    // If this block is in a new panel, insert a quick-add for the previous panel
    if (lastPanelId && block.panelId !== lastPanelId) {
      withMenus.push(`quick-add-${lastPanelId}`)
    }
    withMenus.push(editable[i])
    lastPanelId = block.panelId || null
  }
  // Final panel's quick-add
  if (lastPanelId) {
    withMenus.push(`quick-add-${lastPanelId}`)
  }

  return withMenus
}, [blocks])
```

- [ ] **Step 2: Create an editor registry**

Maintain a map of block IDs to their TipTap Editor instances. Each ScriptEditor reports its editor on mount/focus:

```typescript
const editorRegistry = useRef<Map<string, Editor>>(new Map())

const registerEditor = useCallback((blockId: string, editor: Editor) => {
  editorRegistry.current.set(blockId, editor)
}, [])

const unregisterEditor = useCallback((blockId: string) => {
  editorRegistry.current.delete(blockId)
}, [])
```

Pass `registerEditor` and `unregisterEditor` to ScriptBlockComponent, which passes them into each ScriptEditor.

In ScriptEditor, use a new `onEditorReady` callback or extend `onEditorFocus` to register on mount:

```typescript
// In ScriptEditor, after editor is created:
useEffect(() => {
  if (editor && onRegisterEditor) {
    onRegisterEditor(editor)
  }
  return () => {
    if (onUnregisterEditor) {
      onUnregisterEditor()
    }
  }
}, [editor])
```

Add `onRegisterEditor?: (editor: Editor) => void` and `onUnregisterEditor?: () => void` to ScriptEditor props.

- [ ] **Step 3: Add focused tab position state**

```typescript
const [focusedTabIndex, setFocusedTabIndex] = useState<number>(-1)
const [quickAddPanelId, setQuickAddPanelId] = useState<string | null>(null)
```

`quickAddPanelId` tracks which panel's quick-add menu is currently active (shown and accepting key input).

- [ ] **Step 4: Intercept Tab/Shift+Tab in keydown handler**

Add to the existing keydown listener. **Important:** Ensure the `useEffect` dependency array for the keydown handler includes `focusedTabIndex`, `tabOrder`, `focusBlock`, and `quickAddPanelId`:

```typescript
if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
  e.preventDefault()
  const currentIndex = focusedTabIndex
  if (e.shiftKey) {
    // Move backward
    if (currentIndex > 0) {
      const prevId = tabOrder[currentIndex - 1]
      focusBlock(prevId, currentIndex - 1)
    }
  } else {
    // Move forward
    if (currentIndex < tabOrder.length - 1) {
      const nextId = tabOrder[currentIndex + 1]
      focusBlock(nextId, currentIndex + 1)
    }
  }
}
```

- [ ] **Step 5: Implement `focusBlock` helper**

```typescript
const focusBlock = useCallback((blockId: string, tabIndex: number) => {
  setFocusedTabIndex(tabIndex)

  if (blockId.startsWith('quick-add-')) {
    // Show the quick-add menu for this panel
    const panelId = blockId.replace('quick-add-', '')
    setQuickAddPanelId(panelId)
    // Blur current editor
    activeEditor?.editor.commands.blur()
    // Scroll the quick-add menu into view
    const menuEl = document.getElementById(blockId)
    menuEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } else {
    // Focus the editor for this block
    setQuickAddPanelId(null)
    const editor = editorRegistry.current.get(blockId)
    if (editor) {
      editor.commands.focus()
      // Scroll into view
      const editorEl = document.getElementById(`editor-${blockId}`)
      editorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}, [activeEditor])
```

- [ ] **Step 6: Sync focusedTabIndex when editors are focused by click**

When `handleEditorFocus` fires (from a click, not Tab), update the tab index:

```typescript
const handleEditorFocus = useCallback((editor: Editor, blockId: string) => {
  // ... existing variant/contextLabel logic ...

  // Sync tab position
  const tabIdx = tabOrder.indexOf(blockId)
  if (tabIdx !== -1) {
    setFocusedTabIndex(tabIdx)
  }
  setQuickAddPanelId(null) // Dismiss any active quick-add menu
}, [blocks, tabOrder])
```

- [ ] **Step 7: Set initial focus when blocks are ready**

Use a ref to track whether initial focus has been set, and trigger it when `tabOrder` first becomes non-empty (not on mount, since `blocks` may not be populated yet):

```typescript
const initialFocusSet = useRef(false)

useEffect(() => {
  if (initialFocusSet.current) return
  if (tabOrder.length > 0 && !tabOrder[0].startsWith('quick-add-')) {
    initialFocusSet.current = true
    const timer = setTimeout(() => {
      focusBlock(tabOrder[0], 0)
    }, 200) // Brief delay to let TipTap editors initialize
    return () => clearTimeout(timer)
  }
}, [tabOrder, focusBlock])
```

- [ ] **Step 8: Add `id` attributes to editor containers for scrolling**

In ScriptBlockComponent, wrap each editor in a div with an ID:

```tsx
<div id={`editor-${block.id}`}>
  <ScriptEditor ... />
</div>
```

- [ ] **Step 9: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 10: Commit**

```bash
git add src/components/editor/ScriptEditor.tsx src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): add Tab/Shift+Tab navigation through fields in reading order"
```

---

### Task 9: ScriptView — Quick-add menu

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

Render the inline quick-add menu after each panel and handle D/C/S/P/Esc key commands.

- [ ] **Step 1: Render quick-add menus after each panel**

In the blocks mapping, after the last block of each panel, render the quick-add menu:

Compute which blocks are the last in their panel (similar to the old `isLastBlockInPanel` but now used for menu placement, not action bars):

```typescript
// In the blocks.map rendering:
const panelLastBlocks = new Set<string>()
for (let i = blocks.length - 1; i >= 0; i--) {
  const b = blocks[i]
  if (b.panelId && !panelLastBlocks.has(b.panelId) && ['visual', 'dialogue', 'caption', 'sfx'].includes(b.type)) {
    panelLastBlocks.add(b.panelId)
    // Mark blocks[i] as the insertion point for quick-add
  }
}
```

After each panel's last block, render:

```tsx
{isPanelLastBlock && block.panelId && (
  <div
    id={`quick-add-${block.panelId}`}
    className={`script-quick-add ${quickAddPanelId === block.panelId ? 'is-visible' : ''}`}
  >
    <span className="quick-add-key" onClick={() => handleQuickAdd('dialogue', block.panelId!, block.pageId!)}>
      <kbd>D</kbd> Dialogue
    </span>
    <span className="quick-add-separator">·</span>
    <span className="quick-add-key" onClick={() => handleQuickAdd('caption', block.panelId!, block.pageId!)}>
      <kbd>C</kbd> Caption
    </span>
    <span className="quick-add-separator">·</span>
    <span className="quick-add-key" onClick={() => handleQuickAdd('sfx', block.panelId!, block.pageId!)}>
      <kbd>S</kbd> SFX
    </span>
    <span className="quick-add-separator">·</span>
    <span className="quick-add-key" onClick={() => handleQuickAdd('panel', block.panelId!, block.pageId!)}>
      <kbd>P</kbd> + Panel
    </span>
    <span className="quick-add-separator">·</span>
    <span className="opacity-40">Tab → next panel</span>
  </div>
)}
```

- [ ] **Step 2: Handle quick-add key commands**

Add to the keydown listener, only active when `quickAddPanelId` is set:

```typescript
if (quickAddPanelId) {
  const pageId = blocks.find(b => b.panelId === quickAddPanelId)?.pageId
  if (!pageId) return

  if (e.key === 'd' || e.key === 'D') {
    e.preventDefault()
    handleQuickAdd('dialogue', quickAddPanelId, pageId)
  } else if (e.key === 'c' || e.key === 'C') {
    e.preventDefault()
    handleQuickAdd('caption', quickAddPanelId, pageId)
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault()
    handleQuickAdd('sfx', quickAddPanelId, pageId)
  } else if (e.key === 'p' || e.key === 'P') {
    e.preventDefault()
    handleQuickAdd('panel', quickAddPanelId, pageId)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    setQuickAddPanelId(null)
  }
  // Tab is handled by the existing Tab handler — it moves to next panel
  return // Don't process other shortcuts while quick-add is active
}
```

- [ ] **Step 3: Implement `handleQuickAdd`**

```typescript
const handleQuickAdd = useCallback(async (type: 'dialogue' | 'caption' | 'sfx' | 'panel', panelId: string, pageId: string) => {
  setQuickAddPanelId(null) // Dismiss menu immediately

  switch (type) {
    case 'dialogue':
      await addDialogue(panelId, pageId)
      // After adding, the new block will appear in the blocks array.
      // Focus it on next render via useEffect.
      break
    case 'caption':
      await addCaption(panelId, pageId)
      break
    case 'sfx':
      await addSoundEffect(panelId, pageId)
      break
    case 'panel':
      await addPanel(pageId)
      break
  }

  // After the block is created, we need to focus the new field.
  // The existing add functions update the blocks state.
  // Use a ref to track "focus the newest block of this type in this panel after next render"
  pendingFocusRef.current = { type, panelId }
}, [addDialogue, addCaption, addSoundEffect, addPanel])
```

- [ ] **Step 4: Auto-focus newly created blocks**

**Note on race condition:** The existing add functions (addDialogue, addCaption, etc.) do optimistic updates with temp IDs, then replace them with real IDs from the database. This means `blocks` updates twice. The auto-focus logic must handle this by querying the live DOM instead of relying on the `blocks` state captured in a closure.

```typescript
const pendingFocusRef = useRef<{ type: string; panelId: string } | null>(null)

useEffect(() => {
  if (!pendingFocusRef.current) return
  const { type, panelId } = pendingFocusRef.current
  pendingFocusRef.current = null

  // Use a polling approach: check for the new editor every 50ms for up to 500ms.
  // This handles the temp-ID → real-ID replacement race condition.
  let attempts = 0
  const maxAttempts = 10
  const interval = setInterval(() => {
    attempts++

    // Find the newest block of the given type in the panel from current blocks state
    let targetBlockId: string | undefined
    if (type === 'panel') {
      // For new panels, find the last visual block
      const visuals = blocks.filter(b => b.type === 'visual')
      targetBlockId = visuals[visuals.length - 1]?.id
    } else {
      // Find the last block of the given type in the specified panel
      const matching = blocks.filter(b => b.type === type && b.panelId === panelId)
      targetBlockId = matching[matching.length - 1]?.id
    }

    if (targetBlockId) {
      // Try to find the editor in the registry
      const editor = editorRegistry.current.get(targetBlockId)
      if (editor) {
        clearInterval(interval)
        editor.commands.focus()
        document.getElementById(`editor-${targetBlockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }

    // Also try DOM-based fallback: find editor elements by data attribute
    if (targetBlockId) {
      const el = document.getElementById(`editor-${targetBlockId}`)
      if (el) {
        clearInterval(interval)
        // The editor may not be in the registry yet but the DOM element exists.
        // Clicking it will trigger focus.
        const prosemirror = el.querySelector('.ProseMirror') as HTMLElement | null
        prosemirror?.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval)
    }
  }, 50)

  return () => clearInterval(interval)
}, [blocks])
```

- [ ] **Step 5: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): add inline quick-add menu (D/C/S/P) with keyboard and click support"
```

---

### Task 10: ScriptView — Cmd+Backspace deletion

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

Add `⌘⌫` shortcut to delete the currently focused sub-block (dialogue, caption, SFX). Panel descriptions cannot be deleted this way.

- [ ] **Step 1: Add Cmd+Backspace handler to keydown listener**

```typescript
// In the keydown handler:
if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
  e.preventDefault()
  if (!activeEditor) return

  const block = blocks.find(b => b.id === activeEditor.blockId)
  if (!block) return

  // Only allow deletion of sub-blocks, not descriptions
  if (block.type === 'dialogue') {
    deleteDialogue(block.id)
  } else if (block.type === 'caption') {
    deleteCaption(block.id)
  } else if (block.type === 'sfx') {
    deleteSoundEffect(block.id)
  }
  // For 'visual' (description) — do nothing, per spec
}
```

- [ ] **Step 2: Modify delete functions to skip confirmation dialog**

The existing `deleteDialogue`, `deleteCaption`, `deleteSoundEffect` functions show a `ConfirmDialog` before deleting. For the keyboard shortcut flow, we want immediate deletion with an undo toast instead.

Add a `skipConfirm` parameter to each delete function:

```typescript
const deleteDialogue = useCallback(async (blockId: string, skipConfirm = false) => {
  const block = blocks.find(b => b.id === blockId)
  if (!block) return

  if (!skipConfirm && block.content.trim()) {
    // Show confirmation dialog (existing behavior for non-keyboard deletion)
    // ... existing confirm logic ...
  }

  // Proceed with deletion
  // ... existing deletion logic ...

  // Show undo toast
  showToast(`Deleted dialogue — press ⌘Z to undo`, 'info')
}, [blocks, ...deps])
```

When called from the Cmd+Backspace handler, pass `skipConfirm = true`:

```typescript
if (block.type === 'dialogue') {
  deleteDialogue(block.id, true)
}
```

- [ ] **Step 3: After deletion, move focus to previous field**

After deleting a block, move focus to the previous field in tab order:

```typescript
// After the delete call:
const currentTabIdx = tabOrder.indexOf(activeEditor.blockId)
if (currentTabIdx > 0) {
  const prevId = tabOrder[currentTabIdx - 1]
  // Brief delay to let the block unmount
  setTimeout(() => {
    if (!prevId.startsWith('quick-add-')) {
      const prevEditor = editorRegistry.current.get(prevId)
      prevEditor?.commands.focus()
    }
  }, 50)
}
```

- [ ] **Step 4: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): add Cmd+Backspace to delete focused sub-block with undo support"
```

---

## Chunk 4: Polish and Integration

### Task 11: ScriptView — Active field highlighting

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

The CSS classes for active highlighting were added in Task 3. This task wires them up by passing the `isActive` flag based on the `activeEditor` state.

- [ ] **Step 1: Pass `activeBlockId` to ScriptBlockComponent**

Add `activeBlockId` to the props of ScriptBlockComponent:

```typescript
// In ScriptBlockComponent props:
activeBlockId: string | null
```

Pass it from the parent:

```tsx
<ScriptBlockComponent
  ...
  activeBlockId={activeEditor?.blockId || null}
/>
```

- [ ] **Step 2: Compute `isActive` in ScriptBlockComponent**

In each block type's render, add the `is-active` class when the block is the active editor:

```typescript
const isActive = block.id === activeBlockId
```

This was already described in Task 6's typography section. If not yet applied, apply it now:

```tsx
// Description:
<div className={`script-block-description ${isActive ? 'is-active' : ''}`}>

// Dialogue text:
<div className={`dialogue-text ${isActive ? 'is-active' : ''}`}>

// Caption text:
<div className={`caption-text ${isActive ? 'is-active' : ''}`}>
```

- [ ] **Step 3: Compute active panel label class**

The panel label should brighten to match the type of the active field within that panel:

```typescript
const getActivePanelClass = (panelId: string) => {
  if (!activeBlockId || !activeEditor) return ''
  const activeBlock = blocks.find(b => b.id === activeBlockId)
  if (!activeBlock || activeBlock.panelId !== panelId) return ''
  return `is-active-${activeBlock.type === 'visual' ? 'description' : activeBlock.type}`
}
```

Apply in the panel label:

```tsx
<div className={`script-panel-label ${getActivePanelClass(block.panelId!)}`}>
  PANEL {block.panelNumber}
</div>
```

- [ ] **Step 4: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): active field highlighting with border + background tint"
```

---

### Task 12: FindReplaceModal — Adapt for continuous scroll

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/FindReplaceModal.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

Change the match navigation from "set page + navigate" to "scroll to element within the continuous scroll."

- [ ] **Step 1: Update `handleNavigateToPanel` in ScriptView**

Replace the current implementation that sets `currentPageId` and calls `onNavigate`:

```typescript
const handleNavigateToPanel = useCallback((pageId: string, panelId: string) => {
  // In continuous scroll, just scroll to the matching block
  const blockId = `visual-${panelId}`
  const el = document.getElementById(`editor-${blockId}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Focus the editor
    const editor = editorRegistry.current.get(blockId)
    if (editor) {
      editor.commands.focus()
    }
  } else {
    // The block might not be in the current scope — expand scope if needed
    // Check if the page is in the current scope
    const blockInScope = blocks.some(b => b.pageId === pageId)
    if (!blockInScope) {
      // Switch to issue scope to show all blocks, then scroll
      setScope('issue')
      // After scope change, the blocks will re-render. Use a timeout to scroll.
      setTimeout(() => {
        const retryEl = document.getElementById(`editor-visual-${panelId}`)
        retryEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 200)
    }
  }
}, [blocks])
```

- [ ] **Step 2: Verify FindReplaceModal doesn't need internal changes**

The FindReplaceModal's `navigateToMatch` function calls `onNavigateToPanel(pageId, panelId)`. Since we're just changing the parent's implementation of that callback, the modal itself needs no changes.

However, check if the modal uses the `issue` prop to track which page is currently displayed — if it does, it may need to understand that all pages are visible in continuous scroll mode. The current implementation uses the `issue` prop only for `searchIssue()` which searches all content regardless of scope, so it should work as-is.

- [ ] **Step 3: Verify type-checking passes**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): adapt find/replace navigation for continuous scroll"
```

---

### Task 13: Final integration, cleanup, and verification

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx` (cleanup)

- [ ] **Step 1: Remove dead code**

Search for any remaining references to removed features:
- `navigateToPage` function (should be removed in Task 4)
- `addPage` / `deletePage` / `findSceneForPage` functions (removed in Task 4)
- `deletePanel` function (panel deletion no longer accessible from Script View — the function itself may be kept if needed for undo restoration, but the UI trigger is gone)
- `getPagePositionInfo` (removed in Task 4)
- `focusedBlockIndex` state (replaced by `focusedTabIndex` in Task 8)
- `blockRefs` ref (`Map<string, HTMLTextAreaElement>` — replaced by `editorRegistry` in Task 8)
- `ThemeToggle` import and usage
- Old action bar rendering code (+ Dialogue / + Caption / + SFX buttons)
- Old `+ Add Panel` button code
- `isLastBlockInPanel` / `isLastBlockInPage` logic and props
- `onAddDialogue` / `onAddCaption` / `onAddSfx` / `onAddPanel` / `onDeleteDialogue` / `onDeleteCaption` / `onDeleteSfx` / `onDeletePanel` props on ScriptBlockComponent
- `showWordCount` props on ScriptEditor instances
- Old per-field toolbar related code
- Old `.script-view-editor` CSS in globals.css (review if still needed or can be merged with new classes)

- [ ] **Step 2: Remove unused imports**

Scan the import list for anything no longer used:
- `ThemeToggle` component
- Icons only used by removed action bars (`Plus`, `Trash2`, `ChevronLeft`, `ChevronRight` if not used elsewhere)
- Any removed UI component imports

- [ ] **Step 3: Type-check the full project**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx tsc --noEmit 2>&1 | head -50`

Expected: Zero type errors.

- [ ] **Step 4: Run lint**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx next lint 2>&1 | tail -30`

Expected: No new warnings/errors beyond pre-existing ones.

- [ ] **Step 5: Run tests**

Run: `cd /Users/noahcallahan-bever/projects/panel-flow-2/.claude/worktrees/silly-chebyshev && npx vitest run 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 6: Visual verification via dev server**

Start the dev server and verify in the browser:

1. Open Script View on an issue with multiple pages
2. **Header**: Verify sans-serif uppercase header with back link, scope selector, COPY, EXPORT, save status
3. **No page nav**: Verify no page arrows or PG X OF Y
4. **Continuous scroll**: Set scope to "Full Issue" and verify all pages render as one scroll
5. **Typography**: Page headers are 22px sans-serif uppercase with underline. Panel labels are 10px sans-serif. Body text is Courier monospace.
6. **Adaptive toolbar**: Click into a description field — toolbar appears with full buttons. Click into dialogue — toolbar shows B/I only with context label. Click outside — toolbar hides.
7. **Tab navigation**: Press Tab repeatedly — verify it moves through fields in reading order (description → dialogues → captions → SFX → quick-add → next panel description)
8. **Quick-add menu**: Tab to a quick-add position — verify the D/C/S/P menu appears. Press D — verify dialogue block is created. Press P — verify new panel is created.
9. **Cmd+Backspace**: Focus a dialogue block, press ⌘⌫ — verify it's deleted with an undo toast
10. **Active highlighting**: When a field is focused, verify the left border brightens and subtle background tint appears
11. **Find & Replace**: Press ⌘F, search for text, navigate to a match — verify it scrolls to the match within the continuous scroll
12. **Esc exits**: Press Esc — verify Script View closes with auto-save

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore(ScriptView): final cleanup — remove dead code, unused imports"
```

---

## Implementation Notes

### Key Dependencies Between Tasks

```
Task 1 (ScriptEditor callbacks) ──┐
Task 2 (Toolbar preventDefault) ──┼── Task 5 (Adaptive toolbar) ──┬── Task 6 (Typography — needs bodyRef, activeEditor)
Task 3 (CSS classes) ─────────────┤                                ├── Task 11 (Active highlighting — needs activeEditor)
                                   │                                └───┐
Task 4 (Header + scroll) ─────────┤                                    │
                                   ├── Task 7 (Remove action bars)      │
                                   │                                    │
                                   ├── Task 8 (Tab navigation) ──┬── Task 9 (Quick-add menu)
                                   │                              └── Task 10 (Cmd+Backspace — needs activeEditor + tabOrder)
                                   │
                                   └── Task 12 (FindReplaceModal)
                                         │
                                   Task 13 (Final cleanup) ←── all above
```

**Execution order:**
- Tasks 1, 2, 3 are independent and can run in parallel.
- Task 4 is the foundation for all subsequent ScriptView tasks.
- Task 5 depends on Tasks 1+2+4. Task 7 and Task 8 depend on Task 4.
- Tasks 6 and 11 depend on Task 5 (need `activeEditor` state and `bodyRef`).
- Tasks 9 and 10 depend on Task 8 (need `tabOrder` and editor registry).
- Task 10 also depends on Task 5 (needs `activeEditor` to know which block is focused).
- Task 12 depends on Task 4.
- Task 13 depends on all prior tasks.

### Risk Areas

1. **Tab navigation + TipTap focus management**: TipTap editors have their own focus handling. Intercepting Tab globally and calling `editor.commands.focus()` programmatically needs careful testing to ensure it works reliably across all editor instances. If issues arise, consider using `editor.view.dom.focus()` as a fallback.

2. **Quick-add → new block auto-focus**: After creating a new block, the blocks state updates trigger a re-render. The new ScriptEditor mounts asynchronously. The `pendingFocusRef` + `setTimeout(150ms)` approach may need tuning — if 150ms is too short, the editor won't be ready; if too long, there's a visible delay.

3. **Adaptive toolbar blur management**: The `handleBodyFocusOut` with `setTimeout(150ms)` prevents the toolbar from flickering when clicking toolbar buttons (which briefly steal focus). The timing needs to be long enough for `preventDefault` to work but short enough to feel responsive.

4. **Continuous scroll performance**: Rendering all panels for a full 38-page issue creates many TipTap editor instances simultaneously. If performance is an issue, consider lazy mounting editors (only create TipTap instance when the block scrolls into view, show plain text otherwise). This is an optimization that can be added later if needed.
