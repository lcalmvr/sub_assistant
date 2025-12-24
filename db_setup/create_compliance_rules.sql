-- Compliance Rules Table
-- Stores compliance rules, requirements, and regulations for insurance operations
-- Serves as both a reference library and rules engine for quotes, binders, and policies

CREATE TABLE IF NOT EXISTS compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identification
    code TEXT NOT NULL UNIQUE,              -- e.g., "OFAC-001", "NYFTZ-CYBER-001", "SOS-CA-001"
    title TEXT NOT NULL,                    -- Short descriptive title

    -- Categorization
    category TEXT NOT NULL,                 -- ofac, service_of_suit, nyftz, state_rule, notice_stamping
    subcategory TEXT,                       -- e.g., "screening", "reporting", "eligibility", "cyber"
    rule_type TEXT NOT NULL DEFAULT 'reference',  -- reference, requirement, automatic_check

    -- Geographic scope
    applies_to_states TEXT[],               -- Array of state codes, NULL means all states
    applies_to_jurisdictions TEXT[],        -- Array of jurisdiction codes (e.g., "US", "NY", "CA")

    -- Applicability
    applies_to_products TEXT[],             -- Array of product types (e.g., "cyber", "tech_eo", "both")
    applies_to_lifecycle_stage TEXT[],      -- Array: quote, binder, policy, renewal, midterm

    -- Rule content
    description TEXT NOT NULL,              -- Detailed description of the rule/requirement
    requirements TEXT,                      -- Specific requirements or steps
    procedures TEXT,                        -- Step-by-step procedures for compliance
    legal_reference TEXT,                   -- Legal citation or regulation reference
    source_url TEXT,                        -- Link to official source/documentation

    -- Rules engine configuration
    check_config JSONB,                     -- JSON config for automated checks
    -- Example: {"field": "premium", "condition": "gte", "value": 100000, "message": "NYFTZ eligible"}
    -- Example: {"field": "insured_name", "check": "ofac_screening", "required": true}

    -- Requirements for compliance
    requires_endorsement BOOLEAN DEFAULT FALSE,
    required_endorsement_code TEXT,         -- Code of required endorsement if applicable
    requires_notice BOOLEAN DEFAULT FALSE,
    notice_text TEXT,                       -- Required notice text if applicable
    requires_stamping BOOLEAN DEFAULT FALSE,
    stamping_office TEXT,                   -- Which stamping office if applicable

    -- Metadata
    priority TEXT DEFAULT 'normal',         -- critical, high, normal, low
    effective_date DATE,                    -- When rule becomes effective
    expiration_date DATE,                   -- When rule expires (if applicable)
    status TEXT DEFAULT 'active',           -- active, draft, archived, superseded

    -- Versioning
    version INTEGER DEFAULT 1,
    superseded_by UUID REFERENCES compliance_rules(id),  -- If this rule is superseded

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT,
    updated_by TEXT,

    -- Constraints
    CONSTRAINT valid_category CHECK (
        category IN ('ofac', 'service_of_suit', 'nyftz', 'state_rule', 'notice_stamping', 'other')
    ),
    CONSTRAINT valid_rule_type CHECK (
        rule_type IN ('reference', 'requirement', 'automatic_check')
    ),
    CONSTRAINT valid_priority CHECK (
        priority IN ('critical', 'high', 'normal', 'low')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('active', 'draft', 'archived', 'superseded')
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_rules_category ON compliance_rules(category);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_status ON compliance_rules(status);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_applies_to_states ON compliance_rules USING gin(applies_to_states);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_applies_to_products ON compliance_rules USING gin(applies_to_products);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_check_config ON compliance_rules USING gin(check_config) WHERE check_config IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_rules_code ON compliance_rules(code);

-- Comments for documentation
COMMENT ON TABLE compliance_rules IS 'Compliance rules, requirements, and regulations for insurance operations';
COMMENT ON COLUMN compliance_rules.check_config IS 'JSONB configuration for automated compliance checks. Structure: {"field": string, "condition": string, "value": any, "message": string}';
COMMENT ON COLUMN compliance_rules.applies_to_states IS 'Array of state codes where this rule applies. NULL means all states';
COMMENT ON COLUMN compliance_rules.applies_to_products IS 'Array of product types (cyber, tech_eo, both) where this rule applies';

