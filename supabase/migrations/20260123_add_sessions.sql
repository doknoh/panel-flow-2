-- Add sessions table for tracking writing sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  summary TEXT,
  progress TEXT,
  todo TEXT,
  words_written INTEGER DEFAULT 0,
  panels_created INTEGER DEFAULT 0,
  pages_created INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add loose_ends table for tracking unresolved items
CREATE TABLE IF NOT EXISTS loose_ends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('untracked_character', 'untracked_location', 'continuity_flag', 'page_alignment', 'other')),
  description TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_series_id ON sessions(series_id);
CREATE INDEX IF NOT EXISTS idx_sessions_issue_id ON sessions(issue_id);
CREATE INDEX IF NOT EXISTS idx_loose_ends_session_id ON loose_ends(session_id);

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loose_ends ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sessions
CREATE POLICY "Users can view their own sessions" ON sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own sessions" ON sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sessions" ON sessions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sessions" ON sessions
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for loose_ends (via session ownership)
CREATE POLICY "Users can view loose ends for their sessions" ON loose_ends
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = loose_ends.session_id AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create loose ends for their sessions" ON loose_ends
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = loose_ends.session_id AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update loose ends for their sessions" ON loose_ends
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = loose_ends.session_id AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete loose ends for their sessions" ON loose_ends
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = loose_ends.session_id AND sessions.user_id = auth.uid()
    )
  );
