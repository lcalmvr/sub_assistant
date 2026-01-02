-- ============================================================================
-- ENDORSEMENTS JUNCTION TABLE: Link endorsements to quotes with fillable fields
-- ============================================================================
--
-- Replaces the simple endorsements[] array on insurance_towers with a proper
-- junction table that supports:
--   1. Linking endorsements (from document_library) to specific quotes
--   2. Storing fillable field values per quote (e.g., additional insured name)
--   3. Easy cross-quote queries (which options have which endorsements)
--   4. "Apply to all" functionality
--
-- Run: psql $DATABASE_URL -f db_setup/endorsements_junction.sql
-- ============================================================================

-- Junction table: links quotes to endorsements with field values
CREATE TABLE IF NOT EXISTS quote_endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES insurance_towers(id) ON DELETE CASCADE,
    endorsement_id UUID NOT NULL REFERENCES document_library(id) ON DELETE CASCADE,
    field_values JSONB DEFAULT '{}',  -- {"additional_insured": "Acme Corp", "sublimit": 500000}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,

    -- Each endorsement can only be linked once per quote
    UNIQUE(quote_id, endorsement_id)
);

-- Index for fast quote lookups
CREATE INDEX IF NOT EXISTS idx_quote_endorsements_quote
    ON quote_endorsements(quote_id);

-- Index for finding all quotes with a specific endorsement
CREATE INDEX IF NOT EXISTS idx_quote_endorsements_endorsement
    ON quote_endorsements(endorsement_id);

-- ============================================================================
-- DATA MIGRATION: Move existing endorsements[] to junction table
-- ============================================================================

-- Migrate existing endorsement data from insurance_towers.endorsements array
-- The array contains title strings that match document_library.title
DO $$
DECLARE
    quote_rec RECORD;
    title_val TEXT;
    lib_id UUID;
    migrated_count INT := 0;
    skipped_count INT := 0;
BEGIN
    -- Loop through all quotes with endorsements
    FOR quote_rec IN
        SELECT id, endorsements
        FROM insurance_towers
        WHERE endorsements IS NOT NULL
          AND jsonb_array_length(endorsements) > 0
    LOOP
        -- Loop through each title in the endorsements array
        FOR title_val IN
            SELECT jsonb_array_elements_text(quote_rec.endorsements)
        LOOP
            -- Find the document_library entry by title
            SELECT id INTO lib_id
            FROM document_library
            WHERE title = title_val
              AND document_type = 'endorsement'
            LIMIT 1;

            IF lib_id IS NOT NULL THEN
                -- Insert into junction table (skip if already exists)
                INSERT INTO quote_endorsements (quote_id, endorsement_id)
                VALUES (quote_rec.id, lib_id)
                ON CONFLICT (quote_id, endorsement_id) DO NOTHING;

                migrated_count := migrated_count + 1;
            ELSE
                -- Log titles that don't match any library entry
                RAISE NOTICE 'No library entry found for endorsement: %', title_val;
                skipped_count := skipped_count + 1;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Migration complete: % endorsements migrated, % skipped', migrated_count, skipped_count;
END $$;

-- ============================================================================
-- HELPER VIEW: Quote endorsements with library details
-- ============================================================================

CREATE OR REPLACE VIEW quote_endorsements_view AS
SELECT
    qe.id,
    qe.quote_id,
    qe.endorsement_id,
    qe.field_values,
    qe.created_at,
    dl.title,
    dl.code,
    dl.category,
    dl.position,
    dl.auto_attach_rules,
    dl.fill_in_mappings,
    t.submission_id
FROM quote_endorsements qe
JOIN document_library dl ON dl.id = qe.endorsement_id
JOIN insurance_towers t ON t.id = qe.quote_id;

-- ============================================================================
-- HELPER VIEW: All endorsements for a submission (across all quote options)
-- ============================================================================

CREATE OR REPLACE VIEW submission_endorsements_view AS
SELECT DISTINCT ON (t.submission_id, dl.id)
    t.submission_id,
    dl.id AS endorsement_id,
    dl.title,
    dl.code,
    dl.category,
    dl.position,
    array_agg(DISTINCT t.id) AS quote_ids,
    COUNT(DISTINCT t.id) AS quote_count
FROM quote_endorsements qe
JOIN document_library dl ON dl.id = qe.endorsement_id
JOIN insurance_towers t ON t.id = qe.quote_id
GROUP BY t.submission_id, dl.id, dl.title, dl.code, dl.category, dl.position;

-- ============================================================================
-- NOTE: After running this migration, you can optionally drop the old column:
-- ALTER TABLE insurance_towers DROP COLUMN endorsements;
--
-- But recommend keeping it temporarily until frontend is fully migrated.
-- ============================================================================
