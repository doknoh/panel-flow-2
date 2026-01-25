-- Add missing metadata fields per CLAUDE.md specification

-- Series: Add visual_grammar and rules fields
ALTER TABLE series ADD COLUMN IF NOT EXISTS visual_grammar TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS rules TEXT;

-- Issues: Add tagline, visual_style, motifs, stakes, rules, series_act fields
ALTER TABLE issues ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS visual_style TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS motifs TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS stakes TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS rules TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS series_act TEXT CHECK (series_act IN ('BEGINNING', 'MIDDLE', 'END'));

-- Acts: Add beat_summary field
ALTER TABLE acts ADD COLUMN IF NOT EXISTS beat_summary TEXT;

-- Add comments for documentation
COMMENT ON COLUMN series.visual_grammar IS 'Notes on recurring visual devices for the series';
COMMENT ON COLUMN series.rules IS 'Series-wide conventions and rules';

COMMENT ON COLUMN issues.tagline IS 'One-line hook for the issue';
COMMENT ON COLUMN issues.visual_style IS 'Visual style notes for artist';
COMMENT ON COLUMN issues.motifs IS 'Visual/narrative motifs for this issue';
COMMENT ON COLUMN issues.stakes IS 'What is at risk in this issue';
COMMENT ON COLUMN issues.rules IS 'Issue-specific conventions';
COMMENT ON COLUMN issues.series_act IS 'Where this issue falls in overall series arc: BEGINNING, MIDDLE, or END';

COMMENT ON COLUMN acts.beat_summary IS 'Key moments in this act, not panel-level detail';
