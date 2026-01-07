-- ============================================================================
-- UNDERWRITER ASSIGNMENT: Submission-Level Assignment
-- ============================================================================
--
-- Adds assignment fields directly to submissions table so assignment:
-- - Persists across all workflow stages
-- - Is transferrable (can be reassigned)
-- - Is always visible to all users
-- - Has full audit history
--
-- ============================================================================

-- Add assignment columns to submissions table
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS assigned_uw_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(100);

-- Index for filtering by assigned underwriter
CREATE INDEX IF NOT EXISTS idx_submissions_assigned_uw
    ON submissions(assigned_uw_name)
    WHERE assigned_uw_name IS NOT NULL;

-- ============================================================================
-- Assignment History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS submission_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    assigned_uw_name VARCHAR(100),
    assigned_at TIMESTAMPTZ DEFAULT now(),
    assigned_by VARCHAR(100),
    reason VARCHAR(50),  -- 'initial', 'reassigned', 'claimed', 'released'
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying history by submission
CREATE INDEX IF NOT EXISTS idx_assignment_history_submission
    ON submission_assignment_history(submission_id);

-- Index for querying history by underwriter
CREATE INDEX IF NOT EXISTS idx_assignment_history_uw
    ON submission_assignment_history(assigned_uw_name);

-- ============================================================================
-- Helper Function: Assign Submission
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_submission(
    p_submission_id UUID,
    p_assigned_to VARCHAR(100),
    p_assigned_by VARCHAR(100),
    p_reason VARCHAR(50) DEFAULT 'assigned'
) RETURNS JSONB AS $$
DECLARE
    v_old_assignee VARCHAR(100);
    v_result JSONB;
BEGIN
    -- Get current assignee
    SELECT assigned_uw_name INTO v_old_assignee
    FROM submissions
    WHERE id = p_submission_id;

    -- Update submission
    UPDATE submissions
    SET assigned_uw_name = p_assigned_to,
        assigned_at = now(),
        assigned_by = p_assigned_by
    WHERE id = p_submission_id;

    -- Record in history
    INSERT INTO submission_assignment_history (
        submission_id, assigned_uw_name, assigned_by, reason
    ) VALUES (
        p_submission_id, p_assigned_to, p_assigned_by, p_reason
    );

    -- Return result
    v_result := jsonb_build_object(
        'success', true,
        'assigned_to', p_assigned_to,
        'assigned_at', now(),
        'previous_assignee', v_old_assignee
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper Function: Unassign Submission
-- ============================================================================

CREATE OR REPLACE FUNCTION unassign_submission(
    p_submission_id UUID,
    p_unassigned_by VARCHAR(100),
    p_reason VARCHAR(50) DEFAULT 'released'
) RETURNS JSONB AS $$
DECLARE
    v_old_assignee VARCHAR(100);
BEGIN
    -- Get current assignee
    SELECT assigned_uw_name INTO v_old_assignee
    FROM submissions
    WHERE id = p_submission_id;

    -- Update submission
    UPDATE submissions
    SET assigned_uw_name = NULL,
        assigned_at = NULL,
        assigned_by = NULL
    WHERE id = p_submission_id;

    -- Record in history
    INSERT INTO submission_assignment_history (
        submission_id, assigned_uw_name, assigned_by, reason
    ) VALUES (
        p_submission_id, NULL, p_unassigned_by, p_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'previous_assignee', v_old_assignee
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View: My Active Submissions (for "My Queue" filtering)
-- ============================================================================

CREATE OR REPLACE VIEW v_my_submissions AS
SELECT
    s.id,
    s.applicant_name,
    s.submission_status,
    s.decision_tag,
    s.assigned_uw_name,
    s.assigned_at,
    s.created_at,
    sw.current_stage as workflow_stage,
    COALESCE(
        (SELECT true FROM insurance_towers t WHERE t.submission_id = s.id AND t.is_bound = true LIMIT 1),
        false
    ) as has_bound_quote
FROM submissions s
LEFT JOIN submission_workflow sw ON sw.submission_id = s.id
WHERE s.assigned_uw_name IS NOT NULL;

-- ============================================================================
-- View: Unassigned Submissions
-- ============================================================================

CREATE OR REPLACE VIEW v_unassigned_submissions AS
SELECT
    s.id,
    s.applicant_name,
    s.submission_status,
    s.decision_tag,
    s.created_at,
    sw.current_stage as workflow_stage,
    EXTRACT(EPOCH FROM (now() - s.created_at)) / 3600 as hours_since_created
FROM submissions s
LEFT JOIN submission_workflow sw ON sw.submission_id = s.id
WHERE s.assigned_uw_name IS NULL
  AND s.submission_status NOT IN ('declined', 'not_taken_up')
ORDER BY s.created_at;

-- ============================================================================
-- View: Assignment Workload Summary
-- ============================================================================

CREATE OR REPLACE VIEW v_assignment_workload AS
SELECT
    s.assigned_uw_name,
    COUNT(*) as total_assigned,
    COUNT(*) FILTER (WHERE s.submission_status = 'new') as new_count,
    COUNT(*) FILTER (WHERE s.submission_status = 'quoted') as quoted_count,
    COUNT(*) FILTER (WHERE s.submission_status = 'bound') as bound_count,
    COUNT(*) FILTER (WHERE sw.current_stage = 'uw_work') as in_uw_work
FROM submissions s
LEFT JOIN submission_workflow sw ON sw.submission_id = s.id
WHERE s.assigned_uw_name IS NOT NULL
GROUP BY s.assigned_uw_name
ORDER BY total_assigned DESC;
