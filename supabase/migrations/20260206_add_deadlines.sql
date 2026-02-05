-- =====================================================
-- DEADLINE DASHBOARD FEATURE
-- Add deadline tracking to issues for production management
-- =====================================================

-- Add deadline-related fields to issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS target_page_count INTEGER;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS production_status TEXT DEFAULT 'not_started'
  CHECK (production_status IN ('not_started', 'outlining', 'drafting', 'revising', 'complete'));

-- Create index for deadline queries
CREATE INDEX IF NOT EXISTS idx_issues_deadline ON issues(deadline) WHERE deadline IS NOT NULL;

-- Comment the new columns
COMMENT ON COLUMN issues.deadline IS 'Target completion date for this issue';
COMMENT ON COLUMN issues.target_page_count IS 'Target number of pages for this issue (default is typically 22)';
COMMENT ON COLUMN issues.production_status IS 'Current production phase: not_started, outlining, drafting, revising, complete';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
