-- Add title column to pages table for custom page names
ALTER TABLE pages ADD COLUMN IF NOT EXISTS title TEXT;

-- By default, pages will display "Page {page_number}" if title is null
-- Users can set a custom title like "Opening Scene" or "Page 1 - Studio Hallway"
