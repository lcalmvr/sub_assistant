-- ============================================================================
-- RETRO SCHEDULE - Per-coverage/limit retroactive dates
-- ============================================================================
-- Supports complex retro configurations:
--   - Per coverage type (Cyber, Tech E&O, D&O)
--   - Per limit band (Tech E&O $1M vs $4M xs $1M)
--   - Text values ("Full Prior Acts", "Inception") or dates
--
-- Structure:
--   [
--     { "coverage": "Cyber", "retro": "Full Prior Acts" },
--     { "coverage": "Tech E&O", "limit": "1M", "retro": "01/01/2025" },
--     { "coverage": "Tech E&O", "limit": "4M xs 1M", "retro": "01/01/2026" }
--   ]
--
-- Run: psql $DATABASE_URL -f db_setup/add_retro_schedule.sql
-- ============================================================================

-- Submission-level default retro schedule
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS default_retro_schedule JSONB;

-- Per-option retro schedule (NULL = use submission default)
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS retro_schedule JSONB;

-- Optional notes field for context that doesn't fit the structure
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS retro_notes TEXT;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS retro_notes TEXT;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN submissions.default_retro_schedule IS 'Default retro schedule for all quote options (JSON array)';
COMMENT ON COLUMN submissions.retro_notes IS 'Free-text notes about retro dates';
COMMENT ON COLUMN insurance_towers.retro_schedule IS 'Per-option retro schedule override (NULL = use submission default)';
COMMENT ON COLUMN insurance_towers.retro_notes IS 'Per-option retro notes';
