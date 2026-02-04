-- Migration: Add image attachments system
-- Purpose: Allow attaching reference images to characters, locations, series, and pages

-- Create image_attachments table (polymorphic design)
CREATE TABLE IF NOT EXISTS image_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Polymorphic association: what entity does this image belong to?
  entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'location', 'series', 'page')),
  entity_id UUID NOT NULL,

  -- Image storage info
  storage_path TEXT NOT NULL,        -- Path in Supabase storage bucket
  filename TEXT NOT NULL,            -- Original filename
  mime_type TEXT NOT NULL,           -- e.g., 'image/png', 'image/jpeg'
  file_size INTEGER NOT NULL,        -- Size in bytes

  -- Metadata
  caption TEXT,                      -- Optional description
  is_primary BOOLEAN DEFAULT FALSE,  -- Is this the main reference image?
  sort_order INTEGER DEFAULT 0,      -- For ordering multiple images

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_image_attachments_entity
  ON image_attachments(entity_type, entity_id);
CREATE INDEX idx_image_attachments_user
  ON image_attachments(user_id);
CREATE INDEX idx_image_attachments_primary
  ON image_attachments(entity_type, entity_id, is_primary)
  WHERE is_primary = TRUE;

-- Enable Row Level Security
ALTER TABLE image_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own images
CREATE POLICY "Users can view their own images"
  ON image_attachments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own images"
  ON image_attachments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own images"
  ON image_attachments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own images"
  ON image_attachments FOR DELETE
  USING (user_id = auth.uid());

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_image_attachments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER image_attachments_updated_at
  BEFORE UPDATE ON image_attachments
  FOR EACH ROW
  EXECUTE FUNCTION update_image_attachments_updated_at();

-- Helper function to ensure only one primary image per entity
CREATE OR REPLACE FUNCTION ensure_single_primary_image()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = TRUE THEN
    -- Clear any existing primary for this entity
    UPDATE image_attachments
    SET is_primary = FALSE
    WHERE entity_type = NEW.entity_type
      AND entity_id = NEW.entity_id
      AND id != NEW.id
      AND is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_primary_image_trigger
  BEFORE INSERT OR UPDATE ON image_attachments
  FOR EACH ROW
  WHEN (NEW.is_primary = TRUE)
  EXECUTE FUNCTION ensure_single_primary_image();

-- Comments for documentation
COMMENT ON TABLE image_attachments IS 'Stores reference images for characters, locations, series, and pages';
COMMENT ON COLUMN image_attachments.entity_type IS 'Type of entity: character, location, series, or page';
COMMENT ON COLUMN image_attachments.entity_id IS 'UUID of the associated entity';
COMMENT ON COLUMN image_attachments.storage_path IS 'Path to file in Supabase storage bucket';
COMMENT ON COLUMN image_attachments.is_primary IS 'Primary reference image shown in thumbnails and quick views';
