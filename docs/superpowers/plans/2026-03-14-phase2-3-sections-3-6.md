# Sections 3–6 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build dual-page editing, AI-to-scaffold pipeline, import polish, and writer learning — the remaining four sections of the UX overhaul.

**Architecture:** Section 3 adds a split editor layout to `IssueEditor` and a new `mirror_page_id` column. Section 4 updates AI system prompts and adds a harvest endpoint + draft scaffolding. Section 5 improves the existing import character resolution UI and adds batch rename. Section 6 adds draft edit tracking to the existing writer profile synthesis loop. Each section is independent except Section 6 depends on Section 4c (draft tracking).

**Tech Stack:** Next.js App Router, React 19, Supabase (Postgres + RLS), Anthropic Claude Sonnet 4, TipTap, dnd-kit, Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-03-14-ux-overhaul-design.md` (Sections 3–6)

**Prerequisite:** Phase 1 (Sections 1–2) is already shipped in commit `6a2f07f`.

---

## Review Errata (Post-Review Fixes)

The following corrections must be applied when implementing each chunk. They address issues found during the plan review that are not reflected in the original task descriptions below.

### Chunk 1 Fixes (Section 3 — Dual-Page View)

**F1. Migration trigger recursion guard — add documentation.**
The reciprocal mirror triggers are recursion-safe because the `WHERE (mirror_page_id IS NULL OR mirror_page_id != NEW.id)` clause ensures the second-pass UPDATE matches 0 rows, so the per-row trigger does not fire again. Add SQL comments documenting this reasoning in the migration file so implementers understand the guard.

**F2. Add `mirror_page_id` to TypeScript interfaces.**
- In `PageEditor.tsx`, update the `Page` interface (~line 92) to add: `mirror_page_id?: string | null`
- In `PageTypeSelector.tsx`, update the `PageForLinking` interface to add: `mirror_page_id?: string | null`
- In `IssueEditor.tsx`, update the `currentScenePages` memo (~line 584) to include `mirror_page_id: p.mirror_page_id || null` in the mapping.

**F3. Replace `any` types in `DualPageEditorProps`.**
Import the `Page` and `PageContext` interfaces from `PageEditor.tsx` and use them for `leftPage`, `rightPage`, `leftPageContext`, `rightPageContext` instead of `any`. The `Page` interface is defined at PageEditor.tsx line 92, and `PageContext` at line 101.

**F4. Filter spread-linked pages from MirrorLinkModal.**
In `MirrorLinkModal`, filter `availablePages` to exclude pages with `linked_page_id IS NOT NULL` (already spread partners). The database trigger enforces this, but the UI should prevent invalid selections.

**F5. Add "Link mirror" action to NavigationTree context menu.**
The spec (3b) requires linking mirror pairs from the nav tree context menu, not only from PageTypeSelector. Add a new task (Task 5b) to add a "Link Mirror" item to NavigationTree's existing page context menu. When clicked, open `MirrorLinkModal`. NavigationTree already has `onAltClickPage` prop — add an analogous `onMirrorLink` callback, or open the modal inline.

**F6. Expand NavigationTree secondary highlight guidance.**
Task 5 Step 4 is underspecified. The implementer should:
- Add `secondSelectedPageId?: string | null` to `NavigationTreeProps` (line 44)
- In the page button click handler (~line 2347), apply a secondary CSS class when `page.id === secondSelectedPageId` (e.g., `bg-[var(--bg-tertiary)]` with a left border accent)
- The secondary highlight should NOT affect multi-select state (`selectedIds`)
- Search for `isSelected` in the page rendering section to find the exact insertion point

**F7. Fix gutter dot alignment.**
Replace the fixed `padding-top: 120px` with a flexbox approach where gutter dots are rendered as siblings of panel pairs in the layout, or use a ResizeObserver to dynamically position dots relative to their corresponding panels.

### Chunk 2 Fixes (Section 4 — Socratic → Scaffold Pipeline)

**F8. Add `update_page_story_beat` tool to `tools.ts`.**
The AI is instructed to propose saving story beats but no tool exists to do it. Add a new tool definition to `EDITOR_TOOLS` in `src/lib/ai/tools.ts`:

```typescript
{
  name: 'update_page_story_beat',
  description: 'Save a story beat to a specific page. Use when a beat crystallizes during conversation.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pageId: { type: 'string', description: 'The page ID from the project context' },
      story_beat: { type: 'string', description: 'The story beat text' },
    },
    required: ['pageId', 'story_beat'],
  },
}
```

Add the corresponding case in `executeToolCall`:
```typescript
case 'update_page_story_beat': {
  const { pageId, story_beat } = input as { pageId: string; story_beat: string }
  // Verify page belongs to the series (walk page → scene → act → issue → series)
  const verified = await verifyPanelInSeries(supabase, pageId, seriesId) // Reuse panel verification pattern but for pages
  // Actually need a page verification function — add verifyPageInSeries helper
  await supabase.from('pages').update({ story_beat }).eq('id', pageId)
  return { success: true, result: `Story beat saved to page.` }
}
```

Add `update_page_story_beat: 'story_beats'` to the `TOOL_TO_CAPTURE_KEY` mapping in GuidedMode.

**F9. Create `/api/scaffold/route.ts` API endpoint.**
The `scaffold.ts` library function uses `@anthropic-ai/sdk` which requires a server-side API key. Create:

```typescript
// src/app/api/scaffold/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scaffoldPanelsFromBeat } from '@/lib/ai/scaffold'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pageId, seriesId } = await req.json()

  // Fetch page with scene context
  const { data: page } = await supabase
    .from('pages').select('id, story_beat, scene_id, scenes(title, plotline:plotlines(name), characters_present, location:locations(name))')
    .eq('id', pageId).single()

  if (!page?.story_beat) return NextResponse.json({ error: 'No story beat on page' }, { status: 400 })

  // Fetch writer profile
  const { data: profile } = await supabase
    .from('writer_profiles').select('profile_text').eq('user_id', user.id).single()

  const panels = await scaffoldPanelsFromBeat({
    storyBeat: page.story_beat,
    sceneContext: { title: page.scenes?.title, plotline: page.scenes?.plotline?.name },
    writerProfile: profile?.profile_text,
  })

  return NextResponse.json({ panels })
}
```

The IssueEditor handler should call this endpoint, then insert the returned panels into the database and mark them as drafts.

**F10. Implement all type handlers in HarvestReview `saveApproved`.**
The `saveApproved` function must handle all 7 item types, not just `project_note`. Add cases for:
- `story_beat`: Parse destination for page number, find page ID, update `pages.story_beat`
- `scene_description`: Parse for scene, update `scenes.notes` or `scenes.title`
- `panel_draft`: Create panel in target page with `visual_description`
- `character_detail`: Update matching character record
- `location_detail`: Create or update location
- `dialogue_line`: Create dialogue block in target panel

For destination parsing, have the harvest prompt return structured `destination` objects (e.g., `{ type: 'page', pageNumber: 8 }`) rather than free-text strings.

**F11. Remove drafting phase `activeMoves` addition.**
The `drafting` phase has `hardNos` including "Stay quiet unless spoken to." Adding active proposal behavior conflicts. Remove the drafting phase addition from Task 7. Keep structure and page_craft additions only.

**F12. Own `draftPanelIds` in IssueEditor, not PageEditor.**
Move the `draftPanelIds` state to `IssueEditor` (survives page navigation) and pass it down as a prop to `PageEditor`. When the scaffold handler creates panels, add their IDs to this set. When PageEditor detects an edit on a draft panel (any field blur, not just visual description), call back to IssueEditor to remove that ID.

**F13. Clear draft badge on ANY field edit, not just visual description.**
The blur handler that checks `draftPanelIds` should fire on visual description, dialogue, caption, and SFX blur — not only visual description. Use a shared `handleDraftFieldBlur(panelId)` callback.

**F14. Harvest endpoint: add session ownership check + rate limiting.**
In `/api/guide/harvest/route.ts`, verify the session belongs to the user:
```typescript
const { data: session } = await supabase
  .from('guided_sessions').select('id').eq('id', sessionId).eq('user_id', user.id).single()
if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
```
Import and apply rate limiting from `@/lib/rate-limit` matching the pattern in `/api/chat/route.ts`.

**F15. Guard against large conversations in harvest.**
Before building `conversationText`, truncate to last ~100 messages or ~100K characters to stay within input token budget.

**F16. Include `ACTIVE_CAPTURE_INSTRUCTIONS` only in guide mode.**
In `buildSystemPrompt`, conditionally include the active capture block:
```typescript
if (mode === 'guide') {
  sections.push(ACTIVE_CAPTURE_INSTRUCTIONS)
}
```

### Chunk 3 Fixes (Section 5 — Import Pipeline Polish)

**F17. Update import server component to fetch `display_name` and `aliases`.**
In `src/app/series/[seriesId]/issues/[issueId]/import/page.tsx` (line 27), change the character query from:
```typescript
characters (id, name)
```
to:
```typescript
characters (id, name, display_name, aliases)
```
Update the `Character` interface in `ImportScript.tsx` (line 34) to match:
```typescript
interface Character {
  id: string
  name: string
  display_name?: string | null
  aliases?: string[]
}
```
This is a **prerequisite** for Task 14 — without it, alias matching is non-functional.

**F18. Add series edit permission check to rename endpoint.**
In `/api/characters/[characterId]/rename/route.ts`, after fetching the character, verify edit access:
```typescript
const { data: access } = await supabase
  .from('series_collaborators')
  .select('role')
  .eq('series_id', character.series_id)
  .eq('user_id', user.id)
  .in('role', ['owner', 'editor'])
  .maybeSingle()

const { data: series } = await supabase
  .from('series').select('user_id').eq('id', character.series_id).single()

if (!access && series?.user_id !== user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**F19. Document `SECURITY DEFINER` rationale.**
The `rename_character_in_descriptions` function uses `SECURITY DEFINER` because it needs to update panels across the series via a multi-table join that may not be expressible through RLS policies. Add a SQL comment explaining this. The authorization check in the API route (F18) ensures only authorized users can trigger this function.

**F20. Stub `onSuggestBeats` with dependency note.**
`EnrichmentChecklist`'s "Suggest beats from script" button depends on Section 4c (scaffold). If implementing Section 5 before Section 4, disable the button with a tooltip: "Available after scaffolding is enabled." Add a `TODO` comment referencing Task 11.

**F21. Add `sublabel` to SearchableSelect for optgroup replacement.**
The existing import character dropdown uses `<optgroup>` for "Existing Characters" vs "Will Be Created." The `SearchableSelect` should display `sublabel` text like "(existing)" or "(new)" next to options. This is already supported by the `Option.sublabel` field in the component.

### Chunk 4 Fixes (Section 6 — Active Writer Learning System)

**F22. Enforce Section 4c dependency in task steps.**
Add a prerequisite guard at the top of Task 20: "**PREREQUISITE:** Task 11 (scaffold.ts + draft badge) must be complete. If Section 4c is not yet implemented, skip Task 20 Step 2 (recording drafts in scaffold handler) and return to it after Task 11 is done. Without Task 11, the draft tracker has no entry point and the learning system will be inert."

**F23. Fix race condition on `ai_draft_edits` with atomic RPC.**
Replace the read-modify-write pattern in `/api/ai/draft-edit/route.ts` with an atomic Postgres function:

```sql
CREATE OR REPLACE FUNCTION append_draft_edit(
  p_user_id UUID,
  p_edit JSONB
)
RETURNS void AS $$
BEGIN
  UPDATE writer_profiles
  SET ai_draft_edits = (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM (
      SELECT elem FROM jsonb_array_elements(
        COALESCE(ai_draft_edits, '[]'::jsonb) || p_edit
      ) AS elem
      ORDER BY elem->>'timestamp' DESC
      LIMIT 200
    ) sub
  )
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
```

Then the API route simplifies to:
```typescript
await supabase.rpc('append_draft_edit', {
  p_user_id: user.id,
  p_edit: JSON.stringify({ original, edited, panelId, timestamp: new Date().toISOString() }),
})
```

**F24. Remove dead `saveDraftEdit` function from conversations.ts.**
The plan creates both a server function in `conversations.ts` and an API route. Only the API route is used. Remove `saveDraftEdit` from `conversations.ts` to avoid dead code.

**F25. Update type cast in synthesize-profile route.**
In `src/app/api/ai/synthesize-profile/route.ts`, the profile type cast (~line 48) must include `ai_draft_edits`. Add it to the type:
```typescript
const profile = data as { id: string; profile_text: string | null; tool_stats: any; conversations_since_synthesis: number; ai_draft_edits?: any[] }
```

**F26. Debounce draft-edit API calls on the client.**
In PageEditor, don't fire `/api/ai/draft-edit` on every individual blur. Instead, batch diffs client-side in an array and flush every 10 seconds or on page navigation via a `useEffect` cleanup.

---

## Chunk 1: Section 3 — Dual-Page View

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/YYYYMMDDHHMMSS_add_mirror_page_id.sql` | Add `mirror_page_id` column + reciprocal trigger |
| Create | `src/lib/mirror-diff.ts` | Compute panel alignment status (green/yellow) for mirror pairs |
| Create | `src/lib/mirror-diff.test.ts` | Tests for mirror diff logic |
| Create | `src/app/series/[seriesId]/issues/[issueId]/DualPageEditor.tsx` | Split view container rendering two PageEditor instances side by side |
| Create | `src/app/series/[seriesId]/issues/[issueId]/MirrorLinkModal.tsx` | Modal for linking/unlinking mirror page pairs |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx` | Dual-page state, spread auto-detection, split layout |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx` | Highlight both active pages + "Link Mirror" context menu item |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/PageTypeSelector.tsx` | Add mirror link/unlink option |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx` | Add `mirror_page_id` to `Page` interface |
| Modify | `src/app/globals.css` | Dual-page layout styles |

---

### Task 1: Database Migration — `mirror_page_id`

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_add_mirror_page_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add mirror_page_id to pages table for parallel page pairs (Issue 4 mirroring)
ALTER TABLE pages ADD COLUMN mirror_page_id UUID REFERENCES pages(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX idx_pages_mirror_page_id ON pages(mirror_page_id) WHERE mirror_page_id IS NOT NULL;

-- Trigger: ensure reciprocal mirroring and mutual exclusion with spreads
CREATE OR REPLACE FUNCTION enforce_mirror_rules()
RETURNS TRIGGER AS $$
BEGIN
  -- Cannot mirror self
  IF NEW.mirror_page_id = NEW.id THEN
    RAISE EXCEPTION 'A page cannot mirror itself';
  END IF;

  -- Cannot be both spread partner and mirror
  IF NEW.mirror_page_id IS NOT NULL AND NEW.linked_page_id IS NOT NULL THEN
    RAISE EXCEPTION 'A page cannot be both a spread partner and a mirror simultaneously';
  END IF;

  -- Auto-set reciprocal mirror on the partner page
  IF NEW.mirror_page_id IS NOT NULL AND (OLD IS NULL OR OLD.mirror_page_id IS DISTINCT FROM NEW.mirror_page_id) THEN
    UPDATE pages SET mirror_page_id = NEW.id WHERE id = NEW.mirror_page_id AND (mirror_page_id IS NULL OR mirror_page_id != NEW.id);
  END IF;

  -- Clear reciprocal mirror when unlinking
  IF NEW.mirror_page_id IS NULL AND OLD IS NOT NULL AND OLD.mirror_page_id IS NOT NULL THEN
    UPDATE pages SET mirror_page_id = NULL WHERE id = OLD.mirror_page_id AND mirror_page_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_mirror_rules
BEFORE INSERT OR UPDATE OF mirror_page_id ON pages
FOR EACH ROW EXECUTE FUNCTION enforce_mirror_rules();
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up` (or apply via Supabase dashboard)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add mirror_page_id column with reciprocal trigger"
```

---

### Task 2: Mirror Diff Logic

**Files:**
- Create: `src/lib/mirror-diff.ts`
- Test: `src/lib/mirror-diff.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/lib/mirror-diff.test.ts
import { describe, it, expect } from 'vitest'
import { computeMirrorAlignment, type MirrorPanelStatus } from './mirror-diff'

describe('computeMirrorAlignment', () => {
  it('returns green when panel counts match and characters match', () => {
    const left = [
      { panel_number: 1, characters_present: ['char-a', 'char-b'], dialogue_blocks: [{ text: 'hi' }] },
      { panel_number: 2, characters_present: ['char-c'], dialogue_blocks: [] },
    ]
    const right = [
      { panel_number: 1, characters_present: ['char-a', 'char-b'], dialogue_blocks: [{ text: 'hello' }] },
      { panel_number: 2, characters_present: ['char-c'], dialogue_blocks: [{ text: 'yo' }] },
    ]
    const result = computeMirrorAlignment(left, right)
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('green')
    expect(result[1].status).toBe('yellow') // right has dialogue, left doesn't
  })

  it('returns yellow when panel counts differ', () => {
    const left = [{ panel_number: 1, characters_present: ['a'], dialogue_blocks: [] }]
    const right = [
      { panel_number: 1, characters_present: ['a'], dialogue_blocks: [] },
      { panel_number: 2, characters_present: ['b'], dialogue_blocks: [] },
    ]
    const result = computeMirrorAlignment(left, right)
    // Should still align panel 1 pair, and show panel 2 as unmatched
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0].status).toBe('green')
    expect(result[1].status).toBe('yellow')
  })

  it('returns yellow when characters differ on corresponding panels', () => {
    const left = [{ panel_number: 1, characters_present: ['a'], dialogue_blocks: [] }]
    const right = [{ panel_number: 1, characters_present: ['b'], dialogue_blocks: [] }]
    const result = computeMirrorAlignment(left, right)
    expect(result[0].status).toBe('yellow')
  })

  it('handles empty panels arrays', () => {
    const result = computeMirrorAlignment([], [])
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mirror-diff.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mirror-diff.ts**

```typescript
// src/lib/mirror-diff.ts
export interface MirrorPanel {
  panel_number: number
  characters_present: string[]
  dialogue_blocks: { text: string | null }[]
}

export interface MirrorPanelStatus {
  leftIndex: number | null  // null = unmatched
  rightIndex: number | null
  status: 'green' | 'yellow'
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every(item => setA.has(item))
}

function hasDialogue(panel: MirrorPanel): boolean {
  return panel.dialogue_blocks.some(d => d.text && d.text.trim().length > 0)
}

export function computeMirrorAlignment(
  leftPanels: MirrorPanel[],
  rightPanels: MirrorPanel[]
): MirrorPanelStatus[] {
  const maxLen = Math.max(leftPanels.length, rightPanels.length)
  const results: MirrorPanelStatus[] = []

  for (let i = 0; i < maxLen; i++) {
    const left = leftPanels[i] ?? null
    const right = rightPanels[i] ?? null

    if (!left || !right) {
      results.push({ leftIndex: left ? i : null, rightIndex: right ? i : null, status: 'yellow' })
      continue
    }

    const charsMatch = setsEqual(left.characters_present || [], right.characters_present || [])
    const dialogueMatch = hasDialogue(left) === hasDialogue(right)

    results.push({
      leftIndex: i,
      rightIndex: i,
      status: charsMatch && dialogueMatch ? 'green' : 'yellow',
    })
  }

  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mirror-diff.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mirror-diff.ts src/lib/mirror-diff.test.ts
git commit -m "feat: mirror diff alignment logic with tests"
```

---

### Task 3: DualPageEditor Component

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/DualPageEditor.tsx`

This component renders two page editors side by side. It handles both spread mode (two independently editable pages) and mirror mode (panel-level horizontal alignment with diff indicators).

- [ ] **Step 1: Create DualPageEditor.tsx**

```typescript
// src/app/series/[seriesId]/issues/[issueId]/DualPageEditor.tsx
'use client'

import { useMemo, useState } from 'react'
import PageEditor from './PageEditor'
import { computeMirrorAlignment, type MirrorPanelStatus } from '@/lib/mirror-diff'

interface DualPageEditorProps {
  leftPage: any
  rightPage: any
  leftPageContext: any
  rightPageContext: any
  characters: any[]
  locations: any[]
  seriesId: string
  scenePages: any[]
  onUpdate: () => void
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
  filedNotes: any[]
  onNavigateToPage: (direction: 'prev' | 'next') => void
  mode: 'spread' | 'mirror' | 'compare'
  isVertical: boolean
  onClose?: () => void  // close split view (for compare mode)
}

export default function DualPageEditor({
  leftPage, rightPage, leftPageContext, rightPageContext,
  characters, locations, seriesId, scenePages,
  onUpdate, setSaveStatus, filedNotes, onNavigateToPage,
  mode, isVertical, onClose,
}: DualPageEditorProps) {
  // Mirror alignment indicators
  const mirrorAlignment = useMemo(() => {
    if (mode !== 'mirror') return null
    const leftPanels = (leftPage.panels || []).map((p: any) => ({
      panel_number: p.panel_number,
      characters_present: p.characters_present || [],
      dialogue_blocks: p.dialogue_blocks || [],
    }))
    const rightPanels = (rightPage.panels || []).map((p: any) => ({
      panel_number: p.panel_number,
      characters_present: p.characters_present || [],
      dialogue_blocks: p.dialogue_blocks || [],
    }))
    return computeMirrorAlignment(leftPanels, rightPanels)
  }, [mode, leftPage.panels, rightPage.panels])

  return (
    <div className={`dual-page-editor ${isVertical ? 'dual-page-editor--vertical' : ''}`}>
      {/* Mode indicator bar */}
      <div className="dual-page-editor__header">
        <span className="type-micro text-[var(--text-muted)]">
          {mode === 'spread' ? 'SPREAD VIEW' : mode === 'mirror' ? 'MIRROR VIEW' : 'COMPARE VIEW'}
        </span>
        {onClose && (
          <button onClick={onClose} className="type-micro hover-fade text-[var(--text-muted)]">
            [CLOSE SPLIT]
          </button>
        )}
      </div>

      <div className={`dual-page-editor__panes ${isVertical ? 'flex-col' : ''}`}>
        {/* Left pane */}
        <div className="dual-page-editor__pane">
          <PageEditor
            page={leftPage}
            pageContext={leftPageContext}
            characters={characters}
            locations={locations}
            seriesId={seriesId}
            scenePages={scenePages}
            onUpdate={onUpdate}
            setSaveStatus={setSaveStatus}
            filedNotes={filedNotes.filter((n: any) => n.filed_to_page_id === leftPage.id)}
            onNavigateToPage={onNavigateToPage}
          />
        </div>

        {/* Mirror alignment gutter (mirror mode only) */}
        {mode === 'mirror' && mirrorAlignment && (
          <div className="dual-page-editor__gutter">
            {mirrorAlignment.map((status, i) => (
              <div
                key={i}
                className={`dual-page-editor__gutter-dot ${
                  status.status === 'green' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'
                }`}
                title={status.status === 'green' ? 'Panels aligned' : 'Panels diverge'}
              />
            ))}
          </div>
        )}

        {/* Right pane */}
        <div className="dual-page-editor__pane">
          <PageEditor
            page={rightPage}
            pageContext={rightPageContext}
            characters={characters}
            locations={locations}
            seriesId={seriesId}
            scenePages={scenePages}
            onUpdate={onUpdate}
            setSaveStatus={setSaveStatus}
            filedNotes={filedNotes.filter((n: any) => n.filed_to_page_id === rightPage.id)}
            onNavigateToPage={onNavigateToPage}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for dual-page layout to globals.css**

Add to `src/app/globals.css`:

```css
/* ── Dual-page editor layout ── */
.dual-page-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.dual-page-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}
.dual-page-editor__panes {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.dual-page-editor__pane {
  flex: 1;
  overflow-y: auto;
  border-right: 1px solid var(--border);
}
.dual-page-editor__pane:last-of-type {
  border-right: none;
}
.dual-page-editor--vertical .dual-page-editor__panes {
  flex-direction: column;
}
.dual-page-editor--vertical .dual-page-editor__pane {
  border-right: none;
  border-bottom: 1px solid var(--border);
}
.dual-page-editor--vertical .dual-page-editor__pane:last-of-type {
  border-bottom: none;
}
.dual-page-editor__gutter {
  width: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 120px; /* align roughly with panel cards */
  background: var(--bg-tertiary);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}
.dual-page-editor__gutter-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/DualPageEditor.tsx src/app/globals.css
git commit -m "feat: DualPageEditor split view component with mirror gutter"
```

---

### Task 4: MirrorLinkModal Component

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/MirrorLinkModal.tsx`

- [ ] **Step 1: Create the modal**

```typescript
// src/app/series/[seriesId]/issues/[issueId]/MirrorLinkModal.tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface MirrorLinkModalProps {
  pageId: string
  pageNumber: number
  currentMirrorId: string | null
  availablePages: { id: string; page_number: number }[]
  onDone: () => void
  onCancel: () => void
}

export default function MirrorLinkModal({
  pageId, pageNumber, currentMirrorId, availablePages, onDone, onCancel,
}: MirrorLinkModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(currentMirrorId)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()

    // Clear old mirror link if changing
    if (currentMirrorId && currentMirrorId !== selectedId) {
      await supabase.from('pages').update({ mirror_page_id: null }).eq('id', pageId)
    }

    // Set new mirror link (trigger handles reciprocal)
    if (selectedId) {
      const { error } = await supabase.from('pages').update({ mirror_page_id: selectedId }).eq('id', pageId)
      if (error) {
        showToast(`Failed to link mirror: ${error.message}`, 'error')
        setSaving(false)
        return
      }
    } else {
      await supabase.from('pages').update({ mirror_page_id: null }).eq('id', pageId)
    }

    showToast(selectedId ? `Page ${pageNumber} mirrored` : 'Mirror link removed', 'success')
    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="modal-backdrop" />
      <div
        className="relative bg-[var(--bg-primary)] border border-[var(--border-strong)] shadow-xl p-6 w-80 z-10"
        style={{ animation: 'modal-dialog 200ms ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="type-section mb-4">Link Mirror Page</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Select a page to mirror alongside Page {pageNumber}. Mirrored pages show
          panel-level alignment indicators.
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
          <button
            onClick={() => setSelectedId(null)}
            className={`w-full px-3 py-2 text-left text-sm rounded ${!selectedId ? 'bg-[var(--bg-tertiary)] font-medium' : 'hover:bg-[var(--bg-secondary)]'}`}
          >
            No mirror
          </button>
          {availablePages.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full px-3 py-2 text-left text-sm rounded ${selectedId === p.id ? 'bg-[var(--bg-tertiary)] font-medium' : 'hover:bg-[var(--bg-secondary)]'}`}
            >
              Page {p.page_number}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="hover-fade type-micro px-3 py-1.5 text-[var(--text-muted)]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="hover-lift type-micro px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)]"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/MirrorLinkModal.tsx
git commit -m "feat: MirrorLinkModal for linking page pairs"
```

---

### Task 5: Wire Dual-Page View into IssueEditor

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`

This is the integration task. Changes needed:
1. Add `dualPageMode` state: `'single' | 'spread' | 'mirror' | 'compare'`
2. Add `secondPageId` state for the right-side page
3. Add `dualVertical` toggle state
4. Auto-detect spread mode when navigating to a spread-linked page
5. Auto-detect mirror mode when navigating to a mirror-linked page
6. Add "expand to split" button to the floating reference panel
7. Render `DualPageEditor` when in dual mode instead of single `PageEditor`
8. Highlight both pages in NavigationTree

- [ ] **Step 1: Add dual-page state and auto-detection**

In `IssueEditor.tsx`, add these state variables near the existing `selectedPageId` state (~line 90):

```typescript
const [dualPageMode, setDualPageMode] = useState<'single' | 'spread' | 'mirror' | 'compare'>('single')
const [secondPageId, setSecondPageId] = useState<string | null>(null)
const [dualVertical, setDualVertical] = useState(false)
```

Add an effect that auto-detects spread/mirror after `selectedPageId` or issue data changes:

```typescript
// Auto-detect dual-page mode from page relationships
useEffect(() => {
  if (!selectedPage) {
    setDualPageMode('single')
    setSecondPageId(null)
    return
  }
  // Don't override manual compare mode
  if (dualPageMode === 'compare') return

  const pageType = selectedPage.page_type || 'SINGLE'
  if ((pageType === 'SPREAD_LEFT' || pageType === 'SPREAD_RIGHT') && selectedPage.linked_page_id) {
    setDualPageMode('spread')
    setSecondPageId(selectedPage.linked_page_id)
  } else if (selectedPage.mirror_page_id) {
    setDualPageMode('mirror')
    setSecondPageId(selectedPage.mirror_page_id)
  } else if (dualPageMode !== 'compare') {
    setDualPageMode('single')
    setSecondPageId(null)
  }
}, [selectedPage?.id, selectedPage?.page_type, selectedPage?.linked_page_id, selectedPage?.mirror_page_id])
```

Add a memo to find the second page's data and context:

```typescript
const secondPageContext = useMemo(() => {
  if (!secondPageId) return null
  for (const act of (issue.acts || [])) {
    for (const scene of (act.scenes || [])) {
      const pageIndex = (scene.pages || []).findIndex((p: any) => p.id === secondPageId)
      if (pageIndex !== -1) {
        const page = scene.pages[pageIndex]
        return {
          page,
          act: { id: act.id, name: act.name, number: act.number, sort_order: act.sort_order },
          scene: {
            id: scene.id,
            name: scene.title || scene.name,
            sort_order: scene.sort_order,
            plotline_name: scene.plotline?.name || null,
            total_pages: (scene.pages || []).length,
          },
          pagePositionInScene: pageIndex + 1,
        }
      }
    }
  }
  return null
}, [issue, secondPageId])
```

- [ ] **Step 2: Update the floating reference panel with "expand to split" button**

In the floating reference panel section (~line 1266), after the "Close" button, add:

```typescript
<button
  onClick={() => {
    setSecondPageId(floatingRefPageId)
    setDualPageMode('compare')
    setFloatingRefPageId(null)
  }}
  className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
>
  Expand to split
</button>
```

- [ ] **Step 3: Replace single PageEditor with conditional DualPageEditor**

In the center panel section (~line 1197), replace the single-page rendering with a conditional:

```typescript
centerPanel={
  <div className="editor-center-column h-full flex flex-col">
    {selectedPage ? (
      <div className="flex flex-col h-full">
        <PreviousPageContext
          previousPage={previousPageData?.page || null}
          sceneName={previousPageData?.sceneName}
        />
        {pagePosition && (
          <div className="px-4 py-1.5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] text-xs text-[var(--text-muted)] flex items-center justify-between">
            <span>
              Page {pagePosition.pageNumber} of {pagePosition.total}
              {pagePosition.actName && ` — ${pagePosition.actName}`}
              {pagePosition.sceneTitle && `, ${pagePosition.sceneTitle}`}
            </span>
            <div className="flex items-center gap-2">
              {dualPageMode !== 'single' && (
                <button
                  onClick={() => setDualVertical(!dualVertical)}
                  className="type-micro hover-fade text-[var(--text-muted)]"
                >
                  {dualVertical ? '↔' : '↕'}
                </button>
              )}
              <span className="text-[var(--text-muted)]">
                {pagePosition.current}/{pagePosition.total}
              </span>
            </div>
          </div>
        )}
        {dualPageMode !== 'single' && secondPageContext ? (
          <DualPageEditor
            leftPage={selectedPage}
            rightPage={secondPageContext.page}
            leftPageContext={selectedPageContext}
            rightPageContext={secondPageContext}
            characters={issue.series.characters}
            locations={issue.series.locations}
            seriesId={seriesId}
            scenePages={currentScenePages}
            onUpdate={refreshIssue}
            setSaveStatus={setSaveStatus}
            filedNotes={filedNotes}
            onNavigateToPage={navigateToPage}
            mode={dualPageMode as 'spread' | 'mirror' | 'compare'}
            isVertical={dualVertical}
            onClose={dualPageMode === 'compare' ? () => {
              setDualPageMode('single')
              setSecondPageId(null)
            } : undefined}
          />
        ) : (
          <div key={selectedPage.id} className="flex-1 overflow-y-auto animate-page-crossfade">
            <PageEditor
              page={selectedPage}
              pageContext={selectedPageContext}
              characters={issue.series.characters}
              locations={issue.series.locations}
              seriesId={seriesId}
              scenePages={currentScenePages}
              onUpdate={refreshIssue}
              setSaveStatus={setSaveStatus}
              filedNotes={filedNotes.filter(n => n.filed_to_page_id === selectedPage?.id)}
              onNavigateToPage={navigateToPage}
            />
          </div>
        )}
      </div>
    ) : (
      /* existing empty state */
    )}
  </div>
}
```

- [ ] **Step 4: Pass secondPageId to NavigationTree for dual highlight**

Update NavigationTree props to accept `secondSelectedPageId`:

```typescript
<NavigationTree
  ...existing props...
  secondSelectedPageId={secondPageId}
/>
```

In `NavigationTree.tsx`, add the prop to the interface and apply a secondary highlight class to pages matching `secondSelectedPageId`. Use existing selection styles but with a muted variant (e.g., `bg-[var(--bg-tertiary)]` instead of `bg-[var(--color-primary)]/10`).

- [ ] **Step 5: Add PageTypeSelector mirror option**

In `PageTypeSelector.tsx`, add a "MIRROR" option alongside existing SPREAD_LEFT/SPREAD_RIGHT. When selected, open `MirrorLinkModal` to choose the partner page. When unlinking, set `mirror_page_id` to null.

- [ ] **Step 6: Run manual verification**

Test the following scenarios:
1. Navigate to a SPREAD_LEFT page → both spread pages appear side by side
2. Navigate to a page with `mirror_page_id` → mirror view with alignment dots
3. Alt+Click nav tree → floating panel → "Expand to split" → compare mode
4. Close split view → return to single page
5. Vertical toggle works

- [ ] **Step 7: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx \
        src/app/series/[seriesId]/issues/[issueId]/NavigationTree.tsx \
        src/app/series/[seriesId]/issues/[issueId]/PageTypeSelector.tsx
git commit -m "feat: dual-page view with spread, mirror, and compare modes"
```

---

## Chunk 2: Section 4 — Socratic → Scaffold Pipeline

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/guide/harvest/route.ts` | Post-session extraction endpoint |
| Create | `src/app/series/[seriesId]/guide/HarvestReview.tsx` | Batch review UI for extracted items |
| Create | `src/app/series/[seriesId]/guide/SessionCaptureTally.tsx` | Running tally sidebar component |
| Create | `src/lib/ai/scaffold.ts` | "Draft panels from beats" logic |
| Create | `src/app/api/scaffold/route.ts` | API endpoint wrapping scaffold.ts for client calls |
| Modify | `src/lib/ai/client.ts` | System prompt updates for active capture (guide mode only) |
| Modify | `src/lib/ai/curriculum.ts` | Phase behavior updates for structure + page_craft (NOT drafting) |
| Modify | `src/lib/ai/tools.ts` | Add `update_page_story_beat` tool definition + executor |
| Modify | `src/app/series/[seriesId]/guide/GuidedMode.tsx` | Harvest button, tally integration |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx` | "Draft panels from beats" action |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx` | Draft badge visual treatment |
| Modify | `src/app/globals.css` | Draft badge CSS |

---

### Task 6: Session Capture Tally Component

**Files:**
- Create: `src/app/series/[seriesId]/guide/SessionCaptureTally.tsx`

- [ ] **Step 1: Create the tally component**

```typescript
// src/app/series/[seriesId]/guide/SessionCaptureTally.tsx
'use client'

interface CaptureTallyProps {
  captures: {
    story_beats: number
    scene_descriptions: number
    panel_drafts: number
    characters: number
    locations: number
    plotlines: number
    canvas_items: number
    project_notes: number
  }
}

const TALLY_LABELS: Record<string, string> = {
  story_beats: 'story beats placed',
  scene_descriptions: 'scene descriptions updated',
  panel_drafts: 'panel drafts',
  characters: 'characters created',
  locations: 'locations created',
  plotlines: 'plotlines created',
  canvas_items: 'canvas items saved',
  project_notes: 'project notes saved',
}

export default function SessionCaptureTally({ captures }: CaptureTallyProps) {
  const entries = Object.entries(captures).filter(([, count]) => count > 0)
  if (entries.length === 0) return null

  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
      <div className="type-micro text-[var(--text-muted)] mb-1">
        SESSION CAPTURES ({total})
      </div>
      <div className="space-y-0.5">
        {entries.map(([key, count]) => (
          <div key={key} className="text-xs text-[var(--text-secondary)]">
            {count} {TALLY_LABELS[key] || key}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/guide/SessionCaptureTally.tsx
git commit -m "feat: session capture tally component"
```

---

### Task 7: Update AI System Prompt for Active Capture

**Files:**
- Modify: `src/lib/ai/client.ts`
- Modify: `src/lib/ai/curriculum.ts`

The key change is behavioral: the AI should actively propose placements as decisions crystallize during Socratic sessions. This is done by updating the system prompt and phase behaviors.

- [ ] **Step 1: Add active capture instruction to client.ts**

In `src/lib/ai/client.ts`, inside the `buildSystemPrompt` function, add a new section to the guide-mode system prompt (after the phase instructions):

```typescript
// Add to the guide-mode system prompt section:
const ACTIVE_CAPTURE_INSTRUCTIONS = `
## Active Capture Protocol
When a creative decision crystallizes during conversation — a story beat, a scene description, a character detail — you should ACTIVELY PROPOSE saving it using your tools. Don't wait to be asked.

Pattern:
1. The writer describes or agrees to something concrete (a beat, a character trait, a scene detail)
2. You acknowledge it conversationally AND propose saving it: "That's a strong beat for page 8 — want me to save it as the story beat?"
3. If they confirm, execute the appropriate tool immediately
4. If they redirect ("actually that's page 10"), adjust and re-propose

Tools to use proactively:
- update_scene_metadata: When scene descriptions, titles, or intentions are decided
- draft_panel_description: When specific visual moments are described
- save_canvas_beat: When ideas are still forming but worth capturing
- save_project_note: When decisions, open questions, or insights emerge
- create_character / update_character: When character details crystallize
- create_location: When a new location is described
- add_dialogue: When specific lines of dialogue are workshopped

DO NOT propose saving vague or exploratory material. Only propose when something feels decided.
DO NOT save anything without the writer's explicit confirmation.
`
```

- [ ] **Step 2: Update curriculum.ts phase behaviors**

In `src/lib/ai/curriculum.ts`, update the `activeMoves` for each relevant phase to include capture behavior:

For `structure` phase, add to `activeMoves`:
```
"Propose saving crystallized beats as story_beat on pages or canvas items"
```

For `page_craft` phase, add to `activeMoves`:
```
"Propose saving visual moments as draft panel descriptions when specific enough"
```

For `drafting` phase, add to `activeMoves`:
```
"Propose saving scene metadata updates as they're refined in conversation"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/client.ts src/lib/ai/curriculum.ts
git commit -m "feat: active capture protocol in AI system prompt and phase behaviors"
```

---

### Task 8: Post-Session Harvest Endpoint

**Files:**
- Create: `src/app/api/guide/harvest/route.ts`

- [ ] **Step 1: Create the harvest route**

```typescript
// src/app/api/guide/harvest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await req.json()
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  // Load guided session messages
  const { data: messages, error } = await supabase
    .from('guided_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error || !messages?.length) {
    return NextResponse.json({ error: 'No messages found' }, { status: 404 })
  }

  // Build conversation text for extraction
  const conversationText = messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: `You are reviewing a creative writing session conversation. Extract ALL actionable items that were discussed but NOT yet saved to the project database. Group them by type.

For each item, provide:
- type: one of "story_beat", "scene_description", "panel_draft", "character_detail", "location_detail", "project_note", "dialogue_line"
- content: the actual content to save
- destination: where it should go (e.g., "Page 8 story beat", "Scene 3 description", "New character: Marcus")
- confidence: how certain you are this was decided vs. just explored (high/medium/low)

Only extract items that feel DECIDED in the conversation, not exploratory musings. If the writer workshopped 5 versions of a line and settled on one, extract only the final version.

Return JSON array: [{ type, content, destination, confidence }]
Return an empty array [] if nothing actionable was left uncaptured.`,
    messages: [{ role: 'user', content: conversationText }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse JSON from response
  let items = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) items = JSON.parse(match[0])
  } catch {
    items = []
  }

  return NextResponse.json({ items })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/guide/harvest/route.ts
git commit -m "feat: post-session harvest API endpoint"
```

---

### Task 9: Harvest Review UI Component

**Files:**
- Create: `src/app/series/[seriesId]/guide/HarvestReview.tsx`

- [ ] **Step 1: Create the batch review component**

This component receives the array of extracted items from the harvest endpoint and lets the writer approve, reject, or redirect each one. Approved items are written to the database using the appropriate tool executors.

Key features:
- Items grouped by type (story beats, scene descriptions, panel drafts, etc.)
- Each item shows content, proposed destination, confidence badge
- Approve/Reject/Redirect buttons per item
- "Approve all high-confidence" bulk action
- A text input for redirect destination when the writer wants to change where something goes
- On approve, call the appropriate Supabase insert/update (same logic as `executeToolCall` in tools.ts but client-side)

```typescript
// src/app/series/[seriesId]/guide/HarvestReview.tsx
'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface HarvestItem {
  type: string
  content: string
  destination: string
  confidence: 'high' | 'medium' | 'low'
  status?: 'pending' | 'approved' | 'rejected' | 'redirected'
  redirectDestination?: string
}

interface HarvestReviewProps {
  items: HarvestItem[]
  seriesId: string
  issueId?: string
  onDone: () => void
}

const TYPE_LABELS: Record<string, string> = {
  story_beat: 'Story Beats',
  scene_description: 'Scene Descriptions',
  panel_draft: 'Panel Drafts',
  character_detail: 'Character Details',
  location_detail: 'Location Details',
  project_note: 'Project Notes',
  dialogue_line: 'Dialogue Lines',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-[var(--color-success)]',
  medium: 'text-[var(--color-warning)]',
  low: 'text-[var(--text-muted)]',
}

export default function HarvestReview({ items: initialItems, seriesId, issueId, onDone }: HarvestReviewProps) {
  const [items, setItems] = useState<HarvestItem[]>(
    initialItems.map(i => ({ ...i, status: 'pending' }))
  )
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const updateItem = (index: number, updates: Partial<HarvestItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }

  const approveAllHighConfidence = () => {
    setItems(prev => prev.map(item =>
      item.confidence === 'high' && item.status === 'pending'
        ? { ...item, status: 'approved' }
        : item
    ))
  }

  const saveApproved = useCallback(async () => {
    setSaving(true)
    const approved = items.filter(i => i.status === 'approved')
    const supabase = createClient()

    for (const item of approved) {
      try {
        if (item.type === 'project_note') {
          await supabase.from('project_notes').insert({
            series_id: seriesId,
            content: item.content,
            type: 'AI_INSIGHT',
            source: 'harvest',
          })
        }
        // Additional type handlers would go here, following the pattern in tools.ts executeToolCall
        // story_beat → update pages.story_beat
        // scene_description → update scenes.notes
        // character_detail → update characters fields
        // etc.
      } catch (e) {
        console.error('Failed to save harvest item:', e)
      }
    }

    showToast(`${approved.length} items saved`, 'success')
    setSaving(false)
    onDone()
  }, [items, seriesId, showToast, onDone])

  // Group items by type
  const grouped = items.reduce<Record<string, { item: HarvestItem; index: number }[]>>((acc, item, index) => {
    const key = item.type
    if (!acc[key]) acc[key] = []
    acc[key].push({ item, index })
    return acc
  }, {})

  const pendingCount = items.filter(i => i.status === 'pending').length
  const approvedCount = items.filter(i => i.status === 'approved').length

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="type-label">Harvest Review — {items.length} items found</h3>
        <div className="flex gap-2">
          <button
            onClick={approveAllHighConfidence}
            className="hover-lift type-micro px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)]"
          >
            Approve all high-confidence
          </button>
          <button
            onClick={saveApproved}
            disabled={saving || approvedCount === 0}
            className="hover-lift type-micro px-3 py-1.5 border border-[var(--color-primary)] text-[var(--color-primary)]"
          >
            {saving ? 'Saving...' : `Save ${approvedCount} approved`}
          </button>
        </div>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {Object.entries(grouped).map(([type, entries]) => (
          <div key={type}>
            <h4 className="type-micro text-[var(--text-muted)] mb-2">{TYPE_LABELS[type] || type}</h4>
            <div className="space-y-2">
              {entries.map(({ item, index }) => (
                <div
                  key={index}
                  className={`p-3 rounded border ${
                    item.status === 'approved' ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/5' :
                    item.status === 'rejected' ? 'border-[var(--border)] opacity-40' :
                    'border-[var(--border)] bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{item.content}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        → {item.redirectDestination || item.destination}
                        <span className={`ml-2 ${CONFIDENCE_COLORS[item.confidence]}`}>
                          ({item.confidence})
                        </span>
                      </p>
                    </div>
                    {item.status === 'pending' && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => updateItem(index, { status: 'approved' })}
                          className="type-micro px-2 py-1 hover-fade text-[var(--color-success)]">✓</button>
                        <button onClick={() => updateItem(index, { status: 'rejected' })}
                          className="type-micro px-2 py-1 hover-fade text-[var(--text-muted)]">✗</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/guide/HarvestReview.tsx
git commit -m "feat: harvest batch review UI component"
```

---

### Task 10: Wire Tally + Harvest into GuidedMode

**Files:**
- Modify: `src/app/series/[seriesId]/guide/GuidedMode.tsx`

- [ ] **Step 1: Add capture tally tracking**

In the GuidedMode component, add state to track tool executions during the session:

```typescript
const [sessionCaptures, setSessionCaptures] = useState({
  story_beats: 0, scene_descriptions: 0, panel_drafts: 0,
  characters: 0, locations: 0, plotlines: 0,
  canvas_items: 0, project_notes: 0,
})
```

When a tool proposal is accepted (in the existing tool acceptance handler), increment the relevant counter:

```typescript
const TOOL_TO_CAPTURE_KEY: Record<string, string> = {
  update_scene_metadata: 'scene_descriptions',
  draft_panel_description: 'panel_drafts',
  create_character: 'characters',
  update_character: 'characters',
  create_location: 'locations',
  create_plotline: 'plotlines',
  save_canvas_beat: 'canvas_items',
  save_project_note: 'project_notes',
}

// In tool acceptance handler:
const captureKey = TOOL_TO_CAPTURE_KEY[toolName]
if (captureKey) {
  setSessionCaptures(prev => ({ ...prev, [captureKey]: prev[captureKey as keyof typeof prev] + 1 }))
}
```

- [ ] **Step 2: Add SessionCaptureTally to the guide layout**

Import and render `SessionCaptureTally` in the sidebar or below the chat area.

- [ ] **Step 3: Add harvest button and HarvestReview**

Add a "Harvest" button that appears when the session has messages. On click, call `/api/guide/harvest` with the session ID, then render `HarvestReview` with the results inline below the chat.

```typescript
const [harvestItems, setHarvestItems] = useState<any[] | null>(null)
const [harvesting, setHarvesting] = useState(false)

const handleHarvest = async () => {
  if (!sessionId) return
  setHarvesting(true)
  const res = await fetch('/api/guide/harvest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const { items } = await res.json()
  setHarvestItems(items || [])
  setHarvesting(false)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/series/[seriesId]/guide/GuidedMode.tsx
git commit -m "feat: wire session capture tally and harvest into Guided Mode"
```

---

### Task 11: Page Scaffolding — Draft Panels from Beats

**Files:**
- Create: `src/lib/ai/scaffold.ts`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Create scaffold.ts**

```typescript
// src/lib/ai/scaffold.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface ScaffoldInput {
  storyBeat: string
  sceneContext: {
    title?: string
    plotline?: string
    characters?: string[]
    location?: string
  }
  writerProfile?: string | null
  previousPageSummary?: string | null
}

interface ScaffoldedPanel {
  panel_number: number
  visual_description: string
  shot_type?: string
  dialogue?: { speaker: string; text: string; type: string }[]
}

export async function scaffoldPanelsFromBeat(input: ScaffoldInput): Promise<ScaffoldedPanel[]> {
  const { storyBeat, sceneContext, writerProfile, previousPageSummary } = input

  let contextParts: string[] = []
  if (sceneContext.title) contextParts.push(`Scene: ${sceneContext.title}`)
  if (sceneContext.plotline) contextParts.push(`Plotline: ${sceneContext.plotline}`)
  if (sceneContext.characters?.length) contextParts.push(`Characters in scene: ${sceneContext.characters.join(', ')}`)
  if (sceneContext.location) contextParts.push(`Location: ${sceneContext.location}`)
  if (previousPageSummary) contextParts.push(`Previous page: ${previousPageSummary}`)

  const systemPrompt = `You are drafting comic panel descriptions for a professional comic book script.

${writerProfile ? `Writer's style profile:\n${writerProfile}\n` : ''}

Rules:
- Draft 4-7 panels for one page based on the story beat
- Each panel needs a visual description written in present tense, camera-direction style
- Character names in ALL CAPS in descriptions
- Match the density to the beat's specificity: vague beats get sparse directional notes, detailed beats get fuller descriptions
- Only include dialogue if the beat specifically mentions spoken exchanges
- Include shot type suggestions (wide, medium, close, extreme_close, pov)
- Think cinematically: establish location, then focus, then payoff

Return JSON array: [{ panel_number, visual_description, shot_type, dialogue?: [{ speaker, text, type }] }]`

  const userMessage = `Story beat for this page: "${storyBeat}"

Context:
${contextParts.join('\n')}

Draft the panel descriptions.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
  } catch {
    // Fall through
  }

  return []
}
```

- [ ] **Step 2: Add "Draft panels from beats" action to IssueEditor**

In `IssueEditor.tsx`, add a handler that:
1. Checks the current page has a `story_beat` and no existing panels
2. Calls `scaffoldPanelsFromBeat` via a new API route (or inline if acceptable)
3. Creates draft panels in the database
4. Marks them as drafts in local state

Add to the page position indicator bar or as a button in the empty panel state:

```typescript
// In the empty panels state of PageEditor, or as a button next to "CREATE FIRST PANEL":
{selectedPage?.story_beat && (!selectedPage?.panels || selectedPage.panels.length === 0) && (
  <button
    onClick={handleDraftPanelsFromBeat}
    className="hover-lift type-micro px-3 py-1.5 border border-[var(--color-primary)] text-[var(--color-primary)] ml-2"
  >
    [DRAFT FROM BEAT]
  </button>
)}
```

The handler should call a new `/api/scaffold` endpoint or use a server action.

- [ ] **Step 3: Add draft badge CSS to globals.css**

```css
/* ── Draft badge for AI-generated content ── */
.panel-card--draft {
  background: var(--bg-secondary);
  border-left: 3px solid var(--color-primary);
  position: relative;
}
.panel-card--draft::before {
  content: 'DRAFT';
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--color-primary);
  background: var(--color-primary-surface, rgba(59, 59, 181, 0.1));
  padding: 2px 6px;
  border-radius: 2px;
  z-index: 1;
}
```

- [ ] **Step 4: Track draft panels in PageEditor state**

In `PageEditor.tsx`, add a `draftPanelIds` Set to track which panels are AI-generated. The draft badge CSS class is applied to panels in this set. When the user edits a draft panel's visual description (on blur), remove it from the set — the badge disappears.

```typescript
const [draftPanelIds, setDraftPanelIds] = useState<Set<string>>(new Set())

// On panel edit blur:
if (draftPanelIds.has(panelId)) {
  setDraftPanelIds(prev => {
    const next = new Set(prev)
    next.delete(panelId)
    return next
  })
}
```

Pass `draftPanelIds` as a prop from IssueEditor after scaffolding, or track it in a ref that persists across page navigation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/scaffold.ts \
        src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx \
        src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx \
        src/app/globals.css
git commit -m "feat: draft panels from beats scaffolding with DRAFT badge"
```

---

## Chunk 3: Section 5 — Import Pipeline Polish

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/character-matching.ts` | Alias-aware character matching logic |
| Create | `src/lib/character-matching.test.ts` | Tests for matching |
| Create | `src/components/ui/SearchableSelect.tsx` | Searchable dropdown component |
| Create | `src/app/series/[seriesId]/issues/[issueId]/import/EnrichmentChecklist.tsx` | Post-import enrichment checklist |
| Create | `src/app/api/characters/[characterId]/rename/route.ts` | Batch rename API endpoint (with edit permission check) |
| Create | `supabase/migrations/YYYYMMDDHHMMSS_add_rename_function.sql` | `rename_character_in_descriptions` RPC |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/import/ImportScript.tsx` | Improved character resolution |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/import/page.tsx` | Fetch `display_name` and `aliases` in character query |
| Modify | `src/app/series/[seriesId]/characters/page.tsx` | Rename everywhere action |

---

### Task 12: Character Matching Logic

**Files:**
- Create: `src/lib/character-matching.ts`
- Test: `src/lib/character-matching.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/lib/character-matching.test.ts
import { describe, it, expect } from 'vitest'
import { matchSpeakerToCharacter, type MatchResult } from './character-matching'

const characters = [
  { id: '1', name: 'Marshall Mathers', display_name: 'MARSHALL', aliases: ['Eminem', 'Slim Shady', 'Em'] },
  { id: '2', name: 'Kimberly Scott', display_name: 'KIM', aliases: ['Kimmy'] },
  { id: '3', name: 'Stan Mitchell', display_name: 'STAN', aliases: [] },
]

describe('matchSpeakerToCharacter', () => {
  it('exact match on display_name (case-insensitive)', () => {
    const result = matchSpeakerToCharacter('MARSHALL', characters)
    expect(result.confidence).toBe('exact')
    expect(result.characterId).toBe('1')
  })

  it('exact match on name', () => {
    const result = matchSpeakerToCharacter('Marshall Mathers', characters)
    expect(result.confidence).toBe('exact')
    expect(result.characterId).toBe('1')
  })

  it('alias match', () => {
    const result = matchSpeakerToCharacter('Eminem', characters)
    expect(result.confidence).toBe('alias')
    expect(result.characterId).toBe('1')
  })

  it('alias match case-insensitive', () => {
    const result = matchSpeakerToCharacter('slim shady', characters)
    expect(result.confidence).toBe('alias')
    expect(result.characterId).toBe('1')
  })

  it('fuzzy match on partial name', () => {
    const result = matchSpeakerToCharacter('Kim', characters)
    expect(result.confidence).toBe('fuzzy')
    expect(result.characterId).toBe('2')
  })

  it('no match returns null', () => {
    const result = matchSpeakerToCharacter('Dr. Dre', characters)
    expect(result.confidence).toBe('none')
    expect(result.characterId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/character-matching.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement character-matching.ts**

```typescript
// src/lib/character-matching.ts
export interface CharacterForMatching {
  id: string
  name: string
  display_name: string | null
  aliases?: string[]
}

export interface MatchResult {
  characterId: string | null
  confidence: 'exact' | 'alias' | 'fuzzy' | 'none'
  matchedOn?: string  // what field matched
}

export function matchSpeakerToCharacter(
  speaker: string,
  characters: CharacterForMatching[]
): MatchResult {
  const speakerLower = speaker.toLowerCase().trim()

  // 1. Exact match on display_name or name
  for (const char of characters) {
    if (char.display_name && char.display_name.toLowerCase() === speakerLower) {
      return { characterId: char.id, confidence: 'exact', matchedOn: 'display_name' }
    }
    if (char.name.toLowerCase() === speakerLower) {
      return { characterId: char.id, confidence: 'exact', matchedOn: 'name' }
    }
  }

  // 2. Alias match
  for (const char of characters) {
    for (const alias of char.aliases || []) {
      if (alias.toLowerCase() === speakerLower) {
        return { characterId: char.id, confidence: 'alias', matchedOn: `alias: ${alias}` }
      }
    }
  }

  // 3. Fuzzy: check if speaker is a substring of name or display_name, or vice versa
  for (const char of characters) {
    const nameLower = char.name.toLowerCase()
    const displayLower = (char.display_name || '').toLowerCase()
    if (
      (speakerLower.length >= 3 && nameLower.includes(speakerLower)) ||
      (speakerLower.length >= 3 && displayLower.includes(speakerLower)) ||
      (nameLower.length >= 3 && speakerLower.includes(nameLower))
    ) {
      return { characterId: char.id, confidence: 'fuzzy', matchedOn: 'partial' }
    }
  }

  return { characterId: null, confidence: 'none' }
}

export function batchMatchSpeakers(
  speakers: string[],
  characters: CharacterForMatching[]
): Map<string, MatchResult> {
  const results = new Map<string, MatchResult>()
  for (const speaker of speakers) {
    results.set(speaker, matchSpeakerToCharacter(speaker, characters))
  }
  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/character-matching.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/character-matching.ts src/lib/character-matching.test.ts
git commit -m "feat: alias-aware character matching logic with tests"
```

---

### Task 13: SearchableSelect Component

**Files:**
- Create: `src/components/ui/SearchableSelect.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/ui/SearchableSelect.tsx
'use client'

import { useState, useRef, useEffect } from 'react'

interface Option {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  className?: string
}

export default function SearchableSelect({
  options, value, onChange, placeholder = 'Search...', className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(query.toLowerCase()))
      )
    : options

  const selectedLabel = value ? options.find(o => o.value === value)?.label : null

  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="w-full text-left px-3 py-2 text-sm border border-[var(--border)] rounded bg-[var(--bg-primary)] hover:border-[var(--border-strong)]"
      >
        {selectedLabel || <span className="text-[var(--text-muted)]">{placeholder}</span>}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-strong)] shadow-lg z-50 rounded max-h-60 overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to filter..."
              className="w-full px-2 py-1 text-sm bg-[var(--bg-secondary)] border border-[var(--border)] rounded"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); setQuery('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] ${
                  opt.value === value ? 'bg-[var(--bg-tertiary)] font-medium' : ''
                }`}
              >
                {opt.label}
                {opt.sublabel && <span className="text-xs text-[var(--text-muted)] ml-2">{opt.sublabel}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-[var(--text-muted)]">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/SearchableSelect.tsx
git commit -m "feat: SearchableSelect dropdown component"
```

---

### Task 14: Improve Import Character Resolution

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/import/ImportScript.tsx`

- [ ] **Step 1: Wire character matching and SearchableSelect into import flow**

In the character resolution step of `ImportScript.tsx`:

1. Replace the existing character dropdown with `SearchableSelect`
2. When speakers are extracted from parsed content, run `batchMatchSpeakers()` to pre-fill mappings
3. Add confidence indicator badges next to each speaker:
   - Green dot + "Exact match" for `confidence === 'exact'`
   - Yellow dot + "Alias match — confirm?" for `confidence === 'alias'`
   - Red dot + "No match" for `confidence === 'none'`
4. Add bulk action buttons:
   - "Confirm all exact matches" — sets all green items to `existing` status
   - "Create all unmatched as new" — sets all red items to `new` status

The character list passed to the matcher should include `aliases` from the database (already fetched in the server component's character query — verify and add if needed).

- [ ] **Step 2: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/import/ImportScript.tsx
git commit -m "feat: searchable character dropdown with alias matching and bulk actions in import"
```

---

### Task 15: Post-Import Enrichment Checklist

**Files:**
- Create: `src/app/series/[seriesId]/issues/[issueId]/import/EnrichmentChecklist.tsx`
- Modify: `src/app/series/[seriesId]/issues/[issueId]/import/ImportScript.tsx`

- [ ] **Step 1: Create the checklist component**

```typescript
// src/app/series/[seriesId]/issues/[issueId]/import/EnrichmentChecklist.tsx
'use client'

import Link from 'next/link'

interface EnrichmentChecklistProps {
  seriesId: string
  issueId: string
  stats: {
    charactersLinked: number
    charactersTotal: number
    charactersNeedAttention: number
    plotlinesAssigned: number
    plotlinesTotal: number
    descriptionsCapitalized: boolean
    storyBeatsPopulated: number
    storyBeatsTotal: number
  }
  onDismiss: () => void
  onSuggestBeats: () => void
}

export default function EnrichmentChecklist({
  seriesId, issueId, stats, onDismiss, onSuggestBeats,
}: EnrichmentChecklistProps) {
  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="type-section mb-2">Import Complete</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Your script has been imported. Here's what might need attention:
      </p>

      <div className="space-y-3 mb-6">
        {/* Characters */}
        <ChecklistItem
          label={`Characters linked: ${stats.charactersLinked}/${stats.charactersTotal}`}
          status={stats.charactersNeedAttention === 0 ? 'done' : 'attention'}
          detail={stats.charactersNeedAttention > 0 ? `${stats.charactersNeedAttention} need attention` : undefined}
          href={`/series/${seriesId}/characters`}
        />

        {/* Plotlines */}
        <ChecklistItem
          label={`Plotlines assigned: ${stats.plotlinesAssigned}/${stats.plotlinesTotal} scenes`}
          status={stats.plotlinesAssigned === stats.plotlinesTotal ? 'done' : 'todo'}
          href={`/series/${seriesId}/issues/${issueId}/weave`}
        />

        {/* Capitalization */}
        <ChecklistItem
          label="Visual descriptions capitalized"
          status={stats.descriptionsCapitalized ? 'done' : 'todo'}
        />

        {/* Story beats */}
        <ChecklistItem
          label={`Story beats: ${stats.storyBeatsPopulated}/${stats.storyBeatsTotal} pages`}
          status={stats.storyBeatsPopulated === stats.storyBeatsTotal ? 'done' : 'todo'}
          action={stats.storyBeatsPopulated < stats.storyBeatsTotal ? {
            label: 'Suggest beats from script',
            onClick: onSuggestBeats,
          } : undefined}
        />
      </div>

      <button
        onClick={onDismiss}
        className="hover-lift type-micro px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)]"
      >
        Go to Editor →
      </button>
    </div>
  )
}

function ChecklistItem({ label, status, detail, href, action }: {
  label: string
  status: 'done' | 'attention' | 'todo'
  detail?: string
  href?: string
  action?: { label: string; onClick: () => void }
}) {
  const statusIcon = status === 'done' ? '✓' : status === 'attention' ? '!' : '○'
  const statusColor = status === 'done' ? 'text-[var(--color-success)]' :
    status === 'attention' ? 'text-[var(--color-warning)]' : 'text-[var(--text-muted)]'

  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded border border-[var(--border)]">
      <span className={`${statusColor} font-bold`}>{statusIcon}</span>
      <div className="flex-1">
        <span className="text-sm">{label}</span>
        {detail && <span className="text-xs text-[var(--color-warning)] ml-2">{detail}</span>}
      </div>
      {href && (
        <Link href={href} className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          Fix →
        </Link>
      )}
      {action && (
        <button onClick={action.onClick} className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          {action.label}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into ImportScript**

After the import completes successfully, instead of navigating directly to the editor, show the `EnrichmentChecklist`. Compute stats from the imported data (characters mapped, plotlines assigned, etc.). The "Dismiss" button navigates to the editor.

- [ ] **Step 3: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/import/EnrichmentChecklist.tsx \
        src/app/series/[seriesId]/issues/[issueId]/import/ImportScript.tsx
git commit -m "feat: post-import enrichment checklist"
```

---

### Task 16: Batch Rename Everywhere

**Files:**
- Create: `src/app/api/characters/[characterId]/rename/route.ts`
- Modify: `src/app/series/[seriesId]/characters/page.tsx` (or the client CharacterGrid component)

- [ ] **Step 1: Create the rename API endpoint**

```typescript
// src/app/api/characters/[characterId]/rename/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { newDisplayName } = await req.json()
  if (!newDisplayName?.trim()) {
    return NextResponse.json({ error: 'newDisplayName required' }, { status: 400 })
  }

  // Get current character info
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id, name, display_name, series_id')
    .eq('id', characterId)
    .single()

  if (charErr || !character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  const oldDisplayName = character.display_name || character.name
  const newUpper = newDisplayName.toUpperCase()
  const oldUpper = oldDisplayName.toUpperCase()

  // 1. Update the character record
  await supabase
    .from('characters')
    .update({ display_name: newDisplayName })
    .eq('id', characterId)

  // 2. Update dialogue_blocks speaker_name where character_id matches
  await supabase
    .from('dialogue_blocks')
    .update({ speaker_name: newUpper })
    .eq('character_id', characterId)

  // 3. Update visual descriptions via RPC (regexp_replace across all panels in series)
  // This requires a database function for safe word-boundary replacement
  await supabase.rpc('rename_character_in_descriptions', {
    p_series_id: character.series_id,
    p_old_name: oldUpper,
    p_new_name: newUpper,
  })

  return NextResponse.json({
    success: true,
    oldName: oldDisplayName,
    newName: newDisplayName,
  })
}
```

- [ ] **Step 2: Create the database function for description renaming**

Migration:

```sql
CREATE OR REPLACE FUNCTION rename_character_in_descriptions(
  p_series_id UUID,
  p_old_name TEXT,
  p_new_name TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE panels
  SET visual_description = regexp_replace(
    visual_description,
    '\m' || p_old_name || '\M',  -- \m and \M are word boundaries in Postgres regex
    p_new_name,
    'gi'
  )
  WHERE page_id IN (
    SELECT p.id FROM pages p
    JOIN scenes s ON p.scene_id = s.id
    JOIN acts a ON s.act_id = a.id
    JOIN issues i ON a.issue_id = i.id
    WHERE i.series_id = p_series_id
  )
  AND visual_description ~* ('\m' || p_old_name || '\M');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 3: Add "Rename everywhere" button to character page**

In the character list/grid component, add a "Rename everywhere" action (accessible from the character's edit form or context menu). When triggered:
1. Show a modal with the current display_name and an input for the new name
2. On confirm, POST to `/api/characters/[characterId]/rename`
3. Show success toast with count of updates

- [ ] **Step 4: Commit**

```bash
git add src/app/api/characters/[characterId]/rename/route.ts \
        supabase/migrations/ \
        src/app/series/[seriesId]/characters/
git commit -m "feat: rename character everywhere (dialogue + descriptions)"
```

---

## Chunk 4: Section 6 — Active Writer Learning System

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/ai/draft-tracking.ts` | In-memory draft tracking for edit diffs |
| Create | `src/lib/ai/draft-tracking.test.ts` | Tests for draft tracking |
| Create | `src/app/api/ai/draft-edit/route.ts` | API endpoint for storing draft edit diffs |
| Create | `supabase/migrations/YYYYMMDDHHMMSS_add_ai_draft_edits.sql` | Column + atomic append RPC |
| Modify | `src/app/api/ai/synthesize-profile/route.ts` | Updated synthesis prompt + type cast fix |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/IssueEditor.tsx` | Own `draftPanelIds` state (survives page nav) |
| Modify | `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx` | Hook into draft tracking on ANY field blur |

**Database changes:** Add `ai_draft_edits JSONB DEFAULT '[]'` column to `writer_profiles` + atomic `append_draft_edit` RPC function.

**PREREQUISITE:** Section 4c (Task 11 — draft scaffolding) must be implemented first. Without it, the draft tracker has no entry point and the learning system is inert.

---

### Task 17: Database Migration — `ai_draft_edits`

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_add_ai_draft_edits.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE writer_profiles
ADD COLUMN ai_draft_edits JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN writer_profiles.ai_draft_edits IS
  'Array of {original, edited, panelId, timestamp} diffs from AI draft edits. Capped at 200 entries.';
```

- [ ] **Step 2: Apply migration and commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add ai_draft_edits column to writer_profiles"
```

---

### Task 18: Draft Tracking Module

**Files:**
- Create: `src/lib/ai/draft-tracking.ts`
- Test: `src/lib/ai/draft-tracking.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/lib/ai/draft-tracking.test.ts
import { describe, it, expect } from 'vitest'
import { DraftTracker } from './draft-tracking'

describe('DraftTracker', () => {
  it('stores and retrieves original draft text', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Wide shot of the city at dawn.')
    expect(tracker.getOriginal('panel-1')).toBe('Wide shot of the city at dawn.')
  })

  it('computes diff between original and edited text', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Wide shot of the city at dawn.')
    const diff = tracker.computeEditDiff('panel-1', 'Close on MARSHALL standing at the window, dawn light.')
    expect(diff).not.toBeNull()
    expect(diff!.original).toBe('Wide shot of the city at dawn.')
    expect(diff!.edited).toBe('Close on MARSHALL standing at the window, dawn light.')
    expect(diff!.panelId).toBe('panel-1')
  })

  it('returns null diff for untracked panels', () => {
    const tracker = new DraftTracker()
    const diff = tracker.computeEditDiff('unknown', 'some text')
    expect(diff).toBeNull()
  })

  it('returns null diff when text is unchanged', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Same text.')
    const diff = tracker.computeEditDiff('panel-1', 'Same text.')
    expect(diff).toBeNull()
  })

  it('clears tracked draft after diff is computed', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Original.')
    tracker.computeEditDiff('panel-1', 'Edited.')
    expect(tracker.getOriginal('panel-1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/draft-tracking.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement draft-tracking.ts**

```typescript
// src/lib/ai/draft-tracking.ts

export interface DraftEditDiff {
  original: string
  edited: string
  panelId: string
  timestamp: string
}

/**
 * Session-scoped in-memory tracker for AI-drafted panel content.
 * Stores the original AI text so we can diff when the writer edits it.
 * Ephemeral — lives only in the browser tab, not persisted.
 */
export class DraftTracker {
  private originals = new Map<string, string>()

  /** Record the original AI draft for a panel */
  recordDraft(panelId: string, text: string): void {
    this.originals.set(panelId, text)
  }

  /** Get the original draft text (if tracked) */
  getOriginal(panelId: string): string | null {
    return this.originals.get(panelId) ?? null
  }

  /** Check if a panel has a tracked draft */
  hasDraft(panelId: string): boolean {
    return this.originals.has(panelId)
  }

  /**
   * Compute the edit diff between original draft and current text.
   * Returns null if the panel isn't tracked or text is unchanged.
   * Clears the tracked draft after computing (one-shot).
   */
  computeEditDiff(panelId: string, currentText: string): DraftEditDiff | null {
    const original = this.originals.get(panelId)
    if (!original) return null
    if (original === currentText) return null

    this.originals.delete(panelId)

    return {
      original,
      edited: currentText,
      panelId,
      timestamp: new Date().toISOString(),
    }
  }

  /** Clear all tracked drafts */
  clear(): void {
    this.originals.clear()
  }
}

// Singleton instance for the browser session
let _instance: DraftTracker | null = null

export function getDraftTracker(): DraftTracker {
  if (!_instance) _instance = new DraftTracker()
  return _instance
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/draft-tracking.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/draft-tracking.ts src/lib/ai/draft-tracking.test.ts
git commit -m "feat: in-memory draft tracker for AI edit diffs"
```

---

### Task 19: Store Draft Edits in Writer Profile

**Files:**
- Modify: `src/lib/ai/conversations.ts`

- [ ] **Step 1: Add saveDraftEdit function**

```typescript
// Add to src/lib/ai/conversations.ts

export async function saveDraftEdit(
  userId: string,
  diff: { original: string; edited: string; panelId: string; timestamp: string }
): Promise<void> {
  const supabase = await createServerClient()

  // Fetch current draft edits
  const { data: profile } = await supabase
    .from('writer_profiles')
    .select('ai_draft_edits')
    .eq('user_id', userId)
    .single()

  const currentEdits: any[] = profile?.ai_draft_edits || []

  // Append new edit, cap at 200
  const updatedEdits = [...currentEdits, diff].slice(-200)

  await supabase
    .from('writer_profiles')
    .update({ ai_draft_edits: updatedEdits })
    .eq('user_id', userId)
}
```

Note: This function needs a server Supabase client. It should be called from an API route, not directly from the browser. Create a small API route at `/api/ai/draft-edit` that receives the diff and calls `saveDraftEdit`.

- [ ] **Step 2: Create the draft-edit API route**

```typescript
// src/app/api/ai/draft-edit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { original, edited, panelId } = await req.json()
  if (!original || !edited || !panelId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Fetch current profile
  const { data: profile } = await supabase
    .from('writer_profiles')
    .select('ai_draft_edits')
    .eq('user_id', user.id)
    .single()

  const currentEdits: any[] = profile?.ai_draft_edits || []
  const updatedEdits = [...currentEdits, {
    original, edited, panelId,
    timestamp: new Date().toISOString(),
  }].slice(-200)

  await supabase
    .from('writer_profiles')
    .update({ ai_draft_edits: updatedEdits })
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/conversations.ts src/app/api/ai/draft-edit/route.ts
git commit -m "feat: API route to store draft edit diffs in writer profile"
```

---

### Task 20: Wire Draft Tracking into PageEditor

**Files:**
- Modify: `src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx`

- [ ] **Step 1: Hook draft tracking into panel blur handler**

In PageEditor, import the draft tracker and check on description field blur:

```typescript
import { getDraftTracker } from '@/lib/ai/draft-tracking'

// In the description field onBlur handler (the existing onBlur that saves to DB):
const handleDescriptionBlur = (panelId: string, currentText: string) => {
  // ... existing save logic ...

  // Check if this panel had an AI draft
  const tracker = getDraftTracker()
  const diff = tracker.computeEditDiff(panelId, currentText)
  if (diff) {
    // Remove draft badge
    setDraftPanelIds(prev => {
      const next = new Set(prev)
      next.delete(panelId)
      return next
    })
    // Send diff to server (fire and forget)
    fetch('/api/ai/draft-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diff),
    }).catch(() => {}) // non-critical, don't block UI
  }
}
```

- [ ] **Step 2: Record drafts when scaffolding**

In the scaffold handler (Task 11), after creating panels from `scaffoldPanelsFromBeat`, record each panel's original text:

```typescript
import { getDraftTracker } from '@/lib/ai/draft-tracking'

// After creating scaffolded panels:
const tracker = getDraftTracker()
for (const panel of scaffoldedPanels) {
  tracker.recordDraft(panel.id, panel.visual_description)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/series/[seriesId]/issues/[issueId]/PageEditor.tsx
git commit -m "feat: wire draft tracking into PageEditor blur handler"
```

---

### Task 21: Update Profile Synthesis Prompt

**Files:**
- Modify: `src/app/api/ai/synthesize-profile/route.ts`

- [ ] **Step 1: Include draft edits in synthesis context**

In the synthesis route, fetch `ai_draft_edits` alongside existing data, and update the synthesis prompt to analyze edit patterns:

```typescript
// Add to the data fetching section:
const draftEdits = profile.ai_draft_edits || []

// Add to the synthesis prompt context:
let draftEditContext = ''
if (draftEdits.length > 0) {
  const recentEdits = draftEdits.slice(-50) // last 50 for token budget
  draftEditContext = `\n\n## AI Draft Edit Patterns (${draftEdits.length} total edits, showing recent ${recentEdits.length})
The writer has edited AI-drafted panel descriptions. Each entry shows what the AI wrote vs. what the writer changed it to. Analyze these diffs to identify concrete style preferences:

${recentEdits.map((e: any, i: number) =>
  `Edit ${i + 1}:\n  AI wrote: "${e.original}"\n  Writer changed to: "${e.edited}"`
).join('\n\n')}

Look for patterns like:
- Does the writer consistently add/remove camera directions?
- Does the writer shorten or lengthen descriptions?
- Does the writer prefer specific vocabulary or sentence structures?
- Does the writer add character actions that the AI missed?
- What does the writer delete vs. keep?`
}
```

Add `draftEditContext` to the user message sent to Claude for synthesis.

- [ ] **Step 2: Update the synthesis system prompt**

Add this to the existing synthesis system prompt:

```
If draft edit patterns are provided, extract CONCRETE style preferences from them. For example:
- "Writer consistently replaces generic camera directions ('We see') with specific shot types ('Close on', 'Wide shot of')"
- "Writer shortens AI descriptions by ~40%, preferring punchy sentence fragments over full sentences"
- "Writer always adds sensory details (sounds, textures, lighting) that the AI omits"
These concrete observations should be woven into the portrait and will be used to improve future AI drafts.
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/synthesize-profile/route.ts
git commit -m "feat: include draft edit diffs in writer profile synthesis"
```

---

## Dependency Order

```
Section 3 (Dual-Page View) ─────────────────────────┐
                                                     │ no dependencies between these three
Section 4 (Socratic → Scaffold) ────────────────────┤
                                                     │
Section 5 (Import Pipeline Polish) ──────────────────┤
  └─ 5b's "suggest beats" button depends on 4c      │
                                                     │
Section 6 (Writer Learning) ─── HARD DEP on Task 11 ─┘
  (draft tracking requires 4c scaffold to exist)
```

Sections 3, 4, and 5 can be worked on in parallel. Section 5b's "suggest beats" button should be stubbed if 4c isn't done yet. Section 6 **must** come after Task 11 (Section 4c: page scaffolding) — without it, the draft tracker has no entry point and the entire learning system is inert.

**Recommended execution order:** 3 → 4 → 5 → 6 (or 3 and 5 in parallel, then 4, then 6).

---

## Testing Strategy

| Section | Test Type | Command |
|---------|-----------|---------|
| 3 | Unit: mirror-diff | `npx vitest run src/lib/mirror-diff.test.ts` |
| 4 | Manual: AI behavior | Trigger guided session, verify active proposals |
| 5 | Unit: character-matching | `npx vitest run src/lib/character-matching.test.ts` |
| 6 | Unit: draft-tracking | `npx vitest run src/lib/ai/draft-tracking.test.ts` |
| All | Integration: manual | Navigate spread/mirror pairs, run harvest, import + checklist |

Run all tests: `npx vitest run`
