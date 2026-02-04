# Day 4 Setup Guide: Drafting Flow Improvements

This guide documents Day 4 of the Panel Flow development roadmap - improving the drafting flow with context and navigation.

---

## What Was Created

### 1. Previous Page Context Component

```
src/app/series/[seriesId]/issues/[issueId]/PreviousPageContext.tsx
```

A collapsible component that shows:
- Previous page number and scene name
- Quick summary (last dialogue or visual description)
- Expandable view with full panel breakdown
- Story beat display
- Dialogue with character names
- Panel count stats

Also includes `findPreviousPage()` helper function for navigation.

### 2. Jump to Page Modal

```
src/app/series/[seriesId]/issues/[issueId]/JumpToPageModal.tsx
```

A command-palette style modal for quick page navigation:
- Fuzzy search by page number, scene name, or act name
- Keyboard navigation (↑↓ to navigate, Enter to select)
- Current page indicator
- Scene and act context for each page

### 3. Keyboard Navigation

Enhanced keyboard shortcuts in `IssueEditor.tsx`:

| Shortcut | Action |
|----------|--------|
| `⌘/Ctrl + ↑` | Previous page |
| `⌘/Ctrl + ↓` | Next page |
| `⌘/Ctrl + ⇧ + ↑` | Previous scene |
| `⌘/Ctrl + ⇧ + ↓` | Next scene |
| `⌘/Ctrl + J` | Jump to page (opens modal) |

### 4. Updated Keyboard Shortcuts Modal

Enhanced `KeyboardShortcutsModal.tsx` with new Navigation category.

---

## Features

### Previous Page Context

When editing a page, writers can see what happened on the previous page:

**Collapsed View:**
- Shows "← Page X" with the last line of dialogue or visual description
- Scene name indicator
- Click to expand

**Expanded View:**
- Story beat (if defined)
- Full panel breakdown with visual descriptions
- All dialogue with character names
- Page statistics

### Jump to Page

Press `⌘/Ctrl + J` anywhere in the editor to:
- Open a search modal
- Type page number, scene name, or act name
- Use arrow keys to navigate results
- Press Enter to jump to that page

### Keyboard Navigation

Navigate through the issue without touching the mouse:
- Quick page-by-page navigation with `⌘ + ↑/↓`
- Scene-to-scene jumps with `⌘ + ⇧ + ↑/↓`
- Toast notifications confirm navigation

---

## How Writers Use It

### Maintaining Continuity

1. Open any page in the editor
2. See the previous page context banner at the top
3. Click "▼ More" to see the full breakdown
4. Reference last dialogue or visuals while writing

### Quick Navigation

**To jump to a specific page:**
1. Press `⌘/Ctrl + J`
2. Type the page number or scene name
3. Press Enter

**To browse sequentially:**
- `⌘ + ↓` to go forward
- `⌘ + ↑` to go back

**To jump between scenes:**
- `⌘ + ⇧ + ↓` for next scene
- `⌘ + ⇧ + ↑` for previous scene

---

## Files Summary

```
New files:
├── src/app/series/[seriesId]/issues/[issueId]/PreviousPageContext.tsx
├── src/app/series/[seriesId]/issues/[issueId]/JumpToPageModal.tsx
└── DAY4_SETUP_GUIDE.md

Modified files:
├── src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
└── src/app/series/[seriesId]/issues/[issueId]/KeyboardShortcutsModal.tsx
```

---

## Technical Notes

### Previous Page Finding

The `findPreviousPage()` function:
1. Flattens all pages across acts and scenes
2. Sorts by act order → scene order → page number
3. Finds the current page's index
4. Returns the previous page with scene context

### Navigation State

Navigation uses the existing `selectedPageId` state in IssueEditor:
- `allPages` memoized array for efficient navigation
- Toast notifications for user feedback
- Scene detection for scene-level jumps

---

## Next Steps (Day 5)

Day 5 focuses on **Spread Support**:
1. Page type selector (Single/Splash/Spread Left/Spread Right)
2. Linked spread pairs
3. WeaveView spread visualization
4. Print layout preview

---

**Day 4 Complete! 🎉**

Writers can now maintain continuity with previous page context and navigate quickly through their issues using keyboard shortcuts.
