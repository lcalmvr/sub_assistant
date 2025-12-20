-- Policy Endorsements Table
-- Track midterm transactions/modifications during the policy term
-- Distinct from insurance_towers.endorsements which are "as-bound" policy form modifications

CREATE TABLE IF NOT EXISTS policy_endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to bound submission/tower
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    tower_id UUID NOT NULL REFERENCES insurance_towers(id) ON DELETE CASCADE,

    -- Identification
    endorsement_number INTEGER NOT NULL,  -- Sequential per submission (1, 2, 3...)
    endorsement_type TEXT NOT NULL,       -- coverage_change, cancellation, reinstatement, name_change, address_change, erp, other

    -- Dates
    effective_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    issued_at TIMESTAMP,
    voided_at TIMESTAMP,

    -- Status: draft -> issued (with void option)
    status TEXT NOT NULL DEFAULT 'draft',  -- draft, issued, void

    -- Details
    description TEXT NOT NULL,
    change_details JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Premium
    premium_method TEXT NOT NULL DEFAULT 'manual',  -- pro_rata, flat, manual
    premium_change NUMERIC DEFAULT 0,
    original_annual_premium NUMERIC,
    days_remaining INTEGER,

    -- Carryover
    carries_to_renewal BOOLEAN DEFAULT TRUE,

    -- Audit
    created_by TEXT NOT NULL,
    issued_by TEXT,
    voided_by TEXT,
    void_reason TEXT,
    notes TEXT,

    -- Constraints
    CONSTRAINT valid_endorsement_type CHECK (
        endorsement_type IN ('coverage_change', 'cancellation', 'reinstatement',
                             'name_change', 'address_change', 'erp', 'extension', 'other')
    ),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'issued', 'void')),
    CONSTRAINT valid_premium_method CHECK (premium_method IN ('pro_rata', 'flat', 'manual'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_endorsements_submission ON policy_endorsements(submission_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_status ON policy_endorsements(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_endorsement_number
    ON policy_endorsements(submission_id, endorsement_number) WHERE status != 'void';
