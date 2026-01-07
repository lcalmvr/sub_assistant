-- ============================================================================
-- EXPIRING TOWERS: Incumbent/Expiring Coverage Tracking
-- ============================================================================
--
-- Captures snapshot of expiring coverage for renewals to enable:
-- - Side-by-side comparison: Expiring vs Proposed
-- - Incumbent carrier tracking
-- - Premium/coverage change analysis
-- - Win/loss tracking by incumbent
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS expiring_towers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    prior_submission_id UUID REFERENCES submissions(id),  -- Source of data (if from prior)

    -- Incumbent Info
    incumbent_carrier VARCHAR(200),
    policy_number VARCHAR(100),
    expiration_date DATE,

    -- Coverage Terms (snapshot)
    tower_json JSONB,              -- Full layer structure (same format as insurance_towers)
    total_limit NUMERIC,           -- Aggregate limit
    primary_retention NUMERIC,
    premium NUMERIC,               -- Annual premium
    policy_form TEXT,              -- cyber, cyber_tech, tech
    sublimits JSONB,               -- Sublimit schedule

    -- Metadata
    source TEXT DEFAULT 'prior_submission',  -- 'prior_submission', 'manual', 'document_extract'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by VARCHAR(100),

    CONSTRAINT unique_expiring_per_submission UNIQUE (submission_id)
);

-- Index for fast lookup by submission
CREATE INDEX IF NOT EXISTS idx_expiring_towers_submission
    ON expiring_towers(submission_id);

-- Index for incumbent carrier analytics
CREATE INDEX IF NOT EXISTS idx_expiring_towers_carrier
    ON expiring_towers(incumbent_carrier)
    WHERE incumbent_carrier IS NOT NULL;

-- ============================================================================
-- Helper Function: Get Tower Comparison
-- ============================================================================
-- Returns expiring vs proposed comparison data for a submission

CREATE OR REPLACE FUNCTION get_tower_comparison(p_submission_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_expiring RECORD;
    v_proposed RECORD;
    v_result JSONB;
BEGIN
    -- Get expiring tower
    SELECT
        et.incumbent_carrier,
        et.total_limit as expiring_limit,
        et.primary_retention as expiring_retention,
        et.premium as expiring_premium,
        et.policy_form as expiring_form,
        et.expiration_date,
        et.tower_json as expiring_tower_json
    INTO v_expiring
    FROM expiring_towers et
    WHERE et.submission_id = p_submission_id;

    -- Get proposed tower (most recent or bound)
    SELECT
        it.quote_name,
        COALESCE(
            (SELECT SUM((layer->>'limit')::numeric) FROM jsonb_array_elements(it.tower_json) AS layer),
            0
        ) as proposed_limit,
        it.primary_retention as proposed_retention,
        COALESCE(it.sold_premium, it.quoted_premium) as proposed_premium,
        it.policy_form as proposed_form,
        it.tower_json as proposed_tower_json,
        it.is_bound
    INTO v_proposed
    FROM insurance_towers it
    WHERE it.submission_id = p_submission_id
    ORDER BY it.is_bound DESC, it.created_at DESC
    LIMIT 1;

    -- Build comparison result
    v_result := jsonb_build_object(
        'has_expiring', v_expiring IS NOT NULL,
        'has_proposed', v_proposed IS NOT NULL,
        'expiring', CASE WHEN v_expiring IS NOT NULL THEN jsonb_build_object(
            'carrier', v_expiring.incumbent_carrier,
            'limit', v_expiring.expiring_limit,
            'retention', v_expiring.expiring_retention,
            'premium', v_expiring.expiring_premium,
            'policy_form', v_expiring.expiring_form,
            'expiration_date', v_expiring.expiration_date,
            'tower_json', v_expiring.expiring_tower_json
        ) ELSE NULL END,
        'proposed', CASE WHEN v_proposed IS NOT NULL THEN jsonb_build_object(
            'quote_name', v_proposed.quote_name,
            'limit', v_proposed.proposed_limit,
            'retention', v_proposed.proposed_retention,
            'premium', v_proposed.proposed_premium,
            'policy_form', v_proposed.proposed_form,
            'tower_json', v_proposed.proposed_tower_json,
            'is_bound', v_proposed.is_bound
        ) ELSE NULL END,
        'changes', CASE
            WHEN v_expiring IS NOT NULL AND v_proposed IS NOT NULL THEN jsonb_build_object(
                'limit_change', v_proposed.proposed_limit - v_expiring.expiring_limit,
                'limit_change_pct', CASE
                    WHEN v_expiring.expiring_limit > 0
                    THEN ROUND(((v_proposed.proposed_limit - v_expiring.expiring_limit) / v_expiring.expiring_limit * 100)::numeric, 1)
                    ELSE NULL
                END,
                'retention_change', v_proposed.proposed_retention - v_expiring.expiring_retention,
                'premium_change', v_proposed.proposed_premium - v_expiring.expiring_premium,
                'premium_change_pct', CASE
                    WHEN v_expiring.expiring_premium > 0
                    THEN ROUND(((v_proposed.proposed_premium - v_expiring.expiring_premium) / v_expiring.expiring_premium * 100)::numeric, 1)
                    ELSE NULL
                END
            )
            ELSE NULL
        END
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper Function: Capture Expiring Tower from Prior Submission
-- ============================================================================

CREATE OR REPLACE FUNCTION capture_expiring_tower_from_prior(
    p_submission_id UUID,
    p_prior_submission_id UUID,
    p_created_by VARCHAR(100) DEFAULT 'system'
) RETURNS UUID AS $$
DECLARE
    v_prior_tower RECORD;
    v_prior_sub RECORD;
    v_new_id UUID;
BEGIN
    -- Get prior submission details
    SELECT expiration_date INTO v_prior_sub
    FROM submissions
    WHERE id = p_prior_submission_id;

    -- Get prior bound tower
    SELECT
        tower_json,
        COALESCE(
            (SELECT SUM((layer->>'limit')::numeric) FROM jsonb_array_elements(tower_json) AS layer),
            0
        ) as total_limit,
        primary_retention,
        COALESCE(sold_premium, quoted_premium) as premium,
        policy_form,
        sublimits,
        quote_name
    INTO v_prior_tower
    FROM insurance_towers
    WHERE submission_id = p_prior_submission_id
      AND is_bound = true
    LIMIT 1;

    -- If no bound tower, return null
    IF v_prior_tower IS NULL THEN
        RETURN NULL;
    END IF;

    -- Insert expiring tower (upsert)
    INSERT INTO expiring_towers (
        submission_id,
        prior_submission_id,
        incumbent_carrier,
        expiration_date,
        tower_json,
        total_limit,
        primary_retention,
        premium,
        policy_form,
        sublimits,
        source,
        created_by
    ) VALUES (
        p_submission_id,
        p_prior_submission_id,
        -- Extract carrier from first layer of tower
        COALESCE(v_prior_tower.tower_json->0->>'carrier', 'Unknown'),
        v_prior_sub.expiration_date,
        v_prior_tower.tower_json,
        v_prior_tower.total_limit,
        v_prior_tower.primary_retention,
        v_prior_tower.premium,
        v_prior_tower.policy_form,
        v_prior_tower.sublimits,
        'prior_submission',
        p_created_by
    )
    ON CONFLICT (submission_id) DO UPDATE SET
        prior_submission_id = EXCLUDED.prior_submission_id,
        incumbent_carrier = EXCLUDED.incumbent_carrier,
        expiration_date = EXCLUDED.expiration_date,
        tower_json = EXCLUDED.tower_json,
        total_limit = EXCLUDED.total_limit,
        primary_retention = EXCLUDED.primary_retention,
        premium = EXCLUDED.premium,
        policy_form = EXCLUDED.policy_form,
        sublimits = EXCLUDED.sublimits,
        source = EXCLUDED.source,
        updated_at = now()
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View: Incumbent Carrier Analytics
-- ============================================================================

CREATE OR REPLACE VIEW v_incumbent_analytics AS
SELECT
    et.incumbent_carrier,
    COUNT(*) as submission_count,
    COUNT(*) FILTER (WHERE s.submission_outcome = 'bound') as won_count,
    COUNT(*) FILTER (WHERE s.submission_outcome = 'lost') as lost_count,
    ROUND(
        COUNT(*) FILTER (WHERE s.submission_outcome = 'bound')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE s.submission_outcome IN ('bound', 'lost')), 0) * 100,
        1
    ) as win_rate_pct,
    AVG(et.premium) FILTER (WHERE s.submission_outcome = 'bound') as avg_premium_when_won,
    AVG(et.total_limit) as avg_limit
FROM expiring_towers et
JOIN submissions s ON s.id = et.submission_id
WHERE et.incumbent_carrier IS NOT NULL
GROUP BY et.incumbent_carrier
ORDER BY submission_count DESC;
