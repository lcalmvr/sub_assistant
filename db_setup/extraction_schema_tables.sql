-- Extraction Schema Tables
-- Stores field definitions that guide AI extraction from insurance applications

-- Main schema table - versioned collection of field definitions
CREATE TABLE IF NOT EXISTS extraction_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                          -- e.g., "Ransomware Application Schema"
    version INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    is_active BOOLEAN DEFAULT false,             -- Only one active schema per name
    schema_definition JSONB NOT NULL,            -- Full schema structure
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,                             -- User who created this version
    UNIQUE(name, version)
);

-- Schema categories - top-level groupings (for UI organization)
-- Note: Also stored in schema_definition JSONB, this is for easier querying
CREATE TABLE IF NOT EXISTS schema_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID REFERENCES extraction_schemas(id) ON DELETE CASCADE,
    key TEXT NOT NULL,                           -- e.g., "backupAndRecovery"
    display_name TEXT NOT NULL,                  -- e.g., "Backup And Recovery"
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schema_id, key)
);

-- Schema fields - individual extraction targets
CREATE TABLE IF NOT EXISTS schema_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID REFERENCES extraction_schemas(id) ON DELETE CASCADE,
    category_id UUID REFERENCES schema_categories(id) ON DELETE CASCADE,
    key TEXT NOT NULL,                           -- e.g., "offsiteBackupFrequency"
    display_name TEXT NOT NULL,                  -- e.g., "Offsite Backup Frequency"
    description TEXT,                            -- Guidance for extraction
    field_type TEXT NOT NULL DEFAULT 'string',   -- string, boolean, number, array, enum
    enum_values JSONB,                           -- For enum types: ["daily", "weekly", "monthly", "none"]
    is_required BOOLEAN DEFAULT false,           -- Is this a critical field?
    display_order INTEGER DEFAULT 0,
    example_questions JSONB,                     -- Example phrasings from different apps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schema_id, key)
);

-- AI-suggested schema changes awaiting review
CREATE TABLE IF NOT EXISTS schema_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID REFERENCES extraction_schemas(id) ON DELETE SET NULL,
    recommendation_type TEXT NOT NULL,           -- 'new_field', 'new_category', 'update_enum', 'merge_fields'
    status TEXT DEFAULT 'pending',               -- pending, approved, rejected, deferred

    -- What document triggered this recommendation
    source_document_id UUID,
    source_document_name TEXT,
    source_question_text TEXT,                   -- The question text that prompted this

    -- The recommendation details
    suggested_category TEXT,                     -- Category key (existing or new)
    suggested_field_key TEXT,                    -- Field key
    suggested_field_name TEXT,                   -- Display name
    suggested_type TEXT,                         -- Field type
    suggested_enum_values JSONB,                 -- For enum additions
    suggested_description TEXT,

    -- AI reasoning
    ai_reasoning TEXT,                           -- Why AI thinks this should be added
    confidence NUMERIC(3,2),                     -- 0.00-1.00 confidence score

    -- Similar existing fields (for merge recommendations)
    similar_field_ids JSONB,                     -- Array of existing field IDs that might overlap

    -- Review tracking
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which fields were found in which documents (for analytics and training)
CREATE TABLE IF NOT EXISTS extraction_field_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    field_key TEXT NOT NULL,
    was_found BOOLEAN DEFAULT false,
    extracted_value JSONB,
    source_question_text TEXT,                   -- The actual question text found
    confidence NUMERIC(3,2),
    page_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, field_key)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_extraction_schemas_active ON extraction_schemas(name, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_schema_recommendations_status ON schema_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_schema_recommendations_schema ON schema_recommendations(schema_id);
CREATE INDEX IF NOT EXISTS idx_extraction_field_occurrences_doc ON extraction_field_occurrences(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_field_occurrences_field ON extraction_field_occurrences(field_key);

-- Helpful views
CREATE OR REPLACE VIEW v_active_schemas AS
SELECT * FROM extraction_schemas WHERE is_active = true;

CREATE OR REPLACE VIEW v_pending_recommendations AS
SELECT
    r.*,
    s.name as schema_name,
    s.version as schema_version
FROM schema_recommendations r
LEFT JOIN extraction_schemas s ON r.schema_id = s.id
WHERE r.status = 'pending'
ORDER BY r.created_at DESC;

-- Field coverage view - shows which fields are commonly found across documents
CREATE OR REPLACE VIEW v_field_coverage AS
SELECT
    field_key,
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE was_found) as found_count,
    ROUND(COUNT(*) FILTER (WHERE was_found)::numeric / COUNT(*)::numeric * 100, 1) as coverage_pct,
    AVG(confidence) FILTER (WHERE was_found) as avg_confidence
FROM extraction_field_occurrences
GROUP BY field_key
ORDER BY total_docs DESC, coverage_pct DESC;
