 -- Disable RLS on characters table to allow imports
  ALTER TABLE characters DISABLE ROW LEVEL SECURITY;

  -- Also disable on locations for consistency
  ALTER TABLE locations DISABLE ROW LEVEL SECURITY;