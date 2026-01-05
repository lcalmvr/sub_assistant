-- Add address fields to submissions table
-- This allows capturing insured address before account linking
-- Address can be synced to account when linked

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS address_zip TEXT;

-- Add index for state-based filtering
CREATE INDEX IF NOT EXISTS idx_submissions_address_state ON submissions(address_state);

-- Comments
COMMENT ON COLUMN submissions.address_street IS 'Insured mailing address street (may include suite/unit)';
COMMENT ON COLUMN submissions.address_city IS 'Insured mailing address city';
COMMENT ON COLUMN submissions.address_state IS 'Insured mailing address state (2-letter code)';
COMMENT ON COLUMN submissions.address_zip IS 'Insured mailing address ZIP code';
