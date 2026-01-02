-- Multi-Document Extraction Support
-- Allows storing extraction values from multiple documents for the same field
-- Enables VALUE_MISMATCH conflict detection across documents

-- 1. Drop the existing unique constraint that only allows one value per field
ALTER TABLE extraction_provenance
DROP CONSTRAINT IF EXISTS extraction_provenance_submission_id_field_name_key;

-- 2. Add new unique constraint that allows one value per field PER DOCUMENT
ALTER TABLE extraction_provenance
ADD CONSTRAINT extraction_provenance_submission_field_document_key
UNIQUE (submission_id, field_name, source_document_id);

-- 3. Add accepted_value column to track which value the UW selected when there's a conflict
ALTER TABLE extraction_provenance
ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN DEFAULT NULL;

-- 4. Add index for efficient conflict queries
CREATE INDEX IF NOT EXISTS idx_extraction_provenance_field_lookup
ON extraction_provenance (submission_id, field_name);

-- 5. Create view for easy conflict detection
CREATE OR REPLACE VIEW extraction_conflicts_view AS
SELECT
    ep1.submission_id,
    ep1.field_name,
    ep1.id as extraction_id_1,
    ep1.extracted_value as value_1,
    ep1.confidence as confidence_1,
    ep1.source_document_id as document_id_1,
    d1.filename as document_1,
    ep2.id as extraction_id_2,
    ep2.extracted_value as value_2,
    ep2.confidence as confidence_2,
    ep2.source_document_id as document_id_2,
    d2.filename as document_2
FROM extraction_provenance ep1
JOIN extraction_provenance ep2
    ON ep1.submission_id = ep2.submission_id
    AND ep1.field_name = ep2.field_name
    AND ep1.source_document_id < ep2.source_document_id  -- Avoid duplicates
JOIN documents d1 ON d1.id = ep1.source_document_id
JOIN documents d2 ON d2.id = ep2.source_document_id
WHERE ep1.extracted_value IS DISTINCT FROM ep2.extracted_value
  AND ep1.is_present = true
  AND ep2.is_present = true;

-- 6. Add comment explaining the schema
COMMENT ON CONSTRAINT extraction_provenance_submission_field_document_key
ON extraction_provenance IS
'Allows multiple extraction values per field - one from each source document. Enables multi-document conflict detection.';
