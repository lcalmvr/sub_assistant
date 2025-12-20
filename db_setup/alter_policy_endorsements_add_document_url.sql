-- Add document_url column to store generated endorsement PDF URL
ALTER TABLE policy_endorsements
ADD COLUMN IF NOT EXISTS document_url TEXT;

COMMENT ON COLUMN policy_endorsements.document_url IS 'URL to the generated endorsement PDF document';
