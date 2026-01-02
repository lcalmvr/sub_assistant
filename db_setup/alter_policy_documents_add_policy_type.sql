-- Add 'policy' to valid document types in policy_documents table

-- Drop the old constraint
ALTER TABLE policy_documents
DROP CONSTRAINT IF EXISTS valid_document_type;

-- Add new constraint including 'policy' type
ALTER TABLE policy_documents
ADD CONSTRAINT valid_document_type CHECK (
    document_type IN ('quote_primary', 'quote_excess', 'binder', 'policy')
);
