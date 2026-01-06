-- =============================================================================
-- Decision-Point Snapshots (Phase 4)
--
-- Captures "what we knew when we made the decision" at key decision points:
-- - Quote issued
-- - Policy bound
-- - Renewal offered
--
-- Used for claims correlation and audit trails.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Decision Snapshots Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS decision_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What decision was made
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES insurance_towers(id) ON DELETE SET NULL,
    decision_type VARCHAR(50) NOT NULL,  -- 'quote_issued', 'policy_bound', 'renewal_offered'

    -- When and who
    decision_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decision_by VARCHAR(255),

    -- Extracted values snapshot (frozen copy of submission_extracted_values)
    extracted_values JSONB NOT NULL,

    -- AI analysis snapshot
    nist_assessment JSONB,  -- NIST scores as computed at decision time
    gap_analysis JSONB,     -- Critical/important fields that were missing
    risk_summary TEXT,      -- AI-generated risk summary at decision time

    -- Schema version tracking (for claims correlation)
    importance_version_id UUID,
    extraction_schema_version VARCHAR(50),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT decision_type_check CHECK (
        decision_type IN ('quote_issued', 'policy_bound', 'renewal_offered')
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_submission ON decision_snapshots(submission_id);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_quote ON decision_snapshots(quote_id);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_type ON decision_snapshots(decision_type);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_decision_at ON decision_snapshots(decision_at DESC);

-- Comments
COMMENT ON TABLE decision_snapshots IS 'Frozen snapshots of extracted values and AI analysis at decision points';
COMMENT ON COLUMN decision_snapshots.decision_type IS 'Type of decision: quote_issued, policy_bound, renewal_offered';
COMMENT ON COLUMN decision_snapshots.extracted_values IS 'JSONB snapshot of all submission_extracted_values at decision time';
COMMENT ON COLUMN decision_snapshots.nist_assessment IS 'NIST CSF scores (identify, protect, detect, respond, recover) at decision time';
COMMENT ON COLUMN decision_snapshots.gap_analysis IS 'Critical/important fields missing at decision time';
COMMENT ON COLUMN decision_snapshots.importance_version_id IS 'Which importance version was active when decision was made';


-- -----------------------------------------------------------------------------
-- 2. Function to Capture Decision Snapshot
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION capture_decision_snapshot(
    p_submission_id UUID,
    p_quote_id UUID,
    p_decision_type VARCHAR(50),
    p_decision_by VARCHAR(255) DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
    v_extracted_values JSONB;
    v_gap_analysis JSONB;
    v_importance_version_id UUID;
BEGIN
    -- Get active importance version
    SELECT id INTO v_importance_version_id
    FROM importance_versions
    WHERE is_active = true
    LIMIT 1;

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

    -- Capture gap analysis (critical/important fields not present)
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

    -- Insert snapshot
    INSERT INTO decision_snapshots (
        submission_id,
        quote_id,
        decision_type,
        decision_by,
        extracted_values,
        gap_analysis,
        importance_version_id
    ) VALUES (
        p_submission_id,
        p_quote_id,
        p_decision_type,
        p_decision_by,
        COALESCE(v_extracted_values, '{}'::jsonb),
        v_gap_analysis,
        v_importance_version_id
    )
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION capture_decision_snapshot IS 'Capture a frozen snapshot of extracted values and gap analysis at a decision point';


-- -----------------------------------------------------------------------------
-- 3. View for Decision Snapshot Summary
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_decision_snapshots_summary AS
SELECT
    ds.id,
    ds.submission_id,
    ds.quote_id,
    ds.decision_type,
    ds.decision_at,
    ds.decision_by,
    s.applicant_name,
    t.quote_name,
    t.sold_premium,
    -- Gap summary
    jsonb_array_length(COALESCE(ds.gap_analysis->'critical_missing', '[]'::jsonb)) as critical_missing_count,
    jsonb_array_length(COALESCE(ds.gap_analysis->'important_missing', '[]'::jsonb)) as important_missing_count,
    (ds.gap_analysis->>'critical_present_count')::int as critical_present_count,
    (ds.gap_analysis->>'important_present_count')::int as important_present_count,
    -- Version tracking
    iv.version_number as importance_version,
    iv.name as importance_version_name
FROM decision_snapshots ds
JOIN submissions s ON s.id = ds.submission_id
LEFT JOIN insurance_towers t ON t.id = ds.quote_id
LEFT JOIN importance_versions iv ON iv.id = ds.importance_version_id
ORDER BY ds.decision_at DESC;

COMMENT ON VIEW v_decision_snapshots_summary IS 'Summary view of decision snapshots with gap counts';


-- -----------------------------------------------------------------------------
-- 4. Claims Correlation View (for Phase 5)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_bind_snapshot_for_claims AS
SELECT
    ds.id as snapshot_id,
    ds.submission_id,
    ds.quote_id,
    ds.decision_at as bound_at,
    s.applicant_name,
    t.sold_premium,

    -- Key controls at bind time (for claims correlation)
    ds.extracted_values->>'emailMfa' as mfa_email_at_bind,
    ds.extracted_values->>'remoteAccessMfa' as mfa_remote_at_bind,
    ds.extracted_values->>'hasEdr' as has_edr_at_bind,
    ds.extracted_values->>'offlineBackups' as offline_backups_at_bind,
    ds.extracted_values->>'immutableBackups' as immutable_backups_at_bind,
    ds.extracted_values->>'conductsPhishingSimulations' as phishing_training_at_bind,

    -- Gap counts at bind
    jsonb_array_length(COALESCE(ds.gap_analysis->'critical_missing', '[]'::jsonb)) as critical_gaps_at_bind,
    jsonb_array_length(COALESCE(ds.gap_analysis->'important_missing', '[]'::jsonb)) as important_gaps_at_bind,

    -- For joining with claims
    ds.importance_version_id

FROM decision_snapshots ds
JOIN submissions s ON s.id = ds.submission_id
LEFT JOIN insurance_towers t ON t.id = ds.quote_id
WHERE ds.decision_type = 'policy_bound';

COMMENT ON VIEW v_bind_snapshot_for_claims IS 'Bind-time snapshots formatted for claims correlation analysis';


-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'decision_snapshots') THEN
        RAISE NOTICE 'SUCCESS: decision_snapshots table created';
    ELSE
        RAISE WARNING 'WARNING: decision_snapshots table not found';
    END IF;
END $$;
