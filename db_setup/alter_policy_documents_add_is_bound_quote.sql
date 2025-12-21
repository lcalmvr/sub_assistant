-- Add is_bound_quote column to policy_documents
-- This column tracks which quote document is the "bound quote" that should
-- appear in the Policy Documents list alongside binders and endorsements.

ALTER TABLE policy_documents
ADD COLUMN IF NOT EXISTS is_bound_quote BOOLEAN DEFAULT FALSE;

-- Index for quick lookup of bound quotes
CREATE INDEX IF NOT EXISTS idx_policy_documents_bound_quote
ON policy_documents(submission_id)
WHERE is_bound_quote = TRUE;

-- Comment
COMMENT ON COLUMN policy_documents.is_bound_quote IS
'TRUE if this quote document is the bound quote that should appear in Policy Documents list';
