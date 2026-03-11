# Character Page Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the character page as a cast management dashboard with dense card grid, slide-out detail panel, stats engine, alias system, merge/delete workflows, and manuscript re-parse.

**Architecture:** Replace the current CharacterList with a decomposed component tree (CharacterGrid → CharacterCard/MiniCard + CharacterDetailPanel). A new `character-stats.ts` library handles text-search-based stats with a Postgres cache table. API routes handle AI scan (rewritten), voice data (lazy-loaded), stats recompute, and manuscript re-parse. Toast context is extended with action buttons for undo on merge/delete.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Supabase (PostgreSQL), TipTap, Vitest, Anthropic Claude API

**Spec:** `docs/superpowers/specs/2026-03-11-character-page-rebuild-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/character-stats.ts` | Stats computation engine: text search queries, batch computation, cache read/write/invalidation |
| `src/lib/character-stats.test.ts` | Unit tests for stats query builders and name escaping |
| `src/app/api/characters/stats/recompute/route.ts` | POST endpoint: triggers async stats recomputation for a series |
| `src/app/api/characters/[characterId]/voice/route.ts` | GET endpoint: lazy-loads voice tab data (dialogue, profile, flags) |
| `src/app/api/ai/manuscript-scan/route.ts` | POST endpoint: AI-powered manuscript re-parse to discover new character names |
| `src/app/series/[seriesId]/characters/CharacterGrid.tsx` | Card grid with filter bar, toolbar, sort controls, select mode |
| `src/app/series/[seriesId]/characters/CharacterCard.tsx` | Individual dense dashboard card (~300px) |
| `src/app/series/[seriesId]/characters/CharacterMiniCard.tsx` | Compact single-row card for minor characters (<5 mentions) |
| `src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx` | Slide-out panel shell with 4 tabs (Profile, Voice, Appearances, AI Scan) |
| `src/app/series/[seriesId]/characters/MergeModal.tsx` | Character merge workflow modal |
| `src/app/series/[seriesId]/characters/ManuscriptScanModal.tsx` | Re-parse results with create/alias/ignore actions |

### Modified Files

| File | Change |
|------|--------|
| `src/contexts/ToastContext.tsx` | Add `action` callback support to toasts (for Undo buttons) |
| `src/app/series/[seriesId]/characters/page.tsx` | Rewrite: fetch stats cache + characters, pass to CharacterGrid |
| `src/app/api/ai/character-scan/route.ts` | Rewrite: text search via name + aliases instead of broken `characters_present` |
| `src/lib/auto-format.ts` | Include aliases in character name matching |
| `src/lib/ai/context-assembler.ts` | Include aliases in character context sent to AI |
| `src/lib/rate-limit.ts` | Add rate limiters for new API endpoints |

### Removed Files

| File | Reason |
|------|--------|
| `src/app/series/[seriesId]/characters/CharacterList.tsx` | Replaced by CharacterGrid + CharacterCard + CharacterDetailPanel |
| `src/app/series/[seriesId]/characters/[characterId]/voice/page.tsx` | Voice profile moves into detail panel |
| `src/app/series/[seriesId]/characters/[characterId]/voice/VoiceProfileClient.tsx` | Content absorbed into CharacterDetailPanel Voice tab |

---

## Chunk 1: Foundation (Database + Types + Stats Engine)

### Task 1: Database Migration

Apply the schema changes needed for the character page rebuild.

**Files:**
- Create: Supabase migration (applied via MCP tool)

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP tool `apply_migration` with project_id `yzhpqhbfvdlolctgnteg`:

```sql
-- Add missing columns to characters table
ALTER TABLE characters ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS personality_traits TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

-- Stats cache table
CREATE TABLE IF NOT EXISTS character_stats_cache (
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

-- Dismissed character names table
CREATE TABLE IF NOT EXISTS dismissed_character_names (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(series_id, name)
);

-- RLS for character_stats_cache
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

-- RLS for dismissed_character_names
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

-- Index for stats cache lookups
CREATE INDEX IF NOT EXISTS idx_character_stats_cache_series
  ON character_stats_cache(series_id);

CREATE INDEX IF NOT EXISTS idx_dismissed_names_series
  ON dismissed_character_names(series_id);
```

- [ ] **Step 2: Verify migration**

Run `list_tables` via MCP with `schemas: ["public"], verbose: true` and confirm:
- `character_stats_cache` exists with correct columns
- `dismissed_character_names` exists with correct columns
- `characters` table has `role`, `personality_traits`, and `aliases` columns

- [ ] **Step 3: Check security advisors**

Run `get_advisors` with type `security` to confirm RLS is properly configured on new tables.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: apply character page rebuild migration"
```

---

### Task 2: Character Stats Engine — Test + Implementation

Build the library that computes character statistics from manuscript text using word-boundary regex.

**Files:**
- Create: `src/lib/character-stats.ts`
- Create: `src/lib/character-stats.test.ts`

- [ ] **Step 1: Write failing tests for name escaping and query building**

Create `src/lib/character-stats.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { escapeRegexForPostgres, buildNameMatchCondition } from './character-stats'

describe('character-stats', () => {
  describe('escapeRegexForPostgres', () => {
    test('escapes dots in names', () => {
      expect(escapeRegexForPostgres('J.J.')).toBe('J\\.J\\.')
    })

    test('escapes parentheses', () => {
      expect(escapeRegexForPostgres('Name (Jr.)')).toBe('Name \\(Jr\\.\\)')
    })

    test('passes through simple names unchanged', () => {
      expect(escapeRegexForPostgres('MARSHALL')).toBe('MARSHALL')
    })

    test('escapes apostrophes', () => {
      expect(escapeRegexForPostgres("O'BRIEN")).toBe("O\\'BRIEN")
    })

    test('escapes brackets', () => {
      expect(escapeRegexForPostgres('Name [III]')).toBe('Name \\[III\\]')
    })
  })

  describe('buildNameMatchCondition', () => {
    test('builds single name condition', () => {
      const result = buildNameMatchCondition('MARSHALL', [])
      expect(result).toContain("visual_description ~* '\\mMARSHALL\\M'")
    })

    test('builds condition with aliases', () => {
      const result = buildNameMatchCondition('MARSHALL', ['MARSH', 'MARSHALL MATHERS'])
      expect(result).toContain("visual_description ~* '\\mMARSHALL\\M'")
      expect(result).toContain("visual_description ~* '\\mMARSH\\M'")
      expect(result).toContain("visual_description ~* '\\mMARSHALL MATHERS\\M'")
      expect(result).toContain(' OR ')
    })

    test('escapes special characters in names', () => {
      const result = buildNameMatchCondition("O'BRIEN", [])
      expect(result).toContain("\\'")
    })

    test('handles empty aliases array', () => {
      const result = buildNameMatchCondition('KEN', [])
      expect(result).toBe("(visual_description ~* '\\mKEN\\M')")
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/character-stats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the stats engine**

Create `src/lib/character-stats.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js'

// --- Types ---

export interface CharacterStats {
  characterId: string
  totalPanels: number
  totalDialogues: number
  issueBreakdown: Record<string, { panels: number; dialogues: number }>
  sceneIds: string[]
  computedAt: string
}

export interface CharacterWithStats {
  id: string
  name: string
  display_name: string | null
  role: string | null
  aliases: string[]
  physical_description: string | null
  background: string | null
  personality_traits: string | null
  speech_patterns: string | null
  relationships: string | null
  arc_notes: string | null
  age: string | null
  eye_color: string | null
  hair_color_style: string | null
  height: string | null
  build: string | null
  skin_tone: string | null
  distinguishing_marks: string | null
  style_wardrobe: string | null
  first_appearance: string | null
  color: string | null
  created_at: string
  updated_at: string
  stats: CharacterStats | null
}

interface StatsRow {
  id: string
  character_id: string
  series_id: string
  total_panels: number
  total_dialogues: number
  issue_breakdown: Record<string, { panels: number; dialogues: number }>
  scene_ids: string[]
  computed_at: string
}

// --- Regex Helpers ---

const POSTGRES_REGEX_CHARS = /[.*+?^${}()|[\]\\'/]/g

export function escapeRegexForPostgres(name: string): string {
  return name.replace(POSTGRES_REGEX_CHARS, '\\$&')
}

export function buildNameMatchCondition(
  primaryName: string,
  aliases: string[]
): string {
  const allNames = [primaryName, ...aliases]
  const conditions = allNames.map(name => {
    const escaped = escapeRegexForPostgres(name)
    return `visual_description ~* '\\m${escaped}\\M'`
  })
  return `(${conditions.join(' OR ')})`
}

// --- Stats Computation ---

/**
 * Compute stats for ALL characters in a series using batch queries.
 * Returns a map of characterId → CharacterStats.
 */
export async function computeAllCharacterStats(
  supabase: SupabaseClient,
  seriesId: string,
  characters: Array<{ id: string; name: string; aliases: string[] }>
): Promise<Map<string, CharacterStats>> {
  const results = new Map<string, CharacterStats>()

  if (characters.length === 0) return results

  // 1. Batch panel mentions via RPC or raw SQL
  // We build a single query that counts panels per character using text matching
  // Each character gets: COUNT of distinct panels where name or alias appears
  for (const char of characters) {
    const allNames = [char.name, ...(char.aliases || [])]
    const conditions = allNames
      .map(name => {
        const escaped = escapeRegexForPostgres(name)
        return `p.visual_description ~* '\\m${escaped}\\M'`
      })
      .join(' OR ')

    // Panel mentions grouped by issue
    const { data: panelData } = await supabase.rpc('execute_sql_readonly', {
      query: `
        SELECT i.id as issue_id, COUNT(DISTINCT p.id) as panel_count,
               array_agg(DISTINCT s.id) as scene_ids
        FROM panels p
        JOIN pages pg ON pg.id = p.page_id
        JOIN scenes s ON s.id = pg.scene_id
        JOIN acts a ON a.id = s.act_id
        JOIN issues i ON i.id = a.issue_id
        WHERE i.series_id = '${seriesId}'
          AND (${conditions})
        GROUP BY i.id
      `
    }).catch(() => ({ data: null }))

    // Dialogue count grouped by issue
    const { data: dialogueData } = await supabase
      .from('dialogue_blocks')
      .select('id, panel:panel_id(page:page_id(scene:scene_id(act:act_id(issue:issue_id(id)))))')
      .eq('character_id', char.id)

    // Build issue breakdown
    const issueBreakdown: Record<string, { panels: number; dialogues: number }> = {}
    const sceneIdSet = new Set<string>()
    let totalPanels = 0
    let totalDialogues = 0

    if (panelData && Array.isArray(panelData)) {
      for (const row of panelData) {
        const issueId = row.issue_id
        if (!issueBreakdown[issueId]) {
          issueBreakdown[issueId] = { panels: 0, dialogues: 0 }
        }
        issueBreakdown[issueId].panels = Number(row.panel_count)
        totalPanels += Number(row.panel_count)
        if (row.scene_ids && Array.isArray(row.scene_ids)) {
          row.scene_ids.forEach((sid: string) => sceneIdSet.add(sid))
        }
      }
    }

    // Count dialogues per issue
    if (dialogueData && Array.isArray(dialogueData)) {
      totalDialogues = dialogueData.length
      for (const d of dialogueData) {
        // Navigate nested joins to find issue_id
        const issueId = (d as any)?.panel?.page?.scene?.act?.issue?.id
        if (issueId) {
          if (!issueBreakdown[issueId]) {
            issueBreakdown[issueId] = { panels: 0, dialogues: 0 }
          }
          issueBreakdown[issueId].dialogues += 1
        }
      }
    }

    results.set(char.id, {
      characterId: char.id,
      totalPanels,
      totalDialogues,
      issueBreakdown,
      sceneIds: Array.from(sceneIdSet),
      computedAt: new Date().toISOString(),
    })
  }

  return results
}

// --- Cache Operations ---

export async function getCachedStats(
  supabase: SupabaseClient,
  seriesId: string
): Promise<Map<string, CharacterStats>> {
  const { data } = await supabase
    .from('character_stats_cache')
    .select('*')
    .eq('series_id', seriesId)

  const results = new Map<string, CharacterStats>()
  if (data) {
    for (const row of data as StatsRow[]) {
      results.set(row.character_id, {
        characterId: row.character_id,
        totalPanels: row.total_panels,
        totalDialogues: row.total_dialogues,
        issueBreakdown: row.issue_breakdown || {},
        sceneIds: row.scene_ids || [],
        computedAt: row.computed_at,
      })
    }
  }
  return results
}

export async function isStatsCacheStale(
  supabase: SupabaseClient,
  seriesId: string
): Promise<boolean> {
  // Get oldest cache entry
  const { data: cacheData } = await supabase
    .from('character_stats_cache')
    .select('computed_at')
    .eq('series_id', seriesId)
    .order('computed_at', { ascending: true })
    .limit(1)
    .single()

  if (!cacheData) return true // No cache exists

  // Get latest panel update
  const { data: panelData } = await supabase.rpc('execute_sql_readonly', {
    query: `
      SELECT MAX(p.updated_at) as latest_update
      FROM panels p
      JOIN pages pg ON pg.id = p.page_id
      JOIN scenes s ON s.id = pg.scene_id
      JOIN acts a ON a.id = s.act_id
      JOIN issues i ON i.id = a.issue_id
      WHERE i.series_id = '${seriesId}'
    `
  }).catch(() => ({ data: null }))

  if (!panelData || !Array.isArray(panelData) || !panelData[0]?.latest_update) {
    return false // No panels, cache is fine
  }

  const cacheTime = new Date(cacheData.computed_at).getTime()
  const latestUpdate = new Date(panelData[0].latest_update).getTime()
  return latestUpdate > cacheTime
}

export async function writeStatsCache(
  supabase: SupabaseClient,
  seriesId: string,
  stats: Map<string, CharacterStats>
): Promise<void> {
  // Delete existing cache for this series
  await supabase
    .from('character_stats_cache')
    .delete()
    .eq('series_id', seriesId)

  // Insert new cache rows
  const rows = Array.from(stats.values()).map(s => ({
    character_id: s.characterId,
    series_id: seriesId,
    total_panels: s.totalPanels,
    total_dialogues: s.totalDialogues,
    issue_breakdown: s.issueBreakdown,
    scene_ids: s.sceneIds,
    computed_at: s.computedAt,
  }))

  if (rows.length > 0) {
    await supabase.from('character_stats_cache').insert(rows)
  }
}

// --- Relationship Extraction ---

/**
 * Extract relationship references from a character's `relationships` text field.
 * Returns character IDs of referenced characters whose names appear in the text.
 */
export function extractRelationshipRefs(
  relationshipsText: string | null,
  allCharacters: Array<{ id: string; name: string; display_name: string | null; aliases: string[] }>
): string[] {
  if (!relationshipsText) return []

  const refs: string[] = []
  for (const char of allCharacters) {
    const namesToCheck = [
      char.display_name || char.name,
      char.name,
      ...(char.aliases || [])
    ]
    for (const name of namesToCheck) {
      if (name && relationshipsText.toLowerCase().includes(name.toLowerCase())) {
        refs.push(char.id)
        break // Only add once per character
      }
    }
  }
  return refs
}
```

**Note:** The `execute_sql_readonly` RPC function may not exist. If it doesn't, the implementation should fall back to using Supabase's built-in query builder with nested joins, similar to how the existing codebase handles panel queries. The exact query approach should be validated against the live database during implementation — if RPC isn't available, use the Supabase `execute_sql` MCP tool pattern with raw SQL or restructure as chained Supabase queries.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/character-stats.test.ts`
Expected: PASS (the pure functions `escapeRegexForPostgres` and `buildNameMatchCondition` should pass)

- [ ] **Step 5: Commit**

```bash
git add src/lib/character-stats.ts src/lib/character-stats.test.ts
git commit -m "feat: add character stats engine with text search and caching"
```

---

### Task 3: Extend Toast Context with Action Buttons

The spec requires undo toasts for merge/delete. The current toast only shows a message string. Add optional action button support.

**Files:**
- Modify: `src/contexts/ToastContext.tsx`

- [ ] **Step 1: Read the current ToastContext**

Read `src/contexts/ToastContext.tsx` to confirm current state.

- [ ] **Step 2: Extend the Toast interface and showToast signature**

Add an optional `action` prop with `label` and `onClick`:

```typescript
// In the Toast interface, add:
action?: { label: string; onClick: () => void }

// Extend ToastContextType.showToast:
showToast: (message: string, type?: ToastType, options?: { action?: { label: string; onClick: () => void }; duration?: number }) => void
```

Modify `showToast` implementation:
- Accept optional `options` parameter
- If `options.action` is provided, store it on the toast
- If `options.duration` is provided, use it instead of default 4000ms (undo needs 10000ms)

Modify `ToastContainer` rendering:
- If `toast.action` exists, render a button alongside the message:

```tsx
{toast.action && (
  <button
    onClick={() => {
      toast.action!.onClick()
      onDismiss(toast.id)
    }}
    className="text-sm font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
  >
    {toast.action.label}
  </button>
)}
```

- [ ] **Step 3: Verify existing toast usage still works**

Run: `npm run build`
Expected: No type errors. The new parameters are optional, so existing callers are unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/ToastContext.tsx
git commit -m "feat: extend toast context with action buttons and custom duration"
```

---

### Task 4: Add Rate Limiters for New Endpoints

**Files:**
- Modify: `src/lib/rate-limit.ts`

- [ ] **Step 1: Read the current rate-limit.ts**

Read `src/lib/rate-limit.ts` to see existing limiter definitions.

- [ ] **Step 2: Add new rate limiters**

Add these to the `rateLimiters` export object:

```typescript
manuscriptScan: (userId: string) => checkRateLimit(`manuscript-scan:${userId}`, { maxRequests: 3, windowMs: 60000 }),
statsRecompute: (userId: string) => checkRateLimit(`stats-recompute:${userId}`, { maxRequests: 10, windowMs: 60000 }),
voiceData: (userId: string) => checkRateLimit(`voice-data:${userId}`, { maxRequests: 30, windowMs: 60000 }),
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "feat: add rate limiters for character page API endpoints"
```

---

## Chunk 2: API Layer

### Task 5: Rewrite Character Scan API

Replace the broken `characters_present` query with text search using name + aliases.

**Files:**
- Modify: `src/app/api/ai/character-scan/route.ts`

- [ ] **Step 1: Read the current route**

Read `src/app/api/ai/character-scan/route.ts` to understand current structure.

- [ ] **Step 2: Rewrite the panel query to use text search**

Replace lines 47-52 (the broken `contains('characters_present', ...)` query) with a text search approach:

```typescript
// 2. Gather all visual descriptions mentioning this character (by name + aliases)
const allNames = [character.name, ...(character.aliases || [])]
if (character.display_name && !allNames.includes(character.display_name)) {
  allNames.push(character.display_name)
}

// Build text search conditions using Supabase's .or() with word-boundary-like matching
// Since Supabase JS client doesn't support ~* directly, use ilike with word patterns
// For the API route, we use a manual approach: fetch all panels in the series and filter
const { data: allPanels } = await supabase
  .from('panels')
  .select('visual_description, page_id, page:page_id(scene:scene_id(act:act_id(issue:issue_id(series_id))))')
  .not('visual_description', 'is', null)

// Filter panels that belong to this series and mention any character name
const nameRegexes = allNames.map(name => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i')
})

const matchingPanels = (allPanels || []).filter(p => {
  // Verify this panel belongs to the right series
  const panelSeriesId = (p as any)?.page?.scene?.act?.issue?.series_id
  if (panelSeriesId !== seriesId) return false
  // Check if any name matches
  const desc = p.visual_description || ''
  return nameRegexes.some(regex => regex.test(desc))
}).slice(0, 50)

const descriptions = matchingPanels.map(p => p.visual_description).filter(Boolean)
```

**Important:** The Supabase JS client doesn't support Postgres `~*` (regex) directly via `.filter()`. The cleanest approach for the API route is to:
1. Query all panels for the series (using the join chain to verify series_id)
2. Apply name matching in JavaScript with word-boundary regex
3. Limit to 50 results

Alternatively, if `execute_sql` is available as a Supabase function, use raw SQL with `~*`. The implementer should check if the project has an `execute_sql` RPC function and use whichever approach is cleaner. If neither works, use `.ilike()` with `%NAME%` and accept the slightly broader matching (the AI extraction is fuzzy anyway).

- [ ] **Step 3: Update the prompt to include aliases**

In the Claude prompt (line 75), change from:
```
for the character "${character.name}" (display name: ${character.display_name || character.name})
```
to:
```
for the character "${character.name}"${character.aliases?.length ? ` (also known as: ${character.aliases.join(', ')})` : ''} (display name: ${character.display_name || character.name})
```

- [ ] **Step 4: Test manually**

The existing AI scan was returning zero results. After this fix, scanning a character like "MARSHALL" should find 50+ descriptions. Test by:
1. Starting dev server
2. Navigate to characters page
3. Open a character's AI Scan tab
4. Click scan and verify descriptions are found

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/character-scan/route.ts
git commit -m "fix: rewrite character scan to use text search instead of broken characters_present"
```

---

### Task 6: Stats Recompute API Route

**Files:**
- Create: `src/app/api/characters/stats/recompute/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'
import { computeAllCharacterStats, writeStatsCache } from '@/lib/character-stats'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.statsRecompute(user.id)
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { seriesId } = await request.json()

    // Fetch all characters for this series
    const { data: characters } = await supabase
      .from('characters')
      .select('id, name, aliases')
      .eq('series_id', seriesId)

    if (!characters || characters.length === 0) {
      return NextResponse.json({ message: 'No characters found', stats: {} })
    }

    // Compute stats
    const stats = await computeAllCharacterStats(
      supabase,
      seriesId,
      characters.map(c => ({
        id: c.id,
        name: c.name,
        aliases: c.aliases || [],
      }))
    )

    // Write to cache
    await writeStatsCache(supabase, seriesId, stats)

    const duration = Math.round(performance.now() - start)
    logger.info('Stats recompute complete', {
      userId: user.id,
      seriesId,
      action: 'stats_recompute',
      duration,
      characterCount: characters.length,
    })

    // Return stats as plain object for the client
    const statsObj: Record<string, any> = {}
    stats.forEach((value, key) => { statsObj[key] = value })

    return NextResponse.json({ stats: statsObj })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Stats recompute error', {
      action: 'stats_recompute',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to recompute stats' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/characters/stats/recompute/route.ts
git commit -m "feat: add stats recompute API endpoint"
```

---

### Task 7: Voice Data API Route

Provides lazy-loaded voice tab data so the detail panel doesn't fetch everything on open.

**Files:**
- Create: `src/app/api/characters/[characterId]/voice/route.ts`

- [ ] **Step 1: Create the API route**

This route replicates the data-fetching logic from the current `voice/page.tsx` server component, but as an API endpoint callable from the client.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.voiceData(user.id)
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { characterId } = await params

    // Fetch character to verify access
    const { data: character } = await supabase
      .from('characters')
      .select('id, name, series_id')
      .eq('id', characterId)
      .single()

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Fetch all dialogue for this character with context
    const { data: dialogues } = await supabase
      .from('dialogue_blocks')
      .select(`
        id, text, dialogue_type, delivery_instruction, sort_order,
        panel:panel_id (
          id, panel_number,
          page:page_id (
            id, page_number,
            scene:scene_id (
              id, title,
              act:act_id (
                id,
                issue:issue_id (
                  id, issue_number, title
                )
              )
            )
          )
        )
      `)
      .eq('character_id', characterId)
      .not('text', 'is', null)
      .order('sort_order')

    // Fetch existing voice profile
    const { data: profile } = await supabase
      .from('character_voice_profiles')
      .select('*')
      .eq('character_id', characterId)
      .single()

    // Fetch existing dialogue flags (non-dismissed)
    const { data: flags } = await supabase
      .from('dialogue_flags')
      .select('*')
      .eq('character_id', characterId)
      .eq('is_dismissed', false)

    // Flatten dialogue data for the client
    const flatDialogues = (dialogues || []).map((d: any) => ({
      id: d.id,
      text: d.text,
      dialogueType: d.dialogue_type,
      deliveryInstruction: d.delivery_instruction,
      issueNumber: d.panel?.page?.scene?.act?.issue?.issue_number,
      issueTitle: d.panel?.page?.scene?.act?.issue?.title,
      pageNumber: d.panel?.page?.page_number,
      sceneName: d.panel?.page?.scene?.title,
    }))

    return NextResponse.json({
      dialogues: flatDialogues,
      profile: profile || null,
      flags: flags || [],
      dialogueCount: flatDialogues.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch voice data' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/characters/[characterId]/voice/route.ts
git commit -m "feat: add voice data API endpoint for lazy-loaded detail panel"
```

---

### Task 8: Manuscript Scan API Route

AI-powered scan to discover new character names in the manuscript.

**Files:**
- Create: `src/app/api/ai/manuscript-scan/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = rateLimiters.manuscriptScan(user.id)
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { seriesId } = await request.json()

    // Fetch existing characters (names + aliases) for cross-reference
    const { data: existingChars } = await supabase
      .from('characters')
      .select('id, name, display_name, aliases')
      .eq('series_id', seriesId)

    // Fetch dismissed names
    const { data: dismissedNames } = await supabase
      .from('dismissed_character_names')
      .select('name')
      .eq('series_id', seriesId)

    const dismissedSet = new Set(
      (dismissedNames || []).map(d => d.name.toUpperCase())
    )

    // Build set of known names (primary + aliases)
    const knownNames = new Set<string>()
    for (const char of existingChars || []) {
      knownNames.add(char.name.toUpperCase())
      if (char.display_name) knownNames.add(char.display_name.toUpperCase())
      for (const alias of char.aliases || []) {
        knownNames.add(alias.toUpperCase())
      }
    }

    // Fetch ALL visual descriptions across the series
    const { data: panels } = await supabase
      .from('panels')
      .select(`
        id, visual_description,
        page:page_id (
          page_number,
          scene:scene_id (
            act:act_id (
              issue:issue_id (
                id, series_id, issue_number
              )
            )
          )
        )
      `)
      .not('visual_description', 'is', null)

    // Filter to panels in this series
    const seriesPanels = (panels || []).filter((p: any) =>
      p.page?.scene?.act?.issue?.series_id === seriesId
    )

    const descriptions = seriesPanels.map(p => p.visual_description).filter(Boolean)

    if (descriptions.length === 0) {
      return NextResponse.json({
        names: [],
        message: 'No visual descriptions found in this series.',
      })
    }

    // Step 1: Pattern match for ALL CAPS words (2+ chars, not common words)
    const allCapsPattern = /\b[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)*\b/g
    const capsNameCounts = new Map<string, number>()
    const capsNameContexts = new Map<string, string[]>()

    // Common ALL CAPS words that aren't character names
    const excludeWords = new Set([
      'INT', 'EXT', 'CLOSE', 'WIDE', 'MEDIUM', 'CU', 'ECU', 'MCU', 'WS', 'MS',
      'POV', 'OTS', 'VO', 'OS', 'SFX', 'VFX', 'FX', 'BG', 'FG', 'MG',
      'CUT', 'FADE', 'DISSOLVE', 'SMASH', 'MATCH', 'WIPE', 'INTERCUT',
      'PAGE', 'PANEL', 'SPLASH', 'SPREAD', 'TIER', 'INSET',
      'CONTINUED', 'CONT', 'MORE', 'END', 'THE', 'AND', 'BUT', 'FOR',
      'WITH', 'FROM', 'INTO', 'OVER', 'UNDER', 'THROUGH', 'BETWEEN',
      'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'CENTER', 'MIDDLE',
      'DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK',
      'ANGLE', 'SHOT', 'SCENE', 'ACT', 'BEAT',
      'NOTE', 'NOTES', 'ARTIST', 'REFERENCE', 'SEE',
      'LATER', 'SAME', 'TIME', 'FLASHBACK', 'PRESENT',
    ])

    for (const desc of descriptions) {
      const matches = desc.match(allCapsPattern) || []
      for (const match of matches) {
        if (match.length < 2) continue
        if (excludeWords.has(match)) continue
        if (knownNames.has(match)) continue
        if (dismissedSet.has(match)) continue

        capsNameCounts.set(match, (capsNameCounts.get(match) || 0) + 1)

        // Store context snippets (max 3 per name)
        const contexts = capsNameContexts.get(match) || []
        if (contexts.length < 3) {
          // Extract 100 chars around the match
          const idx = desc.indexOf(match)
          const start = Math.max(0, idx - 40)
          const end = Math.min(desc.length, idx + match.length + 60)
          contexts.push('...' + desc.slice(start, end) + '...')
          capsNameContexts.set(match, contexts)
        }
      }
    }

    // Filter to names with 2+ occurrences (reduce noise)
    const candidates = Array.from(capsNameCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30) // Cap at 30 candidates

    if (candidates.length === 0) {
      return NextResponse.json({
        names: [],
        message: 'No new character names found in the manuscript.',
      })
    }

    // Step 2: AI disambiguation — ask Claude which of these are likely character names
    const candidateList = candidates.map(([name, count]) => {
      const contexts = capsNameContexts.get(name) || []
      return `- ${name} (${count} occurrences)\n  Context: ${contexts[0] || 'no context'}`
    }).join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: 'You are analyzing a comic book script to identify character names. Return only valid JSON.',
      messages: [{
        role: 'user',
        content: `These ALL CAPS words appear multiple times in comic script visual descriptions. Which ones are likely CHARACTER NAMES (people, not locations, objects, or action words)?

${candidateList}

Return a JSON array of objects: [{"name": "...", "isCharacter": true/false, "confidence": "high"/"medium"/"low"}]
Only include entries where isCharacter is true.`
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const rawText = textBlock?.type === 'text' ? textBlock.text : '[]'

    let aiResults: Array<{ name: string; isCharacter: boolean; confidence: string }> = []
    try {
      aiResults = JSON.parse(rawText)
    } catch {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (jsonMatch) aiResults = JSON.parse(jsonMatch[0])
    }

    // Build final results
    const names = aiResults
      .filter(r => r.isCharacter)
      .map(r => ({
        name: r.name,
        frequency: capsNameCounts.get(r.name) || 0,
        confidence: r.confidence,
        contexts: capsNameContexts.get(r.name) || [],
      }))
      .sort((a, b) => b.frequency - a.frequency)

    const duration = Math.round(performance.now() - start)
    logger.info('Manuscript scan complete', {
      userId: user.id,
      seriesId,
      action: 'manuscript_scan',
      duration,
      descriptionsScanned: descriptions.length,
      candidatesFound: candidates.length,
      namesIdentified: names.length,
    })

    return NextResponse.json({ names })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Manuscript scan error', {
      action: 'manuscript_scan',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to scan manuscript' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/ai/manuscript-scan/route.ts
git commit -m "feat: add manuscript scan API for discovering new character names"
```

---

## Chunk 3: Card Grid UI

### Task 9: CharacterCard Component

The individual dense dashboard card displaying stats, heatmap, and relationships.

**Files:**
- Create: `src/app/series/[seriesId]/characters/CharacterCard.tsx`

- [ ] **Step 1: Create the CharacterCard component**

This component renders a single character card (~300px wide) with:
- Header: name, aliases (truncated), role badge (clickable to change)
- Stats row: panel count (primary), dialogue count, issue spread
- Issue presence heatmap: one bar per issue, opacity-scaled
- Relationship tags: clickable pills linking to other characters

Reference the dense dashboard mockup from the brainstorm session (`card-layouts.html` option C).

Key props:
```typescript
interface CharacterCardProps {
  character: CharacterWithStats
  issues: Array<{ id: string; issue_number: number }>
  allCharacters: Array<{ id: string; name: string; display_name: string | null; aliases: string[] }>
  isSelected: boolean
  selectMode: boolean
  onSelect: (id: string) => void
  onClick: (id: string) => void
  onRoleChange: (id: string, role: string) => void
  onDelete: (id: string) => void
}
```

Implementation notes:
- Role badge: small dropdown on click (not a full select — just a popover with 5 options)
- Heatmap: calculate max panels per issue, scale opacity relative to max (min 0.15, max 1.0)
- Relationship tags: use `extractRelationshipRefs()` from character-stats.ts
- Delete button: appears on hover (top-right X icon)
- Select mode: shows checkbox in top-left corner
- Whole card is clickable (opens detail panel) unless in select mode (then toggles selection)

Style: Match the dense dashboard mockup — light background card with bordered sections, small purple heatmap bars, relationship pills in light purple.

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterCard.tsx
git commit -m "feat: add CharacterCard dense dashboard component"
```

---

### Task 10: CharacterMiniCard Component

Compact card for characters with <5 panel mentions.

**Files:**
- Create: `src/app/series/[seriesId]/characters/CharacterMiniCard.tsx`

- [ ] **Step 1: Create the MiniCard component**

Single-row card showing: name, role badge, panel count. Clickable to open detail panel. In select mode, shows checkbox.

```typescript
interface CharacterMiniCardProps {
  character: CharacterWithStats
  isSelected: boolean
  selectMode: boolean
  onSelect: (id: string) => void
  onClick: (id: string) => void
}
```

Style: Compact row, ~40px tall, subtle border, name bold, role badge small, panel count right-aligned.

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterMiniCard.tsx
git commit -m "feat: add CharacterMiniCard for minor characters"
```

---

### Task 11: CharacterGrid Component

Main grid container with filter bar, toolbar, sort controls, and select mode.

**Files:**
- Create: `src/app/series/[seriesId]/characters/CharacterGrid.tsx`

- [ ] **Step 1: Create the CharacterGrid component**

This is the main orchestrator component. It manages:

**State:**
- `characters`: Array of CharacterWithStats (from server + live updates)
- `stats`: Map of character stats (from cache + recomputation)
- `selectedIds`: Set of selected character IDs (for bulk operations)
- `selectMode`: boolean toggle
- `selectedCharacterId`: string | null (which card has the detail panel open)
- `sortBy`: 'panels' | 'alpha' | 'role' | 'issues' | 'dialogues'
- `roleFilter`: Set of roles to show
- `issueFilter`: string | null (issue ID)
- `searchQuery`: string
- `isRefreshing`: boolean (stats recompute in progress)

**Props:**
```typescript
interface CharacterGridProps {
  seriesId: string
  initialCharacters: CharacterWithStats[]
  initialStats: Map<string, CharacterStats>
  issues: Array<{ id: string; issue_number: number; title: string }>
  plotlines: Array<{ id: string; name: string }>
}
```

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ Filter Bar: [Role chips] [Issue ▼] [Search...] [+Add]│
│ Toolbar: [Scan Manuscript] [Refresh Stats] [Select]  │
├──────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │  Card 1  │ │  Card 2  │ │  Card 3  │ │  Card 4  │    │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
│ ┌─────────┐ ┌─────────┐ ┌─────────────────────────┐│
│ │  Card 5  │ │  Card 6  │ │ Mini cards in a row...  ││
│ └─────────┘ └─────────┘ └─────────────────────────┘│
├──────────────────────────────────────────────────────┤
│                  Detail Panel (if open)               │
└──────────────────────────────────────────────────────┘
```

**Key behaviors:**
- Grid uses CSS grid: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`
- Characters with <5 panel mentions go into a separate "Minor Characters" section below main grid
- Filter bar is sticky at top
- Sort dropdown in toolbar area
- Select mode: shows checkboxes, enables "Merge" and "Delete Selected" buttons in toolbar
- "+ Add Character" opens an inline create form or the detail panel in create mode
- "Scan Manuscript" opens ManuscriptScanModal
- "Refresh Stats" calls `/api/characters/stats/recompute` and updates state

**Filtering logic:**
- Role filter: include character if role matches any selected role (show all if none selected)
- Issue filter: include character if `stats.issueBreakdown[issueId]` has panels > 0
- Search: case-insensitive match on name, display_name, or any alias
- All filters are AND-combined

**Sorting logic:**
- 'panels': by `stats.totalPanels` descending
- 'alpha': by `name` ascending
- 'role': group by role (protagonist > antagonist > supporting > recurring > minor), then by panels within group
- 'issues': by number of issues present (count keys in issueBreakdown)
- 'dialogues': by `stats.totalDialogues` descending

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterGrid.tsx
git commit -m "feat: add CharacterGrid with filtering, sorting, and select mode"
```

---

### Task 12: Update page.tsx Server Component

Rewrite the server component to fetch stats cache and pass data to CharacterGrid.

**Files:**
- Modify: `src/app/series/[seriesId]/characters/page.tsx`

- [ ] **Step 1: Read the current page.tsx**

Read `src/app/series/[seriesId]/characters/page.tsx`.

- [ ] **Step 2: Rewrite to fetch stats and pass to CharacterGrid**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import CharacterGrid from './CharacterGrid'
import { getCachedStats, isStatsCacheStale, CharacterWithStats } from '@/lib/character-stats'
import Header from '@/components/Header'

export const dynamic = 'force-dynamic'

export default async function CharactersPage({
  params,
}: {
  params: Promise<{ seriesId: string }>
}) {
  const { seriesId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: series } = await supabase
    .from('series')
    .select('id, title')
    .eq('id', seriesId)
    .single()

  if (!series) notFound()

  // Fetch characters
  const { data: characters } = await supabase
    .from('characters')
    .select('*')
    .eq('series_id', seriesId)
    .order('name')

  // Fetch cached stats
  const statsCache = await getCachedStats(supabase, seriesId)

  // Fetch issues for heatmap
  const { data: issues } = await supabase
    .from('issues')
    .select('id, issue_number, title')
    .eq('series_id', seriesId)
    .order('issue_number')

  // Fetch plotlines for filter
  const { data: plotlines } = await supabase
    .from('plotlines')
    .select('id, name')
    .eq('series_id', seriesId)
    .order('sort_order')

  // Check staleness and trigger background recompute if needed
  const stale = await isStatsCacheStale(supabase, seriesId)

  // Merge characters with stats
  const charactersWithStats: CharacterWithStats[] = (characters || []).map(c => ({
    ...c,
    aliases: c.aliases || [],
    stats: statsCache.get(c.id) || null,
  }))

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Header title={`${series.title} — Characters`} backHref={`/series/${seriesId}`} />
      <CharacterGrid
        seriesId={seriesId}
        initialCharacters={charactersWithStats}
        initialStats={statsCache}
        issues={issues || []}
        plotlines={plotlines || []}
        initialStale={stale}
      />
    </div>
  )
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Compiles without errors (CharacterGrid is imported but not yet fully wired — this is fine as long as types match).

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/characters/page.tsx
git commit -m "feat: rewrite characters page.tsx to fetch stats and pass to CharacterGrid"
```

---

## Chunk 4: Detail Panel

### Task 13: CharacterDetailPanel — Shell + Profile Tab

The slide-out panel that appears when a card is clicked.

**Files:**
- Create: `src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx`

- [ ] **Step 1: Create the detail panel shell**

This component manages:
- Slide-in/out animation from the right
- Tab bar: Profile | Voice | Appearances | AI Scan
- Active tab state
- Close button
- Character data + live edits

**Props:**
```typescript
interface CharacterDetailPanelProps {
  character: CharacterWithStats
  seriesId: string
  issues: Array<{ id: string; issue_number: number; title: string }>
  allCharacters: Array<{ id: string; name: string; display_name: string | null; aliases: string[] }>
  isOpen: boolean
  onClose: () => void
  onCharacterUpdate: (updated: CharacterWithStats) => void
  onDelete: (id: string) => void
}
```

**Animation:**
- Position: fixed right-0 top-0, width ~480px, height full viewport
- Transition: `transform 300ms ease-out` — `translate-x-full` when closed, `translate-x-0` when open
- Backdrop: semi-transparent overlay that closes panel on click
- Z-index: above the grid

**Profile Tab content:**
- Auto-save on blur (same pattern as existing CharacterList)
- Identity section: name, display_name, aliases (tag input), role (dropdown)
- Description: TipTap editor (notes variant) for `physical_description`
- Physical Details: collapsible section with text inputs for age, eye_color, etc.
- Background: TipTap editor (notes variant) for `background`
- Personality, Speech, Relationships, Arc: text inputs
- Reference Images: ImageUploader component

**Alias Tag Input:**
- Text input + Enter to add
- Each alias shown as a pill with X to remove
- Stored as `aliases` TEXT[] on character

**Role Dropdown:**
- 5 options: protagonist, supporting, antagonist, recurring, minor
- On change, immediately saves to DB

**Auto-save pattern (from existing codebase):**
```typescript
const handleFieldBlur = async (field: string, value: string) => {
  const supabase = createClient()
  await supabase.from('characters').update({ [field]: value }).eq('id', character.id)
  onCharacterUpdate({ ...character, [field]: value })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx
git commit -m "feat: add CharacterDetailPanel with slide-out animation and Profile tab"
```

---

### Task 14: Voice Tab (Lazy-Loaded)

Add the Voice tab to the detail panel. Data is lazy-loaded on first tab click.

**Files:**
- Modify: `src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx`

- [ ] **Step 1: Add Voice tab implementation**

Within CharacterDetailPanel, add the Voice tab content as a separate section (or extract as a child component within the same file for simplicity).

**Lazy-loading pattern:**
```typescript
const [voiceData, setVoiceData] = useState<VoiceTabData | null>(null)
const [voiceLoading, setVoiceLoading] = useState(false)
const voiceLoadedRef = useRef(false)

// Load voice data on first tab click
useEffect(() => {
  if (activeTab === 'voice' && !voiceLoadedRef.current) {
    voiceLoadedRef.current = true
    setVoiceLoading(true)
    fetch(`/api/characters/${character.id}/voice`)
      .then(r => r.json())
      .then(data => setVoiceData(data))
      .finally(() => setVoiceLoading(false))
  }
}, [activeTab, character.id])
```

**Voice tab content** (ported from VoiceProfileClient.tsx):
- Trained Profile: vocabulary level, avg sentence length, common/avoided words, tone markers, speech quirks, sample quotes, profile summary
- Train/Retrain button (requires 5+ dialogue samples)
- Dialogue Flags: list of inconsistency warnings, each dismissable
- Sample Dialogue: scrollable list with issue/page context

**Key functions (reuse from `src/lib/character-voice.ts`):**
- `trainVoiceProfile()` — called on Train button click
- `checkDialogueConsistency()` — called on Check Consistency button
- Results saved to DB via supabase client, then update local state

**Progress indicators:**
- Training: show spinner + "Training voice profile..."
- Consistency check: show spinner + "Checking X dialogues..."

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx
git commit -m "feat: add Voice tab with lazy-loading to CharacterDetailPanel"
```

---

### Task 15: Appearances Tab

Show issue-by-issue breakdown of where the character appears.

**Files:**
- Modify: `src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx`

- [ ] **Step 1: Add Appearances tab implementation**

Uses the `issueBreakdown` from stats cache. For each issue with data:
- Issue number + title
- Panel count and dialogue count
- Expandable: list page numbers where character appears (from the stats engine scene_ids, or a separate query)
- Page numbers are links: `/series/${seriesId}/issues/${issueId}?page=${pageNumber}`

**Data source:** `character.stats.issueBreakdown` provides `{issueId: {panels: N, dialogues: N}}`. Match against the `issues` array (passed via props) for display names.

If `first_appearance` exists on the character, show it as a note at the top: "First mentioned: [first_appearance]" (read-only, legacy field).

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx
git commit -m "feat: add Appearances tab to CharacterDetailPanel"
```

---

### Task 16: AI Scan Tab

The fixed character scan that actually finds manuscript text.

**Files:**
- Modify: `src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx`

- [ ] **Step 1: Add AI Scan tab implementation**

Port the scan UI from the existing CharacterList.tsx (lines ~400-500) but calling the rewritten `/api/ai/character-scan` endpoint.

**UI:**
- Scan button (primary)
- Loading state with spinner
- Results: count "Based on X description(s) and Y dialogue(s)"
- Suggestion list: each field as a row with:
  - Field name (label)
  - Current value (if exists) vs suggested value
  - Checkbox (pre-selected if current value is empty/null)
- Apply Selected button
- Rescan button (appears after results)

**Flow:**
1. User clicks Scan
2. POST to `/api/ai/character-scan` with `{ characterId, seriesId }`
3. Show results with checkboxes
4. User selects which suggestions to apply
5. Click "Apply Selected" → update character in DB → refresh parent

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterDetailPanel.tsx
git commit -m "feat: add AI Scan tab to CharacterDetailPanel"
```

---

## Chunk 5: Cast Management

### Task 17: MergeModal

Character merge workflow with primary selection and undo toast.

**Files:**
- Create: `src/app/series/[seriesId]/characters/MergeModal.tsx`

- [ ] **Step 1: Create the MergeModal component**

**Props:**
```typescript
interface MergeModalProps {
  open: boolean
  characters: CharacterWithStats[] // The 2+ selected characters
  onClose: () => void
  onMergeComplete: (primaryId: string, absorbedIds: string[]) => void
}
```

**UI:**
1. Modal with title "Merge Characters"
2. Radio buttons to select primary character (the one that survives)
3. Preview: "MARSHALL will absorb: MARSH, MARSHALL MATHERS"
4. Impact summary: "3 dialogue lines will be reassigned"
5. Merge button + Cancel button

**Merge logic (called on confirm):**
```typescript
async function executeMerge(primaryId: string, absorbedIds: string[]) {
  const supabase = createClient()

  // 1. Snapshot absorbed characters for undo
  const { data: snapshot } = await supabase
    .from('characters')
    .select('*')
    .in('id', absorbedIds)

  // 2. Add absorbed names as aliases on primary
  const { data: primary } = await supabase
    .from('characters')
    .select('aliases')
    .eq('id', primaryId)
    .single()

  const newAliases = [
    ...(primary?.aliases || []),
    ...absorbedIds.flatMap(id => {
      const char = snapshot?.find(c => c.id === id)
      return char ? [char.name, ...(char.aliases || [])] : []
    })
  ]
  // Deduplicate
  const uniqueAliases = [...new Set(newAliases)]

  await supabase
    .from('characters')
    .update({ aliases: uniqueAliases })
    .eq('id', primaryId)

  // 3. Reassign dialogue blocks
  for (const absorbedId of absorbedIds) {
    await supabase
      .from('dialogue_blocks')
      .update({ character_id: primaryId })
      .eq('character_id', absorbedId)
  }

  // 4. Delete voice profiles for absorbed characters
  await supabase
    .from('character_voice_profiles')
    .delete()
    .in('character_id', absorbedIds)

  // 5. Delete absorbed characters
  await supabase
    .from('characters')
    .delete()
    .in('id', absorbedIds)

  // 6. Trigger stats recompute
  await fetch('/api/characters/stats/recompute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesId: primary?.series_id }),
  })

  return { snapshot, newAliases }
}
```

**Undo logic:**
After successful merge, show an undo toast:
```typescript
showToast('Characters merged', 'success', {
  duration: 10000,
  action: {
    label: 'Undo',
    onClick: async () => {
      // Restore absorbed characters from snapshot
      // Remove their names from primary's aliases
      // Reassign dialogue blocks back
      // (This is a best-effort restore)
    }
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/MergeModal.tsx
git commit -m "feat: add MergeModal with primary selection and undo toast"
```

---

### Task 18: Delete with Undo Toast

Add delete functionality to CharacterGrid with confirmation dialog and undo.

**Files:**
- Modify: `src/app/series/[seriesId]/characters/CharacterGrid.tsx`

- [ ] **Step 1: Add delete handlers to CharacterGrid**

**Single delete:**
1. User clicks delete on a card (hover X) or in detail panel
2. ConfirmDialog opens: "Delete WORKER? This character has 4 dialogue lines that will lose their speaker link."
3. On confirm:
   - Snapshot the character
   - Set `dialogue_blocks.character_id = null` where `character_id = id`
   - Delete the character
   - Show undo toast (10 seconds)
4. Undo: restore character from snapshot, reassign dialogue blocks

**Bulk delete:**
1. In select mode, "Delete Selected" button appears
2. ConfirmDialog with count: "Delete 3 characters? X dialogue lines will lose their speaker links."
3. Same logic for each, with batch undo

**Impact query (for confirmation dialog):**
```typescript
const { count } = await supabase
  .from('dialogue_blocks')
  .select('id', { count: 'exact', head: true })
  .eq('character_id', characterId)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/CharacterGrid.tsx
git commit -m "feat: add character delete with impact dialog and undo toast"
```

---

### Task 19: ManuscriptScanModal

AI-powered discovery of new character names.

**Files:**
- Create: `src/app/series/[seriesId]/characters/ManuscriptScanModal.tsx`

- [ ] **Step 1: Create the ManuscriptScanModal component**

**Props:**
```typescript
interface ManuscriptScanModalProps {
  open: boolean
  seriesId: string
  existingCharacters: Array<{ id: string; name: string; display_name: string | null; aliases: string[] }>
  onClose: () => void
  onCharactersAdded: () => void // Callback to refresh grid
}
```

**UI States:**
1. **Scanning**: Loading spinner + "Scanning manuscript..." (POST to `/api/ai/manuscript-scan`)
2. **Results**: List of discovered names, each with:
   - Name (bold)
   - Frequency count
   - Confidence badge (high/medium/low)
   - Context snippets (collapsible)
   - Three action buttons: "Create Character" / "Add as Alias ▼" / "Ignore"
3. **Empty**: "No new character names found."

**Actions per name:**
- **Create Character**: POST to characters table with this name, then remove from list
- **Add as Alias**: Dropdown of existing characters → add this name to selected character's aliases
- **Ignore**: POST to `dismissed_character_names`, remove from list

All three actions update the list in-place (remove the handled item). When all items are handled or dismissed, show "All done!" state.

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/characters/ManuscriptScanModal.tsx
git commit -m "feat: add ManuscriptScanModal for discovering new character names"
```

---

## Chunk 6: Integration + Cleanup

### Task 20: Update auto-format.ts to Include Aliases

**Files:**
- Modify: `src/lib/auto-format.ts`

- [ ] **Step 1: Read the current auto-format.ts**

Read `src/lib/auto-format.ts`.

- [ ] **Step 2: Update character name matching to include aliases**

The `capitalizeCharacterNames` function currently matches on `display_name` or `name`. Extend to also match on `aliases`:

In the Character interface, add:
```typescript
interface Character {
  id: string
  name: string
  display_name: string
  aliases?: string[] // Add this
}
```

In `capitalizeCharacterNames`, after building the name/display_name regex, also add aliases:
```typescript
// For each character, also capitalize aliases
for (const alias of character.aliases || []) {
  if (alias && alias.length >= 2) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const aliasRegex = new RegExp(`\\b${escapedAlias}\\b`, 'gi')
    result = result.replace(aliasRegex, alias.toUpperCase())
  }
}
```

Do the same for `hasUncapitalizedCharacterNames`.

- [ ] **Step 3: Run existing tests**

Run: `npm run test:run`
Expected: All existing tests pass (auto-format doesn't have dedicated tests, but ensure no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auto-format.ts
git commit -m "feat: include character aliases in auto-capitalize matching"
```

---

### Task 21: Update context-assembler.ts to Include Aliases

**Files:**
- Modify: `src/lib/ai/context-assembler.ts`

- [ ] **Step 1: Read the character section of context-assembler.ts**

Read `src/lib/ai/context-assembler.ts` and find the character query section.

- [ ] **Step 2: Update the character query to include aliases**

Change the select from:
```typescript
.select('display_name')
```
to:
```typescript
.select('display_name, name, aliases')
```

Update the character names output to include aliases:
```typescript
if (characters && (characters as unknown[]).length > 0) {
  const charList = characters as Array<{ display_name: string; name: string; aliases: string[] }>
  seriesContext.characterCount = charList.length
  seriesContext.characterNames = charList.map(c => {
    const primary = c.display_name || c.name
    const aliases = (c.aliases || []).filter(Boolean)
    return aliases.length > 0 ? `${primary} (aka ${aliases.join(', ')})` : primary
  })
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/context-assembler.ts
git commit -m "feat: include character aliases in AI context assembly"
```

---

### Task 22: Remove Old Files + Wire Everything Together

Final cleanup: remove the old CharacterList and voice profile pages, ensure all imports are correct.

**Files:**
- Remove: `src/app/series/[seriesId]/characters/CharacterList.tsx`
- Remove: `src/app/series/[seriesId]/characters/[characterId]/voice/page.tsx`
- Remove: `src/app/series/[seriesId]/characters/[characterId]/voice/VoiceProfileClient.tsx`
- Verify: `src/app/series/[seriesId]/characters/page.tsx` imports CharacterGrid (not CharacterList)

- [ ] **Step 1: Verify page.tsx imports are correct**

Read `src/app/series/[seriesId]/characters/page.tsx` and confirm it imports `CharacterGrid`, not `CharacterList`.

- [ ] **Step 2: Delete old files**

```bash
rm src/app/series/[seriesId]/characters/CharacterList.tsx
rm -rf src/app/series/[seriesId]/characters/[characterId]/voice/
```

- [ ] **Step 3: Search for remaining references to old files**

Search the codebase for:
- `CharacterList` imports
- `/characters/[characterId]/voice` links
- Any `characters_present` references (the broken column)

Fix any references found:
- Links to voice profile page → remove or redirect to characters page
- CharacterList imports → should all be CharacterGrid now
- `characters_present` → remove dead references

- [ ] **Step 4: Build + type check**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove old CharacterList and voice profile pages"
```

---

### Task 23: End-to-End Smoke Test

Manual verification that the full feature works.

- [ ] **Step 1: Start dev server and navigate to characters page**

Start the dev server and navigate to `/series/[seriesId]/characters`.

- [ ] **Step 2: Verify card grid renders**

- Characters appear as dense dashboard cards sorted by panel mentions
- Cards show stats (panels, dialogues, issues)
- Issue heatmap bars are visible
- Minor characters (<5 mentions) show as mini cards

- [ ] **Step 3: Test filtering and sorting**

- Click role filter chips — grid filters correctly
- Change sort option — grid reorders
- Type in search — filters by name/alias

- [ ] **Step 4: Test detail panel**

- Click a card → detail panel slides in from right
- Profile tab: edit a field, blur → auto-saves
- Add/remove an alias
- Change role via dropdown
- Click Voice tab → loading spinner → voice data loads
- Click Appearances tab → shows issue breakdown
- Click AI Scan tab → run scan → see results

- [ ] **Step 5: Test merge**

- Toggle select mode
- Select 2 characters
- Click Merge → modal opens
- Select primary → confirm
- Verify merged character has aliases
- Verify undo toast appears

- [ ] **Step 6: Test delete**

- Click delete on a card
- Confirm dialog shows impact
- Confirm → character removed
- Verify undo toast appears

- [ ] **Step 7: Test manuscript re-parse**

- Click "Scan Manuscript" in toolbar
- Modal shows loading → results
- Create a character from results
- Add a name as alias
- Ignore a name
- Verify each action works

- [ ] **Step 8: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: address smoke test findings"
```

---

## Dependencies Between Tasks

```
Task 1 (Migration) ──→ Task 2 (Stats Engine) ──→ Task 6 (Stats API)
                   ──→ Task 5 (Character Scan) ──→ Task 16 (AI Scan Tab)
                   ──→ Task 8 (Manuscript Scan API)

Task 3 (Toast Extension) ──→ Task 17 (MergeModal)
                          ──→ Task 18 (Delete)

Task 4 (Rate Limiters) ──→ Task 5, 6, 7, 8 (all API routes)

Task 2 (Stats Engine) ──→ Task 9, 10 (Cards) ──→ Task 11 (Grid) ──→ Task 12 (page.tsx)

Task 11 (Grid) ──→ Task 13 (Detail Panel) ──→ Task 14, 15, 16 (Tabs)

Task 22 (Cleanup) depends on ALL other tasks being complete.
Task 23 (Smoke Test) is last.
```

**Parallelizable groups:**
- Tasks 1, 3, 4 can run in parallel (foundation)
- Tasks 5, 6, 7, 8 can run in parallel (API routes, after task 1 + 4)
- Tasks 9, 10 can run in parallel (cards, after task 2)
- Tasks 14, 15, 16 can run in parallel (tabs, after task 13)
- Tasks 20, 21 can run in parallel (integration, independent of UI)
- Task 14 (Voice Tab) also depends on Task 7 (Voice API)
- Task 17 (MergeModal) also depends on Task 6 (Stats API)

---

## Corrections & Implementation Notes

**READ THIS BEFORE IMPLEMENTING.** The following corrections address issues found during plan review. They override the corresponding task descriptions above.

### C1: Database queries — use Supabase MCP `execute_sql` instead of nonexistent RPC

The `execute_sql_readonly` RPC function does NOT exist in this project. All raw SQL in `character-stats.ts` (`computeAllCharacterStats`, `isStatsCacheStale`) should be executed via the Supabase MCP tool at migration/setup time, NOT at runtime.

**For runtime stats computation**, restructure `computeAllCharacterStats` to use Supabase client `.or()` with `.ilike()` patterns instead of raw SQL. Example:
```typescript
// Build OR conditions for ilike matching
const orConditions = allNames
  .map(name => `visual_description.ilike.%${name}%`)
  .join(',')

const { data, count } = await supabase
  .from('panels')
  .select('id, page:page_id(scene:scene_id(act:act_id(issue:issue_id(id, series_id))))', { count: 'exact' })
  .or(orConditions)
  .not('visual_description', 'is', null)
```

Then filter results to the correct `series_id` in JavaScript. This is slightly broader than word-boundary regex (e.g., "AL" might match "WALL") but is acceptable since the stats are approximate and the cache makes repeated queries fast.

For `isStatsCacheStale`, replace the raw SQL with:
```typescript
const { data: latestPanel } = await supabase
  .from('panels')
  .select('updated_at, page:page_id(scene:scene_id(act:act_id(issue:issue_id(series_id))))')
  .order('updated_at', { ascending: false })
  .limit(100)  // Fetch recent, filter to series
```
Then filter to the correct series_id and compare timestamps.

### C2: Voice API route column name corrections (Task 7)

The issues table column is `number` (not `issue_number`). The dialogue_flags dismissed column is `dismissed` (not `is_dismissed`).

In the voice API route:
- Change `.select()` to use `issue:issue_id(id, number, title)`
- Change flatDialogues mapping to use `issueNumber: d.panel?.page?.scene?.act?.issue?.number`
- Change flags query to use `.eq('dismissed', false)`

### C3: Panel queries must filter by series at the DB level (Tasks 5, 8)

Do NOT fetch all panels in the database then filter client-side. Instead, use join filtering:
```typescript
const { data: panels } = await supabase
  .from('panels')
  .select('visual_description, page:page_id(scene:scene_id(act:act_id(issue:issue_id(id, series_id))))')
  .not('visual_description', 'is', null)
  .limit(5000)  // Safety cap
```
Then filter by `series_id` in JavaScript from the nested join. The `.limit(5000)` prevents unbounded queries.

### C4: Toast action button must handle async undo (Task 3)

The toast action `onClick` should be `async`. When clicked:
1. Clear the auto-dismiss timer immediately
2. Change the toast text to "Restoring..."
3. Await the async undo operation
4. Then dismiss the toast

Updated rendering:
```tsx
onClick={async () => {
  // Clear auto-dismiss timer
  const timer = timersRef.current.get(toast.id)
  if (timer) { clearTimeout(timer); timersRef.current.delete(toast.id) }
  // Show restoring state
  setToasts(prev => prev.map(t => t.id === toast.id ? { ...t, message: 'Restoring...' } : t))
  // Execute undo
  try { await toast.action!.onClick() } catch { /* show error toast */ }
  // Dismiss
  onDismiss(toast.id)
}}
```

The `action.onClick` type should be `() => void | Promise<void>`.

### C5: Merge/Delete undo must snapshot dialogue block mappings (Tasks 17, 18)

Before nulling or reassigning `character_id` on dialogue blocks, snapshot the mapping:

```typescript
// For merge (before step 3):
const { data: dialogueSnapshot } = await supabase
  .from('dialogue_blocks')
  .select('id, character_id')
  .in('character_id', absorbedIds)

// For delete (before nulling):
const { data: dialogueSnapshot } = await supabase
  .from('dialogue_blocks')
  .select('id, character_id')
  .eq('character_id', characterId)
```

The undo handler then restores each dialogue block to its original character_id:
```typescript
for (const d of dialogueSnapshot) {
  await supabase.from('dialogue_blocks').update({ character_id: d.character_id }).eq('id', d.id)
}
```

### C6: Merge must also handle `character_states` and `dialogue_flags` (Task 17)

These tables have FK references to `characters(id)` with `ON DELETE CASCADE`. When absorbed characters are deleted, their states and flags cascade-delete. For undo, snapshot these too:

```typescript
const { data: statesSnapshot } = await supabase
  .from('character_states')
  .select('*')
  .in('character_id', absorbedIds)

const { data: flagsSnapshot } = await supabase
  .from('dialogue_flags')
  .select('*')
  .in('character_id', absorbedIds)
```

### C7: Merge `executeMerge` — fix seriesId reference (Task 17)

The merge function selects only `aliases` from the primary character but then references `primary?.series_id`. Fix by also selecting `series_id`:
```typescript
const { data: primary } = await supabase
  .from('characters')
  .select('aliases, series_id')
  .eq('id', primaryId)
  .single()
```

### C8: Voice tab must reset when character changes (Task 14)

Add a reset effect in the Voice tab:
```typescript
useEffect(() => {
  voiceLoadedRef.current = false
  setVoiceData(null)
}, [character.id])
```

### C9: CharacterGridProps must include `initialStale` (Task 11/12)

Add to the CharacterGridProps interface:
```typescript
initialStale?: boolean
```

### C10: Header import path correction (Task 12)

Use `import Header from '@/components/ui/Header'` (not `@/components/Header`). Pass `showBackLink={true}` as a prop.

### C11: `characters_present` references in cleanup (Task 22)

Beyond the files being deleted, also check these files for `characters_present` references:
- `src/lib/ai/context-assembler.ts` — this assembles a `characters_present` field from dialogue FK joins; this is NOT the broken DB column and should be LEFT ALONE
- `src/lib/ai/client.ts` — similar, uses characters_present in AI context object; LEAVE ALONE
- `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx` — uses `characters_present`; check if this references the DB column or local state
- `src/app/series/[seriesId]/issues/[issueId]/blueprint/BlueprintReference.tsx` — similar

The plan's cleanup task should ONLY fix references to the broken database column query (`.contains('characters_present', ...)`), NOT references to the `characters_present` property in the AI context assembly (which works correctly via dialogue FK joins).

### C12: Plotline filter implementation (Task 11)

The spec includes a plotline filter dropdown but the plan's CharacterGrid filtering logic omits it. To implement: a character appears in a plotline if any of their `sceneIds` (from stats cache) belongs to a scene whose plotline matches the filter. This requires fetching scenes with their plotline assignments and cross-referencing.

Add `plotlineFilter: string | null` to CharacterGrid state and add plotline filter logic:
```typescript
// In filtering logic:
if (plotlineFilter) {
  // sceneToPlotline is a Map built from fetched scene data
  const matchingSceneIds = character.stats?.sceneIds?.filter(sid => sceneToPlotline.get(sid) === plotlineFilter) || []
  if (matchingSceneIds.length === 0) return false
}
```
