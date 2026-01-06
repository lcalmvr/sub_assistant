-- =============================================================================
-- Decision Snapshots v2: Content-based deduplication
--
-- Changes from v1:
-- 1. Add content_hash for fast deduplication
-- 2. Add snapshot FKs to quotes table (insurance_towers)
-- 3. Update capture function to return existing snapshot if content unchanged
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add content_hash column to decision_snapshots
-- -----------------------------------------------------------------------------

ALTER TABLE decision_snapshots
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_content_hash
ON decision_snapshots(submission_id, content_hash);

COMMENT ON COLUMN decision_snapshots.content_hash IS 'MD5 hash of field values for deduplication';

-- -----------------------------------------------------------------------------
-- 2. Add snapshot FK columns to insurance_towers (quotes)
-- -----------------------------------------------------------------------------

ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS quote_snapshot_id UUID REFERENCES decision_snapshots(id);

ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS bind_snapshot_id UUID REFERENCES decision_snapshots(id);

COMMENT ON COLUMN insurance_towers.quote_snapshot_id IS 'Snapshot of extracted values when quote was generated';
COMMENT ON COLUMN insurance_towers.bind_snapshot_id IS 'Snapshot of extracted values when policy was bound';

-- -----------------------------------------------------------------------------
-- 3. Updated capture function with deduplication
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
    v_existing_snapshot_id UUID;
    v_extracted_values JSONB;
    v_content_hash VARCHAR(32);
    v_gap_analysis JSONB;
    v_importance_version_id UUID;
BEGIN
    -- Get active importance version
    SELECT id INTO v_importance_version_id
    FROM importance_versions
    WHERE is_active = true
    LIMIT 1;

    -- Calculate content hash (field_key + value + status only, ordered for consistency)
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

    -- Check if snapshot with same content already exists for this submission
    SELECT id INTO v_existing_snapshot_id
    FROM decision_snapshots
    WHERE submission_id = p_submission_id
      AND content_hash = v_content_hash
    LIMIT 1;

    -- If exists, return existing snapshot ID
    IF v_existing_snapshot_id IS NOT NULL THEN
        RETURN v_existing_snapshot_id;
    END IF;

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

    -- Insert new snapshot
    INSERT INTO decision_snapshots (
        submission_id,
        quote_id,
        decision_type,
        decision_by,
        extracted_values,
        gap_analysis,
        importance_version_id,
        content_hash
    ) VALUES (
        p_submission_id,
        p_quote_id,
        p_decision_type,
        p_decision_by,
        COALESCE(v_extracted_values, '{}'::jsonb),
        v_gap_analysis,
        v_importance_version_id,
        v_content_hash
    )
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION capture_decision_snapshot IS 'Capture or reuse snapshot of extracted values at decision point (deduped by content hash)';

-- -----------------------------------------------------------------------------
-- 4. Backfill content_hash for existing snapshots
-- -----------------------------------------------------------------------------

UPDATE decision_snapshots ds
SET content_hash = md5(
    COALESCE(
        (SELECT string_agg(
            kv.key || ':' || COALESCE(kv.value->>'value', '') || ':' || COALESCE(kv.value->>'status', ''),
            '|' ORDER BY kv.key
        )
        FROM jsonb_each(ds.extracted_values) AS kv),
        ''
    )
)
WHERE content_hash IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'decision_snapshots' AND column_name = 'content_hash'
    ) THEN
        RAISE NOTICE 'SUCCESS: content_hash column added to decision_snapshots';
    ELSE
        RAISE WARNING 'WARNING: content_hash column not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'insurance_towers' AND column_name = 'quote_snapshot_id'
    ) THEN
        RAISE NOTICE 'SUCCESS: quote_snapshot_id column added to insurance_towers';
    ELSE
        RAISE WARNING 'WARNING: quote_snapshot_id column not found';
    END IF;
END $$;
