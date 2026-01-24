-- ============================================================================
-- Backfill Premium Model
-- ============================================================================
-- Optional migration to explicitly set annual_premium, actual_premium, and
-- premium_basis fields on existing layer data.
--
-- This is NOT required - the application code handles missing fields gracefully.
-- Run this if you want cleaner, more explicit data.
--
-- Safe to run multiple times - only updates layers missing the new fields.
-- ============================================================================

-- Preview: Count layers that would be updated
SELECT
  COUNT(*) as total_towers,
  SUM(jsonb_array_length(tower_json)) as total_layers,
  SUM((
    SELECT COUNT(*)
    FROM jsonb_array_elements(tower_json) AS layer
    WHERE NOT (layer ? 'annual_premium')
  )) as layers_to_update
FROM insurance_towers
WHERE tower_json IS NOT NULL
  AND jsonb_array_length(tower_json) > 0;


-- ============================================================================
-- Backfill: Set annual_premium = actual_premium = premium for existing layers
-- ============================================================================

UPDATE insurance_towers
SET
  tower_json = (
    SELECT jsonb_agg(
      CASE
        WHEN layer ? 'annual_premium' THEN layer
        ELSE layer || jsonb_build_object(
          'annual_premium', layer->'premium',
          'actual_premium', layer->'premium',
          'premium_basis', 'annual'
        )
      END
      ORDER BY ordinality
    )
    FROM jsonb_array_elements(tower_json) WITH ORDINALITY AS t(layer, ordinality)
  ),
  updated_at = NOW()
WHERE tower_json IS NOT NULL
  AND jsonb_array_length(tower_json) > 0
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(tower_json) AS l
    WHERE NOT (l ? 'annual_premium')
  );


-- ============================================================================
-- Verification
-- ============================================================================

SELECT
  COUNT(*) as total_towers,
  SUM(jsonb_array_length(tower_json)) as total_layers,
  SUM((
    SELECT COUNT(*)
    FROM jsonb_array_elements(tower_json) AS layer
    WHERE layer ? 'annual_premium'
  )) as layers_with_annual
FROM insurance_towers
WHERE tower_json IS NOT NULL
  AND jsonb_array_length(tower_json) > 0;
