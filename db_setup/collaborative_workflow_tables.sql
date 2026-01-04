-- ============================================================
-- Collaborative UW Workflow - Phase 1: Core Voting
-- ============================================================
-- Run this migration to enable the collaborative voting workflow
--
-- Phase 1 includes:
--   - Workflow stages configuration
--   - Submission workflow state tracking
--   - Vote capture
--   - Workflow transitions (audit trail)
--   - Basic notifications
-- ============================================================

-- ============================================================
-- 1. WORKFLOW STAGES (Configuration)
-- ============================================================
-- Defines the stages in the workflow and their rules

CREATE TABLE IF NOT EXISTS workflow_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_key VARCHAR(50) UNIQUE NOT NULL,
    stage_name VARCHAR(100) NOT NULL,
    stage_order INT NOT NULL,
    required_votes INT DEFAULT 2,
    timeout_hours INT DEFAULT 4,
    timeout_action VARCHAR(20) DEFAULT 'escalate',  -- 'decline', 'escalate', 'approve'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the default stages
INSERT INTO workflow_stages (stage_key, stage_name, stage_order, required_votes, timeout_hours, timeout_action)
VALUES
    ('intake', 'Intake', 0, 0, NULL, NULL),
    ('pre_screen', 'Pre-Screen', 1, 2, 4, 'decline'),
    ('uw_work', 'UW Work', 2, 0, NULL, NULL),
    ('formal', 'Formal Review', 3, 2, 4, 'escalate'),
    ('complete', 'Complete', 4, 0, NULL, NULL)
ON CONFLICT (stage_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_workflow_stages_order ON workflow_stages(stage_order);


-- ============================================================
-- 2. SUBMISSION WORKFLOW STATE
-- ============================================================
-- Tracks where each submission is in the workflow

CREATE TABLE IF NOT EXISTS submission_workflow (
    submission_id UUID PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
    current_stage VARCHAR(50) NOT NULL DEFAULT 'intake',
    stage_entered_at TIMESTAMPTZ DEFAULT now(),

    -- Assignment for UW work
    assigned_uw_id UUID,
    assigned_uw_name VARCHAR(100),
    assigned_at TIMESTAMPTZ,
    work_started_at TIMESTAMPTZ,

    -- Completion
    completed_at TIMESTAMPTZ,
    final_decision VARCHAR(20),  -- 'quoted', 'declined'
    final_decision_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_workflow_stage ON submission_workflow(current_stage);
CREATE INDEX IF NOT EXISTS idx_submission_workflow_assigned ON submission_workflow(assigned_uw_id);
CREATE INDEX IF NOT EXISTS idx_submission_workflow_stage_entered ON submission_workflow(current_stage, stage_entered_at);


-- ============================================================
-- 3. WORKFLOW VOTES
-- ============================================================
-- Captures every vote at every stage

CREATE TABLE IF NOT EXISTS workflow_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,

    -- The voter
    user_id UUID,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(255),

    -- The vote
    vote VARCHAR(20) NOT NULL,  -- pre_screen: 'pursue', 'pass', 'unsure'
                                 -- formal: 'approve', 'decline', 'send_back'
    comment TEXT,

    -- Decline/send_back reasons (formal stage)
    reasons TEXT[],

    -- Metadata
    voted_at TIMESTAMPTZ DEFAULT now(),
    vote_weight INT DEFAULT 1,
    is_tiebreaker BOOLEAN DEFAULT false,
    is_recommender BOOLEAN DEFAULT false,  -- true if this person worked the account

    -- Prevent double voting per stage
    UNIQUE(submission_id, stage, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_votes_submission ON workflow_votes(submission_id);
CREATE INDEX IF NOT EXISTS idx_workflow_votes_stage ON workflow_votes(submission_id, stage);
CREATE INDEX IF NOT EXISTS idx_workflow_votes_user ON workflow_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_votes_voted_at ON workflow_votes(voted_at);


-- ============================================================
-- 4. WORKFLOW TRANSITIONS (Audit Trail)
-- ============================================================
-- Records every stage change for audit purposes

CREATE TABLE IF NOT EXISTS workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,

    from_stage VARCHAR(50),
    to_stage VARCHAR(50) NOT NULL,

    -- What triggered this transition
    trigger VARCHAR(50) NOT NULL,  -- 'vote_threshold', 'timeout', 'manual', 'escalation', 'ai_complete'
    trigger_details JSONB,  -- e.g., {"votes": {"pursue": 2, "pass": 1}, "threshold_met": "pursue"}

    -- Who/what caused it
    triggered_by_user_id UUID,
    triggered_by_user_name VARCHAR(100),
    triggered_by_system BOOLEAN DEFAULT false,

    triggered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_submission ON workflow_transitions(submission_id);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_time ON workflow_transitions(triggered_at);


-- ============================================================
-- 5. NOTIFICATIONS
-- ============================================================
-- In-app notifications for users

CREATE TABLE IF NOT EXISTS workflow_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_email VARCHAR(255),

    -- Notification content
    type VARCHAR(50) NOT NULL,  -- 'vote_needed', 'timeout_warning', 'approved', 'declined',
                                 -- 'sent_back', 'ready_to_work', 'escalation', 'claimed'
    title TEXT NOT NULL,
    body TEXT,

    -- What it's about
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    workflow_stage VARCHAR(50),

    -- Priority
    priority VARCHAR(20) DEFAULT 'normal',  -- 'low', 'normal', 'high', 'urgent'

    -- State
    read_at TIMESTAMPTZ,
    acted_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,

    -- Delivery tracking
    email_sent_at TIMESTAMPTZ,
    slack_sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ  -- auto-dismiss after this time
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON workflow_notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON workflow_notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_submission ON workflow_notifications(submission_id);


-- ============================================================
-- 6. HELPER VIEWS
-- ============================================================

-- Current vote tally for each submission's active stage
CREATE OR REPLACE VIEW v_vote_tally AS
SELECT
    sw.submission_id,
    sw.current_stage,
    wv.vote,
    COUNT(*) as vote_count,
    ARRAY_AGG(wv.user_name ORDER BY wv.voted_at) as voters,
    ARRAY_AGG(wv.comment ORDER BY wv.voted_at) FILTER (WHERE wv.comment IS NOT NULL) as comments
FROM submission_workflow sw
LEFT JOIN workflow_votes wv
    ON wv.submission_id = sw.submission_id
    AND wv.stage = sw.current_stage
WHERE sw.completed_at IS NULL
GROUP BY sw.submission_id, sw.current_stage, wv.vote;


-- Submissions needing votes (for queue)
CREATE OR REPLACE VIEW v_needs_votes AS
SELECT
    s.id as submission_id,
    s.applicant_name,
    s.created_at as submitted_at,
    sw.current_stage,
    sw.stage_entered_at,
    ws.timeout_hours,
    ws.required_votes,
    sw.stage_entered_at + (ws.timeout_hours || ' hours')::INTERVAL as deadline,
    EXTRACT(EPOCH FROM (sw.stage_entered_at + (ws.timeout_hours || ' hours')::INTERVAL - now())) / 3600 as hours_remaining,
    COALESCE(vote_counts.total_votes, 0) as votes_cast,
    ws.required_votes - COALESCE(vote_counts.total_votes, 0) as votes_needed
FROM submissions s
JOIN submission_workflow sw ON sw.submission_id = s.id
JOIN workflow_stages ws ON ws.stage_key = sw.current_stage
LEFT JOIN (
    SELECT submission_id, stage, COUNT(*) as total_votes
    FROM workflow_votes
    GROUP BY submission_id, stage
) vote_counts ON vote_counts.submission_id = s.id AND vote_counts.stage = sw.current_stage
WHERE sw.current_stage IN ('pre_screen', 'formal')
  AND sw.completed_at IS NULL
  AND ws.required_votes > 0;


-- Submissions ready for UW work (passed pre-screen, not claimed)
CREATE OR REPLACE VIEW v_ready_to_work AS
SELECT
    s.id as submission_id,
    s.applicant_name,
    s.created_at as submitted_at,
    sw.stage_entered_at,
    EXTRACT(EPOCH FROM (now() - sw.stage_entered_at)) / 3600 as hours_waiting
FROM submissions s
JOIN submission_workflow sw ON sw.submission_id = s.id
WHERE sw.current_stage = 'uw_work'
  AND sw.assigned_uw_id IS NULL
  AND sw.completed_at IS NULL
ORDER BY sw.stage_entered_at;


-- My active work (claimed by a specific user)
-- Usage: SELECT * FROM v_my_active_work WHERE assigned_uw_id = 'user-uuid';
CREATE OR REPLACE VIEW v_my_active_work AS
SELECT
    s.id as submission_id,
    s.applicant_name,
    sw.assigned_uw_id,
    sw.assigned_uw_name,
    sw.assigned_at,
    sw.work_started_at,
    EXTRACT(EPOCH FROM (now() - COALESCE(sw.work_started_at, sw.assigned_at))) / 60 as minutes_working
FROM submissions s
JOIN submission_workflow sw ON sw.submission_id = s.id
WHERE sw.current_stage = 'uw_work'
  AND sw.assigned_uw_id IS NOT NULL
  AND sw.completed_at IS NULL;


-- Pending votes for a specific user
-- This helps identify what a user has NOT voted on yet
CREATE OR REPLACE VIEW v_pending_votes_by_user AS
SELECT
    nv.submission_id,
    nv.applicant_name,
    nv.current_stage,
    nv.stage_entered_at,
    nv.deadline,
    nv.hours_remaining,
    nv.votes_cast,
    nv.votes_needed
FROM v_needs_votes nv
WHERE nv.votes_needed > 0;


-- Submission workflow summary (for dashboard)
CREATE OR REPLACE VIEW v_workflow_summary AS
SELECT
    sw.current_stage,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE sw.assigned_uw_id IS NOT NULL) as assigned_count,
    AVG(EXTRACT(EPOCH FROM (now() - sw.stage_entered_at)) / 3600) as avg_hours_in_stage
FROM submission_workflow sw
WHERE sw.completed_at IS NULL
GROUP BY sw.current_stage;


-- Full audit trail for a submission
CREATE OR REPLACE VIEW v_submission_audit AS
SELECT
    submission_id,
    'transition' as event_type,
    triggered_at as event_at,
    to_stage as event_detail,
    trigger as event_trigger,
    triggered_by_user_name as user_name,
    NULL as vote,
    NULL as comment
FROM workflow_transitions

UNION ALL

SELECT
    submission_id,
    'vote' as event_type,
    voted_at as event_at,
    stage as event_detail,
    stage as event_trigger,
    user_name,
    vote,
    comment
FROM workflow_votes

ORDER BY event_at;


-- ============================================================
-- 7. FUNCTIONS
-- ============================================================

-- Function to initialize workflow for a submission
CREATE OR REPLACE FUNCTION init_submission_workflow(p_submission_id UUID)
RETURNS UUID AS $$
DECLARE
    v_workflow_id UUID;
BEGIN
    INSERT INTO submission_workflow (submission_id, current_stage, stage_entered_at)
    VALUES (p_submission_id, 'intake', now())
    ON CONFLICT (submission_id) DO NOTHING
    RETURNING submission_id INTO v_workflow_id;

    -- Log the transition
    IF v_workflow_id IS NOT NULL THEN
        INSERT INTO workflow_transitions (submission_id, from_stage, to_stage, trigger, triggered_by_system)
        VALUES (p_submission_id, NULL, 'intake', 'submission_created', true);
    END IF;

    RETURN COALESCE(v_workflow_id, p_submission_id);
END;
$$ LANGUAGE plpgsql;


-- Function to advance workflow stage
CREATE OR REPLACE FUNCTION advance_workflow_stage(
    p_submission_id UUID,
    p_to_stage VARCHAR(50),
    p_trigger VARCHAR(50),
    p_trigger_details JSONB DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_user_name VARCHAR(100) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_from_stage VARCHAR(50);
BEGIN
    -- Get current stage
    SELECT current_stage INTO v_from_stage
    FROM submission_workflow
    WHERE submission_id = p_submission_id;

    IF v_from_stage IS NULL THEN
        RAISE EXCEPTION 'Submission % not found in workflow', p_submission_id;
    END IF;

    -- Update workflow state
    UPDATE submission_workflow
    SET current_stage = p_to_stage,
        stage_entered_at = now(),
        updated_at = now()
    WHERE submission_id = p_submission_id;

    -- Log the transition
    INSERT INTO workflow_transitions (
        submission_id, from_stage, to_stage, trigger, trigger_details,
        triggered_by_user_id, triggered_by_user_name, triggered_by_system
    )
    VALUES (
        p_submission_id, v_from_stage, p_to_stage, p_trigger, p_trigger_details,
        p_user_id, p_user_name, p_user_id IS NULL
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql;


-- Function to record a vote and check if threshold is met
CREATE OR REPLACE FUNCTION record_vote(
    p_submission_id UUID,
    p_stage VARCHAR(50),
    p_user_id UUID,
    p_user_name VARCHAR(100),
    p_vote VARCHAR(20),
    p_comment TEXT DEFAULT NULL,
    p_reasons TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_required_votes INT;
    v_vote_counts JSONB;
    v_threshold_met BOOLEAN := false;
    v_winning_vote VARCHAR(20);
    v_result JSONB;
BEGIN
    -- Insert the vote
    INSERT INTO workflow_votes (submission_id, stage, user_id, user_name, vote, comment, reasons)
    VALUES (p_submission_id, p_stage, p_user_id, p_user_name, p_vote, p_comment, p_reasons)
    ON CONFLICT (submission_id, stage, user_id)
    DO UPDATE SET vote = p_vote, comment = p_comment, reasons = p_reasons, voted_at = now();

    -- Get required votes for this stage
    SELECT required_votes INTO v_required_votes
    FROM workflow_stages
    WHERE stage_key = p_stage;

    -- Count votes by type
    SELECT jsonb_object_agg(vote, cnt) INTO v_vote_counts
    FROM (
        SELECT vote, COUNT(*) as cnt
        FROM workflow_votes
        WHERE submission_id = p_submission_id AND stage = p_stage
        GROUP BY vote
    ) counts;

    -- Check if any vote type has met the threshold
    SELECT vote INTO v_winning_vote
    FROM workflow_votes
    WHERE submission_id = p_submission_id AND stage = p_stage
    GROUP BY vote
    HAVING COUNT(*) >= v_required_votes
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    v_threshold_met := v_winning_vote IS NOT NULL;

    -- Build result
    v_result := jsonb_build_object(
        'vote_recorded', true,
        'vote_counts', v_vote_counts,
        'required_votes', v_required_votes,
        'threshold_met', v_threshold_met,
        'winning_vote', v_winning_vote
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;


-- Function to claim a submission for UW work
CREATE OR REPLACE FUNCTION claim_submission(
    p_submission_id UUID,
    p_user_id UUID,
    p_user_name VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_stage VARCHAR(50);
    v_assigned_uw_id UUID;
BEGIN
    -- Check current state
    SELECT current_stage, assigned_uw_id
    INTO v_current_stage, v_assigned_uw_id
    FROM submission_workflow
    WHERE submission_id = p_submission_id;

    IF v_current_stage != 'uw_work' THEN
        RAISE EXCEPTION 'Submission is not in uw_work stage';
    END IF;

    IF v_assigned_uw_id IS NOT NULL THEN
        RAISE EXCEPTION 'Submission is already claimed';
    END IF;

    -- Claim it
    UPDATE submission_workflow
    SET assigned_uw_id = p_user_id,
        assigned_uw_name = p_user_name,
        assigned_at = now(),
        work_started_at = now(),
        updated_at = now()
    WHERE submission_id = p_submission_id;

    -- Log transition
    INSERT INTO workflow_transitions (
        submission_id, from_stage, to_stage, trigger,
        trigger_details, triggered_by_user_id, triggered_by_user_name
    )
    VALUES (
        p_submission_id, 'uw_work', 'uw_work', 'claimed',
        jsonb_build_object('claimed_by', p_user_name),
        p_user_id, p_user_name
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql;


-- Function to unclaim a submission
CREATE OR REPLACE FUNCTION unclaim_submission(
    p_submission_id UUID,
    p_user_id UUID,
    p_user_name VARCHAR(100)
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE submission_workflow
    SET assigned_uw_id = NULL,
        assigned_uw_name = NULL,
        assigned_at = NULL,
        work_started_at = NULL,
        updated_at = now()
    WHERE submission_id = p_submission_id
      AND assigned_uw_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot unclaim - not assigned to this user';
    END IF;

    -- Log transition
    INSERT INTO workflow_transitions (
        submission_id, from_stage, to_stage, trigger,
        trigger_details, triggered_by_user_id, triggered_by_user_name
    )
    VALUES (
        p_submission_id, 'uw_work', 'uw_work', 'unclaimed',
        jsonb_build_object('unclaimed_by', p_user_name),
        p_user_id, p_user_name
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 8. TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_submission_workflow_updated_at
    BEFORE UPDATE ON submission_workflow
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_stages_updated_at
    BEFORE UPDATE ON workflow_stages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 9. MIGRATE EXISTING SUBMISSIONS
-- ============================================================
-- Initialize workflow state for any existing submissions that don't have it

INSERT INTO submission_workflow (submission_id, current_stage, stage_entered_at, completed_at, final_decision)
SELECT
    s.id,
    CASE
        WHEN s.submission_status = 'declined' THEN 'complete'
        WHEN s.submission_status = 'quoted' THEN 'complete'
        ELSE 'intake'
    END,
    s.created_at,
    CASE
        WHEN s.submission_status IN ('declined', 'quoted') THEN s.updated_at
        ELSE NULL
    END,
    CASE
        WHEN s.submission_status = 'declined' THEN 'declined'
        WHEN s.submission_status = 'quoted' THEN 'quoted'
        ELSE NULL
    END
FROM submissions s
WHERE NOT EXISTS (
    SELECT 1 FROM submission_workflow sw WHERE sw.submission_id = s.id
);


-- ============================================================
-- DONE
-- ============================================================
-- Phase 1 tables are ready. Next steps:
-- 1. Add API endpoints for voting
-- 2. Build queue dashboard UI
-- 3. Add vote recording logic
-- 4. Implement stage transitions
