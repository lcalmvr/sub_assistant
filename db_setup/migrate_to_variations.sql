-- Quote Variations Migration
-- Transforms flat quote options into hierarchical Structure/Variation model
-- Run with: psql $DATABASE_URL -f db_setup/migrate_to_variations.sql

BEGIN;

-- ============================================================================
-- PHASE 1: Add new columns to insurance_towers
-- ============================================================================

-- Link variation to parent structure (NULL = this row IS a structure/parent)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS variation_parent_id UUID REFERENCES insurance_towers(id) ON DELETE CASCADE;

-- Variation display label ('A', 'B', 'C', etc.)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS variation_label CHAR(1);

-- Human-readable variation name ("Standard Annual", "18-Month Extended", etc.)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS variation_name TEXT;

-- Policy term in months (for this variation)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS period_months INTEGER DEFAULT 12;

-- Date overrides (NULL = inherit from submission)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS effective_date_override DATE;

ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS expiration_date_override DATE;

-- Commission override (NULL = use broker default)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS commission_override DECIMAL(5,2);

-- Dates TBD flag (when dates are not yet determined)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS dates_tbd BOOLEAN DEFAULT FALSE;

-- Structure-level defaults (only meaningful for parent rows)
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS default_term_months INTEGER DEFAULT 12;

-- ============================================================================
-- PHASE 2: Create indexes for efficient querying
-- ============================================================================

-- Index for finding variations of a structure
CREATE INDEX IF NOT EXISTS idx_towers_variation_parent
ON insurance_towers(variation_parent_id)
WHERE variation_parent_id IS NOT NULL;

-- Index for finding parent structures in a submission
CREATE INDEX IF NOT EXISTS idx_towers_parent_structures
ON insurance_towers(submission_id)
WHERE variation_parent_id IS NULL;

-- ============================================================================
-- PHASE 3: Migrate existing data
-- Existing quotes become structures with a single 'A' variation
-- The row itself serves as both structure AND its default variation
-- ============================================================================

UPDATE insurance_towers
SET
    variation_label = 'A',
    variation_name = COALESCE(option_descriptor, 'Standard'),
    period_months = 12,
    default_term_months = 12
WHERE variation_parent_id IS NULL
  AND variation_label IS NULL;

-- ============================================================================
-- PHASE 4: Add helper view for querying structures with variations
-- ============================================================================

CREATE OR REPLACE VIEW quote_structures_view AS
SELECT
    s.id as structure_id,
    s.submission_id,
    s.quote_name as structure_name,
    s.position,
    s.tower_json,
    s.coverages,
    s.policy_form,
    s.retro_schedule,
    s.primary_retention,
    s.default_term_months,
    s.created_at as structure_created_at,
    -- Aggregate variations as JSONB array
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', v.id,
                'label', COALESCE(v.variation_label, s.variation_label, 'A'),
                'name', COALESCE(v.variation_name, s.variation_name, 'Standard'),
                'period_months', COALESCE(v.period_months, s.period_months, 12),
                'effective_date_override', v.effective_date_override,
                'expiration_date_override', v.expiration_date_override,
                'commission_override', v.commission_override,
                'dates_tbd', COALESCE(v.dates_tbd, FALSE),
                'sold_premium', v.sold_premium,
                'technical_premium', v.technical_premium,
                'risk_adjusted_premium', v.risk_adjusted_premium,
                'is_bound', v.is_bound,
                'bound_at', v.bound_at,
                'created_at', v.created_at
            ) ORDER BY COALESCE(v.variation_label, s.variation_label, 'A')
        ) FILTER (WHERE v.id IS NOT NULL),
        -- If no child variations, treat parent row as single variation
        jsonb_build_array(
            jsonb_build_object(
                'id', s.id,
                'label', COALESCE(s.variation_label, 'A'),
                'name', COALESCE(s.variation_name, 'Standard'),
                'period_months', COALESCE(s.period_months, 12),
                'effective_date_override', s.effective_date_override,
                'expiration_date_override', s.expiration_date_override,
                'commission_override', s.commission_override,
                'dates_tbd', COALESCE(s.dates_tbd, FALSE),
                'sold_premium', s.sold_premium,
                'technical_premium', s.technical_premium,
                'risk_adjusted_premium', s.risk_adjusted_premium,
                'is_bound', s.is_bound,
                'bound_at', s.bound_at,
                'created_at', s.created_at
            )
        )
    ) as variations
FROM insurance_towers s
LEFT JOIN insurance_towers v ON v.variation_parent_id = s.id
WHERE s.variation_parent_id IS NULL
GROUP BY s.id;

-- ============================================================================
-- PHASE 5: Add constraint - only one bound variation per structure
-- ============================================================================

-- Drop existing constraint if it exists (may conflict)
DROP INDEX IF EXISTS idx_one_bound_per_submission;

-- New constraint: only one bound quote per structure (uses parent_id or self)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_bound_per_structure
ON insurance_towers(COALESCE(variation_parent_id, id))
WHERE is_bound = TRUE;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to verify migration)
-- ============================================================================

-- Check that all existing quotes have variation_label set
-- SELECT COUNT(*) as total, COUNT(variation_label) as with_label FROM insurance_towers WHERE variation_parent_id IS NULL;

-- View structures with variations
-- SELECT * FROM quote_structures_view LIMIT 5;

-- Check for any orphaned variations (should be 0)
-- SELECT COUNT(*) FROM insurance_towers v WHERE v.variation_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM insurance_towers s WHERE s.id = v.variation_parent_id);
