-- =====================================================
-- FIX: Collaboration RLS policy cannot query auth.users
-- =====================================================
-- The original "Owner can view invitations" policy tried to query
-- auth.users which regular users cannot access directly.
-- Fix: Use auth.email() function instead which returns the current
-- user's email from the JWT token.
-- =====================================================

DROP POLICY IF EXISTS "Owner can view invitations" ON collaboration_invitations;

CREATE POLICY "Owner can view invitations"
  ON collaboration_invitations FOR SELECT
  USING (
    user_owns_series(series_id)
    OR email = auth.email()
  );
