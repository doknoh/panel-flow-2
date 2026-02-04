-- Migration: Add page types for spreads and splash pages
-- Purpose: Support two-page spreads and full-page splash panels

-- Add page_type column to pages table
-- Using TEXT with CHECK constraint instead of ENUM for easier migrations
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS page_type TEXT DEFAULT 'SINGLE'
    CHECK (page_type IN ('SINGLE', 'SPLASH', 'SPREAD_LEFT', 'SPREAD_RIGHT'));

-- Add linked_page_id for connecting spread pages
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS linked_page_id UUID REFERENCES pages(id) ON DELETE SET NULL;

-- Index for finding linked pages quickly
CREATE INDEX IF NOT EXISTS idx_pages_linked_page
  ON pages(linked_page_id)
  WHERE linked_page_id IS NOT NULL;

-- Index for filtering by page type
CREATE INDEX IF NOT EXISTS idx_pages_page_type
  ON pages(page_type)
  WHERE page_type != 'SINGLE';

-- Comments for documentation
COMMENT ON COLUMN pages.page_type IS 'SINGLE=normal page, SPLASH=full-page single panel, SPREAD_LEFT/RIGHT=two-page spread';
COMMENT ON COLUMN pages.linked_page_id IS 'For spreads: links the left page to the right page (set on SPREAD_LEFT, points to SPREAD_RIGHT)';

-- Helper function to validate spread linking
-- Ensures SPREAD_LEFT links to SPREAD_RIGHT and vice versa
CREATE OR REPLACE FUNCTION validate_spread_link()
RETURNS TRIGGER AS $$
DECLARE
  linked_type TEXT;
BEGIN
  -- Only validate if there's a linked page
  IF NEW.linked_page_id IS NOT NULL THEN
    SELECT page_type INTO linked_type
    FROM pages
    WHERE id = NEW.linked_page_id;

    -- SPREAD_LEFT must link to SPREAD_RIGHT
    IF NEW.page_type = 'SPREAD_LEFT' AND linked_type != 'SPREAD_RIGHT' THEN
      RAISE EXCEPTION 'SPREAD_LEFT page must link to a SPREAD_RIGHT page';
    END IF;

    -- SPREAD_RIGHT must link to SPREAD_LEFT
    IF NEW.page_type = 'SPREAD_RIGHT' AND linked_type != 'SPREAD_LEFT' THEN
      RAISE EXCEPTION 'SPREAD_RIGHT page must link to a SPREAD_LEFT page';
    END IF;

    -- Non-spread pages shouldn't have linked pages
    IF NEW.page_type IN ('SINGLE', 'SPLASH') AND NEW.linked_page_id IS NOT NULL THEN
      RAISE EXCEPTION 'Only spread pages can have linked pages';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_spread_link_trigger
  BEFORE INSERT OR UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION validate_spread_link();
