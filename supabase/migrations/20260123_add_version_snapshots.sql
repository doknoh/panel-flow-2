-- Add version_snapshots table for tracking issue history
CREATE TABLE IF NOT EXISTS version_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  snapshot_data JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for faster lookups by issue
CREATE INDEX IF NOT EXISTS idx_version_snapshots_issue_id ON version_snapshots(issue_id);
CREATE INDEX IF NOT EXISTS idx_version_snapshots_created_at ON version_snapshots(created_at DESC);

-- Enable RLS
ALTER TABLE version_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for version_snapshots
-- Users can only access snapshots for issues they own
CREATE POLICY "Users can view version snapshots for their issues" ON version_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM issues
      JOIN series ON series.id = issues.series_id
      WHERE issues.id = version_snapshots.issue_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create version snapshots for their issues" ON version_snapshots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM issues
      JOIN series ON series.id = issues.series_id
      WHERE issues.id = version_snapshots.issue_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update version snapshots for their issues" ON version_snapshots
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM issues
      JOIN series ON series.id = issues.series_id
      WHERE issues.id = version_snapshots.issue_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete version snapshots for their issues" ON version_snapshots
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM issues
      JOIN series ON series.id = issues.series_id
      WHERE issues.id = version_snapshots.issue_id AND series.user_id = auth.uid()
    )
  );
