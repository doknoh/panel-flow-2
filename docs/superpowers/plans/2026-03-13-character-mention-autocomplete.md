# Character @Mention Autocomplete — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@mention` autocomplete for character names in all TipTap editors — type `@` + letter to get a dropdown, select to insert bold ALL CAPS, and automatically track character appearances in the `characters_present` array on panels.

**Architecture:** Uses `@tiptap/suggestion` (bundled with the already-installed `@tiptap/extension-mention`) as a standalone suggestion utility configured to insert plain text with bold mark. A new `MentionSuggestion.tsx` component renders the dropdown popup. A `scanCharactersPresent()` utility function handles save-time character detection. An `onMentionInsert` callback provides a fast-path for immediate `characters_present` updates when a character is selected from the dropdown. The feature is implemented in `ScriptEditor.tsx` so all three views (PageEditor, ScriptView, ZenMode) get it automatically.

**Tech Stack:** TipTap 3.20 (`@tiptap/suggestion`), React 19, Supabase (PostgreSQL), Next.js 16.1

**Spec:** `docs/superpowers/specs/2026-03-13-character-mention-autocomplete-design.md` (line 31: all variants, line 53: belt-and-suspenders tracking)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/character-utils.ts` | Character name scanning utilities | Create with `scanCharactersPresent()` |
| `src/lib/character-utils.test.ts` | Tests for character name utilities | Create |
| `src/components/editor/MentionSuggestion.tsx` | Suggestion dropdown popup component | Create |
| `src/components/editor/ScriptEditor.tsx` | TipTap editor with mention support | Add suggestion plugin, Cmd+Click plugin, `characters` prop wiring, `onMentionInsert` callback, `onCharacterClick` callback |
| `src/app/globals.css` | Global styles | Add mention dropdown styles |
| `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx` | Main page editor | Wire characters to all ScriptEditor variants, add save-time scan, wire `onMentionInsert`, remove old @-trigger |
| `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx` | Script view editor | Wire characters to all ScriptEditor variants, add save-time scan, wire `onMentionInsert` |
| `src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx` | Zen mode editor | Add `seriesId` prop, wire characters to all ScriptEditor variants, add save-time scan, wire `onMentionInsert` |
| `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx` | Main three-column layout | Pass `seriesId` to ZenMode, ensure characters include `display_name` and `role` |
| `src/lib/ai/context-assembler.ts` | AI context assembly | Fix: read `characters_present` from panels query |
| `src/lib/exportTxt.ts` | Plain text export | Fix: strip markdown from visual descriptions in both code paths |
| `src/lib/exportDocx.ts` | Word export | Fix: parse markdown to styled TextRun objects in both code paths |

---

## Chunk 1: Foundation Utilities

### Task 1: Create `src/lib/character-utils.ts` with `scanCharactersPresent()`

Creates a new focused utility file for character name scanning. This function scans text for known character names and returns their UUIDs, used on panel description save to populate the `characters_present` array.

**Files:**
- Create: `src/lib/character-utils.ts`
- Create: `src/lib/character-utils.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/character-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scanCharactersPresent } from './character-utils'

const characters = [
  { id: 'uuid-1', name: 'Marshall', display_name: 'Marshall Kane' },
  { id: 'uuid-2', name: 'Maya', display_name: null },
  { id: 'uuid-3', name: 'Morgan', display_name: 'Dr. Morgan' },
]

describe('scanCharactersPresent', () => {
  it('returns empty array for empty text', () => {
    expect(scanCharactersPresent('', characters)).toEqual([])
  })

  it('detects character name case-insensitively', () => {
    const result = scanCharactersPresent('MARSHALL walks in.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('detects display_name', () => {
    const result = scanCharactersPresent('Marshall Kane enters the room.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('detects multiple characters', () => {
    const result = scanCharactersPresent('MARSHALL faces MAYA across the table.', characters)
    expect(result).toContain('uuid-1')
    expect(result).toContain('uuid-2')
    expect(result).toHaveLength(2)
  })

  it('returns unique IDs (no duplicates)', () => {
    const result = scanCharactersPresent('MARSHALL talks. MARSHALL walks.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('detects names inside markdown bold', () => {
    const result = scanCharactersPresent('**MARSHALL** walks in.', characters)
    expect(result).toEqual(['uuid-1'])
  })

  it('does not match partial words', () => {
    const result = scanCharactersPresent('The marshal walks in.', characters)
    expect(result).toEqual([])
  })

  it('handles null display_name gracefully', () => {
    const result = scanCharactersPresent('MAYA stands guard.', characters)
    expect(result).toEqual(['uuid-2'])
  })

  it('returns empty array for no matches', () => {
    const result = scanCharactersPresent('An empty room.', characters)
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/character-utils.test.ts`
Expected: FAIL — `Cannot find module './character-utils'`

- [ ] **Step 3: Create `src/lib/character-utils.ts`**

Create `src/lib/character-utils.ts`:

```typescript
/**
 * Character Utilities for Panel Flow
 *
 * Handles scanning text for known character names and returning their UUIDs.
 * Used on panel description save to populate the characters_present array.
 */

/**
 * Scans text for known character names and returns their UUIDs.
 * Used on panel description save to populate characters_present array.
 * Checks both name and display_name (case-insensitive, word boundaries).
 */
export function scanCharactersPresent(
  text: string,
  characters: { id: string; name: string; display_name?: string | null }[]
): string[] {
  if (!text || characters.length === 0) return []

  const found = new Set<string>()

  for (const char of characters) {
    const names = [char.name]
    if (char.display_name) names.push(char.display_name)

    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'i')
      if (regex.test(text)) {
        found.add(char.id)
        break // Found this character, no need to check other names
      }
    }
  }

  return Array.from(found)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/character-utils.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/character-utils.ts src/lib/character-utils.test.ts
git commit -m "feat(character-utils): add scanCharactersPresent for save-time character detection"
```

---

### Task 2: Create MentionSuggestion dropdown component

Creates the React component that renders the character suggestion dropdown popup, positioned at the cursor.

**Files:**
- Create: `src/components/editor/MentionSuggestion.tsx`

**Reference docs:**
- TipTap suggestion plugin render API: The `render()` function returns an object with `onStart(props)`, `onUpdate(props)`, `onKeyDown({event})`, `onExit()` lifecycle hooks. `props` contains `items`, `command`, `clientRect`, and `query`.
- The popup is positioned using `clientRect()` which returns the cursor's bounding rect.

- [ ] **Step 1: Create MentionSuggestion.tsx**

```typescript
'use client'

import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { createRoot, Root } from 'react-dom/client'

export interface MentionCharacter {
  id: string
  name: string
  display_name?: string | null
  role?: string | null
}

interface MentionListProps {
  items: MentionCharacter[]
  command: (item: MentionCharacter) => void
  query: string
}

export interface MentionListRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * The dropdown list rendered inside the suggestion popup.
 */
const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Reset selection when items change
    useEffect(() => setSelectedIndex(0), [items])

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) command(item)
      },
      [items, command]
    )

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) return null

    return (
      <div className="mention-dropdown">
        {items.map((item, index) => {
          const displayName = (item.display_name || item.name).toUpperCase()
          return (
            <button
              key={item.id}
              className={`mention-dropdown-item ${index === selectedIndex ? 'is-selected' : ''}`}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              type="button"
            >
              <span className="mention-dropdown-name">{displayName}</span>
              {item.role && (
                <span className="mention-dropdown-role">{item.role}</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }
)
MentionList.displayName = 'MentionList'

/**
 * Creates the suggestion plugin render config for TipTap.
 * Returns the render() result with lifecycle hooks that mount/unmount
 * a React-based dropdown popup at the cursor position.
 */
export function createMentionSuggestionRenderer() {
  let root: Root | null = null
  let container: HTMLElement | null = null
  let listRef: MentionListRef | null = null

  return {
    onStart: (props: { items: MentionCharacter[]; command: (item: MentionCharacter) => void; clientRect: (() => DOMRect | null) | null; query: string }) => {
      container = document.createElement('div')
      container.className = 'mention-dropdown-container'
      document.body.appendChild(container)

      // Position at cursor
      if (props.clientRect) {
        const rect = props.clientRect()
        if (rect) {
          container.style.position = 'fixed'
          container.style.left = `${rect.left}px`
          container.style.top = `${rect.bottom + 4}px`
          container.style.zIndex = '9999'
        }
      }

      root = createRoot(container)
      root.render(
        <MentionList
          ref={(ref) => { listRef = ref }}
          items={props.items}
          command={props.command}
          query={props.query}
        />
      )
    },

    onUpdate: (props: { items: MentionCharacter[]; command: (item: MentionCharacter) => void; clientRect: (() => DOMRect | null) | null; query: string }) => {
      if (!root || !container) return

      // Reposition
      if (props.clientRect) {
        const rect = props.clientRect()
        if (rect) {
          container.style.left = `${rect.left}px`
          container.style.top = `${rect.bottom + 4}px`
        }
      }

      root.render(
        <MentionList
          ref={(ref) => { listRef = ref }}
          items={props.items}
          command={props.command}
          query={props.query}
        />
      )
    },

    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === 'Escape') {
        return true // Let suggestion plugin handle dismiss
      }
      return listRef?.onKeyDown(props.event) ?? false
    },

    onExit: () => {
      if (root) {
        root.unmount()
        root = null
      }
      if (container) {
        container.remove()
        container = null
      }
      listRef = null
    },
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/MentionSuggestion.tsx
git commit -m "feat(editor): add MentionSuggestion dropdown component for @-mention autocomplete"
```

---

### Task 3: Add mention dropdown CSS styles

Adds CSS classes for the mention suggestion dropdown popup.

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add CSS at the end of globals.css**

Append after the existing Script View Redesign section:

```css
/* ===== Character @Mention Dropdown ===== */

.mention-dropdown-container {
  pointer-events: auto;
}

.mention-dropdown {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  min-width: 200px;
  max-width: 280px;
  font-family: -apple-system, 'Helvetica Neue', sans-serif;
}

.mention-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.mention-dropdown-item:hover,
.mention-dropdown-item.is-selected {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--text-primary);
}

.mention-dropdown-name {
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.mention-dropdown-role {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
}
```

- [ ] **Step 2: Verify type check still passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add character @mention dropdown CSS"
```

---

## Chunk 2: ScriptEditor Integration

### Task 4: Add suggestion plugin, `onMentionInsert` callback, and characters prop to ScriptEditor

Wires the TipTap suggestion plugin into ScriptEditor so that typing `@` + letter triggers the character autocomplete dropdown. Inserts bold ALL CAPS text on selection. Fires an `onMentionInsert` callback on character selection for immediate `characters_present` updates (fast-path). Uses a ref to store characters so TipTap's non-re-initializing behavior doesn't cause stale closures.

**Files:**
- Modify: `src/components/editor/ScriptEditor.tsx`

**Key implementation details:**
- ScriptEditor already has a `characters` prop (unused) — needs to be wired to the suggestion plugin
- The suggestion plugin is imported from `@tiptap/suggestion`
- Characters are stored in a ref (`charactersRef`) and accessed inside the `items` callback to avoid stale closures (TipTap does not re-initialize extensions when useMemo recomputes)
- The `command` callback uses editor chain to insert bold text: `editor.chain().focus().deleteRange(range).toggleBold().insertContent(NAME).toggleBold().run()`
- Uses `createMentionSuggestionRenderer()` from MentionSuggestion.tsx for the popup
- The built-in `allowedPrefixes` option handles the `@`-after-whitespace requirement — no custom `allow` callback needed
- `onMentionInsert` fires when a character is selected from the dropdown, passing `{ characterId, panelId }` — the panelId comes from a `data-panel-id` attribute on the editor wrapper (set by the parent view)

- [ ] **Step 1: Add imports**

At the top of `ScriptEditor.tsx`, add these imports (alongside existing ones):

```typescript
import Suggestion from '@tiptap/suggestion'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { createMentionSuggestionRenderer, MentionCharacter } from './MentionSuggestion'
```

- [ ] **Step 2: Update the ScriptEditorProps interface**

Replace the existing `Character` interface and update `ScriptEditorProps`:

```typescript
interface ScriptEditorProps {
  variant: VariantType
  initialContent: string
  onUpdate: (markdown: string) => void
  onFocus?: () => void
  onBlur?: (markdown: string) => void
  placeholder?: string
  characters?: MentionCharacter[]
  onMentionInsert?: (info: { characterId: string }) => void
  onCharacterClick?: (characterId: string) => void
  showWordCount?: boolean
  className?: string
  editable?: boolean
  speakerColor?: string
  hideToolbar?: boolean
  onEditorFocus?: (editor: Editor) => void
  onEditorBlur?: () => void
  onRegisterEditor?: (editor: Editor) => void
  onUnregisterEditor?: () => void
}
```

Remove the old `Character` interface (lines 15-19) since we now use `MentionCharacter` from the import.

Also destructure the new props in the component:

```typescript
export default function ScriptEditor({
  variant,
  initialContent,
  onUpdate,
  onFocus,
  onBlur,
  placeholder,
  characters,
  onMentionInsert,
  onCharacterClick,
  showWordCount = false,
  className = '',
  editable = true,
  speakerColor,
  hideToolbar = false,
  onEditorFocus,
  onEditorBlur,
  onRegisterEditor,
  onUnregisterEditor,
}: ScriptEditorProps) {
```

- [ ] **Step 3: Add refs for characters and callbacks, and create the mention suggestion extension**

Inside the component, after the existing refs section (after `onUnregisterEditorRef`), add:

```typescript
// Character mention refs — store in refs so TipTap plugin closures always see current values
const charactersRef = useRef(characters)
useEffect(() => { charactersRef.current = characters }, [characters])

const onMentionInsertRef = useRef(onMentionInsert)
useEffect(() => { onMentionInsertRef.current = onMentionInsert }, [onMentionInsert])

const onCharacterClickRef = useRef(onCharacterClick)
useEffect(() => { onCharacterClickRef.current = onCharacterClick }, [onCharacterClick])

// Stable suggestion renderer instance — created once, reused across re-renders
const mentionRendererRef = useRef<ReturnType<typeof createMentionSuggestionRenderer> | null>(null)

// Build mention suggestion extension when characters are available
const mentionExtension = useMemo(() => {
  if (!characters || characters.length === 0) return null

  return Extension.create({
    name: 'characterMention',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '@',
          allowSpaces: false,
          startOfLine: false,
          allowedPrefixes: [' ', '\n', '\t', '\0'],
          items: ({ query }: { query: string }) => {
            const currentCharacters = charactersRef.current || []
            const q = query.toLowerCase()
            return currentCharacters
              .filter(c => {
                const name = (c.display_name || c.name).toLowerCase()
                const baseName = c.name.toLowerCase()
                return name.includes(q) || baseName.includes(q)
              })
              .slice(0, 8)
          },
          command: ({ editor, range, props: item }: { editor: any; range: any; props: MentionCharacter }) => {
            const displayName = (item.display_name || item.name).toUpperCase()
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .toggleBold()
              .insertContent(displayName)
              .toggleBold()
              .run()

            // Fire fast-path callback for immediate characters_present update
            onMentionInsertRef.current?.({ characterId: item.id })
          },
          render: () => {
            if (!mentionRendererRef.current) {
              mentionRendererRef.current = createMentionSuggestionRenderer()
            }
            return mentionRendererRef.current
          },
        }),
      ]
    },
  })
}, [characters])
```

Note: The `useMemo` dependency on `characters` ensures the extension is created when characters become available, but the `items` callback reads from `charactersRef.current` so it always sees the latest characters even if TipTap does not re-initialize the extension.

- [ ] **Step 4: Create the Cmd+Click extension**

After the `mentionExtension` definition, add:

```typescript
const cmdClickExtension = useMemo(() => {
  if (!characters || characters.length === 0) return null

  return Extension.create({
    name: 'characterCmdClick',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleClick(_view: any, _pos: number, event: MouseEvent) {
              if (!event.metaKey && !event.ctrlKey) return false

              const target = event.target as HTMLElement
              // Check if clicked element is bold (strong tag)
              const boldEl = target.closest('strong') || (target.tagName === 'STRONG' ? target : null)
              if (!boldEl) return false

              const text = boldEl.textContent || ''
              const currentCharacters = charactersRef.current || []
              const match = currentCharacters.find(c => {
                const displayName = (c.display_name || c.name).toUpperCase()
                const baseName = c.name.toUpperCase()
                return text.toUpperCase() === displayName || text.toUpperCase() === baseName
              })

              if (match && onCharacterClickRef.current) {
                event.preventDefault()
                onCharacterClickRef.current(match.id)
                return true
              }

              return false
            },
          },
        }),
      ]
    },
  })
}, [characters])
```

- [ ] **Step 5: Add the extensions to the useEditor extensions array**

In the `extensions` callback (the `useCallback` around line 92), modify the return to include the new extensions:

```typescript
// Configure extensions based on variant
const extensions = useCallback(() => {
  const exts = [
    StarterKit.configure({
      // For sfx variant, disable block-level features
      ...(variant === 'sfx' ? {
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      } : {}),
      // For dialogue/caption, disable most block features
      ...(variant === 'dialogue' || variant === 'caption' ? {
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      } : {}),
    }),
    Underline,
    Placeholder.configure({
      placeholder: placeholder || getDefaultPlaceholder(variant),
    }),
    CharacterCount,
    Markdown.configure({
      html: false,
      transformCopiedText: true,
      transformPastedText: true,
    }),
  ]

  if (mentionExtension) {
    exts.push(mentionExtension)
  }
  if (cmdClickExtension) {
    exts.push(cmdClickExtension)
  }

  return exts
}, [variant, placeholder, mentionExtension, cmdClickExtension])
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors (may need to adjust import paths if `@tiptap/suggestion` export format differs — check `node_modules/@tiptap/suggestion/dist/index.d.ts` for exact export)

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/ScriptEditor.tsx
git commit -m "feat(ScriptEditor): add @mention suggestion plugin, Cmd+Click, and onMentionInsert callback"
```

---

## Chunk 3: View Integration

### Task 5: Wire up PageEditor — characters to all variants, save-time scan, `onMentionInsert`, remove old @-trigger

Passes characters to ALL ScriptEditor instances (not just description — the spec says all variants get autocomplete for typing convenience). Adds save-time `characters_present` updates. Wires the `onMentionInsert` fast-path callback. Removes the old custom @-trigger code.

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx`

**Key context:**
- PageEditor receives `characters: Character[]` prop (line 34-37 defines `Character` as `{ id: string; name: string }`)
- The existing Character interface needs expanding to include `display_name` and `role`
- Old @-trigger code is at: `mentionState` (line 253), `mentionIndex` (line 259), `filteredMentionCharacters` (line 656), mention-related keydown handler (line 664+), mention input change handler (line 685+), `insertMention` function (line 717+)
- Panels are saved via `saveAllPendingChanges` (around lines 337-392)
- Auto-capitalization runs on blur (around lines 623-637)
- The `characters_present` array should be updated when visual_description is saved

- [ ] **Step 1: Update Character interface**

Update the `Character` interface (around line 34) to include the fields needed by MentionSuggestion:

```typescript
interface Character {
  id: string
  name: string
  display_name?: string | null
  role?: string | null
}
```

- [ ] **Step 2: Add imports**

Add to the import section:

```typescript
import { scanCharactersPresent } from '@/lib/character-utils'
```

- [ ] **Step 3: Pass characters to ALL ScriptEditor instances**

Find every `<ScriptEditor` instance in the file. Add the `characters` prop to ALL of them (description, dialogue, caption, sfx, notes variants):

```typescript
<ScriptEditor
  variant="description"
  characters={characters}
  onMentionInsert={({ characterId }) => {
    // Fast-path: immediately add character to panel's characters_present
    if (panel.id) {
      const current = panel.characters_present || []
      if (!current.includes(characterId)) {
        const updated = [...current, characterId]
        supabase.from('panels').update({ characters_present: updated }).eq('id', panel.id)
      }
    }
  }}
  onCharacterClick={(charId) => {
    window.location.href = `/series/${issue.series.id}/characters/${charId}`
  }}
  // ... existing props
/>
```

For non-description variants (dialogue, caption, sfx, notes), add only `characters` and `onCharacterClick` (no `onMentionInsert` since `characters_present` only applies to description fields on panels):

```typescript
<ScriptEditor
  variant="dialogue"
  characters={characters}
  onCharacterClick={(charId) => {
    window.location.href = `/series/${issue.series.id}/characters/${charId}`
  }}
  // ... existing props
/>
```

- [ ] **Step 4: Add save-time scan for characters_present**

In the `saveAllPendingChanges` function (around lines 337-392), after saving a panel's `visual_description`, update `characters_present`:

```typescript
// Inside the save loop, after the visual_description update succeeds:
if (field === 'visual_description' && value) {
  const characterIds = scanCharactersPresent(value as string, characters)
  await supabase
    .from('panels')
    .update({ characters_present: characterIds })
    .eq('id', panelId)
}
```

The exact insertion point depends on the save function's structure. The key is: whenever `visual_description` is persisted to Supabase, also persist `characters_present` in the same or immediately following call.

- [ ] **Step 5: Remove old @-trigger code**

Remove the following from PageEditor:
1. `mentionState` state variable and its setter (line 253)
2. `mentionIndex` state variable and its setter (line 259)
3. `filteredMentionCharacters` useMemo (line 656)
4. The mention keydown handler function (line 664+)
5. The mention input change handler (line 685+)
6. The `insertMention` function (line 717+)
7. The mention dropdown JSX (the div rendering the character suggestions list)
8. Any mention-related refs

This is the old code block. Remove it entirely — the TipTap suggestion plugin in ScriptEditor now handles all of this.

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx
git commit -m "feat(PageEditor): wire @mention autocomplete to all variants, save-time scan, remove old @-trigger"
```

---

### Task 6: Wire up ScriptView — characters to all variants, save-time scan, `onMentionInsert`

Passes characters to ALL ScriptEditor instances and adds `characters_present` updates on save. Note: `characters` is already in the `ScriptBlockComponentProps` interface (line 1940) — it just needs to be passed through to the ScriptEditor JSX inside the component.

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx`

**Key context:**
- Characters are available at line 192: `const characters = issue.series?.characters || []`
- `ScriptBlockComponentProps` already has `characters: Character[]` (line 1940)
- ScriptEditor instances are rendered inside `ScriptBlockComponent` (lines 1999, 2035, 2065, 2088)
- None of the ScriptEditor instances currently pass `characters`
- Saves happen in `saveBlock` function (around lines 492-505)

- [ ] **Step 1: Update Character interface**

Update the `Character` interface (around line 78) to include fields needed by MentionSuggestion:

```typescript
interface Character {
  id: string
  name: string
  display_name?: string | null
  role?: string | null
}
```

- [ ] **Step 2: Add imports**

Add to the import section:

```typescript
import { scanCharactersPresent } from '@/lib/character-utils'
```

- [ ] **Step 3: Pass characters to ALL ScriptEditor instances in ScriptBlockComponent**

In the `ScriptBlockComponent` (starting at line 1955), pass `characters` to every `<ScriptEditor` instance.

For the description variant (line 1999):

```typescript
<ScriptEditor
  variant="description"
  characters={characters}
  onMentionInsert={({ characterId }) => {
    // Fast-path: immediately update characters_present
    if (block.panelId) {
      const supabase = createClient()
      supabase.from('panels').select('characters_present').eq('id', block.panelId).single().then(({ data }) => {
        const current = (data?.characters_present || []) as string[]
        if (!current.includes(characterId)) {
          supabase.from('panels').update({ characters_present: [...current, characterId] }).eq('id', block.panelId)
        }
      })
    }
  }}
  onCharacterClick={(charId) => {
    window.location.href = `/series/${issue.series.id}/characters/${charId}`
  }}
  initialContent={block.content || ''}
  onUpdate={(md) => onChange(md)}
  onFocus={onFocus}
  onBlur={() => onBlur?.()}
  onEditorFocus={(editor) => onEditorFocus(editor, block.id)}
  onRegisterEditor={(editor) => onRegisterEditor(block.id, editor)}
  onUnregisterEditor={() => onUnregisterEditor(block.id)}
  hideToolbar={true}
  placeholder="Describe what we see in this panel..."
  className="script-view-editor"
/>
```

For the dialogue variant (line 2035):

```typescript
<ScriptEditor
  variant="dialogue"
  characters={characters}
  // ... existing props
/>
```

For the caption variant (line 2065):

```typescript
<ScriptEditor
  variant="caption"
  characters={characters}
  // ... existing props
/>
```

For the sfx variant (line 2088):

```typescript
<ScriptEditor
  variant="sfx"
  characters={characters}
  // ... existing props
/>
```

Note: `onMentionInsert` is only wired for the description variant. `onCharacterClick` can be added to all variants if desired. For non-description variants, characters are purely a typing convenience.

To get `issue` accessible inside `ScriptBlockComponent`, either pass it as an additional prop or access the series ID via a separate prop. The simplest approach: add `seriesId: string` to `ScriptBlockComponentProps` and pass it from the parent render.

Add to `ScriptBlockComponentProps`:

```typescript
interface ScriptBlockComponentProps {
  block: ScriptBlock
  characters: Character[]
  seriesId: string
  // ... existing props
}
```

And in the parent render (around line 1859), pass:

```typescript
<ScriptBlockComponent
  seriesId={issue.series.id}
  // ... existing props
/>
```

Then use `seriesId` in `onCharacterClick`:

```typescript
onCharacterClick={(charId) => {
  window.location.href = `/series/${seriesId}/characters/${charId}`
}}
```

- [ ] **Step 4: Add save-time scan in saveBlock**

In the `saveBlock` function's `case 'visual'` branch (around line 497), after saving `visual_description`, update `characters_present`:

```typescript
case 'visual':
  if (block.panelId) {
    const { error } = await supabase
      .from('panels')
      .update({ visual_description: block.content })
      .eq('id', block.panelId)
    if (error) throw error

    // Save-time scan: update characters_present
    const characterIds = scanCharactersPresent(block.content, characters)
    await supabase
      .from('panels')
      .update({ characters_present: characterIds })
      .eq('id', block.panelId)
  }
  break
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx
git commit -m "feat(ScriptView): wire @mention autocomplete to all variants and save-time character scan"
```

---

### Task 7: Wire up ZenMode — add `seriesId` prop, characters to all variants, save-time scan, `onMentionInsert`

Adds `seriesId` to ZenModeProps (ZenMode does not currently have it), passes characters to ALL ScriptEditor instances, and adds `characters_present` updates on save.

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx`

**Key context:**
- ZenMode has `characters: Character[]` in its props (line 63) but does NOT pass it to ScriptEditor
- Character interface (lines 44-47): `{ id: string; name: string }` — needs expanding
- ZenMode does NOT have `seriesId` in props — it needs to be added so `onCharacterClick` can navigate correctly
- Saves happen in a save function around lines 234-259

- [ ] **Step 1: Update Character interface and ZenModeProps**

Update the Character interface:

```typescript
interface Character {
  id: string
  name: string
  display_name?: string | null
  role?: string | null
}
```

Add `seriesId` to `ZenModeProps`:

```typescript
interface ZenModeProps {
  page: {
    id: string
    page_number: number
    panels: Panel[]
  }
  characters: Character[]
  seriesId: string
  pagePosition: string
  sceneContext?: SceneContext | null
  onExit: () => void
  onSave: () => void
  onNavigate: (direction: 'prev' | 'next') => void
}
```

- [ ] **Step 2: Add imports**

Add to the import section:

```typescript
import { scanCharactersPresent } from '@/lib/character-utils'
```

- [ ] **Step 3: Pass characters to ALL ScriptEditor instances**

Find every `<ScriptEditor` instance in ZenMode. Add `characters` to all of them.

For the description variant:

```typescript
<ScriptEditor
  variant="description"
  characters={characters}
  onMentionInsert={({ characterId }) => {
    // Fast-path: immediately update characters_present
    if (currentPanel.id) {
      const current = currentPanel.characters_present || []
      if (!current.includes(characterId)) {
        const updated = [...current, characterId]
        supabase.from('panels').update({ characters_present: updated }).eq('id', currentPanel.id)
      }
    }
  }}
  onCharacterClick={(charId) => {
    window.location.href = `/series/${seriesId}/characters/${charId}`
  }}
  // ... existing props
/>
```

For notes variant (if present):

```typescript
<ScriptEditor
  variant="notes"
  characters={characters}
  onCharacterClick={(charId) => {
    window.location.href = `/series/${seriesId}/characters/${charId}`
  }}
  // ... existing props
/>
```

- [ ] **Step 4: Add save-time scan**

In the save function, after persisting `visual_description`, add:

```typescript
// Save-time scan: update characters_present
const characterIds = scanCharactersPresent(
  currentPanel.visual_description || '',
  characters
)
await supabase
  .from('panels')
  .update({ characters_present: characterIds })
  .eq('id', currentPanel.id)
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx
git commit -m "feat(ZenMode): add seriesId prop, wire @mention autocomplete and save-time character scan"
```

---

### Task 8: Update IssueEditor — pass `seriesId` to ZenMode, verify character data

Ensures that `seriesId` is passed to ZenMode and that characters fetched in IssueEditor include `display_name` and `role` fields.

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`

- [ ] **Step 1: Pass `seriesId` to ZenMode**

Find the `<ZenMode` render (around line 1328). Add the `seriesId` prop:

```typescript
{isZenMode && selectedPage && (
  <ZenMode
    page={selectedPage}
    characters={issue.series.characters}
    seriesId={issue.series.id}
    pagePosition={`Page ${selectedPage.page_number} of ${allPages.length}`}
    // ... existing props
  />
)}
```

- [ ] **Step 2: Check the characters query**

The characters are fetched via the series relation. Since `select('*')` is used for characters (via the `any[]` type at line 58), `display_name` and `role` are already included from the database. No query changes needed.

Verify by checking that the series data fetch uses `characters (*)` or `characters!inner(*)` in its select string. If it uses specific field names, add `display_name` and `role`.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
git commit -m "feat(IssueEditor): pass seriesId to ZenMode for @mention character navigation"
```

---

## Chunk 4: Bug Fixes

### Task 9: Fix context-assembler.ts — read characters_present from panels

Fixes the bug where context-assembler hardcodes `characters_present` to `undefined` instead of reading the actual column value from the panels query.

**Files:**
- Modify: `src/lib/ai/context-assembler.ts`

- [ ] **Step 1: Fix the characters_present assignment**

Locate the code around line 672 that has `characters_present: undefined as string[] | undefined`. Replace with reading from the panel's `characters_present` field:

```typescript
// OLD (line 672):
// characters_present: undefined as string[] | undefined,

// NEW:
characters_present: ((panel.characters_present || []) as string[])
  .map(id => charMap.get(id))
  .filter(Boolean) as string[],
```

This reads `characters_present` (UUID array) directly from the panel object that was already fetched, and maps UUIDs to names via the existing `charMap`.

Ensure that the panels query earlier in the file includes `characters_present` in its select. If it uses `select('*')`, it's already included. If it uses specific fields, add `characters_present` to the list.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/context-assembler.ts
git commit -m "fix(context-assembler): read characters_present from panels instead of hardcoded undefined"
```

---

### Task 10: Fix exportTxt.ts — strip markdown from visual descriptions in BOTH code paths

Fixes the bug where markdown syntax (`**bold**`, `*italic*`) appears as literal asterisks in plain text exports. Applies the fix to BOTH the regular panel rendering AND the SPREAD_RIGHT panel rendering.

**Files:**
- Modify: `src/lib/exportTxt.ts`

- [ ] **Step 1: Add stripMarkdown import**

At the top of `exportTxt.ts`, add:

```typescript
import { stripMarkdown } from './markdown'
```

- [ ] **Step 2: Apply stripMarkdown to visual descriptions in the SPREAD_RIGHT code path**

Find the SPREAD_RIGHT panel rendering (around line 191-193):

```typescript
// OLD (lines 191-193):
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  lines.push(`    ${capitalizedDesc}`)
}

// NEW:
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  lines.push(`    ${stripMarkdown(capitalizedDesc)}`)
}
```

- [ ] **Step 3: Apply stripMarkdown to visual descriptions in the regular panel code path**

Find the regular panel rendering (around line 250-252):

```typescript
// OLD (lines 250-252):
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  lines.push(`    ${capitalizedDesc}`)
}

// NEW:
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  lines.push(`    ${stripMarkdown(capitalizedDesc)}`)
}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportTxt.ts
git commit -m "fix(exportTxt): strip markdown syntax from visual descriptions in both code paths"
```

---

### Task 11: Fix exportDocx.ts — parse markdown for styled TextRun objects in BOTH code paths

Fixes the bug where markdown syntax appears as literal asterisks in Word documents. Parses markdown to produce properly styled bold/italic text runs. Applies the fix to BOTH the regular panel rendering AND the SPREAD_RIGHT panel rendering.

**Files:**
- Modify: `src/lib/exportDocx.ts`

**Key context:**
- The `docx` library uses `TextRun` objects with `bold` and `italics` properties
- `src/lib/markdown.ts` has `parseMarkdown()` which returns `{ segments, plainText, wordCount }`
- The segments can be mapped to `TextRun` objects
- There are TWO code paths: SPREAD_RIGHT panels (line 276-278) and regular panels (line 378-391)

- [ ] **Step 1: Add parseMarkdown import**

```typescript
import { parseMarkdown } from './markdown'
```

- [ ] **Step 2: Create a helper function to convert markdown to TextRun array**

Add near the top of the file, after the interface definitions:

```typescript
/**
 * Convert markdown text to an array of styled TextRun objects.
 * Used for visual descriptions so bold/italic render correctly in Word export.
 */
function markdownToTextRuns(text: string, baseSize: number = 22): InstanceType<typeof TextRun>[] {
  // Dynamic import means TextRun isn't available at module scope,
  // so this function must be called after the dynamic import.
  // We'll define it inside exportIssueToDocx instead.
  return [] // placeholder — actual implementation below
}
```

Actually, since `TextRun` comes from a dynamic import inside `exportIssueToDocx`, the helper must be defined inside the function body. Add after the dynamic imports:

```typescript
export async function exportIssueToDocx(/* ... */) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageBreak,
  } = await import('docx')
  const { saveAs } = await import('file-saver')

  // Helper: convert markdown to styled TextRun objects for Word export
  function markdownToTextRuns(text: string, baseSize: number = 22) {
    const { segments } = parseMarkdown(text)
    return segments.map(segment => {
      const options: Record<string, unknown> = {
        text: segment.content,
        size: baseSize,
      }
      if (segment.type === 'bold' || segment.type === 'bold-italic') {
        options.bold = true
      }
      if (segment.type === 'italic' || segment.type === 'bold-italic') {
        options.italics = true
      }
      return new TextRun(options as any)
    })
  }

  // ... rest of function
```

- [ ] **Step 3: Replace raw text with parsed markdown in the SPREAD_RIGHT code path**

Find the SPREAD_RIGHT visual description rendering (around line 276-278):

```typescript
// OLD (line 276-278):
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  children.push(new Paragraph({ children: [new TextRun({ text: capitalizedDesc, size: 22 })], indent: { left: 360 }, spacing: { after: 100 } }))
}

// NEW:
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  children.push(new Paragraph({
    children: markdownToTextRuns(capitalizedDesc, 22),
    indent: { left: 360 },
    spacing: { after: 100 },
  }))
}
```

- [ ] **Step 4: Replace raw text with parsed markdown in the regular panel code path**

Find the regular visual description rendering (around lines 378-391):

```typescript
// OLD (lines 378-391):
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: capitalizedDesc,
          size: 22,
        }),
      ],
      indent: { left: 360 },
      spacing: { after: 100 },
    })
  )
}

// NEW:
if (panel.visual_description) {
  const capitalizedDesc = autoCapitalizeCharacterNames(panel.visual_description, charNames)
  children.push(
    new Paragraph({
      children: markdownToTextRuns(capitalizedDesc, 22),
      indent: { left: 360 },
      spacing: { after: 100 },
    })
  )
}
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/exportDocx.ts
git commit -m "fix(exportDocx): parse markdown to styled TextRun objects in both code paths for proper bold/italic"
```
