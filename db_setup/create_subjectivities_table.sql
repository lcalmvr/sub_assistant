-- Policy Subjectivities Table
-- Stores binding subjectivities that must be satisfied before/after policy issuance
-- Migrates from session-state-only implementation

CREATE TABLE IF NOT EXISTS policy_subjectivities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Content
    text TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',  -- 'binding', 'coverage', 'documentation', 'general'

    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'waived', 'expired')),
    received_at TIMESTAMP WITH TIME ZONE,
    received_by VARCHAR(100),
    due_date DATE,

    -- Supporting documents (references to policy_documents or storage keys)
    document_ids UUID[] DEFAULT '{}',
    notes TEXT,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'system',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(100),

    -- Prevent duplicate subjectivities per submission
    CONSTRAINT unique_subjectivity_per_submission UNIQUE (submission_id, text)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_subjectivities_submission ON policy_subjectivities(submission_id);
CREATE INDEX IF NOT EXISTS idx_subjectivities_status ON policy_subjectivities(status);
CREATE INDEX IF NOT EXISTS idx_subjectivities_due_date ON policy_subjectivities(due_date) WHERE due_date IS NOT NULL;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_subjectivities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subjectivities_updated_at ON policy_subjectivities;
CREATE TRIGGER trg_subjectivities_updated_at
    BEFORE UPDATE ON policy_subjectivities
    FOR EACH ROW
    EXECUTE FUNCTION update_subjectivities_updated_at();

-- Comments for documentation
COMMENT ON TABLE policy_subjectivities IS 'Policy binding subjectivities that must be satisfied';
COMMENT ON COLUMN policy_subjectivities.category IS 'binding=pre-bind requirement, coverage=affects coverage, documentation=paperwork needed, general=other';
COMMENT ON COLUMN policy_subjectivities.status IS 'pending=awaiting, received=satisfied, waived=no longer required, expired=past due date';
COMMENT ON COLUMN policy_subjectivities.document_ids IS 'Array of UUIDs referencing documents that satisfy this subjectivity';
