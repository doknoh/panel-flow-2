# Zen Mode Redesign — Warm Parchment

**Date:** 2026-03-11
**Status:** Approved
**Mockups:** `.superpowers/brainstorm/43094-1773277380/zen-full-design.html`

---

## Problem

Zen Mode is broken in light mode and visually cluttered in both themes:

1. **Illegible text** — CSS hardcodes `color: white` for the editor, invisible on the light cream/gray background.
2. **Blueprint grid bleeds through** — The body's 40px grid pattern shows inside zen mode's fullscreen overlay.
3. **Toolbars visible** — Full formatting toolbars (B/I/U/S, lists, heading, blockquote, code, hr) appear on every ScriptEditor instance, defeating "distraction-free."
4. **Heavy chrome** — Bordered header, bordered footer, bordered close button, `<kbd>` boxes for shortcuts, hard dividers between sections.
5. **Dialogue/captions read-only** — Zen mode only allows editing visual descriptions and internal notes; dialogue, captions, and SFX are read-only reference, forcing the writer back to the normal editor mid-flow.

## Solution

A warm, literary writing environment with zero chrome and full editability.

### Visual Direction: Warm Parchment

- **Light mode background:** `#faf8f4` (warm cream)
- **Dark mode background:** `#1c1a16` (warm charcoal)
- **Body typography:** Georgia serif, 17px, line-height 1.85
- **Label typography:** monospace, 9px, uppercase, extremely muted
- **Accent color:** warm brown `#8b7355` (light) / `#8b7d65` (dark)
- **No toolbars** — formatting via keyboard shortcuts only (Cmd+B, Cmd+I, Cmd+U)
- **No borders anywhere** — spacing and 40px center-aligned line dividers only
- **No grid background** — zen mode overrides the body's blueprint grid

### Color Palette

#### Light Mode
| Element | Color |
|---------|-------|
| Background | `#faf8f4` |
| Description text | `#3d3428` |
| Dialogue text | `#5a4d3a` |
| Caption text | `#6b5d4a` |
| Notes text | `#9e9080` |
| Speaker names | `#8b7355` |
| Section labels | `#c4baa8` |
| Panel dots (active) | `#8b7355` |
| Panel dots (inactive) | `#ddd6c8` |
| Dividers | `#e0d8cc` |
| Dialogue left-border | `#c4b89a` |
| Close button / footer | `#cdc4b4` |
| Next/prev panel ghost | `#c4baa8` |

#### Dark Mode
| Element | Color |
|---------|-------|
| Background | `#1c1a16` |
| Description text | `#d4ccc0` |
| Dialogue text | `#b0a898` |
| Caption text | `#908878` |
| Notes text | `#5a5448` |
| Speaker names | `#8b7d65` |
| Section labels | `#4a4438` |
| Panel dots (active) | `#8b7d65` |
| Panel dots (inactive) | `#302c26` |
| Dividers | `#302c26` |
| Dialogue left-border | `#5a5040` |
| Close button / footer | `#4a4438` |
| Next/prev panel ghost | `#3a3630` |

### Content Layout (top to bottom)

1. **Header** — centered, no border. Monospace: `Page N · Panel N` on first line, `Act N · Scene Name` on second line. Close button is a bare `×` character (no box/border), top-right corner.

2. **Panel indicator dots** — horizontal row, centered. Active dot: `w-[20px] h-[3px]` rounded pill, accent color. Inactive: `w-[5px] h-[3px]` rounded dot, muted. Clicking a dot triggers blur (auto-save) and navigates.

3. **Previous panel ghost** — faded 2-line preview of the previous panel's description, with monospace label `PANEL N`. Very low contrast (uses `--zen-ghost`). Only shown when `currentPanelIndex > 0`.

4. **Visual Description** — section label + Georgia serif editable area. Primary writing surface, largest text (17px), most vertical space.

5. **Center divider** — 40px wide, 1px, centered.

6. **Dialogue** — section label + one block per dialogue entry. Each block: 2px warm left-border, monospace speaker name above (read-only), Georgia serif italic editable text below. All dialogue text editable. Section hidden entirely if panel has no dialogue blocks.

7. **Center divider**

8. **Captions** — section label + one block per caption. Left-border, monospace type label (NARRATIVE, LOCATION, etc.) above (read-only), editable text below. Section hidden if no captions.

9. **SFX** — section label + bold monospace editable text, uppercase. Section hidden if no SFX.

10. **Center divider**

11. **Internal Notes** — section label + Georgia serif editable area. Smaller (14px), more muted than description.

12. **Next panel ghost** — faded 2-line preview of the next panel's description, with monospace label. Very low contrast. Only shown when not on last panel.

13. **Footer** — no border. Left: `+N WORDS THIS SESSION` in whisper monospace. Right: `Tab next · Shift+Tab prev · Esc exit` in plain text (no `<kbd>` boxes).

**Empty sections:** Dialogue, Captions, and SFX sections are hidden entirely when the panel has no content of that type. Description and Internal Notes always show (with placeholder text).

### Functional Changes

**Make all content editable:**
- Dialogue text: editable via ScriptEditor with `dialogue` variant + `hideToolbar`
- Caption text: editable via ScriptEditor with `caption` variant + `hideToolbar`
- SFX text: editable via ScriptEditor with `sfx` variant + `hideToolbar`
- Speaker names and dialogue types remain read-only (structural changes belong in the normal editor)

**Save behavior — all onBlur, no manual tracking:**

Every ScriptEditor instance saves its own content onBlur. There is no manual `hasChanges` flag or `saveCurrentPanel()` function. This simplifies the save model:

- **Description editor** onBlur → `supabase.from('panels').update({ visual_description }).eq('id', panelId)`
- **Notes editor** onBlur → `supabase.from('panels').update({ internal_notes }).eq('id', panelId)`
- **Dialogue editor** onBlur → `supabase.from('dialogue_blocks').update({ text }).eq('id', dialogueId)`
- **Caption editor** onBlur → `supabase.from('captions').update({ text }).eq('id', captionId)`
- **SFX editor** onBlur → `supabase.from('sound_effects').update({ text }).eq('id', sfxId)`

Each onBlur save calls `onSave()` to notify the parent (`IssueEditor`) that data changed, so it can refresh its state.

Each ScriptEditor receives an `onBlur` callback closed over its entity ID:
```tsx
// Description/Notes — closed over panel ID
<ScriptEditor onBlur={(md) => saveField('panels', currentPanel.id, 'visual_description', md)} />

// Dialogue — closed over individual dialogue_block ID
{currentPanel.dialogue_blocks.map(d => (
  <ScriptEditor onBlur={(md) => saveField('dialogue_blocks', d.id, 'text', md)} />
))}

// Captions — closed over individual caption ID
{currentPanel.captions.map(c => (
  <ScriptEditor onBlur={(md) => saveField('captions', c.id, 'text', md)} />
))}

// SFX — closed over individual sound_effect ID
{currentPanel.sound_effects.map(s => (
  <ScriptEditor onBlur={(md) => saveField('sound_effects', s.id, 'text', md)} />
))}
```

**Save triggers on navigation:**
- Tab/Shift+Tab → the active editor loses focus → onBlur fires → saves automatically
- Page navigation (Cmd+Shift+Arrow) → same blur-then-navigate pattern
- Escape → blur fires → save → exit
- Panel dot click → blur fires → save → navigate

The "UNSAVED" header indicator is removed. Since every field auto-saves on blur, there is no unsaved state visible to the user.

**Word count:** The session word counter in the footer tracks words across ALL editable content (description + dialogue + captions + SFX + notes), not just descriptions.

### Tab Key Behavior

Tab always advances to the next panel (and Shift+Tab to the previous). It does NOT cycle between editors within a panel.

To move focus between editors within a panel, the writer clicks the desired field. This keeps the panel-by-panel flow that defines zen mode — Tab means "I'm done with this panel, show me the next one."

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Tab | Save current (via blur) → next panel |
| Shift+Tab | Save current (via blur) → previous panel |
| Cmd+Shift+Right | Save current → next page |
| Cmd+Shift+Left | Save current → previous page |
| Escape | Save current → exit zen mode |
| Cmd+S | Explicit save — triggers `document.activeElement.blur()` to fire onBlur save, then immediately re-focuses the same editor. The re-focus happens synchronously after initiating the save (optimistic — no await). The editor retains its local content; the onBlur save writes to DB in the background. |
| Cmd+B/I/U | Bold/italic/underline (handled by TipTap) |

**Removed:** Cmd+Shift+Z as exit shortcut. This conflicts with TipTap's redo keybinding when multiple editors are present. Escape is sufficient for exiting.

### ScriptEditor Changes

Add a `hideToolbar` prop to ScriptEditor:
```typescript
interface ScriptEditorProps {
  // ... existing props
  hideToolbar?: boolean
}
```

When `hideToolbar` is true, the ScriptEditorToolbar component is never rendered, regardless of variant or focus state. TipTap keyboard shortcuts (Cmd+B, Cmd+I, Cmd+U) continue to work — only the visual toolbar is suppressed.

Implementation: short-circuit at the top of the existing toolbar conditional:
```tsx
{!hideToolbar && variant !== 'sfx' && (variant === 'description' || variant === 'notes' || isFocused) && (
  <ScriptEditorToolbar editor={editor} variant={variant} />
)}
```

### CSS Changes

**New zen mode CSS variables** (scoped to `.zen-mode` class on the overlay):

```css
.zen-mode {
  /* Override body grid background */
  background-image: none;

  /* Light mode zen palette */
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
```

**Replace existing `.zen-editor` styles** — the current rules (including `color: white`) are deleted entirely and replaced by the zen CSS variables above.

**Typography overrides** (variant-specific):
```css
/* Default zen typography: serif for descriptions and notes */
.zen-mode .script-editor__content {
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* SFX stays monospace + bold + uppercase */
.zen-mode .script-editor--sfx .script-editor__content {
  font-family: var(--font-mono);
  font-weight: 700;
  text-transform: uppercase;
  font-size: 13px;
  letter-spacing: 0.08em;
}
```

### Empty State

When zen mode opens on a page with no panels, the warm parchment background is shown with centered text:

```
No panels on this page

Press Escape to exit
```

Both lines use the `--zen-ghost` color, description size (17px) for the first line, label size (9px monospace) for the second. The close `×` button remains in the top-right corner.

### Undo/Redo

Zen mode does not integrate with the application's UndoContext. Edits made in zen mode are saved directly to the database via onBlur and cannot be undone via Cmd+Z after exiting zen mode.

TipTap's built-in undo (Cmd+Z) and redo (Cmd+Shift+Z) work within each editor instance while it is focused. This is sufficient for in-session corrections.

This is an existing limitation (the current zen mode also bypasses UndoContext) and is explicitly out of scope for this redesign.

### Files Modified

| File | Change |
|------|--------|
| `src/app/series/[seriesId]/issues/[issueId]/ZenMode.tsx` | Full rewrite: warm parchment styling, all content editable via ScriptEditor with `hideToolbar`, onBlur saves for dialogue/captions/SFX, remove borders/chrome, add previous panel ghost, session word count across all content |
| `src/components/editor/ScriptEditor.tsx` | Add `hideToolbar?: boolean` prop, conditionally skip toolbar rendering |
| `src/app/globals.css` | Delete `.zen-editor` / `.zen-editor--notes` rules, add `.zen-mode` CSS variable system with light/dark palettes, add variant-specific typography overrides |

### Out of Scope

- Adding new dialogue blocks, captions, or SFX in zen mode (use normal editor for structural changes)
- Changing speaker names or dialogue types in zen mode
- Reordering dialogue blocks in zen mode
- Floating/bubble toolbar on text selection (explicitly rejected)
- Custom font loading (Georgia is a web-safe system font)
- UndoContext integration (existing limitation, not introduced by this redesign)
