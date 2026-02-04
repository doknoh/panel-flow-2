# Day 2 Setup Guide: Visual References Integration

This guide documents Day 2 of the Panel Flow development roadmap - integrating visual reference images into the application.

---

## What Was Created

### 1. Shared Hook for Image Management

```
src/hooks/useEntityImages.ts    # Reusable hook for fetching entity images
```

This hook provides:
- Automatic image fetching when entity ID changes
- Loading state management
- Image URL generation
- Helper function to get primary image

### 2. Character Form Integration

**File:** `src/app/series/[seriesId]/characters/CharacterList.tsx`

**Changes:**
- Added `useEntityImages` hook for loading character images
- Added `ImageUploader` component to the edit form
- Shows helpful message when creating new characters (must save first)

### 3. Location Form Integration

**File:** `src/app/series/[seriesId]/locations/LocationList.tsx`

**Changes:**
- Added `useEntityImages` hook for loading location images
- Added `ImageUploader` component to the edit form
- Same "save first" pattern as characters

### 4. Series Metadata Integration

**File:** `src/app/series/[seriesId]/SeriesMetadata.tsx`

**Changes:**
- Added `useEntityImages` hook for series images
- Shows primary image as cover thumbnail in collapsed view
- Full `ImageUploader` in expanded edit mode
- Supports cover art, style references, mood boards

### 5. Visuals Tab in Toolkit Sidebar

**File:** `src/app/series/[seriesId]/issues/[issueId]/Toolkit.tsx`

**New Features:**
- New "Pics" tab in the toolbar (between Locs and Alerts)
- Thumbnail grid of all character and location images
- Filter by All / Characters / Locations
- Click to expand full-size view
- Shows entity name and primary badge
- Lazy-loads images when tab is opened
- Refresh button for updating the gallery

---

## How It Works

### Image Upload Flow

1. **Edit Mode Required**: Users must save an entity (character, location, series) before adding images
2. **Drag & Drop**: Users can drag images or click to select
3. **Multiple Images**: Up to 10 images per entity
4. **Primary Image**: First image is automatically primary; can change via star icon
5. **Captions**: Optional captions for context
6. **Auto-Sync**: Images sync automatically with the database

### Visuals Tab Workflow

1. Writer opens the issue editor
2. Clicks "Pics" tab in the right sidebar
3. Sees thumbnail grid of all reference images
4. Can filter by type (characters/locations)
5. Clicks an image to see full-size view
6. Reference images help maintain visual consistency

---

## Files Changed Summary

```
New files:
├── src/hooks/useEntityImages.ts
└── DAY2_SETUP_GUIDE.md

Modified files:
├── src/app/series/[seriesId]/characters/CharacterList.tsx
├── src/app/series/[seriesId]/locations/LocationList.tsx
├── src/app/series/[seriesId]/SeriesMetadata.tsx
└── src/app/series/[seriesId]/issues/[issueId]/Toolkit.tsx
```

---

## Prerequisites

Day 2 requires Day 1 to be completed:
- ✅ `image_attachments` table created
- ✅ `panel-flow-images` storage bucket configured
- ✅ Storage RLS policies applied
- ✅ `ImageUploader` component available
- ✅ Storage utilities (`src/lib/supabase/storage.ts`) available

---

## Testing the Integration

### Test 1: Character Images
1. Go to `/series/[seriesId]/characters`
2. Click "Edit" on a character
3. Scroll to "Reference Images" section
4. Upload an image via drag & drop
5. Verify image appears in the grid
6. Set as primary / add caption / delete

### Test 2: Location Images
1. Go to `/series/[seriesId]/locations`
2. Edit a location
3. Upload reference images
4. Verify functionality matches characters

### Test 3: Series Cover
1. Go to `/series/[seriesId]`
2. Click "Edit Series Details"
3. Scroll to "Series Images" section
4. Upload a cover image
5. Verify thumbnail appears in collapsed view

### Test 4: Visuals Tab
1. Go to `/series/[seriesId]/issues/[issueId]`
2. Click the "Pics" tab in the right sidebar
3. Verify images from characters and locations appear
4. Test the filter buttons
5. Click an image to see full-size view

---

## Troubleshooting

### Images don't appear after upload
1. Check browser console for errors
2. Verify the storage bucket exists and is public
3. Confirm the user is authenticated

### "Save first" message for existing entities
- This only appears when creating NEW entities
- When editing existing entities, the ImageUploader should appear

### Visuals tab is empty
- Click "Refresh" to reload images
- Ensure characters/locations have images attached
- Check that Day 1 migrations were applied

---

## Next Steps (Day 3)

Day 3 focuses on **Series Architecture**:
1. Series Dashboard with issue grid
2. Series-level plotline management (cross-issue tracking)
3. Character arcs view improvements
4. Series statistics and analytics

---

**Day 2 Complete! 🎉**

Writers can now attach visual references to characters, locations, and series, and quickly access them from the Toolkit sidebar while writing.
