# Panel Flow 2.0

A professional comic book script writing tool for sequential art writers.

**Last updated:** 2026-03-10

---

## What This Is

Panel Flow is a structured writing environment for comic book scripts. It replaces Google Docs (for writing), Google Sheets (for structure/weave visualization), and fragmented AI conversations (for creative collaboration) with a unified, purpose-built application.

**Primary User:** Professional writer working on an 8-issue graphic novel with multiple plotlines, non-linear timelines, and sophisticated structural requirements.

**Core Value:** Reduce formatting tedium, maintain creative context across complex projects, provide AI creative partnership that asks the right questions at every phase.

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16.1.4 |
| UI | React + Tailwind CSS | React 19, Tailwind 4 |
| Database | Supabase (PostgreSQL) | supabase-js 2.91 |
| Auth | Google OAuth via Supabase | @supabase/ssr 0.8 |
| AI | Claude API (Anthropic) | claude-sonnet-4, SDK 0.71 |
| Rich Text | TipTap (ProseMirror) | 3.20 + tiptap-markdown 0.9 |
| Drag & Drop | dnd-kit | core 6.3, sortable 10.0 |
| UI Components | Radix UI | dialog, dropdown, select, tabs, tooltip, popover, collapsible |
| Icons | Lucide React | 0.562 |
| Export | jsPDF + docx + plain text | jspdf 4.0, docx 9.5 |
| Forms | react-hook-form + zod | rhf 7.71, zod 4.3 |
| Hosting | Vercel | Production |

---

## Design Principles

1. **Ask, Don't Assume** — AI never silently infers. Always surface interpretations and ask for confirmation.
2. **The Script Is Truth** — When outline and script conflict, script wins.
3. **Reduce Formatting Tedium** — Auto-capitalize character names, auto-number panels/pages, auto-format dialogue.
4. **Auto-Renumber Everything** — Drag-and-drop at any level triggers automatic renumbering.
5. **Google Docs Is the Bar** — Auto-save, version history, find-and-replace, reliability, speed.
6. **Toolkit, Not Tyranny** — Motifs, themes, and rules are reminders, not constraints.
7. **The Writing Stays Human** — AI collaborates and challenges. The writer does the actual writing.

---

## Application Routes

### Core
| Route | Purpose |
|-------|---------|
| `/` | Landing page, redirects to dashboard if logged in |
| `/login` | Google OAuth via Supabase |
| `/pending-approval` | Gated access for unapproved users |
| `/dashboard` | Series list, create new, admin user management |
| `/invite/[token]` | Collaboration invitation acceptance |

### Series
| Route | Purpose |
|-------|---------|
| `/series/new` | Create series (manual or AI-guided) |
| `/series/[seriesId]` | Series home: metadata, issues grid, tools grid, world building links |
| `/series/[seriesId]/characters` | Character CRUD |
| `/series/[seriesId]/characters/[characterId]/voice` | AI character voice profile analysis |
| `/series/[seriesId]/locations` | Location CRUD |
| `/series/[seriesId]/plotlines` | Plotline CRUD with color assignment |
| `/series/[seriesId]/notes` | Project notes (open questions, decisions, AI insights) |
| `/series/[seriesId]/canvas` | Pre-structure idea brainstorming board |
| `/series/[seriesId]/guide` | AI Socratic writing sessions (Guided Mode) |
| `/series/[seriesId]/outline` | Series outline with AI sync-from-scripts |
| `/series/[seriesId]/weave` | Series-level plotline weave across all issues |
| `/series/[seriesId]/analytics` | Writing analytics dashboard |
| `/series/[seriesId]/sessions` | Session history with loose ends |
| `/series/[seriesId]/continuity` | AI continuity checker |
| `/series/[seriesId]/patterns` | Cross-issue plotline patterns |
| `/series/[seriesId]/character-arcs` | Character emotional arc tracking |
| `/series/[seriesId]/deadlines` | Deadline management dashboard |
| `/series/[seriesId]/collaboration` | Sharing and comments (via ShareButton) |

### Issue
| Route | Purpose |
|-------|---------|
| `/series/[seriesId]/issues/[issueId]` | Main three-column editor (nav / editor / toolkit) |
| `/series/[seriesId]/issues/[issueId]/weave` | Issue-level weave view with drag-and-drop |
| `/series/[seriesId]/issues/[issueId]/blueprint` | Structural planning view |
| `/series/[seriesId]/issues/[issueId]/read` | Read-only formatted script view |
| `/series/[seriesId]/issues/[issueId]/rhythm` | Visual rhythm/pacing analysis |
| `/series/[seriesId]/issues/[issueId]/scene-analytics` | Scene-level analytics |
| `/series/[seriesId]/issues/[issueId]/history` | Version history with snapshots |
| `/series/[seriesId]/issues/[issueId]/import` | Import script from pasted text |

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
                                ├── Caption
                                └── Sound Effect
```

---

## Issue Editor (Main Workspace)

Three-column layout: Navigation | Editor | Toolkit

### Left Column: Navigation Tree
- Act/Scene/Page hierarchy, all expandable
- Drag-and-drop reordering of scenes and pages (auto-renumbers)
- Add Scene / Add Page buttons
- Scene descriptions show as tooltips

### Center Column: Editor
**Page view shows:**
- Context breadcrumb: `ACT [N] // [plotline] // [X] OF [Y] IN SCENE`
- Page number (computed), orientation (LEFT/RIGHT), page type selector
- Panel cards, vertically stacked, drag to reorder
- Each panel: visual description (TipTap rich text), shot type, dialogue blocks, captions, SFX, artist notes, internal notes
- Keyboard shortcuts: Cmd+S (save), Cmd+Z/Shift+Z (undo/redo), Cmd+F (find/replace), Cmd+Enter (add panel)

**Additional editor modes:**
- **ScriptView** — Continuous scrolling script with inline editing
- **ZenMode** — Distraction-free writing (description + notes only)
- **BlueprintView** — Structural planning focus
- **ReadingView** — Read-only formatted output

### Right Column: Toolkit
- Issue context (theme, motifs, visual style, stakes, rules)
- AI Chat sidebar with streaming responses and tool proposals
- Pacing analysis
- Previous page context (collapsible)
- Command palette (Cmd+K) for quick navigation

---

## Rich Text Editing (TipTap)

All script writing surfaces use TipTap with markdown storage via `tiptap-markdown`. Content stored as plain TEXT in Postgres — zero database migration needed. All exports, AI context, and find/replace read markdown from the database unchanged.

### ScriptEditor Component
Single component with `variant` prop controlling toolbar and behavior:

| Variant | Toolbar | Used For |
|---------|---------|----------|
| `description` | Full (B/I/U/S, lists, heading, blockquote, code, hr) | Visual descriptions |
| `dialogue` | Compact (B/I only) + word count with letterer warnings | Dialogue blocks |
| `caption` | Compact (B/I only) | Caption text |
| `sfx` | None, single-line behavior | Sound effects |
| `notes` | Medium (B/I/U, lists) | Artist notes, internal notes |

### Key Implementation Details
- `immediatelyRender: false` required for Next.js SSR compatibility
- Markdown extracted via `editor.storage.markdown.getMarkdown()`
- Type casting: `((editor.storage as any).markdown as MarkdownStorage)`
- Save patterns: description uses debounced onChange auto-save; dialogue/caption/sfx use onBlur immediate save
- Undo integration: onFocus captures start state, onBlur records end state

---

## AI System

### Architecture
- **Model:** Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **Streaming:** Server-Sent Events via `/api/chat` and `/api/guide`
- **Context:** Full project context assembled per-request (~200K token window)
- **Tools:** 20+ tools the AI can propose (writer confirms before execution)

### Context Assembly (`src/lib/ai/context-assembler.ts`)
Every AI interaction receives:
- Series metadata (title, logline, theme, visual grammar, rules)
- Characters (cap 30) with display names, speech patterns, relationships
- Locations (cap 20)
- Plotlines with sort order
- Canvas items (unfiled, cap 20)
- Project notes (unresolved, cap 20)
- Full issue script text (cap 300K chars)
- Current page detail
- Other issues in series (number, title, summary, status)
- Writer profile (synthesized narrative portrait)
- Recent conversation summaries
- Personality preset modifier

### AI Persona (`src/lib/ai/client.ts`)
Elite veteran editor of sequential art storytelling. Values: honest over nice, specific over general, questions over answers, less is more. Socratic approach — one focused question at a time. Never generic.

### Writing Phases (`src/lib/ai/phases.ts` + `curriculum.ts`)
7 phases with distinct AI behavior and gate requirements:

| Phase | AI Focus | Gate to Next |
|-------|----------|-------------|
| Ideation | Listen, organize, challenge | Three Anchor Questions answered (emotional_thesis, false_belief, reader_takeaway) |
| Structure | Acts, beats, turning points | Gap-naming ritual complete |
| Weave | Plotline interleaving, pacing | Plotline accounting complete |
| Page Craft | Four-beat reading loop, page architecture | Four-beat architecture review |
| Drafting | Available but not interrupting | N/A |
| Editing | Candid feedback, push for greatness | N/A |
| Art Prompts | Artist-facing notes | N/A |

Each phase has `activeMoves` (what AI should do), `hardNos` (what AI must never do), and `advancementSignals` (when to suggest moving forward).

**Four-Beat Reading Loop:** The Page Craft phase enforces a comics-specific craft framework where every left-right page pair is a four-beat dramatic unit: reveal (top-left) → bridge (bottom-left) → pickup (top-right) → cliffhanger (bottom-right). Full rules including splash/spread interactions and modular scene units are in `curriculum.ts`.

### AI Tools (`src/lib/ai/tools.ts`)
The AI can propose actions that the writer confirms or dismisses:

**World building:** `create_character`, `update_character`, `create_location`, `create_plotline`
**Capture:** `save_canvas_beat`, `save_project_note`, `add_panel_note`
**Script work:** `update_scene_metadata`, `draft_panel_description`, `add_dialogue`
**Analysis:** `generate_power_rankings`, `track_character_state`, `continuity_check`, `extract_outline`, `draft_scene_summary`

Tool acceptance/rejection tracked in `writer_profiles.tool_stats` to adapt AI behavior.

### Writer Adaptation
- **Writer Profiles** (`writer_profiles` table): AI synthesizes a narrative portrait from conversation patterns, updated every 5 conversations
- **Personality Presets** (`ai_personality_presets`): Custom system prompt modifiers
- **Conversation Persistence** (`ai_conversations`): Messages, tool outcomes, synthesized summaries stored per-context

### Guided Mode (`/series/[seriesId]/guide`)
Dedicated Socratic exploration sessions (distinct from sidebar chat):
- Session types: general, character deep dive, world building, outline
- Session persistence with pause/resume
- Focus shifting mid-session
- Insight extraction with confidence scoring → `writer_insights` table

---

## Collaboration System

- **Roles:** owner, editor, commenter, viewer
- **Invitation flow:** Email invite → token → acceptance page
- **Comments:** Page-level and panel-level with threading and resolution
- **RLS:** Row-level security with helper functions (`user_can_view_series`, `user_can_edit_series`, etc.)
- **Notifications:** Per-series notification preferences (comments, edits, daily digest)

---

## Export System

Three formats, all reading from database:

| Format | Library | File |
|--------|---------|------|
| PDF | jsPDF | `src/lib/exportPdf.ts` |
| Word (.docx) | docx | `src/lib/exportDocx.ts` |
| Plain Text | native | `src/lib/exportTxt.ts` |

### Export Format
Panel numbers restart at 1 on each page. Character names ALL CAPS in descriptions.
```
[SERIES TITLE] - ISSUE #[NUMBER]
By [Author Name]

PAGE [N] ([orientation])
PANEL 1: [Visual description with CHARACTER NAMES in caps.]
CHARACTER: Dialogue text.
CHARACTER (V.O.): Voice over.
CHARACTER [LAUGHING]: With delivery instruction.
CAP (NARRATIVE): Caption text.
SFX: Sound effect!
```

Dialogue type suffixes: `(V.O.)`, `(O.S.)`, `(WHISPER)`, `(SHOUT)`, `(THOUGHT)`, `[IN BACKGROUND]`, `(ELECTRONIC)`, `(RADIO)`

---

## Auto-Formatting

- **Character name capitalization:** On blur, character names from database are auto-capitalized in visual descriptions (`src/lib/auto-format.ts`)
- **Page numbering:** Computed from structural position, recalculated on reorder (`src/lib/renumberPages.ts`)
- **Panel numbering:** Sequential within issue, display restarts per page in export
- **Orientation:** Odd pages = RIGHT, even pages = LEFT

---

## Canvas Mode (`/series/[seriesId]/canvas`)

Pre-structure brainstorming board for early ideation:
- Item types: character, theme, visual, scenario, dialogue, conflict, world
- Color tagging (8 colors)
- Graduation: promote canvas items to characters or locations
- Filing: attach items to specific scenes or pages
- AI can create canvas items via `save_canvas_beat` tool

---

## Analytics & Intelligence

### Analytics Dashboard (`/series/[seriesId]/analytics`)
- Volume stats (words, panels, pages, issues)
- Session history and velocity
- Progress tracking per issue

### Pacing Analysis (`src/lib/pacing.ts`)
- Per-page metrics: word count, panel count, dialogue ratio
- Overall tempo assessment
- Silent panel sequences
- AI insights on pacing

### Scene Analytics (`src/lib/scene-analytics.ts`)
- Per-scene: page count, panel count, word count, dialogue/silent ratio
- Dramatic function classification
- Efficiency scoring

### Visual Rhythm (`src/lib/visual-rhythm.ts`)
- Per-page rhythm data visualization
- Tempo analysis (slow/moderate/fast/variable)

### Character Voice Profiles (`src/lib/character-voice.ts`)
- AI analysis of character dialogue patterns
- Vocabulary level, sentence length, common words, tone markers, speech quirks
- Dialogue flags when character speaks out of voice

### Power Rankings (AI tool)
- Cross-issue quality comparison
- Structural coherence, voice consistency, theme resonance, pacing

### Character State Tracking (`character_states` table)
- Per-issue emotional state with 1-10 score
- Plot position, key moments, arc summary
- Tracked via AI tool or manual entry

### Continuity Monitoring (AI tool)
- Character appearance tracking
- Timeline/location logic checks
- Cross-issue awareness

---

## Undo/Redo System (`src/contexts/UndoContext.tsx`)

Full undo stack covering 30+ operation types:
- Panel field updates, dialogue/caption/sfx CRUD
- Panel/page/scene/act add, delete, reorder, move, duplicate
- Deep restore: structural operations restore full nested trees with original UUIDs
- Helper functions in `src/lib/undoHelpers.ts`

---

## Find and Replace (`src/lib/search.ts`)

Search across visual descriptions, dialogue, captions, SFX, and notes. Options: match case, whole word. Navigate-to-match and replace-all supported.

---

## Version History

`version_snapshots` table stores full issue state as JSONB. Browse by date, compare snapshots with diff view, restore any version.

---

## Offline Support (`src/contexts/OfflineContext.tsx`)

Detects online/offline status. When offline, queues write operations to localStorage. Auto-syncs when connection restored.

---

## Database Schema (Key Tables)

### Content Tables
| Table | Purpose |
|-------|---------|
| `series` | Top-level project (title, logline, theme, rules) |
| `issues` | Issues within a series (number, title, summary, motifs, stakes, writing_phase, anchor questions, deadline) |
| `acts` | 3 acts per issue (name, beat_summary, intention) |
| `scenes` | Scenes within acts (title, plotline, characters, location, target_page_count) |
| `pages` | Pages within scenes (page_number, page_type, linked_page_id, template, story_beat, visual_motif) |
| `panels` | Panels within pages (visual_description, shot_type, panel_size, characters_present, location) |
| `dialogue_blocks` | Dialogue within panels (speaker, dialogue_type, modifier, text, balloon_number) |
| `captions` | Captions within panels (caption_type, text) |
| `sound_effects` | SFX within panels (text) |

### Entity Tables
| Table | Purpose |
|-------|---------|
| `characters` | Character profiles (name, display_name, role, speech_patterns, relationships, arc_notes) |
| `locations` | Location profiles (name, description, visual_description, significance) |
| `plotlines` | Plotlines (name, color, description, sort_order) |
| `plotline_issue_assignments` | Which plotlines appear in which issues (first_appearance, climax, resolution flags) |

### Intelligence Tables
| Table | Purpose |
|-------|---------|
| `character_states` | Per-issue emotional/plot state tracking |
| `character_voice_profiles` | AI voice analysis (vocabulary, tone, quirks, sample quotes) |
| `dialogue_flags` | Out-of-voice dialogue warnings |
| `scene_analytics` | Computed scene metrics (word count, efficiency, dramatic function) |
| `issue_rhythm_cache` | Per-page rhythm data |
| `pacing_analyses` | Full pacing analysis with AI insights |
| `canvas_items` | Pre-structure brainstorming items |

### AI Tables
| Table | Purpose |
|-------|---------|
| `ai_conversations` | Persisted chat messages, tool outcomes, synthesized summaries |
| `writer_profiles` | AI-synthesized writer portrait, tool acceptance stats |
| `writer_insights` | Extracted insights from Guided Mode (type, confidence, evidence) |
| `ai_personality_presets` | Custom AI behavior modifiers |
| `panel_notes` | AI/user editorial notes on specific panels |
| `guided_sessions` | Guided Mode session persistence |
| `guided_messages` | Messages within guided sessions |

### Collaboration Tables
| Table | Purpose |
|-------|---------|
| `series_collaborators` | User roles per series |
| `collaboration_invitations` | Pending invitations with tokens |
| `comments` | Page/panel comments with threading |
| `collaboration_notifications` | Per-user notification preferences |

### System Tables
| Table | Purpose |
|-------|---------|
| `sessions` | Writing session tracking (stats, duration) |
| `loose_ends` | Untracked characters/locations/continuity flags |
| `version_snapshots` | Issue version history (JSONB snapshots) |
| `project_notes` | Open questions, decisions, AI insights |
| `allowed_users` | App access control |
| `image_attachments` | Polymorphic image storage for characters/locations/series/pages |

---

## File Structure

```
src/
  app/
    api/
      chat/route.ts              # Main AI chat (SSE streaming)
      guide/route.ts             # Guided Mode AI
      guide/extract/route.ts     # Insight extraction
      ai/debrief/route.ts        # Session debrief generation
      ai/synthesize/route.ts     # Conversation summary synthesis
      ai/synthesize-profile/     # Writer profile synthesis
      ai/tool-result/route.ts    # Tool acceptance/rejection
      analyze-script-structure/  # Import script analysis
      issues/[issueId]/renumber/ # Page/panel renumbering
      pages/[pageId]/summarize/  # AI page summary
      health/route.ts            # Health check
    series/
      [seriesId]/
        issues/[issueId]/
          IssueEditor.tsx         # Main three-column layout
          PageEditor.tsx          # Center column panel editor
          NavigationTree.tsx      # Left column nav tree
          Toolkit.tsx             # Right column (AI chat, context, pacing)
          ScriptView.tsx          # Continuous script view
          ZenMode.tsx             # Distraction-free writing
          WeaveView.tsx           # Issue-level weave
          PageTypeSelector.tsx    # Single/Splash/Spread selector
          QuickNav.tsx            # Jump-to-page navigation
          PreviousPageContext.tsx  # Previous page summary
          blueprint/              # Blueprint structural view
          read/ReadingView.tsx    # Read-only formatted view
          rhythm/                 # Visual rhythm analysis
          scene-analytics/        # Scene-level analytics
          history/                # Version history
          import/                 # Script import
  components/
    editor/
      ScriptEditor.tsx            # TipTap rich text editor (5 variants)
      ScriptEditorToolbar.tsx     # Variant-specific formatting toolbar
    ui/
      ConfirmDialog.tsx           # Reusable confirmation dialog
      ErrorDisplay.tsx            # Error states
      EmptyState.tsx              # Empty states
      LoadingSpinner.tsx          # Loading indicator
      ThemeToggle.tsx             # Dark/light mode toggle
    AuthGuard.tsx                 # Route protection
    ChatMessageContent.tsx        # AI message rendering (markdown, tool proposals)
    CommandPalette.tsx            # Cmd+K search
    PacingAnalyst.tsx             # Pacing analysis component
    DescriptionAnalysis.tsx       # Visual description quality analysis
    ImageUploader.tsx             # Image upload with drag-and-drop
    OutlineToggle.tsx             # Outline visibility toggle
    PanelNoteIndicator.tsx        # Panel note badges
    TypeSelector.tsx              # Reusable type selector dropdown
  contexts/
    ThemeContext.tsx               # Light/dark/system theme
    ToastContext.tsx               # Toast notifications
    UndoContext.tsx                # Full undo/redo stack
    OfflineContext.tsx             # Offline detection + queue
  hooks/
    useCommandPalette.ts          # Fuzzy search for Cmd+K
    useEntityImages.ts            # Image fetching from Supabase storage
    useFocusTrap.ts               # Modal focus trapping
    useSession.ts                 # Writing session tracking
  lib/
    ai/
      client.ts                   # Anthropic SDK, persona, system prompt builder
      context-assembler.ts        # Full project context assembly
      token-budget.ts             # Token budget management
      tools.ts                    # 20+ AI tool definitions + execution
      phases.ts                   # Writing phase types and labels
      curriculum.ts               # Phase gates, behaviors, four-beat reading loop
      streaming.ts                # SSE encoder/decoder
      conversations.ts            # Conversation persistence + writer adaptation
    supabase/
      client.ts                   # Browser Supabase client
      server.ts                   # Server Supabase client
      middleware.ts               # Auth middleware
      storage.ts                  # Image storage helpers
    exportPdf.ts                  # PDF export
    exportDocx.ts                 # DOCX export
    exportTxt.ts                  # Plain text export
    auto-format.ts                # Character name capitalization, orientation
    renumberPages.ts              # Page/panel renumbering
    markdown.ts                   # Markdown parsing utilities
    search.ts                     # Find and replace engine
    undoHelpers.ts                # Deep restore for undo operations
    pacing.ts                     # Pacing computation
    visual-rhythm.ts              # Rhythm analysis
    scene-analytics.ts            # Scene metrics
    series-patterns.ts            # Cross-issue pattern analysis
    character-voice.ts            # Character voice profiling
    script-format-detector.ts     # Import format detection
    script-structure-detector.ts  # Import structure detection
    version-diff.ts               # Version comparison
    fetch-with-retry.ts           # Resilient fetch
    rate-limit.ts                 # API rate limiting
    logger.ts                     # Structured logging
    utils.ts                      # General utilities
```

---

## Critical Requirements

1. **Zero data loss** — Auto-save must work. Every change persisted.
2. **Fast and responsive** — No typing lag. Page loads < 2 seconds.
3. **Drag-and-drop feels native** — Smooth, immediate feedback.
4. **Version history complete** — Browse any date, restore any version.
5. **Undo/redo deep history** — Full stack covering structural operations.
6. **Export exactly matches format** — Character names caps, panel numbers restart per page.
7. **Markdown storage preserved** — All text stored as plain TEXT. No HTML or JSON in database.

---

## Supabase Project

- **Project ID:** `yzhpqhbfvdlolctgnteg`
- **RLS:** Enabled on all tables with owner + collaborator policies
- **Storage:** `entity-images` bucket for character/location/series/page images

---

*This document reflects the actual state of the codebase as of March 2026.*
