-- Conflict Rules Catalog
-- Stores discovered conflict patterns for dynamic detection and UW reference

CREATE TABLE IF NOT EXISTS conflict_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Rule identification
    rule_name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,  -- e.g., 'edr', 'mfa', 'backup', 'business_model', 'scale'
    severity VARCHAR(20) DEFAULT 'medium',  -- critical, high, medium, low

    -- Rule description
    title VARCHAR(255) NOT NULL,  -- Human-readable title
    description TEXT,  -- Detailed explanation for UW guide

    -- Detection pattern (for automated matching)
    detection_pattern JSONB,  -- Field relationships, conditions, etc.

    -- Example of the conflict
    example_bad JSONB,  -- Example app data that triggers this conflict
    example_explanation TEXT,  -- Why this is a conflict

    -- Statistics
    times_detected INTEGER DEFAULT 0,
    times_confirmed INTEGER DEFAULT 0,  -- UW confirmed it was a real issue
    times_dismissed INTEGER DEFAULT 0,  -- UW said not an issue
    last_detected_at TIMESTAMPTZ,

    -- Submissions where this was found (for examples)
    example_submission_ids UUID[] DEFAULT '{}',

    -- Source of the rule
    source VARCHAR(50) DEFAULT 'system',  -- 'system', 'llm_discovered', 'uw_added'
    discovered_by TEXT,  -- User or system that discovered it

    -- Status
    is_active BOOLEAN DEFAULT true,  -- Can be disabled without deleting
    requires_review BOOLEAN DEFAULT false,  -- New LLM-discovered rules needing approval

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_conflict_rules_category ON conflict_rules(category);
CREATE INDEX IF NOT EXISTS idx_conflict_rules_active ON conflict_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_conflict_rules_severity ON conflict_rules(severity);

-- Track which conflicts were detected for each submission
CREATE TABLE IF NOT EXISTS detected_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES conflict_rules(id) ON DELETE SET NULL,

    -- For dynamically detected conflicts (not yet in catalog)
    rule_name VARCHAR(100),

    -- The actual values that triggered the conflict
    field_values JSONB NOT NULL,  -- e.g., {"hasEdr": false, "edrVendor": "CrowdStrike"}

    -- LLM explanation if dynamically detected
    llm_explanation TEXT,

    -- Resolution
    status VARCHAR(20) DEFAULT 'pending',  -- pending, confirmed, dismissed
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Timestamps
    detected_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate detections
    CONSTRAINT unique_submission_rule UNIQUE (submission_id, rule_name)
);

CREATE INDEX IF NOT EXISTS idx_detected_conflicts_submission ON detected_conflicts(submission_id);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_status ON detected_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_detected_conflicts_rule ON detected_conflicts(rule_id);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_conflict_rules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_conflict_rules_timestamp ON conflict_rules;
CREATE TRIGGER update_conflict_rules_timestamp
    BEFORE UPDATE ON conflict_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_conflict_rules_timestamp();

-- Seed some initial rules from our existing patterns
INSERT INTO conflict_rules (rule_name, category, severity, title, description, detection_pattern, example_bad, example_explanation, source)
VALUES
    -- EDR Rules
    ('edr_vendor_without_edr', 'edr', 'critical',
     'EDR Vendor Named Without EDR',
     'The applicant claims they do not have EDR (Endpoint Detection & Response), but then names a specific EDR vendor. This is a direct contradiction that suggests either careless form completion or misunderstanding of the question.',
     '{"field_a": "hasEdr", "value_a": [false, "No", "no"], "field_b": "edrVendor", "condition": "should_be_empty"}',
     '{"hasEdr": false, "edrVendor": "CrowdStrike"}',
     'Applicant answered "No" to having EDR but listed CrowdStrike as their EDR vendor. CrowdStrike Falcon is an EDR product.',
     'system'),

    ('edr_coverage_without_edr', 'edr', 'critical',
     'EDR Coverage Specified Without EDR',
     'The applicant claims no EDR but specifies a coverage percentage for EDR endpoints.',
     '{"field_a": "hasEdr", "value_a": [false, "No", "no"], "field_b": "edrEndpointCoveragePercent", "condition": "should_be_zero_or_empty"}',
     '{"hasEdr": false, "edrEndpointCoveragePercent": 85}',
     'Applicant answered "No" to having EDR but claims 85% EDR coverage.',
     'system'),

    -- MFA Rules
    ('mfa_type_without_mfa', 'mfa', 'critical',
     'MFA Type Specified Without MFA',
     'The applicant claims they do not have MFA (Multi-Factor Authentication), but then specifies what type of MFA they use.',
     '{"field_a": "hasMfa", "value_a": [false, "No", "no"], "field_b": "mfaType", "condition": "should_be_empty"}',
     '{"hasMfa": false, "mfaType": "Authenticator App"}',
     'Applicant answered "No" to having MFA but specified "Authenticator App" as their MFA type.',
     'system'),

    ('remote_mfa_conflict', 'mfa', 'high',
     'Remote Access MFA Contradiction',
     'Conflicting answers about MFA for remote access between related questions.',
     '{"field_a": "remoteAccessMfa", "value_a": [false, "No", "no"], "field_b": "mfaForRemoteAccess", "value_b": [true, "Yes", "yes"]}',
     '{"remoteAccessMfa": false, "mfaForRemoteAccess": true}',
     'One question answered "No" for remote access MFA, another answered "Yes".',
     'system'),

    -- Backup Rules
    ('backup_frequency_without_backups', 'backup', 'critical',
     'Backup Frequency Without Backups',
     'The applicant claims they do not have backups, but specifies a backup frequency.',
     '{"field_a": "hasBackups", "value_a": [false, "No", "no"], "field_b": "backupFrequency", "condition": "should_be_empty"}',
     '{"hasBackups": false, "backupFrequency": "Daily"}',
     'Applicant answered "No" to having backups but specified "Daily" backup frequency.',
     'system'),

    ('immutable_without_backups', 'backup', 'critical',
     'Immutable Backups Without Backups',
     'The applicant claims no backups but says they have immutable backups.',
     '{"field_a": "hasBackups", "value_a": [false, "No", "no"], "field_b": "immutableBackups", "value_b": [true, "Yes", "yes"]}',
     '{"hasBackups": false, "immutableBackups": true}',
     'Applicant answered "No" to having backups but claims to have immutable backups.',
     'system'),

    -- Business Model Rules
    ('b2c_no_pii', 'business_model', 'high',
     'B2C Business Claims No PII',
     'A B2C (business-to-consumer) company claims they do not collect any PII (Personally Identifiable Information). This is implausible as B2C businesses typically collect at least customer names, emails, or shipping addresses.',
     '{"context_field": "businessModel", "context_value": ["B2C", "b2c"], "check_field": "collectsPii", "check_value": [false, "No", "no"]}',
     '{"businessModel": "B2C", "collectsPii": false}',
     'A B2C company must interact with individual consumers, which inherently involves collecting some PII.',
     'system'),

    ('b2c_ecommerce_no_cards', 'business_model', 'high',
     'B2C E-commerce Claims No Credit Cards',
     'A B2C e-commerce company claims they do not handle credit card information. This is unusual unless they exclusively use third-party payment processors with no card data touching their systems.',
     '{"context_field": "businessType", "context_value": ["E-commerce", "ecommerce", "Retail"], "check_field": "handlesCreditCards", "check_value": [false, "No", "no"]}',
     '{"businessType": "E-commerce", "handlesCreditCards": false}',
     'E-commerce businesses typically handle payment information. If using Stripe/PayPal exclusively, this should be clarified.',
     'system'),

    -- Scale Rules
    ('large_company_no_security_team', 'scale', 'medium',
     'Large Company Without Security Team',
     'A company with over 500 employees claims to have no dedicated security team or security personnel. This is unusual for organizations of this size.',
     '{"context_field": "employeeCount", "context_condition": ">", "context_value": 500, "check_field": "hasDedicatedSecurityTeam", "check_value": [false, "No", "no"]}',
     '{"employeeCount": 750, "hasDedicatedSecurityTeam": false}',
     'Companies with 500+ employees typically have dedicated security personnel or at least a designated security role.',
     'system'),

    ('high_revenue_no_security_policies', 'scale', 'medium',
     'High Revenue Without Written Security Policies',
     'A company with over $50M in annual revenue claims to have no written security policies. This is concerning for companies of this size.',
     '{"context_field": "annualRevenue", "context_condition": ">", "context_value": 50000000, "check_field": "hasWrittenSecurityPolicies", "check_value": [false, "No", "no"]}',
     '{"annualRevenue": 75000000, "hasWrittenSecurityPolicies": false}',
     'Companies with significant revenue typically have formalized security policies for compliance and risk management.',
     'system')

ON CONFLICT (rule_name) DO NOTHING;
