-- Policy Form Catalog Tables
-- Enables "extract once, reuse forever" for policy form language

-- ============================================================================
-- POLICY FORM CATALOG
-- Stores base policy forms and standard endorsements
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_form_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Form identification
    form_number TEXT NOT NULL,              -- "ISO CG 00 01 04 13" or "BZ CY 01 2023"
    form_name TEXT,                         -- "Commercial General Liability Coverage Form"
    form_type TEXT NOT NULL,                -- 'base_policy', 'endorsement', 'schedule'

    -- Carrier/source
    carrier TEXT,                           -- NULL for ISO/standard forms, carrier name for proprietary
    edition_date DATE,                      -- Form edition date

    -- Raw content
    full_text TEXT,                         -- Complete OCR text of form
    page_count INT,

    -- AI-analyzed content (populated by Claude analysis)
    coverage_grants JSONB,                  -- What's covered
    -- Example: [{"coverage": "cyber_extortion", "description": "...", "conditions": [...]}]

    exclusions JSONB,                       -- What's excluded
    -- Example: [{"exclusion": "war", "description": "...", "exceptions": [...]}]

    definitions JSONB,                      -- Key defined terms
    -- Example: {"computer_system": "...", "cyber_incident": "..."}

    conditions JSONB,                       -- Policy conditions
    -- Example: [{"condition": "notice", "requirement": "...", "timeframe": "..."}]

    key_provisions JSONB,                   -- Other important clauses
    sublimit_fields JSONB,                  -- Fields that typically have fill-in sublimits
    -- Example: ["cyber_extortion_sublimit", "social_engineering_sublimit"]

    -- For semantic search / RAG
    embedding VECTOR(1536),                 -- OpenAI embedding of full text

    -- Metadata
    extraction_source TEXT,                 -- 'textract' or 'claude_vision'
    extraction_cost DECIMAL(10,4),          -- Cost to extract this form
    times_referenced INT DEFAULT 0,         -- How many policies use this form

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(form_number, carrier, edition_date)
);

-- Index for fast form lookup
CREATE INDEX IF NOT EXISTS idx_policy_form_catalog_form_number
ON policy_form_catalog(form_number);

CREATE INDEX IF NOT EXISTS idx_policy_form_catalog_carrier
ON policy_form_catalog(carrier);

CREATE INDEX IF NOT EXISTS idx_policy_form_catalog_type
ON policy_form_catalog(form_type);

-- ============================================================================
-- POLICY FORM SECTIONS
-- Breaks down forms into sections for granular RAG
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_form_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES policy_form_catalog(id) ON DELETE CASCADE,

    section_type TEXT NOT NULL,             -- 'insuring_agreement', 'exclusion', 'condition', 'definition'
    section_title TEXT,                     -- "Section I - Coverages"
    section_number TEXT,                    -- "A.1.a"

    content TEXT NOT NULL,                  -- Section text
    page_start INT,
    page_end INT,

    -- For semantic search
    embedding VECTOR(1536),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_form_sections_form_id
ON policy_form_sections(form_id);

CREATE INDEX IF NOT EXISTS idx_policy_form_sections_type
ON policy_form_sections(section_type);

-- ============================================================================
-- DOCUMENT POLICY FORMS
-- Links a specific policy document to catalog forms
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_policy_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    form_id UUID REFERENCES policy_form_catalog(id),  -- NULL if form not yet in catalog

    form_number TEXT NOT NULL,              -- Detected form number
    form_type TEXT,                         -- 'base_policy', 'endorsement'
    page_start INT,                         -- Where this form starts in document
    page_end INT,                           -- Where this form ends

    -- Status
    catalog_status TEXT DEFAULT 'pending',  -- 'pending', 'matched', 'queued_for_extraction', 'not_found'

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_policy_forms_document_id
ON document_policy_forms(document_id);

CREATE INDEX IF NOT EXISTS idx_document_policy_forms_form_id
ON document_policy_forms(form_id);

-- ============================================================================
-- POLICY FILL-IN VALUES
-- Variable values specific to each policy (not in catalog)
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_fill_in_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES submissions(id),

    -- What field this is
    field_category TEXT NOT NULL,           -- 'limit', 'sublimit', 'retention', 'date', 'name', 'schedule_item'
    field_name TEXT NOT NULL,               -- "cyber_extortion_sublimit", "named_insured"
    field_label TEXT,                       -- Label as it appears on form: "Cyber Extortion Sublimit:"

    -- The value
    field_value TEXT NOT NULL,              -- "$500,000" or "Acme Corp"
    field_value_numeric DECIMAL(15,2),      -- Parsed numeric value if applicable
    field_value_date DATE,                  -- Parsed date if applicable

    -- Source location (for highlighting)
    page INT,
    bbox JSONB,                             -- {"left": 0.1, "top": 0.2, "width": 0.3, "height": 0.05}

    -- Which form this is on
    form_number TEXT,                       -- Form where this fill-in appears

    -- Extraction metadata
    confidence DECIMAL(3,2),
    extractor TEXT,                         -- 'textract_forms', 'claude_vision'

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_fill_in_values_document_id
ON policy_fill_in_values(document_id);

CREATE INDEX IF NOT EXISTS idx_policy_fill_in_values_submission_id
ON policy_fill_in_values(submission_id);

CREATE INDEX IF NOT EXISTS idx_policy_fill_in_values_field_name
ON policy_fill_in_values(field_name);

-- ============================================================================
-- POLICY DECLARATIONS
-- Structured dec page data
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES submissions(id),

    -- Identification
    policy_number TEXT,
    carrier TEXT,

    -- Named insured
    named_insured TEXT,
    insured_address TEXT,

    -- Dates
    effective_date DATE,
    expiration_date DATE,

    -- Limits (stored as structured JSONB)
    limits JSONB,
    -- Example: {
    --   "per_occurrence": 1000000,
    --   "aggregate": 2000000,
    --   "cyber_extortion": 500000,
    --   "business_interruption": 1000000
    -- }

    -- Retentions
    retentions JSONB,
    -- Example: {
    --   "each_claim": 25000,
    --   "cyber_extortion": 50000
    -- }

    -- Premium
    premium_total DECIMAL(12,2),
    premium_by_coverage JSONB,

    -- Forms attached
    form_schedule JSONB,                    -- List of form numbers attached
    -- Example: ["CY 00 01", "CY 00 02", "CY 21 06"]

    -- Extraction metadata
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    extraction_confidence DECIMAL(3,2),
    extractor TEXT,

    -- Source for highlighting
    source_pages INT[],                     -- Which pages dec info came from
    field_locations JSONB                   -- {"policy_number": {"page": 1, "bbox": {...}}, ...}
);

CREATE INDEX IF NOT EXISTS idx_policy_declarations_document_id
ON policy_declarations(document_id);

CREATE INDEX IF NOT EXISTS idx_policy_declarations_submission_id
ON policy_declarations(submission_id);

CREATE INDEX IF NOT EXISTS idx_policy_declarations_carrier
ON policy_declarations(carrier);

-- ============================================================================
-- EXTRACTION QUEUE
-- Tracks forms that need full extraction
-- ============================================================================

CREATE TABLE IF NOT EXISTS form_extraction_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    form_number TEXT NOT NULL,
    carrier TEXT,

    -- Source document where we first saw this form
    source_document_id UUID REFERENCES documents(id),
    page_start INT,
    page_end INT,

    -- Status
    status TEXT DEFAULT 'pending',          -- 'pending', 'processing', 'completed', 'failed'
    priority INT DEFAULT 5,                 -- 1 = highest priority

    -- Processing metadata
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,

    -- Result
    catalog_entry_id UUID REFERENCES policy_form_catalog(id),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_extraction_queue_status
ON form_extraction_queue(status);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Forms pending extraction
CREATE OR REPLACE VIEW v_pending_form_extractions AS
SELECT
    q.id,
    q.form_number,
    q.carrier,
    q.priority,
    q.created_at,
    d.filename as source_document,
    s.applicant_name as submission
FROM form_extraction_queue q
LEFT JOIN documents d ON q.source_document_id = d.id
LEFT JOIN submissions s ON d.submission_id = s.id
WHERE q.status = 'pending'
ORDER BY q.priority, q.created_at;

-- View: Catalog coverage summary
CREATE OR REPLACE VIEW v_catalog_summary AS
SELECT
    carrier,
    form_type,
    COUNT(*) as form_count,
    SUM(times_referenced) as total_references,
    SUM(extraction_cost) as total_extraction_cost
FROM policy_form_catalog
GROUP BY carrier, form_type
ORDER BY carrier, form_type;

-- View: Policy fill-ins for a submission
CREATE OR REPLACE VIEW v_submission_policy_values AS
SELECT
    s.id as submission_id,
    s.applicant_name,
    pd.carrier,
    pd.policy_number,
    pd.effective_date,
    pd.expiration_date,
    pd.limits,
    pd.retentions,
    pd.premium_total,
    pf.field_name,
    pf.field_value,
    pf.page,
    pf.bbox
FROM submissions s
JOIN policy_declarations pd ON pd.submission_id = s.id
LEFT JOIN policy_fill_in_values pf ON pf.submission_id = s.id
ORDER BY s.id, pf.field_category, pf.field_name;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Check if form is in catalog
CREATE OR REPLACE FUNCTION check_form_in_catalog(
    p_form_number TEXT,
    p_carrier TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_form_id UUID;
BEGIN
    SELECT id INTO v_form_id
    FROM policy_form_catalog
    WHERE form_number = p_form_number
      AND (p_carrier IS NULL OR carrier = p_carrier OR carrier IS NULL)
    LIMIT 1;

    RETURN v_form_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Queue form for extraction if not in catalog
CREATE OR REPLACE FUNCTION queue_form_if_needed(
    p_form_number TEXT,
    p_carrier TEXT,
    p_source_document_id UUID,
    p_page_start INT,
    p_page_end INT
) RETURNS TEXT AS $$
DECLARE
    v_form_id UUID;
    v_queue_id UUID;
BEGIN
    -- Check if already in catalog
    v_form_id := check_form_in_catalog(p_form_number, p_carrier);

    IF v_form_id IS NOT NULL THEN
        -- Update reference count
        UPDATE policy_form_catalog
        SET times_referenced = times_referenced + 1
        WHERE id = v_form_id;

        RETURN 'exists';
    END IF;

    -- Check if already queued
    SELECT id INTO v_queue_id
    FROM form_extraction_queue
    WHERE form_number = p_form_number
      AND (carrier = p_carrier OR (carrier IS NULL AND p_carrier IS NULL))
      AND status IN ('pending', 'processing');

    IF v_queue_id IS NOT NULL THEN
        RETURN 'queued';
    END IF;

    -- Queue for extraction
    INSERT INTO form_extraction_queue (
        form_number, carrier, source_document_id, page_start, page_end
    ) VALUES (
        p_form_number, p_carrier, p_source_document_id, p_page_start, p_page_end
    );

    RETURN 'queued_new';
END;
$$ LANGUAGE plpgsql;
