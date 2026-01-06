-- Phase 1: Add importance weighting to extraction schema fields
-- This enables "Information Needed" to query which fields require confirmation

-- ─────────────────────────────────────────────────────────────
-- Importance Versions - track evolution of priorities over time
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS importance_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,                              -- e.g., "Initial Launch", "Post-Q1 Claims Review"
    description TEXT,                                -- What changed and why
    is_active BOOLEAN DEFAULT false,                 -- Only one active at a time
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    based_on_claims_through DATE                     -- Claims data informing this version (for future)
);

-- Ensure only one active version
CREATE UNIQUE INDEX IF NOT EXISTS idx_importance_versions_active
    ON importance_versions(is_active) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────
-- Field Importance Settings - per-version importance levels
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_importance_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES importance_versions(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,                         -- References schema_fields.key
    importance TEXT NOT NULL DEFAULT 'none',         -- critical, important, nice_to_know, none
    rationale TEXT,                                  -- Why this importance level
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(version_id, field_key),
    CONSTRAINT valid_importance CHECK (importance IN ('critical', 'important', 'nice_to_know', 'none'))
);

CREATE INDEX IF NOT EXISTS idx_field_importance_version ON field_importance_settings(version_id);
CREATE INDEX IF NOT EXISTS idx_field_importance_field ON field_importance_settings(field_key);

-- ─────────────────────────────────────────────────────────────
-- Submission Extracted Values - structured storage per submission
-- Replaces markdown bullet_point_summary with queryable data
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS submission_extracted_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,                         -- References schema_fields.key
    value JSONB,                                     -- The extracted/confirmed value
    status TEXT DEFAULT 'not_asked',                 -- present, not_present, not_asked, pending
    source_type TEXT,                                -- extraction, broker_response, verbal, manual
    source_document_id UUID,                         -- Which doc it came from
    source_text TEXT,                                -- The actual text that yielded this
    confidence NUMERIC(3,2),                         -- AI confidence score 0.00-1.00
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT,
    UNIQUE(submission_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_submission_extracted_values_sub ON submission_extracted_values(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_extracted_values_field ON submission_extracted_values(field_key);
CREATE INDEX IF NOT EXISTS idx_submission_extracted_values_status ON submission_extracted_values(status);

-- ─────────────────────────────────────────────────────────────
-- Views for common queries
-- ─────────────────────────────────────────────────────────────

-- Get active importance settings
CREATE OR REPLACE VIEW v_active_importance_settings AS
SELECT
    fis.field_key,
    fis.importance,
    fis.rationale,
    iv.version_number,
    iv.name as version_name
FROM field_importance_settings fis
JOIN importance_versions iv ON iv.id = fis.version_id
WHERE iv.is_active = true;

-- Get fields needing info for a submission
-- Usage: SELECT * FROM v_fields_needing_info WHERE submission_id = 'xxx'
CREATE OR REPLACE VIEW v_fields_needing_info AS
SELECT
    sf.key as field_key,
    sf.display_name,
    sc.display_name as category,
    COALESCE(ais.importance, 'none') as importance,
    COALESCE(sev.status, 'not_asked') as status,
    sev.submission_id
FROM schema_fields sf
JOIN schema_categories sc ON sf.category_id = sc.id
JOIN extraction_schemas es ON sf.schema_id = es.id AND es.is_active = true
LEFT JOIN v_active_importance_settings ais ON ais.field_key = sf.key
LEFT JOIN submission_extracted_values sev ON sev.field_key = sf.key
WHERE COALESCE(ais.importance, 'none') IN ('critical', 'important')
  AND COALESCE(sev.status, 'not_asked') IN ('not_asked', 'pending');

-- Summary of extracted values per submission
CREATE OR REPLACE VIEW v_submission_extraction_summary AS
SELECT
    submission_id,
    COUNT(*) FILTER (WHERE status = 'present') as confirmed_count,
    COUNT(*) FILTER (WHERE status = 'not_present') as missing_count,
    COUNT(*) FILTER (WHERE status = 'not_asked') as not_asked_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) as total_fields
FROM submission_extracted_values
GROUP BY submission_id;

-- ─────────────────────────────────────────────────────────────
-- Seed v1 importance priorities
-- Maps the "mandatory 10" controls to schema fields
-- ─────────────────────────────────────────────────────────────

-- Create v1 importance version
INSERT INTO importance_versions (version_number, name, description, is_active, created_by)
VALUES (1, 'Initial Launch', 'Initial importance settings based on industry best practices', true, 'system')
ON CONFLICT (version_number) DO NOTHING;

-- Map critical fields (the "mandatory 10" controls)
-- These field_keys should match your extraction schema
INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
SELECT
    iv.id,
    field_key,
    'critical',
    rationale
FROM importance_versions iv
CROSS JOIN (VALUES
    ('emailMfa', 'MFA prevents account takeover - #1 ransomware vector'),
    ('remoteAccessMfa', 'Remote access without MFA is an open door'),
    ('privilegedAccountMfa', 'Admin accounts are prime targets'),
    ('backupMfa', 'Attackers target backup credentials to prevent recovery'),
    ('hasEdr', 'EDR is essential for detecting and stopping attacks'),
    ('hasSecurityAwarenessTraining', 'Human error causes majority of breaches'),
    ('hasOfflineBackups', 'Air-gapped backups are last line of defense'),
    ('hasOffsiteBackups', 'Geographic separation protects against physical disasters'),
    ('hasImmutableBackups', 'Immutable backups cannot be encrypted by ransomware'),
    ('hasEncryptedBackups', 'Encrypted backups protect data confidentiality')
) AS critical_fields(field_key, rationale)
WHERE iv.version_number = 1
ON CONFLICT (version_id, field_key) DO NOTHING;

-- Add some important (non-critical) fields
INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
SELECT
    iv.id,
    field_key,
    'important',
    rationale
FROM importance_versions iv
CROSS JOIN (VALUES
    ('backupFrequency', 'Backup frequency affects recovery point'),
    ('backupTestingFrequency', 'Untested backups may not work when needed'),
    ('hasSiem', 'SIEM improves threat detection'),
    ('hasIncidentResponsePlan', 'IR plan reduces response time and costs'),
    ('patchingCadence', 'Unpatched systems are vulnerable'),
    ('hasVulnerabilityScanning', 'Finding vulns before attackers do'),
    ('hasDlp', 'DLP prevents data exfiltration'),
    ('hasNetworkSegmentation', 'Segmentation limits blast radius')
) AS important_fields(field_key, rationale)
WHERE iv.version_number = 1
ON CONFLICT (version_id, field_key) DO NOTHING;

COMMENT ON TABLE importance_versions IS 'Tracks evolution of field importance over time, informed by claims data';
COMMENT ON TABLE field_importance_settings IS 'Per-version importance levels for extraction schema fields';
COMMENT ON TABLE submission_extracted_values IS 'Structured extracted values per submission, replacing markdown summaries';
