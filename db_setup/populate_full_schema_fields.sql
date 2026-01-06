-- Migration: Properly populate schema_fields from the full 220-field extraction schema
-- This reads from extraction_schemas.schema_definition JSONB and normalizes into schema_fields

-- ─────────────────────────────────────────────────────────────
-- Step 1: Update schema_categories to match all 19 categories
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_schema_id UUID;
BEGIN
    -- Get active schema
    SELECT id INTO v_schema_id FROM extraction_schemas WHERE is_active = true LIMIT 1;

    IF v_schema_id IS NULL THEN
        RAISE EXCEPTION 'No active extraction schema found';
    END IF;

    RAISE NOTICE 'Using schema ID: %', v_schema_id;

    -- Clear existing schema_fields first (due to FK)
    DELETE FROM schema_fields WHERE schema_id = v_schema_id;
    RAISE NOTICE 'Cleared existing schema_fields';

    -- Clear existing categories for this schema
    DELETE FROM schema_categories WHERE schema_id = v_schema_id;
    RAISE NOTICE 'Cleared existing schema_categories';

    -- Insert all 19 categories from schema_definition
    INSERT INTO schema_categories (schema_id, key, display_name, display_order)
    SELECT
        v_schema_id,
        cat.key,
        -- Convert camelCase to Title Case: "accessControl" -> "Access Control"
        initcap(regexp_replace(cat.key, '([A-Z])', ' \1', 'g')),
        row_number() OVER (ORDER BY cat.key)
    FROM extraction_schemas es,
         jsonb_each(es.schema_definition) as cat(key, value)
    WHERE es.id = v_schema_id;

    RAISE NOTICE 'Created categories from schema_definition';
END $$;

-- ─────────────────────────────────────────────────────────────
-- Step 2: Populate schema_fields with all 220 fields
-- ─────────────────────────────────────────────────────────────

-- Insert all fields from the schema_definition
INSERT INTO schema_fields (schema_id, category_id, key, display_name, field_type, description, display_order)
SELECT
    es.id as schema_id,
    sc.id as category_id,
    field.key as key,
    COALESCE(field.value->>'displayName', initcap(regexp_replace(field.key, '([A-Z])', ' \1', 'g'))) as display_name,
    COALESCE(field.value->>'type', 'string') as field_type,
    field.value->>'description' as description,
    row_number() OVER (PARTITION BY cat.key ORDER BY field.key) as display_order
FROM extraction_schemas es
CROSS JOIN LATERAL jsonb_each(es.schema_definition) as cat(key, value)
CROSS JOIN LATERAL jsonb_each(cat.value->'fields') as field(key, value)
JOIN schema_categories sc ON sc.key = cat.key AND sc.schema_id = es.id
WHERE es.is_active = true;

-- ─────────────────────────────────────────────────────────────
-- Step 3: Update field_importance_settings with correct keys
-- ─────────────────────────────────────────────────────────────

-- First, let's see what field keys actually exist now
-- and map our importance settings to them

-- Clear and repopulate importance settings with verified field keys
DELETE FROM field_importance_settings;

-- Get the active importance version
DO $$
DECLARE
    v_version_id UUID;
BEGIN
    SELECT id INTO v_version_id FROM importance_versions WHERE is_active = true LIMIT 1;

    IF v_version_id IS NULL THEN
        RAISE NOTICE 'No active importance version, creating one';
        INSERT INTO importance_versions (version_number, name, description, is_active, created_by)
        VALUES (1, 'Initial Launch', 'Initial importance settings based on industry best practices', true, 'system')
        RETURNING id INTO v_version_id;
    END IF;

    -- Insert CRITICAL fields (the "mandatory controls" - must confirm these)
    -- These field keys match exactly what's in the v3 schema
    INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
    SELECT v_version_id, sf.key, 'critical', rationale
    FROM schema_fields sf
    JOIN extraction_schemas es ON es.id = sf.schema_id AND es.is_active = true
    JOIN (VALUES
        -- MFA Controls (accessControl category)
        ('mfaEmail', 'MFA for email prevents account takeover - #1 ransomware vector'),
        ('mfaRemoteAccess', 'Remote access without MFA is an open door'),
        ('mfaAdminAccess', 'Admin accounts are prime targets'),
        ('mfaCriticalSystems', 'MFA for critical systems prevents lateral movement'),
        ('hasMFA', 'MFA is foundational security control'),
        -- EDR Controls (endpointSecurity category)
        ('hasEDR', 'EDR is essential for detecting and stopping attacks'),
        ('edrEndpointCoverage', 'EDR coverage gaps leave blind spots'),
        -- Backup Controls (backupRecovery category)
        ('hasBackups', 'Backups enable recovery from any incident'),
        ('backupsOffline', 'Air-gapped backups are last line of defense'),
        ('backupsImmutable', 'Immutable backups cannot be encrypted by ransomware'),
        ('backupsEncrypted', 'Encrypted backups protect data confidentiality'),
        ('backupsTested', 'Untested backups may not work when needed'),
        -- Training Controls (securityAwareness category)
        ('hasSecurityTraining', 'Human error causes majority of breaches'),
        ('phishingSimulations', 'Regular phishing tests reinforce training'),
        -- Incident Response (incidentResponse category)
        ('hasIRPlan', 'IR plan reduces response time and costs'),
        ('irPlanTested', 'Untested IR plans fail under pressure')
    ) AS critical(key, rationale) ON sf.key = critical.key
    ON CONFLICT (version_id, field_key) DO NOTHING;

    RAISE NOTICE 'Inserted critical importance settings';

    -- Insert IMPORTANT fields (should confirm but not blocking)
    INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
    SELECT v_version_id, sf.key, 'important', rationale
    FROM schema_fields sf
    JOIN extraction_schemas es ON es.id = sf.schema_id AND es.is_active = true
    JOIN (VALUES
        -- Backup details
        ('backupFrequency', 'Backup frequency affects recovery point objective'),
        ('backupTestFrequency', 'Regular restore tests validate backup integrity'),
        -- EDR details
        ('edrServerCoverage', 'Server coverage is critical for detecting attacks'),
        ('edrOnDomainControllers', 'Domain controllers are high-value targets'),
        -- Incident Response details
        ('hasIRTeam', 'Dedicated IR team improves response capability'),
        ('hasRansomwarePlaybook', 'Ransomware-specific playbook speeds response'),
        ('irRetainer', 'Pre-arranged IR retainer reduces response time'),
        -- Network Security
        ('networkSegmentation', 'Segmentation limits blast radius'),
        ('firewallNextGen', 'NGFW provides advanced threat protection'),
        -- Email Security
        ('hasAntiPhishing', 'Anti-phishing prevents initial compromise'),
        ('dmarc', 'DMARC prevents email spoofing'),
        -- Vulnerability Management
        ('vulnerabilityScanning', 'Finding vulns before attackers do'),
        ('criticalPatchSLA', 'Fast critical patching reduces exposure'),
        ('penetrationTesting', 'Pen tests validate security posture'),
        -- Security Operations
        ('hasSIEM', 'SIEM improves threat detection'),
        ('hasMDR', 'MDR provides expert threat hunting'),
        ('has24x7Monitoring', '24/7 monitoring catches attacks faster'),
        -- Third Party Risk
        ('vendorSecurityAssessments', 'Third parties can be attack vectors'),
        ('mspMFARequired', 'MSP access without MFA is high risk'),
        -- Data Protection
        ('encryptionAtRest', 'Encryption protects stored data'),
        ('encryptionInTransit', 'Encryption protects data in motion'),
        ('hasDLP', 'DLP prevents data exfiltration')
    ) AS important(key, rationale) ON sf.key = important.key
    ON CONFLICT (version_id, field_key) DO NOTHING;

    RAISE NOTICE 'Inserted important importance settings';
END $$;

-- ─────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────

SELECT 'schema_categories: ' || COUNT(*)::text FROM schema_categories;
SELECT 'schema_fields: ' || COUNT(*)::text FROM schema_fields;
SELECT 'field_importance_settings: ' || COUNT(*)::text FROM field_importance_settings;

-- Show importance settings that were successfully mapped
SELECT 'Importance settings mapped to schema:' as info;
SELECT fis.importance, COUNT(*) as count
FROM field_importance_settings fis
JOIN schema_fields sf ON sf.key = fis.field_key
GROUP BY fis.importance;

-- Show any importance settings that didn't map (orphaned)
SELECT 'Orphaned importance settings (field not in schema):' as info;
SELECT fis.field_key, fis.importance
FROM field_importance_settings fis
LEFT JOIN schema_fields sf ON sf.key = fis.field_key
WHERE sf.key IS NULL;
