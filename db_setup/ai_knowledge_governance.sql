-- AI Knowledge Governance Tables
-- Two-layer architecture: Formal Guidelines + Observed Patterns
-- See docs/ai-knowledge-architecture.md for full documentation

-- ============================================================================
-- LAYER 1 ENHANCEMENTS: Add enforcement_level to existing tables
-- ============================================================================

-- Add enforcement_level to uw_mandatory_controls
ALTER TABLE uw_mandatory_controls
ADD COLUMN IF NOT EXISTS enforcement_level VARCHAR(20) DEFAULT 'advisory'
    CHECK (enforcement_level IN ('hard', 'advisory', 'flexible'));

-- Add enforcement_level to uw_declination_rules
ALTER TABLE uw_declination_rules
ADD COLUMN IF NOT EXISTS enforcement_level VARCHAR(20) DEFAULT 'advisory'
    CHECK (enforcement_level IN ('hard', 'advisory', 'flexible'));

-- Add enforcement_level to uw_referral_triggers
ALTER TABLE uw_referral_triggers
ADD COLUMN IF NOT EXISTS enforcement_level VARCHAR(20) DEFAULT 'advisory'
    CHECK (enforcement_level IN ('hard', 'advisory', 'flexible'));

-- Add enforcement_level to uw_appetite
ALTER TABLE uw_appetite
ADD COLUMN IF NOT EXISTS enforcement_level VARCHAR(20) DEFAULT 'advisory'
    CHECK (enforcement_level IN ('hard', 'advisory', 'flexible'));

-- Add enforcement_level to uw_geographic_restrictions
ALTER TABLE uw_geographic_restrictions
ADD COLUMN IF NOT EXISTS enforcement_level VARCHAR(20) DEFAULT 'advisory'
    CHECK (enforcement_level IN ('hard', 'advisory', 'flexible'));

-- ============================================================================
-- Set default enforcement levels based on existing logic
-- ============================================================================

-- Mandatory controls: Hard if declination trigger, advisory if referral trigger
UPDATE uw_mandatory_controls
SET enforcement_level = CASE
    WHEN is_declination_trigger THEN 'hard'
    WHEN is_referral_trigger THEN 'advisory'
    ELSE 'flexible'
END;

-- Declination rules: Hard if severity=hard, advisory if severity=soft
UPDATE uw_declination_rules
SET enforcement_level = CASE
    WHEN severity = 'hard' THEN 'hard'
    ELSE 'advisory'
END;

-- Referral triggers: All advisory by default
UPDATE uw_referral_triggers
SET enforcement_level = 'advisory';

-- Appetite: Hard if excluded, advisory if restricted, flexible otherwise
UPDATE uw_appetite
SET enforcement_level = CASE
    WHEN appetite_status = 'excluded' THEN 'hard'
    WHEN appetite_status = 'restricted' THEN 'advisory'
    ELSE 'flexible'
END;

-- Geographic: Hard if excluded, advisory if restricted
UPDATE uw_geographic_restrictions
SET enforcement_level = CASE
    WHEN restriction_type = 'excluded' THEN 'hard'
    WHEN restriction_type = 'restricted' THEN 'advisory'
    ELSE 'flexible'
END;

-- ============================================================================
-- LAYER 2: Decision Logging
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_decision_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- AI recommendation
    ai_recommendation VARCHAR(20) NOT NULL,  -- 'quote', 'refer', 'decline'
    ai_confidence DECIMAL(3,2),              -- 0.00 to 1.00
    ai_reasoning TEXT,                       -- Full AI response
    rules_applied JSONB,                     -- [{rule_id, rule_type, rule_name, enforcement_level}]
    patterns_noted JSONB,                    -- [{pattern_desc, similar_count, approval_rate}]

    -- UW decision
    uw_decision VARCHAR(20),                 -- 'quote', 'refer', 'decline' (NULL if pending)
    uw_matches_ai BOOLEAN GENERATED ALWAYS AS (ai_recommendation = uw_decision) STORED,
    override_reason TEXT,                    -- If UW overrode AI, why?
    override_category VARCHAR(50),           -- 'control_mitigation', 'business_context', 'risk_tolerance', etc.
    decided_by VARCHAR(100),
    decided_at TIMESTAMPTZ,

    -- Context snapshot for pattern analysis
    industry VARCHAR(100),
    hazard_class INT,
    annual_revenue BIGINT,
    employee_count INT,
    has_mfa BOOLEAN,
    has_edr BOOLEAN,
    has_offline_backup BOOLEAN,
    prior_claims_count INT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_log_submission ON uw_decision_log(submission_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_ai_rec ON uw_decision_log(ai_recommendation);
CREATE INDEX IF NOT EXISTS idx_decision_log_override ON uw_decision_log(uw_matches_ai) WHERE uw_matches_ai = false;
CREATE INDEX IF NOT EXISTS idx_decision_log_industry ON uw_decision_log(industry);
CREATE INDEX IF NOT EXISTS idx_decision_log_hazard ON uw_decision_log(hazard_class);

-- ============================================================================
-- LAYER 2: Drift Pattern Tracking
-- ============================================================================

-- Track rule-level override patterns
CREATE TABLE IF NOT EXISTS uw_rule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_log_id UUID NOT NULL REFERENCES uw_decision_log(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL,          -- 'declination', 'control', 'referral', 'appetite'
    rule_id UUID NOT NULL,
    rule_name VARCHAR(100),
    enforcement_level VARCHAR(20),
    was_overridden BOOLEAN NOT NULL,
    override_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_overrides_rule ON uw_rule_overrides(rule_type, rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_overrides_overridden ON uw_rule_overrides(was_overridden);

-- ============================================================================
-- DRIFT PATTERNS VIEW
-- Aggregates override patterns for review
-- ============================================================================

CREATE OR REPLACE VIEW uw_drift_patterns AS
SELECT
    ro.rule_type,
    ro.rule_id,
    ro.rule_name,
    ro.enforcement_level,
    COUNT(*) as times_applied,
    SUM(CASE WHEN ro.was_overridden THEN 1 ELSE 0 END) as times_overridden,
    ROUND(
        SUM(CASE WHEN ro.was_overridden THEN 1 ELSE 0 END)::decimal /
        NULLIF(COUNT(*), 0) * 100, 1
    ) as override_rate_pct,
    -- Most common override reasons
    (
        SELECT jsonb_agg(reason_count)
        FROM (
            SELECT jsonb_build_object(
                'reason', override_reason,
                'count', COUNT(*)
            ) as reason_count
            FROM uw_rule_overrides r2
            WHERE r2.rule_type = ro.rule_type
              AND r2.rule_id = ro.rule_id
              AND r2.was_overridden = true
              AND r2.override_reason IS NOT NULL
            GROUP BY override_reason
            ORDER BY COUNT(*) DESC
            LIMIT 3
        ) top_reasons
    ) as common_override_reasons,
    MAX(ro.created_at) as last_applied
FROM uw_rule_overrides ro
GROUP BY ro.rule_type, ro.rule_id, ro.rule_name, ro.enforcement_level
HAVING COUNT(*) >= 3  -- Only show rules applied at least 3 times
ORDER BY override_rate_pct DESC, times_applied DESC;

-- ============================================================================
-- SIMILAR CASES VIEW
-- Find similar past decisions for pattern context
-- ============================================================================

CREATE OR REPLACE VIEW uw_similar_case_patterns AS
SELECT
    industry,
    hazard_class,
    CASE
        WHEN annual_revenue < 10000000 THEN 'under_10m'
        WHEN annual_revenue < 50000000 THEN '10m_50m'
        WHEN annual_revenue < 250000000 THEN '50m_250m'
        ELSE 'over_250m'
    END as revenue_band,
    COUNT(*) as total_cases,
    SUM(CASE WHEN uw_decision = 'quote' THEN 1 ELSE 0 END) as quoted,
    SUM(CASE WHEN uw_decision = 'refer' THEN 1 ELSE 0 END) as referred,
    SUM(CASE WHEN uw_decision = 'decline' THEN 1 ELSE 0 END) as declined,
    ROUND(
        SUM(CASE WHEN uw_decision = 'quote' THEN 1 ELSE 0 END)::decimal /
        NULLIF(COUNT(*), 0) * 100, 1
    ) as quote_rate_pct,
    -- Control patterns
    ROUND(AVG(CASE WHEN has_mfa THEN 100 ELSE 0 END), 0) as pct_with_mfa,
    ROUND(AVG(CASE WHEN has_edr THEN 100 ELSE 0 END), 0) as pct_with_edr,
    ROUND(AVG(CASE WHEN has_offline_backup THEN 100 ELSE 0 END), 0) as pct_with_backup
FROM uw_decision_log
WHERE uw_decision IS NOT NULL
  AND decided_at > now() - interval '12 months'
GROUP BY industry, hazard_class, revenue_band
HAVING COUNT(*) >= 3
ORDER BY total_cases DESC;

-- ============================================================================
-- GOVERNANCE: Rule Amendment Audit Trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_rule_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type VARCHAR(50) NOT NULL,          -- 'declination', 'control', 'referral', 'appetite'
    rule_id UUID NOT NULL,
    amendment_type VARCHAR(50) NOT NULL,     -- 'enforcement_change', 'condition_added', 'deactivated', 'created'

    -- Before/after state
    previous_state JSONB,
    new_state JSONB,

    -- Context
    reason TEXT NOT NULL,
    drift_pattern_id UUID,                   -- Link to drift pattern that prompted this
    supporting_data JSONB,                   -- Stats, case references, etc.

    -- Approval
    requested_by VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',    -- 'pending', 'approved', 'rejected'

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_amendments_rule ON uw_rule_amendments(rule_type, rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_amendments_status ON uw_rule_amendments(status);

-- ============================================================================
-- DRIFT REVIEW QUEUE VIEW
-- Rules that may need amendment review
-- ============================================================================

CREATE OR REPLACE VIEW uw_drift_review_queue AS
SELECT
    dp.rule_type,
    dp.rule_id,
    dp.rule_name,
    dp.enforcement_level,
    dp.times_applied,
    dp.times_overridden,
    dp.override_rate_pct,
    dp.common_override_reasons,
    dp.last_applied,
    -- Check if already under review
    (
        SELECT COUNT(*) > 0
        FROM uw_rule_amendments ra
        WHERE ra.rule_type = dp.rule_type
          AND ra.rule_id = dp.rule_id
          AND ra.status = 'pending'
    ) as under_review,
    -- Last amendment
    (
        SELECT MAX(approved_at)
        FROM uw_rule_amendments ra
        WHERE ra.rule_type = dp.rule_type
          AND ra.rule_id = dp.rule_id
          AND ra.status = 'approved'
    ) as last_amended
FROM uw_drift_patterns dp
WHERE dp.override_rate_pct >= 20  -- 20%+ override rate triggers review consideration
  AND dp.enforcement_level IN ('hard', 'advisory')  -- Flexible rules don't need review
ORDER BY
    CASE dp.enforcement_level WHEN 'hard' THEN 1 WHEN 'advisory' THEN 2 ELSE 3 END,
    dp.override_rate_pct DESC;

-- ============================================================================
-- HELPER FUNCTION: Log AI Decision
-- ============================================================================

CREATE OR REPLACE FUNCTION log_ai_decision(
    p_submission_id UUID,
    p_ai_recommendation VARCHAR(20),
    p_ai_confidence DECIMAL(3,2),
    p_ai_reasoning TEXT,
    p_rules_applied JSONB,
    p_patterns_noted JSONB,
    p_context JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO uw_decision_log (
        submission_id,
        ai_recommendation,
        ai_confidence,
        ai_reasoning,
        rules_applied,
        patterns_noted,
        industry,
        hazard_class,
        annual_revenue,
        employee_count,
        has_mfa,
        has_edr,
        has_offline_backup,
        prior_claims_count
    ) VALUES (
        p_submission_id,
        p_ai_recommendation,
        p_ai_confidence,
        p_ai_reasoning,
        p_rules_applied,
        p_patterns_noted,
        p_context->>'industry',
        (p_context->>'hazard_class')::int,
        (p_context->>'annual_revenue')::bigint,
        (p_context->>'employee_count')::int,
        (p_context->>'has_mfa')::boolean,
        (p_context->>'has_edr')::boolean,
        (p_context->>'has_offline_backup')::boolean,
        (p_context->>'prior_claims_count')::int
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Record UW Decision
-- ============================================================================

CREATE OR REPLACE FUNCTION record_uw_decision(
    p_decision_log_id UUID,
    p_uw_decision VARCHAR(20),
    p_override_reason TEXT DEFAULT NULL,
    p_override_category VARCHAR(50) DEFAULT NULL,
    p_decided_by VARCHAR(100) DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE uw_decision_log
    SET
        uw_decision = p_uw_decision,
        override_reason = p_override_reason,
        override_category = p_override_category,
        decided_by = p_decided_by,
        decided_at = now(),
        updated_at = now()
    WHERE id = p_decision_log_id;

    -- Log rule-level overrides
    INSERT INTO uw_rule_overrides (
        decision_log_id,
        rule_type,
        rule_id,
        rule_name,
        enforcement_level,
        was_overridden,
        override_reason
    )
    SELECT
        p_decision_log_id,
        r->>'rule_type',
        (r->>'rule_id')::uuid,
        r->>'rule_name',
        r->>'enforcement_level',
        -- Was overridden if AI said decline/refer but UW quoted, etc.
        CASE
            WHEN (r->>'would_decline')::boolean AND p_uw_decision = 'quote' THEN true
            WHEN (r->>'would_refer')::boolean AND p_uw_decision = 'quote' THEN true
            ELSE false
        END,
        p_override_reason
    FROM uw_decision_log dl,
         jsonb_array_elements(dl.rules_applied) r
    WHERE dl.id = p_decision_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

GRANT SELECT ON uw_decision_log TO authenticated;
GRANT SELECT ON uw_rule_overrides TO authenticated;
GRANT SELECT ON uw_drift_patterns TO authenticated;
GRANT SELECT ON uw_similar_case_patterns TO authenticated;
GRANT SELECT ON uw_rule_amendments TO authenticated;
GRANT SELECT ON uw_drift_review_queue TO authenticated;

GRANT INSERT, UPDATE ON uw_decision_log TO authenticated;
GRANT INSERT ON uw_rule_overrides TO authenticated;
GRANT INSERT, UPDATE ON uw_rule_amendments TO authenticated;
