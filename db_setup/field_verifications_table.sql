-- Field Verifications Table
-- Tracks UW verification status for key submission fields
-- Part of the Unified Extraction Panel feature

-- Create the table
CREATE TABLE IF NOT EXISTS field_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'corrected')),
  original_value TEXT,
  corrected_value TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, field_name)
);

-- Index for fast lookups by submission
CREATE INDEX IF NOT EXISTS idx_field_verifications_submission
ON field_verifications(submission_id);

-- Comment for documentation
COMMENT ON TABLE field_verifications IS 'Tracks UW verification status for key extracted fields';
COMMENT ON COLUMN field_verifications.field_name IS 'Field identifier: company_name, revenue, business_description, website, broker, policy_period, industry';
COMMENT ON COLUMN field_verifications.status IS 'pending=not reviewed, confirmed=verified correct, corrected=UW made correction';
COMMENT ON COLUMN field_verifications.original_value IS 'AI-extracted value before any correction';
COMMENT ON COLUMN field_verifications.corrected_value IS 'UW-corrected value (only set if status=corrected)';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_field_verifications_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS field_verifications_updated_at ON field_verifications;
CREATE TRIGGER field_verifications_updated_at
  BEFORE UPDATE ON field_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_field_verifications_timestamp();
