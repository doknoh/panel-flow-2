-- Add sound_effects table
CREATE TABLE IF NOT EXISTS sound_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for faster lookups by panel
CREATE INDEX IF NOT EXISTS idx_sound_effects_panel_id ON sound_effects(panel_id);

-- Enable RLS
ALTER TABLE sound_effects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sound_effects
-- Users can only access sound_effects for panels in issues they own
CREATE POLICY "Users can view sound_effects for their panels" ON sound_effects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = sound_effects.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sound_effects for their panels" ON sound_effects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = sound_effects.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update sound_effects for their panels" ON sound_effects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = sound_effects.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sound_effects for their panels" ON sound_effects
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = sound_effects.panel_id AND series.user_id = auth.uid()
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_sound_effects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sound_effects_updated_at
  BEFORE UPDATE ON sound_effects
  FOR EACH ROW
  EXECUTE FUNCTION update_sound_effects_updated_at();
