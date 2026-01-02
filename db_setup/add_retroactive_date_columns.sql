-- Add retroactive date columns for quote options
-- Dec 2024

-- Submission default retroactive date (applies to all options unless overridden)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS default_retroactive_date TEXT;

-- Per-option retroactive date (NULL = use submission default)
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS retroactive_date TEXT;
