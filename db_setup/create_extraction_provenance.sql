-- =============================================================================
-- Extraction Provenance Tables
--
-- Stores per-field extraction data from native document processing.
-- Enables:
-- 1. Tracking where each value came from (page, source text)
-- 2. Confidence scoring for extraction quality
-- 3. Correction tracking for model improvement
-- =============================================================================

-- =============================================================================
-- extraction_provenance: Per-field extraction tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS extraction_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Field identification (e.g., "generalInformation.applicantName")
    field_name VARCHAR(200) NOT NULL,

    -- Extracted value (JSONB to support any type)
    extracted_value JSONB,

    -- Confidence score (0.00 to 1.00)
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),

    -- Source provenance
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    source_page INTEGER,
    source_text TEXT,  -- The text snippet that led to this extraction
    source_bbox JSONB,  -- Bounding box if available {x, y, width, height}

    -- Extraction metadata
    model_used VARCHAR(100),
    extraction_method VARCHAR(50) DEFAULT 'claude',  -- claude, docupipe, manual
    is_present BOOLEAN DEFAULT TRUE,  -- Was this question asked in the document?

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'system'
);

-- Unique constraint for upsert (one extraction per field per submission)
CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_provenance_unique
    ON extraction_provenance(submission_id, field_name);

-- Index for looking up all extractions for a submission
CREATE INDEX IF NOT EXISTS idx_extraction_provenance_submission
    ON extraction_provenance(submission_id);

-- Index for looking up specific field extractions
CREATE INDEX IF NOT EXISTS idx_extraction_provenance_field
    ON extraction_provenance(submission_id, field_name);

-- Index for finding low-confidence extractions (for review queue)
CREATE INDEX IF NOT EXISTS idx_extraction_provenance_low_confidence
    ON extraction_provenance(submission_id, confidence)
    WHERE confidence < 0.7;

-- Comment on table
COMMENT ON TABLE extraction_provenance IS 'Per-field extraction data with source provenance for native document processing';
COMMENT ON COLUMN extraction_provenance.field_name IS 'Dot-notation field path e.g. generalInformation.applicantName';
COMMENT ON COLUMN extraction_provenance.confidence IS 'AI confidence score 0-1, higher is more certain';
COMMENT ON COLUMN extraction_provenance.source_text IS 'Text snippet from document that led to this extraction';
COMMENT ON COLUMN extraction_provenance.is_present IS 'Whether the question was asked in the application (vs not found)';


-- =============================================================================
-- extraction_corrections: Track human corrections to extractions
-- =============================================================================

CREATE TABLE IF NOT EXISTS extraction_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provenance_id UUID NOT NULL REFERENCES extraction_provenance(id) ON DELETE CASCADE,

    -- The correction
    original_value JSONB,
    corrected_value JSONB,
    correction_reason TEXT,  -- Optional explanation

    -- Audit
    corrected_by VARCHAR(100),
    corrected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding corrections by provenance
CREATE INDEX IF NOT EXISTS idx_extraction_corrections_provenance
    ON extraction_corrections(provenance_id);

-- Comment on table
COMMENT ON TABLE extraction_corrections IS 'Human corrections to AI extractions for training/improvement';


-- =============================================================================
-- extraction_runs: Track extraction job runs for debugging/monitoring
-- =============================================================================

CREATE TABLE IF NOT EXISTS extraction_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    -- Run metadata
    model_used VARCHAR(100),
    input_tokens INTEGER,
    output_tokens INTEGER,
    duration_ms INTEGER,

    -- Results summary
    fields_extracted INTEGER,
    high_confidence_count INTEGER,  -- >= 0.8
    low_confidence_count INTEGER,   -- < 0.5

    -- Status
    status VARCHAR(20) DEFAULT 'completed',  -- pending, completed, failed
    error_message TEXT,

    -- Audit
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for finding runs by submission
CREATE INDEX IF NOT EXISTS idx_extraction_runs_submission
    ON extraction_runs(submission_id);

-- Comment on table
COMMENT ON TABLE extraction_runs IS 'Extraction job runs for monitoring and debugging';


-- =============================================================================
-- Views for common queries
-- =============================================================================

-- Low confidence extractions needing review
CREATE OR REPLACE VIEW v_low_confidence_extractions AS
SELECT
    ep.id,
    ep.submission_id,
    s.applicant_name,
    ep.field_name,
    ep.extracted_value,
    ep.confidence,
    ep.source_text,
    ep.source_page,
    ep.created_at
FROM extraction_provenance ep
JOIN submissions s ON ep.submission_id = s.id
WHERE ep.confidence < 0.7
  AND ep.is_present = TRUE
ORDER BY ep.confidence ASC, ep.created_at DESC;

COMMENT ON VIEW v_low_confidence_extractions IS 'Extractions with low confidence scores needing human review';


-- Extraction quality by submission
CREATE OR REPLACE VIEW v_extraction_quality AS
SELECT
    submission_id,
    COUNT(*) as total_fields,
    COUNT(*) FILTER (WHERE is_present) as fields_present,
    COUNT(*) FILTER (WHERE confidence >= 0.8) as high_confidence,
    COUNT(*) FILTER (WHERE confidence >= 0.5 AND confidence < 0.8) as medium_confidence,
    COUNT(*) FILTER (WHERE confidence < 0.5 AND is_present) as low_confidence,
    ROUND(AVG(confidence)::numeric, 2) as avg_confidence,
    MAX(created_at) as last_extraction
FROM extraction_provenance
GROUP BY submission_id;

COMMENT ON VIEW v_extraction_quality IS 'Extraction quality metrics by submission';
