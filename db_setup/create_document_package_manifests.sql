-- Document Package Manifests Table
-- Tracks which library documents were included in generated packages
-- Enables regeneration of packages with the same content

CREATE TABLE IF NOT EXISTS document_package_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to the generated document in policy_documents table
    policy_document_id UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,

    -- Package configuration
    package_type TEXT NOT NULL,             -- quote_only, full_package, custom

    -- Manifest - ordered list of library documents included
    -- Format: [{library_id, code, title, version, sort_order}, ...]
    manifest JSONB NOT NULL DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_package_type CHECK (
        package_type IN ('quote_only', 'full_package', 'custom')
    )
);

-- Index for looking up manifests by policy document
CREATE INDEX IF NOT EXISTS idx_document_package_manifests_policy_doc
    ON document_package_manifests(policy_document_id);

-- Comments for documentation
COMMENT ON TABLE document_package_manifests IS 'Tracks which library documents were included in generated packages for regeneration';
COMMENT ON COLUMN document_package_manifests.manifest IS 'Ordered array of library document references: [{library_id, code, title, version, sort_order}]';
COMMENT ON COLUMN document_package_manifests.package_type IS 'Type of package: quote_only (no library docs), full_package (all selected), custom (specific selection)';
