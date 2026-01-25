-- Performance indexes for frequently queried columns
-- These optimize the most common query patterns in the application

-- Series: queried by user_id for dashboard
CREATE INDEX IF NOT EXISTS idx_series_user_id ON series(user_id);

-- Issues: queried by series_id, often ordered by number
CREATE INDEX IF NOT EXISTS idx_issues_series_id ON issues(series_id);
CREATE INDEX IF NOT EXISTS idx_issues_series_number ON issues(series_id, number);

-- Acts: queried by issue_id, ordered by sort_order for navigation
CREATE INDEX IF NOT EXISTS idx_acts_issue_id ON acts(issue_id);
CREATE INDEX IF NOT EXISTS idx_acts_issue_sort ON acts(issue_id, sort_order);

-- Scenes: queried by act_id, ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_scenes_act_id ON scenes(act_id);
CREATE INDEX IF NOT EXISTS idx_scenes_act_sort ON scenes(act_id, sort_order);
-- Also indexed by plotline for weave view
CREATE INDEX IF NOT EXISTS idx_scenes_plotline ON scenes(plotline_id);

-- Pages: queried by scene_id (for editor) and issue_id (for bulk operations)
CREATE INDEX IF NOT EXISTS idx_pages_scene_id ON pages(scene_id);
CREATE INDEX IF NOT EXISTS idx_pages_scene_sort ON pages(scene_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pages_issue_id ON pages(issue_id);

-- Panels: queried by page_id, ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_panels_page_id ON panels(page_id);
CREATE INDEX IF NOT EXISTS idx_panels_page_sort ON panels(page_id, sort_order);

-- Dialogue blocks: queried by panel_id, ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_dialogue_panel_id ON dialogue_blocks(panel_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_panel_sort ON dialogue_blocks(panel_id, sort_order);
-- Character ID already indexed in 20260124_add_character_id_to_dialogue.sql

-- Captions: queried by panel_id, ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_captions_panel_id ON captions(panel_id);
CREATE INDEX IF NOT EXISTS idx_captions_panel_sort ON captions(panel_id, sort_order);

-- Characters: queried by series_id for dropdowns
CREATE INDEX IF NOT EXISTS idx_characters_series_id ON characters(series_id);
-- Name index for search/autocomplete
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(series_id, name);

-- Locations: queried by series_id for dropdowns
CREATE INDEX IF NOT EXISTS idx_locations_series_id ON locations(series_id);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(series_id, name);

-- Composite indexes for common JOINs through the hierarchy
-- This helps with queries that traverse: issue -> acts -> scenes -> pages -> panels
CREATE INDEX IF NOT EXISTS idx_acts_for_issue_query ON acts(issue_id, id);
CREATE INDEX IF NOT EXISTS idx_scenes_for_act_query ON scenes(act_id, id);
CREATE INDEX IF NOT EXISTS idx_pages_for_scene_query ON pages(scene_id, id);
CREATE INDEX IF NOT EXISTS idx_panels_for_page_query ON panels(page_id, id);
