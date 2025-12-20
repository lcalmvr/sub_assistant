-- Policy Documents Table
-- Tracks generated documents (quotes, binders) for submissions

CREATE TABLE IF NOT EXISTS policy_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    quote_option_id UUID REFERENCES insurance_towers(id) ON DELETE SET NULL,

    -- Document identification
    document_type TEXT NOT NULL,  -- 'quote_primary', 'quote_excess', 'binder'
    document_number TEXT,         -- e.g., "Q-2025-001234"

    -- Storage
    pdf_url TEXT NOT NULL,
    document_json JSONB,          -- Snapshot of data used to generate

    -- Versioning
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft',  -- 'draft', 'issued', 'superseded', 'void'
    superseded_by UUID REFERENCES policy_documents(id),

    -- Audit
    created_by TEXT,
    created_at TIMESTAMP DEFAULT now(),
    voided_at TIMESTAMP,
    voided_by TEXT,
    void_reason TEXT,

    CONSTRAINT valid_document_type CHECK (
        document_type IN ('quote_primary', 'quote_excess', 'binder')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('draft', 'issued', 'superseded', 'void')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policy_documents_submission ON policy_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_policy_documents_type ON policy_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_policy_documents_status ON policy_documents(status);
CREATE INDEX IF NOT EXISTS idx_policy_documents_quote_option ON policy_documents(quote_option_id);
