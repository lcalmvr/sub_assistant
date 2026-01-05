# Binding Controls Specification

This document tracks pre-binding validation requirements and post-binding field restrictions for the underwriting system.

## Overview

Binding a quote creates a policy commitment. This requires:
1. **Pre-bind validation**: Ensure all required data exists before allowing bind
2. **Post-bind lockdown**: Prevent unauthorized changes to bound policies
3. **Endorsement workflow**: Allow controlled changes through proper channels

---

## Implementation Checklist

### Phase 1: Pre-Bind Validation ✅ COMPLETE

| Task | Status | File | Notes |
|------|--------|------|-------|
| Create validation function | ✅ | `core/bind_validation.py` | Central validation logic |
| Add API endpoint validation | ✅ | `api/main.py` | Block bind if validation fails |
| Return detailed errors | ✅ | `api/main.py` | List all missing requirements |
| Frontend error display | ✅ | `frontend/src/pages/QuotePage.jsx` | Show validation errors to user |
| Add "ready to bind" indicator | ⬜ | `frontend/src/pages/QuotePage.jsx` | Visual status before bind attempt |

#### Required Fields for Binding

| Category | Field | Required? | Validation Rule |
|----------|-------|-----------|-----------------|
| **Account** | | | |
| | `applicant_name` | ✅ Yes | Non-empty string |
| | `mailing_address` | ✅ Yes | Non-empty string |
| | `state` | ✅ Yes | Valid 2-letter state code |
| **Broker** | | | |
| | `broker_employment_id` | ✅ Yes | Must reference valid broker |
| **Policy Dates** | | | |
| | `effective_date` | ✅ Yes | Valid date |
| | `expiration_date` | ✅ Yes | Valid date, after effective |
| **Quote Structure** | | | |
| | Tower layers | ✅ Yes | At least one layer with limit > 0 |
| | Primary retention | ✅ Yes | retention > 0 for primary layer |
| | Premium | ⚠️ Warning | Warn if $0, don't block |
| **Coverages** | | | |
| | At least one coverage | ✅ Yes | One coverage must be included |
| **Subjectivities** | | | |
| | Pre-bind subjectivities | ⚠️ Warning | Warn if unresolved, don't block |

---

### Phase 2: Post-Bind UI Lockdown ✅ COMPLETE

| Task | Status | File | Notes |
|------|--------|------|-------|
| Lock Rating tab inputs | ✅ | `submissions.py` | hazard_override, control_overrides, retro date |
| Lock Account tab edits | ✅ | `details_panel.py` | Edit mode blocked, unlink hidden |
| Lock broker changes | ✅ | `details_panel.py` | Part of account edit lockdown |
| Add "locked" visual indicators | ✅ | Various | Info message on locked tabs |
| Enhance unbind confirmation | ✅ | `policy_panel.py` | Requires reason, shows consequences |

#### Post-Bind Field Status

| Tab | Field | Current State | Target State |
|-----|-------|---------------|--------------|
| **Account** | | | |
| | `applicant_name` | Editable | Locked (name_change endorsement) |
| | `mailing_address` | Editable | Locked (address_change endorsement) |
| | `business_description` | Editable | Locked |
| **UW** | | | |
| | All fields | Editable | Locked (reference only) |
| **Rating** | | | |
| | `hazard_override` | Editable | **Locked** |
| | `control_overrides` | Editable | **Locked** |
| | `default_policy_form` | Editable | **Locked** |
| **Quote** | | | |
| | Tower structure | Locked (UI) | Locked (UI + API) |
| | Coverages | Locked (UI) | Locked (UI + API) |
| | `sold_premium` | Editable | Editable (intentional) |
| | `quote_notes` | Editable | Editable (intentional) |

---

### Phase 3: API Protection ✅ COMPLETE

| Task | Status | File | Notes |
|------|--------|------|-------|
| Block quote updates when bound | ✅ | `api/main.py:2555` | Protected fields return 403 |
| Block apply-to-all when bound | ✅ | `api/main.py:2625` | Blocked if any quote bound |
| Block delete quote when bound | ✅ | `api/main.py:2735` | Return 403 |
| Block submission fields when bound | ✅ | `api/main.py:254` | Rating/broker fields protected |
| Add unbind permission check | ⬜ | `api/main.py` | Requires auth system |
| Log bind/unbind actions | ⬜ | `api/main.py` | Audit trail (Phase 5) |

#### Protected Quote Fields (return 403 when bound)
- `tower_json`, `coverages`, `sublimits`
- `endorsements`, `subjectivities`, `retro_schedule`
- `primary_retention`, `aggregate_limit`, `policy_form`, `position`

#### Editable Quote Fields (allowed when bound)
- `sold_premium`, `quote_notes`, `option_descriptor`

#### Protected Submission Fields (return 403 when bound)
- `hazard_override`, `control_overrides`, `default_policy_form`
- `default_retroactive_date`
- `account_id`, `broker_org_id`, `broker_employment_id`, `broker_email`

---

### Phase 4: Database Protection ✅ COMPLETE

| Task | Status | File | Notes |
|------|--------|------|-------|
| Create bound update trigger | ✅ | `db_setup/create_bound_protection_triggers.sql` | Blocks protected fields |
| Create bound delete trigger | ✅ | `db_setup/create_bound_protection_triggers.sql` | Blocks DELETE on bound |
| Create submission trigger | ✅ | `db_setup/create_bound_protection_triggers.sql` | Blocks rating/broker fields |
| Add admin bypass function | ✅ | `db_setup/create_bound_protection_triggers.sql` | `admin_force_unbind()` |

#### Triggers Created

| Trigger Name | Table | Event | Description |
|--------------|-------|-------|-------------|
| `bound_quote_protection_update` | `insurance_towers` | UPDATE | Blocks protected field updates |
| `bound_quote_protection_delete` | `insurance_towers` | DELETE | Blocks deletion of bound quotes |
| `bound_submission_protection_update` | `submissions` | UPDATE | Blocks rating/broker/account changes |

#### Error Format
```
ERROR: Cannot modify protected fields on bound quote. Unbind first or use endorsement workflow. Quote ID: <uuid>
HINT: Protected fields: tower_json, coverages, sublimits, endorsements, subjectivities, retro_schedule, primary_retention, policy_form, position
```

#### Emergency Bypass (Admin Only)
```sql
-- Force unbind (bypasses triggers, use with caution)
SELECT admin_force_unbind('quote-uuid-here');
```

---

### Phase 5: Unbind Protection ⬜ TODO

| Task | Status | File | Notes |
|------|--------|------|-------|
| Add unbind reason requirement | ⬜ | `policy_panel.py` | Text field in dialog |
| Add unbind audit logging | ⬜ | `core/bound_option.py` | Log who/when/why |
| Add role-based permission | ⬜ | TBD | senior_uw or admin only |
| Add confirmation warnings | ⬜ | `policy_panel.py` | List what will be lost |

---

## Validation Error Messages

Standard error messages for pre-bind validation:

```python
BIND_VALIDATION_MESSAGES = {
    "missing_applicant_name": "Applicant name is required",
    "missing_address": "Mailing address is required",
    "missing_state": "State is required",
    "missing_broker": "Broker must be assigned",
    "missing_effective_date": "Policy effective date is required",
    "missing_expiration_date": "Policy expiration date is required",
    "invalid_date_range": "Expiration date must be after effective date",
    "no_tower_layers": "At least one coverage layer is required",
    "zero_retention": "Primary retention must be greater than zero",
    "no_coverages": "At least one coverage must be included",
}

BIND_VALIDATION_WARNINGS = {
    "zero_premium": "Premium is $0 - confirm this is intentional",
    "open_subjectivities": "There are unresolved pre-bind subjectivities",
}
```

---

## API Response Format

### Validation Failure Response

```json
{
    "can_bind": false,
    "errors": [
        {"code": "missing_effective_date", "message": "Policy effective date is required"},
        {"code": "no_tower_layers", "message": "At least one coverage layer is required"}
    ],
    "warnings": [
        {"code": "zero_premium", "message": "Premium is $0 - confirm this is intentional"}
    ]
}
```

### Successful Bind Response

```json
{
    "status": "bound",
    "quote_id": "uuid",
    "bound_at": "2024-01-15T10:30:00Z",
    "bound_by": "user@example.com"
}
```

---

## Testing Scenarios

### Pre-Bind Validation Tests

| Scenario | Expected Result |
|----------|-----------------|
| Bind with no account name | Error: missing_applicant_name |
| Bind with no broker | Error: missing_broker |
| Bind with no dates | Error: missing_effective_date, missing_expiration_date |
| Bind with expiration before effective | Error: invalid_date_range |
| Bind with empty tower | Error: no_tower_layers |
| Bind with $0 premium | Warning only, allow bind |
| Bind with complete data | Success |

### Post-Bind Protection Tests

| Scenario | Expected Result |
|----------|-----------------|
| Update bound tower via API | 403 Forbidden |
| Update bound coverages via API | 403 Forbidden |
| Direct SQL update to bound tower | Trigger rejects |
| Unbind without permission | 403 Forbidden |
| Unbind with permission + reason | Success, logged |

---

## Related Files

- `core/bind_validation.py` - Validation logic (to be created)
- `core/bound_option.py` - Bind/unbind functions
- `api/main.py` - API endpoints
- `pages_components/quote_options_panel.py` - Bind button UI
- `pages_components/policy_panel.py` - Unbind button UI
- `pages_workflows/submissions.py` - Tab-level readonly logic
