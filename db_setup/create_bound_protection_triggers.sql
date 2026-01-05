-- =============================================================================
-- Bound Quote Protection Triggers
--
-- Prevents direct SQL modifications to bound quotes and related submission fields.
-- This provides database-level protection even if API is bypassed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trigger function: Prevent modifications to bound quote protected fields
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_bound_quote_modification()
RETURNS TRIGGER AS $$
DECLARE
    protected_fields TEXT[] := ARRAY[
        'tower_json',
        'coverages',
        'sublimits',
        'endorsements',
        'subjectivities',
        'retro_schedule',
        'primary_retention',
        'policy_form',
        'position'
    ];
    editable_fields TEXT[] := ARRAY[
        'sold_premium',
        'quote_notes',
        'option_descriptor',
        'updated_at'
    ];
    field_name TEXT;
    old_val TEXT;
    new_val TEXT;
    has_protected_change BOOLEAN := FALSE;
BEGIN
    -- Only check if the quote is currently bound
    IF OLD.is_bound = TRUE THEN
        -- Check each protected field for changes
        FOREACH field_name IN ARRAY protected_fields LOOP
            EXECUTE format('SELECT ($1).%I::TEXT, ($2).%I::TEXT', field_name, field_name)
                INTO old_val, new_val
                USING OLD, NEW;

            -- Check if field changed (handle NULL comparisons)
            IF (old_val IS DISTINCT FROM new_val) THEN
                has_protected_change := TRUE;
                EXIT;  -- Found a protected change, no need to check more
            END IF;
        END LOOP;

        -- If a protected field changed, raise an error
        IF has_protected_change THEN
            RAISE EXCEPTION 'Cannot modify protected fields on bound quote. Unbind first or use endorsement workflow. Quote ID: %', OLD.id
                USING ERRCODE = 'P0001',
                      HINT = 'Protected fields: tower_json, coverages, sublimits, endorsements, subjectivities, retro_schedule, primary_retention, policy_form, position';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_bound_quote_modification() IS
'Prevents modifications to protected fields on bound quotes. Allows editable fields like sold_premium, quote_notes, option_descriptor.';


-- -----------------------------------------------------------------------------
-- 2. Trigger function: Prevent deletion of bound quotes
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_bound_quote_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_bound = TRUE THEN
        RAISE EXCEPTION 'Cannot delete bound quote. Unbind first. Quote ID: %', OLD.id
            USING ERRCODE = 'P0001',
                  HINT = 'Use the unbind endpoint to remove the bound status before deleting.';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_bound_quote_deletion() IS
'Prevents deletion of bound quotes. Must unbind first.';


-- -----------------------------------------------------------------------------
-- 3. Trigger function: Prevent submission field changes when bound
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_bound_submission_modification()
RETURNS TRIGGER AS $$
DECLARE
    protected_fields TEXT[] := ARRAY[
        'hazard_override',
        'control_overrides',
        'default_policy_form',
        'default_retroactive_date',
        'account_id',
        'broker_org_id',
        'broker_employment_id',
        'broker_email'
    ];
    field_name TEXT;
    old_val TEXT;
    new_val TEXT;
    has_bound_quote BOOLEAN;
    has_protected_change BOOLEAN := FALSE;
    changed_field TEXT := NULL;
BEGIN
    -- Check if this submission has any bound quotes
    SELECT EXISTS(
        SELECT 1 FROM insurance_towers
        WHERE submission_id = OLD.id AND is_bound = TRUE
    ) INTO has_bound_quote;

    -- Only enforce if there's a bound quote
    IF has_bound_quote THEN
        -- Check each protected field for changes
        FOREACH field_name IN ARRAY protected_fields LOOP
            EXECUTE format('SELECT ($1).%I::TEXT, ($2).%I::TEXT', field_name, field_name)
                INTO old_val, new_val
                USING OLD, NEW;

            -- Check if field changed (handle NULL comparisons)
            IF (old_val IS DISTINCT FROM new_val) THEN
                has_protected_change := TRUE;
                changed_field := field_name;
                EXIT;
            END IF;
        END LOOP;

        IF has_protected_change THEN
            RAISE EXCEPTION 'Cannot modify % while a policy is bound. Unbind first. Submission ID: %', changed_field, OLD.id
                USING ERRCODE = 'P0001',
                      HINT = 'Use the unbind endpoint to remove the bound status, or use endorsements for broker/account changes.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_bound_submission_modification() IS
'Prevents modifications to rating/broker/account fields on submissions with bound quotes.';


-- -----------------------------------------------------------------------------
-- 4. Create the triggers
-- -----------------------------------------------------------------------------

-- Drop existing triggers if they exist (for idempotent runs)
DROP TRIGGER IF EXISTS bound_quote_protection_update ON insurance_towers;
DROP TRIGGER IF EXISTS bound_quote_protection_delete ON insurance_towers;
DROP TRIGGER IF EXISTS bound_submission_protection_update ON submissions;

-- Trigger: Prevent updates to protected fields on bound quotes
CREATE TRIGGER bound_quote_protection_update
    BEFORE UPDATE ON insurance_towers
    FOR EACH ROW
    EXECUTE FUNCTION prevent_bound_quote_modification();

-- Trigger: Prevent deletion of bound quotes
CREATE TRIGGER bound_quote_protection_delete
    BEFORE DELETE ON insurance_towers
    FOR EACH ROW
    EXECUTE FUNCTION prevent_bound_quote_deletion();

-- Trigger: Prevent submission changes when bound
CREATE TRIGGER bound_submission_protection_update
    BEFORE UPDATE ON submissions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_bound_submission_modification();


-- -----------------------------------------------------------------------------
-- 5. Helper function to bypass triggers (for admin/emergency use only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_force_unbind(quote_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Temporarily disable the trigger
    ALTER TABLE insurance_towers DISABLE TRIGGER bound_quote_protection_update;

    -- Perform the unbind
    UPDATE insurance_towers
    SET is_bound = FALSE, bound_at = NULL, bound_by = NULL
    WHERE id = quote_id;

    -- Re-enable the trigger
    ALTER TABLE insurance_towers ENABLE TRIGGER bound_quote_protection_update;

    RAISE NOTICE 'Force unbind completed for quote %', quote_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_force_unbind(UUID) IS
'Emergency function to force unbind a quote. Bypasses triggers. Use with caution.';

-- Revoke execute from public, only allow explicit grants
REVOKE EXECUTE ON FUNCTION admin_force_unbind(UUID) FROM PUBLIC;


-- -----------------------------------------------------------------------------
-- 6. Verification queries (run after applying migration)
-- -----------------------------------------------------------------------------

-- Verify triggers are created
DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers
    WHERE trigger_name IN (
        'bound_quote_protection_update',
        'bound_quote_protection_delete',
        'bound_submission_protection_update'
    );

    IF trigger_count = 3 THEN
        RAISE NOTICE 'SUCCESS: All 3 bound protection triggers created';
    ELSE
        RAISE WARNING 'WARNING: Expected 3 triggers, found %', trigger_count;
    END IF;
END $$;
