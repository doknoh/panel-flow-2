# Panel Flow: Final Draft-Inspired Features Integration Plan

**Created:** February 10, 2026
**Status:** Ready for Implementation
**Priority:** HIGH - User explicitly requested Bold/Italic for letterer communication

---

## Executive Summary

After analyzing Final Draft 13's Graphic Novel template, we've identified 7 key features to integrate into Panel Flow. A red-team validation identified **4 CRITICAL issues** that must be addressed before or during implementation.

### Priority Order (Based on User Needs)

| Priority | Feature | Complexity | Timeline | Blocking Issues |
|----------|---------|------------|----------|-----------------|
| 1 | **Bold/Italic Text Formatting** | Medium | 3 days | CRITICAL: Affects PDF, Search, Word Count, Undo |
| 2 | Word Count Per Panel | Low | 1 day | Depends on #1 (markdown stripping) |
| 3 | Character Report | Medium | 2 days | Depends on #1 (markdown stripping) |
| 4 | Writing Stats Dashboard | Medium | 3 days | Depends on #1 (markdown stripping) |
| 5 | Sprint Timer | Low | 2 days | Depends on #4 (shared infrastructure) |
| 6 | Split View | Medium | 3 days | None |
| 7 | Beat Board | High | 5+ days | None (standalone feature) |

**Total Estimated Timeline:** 19-21 days

---

## CRITICAL ISSUES IDENTIFIED (Must Address First)

### Issue 1: Markdown Breaks PDF Export
**Severity:** CRITICAL
**Problem:** Markdown syntax (`**bold**`, `*italic*`) renders literally in PDF output.
**Example:** `"I **really** need this"` exports as `I **really** need this`
**Solution:** Create `parseMarkdownToPdf()` that converts markdown to jsPDF bold/italic calls.

### Issue 2: Find & Replace Breaks Markdown
**Severity:** CRITICAL
**Problem:** Replacing text within markdown delimiters corrupts formatting.
**Example:** Replace "really" in `"I **really** need"` → `"I **definitely need"` (missing `**`)
**Solution:** Implement markdown-aware replacement OR warn users about limitation.

### Issue 3: Word Count Inflated by Markdown
**Severity:** CRITICAL
**Problem:** Word count includes markdown delimiters, giving false counts.
**Example:** `"I **love** this"` = 3 words but counts as ~5 with markdown
**Solution:** Create `countWords(text)` utility that strips markdown before counting.

### Issue 4: Undo/Redo Inconsistent with Markdown
**Severity:** CRITICAL
**Problem:** Undo records contain markdown text but component state may differ.
**Solution:** Ensure raw markdown is always stored and restored consistently.

---

## PHASE 0: Foundation Infrastructure (REQUIRED FIRST)

### 0.1 Create Markdown Utilities Library

**File:** `src/lib/markdown.ts`

```typescript
// Core utilities that ALL features depend on
export function stripMarkdown(text: string): string
export function parseMarkdownToReact(text: string): React.ReactNode
export function parseMarkdownToPdf(text: string, doc: jsPDF, options: PdfOptions): void
export function countWords(text: string): number  // Auto-strips markdown
export function wrapSelection(text: string, start: number, end: number, wrapper: '**' | '*'): string
export function isMarkdownBalanced(text: string): boolean
```

**Why First:** Every feature below depends on correct markdown handling. Building on broken foundation = cascade failures.

**Estimated Time:** 1 day

---

## PHASE 1: Bold/Italic Text Formatting (HIGH PRIORITY)

**User Need:** *"I need to be able to bold and italicize - that is important information for the letterer to know."*

### Approach: Markdown Storage

Store text with markdown syntax in database (no schema changes needed):
- Bold: `**text**`
- Italic: `*text*`

### Implementation Details

#### 1.1 RichTextEditor Component

**File:** `src/components/RichTextEditor.tsx`

Features:
- Toolbar with Bold (B) and Italic (I) buttons
- Keyboard shortcuts: `Cmd+B`, `Cmd+I`
- Visual rendering of markdown in edit mode
- Preserves cursor position after formatting

#### 1.2 Integration Points

| Component | Change Required |
|-----------|-----------------|
| ScriptView.tsx | Replace `<textarea>` with RichTextEditor for dialogue/captions |
| DialogueBlockEditor.tsx | Add RichTextEditor for dialogue text |
| CaptionEditor.tsx | Add RichTextEditor for caption text |
| exportPdf.ts | Parse markdown to PDF bold/italic |
| FindReplaceModal.tsx | Markdown-aware search/replace |
| search.ts | Update `replaceInText()` for markdown safety |

#### 1.3 PDF Export Enhancement

Update `exportPdf.ts` to render markdown:

```typescript
const renderMarkdownText = (doc: jsPDF, text: string, x: number, y: number) => {
  // Parse markdown and apply jsPDF styling
  // **bold** → doc.setFont('helvetica', 'bold')
  // *italic* → doc.setFont('helvetica', 'italic')
}
```

#### 1.4 Undo/Redo Integration

Ensure `endGenericTextEdit()` stores raw markdown text. No changes needed if text is stored consistently.

**Estimated Time:** 3 days

---

## PHASE 2: Word Count Per Panel

### Feature Description

Real-time word count display per panel with visual thresholds:
- **Green:** 0-24 words (comfortable)
- **Yellow:** 25-34 words (warning - getting wordy)
- **Red:** 35+ words (error - too many words for letterer)

### Implementation

#### 2.1 Word Count Utility

Uses `countWords()` from `src/lib/markdown.ts` (strips markdown before counting).

#### 2.2 ScriptView Integration

Add word count badge to each panel block:

```typescript
<div className="panel-word-count">
  <span className={getWordCountClass(wordCount)}>
    {wordCount} words
  </span>
</div>
```

#### 2.3 StatusBar Enhancement

Show aggregate word count for current scope (page/scene/act/issue).

**Estimated Time:** 1 day

---

## PHASE 3: Character Report

### Feature Description

Generate statistics about character appearances and dialogue across an issue or series.

### Report Contents

- **Appearance Count:** Panels where character appears in visual description
- **Dialogue Count:** Total dialogue blocks by character
- **Word Count:** Total words spoken (markdown-stripped)
- **First/Last Appearance:** Page/panel references
- **Dialogue Types:** Breakdown of normal/thought/whisper/shout

### Implementation

#### 3.1 New Route

**File:** `src/app/series/[seriesId]/issues/[issueId]/reports/characters/page.tsx`

#### 3.2 Report Generation

```typescript
interface CharacterStats {
  characterId: string
  characterName: string
  appearanceCount: number
  dialogueCount: number
  wordCount: number
  firstAppearance: { page: number, panel: number }
  lastAppearance: { page: number, panel: number }
  dialogueTypes: Record<DialogueType, number>
}
```

#### 3.3 Export Options

- PDF report
- CSV for data analysis

**Estimated Time:** 2 days

---

## PHASE 4: Writing Stats Dashboard

### Feature Description

Track writing progress with streaks, goals, and visualizations.

### Dashboard Components

1. **Writing Streak:** Consecutive days with word count > 0
2. **Daily Word Goal:** Configurable target (default: 500 words)
3. **Progress Graph:** Words written over time (7-day, 30-day, all-time views)
4. **Session History:** List of writing sessions with duration and word count
5. **Achievements:** Milestones (first 1000 words, 7-day streak, etc.)

### Database Schema

```sql
CREATE TABLE writing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  issue_id UUID REFERENCES issues(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  word_count_start INTEGER NOT NULL DEFAULT 0,
  word_count_end INTEGER,
  duration_seconds INTEGER
);

CREATE TABLE writing_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  daily_word_goal INTEGER DEFAULT 500,
  streak_current INTEGER DEFAULT 0,
  streak_longest INTEGER DEFAULT 0,
  last_write_date DATE
);
```

### Implementation

**File:** `src/app/dashboard/stats/page.tsx`

Uses Recharts for graphs (already available in project).

**Estimated Time:** 3 days

---

## PHASE 5: Sprint Timer

### Feature Description

Timed writing sessions with word count tracking (Pomodoro-style).

### Features

1. **Configurable Duration:** 15/25/45/60 minutes
2. **Real-time Word Count:** Shows words written during sprint
3. **Goal Setting:** Optional word goal for sprint
4. **Session Logging:** Saves to writing_sessions table
5. **Break Reminders:** Optional alerts between sprints

### Implementation

#### 5.1 SprintTimer Component

**File:** `src/components/SprintTimer.tsx`

Floating timer widget that can be pinned to ScriptView or IssueEditor.

#### 5.2 Integration with Stats

Sprint sessions are automatically logged to `writing_sessions` table for stats dashboard.

**Estimated Time:** 2 days

---

## PHASE 6: Split View

### Feature Description

View script content in side-by-side panes (vertical or horizontal split).

### Use Cases

1. **Compare Pages:** View page 1 and page 5 side by side
2. **Reference + Write:** View reference material while writing
3. **Script + Notes:** View script in one pane, character notes in other

### Implementation

#### 6.1 Split State

```typescript
const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>('none')
const [leftPane, setLeftPane] = useState<PaneContent>({ type: 'script', scope: 'page', id: pageId })
const [rightPane, setRightPane] = useState<PaneContent | null>(null)
```

#### 6.2 Pane Types

- Script view (any scope)
- Character reference
- Location reference
- Notes view
- Read-only script (for comparison)

#### 6.3 Sync Options

- Independent scroll (default)
- Synchronized scroll (for page comparison)
- Linked editing (changes in one pane reflect in other)

**Estimated Time:** 3 days

---

## PHASE 7: Beat Board

### Feature Description

Visual story canvas for organizing beats and scenes (like Final Draft's index cards).

### Views

1. **Card View:** Index cards for each scene/beat
2. **Canvas View:** Free-form arrangement on 2D canvas
3. **Outline View:** Hierarchical list view

### Card Contents

- Scene/beat title
- Summary (50 words max)
- Color coding (by act, plotline, or custom)
- Completion status
- Associated characters

### Implementation

#### 7.1 New Route

**File:** `src/app/series/[seriesId]/beat-board/page.tsx`

#### 7.2 Canvas Library

Use `@dnd-kit/core` for drag-and-drop (consistent with existing DnD in app).

#### 7.3 Data Model

Reuse existing `acts` and `scenes` tables with additional metadata:
- `scene.beat_color` (string)
- `scene.canvas_position` (JSONB: {x, y})

**Estimated Time:** 5+ days

---

## Implementation Schedule

### Week 1: Foundation + Bold/Italic
- Day 1: Phase 0 - Markdown utilities library
- Days 2-3: Phase 1 - Bold/Italic in ScriptView
- Day 4: Phase 1 - PDF export enhancement
- Day 5: Phase 2 - Word Count Per Panel

### Week 2: Stats + Reports
- Days 1-2: Phase 4 - Writing Stats Dashboard (database + UI)
- Day 3: Phase 4 - Stats graphs and visualization
- Days 4-5: Phase 3 - Character Report

### Week 3: Sprint Timer + Split View
- Days 1-2: Phase 5 - Sprint Timer
- Days 3-5: Phase 6 - Split View

### Week 4+: Beat Board
- Days 1-5+: Phase 7 - Beat Board (complex feature)

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/lib/markdown.ts` | Markdown parsing utilities |
| `src/components/RichTextEditor.tsx` | Bold/italic editor component |
| `src/components/SprintTimer.tsx` | Sprint timer widget |
| `src/app/dashboard/stats/page.tsx` | Writing stats dashboard |
| `src/app/series/[seriesId]/issues/[issueId]/reports/characters/page.tsx` | Character report |
| `src/app/series/[seriesId]/beat-board/page.tsx` | Beat board canvas |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/exportPdf.ts` | Markdown rendering in PDF |
| `src/lib/search.ts` | Markdown-aware replacement |
| `src/app/series/[seriesId]/issues/[issueId]/ScriptView.tsx` | RichTextEditor, word count, split view |
| `src/app/series/[seriesId]/issues/[issueId]/FindReplaceModal.tsx` | Markdown-safe replacement |
| `src/contexts/UndoContext.tsx` | Ensure markdown consistency |

### Database Migrations
1. `writing_sessions` table
2. `writing_goals` table
3. `scene.beat_color` column
4. `scene.canvas_position` column

---

## Testing Checklist

### Bold/Italic
- [ ] Cmd+B wraps selected text in `**`
- [ ] Cmd+I wraps selected text in `*`
- [ ] PDF export shows bold/italic correctly
- [ ] Find & Replace handles markdown safely
- [ ] Undo/Redo preserves markdown

### Word Count
- [ ] `"I **love** this"` counts as 3 words, not 5
- [ ] Thresholds display correct colors
- [ ] Count updates in real-time as user types

### Character Report
- [ ] Counts exclude markdown delimiters
- [ ] Export to PDF works
- [ ] All dialogue types counted correctly

### Stats Dashboard
- [ ] Streak increments on daily writing
- [ ] Graph shows accurate word counts
- [ ] Sessions logged correctly

### Sprint Timer
- [ ] Timer counts down correctly
- [ ] Word count delta calculated accurately
- [ ] Session saved to database on completion

### Split View
- [ ] Both panes render markdown identically
- [ ] Edits sync between panes when linked
- [ ] Keyboard shortcuts work in focused pane

### Beat Board
- [ ] Cards display scene summaries
- [ ] Drag-and-drop reorders scenes
- [ ] Color coding persists

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Markdown breaks existing data | Test thoroughly; markdown is additive (existing text unchanged) |
| Performance with large issues | Memoize markdown parsing; virtualize long lists |
| User confusion about markdown | Add help tooltip; show visual preview |
| PDF complexity | Fall back to stripping markdown if rendering fails |
| Split view state management | Use single source of truth; sync via callbacks |

---

## Success Criteria

1. **Bold/Italic:** Users can format dialogue for letterers with `Cmd+B`/`Cmd+I`
2. **Word Count:** Writers see real-time feedback on panel wordiness
3. **Character Report:** One-click report generation for character analysis
4. **Stats Dashboard:** Writers can track daily progress and maintain streaks
5. **Sprint Timer:** Focused writing sessions with automatic tracking
6. **Split View:** Side-by-side comparison and reference viewing
7. **Beat Board:** Visual story organization matching Final Draft's index cards

---

*Plan created with input from architecture exploration, feature planning, and red-team validation agents.*
