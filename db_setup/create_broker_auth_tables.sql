-- Broker Portal Authentication Tables
-- ===================================
-- Creates tables for broker authentication, sessions, magic links, and designees

-- Broker Sessions: Active login sessions
CREATE TABLE IF NOT EXISTS broker_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    -- Support both broker systems: broker_contacts.id or brkr_employments.employment_id
    broker_contact_id UUID,  -- References broker_contacts.id
    broker_employment_id UUID,  -- References brkr_employments.employment_id
    email TEXT NOT NULL,  -- Denormalized for quick lookups
    created_at TIMESTAMP DEFAULT now(),
    expires_at TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMP DEFAULT now()
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_broker_sessions_token ON broker_sessions(token);
CREATE INDEX IF NOT EXISTS idx_broker_sessions_email ON broker_sessions(email);
CREATE INDEX IF NOT EXISTS idx_broker_sessions_expires ON broker_sessions(expires_at);

-- Broker Magic Links: One-time login tokens
CREATE TABLE IF NOT EXISTS broker_magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT now(),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
);

-- Index for token validation
CREATE INDEX IF NOT EXISTS idx_broker_magic_links_token ON broker_magic_links(token);
CREATE INDEX IF NOT EXISTS idx_broker_magic_links_email ON broker_magic_links(email);
CREATE INDEX IF NOT EXISTS idx_broker_magic_links_expires ON broker_magic_links(expires_at);

-- Broker Designees: Allow brokers to grant access to other users
CREATE TABLE IF NOT EXISTS broker_designees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Owner: the broker granting access (broker_contact_id or broker_employment_id)
    owner_contact_id UUID,  -- References broker_contacts.id
    owner_employment_id UUID,  -- References brkr_employments.employment_id
    -- Designee: the user receiving access
    designee_contact_id UUID,  -- References broker_contacts.id
    designee_employment_id UUID,  -- References brkr_employments.employment_id
    can_view_submissions BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT now(),
    created_by TEXT,  -- Who created this designee relationship
    UNIQUE(owner_contact_id, designee_contact_id),
    UNIQUE(owner_employment_id, designee_employment_id),
    -- Ensure at least one owner and one designee is set
    CHECK (
        (owner_contact_id IS NOT NULL OR owner_employment_id IS NOT NULL) AND
        (designee_contact_id IS NOT NULL OR designee_employment_id IS NOT NULL)
    )
);

-- Indexes for permission checks
CREATE INDEX IF NOT EXISTS idx_broker_designees_owner_contact ON broker_designees(owner_contact_id);
CREATE INDEX IF NOT EXISTS idx_broker_designees_owner_employment ON broker_designees(owner_employment_id);
CREATE INDEX IF NOT EXISTS idx_broker_designees_designee_contact ON broker_designees(designee_contact_id);
CREATE INDEX IF NOT EXISTS idx_broker_designees_designee_employment ON broker_designees(designee_employment_id);

-- Cleanup function for expired sessions (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM broker_sessions WHERE expires_at < now();
    DELETE FROM broker_magic_links WHERE expires_at < now() AND used_at IS NULL;
END;
$$ LANGUAGE plpgsql;



