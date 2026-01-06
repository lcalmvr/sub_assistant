-- =============================================================================
-- Remarket Analytics (Phase 7.6)
--
-- Views and functions for analyzing remarket performance:
-- - Win rate comparison (remarket vs new business)
-- - Time-to-remarket metrics
-- - Return reason analysis
-- =============================================================================

-- =============================================================================
-- View: v_remarket_performance
--
-- Compares win rates between remarkets and new business
-- =============================================================================

CREATE OR REPLACE VIEW v_remarket_performance AS
WITH submission_stats AS (
    SELECT
        s.id,
        s.applicant_name,
        s.date_received,
        s.submission_status,
        s.submission_outcome,
        s.outcome_reason,
        s.prior_submission_id,
        s.remarket_match_type,
        CASE
            WHEN s.prior_submission_id IS NOT NULL THEN 'remarket'
            ELSE 'new_business'
        END as submission_type,
        -- Get quoted premium
        (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = s.id) as quoted_premium,
        (SELECT SUM(it.sold_premium) FROM insurance_towers it WHERE it.submission_id = s.id AND it.is_bound = true) as bound_premium,
        -- Prior submission info
        ps.date_received as prior_date,
        ps.submission_outcome as prior_outcome,
        (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = ps.id) as prior_quoted_premium
    FROM submissions s
    LEFT JOIN submissions ps ON ps.id = s.prior_submission_id
    WHERE s.submission_outcome IS NOT NULL
      AND s.submission_outcome != 'pending'
)
SELECT
    submission_type,
    COUNT(*) as total_submissions,
    COUNT(*) FILTER (WHERE submission_outcome = 'bound') as bound_count,
    COUNT(*) FILTER (WHERE submission_outcome = 'lost') as lost_count,
    COUNT(*) FILTER (WHERE submission_outcome = 'declined') as declined_count,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE submission_outcome = 'bound') / NULLIF(COUNT(*), 0),
        1
    ) as win_rate_pct,
    ROUND(AVG(bound_premium) FILTER (WHERE submission_outcome = 'bound'), 0) as avg_bound_premium,
    ROUND(AVG(quoted_premium), 0) as avg_quoted_premium
FROM submission_stats
GROUP BY submission_type;

COMMENT ON VIEW v_remarket_performance IS 'Win rate comparison between remarkets and new business';

-- =============================================================================
-- View: v_remarket_time_analysis
--
-- Analyzes time between original submission and remarket
-- =============================================================================

CREATE OR REPLACE VIEW v_remarket_time_analysis AS
SELECT
    s.id,
    s.applicant_name,
    s.date_received as remarket_date,
    ps.date_received as original_date,
    s.submission_outcome,
    s.remarket_match_type,
    -- Time metrics
    EXTRACT(days FROM (s.date_received - ps.date_received)) as days_between,
    EXTRACT(days FROM (s.date_received - ps.date_received)) / 30.0 as months_between,
    EXTRACT(days FROM (s.date_received - ps.date_received)) / 365.0 as years_between,
    -- Premium comparison
    (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = ps.id) as original_quoted,
    (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = s.id) as remarket_quoted,
    ps.submission_outcome as original_outcome
FROM submissions s
JOIN submissions ps ON ps.id = s.prior_submission_id
WHERE s.prior_submission_id IS NOT NULL
ORDER BY s.date_received DESC;

COMMENT ON VIEW v_remarket_time_analysis IS 'Time analysis between original and remarket submissions';

-- =============================================================================
-- View: v_remarket_return_reasons
--
-- Analyzes why accounts come back (based on prior outcome reasons)
-- =============================================================================

CREATE OR REPLACE VIEW v_remarket_return_reasons AS
WITH remarket_outcomes AS (
    SELECT
        s.id,
        s.applicant_name,
        s.submission_outcome as remarket_outcome,
        ps.submission_outcome as prior_outcome,
        ps.outcome_reason as prior_reason,
        -- Categorize why they might have returned
        CASE
            WHEN ps.outcome_reason ILIKE '%price%' THEN 'price'
            WHEN ps.outcome_reason ILIKE '%coverage%' OR ps.outcome_reason ILIKE '%terms%' THEN 'coverage'
            WHEN ps.outcome_reason ILIKE '%competitor%' OR ps.outcome_reason ILIKE '%incumbent%' THEN 'competitor'
            WHEN ps.outcome_reason ILIKE '%no response%' THEN 'no_response'
            WHEN ps.submission_outcome = 'declined' THEN 'we_declined'
            ELSE 'other'
        END as return_category
    FROM submissions s
    JOIN submissions ps ON ps.id = s.prior_submission_id
    WHERE s.prior_submission_id IS NOT NULL
)
SELECT
    return_category,
    COUNT(*) as total_returns,
    COUNT(*) FILTER (WHERE remarket_outcome = 'bound') as converted_count,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE remarket_outcome = 'bound') / NULLIF(COUNT(*), 0),
        1
    ) as conversion_rate_pct,
    -- Sample reasons
    (SELECT prior_reason FROM remarket_outcomes ro2
     WHERE ro2.return_category = remarket_outcomes.return_category
     AND ro2.prior_reason IS NOT NULL
     LIMIT 1) as sample_reason
FROM remarket_outcomes
GROUP BY return_category
ORDER BY total_returns DESC;

COMMENT ON VIEW v_remarket_return_reasons IS 'Analysis of why accounts return after prior loss/decline';

-- =============================================================================
-- Function: get_remarket_analytics
--
-- Returns comprehensive remarket analytics as JSON
-- =============================================================================

CREATE OR REPLACE FUNCTION get_remarket_analytics()
RETURNS JSONB AS $$
DECLARE
    v_performance JSONB;
    v_time_stats JSONB;
    v_return_reasons JSONB;
    v_recent_remarkets JSONB;
    v_summary JSONB;
BEGIN
    -- Performance comparison
    SELECT jsonb_agg(row_to_json(v)::jsonb)
    INTO v_performance
    FROM v_remarket_performance v;

    -- Time statistics
    SELECT jsonb_build_object(
        'avg_days_between', ROUND(AVG(days_between)),
        'avg_months_between', ROUND(AVG(months_between), 1),
        'min_days', MIN(days_between),
        'max_days', MAX(days_between),
        'total_remarkets', COUNT(*)
    )
    INTO v_time_stats
    FROM v_remarket_time_analysis;

    -- Return reasons
    SELECT jsonb_agg(row_to_json(v)::jsonb)
    INTO v_return_reasons
    FROM v_remarket_return_reasons v;

    -- Recent remarkets (last 10)
    SELECT jsonb_agg(row_to_json(v)::jsonb)
    INTO v_recent_remarkets
    FROM (
        SELECT
            id,
            applicant_name,
            remarket_date,
            submission_outcome,
            days_between,
            original_quoted,
            remarket_quoted
        FROM v_remarket_time_analysis
        ORDER BY remarket_date DESC
        LIMIT 10
    ) v;

    -- Summary stats
    SELECT jsonb_build_object(
        'total_submissions', COUNT(*),
        'total_remarkets', COUNT(*) FILTER (WHERE prior_submission_id IS NOT NULL),
        'remarket_pct', ROUND(100.0 * COUNT(*) FILTER (WHERE prior_submission_id IS NOT NULL) / NULLIF(COUNT(*), 0), 1),
        'remarkets_bound', COUNT(*) FILTER (WHERE prior_submission_id IS NOT NULL AND submission_outcome = 'bound'),
        'new_business_bound', COUNT(*) FILTER (WHERE prior_submission_id IS NULL AND submission_outcome = 'bound')
    )
    INTO v_summary
    FROM submissions
    WHERE submission_outcome IS NOT NULL AND submission_outcome != 'pending';

    RETURN jsonb_build_object(
        'summary', v_summary,
        'performance', COALESCE(v_performance, '[]'::jsonb),
        'time_stats', COALESCE(v_time_stats, '{}'::jsonb),
        'return_reasons', COALESCE(v_return_reasons, '[]'::jsonb),
        'recent_remarkets', COALESCE(v_recent_remarkets, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_remarket_analytics IS 'Returns comprehensive remarket analytics as JSON';

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_remarket_performance') THEN
        RAISE NOTICE 'SUCCESS: v_remarket_performance view created';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_remarket_time_analysis') THEN
        RAISE NOTICE 'SUCCESS: v_remarket_time_analysis view created';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_remarket_return_reasons') THEN
        RAISE NOTICE 'SUCCESS: v_remarket_return_reasons view created';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_remarket_analytics') THEN
        RAISE NOTICE 'SUCCESS: get_remarket_analytics function created';
    END IF;
END $$;
