# Day 3 Setup Guide: Series Architecture View

This guide documents Day 3 of the Panel Flow development roadmap - the Series Architecture timeline view.

---

## What Was Created

### 1. Series Timeline Component

```
src/app/series/[seriesId]/outline/SeriesTimeline.tsx
```

A horizontal visual timeline showing:
- Issue cards grouped by series arc (Beginning/Middle/End)
- Plotline filter selector
- Plotline ribbon visualization connecting issues
- Plotline assignment management (add/remove plotlines to issues)
- Assignment markers (First Appearance, Climax, Resolution)
- Issue status color coding
- Quick links to edit each issue

### 2. Outline Page Client Wrapper

```
src/app/series/[seriesId]/outline/OutlinePageClient.tsx
```

A client component that provides:
- View toggle between Timeline View and List View
- Stats summary (issues count, plotlines count)
- Refresh handling for data updates

### 3. Updated Server Page

```
src/app/series/[seriesId]/outline/page.tsx
```

Updated to:
- Fetch `plotline_issue_assignments` data
- Support wider max-width for timeline view
- Pass data to the client wrapper

### 4. Series Page Enhancement

```
src/app/series/[seriesId]/page.tsx
```

- Series Outline link now has gradient styling to highlight this feature
- Updated description to mention Timeline view & plotline tracking

---

## Features

### Timeline View

The Timeline View shows issues in a horizontal layout organized by where they fall in the series arc:

- **Beginning (Act 1)**: Setup issues
- **Middle (Act 2)**: Rising action issues
- **End (Act 3)**: Climax and resolution issues
- **Unassigned**: Issues not yet placed in the series arc

### Plotline Tracking

Writers can track which plotlines appear in which issues:

1. **Click a plotline** in the filter bar to select it
2. **Click plotline dots** on issue cards to add/remove that plotline
3. **Click any dot** to open the assignment editor modal

### Assignment Markers

Each plotline-issue assignment can be marked with:
- **First Appearance**: Where this plotline is introduced
- **Climax Issue**: Where this plotline reaches its peak
- **Resolution Issue**: Where this plotline is resolved

### Plotline Ribbons

When a plotline is selected, a visual ribbon shows which issues it spans, with markers at each appearance.

### List View

The existing List View is still available with:
- Expandable issue cards
- AI summary generation
- Act/scene structure view
- Series notes editing

---

## How Writers Use It

### Planning a New Series

1. Go to **Series Outline** from the series page
2. Click **Timeline View**
3. See all issues organized by series arc
4. Assign issues to Beginning/Middle/End via issue editor
5. Create plotlines on the **Plotlines** page
6. Return to outline and track plotlines across issues

### Tracking Plotlines

1. In Timeline View, click a plotline to select it
2. See where it currently appears (solid dots)
3. Click dots on other issues to add the plotline
4. Open assignment editor to mark First/Climax/Resolution

### Reviewing Structure

1. Switch between Timeline and List views
2. Timeline for visual overview
3. List for detailed act/scene breakdown
4. AI summaries in List view help document the story

---

## Database Requirements

Day 3 uses the `plotline_issue_assignments` table created in Day 1:

```sql
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
```

---

## Files Summary

```
New files:
├── src/app/series/[seriesId]/outline/SeriesTimeline.tsx
├── src/app/series/[seriesId]/outline/OutlinePageClient.tsx
└── DAY3_SETUP_GUIDE.md

Modified files:
├── src/app/series/[seriesId]/outline/page.tsx
└── src/app/series/[seriesId]/page.tsx
```

---

## Next Steps (Day 4)

Day 4 focuses on **Drafting Flow**:
1. Draft mode indicators
2. Draft history/versioning
3. Export functionality
4. Print-ready formatting

---

**Day 3 Complete! 🎉**

Writers can now visualize their entire series structure, track plotlines across issues, and plan the narrative arc at a high level.
