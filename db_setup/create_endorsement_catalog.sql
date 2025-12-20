-- Endorsement Catalog/Bank
-- Stores reusable endorsement templates with formal titles for printing

CREATE TABLE IF NOT EXISTS endorsement_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    code TEXT NOT NULL UNIQUE,              -- e.g., "EXT-001", "CAN-001", "COV-LIMIT-01"
    title TEXT NOT NULL,                    -- Formal title for printing, e.g., "Endorsement No. 1 - Policy Extension"
    description TEXT,                       -- Longer description/explanation

    -- Categorization
    endorsement_type TEXT,                  -- Links to transaction type: extension, cancellation, coverage_change, etc. NULL = general
    position TEXT NOT NULL DEFAULT 'either', -- primary, excess, either
    midterm_only BOOLEAN NOT NULL DEFAULT FALSE, -- Only applicable mid-term, not at bind

    -- Status
    active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    created_by TEXT,

    -- Constraints
    CONSTRAINT valid_position CHECK (position IN ('primary', 'excess', 'either')),
    CONSTRAINT valid_endorsement_type CHECK (
        endorsement_type IS NULL OR
        endorsement_type IN ('coverage_change', 'cancellation', 'reinstatement',
                             'name_change', 'address_change', 'erp', 'extension', 'other')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_endorsement_catalog_type ON endorsement_catalog(endorsement_type);
CREATE INDEX IF NOT EXISTS idx_endorsement_catalog_position ON endorsement_catalog(position);
CREATE INDEX IF NOT EXISTS idx_endorsement_catalog_active ON endorsement_catalog(active);

-- Add catalog reference to policy_endorsements
ALTER TABLE policy_endorsements
ADD COLUMN IF NOT EXISTS catalog_id UUID REFERENCES endorsement_catalog(id),
ADD COLUMN IF NOT EXISTS formal_title TEXT;

-- Seed some common endorsements
INSERT INTO endorsement_catalog (code, title, description, endorsement_type, position, midterm_only) VALUES
    ('EXT-001', 'Endorsement - Policy Extension', 'Extends the policy expiration date', 'extension', 'either', true),
    ('CAN-001', 'Endorsement - Policy Cancellation', 'Cancels the policy effective the date specified', 'cancellation', 'either', true),
    ('CAN-002', 'Endorsement - Flat Cancellation', 'Cancels the policy from inception with full premium return', 'cancellation', 'either', true),
    ('RST-001', 'Endorsement - Policy Reinstatement', 'Reinstates a previously cancelled policy', 'reinstatement', 'either', true),
    ('ERP-001', 'Endorsement - Extended Reporting Period (Basic)', 'Provides basic extended reporting period coverage', 'erp', 'either', true),
    ('ERP-002', 'Endorsement - Extended Reporting Period (Supplemental)', 'Provides supplemental extended reporting period coverage', 'erp', 'either', true),
    ('NIC-001', 'Endorsement - Change of Named Insured', 'Changes the named insured on the policy', 'name_change', 'either', true),
    ('ADR-001', 'Endorsement - Change of Address', 'Changes the insured address on the policy', 'address_change', 'either', true),
    ('LIM-001', 'Endorsement - Limit Increase', 'Increases policy limits', 'coverage_change', 'either', false),
    ('LIM-002', 'Endorsement - Limit Decrease', 'Decreases policy limits', 'coverage_change', 'either', true),
    ('RET-001', 'Endorsement - Retention Change', 'Modifies the policy retention/deductible', 'coverage_change', 'either', true),
    ('COV-001', 'Endorsement - Additional Coverage', 'Adds coverage to the policy', 'coverage_change', 'either', false),
    ('COV-002', 'Endorsement - Coverage Exclusion', 'Excludes specific coverage from the policy', 'coverage_change', 'either', false),
    ('WAR-001', 'Endorsement - War Exclusion', 'Standard war and terrorism exclusion', NULL, 'either', false),
    ('SAN-001', 'Endorsement - Sanctions Exclusion (OFAC)', 'OFAC sanctions compliance exclusion', NULL, 'either', false),
    ('BIF-001', 'Endorsement - Biometric Information Exclusion', 'Excludes biometric privacy claims', NULL, 'primary', false),
    ('CRY-001', 'Endorsement - Cryptocurrency Exclusion', 'Excludes cryptocurrency-related losses', NULL, 'either', false),
    ('EXC-001', 'Endorsement - Excess Follow Form', 'Excess policy follows form of underlying', NULL, 'excess', false),
    ('EXC-002', 'Endorsement - Drop Down Coverage', 'Provides drop-down coverage if underlying exhausted', NULL, 'excess', false)
ON CONFLICT (code) DO NOTHING;
