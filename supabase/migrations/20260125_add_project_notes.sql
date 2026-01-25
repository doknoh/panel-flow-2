-- Create project_notes table for tracking open questions, decisions, and insights
CREATE TABLE IF NOT EXISTS project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('OPEN_QUESTION', 'DECISION', 'AI_INSIGHT', 'GENERAL')),
  content TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for filtering by series and type
CREATE INDEX idx_project_notes_series ON project_notes(series_id);
CREATE INDEX idx_project_notes_type ON project_notes(series_id, type);
CREATE INDEX idx_project_notes_resolved ON project_notes(series_id, resolved);

-- Enable RLS
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies using the helper function
CREATE POLICY "project_notes_select" ON project_notes FOR SELECT USING (user_owns_series(series_id));
CREATE POLICY "project_notes_insert" ON project_notes FOR INSERT WITH CHECK (user_owns_series(series_id));
CREATE POLICY "project_notes_update" ON project_notes FOR UPDATE USING (user_owns_series(series_id));
CREATE POLICY "project_notes_delete" ON project_notes FOR DELETE USING (user_owns_series(series_id));

-- Trigger for updated_at
CREATE TRIGGER update_project_notes_updated_at
  BEFORE UPDATE ON project_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE project_notes IS 'Project-level notes for tracking open questions, decisions, AI insights, and general notes';
COMMENT ON COLUMN project_notes.type IS 'Note category: OPEN_QUESTION, DECISION, AI_INSIGHT, or GENERAL';
COMMENT ON COLUMN project_notes.resolved IS 'Whether this note has been addressed/resolved';
