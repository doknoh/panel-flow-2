-- Add character_states table for tracking character arcs across issues
CREATE TABLE IF NOT EXISTS character_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  emotional_state TEXT, -- e.g., "hopeful", "desperate", "conflicted"
  emotional_score INTEGER CHECK (emotional_score >= 1 AND emotional_score <= 10), -- 1=despair, 10=hope
  plot_position TEXT, -- e.g., "in control", "endangered", "triumphant"
  key_moments TEXT, -- page references for important moments
  arc_summary TEXT, -- one sentence summary of their arc in this issue
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, issue_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_character_states_character_id ON character_states(character_id);
CREATE INDEX IF NOT EXISTS idx_character_states_issue_id ON character_states(issue_id);

-- Enable RLS
ALTER TABLE character_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies (via character -> series ownership)
CREATE POLICY "Users can view character states for their characters" ON character_states
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM characters
      JOIN series ON characters.series_id = series.id
      WHERE characters.id = character_states.character_id
      AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create character states for their characters" ON character_states
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM characters
      JOIN series ON characters.series_id = series.id
      WHERE characters.id = character_states.character_id
      AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update character states for their characters" ON character_states
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM characters
      JOIN series ON characters.series_id = series.id
      WHERE characters.id = character_states.character_id
      AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete character states for their characters" ON character_states
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM characters
      JOIN series ON characters.series_id = series.id
      WHERE characters.id = character_states.character_id
      AND series.user_id = auth.uid()
    )
  );

-- Update trigger
CREATE OR REPLACE FUNCTION update_character_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER character_states_updated_at
  BEFORE UPDATE ON character_states
  FOR EACH ROW
  EXECUTE FUNCTION update_character_states_updated_at();
