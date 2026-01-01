-- ============================================================================
-- ENDORSEMENT COMPONENT TEMPLATES
-- ============================================================================
-- Reusable template components for endorsement structure:
--   - header: Company name, form numbers, policy reference
--   - lead_in: Standard opening language
--   - closing: Standard closing language
--
-- These apply globally to all endorsements, so updating one template
-- updates the rendering for all endorsements using that component.
--
-- Run: psql $DATABASE_URL -f db_setup/create_endorsement_component_templates.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS endorsement_component_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Component identification
    component_type TEXT NOT NULL,           -- header, lead_in, closing
    name TEXT NOT NULL,                     -- "Standard", "Excess-specific", etc.

    -- Content
    content_html TEXT,                      -- Rich text content

    -- Applicability
    position TEXT DEFAULT 'either',         -- primary, excess, either
    is_default BOOLEAN DEFAULT FALSE,       -- Default template for this type/position

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT,
    updated_by TEXT,

    -- Constraints
    CONSTRAINT valid_component_type CHECK (
        component_type IN ('header', 'lead_in', 'closing')
    ),
    CONSTRAINT valid_position CHECK (
        position IN ('primary', 'excess', 'either')
    )
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_endorsement_component_type
    ON endorsement_component_templates(component_type, position);

-- Only one default per component_type + position combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_endorsement_component_default
    ON endorsement_component_templates(component_type, position)
    WHERE is_default = TRUE;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION endorsement_component_templates_update_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS endorsement_component_templates_update ON endorsement_component_templates;
CREATE TRIGGER endorsement_component_templates_update
    BEFORE UPDATE ON endorsement_component_templates
    FOR EACH ROW
    EXECUTE FUNCTION endorsement_component_templates_update_trigger();

-- ============================================================================
-- SEED DEFAULT TEMPLATES
-- ============================================================================

-- Standard Header (applies to all positions)
INSERT INTO endorsement_component_templates (component_type, name, position, is_default, content_html, created_by)
VALUES (
    'header',
    'Standard Header',
    'either',
    TRUE,
    '<div class="endorsement-header">
        <div class="company-name">CMAI SPECIALTY INSURANCE COMPANY</div>
        <div class="form-info">{{form_number}} ({{edition_date}})</div>
    </div>',
    'system'
) ON CONFLICT DO NOTHING;

-- Standard Lead-in
INSERT INTO endorsement_component_templates (component_type, name, position, is_default, content_html, created_by)
VALUES (
    'lead_in',
    'Standard Lead-in',
    'either',
    TRUE,
    '<p class="endorsement-lead-in">
        This endorsement modifies insurance provided under:<br/>
        <strong>{{policy_type}}</strong>
    </p>
    <p class="endorsement-effective">
        Effective Date: {{effective_date}}<br/>
        Policy Number: {{policy_number}}
    </p>',
    'system'
) ON CONFLICT DO NOTHING;

-- Standard Closing
INSERT INTO endorsement_component_templates (component_type, name, position, is_default, content_html, created_by)
VALUES (
    'closing',
    'Standard Closing',
    'either',
    TRUE,
    '<div class="endorsement-closing">
        <p>All other terms and conditions of the Policy remain unchanged.</p>
        <div class="signature-block">
            <div class="signature-line">
                <span class="signature-title">Authorized Representative</span>
            </div>
        </div>
    </div>',
    'system'
) ON CONFLICT DO NOTHING;

-- Excess-specific Lead-in (references underlying)
INSERT INTO endorsement_component_templates (component_type, name, position, is_default, content_html, created_by)
VALUES (
    'lead_in',
    'Excess Lead-in',
    'excess',
    TRUE,
    '<p class="endorsement-lead-in">
        This endorsement modifies insurance provided under:<br/>
        <strong>{{policy_type}}</strong><br/>
        Excess of underlying insurance as scheduled.
    </p>
    <p class="endorsement-effective">
        Effective Date: {{effective_date}}<br/>
        Policy Number: {{policy_number}}
    </p>',
    'system'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE endorsement_component_templates IS 'Reusable template components (header, lead-in, closing) for endorsement rendering';
COMMENT ON COLUMN endorsement_component_templates.component_type IS 'Type of component: header, lead_in, or closing';
COMMENT ON COLUMN endorsement_component_templates.is_default IS 'Default template for this component_type + position combination';
COMMENT ON COLUMN endorsement_component_templates.content_html IS 'Rich text content with {{placeholders}} for variable substitution';
