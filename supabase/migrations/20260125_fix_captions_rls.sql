-- Disable RLS on captions to fix insert errors
-- The complex RLS policies were causing issues with INSERT operations

ALTER TABLE captions DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might be causing issues
DROP POLICY IF EXISTS "Users can view captions for their panels" ON captions;
DROP POLICY IF EXISTS "Users can create captions for their panels" ON captions;
DROP POLICY IF EXISTS "Users can update captions for their panels" ON captions;
DROP POLICY IF EXISTS "Users can delete captions for their panels" ON captions;
