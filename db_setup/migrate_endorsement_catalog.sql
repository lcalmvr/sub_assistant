-- Migrate Endorsement Catalog to Document Library
-- This migrates all entries from endorsement_catalog to document_library
-- preserving code, title, position, and other metadata.
-- Existing entries in document_library are not overwritten.

INSERT INTO document_library (
    code,
    title,
    document_type,
    category,
    position,
    midterm_only,
    status,
    content_plain,
    default_sort_order,
    created_by
)
SELECT
    ec.code,
    ec.title,
    'endorsement' AS document_type,
    -- Map endorsement_type to category
    CASE
        WHEN ec.endorsement_type = 'extension' THEN 'extension'
        WHEN ec.endorsement_type = 'cancellation' THEN 'cancellation'
        WHEN ec.endorsement_type = 'coverage_change' THEN 'coverage'
        WHEN ec.endorsement_type = 'erp' THEN 'reporting'
        WHEN ec.endorsement_type = 'bor_change' THEN 'administrative'
        WHEN ec.endorsement_type = 'name_change' THEN 'administrative'
        WHEN ec.endorsement_type = 'address_change' THEN 'administrative'
        WHEN ec.endorsement_type = 'reinstatement' THEN 'administrative'
        WHEN ec.code LIKE 'EXC-%' THEN 'exclusion'
        WHEN ec.code LIKE 'DO-%' THEN 'd&o'
        WHEN ec.code LIKE 'EPL-%' THEN 'epl'
        WHEN ec.code LIKE 'CYB-%' THEN 'cyber'
        WHEN ec.code LIKE 'CRM-%' THEN 'crime'
        WHEN ec.code LIKE 'FID-%' THEN 'fiduciary'
        WHEN ec.code LIKE 'GEN-%' THEN 'general'
        ELSE NULL
    END AS category,
    ec.position,
    ec.midterm_only,
    CASE WHEN ec.active THEN 'active' ELSE 'archived' END AS status,
    ec.description AS content_plain,
    -- Default sort order based on code prefix
    CASE
        WHEN ec.code LIKE 'EXC-%' THEN 10  -- Exclusions first
        WHEN ec.code LIKE 'WAR-%' THEN 11
        WHEN ec.code LIKE 'SAN-%' THEN 12
        WHEN ec.code LIKE 'GEN-%' THEN 50  -- General in middle
        WHEN ec.code LIKE 'COV-%' THEN 60
        WHEN ec.code LIKE 'LIM-%' THEN 70
        WHEN ec.code LIKE 'ERP-%' THEN 80
        WHEN ec.code LIKE 'CAN-%' THEN 90  -- Administrative at end
        ELSE 100
    END AS default_sort_order,
    'migration' AS created_by
FROM endorsement_catalog ec
WHERE NOT EXISTS (
    SELECT 1 FROM document_library dl WHERE dl.code = ec.code
)
ORDER BY ec.code;

-- Report migration results
SELECT
    'Migrated' AS status,
    COUNT(*) AS count
FROM document_library
WHERE created_by = 'migration';
