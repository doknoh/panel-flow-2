# Panel Flow 2.0 - Comprehensive Design Specification

## Executive Summary

This document provides a complete inventory of all UI elements, components, pages, and interactive features in Panel Flow. The design refresh will apply a cohesive warm, minimal aesthetic while preserving 100% of existing functionality.

---

## Design System Overview

### Philosophy: "The Thoughtful Canvas"
An interface that disappears when you're writing and reappears when you need it. Warm, minimal, keyboard-driven.

### Core Principles
1. **Warmth over sterility** — Warm grays create a comfortable workspace
2. **Progressive disclosure** — Show only what's needed
3. **Keyboard-first** — Every action accessible without mouse
4. **Mode-based focus** — Switch between "Overview" and "Focus" modes

---

## Color System

### Light Mode
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#FAFAF8` | Main background |
| `--bg-secondary` | `#F5F5F3` | Sidebar, cards |
| `--bg-tertiary` | `#EFEFED` | Hover states |
| `--text-primary` | `#1A1A18` | Body text |
| `--text-secondary` | `#6B6B66` | Labels, hints |
| `--text-muted` | `#9B9B96` | Disabled, faded |
| `--border` | `#E5E5E3` | Dividers, outlines |
| `--accent` | `#525250` | Selected items, focus |

### Dark Mode
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#1A1A18` | Main background |
| `--bg-secondary` | `#242422` | Sidebar, cards |
| `--bg-tertiary` | `#2E2E2C` | Hover states |
| `--text-primary` | `#FAFAF8` | Body text |
| `--text-secondary` | `#A3A39E` | Labels, hints |
| `--text-muted` | `#6B6B66` | Disabled, faded |
| `--border` | `#3A3A38` | Dividers, outlines |
| `--accent` | `#A3A3A1` | Selected items, focus |

### Semantic Colors (Both Modes)
- **Primary action**: `#3B82F6` (blue-500)
- **Success**: `#22C55E` (green-500)
- **Warning**: `#F59E0B` (amber-500)
- **Error**: `#EF4444` (red-500)
- **AI/Special**: `#A855F7` (purple-500)

---

## Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Page titles | Inter | 24px | 600 |
| Section headers | Inter | 16px | 600 |
| Navigation labels | Inter | 13px | 500 |
| Body text | Inter | 14px | 400 |
| Script/Dialogue | JetBrains Mono | 14px | 400 |
| Panel descriptions | JetBrains Mono | 13px | 400 |
| UI buttons | Inter | 13px | 500 |
| Badges/labels | Inter | 11px | 500 |

---

## Complete Page Inventory

### 1. Landing Page (`/`)
**File:** `src/app/page.tsx`

**Elements:**
- Logo/title (h1)
- Tagline (p)
- CTA button ("Get Started")
- Footer text

**States:** None (static)

---

### 2. Login Page (`/login`)
**File:** `src/app/login/page.tsx`, `LoginButton.tsx`

**Elements:**
- Logo/title
- Tagline
- Google OAuth button with icon
- Loading spinner (inline)
- Error message

**States:**
- Default
- Loading (spinner in button)
- Error (red text below)

---

### 3. Pending Approval Page (`/pending-approval`)
**File:** `src/app/pending-approval/page.tsx`

**Elements:**
- Icon
- Title
- Description with user email
- Back to login link

**States:** None (static)

---

### 4. Dashboard (`/dashboard`)
**File:** `src/app/dashboard/page.tsx`

**Elements:**
- Header with logo, user email, sign out button
- Page title with "New Series" button
- Series cards grid (or empty state)
- Each card: title, logline (truncated), updated date

**States:**
- Has series (grid)
- Empty (CTA to create first)

---

### 5. New Series (`/series/new`)
**File:** `src/app/series/new/page.tsx`

**Elements:**
- Back link
- Page title
- Form with 3 fields: Title (required), Logline, Central Theme
- Submit button, Cancel button

**States:**
- Default
- Loading ("Creating...")
- Disabled when no title

---

### 6. Series Home (`/series/[seriesId]`)
**File:** `src/app/series/[seriesId]/page.tsx`

**Elements:**
- Header with breadcrumb
- SeriesMetadata component (expandable)
- Stats grid (4 items): Issues, Characters, Locations, Plotlines
- Issues section with CreateIssueButton
- IssueGrid component
- Tools section (6 cards): Guide, Series Outline, Analytics, Session History, Continuity Check, Project Notes
- World Building section (4 cards): Characters, Character Arcs, Locations, Plotlines

**States:**
- Has content
- Not found (error state)

---

### 7. Issue Editor (`/series/[seriesId]/issues/[issueId]`)
**File:** `src/app/series/[seriesId]/issues/[issueId]/page.tsx`, `IssueEditor.tsx`

**Elements:**
- Header: back link, issue number/title, keyboard shortcuts button, Find, Import, Weave, Guide, History links, export buttons (PDF, Doc, TXT)
- Mobile view switcher (3 tabs)
- Three-panel layout via ResizablePanels:
  - Left: NavigationTree
  - Center: PageEditor
  - Right: Toolkit
- StatusBar (bottom)
- FindReplaceModal
- KeyboardShortcutsModal

**States:**
- Has pages / No pages (empty state)
- Mobile view modes (nav/editor/toolkit)
- Save status (saved/saving/unsaved)

---

### 8. NavigationTree Component
**File:** `NavigationTree.tsx`

**Elements:**
- Section header "Structure" with "+ Act" button
- Nested tree: Acts > Scenes > Pages
- Each Act:
  - Drag handle (⋮⋮)
  - Expand/collapse toggle (▼/▶)
  - Editable title (double-click or ✎ icon)
  - Add scene (+), Delete (×) buttons
  - Beat summary (italic, click to edit)
  - Intention (purple text, click to edit)
- Each Scene:
  - Drag handle
  - Expand/collapse toggle
  - Plotline color dot (clickable to change)
  - Editable title
  - Add page (+), Delete (×) buttons
  - Scene summary (italic)
  - Intention (purple text)
- Each Page:
  - Drag handle
  - Editable title (double-click or ✎)
  - Move to scene dropdown (↗)
  - Delete (×) button
  - Selected state highlight

**Interactive Features:**
- Drag-and-drop reordering at ALL levels (acts, scenes, pages)
- Uses @dnd-kit with nested DndContexts
- Inline editing with Enter to save, Escape to cancel
- Plotline assignment via dropdown

**States:**
- Empty (no acts)
- Expanded/collapsed at each level
- Editing mode for titles/summaries/intentions
- Dragging (opacity change, ring highlight)
- Selected page (blue background)

---

### 9. PageEditor Component
**File:** `PageEditor.tsx`

**Elements:**
- Breadcrumb (Act › Scene)
- Page title with keyboard shortcut hints
- "Add Panel" button
- Panel cards (for each panel):
  - Panel number header with shot type dropdown, delete button
  - Visual description textarea
  - Dialogue section with "+ Add Dialogue" button
  - Each dialogue: character dropdown, type dropdown, text area, delete (×)
  - Captions section with "+ Add Caption" button
  - Each caption: type dropdown, text area, delete (×)
  - Sound effects section with "+ Add SFX" button
  - Each SFX: text input (uppercase), delete (×)
  - Artist notes textarea

**Interactive Features:**
- Auto-save with 2-second debounce
- Auto-capitalize character names
- Undo/redo tracking
- Keyboard shortcuts (⌘S, ⌘Enter, ⌘D, ⌘⇧D)

**States:**
- No panels (empty state with CTA)
- Has panels
- Saving status

---

### 10. Toolkit Component
**File:** `Toolkit.tsx`

**Elements:**
- Tab bar (5 tabs): Context, Chars, Locs, Alerts, AI
- Alert badge (count)
- Context tab: stats grid, issue context form (many fields), status dropdown
- Characters tab: character list cards
- Locations tab: location list cards
- Alerts tab: alert cards with dismiss, clear all, continuity link
- AI tab: mode toggle, scope indicator, chat messages, suggestions, input

**Interactive Features:**
- Tab switching
- Form editing
- Dismiss alerts
- AI chat with streaming
- Apply AI suggestions

**States:**
- Each tab active/inactive
- Context: viewing/editing
- Alerts: has alerts/none/dismissed
- AI: loading/empty/with messages

---

### 11. The Weave (`/series/[seriesId]/issues/[issueId]/weave`)
**File:** `weave/WeaveView.tsx`

**Elements:**
- Header bar: page/spread count, selection count, clear selection, manage plotlines button
- Plotline manager (expandable): color swatches, create input
- Plotline legend
- Page spread view:
  - Inside cover placeholder
  - Page cards with: number, L/R badge, plotline dropdown, time period, visual motif, story beat, scene name, edit link
  - Selection checkbox per page
  - Drag handles
  - Spine divider between spreads
- Instructions details/summary

**Interactive Features:**
- Multi-select pages (checkbox, Shift+click, ⌘+click)
- Drag-and-drop single or multiple pages
- Inline editing of story beat, time period, visual motif
- Plotline assignment per page
- Color picker for plotlines

**States:**
- Empty (no pages)
- Has pages
- Selecting (selection count shown)
- Dragging (overlay with count badge)
- Just moved (green highlight for 2 seconds)

---

### 12. Guided Mode (`/series/[seriesId]/guide`)
**File:** `guide/GuidedMode.tsx`

**Elements:**
- Header: back link, "Guide" title with context label, session info, options dropdown
- Session picker screen:
  - Large icon
  - Title and description
  - Completeness progress bar
  - Session type buttons (4 options)
  - Recent sessions list
- Active session screen:
  - Messages area (scrollable)
  - User messages (right-aligned, blue)
  - Assistant messages (left-aligned, gray)
  - Pending extraction card
  - Extraction results card
  - Input textarea with send button
- Options dropdown:
  - Shift focus options (4 buttons)
  - Extract insights button
  - New session button

**Interactive Features:**
- Start new session
- Resume existing session
- Send messages (Enter to send)
- Shift focus to different areas
- Extract insights
- Save extracted data

**States:**
- No session (picker screen)
- Active session
- Loading (sending message)
- Extracting insights
- Has pending extraction

---

### 13. Characters Page (`/series/[seriesId]/characters`)
**File:** `characters/CharacterList.tsx`

**Elements:**
- Header with count and "New Character" button
- Form (when creating/editing): name, role dropdown, description, visual description, personality traits, background textareas
- Character cards: name, role badge (color-coded), descriptions, edit/delete buttons
- Empty state

**Interactive Features:**
- Create, edit, delete characters
- Form validation

**States:**
- Empty/populated
- Creating/editing

---

### 14. Locations Page (`/series/[seriesId]/locations`)
**File:** `locations/LocationList.tsx`

**Elements:** Similar structure to Characters
- Form fields: name, description, visual description, story significance

---

### 15. Plotlines Page (`/series/[seriesId]/plotlines`)
**File:** `plotlines/PlotlineList.tsx`

**Elements:**
- Description text
- Header with count and create button
- Form with color picker (18 swatches)
- Plotline cards with color dot

---

### 16. Outline Page (`/series/[seriesId]/outline`)
**File:** `outline/OutlineView.tsx`

**Elements:**
- Series header card with edit toggle
- Diff view modal for AI sync
- Controls: issue count, sync button, expand/collapse all
- Collapsible issue cards with summary, themes, structure breakdown

**Interactive Features:**
- Expand/collapse
- AI summary generation
- Diff review and acceptance

---

### 17. Analytics Page (`/series/[seriesId]/analytics`)
**File:** `analytics/AnalyticsClient.tsx`

**Elements:**
- Tab bar (underline style): Dashboard, Power Rankings
- Content area for each tab

---

### 18. Sessions Page (`/series/[seriesId]/sessions`)
**File:** `sessions/SessionList.tsx`

**Elements:**
- Summary stats grid (4 items)
- Collapsible session cards
- Loose ends with resolve buttons
- Empty state

---

### 19. Continuity Check (`/series/[seriesId]/continuity`)
**File:** `continuity/ContinuityChecker.tsx`

**Elements:**
- Header with description and run button
- Stats grid (4 items)
- Filter buttons
- Issue cards with severity badges
- Empty/ready/success states

---

### 20. Notes Page (`/series/[seriesId]/notes`)
**File:** `notes/NotesList.tsx`

**Elements:**
- Stats row
- Filter controls: type dropdown, status buttons, add note button
- Note cards with checkbox, type badge, content, edit/delete icons
- Create/edit forms

---

### 21. Character Arcs (`/series/[seriesId]/character-arcs`)
**File:** `character-arcs/CharacterArcsView.tsx`

**Elements:**
- Character selector dropdown with generate button
- Arc visualization chart (SVG)
- Issue breakdown cards with scores

---

### 22. Version History (`/series/[seriesId]/issues/[issueId]/history`)
**File:** `history/VersionHistoryClient.tsx`

**Elements:**
- Two-column layout: version list, preview panel
- Version cards with date, summary, current badge
- Preview with restore button, diff indicators

---

### 23. Import Script (`/series/[seriesId]/issues/[issueId]/import`)
**File:** `import/ImportScript.tsx`

**Elements:**
- Instructions card (collapsible)
- Textarea for script input
- Parse button with progress bar
- Character review section with mapping controls
- Parsed preview with page/panel breakdown
- Import button

**States:**
- Input, parsing, error, character review, preview, importing

---

## Shared Components

### ResizablePanels
- Three-panel layout with draggable dividers
- Persists to localStorage
- Double-click to reset

### LoadingSpinner
- Multiple variants: spinner, full page, overlay, skeleton

### ToastContext
- Fixed bottom-right container
- Auto-dismiss (4 seconds)
- Color-coded by type

### StatusBar
- Page/panel/word counts
- Undo/redo buttons with badges
- Save status indicator

### FindReplaceModal
- Search/replace inputs
- Match navigation
- Options: case sensitive, whole word

### KeyboardShortcutsModal
- Categorized shortcut list
- Key badges

---

## Interactive Patterns to Preserve

### Drag-and-Drop
1. **NavigationTree**: Acts, Scenes, Pages (nested @dnd-kit contexts)
2. **Weave**: Pages with multi-select support

### Inline Editing
1. Act/Scene/Page titles (double-click or pencil icon)
2. Beat summaries, intentions, scene summaries
3. Weave story beats, time periods, visual motifs

### Form States
1. Creating new (form visible, item list still visible)
2. Editing existing (card transforms to form)
3. Validation errors (toast notifications)

### Selection States
1. Single selection (click)
2. Multi-selection (Shift+click for range, ⌘+click for toggle)
3. Visual feedback (checkboxes, count badges)

### Expand/Collapse
1. NavigationTree acts and scenes
2. Outline issue cards
3. Session cards
4. Instructions/details elements

---

## Implementation Phases

### Phase 1: Foundation (Day 1)
- [ ] Create CSS custom properties for color system
- [ ] Install Inter and JetBrains Mono fonts
- [ ] Create ThemeProvider with localStorage persistence
- [ ] Update `globals.css` and Tailwind config
- [ ] Create theme toggle component

### Phase 2: Core Layout (Day 2)
- [ ] Update header component styling
- [ ] Update card component styling
- [ ] Update button variants
- [ ] Update form input styling
- [ ] Update badge/tag styling

### Phase 3: NavigationTree (Day 2-3)
- [ ] Update tree item styling
- [ ] Refine drag-and-drop visual feedback
- [ ] Update inline editing appearance
- [ ] Preserve all DnD functionality

### Phase 4: PageEditor (Day 3)
- [ ] Update panel card styling
- [ ] Add monospace font to script areas
- [ ] Refine dialogue/caption/sfx blocks
- [ ] Preserve auto-save behavior

### Phase 5: Weave (Day 4)
- [ ] Update page card styling
- [ ] Refine spread view
- [ ] Update plotline manager
- [ ] Preserve multi-select drag-drop

### Phase 6: Guided Mode (Day 4-5)
- [ ] Update session picker
- [ ] Style chat interface
- [ ] Update extraction UI
- [ ] Preserve all interactive features

### Phase 7: Secondary Pages (Day 5-6)
- [ ] Characters, Locations, Plotlines
- [ ] Outline, Analytics, Sessions
- [ ] Continuity, Notes, Character Arcs
- [ ] History, Import

### Phase 8: New Features (Day 6-7)
- [ ] Focus Mode toggle and UI
- [ ] Command Palette (⌘K)
- [ ] Keyboard shortcut hints

### Phase 9: Polish (Day 7-8)
- [ ] Add micro-animations (150ms transitions)
- [ ] Test dark mode thoroughly
- [ ] Responsive adjustments
- [ ] Accessibility audit (focus states, ARIA)

---

## Testing Checklist

### Functionality Preservation
- [ ] Acts: create, edit, delete, reorder
- [ ] Scenes: create, edit, delete, reorder, plotline assignment
- [ ] Pages: create, edit, delete, reorder within scene, move between scenes
- [ ] Panels: create, edit, delete
- [ ] Dialogue/Captions/SFX: create, edit, delete
- [ ] Weave: multi-select, drag-drop, plotline assignment
- [ ] Guided Mode: session creation, messaging, extraction
- [ ] All forms: validation, save, cancel
- [ ] All modals: open, close, escape key
- [ ] Undo/redo functionality
- [ ] Export functions (PDF, Doc, TXT)
- [ ] Auto-save behavior
- [ ] Keyboard shortcuts

### Visual Consistency
- [ ] Light mode appears warm and comfortable
- [ ] Dark mode maintains readability
- [ ] All interactive states are visible
- [ ] Focus indicators meet accessibility standards
- [ ] Animations are subtle and performant

---

## Risk Mitigation

1. **Incremental Changes**: Apply styling changes component by component, testing after each
2. **No Logic Changes**: Only modify className attributes and CSS, never JavaScript logic
3. **Git Checkpoints**: Commit after each phase for easy rollback
4. **Browser Testing**: Test in Chrome, Safari, Firefox, and mobile
5. **Preserve Tailwind Classes**: Keep functional classes (hidden, flex, grid), only change color/spacing classes

---

*This specification covers 100% of the Panel Flow codebase. Any design change made following this document will preserve all existing functionality.*
