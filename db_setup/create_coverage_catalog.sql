-- Coverage Catalog: Master list of carrier-specific coverages mapped to standardized tags
-- This enables consistent reporting/analytics while preserving original carrier terminology

-- Create enum for approval status
DO $$ BEGIN
    CREATE TYPE coverage_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main coverage catalog table
CREATE TABLE IF NOT EXISTS coverage_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Carrier/Policy identification
    carrier_name TEXT NOT NULL,
    policy_form TEXT,  -- e.g., "CyberEdge 3.0", "NetGuard Plus v2"

    -- Coverage mapping
    coverage_original TEXT NOT NULL,  -- Exact name from carrier document
    coverage_normalized TEXT[] NOT NULL DEFAULT '{}',  -- Standardized tags (array - one coverage can map to multiple)

    -- Additional context (can inform standardization decisions)
    coverage_description TEXT,  -- Policy wording excerpt if available
    notes TEXT,  -- UW notes about this coverage

    -- Governance workflow
    status coverage_status DEFAULT 'pending',
    submitted_by TEXT,  -- User who first encountered this coverage
    submitted_at TIMESTAMPTZ DEFAULT now(),
    reviewed_by TEXT,  -- User who approved/rejected
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,  -- Reason for approval/rejection

    -- Source tracking
    source_quote_id UUID,  -- Quote where this was first extracted
    source_submission_id UUID,  -- Submission context

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Unique constraint: one mapping per carrier + policy form + coverage name
    UNIQUE(carrier_name, policy_form, coverage_original)
);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_coverage_catalog_carrier ON coverage_catalog(carrier_name);
CREATE INDEX IF NOT EXISTS idx_coverage_catalog_normalized_gin ON coverage_catalog USING GIN (coverage_normalized);
CREATE INDEX IF NOT EXISTS idx_coverage_catalog_status ON coverage_catalog(status);
CREATE INDEX IF NOT EXISTS idx_coverage_catalog_carrier_form ON coverage_catalog(carrier_name, policy_form);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_coverage_catalog_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coverage_catalog_updated_at ON coverage_catalog;
CREATE TRIGGER coverage_catalog_updated_at
    BEFORE UPDATE ON coverage_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_coverage_catalog_timestamp();

-- Standard coverage tags reference (for documentation/validation)
-- These are the normalized values that coverage_normalized should map to
COMMENT ON TABLE coverage_catalog IS 'Master catalog of carrier-specific coverages mapped to standardized tags.

Standard normalized tags:
- Network Security & Privacy Liability
- Privacy Regulatory Defense & Penalties
- PCI DSS / Payment Card Liability
- Media Liability
- Business Interruption
- System Failure
- Dependent Business Interruption
- Cyber Extortion / Ransomware
- Data Recovery / Restoration
- Reputational Harm / Crisis Management
- Technology E&O
- Social Engineering
- Invoice Manipulation / Funds Transfer Fraud
- Telecommunications Fraud
- Breach Response / Incident Response
- Cryptojacking
- Other
';

-- View for pending reviews (admin dashboard)
CREATE OR REPLACE VIEW coverage_catalog_pending AS
SELECT
    id,
    carrier_name,
    policy_form,
    coverage_original,
    coverage_normalized,
    submitted_by,
    submitted_at,
    notes
FROM coverage_catalog
WHERE status = 'pending'
ORDER BY submitted_at DESC;

-- View for approved mappings (lookup)
CREATE OR REPLACE VIEW coverage_catalog_approved AS
SELECT
    id,
    carrier_name,
    policy_form,
    coverage_original,
    coverage_normalized,
    coverage_description
FROM coverage_catalog
WHERE status = 'approved'
ORDER BY carrier_name, policy_form, coverage_original;
