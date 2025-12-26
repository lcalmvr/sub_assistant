-- Credibility Scores Table
-- Stores calculated application credibility scores for submissions
-- See docs/conflicts_guide.md for scoring methodology

CREATE TABLE IF NOT EXISTS credibility_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Main score (0-100)
    total_score DECIMAL(5,2) NOT NULL,
    label VARCHAR(20) NOT NULL,  -- excellent, good, fair, poor, very_poor

    -- Dimension scores (0-100 each)
    consistency_score DECIMAL(5,2),
    plausibility_score DECIMAL(5,2),
    completeness_score DECIMAL(5,2),

    -- Summary stats
    issue_count INTEGER DEFAULT 0,

    -- Full score breakdown (JSON)
    score_details JSONB,

    -- Timestamps
    calculated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one score per submission
    CONSTRAINT unique_submission_score UNIQUE (submission_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_credibility_scores_submission
    ON credibility_scores(submission_id);

-- Index for filtering by score range
CREATE INDEX IF NOT EXISTS idx_credibility_scores_total
    ON credibility_scores(total_score);

-- Index for filtering by label
CREATE INDEX IF NOT EXISTS idx_credibility_scores_label
    ON credibility_scores(label);

COMMENT ON TABLE credibility_scores IS 'Application credibility scores measuring consistency, plausibility, and completeness';
COMMENT ON COLUMN credibility_scores.total_score IS 'Combined weighted score (0-100)';
COMMENT ON COLUMN credibility_scores.consistency_score IS 'Score for internal answer consistency (40% weight)';
COMMENT ON COLUMN credibility_scores.plausibility_score IS 'Score for business context plausibility (35% weight)';
COMMENT ON COLUMN credibility_scores.completeness_score IS 'Score for answer quality/completeness (25% weight)';
COMMENT ON COLUMN credibility_scores.score_details IS 'Full breakdown including all issues found';
