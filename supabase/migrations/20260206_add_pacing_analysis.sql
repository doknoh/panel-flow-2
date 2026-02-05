-- Migration: Add pacing analysis tables
-- Feature: Panel Pacing Analyst

-- Store pacing analysis results per issue
CREATE TABLE IF NOT EXISTS pacing_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  -- When this analysis was run
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Overall metrics
  total_pages INTEGER NOT NULL DEFAULT 0,
  total_panels INTEGER NOT NULL DEFAULT 0,
  total_words INTEGER NOT NULL DEFAULT 0,
  total_dialogue_panels INTEGER NOT NULL DEFAULT 0,
  total_silent_panels INTEGER NOT NULL DEFAULT 0,

  -- Averages
  avg_words_per_page DECIMAL(10,2),
  avg_panels_per_page DECIMAL(10,2),
  avg_words_per_panel DECIMAL(10,2),
  dialogue_panel_ratio DECIMAL(5,4), -- 0.0 to 1.0

  -- Per-page breakdown (JSONB array)
  -- Each element: { page_id, page_number, word_count, panel_count,
  --                 dialogue_panels, silent_panels, is_page_turn_hook }
  page_metrics JSONB NOT NULL DEFAULT '[]',

  -- AI analysis insights
  -- Each element: { type, severity, page_numbers[], message, suggestion }
  ai_insights JSONB DEFAULT '[]',

  -- Overall pacing quality score (1-100)
  overall_score INTEGER CHECK (overall_score BETWEEN 1 AND 100),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_pacing_issue ON pacing_analyses(issue_id);
CREATE INDEX IF NOT EXISTS idx_pacing_analyzed_at ON pacing_analyses(analyzed_at DESC);

-- Add page-level pacing fields
ALTER TABLE pages ADD COLUMN IF NOT EXISTS page_turn_score INTEGER
  CHECK (page_turn_score BETWEEN 1 AND 10);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS pacing_notes TEXT;

-- RLS policies
ALTER TABLE pacing_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pacing analyses for their series"
  ON pacing_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = pacing_analyses.issue_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create pacing analyses for their series"
  ON pacing_analyses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = pacing_analyses.issue_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete pacing analyses for their series"
  ON pacing_analyses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = pacing_analyses.issue_id
      AND s.user_id = auth.uid()
    )
  );
