-- =====================================================
-- ARTIST COLLABORATION FEATURE
-- Day 6: The final Tier 1 critical feature
-- =====================================================
-- This migration adds:
-- 1. series_collaborators - who has access to what series
-- 2. collaboration_invitations - invite workflow via email
-- 3. comments - page/panel-level feedback threads
-- 4. Updated RLS helper functions for collaborative access
-- =====================================================

-- =====================================================
-- 1. COLLABORATORS TABLE
-- =====================================================
CREATE TABLE series_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'commenter', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate collaborators
  UNIQUE(series_id, user_id)
);

-- Index for fast lookups
CREATE INDEX idx_collaborators_series ON series_collaborators(series_id);
CREATE INDEX idx_collaborators_user ON series_collaborators(user_id);
CREATE INDEX idx_collaborators_role ON series_collaborators(role);

-- Update timestamp trigger
CREATE TRIGGER update_collaborators_timestamp
  BEFORE UPDATE ON series_collaborators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE series_collaborators IS 'Tracks which users have collaborative access to a series';
COMMENT ON COLUMN series_collaborators.role IS 'editor=full edit, commenter=view+comment, viewer=read-only';

-- =====================================================
-- 2. COLLABORATION INVITATIONS TABLE
-- =====================================================
CREATE TABLE collaboration_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'commenter', 'viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate pending invitations
  UNIQUE(series_id, email)
);

-- Index for token lookup (invitation acceptance)
CREATE INDEX idx_invitations_token ON collaboration_invitations(token);
CREATE INDEX idx_invitations_email ON collaboration_invitations(email);
CREATE INDEX idx_invitations_series ON collaboration_invitations(series_id);

COMMENT ON TABLE collaboration_invitations IS 'Pending invitations for users who may not have accounts yet';

-- =====================================================
-- 3. COMMENTS TABLE (for page/panel feedback)
-- =====================================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic: can attach to page OR panel
  entity_type TEXT NOT NULL CHECK (entity_type IN ('page', 'panel')),
  entity_id UUID NOT NULL,

  -- Comment data
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,

  -- Threading support
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,

  -- Resolution status for feedback
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_unresolved ON comments(entity_type, entity_id) WHERE resolved_at IS NULL;

-- Update timestamp trigger
CREATE TRIGGER update_comments_timestamp
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE comments IS 'Feedback comments on pages and panels';
COMMENT ON COLUMN comments.entity_type IS 'Type of entity this comment is attached to';
COMMENT ON COLUMN comments.parent_id IS 'For threaded replies - references parent comment';

-- =====================================================
-- 4. UPDATED RLS HELPER FUNCTIONS
-- =====================================================

-- Check if user can VIEW a series (owner OR any collaborator)
CREATE OR REPLACE FUNCTION user_can_view_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM series WHERE id = p_series_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM series_collaborators
    WHERE series_id = p_series_id
    AND user_id = auth.uid()
    AND accepted_at IS NOT NULL
  );
$$;

-- Check if user can EDIT a series (owner OR editor collaborator)
CREATE OR REPLACE FUNCTION user_can_edit_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM series WHERE id = p_series_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM series_collaborators
    WHERE series_id = p_series_id
    AND user_id = auth.uid()
    AND role = 'editor'
    AND accepted_at IS NOT NULL
  );
$$;

-- Check if user can COMMENT on a series (owner OR editor/commenter)
CREATE OR REPLACE FUNCTION user_can_comment_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM series WHERE id = p_series_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM series_collaborators
    WHERE series_id = p_series_id
    AND user_id = auth.uid()
    AND role IN ('editor', 'commenter')
    AND accepted_at IS NOT NULL
  );
$$;

-- Check if user OWNS a series (not collaborator)
CREATE OR REPLACE FUNCTION user_owns_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM series WHERE id = p_series_id AND user_id = auth.uid()
  );
$$;

-- Helper to get series_id from an issue
CREATE OR REPLACE FUNCTION get_series_from_issue(p_issue_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT series_id FROM issues WHERE id = p_issue_id;
$$;

-- Helper to get series_id from a page (via scene → act → issue)
CREATE OR REPLACE FUNCTION get_series_from_page(p_page_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT i.series_id
  FROM pages p
  JOIN scenes s ON p.scene_id = s.id
  JOIN acts a ON s.act_id = a.id
  JOIN issues i ON a.issue_id = i.id
  WHERE p.id = p_page_id;
$$;

-- Helper to get series_id from a panel
CREATE OR REPLACE FUNCTION get_series_from_panel(p_panel_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT i.series_id
  FROM panels pn
  JOIN pages p ON pn.page_id = p.id
  JOIN scenes s ON p.scene_id = s.id
  JOIN acts a ON s.act_id = a.id
  JOIN issues i ON a.issue_id = i.id
  WHERE pn.id = p_panel_id;
$$;

-- =====================================================
-- 5. RLS POLICIES FOR NEW TABLES
-- =====================================================

-- Enable RLS
ALTER TABLE series_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- SERIES_COLLABORATORS policies
-- Only series owner can manage collaborators
CREATE POLICY "Owner can view collaborators"
  ON series_collaborators FOR SELECT
  USING (user_owns_series(series_id) OR user_id = auth.uid());

CREATE POLICY "Owner can add collaborators"
  ON series_collaborators FOR INSERT
  WITH CHECK (user_owns_series(series_id));

CREATE POLICY "Owner can update collaborators"
  ON series_collaborators FOR UPDATE
  USING (user_owns_series(series_id));

CREATE POLICY "Owner can remove collaborators"
  ON series_collaborators FOR DELETE
  USING (user_owns_series(series_id) OR user_id = auth.uid());

-- COLLABORATION_INVITATIONS policies
CREATE POLICY "Owner can view invitations"
  ON collaboration_invitations FOR SELECT
  USING (user_owns_series(series_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Owner can create invitations"
  ON collaboration_invitations FOR INSERT
  WITH CHECK (user_owns_series(series_id));

CREATE POLICY "Owner can update invitations"
  ON collaboration_invitations FOR UPDATE
  USING (user_owns_series(series_id));

CREATE POLICY "Owner can delete invitations"
  ON collaboration_invitations FOR DELETE
  USING (user_owns_series(series_id));

-- COMMENTS policies
-- Anyone with view access can see comments
CREATE POLICY "Collaborators can view comments"
  ON comments FOR SELECT
  USING (
    CASE
      WHEN entity_type = 'page' THEN user_can_view_series(get_series_from_page(entity_id))
      WHEN entity_type = 'panel' THEN user_can_view_series(get_series_from_panel(entity_id))
      ELSE FALSE
    END
  );

-- Anyone with comment access can create comments
CREATE POLICY "Commenters can add comments"
  ON comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    CASE
      WHEN entity_type = 'page' THEN user_can_comment_series(get_series_from_page(entity_id))
      WHEN entity_type = 'panel' THEN user_can_comment_series(get_series_from_panel(entity_id))
      ELSE FALSE
    END
  );

-- Users can edit their own comments
CREATE POLICY "Users can edit own comments"
  ON comments FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own comments, owners can delete any
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (
    user_id = auth.uid() OR
    CASE
      WHEN entity_type = 'page' THEN user_owns_series(get_series_from_page(entity_id))
      WHEN entity_type = 'panel' THEN user_owns_series(get_series_from_panel(entity_id))
      ELSE FALSE
    END
  );

-- =====================================================
-- 6. UPDATE EXISTING RLS POLICIES TO USE NEW FUNCTIONS
-- =====================================================

-- Drop and recreate series policies to include collaborators
DROP POLICY IF EXISTS "Users can view own series" ON series;
DROP POLICY IF EXISTS "Users can update own series" ON series;

CREATE POLICY "Users can view accessible series"
  ON series FOR SELECT
  USING (user_can_view_series(id));

CREATE POLICY "Users can update own series"
  ON series FOR UPDATE
  USING (user_can_edit_series(id));

-- Update issues policies
DROP POLICY IF EXISTS "Users can view issues" ON issues;
DROP POLICY IF EXISTS "Users can insert issues" ON issues;
DROP POLICY IF EXISTS "Users can update issues" ON issues;
DROP POLICY IF EXISTS "Users can delete issues" ON issues;

CREATE POLICY "Users can view issues"
  ON issues FOR SELECT
  USING (user_can_view_series(series_id));

CREATE POLICY "Users can insert issues"
  ON issues FOR INSERT
  WITH CHECK (user_can_edit_series(series_id));

CREATE POLICY "Users can update issues"
  ON issues FOR UPDATE
  USING (user_can_edit_series(series_id));

CREATE POLICY "Users can delete issues"
  ON issues FOR DELETE
  USING (user_owns_series(series_id));

-- Update characters policies
DROP POLICY IF EXISTS "Users can view characters" ON characters;
DROP POLICY IF EXISTS "Users can insert characters" ON characters;
DROP POLICY IF EXISTS "Users can update characters" ON characters;
DROP POLICY IF EXISTS "Users can delete characters" ON characters;

CREATE POLICY "Users can view characters"
  ON characters FOR SELECT
  USING (user_can_view_series(series_id));

CREATE POLICY "Users can insert characters"
  ON characters FOR INSERT
  WITH CHECK (user_can_edit_series(series_id));

CREATE POLICY "Users can update characters"
  ON characters FOR UPDATE
  USING (user_can_edit_series(series_id));

CREATE POLICY "Users can delete characters"
  ON characters FOR DELETE
  USING (user_can_edit_series(series_id));

-- Update locations policies
DROP POLICY IF EXISTS "Users can view locations" ON locations;
DROP POLICY IF EXISTS "Users can insert locations" ON locations;
DROP POLICY IF EXISTS "Users can update locations" ON locations;
DROP POLICY IF EXISTS "Users can delete locations" ON locations;

CREATE POLICY "Users can view locations"
  ON locations FOR SELECT
  USING (user_can_view_series(series_id));

CREATE POLICY "Users can insert locations"
  ON locations FOR INSERT
  WITH CHECK (user_can_edit_series(series_id));

CREATE POLICY "Users can update locations"
  ON locations FOR UPDATE
  USING (user_can_edit_series(series_id));

CREATE POLICY "Users can delete locations"
  ON locations FOR DELETE
  USING (user_can_edit_series(series_id));

-- Update plotlines policies
DROP POLICY IF EXISTS "Users can view plotlines" ON plotlines;
DROP POLICY IF EXISTS "Users can insert plotlines" ON plotlines;
DROP POLICY IF EXISTS "Users can update plotlines" ON plotlines;
DROP POLICY IF EXISTS "Users can delete plotlines" ON plotlines;

CREATE POLICY "Users can view plotlines"
  ON plotlines FOR SELECT
  USING (user_can_view_series(series_id));

CREATE POLICY "Users can insert plotlines"
  ON plotlines FOR INSERT
  WITH CHECK (user_can_edit_series(series_id));

CREATE POLICY "Users can update plotlines"
  ON plotlines FOR UPDATE
  USING (user_can_edit_series(series_id));

CREATE POLICY "Users can delete plotlines"
  ON plotlines FOR DELETE
  USING (user_can_edit_series(series_id));

-- =====================================================
-- 7. NOTIFICATION PREFERENCES (optional enhancement)
-- =====================================================
CREATE TABLE collaboration_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,

  -- Notification preferences
  notify_comments BOOLEAN DEFAULT TRUE,
  notify_edits BOOLEAN DEFAULT FALSE,
  notify_daily_digest BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, series_id)
);

ALTER TABLE collaboration_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notification prefs"
  ON collaboration_notifications FOR ALL
  USING (user_id = auth.uid());

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Tables created:
--   - series_collaborators (who has access)
--   - collaboration_invitations (pending invites)
--   - comments (page/panel feedback)
--   - collaboration_notifications (notification prefs)
--
-- Functions created/updated:
--   - user_can_view_series()
--   - user_can_edit_series()
--   - user_can_comment_series()
--   - user_owns_series()
--   - get_series_from_issue()
--   - get_series_from_page()
--   - get_series_from_panel()
--
-- RLS policies updated for collaborative access on:
--   - series, issues, characters, locations, plotlines
-- =====================================================
