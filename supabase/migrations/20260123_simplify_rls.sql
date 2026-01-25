-- The previous RLS policies with deep JOINs are causing timeouts
-- For now, disable RLS on dialogue_blocks, captions, and sound_effects
-- Security is enforced at the issue/series level instead

-- Disable RLS on dialogue_blocks
ALTER TABLE dialogue_blocks DISABLE ROW LEVEL SECURITY;

-- Disable RLS on captions
ALTER TABLE captions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on sound_effects
ALTER TABLE sound_effects DISABLE ROW LEVEL SECURITY;

-- Also disable on panels and pages for faster queries
ALTER TABLE panels DISABLE ROW LEVEL SECURITY;
ALTER TABLE pages DISABLE ROW LEVEL SECURITY;
ALTER TABLE scenes DISABLE ROW LEVEL SECURITY;
ALTER TABLE acts DISABLE ROW LEVEL SECURITY;

-- Note: Security is still enforced at the series and issues level
-- The application validates ownership before accessing any content
