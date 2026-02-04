# Panel Flow 2.0: Elite Comic Writer's Review

**Reviewer Persona:** Veteran comic writer with 15+ years experience, multiple Eisner nominations, known for complex multi-threaded narratives (think Hickman's structural rigor + King's emotional precision + DeConnick's character work). Currently developing an 8-issue limited series with 3 interwoven plotlines spanning multiple time periods.

---

## Executive Summary

Panel Flow is **the most ambitious comic-specific writing tool I've seen**. It understands that comics aren't just scripts—they're architectural blueprints for visual storytelling. The WeaveView alone solves a problem I've been hacking around in Google Sheets for a decade.

**However**, there are critical gaps that would prevent me from adopting it for professional work today. This review identifies those gaps and prioritizes what needs to happen to make Panel Flow indispensable.

---

## Part 1: What's Working Exceptionally Well

### 1.1 The Weave View is Revolutionary
The spread-based plotline visualization is genuinely novel. No other tool lets me see:
- How my plotlines interleave across physical page turns
- Which reveals land on right pages (reader sees immediately) vs. left pages (delayed reveal)
- The rhythm of my story at a visual, spatial level

**This is how I actually think about comics.** You nailed it.

### 1.2 Proper Comic Script Structure
The hierarchy (Issue → Act → Scene → Page → Panel → Dialogue/Captions/SFX) is exactly right. The auto-numbering that restarts panels at 1 per page is correct. The distinction between artist notes and internal notes is professional-grade.

### 1.3 Guided Mode Shows Promise
The Socratic AI partner approach is the right philosophy. "Ask, don't assume" respects the writer's authority. The ability to shift focus mid-session is useful.

### 1.4 Optimistic UI Updates
The instant feedback on drag-and-drop in WeaveView is excellent. No waiting for server round-trips. This is how professional tools should feel.

---

## Part 2: Critical Gaps (Deal-Breakers for Professional Use)

### 2.1 ❌ No Series-Level Architecture View

**The Problem:**
I'm writing an 8-issue series. I need to see how plots thread across ALL issues, not just within one issue. Currently, Panel Flow is issue-centric. There's no way to:
- See which plotlines appear in which issues
- Track character arcs across the entire series
- Visualize the macro-structure (Issue 1 plants seed, Issue 4 payoff, Issue 7 reversal)

**Why This Matters:**
Professional limited series are planned holistically. I know what happens in Issue 8 before I write Issue 1. The tool needs to support this.

**Required Feature:**
Series-level WeaveView showing all issues as a timeline with plotline ribbons threading through them.

---

### 2.2 ❌ No Visual Reference System

**The Problem:**
Comics are a visual medium. I need to attach reference images:
- Character visual references (face sheets, costume designs)
- Location mood boards
- Panel composition references
- Style guides for the artist

There's no image attachment anywhere in Panel Flow.

**Why This Matters:**
When I write "CLOSE ON MARCUS'S face—that weathered look we established in Issue 2," I need to see that reference. When I describe a location, I need my mood board visible.

**Required Feature:**
Image attachments on Characters, Locations, and Series. A "Visual References" panel in the Toolkit.

---

### 2.3 ❌ No Artist Collaboration Features

**The Problem:**
I don't work alone. My workflow involves:
1. I write script
2. Artist reads, asks questions, suggests changes
3. We iterate on thumbnails
4. I revise based on their visual solutions

Panel Flow has zero collaboration features:
- No sharing/permissions
- No comments or annotations
- No way to see artist thumbnails alongside my script
- No feedback threads

**Why This Matters:**
Comics are collaborative. A script is a conversation with my artist. I need to have that conversation inside the tool, not in Slack/email with constant context-switching.

**Required Features:**
- Share issue with collaborator (read-only or comment-only)
- Page-level and panel-level comments
- "Artist Response" field per panel where they can note questions/suggestions
- Thumbnail image upload per page

---

### 2.4 ❌ No Spread/Mirror Page System

**The Problem:**
WeaveView mentions spreads conceptually, but there's no real support for:
- **Two-page spreads**: Pages 12-13 are one giant image
- **Mirror pages**: Pages that thematically reflect each other (Issue 1 Page 3 mirrors Issue 8 Page 3)
- **Splash pages**: Full-page single-panel moments

These are fundamental to comic storytelling. A splash page signals "THIS MOMENT MATTERS." A spread creates visual impact that two separate pages can't achieve.

**Why This Matters:**
I plan my spreads first, then build around them. They're the tentpoles of visual drama.

**Required Features:**
- Mark pages as SPREAD (links two pages, displayed as single unit)
- Mark pages as SPLASH (visual indicator, special export handling)
- Mirror page linking with navigation

---

### 2.5 ❌ Version Comparison is Opaque

**The Problem:**
Version history exists, but I can't see a diff. When my editor says "go back to what you had in draft 2 for that scene," I need to compare versions side-by-side.

**Why This Matters:**
Revision is where good becomes great. I need to see what changed.

**Required Feature:**
Side-by-side diff view for any two versions. Highlight added/removed/changed panels and dialogue.

---

## Part 3: Wonky Workflows That Create Friction

### 3.1 Context Switching Between Editor and Weave

**Current Flow:**
1. I'm drafting in IssueEditor
2. I realize I need to move pages around
3. Click "Weave" in header → full page navigation
4. Make changes in WeaveView
5. Click "Back to Editor" → lose my place

**Better Flow:**
WeaveView should be a panel/mode within IssueEditor, not a separate page. Or at minimum, remember my selected page when I return.

### 3.2 No "Previous/Next Page" Context While Drafting

**Current Flow:**
I'm writing Panel 3 on Page 12. I need to check what ended Page 11 (to ensure continuity). I have to:
1. Click Page 11 in NavigationTree
2. Read it
3. Click Page 12 to return
4. Try to remember what I read

**Better Flow:**
Show a collapsible "Previous Page Summary" at the top of PageEditor. Even better: a split view showing current + previous page.

### 3.3 Character/Location Selection is Cumbersome

**Current Flow:**
When adding dialogue, I select speaker from a dropdown. But:
- The dropdown shows ALL characters in the series
- No indication which characters are already in this scene
- No quick-add for a new minor character

**Better Flow:**
- Default to characters marked as "present in scene"
- Show recently-used characters first
- "Quick add character" option that creates minimal entry

### 3.4 The Toolkit Right Panel is Overloaded

Five tabs in a narrow panel is too much. The tabs are:
- Context (issue metadata)
- Chars (character list)
- Locs (location list)
- Alerts (continuity warnings)
- AI (chat)

**Better Flow:**
- Context should be in a header/drawer, not a tab
- Chars/Locs should be contextual (show only those relevant to current scene)
- Alerts should be a floating indicator, not a tab
- AI should be the primary (and perhaps only) sidebar use

### 3.5 No Keyboard-Driven Navigation

As a power user, I want to:
- `Cmd+↓` to go to next page
- `Cmd+↑` to go to previous page
- `Cmd+D` to add dialogue
- `Cmd+P` to add panel
- `Tab` to move between panel fields

Currently I'm reaching for the mouse constantly.

### 3.6 Guided Mode is Disconnected from Drafting

**Current Flow:**
1. I'm drafting a scene
2. I get stuck on character motivation
3. I click "Guide" → navigates to separate page
4. Have conversation with AI
5. Get insight
6. Manually navigate back to my scene
7. Try to apply the insight

**Better Flow:**
Guided Mode should be accessible as an overlay/sidebar while drafting. The AI should see my current cursor position and offer contextual guidance without me leaving the page.

---

## Part 4: Missing Features (Prioritized)

### Tier 1: Required for Professional Adoption

| Feature | Why It's Critical |
|---------|-------------------|
| **Series-level outline view** | Can't plan multi-issue arcs without it |
| **Image attachments** | Comics are visual; scripts need visual references |
| **Basic collaboration** | No professional writes alone |
| **Spread/Splash page support** | Fundamental to the medium |
| **Version diff view** | Can't do serious revision without it |

### Tier 2: Significant Quality of Life

| Feature | Impact |
|---------|--------|
| **Keyboard navigation** | 2-3x faster drafting for power users |
| **Previous page context** | Eliminates constant navigation |
| **In-editor Weave mode** | Reduces context switching |
| **Scene-contextual character/location** | Faster attribution |
| **Export presets** | Different formats for editor vs. artist vs. letterer |

### Tier 3: Competitive Differentiators

| Feature | Why It Would Win |
|---------|------------------|
| **Voice-to-outline capture** | Ideation while walking/driving |
| **AI panel composition suggestions** | "Based on your description, consider: wide shot establishing, medium on reaction, close on hands" |
| **Pacing analysis** | "You have 4 consecutive dialogue-heavy pages—consider a visual beat" |
| **Character voice consistency checker** | "Marcus's speech pattern changed—intentional?" |
| **Automatic page-turn audit** | "Page 14 ends mid-scene—the turn will interrupt your beat" |
| **Letterer-specific export** | Balloon placement hints, word count per balloon |

### Tier 4: Nice to Have

| Feature | Benefit |
|---------|---------|
| **Dark/Light page templates** | For artists who need layout guides |
| **Panel grid presets** | Common layouts (6-panel, 9-panel, widescreen) |
| **Sound effect library** | Common SFX with formatting |
| **Caption style presets** | Narration box, location card, time stamp |
| **Reading order visualizer** | Show the "Z" path through panels |

---

## Part 5: Competitive Analysis

### vs. Final Draft ($249)
- Final Draft: Industry standard but not comic-native. I'm fighting the tool constantly.
- **Panel Flow advantage**: Purpose-built hierarchy, WeaveView, panel-level precision
- **Final Draft advantage**: Mature collaboration, rock-solid export, industry trust

### vs. Scrivener (~$99)
- Scrivener: Flexible but requires heavy customization for comics
- **Panel Flow advantage**: Zero setup, comic-native out of box
- **Scrivener advantage**: Better research/notes organization, more mature text tools

### vs. Superscript (new, comic-specific)
- Superscript: Focused on formatting automation, word counts per balloon
- **Panel Flow advantage**: WeaveView, AI partnership, plotline visualization
- **Superscript advantage**: More polished export, deeper panel formatting

### vs. River (AI-native comic tool)
- River: AI-first approach to comic writing
- **Panel Flow advantage**: More structured editor, WeaveView
- **River advantage**: Tighter AI integration, visual suggestions

### Panel Flow's Unique Position
No one else has:
1. Plotline weaving visualization
2. Spread-based visual story architecture
3. Socratic AI partnership with project context

**This is your moat. Protect and deepen it.**

---

## Part 6: Full Workflow Simulation

Let me walk through creating my 8-issue series, "THE STATIC," to identify every friction point.

### Phase 1: Inception
**What I want to do:** Capture my rough concept—a noir sci-fi about a detective who can hear radio signals from parallel dimensions.

**Current experience:**
- Create new Series ✓
- Add title, logline, theme ✓
- ...that's it. Where do I dump my brainstorm notes? My influences? My tone references?

**Friction:** No "Series Bible" or "Concept Notes" area. I'd have to use Project Notes, but those feel transactional, not generative.

**Missing:** A "Series Bible" section with structured fields (Tone, Influences, Visual Style, Rules of the World, etc.)

### Phase 2: World Building
**What I want to do:** Define the world—New Meridian City in 2089, the Static phenomenon, the factions.

**Current experience:**
- Add locations ✓
- Add characters ✓
- ...where do factions go? Where does "how the Static works" go?

**Friction:** Locations and Characters exist but no "World Elements" or "Rules" system.

**Missing:** A "World Building" section with custom entity types (Factions, Technologies, Rules, Timeline Events)

### Phase 3: Series Architecture
**What I want to do:** Plan all 8 issues at a high level. Issue 1 is introduction + first case. Issue 4 is the midpoint reversal. Issue 8 is the finale.

**Current experience:**
- Create 8 issues ✓
- Add titles and summaries ✓
- ...no way to see them all as a timeline. No way to track plotlines across issues.

**Friction:** I'm forced to plan issue-by-issue. There's no series-level overview.

**Critical Missing:** Series-level outline view with issue summaries and cross-issue plotline tracking.

### Phase 4: Issue Breakdown
**What I want to do:** Break Issue 1 into acts, scenes, and rough page allocations.

**Current experience:**
- Create 3 acts ✓
- Create scenes within acts ✓
- Assign page counts to scenes ✓

**This works reasonably well.** The NavigationTree is usable for this.

### Phase 5: Weaving
**What I want to do:** Interleave my A-plot (the case) with my B-plot (family flashbacks) and C-plot (mysterious observer).

**Current experience:**
- Go to WeaveView ✓
- Create plotlines with colors ✓
- Assign plotlines to pages ✓
- Drag pages to reorder ✓
- See rhythm visually ✓

**This is excellent.** WeaveView is the standout feature.

**Minor friction:** Can't see panel content in WeaveView, just story beats. Sometimes I need to see what's actually ON the page.

### Phase 6: Drafting
**What I want to do:** Write Panel-by-panel, with my character reference visible, checking previous pages for continuity.

**Current experience:**
- Open IssueEditor ✓
- Select page ✓
- Add panels ✓
- Write visual descriptions ✓
- Add dialogue ✓
- ...can't see character reference images (don't exist)
- ...can't see previous page without navigating away
- ...can't access AI without losing my place

**Friction:** Constant context-switching. The editor is functional but not flow-optimized.

### Phase 7: Reference Management
**What I want to do:** Attach my artist's character designs, location mood boards, and style guide.

**Current experience:**
- ...no image upload anywhere
- ...would have to link to external Google Drive

**Critical Missing:** Image attachments.

### Phase 8: Artist Handoff
**What I want to do:** Share Issue 1 with my artist, get their feedback, see their thumbnails.

**Current experience:**
- Export to PDF ✓
- ...email it manually
- ...get feedback in email/Slack
- ...no way to link their thumbnails to my script

**Critical Missing:** Collaboration features.

### Phase 9: Revision
**What I want to do:** My editor sends notes. I need to revise Issue 1 while comparing to my original.

**Current experience:**
- Version history exists ✓
- ...can't see a diff
- ...have to mentally compare

**Missing:** Version diff view.

### Phase 10: Completion
**What I want to do:** Export final scripts for artist, letterer, and editor (each needs different info).

**Current experience:**
- Export to PDF/DOCX/TXT ✓
- ...no presets
- ...same export for everyone

**Missing:** Export presets (Artist version with notes, Letterer version with word counts, Editor version with everything).

---

## Part 7: Recommendations Summary

### Immediate Priorities (Next 3 Months)
1. **Series-level outline view** — Grid/timeline showing all issues with plotline ribbons
2. **Image attachments** — On Characters, Locations, and Series
3. **Previous page context** — Show summary or collapsed view while drafting
4. **Keyboard navigation** — `Cmd+↑/↓` for page navigation at minimum
5. **In-editor AI sidebar** — Don't navigate away for Guided Mode

### Medium-Term (3-6 Months)
6. **Basic collaboration** — Share issue, add comments
7. **Spread/Splash support** — Mark pages as spreads, handle in export
8. **Version diff** — Side-by-side comparison
9. **Export presets** — Save configurations for different recipients
10. **Character/Location context** — Show relevant entities for current scene

### Long-Term Vision (6-12 Months)
11. **Full collaboration suite** — Artist thumbnails, feedback threads
12. **World building system** — Custom entity types beyond Characters/Locations
13. **AI panel composition** — Visual suggestions based on script
14. **Pacing analyzer** — Automated rhythm feedback
15. **Cross-issue continuity** — Track state changes across the series

---

## Final Verdict

**Panel Flow is 70% of the way to being the only comic writing tool I'd ever need.**

The philosophy is right. The architecture is right. WeaveView is genuinely innovative.

But the gaps in visual references, collaboration, and series-level planning make it unsuitable for professional work *today*.

Close those gaps, and you have a tool that could become the industry standard.

I'm watching this closely.

—*An Elite Comic Writer Who Really Wants This To Succeed*
