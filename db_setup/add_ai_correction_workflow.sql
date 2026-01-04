-- =============================================================================
-- AI Correction Review Workflow
--
-- Extends extraction_corrections to support AI auto-corrections that need
-- UW review before being finalized.
--
-- Use case: AI extracts "1908" from OCR but corrects to "2008" - UW should
-- review this before it's accepted as the final value.
-- =============================================================================

-- Add columns to support AI correction workflow
ALTER TABLE extraction_corrections
    ADD COLUMN IF NOT EXISTS correction_type VARCHAR(20) DEFAULT 'human',
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'accepted',
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Update existing records to be marked as human corrections (already accepted)
UPDATE extraction_corrections
SET correction_type = 'human', status = 'accepted'
WHERE correction_type IS NULL;

-- Add constraint for correction_type
ALTER TABLE extraction_corrections
    DROP CONSTRAINT IF EXISTS extraction_corrections_type_check;
ALTER TABLE extraction_corrections
    ADD CONSTRAINT extraction_corrections_type_check
    CHECK (correction_type IN ('human', 'ai_auto'));

-- Add constraint for status
ALTER TABLE extraction_corrections
    DROP CONSTRAINT IF EXISTS extraction_corrections_status_check;
ALTER TABLE extraction_corrections
    ADD CONSTRAINT extraction_corrections_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected'));

-- Index for finding pending AI corrections
CREATE INDEX IF NOT EXISTS idx_extraction_corrections_pending
    ON extraction_corrections(status)
    WHERE status = 'pending';

-- Comments
COMMENT ON COLUMN extraction_corrections.correction_type IS 'human = UW manually corrected, ai_auto = AI auto-corrected during extraction';
COMMENT ON COLUMN extraction_corrections.status IS 'pending = needs UW review, accepted = confirmed correct, rejected = reverted to original';
COMMENT ON COLUMN extraction_corrections.reviewed_by IS 'UW who reviewed the AI correction';
COMMENT ON COLUMN extraction_corrections.reviewed_at IS 'When the AI correction was reviewed';


-- =============================================================================
-- View: Pending AI corrections for review
-- =============================================================================

CREATE OR REPLACE VIEW v_pending_ai_corrections AS
SELECT
    ec.id,
    ec.provenance_id,
    ep.submission_id,
    s.applicant_name,
    ep.field_name,
    ec.original_value,
    ec.corrected_value,
    ec.correction_reason,
    ep.source_document_id,
    ep.source_page,
    ep.source_text,
    ep.confidence,
    ec.corrected_at as detected_at
FROM extraction_corrections ec
JOIN extraction_provenance ep ON ec.provenance_id = ep.id
JOIN submissions s ON ep.submission_id = s.id
WHERE ec.correction_type = 'ai_auto'
  AND ec.status = 'pending'
ORDER BY ec.corrected_at DESC;

COMMENT ON VIEW v_pending_ai_corrections IS 'AI auto-corrections awaiting UW review';


-- =============================================================================
-- View: Correction counts by submission (for badge display)
-- =============================================================================

CREATE OR REPLACE VIEW v_correction_counts AS
SELECT
    ep.submission_id,
    COUNT(*) FILTER (WHERE ec.status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE ec.status = 'accepted') as accepted_count,
    COUNT(*) FILTER (WHERE ec.status = 'rejected') as rejected_count,
    COUNT(*) as total_count
FROM extraction_corrections ec
JOIN extraction_provenance ep ON ec.provenance_id = ep.id
WHERE ec.correction_type = 'ai_auto'
GROUP BY ep.submission_id;

COMMENT ON VIEW v_correction_counts IS 'AI correction counts by submission for UI badges';
