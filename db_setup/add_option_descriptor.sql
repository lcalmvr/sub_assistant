-- Add option_descriptor column for custom quote option names
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS option_descriptor TEXT;

-- Comment explaining the field
COMMENT ON COLUMN insurance_towers.option_descriptor IS 'Optional custom descriptor to append to auto-generated option name';
