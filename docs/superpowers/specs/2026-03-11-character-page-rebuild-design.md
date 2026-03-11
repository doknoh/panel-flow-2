# Character Page Rebuild — Design Spec

## Problem

The current character page is a long vertical scroll of horizontal rectangles sorted alphabetically. It provides no sense of character importance, no manuscript-derived stats, and the AI scan feature is broken — it queries `panels.characters_present` which either doesn't exist or is never populated (the code references it but the actual database column is missing from the panels table schema). Meanwhile, 245+ visual descriptions mention characters by name in plain text. Characters referenced by multiple names cannot be unified. The page is not a tool a writer returns to — it's a chore.

## Goal

Rebuild the character page as a **cast management dashboard** — a dense, information-rich grid of cards sorted by manuscript presence, with a slide-out detail panel, working AI scan, character merge/delete, and manuscript re-parse to discover unnamed characters. A page a writer actually uses mid-project.

---

## Page Architecture

Two-panel layout:

| Area | Content |
|------|---------|
| **Main: Card Grid** | Responsive grid of dense dashboard cards, filter bar, toolbar |
| **Right: Slide-Out Detail Panel** | Tabbed editor appearing when a card is clicked |

The grid is always visible. The detail panel overlays from the right when a character is selected, similar to the Toolkit panel in the issue editor.

---

## Card Grid

### Card Design (Dense Dashboard)

Each card (~300px wide, min-height with overflow handling for variable content) contains:

**Header row:**
- Character name (bold, prominent)
- Alias line below name (e.g., "aka Marshall Mathers, Eminem") — truncated with ellipsis if many
- Role badge: `PROTAGONIST` / `SUPPORTING` / `ANTAGONIST` / `RECURRING` / `MINOR` — clickable to change inline

**Stats row:**
- Panel mention count (primary stat, largest number)
- Dialogue line count
- Issue spread (e.g., "8/8 issues")

**Issue presence heatmap:**
- One small bar per issue, opacity-scaled by relative panel count in that issue
- Gives instant visual of where this character is heaviest

**Relationship tags:**
- Clickable pills linking to other characters (uniform styling — no ally/antagonist distinction since relationships are free-text)
- Derived from the character's `relationships` text field by extracting other character names that exist in the database

### Mini Cards

Characters with fewer than 5 panel mentions get a compact "mini card" — just name, role badge, and panel count on a single row. Prevents minor characters from wasting grid space. Clicking still opens the detail panel.

### Grid Layout

- Responsive: 4 cards at 1400px+, 3 at 1100px, 2 at 800px
- Sorted by panel mention count (descending) by default
- Secondary sort options in toolbar: alphabetical, role, issue spread, dialogue count

### Filter Bar

Top of grid, horizontal:
- **Role filter**: multi-select chips (protagonist / supporting / antagonist / recurring / minor)
- **Issue filter**: dropdown ("Show characters in Issue #3")
- **Plotline filter**: dropdown (via scene → plotline linkage)
- **Search**: text search across name + aliases
- **+ Add Character** button (right-aligned)

### Toolbar Actions

- **Scan Manuscript**: discover new character names (see Section: Manuscript Re-Parse)
- **Refresh Stats**: force recomputation of all stats from manuscript
- **Select mode toggle**: enables checkboxes for bulk merge/delete

---

## Slide-Out Detail Panel

Appears when a card is clicked. Stays open while browsing — clicking another card switches. Close button returns to grid-only view.

### Tab 1: Profile

Edit form with auto-save on blur. Field → column mapping:

- **Identity**: name (`name`), display_name (`display_name`), aliases (`aliases` — new, editable tag list), role (`role` — dropdown: protagonist/supporting/antagonist/recurring/minor)
- **Description**: `physical_description` (TipTap, notes variant) — the primary prose description used by AI tools and context assembler
- **Physical Details** (collapsible): age, eye_color, hair_color_style, height, build, skin_tone, distinguishing_marks, style_wardrobe — these columns already exist on the live characters table (added post-baseline via manual migration).
- **Background**: `background` (TipTap, notes variant) — character backstory
- **Personality**: `personality_traits` (text)
- **Speech**: `speech_patterns` (text)
- **Relationships**: `relationships` (text)
- **Arc**: `arc_notes` (text)
- **Reference Images**: image uploader (existing ImageUploader component, up to 10)

Note: The live database has `background` (exists) but no `description` column — only `physical_description`. The `background` column stores character backstory. The `first_appearance` column also exists and can be shown read-only in the Appearances tab (superseded by computed data).

### Tab 2: Voice

Moved from the current separate `/characters/[characterId]/voice` page. Same content:

- **Trained Profile**: vocabulary level, avg sentence length, common/avoided words, tone markers, speech quirks, sample quotes, profile summary
- **Train/Retrain button**: requires 5+ dialogue samples
- **Dialogue Flags**: inconsistencies found by voice consistency checker, dismissable
- **Sample Dialogue**: browsable list of all character dialogue with issue/page context

**Data fetching**: Voice data (all dialogue across all issues with nested joins) is **lazy-loaded when the Voice tab is first clicked**, not on card open. A loading spinner shows during fetch. The current server-rendered page.tsx logic moves to a client-side API call. Training/consistency-check operations show progress indicators and remain active even if the panel is closed (results appear on next open).

### Tab 3: Appearances

Issue-by-issue breakdown computed from the stats engine:

- Each issue listed with panel count and dialogue count
- Expandable to show specific page numbers
- Page numbers are clickable links → navigate to that page in the issue editor
- Derived from text search (panel mentions) + FK linkage (dialogue)

### Tab 4: AI Scan

The fixed character scan:

- **Scan button**: triggers API call that text-searches `visual_description` for character name + all aliases
- Shows count: "Based on X description(s) and Y dialogue(s)"
- Displays suggested attributes with checkboxes (pre-selected where current value is empty)
- **Apply Selected** button saves chosen suggestions
- **Rescan** button re-runs the analysis

---

## Cast Management Actions

### Merge Characters

1. Enter select mode (toolbar toggle) → check 2+ character cards
2. Click "Merge" button (appears when 2+ selected)
3. Modal: choose **primary character** (keeps name, profile, description)
4. Absorbed characters' names become aliases on the primary
5. All dialogue blocks from absorbed characters get `character_id` reassigned to primary
6. Voice profiles from absorbed characters are deleted (primary's profile retained or retrained)
7. Stats cache recomputes to include all name variants
8. Absorbed character rows deleted from `characters` table
9. Undo: toast notification with time-limited "Undo" button (10 seconds). Undo restores absorbed characters from stored snapshot. This is NOT the Cmd+Z undo stack (which is issue-editor scoped) — it's a toast-based undo specific to this page.

### Delete Characters

- Delete button on card hover and in detail panel
- Confirmation dialog showing impact: "Delete WORKER? This character has 4 dialogue lines that will lose their speaker link."
- On delete: `dialogue_blocks.character_id` set to null (keeps `speaker_name` text intact so script doesn't break)
- Bulk delete: select mode → check multiple → "Delete Selected"
- Undo: same toast-based "Undo" button (10 seconds) that restores from stored snapshot

### Manuscript Re-Parse

Discover character names that don't have cards yet:

1. "Scan Manuscript" button in toolbar
2. AI-powered scan of ALL `visual_description` text across the series
3. Extracts ALL CAPS names (comic script convention) using pattern matching + AI disambiguation
4. Cross-references against existing character names and aliases
5. Presents list of **unrecognized names** with:
   - Name as found in text
   - Frequency count (how many panels)
   - Context snippets (first 2-3 appearances)
6. Per name, three actions:
   - **Create Character** — makes a new character card with this as the name
   - **Add as Alias** — dropdown to pick existing character, adds as alias
   - **Ignore** — dismisses this name, won't resurface on future scans
7. Ignored names stored in `dismissed_character_names` table

---

## Alias System

Every character has an `aliases` text array. This is the backbone of the stats engine and AI scan.

- **Stats computation**: searches `visual_description ~* '\mNAME\M'` (Postgres word-boundary regex) for the primary name AND each alias, deduplicating panels that match multiple variants. Word boundaries prevent false positives (e.g., "AL" won't match "WALL" or "ALSO"). Special regex characters in names are escaped.
- **AI scan**: sends all name variants to Claude for attribute extraction
- **Manuscript re-parse**: checks new names against all existing names + aliases
- **Auto-capitalize**: the existing auto-format system applies to aliases too
- **Merge flow**: absorbed character names automatically become aliases
- **Editable**: aliases are a tag list in the Profile tab — add/remove freely

---

## Stats Engine (Hybrid Cache)

### Computation

For each character in the series:

1. **Panel mentions**: `SELECT COUNT(DISTINCT p.id) FROM panels p JOIN pages pg ON ... JOIN scenes s ON ... JOIN acts a ON ... JOIN issues i ON ... WHERE i.series_id = $1 AND (visual_description ~* '\mname1\M' OR visual_description ~* '\mname2\M' OR ...)` — word-boundary regex prevents false positives (e.g., "AL" won't match "WALL")
2. **Dialogue count**: `SELECT COUNT(*) FROM dialogue_blocks WHERE character_id = $characterId`
3. **Issue breakdown**: group panel mentions and dialogue by issue_id → JSONB object `{issue_id: {panels: N, dialogues: N}}`
4. **Scene list**: collect distinct scene_ids from matched panels

### Caching

- **Table**: `character_stats_cache` — one row per character
- **Staleness check**: on page load (in `page.tsx` server component), compare `computed_at` against `MAX(panels.updated_at)` for the series. If stale, serve cached data immediately and fire a non-blocking `fetch()` to a new `/api/characters/stats/recompute` route that recomputes in the background. This means the page loads instantly with slightly-stale data, then updates on next visit.
- **Manual refresh**: "Refresh Stats" button forces synchronous full recomputation and updates the UI
- **Granularity**: entire series recomputed at once (single batch query more efficient than per-character)
- **Invalidation events**: cache is also invalidated when characters are merged, deleted, or aliases are modified (these operations trigger immediate recomputation for affected characters)

### Performance

- Batch query: single SQL query with `GROUP BY character match` rather than N individual queries
- Use Postgres word-boundary regex (`~*`) for name matching — prevents false positives while remaining case-insensitive
- For series with many characters, the batch query avoids N+1
- Cache means subsequent page loads are instant until next edit

---

## Database Changes

### Modify: `characters` table

The live database is missing `role`, `personality_traits`, and `aliases`. Physical detail columns (age, eye_color, etc.) already exist.

```sql
ALTER TABLE characters ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS personality_traits TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
```

### New: `character_stats_cache` table

```sql
CREATE TABLE character_stats_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  total_panels INTEGER DEFAULT 0,
  total_dialogues INTEGER DEFAULT 0,
  issue_breakdown JSONB DEFAULT '{}',
  scene_ids JSONB DEFAULT '[]',
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(character_id)
);
```

### New: `dismissed_character_names` table

```sql
CREATE TABLE dismissed_character_names (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(series_id, name)
);
```

### RLS Policies

Both new tables require RLS enabled with policies matching the existing collaboration pattern (separate policies per operation):

```sql
-- character_stats_cache
ALTER TABLE character_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stats for series they can access"
  ON character_stats_cache FOR SELECT
  USING (user_can_view_series(series_id));

CREATE POLICY "Users can insert stats for series they can edit"
  ON character_stats_cache FOR INSERT
  WITH CHECK (user_can_edit_series(series_id));

CREATE POLICY "Users can update stats for series they can edit"
  ON character_stats_cache FOR UPDATE
  USING (user_can_edit_series(series_id));

CREATE POLICY "Users can delete stats for series they can edit"
  ON character_stats_cache FOR DELETE
  USING (user_can_edit_series(series_id));

-- dismissed_character_names
ALTER TABLE dismissed_character_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dismissed names for series they can access"
  ON dismissed_character_names FOR SELECT
  USING (user_can_view_series(series_id));

CREATE POLICY "Users can insert dismissed names for series they can edit"
  ON dismissed_character_names FOR INSERT
  WITH CHECK (user_can_edit_series(series_id));

CREATE POLICY "Users can delete dismissed names for series they can edit"
  ON dismissed_character_names FOR DELETE
  USING (user_can_edit_series(series_id));
```

### Remove route

- `/series/[seriesId]/characters/[characterId]/voice` — voice profile moves into the slide-out detail panel

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/app/series/[seriesId]/characters/CharacterGrid.tsx` | Card grid with filtering, sorting, select mode |
| `src/app/series/[seriesId]/characters/CharacterCard.tsx` | Individual dense dashboard card |
| `src/app/series/[seriesId]/characters/CharacterMiniCard.tsx` | Compact card for minor characters (<5 mentions) |
| `src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx` | Slide-out panel with 4 tabs |
| `src/app/series/[seriesId]/characters/MergeModal.tsx` | Character merge workflow modal |
| `src/app/series/[seriesId]/characters/ManuscriptScanModal.tsx` | Re-parse results with create/alias/ignore actions |
| `src/lib/character-stats.ts` | Stats computation engine (text search queries, caching logic) |
| `src/app/api/ai/manuscript-scan/route.ts` | API for manuscript re-parse (discover new names) |
| `src/app/api/characters/[characterId]/voice/route.ts` | API for lazy-loaded voice tab data (dialogue, profile, flags) |
| `src/app/api/characters/stats/recompute/route.ts` | API for async background stats recomputation |

### Modified Files

| File | Change |
|------|--------|
| `src/app/series/[seriesId]/characters/page.tsx` | Fetch stats cache, pass to new CharacterGrid |
| `src/app/api/ai/character-scan/route.ts` | Rewrite: text search via name + aliases instead of broken `characters_present` |
| `src/lib/auto-format.ts` | Include aliases in auto-capitalize matching |
| `src/lib/ai/context-assembler.ts` | Include aliases in character context sent to AI (name + aka variants) |

### Removed Files

| File | Reason |
|------|--------|
| `src/app/series/[seriesId]/characters/CharacterList.tsx` | Replaced by CharacterGrid + CharacterCard + CharacterDetailPanel |
| `src/app/series/[seriesId]/characters/[characterId]/voice/page.tsx` | Voice profile moves into detail panel |
| `src/app/series/[seriesId]/characters/[characterId]/voice/VoiceProfileClient.tsx` | Content absorbed into CharacterDetailPanel Voice tab |

---

## Key Decisions

1. **Sort by panel mentions** (text search count) as default — directly measures manuscript presence
2. **Hybrid cache** — compute on load if stale, cache for speed, manual refresh available
3. **Aliases are first-class** — every name variant stored, all search/stats/scan uses them
4. **Voice profile inlined** — no separate page, lives in detail panel Voice tab
5. **Mini cards for minor characters** — <5 panel mentions get compact treatment
6. **Merge is reversible** — absorbed character data stored for undo
7. **Manuscript re-parse uses AI** — pattern matching + Claude disambiguation for ALL CAPS names
8. **Delete preserves script** — `character_id` nulled but `speaker_name` text kept intact
