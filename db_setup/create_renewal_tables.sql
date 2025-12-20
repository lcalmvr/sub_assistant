-- ============================================
-- Phase 2: Renewal Management & Bound Option Tracking
-- ============================================

-- ============================================
-- 1. BOUND OPTION TRACKING ON INSURANCE_TOWERS
-- ============================================

-- Track which quote option was actually bound
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS is_bound BOOLEAN DEFAULT FALSE;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS bound_at TIMESTAMP;
ALTER TABLE insurance_towers ADD COLUMN IF NOT EXISTS bound_by TEXT;

-- Ensure only one bound option per submission (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_bound_per_submission
ON insurance_towers(submission_id) WHERE is_bound = TRUE;

-- ============================================
-- 2. RENEWAL FIELDS ON SUBMISSIONS
-- ============================================

-- Link to prior year submission (for renewal chain)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS prior_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL;

-- Renewal type: 'new_business' or 'renewal'
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS renewal_type TEXT DEFAULT 'new_business';

-- Policy effective dates (needed for renewal timing)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Data source tracking (for carryover vs AI vs manual)
-- Structure: {"coverage_limits": "carried_over", "business_summary": "ai_extracted", ...}
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '{}'::jsonb;

-- Indexes for renewal queries
CREATE INDEX IF NOT EXISTS idx_submissions_prior ON submissions(prior_submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_expiration ON submissions(expiration_date);
CREATE INDEX IF NOT EXISTS idx_submissions_renewal_type ON submissions(renewal_type);

-- ============================================
-- 3. HELPFUL VIEWS FOR REPORTING
-- ============================================

-- View: Upcoming renewals (policies expiring in next 90 days)
CREATE OR REPLACE VIEW v_upcoming_renewals AS
SELECT
    s.id,
    s.applicant_name,
    s.expiration_date,
    s.expiration_date - CURRENT_DATE as days_until_expiry,
    a.name as account_name,
    t.sold_premium as current_premium,
    t.quote_name as bound_option
FROM submissions s
LEFT JOIN accounts a ON a.id = s.account_id
LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
WHERE s.submission_outcome = 'bound'
AND s.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
ORDER BY s.expiration_date;

-- View: Renewal retention metrics
CREATE OR REPLACE VIEW v_renewal_metrics AS
SELECT
    DATE_TRUNC('month', s.date_received) as month,
    COUNT(*) FILTER (WHERE s.submission_status NOT IN ('renewal_expected')) as renewals_received,
    COUNT(*) FILTER (WHERE s.submission_outcome = 'bound') as renewals_bound,
    COUNT(*) FILTER (WHERE s.submission_outcome = 'lost') as renewals_lost,
    COUNT(*) FILTER (WHERE s.submission_status = 'renewal_not_received') as renewals_not_received,
    ROUND(
        COUNT(*) FILTER (WHERE s.submission_outcome = 'bound')::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE s.submission_status NOT IN ('renewal_expected')), 0) * 100,
        1
    ) as retention_rate_pct
FROM submissions s
WHERE s.renewal_type = 'renewal'
GROUP BY DATE_TRUNC('month', s.date_received)
ORDER BY month DESC;
