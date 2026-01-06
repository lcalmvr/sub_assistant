-- =============================================================================
-- Agent Feature Requests
--
-- Captures user requests for new AI agent capabilities
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_feature_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request details
    description TEXT NOT NULL,
    use_case TEXT,  -- Optional: why they need it

    -- Context
    submitted_by VARCHAR(255),
    submission_id UUID REFERENCES submissions(id),  -- If submitted from a specific submission

    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'planned', 'implemented', 'wont_do')),
    admin_notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_feature_requests_status ON agent_feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_agent_feature_requests_created ON agent_feature_requests(created_at DESC);

COMMENT ON TABLE agent_feature_requests IS 'User requests for new AI agent capabilities';

-- Verification
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_feature_requests') THEN
        RAISE NOTICE 'SUCCESS: agent_feature_requests table created';
    END IF;
END $$;
