-- =============================================================================
-- Remarket Detection: Prior Submission Linking
--
-- Detects when a new submission is for an account we've seen before (but didn't bind).
-- Enables importing prior year data instead of starting from scratch.
-- =============================================================================

-- Add remarket tracking columns to submissions
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS prior_submission_id UUID REFERENCES submissions(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS remarket_detected_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS remarket_match_type VARCHAR(20); -- 'fein', 'domain', 'name_exact', 'name_fuzzy'
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS remarket_match_confidence INTEGER; -- 0-100
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS remarket_imported_at TIMESTAMPTZ; -- When user imported prior data

-- Add FEIN column if it doesn't exist (key identifier for matching)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fein VARCHAR(20);

-- Index for finding prior submissions
CREATE INDEX IF NOT EXISTS idx_submissions_fein ON submissions(fein) WHERE fein IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_website ON submissions(website) WHERE website IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_applicant_name_lower ON submissions(LOWER(applicant_name)) WHERE applicant_name IS NOT NULL;

COMMENT ON COLUMN submissions.fein IS 'Federal Employer Identification Number (key identifier for remarket matching)';
COMMENT ON COLUMN submissions.prior_submission_id IS 'Links to prior submission for same account (remarket)';
COMMENT ON COLUMN submissions.remarket_match_type IS 'How the prior submission was matched: fein, website, name_exact, name_fuzzy';
COMMENT ON COLUMN submissions.remarket_match_confidence IS 'Match confidence 0-100 (FEIN=100, website=80, name_exact=70, name_fuzzy=50-69)';
COMMENT ON COLUMN submissions.remarket_imported_at IS 'When prior submission data was imported to this submission';

-- =============================================================================
-- Function: find_prior_submissions
--
-- Returns potential prior submissions for an account, ranked by match confidence.
-- Excludes bound policies (those are renewals, not remarkets).
-- =============================================================================

CREATE OR REPLACE FUNCTION find_prior_submissions(
    p_submission_id UUID,
    p_applicant_name TEXT DEFAULT NULL,
    p_fein TEXT DEFAULT NULL,
    p_website TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    submission_id UUID,
    insured_name TEXT,
    insured_fein TEXT,
    insured_website TEXT,
    submission_date TIMESTAMPTZ,
    submission_status TEXT,
    submission_outcome TEXT,
    quoted_premium NUMERIC,
    match_type TEXT,
    match_confidence INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH current_sub AS (
        SELECT
            s.id,
            COALESCE(p_applicant_name, s.applicant_name) as applicant_name,
            COALESCE(p_fein, s.fein) as fein,
            COALESCE(p_website, s.website) as website
        FROM submissions s
        WHERE s.id = p_submission_id
    ),
    matches AS (
        -- FEIN exact match (highest confidence)
        SELECT
            s.id as submission_id,
            s.applicant_name::TEXT as insured_name,
            s.fein::TEXT as insured_fein,
            s.website::TEXT as insured_website,
            s.date_received as submission_date,
            s.submission_status::TEXT,
            s.submission_outcome::TEXT,
            (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = s.id) as quoted_premium,
            'fein'::TEXT as match_type,
            100 as match_confidence
        FROM submissions s, current_sub c
        WHERE s.id != p_submission_id
          AND s.fein IS NOT NULL
          AND c.fein IS NOT NULL
          AND REPLACE(s.fein, '-', '') = REPLACE(c.fein, '-', '')
          AND s.submission_outcome != 'bound'  -- Exclude bound (those are renewals)

        UNION ALL

        -- Website/domain exact match
        SELECT
            s.id,
            s.applicant_name::TEXT,
            s.fein::TEXT,
            s.website::TEXT,
            s.date_received,
            s.submission_status::TEXT,
            s.submission_outcome::TEXT,
            (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = s.id),
            'website'::TEXT,
            80
        FROM submissions s, current_sub c
        WHERE s.id != p_submission_id
          AND s.website IS NOT NULL
          AND c.website IS NOT NULL
          AND LOWER(REGEXP_REPLACE(s.website, '^https?://(www\.)?', '')) = LOWER(REGEXP_REPLACE(c.website, '^https?://(www\.)?', ''))
          AND s.submission_outcome != 'bound'
          AND NOT EXISTS (  -- Don't duplicate if already matched by FEIN
              SELECT 1 FROM submissions s2, current_sub c2
              WHERE s2.id = s.id
                AND s2.fein IS NOT NULL
                AND c2.fein IS NOT NULL
                AND REPLACE(s2.fein, '-', '') = REPLACE(c2.fein, '-', '')
          )

        UNION ALL

        -- Name exact match (case-insensitive)
        SELECT
            s.id,
            s.applicant_name::TEXT,
            s.fein::TEXT,
            s.website::TEXT,
            s.date_received,
            s.submission_status::TEXT,
            s.submission_outcome::TEXT,
            (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = s.id),
            'name_exact'::TEXT,
            70
        FROM submissions s, current_sub c
        WHERE s.id != p_submission_id
          AND s.applicant_name IS NOT NULL
          AND c.applicant_name IS NOT NULL
          AND LOWER(TRIM(s.applicant_name)) = LOWER(TRIM(c.applicant_name))
          AND s.submission_outcome != 'bound'
          AND NOT EXISTS (  -- Don't duplicate if matched by FEIN or website
              SELECT 1 FROM submissions s2, current_sub c2
              WHERE s2.id = s.id
                AND ((s2.fein IS NOT NULL AND c2.fein IS NOT NULL
                      AND REPLACE(s2.fein, '-', '') = REPLACE(c2.fein, '-', ''))
                  OR (s2.website IS NOT NULL AND c2.website IS NOT NULL
                      AND LOWER(REGEXP_REPLACE(s2.website, '^https?://(www\.)?', '')) = LOWER(REGEXP_REPLACE(c2.website, '^https?://(www\.)?', ''))))
          )

        UNION ALL

        -- Name fuzzy match using trigram similarity (requires pg_trgm extension)
        -- Similarity threshold: 0.4 = 40% similar
        SELECT
            s.id,
            s.applicant_name::TEXT,
            s.fein::TEXT,
            s.website::TEXT,
            s.date_received,
            s.submission_status::TEXT,
            s.submission_outcome::TEXT,
            (SELECT SUM(it.quoted_premium) FROM insurance_towers it WHERE it.submission_id = s.id),
            'name_fuzzy'::TEXT,
            (similarity(LOWER(s.applicant_name), LOWER(c.applicant_name)) * 100)::INTEGER
        FROM submissions s, current_sub c
        WHERE s.id != p_submission_id
          AND s.applicant_name IS NOT NULL
          AND c.applicant_name IS NOT NULL
          AND similarity(LOWER(s.applicant_name), LOWER(c.applicant_name)) >= 0.4
          AND LOWER(TRIM(s.applicant_name)) != LOWER(TRIM(c.applicant_name))  -- Not exact match
          AND s.submission_outcome != 'bound'
          AND NOT EXISTS (  -- Don't duplicate if matched by other methods
              SELECT 1 FROM submissions s2, current_sub c2
              WHERE s2.id = s.id
                AND ((s2.fein IS NOT NULL AND c2.fein IS NOT NULL
                      AND REPLACE(s2.fein, '-', '') = REPLACE(c2.fein, '-', ''))
                  OR (s2.website IS NOT NULL AND c2.website IS NOT NULL
                      AND LOWER(REGEXP_REPLACE(s2.website, '^https?://(www\.)?', '')) = LOWER(REGEXP_REPLACE(c2.website, '^https?://(www\.)?', ''))))
          )
    )
    SELECT DISTINCT ON (m.submission_id)
        m.submission_id,
        m.insured_name,
        m.insured_fein,
        m.insured_website,
        m.submission_date,
        m.submission_status,
        m.submission_outcome,
        m.quoted_premium,
        m.match_type,
        m.match_confidence
    FROM matches m
    ORDER BY m.submission_id, m.match_confidence DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: import_prior_submission_data
--
-- Copies extracted values from prior submission to current submission.
-- Marks imported values with source_type = 'prior_submission' and needs_confirmation = true.
-- =============================================================================

CREATE OR REPLACE FUNCTION import_prior_submission_data(
    p_target_submission_id UUID,
    p_source_submission_id UUID,
    p_import_extracted_values BOOLEAN DEFAULT TRUE,
    p_import_uw_notes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
    v_values_imported INTEGER := 0;
    v_notes_imported BOOLEAN := FALSE;
    v_source_notes TEXT;
BEGIN
    -- Import extracted values
    IF p_import_extracted_values THEN
        INSERT INTO submission_extracted_values (
            submission_id,
            field_key,
            value,
            raw_value,
            status,
            source_type,
            source_text,
            needs_confirmation,
            created_at,
            updated_at
        )
        SELECT
            p_target_submission_id,
            sev.field_key,
            sev.value,
            sev.raw_value,
            'pending',  -- Reset to pending for review
            'prior_submission',  -- Mark source
            'Imported from prior submission ' || p_source_submission_id::TEXT,
            TRUE,  -- Always needs confirmation
            NOW(),
            NOW()
        FROM submission_extracted_values sev
        WHERE sev.submission_id = p_source_submission_id
          AND sev.value IS NOT NULL
          AND NOT EXISTS (
              -- Don't overwrite existing values in target
              SELECT 1 FROM submission_extracted_values existing
              WHERE existing.submission_id = p_target_submission_id
                AND existing.field_key = sev.field_key
                AND existing.value IS NOT NULL
          );

        GET DIAGNOSTICS v_values_imported = ROW_COUNT;
    END IF;

    -- Import UW notes as context
    IF p_import_uw_notes THEN
        SELECT uw_notes INTO v_source_notes
        FROM submissions
        WHERE id = p_source_submission_id;

        IF v_source_notes IS NOT NULL AND v_source_notes != '' THEN
            UPDATE submissions
            SET uw_notes = COALESCE(uw_notes, '') ||
                E'\n\n--- Prior Submission Notes (' ||
                TO_CHAR(NOW(), 'YYYY-MM-DD') ||
                E') ---\n' || v_source_notes
            WHERE id = p_target_submission_id;

            v_notes_imported := TRUE;
        END IF;
    END IF;

    -- Update submission to link prior and mark import time
    UPDATE submissions
    SET prior_submission_id = p_source_submission_id,
        remarket_imported_at = NOW()
    WHERE id = p_target_submission_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'values_imported', v_values_imported,
        'notes_imported', v_notes_imported,
        'source_submission_id', p_source_submission_id,
        'target_submission_id', p_target_submission_id
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Enable pg_trgm extension for fuzzy matching (if not already enabled)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index for fuzzy name matching
CREATE INDEX IF NOT EXISTS idx_submissions_applicant_name_trgm
ON submissions USING gin (applicant_name gin_trgm_ops);

-- =============================================================================
-- View: v_remarket_candidates
--
-- Shows submissions that might have prior submissions (for detection queue).
-- =============================================================================

CREATE OR REPLACE VIEW v_remarket_candidates AS
SELECT
    s.id,
    s.applicant_name,
    s.fein,
    s.website,
    s.date_received,
    s.submission_status,
    s.prior_submission_id,
    s.remarket_detected_at,
    s.remarket_match_type,
    s.remarket_match_confidence,
    s.remarket_imported_at,
    CASE
        WHEN s.prior_submission_id IS NOT NULL THEN 'linked'
        WHEN s.remarket_detected_at IS NOT NULL THEN 'detected'
        ELSE 'unchecked'
    END as remarket_status
FROM submissions s
WHERE s.submission_outcome != 'bound'
ORDER BY s.date_received DESC;

COMMENT ON VIEW v_remarket_candidates IS 'Submissions with their remarket detection status';

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'submissions' AND column_name = 'prior_submission_id') THEN
        RAISE NOTICE 'SUCCESS: Remarket columns added to submissions table';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'find_prior_submissions') THEN
        RAISE NOTICE 'SUCCESS: find_prior_submissions function created';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'import_prior_submission_data') THEN
        RAISE NOTICE 'SUCCESS: import_prior_submission_data function created';
    END IF;
END $$;
