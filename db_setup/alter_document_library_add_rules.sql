-- Add auto_attach_rules and fill_in_mappings columns to document_library
-- These enable database-driven endorsement automation

-- auto_attach_rules: JSONB defining when an endorsement should auto-attach
-- Examples:
-- {"condition": "has_sublimits"} - attach when sublimits exist
-- {"condition": "position", "value": "excess"} - attach for excess quotes
-- {"condition": "follow_form", "value": true} - attach when follow_form is true

-- fill_in_mappings: JSONB mapping placeholder variables to context fields
-- Examples:
-- {"{{sublimits_schedule}}": "sublimits"} - render sublimits as table
-- {"{{insured_name}}": "insured_name"} - simple field mapping

ALTER TABLE document_library
ADD COLUMN IF NOT EXISTS auto_attach_rules JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fill_in_mappings JSONB DEFAULT NULL;

-- Add comment documentation
COMMENT ON COLUMN document_library.auto_attach_rules IS 'JSONB rules for when endorsement should auto-attach. E.g., {"condition": "has_sublimits"}';
COMMENT ON COLUMN document_library.fill_in_mappings IS 'JSONB mapping of placeholders to context fields. E.g., {"{{sublimits_schedule}}": "sublimits"}';

-- Create index for efficient rule-based queries
CREATE INDEX IF NOT EXISTS idx_document_library_auto_attach
    ON document_library USING gin(auto_attach_rules) WHERE auto_attach_rules IS NOT NULL;

-- Update existing endorsements with their rules

-- END-DROP-001: Auto-attach when sublimits exist (for excess position)
UPDATE document_library
SET auto_attach_rules = '{"condition": "has_sublimits", "position": "excess"}'::jsonb,
    fill_in_mappings = '{"{{sublimits_schedule}}": "sublimits"}'::jsonb
WHERE code = 'END-DROP-001';

-- EXC-001: Auto-attach for excess follow form (if it exists)
UPDATE document_library
SET auto_attach_rules = '{"condition": "follow_form", "value": true, "position": "excess"}'::jsonb
WHERE code = 'EXC-001';
