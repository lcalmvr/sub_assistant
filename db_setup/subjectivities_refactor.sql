-- ============================================================================
-- SUBJECTIVITIES REFACTOR: Junction Table Architecture
-- ============================================================================
--
-- Goal: Single source of truth for subjectivities with many-to-many linking
--       to quote options. Enables shared subjectivities with explicit divergence.
--
-- Tables:
--   1. submission_subjectivities - The actual subjectivities with tracking
--   2. quote_subjectivities - Junction table linking quotes to subjectivities
--
-- Migration:
--   - Existing policy_subjectivities data → submission_subjectivities
--   - Existing insurance_towers.subjectivities → submission_subjectivities + links
--   - Drop policy_subjectivities table
--   - Drop insurance_towers.subjectivities column
--
-- ============================================================================

-- ============================================================================
-- STEP 1: Create new tables
-- ============================================================================

-- Main subjectivities table (one row per unique subjectivity per submission)
CREATE TABLE IF NOT EXISTS submission_subjectivities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Subjectivity content
    text TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',  -- general, binding, documentation, coverage

    -- Tracking fields (for post-bind compliance)
    status VARCHAR(20) DEFAULT 'pending',  -- pending, received, waived
    due_date DATE,
    received_at TIMESTAMPTZ,
    received_by VARCHAR(255),
    waived_at TIMESTAMPTZ,
    waived_by VARCHAR(255),
    waived_reason TEXT,

    -- Supporting documents
    document_ids UUID[] DEFAULT '{}',
    notes TEXT,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255) DEFAULT 'system',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(255),

    -- Prevent duplicate text per submission
    UNIQUE(submission_id, text)
);

-- Junction table linking quote options to subjectivities
CREATE TABLE IF NOT EXISTS quote_subjectivities (
    quote_id UUID NOT NULL REFERENCES insurance_towers(id) ON DELETE CASCADE,
    subjectivity_id UUID NOT NULL REFERENCES submission_subjectivities(id) ON DELETE CASCADE,

    -- When this link was created (for audit)
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    linked_by VARCHAR(255) DEFAULT 'system',

    PRIMARY KEY (quote_id, subjectivity_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_submission_subjectivities_submission
    ON submission_subjectivities(submission_id);

CREATE INDEX IF NOT EXISTS idx_submission_subjectivities_status
    ON submission_subjectivities(status);

CREATE INDEX IF NOT EXISTS idx_quote_subjectivities_quote
    ON quote_subjectivities(quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_subjectivities_subjectivity
    ON quote_subjectivities(subjectivity_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_submission_subjectivities_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS submission_subjectivities_updated_at ON submission_subjectivities;
CREATE TRIGGER submission_subjectivities_updated_at
    BEFORE UPDATE ON submission_subjectivities
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_subjectivities_timestamp();


-- ============================================================================
-- STEP 2: Migrate existing data
-- ============================================================================

-- 2a. Migrate from policy_subjectivities (existing tracking table)
--     These already have status, received_at, etc.
INSERT INTO submission_subjectivities (
    submission_id, text, category, status, due_date,
    received_at, received_by, document_ids, notes,
    created_at, created_by, updated_at, updated_by
)
SELECT
    submission_id,
    text,
    COALESCE(category, 'general'),
    COALESCE(status, 'pending'),
    due_date,
    received_at,
    received_by,
    COALESCE(document_ids, '{}'),
    notes,
    created_at,
    created_by,
    updated_at,
    updated_by
FROM policy_subjectivities
ON CONFLICT (submission_id, text) DO UPDATE SET
    status = EXCLUDED.status,
    received_at = EXCLUDED.received_at,
    received_by = EXCLUDED.received_by,
    updated_at = NOW();

-- 2b. Link policy_subjectivities to bound quote options
--     (These were submission-level, so link to bound option)
INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
SELECT DISTINCT
    t.id AS quote_id,
    ss.id AS subjectivity_id
FROM policy_subjectivities ps
JOIN submission_subjectivities ss ON ss.submission_id = ps.submission_id AND ss.text = ps.text
JOIN insurance_towers t ON t.submission_id = ps.submission_id AND t.is_bound = true
ON CONFLICT DO NOTHING;

-- 2c. Migrate from insurance_towers.subjectivities (JSONB array on quotes)
--     These are quote-specific, may not have tracking status yet
DO $$
DECLARE
    quote_rec RECORD;
    subj_text TEXT;
    new_subj_id UUID;
BEGIN
    -- Loop through quotes that have subjectivities
    FOR quote_rec IN
        SELECT id, submission_id, subjectivities
        FROM insurance_towers
        WHERE subjectivities IS NOT NULL
          AND jsonb_array_length(subjectivities) > 0
    LOOP
        -- Loop through each subjectivity text in the JSONB array
        FOR subj_text IN SELECT jsonb_array_elements_text(quote_rec.subjectivities)
        LOOP
            -- Insert into submission_subjectivities (or get existing)
            INSERT INTO submission_subjectivities (submission_id, text, status)
            VALUES (quote_rec.submission_id, subj_text, 'pending')
            ON CONFLICT (submission_id, text) DO NOTHING
            RETURNING id INTO new_subj_id;

            -- If we didn't insert (conflict), get the existing ID
            IF new_subj_id IS NULL THEN
                SELECT id INTO new_subj_id
                FROM submission_subjectivities
                WHERE submission_id = quote_rec.submission_id AND text = subj_text;
            END IF;

            -- Create junction link
            INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
            VALUES (quote_rec.id, new_subj_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;


-- ============================================================================
-- STEP 3: Verify migration (run these to check)
-- ============================================================================

-- Check subjectivity counts
-- SELECT
--     (SELECT COUNT(*) FROM policy_subjectivities) AS old_policy_subj_count,
--     (SELECT COUNT(*) FROM submission_subjectivities) AS new_subj_count,
--     (SELECT COUNT(*) FROM quote_subjectivities) AS junction_count;

-- Check a specific submission
-- SELECT
--     ss.text, ss.status, array_agg(t.quote_name) AS linked_options
-- FROM submission_subjectivities ss
-- JOIN quote_subjectivities qs ON qs.subjectivity_id = ss.id
-- JOIN insurance_towers t ON t.id = qs.quote_id
-- WHERE ss.submission_id = 'YOUR-SUBMISSION-ID'
-- GROUP BY ss.id, ss.text, ss.status;


-- ============================================================================
-- STEP 4: Drop old structures (ONLY AFTER VERIFICATION)
-- ============================================================================

-- DANGER: Only run after confirming migration is complete!

-- DROP TABLE IF EXISTS policy_subjectivities;
-- ALTER TABLE insurance_towers DROP COLUMN IF EXISTS subjectivities;


-- ============================================================================
-- HELPER VIEWS (optional, for easier querying)
-- ============================================================================

-- View: Subjectivities with their linked quote options
CREATE OR REPLACE VIEW v_subjectivities_with_options AS
SELECT
    ss.id,
    ss.submission_id,
    ss.text,
    ss.category,
    ss.status,
    ss.due_date,
    ss.received_at,
    ss.received_by,
    ss.notes,
    ss.created_at,
    array_agg(t.id) AS quote_ids,
    array_agg(t.quote_name) AS quote_names,
    COUNT(t.id) AS option_count,
    bool_or(t.is_bound) AS has_bound_option
FROM submission_subjectivities ss
LEFT JOIN quote_subjectivities qs ON qs.subjectivity_id = ss.id
LEFT JOIN insurance_towers t ON t.id = qs.quote_id
GROUP BY ss.id;

-- View: Quote options with their subjectivities
CREATE OR REPLACE VIEW v_quote_with_subjectivities AS
SELECT
    t.id AS quote_id,
    t.submission_id,
    t.quote_name,
    t.position,
    t.is_bound,
    array_agg(ss.id) AS subjectivity_ids,
    array_agg(ss.text) AS subjectivity_texts,
    array_agg(ss.status) AS subjectivity_statuses,
    COUNT(ss.id) AS subjectivity_count,
    COUNT(ss.id) FILTER (WHERE ss.status = 'pending') AS pending_count,
    COUNT(ss.id) FILTER (WHERE ss.status = 'received') AS received_count
FROM insurance_towers t
LEFT JOIN quote_subjectivities qs ON qs.quote_id = t.id
LEFT JOIN submission_subjectivities ss ON ss.id = qs.subjectivity_id
GROUP BY t.id;


-- ============================================================================
-- USEFUL QUERIES
-- ============================================================================

-- Get subjectivities for a specific quote (for document generation)
-- SELECT ss.*
-- FROM submission_subjectivities ss
-- JOIN quote_subjectivities qs ON qs.subjectivity_id = ss.id
-- WHERE qs.quote_id = 'QUOTE-ID'
-- ORDER BY ss.created_at;

-- Get subjectivities for bound option (for admin view)
-- SELECT ss.*
-- FROM submission_subjectivities ss
-- JOIN quote_subjectivities qs ON qs.subjectivity_id = ss.id
-- JOIN insurance_towers t ON t.id = qs.quote_id
-- WHERE t.submission_id = 'SUBMISSION-ID' AND t.is_bound = true
-- ORDER BY ss.created_at;

-- Add subjectivity and link to all options of a position
-- WITH new_subj AS (
--     INSERT INTO submission_subjectivities (submission_id, text, category)
--     VALUES ('SUB-ID', 'New subjectivity text', 'general')
--     RETURNING id
-- )
-- INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
-- SELECT t.id, new_subj.id
-- FROM insurance_towers t, new_subj
-- WHERE t.submission_id = 'SUB-ID' AND t.position = 'primary';

-- Pull subjectivities from another option
-- INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
-- SELECT 'TARGET-QUOTE-ID', subjectivity_id
-- FROM quote_subjectivities
-- WHERE quote_id = 'SOURCE-QUOTE-ID'
-- ON CONFLICT DO NOTHING;
