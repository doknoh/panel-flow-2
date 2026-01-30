-- Fix helper functions for RLS policies
-- Ensure search_path is set correctly to find tables

-- Recreate user_owns_series with proper search_path
CREATE OR REPLACE FUNCTION user_owns_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.series WHERE id = p_series_id AND user_id = auth.uid()
  );
$$;

-- Recreate user_owns_issue with proper search_path
CREATE OR REPLACE FUNCTION user_owns_issue(p_issue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.issues i
    JOIN public.series s ON s.id = i.series_id
    WHERE i.id = p_issue_id AND s.user_id = auth.uid()
  );
$$;

-- Recreate user_owns_act with proper search_path
CREATE OR REPLACE FUNCTION user_owns_act(p_act_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acts a
    JOIN public.issues i ON i.id = a.issue_id
    JOIN public.series s ON s.id = i.series_id
    WHERE a.id = p_act_id AND s.user_id = auth.uid()
  );
$$;

-- Recreate user_owns_scene with proper search_path
CREATE OR REPLACE FUNCTION user_owns_scene(p_scene_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scenes sc
    JOIN public.acts a ON a.id = sc.act_id
    JOIN public.issues i ON i.id = a.issue_id
    JOIN public.series s ON s.id = i.series_id
    WHERE sc.id = p_scene_id AND s.user_id = auth.uid()
  );
$$;

-- Recreate user_owns_page with proper search_path
CREATE OR REPLACE FUNCTION user_owns_page(p_page_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pages p
    JOIN public.scenes sc ON sc.id = p.scene_id
    JOIN public.acts a ON a.id = sc.act_id
    JOIN public.issues i ON i.id = a.issue_id
    JOIN public.series s ON s.id = i.series_id
    WHERE p.id = p_page_id AND s.user_id = auth.uid()
  );
$$;

-- Recreate user_owns_panel with proper search_path
CREATE OR REPLACE FUNCTION user_owns_panel(p_panel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.panels pn
    JOIN public.pages p ON p.id = pn.page_id
    JOIN public.scenes sc ON sc.id = p.scene_id
    JOIN public.acts a ON a.id = sc.act_id
    JOIN public.issues i ON i.id = a.issue_id
    JOIN public.series s ON s.id = i.series_id
    WHERE pn.id = p_panel_id AND s.user_id = auth.uid()
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION user_owns_series TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_issue TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_act TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_scene TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_page TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_panel TO authenticated;
