# Global Font Scale Toggle

**Date:** 2026-03-15

## Problem

The font size toggle (small/medium/large) only appears in the IssueEditor toolbar. The underlying system is already global — `FontScaleProvider` wraps the entire app, `--font-scale` CSS variable is on the document root, and all typography scales with it. But users can only access the toggle from one page.

## Solution

Move the `FontScaleToggle` into the universal `Header` component so it's available on every page. Remove the duplicate from IssueEditor. Add it to custom headers (weave views) that bypass the universal Header.

## Changes

### 1. `src/components/ui/Header.tsx`
- Import `FontScaleToggle`
- Render it immediately left of `ThemeToggle` in the right-hand controls

### 2. `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`
- Remove `FontScaleToggle` import and usage from the editor toolbar (no longer needed — Header provides it)

### 3. `src/app/series/[seriesId]/issues/[issueId]/weave/components/WeaveHeader.tsx`
- Add `FontScaleToggle` to the header controls (this component has its own custom header, not the universal one)

### 4. `src/app/series/[seriesId]/weave/SeriesWeaveClient.tsx`
- Add `FontScaleToggle` to the header area (same reason — custom header)

## What doesn't change

- `FontScaleProvider`, `FontScaleContext`, `font-scale.ts` — untouched
- `globals.css` — untouched, already scales via `--font-scale`
- `FontScaleToggle` component — untouched, same cycle behavior (small → medium → large)
