# Panel Flow 2.0 — Tier 2 Feature Specifications

## Executive Summary

Four features designed to transform Panel Flow from a writing tool into a **complete storytelling acceleration platform**:

| Feature | Core Value | Implementation Complexity |
|---------|-----------|---------------------------|
| AI Thumbnail Generator | See your panels before artists draw them | Medium |
| Deadline Dashboard | Never miss a deadline, know your velocity | Low |
| Continuity Checker | Catch errors before readers do | Medium |
| Panel Pacing Analyst | Master the rhythm of sequential storytelling | Medium |

---

# 1. AI THUMBNAIL GENERATOR

## The Vision

**Problem:** Writers describe panels in prose, but can't "see" if their compositions work until an artist interprets them—often weeks later. Spatial relationships, panel density, and visual flow remain abstract until it's expensive to change.

**Solution:** Instant rough thumbnails generated from panel descriptions, giving writers visual feedback in seconds.

### What This Enables

```
┌─────────────────────────────────────────────────────────────────┐
│  BEFORE: Writer's Mental Model                                   │
│  "WIDE SHOT: Marshall walks down a long hallway..."             │
│           ↓ (weeks pass)                                        │
│  Artist interpretation → "That's not what I pictured"           │
│           ↓                                                     │
│  Expensive revision cycle                                       │
├─────────────────────────────────────────────────────────────────┤
│  AFTER: Instant Visual Feedback                                 │
│  "WIDE SHOT: Marshall walks down a long hallway..."             │
│           ↓ (seconds)                                           │
│  [Generated Thumbnail] → "Perfect" OR "Let me refine this"      │
│           ↓                                                     │
│  Writer iterates until satisfied, THEN sends to artist          │
└─────────────────────────────────────────────────────────────────┘
```

**Specific Capabilities:**
- Generate rough compositional thumbnails for any panel
- Batch-generate all panels on a page to see page flow
- Generate full-page layouts showing panel arrangement
- Maintain visual consistency across an issue (same characters, same style)
- Export thumbnail sheets for artist reference

### User Experience Flow

```
PageEditor
├── Panel 1
│   ├── Visual Description: "CLOSE-UP on Marshall's eyes..."
│   ├── [✨ Generate Thumbnail]  ← Single panel
│   └── [Generated Image] or [Placeholder]
├── Panel 2
│   └── ...
└── [✨ Generate All Thumbnails]  ← Full page batch
```

**Interaction:**
1. Writer clicks "Generate Thumbnail" on a panel
2. Loading state shows generation in progress (3-8 seconds)
3. Thumbnail appears inline with the panel
4. Writer can: Regenerate | Download | Delete
5. Thumbnails persist and export with the script

---

## Implementation Plan

### Database Schema

```sql
-- Migration: 20260206_add_thumbnail_generation.sql

-- Store generation settings at series level for consistency
ALTER TABLE series ADD COLUMN thumbnail_style JSONB DEFAULT '{
  "art_style": "rough_sketch",
  "line_weight": "medium",
  "shading": "minimal",
  "aspect_ratio": "comic_panel"
}'::jsonb;

-- Track generation requests and results
CREATE TABLE thumbnail_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES panels(id) ON DELETE CASCADE,

  -- Generation input
  prompt_used TEXT NOT NULL,
  style_settings JSONB NOT NULL,

  -- Generation output
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  image_url TEXT,
  storage_path TEXT,

  -- Metadata
  generation_time_ms INTEGER,
  model_used TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only keep latest generation per panel (can add versioning later)
  UNIQUE(panel_id)
);

CREATE INDEX idx_thumbnail_panel ON thumbnail_generations(panel_id);
CREATE INDEX idx_thumbnail_status ON thumbnail_generations(status);
```

### API Route

```typescript
// src/app/api/panels/[panelId]/thumbnail/route.ts

export async function POST(req: Request, { params }: { params: { panelId: string } }) {
  // 1. Fetch panel with context (scene characters, location, previous panels)
  // 2. Build prompt from visual_description + shot_type + context
  // 3. Apply series thumbnail_style settings
  // 4. Call image generation API (Replicate/Stability/OpenAI)
  // 5. Upload result to Supabase storage
  // 6. Save to thumbnail_generations table
  // 7. Return image URL
}

// Batch endpoint for full page
export async function POST /api/pages/[pageId]/thumbnails
```

### Prompt Engineering

```typescript
function buildThumbnailPrompt(panel: Panel, context: PanelContext): string {
  const basePrompt = `
    Comic book thumbnail sketch, rough pencil style, minimal detail.

    SHOT TYPE: ${panel.shot_type || 'MEDIUM SHOT'}

    COMPOSITION:
    ${panel.visual_description}

    CHARACTERS PRESENT:
    ${context.characters.map(c => `- ${c.name}: ${c.appearance}`).join('\n')}

    SETTING: ${context.location?.name || 'unspecified'}
    ${context.location?.description || ''}

    Style: Quick sketch, focus on composition and spatial relationships.
    Do not include text, speech bubbles, or captions.
    Black and white, rough lines, gestural quality.
  `;

  return basePrompt;
}
```

### UI Components

```typescript
// src/components/ThumbnailGenerator.tsx
interface ThumbnailGeneratorProps {
  panelId: string;
  visualDescription: string;
  existingThumbnail?: string;
  onGenerated: (imageUrl: string) => void;
}

// States: idle | generating | completed | error
// Actions: Generate | Regenerate | Download | Delete
```

### Integration Points

1. **PageEditor**: Add thumbnail preview below each panel
2. **Toolkit Visuals Tab**: Gallery view of all generated thumbnails
3. **Export**: Include thumbnail sheet in PDF/Doc exports
4. **Weave View**: Show thumbnails in the visual flow

### Cost Considerations

| Provider | Cost per Image | Speed | Quality |
|----------|---------------|-------|---------|
| Stability AI | ~$0.002 | 2-4s | Good |
| Replicate SDXL | ~$0.003 | 3-6s | Better |
| OpenAI DALL-E | ~$0.04 | 5-10s | Best |

**Recommendation:** Start with Stability AI for cost efficiency at scale.

---

# 2. DEADLINE DASHBOARD

## The Vision

**Problem:** Comic production involves multiple issues, each with their own deadlines. Writers lose track of velocity, miss deadlines, and can't accurately estimate completion dates.

**Solution:** A production dashboard that tracks writing velocity, projects completion dates, and surfaces issues at risk.

### What This Enables

```
┌─────────────────────────────────────────────────────────────────┐
│                    RESURGET — Production Dashboard               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  YOUR VELOCITY                          OVERALL STATUS           │
│  ████████████░░░░ 847 words/hour        ✅ On Track              │
│  ████████░░░░░░░░ 2.3 pages/day                                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ISSUE TIMELINE                                                  │
│                                                                  │
│  Issue #1 ████████████████████ COMPLETE                         │
│  Issue #2 ████████████░░░░░░░░ 60% ─── Due: Feb 15 ✅           │
│  Issue #3 ████░░░░░░░░░░░░░░░░ 20% ─── Due: Mar 1  ⚠️           │
│  Issue #4 ░░░░░░░░░░░░░░░░░░░░ 0%  ─── Due: Mar 15 ✅           │
│                                                                  │
│  ⚠️ Issue #3 at risk: Current pace projects Mar 8 completion    │
│     → Need 3.1 pages/day (vs current 2.3) to meet deadline      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Specific Capabilities:**
- Set deadlines per issue
- Track actual writing velocity from session data
- Project completion dates based on current pace
- Identify at-risk deadlines early
- See historical velocity trends
- Export production reports

### User Experience Flow

```
Series Page
├── Issues Grid (existing)
└── [📊 Production Dashboard]  ← New button

Dashboard Page
├── Velocity Metrics (calculated from sessions)
├── Issue Timeline (Gantt-style)
├── At-Risk Alerts
└── Historical Trends
```

---

## Implementation Plan

### Database Schema

```sql
-- Migration: 20260206_add_deadlines.sql

-- Add deadline tracking to issues
ALTER TABLE issues ADD COLUMN deadline DATE;
ALTER TABLE issues ADD COLUMN target_page_count INTEGER;
ALTER TABLE issues ADD COLUMN production_status TEXT DEFAULT 'not_started'
  CHECK (production_status IN (
    'not_started', 'outlining', 'drafting', 'revising', 'complete'
  ));

-- Create production_snapshots for historical tracking
CREATE TABLE production_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Metrics at time of snapshot
  page_count INTEGER NOT NULL DEFAULT 0,
  panel_count INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,

  -- Velocity (calculated from recent sessions)
  words_per_hour DECIMAL(10,2),
  pages_per_day DECIMAL(10,2),

  -- Projections
  projected_completion DATE,
  days_remaining INTEGER,
  on_track BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(issue_id, snapshot_date)
);

CREATE INDEX idx_snapshots_issue ON production_snapshots(issue_id);
CREATE INDEX idx_snapshots_date ON production_snapshots(snapshot_date);

-- Function to calculate current metrics
CREATE OR REPLACE FUNCTION calculate_issue_metrics(p_issue_id UUID)
RETURNS TABLE (
  page_count INTEGER,
  panel_count INTEGER,
  word_count INTEGER,
  avg_words_per_hour DECIMAL,
  avg_pages_per_day DECIMAL
) AS $$
  -- Implementation: Count pages/panels, sum dialogue words,
  -- aggregate session data for velocity
$$ LANGUAGE sql STABLE;
```

### API Routes

```typescript
// src/app/api/series/[seriesId]/dashboard/route.ts

export async function GET(req: Request, { params }) {
  // Returns:
  // - All issues with deadlines, current progress, projections
  // - Series-wide velocity metrics
  // - At-risk issues
  // - Historical snapshots for trend charts
}

// src/app/api/issues/[issueId]/deadline/route.ts

export async function PATCH(req: Request, { params }) {
  // Update deadline and target_page_count
}
```

### UI Components

```typescript
// src/app/series/[seriesId]/dashboard/page.tsx

// Components:
// - VelocityCard: Shows current writing speed metrics
// - IssueTimeline: Gantt-style view of all issues
// - AtRiskAlerts: Warnings for endangered deadlines
// - TrendChart: Historical velocity over time
// - ProjectionCalculator: "If I write X pages/day..."
```

### Velocity Calculation

```typescript
function calculateVelocity(sessions: Session[]): VelocityMetrics {
  const recentSessions = sessions.filter(s =>
    s.ended_at && daysSince(s.ended_at) <= 14 // Last 2 weeks
  );

  const totalMinutes = sum(recentSessions.map(s =>
    differenceInMinutes(s.ended_at, s.started_at)
  ));

  const totalWords = sum(recentSessions.map(s => s.words_written));
  const totalPages = sum(recentSessions.map(s => s.pages_created));

  return {
    wordsPerHour: (totalWords / totalMinutes) * 60,
    pagesPerDay: totalPages / 14, // Average over 2 weeks
    totalSessionTime: totalMinutes,
  };
}
```

---

# 3. CONTINUITY CHECKER

## The Vision

**Problem:** Comics are written over months. Writers forget details: what color was that character's shirt? Did they already reveal this information? Is this the first time these characters meet? Readers notice these errors.

**Solution:** An AI-powered continuity analyzer that reads your entire script and flags potential inconsistencies.

### What This Enables

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTINUITY CHECKER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ⚠️ 3 POTENTIAL ISSUES FOUND                                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🔴 HIGH: Character State Inconsistency                     │ │
│  │                                                            │ │
│  │ Page 12: "Marshall smiles warmly at Royce"                 │ │
│  │ Page 8:  "Marshall vows never to speak to Royce again"     │ │
│  │                                                            │ │
│  │ These events are 4 pages apart with no reconciliation.     │ │
│  │                                                            │ │
│  │ [Mark as Intentional] [Jump to Page 8] [Jump to Page 12]   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🟡 MEDIUM: Timeline Ambiguity                              │ │
│  │                                                            │ │
│  │ Page 15: Scene set "Three days later"                      │ │
│  │ Page 18: Reference to "yesterday's meeting"                │ │
│  │                                                            │ │
│  │ The timeline math doesn't add up. Clarify which events     │ │
│  │ occurred when.                                             │ │
│  │                                                            │ │
│  │ [Mark as Intentional] [Jump to Page 15] [Jump to Page 18]  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Specific Capabilities:**
- **Character Consistency**: Track character appearances, emotional states, knowledge
- **Timeline Validation**: Verify temporal references make sense
- **Visual Continuity**: Flag costume/appearance changes without explanation
- **Dialogue Consistency**: Character voice and knowledge tracking
- **Plot Thread Tracking**: Ensure setup/payoff for all story elements
- **Cross-Issue Continuity**: Track details across multiple issues

### Categories of Continuity Errors

| Category | Example | Severity |
|----------|---------|----------|
| Character State | Character angry, then happy with no transition | High |
| Timeline | "Three days later" math doesn't work | High |
| Visual | Character's hair color changes | Medium |
| Knowledge | Character knows something they shouldn't | High |
| Location | Character in two places at once | Critical |
| Plot Thread | Setup never paid off | Medium |
| Relationship | Characters act like strangers after meeting | High |

---

## Implementation Plan

### Database Schema

```sql
-- Migration: 20260206_add_continuity_tracking.sql

CREATE TABLE continuity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  -- Alert classification
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'character_state', 'timeline', 'visual', 'knowledge',
    'location', 'plot_thread', 'relationship'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- What was found
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- References to specific content
  source_page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  source_panel_id UUID REFERENCES panels(id) ON DELETE SET NULL,
  source_excerpt TEXT,

  conflict_page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  conflict_panel_id UUID REFERENCES panels(id) ON DELETE SET NULL,
  conflict_excerpt TEXT,

  -- AI reasoning
  ai_explanation TEXT,
  suggested_fix TEXT,

  -- Resolution
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'intentional', 'fixed', 'dismissed'
  )),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_continuity_issue ON continuity_alerts(issue_id);
CREATE INDEX idx_continuity_status ON continuity_alerts(status);
CREATE INDEX idx_continuity_severity ON continuity_alerts(severity);

-- Track character appearances for continuity analysis
CREATE TABLE character_appearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  panel_id UUID REFERENCES panels(id) ON DELETE SET NULL,

  -- What we know at this point
  emotional_state TEXT,
  physical_description TEXT, -- What they're wearing/holding
  knowledge_gained TEXT[], -- What they learned in this scene

  -- Context
  dialogue_excerpt TEXT,
  visual_excerpt TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(character_id, panel_id)
);
```

### API Route

```typescript
// src/app/api/issues/[issueId]/continuity/route.ts

export async function POST(req: Request, { params }) {
  // 1. Fetch full issue with all pages, panels, dialogue
  // 2. Build character appearance timeline
  // 3. Extract all temporal references
  // 4. Send to Claude for analysis with structured output
  // 5. Parse response into continuity_alerts
  // 6. Return alerts grouped by severity
}
```

### AI Prompt Structure

```typescript
const CONTINUITY_SYSTEM_PROMPT = `
You are a continuity editor for comic books. Your job is to find inconsistencies
that would confuse readers or break immersion.

Analyze the provided script for:

1. CHARACTER STATE CONTINUITY
   - Emotional states should flow logically
   - Characters shouldn't know things they haven't learned
   - Physical appearances should be consistent

2. TIMELINE CONTINUITY
   - Temporal references ("three days later", "yesterday") must be mathematically consistent
   - Characters can't be in two places at once

3. VISUAL CONTINUITY
   - Costume/appearance changes need explanation
   - Props that appear/disappear
   - Setting details that change

4. PLOT CONTINUITY
   - Setups need payoffs
   - Reveals need setups
   - Character arcs should progress logically

For each issue found, provide:
- severity: critical | high | medium | low
- type: character_state | timeline | visual | knowledge | location | plot_thread | relationship
- title: Brief description
- description: Detailed explanation
- source_page: Page number where issue originates
- conflict_page: Page number of conflicting content
- suggested_fix: How to resolve this

Return as JSON array of issues.
`;
```

### UI Integration

```typescript
// Integrate into existing Alerts tab in Toolkit

// src/app/series/[seriesId]/issues/[issueId]/Toolkit.tsx
// Add to alerts tab:

<ContinuityAlerts
  issueId={issue.id}
  onJumpToPage={(pageId) => setSelectedPageId(pageId)}
/>

// Alert card with actions:
// - Mark as Intentional (story choice)
// - Jump to Source
// - Jump to Conflict
// - Mark as Fixed
// - Dismiss
```

---

# 4. PANEL PACING ANALYST

## The Vision

**Problem:** Comic pacing is invisible in prose form. Writers can't feel the rhythm of their story until it's drawn. Some pages read too slow (too many words), others too fast (not enough beats). Page turns lack impact.

**Solution:** Visual pacing analysis that shows the rhythm of your storytelling and suggests improvements.

### What This Enables

```
┌─────────────────────────────────────────────────────────────────┐
│                     PACING ANALYSIS — Issue #1                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PAGE RHYTHM VISUALIZATION                                       │
│                                                                  │
│  Words │                                                         │
│   150  │          ▓▓                                            │
│   100  │    ▓▓    ▓▓▓▓    ▓▓          ▓▓                        │
│    50  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓    ▓▓▓▓▓▓▓▓▓▓                    │
│     0  │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                    │
│        └─────────────────────────────────────                    │
│         1  2  3  4  5  6  7  8  9  10 11 12    Page              │
│                                                                  │
│  PANEL DENSITY                                                   │
│                                                                  │
│  Panels│                                                         │
│     8  │                        ▓▓                               │
│     6  │    ▓▓▓▓          ▓▓▓▓▓▓▓▓                              │
│     4  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                          │
│     2  │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                         │
│        └─────────────────────────────────                        │
│         1  2  3  4  5  6  7  8  9  10 11 12    Page              │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  🎯 INSIGHTS                                                     │
│                                                                  │
│  ⚠️ Page 5 has 156 words — may feel slow. Consider splitting    │
│     dialogue or adding visual beats.                             │
│                                                                  │
│  ⚠️ Page 8-9 spread has only 2 panels — great for impact, but   │
│     ensure the moment warrants it.                               │
│                                                                  │
│  ✅ Page 11 ends on a revelation — excellent page-turn hook.     │
│                                                                  │
│  💡 Consider: Pages 6-7 are both dialogue-heavy. Break up with   │
│     a silent panel or action beat?                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Specific Capabilities:**
- **Visual Rhythm Charts**: See word count and panel density per page
- **Dialogue/Visual Balance**: Identify heavy dialogue sections
- **Page Turn Analysis**: Evaluate cliffhangers and hooks
- **Scene Pacing**: Compare pacing across scenes
- **Industry Benchmarks**: Compare to professional standards
- **AI Suggestions**: Get specific recommendations for improvement

### Pacing Metrics

| Metric | Ideal Range | Warning Threshold |
|--------|-------------|-------------------|
| Words per page | 30-100 | >150 (too slow) |
| Panels per page | 4-6 | >8 (cramped) or <3 (sparse) |
| Dialogue panels | 40-60% | >80% (talking heads) |
| Silent panels | 10-20% | <5% (no breathing room) |
| Words per panel | 10-25 | >40 (wall of text) |

---

## Implementation Plan

### Database Schema

```sql
-- Migration: 20260206_add_pacing_analysis.sql

CREATE TABLE pacing_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  -- When this analysis was run
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Overall metrics
  total_pages INTEGER NOT NULL,
  total_panels INTEGER NOT NULL,
  total_words INTEGER NOT NULL,
  total_dialogue_panels INTEGER NOT NULL,
  total_silent_panels INTEGER NOT NULL,

  -- Averages
  avg_words_per_page DECIMAL(10,2),
  avg_panels_per_page DECIMAL(10,2),
  avg_words_per_panel DECIMAL(10,2),
  dialogue_panel_ratio DECIMAL(5,4), -- 0.0 to 1.0

  -- Per-page breakdown (JSONB array)
  page_metrics JSONB NOT NULL DEFAULT '[]',
  -- Each element: { page_id, page_number, word_count, panel_count,
  --                 dialogue_panels, silent_panels, is_page_turn_hook }

  -- AI analysis
  ai_insights JSONB DEFAULT '[]',
  -- Each element: { type, severity, page_numbers[], message, suggestion }

  overall_score INTEGER, -- 1-100 pacing quality score

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pacing_issue ON pacing_analyses(issue_id);

-- Store page-turn effectiveness scores
ALTER TABLE pages ADD COLUMN page_turn_score INTEGER
  CHECK (page_turn_score BETWEEN 1 AND 10);
ALTER TABLE pages ADD COLUMN pacing_notes TEXT;
```

### API Route

```typescript
// src/app/api/issues/[issueId]/pacing/route.ts

export async function POST(req: Request, { params }) {
  // 1. Fetch full issue with pages, panels, dialogue
  // 2. Calculate metrics per page
  // 3. Calculate overall metrics
  // 4. Send to Claude for qualitative analysis
  // 5. Store results in pacing_analyses
  // 6. Return visualization-ready data
}

interface PacingMetrics {
  pages: PagePacingMetric[];
  overall: OverallMetrics;
  insights: PacingInsight[];
  score: number;
}

interface PagePacingMetric {
  pageId: string;
  pageNumber: number;
  wordCount: number;
  panelCount: number;
  dialoguePanels: number;
  silentPanels: number;
  isPageTurnHook: boolean;
  warnings: string[];
}
```

### Calculation Logic

```typescript
function calculatePageMetrics(page: Page): PagePacingMetric {
  const panels = page.panels || [];

  const wordCount = panels.reduce((sum, panel) => {
    const dialogueWords = (panel.dialogue_blocks || [])
      .reduce((s, d) => s + countWords(d.text), 0);
    const captionWords = (panel.captions || [])
      .reduce((s, c) => s + countWords(c.text), 0);
    return sum + dialogueWords + captionWords;
  }, 0);

  const dialoguePanels = panels.filter(p =>
    (p.dialogue_blocks?.length || 0) > 0
  ).length;

  const silentPanels = panels.filter(p =>
    (p.dialogue_blocks?.length || 0) === 0 &&
    (p.captions?.length || 0) === 0
  ).length;

  const warnings: string[] = [];
  if (wordCount > 150) warnings.push('High word count - may read slowly');
  if (panels.length > 8) warnings.push('Many panels - page may feel cramped');
  if (panels.length < 3) warnings.push('Few panels - ensure moment warrants space');

  return {
    pageId: page.id,
    pageNumber: page.page_number,
    wordCount,
    panelCount: panels.length,
    dialoguePanels,
    silentPanels,
    isPageTurnHook: detectPageTurnHook(page),
    warnings,
  };
}
```

### AI Analysis Prompt

```typescript
const PACING_SYSTEM_PROMPT = `
You are a comic book pacing consultant. Analyze the provided script metrics
and content to give specific, actionable feedback on pacing.

Consider:

1. PAGE-LEVEL PACING
   - Is word density appropriate for the emotional beat?
   - Do high-word pages have complex enough visuals to balance?
   - Are splash pages/spreads used for maximum impact moments?

2. SCENE RHYTHM
   - Does pacing vary appropriately between action and dialogue?
   - Are there "breathing room" panels after intense moments?
   - Does the scene build to an appropriate climax?

3. PAGE TURNS
   - Do odd-numbered pages end on hooks?
   - Are reveals placed for maximum surprise?
   - Would any page benefit from restructuring for better turns?

4. DIALOGUE DENSITY
   - Are there "talking heads" sequences that need visual variety?
   - Could any dialogue be converted to action or expression?
   - Are speech patterns distinguishable?

Provide insights as JSON array:
{
  "type": "warning" | "suggestion" | "strength",
  "severity": "high" | "medium" | "low",
  "pages": [array of page numbers affected],
  "message": "What the issue is",
  "suggestion": "Specific fix recommendation"
}
`;
```

### UI Components

```typescript
// src/app/series/[seriesId]/issues/[issueId]/pacing/page.tsx

// Or add as tab in Toolkit

<PacingDashboard issueId={issue.id}>
  <RhythmChart metrics={pacingData.pages} type="words" />
  <RhythmChart metrics={pacingData.pages} type="panels" />
  <OverallScore score={pacingData.score} />
  <InsightsList insights={pacingData.insights} />
</PacingDashboard>

// Interactive: Click on chart bar to jump to that page
// Real-time: Recalculate on significant changes
```

---

# Implementation Priority & Timeline

## Recommended Order

```
Week 1-2: Deadline Dashboard
├── Lowest complexity
├── Immediate value
└── Establishes production tracking foundation

Week 3-4: Panel Pacing Analyst
├── Medium complexity
├── Uses existing data (no new input needed)
└── Writers see value immediately

Week 5-6: Continuity Checker
├── Medium complexity
├── AI-heavy, needs prompt refinement
└── Prevents expensive mistakes

Week 7-8: AI Thumbnail Generator
├── Highest complexity (external API)
├── Needs image generation integration
└── Highest "wow factor"
```

## Shared Infrastructure Needed

1. **Background Job System** (for long-running AI tasks)
   - Consider: Vercel Cron, Supabase Edge Functions, or Inngest

2. **AI Response Caching** (avoid redundant API calls)
   - Cache continuity/pacing analyses until content changes

3. **Progress Indicators** (for multi-second operations)
   - Streaming responses or polling for status

4. **Rate Limiting** (for AI and image generation)
   - Extend existing rate-limit.ts system

---

# Summary

These four features transform Panel Flow from a **writing tool** into a **storytelling command center**:

| Feature | Writer Benefit | Production Benefit |
|---------|---------------|-------------------|
| Thumbnails | See your vision before artists | Faster handoff, fewer revisions |
| Deadlines | Never miss a deadline | Predictable production schedules |
| Continuity | Catch errors early | Fewer costly corrections |
| Pacing | Master your craft | Professional-quality output |

**The competitive moat:** No other comic writing tool offers AI-powered visual, temporal, and narrative analysis. This makes Panel Flow indispensable for serious comic creators.
