-- Supplemental Questions System
-- Moves hardcoded questionnaires to database for dynamic management
-- Run: psql $DATABASE_URL -f db_setup/supplemental_questions.sql

-- ============================================================================
-- SUPPLEMENTAL QUESTIONS TABLE
-- ============================================================================
-- Master list of supplemental questions that can be asked per submission

CREATE TABLE IF NOT EXISTS supplemental_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_key VARCHAR(100) NOT NULL UNIQUE,  -- Programmatic key: 'edr_vendor', 'mfa_type'
    question_text TEXT NOT NULL,                -- Display text
    category VARCHAR(50),                       -- 'security_controls', 'incident_response', etc.
    display_order INT DEFAULT 0,                -- Sort order within category
    input_type VARCHAR(20) DEFAULT 'text',      -- 'text', 'select', 'multiselect', 'boolean', 'number'
    is_required BOOLEAN DEFAULT false,
    options JSONB,                              -- For select/multiselect: ["Option A", "Option B"]
    depends_on JSONB,                           -- Conditional display: {"field": "has_edr", "value": true}
    help_text TEXT,                             -- Tooltip/help text
    validation_pattern VARCHAR(200),            -- Regex for validation (optional)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supp_questions_category ON supplemental_questions(category);
CREATE INDEX IF NOT EXISTS idx_supp_questions_active ON supplemental_questions(is_active) WHERE is_active = true;

-- ============================================================================
-- SUBMISSION ANSWERS TABLE
-- ============================================================================
-- Stores answers to supplemental questions per submission

CREATE TABLE IF NOT EXISTS submission_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES supplemental_questions(id) ON DELETE CASCADE,
    answer_value TEXT,                          -- The answer (stored as text, parsed by input_type)
    answered_by VARCHAR(100),                   -- Who provided the answer
    answered_at TIMESTAMPTZ DEFAULT now(),
    source VARCHAR(50) DEFAULT 'manual',        -- 'manual', 'ai_extracted', 'broker_provided'
    confidence NUMERIC,                         -- For AI-extracted answers (0-1)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_answer_per_submission UNIQUE (submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_answers_sub ON submission_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_question ON submission_answers(question_id);

-- ============================================================================
-- QUESTION CATEGORIES VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_question_categories AS
SELECT
    category,
    COUNT(*) as question_count,
    COUNT(*) FILTER (WHERE is_required) as required_count
FROM supplemental_questions
WHERE is_active = true
GROUP BY category
ORDER BY category;

-- ============================================================================
-- SUBMISSION ANSWER PROGRESS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_submission_answer_progress AS
SELECT
    s.id as submission_id,
    sq.category,
    COUNT(sq.id) as total_questions,
    COUNT(sa.id) as answered_count,
    COUNT(sq.id) FILTER (WHERE sq.is_required) as required_total,
    COUNT(sa.id) FILTER (WHERE sq.is_required) as required_answered,
    ROUND(COUNT(sa.id)::numeric / NULLIF(COUNT(sq.id), 0) * 100, 1) as completion_pct
FROM submissions s
CROSS JOIN supplemental_questions sq
LEFT JOIN submission_answers sa
    ON sa.submission_id = s.id
    AND sa.question_id = sq.id
WHERE sq.is_active = true
GROUP BY s.id, sq.category;

-- ============================================================================
-- SEED DATA: SECURITY CONTROLS QUESTIONS
-- ============================================================================

INSERT INTO supplemental_questions (question_key, question_text, category, display_order, input_type, is_required, options, depends_on, help_text) VALUES

-- EDR Questions
('edr_vendor', 'What EDR solution is deployed?', 'security_controls', 10, 'text', false, NULL,
 '{"field": "hasEdr", "value": true}',
 'Common vendors: CrowdStrike, SentinelOne, Microsoft Defender, Carbon Black'),

('edr_coverage_endpoints', 'What percentage of endpoints have EDR installed?', 'security_controls', 11, 'select', false,
 '["100%", "90-99%", "75-89%", "50-74%", "Less than 50%"]',
 '{"field": "hasEdr", "value": true}',
 'Endpoints include desktops and laptops'),

('edr_coverage_servers', 'What percentage of servers have EDR installed?', 'security_controls', 12, 'select', false,
 '["100%", "90-99%", "75-89%", "50-74%", "Less than 50%", "N/A - No servers"]',
 '{"field": "hasEdr", "value": true}',
 'Include both physical and virtual servers'),

-- MFA Questions
('mfa_solution', 'What MFA solution is used?', 'security_controls', 20, 'text', false, NULL,
 '{"field": "emailMfa", "value": true}',
 'Common solutions: Duo, Okta, Microsoft Authenticator, Google Authenticator'),

('mfa_methods', 'What MFA methods are available?', 'security_controls', 21, 'multiselect', false,
 '["Push notification", "SMS/Text", "Hardware token", "TOTP app", "Biometric", "Email code"]',
 '{"field": "emailMfa", "value": true}',
 'Select all that apply'),

('mfa_coverage', 'Where is MFA required?', 'security_controls', 22, 'multiselect', false,
 '["Email access", "VPN/Remote access", "Admin consoles", "Cloud applications", "All SSO applications"]',
 '{"field": "emailMfa", "value": true}',
 'Select all that apply'),

-- Backup Questions
('backup_solution', 'What backup solution is used?', 'security_controls', 30, 'text', false, NULL,
 '{"field": "hasBackups", "value": true}',
 'Common solutions: Veeam, Commvault, Rubrik, Cohesity, Acronis'),

('backup_frequency', 'How often are backups performed?', 'security_controls', 31, 'select', false,
 '["Continuous/Real-time", "Daily", "Weekly", "Monthly", "Ad-hoc"]',
 '{"field": "hasBackups", "value": true}',
 NULL),

('backup_testing', 'How often are backup restores tested?', 'security_controls', 32, 'select', false,
 '["Monthly", "Quarterly", "Annually", "Never tested", "On-demand only"]',
 '{"field": "hasBackups", "value": true}',
 'Regular testing ensures backups are recoverable'),

('backup_offsite', 'Are backups stored offsite or in a separate cloud region?', 'security_controls', 33, 'boolean', false, NULL,
 '{"field": "hasBackups", "value": true}',
 'Offsite backups protect against site-wide incidents'),

('backup_immutable', 'Are backups immutable (cannot be modified or deleted)?', 'security_controls', 34, 'boolean', false, NULL,
 '{"field": "hasBackups", "value": true}',
 'Immutable backups protect against ransomware')

ON CONFLICT (question_key) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    category = EXCLUDED.category,
    display_order = EXCLUDED.display_order,
    input_type = EXCLUDED.input_type,
    options = EXCLUDED.options,
    depends_on = EXCLUDED.depends_on,
    help_text = EXCLUDED.help_text,
    updated_at = now();

-- ============================================================================
-- SEED DATA: INCIDENT RESPONSE QUESTIONS
-- ============================================================================

INSERT INTO supplemental_questions (question_key, question_text, category, display_order, input_type, is_required, options, depends_on, help_text) VALUES

('ir_plan_tested', 'When was the incident response plan last tested?', 'incident_response', 10, 'select', false,
 '["Within last 6 months", "Within last year", "1-2 years ago", "More than 2 years ago", "Never tested"]',
 '{"field": "hasIrPlan", "value": true}',
 'Tabletop exercises count as testing'),

('ir_retainer', 'Do you have an incident response retainer with a third party?', 'incident_response', 11, 'boolean', false, NULL,
 NULL,
 'Pre-arranged agreement with an IR firm for rapid response'),

('ir_retainer_provider', 'Who is the IR retainer provider?', 'incident_response', 12, 'text', false, NULL,
 '{"field": "ir_retainer", "value": true}',
 'Common providers: CrowdStrike, Mandiant, Secureworks, Kroll'),

('breach_history', 'Has the organization experienced a cyber incident in the last 3 years?', 'incident_response', 20, 'boolean', true, NULL,
 NULL,
 'Include ransomware, data breaches, BEC, or other significant incidents'),

('breach_details', 'Please describe the incident(s)', 'incident_response', 21, 'text', false, NULL,
 '{"field": "breach_history", "value": true}',
 'Include type, date, and remediation steps taken')

ON CONFLICT (question_key) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    category = EXCLUDED.category,
    display_order = EXCLUDED.display_order,
    input_type = EXCLUDED.input_type,
    is_required = EXCLUDED.is_required,
    options = EXCLUDED.options,
    depends_on = EXCLUDED.depends_on,
    help_text = EXCLUDED.help_text,
    updated_at = now();

-- ============================================================================
-- SEED DATA: TRAINING QUESTIONS
-- ============================================================================

INSERT INTO supplemental_questions (question_key, question_text, category, display_order, input_type, is_required, options, depends_on, help_text) VALUES

('training_frequency', 'How often is security awareness training conducted?', 'training', 10, 'select', false,
 '["Monthly", "Quarterly", "Annually", "At hire only", "No formal training"]',
 '{"field": "mandatorySecurityTraining", "value": true}',
 NULL),

('training_topics', 'What topics are covered in security training?', 'training', 11, 'multiselect', false,
 '["Phishing awareness", "Password security", "Social engineering", "Data handling", "Physical security", "Remote work security"]',
 '{"field": "mandatorySecurityTraining", "value": true}',
 'Select all that apply'),

('phishing_frequency', 'How often are phishing simulations conducted?', 'training', 20, 'select', false,
 '["Monthly", "Quarterly", "Annually", "Ad-hoc", "Never"]',
 '{"field": "conductsPhishingSimulations", "value": true}',
 NULL),

('phishing_click_rate', 'What is the average phishing simulation click rate?', 'training', 21, 'select', false,
 '["Less than 5%", "5-10%", "10-20%", "20-30%", "More than 30%", "Not tracked"]',
 '{"field": "conductsPhishingSimulations", "value": true}',
 'Industry average is around 10-15%')

ON CONFLICT (question_key) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    category = EXCLUDED.category,
    display_order = EXCLUDED.display_order,
    input_type = EXCLUDED.input_type,
    options = EXCLUDED.options,
    depends_on = EXCLUDED.depends_on,
    help_text = EXCLUDED.help_text,
    updated_at = now();

-- ============================================================================
-- HELPER FUNCTION: Get unanswered questions for a submission
-- ============================================================================

CREATE OR REPLACE FUNCTION get_unanswered_questions(p_submission_id UUID)
RETURNS TABLE (
    question_id UUID,
    question_key VARCHAR(100),
    question_text TEXT,
    category VARCHAR(50),
    input_type VARCHAR(20),
    is_required BOOLEAN,
    options JSONB,
    depends_on JSONB,
    help_text TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sq.id as question_id,
        sq.question_key,
        sq.question_text,
        sq.category,
        sq.input_type,
        sq.is_required,
        sq.options,
        sq.depends_on,
        sq.help_text
    FROM supplemental_questions sq
    LEFT JOIN submission_answers sa
        ON sa.question_id = sq.id
        AND sa.submission_id = p_submission_id
    WHERE sq.is_active = true
      AND sa.id IS NULL
    ORDER BY sq.category, sq.display_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Save multiple answers at once
-- ============================================================================

CREATE OR REPLACE FUNCTION save_submission_answers(
    p_submission_id UUID,
    p_answers JSONB,  -- [{"question_id": "...", "answer_value": "..."}, ...]
    p_answered_by VARCHAR(100) DEFAULT 'system'
)
RETURNS INT AS $$
DECLARE
    v_answer JSONB;
    v_count INT := 0;
BEGIN
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
    LOOP
        INSERT INTO submission_answers (
            submission_id, question_id, answer_value, answered_by, source
        ) VALUES (
            p_submission_id,
            (v_answer->>'question_id')::UUID,
            v_answer->>'answer_value',
            p_answered_by,
            COALESCE(v_answer->>'source', 'manual')
        )
        ON CONFLICT (submission_id, question_id) DO UPDATE SET
            answer_value = EXCLUDED.answer_value,
            answered_by = EXCLUDED.answered_by,
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS (for Supabase)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON supplemental_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON submission_answers TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
