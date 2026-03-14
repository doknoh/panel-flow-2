-- Add ai_draft_edits column to writer_profiles for tracking AI draft edit patterns
ALTER TABLE writer_profiles
ADD COLUMN ai_draft_edits JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN writer_profiles.ai_draft_edits IS
  'Array of {original, edited, panelId, timestamp} diffs from AI draft edits. Capped at 200 entries.';

-- F23: Atomic append function to avoid race conditions on concurrent edits.
-- Uses a single UPDATE with jsonb_agg to append and cap in one operation.
CREATE OR REPLACE FUNCTION append_draft_edit(
  p_user_id UUID,
  p_edit JSONB
)
RETURNS void AS $$
BEGIN
  UPDATE writer_profiles
  SET ai_draft_edits = (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM (
      SELECT elem FROM jsonb_array_elements(
        COALESCE(ai_draft_edits, '[]'::jsonb) || p_edit
      ) AS elem
      ORDER BY elem->>'timestamp' DESC
      LIMIT 200
    ) sub
  )
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
