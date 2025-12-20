-- Document Library Table
-- Single source of truth for reusable document content (endorsements, marketing, claims sheets, specimen forms)
-- Content stored as HTML for rendering through templates

CREATE TABLE IF NOT EXISTS document_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    code TEXT NOT NULL UNIQUE,              -- e.g., "END-WAR-001", "MKT-CLAIMS-001"
    title TEXT NOT NULL,                    -- Formal title for printing

    -- Document Type Classification
    document_type TEXT NOT NULL,            -- endorsement, marketing, claims_sheet, specimen
    category TEXT,                          -- Sub-category for filtering (e.g., "exclusion", "extension")

    -- Content (Rich Text from Quill editor)
    content_html TEXT,                      -- Rich text content as HTML
    content_plain TEXT,                     -- Plain text version for search indexing

    -- Endorsement-specific fields (also useful for filtering other types)
    position TEXT DEFAULT 'either',         -- primary, excess, either
    midterm_only BOOLEAN DEFAULT FALSE,     -- Only applicable mid-term (not at bind)

    -- Versioning
    version INTEGER DEFAULT 1,
    version_notes TEXT,                     -- Notes about this version change

    -- Status workflow
    status TEXT DEFAULT 'draft',            -- draft, active, archived

    -- Ordering for package assembly
    default_sort_order INTEGER DEFAULT 100,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT,
    updated_by TEXT,

    -- Constraints
    CONSTRAINT valid_document_type CHECK (
        document_type IN ('endorsement', 'marketing', 'claims_sheet', 'specimen')
    ),
    CONSTRAINT valid_position CHECK (position IN ('primary', 'excess', 'either')),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'archived'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_document_library_type ON document_library(document_type);
CREATE INDEX IF NOT EXISTS idx_document_library_status ON document_library(status);
CREATE INDEX IF NOT EXISTS idx_document_library_position ON document_library(position);
CREATE INDEX IF NOT EXISTS idx_document_library_category ON document_library(category);

-- Full-text search index on title and content
CREATE INDEX IF NOT EXISTS idx_document_library_search
    ON document_library USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content_plain, '')));

-- Trigger to auto-update updated_at and increment version on content change
CREATE OR REPLACE FUNCTION document_library_update_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    -- If content changed, increment version
    IF OLD.content_html IS DISTINCT FROM NEW.content_html THEN
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_library_update ON document_library;
CREATE TRIGGER document_library_update
    BEFORE UPDATE ON document_library
    FOR EACH ROW
    EXECUTE FUNCTION document_library_update_trigger();

-- Comments for documentation
COMMENT ON TABLE document_library IS 'Single source of truth for reusable document content (endorsements, marketing materials, etc.)';
COMMENT ON COLUMN document_library.content_html IS 'Rich text content from WYSIWYG editor, stored as HTML';
COMMENT ON COLUMN document_library.content_plain IS 'Plain text version for full-text search indexing';
COMMENT ON COLUMN document_library.position IS 'Policy position applicability: primary, excess, or either';
COMMENT ON COLUMN document_library.version IS 'Auto-incremented when content_html changes';
