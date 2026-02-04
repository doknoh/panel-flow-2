# Day 5 Setup Guide: Spread & Splash Support

This guide documents Day 5 of the Panel Flow development roadmap - adding page type support for spreads and splash pages.

---

## What Was Created

### 1. PageTypeSelector Component

```
src/app/series/[seriesId]/issues/[issueId]/PageTypeSelector.tsx
```

A dropdown selector with visual icons for page types:
- **Single (▢)** - Standard single page
- **Splash (◼)** - Full-page single panel
- **Spread Left (◧)** - Left side of a two-page spread
- **Spread Right (◨)** - Right side of a two-page spread

Features:
- Visual icons for each type
- Linking modal for spread pages
- Automatic bi-directional linking
- Unlink handling when changing back to single

### 2. Database Migration

```
supabase/migrations/20260205_add_page_types.sql
```

Added to the `pages` table:
- `page_type` - TEXT ('SINGLE', 'SPLASH', 'SPREAD_LEFT', 'SPREAD_RIGHT')
- `linked_page_id` - UUID reference to partner page for spreads

Includes validation trigger to ensure:
- SPREAD_LEFT links to SPREAD_RIGHT
- SPREAD_RIGHT links to SPREAD_LEFT
- Non-spread pages don't have linked pages

### 3. Updated PageEditor

```
src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx
```

- Added PageTypeSelector to the header
- Updated Page interface to include `page_type` and `linked_page_id`
- Receives `scenePages` prop for spread linking options

### 4. Updated IssueEditor

```
src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
```

- Added `currentScenePages` memoized array
- Passes scene pages to PageEditor for spread linking

### 5. Enhanced WeaveView

```
src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx
```

- Updated Page interface for page types
- Smart spread grouping that detects linked spreads
- Special rendering for linked spreads (blue border, "SPREAD" badge)
- Special rendering for splash pages (purple border, "SPLASH" badge)
- Stats showing count of linked spreads and splash pages
- Updated instructions section

---

## Page Types

| Type | Icon | Description |
|------|------|-------------|
| SINGLE | ▢ | Standard page that pairs normally in spreads |
| SPLASH | ◼ | Full-page single panel, shown with visual indicator |
| SPREAD_LEFT | ◧ | Left side of intentional two-page spread |
| SPREAD_RIGHT | ◨ | Right side of intentional two-page spread |

---

## Features

### Page Type Selector

In the PageEditor header, writers can:
1. Click the page type button to open the dropdown
2. Select a new page type
3. For spread types, optionally link to another page in the scene

### Spread Linking

When selecting SPREAD_LEFT or SPREAD_RIGHT:
1. A modal appears showing available pages to link
2. Only unlinked Single/Splash pages are available
3. Selecting a page automatically sets both pages' types
4. "Set Without Linking" creates an unlinked spread page

### WeaveView Display

In the Weave view:
- **Linked Spreads**: Blue border, minimal spine, "SPREAD" badge
- **Splash Pages**: Purple border, visual placeholder for full extension
- **Regular Pages**: Normal pairing with standard spine

---

## How Writers Use It

### Creating a Two-Page Spread

1. Open the issue editor
2. Navigate to the left page of your spread
3. Click the page type selector (shows "▢ Single")
4. Select "Spread (L)" from the dropdown
5. In the linking modal, select the right page
6. Both pages are now linked as a spread

### Creating a Splash Page

1. Navigate to the page you want as a splash
2. Click the page type selector
3. Select "Splash"
4. The page is now marked as full-page

### Viewing Spreads in WeaveView

1. Go to the Weave view
2. Linked spreads appear with:
   - Blue border connecting both pages
   - "◧◨ SPREAD" badge above
   - Minimal spine between pages
3. Splash pages appear with:
   - Purple border
   - "◼ SPLASH" badge above
   - Visual placeholder showing page extends

### Unlinking a Spread

1. Navigate to either page of the spread
2. Click the page type selector
3. Select "Single" or "Splash"
4. Both pages are automatically unlinked

---

## Files Summary

```
New files:
├── src/app/series/[seriesId]/issues/[issueId]/PageTypeSelector.tsx
└── DAY5_SETUP_GUIDE.md

Modified files:
├── src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx
├── src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx
└── src/app/series/[seriesId]/issues/[issueId]/weave/WeaveView.tsx

Database migration (already existed):
└── supabase/migrations/20260205_add_page_types.sql
```

---

## Technical Notes

### Spread Linking Logic

When linking pages as a spread:
1. Update the linked page to the complementary type
2. Set `linked_page_id` on both pages pointing to each other
3. Database trigger validates the pairing

### WeaveView Spread Detection

The spread grouping algorithm:
1. Processes pages sequentially
2. Detects linked SPREAD_LEFT/SPREAD_RIGHT pairs
3. Groups them as a single visual unit
4. Handles splash pages as special single-page spreads
5. Falls back to regular pairing for normal pages

### Type-Safe Props

The `PageForLinking` interface ensures:
```typescript
interface PageForLinking {
  id: string
  page_number: number
  page_type: PageType
  linked_page_id: string | null
}
```

---

## Next Steps (Day 6)

Day 6 focuses on **AI Integration**:
1. AI-assisted dialogue suggestions
2. Visual description generation
3. Story beat recommendations
4. Character voice consistency checks

---

**Day 5 Complete! 🎉**

Writers can now create intentional two-page spreads and full-page splash panels, with visual indicators in both the editor and WeaveView.
