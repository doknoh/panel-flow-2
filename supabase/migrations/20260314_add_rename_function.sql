-- F19: SECURITY DEFINER is used here because this function needs to update panels
-- across the entire series via a multi-table join (panels → pages → scenes → acts → issues).
-- RLS policies on panels are per-user and per-series, but this cross-table UPDATE
-- cannot be expressed purely through RLS. Authorization is enforced in the API route
-- (F18: series edit permission check) before this function is ever called.
CREATE OR REPLACE FUNCTION rename_character_in_descriptions(
  p_series_id UUID,
  p_old_name TEXT,
  p_new_name TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE panels
  SET visual_description = regexp_replace(
    visual_description,
    '\m' || p_old_name || '\M',  -- \m and \M are word boundaries in Postgres regex
    p_new_name,
    'gi'
  )
  WHERE page_id IN (
    SELECT p.id FROM pages p
    JOIN scenes s ON p.scene_id = s.id
    JOIN acts a ON s.act_id = a.id
    JOIN issues i ON a.issue_id = i.id
    WHERE i.series_id = p_series_id
  )
  AND visual_description ~* ('\m' || p_old_name || '\M');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
