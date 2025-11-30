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
