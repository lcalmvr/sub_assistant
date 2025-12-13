-- Insurance Towers Table
-- Stores insurance tower structures linked to submissions
-- Run this SQL against your database to create the table

CREATE TABLE IF NOT EXISTS insurance_towers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    tower_json JSONB NOT NULL,
    primary_retention NUMERIC,
    sublimits JSONB DEFAULT '[]'::jsonb,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Migration: Add sublimits column if table already exists
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS sublimits JSONB DEFAULT '[]'::jsonb;

-- Migration: Add quote options columns
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS quote_name TEXT DEFAULT 'Option A';
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS quoted_premium NUMERIC;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS quote_notes TEXT;

-- Migration: Add new quote tab redesign columns (Dec 2024)
-- Three-tier premium model:
--   technical_premium: Pure exposure-based (hazard class + revenue + limit + retention factors, BEFORE controls)
--   risk_adjusted_premium: After control credits/debits are applied
--   sold_premium: UW's final quoted price (market rate adjustment = sold - risk_adjusted)
-- endorsements: JSON array of endorsement selections
-- position: "primary" or "excess"
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS technical_premium NUMERIC;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS risk_adjusted_premium NUMERIC;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS sold_premium NUMERIC;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS endorsements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS position TEXT DEFAULT 'primary';

-- Migrate existing quoted_premium to sold_premium if sold_premium is null
UPDATE insurance_towers
SET sold_premium = quoted_premium
WHERE sold_premium IS NULL AND quoted_premium IS NOT NULL;

-- Index for fast lookups by submission
CREATE INDEX IF NOT EXISTS idx_insurance_towers_submission_id
ON insurance_towers(submission_id);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_insurance_towers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS insurance_towers_updated_at ON insurance_towers;
CREATE TRIGGER insurance_towers_updated_at
    BEFORE UPDATE ON insurance_towers
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_towers_timestamp();

-- ========================================
-- Submissions Table Rating Overrides
-- ========================================
-- These columns store account-level rating adjustments that apply globally
-- to all quote options for a submission (not per-option)

-- hazard_override: Override the auto-detected hazard class (integer 1-5)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS hazard_override INTEGER;

-- control_overrides: JSON object of control category adjustments
-- Example: {"network_security": -0.05, "endpoint_protection": 0.10}
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS control_overrides JSONB DEFAULT '{}'::jsonb;

-- ========================================
-- Coverage & Policy Form Columns (Dec 2024)
-- ========================================

-- policy_form on insurance_towers: Override policy form per quote option
-- Values: "cyber", "cyber_tech", "tech"
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS policy_form TEXT DEFAULT 'cyber';

-- coverages: Full coverage schedule with limits
-- Structure: {
--   "policy_form": "cyber",
--   "aggregate_limit": 1000000,
--   "aggregate_coverages": {"network_security_privacy": 1000000, "tech_eo": 0, ...},
--   "sublimit_coverages": {"social_engineering": 250000, ...}
-- }
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS coverages JSONB;

-- default_policy_form on submissions: Account-level default policy form
-- Can be overridden at quote option level
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS default_policy_form TEXT DEFAULT 'cyber';
