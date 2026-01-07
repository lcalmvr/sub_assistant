-- ============================================================================
-- SUBJECTIVITIES: Deadline Enforcement Enhancements
-- ============================================================================
--
-- Adds is_critical flag to distinguish blocking vs warning-only subjectivities
-- Critical subjectivities block policy issuance; non-critical only warn
--
-- ============================================================================

-- Add is_critical column (defaults to true = blocking)
ALTER TABLE submission_subjectivities
ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT true;

-- Add index for deadline queries
CREATE INDEX IF NOT EXISTS idx_submission_subjectivities_due_date
    ON submission_subjectivities(due_date)
    WHERE status = 'pending' AND due_date IS NOT NULL;

-- Add index for critical pending queries
CREATE INDEX IF NOT EXISTS idx_submission_subjectivities_critical_pending
    ON submission_subjectivities(submission_id, is_critical)
    WHERE status = 'pending';

-- ============================================================================
-- VIEW: Pending subjectivities with deadline status
-- ============================================================================

CREATE OR REPLACE VIEW v_pending_subjectivities AS
SELECT
    ss.id,
    ss.submission_id,
    ss.text,
    ss.category,
    ss.status,
    ss.due_date,
    ss.is_critical,
    ss.created_at,
    s.applicant_name,
    -- Deadline calculations
    CASE
        WHEN ss.due_date IS NULL THEN 'no_deadline'
        WHEN ss.due_date < CURRENT_DATE THEN 'overdue'
        WHEN ss.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
        ELSE 'on_track'
    END AS deadline_status,
    CASE
        WHEN ss.due_date IS NULL THEN NULL
        ELSE ss.due_date - CURRENT_DATE
    END AS days_until_due,
    CASE
        WHEN ss.due_date IS NULL THEN NULL
        WHEN ss.due_date < CURRENT_DATE THEN CURRENT_DATE - ss.due_date
        ELSE NULL
    END AS days_overdue
FROM submission_subjectivities ss
JOIN submissions s ON s.id = ss.submission_id
WHERE ss.status = 'pending';

-- ============================================================================
-- VIEW: Admin dashboard - all pending subjectivities across bound accounts
-- ============================================================================

CREATE OR REPLACE VIEW v_admin_pending_subjectivities AS
SELECT
    ss.id AS subjectivity_id,
    ss.submission_id,
    ss.text AS subjectivity_text,
    ss.category,
    ss.due_date,
    ss.is_critical,
    ss.created_at,
    s.applicant_name,
    t.quote_name AS bound_option_name,
    t.id AS bound_option_id,
    -- Deadline calculations
    CASE
        WHEN ss.due_date IS NULL THEN 'no_deadline'
        WHEN ss.due_date < CURRENT_DATE THEN 'overdue'
        WHEN ss.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
        ELSE 'on_track'
    END AS deadline_status,
    ss.due_date - CURRENT_DATE AS days_until_due
FROM submission_subjectivities ss
JOIN submissions s ON s.id = ss.submission_id
JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = true
WHERE ss.status = 'pending'
ORDER BY
    CASE
        WHEN ss.due_date IS NULL THEN 3
        WHEN ss.due_date < CURRENT_DATE THEN 1
        WHEN ss.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 2
        ELSE 4
    END,
    ss.due_date NULLS LAST,
    s.applicant_name;

-- ============================================================================
-- COMMENT: Update existing policy_subjectivities if that's still in use
-- ============================================================================

-- If the old table is still being used, add column there too
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policy_subjectivities') THEN
        ALTER TABLE policy_subjectivities ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT true;
    END IF;
END $$;
