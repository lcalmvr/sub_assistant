-- Migration: Populate schema_fields and migrate submission_controls to submission_extracted_values
-- This completes the Phase 1 data architecture

-- ─────────────────────────────────────────────────────────────
-- Step 1: Populate schema_fields from EXTRACTION_SCHEMA
-- ─────────────────────────────────────────────────────────────

-- Get the active schema ID
DO $$
DECLARE
    v_schema_id UUID;
    v_cat_general UUID;
    v_cat_security UUID;
    v_cat_patch UUID;
    v_cat_access UUID;
    v_cat_network UUID;
    v_cat_endpoint UUID;
    v_cat_email UUID;
    v_cat_remote UUID;
    v_cat_backup UUID;
    v_cat_training UUID;
    v_cat_incident UUID;
BEGIN
    -- Get active schema
    SELECT id INTO v_schema_id FROM extraction_schemas WHERE is_active = true LIMIT 1;

    IF v_schema_id IS NULL THEN
        RAISE NOTICE 'No active extraction schema found';
        RETURN;
    END IF;

    -- Get category IDs
    SELECT id INTO v_cat_general FROM schema_categories WHERE display_name = 'General Information';
    SELECT id INTO v_cat_security FROM schema_categories WHERE display_name = 'Security Management';
    SELECT id INTO v_cat_patch FROM schema_categories WHERE display_name = 'Patch Management';
    SELECT id INTO v_cat_access FROM schema_categories WHERE display_name = 'Access Management';
    SELECT id INTO v_cat_network FROM schema_categories WHERE display_name = 'Network Security';
    SELECT id INTO v_cat_endpoint FROM schema_categories WHERE display_name = 'Endpoint Security';
    SELECT id INTO v_cat_email FROM schema_categories WHERE display_name = 'Email Security';
    SELECT id INTO v_cat_remote FROM schema_categories WHERE display_name = 'Remote Access';
    SELECT id INTO v_cat_backup FROM schema_categories WHERE display_name = 'Backup And Recovery';
    SELECT id INTO v_cat_training FROM schema_categories WHERE display_name = 'Training And Awareness';
    SELECT id INTO v_cat_incident FROM schema_categories WHERE display_name = 'Incident Response';

    -- Clear existing fields (fresh start)
    DELETE FROM schema_fields WHERE schema_id = v_schema_id;

    -- General Information
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_general, 'applicantName', 'Applicant Name', 'string', 'Legal name of the applicant company', 1),
        (v_schema_id, v_cat_general, 'primaryWebsiteAndEmailDomains', 'Website/Email Domains', 'string', 'Primary website domain(s)', 2),
        (v_schema_id, v_cat_general, 'primaryIndustry', 'Primary Industry', 'string', 'Primary industry or business type', 3),
        (v_schema_id, v_cat_general, 'annualRevenue', 'Annual Revenue', 'number', 'Annual revenue in USD', 4),
        (v_schema_id, v_cat_general, 'employeeCount', 'Employee Count', 'number', 'Number of employees', 5);

    -- Security Management
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_security, 'securityManagement', 'Security Management', 'array', 'Who manages IT security (Internal IT, MSP, etc.)', 1),
        (v_schema_id, v_cat_security, 'mdrThirdPartyIntervention', 'MDR Third-Party Intervention', 'boolean', 'Has MDR with third-party intervention capability', 2),
        (v_schema_id, v_cat_security, 'workloadInfrastructure', 'Workload Infrastructure', 'string', 'Cloud, on-premises, or hybrid', 3);

    -- Patch Management
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_patch, 'centralPatchManagement', 'Central Patch Management', 'boolean', 'Uses centralized patch management', 1),
        (v_schema_id, v_cat_patch, 'criticalPatchTimeframe', 'Critical Patch Timeframe', 'string', 'Timeframe for applying critical patches', 2),
        (v_schema_id, v_cat_patch, 'normalPatchingTimeframe', 'Normal Patch Timeframe', 'string', 'Timeframe for normal patches', 3);

    -- Access Management
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_access, 'singleSignOn', 'Single Sign-On', 'boolean', 'Uses SSO', 1),
        (v_schema_id, v_cat_access, 'emailMfa', 'Email MFA', 'boolean', 'MFA enabled for email access', 2),
        (v_schema_id, v_cat_access, 'mfaForCriticalInfoAccess', 'MFA for Critical Systems', 'boolean', 'MFA for critical systems', 3),
        (v_schema_id, v_cat_access, 'passwordManager', 'Password Manager', 'boolean', 'Uses password manager', 4),
        (v_schema_id, v_cat_access, 'endUserAdminRights', 'End User Admin Rights', 'boolean', 'End users have admin rights (negative control)', 5),
        (v_schema_id, v_cat_access, 'privilegedAccessManagement', 'Privileged Access Management', 'boolean', 'Uses PAM solution', 6);

    -- Network Security
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_network, 'networkSecurityTechnologies', 'Network Security Tech', 'array', 'Firewall, IDS/IPS, etc.', 1),
        (v_schema_id, v_cat_network, 'networkSegmentation', 'Network Segmentation', 'boolean', 'Network is segmented', 2);

    -- Endpoint Security
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_endpoint, 'endpointSecurityTechnologies', 'Endpoint Security Tech', 'array', 'EDR/AV vendors in use', 1),
        (v_schema_id, v_cat_endpoint, 'hasEdr', 'Has EDR', 'boolean', 'Has EDR solution', 2),
        (v_schema_id, v_cat_endpoint, 'edrEndpointCoveragePercent', 'EDR Coverage %', 'number', 'Percentage of endpoints with EDR', 3),
        (v_schema_id, v_cat_endpoint, 'eppedrOnDomainControllers', 'EDR on Domain Controllers', 'boolean', 'EDR on domain controllers', 4);

    -- Remote Access
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_remote, 'allowsRemoteAccess', 'Allows Remote Access', 'boolean', 'Allows remote access to network', 1),
        (v_schema_id, v_cat_remote, 'remoteAccessMfa', 'Remote Access MFA', 'boolean', 'MFA required for remote access', 2),
        (v_schema_id, v_cat_remote, 'remoteAccessSolutions', 'Remote Access Solutions', 'array', 'VPN, RDP, etc.', 3);

    -- Training and Awareness
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_training, 'conductsPhishingSimulations', 'Phishing Simulations', 'boolean', 'Conducts phishing simulations', 1),
        (v_schema_id, v_cat_training, 'phishingSimulationFrequency', 'Phishing Frequency', 'string', 'How often phishing tests run', 2),
        (v_schema_id, v_cat_training, 'mandatoryTrainingTopics', 'Training Topics', 'array', 'Security awareness training topics', 3);

    -- Backup and Recovery
    INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
    VALUES
        (v_schema_id, v_cat_backup, 'hasBackups', 'Has Backups', 'boolean', 'Has backup solution', 1),
        (v_schema_id, v_cat_backup, 'criticalInfoBackupFrequency', 'Backup Frequency', 'string', 'Backup frequency', 2),
        (v_schema_id, v_cat_backup, 'backupStorageLocation', 'Backup Storage', 'array', 'Where backups are stored', 3),
        (v_schema_id, v_cat_backup, 'offlineBackups', 'Offline Backups', 'boolean', 'Has offline/air-gapped backups', 4),
        (v_schema_id, v_cat_backup, 'offsiteBackups', 'Offsite Backups', 'boolean', 'Has offsite backups', 5),
        (v_schema_id, v_cat_backup, 'immutableBackups', 'Immutable Backups', 'boolean', 'Has immutable backups', 6),
        (v_schema_id, v_cat_backup, 'encryptedBackups', 'Encrypted Backups', 'boolean', 'Backups are encrypted', 7),
        (v_schema_id, v_cat_backup, 'backupRestoreTestFrequency', 'Backup Test Frequency', 'string', 'How often restore tests run', 8);

    RAISE NOTICE 'Populated schema_fields for schema %', v_schema_id;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Step 2: Create mapping from old control_name to new field_key
-- ─────────────────────────────────────────────────────────────

CREATE TEMP TABLE control_mapping (
    old_name TEXT PRIMARY KEY,
    new_key TEXT NOT NULL
);

INSERT INTO control_mapping (old_name, new_key) VALUES
    ('MFA Email', 'emailMfa'),
    ('MFA Remote Access', 'remoteAccessMfa'),
    ('MFA Privileged Account Access', 'privilegedAccessManagement'),
    ('MFA Backups', 'mfaForCriticalInfoAccess'),  -- Closest match
    ('EDR', 'hasEdr'),
    ('Phishing Training', 'conductsPhishingSimulations'),
    ('Offline Backups', 'offlineBackups'),
    ('Offsite Backups', 'offsiteBackups'),
    ('Immutable Backups', 'immutableBackups'),
    ('Encrypted Backups', 'encryptedBackups');

-- ─────────────────────────────────────────────────────────────
-- Step 3: Migrate submission_controls to submission_extracted_values
-- ─────────────────────────────────────────────────────────────

INSERT INTO submission_extracted_values (
    submission_id,
    field_key,
    value,
    status,
    source_type,
    source_document_id,
    source_text,
    updated_at,
    updated_by
)
SELECT
    sc.submission_id,
    cm.new_key,
    CASE
        WHEN sc.status = 'present' THEN 'true'::jsonb
        WHEN sc.status = 'not_present' THEN 'false'::jsonb
        ELSE null
    END,
    sc.status,  -- Keep original status: present, not_asked, pending, not_present
    sc.source_type,
    sc.source_document_id,
    sc.source_text,
    sc.updated_at,
    sc.updated_by
FROM submission_controls sc
JOIN control_mapping cm ON cm.old_name = sc.control_name
ON CONFLICT (submission_id, field_key) DO UPDATE SET
    value = EXCLUDED.value,
    status = EXCLUDED.status,
    source_type = EXCLUDED.source_type,
    source_document_id = EXCLUDED.source_document_id,
    source_text = EXCLUDED.source_text,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;

-- ─────────────────────────────────────────────────────────────
-- Step 4: Update field_importance_settings to match new keys
-- ─────────────────────────────────────────────────────────────

-- Delete old incorrect mappings
DELETE FROM field_importance_settings;

-- Re-insert with correct field keys matching schema_fields
INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
SELECT
    iv.id,
    field_key,
    'critical',
    rationale
FROM importance_versions iv
CROSS JOIN (VALUES
    ('emailMfa', 'MFA for email prevents account takeover - #1 ransomware vector'),
    ('remoteAccessMfa', 'Remote access without MFA is an open door'),
    ('privilegedAccessManagement', 'PAM protects admin accounts - prime targets'),
    ('mfaForCriticalInfoAccess', 'MFA for critical systems is essential'),
    ('hasEdr', 'EDR is essential for detecting and stopping attacks'),
    ('conductsPhishingSimulations', 'Human error causes majority of breaches'),
    ('offlineBackups', 'Air-gapped backups are last line of defense'),
    ('offsiteBackups', 'Geographic separation protects against physical disasters'),
    ('immutableBackups', 'Immutable backups cannot be encrypted by ransomware'),
    ('encryptedBackups', 'Encrypted backups protect data confidentiality')
) AS critical_fields(field_key, rationale)
WHERE iv.is_active = true
ON CONFLICT (version_id, field_key) DO NOTHING;

-- Add important (non-critical) fields
INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
SELECT
    iv.id,
    field_key,
    'important',
    rationale
FROM importance_versions iv
CROSS JOIN (VALUES
    ('criticalInfoBackupFrequency', 'Backup frequency affects recovery point'),
    ('backupRestoreTestFrequency', 'Untested backups may not work when needed'),
    ('mdrThirdPartyIntervention', 'MDR improves threat detection and response'),
    ('centralPatchManagement', 'Centralized patching reduces vulnerability window'),
    ('criticalPatchTimeframe', 'Patch speed affects exposure window'),
    ('networkSegmentation', 'Segmentation limits blast radius'),
    ('hasBackups', 'Backups enable recovery from any incident'),
    ('singleSignOn', 'SSO improves security posture when combined with MFA')
) AS important_fields(field_key, rationale)
WHERE iv.is_active = true
ON CONFLICT (version_id, field_key) DO NOTHING;

DROP TABLE control_mapping;

-- ─────────────────────────────────────────────────────────────
-- Verify migration
-- ─────────────────────────────────────────────────────────────

SELECT 'schema_fields count: ' || COUNT(*)::text FROM schema_fields;
SELECT 'submission_extracted_values count: ' || COUNT(*)::text FROM submission_extracted_values;
SELECT 'field_importance_settings count: ' || COUNT(*)::text FROM field_importance_settings;
