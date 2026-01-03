-- =============================================================================
-- Textract Extractions Table - Store bbox coordinates for highlighting
-- =============================================================================

CREATE TABLE IF NOT EXISTS textract_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,

    -- Key-value pair info from Textract
    field_key TEXT NOT NULL,
    field_value TEXT,
    field_type VARCHAR(20) DEFAULT 'text', -- text, checkbox

    -- Bounding box (normalized 0-1 coordinates)
    bbox_left DECIMAL(7, 6),
    bbox_top DECIMAL(7, 6),
    bbox_width DECIMAL(7, 6),
    bbox_height DECIMAL(7, 6),

    -- Confidence from Textract
    confidence DECIMAL(4, 3),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up by document
CREATE INDEX IF NOT EXISTS idx_textract_extractions_doc
    ON textract_extractions(document_id);

-- Index for looking up by document and page
CREATE INDEX IF NOT EXISTS idx_textract_extractions_doc_page
    ON textract_extractions(document_id, page_number);

-- Index for text search on field_key and field_value
CREATE INDEX IF NOT EXISTS idx_textract_extractions_key
    ON textract_extractions(document_id, field_key);

-- Full text search index for matching source_text from provenance
CREATE INDEX IF NOT EXISTS idx_textract_extractions_value_trgm
    ON textract_extractions USING gin (field_value gin_trgm_ops);

-- Enable trigram extension if not exists (for fuzzy text matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON TABLE textract_extractions IS 'Stores Textract key-value pairs with bounding box coordinates for PDF highlighting';
COMMENT ON COLUMN textract_extractions.bbox_left IS 'Left edge of bounding box (normalized 0-1)';
COMMENT ON COLUMN textract_extractions.bbox_top IS 'Top edge of bounding box (normalized 0-1)';
COMMENT ON COLUMN textract_extractions.bbox_width IS 'Width of bounding box (normalized 0-1)';
COMMENT ON COLUMN textract_extractions.bbox_height IS 'Height of bounding box (normalized 0-1)';
