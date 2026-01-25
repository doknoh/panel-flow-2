# Panel Flow 2.0

A professional comic book script writing tool for sequential art writers.

---

## Project Overview

Panel Flow is a structured writing environment for comic book scripts. It replaces:
- **Google Docs** (for writing)
- **Google Sheets** (for structure/weave visualization)
- **Fragmented AI conversations** (for creative collaboration)

...with a unified, purpose-built application.

**Primary User:** Professional writer working on an 8-issue graphic novel with multiple plotlines, non-linear timelines, and sophisticated structural requirements.

**Core Value:** Reduce formatting tedium, maintain creative context across complex projects, provide AI creative partnership that asks the right questions at every phase.

**The Bar:** Google Docs. Match its reliability, auto-save, version history, find-and-replace, and fluid writing experience BEFORE adding comic-specific features.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | React (Next.js) | Modern, fast, good ecosystem |
| Hosting | Vercel | User has experience, reliable |
| Database | Supabase (PostgreSQL) | Relational data, SQL queries |
| Auth | Google OAuth via Supabase | Universal, user preference |
| AI | Claude API (Anthropic) | Long context, nuanced feedback |
| Voice-to-Text | WhisperFlow | User's existing tool for mobile |

---

## Design Principles

These govern ALL design decisions. When in doubt, defer to these.

1. **Ask, Don't Assume** — AI never silently infers. Always surface interpretations and ask for confirmation. When parsing scripts, tracking character states, identifying issues—show work, ask first.

2. **The Script Is Truth** — When outline and script conflict, script wins. Outlines are derived views that can be regenerated from scripts.

3. **Reduce Formatting Tedium** — Auto-capitalize character names in descriptions. Auto-number panels/pages. Auto-format dialogue blocks. Writer focuses on content; system handles presentation.

4. **Auto-Renumber Everything** — Drag-and-drop at any level (panels, pages, scenes) triggers automatic renumbering. No manual cleanup ever.

5. **Draft Mode → Commit** — In structure views, allow free experimentation. Only when user commits do changes propagate and checks run.

6. **Google Docs Is the Bar** — Auto-save, deep version history, find-and-replace, reliability, speed. Match these fundamentals.

7. **Toolkit, Not Tyranny** — Motifs, themes, visual style notes, and rules are reminders that stay visible—not constraints the system enforces. Creative decisions remain with the writer.

8. **The Writing Stays Human** — AI collaborates, structures, challenges, drafts for reaction. The writer does the actual writing. Non-negotiable.

---

## User Workflow Phases

The user works in distinct cognitive modes. The app should support each:

### Phase 1: Ideation
- Long voice riffs (8-10 minutes)
- AI listens, organizes into story beats
- AI asks clarifying questions, identifies gaps, challenges assumptions
- Output: Rough concept for issue

### Phase 2: Structure
- Break issue into 3 acts
- Define beginning/end of each act
- Break acts into scenes
- Rough page allocation
- Output: Scene list with page counts

### Phase 3: Weave
- Interleave multiple plotlines
- Consider rhythm, pacing, breathing room
- Consider left/right page alignment for reveals/cliffhangers
- Drag-and-drop experimentation
- Output: Color-coded page-by-page breakdown

### Phase 4: Page-Level Craft
- Assign specific pages to scenes
- Ensure reveals on left pages, cliffhangers on right
- Consider spreads, mirror pages, modular units
- Output: Locked page structure

### Phase 5: Drafting
- Write panel-by-panel scripts
- Structured interface with fields
- AI available but not interrupting
- Output: Complete draft script

### Phase 6: Editing
- Review each page for efficiency
- "Do I need 8 panels or can this be 5?"
- AI provides feedback and power rankings
- Output: Polished script

---

## The Three Layers

The app maintains three distinct layers of information:

### Layer 1: The Script
The actual panel-by-panel content. What gets exported. The source of truth.

### Layer 2: The Entity Database
Characters and Locations with persistent profiles. Referenced by scripts via tagging.

### Layer 3: Project Context
- **Series-level:** Concept, themes, plotline definitions, visual grammar, rules
- **Issue-level:** Outline, motifs, stakes, issue-specific rules
- **Project notes:** Open questions, decisions under consideration, AI insights worth preserving

**The AI reads ALL THREE layers for context in every interaction.**

---

## Data Hierarchy

```
Series
  └── Issue
        └── Act
              └── Scene
                    └── Page
                          └── Panel
                                ├── Dialogue Block
                                └── Caption
```

---

## Data Models

### User
```typescript
interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  created_at: Date
  last_login: Date
}
```

### Series
```typescript
interface Series {
  id: string
  user_id: string // owner
  title: string
  logline: string // one paragraph concept
  central_theme: string
  visual_grammar: string // notes on recurring visual devices
  rules: string // series-wide conventions
  created_at: Date
  updated_at: Date
}
```

### Plotline
```typescript
interface Plotline {
  id: string
  series_id: string
  name: string // e.g., "Marshall IRL", "Tracy Solo", "Antagonist"
  color: string // hex, auto-assigned by system
  description?: string
}
```

### ProjectNote
```typescript
interface ProjectNote {
  id: string
  series_id: string
  type: 'OPEN_QUESTION' | 'DECISION' | 'AI_INSIGHT' | 'GENERAL'
  content: string
  resolved: boolean
  resolved_at?: Date
  created_at: Date
  updated_at: Date
}
```

### Issue
```typescript
interface Issue {
  id: string
  series_id: string
  number: number
  title: string
  tagline: string // one-line hook
  summary: string // TL;DR for readers
  visual_style: string // notes for artist
  motifs: string // visual/narrative motifs for this issue
  stakes: string // what's at risk
  themes: string // philosophical underpinning
  rules: string // issue-specific conventions (e.g., "9-panel grid for Paul/Tracy")
  series_act: 'BEGINNING' | 'MIDDLE' | 'END' // where this issue falls in overall series arc
  status: 'OUTLINE' | 'DRAFTING' | 'REVISION' | 'COMPLETE'
  created_at: Date
  updated_at: Date
}
```

**Series Act Structure:** For an 8-issue series, roughly: Issues 1-2 = Beginning, Issues 3-5 = Middle, Issues 6-8 = End. This helps track where each issue falls in the overall narrative arc.

### Act
```typescript
interface Act {
  id: string
  issue_id: string
  number: number // 1, 2, or 3
  title?: string // e.g., "Creative Paralysis"
  beat_summary: string // key moments, not panel-level
}
```

### Scene
```typescript
interface Scene {
  id: string
  act_id: string
  order: number // position within act
  title?: string // slug, e.g., "Studio Breakdown"
  plotline_id: string
  characters: string[] // character IDs
  location_id?: string
  target_page_count?: number // rough allocation
  notes?: string // internal notes
}
```

### Page
```typescript
interface Page {
  id: string
  scene_id: string
  order: number // position within scene
  page_number: number // COMPUTED: position within issue, auto-updates
  orientation: 'LEFT' | 'RIGHT' | 'SPREAD_LEFT' | 'SPREAD_RIGHT' | 'MIRROR_LEFT' | 'MIRROR_RIGHT'
  page_type: 'SINGLE' | 'SPREAD' | 'MIRROR'
  linked_page_id?: string // for spreads/mirrors, reference to paired page
  template?: 'STANDARD' | 'NINE_PANEL_GRID' | 'SIX_PANEL_GRID' | 'CUSTOM'
  notes_to_artist?: string // included in export
}
```

### Panel
```typescript
interface Panel {
  id: string
  page_id: string
  order: number // position on page
  panel_number: number // COMPUTED: position within issue, auto-updates
  visual_description: string // what we see (required)
  characters_present: string[] // character IDs (required)
  location_id?: string // defaults to scene location if not specified
  sfx?: string
  panel_size?: 'FULL_PAGE' | 'HALF' | 'THIRD' | 'QUARTER' | 'INSET' | 'SMALL' | 'LARGE' | 'CUSTOM'
  camera?: string // e.g., "Extreme close-up", "Wide shot", "POV"
  notes_to_artist?: string // included in export
  internal_notes?: string // NOT in export, writer only
}
```

### DialogueBlock
```typescript
interface DialogueBlock {
  id: string
  panel_id: string
  order: number // sequence within panel, drag to reorder
  speaker_id?: string // character ID, nullable for unknown speakers
  speaker_name?: string // for characters not in database (e.g., "COP #1")
  delivery_type: 'STANDARD' | 'VO' | 'OS' | 'BACKGROUND'
  delivery_instruction?: string // e.g., "MUTTERS", "LAUGHS", "SOBS"
  balloon_number: number // for multiple balloons from same speaker: 1, 2, 3
  text: string
}
```

### Caption
```typescript
interface Caption {
  id: string
  panel_id: string
  order: number // sequence within panel
  type: 'NARRATION' | 'LOCATION' | 'TIME' | 'OTHER'
  text: string
}
```

### Character
```typescript
interface Character {
  id: string
  series_id: string
  name: string // full name
  display_name: string // how it appears in script: "MARSHALL"
  physical_description?: string // for artist reference
  speech_patterns?: string // verbal tics, vocabulary, rhythm
  relationships?: string // connections to other characters
  arc_notes?: string // where they start, where they end
  first_appearance?: string // e.g., "Issue 1, Page 4"
}
```

### Location
```typescript
interface Location {
  id: string
  series_id: string
  name: string
  description?: string
  visual_details?: string // for artist
  first_appearance?: string
}
```

### Version
```typescript
interface Version {
  id: string
  entity_type: 'SERIES' | 'ISSUE' | 'SCENE' | 'PAGE' | 'PANEL'
  entity_id: string
  snapshot: object // full state at this moment
  created_at: Date
  name?: string // optional label, e.g., "Before Paul's notes"
}
```

### LooseEnd
```typescript
interface LooseEnd {
  id: string
  series_id: string
  session_id?: string // if created during a session
  type: 'UNTRACKED_CHARACTER' | 'UNTRACKED_LOCATION' | 'CONTINUITY_FLAG' | 'PAGE_ALIGNMENT' | 'OTHER'
  description: string
  page_reference?: string // e.g., "Issue 2, Page 16"
  resolved: boolean
  resolved_at?: Date
  created_at: Date
}
```

### Session
```typescript
interface Session {
  id: string
  user_id: string
  series_id: string
  started_at: Date
  ended_at: Date
  summary: string // AI-generated
  progress: string
  todo: string
  stats: {
    words_written: number
    panels_created: number
    pages_created: number
    time_spent_minutes: number
  }
}
```

---

## Phase 1: MVP Scope

### Core Features

1. **Auth:** Google OAuth login via Supabase
2. **Dashboard:** List projects, create new, see progress
3. **Project Home:** Series overview, issues grid, characters, locations, plotlines
4. **Issue Editor:** Three-column layout (navigation | editor | toolkit)
5. **Panel Editor:** Structured fields for all panel data
6. **Character/Location Database:** CRUD, dropdown population, searchable ("show every panel Tracy is in")
7. **Plotline Management:** Define plotlines, assign colors, use in dropdowns
8. **Drag-and-Drop:** Reorder panels, pages, scenes with auto-renumbering
9. **Auto-Save:** Every change saved (debounced ~2 seconds)
10. **Version History:** Browse by date, name versions, restore any version
11. **Find and Replace:** Across entire issue or series
12. **Word Count:** Always visible in editor
13. **Export:** PDF and Google Doc in exact script format
14. **AI Sidebar:** Conversational interface with full project context
15. **Loose Ends Tracking:** Flag untracked characters/locations during drafting

### Screens

| Route | Purpose |
|-------|---------|
| `/` | Dashboard - all projects |
| `/project/[seriesId]` | Project Home - series overview |
| `/project/[seriesId]/issue/[issueId]` | Issue Editor - main workspace |
| `/project/[seriesId]/characters` | Character Manager |
| `/project/[seriesId]/locations` | Location Manager |
| `/project/[seriesId]/plotlines` | Plotline Manager |
| `/project/[seriesId]/notes` | Project Notes |

### Issue Editor Layout (Three Columns)

#### Left Column: Navigation (collapsible)
- Issue title and number
- Act list (expandable)
  - Scene list within each act (expandable)
    - Page list within each scene
- Click any item → navigate to it in center
- Drag scenes to reorder (auto-renumbers)
- Drag pages to reorder (auto-renumbers)
- "Add Scene" button at act level
- "Add Page" button at scene level

#### Center Column: Editor
**When Scene Selected:**
- Scene title (editable)
- Plotline dropdown
- Characters multi-select
- Location dropdown
- Scene notes

**When Page Selected:**
- Page number (computed, display only)
- Orientation (LEFT/RIGHT, computed but overridable)
- Page type selector (Single / Spread / Mirror)
- Template selector (Standard / 9-Panel Grid / etc.)
- Notes to artist

**Panel List:**
- Each panel as a card, vertically stacked
- Drag handle for reordering
- Click to expand/edit
- "Add Panel" button at bottom

**Panel Editor (expanded):**
- Panel number (computed)
- Visual description (large text area) — REQUIRED
- Camera (dropdown + freeform)
- Panel size (dropdown)
- Characters present (multi-select) — REQUIRED
  - Dropdown shows all characters in project
  - Characters already tagged in current panel show "(in panel)" indicator
  - "Type new name..." option at bottom for ad-hoc characters
- Location (dropdown, defaults to scene)
- **Dialogue section:**
  - List of dialogue blocks, drag to reorder
  - Each block:
    - Speaker dropdown (shows all characters, "(present in panel)" indicator, "Type new name..." option)
    - Delivery type dropdown (Standard, V.O., O.S., Background)
    - Delivery instruction (freeform: MUTTERS, LAUGHS, etc.)
    - Balloon number (auto-increments for same speaker)
    - Text (the dialogue)
  - "Add Dialogue" button
- **Captions section:**
  - List of captions, drag to reorder
  - Each: Type, Text
  - "Add Caption" button
- SFX field
- Notes to artist
- Internal notes (never exported)

#### Right Column: Toolkit (collapsible)

**Default State:** Collapsed to thin strip showing only current issue theme as single line.

**Expanded State (one click):**
- **Issue Context:**
  - Theme (always visible even when collapsed)
  - Motifs (bulleted list)
  - Visual style notes
  - Stakes
  - Issue rules/conventions
- **AI Chat:**
  - Full conversation history within session
  - Text input at bottom
  - Collapsible independently
  - "Save to Notes" button on any AI response to preserve insight to Project Notes

**Scene Header (contextual):**
When entering a page, briefly show at top of editor:
```
Page 12 (left) • Act II • Tracy subplot • 4 of 6 pages in scene
```
Orients writer without requiring them to hold it in memory.

**Contextual Tooltips:**
- When cursor in visual description field → small icon expands to show motifs
- When cursor in dialogue with character selected → hover shows speech patterns
- Present but not intrusive

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + S | Force save (with visual confirmation) |
| Cmd/Ctrl + Z | Undo |
| Cmd/Ctrl + Shift + Z | Redo |
| Cmd/Ctrl + F | Find/Replace dialog |
| Cmd/Ctrl + Enter | Add new panel (when in page view) |
| Tab | Next field in panel editor |
| Shift + Tab | Previous field |
| Escape | Collapse current panel / Close modal |

### Loose Ends Tracking (Phase 1)

When user types a speaker name not in character database:
1. Accept it (don't block workflow)
2. Save with `speaker_name` string
3. Create `LooseEnd` record of type `UNTRACKED_CHARACTER`
4. Show indicator in UI (small badge on character field)
5. Surface in session summary

Same for locations referenced but not in database.

---

## Auto-Formatting Rules

### Character Names in Descriptions
When a character name from database appears in visual description, auto-capitalize on blur:
- `"Marshall walks in"` → `"MARSHALL walks in"`
- Apply on field blur (when user leaves the field)
- Do NOT apply inside dialogue text

### Page Number Computation
```
page_number = (sum of all pages in previous scenes in issue) + order_within_scene
```
Recalculate entire issue on any page reorder, add, or delete.

### Panel Number Computation

**Internal tracking:**
```
panel_number = (sum of all panels on previous pages in issue) + order_on_page
```
This gives each panel a unique sequential number within the issue for reference.

**Export display:**
Panel numbers RESTART at 1 on each page. The export shows "PANEL 1:", "PANEL 2:" etc. per page, not continuous across the issue.

Recalculate on any panel add, remove, or reorder.

### Orientation Computation
```
if page_number is odd: orientation = RIGHT (recto page)
if page_number is even: orientation = LEFT (verso page)
```
**Exception:** User can override for spreads/mirrors.

### Spread/Mirror Handling
- When user creates a SPREAD, system creates two linked pages
- Both pages move together when dragged
- Spread always lands on even-odd pair (left-right)
- If user tries to place spread starting on odd page, warn and suggest fix

---

## Export Specification

### Format
Match the exact format from the user's existing scripts.

### Document Structure

**Note:** Panel numbers restart at 1 on each page (PANEL 1, PANEL 2, etc.).

```
[SERIES TITLE] - ISSUE #[NUMBER]
By [Author Name]
CHAPTER [NUMBER]: [ISSUE TITLE]

TL;DR SUMMARY
[Issue summary paragraph]

PAGE [N] ([orientation])
PANEL 1: [Visual description with CHARACTER NAMES in caps.]
[Optional: Camera/size notes if present]
CHARACTER: Dialogue text.
CHARACTER (V.O.): Voice over dialogue.
CHARACTER (O.S.): Off-screen dialogue.
CHARACTER [INSTRUCTION]: Dialogue with delivery instruction.
CHARACTER 2: Second balloon from same speaker.
CAP: Caption text.
SFX: Sound effect!

PANEL 2: [Next panel description...]
[Continue for all panels on page]

PAGE [N+1] ([orientation])
PANEL 1: [Panel numbers restart each page]
...

PAGES [N]-[N+1] (DOUBLE-PAGE SPREAD)
[Spread content]

PAGES [N]-[N+1] ([orientation], [orientation]) — mirror pages
*Note to Artist: These pages should look like mirrors.*
[Mirror content]

END OF ISSUE #[NUMBER]
```

### Dialogue Attribution Formats
| Type | Format |
|------|--------|
| Standard | `MARSHALL: Line.` |
| Voice Over | `MARSHALL (V.O.): Line.` |
| Off-Screen | `MARSHALL (O.S.): Line.` |
| Background | `NEWS REPORTER [IN BACKGROUND]: Line.` |
| With instruction | `KEN [LAUGHING]: Line.` |
| Multiple balloons | `ROYCE:` then `ROYCE 2:` for same speaker |

### Export Options
- **Format:** PDF or Google Doc
- **Include Summary:** Yes / No
- **Include Artist Notes:** Yes / No
- **Include Internal Notes:** Never (always excluded)

---

## AI Assistant Specification

### Context Provided on Every Interaction
- Series metadata (title, theme, plotlines, visual grammar)
- Full current issue outline (summary, motifs, stakes, themes, rules)
- Full current issue script (all pages, panels, dialogue)
- Character database (all characters with profiles)
- Location database
- Project notes (open questions, decisions, insights)
- Current cursor position (which page/panel user is viewing)
- Conversation history within current session

**Context Window Capacity:** Claude's context window (~200K tokens) can comfortably hold a full 40-page comic script (~10-15K tokens) plus all metadata, outlines, and conversation history simultaneously. No need to truncate or summarize.

**Session Behavior:** AI conversation history resets on new session (stateless). However, the AI always reads the full project context (scripts, characters, notes) on every interaction, so it maintains understanding of the work even without conversation history. Users can preserve key insights by saving AI responses to Project Notes.

### Behavior by Phase

| Phase | AI Role |
|-------|---------|
| **Ideation** | Listen to riffs, summarize, ask clarifying questions, identify gaps, challenge weak ideas, argue constructively |
| **Structure** | Ask meta-prompts: "What's the turn in Act 2?", "What does reader know that Marshall doesn't?", flag pacing issues |
| **Weave** | Flag gaps: "You haven't checked in with Tracy for 8 pages—intentional?", suggest alternatives |
| **Drafting** | Available in sidebar, not interrupting. Can draft pages for user to react to and rewrite. Answer questions. |
| **Editing** | Read panels, push for greatness, give candid feedback, provide power rankings across issues |

### Tone and Approach
- Candid and firm, but constructive
- Willing to argue and push back
- Respects that writer knows their story better
- Asks more than tells (Socratic)
- Celebrates breakthroughs, doesn't sugarcoat weaknesses
- Never precious about its own suggestions

### What AI NEVER Does
- Write final dialogue (only drafts for user to rewrite)
- Make changes without asking
- Silently infer important facts
- Provide generic feedback (always specific to this project)
- Pretend to understand something it doesn't
- Act on uncertain information without confirming

---

## Phase 2: Structure & Import

### Weave Visualization

**URL:** `/project/[seriesId]/issue/[issueId]/weave`

**Purpose:** See the shape of an entire issue at a glance. Understand plotline pacing. Experiment with scene order.

**Layout:**
- X-axis: Pages (1 to ~40)
- Y-axis: Plotlines (color-coded rows)
- Scenes rendered as horizontal blocks:
  - Width = page count
  - Color = plotline color
  - Label = scene title or first beat
- Page orientation markers (L/R) along top
- Act dividers as vertical lines

```
WEAVE VIEW MOCKUP

Plotlines:
─────────────────────────────
Marshall IRL      [Red]
Marshall Neural   [Blue]
Paul Solo         [Green]
Tracy Solo        [Purple]
Paul+Tracy        [Orange]

Pages:   1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20
         R  L  R  L  R  L  R  L  R  L  R  L  R  L  R  L  R  L  R  L

Marshall IRL     [████████]              [████]        [██████████]
Marshall Neural           [██████████████]      [████████]
Paul Solo                                              [████]
Tracy Solo                    [████]
Paul+Tracy       [████]                                        [████]

         |──── Act I ────|────── Act II ──────|───── Act III ─────|
```

**View Mode:**
- Hover scene block → tooltip with details
- Click scene → navigate to scene in editor

**Edit Mode (Draft):**
- Drag scene blocks to reorder
- Visual guides show drop target
- Page numbers preview in real-time
- Conflicts highlighted (spread landing wrong, reveal on wrong side)
- Nothing saves until "Commit"

**Commit:**
- Click "Commit Changes"
- System shows continuity report:
  - Pages that changed orientation
  - Reveals now on wrong page side
  - Plotline gap warnings
  - Potential continuity issues
- User confirms or cancels
- On confirm → changes save and propagate

### Outline Layer

**URL:** `/project/[seriesId]/outline`

**Layout:**
- Series-level info at top (theme, visual grammar)
- All issues as expandable sections
- Per-issue: title, tagline, themes, motifs, stakes, act-by-act beats

**AI Sync from Scripts:**
1. User clicks "Update Outline from Scripts"
2. AI reads all scripts in series
3. AI generates proposed outline
4. User reviews in diff view (current | proposed)
5. User accepts all, per-section, or edits
6. Outline updates

**Divergence Detection:**
- System compares outline to scripts
- Flags: "Outline says X happens in Act II, but script doesn't include this"
- User can update outline, update script, or dismiss

### Session Summaries

**Trigger:** Automatic on tab close / navigate away. Can skip if rushed.

**Content:**
```
SESSION SUMMARY — January 20, 2026
Duration: 2h 14m

PROGRESS
✓ Drafted pages 14-18 (Scene: Tracy Infiltrates /theSTANS/)
✓ Added character profile: RECOVERY STAN
✓ Moved Scene 4 from Act II to Act III

TO-DO
○ Pages 19-22 need drafting
○ Act III scene order marked tentative
○ Review continuity after Scene 4 move

LOOSE ENDS
⚠ New character "DR. CHEN" used on page 16 — not in database
⚠ Location "Interscope Lobby" referenced — not in database
⚠ Page 17 reveal now lands on RIGHT page (was LEFT) — intentional?

STATS
Words written: 1,847
Panels created: 23
Pages created: 5
```

**Storage:** Saved to database. User can browse session history.

### Import from Google Docs

**Flow:**
1. User clicks "Import Script"
2. User pastes Google Doc content
3. System divides into chunks (~4-5 pages each)
4. For each chunk:
   - AI parses into structured data
   - User reviews side-by-side (original | parsed)
   - User corrects errors
   - User confirms chunk
5. Full issue imported

**Parsing Rules:**
- `PAGE X` or `PAGE X (left/right)` → page break
- `PANEL X:` → panel break
- `CHARACTER:` or `CHARACTER (V.O.):` → dialogue
- `SFX:` → sound effect
- `CAP:` or `CAPTION:` → caption
- Other text in panel context → visual description

Flag low-confidence parses for user review. Ask, don't assume.

### Mobile Voice Ideation

**Flow:**
1. User opens app on mobile
2. Selects project and issue
3. Enters "Voice Mode"
4. Screen shows:
   - Current issue context (theme, where you left off)
   - AI chat interface
   - Voice input button (WhisperFlow)
5. User speaks → transcribed to text
6. Transcript appears as user message
7. AI responds with text
8. User reads, speaks again

**Saving Insights:**
User can tap "Save to Notes" on any AI response to preserve it to Project Notes.

---

## Phase 3: Analytics & Intelligence

### Analytics Dashboard

**URL:** `/project/[seriesId]/analytics`

**Purpose:** The user has a competitive brain and is motivated by data. These visualizations help maintain momentum, identify productivity patterns, and track progress toward completion.

#### Volume Stats
- Total words written (lifetime, this week, today)
- Panels completed
- Pages completed
- Issues completed

#### Consistency Stats
- Writing streak (consecutive days with activity)
- Average session length
- Most productive time of day (chart)
- Words per session over time (line graph)

#### Progress Stats
- Percentage of current issue drafted (progress bar)
- Percentage of series completed (progress bar)
- Pace projection: "At this rate, Issue 6 complete by [date]"

#### Quality-Adjacent Stats
- Average panels per page (efficiency over time)
- Dialogue-to-description ratio
- Average panel description length
- Trends over time (are you getting tighter?)

#### Visualizations
- Line graphs for trends
- Bar charts for comparisons
- Heat maps for activity by day/time
- Progress bars for completion

### Power Rankings

**Purpose:** AI evaluates relative quality of issues for consistency.

**Criteria:**
- Structural coherence (clear acts, scenes, pacing)
- Character voice consistency
- Theme resonance
- Page turn effectiveness
- Dialogue efficiency
- Visual description clarity

**Output:**
- Ranked list of issues by quality
- Per-issue breakdown with specific notes:
  - "Issue 2 has weaker Act II pacing than others"
  - "Issue 5's L.M. POV is structurally ambitious"
- Specific recommendations for leveling up weaker issues

**User Interaction:**
- "What makes Issue 3 stronger than Issue 2?"
- "How can I level up Issue 4?"
- AI provides specific, actionable feedback referencing actual content

### Character State Tracking

**Per-Issue View:**
- Starting state (emotional + plot position)
- Key moments (page references)
- Ending state
- Arc summary (one sentence)

**Series View (Macro Graph):**
- Line graph per character showing state across all issues
- Key inflection points marked
- Color-coded by issue

**Data Model:**
```typescript
interface CharacterState {
  id: string
  character_id: string
  issue_id: string
  emotional_state: string // hope/despair spectrum
  plot_position: string // in control, out of control, safe, danger
  summary: string // one sentence
}
```

**AI Generation:**
- AI reads scripts, proposes character states
- Surfaces interpretation: "Based on pages 12-15, Tracy seems 'desperate but determined'—accurate?"
- User reviews and confirms
- Updates when scripts change significantly
- Accuracy of inference = proof of genuine comprehension

### Continuity Monitoring

**Passive Tracking:**
- Character appearances (which panels)
- Location appearances (which scenes)
- Chronological markers (year, time of day)
- Character knowledge (what each character knows when)

**Active Alerts (on significant changes):**
- Character references something they don't know yet
- Character in location they haven't traveled to
- Timeline logic breaks
- Emotional reaction without setup
- Page alignment changed (reveal now on wrong side)

**Manual Check:**
- User runs "Continuity Check" on demand
- AI scans full issue or series
- Returns report of potential issues
- User reviews and resolves

---

## Critical Requirements

These are non-negotiable:

1. **Zero data loss** — Auto-save must work. Every change persisted.
2. **Fast and responsive** — Page loads <2 seconds. No typing lag.
3. **Drag-and-drop feels native** — Smooth, immediate feedback.
4. **Version history complete** — Browse any date, name important versions, restore any version.
5. **Undo/redo deep history** — Not just one step back. Full undo stack like Google Docs.
6. **Export exactly matches format** — Compare against sample scripts for accuracy.

---

## File Structure

```
/app
  /page.tsx                           # Dashboard
  /project
    /[seriesId]
      /page.tsx                       # Project Home
      /outline/page.tsx               # Outline View (Phase 2)
      /analytics/page.tsx             # Analytics (Phase 3)
      /notes/page.tsx                 # Project Notes
      /plotlines/page.tsx             # Plotline Manager
      /characters/page.tsx            # Character Manager
      /locations/page.tsx             # Location Manager
      /issue
        /[issueId]
          /page.tsx                   # Issue Editor
          /weave/page.tsx             # Weave View (Phase 2)

/components
  /editor
    /IssueEditor.tsx                  # Main three-column layout
    /NavigationTree.tsx               # Left column
    /PanelEditor.tsx                  # Center column
    /ToolkitSidebar.tsx               # Right column
    /DialogueBlock.tsx
    /CaptionBlock.tsx
    /SceneHeader.tsx
    /PageHeader.tsx
  /weave
    /WeaveTimeline.tsx
    /SceneBlock.tsx
  /ai
    /AIChatPanel.tsx
    /VoiceMode.tsx
  /database
    /CharacterEditor.tsx
    /LocationEditor.tsx
    /PlotlineEditor.tsx
  /analytics
    /Dashboard.tsx
    /Charts.tsx
  /export
    /ExportModal.tsx
    /ExportPreview.tsx
  /ui
    /... (shared components: Button, Input, Modal, etc.)

/lib
  /supabase.ts                        # Database client and queries
  /claude.ts                          # AI client
  /export.ts                          # Export formatting functions
  /utils.ts                           # Helpers
  /auto-format.ts                     # Character name capitalization, etc.
  /numbering.ts                       # Page/panel number computation

/types
  /index.ts                           # All TypeScript interfaces
```

---

## Open Questions for Development

These are decisions to finalize during build, not blockers:

### UX Details
- Exact column width proportions for three-column layout
- Animation/transition timing for drag-and-drop
- Mobile breakpoints and responsive behavior
- Dark mode / light mode (user has dark mode in Panel Flow 1.0)
- Specific icon library

### Technical Details
- Exact debounce timing for auto-save (suggested: 2 seconds)
- Version history retention policy (keep all? prune after N months?)
- Supabase row-level security configuration
- Claude API token optimization (how much context per request)
- Error handling UX for failed saves or API calls

### AI Calibration
- Exact system prompts for each AI task
- Confidence thresholds for parsing
- How aggressively to suggest vs. wait to be asked

---

## Reference: Sample Scripts

The canonical script format reference is the user's existing work:
- **Issue #1: "Public Service Announcement (SILENCE)"** — ~37 pages
- **Issue #2: "I'm Back"** — ~40 pages

**Existing Work Status:** The user has outlines for all 8 issues plus working drafts of Issues 1-5 in Google Docs. These will need to be imported using the Phase 2 import feature.

These scripts demonstrate:
- Page headers with orientation
- Panel numbering restarting each page
- Character names in ALL CAPS in descriptions
- Dialogue blocks with speaker, delivery type, text
- SFX and CAP as distinct elements
- Notes to artist in context
- **Media Chorus:** A recurring visual device where talking-head pundits appear as inset panels, formatted with character names like "OLDER WHITE MAN [CNN PUNDIT]:" — this is a series-specific convention
- Mirror pages explicitly noted
- Spreads explicitly noted
- TL;DR summary at opening

**Export must match this format exactly.** When in doubt, reference these scripts.

---

## Notes for Development

1. **Start with Supabase schema** — Get data models right first
2. **Build auth early** — Google OAuth via Supabase
3. **Get basic CRUD working** — Before drag-and-drop or AI
4. **Test auto-renumbering thoroughly** — This is core functionality
5. **Export format must match exactly** — Test against sample scripts
6. **AI sidebar can be simple first** — Basic chat, then sophistication
7. **Version history is critical** — User relies on this heavily
8. **Word count always visible** — Like Google Docs
9. **Auto-save must never fail silently** — Clear error states
10. **Mobile is Phase 2** — Desktop-first for MVP

---

*This document is the source of truth for Panel Flow 2.0 development.*
