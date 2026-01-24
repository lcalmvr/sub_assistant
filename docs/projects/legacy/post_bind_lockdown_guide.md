# Post-Bind Lockdown Guide

Reference document for implementing field/section lockdown behavior after a policy is bound.

**Status:** Research complete, implementation tabled for future sprint

---

## Current Protections In Place

### 1. Quote Options Panel (`pages_components/quote_options_panel.py`)

**What's Protected:**
- When `is_bound=TRUE`, the `readonly` flag is automatically set (line 69-70)
- Bound option displays as card summary instead of editable dropdown
- Add Primary/Excess buttons are hidden in readonly mode
- Delete button is disabled for bound options
- Bind button changes to "Unbind" for the bound option

**How It Works:**
```python
# Line 67-70
bound_option = get_bound_option(sub_id)
is_bound = bound_option is not None
if is_bound:
    readonly = True
```

**Gap:** Unbind is still available - no permission check or audit trail

---

### 2. Coverages Panel (`pages_components/coverages_panel.py`)

**What's Protected:**
- Accepts `readonly` parameter that switches to read-only mode
- When readonly, coverage editor renders in "readonly" mode
- Bulk edit tab is hidden when `hide_bulk_edit=True`

**How It Works:**
```python
# Line 97
mode = "readonly" if readonly else "edit"
```

**Gap:** The `readonly` flag is passed from parent - no independent bound check

---

### 3. Tower Panel (`pages_components/tower_panel.py`)

**What's Protected:**
- Accepts `readonly` parameter
- When readonly, renders `_render_tower_cards_readonly()` instead of editable cards
- Action buttons (Add Layer, Bulk Add, Clear) are hidden in readonly mode
- Excess tower renders `_render_excess_tower_readonly()` for bound policies

**How It Works:**
```python
# Line 192-196
if readonly:
    _render_tower_cards_readonly()
    _render_tower_summary()
else:
    # Edit mode: full functionality
```

**Gap:** No independent bound check - relies on parent passing readonly

---

### 4. Premium/Limit/Retention Controls (`quote_options_panel.py`)

**What's Protected:**
- `_render_primary_premium_row1()` accepts readonly flag
- When readonly, displays as metrics instead of editable dropdowns
- Sold Premium displays as metric instead of text input

**How It Works:**
```python
# Line 534-546
if readonly:
    # Read-only mode: display values as metrics
    with col_limit:
        st.metric("Limit", limit_display)
```

**Gap:** Sold premium is shown read-only but no database-level protection

---

### 5. Quote Detail Modal (`quote_options_panel.py`)

**What's Protected:**
- Non-bound quotes render as read-only in modal
- Bound quotes allow coverage editing with "Save Changes & Revise Binder" button
- Changes to bound quote trigger new binder document generation

**How It Works:**
```python
# Line 1027-1030
render_coverages_panel(
    sub_id=sub_id,
    expanded=True,
    readonly=not is_bound_quote,  # Allow editing if bound quote
)
```

**Note:** This is intentional - coverage changes post-bind go through endorsement OR revised binder

---

### 6. Endorsements System (`endorsements_history_panel.py`)

**What's Protected:**
- Endorsements panel only shows for bound policies
- All policy changes go through endorsement workflow
- Endorsement types include: coverage_change, name_change, address_change, bor_change, etc.
- Issued endorsements can only be voided (not edited)
- Draft endorsements can be edited/deleted before issuing

**How It Works:**
```python
# Line 55-56
if not preloaded_data.get("has_bound_option"):
    return
```

---

### 7. Broker of Record Changes (`core/bor_management.py`)

**What's Protected:**
- BOR changes require endorsement
- History tracked in `broker_of_record_history` table
- Effective dates prevent overlapping BOR periods

---

### 8. Document Generation

**What's Protected:**
- Binder auto-generated on bind (`bind_option()` line 84-93)
- Quote document linked to policy documents list
- Documents have versioning and status (draft, issued, superseded, void)

---

## Gaps - What's NOT Protected

### Critical Gaps (High Priority)

| Area | Gap | Risk |
|------|-----|------|
| **Database Layer** | No constraints preventing direct UPDATE to bound tower | Data integrity |
| **API Layer** | No server-side validation on quote field updates | Bypass UI |
| **Unbind** | No permission check, no audit trail, no confirmation | Accidental unbind |
| **Rating Inputs** | `hazard_override`, `control_overrides` remain editable | Premium mismatch |
| **Submission Fields** | `account_id`, `broker_id` can be changed without endorsement | Policy mismatch |

### Medium Priority Gaps

| Area | Gap | Risk |
|------|-----|------|
| **Quote Name** | Can be edited on bound option | Cosmetic confusion |
| **Quote Notes** | Currently editable (may be intentional) | Low |
| **Other Quote Options** | Non-bound options remain fully editable | Cleanup needed? |
| **Policy Form** | `default_policy_form` on submission remains editable | Rating confusion |

### Low Priority Gaps

| Area | Gap | Risk |
|------|-----|------|
| **Submission Summary** | AI-generated summary can be regenerated | Low |
| **Document Regeneration** | Binder can be regenerated at will | Audit trail exists |

---

## Implementation Recommendations

### Phase 1: UI Lockdown (Low Effort)

1. **Add bound check to individual components**
   - Each panel should check `has_bound_option()` independently
   - Don't rely solely on parent passing `readonly`

2. **Disable Rating Tab inputs post-bind**
   - Policy form selector
   - Hazard override
   - Control overrides

3. **Add unbind confirmation dialog**
   - Require reason
   - Log to status_history table
   - Consider admin-only permission

4. **Lock submission-level fields**
   - `account_id` - require address_change endorsement
   - `broker_id` - require bor_change endorsement
   - `effective_date`/`expiration_date` - require extension endorsement

### Phase 2: Database Protection (Medium Effort)

1. **Add database trigger on `insurance_towers`**
```sql
CREATE OR REPLACE FUNCTION prevent_bound_tower_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_bound = TRUE THEN
        -- Allow only specific fields to be updated
        IF (NEW.quote_notes IS DISTINCT FROM OLD.quote_notes) OR
           (NEW.sold_premium IS DISTINCT FROM OLD.sold_premium) THEN
            RETURN NEW;
        ELSE
            RAISE EXCEPTION 'Cannot modify bound quote option';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

2. **Add delete protection**
```sql
CREATE OR REPLACE FUNCTION prevent_bound_tower_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_bound = TRUE THEN
        RAISE EXCEPTION 'Cannot delete bound quote option';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

3. **Add submission protection when bound**
```sql
-- Prevent changes to key submission fields when any tower is bound
CREATE OR REPLACE FUNCTION prevent_bound_submission_update()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM insurance_towers WHERE submission_id = OLD.id AND is_bound = TRUE) THEN
        -- Check if protected fields changed
        IF (NEW.account_id IS DISTINCT FROM OLD.account_id) OR
           (NEW.broker_id IS DISTINCT FROM OLD.broker_id) OR
           (NEW.default_policy_form IS DISTINCT FROM OLD.default_policy_form) THEN
            RAISE EXCEPTION 'Cannot modify protected fields on bound submission. Use endorsement.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Phase 3: Audit Trail (Medium Effort)

1. **Create lockdown_audit table**
```sql
CREATE TABLE lockdown_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'unbind', 'override_edit', etc.
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    performed_by VARCHAR(100),
    performed_at TIMESTAMP DEFAULT NOW()
);
```

2. **Log all override attempts**
3. **Surface in UI as warning for admins**

### Phase 4: Permission System (Higher Effort)

1. **Add user roles**
   - `underwriter` - standard access
   - `senior_uw` - can override some locks
   - `admin` - full override capability

2. **Add permission checks**
   - Unbind: senior_uw or admin
   - Direct field edits post-bind: admin only
   - Endorsement creation: underwriter+

---

## Field-by-Field Reference

### Bound Quote Option (`insurance_towers`)

| Field | Pre-Bind | Post-Bind | Via Endorsement |
|-------|----------|-----------|-----------------|
| `tower_json` | Edit | Locked | coverage_change |
| `coverages` | Edit | Locked | coverage_change |
| `policy_form` | Edit | Locked | N/A (new quote) |
| `primary_retention` | Edit | Locked | coverage_change |
| `endorsements` (array) | Edit | Locked | N/A |
| `aggregate_limit` | Edit | Locked | coverage_change |
| `sold_premium` | Edit | **Editable** | N/A |
| `quote_notes` | Edit | **Editable** | N/A |
| `is_bound` | N/A | Locked | unbind action |
| Delete action | Allowed | **Blocked** | N/A |

### Submission Fields

| Field | Pre-Bind | Post-Bind | Via Endorsement |
|-------|----------|-----------|-----------------|
| `account_id` | Edit | Locked | name_change |
| `broker_id` | Edit | Locked | bor_change |
| `broker_employment_id` | Edit | Locked | bor_change |
| `effective_date` | Edit | **Editable** | extension |
| `expiration_date` | Edit | **Editable** | extension |
| `default_policy_form` | Edit | Locked | N/A |
| `hazard_override` | Edit | Locked | N/A |
| `control_overrides` | Edit | Locked | N/A |
| `applicant_name` | Edit | **Editable** | name_change |
| Delete action | Allowed | **Blocked** | void/archive |

### Account Fields (via endorsement)

| Field | Pre-Bind | Post-Bind | Via Endorsement |
|-------|----------|-----------|-----------------|
| `name` | Edit | Locked | name_change |
| Address fields | Edit | Locked | address_change |

---

## Testing Checklist (For Implementation)

- [ ] Bind a quote option
- [ ] Verify Add Primary/Excess buttons hidden
- [ ] Verify Delete button disabled on bound option
- [ ] Verify coverage dropdowns are read-only
- [ ] Verify limit/retention are read-only
- [ ] Verify tower editing is disabled
- [ ] Verify Rating tab inputs are locked
- [ ] Attempt unbind - verify confirmation required
- [ ] Attempt direct DB update - verify trigger blocks
- [ ] Create coverage_change endorsement - verify allowed
- [ ] Create bor_change endorsement - verify allowed
- [ ] Verify audit trail captures override attempts

---

## Related Files

**Core:**
- `core/bound_option.py` - bind/unbind logic
- `core/endorsement_management.py` - endorsement CRUD
- `core/bor_management.py` - broker of record tracking

**UI Components:**
- `pages_components/quote_options_panel.py` - main quote UI
- `pages_components/coverages_panel.py` - coverage editing
- `pages_components/tower_panel.py` - tower structure
- `pages_components/endorsements_history_panel.py` - endorsement UI

**Database:**
- `db_setup/create_binder_tables.sql` - insurance_towers schema
- `db_setup/create_endorsements_table.sql` - endorsements schema
- `db_setup/create_broker_auth_tables.sql` - broker history

---

*Document created: 2025-12-26*
*Last updated: 2025-12-26*
