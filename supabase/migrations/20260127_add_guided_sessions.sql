-- Guided Sessions: AI-driven Socratic writing sessions
-- These persist conversation state and allow pause/resume

CREATE TABLE IF NOT EXISTS guided_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context: which level was this started from?
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,

  -- Session metadata
  title TEXT, -- Auto-generated or user-named
  session_type TEXT NOT NULL DEFAULT 'general', -- 'outline', 'character_deep_dive', 'scene_breakdown', 'world_building', 'general'
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),

  -- Progress tracking
  focus_area TEXT, -- Current topic being explored: 'theme', 'character_arc', 'act_structure', etc.
  completion_areas TEXT[], -- Array of areas already covered

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual messages in a guided session
CREATE TABLE IF NOT EXISTS guided_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES guided_sessions(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
  content TEXT NOT NULL,

  -- Metadata about what was extracted/saved from this message
  extracted_data JSONB, -- e.g., { "type": "character", "id": "uuid", "fields": {"name": "...", "motivation": "..."} }

  -- For assistant messages: what prompt/context was used
  context_snapshot JSONB, -- Snapshot of relevant data at time of generation

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Writer insights: patterns learned about this user's creative process
CREATE TABLE IF NOT EXISTS writer_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  insight_type TEXT NOT NULL, -- 'preference', 'strength', 'pattern', 'trigger'
  category TEXT, -- 'dialogue', 'visual_storytelling', 'character_development', 'pacing', etc.
  description TEXT NOT NULL,
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),

  -- Evidence: which sessions/messages led to this insight
  evidence_session_ids UUID[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guided_sessions_user_id ON guided_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_guided_sessions_series_id ON guided_sessions(series_id);
CREATE INDEX IF NOT EXISTS idx_guided_sessions_issue_id ON guided_sessions(issue_id);
CREATE INDEX IF NOT EXISTS idx_guided_sessions_status ON guided_sessions(status);
CREATE INDEX IF NOT EXISTS idx_guided_messages_session_id ON guided_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_guided_messages_created_at ON guided_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_writer_insights_user_id ON writer_insights(user_id);

-- Enable RLS
ALTER TABLE guided_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guided_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE writer_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for guided_sessions
CREATE POLICY "Users can view their own guided sessions" ON guided_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own guided sessions" ON guided_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own guided sessions" ON guided_sessions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own guided sessions" ON guided_sessions
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for guided_messages (via session ownership)
CREATE POLICY "Users can view messages for their sessions" ON guided_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM guided_sessions
      WHERE guided_sessions.id = guided_messages.session_id
      AND guided_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages for their sessions" ON guided_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM guided_sessions
      WHERE guided_sessions.id = guided_messages.session_id
      AND guided_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages for their sessions" ON guided_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM guided_sessions
      WHERE guided_sessions.id = guided_messages.session_id
      AND guided_sessions.user_id = auth.uid()
    )
  );

-- RLS Policies for writer_insights
CREATE POLICY "Users can view their own insights" ON writer_insights
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own insights" ON writer_insights
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own insights" ON writer_insights
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own insights" ON writer_insights
  FOR DELETE USING (user_id = auth.uid());

-- Update triggers
CREATE OR REPLACE FUNCTION update_guided_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_active_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guided_sessions_updated_at
  BEFORE UPDATE ON guided_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_guided_sessions_updated_at();

CREATE OR REPLACE FUNCTION update_writer_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER writer_insights_updated_at
  BEFORE UPDATE ON writer_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_writer_insights_updated_at();
