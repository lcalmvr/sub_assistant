-- =============================================================================
-- OCR Metadata for Extraction Logging
--
-- Adds columns to track scanned document detection and OCR confidence
-- =============================================================================

-- Add OCR columns to extraction_logs table
-- These track when documents required OCR fallback

DO $$
BEGIN
    -- Create extraction_logs table if it doesn't exist
    CREATE TABLE IF NOT EXISTS extraction_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
        filename VARCHAR(500),
        document_type VARCHAR(100),
        strategy VARCHAR(50),
        pages_total INTEGER,
        pages_processed INTEGER,
        estimated_cost DECIMAL(10, 4),
        actual_cost DECIMAL(10, 4),
        duration_ms INTEGER,
        key_value_pairs_count INTEGER,
        checkboxes_count INTEGER,
        form_numbers_found TEXT[],
        forms_matched INTEGER,
        forms_queued INTEGER,
        phases_executed TEXT[],
        status VARCHAR(20) DEFAULT 'started',
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        -- OCR metadata (added in this migration)
        is_scanned BOOLEAN DEFAULT FALSE,
        ocr_confidence DECIMAL(3, 2)
    );

    -- If table already exists, add columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'extraction_logs' AND column_name = 'is_scanned') THEN
        ALTER TABLE extraction_logs ADD COLUMN is_scanned BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'extraction_logs' AND column_name = 'ocr_confidence') THEN
        ALTER TABLE extraction_logs ADD COLUMN ocr_confidence DECIMAL(3, 2);
    END IF;
END $$;

-- Index for finding scanned documents
CREATE INDEX IF NOT EXISTS idx_extraction_logs_scanned
    ON extraction_logs(is_scanned) WHERE is_scanned = TRUE;

-- Comment on columns
COMMENT ON COLUMN extraction_logs.is_scanned IS 'True if document required OCR (was scanned/image-based PDF)';
COMMENT ON COLUMN extraction_logs.ocr_confidence IS 'Average OCR confidence score (0-1) when OCR was used';

-- Summary view for OCR statistics
CREATE OR REPLACE VIEW v_ocr_statistics AS
SELECT
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE is_scanned) as scanned_documents,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_scanned) / NULLIF(COUNT(*), 0), 1) as scanned_pct,
    ROUND(AVG(ocr_confidence) FILTER (WHERE is_scanned), 2) as avg_ocr_confidence,
    SUM(actual_cost) FILTER (WHERE is_scanned) as ocr_cost
FROM extraction_logs
WHERE status = 'completed'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

COMMENT ON VIEW v_ocr_statistics IS 'Daily statistics on OCR usage and costs';
