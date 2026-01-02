-- =============================================================================
-- Feedback Tracking Tables
--
-- Tracks human corrections to AI-generated content for model improvement.
-- Enables:
-- 1. Understanding which AI outputs need improvement
-- 2. Building training data from corrections
-- 3. Measuring AI accuracy over time
-- =============================================================================

-- =============================================================================
-- ai_feedback: Track edits to AI-generated fields
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- What was edited
    field_name VARCHAR(100) NOT NULL,  -- e.g., 'business_summary', 'cyber_exposures'
    field_category VARCHAR(50) DEFAULT 'analysis',  -- 'analysis', 'extraction', 'classification'

    -- The edit
    original_value TEXT,
    edited_value TEXT,
    edit_type VARCHAR(20) DEFAULT 'modification',  -- 'modification', 'deletion', 'addition'

    -- Context
    edit_reason TEXT,  -- Optional explanation from user
    time_to_edit_seconds INTEGER,  -- How long user spent before editing

    -- Audit
    edited_by VARCHAR(100),
    edited_at TIMESTAMPTZ DEFAULT NOW(),

    -- For tracking if this was used for training
    used_for_training BOOLEAN DEFAULT FALSE,
    training_batch_id UUID
);

-- Index for finding feedback by submission
CREATE INDEX IF NOT EXISTS idx_ai_feedback_submission
    ON ai_feedback(submission_id);

-- Index for finding feedback by field (for analytics)
CREATE INDEX IF NOT EXISTS idx_ai_feedback_field
    ON ai_feedback(field_name);

-- Index for finding unused training data
CREATE INDEX IF NOT EXISTS idx_ai_feedback_training
    ON ai_feedback(used_for_training)
    WHERE used_for_training = FALSE;

COMMENT ON TABLE ai_feedback IS 'Human corrections to AI-generated content for model improvement';
COMMENT ON COLUMN ai_feedback.field_name IS 'The AI field that was edited (business_summary, cyber_exposures, etc.)';
COMMENT ON COLUMN ai_feedback.time_to_edit_seconds IS 'Time between page load and first edit - indicates review effort';


-- =============================================================================
-- ai_feedback_metrics: Pre-aggregated metrics for dashboards
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_feedback_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Time bucket
    metric_date DATE NOT NULL,

    -- Dimensions
    field_name VARCHAR(100) NOT NULL,

    -- Metrics
    total_generations INTEGER DEFAULT 0,  -- How many times this field was generated
    total_edits INTEGER DEFAULT 0,        -- How many times it was edited
    edit_rate DECIMAL(5,4),               -- edits / generations
    avg_edit_length INTEGER,              -- Average character change

    -- Timestamps
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(metric_date, field_name)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_metrics_date
    ON ai_feedback_metrics(metric_date DESC);

COMMENT ON TABLE ai_feedback_metrics IS 'Daily aggregated feedback metrics for dashboards';


-- =============================================================================
-- outcome_tracking: Track submission outcomes for correlation
-- =============================================================================

CREATE TABLE IF NOT EXISTS outcome_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- AI predictions at time of decision
    ai_decision VARCHAR(20),  -- accept, decline, refer
    ai_confidence DECIMAL(3,2),
    credibility_score INTEGER,

    -- Human decision
    uw_decision VARCHAR(20),
    decision_aligned BOOLEAN,  -- Did UW agree with AI?

    -- Eventual outcome (if bound)
    policy_bound BOOLEAN,
    claims_filed INTEGER DEFAULT 0,
    loss_ratio DECIMAL(5,4),

    -- Timestamps
    decision_at TIMESTAMPTZ,
    policy_effective_date DATE,
    tracked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outcome_tracking_submission
    ON outcome_tracking(submission_id);

COMMENT ON TABLE outcome_tracking IS 'Tracks AI predictions vs outcomes for model calibration';


-- =============================================================================
-- Views for analytics
-- =============================================================================

-- Edit rate by field
CREATE OR REPLACE VIEW v_field_edit_rates AS
SELECT
    field_name,
    COUNT(*) as total_edits,
    COUNT(DISTINCT submission_id) as submissions_edited,
    ROUND(AVG(LENGTH(edited_value) - LENGTH(original_value))::numeric, 0) as avg_length_change,
    ROUND(AVG(time_to_edit_seconds)::numeric, 0) as avg_time_to_edit_seconds
FROM ai_feedback
WHERE edited_at > NOW() - INTERVAL '30 days'
GROUP BY field_name
ORDER BY total_edits DESC;

COMMENT ON VIEW v_field_edit_rates IS 'Which AI fields get edited most in the last 30 days';


-- Daily feedback volume
CREATE OR REPLACE VIEW v_daily_feedback AS
SELECT
    DATE(edited_at) as feedback_date,
    field_name,
    COUNT(*) as edit_count,
    COUNT(DISTINCT submission_id) as unique_submissions
FROM ai_feedback
WHERE edited_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(edited_at), field_name
ORDER BY feedback_date DESC, edit_count DESC;

COMMENT ON VIEW v_daily_feedback IS 'Daily feedback volume by field for trend analysis';


-- AI accuracy by field (based on whether edits were needed)
CREATE OR REPLACE VIEW v_ai_accuracy AS
WITH generation_counts AS (
    -- Count submissions created in last 30 days (proxy for generations)
    SELECT COUNT(*) as total_submissions
    FROM submissions
    WHERE created_at > NOW() - INTERVAL '30 days'
),
edit_counts AS (
    SELECT
        field_name,
        COUNT(DISTINCT submission_id) as edited_submissions
    FROM ai_feedback
    WHERE edited_at > NOW() - INTERVAL '30 days'
    GROUP BY field_name
)
SELECT
    e.field_name,
    e.edited_submissions,
    g.total_submissions,
    ROUND((1 - (e.edited_submissions::numeric / NULLIF(g.total_submissions, 0))) * 100, 1) as accuracy_pct
FROM edit_counts e
CROSS JOIN generation_counts g
ORDER BY accuracy_pct ASC;

COMMENT ON VIEW v_ai_accuracy IS 'Estimated AI accuracy by field (% not needing edits)';


-- Outcome correlation with AI decisions
CREATE OR REPLACE VIEW v_ai_decision_accuracy AS
SELECT
    ai_decision,
    COUNT(*) as total_decisions,
    SUM(CASE WHEN decision_aligned THEN 1 ELSE 0 END) as aligned_with_uw,
    ROUND(AVG(CASE WHEN decision_aligned THEN 1 ELSE 0 END)::numeric * 100, 1) as alignment_rate,
    SUM(CASE WHEN policy_bound THEN 1 ELSE 0 END) as policies_bound,
    ROUND(AVG(COALESCE(loss_ratio, 0))::numeric * 100, 2) as avg_loss_ratio_pct
FROM outcome_tracking
GROUP BY ai_decision
ORDER BY total_decisions DESC;

COMMENT ON VIEW v_ai_decision_accuracy IS 'How often AI decisions align with UW and eventual outcomes';
