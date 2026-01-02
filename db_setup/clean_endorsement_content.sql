-- ============================================================================
-- CLEAN ENDORSEMENT CONTENT - Strip Lead-in and Closing Text
-- ============================================================================
-- Part of "Clean Separation" approach:
--   - System generates: Header, Lead-in, Closing/Footer
--   - Document Library: Only unique body content
--
-- This script removes duplicated lead-in and closing text from existing
-- endorsements so the system-generated versions are used instead.
--
-- Run: psql $DATABASE_URL -f db_setup/clean_endorsement_content.sql
-- ============================================================================

-- Preview changes first (dry run)
SELECT
    id,
    title,
    code,
    CASE
        WHEN content_html LIKE '%<p>This endorsement modifies the insurance provided under the policy to which it is attached.</p>%'
        THEN 'Has lead-in'
        ELSE 'No lead-in'
    END as has_lead_in,
    CASE
        WHEN content_html LIKE '%<p><em>All other terms and conditions of the policy remain unchanged.</em></p>%'
        THEN 'Has closing'
        ELSE 'No closing'
    END as has_closing
FROM document_library
WHERE document_type = 'endorsement'
AND content_html IS NOT NULL;

-- ============================================================================
-- STEP 1: Remove lead-in text
-- ============================================================================
-- Pattern: <p>This endorsement modifies the insurance provided under the policy to which it is attached.</p>
-- This appears after the h2 heading, sometimes with newlines

UPDATE document_library
SET content_html = REGEXP_REPLACE(
    content_html,
    '<p>This endorsement modifies the insurance provided under the policy to which it is attached\.</p>\s*',
    '',
    'gi'
)
WHERE document_type = 'endorsement'
AND content_html LIKE '%<p>This endorsement modifies the insurance provided under the policy to which it is attached.</p>%';

-- ============================================================================
-- STEP 2: Remove closing text
-- ============================================================================
-- Pattern: <p><em>All other terms and conditions of the policy remain unchanged.</em></p>
-- This appears at the end of the content

UPDATE document_library
SET content_html = REGEXP_REPLACE(
    content_html,
    '\s*<p><em>All other terms and conditions of the policy remain unchanged\.</em></p>\s*$',
    '',
    'gi'
)
WHERE document_type = 'endorsement'
AND content_html LIKE '%<p><em>All other terms and conditions of the policy remain unchanged.</em></p>%';

-- ============================================================================
-- STEP 3: Clean up any orphaned h2 titles that duplicate the endorsement title
-- ============================================================================
-- Many endorsements have <h2>Title</h2> at the start which duplicates the
-- system-generated header. Remove if it's the first element.
-- (Only if it matches the document title)

-- Note: This is optional - the h2 may provide structure within the body.
-- Uncomment if you want to remove duplicate h2 headings:
/*
UPDATE document_library
SET content_html = REGEXP_REPLACE(
    content_html,
    '^<h2>[^<]+</h2>\s*',
    '',
    'i'
)
WHERE document_type = 'endorsement'
AND content_html ~ '^<h2>';
*/

-- ============================================================================
-- Verify results
-- ============================================================================
SELECT
    id,
    title,
    code,
    LEFT(content_html, 200) as content_start,
    RIGHT(content_html, 200) as content_end
FROM document_library
WHERE document_type = 'endorsement'
AND content_html IS NOT NULL
LIMIT 5;
