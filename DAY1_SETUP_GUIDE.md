# Day 1 Setup Guide

This guide walks you through completing Day 1 of the Panel Flow development roadmap.

---

## What Was Created

### 1. Database Migrations (3 files)

```
supabase/migrations/
├── 20260205_add_image_attachments.sql    # Image storage metadata
├── 20260205_add_page_types.sql           # Spread/splash support
└── 20260205_add_plotline_issue_assignments.sql  # Cross-issue plotline tracking
```

### 2. Storage Utilities

```
src/lib/supabase/storage.ts    # Upload, delete, URL helpers
```

### 3. ImageUploader Component

```
src/components/ImageUploader.tsx   # Drag-and-drop image upload
```

### 4. Dependencies

```
react-dropzone  # Already installed
```

---

## Setup Steps

### Step 1: Run Database Migrations

```bash
# Option A: Using Supabase CLI (if you have it set up)
cd /path/to/panel-flow-2
supabase db push

# Option B: Run manually in Supabase Dashboard
# 1. Go to your Supabase project
# 2. Navigate to SQL Editor
# 3. Run each migration file in order:
#    - 20260205_add_image_attachments.sql
#    - 20260205_add_page_types.sql
#    - 20260205_add_plotline_issue_assignments.sql
```

### Step 2: Create Supabase Storage Bucket

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name:** `panel-flow-images`
   - **Public:** ✅ Yes (for easy image serving)
   - **File size limit:** 5MB
   - **Allowed MIME types:** `image/png, image/jpeg, image/gif, image/webp`

5. Click **Create bucket**

### Step 3: Configure Storage Policies

After creating the bucket, set up RLS policies:

```sql
-- Run this in SQL Editor after creating the bucket

-- Policy: Users can upload to their own folder
CREATE POLICY "Users can upload their own images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'panel-flow-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own images
CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'panel-flow-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own images
CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'panel-flow-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Public read access (since bucket is public)
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'panel-flow-images');
```

### Step 4: Verify Installation

Run the development server and check for errors:

```bash
npm run dev
```

Test the ImageUploader by temporarily adding it to a page:

```tsx
// In any page component, add:
import ImageUploader from '@/components/ImageUploader'

// In the render:
<ImageUploader
  entityType="character"
  entityId="test-id"
  existingImages={[]}
  onImagesChange={(images) => console.log('Images:', images)}
/>
```

---

## What Each Migration Does

### `20260205_add_image_attachments.sql`

Creates the `image_attachments` table for storing image metadata:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner of the image |
| `entity_type` | TEXT | 'character', 'location', 'series', or 'page' |
| `entity_id` | UUID | ID of the associated entity |
| `storage_path` | TEXT | Path in Supabase storage |
| `filename` | TEXT | Original filename |
| `mime_type` | TEXT | e.g., 'image/png' |
| `file_size` | INTEGER | Size in bytes |
| `caption` | TEXT | Optional description |
| `is_primary` | BOOLEAN | Is this the main reference image? |
| `sort_order` | INTEGER | For ordering multiple images |

**Key features:**
- Polymorphic design (works for any entity type)
- Automatic trigger ensures only one primary image per entity
- Full RLS protection

### `20260205_add_page_types.sql`

Adds support for spreads and splash pages:

| Column | Type | Purpose |
|--------|------|---------|
| `page_type` | TEXT | 'SINGLE', 'SPLASH', 'SPREAD_LEFT', 'SPREAD_RIGHT' |
| `linked_page_id` | UUID | For spreads: links left to right page |

**Key features:**
- Validation trigger ensures spreads link correctly
- SPREAD_LEFT must link to SPREAD_RIGHT and vice versa

### `20260205_add_plotline_issue_assignments.sql`

Tracks which plotlines appear in which issues:

| Column | Type | Purpose |
|--------|------|---------|
| `plotline_id` | UUID | Reference to plotlines table |
| `issue_id` | UUID | Reference to issues table |
| `first_appearance` | BOOLEAN | Is this where the plotline starts? |
| `climax_issue` | BOOLEAN | Does this plotline peak here? |
| `resolution_issue` | BOOLEAN | Is this where it resolves? |
| `notes` | TEXT | Optional notes |

**Key features:**
- Unique constraint on (plotline_id, issue_id)
- Enables series-level plotline visualization

---

## Next Steps (Day 2)

With the foundation in place, Day 2 focuses on integrating the ImageUploader into:

1. Character form (`/series/[seriesId]/characters`)
2. Location form (`/series/[seriesId]/locations`)
3. Series metadata page (`/series/[seriesId]`)
4. New "Visuals" tab in Toolkit

---

## Troubleshooting

### "Bucket not found" error

Make sure the bucket name matches exactly: `panel-flow-images`

### Images upload but don't display

Check that:
1. The bucket is set to **public**
2. Storage policies allow public read access
3. The `storage_path` is being saved correctly to the database

### RLS errors on image_attachments

Make sure you're authenticated before uploading. The RLS policies require `auth.uid()` to match.

### Migration fails with "relation already exists"

If running migrations multiple times, you may need to drop existing objects first. Be careful in production!

---

## Files Changed Summary

```
New files:
├── supabase/migrations/20260205_add_image_attachments.sql
├── supabase/migrations/20260205_add_page_types.sql
├── supabase/migrations/20260205_add_plotline_issue_assignments.sql
├── src/lib/supabase/storage.ts
├── src/components/ImageUploader.tsx
└── DAY1_SETUP_GUIDE.md

Modified files:
└── package.json (added react-dropzone)
```

---

**Day 1 Complete! 🎉**

Tomorrow we'll wire up the ImageUploader to the character and location forms.
