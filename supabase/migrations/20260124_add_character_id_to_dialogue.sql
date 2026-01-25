-- Add character_id column to dialogue_blocks table
ALTER TABLE dialogue_blocks
ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES characters(id) ON DELETE SET NULL;

-- Add dialogue_type column if it doesn't exist
ALTER TABLE dialogue_blocks
ADD COLUMN IF NOT EXISTS dialogue_type TEXT NOT NULL DEFAULT 'dialogue';

-- Add index for faster lookups by character
CREATE INDEX IF NOT EXISTS idx_dialogue_blocks_character_id ON dialogue_blocks(character_id);
