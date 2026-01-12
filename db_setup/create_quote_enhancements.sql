-- Quote Enhancements Table
-- Enhancement instances added to quotes, triggering endorsement auto-attach

CREATE TABLE IF NOT EXISTS quote_enhancements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    quote_id UUID NOT NULL REFERENCES insurance_towers(id) ON DELETE CASCADE,
    enhancement_type_id UUID NOT NULL REFERENCES enhancement_types(id),

    -- Enhancement Data (validated against enhancement_types.data_schema)
    data JSONB NOT NULL DEFAULT '{}',

    -- Link to auto-created endorsement (for tracking)
    linked_endorsement_junction_id UUID REFERENCES quote_endorsements(id) ON DELETE SET NULL,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,

    -- Prevent duplicate enhancement types per quote
    UNIQUE(quote_id, enhancement_type_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quote_enhancements_quote
    ON quote_enhancements(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_enhancements_type
    ON quote_enhancements(enhancement_type_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION quote_enhancements_update_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quote_enhancements_update ON quote_enhancements;
CREATE TRIGGER quote_enhancements_update
    BEFORE UPDATE ON quote_enhancements
    FOR EACH ROW
    EXECUTE FUNCTION quote_enhancements_update_trigger();

-- View with type details joined
CREATE OR REPLACE VIEW quote_enhancements_view AS
SELECT
    qe.id,
    qe.quote_id,
    qe.enhancement_type_id,
    qe.data,
    qe.linked_endorsement_junction_id,
    qe.created_at,
    qe.updated_at,
    qe.created_by,
    et.code AS type_code,
    et.name AS type_name,
    et.description AS type_description,
    et.data_schema,
    et.linked_endorsement_code,
    et.position AS type_position,
    t.submission_id
FROM quote_enhancements qe
JOIN enhancement_types et ON et.id = qe.enhancement_type_id
JOIN insurance_towers t ON t.id = qe.quote_id;

COMMENT ON TABLE quote_enhancements IS 'Enhancement instances added to quotes, triggering endorsement auto-attach';
COMMENT ON VIEW quote_enhancements_view IS 'Quote enhancements joined with type details and submission info';
