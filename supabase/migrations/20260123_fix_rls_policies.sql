-- Ensure RLS is enabled and proper policies exist for dialogue_blocks and captions
-- These tables may not have had RLS policies set up initially

-- Enable RLS on dialogue_blocks if not already enabled
ALTER TABLE dialogue_blocks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to recreate them)
DROP POLICY IF EXISTS "Users can view dialogue_blocks for their panels" ON dialogue_blocks;
DROP POLICY IF EXISTS "Users can create dialogue_blocks for their panels" ON dialogue_blocks;
DROP POLICY IF EXISTS "Users can update dialogue_blocks for their panels" ON dialogue_blocks;
DROP POLICY IF EXISTS "Users can delete dialogue_blocks for their panels" ON dialogue_blocks;

-- Create RLS policies for dialogue_blocks
CREATE POLICY "Users can view dialogue_blocks for their panels" ON dialogue_blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = dialogue_blocks.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create dialogue_blocks for their panels" ON dialogue_blocks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = dialogue_blocks.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update dialogue_blocks for their panels" ON dialogue_blocks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = dialogue_blocks.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete dialogue_blocks for their panels" ON dialogue_blocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = dialogue_blocks.panel_id AND series.user_id = auth.uid()
    )
  );

-- Enable RLS on captions if not already enabled
ALTER TABLE captions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view captions for their panels" ON captions;
DROP POLICY IF EXISTS "Users can create captions for their panels" ON captions;
DROP POLICY IF EXISTS "Users can update captions for their panels" ON captions;
DROP POLICY IF EXISTS "Users can delete captions for their panels" ON captions;

-- Create RLS policies for captions
CREATE POLICY "Users can view captions for their panels" ON captions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = captions.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create captions for their panels" ON captions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = captions.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update captions for their panels" ON captions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = captions.panel_id AND series.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete captions for their panels" ON captions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM panels
      JOIN pages ON pages.id = panels.page_id
      JOIN scenes ON scenes.id = pages.scene_id
      JOIN acts ON acts.id = scenes.act_id
      JOIN issues ON issues.id = acts.issue_id
      JOIN series ON series.id = issues.series_id
      WHERE panels.id = captions.panel_id AND series.user_id = auth.uid()
    )
  );
