-- Creative Intelligence Layer: Database Schema
-- Supports 6 features: Canvas Mode, Scene Analytics, Character Voice, Visual Rhythm

-- ============================================
-- FEATURE 1: CANVAS MODE
-- Pre-structure brainstorming space
-- ============================================

CREATE TABLE IF NOT EXISTS canvas_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content
  item_type TEXT NOT NULL CHECK (item_type IN ('character', 'theme', 'visual', 'scenario', 'dialogue', 'conflict', 'world')),
  title TEXT NOT NULL,
  content TEXT,

  -- Organization
  color_tag TEXT CHECK (color_tag IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray')),
  inspiration_source TEXT,
  sort_order INTEGER DEFAULT 0,

  -- Graduation tracking
  promoted_to_character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  promoted_to_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  archived BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_canvas_items_series ON canvas_items(series_id);
CREATE INDEX idx_canvas_items_user ON canvas_items(user_id);
CREATE INDEX idx_canvas_items_type ON canvas_items(item_type);
CREATE INDEX idx_canvas_items_archived ON canvas_items(archived) WHERE archived = FALSE;

-- RLS for canvas_items
ALTER TABLE canvas_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view canvas items for series they can access"
  ON canvas_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM series s
      WHERE s.id = canvas_items.series_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can insert canvas items for their series"
  ON canvas_items FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM series s
      WHERE s.id = canvas_items.series_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
          AND c.role IN ('owner', 'editor')
        )
      )
    )
  );

CREATE POLICY "Users can update their own canvas items"
  ON canvas_items FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own canvas items"
  ON canvas_items FOR DELETE
  USING (user_id = auth.uid());


-- ============================================
-- FEATURE 3: SCENE-LEVEL ANALYTICS
-- Cached scene metrics for efficiency evaluation
-- ============================================

CREATE TABLE IF NOT EXISTS scene_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,

  -- Core metrics
  page_count INTEGER NOT NULL DEFAULT 0,
  panel_count INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  dialogue_panels INTEGER NOT NULL DEFAULT 0,
  silent_panels INTEGER NOT NULL DEFAULT 0,

  -- Derived metrics
  words_per_page NUMERIC(6,2),
  panels_per_page NUMERIC(6,2),
  dialogue_ratio NUMERIC(4,3),

  -- Assessment
  dramatic_function TEXT CHECK (dramatic_function IN (
    'exposition', 'rising_action', 'climax', 'falling_action',
    'resolution', 'character_moment', 'world_building', 'transition'
  )),
  efficiency_score INTEGER CHECK (efficiency_score BETWEEN 1 AND 100),

  -- Insights (stored as JSON array)
  insights JSONB DEFAULT '[]',

  analyzed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(scene_id)
);

CREATE INDEX idx_scene_analytics_scene ON scene_analytics(scene_id);
CREATE INDEX idx_scene_analytics_function ON scene_analytics(dramatic_function);
CREATE INDEX idx_scene_analytics_score ON scene_analytics(efficiency_score);

-- RLS for scene_analytics (inherits from scene ownership)
ALTER TABLE scene_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scene analytics for scenes they can access"
  ON scene_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM scenes sc
      JOIN acts a ON sc.act_id = a.id
      JOIN issues i ON a.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE sc.id = scene_analytics.scene_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can manage scene analytics for their scenes"
  ON scene_analytics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM scenes sc
      JOIN acts a ON sc.act_id = a.id
      JOIN issues i ON a.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE sc.id = scene_analytics.scene_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
          AND c.role IN ('owner', 'editor')
        )
      )
    )
  );


-- ============================================
-- FEATURE 4: CHARACTER VOICE PROFILES
-- Speech pattern training and consistency checking
-- ============================================

CREATE TABLE IF NOT EXISTS character_voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  -- Voice characteristics
  vocabulary_level TEXT CHECK (vocabulary_level IN ('formal', 'casual', 'street', 'technical', 'poetic', 'mixed')),
  avg_sentence_length NUMERIC(5,2),

  -- Pattern arrays
  common_words TEXT[] DEFAULT '{}',
  avoided_words TEXT[] DEFAULT '{}',
  tone_markers TEXT[] DEFAULT '{}',
  speech_quirks TEXT[] DEFAULT '{}',
  sample_quotes TEXT[] DEFAULT '{}',

  -- AI-generated or manual description
  profile_summary TEXT,

  -- Training metadata
  dialogue_count INTEGER DEFAULT 0,
  trained_at TIMESTAMPTZ,
  manually_reviewed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(character_id)
);

CREATE INDEX idx_voice_profiles_character ON character_voice_profiles(character_id);
CREATE INDEX idx_voice_profiles_vocabulary ON character_voice_profiles(vocabulary_level);

-- Dialogue inconsistency flags
CREATE TABLE IF NOT EXISTS dialogue_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dialogue_id UUID NOT NULL REFERENCES dialogue_blocks(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  flag_type TEXT NOT NULL CHECK (flag_type IN ('vocabulary', 'tone', 'length', 'pattern')),
  message TEXT NOT NULL,
  flagged_word TEXT,
  suggested_alternative TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('suggestion', 'warning')) DEFAULT 'suggestion',

  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dialogue_flags_dialogue ON dialogue_flags(dialogue_id);
CREATE INDEX idx_dialogue_flags_character ON dialogue_flags(character_id);
CREATE INDEX idx_dialogue_flags_dismissed ON dialogue_flags(dismissed) WHERE dismissed = FALSE;

-- RLS for voice profiles (inherits from character ownership)
ALTER TABLE character_voice_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view voice profiles for characters they can access"
  ON character_voice_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM characters ch
      JOIN series s ON ch.series_id = s.id
      WHERE ch.id = character_voice_profiles.character_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can manage voice profiles for their characters"
  ON character_voice_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM characters ch
      JOIN series s ON ch.series_id = s.id
      WHERE ch.id = character_voice_profiles.character_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
          AND c.role IN ('owner', 'editor')
        )
      )
    )
  );

-- RLS for dialogue flags
ALTER TABLE dialogue_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dialogue flags for dialogues they can access"
  ON dialogue_flags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dialogue_blocks db
      JOIN panels p ON db.panel_id = p.id
      JOIN pages pg ON p.page_id = pg.id
      JOIN scenes sc ON pg.scene_id = sc.id
      JOIN acts a ON sc.act_id = a.id
      JOIN issues i ON a.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE db.id = dialogue_flags.dialogue_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can manage dialogue flags for their dialogues"
  ON dialogue_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM dialogue_blocks db
      JOIN panels p ON db.panel_id = p.id
      JOIN pages pg ON p.page_id = pg.id
      JOIN scenes sc ON pg.scene_id = sc.id
      JOIN acts a ON sc.act_id = a.id
      JOIN issues i ON a.issue_id = i.id
      JOIN series s ON i.series_id = s.id
      WHERE db.id = dialogue_flags.dialogue_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
          AND c.role IN ('owner', 'editor')
        )
      )
    )
  );


-- ============================================
-- FEATURE 5: VISUAL RHYTHM ANALYSIS
-- Issue-level pacing and tempo tracking
-- ============================================

CREATE TABLE IF NOT EXISTS issue_rhythm_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,

  -- Per-page rhythm data stored as JSON array
  rhythm_data JSONB NOT NULL DEFAULT '[]',

  -- Overall issue metrics
  overall_tempo TEXT CHECK (overall_tempo IN ('slow', 'moderate', 'fast', 'variable')),
  avg_panels_per_page NUMERIC(4,2),
  silent_ratio NUMERIC(4,3),
  dialogue_ratio NUMERIC(4,3),
  action_ratio NUMERIC(4,3),

  -- Silent sequences identified
  silent_sequences JSONB DEFAULT '[]',

  -- Generated insights
  insights JSONB DEFAULT '[]',

  analyzed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(issue_id)
);

CREATE INDEX idx_rhythm_cache_issue ON issue_rhythm_cache(issue_id);
CREATE INDEX idx_rhythm_cache_tempo ON issue_rhythm_cache(overall_tempo);

-- RLS for rhythm cache (inherits from issue ownership)
ALTER TABLE issue_rhythm_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rhythm cache for issues they can access"
  ON issue_rhythm_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = issue_rhythm_cache.issue_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can manage rhythm cache for their issues"
  ON issue_rhythm_cache FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN series s ON i.series_id = s.id
      WHERE i.id = issue_rhythm_cache.issue_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM series_collaborators c
          WHERE c.series_id = s.id
          AND c.user_id = auth.uid()
          AND c.role IN ('owner', 'editor')
        )
      )
    )
  );


-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE canvas_items IS 'Pre-structure brainstorming space for fuzzy ideas that can graduate to structured entities';
COMMENT ON TABLE scene_analytics IS 'Cached analytics for evaluating scene efficiency and dramatic function';
COMMENT ON TABLE character_voice_profiles IS 'Trained speech patterns for each character to enable consistency checking';
COMMENT ON TABLE dialogue_flags IS 'Flagged dialogue inconsistencies based on character voice profiles';
COMMENT ON TABLE issue_rhythm_cache IS 'Cached visual pacing analysis for entire issues';
