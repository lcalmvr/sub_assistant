-- =============================================================================
-- Migration: Link extraction_provenance to textract_extractions via bbox_id
-- =============================================================================
-- This enables direct lookup of bounding boxes for PDF highlighting without
-- needing fuzzy text matching.

-- Add textract_extraction_id column to extraction_provenance
ALTER TABLE extraction_provenance
ADD COLUMN IF NOT EXISTS textract_extraction_id UUID REFERENCES textract_extractions(id) ON DELETE SET NULL;

-- Index for efficient bbox lookup
CREATE INDEX IF NOT EXISTS idx_extraction_provenance_textract
    ON extraction_provenance(textract_extraction_id)
    WHERE textract_extraction_id IS NOT NULL;

-- Add index on textract_extractions for efficient ID lookup
CREATE INDEX IF NOT EXISTS idx_textract_extractions_id
    ON textract_extractions(id);

COMMENT ON COLUMN extraction_provenance.textract_extraction_id IS 'Direct link to textract_extractions for bbox highlighting';
