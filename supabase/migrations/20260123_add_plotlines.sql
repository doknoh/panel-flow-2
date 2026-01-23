-- Add plotlines table
CREATE TABLE IF NOT EXISTS plotlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1', -- Default indigo color
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for faster lookups by series
CREATE INDEX IF NOT EXISTS idx_plotlines_series_id ON plotlines(series_id);

-- Add plotline_id to scenes table
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS plotline_id UUID REFERENCES plotlines(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE plotlines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for plotlines (same pattern as characters/locations)
-- Users can only access plotlines for series they own
CREATE POLICY "Users can view plotlines for their series" ON plotlines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM series WHERE series.id = plotlines.series_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create plotlines for their series" ON plotlines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM series WHERE series.id = plotlines.series_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update plotlines for their series" ON plotlines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM series WHERE series.id = plotlines.series_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete plotlines for their series" ON plotlines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM series WHERE series.id = plotlines.series_id AND series.user_id = auth.uid()
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_plotlines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plotlines_updated_at
  BEFORE UPDATE ON plotlines
  FOR EACH ROW
  EXECUTE FUNCTION update_plotlines_updated_at();
