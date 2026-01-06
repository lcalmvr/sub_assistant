-- Submission Controls: Structured storage for security controls with audit trail
-- Replaces/augments the markdown-based bullet_point_summary

-- Main controls table
CREATE TABLE IF NOT EXISTS submission_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    control_name TEXT NOT NULL,
    control_category TEXT,
    is_mandatory BOOLEAN DEFAULT false,

    -- Status: present, not_present, not_asked, pending_confirmation
    status TEXT NOT NULL DEFAULT 'not_asked',

    -- Source tracking
    source_type TEXT,                      -- 'extraction', 'email', 'synthetic', 'verbal'
    source_document_id UUID,               -- Link to document if applicable
    source_bbox JSONB,                     -- Bounding box if from document
    source_note TEXT,                      -- Required for verbal, optional for others
    source_text TEXT,                      -- The actual text that confirms/denies

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT,

    UNIQUE(submission_id, control_name)
);

-- History table for audit trail
CREATE TABLE IF NOT EXISTS submission_controls_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id UUID NOT NULL REFERENCES submission_controls(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT,
    source_type TEXT,
    source_document_id UUID,
    source_note TEXT,
    source_text TEXT,
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_submission_controls_submission_id
    ON submission_controls(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_controls_status
    ON submission_controls(status);
CREATE INDEX IF NOT EXISTS idx_submission_controls_mandatory
    ON submission_controls(submission_id, is_mandatory) WHERE is_mandatory = true;
CREATE INDEX IF NOT EXISTS idx_submission_controls_history_control_id
    ON submission_controls_history(control_id);

-- View for "Information Needed" - mandatory controls that are not_asked or pending
CREATE OR REPLACE VIEW v_controls_needing_info AS
SELECT
    sc.id,
    sc.submission_id,
    sc.control_name,
    sc.control_category,
    sc.status,
    sc.created_at,
    s.applicant_name
FROM submission_controls sc
JOIN submissions s ON s.id = sc.submission_id
WHERE sc.is_mandatory = true
  AND sc.status IN ('not_asked', 'pending_confirmation')
ORDER BY sc.submission_id, sc.control_category, sc.control_name;

-- View for control summary per submission
CREATE OR REPLACE VIEW v_submission_controls_summary AS
SELECT
    submission_id,
    COUNT(*) FILTER (WHERE status = 'present' AND is_mandatory) as mandatory_present,
    COUNT(*) FILTER (WHERE status = 'not_present' AND is_mandatory) as mandatory_missing,
    COUNT(*) FILTER (WHERE status = 'not_asked' AND is_mandatory) as mandatory_not_asked,
    COUNT(*) FILTER (WHERE status = 'pending_confirmation' AND is_mandatory) as mandatory_pending,
    COUNT(*) FILTER (WHERE status = 'present') as total_present,
    COUNT(*) FILTER (WHERE status = 'not_present') as total_missing,
    COUNT(*) as total_controls
FROM submission_controls
GROUP BY submission_id;

-- Function to log control changes to history
CREATE OR REPLACE FUNCTION log_control_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO submission_controls_history (
            control_id,
            previous_status,
            new_status,
            source_type,
            source_document_id,
            source_note,
            source_text,
            changed_by
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.source_type,
            NEW.source_document_id,
            NEW.source_note,
            NEW.source_text,
            NEW.updated_by
        );
    END IF;
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-log changes
DROP TRIGGER IF EXISTS trigger_log_control_change ON submission_controls;
CREATE TRIGGER trigger_log_control_change
    BEFORE UPDATE ON submission_controls
    FOR EACH ROW
    EXECUTE FUNCTION log_control_change();

-- List of mandatory controls (can be expanded)
-- This could also be a reference table if controls vary by policy type
CREATE TABLE IF NOT EXISTS control_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_name TEXT UNIQUE NOT NULL,
    control_category TEXT,
    is_mandatory BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed mandatory controls
INSERT INTO control_definitions (control_name, control_category, is_mandatory, description) VALUES
    ('MFA Email', 'Authentication & Access', true, 'Multi-factor authentication for email access'),
    ('MFA Remote Access', 'Authentication & Access', true, 'Multi-factor authentication for remote/VPN access'),
    ('MFA Privileged Account Access', 'Authentication & Access', true, 'Multi-factor authentication for admin/privileged accounts'),
    ('MFA Backups', 'Backup & Recovery', true, 'Multi-factor authentication to access backup systems'),
    ('EDR', 'Endpoint Protection', true, 'Endpoint Detection and Response solution'),
    ('Phishing Training', 'Training & Awareness', true, 'Security awareness and phishing simulation training'),
    ('Offline Backups', 'Backup & Recovery', true, 'Backups stored offline/air-gapped'),
    ('Offsite Backups', 'Backup & Recovery', true, 'Backups stored at separate physical location'),
    ('Immutable Backups', 'Backup & Recovery', true, 'Backups that cannot be modified or deleted'),
    ('Encrypted Backups', 'Backup & Recovery', true, 'Backups encrypted at rest')
ON CONFLICT (control_name) DO NOTHING;

-- Function to initialize controls for a submission from definitions
CREATE OR REPLACE FUNCTION initialize_submission_controls(p_submission_id UUID, p_user TEXT DEFAULT 'system')
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO submission_controls (
        submission_id,
        control_name,
        control_category,
        is_mandatory,
        status,
        source_type,
        updated_by
    )
    SELECT
        p_submission_id,
        control_name,
        control_category,
        is_mandatory,
        'not_asked',
        'extraction',
        p_user
    FROM control_definitions
    ON CONFLICT (submission_id, control_name) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE submission_controls IS 'Structured security controls per submission with source tracking';
COMMENT ON TABLE submission_controls_history IS 'Audit trail of control status changes';
COMMENT ON TABLE control_definitions IS 'Master list of controls and their properties';
COMMENT ON VIEW v_controls_needing_info IS 'Mandatory controls awaiting broker confirmation';
COMMENT ON VIEW v_submission_controls_summary IS 'Aggregated control counts per submission';
