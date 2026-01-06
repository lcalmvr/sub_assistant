-- =============================================================================
-- Decision Snapshots: Renewal Extensions
--
-- Adds fields to track renewal-specific context at decision time:
-- - Link to prior year's snapshot
-- - Loss ratio at decision time
-- - Rate change from prior year
--
-- This enables tracking how loss experience influenced renewal decisions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add renewal-specific columns to decision_snapshots
-- -----------------------------------------------------------------------------

ALTER TABLE decision_snapshots
ADD COLUMN IF NOT EXISTS prior_snapshot_id UUID REFERENCES decision_snapshots(id);

ALTER TABLE decision_snapshots
ADD COLUMN IF NOT EXISTS loss_ratio_at_decision DECIMAL(10, 4);

ALTER TABLE decision_snapshots
ADD COLUMN IF NOT EXISTS renewal_rate_change_pct DECIMAL(10, 2);

ALTER TABLE decision_snapshots
ADD COLUMN IF NOT EXISTS prior_submission_id UUID REFERENCES submissions(id);

ALTER TABLE decision_snapshots
ADD COLUMN IF NOT EXISTS renewal_data JSONB;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_prior ON decision_snapshots(prior_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_prior_submission ON decision_snapshots(prior_submission_id);

-- Comments
COMMENT ON COLUMN decision_snapshots.prior_snapshot_id IS 'Link to the bind snapshot from the prior policy year';
COMMENT ON COLUMN decision_snapshots.loss_ratio_at_decision IS 'Incurred loss ratio on prior policy at time of renewal decision';
COMMENT ON COLUMN decision_snapshots.renewal_rate_change_pct IS 'Premium change from prior year as percentage (+10.5 = 10.5% increase)';
COMMENT ON COLUMN decision_snapshots.prior_submission_id IS 'The prior policy submission this renewal is linked to';
COMMENT ON COLUMN decision_snapshots.renewal_data IS 'Additional renewal context (experience factors, exposure changes, etc)';


-- -----------------------------------------------------------------------------
-- 2. Updated function to capture renewal context
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION capture_renewal_decision_snapshot(
    p_submission_id UUID,
    p_quote_id UUID,
    p_decision_type VARCHAR(50),
    p_decision_by VARCHAR(255) DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
    v_prior_submission_id UUID;
    v_prior_snapshot_id UUID;
    v_prior_premium DECIMAL;
    v_current_premium DECIMAL;
    v_loss_ratio DECIMAL;
    v_rate_change DECIMAL;
    v_renewal_data JSONB;
    v_extracted_values JSONB;
    v_content_hash VARCHAR(32);
    v_gap_analysis JSONB;
    v_importance_version_id UUID;
BEGIN
    -- Get prior submission (if this is a renewal)
    SELECT prior_submission_id INTO v_prior_submission_id
    FROM submissions
    WHERE id = p_submission_id;

    -- If not a renewal, use standard capture function
    IF v_prior_submission_id IS NULL THEN
        RETURN capture_decision_snapshot(p_submission_id, p_quote_id, p_decision_type, p_decision_by);
    END IF;

    -- Get prior year's bind snapshot
    SELECT ds.id INTO v_prior_snapshot_id
    FROM decision_snapshots ds
    JOIN insurance_towers t ON t.bind_snapshot_id = ds.id
    WHERE t.submission_id = v_prior_submission_id
      AND t.is_bound = TRUE
    LIMIT 1;

    -- Get prior premium (from bound tower)
    SELECT sold_premium INTO v_prior_premium
    FROM insurance_towers
    WHERE submission_id = v_prior_submission_id AND is_bound = TRUE
    LIMIT 1;

    -- Get current premium (from the quote being bound)
    SELECT COALESCE(sold_premium, quoted_premium) INTO v_current_premium
    FROM insurance_towers
    WHERE id = p_quote_id;

    -- Calculate loss ratio on prior policy
    SELECT
        CASE
            WHEN COALESCE(t.sold_premium, 0) > 0
            THEN COALESCE(SUM(COALESCE(lh.paid_amount, 0) + COALESCE(lh.reserve_amount, 0)), 0) / t.sold_premium
            ELSE 0
        END INTO v_loss_ratio
    FROM insurance_towers t
    LEFT JOIN loss_history lh ON lh.submission_id = t.submission_id
    WHERE t.submission_id = v_prior_submission_id AND t.is_bound = TRUE
    GROUP BY t.sold_premium;

    -- Calculate rate change
    IF v_prior_premium IS NOT NULL AND v_prior_premium > 0 AND v_current_premium IS NOT NULL THEN
        v_rate_change := ROUND(((v_current_premium - v_prior_premium) / v_prior_premium) * 100, 2);
    END IF;

    -- Build renewal context data
    v_renewal_data := jsonb_build_object(
        'prior_premium', v_prior_premium,
        'current_premium', v_current_premium,
        'claim_count_prior_term', (
            SELECT COUNT(*) FROM loss_history WHERE submission_id = v_prior_submission_id
        ),
        'total_paid_prior_term', (
            SELECT COALESCE(SUM(paid_amount), 0) FROM loss_history WHERE submission_id = v_prior_submission_id
        ),
        'total_incurred_prior_term', (
            SELECT COALESCE(SUM(COALESCE(paid_amount, 0) + COALESCE(reserve_amount, 0)), 0)
            FROM loss_history WHERE submission_id = v_prior_submission_id
        )
    );

    -- Get active importance version
    SELECT id INTO v_importance_version_id
    FROM importance_versions
    WHERE is_active = true
    LIMIT 1;

    -- Calculate content hash
    SELECT md5(
        COALESCE(
            (SELECT string_agg(
                field_key || ':' || COALESCE(value, '') || ':' || COALESCE(status, ''),
                '|' ORDER BY field_key
            )
            FROM submission_extracted_values
            WHERE submission_id = p_submission_id),
            ''
        )
    ) INTO v_content_hash;

    -- Capture extracted values snapshot
    SELECT jsonb_object_agg(
        sev.field_key,
        jsonb_build_object(
            'value', sev.value,
            'status', sev.status,
            'source_type', sev.source_type,
            'confidence', sev.confidence,
            'updated_at', sev.updated_at
        )
    )
    INTO v_extracted_values
    FROM submission_extracted_values sev
    WHERE sev.submission_id = p_submission_id;

    -- Capture gap analysis
    SELECT jsonb_build_object(
        'critical_missing', (
            SELECT jsonb_agg(jsonb_build_object(
                'field_key', sf.key,
                'field_name', sf.display_name,
                'status', COALESCE(sev.status, 'not_asked')
            ))
            FROM schema_fields sf
            JOIN field_importance_settings fis ON fis.field_key = sf.key
            JOIN importance_versions iv ON iv.id = fis.version_id AND iv.is_active = true
            LEFT JOIN submission_extracted_values sev
                ON sev.field_key = sf.key AND sev.submission_id = p_submission_id
            WHERE fis.importance = 'critical'
              AND COALESCE(sev.status, 'not_asked') != 'present'
        ),
        'important_missing', (
            SELECT jsonb_agg(jsonb_build_object(
                'field_key', sf.key,
                'field_name', sf.display_name,
                'status', COALESCE(sev.status, 'not_asked')
            ))
            FROM schema_fields sf
            JOIN field_importance_settings fis ON fis.field_key = sf.key
            JOIN importance_versions iv ON iv.id = fis.version_id AND iv.is_active = true
            LEFT JOIN submission_extracted_values sev
                ON sev.field_key = sf.key AND sev.submission_id = p_submission_id
            WHERE fis.importance = 'important'
              AND COALESCE(sev.status, 'not_asked') != 'present'
        ),
        'critical_present_count', (
            SELECT COUNT(*)
            FROM schema_fields sf
            JOIN field_importance_settings fis ON fis.field_key = sf.key
            JOIN importance_versions iv ON iv.id = fis.version_id AND iv.is_active = true
            JOIN submission_extracted_values sev
                ON sev.field_key = sf.key AND sev.submission_id = p_submission_id
            WHERE fis.importance = 'critical'
              AND sev.status = 'present'
        ),
        'important_present_count', (
            SELECT COUNT(*)
            FROM schema_fields sf
            JOIN field_importance_settings fis ON fis.field_key = sf.key
            JOIN importance_versions iv ON iv.id = fis.version_id AND iv.is_active = true
            JOIN submission_extracted_values sev
                ON sev.field_key = sf.key AND sev.submission_id = p_submission_id
            WHERE fis.importance = 'important'
              AND sev.status = 'present'
        )
    )
    INTO v_gap_analysis;

    -- Insert snapshot with renewal context
    INSERT INTO decision_snapshots (
        submission_id,
        quote_id,
        decision_type,
        decision_by,
        extracted_values,
        gap_analysis,
        importance_version_id,
        content_hash,
        -- Renewal-specific fields
        prior_submission_id,
        prior_snapshot_id,
        loss_ratio_at_decision,
        renewal_rate_change_pct,
        renewal_data
    ) VALUES (
        p_submission_id,
        p_quote_id,
        p_decision_type,
        p_decision_by,
        COALESCE(v_extracted_values, '{}'::jsonb),
        v_gap_analysis,
        v_importance_version_id,
        v_content_hash,
        -- Renewal-specific values
        v_prior_submission_id,
        v_prior_snapshot_id,
        v_loss_ratio,
        v_rate_change,
        v_renewal_data
    )
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION capture_renewal_decision_snapshot IS 'Capture snapshot with renewal context (prior link, loss ratio, rate change)';


-- -----------------------------------------------------------------------------
-- 3. Renewal Decision History View
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_renewal_decision_history AS
WITH RECURSIVE renewal_chain AS (
    -- Base: Start with submissions that have no renewals (end of chain)
    SELECT
        s.id as submission_id,
        s.applicant_name,
        s.prior_submission_id,
        1 as chain_position,
        s.id as chain_head
    FROM submissions s
    WHERE NOT EXISTS (
        SELECT 1 FROM submissions r WHERE r.prior_submission_id = s.id
    )
    AND s.submission_outcome = 'bound'

    UNION ALL

    -- Recursive: Walk back through prior submissions
    SELECT
        s.id,
        s.applicant_name,
        s.prior_submission_id,
        rc.chain_position + 1,
        rc.chain_head
    FROM submissions s
    JOIN renewal_chain rc ON s.id = rc.prior_submission_id
    WHERE s.submission_outcome = 'bound'
)
SELECT
    rc.chain_head,
    rc.submission_id,
    rc.applicant_name,
    rc.chain_position,
    ds.id as snapshot_id,
    ds.decision_type,
    ds.decision_at,
    ds.prior_snapshot_id,
    ds.loss_ratio_at_decision,
    ds.renewal_rate_change_pct,
    ds.renewal_data,
    t.sold_premium,
    t.quote_name,
    s.effective_date,
    s.expiration_date,
    -- Aggregate loss info
    (ds.renewal_data->>'claim_count_prior_term')::int as claims_prior_term,
    (ds.renewal_data->>'total_paid_prior_term')::numeric as paid_prior_term,
    (ds.renewal_data->>'total_incurred_prior_term')::numeric as incurred_prior_term
FROM renewal_chain rc
JOIN submissions s ON s.id = rc.submission_id
LEFT JOIN decision_snapshots ds ON ds.submission_id = rc.submission_id
    AND ds.decision_type = 'policy_bound'
LEFT JOIN insurance_towers t ON t.submission_id = rc.submission_id AND t.is_bound = TRUE
ORDER BY rc.chain_head, rc.chain_position DESC;

COMMENT ON VIEW v_renewal_decision_history IS 'Decision snapshots across renewal chains showing loss ratios and rate changes';


-- -----------------------------------------------------------------------------
-- 4. Summary View for Account Renewals
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_account_renewal_summary AS
SELECT
    chain_head,
    applicant_name,
    COUNT(*) as policy_years,
    MIN(effective_date) as first_policy_date,
    MAX(effective_date) as latest_policy_date,
    -- Premium progression
    MIN(sold_premium) as min_premium,
    MAX(sold_premium) as max_premium,
    SUM(sold_premium) as total_premium_collected,
    -- Loss experience
    SUM(claims_prior_term) as total_claims,
    SUM(paid_prior_term) as total_paid_losses,
    SUM(incurred_prior_term) as total_incurred_losses,
    -- Average loss ratio
    CASE
        WHEN SUM(sold_premium) > 0
        THEN ROUND(SUM(incurred_prior_term) / SUM(sold_premium) * 100, 1)
        ELSE 0
    END as lifetime_loss_ratio_pct,
    -- Rate changes
    AVG(renewal_rate_change_pct) as avg_rate_change_pct
FROM v_renewal_decision_history
GROUP BY chain_head, applicant_name
HAVING COUNT(*) > 1
ORDER BY policy_years DESC, total_premium_collected DESC;

COMMENT ON VIEW v_account_renewal_summary IS 'Aggregated renewal history per account showing lifetime loss ratio and premium trends';


-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'decision_snapshots' AND column_name = 'prior_snapshot_id'
    ) THEN
        RAISE NOTICE 'SUCCESS: prior_snapshot_id column added to decision_snapshots';
    ELSE
        RAISE WARNING 'WARNING: prior_snapshot_id column not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'decision_snapshots' AND column_name = 'loss_ratio_at_decision'
    ) THEN
        RAISE NOTICE 'SUCCESS: loss_ratio_at_decision column added';
    ELSE
        RAISE WARNING 'WARNING: loss_ratio_at_decision column not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_name = 'capture_renewal_decision_snapshot'
    ) THEN
        RAISE NOTICE 'SUCCESS: capture_renewal_decision_snapshot function created';
    ELSE
        RAISE WARNING 'WARNING: capture_renewal_decision_snapshot function not found';
    END IF;
END $$;
