-- Enhancement Types Table
-- Admin-defined enhancement types with data schemas and endorsement linkage

CREATE TABLE IF NOT EXISTS enhancement_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    code TEXT NOT NULL UNIQUE,              -- e.g., "ADD-INSURED", "MOD-ERP"
    name TEXT NOT NULL,                     -- e.g., "Additional Insured Schedule"
    description TEXT,                       -- Longer explanation for UWs

    -- Data Schema Definition (simplified JSON Schema for form generation)
    data_schema JSONB NOT NULL,

    -- Endorsement Linkage
    linked_endorsement_code TEXT,           -- Code in document_library (e.g., "END-AI-001")

    -- Applicability
    position TEXT DEFAULT 'either',         -- primary, excess, either

    -- Display
    sort_order INTEGER DEFAULT 100,

    -- Status
    active BOOLEAN DEFAULT TRUE,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,

    CONSTRAINT valid_position CHECK (position IN ('primary', 'excess', 'either'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enhancement_types_active
    ON enhancement_types(active, position);
CREATE INDEX IF NOT EXISTS idx_enhancement_types_code
    ON enhancement_types(code);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION enhancement_types_update_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enhancement_types_update ON enhancement_types;
CREATE TRIGGER enhancement_types_update
    BEFORE UPDATE ON enhancement_types
    FOR EACH ROW
    EXECUTE FUNCTION enhancement_types_update_trigger();

COMMENT ON TABLE enhancement_types IS 'Admin-defined enhancement types with data schemas and endorsement linkage';
COMMENT ON COLUMN enhancement_types.data_schema IS 'JSON Schema defining required fields for this enhancement type';
COMMENT ON COLUMN enhancement_types.linked_endorsement_code IS 'Code of endorsement in document_library to auto-attach when enhancement is added';
