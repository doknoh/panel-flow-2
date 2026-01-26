-- Add outline infrastructure for top-down Socratic workflow
-- Supports working from macro (series → issue → act → scene → page) to micro (panels)

-- Series: Add outline fields
ALTER TABLE series ADD COLUMN IF NOT EXISTS outline_notes TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS series_outline_status TEXT DEFAULT 'outlining'
  CHECK (series_outline_status IN ('outlining', 'drafting', 'complete'));

-- Issues: Add outline fields (separate from existing status for draft progress)
ALTER TABLE issues ADD COLUMN IF NOT EXISTS outline_notes TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS outline_status TEXT DEFAULT 'incomplete'
  CHECK (outline_status IN ('incomplete', 'rough', 'solid', 'locked'));

-- Acts: Add intention and notes fields
ALTER TABLE acts ADD COLUMN IF NOT EXISTS intention TEXT;
ALTER TABLE acts ADD COLUMN IF NOT EXISTS outline_notes TEXT;

-- Scenes: Add intention and notes fields
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS intention TEXT;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS outline_notes TEXT;

-- Pages: Add summary, intention, and notes fields
ALTER TABLE pages ADD COLUMN IF NOT EXISTS page_summary TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS intention TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS outline_notes TEXT;

-- Add helpful comments for documentation
COMMENT ON COLUMN series.outline_notes IS 'High-level series outline and macro intentions';
COMMENT ON COLUMN series.series_outline_status IS 'Overall series outline status: outlining, drafting, or complete';

COMMENT ON COLUMN issues.outline_notes IS 'Issue-level outline notes and intentions';
COMMENT ON COLUMN issues.outline_status IS 'Outline completeness: incomplete, rough, solid, locked';

COMMENT ON COLUMN acts.intention IS 'What this act needs to accomplish in the story';
COMMENT ON COLUMN acts.outline_notes IS 'Working notes about this act structure';

COMMENT ON COLUMN scenes.intention IS 'What this scene needs to accomplish';
COMMENT ON COLUMN scenes.outline_notes IS 'Working notes for scene development';

COMMENT ON COLUMN pages.page_summary IS 'One-line summary of what happens on this page';
COMMENT ON COLUMN pages.intention IS 'What needs to happen on this page';
COMMENT ON COLUMN pages.outline_notes IS 'Working notes for page development';
