-- Create allowed_users table for user approval system
CREATE TABLE IF NOT EXISTS allowed_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Add your email as the first allowed user (admin)
-- Replace with your actual email
INSERT INTO allowed_users (email, name, notes)
VALUES ('doknoh@gmail.com', 'Noah Callahan-Bever', 'Admin')
ON CONFLICT (email) DO NOTHING;

-- RLS policies - only authenticated users can read (to check their own access)
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can check if an email is allowed
CREATE POLICY "Users can check allowed emails" ON allowed_users
  FOR SELECT USING (true);

-- Only the admin (first user) can insert/update/delete
-- You may want to adjust this based on your needs
CREATE POLICY "Admin can manage allowed users" ON allowed_users
  FOR ALL USING (
    auth.uid() IN (
      SELECT au.id FROM auth.users au
      JOIN allowed_users al ON au.email = al.email
      WHERE al.notes = 'Admin'
    )
  );
