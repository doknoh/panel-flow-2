# Panel Flow 2.0 → A+ Roadmap

**Goal:** Get Panel Flow to elite shape for importing, polishing, and completing the Resurget limited series (8 issues, 5 existing scripts in Google Docs).

**Prioritization Philosophy:**
1. **Unblock the import workflow first** — you can't polish what you can't get in
2. **Remove friction from writing** — flow state is everything
3. **Add architectural views** — see the forest AND the trees
4. **Enable collaboration** — you'll need artist handoff eventually

---

## Current Grade: B
## Target Grade: A+

---

# PHASE 1: IMPORT EXCELLENCE
*"Get Resurget into Panel Flow without friction"*

**Timeline: 3-4 days**

### 1.1 Smart Format Detection
**Problem:** Current importer requires exact "PAGE 1" format. Your Google Docs scripts might vary.

**Solution:**
- Auto-detect multiple page marker formats:
  - `PAGE 1`, `Page 1`, `PAGE ONE`, `Pg. 1`, `P1`
  - `---PAGE BREAK---` or horizontal rules
  - Scene headers that imply page breaks
- Show detected format confidence before parsing
- Allow manual format override

**Files:** `src/app/series/[seriesId]/issues/[issueId]/import/ImportScript.tsx`

### 1.2 Act/Scene Structure Detection
**Problem:** Import dumps everything into "Act 1 / Main Scene" regardless of script structure.

**Solution:**
- Detect act breaks: `ACT ONE`, `ACT 1`, `ACT I`, `---`, etc.
- Detect scene breaks: `SCENE:`, `INT.`, `EXT.`, `Location:`, blank line clusters
- Present detected structure for review before import
- Allow drag-to-rearrange scenes before finalizing

**Files:** New `src/lib/script-structure-detector.ts`, modify `ImportScript.tsx`

### 1.3 File Upload + Drag & Drop
**Problem:** Must copy/paste manually from Google Docs. Tedious for 5 scripts.

**Solution:**
- Drag & drop `.txt`, `.docx`, `.gdoc` files onto import area
- For `.docx`: Use mammoth.js to extract text (already available)
- For `.gdoc`: Prompt user to export as `.txt` from Google Docs
- Batch upload queue: drop multiple files, import sequentially

**Files:** Modify `ImportScript.tsx`, add file handling logic

### 1.4 Import Preview with Inline Editing
**Problem:** Preview is read-only. If AI misparsed something, must start over.

**Solution:**
- Make preview panels editable
- Click speaker name → reassign to different character
- Click visual description → edit inline
- Add/remove/reorder panels in preview before import
- "Fix and Continue" instead of "Start Over"

**Files:** New `PreviewEditor.tsx` component

### 1.5 Import Snapshot & Undo
**Problem:** Import replaces content with no way back.

**Solution:**
- Auto-create version snapshot before destructive import
- Show "Undo Import" button for 1 hour after import
- Import log: what was changed, when, from what source

**Files:** Modify import flow, integrate with existing version history

---

# PHASE 2: FLOW STATE WRITING
*"Remove everything that pulls you out of the zone"*

**Timeline: 2-3 days**

### 2.1 Zen Mode (Distraction-Free Writing)
**Problem:** Issue Editor has 6 cognitive zones competing for attention.

**Solution:**
- `⌘⇧Z` or button → Zen Mode
- Hides: left sidebar, right toolkit, header, status bar
- Shows: ONLY the current panel's writing fields
- Fullscreen with subtle page/panel indicator
- Typewriter scroll: current line stays vertically centered
- Escape or click edge → exit Zen Mode

**Files:** New `ZenMode.tsx` component, modify `IssueEditor.tsx`

### 2.2 Quick Panel Navigation
**Problem:** Jumping between panels requires mouse clicks.

**Solution:**
- `⌘↓` / `⌘↑` → Next/previous panel (already partial)
- `⌘G` → "Go to panel" modal (type "P12.3" for Page 12, Panel 3)
- `⌘[` / `⌘]` → Previous/next page
- Visual indicator of current position in issue

**Files:** Enhance keyboard handling in `IssueEditor.tsx`

### 2.3 Writing Session Timer
**Problem:** Easy to lose track of time. No sense of writing velocity.

**Solution:**
- Optional session timer in status bar
- Pomodoro mode: 25 min focus, 5 min break alerts
- Session stats: words written, panels completed
- "Deep Work" indicator based on edit velocity

**Files:** New `SessionTimer.tsx`, integrate with existing sessions tracking

### 2.4 Panel Templates
**Problem:** Starting from blank panel every time. Repetitive setup.

**Solution:**
- Save panel as template: "Action Beat", "Dialogue Exchange", "Silent Moment"
- Quick-insert templates with `⌘T`
- Templates include placeholder structure (e.g., "VISUAL: [describe action]")

**Files:** New template system, UI in panel editor

---

# PHASE 3: SERIES ARCHITECTURE
*"See the 8-issue arc before diving into pages"*

**Timeline: 3-4 days**

### 3.1 Series Weave View
**Problem:** Can see plotlines in ONE issue, but not across the series.

**Solution:**
- `/series/[seriesId]/weave` → Series-level beat map
- Horizontal: Issues 1-8
- Vertical: Plotlines
- Each cell: Summary of that plotline's beat in that issue
- Click cell → jump to that issue's weave view
- Drag plotline beats between issues to restructure

**Files:** New `src/app/series/[seriesId]/weave/` route

### 3.2 Issue Cards View
**Problem:** Issue list is just a list. No visual sense of series shape.

**Solution:**
- Card view for issues showing:
  - Issue number + title
  - Page count + panel count
  - Completion status (draft/revision/final)
  - Key plotlines present
  - Thumbnail of first page (if available)
- Drag to reorder issues
- "Series Arc" indicator: SETUP → BUILD → CLIMAX → RESOLUTION

**Files:** New `IssueCards.tsx` component for series page

### 3.3 Story Bible Integration
**Problem:** Characters and locations exist but aren't connected to story planning.

**Solution:**
- Character page shows: which issues they appear in, arc summary
- Location page shows: scenes set there, frequency
- "Story Bible" export: generate PDF of all characters, locations, plotlines
- Quick-reference panel in Issue Editor (pin characters for current scene)

**Files:** Enhance character/location pages, new export function

### 3.4 Timeline View
**Problem:** No way to see story chronology vs. narrative order.

**Solution:**
- `/series/[seriesId]/timeline`
- Events ordered by in-story time (not page order)
- Mark flashbacks, flash-forwards, parallel timelines
- Drag events to restructure chronology
- Visual indicator of narrative vs. chronological position

**Files:** New timeline route and components

---

# PHASE 4: VISUAL COLLABORATION
*"Bridge the writer-artist gap"*

**Timeline: 4-5 days**

### 4.1 Reference Image Dock
**Problem:** Can't see character faces while writing their dialogue.

**Solution:**
- Collapsible reference panel in Issue Editor
- Pin characters/locations for current scene
- Shows their uploaded images
- Click image → zoom/lightbox
- Drag image → attach to panel as reference

**Files:** New `ReferencesDock.tsx`, integrate with editor

### 4.2 Page Layout Sketcher
**Problem:** Writer envisions layout but can't communicate it.

**Solution:**
- Simple grid tool: 2x2, 3x2, 2x3, custom
- Drag to resize panel proportions
- "Splash" and "Spread" presets
- Exports as PNG for artist reference
- Optional: stores with page as layout suggestion

**Files:** New `LayoutSketcher.tsx` component

### 4.3 Artist Notes Field
**Problem:** Writer notes are for writer. Artist needs separate communication.

**Solution:**
- Separate "Artist Notes" field on pages and panels
- Toggleable visibility (writer view vs. artist view)
- Export option: "Script with Artist Notes" vs. "Script Only"
- Color-coded to distinguish from writer notes

**Files:** Database migration for `artist_notes` column, UI updates

### 4.4 Thumbnail Upload per Page
**Problem:** No place for artist thumbnails/roughs.

**Solution:**
- Upload slot on each page for thumbnail sketch
- Side-by-side view: script | thumbnail
- Approval workflow: "Writer Approved" | "Needs Revision" | "Pending"
- Thumbnail gallery view for entire issue

**Files:** Database migration, new upload handling, gallery component

---

# PHASE 5: REVISION EXCELLENCE
*"Polish Resurget to perfection"*

**Timeline: 2-3 days**

### 5.1 Diff View for Versions
**Problem:** Version history shows snapshots but not what changed.

**Solution:**
- Side-by-side comparison between any two snapshots
- Inline diff: additions (green), deletions (red), changes (yellow)
- Filter by: dialogue only, visuals only, all content
- "Accept/Reject" individual changes

**Files:** New `VersionDiff.tsx` component

### 5.2 Revision Tracking Mode
**Problem:** No way to mark content as "needs review" vs. "final".

**Solution:**
- Panel status: Draft | Review | Final
- Filter view: show only Draft/Review panels
- Bulk status updates
- "Revision Pass" workflow: mark issue as in-revision, track completion

**Files:** Database migration for `revision_status`, UI components

### 5.3 Export Improvements
**Problem:** Export is functional but not production-ready.

**Solution:**
- Export templates: "Letterer Format", "Editor Review", "Artist Brief"
- Include/exclude options: notes, artist notes, character bios
- Page number formatting options
- Header/footer customization
- Export specific page ranges

**Files:** Enhance `exportPdf.ts`, `exportDocx.ts`

### 5.4 Find & Replace Enhancement
**Problem:** Basic find/replace exists but lacks power features.

**Solution:**
- Regex support for advanced patterns
- Replace across entire series (not just one issue)
- Preview all matches before replacing
- Character name refactor: rename character → updates all dialogue attribution

**Files:** Enhance existing find/replace modal

---

# PHASE 6: CANVAS → STRUCTURE
*"Graduate ideas into story beats, not just entities"*

**Timeline: 1-2 days**

### 6.1 Canvas Item Types Expansion
**Problem:** Canvas items can only become characters/locations.

**Solution:**
- New graduation targets:
  - → Scene (creates scene in specified issue/act)
  - → Story Beat (creates page with intention)
  - → Plotline (creates new plotline with description)
- Graduation wizard asks: "Which issue?" "Which act?" "What's the intention?"

**Files:** Modify `GraduationModal.tsx`, add new graduation flows

### 6.2 Canvas → Issue Parking
**Problem:** Ideas often belong to "somewhere in Issue 4" but aren't ready for specific placement.

**Solution:**
- Canvas items can be "parked" at an issue without specific scene
- Issue view shows parked ideas as a "pending" bucket
- Drag from parking → actual scene when ready

**Files:** Database migration for `parked_at_issue_id`, UI updates

### 6.3 Idea Linking
**Problem:** A canvas idea might inspire multiple things—a character AND a scene.

**Solution:**
- Don't delete canvas item on graduation—mark as "graduated"
- Link graduated entities back to source idea
- "Inspiration Trail": see which canvas items became which story elements

**Files:** Database migration for linking, UI for trail view

---

# IMPLEMENTATION PRIORITY FOR RESURGET

Given your immediate need (import 5 scripts, polish, finish 3 more), here's the **critical path**:

## WEEK 1: Import + Flow
1. **1.1 Smart Format Detection** ← Unblocks import
2. **1.2 Act/Scene Structure Detection** ← Preserves your script structure
3. **1.3 File Upload** ← Faster than copy/paste x5
4. **2.1 Zen Mode** ← Flow state for writing remaining 3 issues

## WEEK 2: Architecture + Polish
5. **3.1 Series Weave View** ← See all 8 issues at once
6. **5.1 Diff View** ← Compare revision passes
7. **1.4 Import Preview Editing** ← Fix any parsing errors
8. **2.2 Quick Panel Navigation** ← Speed up editing

## WEEK 3: Visual + Export
9. **4.1 Reference Image Dock** ← See characters while writing
10. **5.3 Export Improvements** ← Production-ready scripts
11. **3.2 Issue Cards View** ← Visual series overview
12. **4.3 Artist Notes** ← Prep for handoff

## WEEK 4: Remaining Polish
13. **5.2 Revision Tracking** ← Mark what's final
14. **1.5 Import Snapshot** ← Safety net
15. **6.1 Canvas Expansion** ← Ideas → structure
16. **2.3 Writing Session Timer** ← Track velocity

---

# SUCCESS METRICS

**A+ means:**
- [ ] Import 22-page script in under 2 minutes with correct structure
- [ ] Write for 2 hours without reaching for mouse
- [ ] See entire 8-issue arc in one view
- [ ] Export production-ready script in any format
- [ ] Track exactly what changed between drafts
- [ ] Hand artist a brief that includes visual references

---

# TECHNICAL NOTES

**Database Migrations Needed:**
- `artist_notes` column on pages and panels
- `revision_status` enum on panels
- `page_thumbnail_url` on pages
- `parked_at_issue_id` on canvas_items
- `graduated_to` linking table for canvas items

**New Routes:**
- `/series/[seriesId]/weave` — Series-level beat map
- `/series/[seriesId]/timeline` — Chronological view
- `/series/[seriesId]/bible` — Story bible export

**Component Architecture:**
- `ZenMode.tsx` — Fullscreen distraction-free writing
- `ReferencesDock.tsx` — Pinned character/location images
- `LayoutSketcher.tsx` — Panel arrangement tool
- `VersionDiff.tsx` — Side-by-side comparison
- `PreviewEditor.tsx` — Editable import preview

---

*Let's get Resurget to A+.*
