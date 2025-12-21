-- Add address fields to accounts table
-- Address is stored at account level since it represents the insured company's address
-- and persists across policy years/submissions

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_street2 TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_zip TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_country TEXT DEFAULT 'US';

-- Add index for state-based queries (useful for regulatory/filing purposes)
CREATE INDEX IF NOT EXISTS idx_accounts_address_state ON accounts(address_state);

-- Comment on columns
COMMENT ON COLUMN accounts.address_street IS 'Primary street address line';
COMMENT ON COLUMN accounts.address_street2 IS 'Suite, floor, unit number (optional)';
COMMENT ON COLUMN accounts.address_city IS 'City name';
COMMENT ON COLUMN accounts.address_state IS 'US state code (e.g., CA, NY, TX)';
COMMENT ON COLUMN accounts.address_zip IS 'ZIP/postal code';
COMMENT ON COLUMN accounts.address_country IS 'Country code (defaults to US)';
