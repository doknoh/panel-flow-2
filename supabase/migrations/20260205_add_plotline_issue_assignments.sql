-- Migration: Add plotline-to-issue tracking
-- Purpose: Track which plotlines appear in which issues for series-level visualization

-- Create plotline_issue_assignments junction table
CREATE TABLE IF NOT EXISTS plotline_issue_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  plotline_id UUID NOT NULL REFERENCES plotlines(id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  -- Tracking story significance
  first_appearance BOOLEAN DEFAULT FALSE,   -- Is this where the plotline is introduced?
  climax_issue BOOLEAN DEFAULT FALSE,       -- Does this plotline climax here?
  resolution_issue BOOLEAN DEFAULT FALSE,   -- Is this where the plotline resolves?

  -- Optional notes about this plotline's role in this issue
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one assignment per plotline-issue pair
  UNIQUE(plotline_id, issue_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_plotline_issue_assignments_plotline
  ON plotline_issue_assignments(plotline_id);
CREATE INDEX idx_plotline_issue_assignments_issue
  ON plotline_issue_assignments(issue_id);

-- Enable Row Level Security
ALTER TABLE plotline_issue_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage assignments for plotlines in their series
-- Note: plotlines table uses issue_id, so we join: plotlines -> issues -> series -> user_id
CREATE POLICY "Users can view plotline assignments for their series"
  ON plotline_issue_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM plotlines p
      JOIN issues i ON p.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE p.id = plotline_issue_assignments.plotline_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert plotline assignments for their series"
  ON plotline_issue_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plotlines p
      JOIN issues i ON p.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE p.id = plotline_issue_assignments.plotline_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update plotline assignments for their series"
  ON plotline_issue_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM plotlines p
      JOIN issues i ON p.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE p.id = plotline_issue_assignments.plotline_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete plotline assignments for their series"
  ON plotline_issue_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM plotlines p
      JOIN issues i ON p.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE p.id = plotline_issue_assignments.plotline_id
      AND s.user_id = auth.uid()
    )
  );

-- Comments for documentation
COMMENT ON TABLE plotline_issue_assignments IS 'Tracks which plotlines appear in which issues, with story significance markers';
COMMENT ON COLUMN plotline_issue_assignments.first_appearance IS 'Mark TRUE if this is where readers first encounter this plotline';
COMMENT ON COLUMN plotline_issue_assignments.climax_issue IS 'Mark TRUE if this plotline reaches its peak conflict/tension in this issue';
COMMENT ON COLUMN plotline_issue_assignments.resolution_issue IS 'Mark TRUE if this plotline is resolved/concluded in this issue';

-- Helper view to get plotlines with their issue appearances
CREATE OR REPLACE VIEW plotlines_with_issues AS
SELECT
  p.*,
  COALESCE(
    json_agg(
      json_build_object(
        'issue_id', pia.issue_id,
        'issue_number', i.number,
        'first_appearance', pia.first_appearance,
        'climax_issue', pia.climax_issue,
        'resolution_issue', pia.resolution_issue,
        'notes', pia.notes
      ) ORDER BY i.number
    ) FILTER (WHERE pia.id IS NOT NULL),
    '[]'::json
  ) as issue_appearances
FROM plotlines p
LEFT JOIN plotline_issue_assignments pia ON p.id = pia.plotline_id
LEFT JOIN issues i ON pia.issue_id = i.id
GROUP BY p.id;

-- Grant access to the view
GRANT SELECT ON plotlines_with_issues TO authenticated;
