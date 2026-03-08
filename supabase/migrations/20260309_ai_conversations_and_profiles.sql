-- AI Conversations, Writer Profiles, Personality Presets, and Panel Notes
-- Ported from Deirdre's World Builder patterns for Panel Flow

-- ============================================
-- AI CONVERSATIONS
-- Persistent conversation records with tool tracking
-- ============================================

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,

  -- Conversation data
  messages JSONB NOT NULL DEFAULT '[]',
  -- Format: [{role, content, timestamp, toolProposals?: [{toolUseId, name, input, status}]}]

  tool_outcomes JSONB NOT NULL DEFAULT '[]',
  -- Format: [{toolName, accepted, entityType, entityId, timestamp}]

  synthesized_summary TEXT,
  -- AI-generated abstract of conversation for future context

  mode TEXT NOT NULL DEFAULT 'ask' CHECK (mode IN ('ask', 'guide')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_series ON ai_conversations(series_id);
CREATE INDEX idx_ai_conversations_issue ON ai_conversations(issue_id);
CREATE INDEX idx_ai_conversations_updated ON ai_conversations(updated_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations" ON ai_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own conversations" ON ai_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own conversations" ON ai_conversations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own conversations" ON ai_conversations
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- WRITER PROFILES
-- Adaptive AI behavior based on writer patterns
-- ============================================

CREATE TABLE IF NOT EXISTS writer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- AI-synthesized portrait of this writer's preferences and style
  profile_text TEXT,

  -- Tool acceptance tracking: {toolName: {proposed: N, accepted: N}}
  tool_stats JSONB DEFAULT '{}',

  -- Session behavior tracking
  session_stats JSONB DEFAULT '{}',

  -- Synthesis tracking
  conversations_since_synthesis INT DEFAULT 0,
  last_synthesized_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE writer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON writer_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own profile" ON writer_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own profile" ON writer_profiles
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================
-- AI PERSONALITY PRESETS
-- Custom system prompt modifiers
-- ============================================

CREATE TABLE IF NOT EXISTS ai_personality_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  system_prompt_modifier TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_presets_user ON ai_personality_presets(user_id);

ALTER TABLE ai_personality_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own presets" ON ai_personality_presets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own presets" ON ai_personality_presets
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own presets" ON ai_personality_presets
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own presets" ON ai_personality_presets
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- PANEL NOTES
-- AI or user editorial notes anchored to panels/pages/scenes
-- ============================================

CREATE TABLE IF NOT EXISTS panel_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Anchor point (at least one should be set)
  panel_id UUID REFERENCES panels(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'user', 'collaborator')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_panel_notes_panel ON panel_notes(panel_id);
CREATE INDEX idx_panel_notes_page ON panel_notes(page_id);
CREATE INDEX idx_panel_notes_scene ON panel_notes(scene_id);
CREATE INDEX idx_panel_notes_status ON panel_notes(status) WHERE status = 'pending';

ALTER TABLE panel_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view panel notes for series they access" ON panel_notes
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM panels p
      JOIN pages pg ON p.page_id = pg.id
      JOIN scenes sc ON pg.scene_id = sc.id
      JOIN acts a ON sc.act_id = a.id
      JOIN issues i ON a.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE p.id = panel_notes.panel_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM series_collaborators c WHERE c.series_id = s.id AND c.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can create panel notes" ON panel_notes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own panel notes" ON panel_notes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own panel notes" ON panel_notes
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- CANVAS ITEMS: Add filing + source columns
-- ============================================

ALTER TABLE canvas_items ADD COLUMN IF NOT EXISTS filed_to_scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL;
ALTER TABLE canvas_items ADD COLUMN IF NOT EXISTS filed_to_page_id UUID REFERENCES pages(id) ON DELETE SET NULL;
ALTER TABLE canvas_items ADD COLUMN IF NOT EXISTS filed_at TIMESTAMPTZ;
ALTER TABLE canvas_items ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- ============================================
-- UPDATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_ai_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_conversations_updated_at();

CREATE OR REPLACE FUNCTION update_writer_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER writer_profiles_updated_at
  BEFORE UPDATE ON writer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_writer_profiles_updated_at();

CREATE OR REPLACE FUNCTION update_panel_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER panel_notes_updated_at
  BEFORE UPDATE ON panel_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_panel_notes_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE ai_conversations IS 'Persistent AI conversation records with tool proposal tracking and synthesis summaries';
COMMENT ON TABLE writer_profiles IS 'Adaptive writer profiles that evolve based on AI interaction patterns and tool acceptance';
COMMENT ON TABLE ai_personality_presets IS 'User-defined system prompt modifiers for customizing AI personality';
COMMENT ON TABLE panel_notes IS 'Editorial notes from AI or users anchored to specific panels, pages, or scenes';
