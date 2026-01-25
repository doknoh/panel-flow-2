-- Restore RLS with efficient security definer functions
-- The previous approach used deep JOINs that caused timeouts and INSERT failures
-- This approach uses cached helper functions for ownership checks

-- Helper function to check if user owns a series
CREATE OR REPLACE FUNCTION user_owns_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM series WHERE id = p_series_id AND user_id = auth.uid()
  );
$$;

-- Helper function to check if user owns an issue (via series)
CREATE OR REPLACE FUNCTION user_owns_issue(p_issue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM issues i
    JOIN series s ON s.id = i.series_id
    WHERE i.id = p_issue_id AND s.user_id = auth.uid()
  );
$$;

-- Helper function to check if user owns an act (via issue -> series)
CREATE OR REPLACE FUNCTION user_owns_act(p_act_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM acts a
    JOIN issues i ON i.id = a.issue_id
    JOIN series s ON s.id = i.series_id
    WHERE a.id = p_act_id AND s.user_id = auth.uid()
  );
$$;

-- Helper function to check if user owns a scene (via act -> issue -> series)
CREATE OR REPLACE FUNCTION user_owns_scene(p_scene_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM scenes sc
    JOIN acts a ON a.id = sc.act_id
    JOIN issues i ON i.id = a.issue_id
    JOIN series s ON s.id = i.series_id
    WHERE sc.id = p_scene_id AND s.user_id = auth.uid()
  );
$$;

-- Helper function to check if user owns a page (via scene -> act -> issue -> series)
CREATE OR REPLACE FUNCTION user_owns_page(p_page_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pages p
    JOIN scenes sc ON sc.id = p.scene_id
    JOIN acts a ON a.id = sc.act_id
    JOIN issues i ON i.id = a.issue_id
    JOIN series s ON s.id = i.series_id
    WHERE p.id = p_page_id AND s.user_id = auth.uid()
  );
$$;

-- Helper function to check if user owns a panel (via page -> scene -> act -> issue -> series)
CREATE OR REPLACE FUNCTION user_owns_panel(p_panel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM panels pn
    JOIN pages p ON p.id = pn.page_id
    JOIN scenes sc ON sc.id = p.scene_id
    JOIN acts a ON a.id = sc.act_id
    JOIN issues i ON i.id = a.issue_id
    JOIN series s ON s.id = i.series_id
    WHERE pn.id = p_panel_id AND s.user_id = auth.uid()
  );
$$;

-- =====================================================
-- Re-enable RLS on all tables and create proper policies
-- =====================================================

-- ACTS
ALTER TABLE acts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acts_select" ON acts;
DROP POLICY IF EXISTS "acts_insert" ON acts;
DROP POLICY IF EXISTS "acts_update" ON acts;
DROP POLICY IF EXISTS "acts_delete" ON acts;

CREATE POLICY "acts_select" ON acts FOR SELECT USING (user_owns_issue(issue_id));
CREATE POLICY "acts_insert" ON acts FOR INSERT WITH CHECK (user_owns_issue(issue_id));
CREATE POLICY "acts_update" ON acts FOR UPDATE USING (user_owns_issue(issue_id));
CREATE POLICY "acts_delete" ON acts FOR DELETE USING (user_owns_issue(issue_id));

-- SCENES
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scenes_select" ON scenes;
DROP POLICY IF EXISTS "scenes_insert" ON scenes;
DROP POLICY IF EXISTS "scenes_update" ON scenes;
DROP POLICY IF EXISTS "scenes_delete" ON scenes;

CREATE POLICY "scenes_select" ON scenes FOR SELECT USING (user_owns_act(act_id));
CREATE POLICY "scenes_insert" ON scenes FOR INSERT WITH CHECK (user_owns_act(act_id));
CREATE POLICY "scenes_update" ON scenes FOR UPDATE USING (user_owns_act(act_id));
CREATE POLICY "scenes_delete" ON scenes FOR DELETE USING (user_owns_act(act_id));

-- PAGES
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pages_select" ON pages;
DROP POLICY IF EXISTS "pages_insert" ON pages;
DROP POLICY IF EXISTS "pages_update" ON pages;
DROP POLICY IF EXISTS "pages_delete" ON pages;

CREATE POLICY "pages_select" ON pages FOR SELECT USING (user_owns_scene(scene_id));
CREATE POLICY "pages_insert" ON pages FOR INSERT WITH CHECK (user_owns_scene(scene_id));
CREATE POLICY "pages_update" ON pages FOR UPDATE USING (user_owns_scene(scene_id));
CREATE POLICY "pages_delete" ON pages FOR DELETE USING (user_owns_scene(scene_id));

-- PANELS
ALTER TABLE panels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "panels_select" ON panels;
DROP POLICY IF EXISTS "panels_insert" ON panels;
DROP POLICY IF EXISTS "panels_update" ON panels;
DROP POLICY IF EXISTS "panels_delete" ON panels;

CREATE POLICY "panels_select" ON panels FOR SELECT USING (user_owns_page(page_id));
CREATE POLICY "panels_insert" ON panels FOR INSERT WITH CHECK (user_owns_page(page_id));
CREATE POLICY "panels_update" ON panels FOR UPDATE USING (user_owns_page(page_id));
CREATE POLICY "panels_delete" ON panels FOR DELETE USING (user_owns_page(page_id));

-- DIALOGUE_BLOCKS
ALTER TABLE dialogue_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dialogue_blocks_select" ON dialogue_blocks;
DROP POLICY IF EXISTS "dialogue_blocks_insert" ON dialogue_blocks;
DROP POLICY IF EXISTS "dialogue_blocks_update" ON dialogue_blocks;
DROP POLICY IF EXISTS "dialogue_blocks_delete" ON dialogue_blocks;

CREATE POLICY "dialogue_blocks_select" ON dialogue_blocks FOR SELECT USING (user_owns_panel(panel_id));
CREATE POLICY "dialogue_blocks_insert" ON dialogue_blocks FOR INSERT WITH CHECK (user_owns_panel(panel_id));
CREATE POLICY "dialogue_blocks_update" ON dialogue_blocks FOR UPDATE USING (user_owns_panel(panel_id));
CREATE POLICY "dialogue_blocks_delete" ON dialogue_blocks FOR DELETE USING (user_owns_panel(panel_id));

-- CAPTIONS
ALTER TABLE captions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "captions_select" ON captions;
DROP POLICY IF EXISTS "captions_insert" ON captions;
DROP POLICY IF EXISTS "captions_update" ON captions;
DROP POLICY IF EXISTS "captions_delete" ON captions;

CREATE POLICY "captions_select" ON captions FOR SELECT USING (user_owns_panel(panel_id));
CREATE POLICY "captions_insert" ON captions FOR INSERT WITH CHECK (user_owns_panel(panel_id));
CREATE POLICY "captions_update" ON captions FOR UPDATE USING (user_owns_panel(panel_id));
CREATE POLICY "captions_delete" ON captions FOR DELETE USING (user_owns_panel(panel_id));

-- SOUND_EFFECTS
ALTER TABLE sound_effects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sound_effects_select" ON sound_effects;
DROP POLICY IF EXISTS "sound_effects_insert" ON sound_effects;
DROP POLICY IF EXISTS "sound_effects_update" ON sound_effects;
DROP POLICY IF EXISTS "sound_effects_delete" ON sound_effects;

CREATE POLICY "sound_effects_select" ON sound_effects FOR SELECT USING (user_owns_panel(panel_id));
CREATE POLICY "sound_effects_insert" ON sound_effects FOR INSERT WITH CHECK (user_owns_panel(panel_id));
CREATE POLICY "sound_effects_update" ON sound_effects FOR UPDATE USING (user_owns_panel(panel_id));
CREATE POLICY "sound_effects_delete" ON sound_effects FOR DELETE USING (user_owns_panel(panel_id));

-- CHARACTERS (linked to series)
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "characters_select" ON characters;
DROP POLICY IF EXISTS "characters_insert" ON characters;
DROP POLICY IF EXISTS "characters_update" ON characters;
DROP POLICY IF EXISTS "characters_delete" ON characters;

CREATE POLICY "characters_select" ON characters FOR SELECT USING (user_owns_series(series_id));
CREATE POLICY "characters_insert" ON characters FOR INSERT WITH CHECK (user_owns_series(series_id));
CREATE POLICY "characters_update" ON characters FOR UPDATE USING (user_owns_series(series_id));
CREATE POLICY "characters_delete" ON characters FOR DELETE USING (user_owns_series(series_id));

-- LOCATIONS (linked to series)
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "locations_select" ON locations;
DROP POLICY IF EXISTS "locations_insert" ON locations;
DROP POLICY IF EXISTS "locations_update" ON locations;
DROP POLICY IF EXISTS "locations_delete" ON locations;

CREATE POLICY "locations_select" ON locations FOR SELECT USING (user_owns_series(series_id));
CREATE POLICY "locations_insert" ON locations FOR INSERT WITH CHECK (user_owns_series(series_id));
CREATE POLICY "locations_update" ON locations FOR UPDATE USING (user_owns_series(series_id));
CREATE POLICY "locations_delete" ON locations FOR DELETE USING (user_owns_series(series_id));

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION user_owns_series TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_issue TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_act TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_scene TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_page TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_panel TO authenticated;
