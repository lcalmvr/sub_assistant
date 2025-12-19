-- ============================================
-- Phase 1: Submission Lifecycle Management
-- Creates accounts table and status history for tracking
-- ============================================

-- Enable trigram extension for fuzzy matching (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 1. ACCOUNTS TABLE
-- Represents insured entities that persist across policy years
-- ============================================

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,  -- Lowercase, stripped for matching
    website TEXT,
    industry TEXT,
    naics_code TEXT,
    naics_title TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Index for exact match on normalized name
CREATE INDEX IF NOT EXISTS idx_accounts_normalized_name ON accounts(normalized_name);

-- GIN index for trigram similarity (fuzzy matching)
CREATE INDEX IF NOT EXISTS idx_accounts_name_trgm ON accounts USING GIN (normalized_name gin_trgm_ops);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_accounts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_updated_at ON accounts;
CREATE TRIGGER accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_accounts_timestamp();

-- ============================================
-- 2. LINK SUBMISSIONS TO ACCOUNTS
-- ============================================

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_account_id ON submissions(account_id);

-- ============================================
-- 3. SUBMISSION STATUS HISTORY TABLE
-- Audit trail for all status changes
-- ============================================

CREATE TABLE IF NOT EXISTS submission_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    old_outcome TEXT,
    new_outcome TEXT,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMP DEFAULT now(),
    notes TEXT
);

-- Index for fast retrieval by submission
CREATE INDEX IF NOT EXISTS idx_status_history_submission_id ON submission_status_history(submission_id);

-- Index for chronological queries
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON submission_status_history(changed_at);

-- ============================================
-- 4. EXPAND WORKFLOW STATUSES
-- Add 'received' and 'pending_info' states
-- ============================================

-- First migrate existing 'pending_decision' to 'received' (the new initial state)
UPDATE submissions
SET submission_status = 'received'
WHERE submission_status = 'pending_decision';

-- Note: Status validation is now handled at the application level
-- in core/submission_status.py via VALID_STATUS_OUTCOMES mapping
-- The database no longer enforces CHECK constraints on status values
-- to allow flexibility in workflow evolution

-- Drop old constraints if they exist (safe to run multiple times)
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS check_status_outcome_logic;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_submission_status_check;
