-- =============================================================================
-- Conflict Detection & Human Review Tables
--
-- Creates tables for:
-- 1. field_values - Track field extractions with provenance
-- 2. review_items - Track conflicts requiring human attention
--
-- See docs/conflict_review_implementation_plan.md for full documentation.
-- =============================================================================

-- =============================================================================
-- field_values: Track every field extraction with provenance
-- =============================================================================
-- This table stores field values with their source (AI extraction, user edit, etc.)
-- Multiple values can exist for the same field from different sources.
-- The is_active flag indicates which value is currently "winning".

CREATE TABLE IF NOT EXISTS field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Field identification
    field_name VARCHAR(100) NOT NULL,
    value JSONB,  -- Supports any type: string, number, date, object

    -- Provenance tracking
    source_type VARCHAR(50) NOT NULL,  -- ai_extraction, document_form, user_edit, broker_submission, carried_over
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    confidence DECIMAL(3,2),  -- 0.00 to 1.00, NULL for user edits
    extraction_metadata JSONB,  -- Model used, prompt, raw response, etc.

    -- State
    is_active BOOLEAN DEFAULT TRUE,  -- Current value vs historical

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'system'
);

-- Index for looking up all values for a submission
CREATE INDEX IF NOT EXISTS idx_field_values_submission
    ON field_values(submission_id);

-- Index for looking up specific field values (most common query)
CREATE INDEX IF NOT EXISTS idx_field_values_lookup
    ON field_values(submission_id, field_name, is_active);

-- Index for finding low-confidence extractions
CREATE INDEX IF NOT EXISTS idx_field_values_confidence
    ON field_values(submission_id, confidence)
    WHERE source_type = 'ai_extraction' AND confidence IS NOT NULL;

-- Comment on table
COMMENT ON TABLE field_values IS 'Tracks field extractions with provenance for conflict detection';
COMMENT ON COLUMN field_values.source_type IS 'How the value was obtained: ai_extraction, document_form, user_edit, broker_submission, carried_over';
COMMENT ON COLUMN field_values.confidence IS 'AI confidence score 0-1, NULL for non-AI sources';
COMMENT ON COLUMN field_values.is_active IS 'TRUE for current winning value, FALSE for historical/rejected values';


-- =============================================================================
-- review_items: Track conflicts requiring human attention
-- =============================================================================
-- This table stores detected conflicts and their resolution status.
-- Acts as a cache for conflict detection results.

CREATE TABLE IF NOT EXISTS review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Conflict identification
    conflict_type VARCHAR(50) NOT NULL,  -- VALUE_MISMATCH, LOW_CONFIDENCE, MISSING_REQUIRED, CROSS_FIELD, DUPLICATE_SUBMISSION, OUTLIER_VALUE
    field_name VARCHAR(100),  -- NULL for submission-level conflicts (e.g., duplicate)
    priority VARCHAR(20) NOT NULL,  -- high, medium, low

    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, deferred

    -- Conflict details
    conflicting_value_ids UUID[],  -- Array of field_value IDs involved in conflict
    conflict_details JSONB,  -- Type-specific details: message, values, etc.

    -- Resolution
    resolution JSONB,  -- Chosen value, method, notes
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,

    -- Cache management
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    is_stale BOOLEAN DEFAULT FALSE  -- Set TRUE when underlying data changes
);

-- Index for looking up all review items for a submission
CREATE INDEX IF NOT EXISTS idx_review_items_submission
    ON review_items(submission_id);

-- Index for finding pending items (most common query)
CREATE INDEX IF NOT EXISTS idx_review_items_pending
    ON review_items(submission_id, status)
    WHERE status = 'pending';

-- Index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_review_items_priority
    ON review_items(submission_id, priority, status);

-- Index for dashboard queries (pending count across all submissions)
CREATE INDEX IF NOT EXISTS idx_review_items_status_global
    ON review_items(status)
    WHERE status = 'pending';

-- Comment on table
COMMENT ON TABLE review_items IS 'Tracks conflicts requiring human review and their resolution';
COMMENT ON COLUMN review_items.conflict_type IS 'Type: VALUE_MISMATCH, LOW_CONFIDENCE, MISSING_REQUIRED, CROSS_FIELD, DUPLICATE_SUBMISSION, OUTLIER_VALUE';
COMMENT ON COLUMN review_items.status IS 'Resolution status: pending, approved, rejected, deferred';
COMMENT ON COLUMN review_items.is_stale IS 'TRUE when cache is invalidated and needs re-detection';


-- =============================================================================
-- Helpful views
-- =============================================================================

-- View: Pending review counts by submission
CREATE OR REPLACE VIEW v_review_summary AS
SELECT
    submission_id,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'high') as high_priority_count,
    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'medium') as medium_priority_count,
    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'low') as low_priority_count,
    COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
    COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
    COUNT(*) FILTER (WHERE status = 'deferred') as deferred_count,
    COUNT(*) as total_count,
    MAX(detected_at) as last_detection
FROM review_items
GROUP BY submission_id;

COMMENT ON VIEW v_review_summary IS 'Summary of review item counts by submission';


-- View: Active field values with their sources
CREATE OR REPLACE VIEW v_active_field_values AS
SELECT
    fv.id,
    fv.submission_id,
    fv.field_name,
    fv.value,
    fv.source_type,
    fv.confidence,
    fv.created_at,
    d.filename as source_document_name
FROM field_values fv
LEFT JOIN documents d ON fv.source_document_id = d.id
WHERE fv.is_active = TRUE;

COMMENT ON VIEW v_active_field_values IS 'Currently active field values with source document info';


-- =============================================================================
-- Sample queries for common operations
-- =============================================================================

-- Get all pending conflicts for a submission with details:
-- SELECT
--     ri.id, ri.conflict_type, ri.field_name, ri.priority, ri.conflict_details,
--     json_agg(fv.*) as conflicting_values
-- FROM review_items ri
-- LEFT JOIN field_values fv ON fv.id = ANY(ri.conflicting_value_ids)
-- WHERE ri.submission_id = 'xxx' AND ri.status = 'pending'
-- GROUP BY ri.id;

-- Get submissions with high-priority pending conflicts:
-- SELECT DISTINCT s.id, s.applicant_name, v.high_priority_count
-- FROM submissions s
-- JOIN v_review_summary v ON s.id = v.submission_id
-- WHERE v.high_priority_count > 0;

-- Get all values for a specific field (to show in conflict resolution UI):
-- SELECT * FROM field_values
-- WHERE submission_id = 'xxx' AND field_name = 'annual_revenue'
-- ORDER BY created_at;
