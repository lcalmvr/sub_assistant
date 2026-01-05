-- =============================================================================
-- Bind/Unbind Audit Log
--
-- Tracks all bind and unbind actions for compliance and debugging.
-- Records who, when, why, and what changed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Audit table for bind/unbind actions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bind_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What was affected
    quote_id UUID NOT NULL,
    submission_id UUID NOT NULL,
    quote_name VARCHAR(255),
    applicant_name VARCHAR(500),

    -- Action details
    action VARCHAR(20) NOT NULL,  -- 'bind', 'unbind'
    reason TEXT,                   -- Required for unbind, optional for bind

    -- Who performed the action
    performed_by VARCHAR(255),     -- User identifier
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Snapshot of key data at time of action
    snapshot JSONB,               -- Captures premium, dates, etc.

    -- Request context
    request_source VARCHAR(50),   -- 'api', 'streamlit', 'admin_bypass'
    ip_address VARCHAR(45),       -- For security audit

    -- Constraints
    CONSTRAINT bind_audit_action_check CHECK (action IN ('bind', 'unbind'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bind_audit_quote ON bind_audit_log(quote_id);
CREATE INDEX IF NOT EXISTS idx_bind_audit_submission ON bind_audit_log(submission_id);
CREATE INDEX IF NOT EXISTS idx_bind_audit_action ON bind_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_bind_audit_performed_at ON bind_audit_log(performed_at DESC);

-- Comments
COMMENT ON TABLE bind_audit_log IS 'Audit trail for all bind and unbind actions';
COMMENT ON COLUMN bind_audit_log.action IS 'Type of action: bind or unbind';
COMMENT ON COLUMN bind_audit_log.reason IS 'Required explanation for unbind actions';
COMMENT ON COLUMN bind_audit_log.snapshot IS 'JSON snapshot of quote state at time of action';
COMMENT ON COLUMN bind_audit_log.request_source IS 'Where the request originated: api, streamlit, admin_bypass';


-- -----------------------------------------------------------------------------
-- 2. Function to log bind action
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_bind_action(
    p_quote_id UUID,
    p_performed_by VARCHAR(255) DEFAULT 'system',
    p_request_source VARCHAR(50) DEFAULT 'api'
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
    v_snapshot JSONB;
    v_quote RECORD;
BEGIN
    -- Get quote and submission details
    SELECT
        t.id, t.submission_id, t.quote_name, t.sold_premium, t.primary_retention,
        t.policy_form, t.tower_json, s.applicant_name, s.effective_date, s.expiration_date
    INTO v_quote
    FROM insurance_towers t
    JOIN submissions s ON t.submission_id = s.id
    WHERE t.id = p_quote_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;

    -- Build snapshot
    v_snapshot := jsonb_build_object(
        'sold_premium', v_quote.sold_premium,
        'primary_retention', v_quote.primary_retention,
        'policy_form', v_quote.policy_form,
        'effective_date', v_quote.effective_date,
        'expiration_date', v_quote.expiration_date,
        'tower_layers', jsonb_array_length(COALESCE(v_quote.tower_json::jsonb, '[]'::jsonb))
    );

    -- Insert audit record
    INSERT INTO bind_audit_log (
        quote_id, submission_id, quote_name, applicant_name,
        action, performed_by, request_source, snapshot
    ) VALUES (
        p_quote_id, v_quote.submission_id, v_quote.quote_name, v_quote.applicant_name,
        'bind', p_performed_by, p_request_source, v_snapshot
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_bind_action IS 'Log a bind action to the audit table';


-- -----------------------------------------------------------------------------
-- 3. Function to log unbind action
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_unbind_action(
    p_quote_id UUID,
    p_reason TEXT,
    p_performed_by VARCHAR(255) DEFAULT 'system',
    p_request_source VARCHAR(50) DEFAULT 'api'
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
    v_snapshot JSONB;
    v_quote RECORD;
BEGIN
    -- Reason is required for unbind
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'Reason is required for unbind actions';
    END IF;

    -- Get quote and submission details
    SELECT
        t.id, t.submission_id, t.quote_name, t.sold_premium, t.primary_retention,
        t.policy_form, t.tower_json, t.bound_at, t.bound_by,
        s.applicant_name, s.effective_date, s.expiration_date
    INTO v_quote
    FROM insurance_towers t
    JOIN submissions s ON t.submission_id = s.id
    WHERE t.id = p_quote_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;

    -- Build snapshot (includes when it was originally bound)
    v_snapshot := jsonb_build_object(
        'sold_premium', v_quote.sold_premium,
        'primary_retention', v_quote.primary_retention,
        'policy_form', v_quote.policy_form,
        'effective_date', v_quote.effective_date,
        'expiration_date', v_quote.expiration_date,
        'tower_layers', jsonb_array_length(COALESCE(v_quote.tower_json::jsonb, '[]'::jsonb)),
        'originally_bound_at', v_quote.bound_at,
        'originally_bound_by', v_quote.bound_by
    );

    -- Insert audit record
    INSERT INTO bind_audit_log (
        quote_id, submission_id, quote_name, applicant_name,
        action, reason, performed_by, request_source, snapshot
    ) VALUES (
        p_quote_id, v_quote.submission_id, v_quote.quote_name, v_quote.applicant_name,
        'unbind', p_reason, p_performed_by, p_request_source, v_snapshot
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_unbind_action IS 'Log an unbind action to the audit table. Reason is required.';


-- -----------------------------------------------------------------------------
-- 4. View for easy querying of recent actions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW bind_audit_recent AS
SELECT
    ba.id,
    ba.action,
    ba.quote_name,
    ba.applicant_name,
    ba.reason,
    ba.performed_by,
    ba.performed_at,
    ba.request_source,
    ba.snapshot->>'sold_premium' as premium,
    ba.snapshot->>'effective_date' as effective_date,
    ba.quote_id,
    ba.submission_id
FROM bind_audit_log ba
ORDER BY ba.performed_at DESC;

COMMENT ON VIEW bind_audit_recent IS 'Recent bind/unbind actions for dashboard display';


-- -----------------------------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bind_audit_log') THEN
        RAISE NOTICE 'SUCCESS: bind_audit_log table created';
    ELSE
        RAISE WARNING 'WARNING: bind_audit_log table not found';
    END IF;
END $$;
