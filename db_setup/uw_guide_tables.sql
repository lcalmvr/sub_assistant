-- UW Guide Tables
-- Comprehensive underwriting guide data for cyber insurance
-- Run after base schema is established

-- ============================================================================
-- 1. APPETITE MATRIX
-- Industry classification with appetite status and requirements
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_appetite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_name VARCHAR(100) NOT NULL,
    industry_code VARCHAR(20),  -- SIC or NAICS primary code
    sic_codes JSONB,  -- Array of applicable SIC codes
    naics_codes JSONB,  -- Array of applicable NAICS codes
    hazard_class INT NOT NULL CHECK (hazard_class BETWEEN 1 AND 5),
    appetite_status VARCHAR(20) NOT NULL CHECK (appetite_status IN ('preferred', 'standard', 'restricted', 'excluded')),
    max_limit_millions DECIMAL(10,2),  -- Maximum limit we'll offer
    min_retention INT,  -- Minimum retention required
    max_revenue_millions DECIMAL(10,2),  -- Revenue cap for this class
    special_requirements JSONB,  -- Industry-specific requirements
    declination_reason TEXT,  -- For excluded classes
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uw_appetite_status ON uw_appetite(appetite_status);
CREATE INDEX IF NOT EXISTS idx_uw_appetite_hazard ON uw_appetite(hazard_class);

-- ============================================================================
-- 2. MANDATORY CONTROLS
-- Security controls required by risk tier
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_mandatory_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_name VARCHAR(100) NOT NULL,
    control_key VARCHAR(50) NOT NULL UNIQUE,  -- Maps to extraction schema fields
    control_category VARCHAR(50) NOT NULL,  -- access_control, endpoint, backup, training, etc.
    description TEXT,
    -- Thresholds define when control becomes mandatory
    -- hazard_class 1 = low risk, 5 = high risk
    mandatory_above_hazard INT CHECK (mandatory_above_hazard BETWEEN 0 AND 5),  -- Mandatory for hazard > X
    mandatory_above_revenue_millions DECIMAL(10,2),  -- Mandatory for revenue > X
    mandatory_above_limit_millions DECIMAL(10,2),  -- Mandatory for limit > X
    -- What happens if missing
    is_declination_trigger BOOLEAN DEFAULT false,  -- Auto-decline if missing?
    is_referral_trigger BOOLEAN DEFAULT false,  -- Refer to senior UW if missing?
    credit_if_present DECIMAL(5,2),  -- Rate credit % if present (e.g., -5.0)
    debit_if_missing DECIMAL(5,2),  -- Rate debit % if missing (e.g., +15.0)
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uw_controls_category ON uw_mandatory_controls(control_category);

-- ============================================================================
-- 3. DECLINATION RULES
-- Automatic decline criteria
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_declination_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(100) NOT NULL,
    rule_key VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(50),  -- industry, controls, claims, financial, etc.
    -- Condition specification
    condition_type VARCHAR(50) NOT NULL,  -- field_equals, field_missing, field_exceeds, etc.
    condition_field VARCHAR(100),  -- Field to check (from extraction schema)
    condition_operator VARCHAR(20),  -- equals, not_equals, greater_than, less_than, contains, missing
    condition_value JSONB,  -- Value(s) to compare against
    -- Behavior
    severity VARCHAR(20) DEFAULT 'hard',  -- hard (auto-decline) vs soft (strong recommendation)
    override_allowed BOOLEAN DEFAULT false,
    override_requires VARCHAR(50),  -- Who can override: senior_uw, management, none
    decline_message TEXT,  -- Message to show
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. REFERRAL TRIGGERS
-- When to escalate to senior underwriter
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_referral_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_name VARCHAR(100) NOT NULL,
    trigger_key VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category VARCHAR(50),  -- limit, claims, industry, controls, etc.
    -- Condition specification (same pattern as declination rules)
    condition_type VARCHAR(50) NOT NULL,
    condition_field VARCHAR(100),
    condition_operator VARCHAR(20),
    condition_value JSONB,
    -- Referral details
    referral_level VARCHAR(50) NOT NULL,  -- senior_uw, team_lead, management, reinsurance
    referral_reason TEXT,  -- Why this needs escalation
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. PRICING GUIDELINES
-- Rate guidance by hazard class and limit
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_pricing_guidelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hazard_class INT NOT NULL CHECK (hazard_class BETWEEN 1 AND 5),
    revenue_band VARCHAR(50),  -- 'under_10m', '10m_50m', '50m_250m', 'over_250m'
    -- Rate guidance
    min_rate_per_million DECIMAL(10,2),  -- Minimum rate per $1M limit
    target_rate_per_million DECIMAL(10,2),  -- Target rate per $1M limit
    max_rate_per_million DECIMAL(10,2),  -- Maximum reasonable rate
    min_premium INT,  -- Minimum premium in dollars
    -- Limit guidance
    max_limit_millions DECIMAL(10,2),  -- Maximum limit available
    standard_retention INT,  -- Standard retention for this tier
    -- Notes
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_pricing_tier UNIQUE (hazard_class, revenue_band)
);

-- ============================================================================
-- 6. SUPPLEMENTAL QUESTION TEMPLATES (Industry-Specific)
-- Links questions to industries or exposure types
-- ============================================================================

-- Note: Existing supplemental_questions table handles the base questions
-- This table links them to specific industries or exposure types

CREATE TABLE IF NOT EXISTS uw_question_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES supplemental_questions(id) ON DELETE CASCADE,
    trigger_type VARCHAR(50) NOT NULL,  -- industry, exposure, revenue_threshold, etc.
    trigger_value JSONB NOT NULL,  -- Industry name, exposure type, or threshold value
    is_required BOOLEAN DEFAULT false,  -- Is question mandatory when triggered?
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_triggers_type ON uw_question_triggers(trigger_type);

-- ============================================================================
-- 7. GEOGRAPHIC RESTRICTIONS
-- Territory-based appetite
-- ============================================================================

CREATE TABLE IF NOT EXISTS uw_geographic_restrictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_type VARCHAR(20) NOT NULL,  -- country, state, region
    territory_code VARCHAR(10) NOT NULL,  -- US, CA, EU, etc.
    territory_name VARCHAR(100) NOT NULL,
    restriction_type VARCHAR(20) NOT NULL,  -- preferred, standard, restricted, excluded
    max_limit_millions DECIMAL(10,2),
    special_requirements JSONB,
    restriction_reason TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_territory UNIQUE (territory_type, territory_code)
);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Appetite Matrix - Industries
INSERT INTO uw_appetite (industry_name, hazard_class, appetite_status, max_limit_millions, min_retention, max_revenue_millions, special_requirements, notes, display_order) VALUES
-- Preferred (Hazard 1-2)
('Professional Services', 1, 'preferred', 10, 10000, 500, '{"controls": ["mfa", "backup"]}', 'Low cyber exposure, minimal PII', 1),
('Accounting Firms', 1, 'preferred', 10, 10000, 250, '{"controls": ["mfa", "backup", "encryption"]}', 'Regulatory requirements drive good controls', 2),
('Consulting Services', 1, 'preferred', 10, 10000, 500, '{"controls": ["mfa"]}', 'Limited PII, business data focus', 3),
('Legal Services', 2, 'preferred', 10, 15000, 250, '{"controls": ["mfa", "encryption", "dlp"]}', 'Privileged data requires strong controls', 4),
('Architecture/Engineering', 1, 'preferred', 10, 10000, 250, '{"controls": ["mfa", "backup"]}', 'IP protection focus', 5),

-- Standard (Hazard 2-3)
('Manufacturing', 2, 'standard', 5, 25000, 500, '{"controls": ["mfa", "edr", "backup"]}', 'OT/IT convergence risk', 10),
('Wholesale Trade', 2, 'standard', 5, 25000, 500, '{"controls": ["mfa", "backup"]}', 'Supply chain exposure', 11),
('Real Estate', 2, 'standard', 5, 25000, 250, '{"controls": ["mfa", "wire_verification"]}', 'Wire fraud exposure', 12),
('Non-Profit Organizations', 2, 'standard', 3, 15000, 100, '{"controls": ["mfa", "training"]}', 'Limited IT resources', 13),
('Education (Private)', 3, 'standard', 5, 25000, 250, '{"controls": ["mfa", "edr", "backup", "training"]}', 'Student PII, ransomware target', 14),

-- Restricted (Hazard 4-5)
('Healthcare Providers', 4, 'restricted', 3, 50000, 250, '{"controls": ["mfa", "edr", "encryption", "backup", "training"], "require_hipaa_compliance": true}', 'PHI exposure, regulatory requirements', 20),
('Financial Services', 4, 'restricted', 5, 50000, 500, '{"controls": ["mfa", "edr", "siem", "dlp"], "require_soc2": true}', 'High value target, regulatory scrutiny', 21),
('Retail (E-commerce)', 4, 'restricted', 3, 50000, 250, '{"controls": ["mfa", "edr", "waf", "pci_compliance"]}', 'Payment card data, high breach frequency', 22),
('Technology Companies', 3, 'restricted', 5, 50000, 500, '{"controls": ["mfa", "edr", "siem", "bug_bounty"]}', 'Attractive target, IP risk', 23),
('Government Contractors', 4, 'restricted', 3, 100000, 250, '{"controls": ["mfa", "edr", "cmmc_compliance"]}', 'Nation-state threat, compliance burden', 24),

-- Excluded (Hazard 5)
('Cryptocurrency/Blockchain', 5, 'excluded', NULL, NULL, NULL, NULL, 'Unacceptable aggregation and theft exposure', 30),
('Online Gambling', 5, 'excluded', NULL, NULL, NULL, NULL, 'Regulatory and fraud concerns', 31),
('Adult Entertainment', 5, 'excluded', NULL, NULL, NULL, NULL, 'Reputational risk, payment processing issues', 32),
('Cannabis/Marijuana', 5, 'excluded', NULL, NULL, NULL, NULL, 'Federal legality concerns', 33),
('Payday Lending', 5, 'excluded', NULL, NULL, NULL, NULL, 'Regulatory and litigation exposure', 34),
('Critical Infrastructure', 5, 'excluded', NULL, NULL, NULL, NULL, 'Catastrophic aggregation risk, requires specialty markets', 35),
('Social Media Platforms', 5, 'excluded', NULL, NULL, NULL, NULL, 'Massive data volumes, content liability', 36),
('Payment Processors', 5, 'excluded', NULL, NULL, NULL, NULL, 'Systemic risk, aggregation concerns', 37)
ON CONFLICT DO NOTHING;

-- Mandatory Controls
INSERT INTO uw_mandatory_controls (control_name, control_key, control_category, description, mandatory_above_hazard, mandatory_above_revenue_millions, is_declination_trigger, is_referral_trigger, credit_if_present, debit_if_missing, display_order) VALUES
-- Access Control
('Multi-Factor Authentication', 'has_mfa', 'access_control', 'MFA required for all remote access and privileged accounts', 0, 0, true, false, -5.0, 15.0, 1),
('MFA for Email', 'mfa_email', 'access_control', 'MFA specifically for email access', 2, 25, false, true, -2.0, 5.0, 2),
('Privileged Access Management', 'has_pam', 'access_control', 'PAM solution for administrative accounts', 3, 100, false, true, -3.0, 5.0, 3),

-- Endpoint Security
('Endpoint Detection & Response', 'has_edr', 'endpoint_security', 'EDR solution with 24/7 monitoring', 2, 50, false, true, -5.0, 10.0, 10),
('Next-Gen Antivirus', 'has_ngav', 'endpoint_security', 'Modern antivirus beyond signature-based', 0, 0, false, false, -2.0, 5.0, 11),
('Patch Management', 'patch_cadence', 'endpoint_security', 'Critical patches within 30 days', 0, 0, false, true, -2.0, 8.0, 12),

-- Backup & Recovery
('Offline/Immutable Backups', 'has_offline_backup', 'backup', 'Air-gapped or immutable backup copies', 0, 0, true, false, -5.0, 15.0, 20),
('Backup Testing', 'backup_tested', 'backup', 'Regular backup restoration testing', 2, 50, false, true, -2.0, 5.0, 21),
('Disaster Recovery Plan', 'has_drp', 'backup', 'Documented and tested DR plan', 3, 100, false, true, -2.0, 5.0, 22),

-- Network Security
('Firewall', 'has_firewall', 'network', 'Perimeter firewall with current ruleset', 0, 0, false, false, 0, 5.0, 30),
('Network Segmentation', 'has_segmentation', 'network', 'Critical systems isolated from general network', 3, 100, false, true, -3.0, 5.0, 31),
('Email Security Gateway', 'has_email_security', 'network', 'Advanced email filtering and sandboxing', 2, 25, false, false, -2.0, 5.0, 32),

-- Security Operations
('Security Awareness Training', 'has_training', 'operations', 'Annual security training for all employees', 0, 0, false, true, -2.0, 5.0, 40),
('Incident Response Plan', 'has_irp', 'operations', 'Documented incident response procedures', 2, 50, false, true, -3.0, 5.0, 41),
('Vulnerability Scanning', 'has_vuln_scanning', 'operations', 'Regular vulnerability assessments', 3, 100, false, false, -2.0, 3.0, 42),

-- Data Protection
('Data Encryption at Rest', 'encryption_at_rest', 'data_protection', 'Sensitive data encrypted in storage', 3, 50, false, true, -2.0, 5.0, 50),
('Data Encryption in Transit', 'encryption_in_transit', 'data_protection', 'TLS for all data transmission', 0, 0, false, false, 0, 3.0, 51),
('Data Loss Prevention', 'has_dlp', 'data_protection', 'DLP tools monitoring data exfiltration', 4, 250, false, false, -2.0, 3.0, 52)
ON CONFLICT (control_key) DO NOTHING;

-- Declination Rules
INSERT INTO uw_declination_rules (rule_name, rule_key, description, category, condition_type, condition_field, condition_operator, condition_value, severity, override_allowed, override_requires, decline_message, display_order) VALUES
-- Industry-based
('Excluded Industry', 'excluded_industry', 'Industry is on excluded list', 'industry', 'field_in', 'industry', 'in', '["Cryptocurrency/Blockchain", "Online Gambling", "Adult Entertainment", "Cannabis/Marijuana", "Payday Lending", "Critical Infrastructure", "Social Media Platforms", "Payment Processors"]', 'hard', false, NULL, 'This industry class is outside our underwriting appetite.', 1),

-- Control-based (hard declines)
('No MFA', 'no_mfa', 'Multi-factor authentication not implemented', 'controls', 'field_equals', 'has_mfa', 'equals', 'false', 'hard', false, NULL, 'MFA is a minimum requirement for all risks. Unable to proceed without MFA in place.', 10),
('No Backups', 'no_backups', 'No offline or immutable backup solution', 'controls', 'field_equals', 'has_offline_backup', 'equals', 'false', 'hard', true, 'management', 'Offline/immutable backups are required to mitigate ransomware exposure.', 11),

-- Claims-based
('Active Breach', 'active_breach', 'Currently experiencing a cyber incident', 'claims', 'field_equals', 'has_active_incident', 'equals', 'true', 'hard', false, NULL, 'Cannot bind coverage during an active incident.', 20),
('Recent Major Claim', 'recent_major_claim', 'Major cyber claim within last 12 months', 'claims', 'field_exceeds', 'largest_claim_amount', 'greater_than', '500000', 'soft', true, 'senior_uw', 'Recent significant claims require senior underwriter review.', 21),
('Multiple Claims', 'multiple_claims', 'Three or more cyber claims in past 3 years', 'claims', 'field_exceeds', 'claim_count_3yr', 'greater_than', '2', 'soft', true, 'senior_uw', 'Claims frequency exceeds acceptable threshold.', 22),

-- Financial/Limit
('Limit Exceeds Appetite', 'limit_over_appetite', 'Requested limit exceeds maximum for risk class', 'limit', 'custom', NULL, NULL, NULL, 'hard', true, 'reinsurance', 'Requested limit exceeds our capacity for this risk class.', 30),

-- Prior Coverage
('No Prior Coverage', 'no_prior_coverage', 'No existing cyber coverage for risks over $50M revenue', 'coverage', 'field_missing', 'prior_carrier', 'missing', NULL, 'soft', true, 'senior_uw', 'First-time buyers at this revenue level require additional review.', 40)
ON CONFLICT (rule_key) DO NOTHING;

-- Referral Triggers
INSERT INTO uw_referral_triggers (trigger_name, trigger_key, description, category, condition_type, condition_field, condition_operator, condition_value, referral_level, referral_reason, display_order) VALUES
-- Limit-based
('High Limit Request', 'high_limit', 'Limit request over $5M', 'limit', 'field_exceeds', 'requested_limit', 'greater_than', '5000000', 'senior_uw', 'Limits over $5M require senior review', 1),
('Max Limit Request', 'max_limit', 'Limit request over $10M', 'limit', 'field_exceeds', 'requested_limit', 'greater_than', '10000000', 'management', 'Limits over $10M require management approval', 2),

-- Revenue-based
('Large Account', 'large_account', 'Revenue over $500M', 'revenue', 'field_exceeds', 'annual_revenue', 'greater_than', '500000000', 'senior_uw', 'Large accounts need senior underwriter', 10),
('Enterprise Account', 'enterprise_account', 'Revenue over $1B', 'revenue', 'field_exceeds', 'annual_revenue', 'greater_than', '1000000000', 'management', 'Enterprise accounts need management approval', 11),

-- Industry-specific
('Restricted Industry', 'restricted_industry', 'Industry on restricted list', 'industry', 'field_in', 'appetite_status', 'equals', '"restricted"', 'senior_uw', 'Restricted classes need senior review', 20),
('Healthcare Account', 'healthcare', 'Healthcare industry submission', 'industry', 'field_equals', 'industry', 'equals', '"Healthcare Providers"', 'senior_uw', 'Healthcare requires PHI/HIPAA expertise', 21),
('Financial Services', 'finserv', 'Financial services submission', 'industry', 'field_equals', 'industry', 'equals', '"Financial Services"', 'senior_uw', 'FinServ requires regulatory expertise', 22),

-- Claims-based
('Prior Claims', 'prior_claims', 'Any cyber claims in past 5 years', 'claims', 'field_exceeds', 'claim_count_5yr', 'greater_than', '0', 'senior_uw', 'Prior claims require loss analysis', 30),

-- Control deficiencies
('Missing EDR', 'missing_edr', 'No EDR for hazard 3+ risk', 'controls', 'field_equals', 'has_edr', 'equals', 'false', 'senior_uw', 'High hazard without EDR needs review', 40),
('Missing Training', 'missing_training', 'No security training program', 'controls', 'field_equals', 'has_training', 'equals', 'false', 'senior_uw', 'Lack of training is ransomware risk factor', 41),

-- Pricing
('Below Minimum Premium', 'below_min_premium', 'Premium below minimum threshold', 'pricing', 'field_less_than', 'quoted_premium', 'less_than', 'min_premium', 'senior_uw', 'Sub-minimum premium needs approval', 50),
('Rate Deviation', 'rate_deviation', 'Rate more than 20% below target', 'pricing', 'custom', NULL, NULL, NULL, 'senior_uw', 'Significant rate deviation needs justification', 51)
ON CONFLICT (trigger_key) DO NOTHING;

-- Pricing Guidelines
INSERT INTO uw_pricing_guidelines (hazard_class, revenue_band, min_rate_per_million, target_rate_per_million, max_rate_per_million, min_premium, max_limit_millions, standard_retention, notes) VALUES
-- Hazard 1 (Low Risk)
(1, 'under_10m', 800, 1200, 2000, 2500, 5, 10000, 'Professional services, low exposure'),
(1, '10m_50m', 600, 1000, 1500, 5000, 5, 15000, NULL),
(1, '50m_250m', 400, 800, 1200, 10000, 10, 25000, NULL),
(1, 'over_250m', 300, 600, 1000, 15000, 10, 50000, NULL),

-- Hazard 2 (Moderate-Low)
(2, 'under_10m', 1200, 1800, 3000, 3500, 5, 15000, 'Standard controls required'),
(2, '10m_50m', 900, 1400, 2200, 7500, 5, 25000, NULL),
(2, '50m_250m', 700, 1100, 1800, 12500, 10, 35000, NULL),
(2, 'over_250m', 500, 900, 1400, 20000, 10, 75000, NULL),

-- Hazard 3 (Moderate)
(3, 'under_10m', 1800, 2800, 4500, 5000, 3, 25000, 'EDR strongly recommended'),
(3, '10m_50m', 1400, 2200, 3500, 10000, 5, 35000, NULL),
(3, '50m_250m', 1100, 1700, 2800, 17500, 5, 50000, NULL),
(3, 'over_250m', 800, 1300, 2200, 25000, 10, 100000, NULL),

-- Hazard 4 (Moderate-High)
(4, 'under_10m', 2500, 4000, 6000, 7500, 3, 35000, 'Full security stack required'),
(4, '10m_50m', 2000, 3200, 5000, 15000, 3, 50000, NULL),
(4, '50m_250m', 1600, 2600, 4000, 25000, 5, 75000, NULL),
(4, 'over_250m', 1200, 2000, 3200, 35000, 5, 150000, NULL),

-- Hazard 5 (High - Restricted)
(5, 'under_10m', 4000, 6000, 10000, 10000, 2, 50000, 'Senior UW approval required'),
(5, '10m_50m', 3200, 5000, 8000, 20000, 3, 75000, NULL),
(5, '50m_250m', 2600, 4000, 6500, 35000, 3, 100000, NULL),
(5, 'over_250m', 2000, 3200, 5200, 50000, 5, 250000, 'Management approval required')
ON CONFLICT (hazard_class, revenue_band) DO NOTHING;

-- Geographic Restrictions
INSERT INTO uw_geographic_restrictions (territory_type, territory_code, territory_name, restriction_type, max_limit_millions, special_requirements, restriction_reason) VALUES
('country', 'US', 'United States', 'preferred', 10, NULL, NULL),
('country', 'CA', 'Canada', 'preferred', 10, NULL, NULL),
('country', 'UK', 'United Kingdom', 'standard', 5, '{"require_gdpr_compliance": true}', NULL),
('country', 'EU', 'European Union', 'standard', 5, '{"require_gdpr_compliance": true}', 'GDPR regulatory exposure'),
('country', 'AU', 'Australia', 'standard', 5, NULL, NULL),
('region', 'APAC', 'Asia-Pacific', 'restricted', 3, '{"require_local_counsel": true}', 'Regulatory complexity'),
('region', 'LATAM', 'Latin America', 'restricted', 2, '{"require_local_counsel": true}', 'Claims handling complexity'),
('country', 'CN', 'China', 'excluded', NULL, NULL, 'Regulatory and geopolitical concerns'),
('country', 'RU', 'Russia', 'excluded', NULL, NULL, 'Sanctions and geopolitical concerns'),
('country', 'IR', 'Iran', 'excluded', NULL, NULL, 'Sanctions'),
('country', 'KP', 'North Korea', 'excluded', NULL, NULL, 'Sanctions'),
('country', 'CU', 'Cuba', 'excluded', NULL, NULL, 'Sanctions')
ON CONFLICT (territory_type, territory_code) DO NOTHING;

-- Grant permissions
GRANT SELECT ON uw_appetite TO authenticated;
GRANT SELECT ON uw_mandatory_controls TO authenticated;
GRANT SELECT ON uw_declination_rules TO authenticated;
GRANT SELECT ON uw_referral_triggers TO authenticated;
GRANT SELECT ON uw_pricing_guidelines TO authenticated;
GRANT SELECT ON uw_question_triggers TO authenticated;
GRANT SELECT ON uw_geographic_restrictions TO authenticated;
