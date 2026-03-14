-- Add mirror_page_id to pages table for parallel page pairs (Issue 4 mirroring)
ALTER TABLE pages ADD COLUMN mirror_page_id UUID REFERENCES pages(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX idx_pages_mirror_page_id ON pages(mirror_page_id) WHERE mirror_page_id IS NOT NULL;

-- Trigger: ensure reciprocal mirroring and mutual exclusion with spreads
--
-- RECURSION SAFETY: The reciprocal UPDATE in the SET branch uses a WHERE clause
-- `(mirror_page_id IS NULL OR mirror_page_id != NEW.id)` which ensures that when
-- the trigger fires on the partner page (due to the reciprocal UPDATE), the second-pass
-- UPDATE matches 0 rows because the partner's mirror_page_id already equals NEW.id.
-- Since the per-row trigger only fires when a row is actually modified, the recursion
-- terminates after exactly one level. The same logic applies to the CLEAR branch:
-- `WHERE id = OLD.mirror_page_id AND mirror_page_id = NEW.id` ensures the partner's
-- trigger won't cascade further because OLD.mirror_page_id on the partner will be NEW.id
-- but the partner's NEW.mirror_page_id is now NULL, so the SET branch won't fire, and
-- the CLEAR branch won't match any rows.
CREATE OR REPLACE FUNCTION enforce_mirror_rules()
RETURNS TRIGGER AS $$
BEGIN
  -- Cannot mirror self
  IF NEW.mirror_page_id = NEW.id THEN
    RAISE EXCEPTION 'A page cannot mirror itself';
  END IF;

  -- Cannot be both spread partner and mirror
  IF NEW.mirror_page_id IS NOT NULL AND NEW.linked_page_id IS NOT NULL THEN
    RAISE EXCEPTION 'A page cannot be both a spread partner and a mirror simultaneously';
  END IF;

  -- Auto-set reciprocal mirror on the partner page
  IF NEW.mirror_page_id IS NOT NULL AND (OLD IS NULL OR OLD.mirror_page_id IS DISTINCT FROM NEW.mirror_page_id) THEN
    UPDATE pages SET mirror_page_id = NEW.id WHERE id = NEW.mirror_page_id AND (mirror_page_id IS NULL OR mirror_page_id != NEW.id);
  END IF;

  -- Clear reciprocal mirror when unlinking
  IF NEW.mirror_page_id IS NULL AND OLD IS NOT NULL AND OLD.mirror_page_id IS NOT NULL THEN
    UPDATE pages SET mirror_page_id = NULL WHERE id = OLD.mirror_page_id AND mirror_page_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_mirror_rules
BEFORE INSERT OR UPDATE OF mirror_page_id ON pages
FOR EACH ROW EXECUTE FUNCTION enforce_mirror_rules();
