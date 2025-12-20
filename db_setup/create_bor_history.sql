-- Broker of Record History Table
-- Tracks all broker assignments over time for each submission
-- Enables efficient querying of "who was the broker on date X?"

-- Required for daterange exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS broker_of_record_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Broker assignment (can reference either brokers.id or brkr_organizations.org_id)
    broker_id UUID NOT NULL,
    -- Contact (can reference either broker_contacts.id or brkr_employments.employment_id)
    broker_contact_id UUID,

    -- Effective period
    effective_date DATE NOT NULL,
    end_date DATE,  -- NULL = current/active

    -- Change metadata
    change_type TEXT NOT NULL,  -- 'original' or 'bor_change'
    change_reason TEXT,
    bor_letter_document_id UUID REFERENCES documents(id),

    -- Link to endorsement (for bor_change type)
    endorsement_id UUID REFERENCES policy_endorsements(id),

    -- Audit
    created_at TIMESTAMP DEFAULT now(),
    created_by TEXT,

    -- Constraints
    CONSTRAINT valid_change_type CHECK (change_type IN ('original', 'bor_change')),

    -- Exclusion constraint: no overlapping periods for same submission
    CONSTRAINT no_overlapping_broker_periods EXCLUDE USING gist (
        submission_id WITH =,
        daterange(effective_date, COALESCE(end_date, '9999-12-31'::date), '[)') WITH &&
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bor_history_submission ON broker_of_record_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_bor_history_broker ON broker_of_record_history(broker_id);
CREATE INDEX IF NOT EXISTS idx_bor_history_active ON broker_of_record_history(submission_id)
    WHERE end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_bor_history_effective_date ON broker_of_record_history(effective_date);

-- Update policy_endorsements constraint to include bor_change
ALTER TABLE policy_endorsements
DROP CONSTRAINT IF EXISTS valid_endorsement_type;

ALTER TABLE policy_endorsements
ADD CONSTRAINT valid_endorsement_type CHECK (
    endorsement_type IN ('coverage_change', 'cancellation', 'reinstatement',
                         'name_change', 'address_change', 'erp', 'extension',
                         'bor_change', 'other')
);

-- Update endorsement_catalog constraint to include bor_change
ALTER TABLE endorsement_catalog
DROP CONSTRAINT IF EXISTS valid_endorsement_type;

ALTER TABLE endorsement_catalog
ADD CONSTRAINT valid_endorsement_type CHECK (
    endorsement_type IS NULL OR
    endorsement_type IN ('coverage_change', 'cancellation', 'reinstatement',
                         'name_change', 'address_change', 'erp', 'extension',
                         'bor_change', 'other')
);

-- Add BOR catalog entry
INSERT INTO endorsement_catalog (code, title, description, endorsement_type, position, midterm_only, active)
VALUES (
    'BOR-001',
    'Endorsement - Broker of Record Change',
    'Transfers broker of record to a new brokerage effective the specified date.',
    'bor_change',
    'either',
    TRUE,
    TRUE
) ON CONFLICT (code) DO NOTHING;

-- Reporting views
-- Support both brokers table and brkr_organizations (alt system)

-- View: Current broker for each submission (with history)
CREATE OR REPLACE VIEW v_submission_current_broker AS
SELECT
    s.id as submission_id,
    s.applicant_name,
    s.broker_id as submission_broker_id,
    bh.broker_id as history_broker_id,
    COALESCE(bo.name, b.company_name) as broker_name,
    bh.effective_date as broker_since,
    bh.change_type
FROM submissions s
LEFT JOIN broker_of_record_history bh ON s.id = bh.submission_id AND bh.end_date IS NULL
LEFT JOIN brkr_organizations bo ON COALESCE(bh.broker_id, s.broker_id) = bo.org_id
LEFT JOIN brokers b ON COALESCE(bh.broker_id, s.broker_id) = b.id;

-- View: BOR changes summary
CREATE OR REPLACE VIEW v_bor_changes AS
SELECT
    bh.id as bor_history_id,
    bh.submission_id,
    s.applicant_name,
    bh.effective_date,
    bh.broker_id as new_broker_id,
    COALESCE(new_bo.name, new_b.company_name) as new_broker_name,
    prev.broker_id as previous_broker_id,
    COALESCE(prev_bo.name, prev_b.company_name) as previous_broker_name,
    bh.change_reason,
    bh.endorsement_id,
    bh.created_at as processed_at,
    bh.created_by as processed_by
FROM broker_of_record_history bh
JOIN submissions s ON bh.submission_id = s.id
LEFT JOIN broker_of_record_history prev ON
    prev.submission_id = bh.submission_id AND
    prev.end_date = bh.effective_date
LEFT JOIN brkr_organizations prev_bo ON prev.broker_id = prev_bo.org_id
LEFT JOIN brokers prev_b ON prev.broker_id = prev_b.id
LEFT JOIN brkr_organizations new_bo ON bh.broker_id = new_bo.org_id
LEFT JOIN brokers new_b ON bh.broker_id = new_b.id
WHERE bh.change_type = 'bor_change'
ORDER BY bh.created_at DESC;
