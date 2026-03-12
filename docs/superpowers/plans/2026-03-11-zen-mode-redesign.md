# Zen Mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Zen Mode from a broken, cluttered fullscreen editor into a warm, literary, distraction-free writing environment with all panel content editable.

**Architecture:** Three files change. ScriptEditor gets a `hideToolbar` prop. globals.css replaces broken `.zen-editor` rules with a `.zen-mode` CSS variable system (light + dark palettes). ZenMode.tsx is fully rewritten — warm parchment styling, all content (description, dialogue, captions, SFX, notes) editable via ScriptEditor with per-field onBlur saves, simplified keyboard navigation, no manual `hasChanges` tracking.

**Tech Stack:** React 19, TipTap (tiptap-markdown), Tailwind 4, Supabase JS client, Next.js 16 App Router

**Spec:** `docs/superpowers/specs/2026-03-11-zen-mode-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/editor/ScriptEditor.tsx` | Modify | Add `hideToolbar?: boolean` prop to suppress toolbar |
| `src/app/globals.css` | Modify | Delete `.zen-editor` rules, add `.zen-mode` CSS variables (light/dark) + typography overrides |
| `src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx` | Rewrite | Full zen mode component: warm parchment styling, per-field onBlur saves, all content editable |

---

## Chunk 1: All Tasks

### Task 1: Add `hideToolbar` prop to ScriptEditor

**Files:**
- Modify: `src/components/editor/ScriptEditor.tsx`

- [ ] **Step 1: Add `hideToolbar` to the props interface**

In `src/components/editor/ScriptEditor.tsx`, add `hideToolbar` to `ScriptEditorProps`:

```typescript
interface ScriptEditorProps {
  variant: VariantType
  initialContent: string
  onUpdate: (markdown: string) => void
  onFocus?: () => void
  onBlur?: (markdown: string) => void
  placeholder?: string
  characters?: Character[]
  showWordCount?: boolean
  className?: string
  editable?: boolean
  speakerColor?: string
  hideToolbar?: boolean  // ← ADD THIS
}
```

Add `hideToolbar = false` to the destructured props:

```typescript
export default function ScriptEditor({
  variant,
  initialContent,
  onUpdate,
  onFocus,
  onBlur,
  placeholder,
  characters,
  showWordCount = false,
  className = '',
  editable = true,
  speakerColor,
  hideToolbar = false,  // ← ADD THIS
}: ScriptEditorProps) {
```

- [ ] **Step 2: Short-circuit toolbar rendering**

Replace line 179:
```tsx
{variant !== 'sfx' && (variant === 'description' || variant === 'notes' || isFocused) && (
  <ScriptEditorToolbar editor={editor} variant={variant} />
)}
```

With:
```tsx
{!hideToolbar && variant !== 'sfx' && (variant === 'description' || variant === 'notes' || isFocused) && (
  <ScriptEditorToolbar editor={editor} variant={variant} />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean (no errors)

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All 167 tests pass (no regressions)

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ScriptEditor.tsx
git commit -m "feat: add hideToolbar prop to ScriptEditor"
```

---

### Task 2: Replace zen CSS with warm parchment variables

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Delete old `.zen-editor` rules**

In `src/app/globals.css`, find and delete the entire block from `.zen-editor.script-editor` through `.zen-editor--notes .script-editor__content` (lines ~1023-1043). These rules include the broken `color: white` that causes the light-mode legibility issue.

Delete this entire block:
```css
.zen-editor.script-editor {
  background: transparent;
  border: none;
}
.zen-editor .script-editor__content {
  min-height: 200px;
  font-size: 1.125rem;
  line-height: 1.75;
  color: white;
}
.zen-editor .script-editor__content:focus {
  outline: none;
}
.zen-editor.script-editor--focused {
  border-color: transparent;
}
.zen-editor--notes .script-editor__content {
  min-height: 60px;
  font-size: 0.875rem;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Add `.zen-mode` CSS variables and typography overrides**

In the same location where the old rules were deleted, add:

```css
/* ============================================
   ZEN MODE — Warm Parchment Theme
   ============================================ */

.zen-mode {
  background-image: none;

  --zen-bg: #faf8f4;
  --zen-text: #3d3428;
  --zen-text-dialogue: #5a4d3a;
  --zen-text-caption: #6b5d4a;
  --zen-text-notes: #9e9080;
  --zen-accent: #8b7355;
  --zen-label: #c4baa8;
  --zen-divider: #e0d8cc;
  --zen-border-dialogue: #c4b89a;
  --zen-ghost: #c4baa8;
  --zen-dot: #ddd6c8;
  --zen-footer: #cdc4b4;
}

:is(.dark, [data-theme="dark"]) .zen-mode {
  --zen-bg: #1c1a16;
  --zen-text: #d4ccc0;
  --zen-text-dialogue: #b0a898;
  --zen-text-caption: #908878;
  --zen-text-notes: #5a5448;
  --zen-accent: #8b7d65;
  --zen-label: #4a4438;
  --zen-divider: #302c26;
  --zen-border-dialogue: #5a5040;
  --zen-ghost: #3a3630;
  --zen-dot: #302c26;
  --zen-footer: #4a4438;
}

/* Zen mode editor overrides */
.zen-mode .script-editor {
  background: transparent;
  border: none;
}

.zen-mode .script-editor--focused {
  border-color: transparent;
}

.zen-mode .script-editor__content {
  font-family: 'Georgia', 'Times New Roman', serif;
  outline: none;
}

.zen-mode .script-editor__content:focus {
  outline: none;
}

/* Description variant in zen mode */
.zen-mode .script-editor--description .script-editor__content {
  min-height: 100px;
  font-size: 17px;
  line-height: 1.85;
  color: var(--zen-text);
}

/* Dialogue variant in zen mode */
.zen-mode .script-editor--dialogue .script-editor__content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--zen-text-dialogue);
  font-style: italic;
}

/* Caption variant in zen mode */
.zen-mode .script-editor--caption .script-editor__content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--zen-text-caption);
}

/* SFX variant in zen mode — stays monospace */
.zen-mode .script-editor--sfx .script-editor__content {
  font-family: var(--font-mono);
  font-weight: 700;
  text-transform: uppercase;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--zen-accent);
}

/* Notes variant in zen mode */
.zen-mode .script-editor--notes .script-editor__content {
  min-height: 40px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--zen-text-notes);
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: replace zen-editor CSS with warm parchment zen-mode variables"
```

---

### Task 3: Rewrite ZenMode.tsx

**Files:**
- Rewrite: `src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx`

This is a full rewrite. The new component:
- Uses warm parchment styling via zen CSS variables (no Tailwind color vars like `--bg-primary`)
- Makes all content editable via ScriptEditor with `hideToolbar`
- Uses per-field onBlur saves (no `hasChanges` / `saveCurrentPanel`)
- Removes Cmd+Shift+Z exit shortcut
- Removes UNSAVED/SAVING indicators
- Removes `<kbd>` boxes from footer
- Removes border on header, footer, and close button
- Adds previous panel ghost
- Tracks word count across all content types
- Uses warm parchment empty state

- [ ] **Step 1: Write the new ZenMode.tsx**

Replace the entire file with:

```tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import ScriptEditor from '@/components/editor/ScriptEditor'

interface Panel {
  id: string
  panel_number: number
  sort_order: number
  visual_description: string | null
  camera: string | null
  internal_notes: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
}

interface DialogueBlock {
  id: string
  character_id: string | null
  text: string | null
  dialogue_type: string | null
  delivery_instruction: string | null
  sort_order: number
  character?: { id: string; name: string } | null
}

interface Caption {
  id: string
  text: string | null
  caption_type: string | null
  sort_order: number
}

interface SoundEffect {
  id: string
  text: string | null
  sort_order: number
}

interface Character {
  id: string
  name: string
}

interface SceneContext {
  actName: string
  sceneName: string
  plotlineName?: string | null
  pagePositionInScene?: number
  totalPagesInScene?: number
}

interface ZenModeProps {
  page: {
    id: string
    page_number: number
    panels: Panel[]
  }
  characters: Character[]
  pagePosition: string
  sceneContext?: SceneContext | null
  onExit: () => void
  onSave: () => void
  onNavigate: (direction: 'prev' | 'next') => void
}

/** Count words in a string, returning 0 for empty/whitespace-only */
function countWords(text: string | null): number {
  const trimmed = (text || '').trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Count all words across all editable content in a panel */
function countPanelWords(panel: Panel): number {
  let total = countWords(panel.visual_description)
  total += countWords(panel.internal_notes)
  for (const d of panel.dialogue_blocks) total += countWords(d.text)
  for (const c of panel.captions) total += countWords(c.text)
  for (const s of panel.sound_effects) total += countWords(s.text)
  return total
}

/** Format dialogue type suffix for speaker label */
function formatSpeaker(d: DialogueBlock): string {
  const name = (d.character?.name || 'Unknown').toUpperCase()
  const type = d.dialogue_type
  if (!type || type === 'normal') return `${name}:`
  const suffix = type === 'voice_over' ? '(V.O.)'
    : type === 'off_screen' ? '(O.S.)'
    : type === 'whisper' ? '(WHISPER)'
    : type === 'shout' ? '(SHOUT)'
    : type === 'thought' ? '(THOUGHT)'
    : type === 'electronic' ? '(ELECTRONIC)'
    : type === 'radio' ? '(RADIO)'
    : ''
  const modifier = d.delivery_instruction ? ` [${d.delivery_instruction.toUpperCase()}]` : ''
  return `${name} ${suffix}${modifier}:`
}

export default function ZenMode({
  page,
  characters,
  pagePosition,
  sceneContext,
  onExit,
  onSave,
  onNavigate,
}: ZenModeProps) {
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0)
  const [panels, setPanels] = useState<Panel[]>(page.panels || [])
  const [sessionWordCount, setSessionWordCount] = useState(0)
  const initialWordCountRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  const currentPanel = panels[currentPanelIndex]

  // Update panels when page changes (navigating between pages)
  useEffect(() => {
    setPanels(page.panels || [])
    setCurrentPanelIndex(0)
  }, [page.id])

  // Track initial word count on mount (across all content)
  useEffect(() => {
    const total = (page.panels || []).reduce((sum, p) => sum + countPanelWords(p), 0)
    initialWordCountRef.current = total
  }, [])

  // Update session word count when panels change
  useEffect(() => {
    const currentTotal = panels.reduce((sum, p) => sum + countPanelWords(p), 0)
    const delta = currentTotal - initialWordCountRef.current
    setSessionWordCount(Math.max(0, delta))
  }, [panels])

  // --- Save handler ---
  const saveField = useCallback(async (
    table: string,
    id: string,
    field: string,
    value: string
  ) => {
    const supabase = createClient()
    const { error } = await supabase
      .from(table)
      .update({ [field]: value })
      .eq('id', id)

    if (error) {
      console.error(`[zen] Failed to save ${table}.${field}:`, error)
      showToast('Failed to save changes', 'error')
    } else {
      onSave()
    }
  }, [onSave, showToast])

  // --- Local state updaters ---
  const updateDescription = useCallback((md: string) => {
    setPanels(prev => prev.map((p, i) =>
      i === currentPanelIndex ? { ...p, visual_description: md } : p
    ))
  }, [currentPanelIndex])

  const updateNotes = useCallback((md: string) => {
    setPanels(prev => prev.map((p, i) =>
      i === currentPanelIndex ? { ...p, internal_notes: md } : p
    ))
  }, [currentPanelIndex])

  const updateDialogue = useCallback((dialogueId: string, md: string) => {
    setPanels(prev => prev.map((p, i) =>
      i === currentPanelIndex
        ? {
            ...p,
            dialogue_blocks: p.dialogue_blocks.map(d =>
              d.id === dialogueId ? { ...d, text: md } : d
            ),
          }
        : p
    ))
  }, [currentPanelIndex])

  const updateCaption = useCallback((captionId: string, md: string) => {
    setPanels(prev => prev.map((p, i) =>
      i === currentPanelIndex
        ? {
            ...p,
            captions: p.captions.map(c =>
              c.id === captionId ? { ...c, text: md } : c
            ),
          }
        : p
    ))
  }, [currentPanelIndex])

  const updateSfx = useCallback((sfxId: string, md: string) => {
    setPanels(prev => prev.map((p, i) =>
      i === currentPanelIndex
        ? {
            ...p,
            sound_effects: p.sound_effects.map(s =>
              s.id === sfxId ? { ...s, text: md } : s
            ),
          }
        : p
    ))
  }, [currentPanelIndex])

  // --- Navigation ---
  const goToNextPanel = useCallback(() => {
    // Blur triggers save automatically
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    if (currentPanelIndex < panels.length - 1) {
      setCurrentPanelIndex(currentPanelIndex + 1)
    } else {
      onNavigate('next')
    }
  }, [currentPanelIndex, panels.length, onNavigate])

  const goToPrevPanel = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    if (currentPanelIndex > 0) {
      setCurrentPanelIndex(currentPanelIndex - 1)
    } else {
      onNavigate('prev')
    }
  }, [currentPanelIndex, onNavigate])

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        // Small delay to let onBlur save fire
        setTimeout(() => onExit(), 50)
        return
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        goToNextPanel()
        return
      }

      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        goToPrevPanel()
        return
      }

      if (isMod && e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        setTimeout(() => onNavigate('next'), 50)
        return
      }

      if (isMod && e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        setTimeout(() => onNavigate('prev'), 50)
        return
      }

      if (isMod && e.key === 's') {
        e.preventDefault()
        const active = document.activeElement
        if (active instanceof HTMLElement) {
          active.blur()
          // Re-focus synchronously (optimistic save)
          requestAnimationFrame(() => active.focus())
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPanelIndex, goToNextPanel, goToPrevPanel, onExit, onNavigate])

  // --- Empty state ---
  if (!currentPanel) {
    return (
      <div className="zen-mode fixed inset-0 z-50 flex items-center justify-center bg-[var(--zen-bg)]">
        <button
          onClick={onExit}
          className="absolute top-4 right-4 text-[var(--zen-footer)] hover:text-[var(--zen-accent)] text-xl leading-none transition-colors"
          title="Exit (Esc)"
        >
          &times;
        </button>
        <div className="text-center">
          <p className="text-[17px] text-[var(--zen-ghost)] mb-4" style={{ fontFamily: "'Georgia', serif" }}>
            No panels on this page
          </p>
          <p className="text-[9px] tracking-[0.1em] uppercase text-[var(--zen-ghost)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Press Escape to exit
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="zen-mode fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--zen-bg)]"
    >
      {/* Close button — bare × */}
      <button
        onClick={() => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
          setTimeout(() => onExit(), 50)
        }}
        className="absolute top-4 right-4 z-20 text-[var(--zen-footer)] hover:text-[var(--zen-accent)] text-xl leading-none transition-colors"
        title="Exit (Esc)"
      >
        &times;
      </button>

      {/* Header — centered, no border */}
      <div className="py-4 text-center">
        <div
          className="text-[10px] tracking-[0.12em] uppercase"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-label)' }}
        >
          Page {page.page_number} &middot; Panel {currentPanel.panel_number}
        </div>
        {sceneContext && (
          <div
            className="text-[9px] tracking-[0.08em] mt-0.5"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-footer)' }}
          >
            {sceneContext.actName} &middot; {sceneContext.sceneName}
          </div>
        )}
      </div>

      {/* Main writing area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[620px] mx-auto px-8 pb-12">

          {/* Panel indicator dots */}
          <div className="flex items-center justify-center gap-1.5 mb-10">
            {panels.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur()
                  }
                  setCurrentPanelIndex(i)
                }}
                className={`h-[3px] rounded-full transition-all ${
                  i === currentPanelIndex
                    ? 'w-[20px] bg-[var(--zen-accent)]'
                    : 'w-[5px] bg-[var(--zen-dot)] hover:bg-[var(--zen-accent)]'
                }`}
              />
            ))}
          </div>

          {/* Previous panel ghost */}
          {currentPanelIndex > 0 && panels[currentPanelIndex - 1] && (
            <div className="mb-8">
              <span
                className="block mb-1.5 text-[9px] tracking-[0.1em] uppercase"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-ghost)' }}
              >
                Panel {panels[currentPanelIndex - 1].panel_number}
              </span>
              <p
                className="line-clamp-2 text-sm leading-relaxed"
                style={{ fontFamily: "'Georgia', serif", color: 'var(--zen-ghost)' }}
              >
                {panels[currentPanelIndex - 1].visual_description || 'No description'}
              </p>
            </div>
          )}

          {/* ═══ VISUAL DESCRIPTION ═══ */}
          <div className="mb-2">
            <span
              className="block mb-2.5 text-[9px] tracking-[0.12em] uppercase"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-label)' }}
            >
              Visual Description
            </span>
            <ScriptEditor
              variant="description"
              initialContent={currentPanel.visual_description || ''}
              onUpdate={updateDescription}
              onBlur={(md) => saveField('panels', currentPanel.id, 'visual_description', md)}
              placeholder="Describe what we see in this panel..."
              hideToolbar
            />
          </div>

          {/* ═══ DIALOGUE ═══ */}
          {currentPanel.dialogue_blocks.length > 0 && (
            <>
              <div className="w-10 h-px mx-auto my-7" style={{ background: 'var(--zen-divider)' }} />
              <span
                className="block mb-2.5 text-[9px] tracking-[0.12em] uppercase"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-label)' }}
              >
                Dialogue
              </span>
              <div className="space-y-3.5">
                {currentPanel.dialogue_blocks.map((d) => (
                  <div
                    key={d.id}
                    className="pl-4 border-l-2"
                    style={{ borderColor: 'var(--zen-border-dialogue)' }}
                  >
                    <div
                      className="mb-0.5 text-[11px] font-semibold tracking-[0.05em]"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-accent)' }}
                    >
                      {formatSpeaker(d)}
                    </div>
                    <ScriptEditor
                      variant="dialogue"
                      initialContent={d.text || ''}
                      onUpdate={(md) => updateDialogue(d.id, md)}
                      onBlur={(md) => saveField('dialogue_blocks', d.id, 'text', md)}
                      placeholder="Dialogue text..."
                      hideToolbar
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ CAPTIONS ═══ */}
          {currentPanel.captions.length > 0 && (
            <>
              <div className="w-10 h-px mx-auto my-7" style={{ background: 'var(--zen-divider)' }} />
              <span
                className="block mb-2.5 text-[9px] tracking-[0.12em] uppercase"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-label)' }}
              >
                Captions
              </span>
              <div className="space-y-3.5">
                {currentPanel.captions.map((c) => (
                  <div
                    key={c.id}
                    className="pl-4 border-l-2"
                    style={{ borderColor: 'var(--zen-border-dialogue)' }}
                  >
                    <div
                      className="mb-0.5 text-[9px] tracking-[0.06em] uppercase"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-accent)' }}
                    >
                      {(c.caption_type || 'narrative').toUpperCase()}
                    </div>
                    <ScriptEditor
                      variant="caption"
                      initialContent={c.text || ''}
                      onUpdate={(md) => updateCaption(c.id, md)}
                      onBlur={(md) => saveField('captions', c.id, 'text', md)}
                      placeholder="Caption text..."
                      hideToolbar
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ SFX ═══ */}
          {currentPanel.sound_effects.length > 0 && (
            <>
              <div className="w-10 h-px mx-auto my-7" style={{ background: 'var(--zen-divider)' }} />
              <span
                className="block mb-2.5 text-[9px] tracking-[0.12em] uppercase"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-label)' }}
              >
                SFX
              </span>
              <div className="space-y-2 pl-4">
                {currentPanel.sound_effects.map((s) => (
                  <ScriptEditor
                    key={s.id}
                    variant="sfx"
                    initialContent={s.text || ''}
                    onUpdate={(md) => updateSfx(s.id, md)}
                    onBlur={(md) => saveField('sound_effects', s.id, 'text', md)}
                    placeholder="Sound effect..."
                    hideToolbar
                  />
                ))}
              </div>
            </>
          )}

          {/* ═══ INTERNAL NOTES ═══ */}
          <div className="w-10 h-px mx-auto my-7" style={{ background: 'var(--zen-divider)' }} />
          <span
            className="block mb-2.5 text-[9px] tracking-[0.12em] uppercase"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-label)' }}
          >
            Internal Notes
          </span>
          <ScriptEditor
            variant="notes"
            initialContent={currentPanel.internal_notes || ''}
            onUpdate={updateNotes}
            onBlur={(md) => saveField('panels', currentPanel.id, 'internal_notes', md)}
            placeholder="Internal notes..."
            hideToolbar
          />

          {/* ═══ NEXT PANEL GHOST ═══ */}
          {currentPanelIndex < panels.length - 1 && panels[currentPanelIndex + 1] && (
            <>
              <div className="w-10 h-px mx-auto my-7" style={{ background: 'var(--zen-divider)' }} />
              <div>
                <span
                  className="block mb-1.5 text-[9px] tracking-[0.1em] uppercase"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-ghost)' }}
                >
                  Panel {panels[currentPanelIndex + 1].panel_number}
                </span>
                <p
                  className="line-clamp-2 text-sm leading-relaxed"
                  style={{ fontFamily: "'Georgia', serif", color: 'var(--zen-ghost)' }}
                >
                  {panels[currentPanelIndex + 1].visual_description || 'No description'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer — no border */}
      <div className="py-3 px-8">
        <div className="max-w-[620px] mx-auto flex items-center justify-between">
          <span
            className="text-[9px] tracking-[0.08em] uppercase"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-footer)' }}
          >
            +{sessionWordCount} words this session
          </span>
          <div
            className="flex items-center gap-4 text-[9px] tracking-[0.04em]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--zen-footer)' }}
          >
            <span><span className="font-semibold" style={{ color: 'var(--zen-label)' }}>Tab</span> next</span>
            <span><span className="font-semibold" style={{ color: 'var(--zen-label)' }}>Shift+Tab</span> prev</span>
            <span><span className="font-semibold" style={{ color: 'var(--zen-label)' }}>Esc</span> exit</span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean (no errors)

- [ ] **Step 3: Run all tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass (no regressions)

- [ ] **Step 4: Commit**

```bash
git add src/app/series/\[seriesId\]/issues/\[issueId\]/ZenMode.tsx
git commit -m "feat: rewrite zen mode with warm parchment theme and full editability

Replaces broken zen mode (illegible in light mode, cluttered,
dialogue/captions read-only) with warm literary writing environment:
- Cream/charcoal palette with Georgia serif typography
- All content editable (description, dialogue, captions, SFX, notes)
- Per-field onBlur auto-save (no manual hasChanges tracking)
- Zero chrome: no toolbars, no borders, no kbd boxes
- Previous/next panel ghosts for context
- Word count across all content types"
```

- [ ] **Step 5: Manual smoke test**

Start the dev server and navigate to any issue → enter Zen Mode:
1. Verify warm cream background in light mode, warm charcoal in dark mode
2. Verify no blueprint grid showing through
3. Verify no toolbars visible on any editor
4. Verify description text is legible (dark brown on cream)
5. Click into dialogue text → verify it's editable
6. Click into caption text → verify it's editable
7. Tab → verify moves to next panel (not next field)
8. Escape → verify exits zen mode
9. Toggle dark mode → verify warm charcoal palette
