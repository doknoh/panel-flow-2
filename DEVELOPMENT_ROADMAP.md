# Panel Flow 2.0 → 3.0: One-Week Sprint Roadmap

**Goal:** Close the critical gaps to make Panel Flow ready for professional comic writers.
**Timeline:** 7 days of focused development
**Success Metric:** Address all 5 "deal-breaker" gaps from the Elite Writer Review

---

## Sprint Overview

| Day | Focus | Deliverables |
|-----|-------|--------------|
| **Day 1** | Foundation | DB migrations, image upload infrastructure |
| **Day 2** | Visual References | Image attachments on Characters, Locations, Series |
| **Day 3** | Series Architecture | Series-level outline view with cross-issue tracking |
| **Day 4** | Drafting Flow | Previous page context, keyboard navigation |
| **Day 5** | Spread Support | Splash/Spread page types, linked pages |
| **Day 6** | Version Comparison | Side-by-side diff view |
| **Day 7** | Polish & Integration | In-editor AI, bug fixes, testing |

---

## Day 1: Foundation Layer

### Morning: Database Migrations

**Migration 1: Image Attachments Schema**
```sql
-- File: supabase/migrations/20260205_add_image_attachments.sql

-- Generic image attachments table (polymorphic)
CREATE TABLE image_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Polymorphic association
  entity_type TEXT NOT NULL, -- 'character', 'location', 'series', 'page'
  entity_id UUID NOT NULL,

  -- Image data
  storage_path TEXT NOT NULL, -- Supabase storage path
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,

  -- Metadata
  caption TEXT,
  is_primary BOOLEAN DEFAULT FALSE, -- Primary reference image
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_image_attachments_entity
  ON image_attachments(entity_type, entity_id);
CREATE INDEX idx_image_attachments_user
  ON image_attachments(user_id);

-- RLS
ALTER TABLE image_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own images"
  ON image_attachments FOR ALL
  USING (user_id = auth.uid());
```

**Migration 2: Page Types for Spreads**
```sql
-- File: supabase/migrations/20260205_add_page_types.sql

-- Add page_type enum
CREATE TYPE page_type AS ENUM ('SINGLE', 'SPLASH', 'SPREAD_LEFT', 'SPREAD_RIGHT');

-- Add columns to pages
ALTER TABLE pages
  ADD COLUMN page_type page_type DEFAULT 'SINGLE',
  ADD COLUMN linked_page_id UUID REFERENCES pages(id) ON DELETE SET NULL;

-- Index for linked pages
CREATE INDEX idx_pages_linked ON pages(linked_page_id);

COMMENT ON COLUMN pages.page_type IS 'SINGLE=normal, SPLASH=full-page panel, SPREAD_LEFT/RIGHT=two-page spread';
COMMENT ON COLUMN pages.linked_page_id IS 'For spreads: links left page to right page';
```

**Migration 3: Series-Level Plotlines**
```sql
-- File: supabase/migrations/20260205_series_plotlines.sql

-- Plotlines should be at series level (already exists but let's ensure)
-- Add issue tracking for plotline appearances

CREATE TABLE plotline_issue_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plotline_id UUID NOT NULL REFERENCES plotlines(id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  first_appearance BOOLEAN DEFAULT FALSE,
  climax_issue BOOLEAN DEFAULT FALSE,
  resolution_issue BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(plotline_id, issue_id)
);

CREATE INDEX idx_plotline_issues ON plotline_issue_assignments(plotline_id);
CREATE INDEX idx_issue_plotlines ON plotline_issue_assignments(issue_id);

-- RLS
ALTER TABLE plotline_issue_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage plotline assignments for their series"
  ON plotline_issue_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM plotlines p
      JOIN series s ON p.series_id = s.id
      WHERE p.id = plotline_issue_assignments.plotline_id
      AND s.user_id = auth.uid()
    )
  );
```

### Afternoon: Supabase Storage Setup

**Task: Configure Image Storage**

```typescript
// File: src/lib/supabase/storage.ts

import { createClient } from './client'

const BUCKET_NAME = 'panel-flow-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export async function uploadImage(
  file: File,
  entityType: string,
  entityId: string
): Promise<{ path: string; url: string } | null> {
  const supabase = createClient()
  const user = await supabase.auth.getUser()

  if (!user.data.user) return null

  const fileExt = file.name.split('.').pop()
  const fileName = `${user.data.user.id}/${entityType}/${entityId}/${Date.now()}.${fileExt}`

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path)

  return { path: data.path, url: publicUrl }
}

export async function deleteImage(path: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([path])

  return !error
}

export function getImageUrl(path: string): string {
  const supabase = createClient()
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path)

  return data.publicUrl
}
```

**Deliverables:**
- [ ] Run all 3 migrations
- [ ] Configure Supabase storage bucket
- [ ] Create storage utility functions
- [ ] Test upload/delete flow

---

## Day 2: Visual References System

### Morning: Image Upload Component

**Task: Create reusable ImageUploader component**

```typescript
// File: src/components/ImageUploader.tsx

'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadImage, deleteImage } from '@/lib/supabase/storage'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface ImageUploaderProps {
  entityType: 'character' | 'location' | 'series' | 'page'
  entityId: string
  existingImages: ImageAttachment[]
  onImagesChange: (images: ImageAttachment[]) => void
  maxImages?: number
}

interface ImageAttachment {
  id: string
  storage_path: string
  filename: string
  caption: string | null
  is_primary: boolean
  url?: string
}

export default function ImageUploader({
  entityType,
  entityId,
  existingImages,
  onImagesChange,
  maxImages = 10
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const { showToast } = useToast()

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (existingImages.length + acceptedFiles.length > maxImages) {
      showToast(`Maximum ${maxImages} images allowed`, 'error')
      return
    }

    setUploading(true)
    const supabase = createClient()

    for (const file of acceptedFiles) {
      const result = await uploadImage(file, entityType, entityId)

      if (result) {
        // Save to database
        const { data, error } = await supabase
          .from('image_attachments')
          .insert({
            entity_type: entityType,
            entity_id: entityId,
            storage_path: result.path,
            filename: file.name,
            mime_type: file.type,
            file_size: file.size,
            is_primary: existingImages.length === 0 // First image is primary
          })
          .select()
          .single()

        if (data) {
          onImagesChange([...existingImages, { ...data, url: result.url }])
        }
      }
    }

    setUploading(false)
    showToast('Images uploaded', 'success')
  }, [entityType, entityId, existingImages, maxImages, onImagesChange, showToast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
    maxSize: 5 * 1024 * 1024
  })

  const handleDelete = async (image: ImageAttachment) => {
    const supabase = createClient()

    await deleteImage(image.storage_path)
    await supabase
      .from('image_attachments')
      .delete()
      .eq('id', image.id)

    onImagesChange(existingImages.filter(i => i.id !== image.id))
    showToast('Image removed', 'success')
  }

  const handleSetPrimary = async (image: ImageAttachment) => {
    const supabase = createClient()

    // Clear existing primary
    await supabase
      .from('image_attachments')
      .update({ is_primary: false })
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)

    // Set new primary
    await supabase
      .from('image_attachments')
      .update({ is_primary: true })
      .eq('id', image.id)

    onImagesChange(existingImages.map(i => ({
      ...i,
      is_primary: i.id === image.id
    })))
  }

  return (
    <div className="space-y-3">
      {/* Existing images grid */}
      {existingImages.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {existingImages.map(image => (
            <div key={image.id} className="relative group aspect-square">
              <img
                src={image.url || `/api/image/${image.storage_path}`}
                alt={image.filename}
                className={`w-full h-full object-cover rounded-lg ${
                  image.is_primary ? 'ring-2 ring-blue-500' : ''
                }`}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                <button
                  onClick={() => handleSetPrimary(image)}
                  className="p-1 bg-blue-500 rounded text-xs"
                  title="Set as primary"
                >
                  ★
                </button>
                <button
                  onClick={() => handleDelete(image)}
                  className="p-1 bg-red-500 rounded text-xs"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              {image.is_primary && (
                <div className="absolute top-1 right-1 bg-blue-500 text-white text-[8px] px-1 rounded">
                  PRIMARY
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload dropzone */}
      {existingImages.length < maxImages && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
          }`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <p className="text-sm text-[var(--text-muted)]">Uploading...</p>
          ) : isDragActive ? (
            <p className="text-sm text-blue-400">Drop images here</p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Drag & drop images, or click to select
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

### Afternoon: Integrate into Character/Location/Series Forms

**Task: Add ImageUploader to existing entity forms**

Files to modify:
- `src/app/series/[seriesId]/characters/CharacterForm.tsx`
- `src/app/series/[seriesId]/locations/LocationForm.tsx`
- `src/app/series/[seriesId]/page.tsx` (series metadata)

**Task: Add "Visual References" tab to Toolkit**

```typescript
// Add to src/app/series/[seriesId]/issues/[issueId]/Toolkit.tsx

// In the tabs array, add:
{ id: 'visuals', label: 'Visuals', icon: '🖼️' }

// New VisualsTab component showing:
// - Characters in current scene with their primary images
// - Current location with its images
// - Quick access to series visual style notes
```

**Deliverables:**
- [ ] ImageUploader component
- [ ] react-dropzone dependency added
- [ ] Character form with image upload
- [ ] Location form with image upload
- [ ] Series page with image upload
- [ ] Visuals tab in Toolkit showing scene-relevant images

---

## Day 3: Series Architecture View

### Morning: Series Outline Page

**Task: Create `/series/[seriesId]/outline` page**

This is the BIG feature. A visual timeline showing all issues with:
- Issue cards in a horizontal row
- Plotline ribbons connecting across issues
- Quick summary of each issue
- Visual indicator of status (outline/drafting/revision/complete)

```typescript
// File: src/app/series/[seriesId]/outline/SeriesOutline.tsx

'use client'

import { useState } from 'react'
import Link from 'next/link'

interface SeriesOutlineProps {
  series: {
    id: string
    title: string
    plotlines: Plotline[]
    issues: Issue[]
  }
}

interface Plotline {
  id: string
  name: string
  color: string
  assignments: {
    issue_id: string
    first_appearance: boolean
    climax_issue: boolean
    resolution_issue: boolean
  }[]
}

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  status: string
  series_act: string | null
}

export default function SeriesOutline({ series }: SeriesOutlineProps) {
  const [selectedPlotline, setSelectedPlotline] = useState<string | null>(null)

  // Group issues by series_act
  const beginning = series.issues.filter(i => i.series_act === 'BEGINNING')
  const middle = series.issues.filter(i => i.series_act === 'MIDDLE')
  const end = series.issues.filter(i => i.series_act === 'END')
  const unassigned = series.issues.filter(i => !i.series_act)

  return (
    <div className="space-y-8">
      {/* Plotline Legend */}
      <div className="flex flex-wrap gap-3 p-4 bg-[var(--bg-secondary)] rounded-lg">
        <span className="text-sm text-[var(--text-secondary)] mr-2">Plotlines:</span>
        {series.plotlines.map(pl => (
          <button
            key={pl.id}
            onClick={() => setSelectedPlotline(
              selectedPlotline === pl.id ? null : pl.id
            )}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm transition-all ${
              selectedPlotline === pl.id
                ? 'ring-2 ring-white'
                : 'opacity-70 hover:opacity-100'
            }`}
            style={{ backgroundColor: pl.color + '30', borderColor: pl.color }}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: pl.color }}
            />
            {pl.name}
          </button>
        ))}
      </div>

      {/* Series Timeline */}
      <div className="relative">
        {/* Plotline Ribbons - SVG connecting issues */}
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          {series.plotlines.map(pl => {
            if (selectedPlotline && selectedPlotline !== pl.id) return null

            // Get issues where this plotline appears
            const issueIds = pl.assignments.map(a => a.issue_id)
            const issuePositions = issueIds
              .map(id => series.issues.findIndex(i => i.id === id))
              .filter(idx => idx !== -1)
              .sort((a, b) => a - b)

            if (issuePositions.length < 2) return null

            // Draw connecting line
            return (
              <path
                key={pl.id}
                d={generatePlotlinePath(issuePositions, series.issues.length)}
                stroke={pl.color}
                strokeWidth={3}
                fill="none"
                opacity={0.6}
              />
            )
          })}
        </svg>

        {/* Issue Cards */}
        <div className="grid grid-cols-8 gap-4 relative" style={{ zIndex: 1 }}>
          {series.issues
            .sort((a, b) => a.number - b.number)
            .map(issue => (
              <IssueCard
                key={issue.id}
                issue={issue}
                plotlines={series.plotlines}
                seriesId={series.id}
                isHighlighted={
                  !selectedPlotline ||
                  series.plotlines
                    .find(p => p.id === selectedPlotline)
                    ?.assignments.some(a => a.issue_id === issue.id)
                }
              />
            ))}
        </div>
      </div>

      {/* Series Acts Labels */}
      <div className="grid grid-cols-3 gap-4 text-center text-sm text-[var(--text-muted)]">
        <div className="border-t border-[var(--border)] pt-2">
          ACT 1: BEGINNING
          <br />
          <span className="text-xs">Issues {beginning.map(i => i.number).join(', ') || '—'}</span>
        </div>
        <div className="border-t border-[var(--border)] pt-2">
          ACT 2: MIDDLE
          <br />
          <span className="text-xs">Issues {middle.map(i => i.number).join(', ') || '—'}</span>
        </div>
        <div className="border-t border-[var(--border)] pt-2">
          ACT 3: END
          <br />
          <span className="text-xs">Issues {end.map(i => i.number).join(', ') || '—'}</span>
        </div>
      </div>
    </div>
  )
}

function IssueCard({
  issue,
  plotlines,
  seriesId,
  isHighlighted
}: {
  issue: Issue
  plotlines: Plotline[]
  seriesId: string
  isHighlighted: boolean
}) {
  const relevantPlotlines = plotlines.filter(pl =>
    pl.assignments.some(a => a.issue_id === issue.id)
  )

  const statusColors = {
    'OUTLINE': 'bg-gray-500',
    'DRAFTING': 'bg-yellow-500',
    'REVISION': 'bg-blue-500',
    'COMPLETE': 'bg-green-500',
  }

  return (
    <Link
      href={`/series/${seriesId}/issues/${issue.id}`}
      className={`block p-3 rounded-lg border transition-all ${
        isHighlighted
          ? 'bg-[var(--bg-secondary)] border-[var(--border)] hover:border-[var(--text-secondary)]'
          : 'bg-[var(--bg-secondary)]/30 border-transparent opacity-40'
      }`}
    >
      {/* Issue Number & Status */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl font-bold">#{issue.number}</span>
        <div
          className={`w-2 h-2 rounded-full ${statusColors[issue.status as keyof typeof statusColors] || 'bg-gray-500'}`}
          title={issue.status}
        />
      </div>

      {/* Title */}
      <h3 className="font-medium text-sm truncate mb-1">
        {issue.title || 'Untitled'}
      </h3>

      {/* Summary */}
      <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-2">
        {issue.summary || 'No summary yet'}
      </p>

      {/* Plotline indicators */}
      <div className="flex gap-1 flex-wrap">
        {relevantPlotlines.map(pl => {
          const assignment = pl.assignments.find(a => a.issue_id === issue.id)
          return (
            <div
              key={pl.id}
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
              style={{ backgroundColor: pl.color }}
              title={`${pl.name}${assignment?.first_appearance ? ' (First Appearance)' : ''}${assignment?.climax_issue ? ' (Climax)' : ''}${assignment?.resolution_issue ? ' (Resolution)' : ''}`}
            >
              {assignment?.first_appearance && '→'}
              {assignment?.climax_issue && '▲'}
              {assignment?.resolution_issue && '✓'}
            </div>
          )
        })}
      </div>
    </Link>
  )
}

function generatePlotlinePath(positions: number[], totalIssues: number): string {
  // Generate an SVG path connecting issue cards
  const cardWidth = 120
  const gap = 16
  const rowHeight = 200

  const points = positions.map(pos => ({
    x: pos * (cardWidth + gap) + cardWidth / 2,
    y: rowHeight / 2
  }))

  if (points.length < 2) return ''

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const midX = (prev.x + curr.x) / 2
    d += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`
  }

  return d
}
```

### Afternoon: Plotline Management at Series Level

**Task: Allow creating/editing plotlines with issue assignments**

- Create plotline management UI at series level
- Allow marking which issues each plotline appears in
- Mark first appearance, climax, resolution for each plotline

**Deliverables:**
- [ ] `/series/[seriesId]/outline` page
- [ ] SeriesOutline component with visual timeline
- [ ] Plotline ribbons connecting across issues
- [ ] Issue card quick-view
- [ ] Plotline management modal

---

## Day 4: Drafting Flow Improvements

### Morning: Previous Page Context

**Task: Add collapsible previous page summary to PageEditor**

```typescript
// File: src/app/series/[seriesId]/issues/[issueId]/PreviousPageContext.tsx

'use client'

import { useState } from 'react'

interface PreviousPageContextProps {
  previousPage: {
    page_number: number
    story_beat: string | null
    panels: {
      panel_number: number
      visual_description: string | null
      dialogue_blocks: { speaker_name: string | null; text: string | null }[]
    }[]
  } | null
}

export default function PreviousPageContext({ previousPage }: PreviousPageContextProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!previousPage) return null

  const lastPanel = previousPage.panels[previousPage.panels.length - 1]
  const lastDialogue = lastPanel?.dialogue_blocks[lastPanel.dialogue_blocks.length - 1]

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span>
          ← Page {previousPage.page_number} ended with:
          {lastDialogue?.text && (
            <span className="ml-2 text-[var(--text-muted)] italic">
              "{lastDialogue.text.slice(0, 50)}..."
            </span>
          )}
        </span>
        <span className="text-xs">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2 max-h-48 overflow-y-auto">
          {previousPage.story_beat && (
            <p className="text-xs text-[var(--text-muted)] italic">
              Beat: {previousPage.story_beat}
            </p>
          )}

          {previousPage.panels.map(panel => (
            <div key={panel.panel_number} className="text-xs">
              <span className="font-medium">Panel {panel.panel_number}:</span>
              {panel.visual_description && (
                <span className="text-[var(--text-muted)] ml-1">
                  {panel.visual_description.slice(0, 100)}...
                </span>
              )}
              {panel.dialogue_blocks.map((d, i) => (
                <div key={i} className="ml-4 text-[var(--text-secondary)]">
                  {d.speaker_name}: "{d.text?.slice(0, 60)}..."
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Afternoon: Keyboard Navigation

**Task: Implement keyboard shortcuts in IssueEditor**

```typescript
// Add to IssueEditor.tsx keyboard handler

const keyboardShortcuts = {
  // Navigation
  'mod+ArrowUp': () => navigateToPreviousPage(),
  'mod+ArrowDown': () => navigateToNextPage(),
  'mod+shift+ArrowUp': () => navigateToPreviousScene(),
  'mod+shift+ArrowDown': () => navigateToNextScene(),

  // Panel operations
  'mod+d': () => addDialogueToCurrentPanel(),
  'mod+shift+d': () => addCaptionToCurrentPanel(),
  'mod+p': () => addPanelToCurrentPage(),
  'mod+shift+p': () => addPageToCurrentScene(),

  // Focus
  'Escape': () => blurCurrentField(),
  'Tab': (e) => moveToNextField(e),
  'shift+Tab': (e) => moveToPreviousField(e),
}

// Helper to navigate pages
const navigateToNextPage = useCallback(() => {
  const allPages = issue.acts
    .flatMap(a => a.scenes)
    .flatMap(s => s.pages)
    .sort((a, b) => {
      // Sort by act, then scene, then page
      return a.sort_order - b.sort_order
    })

  const currentIdx = allPages.findIndex(p => p.id === selectedPageId)
  if (currentIdx < allPages.length - 1) {
    setSelectedPageId(allPages[currentIdx + 1].id)
  }
}, [issue, selectedPageId])

const navigateToPreviousPage = useCallback(() => {
  const allPages = issue.acts
    .flatMap(a => a.scenes)
    .flatMap(s => s.pages)

  const currentIdx = allPages.findIndex(p => p.id === selectedPageId)
  if (currentIdx > 0) {
    setSelectedPageId(allPages[currentIdx - 1].id)
  }
}, [issue, selectedPageId])
```

**Task: Update KeyboardShortcutsModal with new shortcuts**

**Deliverables:**
- [ ] PreviousPageContext component
- [ ] Integrate into PageEditor
- [ ] Keyboard navigation (Cmd+↑/↓)
- [ ] Quick-add shortcuts (Cmd+D, Cmd+P)
- [ ] Updated shortcuts modal

---

## Day 5: Spread & Splash Support

### Morning: Page Type System

**Task: Add page type selector to PageEditor header**

```typescript
// Add to PageEditor.tsx

const pageTypes = [
  { value: 'SINGLE', label: 'Single', icon: '▢' },
  { value: 'SPLASH', label: 'Splash', icon: '◼' },
  { value: 'SPREAD_LEFT', label: 'Spread (Left)', icon: '◧' },
  { value: 'SPREAD_RIGHT', label: 'Spread (Right)', icon: '◨' },
]

// When setting SPREAD_LEFT, prompt to link to next page
// When setting SPREAD_RIGHT, prompt to link to previous page
```

**Task: Linked page handling in NavigationTree**

- When a spread is created, link two pages
- Moving one spread page moves both
- Deleting one warns about breaking the spread
- Visual indicator in tree showing linked pages

### Afternoon: Spread Handling in WeaveView

**Task: Update WeaveView to show spreads as single units**

```typescript
// In WeaveView, when iterating pages:
// If page is SPREAD_LEFT, render it with its linked page as one wide unit
// Skip SPREAD_RIGHT in iteration (it's rendered with its left partner)

const spreads = useMemo(() => {
  const result: SpreadUnit[] = []
  let i = 0

  while (i < flatPages.length) {
    const page = flatPages[i]

    if (page.page.page_type === 'SPREAD_LEFT' && page.page.linked_page_id) {
      // Find the linked right page
      const rightPage = flatPages.find(p => p.page.id === page.page.linked_page_id)
      if (rightPage) {
        result.push({
          type: 'spread',
          leftPage: page,
          rightPage: rightPage,
        })
        // Skip the right page in next iteration
        i += 2
        continue
      }
    }

    if (page.page.page_type === 'SPLASH') {
      result.push({
        type: 'splash',
        page: page,
      })
    } else if (page.page.page_type !== 'SPREAD_RIGHT') {
      result.push({
        type: 'single',
        page: page,
      })
    }

    i++
  }

  return result
}, [flatPages])
```

**Deliverables:**
- [ ] Page type selector UI
- [ ] Spread linking logic
- [ ] WeaveView spread rendering
- [ ] Export handling for spreads (mark as "PAGES 12-13 (SPREAD)")
- [ ] Splash page indicator in exports

---

## Day 6: Version Comparison

### Morning: Diff Algorithm

**Task: Create version diff utility**

```typescript
// File: src/lib/versionDiff.ts

interface PageSnapshot {
  id: string
  page_number: number
  panels: {
    id: string
    panel_number: number
    visual_description: string | null
    dialogue_blocks: { text: string | null }[]
    captions: { text: string | null }[]
  }[]
}

interface DiffResult {
  pages: {
    pageNumber: number
    status: 'added' | 'removed' | 'modified' | 'unchanged'
    panels: {
      panelNumber: number
      status: 'added' | 'removed' | 'modified' | 'unchanged'
      changes: {
        field: string
        oldValue: string | null
        newValue: string | null
      }[]
    }[]
  }[]
}

export function compareVersions(
  oldSnapshot: { pages: PageSnapshot[] },
  newSnapshot: { pages: PageSnapshot[] }
): DiffResult {
  const result: DiffResult = { pages: [] }

  // Map pages by ID for comparison
  const oldPagesMap = new Map(oldSnapshot.pages.map(p => [p.id, p]))
  const newPagesMap = new Map(newSnapshot.pages.map(p => [p.id, p]))

  // Find all unique page IDs
  const allPageIds = new Set([
    ...oldSnapshot.pages.map(p => p.id),
    ...newSnapshot.pages.map(p => p.id)
  ])

  for (const pageId of allPageIds) {
    const oldPage = oldPagesMap.get(pageId)
    const newPage = newPagesMap.get(pageId)

    if (!oldPage && newPage) {
      // Page added
      result.pages.push({
        pageNumber: newPage.page_number,
        status: 'added',
        panels: newPage.panels.map(p => ({
          panelNumber: p.panel_number,
          status: 'added',
          changes: []
        }))
      })
    } else if (oldPage && !newPage) {
      // Page removed
      result.pages.push({
        pageNumber: oldPage.page_number,
        status: 'removed',
        panels: oldPage.panels.map(p => ({
          panelNumber: p.panel_number,
          status: 'removed',
          changes: []
        }))
      })
    } else if (oldPage && newPage) {
      // Compare pages
      const pageDiff = comparePanels(oldPage.panels, newPage.panels)
      const hasChanges = pageDiff.some(p => p.status !== 'unchanged')

      result.pages.push({
        pageNumber: newPage.page_number,
        status: hasChanges ? 'modified' : 'unchanged',
        panels: pageDiff
      })
    }
  }

  return result
}

function comparePanels(oldPanels: any[], newPanels: any[]) {
  // Similar logic for panel-level comparison
  // Compare visual_description, dialogue, captions
  // Return detailed changes
}
```

### Afternoon: Diff UI

**Task: Create VersionDiffView component**

```typescript
// File: src/app/series/[seriesId]/issues/[issueId]/history/VersionDiffView.tsx

'use client'

import { useState, useEffect } from 'react'
import { compareVersions, DiffResult } from '@/lib/versionDiff'

interface VersionDiffViewProps {
  issueId: string
  versions: {
    id: string
    created_at: string
    name: string | null
    snapshot_data: any
  }[]
}

export default function VersionDiffView({ issueId, versions }: VersionDiffViewProps) {
  const [leftVersion, setLeftVersion] = useState<string>(versions[1]?.id || '')
  const [rightVersion, setRightVersion] = useState<string>(versions[0]?.id || '')
  const [diff, setDiff] = useState<DiffResult | null>(null)

  useEffect(() => {
    if (leftVersion && rightVersion) {
      const left = versions.find(v => v.id === leftVersion)
      const right = versions.find(v => v.id === rightVersion)

      if (left && right) {
        setDiff(compareVersions(left.snapshot_data, right.snapshot_data))
      }
    }
  }, [leftVersion, rightVersion, versions])

  return (
    <div className="space-y-4">
      {/* Version Selectors */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-sm text-[var(--text-secondary)]">Compare from:</label>
          <select
            value={leftVersion}
            onChange={e => setLeftVersion(e.target.value)}
            className="w-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-3 py-2"
          >
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                {v.name || new Date(v.created_at).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm text-[var(--text-secondary)]">Compare to:</label>
          <select
            value={rightVersion}
            onChange={e => setRightVersion(e.target.value)}
            className="w-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-3 py-2"
          >
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                {v.name || new Date(v.created_at).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff Results */}
      {diff && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex gap-4 text-sm">
            <span className="text-green-400">
              + {diff.pages.filter(p => p.status === 'added').length} pages added
            </span>
            <span className="text-red-400">
              - {diff.pages.filter(p => p.status === 'removed').length} pages removed
            </span>
            <span className="text-yellow-400">
              ~ {diff.pages.filter(p => p.status === 'modified').length} pages modified
            </span>
          </div>

          {/* Page-by-page diff */}
          <div className="space-y-2">
            {diff.pages
              .filter(p => p.status !== 'unchanged')
              .map(page => (
                <DiffPageCard key={page.pageNumber} page={page} />
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DiffPageCard({ page }: { page: DiffResult['pages'][0] }) {
  const [expanded, setExpanded] = useState(false)

  const statusColors = {
    added: 'border-green-500 bg-green-500/10',
    removed: 'border-red-500 bg-red-500/10',
    modified: 'border-yellow-500 bg-yellow-500/10',
    unchanged: 'border-[var(--border)]',
  }

  return (
    <div className={`border rounded-lg ${statusColors[page.status]}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-between"
      >
        <span className="font-medium">
          Page {page.pageNumber}
          <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
            ({page.status})
          </span>
        </span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {page.panels.map(panel => (
            <div key={panel.panelNumber} className="text-sm">
              <span className="font-medium">Panel {panel.panelNumber}</span>
              {panel.changes.map((change, i) => (
                <div key={i} className="ml-4 text-xs">
                  <span className="text-[var(--text-muted)]">{change.field}:</span>
                  {change.oldValue && (
                    <span className="text-red-400 line-through ml-2">
                      {change.oldValue.slice(0, 50)}...
                    </span>
                  )}
                  {change.newValue && (
                    <span className="text-green-400 ml-2">
                      {change.newValue.slice(0, 50)}...
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Deliverables:**
- [ ] Version diff algorithm
- [ ] VersionDiffView component
- [ ] Integrate into history page
- [ ] Highlight changes at panel level
- [ ] Side-by-side text comparison option

---

## Day 7: Polish & Integration

### Morning: In-Editor AI Sidebar

**Task: Make Guided Mode accessible without navigation**

```typescript
// Add to IssueEditor.tsx Toolkit

// Replace AI tab content with embedded GuidedMode-lite
// Key differences from full GuidedMode:
// 1. No session picker (auto-creates/resumes issue-level session)
// 2. Aware of current page/panel selection
// 3. Can inject suggestions directly into current panel
// 4. Floating button to expand to full page if needed

interface InEditorAIProps {
  issue: Issue
  selectedPageContext: PageContext | null
  onInjectSuggestion: (field: string, value: string) => void
}

function InEditorAI({ issue, selectedPageContext, onInjectSuggestion }: InEditorAIProps) {
  // Simplified chat interface
  // Auto-includes current panel context in each message
  // Has "Apply to panel" button on AI suggestions
}
```

### Afternoon: Bug Fixes & Testing

**Task: Test all new features end-to-end**

Testing checklist:
- [ ] Image upload works for characters, locations, series
- [ ] Images display in Toolkit Visuals tab
- [ ] Series Outline shows all issues with plotline ribbons
- [ ] Plotline assignments work across issues
- [ ] Previous page context shows correctly
- [ ] Keyboard navigation works (Cmd+↑/↓)
- [ ] Page types can be set (single, splash, spread)
- [ ] Spreads link correctly and move together in WeaveView
- [ ] Version diff shows accurate changes
- [ ] In-editor AI responds to context

**Task: Performance optimization**

- Lazy load images
- Memoize expensive computations
- Add loading states for all async operations

**Task: Update keyboard shortcuts modal with all new shortcuts**

---

## Database Migration Summary

Run these migrations in order:

```bash
# Day 1
supabase migration create add_image_attachments
supabase migration create add_page_types
supabase migration create add_plotline_issue_assignments

# Apply migrations
supabase db push
```

**New Tables:**
- `image_attachments` - Polymorphic image storage
- `plotline_issue_assignments` - Track plotlines across issues

**Modified Tables:**
- `pages` - Added `page_type`, `linked_page_id`

---

## Dependencies to Add

```bash
npm install react-dropzone
```

---

## Success Criteria

By end of Day 7, Panel Flow should support:

| Feature | Status |
|---------|--------|
| Image attachments on characters/locations/series | ✅ |
| Series-level outline with plotline visualization | ✅ |
| Previous page context while drafting | ✅ |
| Keyboard navigation between pages | ✅ |
| Spread/splash page types | ✅ |
| Version comparison with diff view | ✅ |
| In-editor AI access | ✅ |

**This gets us from 70% → ~90%.**

The remaining 10% (full collaboration suite, voice capture, advanced AI features) would be a follow-up sprint.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Image storage costs | Set 5MB limit, compress on upload |
| SVG plotline rendering performance | Virtualize for >12 issues |
| Diff algorithm complexity | Start with page-level, drill down later |
| Spread linking edge cases | Add "unlink" action, graceful fallbacks |

---

## Post-Sprint Priorities

After this sprint, next priorities would be:

1. **Collaboration v1** - Share issue (read-only), basic comments
2. **Export presets** - Artist vs. Letterer vs. Editor formats
3. **AI pacing analysis** - "You have 4 dialogue-heavy pages in a row"
4. **Voice ideation** - Voice-to-text brainstorming capture

---

*Let's build the tool comic writers deserve.*
