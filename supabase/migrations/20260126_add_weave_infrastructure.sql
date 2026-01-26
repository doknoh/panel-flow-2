-- Add Weave infrastructure for plotlines and spread-based page organization
-- Supports visual arrangement of story beats across physical comic pages

-- Plotlines: Track A/B/C/etc story threads
CREATE TABLE IF NOT EXISTS plotlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6', -- Tailwind blue-500 as default
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on plotlines
ALTER TABLE plotlines ENABLE ROW LEVEL SECURITY;

-- RLS policies for plotlines (same pattern as other tables)
CREATE POLICY "Users can view plotlines for their series"
  ON plotlines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = plotlines.issue_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert plotlines for their series"
  ON plotlines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = plotlines.issue_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update plotlines for their series"
  ON plotlines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = plotlines.issue_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete plotlines for their series"
  ON plotlines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = plotlines.issue_id
      AND s.user_id = auth.uid()
    )
  );

-- Pages: Add story_beat and plotline reference for weave visualization
ALTER TABLE pages ADD COLUMN IF NOT EXISTS story_beat TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS plotline_id UUID REFERENCES plotlines(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS visual_motif TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS time_period TEXT;

-- Scenes: Add plotline reference (scenes can belong to a plotline)
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS plotline_id UUID REFERENCES plotlines(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pages_plotline_id ON pages(plotline_id);
CREATE INDEX IF NOT EXISTS idx_scenes_plotline_id ON scenes(plotline_id);
CREATE INDEX IF NOT EXISTS idx_plotlines_issue_id ON plotlines(issue_id);

-- Add helpful comments
COMMENT ON TABLE plotlines IS 'Story plotlines (A plot, B plot, etc.) for an issue';
COMMENT ON COLUMN plotlines.color IS 'Hex color for visual identification in the weave';
COMMENT ON COLUMN plotlines.sort_order IS 'Display order (0=A plot, 1=B plot, etc.)';

COMMENT ON COLUMN pages.story_beat IS 'One-line description of what happens on this page (for weave view)';
COMMENT ON COLUMN pages.plotline_id IS 'Which plotline this page primarily belongs to';
COMMENT ON COLUMN pages.visual_motif IS 'Visual motif or style note for this page';
COMMENT ON COLUMN pages.time_period IS 'Time period/year if story jumps in time';

COMMENT ON COLUMN scenes.plotline_id IS 'Which plotline this scene belongs to';
