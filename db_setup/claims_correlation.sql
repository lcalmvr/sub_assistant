-- =============================================================================
-- Phase 5: Claims Correlation Analytics
--
-- Correlates bind-time security controls with claims outcomes to identify
-- which controls actually reduce losses. Enables data-driven importance updates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Materialized View: Pre-aggregate claims by bound policy
-- Joins decision_snapshots (policy_bound) with loss_history for fast analytics
-- -----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_claims_by_control AS
WITH bound_policies AS (
    SELECT
        ds.submission_id,
        ds.quote_id,
        ds.decision_at as bound_at,
        ds.extracted_values,
        ds.importance_version_id,
        t.sold_premium,
        t.id as tower_id
    FROM decision_snapshots ds
    JOIN insurance_towers t ON t.id = ds.quote_id AND t.is_bound = true
    WHERE ds.decision_type = 'policy_bound'
),
policy_losses AS (
    SELECT
        submission_id,
        COUNT(*) as claim_count,
        COALESCE(SUM(paid_amount), 0) as total_paid,
        COALESCE(SUM(COALESCE(paid_amount, 0) + COALESCE(reserve_amount, 0)), 0) as total_incurred
    FROM loss_history
    GROUP BY submission_id
)
SELECT
    bp.submission_id,
    bp.quote_id,
    bp.bound_at,
    bp.sold_premium,
    bp.importance_version_id,
    bp.extracted_values,
    COALESCE(pl.claim_count, 0) as claim_count,
    COALESCE(pl.total_paid, 0) as total_paid,
    COALESCE(pl.total_incurred, 0) as total_incurred,
    CASE WHEN bp.sold_premium > 0
         THEN COALESCE(pl.total_incurred, 0) / bp.sold_premium
         ELSE NULL END as loss_ratio
FROM bound_policies bp
LEFT JOIN policy_losses pl ON pl.submission_id = bp.submission_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_claims_by_control_sub
ON mv_claims_by_control(submission_id);

CREATE INDEX IF NOT EXISTS idx_mv_claims_by_control_bound
ON mv_claims_by_control(bound_at);


-- -----------------------------------------------------------------------------
-- 2. Refresh Function
-- Call periodically (e.g., daily) to update the materialized view
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_claims_correlation()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_claims_by_control;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_claims_correlation IS 'Refresh the claims correlation materialized view. Run daily.';


-- -----------------------------------------------------------------------------
-- 3. Function: Calculate Control Impact (Loss Ratio Lift)
-- Compares loss ratios for policies with vs without a specific control
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calculate_control_impact(
    p_field_key TEXT,
    p_min_sample_size INT DEFAULT 10,
    p_min_exposure_months INT DEFAULT 12
)
RETURNS TABLE (
    field_key TEXT,
    value_present_count INT,
    value_absent_count INT,
    loss_ratio_with NUMERIC,
    loss_ratio_without NUMERIC,
    lift_pct NUMERIC,
    statistical_confidence TEXT,
    premium_with NUMERIC,
    premium_without NUMERIC
) AS $$
DECLARE
    v_cutoff_date DATE;
BEGIN
    -- Only include policies with at least p_min_exposure_months of exposure
    v_cutoff_date := CURRENT_DATE - (p_min_exposure_months || ' months')::INTERVAL;

    RETURN QUERY
    WITH control_data AS (
        SELECT
            mc.submission_id,
            mc.sold_premium,
            mc.loss_ratio,
            mc.claim_count,
            mc.total_incurred,
            mc.bound_at,
            -- Extract the control value (handle nested JSONB structure)
            CASE
                WHEN mc.extracted_values->p_field_key->>'value' IS NOT NULL
                THEN mc.extracted_values->p_field_key->>'value'
                WHEN mc.extracted_values->>p_field_key IS NOT NULL
                THEN mc.extracted_values->>p_field_key
                ELSE NULL
            END as control_value,
            COALESCE(
                mc.extracted_values->p_field_key->>'status',
                CASE WHEN mc.extracted_values ? p_field_key THEN 'present' ELSE 'not_asked' END
            ) as control_status
        FROM mv_claims_by_control mc
        WHERE mc.bound_at < v_cutoff_date
    ),
    with_control AS (
        SELECT * FROM control_data
        WHERE control_status = 'present'
          AND LOWER(control_value) IN ('true', 'yes', '1')
    ),
    without_control AS (
        SELECT * FROM control_data
        WHERE control_status = 'present'
          AND LOWER(control_value) IN ('false', 'no', '0')
    ),
    stats AS (
        SELECT
            (SELECT COUNT(*) FROM with_control) as with_count,
            (SELECT COUNT(*) FROM without_control) as without_count,
            (SELECT SUM(total_incurred) / NULLIF(SUM(sold_premium), 0) FROM with_control) as lr_with,
            (SELECT SUM(total_incurred) / NULLIF(SUM(sold_premium), 0) FROM without_control) as lr_without,
            (SELECT SUM(sold_premium) FROM with_control) as prem_with,
            (SELECT SUM(sold_premium) FROM without_control) as prem_without
    )
    SELECT
        p_field_key,
        s.with_count::INT,
        s.without_count::INT,
        ROUND(s.lr_with, 4),
        ROUND(s.lr_without, 4),
        CASE WHEN s.lr_without > 0 AND s.lr_with IS NOT NULL THEN
            ROUND((1 - (s.lr_with / s.lr_without)) * 100, 1)
        ELSE NULL END,
        CASE
            WHEN s.with_count >= p_min_sample_size AND s.without_count >= p_min_sample_size
            THEN 'high'
            WHEN s.with_count >= p_min_sample_size / 2 AND s.without_count >= p_min_sample_size / 2
            THEN 'medium'
            ELSE 'low'
        END,
        ROUND(s.prem_with, 0),
        ROUND(s.prem_without, 0)
    FROM stats s
    WHERE s.with_count > 0 OR s.without_count > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_control_impact IS 'Calculate loss ratio lift for a specific control field. Positive lift = control reduces losses.';


-- -----------------------------------------------------------------------------
-- 4. View: Loss Ratio by Importance Version
-- Compares portfolio performance across different importance configurations
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_loss_ratio_by_version AS
SELECT
    iv.id as version_id,
    iv.version_number,
    iv.name as version_name,
    iv.is_active,
    iv.created_at as version_created,
    iv.based_on_claims_through,
    COUNT(DISTINCT mc.submission_id) as policy_count,
    COALESCE(SUM(mc.sold_premium), 0) as total_premium,
    COALESCE(SUM(mc.total_incurred), 0) as total_incurred,
    COALESCE(SUM(mc.claim_count), 0) as total_claims,
    CASE WHEN SUM(mc.sold_premium) > 0
         THEN ROUND(SUM(mc.total_incurred) / SUM(mc.sold_premium), 4)
         ELSE NULL END as aggregate_loss_ratio,
    ROUND(AVG(mc.loss_ratio) FILTER (WHERE mc.loss_ratio IS NOT NULL), 4) as avg_loss_ratio
FROM importance_versions iv
LEFT JOIN mv_claims_by_control mc ON mc.importance_version_id = iv.id
GROUP BY iv.id, iv.version_number, iv.name, iv.is_active, iv.created_at, iv.based_on_claims_through
ORDER BY iv.version_number;

COMMENT ON VIEW v_loss_ratio_by_version IS 'Compare portfolio loss ratios across different importance version configurations';


-- -----------------------------------------------------------------------------
-- 5. View: Overall Claims Analytics Summary
-- Dashboard-level metrics
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_claims_analytics_summary AS
SELECT
    COUNT(DISTINCT submission_id) as total_bound_policies,
    COALESCE(SUM(sold_premium), 0) as total_earned_premium,
    COALESCE(SUM(claim_count), 0) as total_claims,
    COALESCE(SUM(total_incurred), 0) as total_incurred,
    -- Aggregate loss ratio (total incurred / total premium)
    CASE WHEN SUM(sold_premium) > 0
         THEN ROUND((SUM(total_incurred) / SUM(sold_premium))::NUMERIC, 4)
         ELSE NULL END as loss_ratio,
    COUNT(*) FILTER (WHERE claim_count > 0) as policies_with_claims,
    ROUND((100.0 * COUNT(*) FILTER (WHERE claim_count > 0) / NULLIF(COUNT(*), 0))::NUMERIC, 1) as claim_frequency_pct
FROM mv_claims_by_control;

COMMENT ON VIEW v_claims_analytics_summary IS 'Overall claims analytics summary for dashboard';


-- -----------------------------------------------------------------------------
-- 6. Table: Claims Correlation Recommendations
-- Stores AI/system-generated recommendations for importance changes
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS claims_correlation_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Analysis metadata
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analyzed_by VARCHAR(100) DEFAULT 'system',
    claims_through DATE,
    min_sample_size INT DEFAULT 10,
    min_exposure_months INT DEFAULT 12,

    -- Recommendations (JSONB array)
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Structure: [{
    --   field_key, field_name, current_importance, recommended_importance,
    --   lift_pct, sample_size, confidence, rationale
    -- }]

    -- Summary stats
    total_fields_analyzed INT,
    fields_with_changes INT,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',  -- pending, reviewed, applied, rejected
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    -- If applied, link to new version
    applied_version_id UUID REFERENCES importance_versions(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_recs_status ON claims_correlation_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_claims_recs_analyzed ON claims_correlation_recommendations(analyzed_at DESC);

COMMENT ON TABLE claims_correlation_recommendations IS 'Stores generated recommendations for importance weight changes based on claims correlation';


-- -----------------------------------------------------------------------------
-- 7. Permissions
-- -----------------------------------------------------------------------------

GRANT SELECT ON mv_claims_by_control TO authenticated;
GRANT SELECT ON v_loss_ratio_by_version TO authenticated;
GRANT SELECT ON v_claims_analytics_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE ON claims_correlation_recommendations TO authenticated;


-- -----------------------------------------------------------------------------
-- 8. Verification
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_claims_by_control') THEN
        RAISE NOTICE 'SUCCESS: mv_claims_by_control materialized view created';
    ELSE
        RAISE WARNING 'WARNING: mv_claims_by_control not found';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'claims_correlation_recommendations') THEN
        RAISE NOTICE 'SUCCESS: claims_correlation_recommendations table created';
    ELSE
        RAISE WARNING 'WARNING: claims_correlation_recommendations table not found';
    END IF;
END $$;
