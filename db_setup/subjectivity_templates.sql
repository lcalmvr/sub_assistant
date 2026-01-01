-- ============================================================================
-- SUBJECTIVITY TEMPLATES: Stock subjectivities with position rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS subjectivity_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL UNIQUE,
    position VARCHAR(20) DEFAULT NULL,  -- NULL = all, 'primary', 'excess'
    category VARCHAR(50) DEFAULT 'general',
    is_active BOOLEAN DEFAULT true,
    display_order INT DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert stock subjectivities
INSERT INTO subjectivity_templates (text, position, category, display_order) VALUES
    -- Universal (all options)
    ('Subject to completion of application', NULL, 'documentation', 10),
    ('Subject to receipt of additional underwriting information', NULL, 'documentation', 20),
    ('Premium subject to audit', NULL, 'premium', 30),
    ('Coverage bound subject to company acceptance', NULL, 'binding', 40),
    ('Coverage is subject to policy terms and conditions', NULL, 'general', 50),
    ('Premium subject to minimum retained premium', NULL, 'premium', 60),
    ('Rate subject to satisfactory inspection', NULL, 'general', 70),
    ('Policy subject to terrorism exclusion', NULL, 'coverage', 80),
    ('Subject to cyber security questionnaire completion', NULL, 'documentation', 90),
    ('Coverage subject to satisfactory financial review', NULL, 'documentation', 100),
    ('Confirmation of MFA implementation', NULL, 'security', 110),

    -- Primary only
    ('Contact info for Security Services outreach', 'primary', 'security', 200),

    -- Excess only
    ('Copy of underlying quotes and binders', 'excess', 'documentation', 300),
    ('Copy of underlying policies', 'excess', 'documentation', 310),
    ('Subject to underlying policy terms and conditions', 'excess', 'coverage', 320)
ON CONFLICT (text) DO UPDATE SET
    position = EXCLUDED.position,
    category = EXCLUDED.category,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Index for active templates ordered by display
CREATE INDEX IF NOT EXISTS idx_subjectivity_templates_active
    ON subjectivity_templates(is_active, display_order)
    WHERE is_active = true;
