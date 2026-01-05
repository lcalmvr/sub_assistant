-- =============================================================================
-- AI Research Tasks
--
-- Stores tasks where UW flags something for AI to research and propose a fix.
-- Examples: wrong company description, incorrect industry classification, etc.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_research_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- What needs researching
    task_type VARCHAR(50) NOT NULL,  -- 'business_description', 'industry_classification', etc.
    flag_type VARCHAR(50) NOT NULL,  -- 'wrong_company', 'inaccurate', 'other'

    -- UW context
    uw_context TEXT,                  -- What the UW told us about the issue
    original_value TEXT,              -- The value being corrected

    -- AI response
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    proposed_value TEXT,              -- AI's proposed correction
    ai_reasoning TEXT,                -- Why AI thinks this is correct
    sources_consulted JSONB,          -- What sources AI used (URLs, documents, etc.)
    confidence NUMERIC(3,2),          -- AI's confidence in the correction (0-1)

    -- Review
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    review_outcome VARCHAR(20),       -- accepted, rejected, modified
    final_value TEXT,                 -- The value after UW review (may differ from proposed)

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    CONSTRAINT ai_research_tasks_status_check
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT ai_research_tasks_review_outcome_check
        CHECK (review_outcome IS NULL OR review_outcome IN ('accepted', 'rejected', 'modified'))
);

-- Index for finding pending tasks
CREATE INDEX IF NOT EXISTS idx_ai_research_tasks_pending
    ON ai_research_tasks(status)
    WHERE status IN ('pending', 'processing');

-- Index for submission lookup
CREATE INDEX IF NOT EXISTS idx_ai_research_tasks_submission
    ON ai_research_tasks(submission_id);

-- Comments
COMMENT ON TABLE ai_research_tasks IS 'AI research tasks initiated by UW to correct flagged data';
COMMENT ON COLUMN ai_research_tasks.task_type IS 'Type of correction: business_description, industry_classification, etc.';
COMMENT ON COLUMN ai_research_tasks.flag_type IS 'Why flagged: wrong_company, inaccurate, other';
COMMENT ON COLUMN ai_research_tasks.uw_context IS 'Additional context provided by UW about the issue';
COMMENT ON COLUMN ai_research_tasks.ai_reasoning IS 'AI explanation of how it arrived at the proposed value';
COMMENT ON COLUMN ai_research_tasks.sources_consulted IS 'URLs, document IDs, or other sources AI used';
