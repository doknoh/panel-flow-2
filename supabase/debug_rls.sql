-- RLS Diagnostic Script
-- Run this in Supabase SQL Editor to check RLS status

-- 1. Check which tables have RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. List all RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual::text as using_expression,
  with_check::text as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Check if helper functions exist and their definitions
SELECT
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'user_owns_%';

-- 4. Test a specific user's access (replace with actual user ID)
-- First, get your user ID from auth.users:
SELECT id, email FROM auth.users WHERE email = 'doknoh@gmail.com';

-- 5. Check if the user owns any series
SELECT id, title, user_id FROM series WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'doknoh@gmail.com'
);

-- 6. Check issues for those series
SELECT i.id, i.title, i.series_id, s.user_id
FROM issues i
JOIN series s ON s.id = i.series_id
WHERE s.user_id = (
  SELECT id FROM auth.users WHERE email = 'doknoh@gmail.com'
);

-- 7. Test the user_owns_series function directly (replace UUID with actual series_id)
-- You'll need to run this AS the authenticated user, which isn't possible in SQL editor
-- But you can check if the function exists:
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'user_owns_series';
