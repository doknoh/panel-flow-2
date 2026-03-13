# Character @Mention Autocomplete — Design Spec

**Date:** 2026-03-13
**Goal:** Add `@mention` autocomplete for character names in TipTap editors. Type `@` + first letter to get a dropdown of matching characters, insert as bold ALL CAPS, and automatically track character appearances in the `characters_present` array on panels.

---

## Problems Being Solved

1. **Typing character names is tedious** — Writers must type full character names in ALL CAPS manually or rely on post-blur auto-capitalization.
2. **Character appearances aren't tracked** — The `characters_present` column on the `panels` table exists but is never populated. AI context, continuity checking, and character state tracking lack panel-level appearance data.
3. **No visual signal for linked characters** — Character names in descriptions look the same whether they're intentionally linked or casually mentioned.

---

## Design Decisions

### 1. Autocomplete UX

**Trigger:** Type `@` followed by any letter in any TipTap editor. The `@` must be at the start of the text or preceded by a space/newline (prevents triggering inside email addresses or other `@` contexts). A dropdown appears immediately.

**Dropdown behavior:**
- Left-aligns directly beneath the `@` trigger character
- Shows up to 8 matching characters
- Filters by case-insensitive **substring** match on `name` and `display_name` (consistent with existing PageEditor behavior — typing `@all` finds "Marshall")
- Each row shows the character name in ALL CAPS with their role as a muted hint (e.g., `MARSHALL  protagonist`)
- Arrow up/down to navigate, Enter or Tab to select, Escape to dismiss

**Insertion:** Replaces `@query` with bold ALL CAPS plain text. For example, typing `@mar` and selecting Marshall inserts `**MARSHALL**` in markdown, rendering as **MARSHALL** in the editor. Uses `display_name` if set, otherwise `name`.

**Available in:** Every `ScriptEditor` instance regardless of variant (description, dialogue, caption, sfx, notes) and regardless of view (PageEditor, ScriptView, ZenMode). The `@` trigger only fires on explicit `@` + letter, so it never interferes with normal typing.

**Non-description editors:** @-mentions in dialogue, caption, SFX, or notes fields are purely a typing convenience — they insert the bold character name but do NOT update `characters_present` (that column lives on the `panels` table and only tracks descriptions).

### 2. Bold = Linked

Bold character names serve as a visual signal that the character was intentionally linked via @-mention. This distinguishes linked mentions from casually typed names:

- `**MARSHALL**` (bold) = explicitly linked via @-mention
- `MARSHALL` (plain caps) = typed manually, auto-capitalized on blur

Both are tracked in `characters_present` (see Section 4), but the bold gives the writer a visual cue in the editor.

### 3. Cmd+Click Navigation

Cmd+Click (Meta+Click) on any bold text in a description editor checks if the text matches a known character name. If it matches, navigates to that character's card at `/series/[seriesId]/characters/[characterId]`.

- Normal click = normal cursor behavior, no interference with editing
- Cmd+Click on bold non-character text = no-op (cursor moves normally)
- Cmd+Click on a bold name whose character was deleted = no-op
- Implemented as a lightweight TipTap plugin listening for click events with `metaKey`

### 4. Character Tracking — Belt and Suspenders

Two mechanisms update `characters_present` on the panel. **`characters_present` stores character UUIDs** (not names), matching how `BlueprintReference.tsx` and other consumers already treat the column.

**Fast path — @-mention insert:**
When a character is selected from the dropdown in a `description` variant editor, the character's UUID is immediately added to the panel's `characters_present` array (optimistic Supabase update). Provides instant tracking.

**Catch-all — save-time scan:**
When a panel description is saved (blur or auto-save), the text is scanned for all known character names (case-insensitive, checking `name` and `display_name`). Matched characters' UUIDs are collected. The `characters_present` array is rebuilt as the union of all detected characters, so removing a character's name from the description also removes their UUID from `characters_present` on the next save.

**Scope:** Only `description` variant editors on panels update `characters_present`, since that's the field tied to the `panels` table.

### 5. Edge Cases

**Deleted characters:** If a character is deleted from the series, their `**NAME**` remains in description text as bold text but is no longer recognized by save-time scan (they're not in the character list). Their UUID falls out of `characters_present` on the next save. Cmd+Click on their name is a no-op.

**Renamed characters:** If a character's `display_name` changes, existing `**OLD_NAME**` text in descriptions is not auto-updated. The save-time scan stops matching the old name and starts matching the new name. The writer would need to manually update old mentions. This is expected behavior — the auto-cap system already works this way.

### 6. Auto-Capitalization Integration

The existing `auto-format.ts` auto-capitalizes character names on blur. This coexists cleanly with @-mention:

- **@-mention path:** Inserts `**MARSHALL**` — already bold and caps. Auto-cap sees it's already uppercase and skips it. The bold markers (`**`) do not interfere with the regex matching because auto-cap already handles markdown syntax.
- **Manual typing path:** Writer types `marshall`. On blur, auto-cap converts to `MARSHALL`. Save-time scan adds the character to `characters_present`. The name stays plain (not bold) — bold is reserved for explicit @-mentions.

### 7. Implementation Approach — TipTap Suggestion API

Uses `@tiptap/suggestion` directly (bundled with `@tiptap/extension-mention` which is already installed). We do **not** use the Mention extension's node type — instead we use only the suggestion utility, which provides:
- `@` trigger detection and query tracking
- Cursor-relative popup positioning via `clientRect`
- Keyboard navigation forwarding to the popup
- A `command()` callback for text replacement

**Custom insertion logic:** The suggestion's `command` callback uses the TipTap editor chain API to:
1. Delete the `@query` text (the range tracked by the suggestion plugin)
2. Insert text with bold mark: `editor.chain().focus().deleteRange(range).toggleBold().insertContent(NAME).toggleBold().run()`

This inserts plain text with a bold mark — no custom ProseMirror node type. The stored markdown is `**MARSHALL**`, which is standard bold syntax.

**Suggestion popup component:** A new `MentionSuggestion.tsx` React component. Rendered via the suggestion plugin's `render()` lifecycle (returns `onStart`, `onUpdate`, `onKeyDown`, `onExit` handlers). Uses `ReactDOM.createRoot` to mount/unmount a floating popup positioned at the cursor via the `clientRect` callback.

**Characters prop:** `ScriptEditor` receives a new optional `characters` prop:
```typescript
interface MentionCharacter {
  id: string
  name: string
  display_name?: string | null
  role?: string | null
}
```
When provided and non-empty, the suggestion plugin is active. When omitted or empty, no @-trigger behavior. No `aliases` field — the existing codebase does not have a reliable `aliases` column in the database (see Pre-existing Issues below).

---

## Pre-existing Issues Discovered

The review process uncovered several pre-existing bugs unrelated to this feature but relevant to its implementation:

### 1. `context-assembler.ts` ignores `characters_present` column
**Location:** `src/lib/ai/context-assembler.ts`
**Issue:** The `characters_present` field is hardcoded to `undefined` instead of reading the actual column value from the panels query. Panel-level character appearance data is never passed to the AI.
**Fix:** Read `characters_present` from the panels query (already fetched) and look up character names from the characters list.

### 2. TXT and DOCX exports do not handle markdown syntax
**Location:** `src/lib/exportTxt.ts`, `src/lib/exportDocx.ts`
**Issue:** Visual descriptions containing markdown (`**bold**`, `*italic*`) are exported with literal asterisks. This is already a problem with manually bolded text and gets worse with @-mention inserting `**NAME**`.
**Fix:** Run `stripMarkdown()` on visual descriptions before export in TXT. For DOCX, use `parseMarkdown()` to produce styled `TextRun` objects (bold, italic) instead of raw text.

### 3. `aliases` column referenced but not in migrations
**Location:** `src/lib/ai/context-assembler.ts`, `ManuscriptScanModal.tsx`, `MergeModal.tsx`
**Issue:** Code references `aliases TEXT[]` on `characters` table but no migration creates it. Queries may silently fail.
**Scope:** Out of scope for this feature. The @-mention autocomplete filters on `name` and `display_name` only.

**Recommendation:** Fix issues #1 and #2 as part of this implementation since they directly affect the feature's data flow and export behavior.

---

## What Changes, What Doesn't

| Thing | Changes? | Detail |
|-------|----------|--------|
| `ScriptEditor.tsx` | Yes | Adds suggestion plugin, Cmd+Click handler, `characters` prop |
| `globals.css` | Yes | Styles for mention suggestion dropdown |
| `auto-format.ts` | Yes | Add `scanCharactersPresent()` function for save-time detection |
| `context-assembler.ts` | Yes | Fix: read `characters_present` from panels instead of non-existent `panel_characters` table |
| `exportTxt.ts` | Yes | Fix: strip markdown from visual descriptions |
| `exportDocx.ts` | Yes | Fix: parse markdown for styled TextRun objects |
| Database schema | No | `characters_present TEXT[]` already exists on `panels` |
| Markdown storage format | No | `**NAME**` is standard markdown bold |
| `exportPdf.ts` | No | Already handles markdown via `parseMarkdownForPdf()` |
| Find & Replace | Verify | `search.ts` searches raw markdown — match positions account for `**` markers. `replaceInMarkdown` parses segments so replacements work correctly. Should be verified during implementation but no changes expected. |

---

## File Impact

| File | Change |
|------|--------|
| `src/components/editor/ScriptEditor.tsx` | Add suggestion plugin config, Cmd+Click TipTap plugin, `characters` prop |
| `src/components/editor/MentionSuggestion.tsx` | New — React component for suggestion dropdown popup |
| `src/app/globals.css` | Add mention suggestion dropdown styles |
| `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx` | Fetch characters with `display_name` and `role`, pass to child views |
| `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx` | Pass characters to ScriptEditor, save-time scan for `characters_present`, remove old @-trigger code |
| `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx` | Pass characters to ScriptEditor, save-time scan for `characters_present` |
| `src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx` | Pass characters to ScriptEditor, save-time scan for `characters_present` |
| `src/lib/auto-format.ts` | Add `scanCharactersPresent()` — returns UUID array of characters found in text |
| `src/lib/ai/context-assembler.ts` | Fix: replace `panel_characters` query with `characters_present` from panels |
| `src/lib/exportTxt.ts` | Fix: strip markdown from visual descriptions before output |
| `src/lib/exportDocx.ts` | Fix: parse markdown to styled TextRun objects for bold/italic support |
