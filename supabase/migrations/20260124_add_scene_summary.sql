-- Add scene_summary field to scenes table for outline layer
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_summary TEXT;

-- Comment for documentation
COMMENT ON COLUMN scenes.scene_summary IS 'One-sentence summary of the scene for outline view';
