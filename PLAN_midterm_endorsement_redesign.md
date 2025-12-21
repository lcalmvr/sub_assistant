# Mid-Term Endorsement System Redesign - Implementation Plan

## Summary

Redesign the mid-term endorsement UI to use a modal-based approach with a reusable coverage editor component. The Policy tab becomes the single source of truth for post-bind policy state.

---

# ACTIVE WORK - December 2024

## Issue #1: Policy Documents Order + Placeholders

### Current State
- Binder appears above Quote (wrong order)
- No placeholders for Dec Page or Policy Form

### Target State
Documents should appear in this order:
1. **Quote** (bound quote) - links to PDF
2. **Binder** - links to PDF
3. **Dec Page** - placeholder "(coming soon)"
4. **Policy Form** - placeholder "(coming soon)"
5. **Endorsements** - each with PDF link

### Implementation
**File: `pages_workflows/submissions.py` (Policy tab, ~line 1350)**

```python
# Sort and organize policy documents
all_docs = policy_data.get("documents", [])

# Filter to policy-relevant docs
policy_docs = [
    d for d in all_docs
    if d.get("document_type") in ("binder", "policy", "endorsement")
    or d.get("is_bound_quote", False)
]

# Sort: quotes first, then binders, then endorsements (by date)
def doc_sort_key(d):
    type_order = {
        "quote_primary": 0, "quote_excess": 0,
        "binder": 1,
        "policy": 2,
        "endorsement": 3
    }
    return (type_order.get(d.get("document_type"), 99), d.get("created_at"))

policy_docs.sort(key=doc_sort_key)

# Render documents
for doc in policy_docs:
    # ... render doc row

# Add placeholders after binder
st.caption("Dec Page — coming soon")
st.caption("Policy Form — coming soon")
```

---

## Issue #2: Quote Tab Post-Bind UX

### Current State
- Shows dropdown selector with all options
- Can still switch between options freely
- Shows "Policy is bound. Quote options are read-only for reference." banner

### Target State
- **No dropdown** - show card summaries instead
- Bound option shown prominently at top with "✓ BOUND" badge
- Other options shown as collapsed reference cards
- Option switching **locked** unless "Override" checkbox is checked
- All inputs read-only (limit, retention, premium, coverages, tower)

### Implementation
**File: `pages_components/quote_options_panel.py`**

Replace the dropdown with card-based layout when bound:

```python
def render_quote_options_panel(sub_id: str, readonly: bool = False):
    bound_option = get_bound_option(sub_id)
    is_bound = bound_option is not None

    if is_bound:
        st.info("📋 Policy is bound. Quote options are read-only for reference.")

        # Render as cards, not dropdown
        _render_bound_quote_cards(sub_id, bound_option)
    else:
        # Pre-bind: current dropdown behavior
        _render_quote_options_editable(sub_id)


def _render_bound_quote_cards(sub_id: str, bound_option: dict):
    """Render quote options as reference cards when policy is bound."""
    all_quotes = list_quotes_for_submission(sub_id)

    # Bound option first, expanded
    for quote in all_quotes:
        is_this_bound = quote["id"] == bound_option["id"]

        if is_this_bound:
            # Prominent card for bound option
            with st.container(border=True):
                st.markdown(f"**✓ {quote['quote_name']}** (BOUND)")
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Limit", f"${quote.get('limit', 0):,.0f}")
                with col2:
                    st.metric("Retention", f"${quote.get('retention', 0):,.0f}")
                with col3:
                    st.metric("Premium", f"${quote.get('sold_premium', 0):,.0f}")
        else:
            # Collapsed expander for other options
            with st.expander(f"{quote['quote_name']}"):
                st.caption(f"Limit: ${quote.get('limit', 0):,.0f} | Retention: ${quote.get('retention', 0):,.0f} | Premium: ${quote.get('sold_premium', 0):,.0f}")

    # Override toggle (hidden by default)
    if st.checkbox("Override: Switch to different option", key=f"override_bound_{sub_id}"):
        st.warning("⚠️ Switching bound option requires rebinding.")
        # Show dropdown for override case only
        _render_quote_selector_dropdown(sub_id, all_quotes)
```

---

## Issue #3: Coverage Change Modal - COMPLETE REBUILD

### Current State
- Basic text input for "Coverage" name
- Single "New Limit" and "New Retention" field
- Useless for policies with 10+ coverages
- No visual diff of old vs new values

### Target State
- **Embed the coverage_editor component** from Quote tab
- Show ALL coverages with current values
- User edits values inline (same UX as Quote tab)
- System computes diff automatically (old → new)
- Effective date determines when changes take effect
- Premium change calculated (pro-rata or flat)
- Can generate mid-term endorsement PDF with new coverage schedule

### Implementation
**File: `pages_components/endorsements_history_panel.py`**

Replace `_render_coverage_change_fields()` with embedded coverage editor:

```python
def _render_coverage_change_fields(bound_option: dict, policy_dates: tuple):
    """Render coverage change fields using the shared coverage editor."""
    from pages_components.coverage_editor import (
        render_coverage_editor,
        compute_coverage_changes,
    )

    # Get current coverages from bound option
    current_coverages = bound_option.get("coverages", {})
    aggregate_limit = current_coverages.get("aggregate_limit", 2_000_000)

    st.markdown("**Current Coverage Schedule**")
    st.caption("Edit values below to create coverage change endorsement")

    # Render the coverage editor in "edit" mode
    # This shows all coverages with editable values
    new_coverages = render_coverage_editor(
        sub_id=None,  # Not needed for modal context
        current_coverages=current_coverages,
        aggregate_limit=aggregate_limit,
        mode="edit",
        key_prefix="endorsement_coverage_",
        show_aggregate_limit_selector=True,  # Allow changing aggregate
    )

    # Compute what changed
    changes = compute_coverage_changes(current_coverages, new_coverages)

    if changes:
        st.markdown("**Changes Detected:**")
        for cov_id, change in changes.items():
            old_val = change.get("old", 0)
            new_val = change.get("new", 0)
            st.caption(f"• {cov_id}: ${old_val:,.0f} → ${new_val:,.0f}")

    # Store changes in session state for form submission
    st.session_state["_endorsement_coverage_changes"] = changes
    st.session_state["_endorsement_new_coverages"] = new_coverages

    return changes
```

### Data Storage (change_details format)

When endorsement is created, store the full diff:

```json
{
    "change_type": "coverage_change",
    "effective_date": "2025-01-15",
    "aggregate_limit": {
        "old": 2000000,
        "new": 3000000
    },
    "aggregate_coverages": {
        "side_a_do": {"old": 2000000, "new": 3000000},
        "side_b_do": {"old": 2000000, "new": 3000000},
        "side_c_entity": {"old": 2000000, "new": 3000000},
        "epl": {"old": 1000000, "new": 1500000}
    },
    "sublimit_coverages": {
        "cyber_extortion": {"old": 500000, "new": 500000}
    }
}
```

### Coverage Editor Modifications Needed

**File: `pages_components/coverage_editor.py`**

Add support for modal context:

```python
def render_coverage_editor(
    sub_id: str,
    current_coverages: dict,
    aggregate_limit: int,
    mode: str = "edit",           # "edit" | "readonly" | "diff"
    key_prefix: str = "",         # For unique widget keys in modal
    show_aggregate_limit_selector: bool = False,
    on_change_callback = None,
) -> dict:
    """
    Reusable coverage editor component.

    When used in modal context, pass key_prefix to avoid widget key collisions.
    """
    # ... existing implementation with key_prefix support
```

---

## Implementation Order

### Step 1: Fix Policy Documents (Quick Win) ✅ DONE
- [x] Sort documents: Quote → Binder → Endorsements
- [x] Add Dec Page and Policy Form placeholders
- [ ] Test display

### Step 2: Fix Quote Tab Post-Bind UX ✅ DONE
- [x] Create `_render_bound_quote_cards()` function
- [x] Replace dropdown with cards when bound
- [x] Add override checkbox for switching
- [x] Make coverages/tower/premium read-only (already done in Phase 5)
- [ ] Test post-bind display

### Step 3: Rebuild Coverage Change Modal ✅ DONE
- [x] Add `key_prefix` support to `coverage_editor.py` (already had via editor_id)
- [x] Create `_render_coverage_change_with_editor()` that embeds coverage editor
- [x] Wire up `compute_coverage_changes()` for diff detection
- [x] Update form submission to store full change_details
- [x] Auto-generate description based on coverage changes
- [ ] Test creating coverage change endorsement
- [ ] Verify endorsement PDF shows new coverage schedule

---

---

## Architecture Overview

```
QUOTE TAB (pre-bind)                 POLICY TAB (post-bind)
┌─────────────────────┐              ┌─────────────────────────────────┐
│ Quote Options       │              │ Current Policy State (computed) │
│ Coverage Editor ◄───┼──────────────┼─► Coverage Editor (in modal)    │
│ Generate/Bind       │   shared     │ Policy Documents                │
└─────────────────────┘  component   │ [+ Endorsement] → Modal         │
                                     │ Renewal                         │
                                     └─────────────────────────────────┘
```

---

## Phase 1: Extract Reusable Coverage Editor Component

### Goal
Extract the coverage editing UI from `coverages_panel.py` into a standalone component that can be used in both Quote tab and Endorsement modal contexts.

### Files to Create/Modify

**Create: `pages_components/coverage_editor.py`**
```python
def render_coverage_editor(
    sub_id: str,
    current_coverages: dict,      # Starting state
    aggregate_limit: int,
    mode: str = "edit",           # "edit" | "readonly" | "diff"
    on_change_callback = None,    # For modal to track changes
    show_diff_markers: bool = False,  # Show ● for changed values
    original_coverages: dict = None,  # For diff comparison
) -> dict:
    """
    Reusable coverage editor component.

    Returns: Updated coverages dict
    """
```

**Modify: `pages_components/coverages_panel.py`**
- Import and use `render_coverage_editor()`
- Keep panel wrapper (expander, save logic) but delegate editing to shared component

### Key Behaviors
- In Quote context: `mode="edit"`, saves to `insurance_towers.coverages`
- In Endorsement context: `mode="diff"`, shows changes vs current policy, saves to `change_details`

---

## Phase 2: Create Endorsement Modal Component

### Goal
Build a modal dialog for creating/editing mid-term endorsements that opens from the Policy tab.

### Files to Create

**Create: `pages_components/endorsement_modal.py`**
```python
def render_endorsement_modal(
    sub_id: str,
    tower_id: str,
    bound_option: dict,
    current_coverages: dict,
    endorsement_id: str = None,  # None = new, else editing draft
):
    """
    Modal for creating/editing mid-term endorsements.

    Sections:
    1. Type selector + Effective date
    2. Type-specific fields (dynamic based on type)
    3. Premium section (for types that have premium impact)
    4. Notes
    5. Action buttons: Cancel, Save Draft, Issue
    """
```

### Type-Specific Field Rendering

| Type | Fields | Premium |
|------|--------|---------|
| Extension | New expiration date (date picker) | Auto-calculated pro-rata |
| Cancellation | Reason (select), Cancellation date | Return premium (negative) |
| Coverage Change | **Coverage Editor Component** | User enters annual change + method |
| Name Change | New name (text) | None |
| Address Change | Address fields | None |
| ERP | ERP type (12mo/36mo), Premium (currency) | User enters flat |
| Reinstatement | Lapse period | Auto-calculated |
| BOR | New broker (employment dropdown) | None |

### Modal State Management
```python
# Session state keys
f"endorsement_modal_open_{sub_id}"      # bool
f"endorsement_modal_mode_{sub_id}"      # "new" | "edit"
f"endorsement_modal_id_{sub_id}"        # UUID if editing
f"endorsement_modal_type_{sub_id}"      # endorsement type
f"endorsement_modal_changes_{sub_id}"   # dict of pending changes
```

---

## Phase 3: Redesign Policy Tab

### Goal
Restructure the Policy tab to show current state, policy documents, and provide the [+ Endorsement] button.

### Modify: `pages_workflows/submissions.py` (Policy tab section)

#### New Structure

```python
with tab_policy:
    policy_data = load_policy_tab_data(sub_id)
    bound_option = policy_data.get("bound_option")

    if not bound_option:
        st.info("No bound policy...")
    else:
        # 1. CURRENT POLICY STATE
        render_current_policy_state(sub_id, policy_data)

        # 2. POLICY DOCUMENTS + [+ Endorsement] button
        render_policy_documents(sub_id, policy_data)

        # 3. RENEWAL
        render_renewal_panel(sub_id)

        # 4. MODAL (renders if open)
        render_endorsement_modal(sub_id, ...)
```

### Create: `pages_components/current_policy_state.py`
```python
def render_current_policy_state(sub_id: str, policy_data: dict):
    """
    Displays computed current state: bound option + all issued endorsements.

    Shows:
    - Status (Active/Cancelled/ERP)
    - Policy period (with extension indication if applicable)
    - Current limits (with change indication if modified)
    - Current premium (base + adjustments)
    """
```

### Create: `pages_components/policy_documents_panel.py`
```python
def render_policy_documents(sub_id: str, policy_data: dict):
    """
    Chronological list of policy documents with [+ Endorsement] button.

    Document types in order:
    - Quote (auto-added at bind)
    - Binder
    - Dec Page (future)
    - Policy Form (future)
    - Endorsement PDFs

    Each row: [Icon] Type: Number (Date)  [View PDF]

    Header includes [+ Endorsement] button that opens modal.
    """
```

---

## Phase 4: Computed Policy State Function

### Goal
Create a function that computes current coverages by layering endorsements on top of bound option.

### Modify: `core/endorsement_management.py`

```python
def get_current_coverages(submission_id: str) -> dict:
    """
    Compute current coverage state: bound_option.coverages + coverage change endorsements.

    Returns:
        {
            "policy_form": "cyber",
            "aggregate_limit": 5000000,
            "aggregate_coverages": {...},
            "sublimit_coverages": {...},
            "changes_applied": [
                {"endorsement_id": "...", "description": "Limit increase", "date": "..."}
            ]
        }
    """
    # 1. Get bound option coverages
    bound = get_bound_option(submission_id)
    if not bound:
        return None

    coverages = bound.get("coverages") or {}
    changes_applied = []

    # 2. Get issued coverage change endorsements, ordered by effective_date
    endorsements = get_issued_endorsements(submission_id)
    coverage_endorsements = [e for e in endorsements if e["endorsement_type"] == "coverage_change"]

    # 3. Apply each change in order
    for e in coverage_endorsements:
        change_details = e.get("change_details", {})
        coverages = apply_coverage_changes(coverages, change_details)
        changes_applied.append({
            "endorsement_id": e["id"],
            "description": e["description"],
            "effective_date": e["effective_date"]
        })

    coverages["changes_applied"] = changes_applied
    return coverages


def apply_coverage_changes(base_coverages: dict, changes: dict) -> dict:
    """
    Apply coverage changes to base coverages.

    changes format:
    {
        "aggregate_limit": {"old": 3000000, "new": 5000000},
        "aggregate_coverages": {
            "side_a": {"old": 3000000, "new": 5000000},
            ...
        },
        "sublimit_coverages": {...}
    }
    """
    result = copy.deepcopy(base_coverages)

    if "aggregate_limit" in changes:
        result["aggregate_limit"] = changes["aggregate_limit"]["new"]

    if "aggregate_coverages" in changes:
        for cov, vals in changes["aggregate_coverages"].items():
            if "new" in vals:
                result["aggregate_coverages"][cov] = vals["new"]

    # Same for sublimits...
    return result
```

---

## Phase 5: Quote Tab Read-Only After Bind ✅ COMPLETE

### Goal
Lock the Quote tab for editing after bind, make it reference-only.

### Implementation Summary (Completed)

**Modified: `pages_components/quote_options_panel.py`**
- Added `readonly` parameter to `render_quote_options_panel()`
- Auto-detects bound state and forces readonly mode
- When bound: hides Add Primary/Excess buttons, shows info message
- When bound: hides Bind/Unbind/Clone/Delete buttons (just dropdown for reference)
- Premium summary displays as metrics instead of editable inputs

**Modified: `pages_components/tower_panel.py`**
- Added `readonly` parameter to `render_tower_panel()`
- Added `_render_tower_cards_readonly()` for primary quotes
- Added `_render_excess_tower_readonly()` for excess quotes
- When bound: hides action buttons, displays tower as read-only summary

**Modified: `pages_workflows/submissions.py` (Quote tab)**
- Imports `has_bound_option` to check bound state
- Passes `readonly=is_bound` to all components:
  - `render_quote_options_panel(sub_id, readonly=is_bound)`
  - `render_tower_panel(sub_id, ..., readonly=is_bound)`
  - `render_coverages_panel(sub_id, ..., readonly=is_bound)`
- Skips tower sync when bound

**Already had readonly:** `pages_components/coverages_panel.py`
- Already had `readonly` parameter, just needed to pass it from submissions.py

---

## Phase 6: Auto-Add Quote to Policy Documents at Bind ✅ COMPLETE

### Goal
When a quote option is bound, automatically add its quote document to the policy documents list.

### Implementation Summary (Completed)

**Database: `db_setup/alter_policy_documents_add_is_bound_quote.sql`**
- Added `is_bound_quote BOOLEAN DEFAULT FALSE` column to `policy_documents` table
- Added index for quick lookup of bound quotes

**Created: `link_quote_to_policy()` in `core/document_generator.py`**
- Clears any previously bound quote for the submission
- Marks the quote document(s) for the bound option as `is_bound_quote = TRUE`

**Modified: `core/bound_option.py` → `bind_option()`**
- After successful bind and binder generation, calls `link_quote_to_policy()`
- Wrapped in try/except so bind doesn't fail if quote linking fails

**Modified: `core/policy_tab_data.py`**
- Added `is_bound_quote` to the documents query

**Modified: `pages_workflows/submissions.py` (Policy tab)**
- Updated document filter to include bound quotes:
  ```python
  policy_docs = [
      d for d in all_docs
      if d.get("document_type") in ("binder", "policy", "endorsement")
      or d.get("is_bound_quote", False)
  ]
  ```

---

## Phase 7: Update change_details Storage for Coverage Changes

### Goal
Store coverage changes in a structured format that supports the computed state function.

### change_details Format for Coverage Change

```json
{
    "change_type": "limit_increase",
    "description": "Increase aggregate limit from $3M to $5M",
    "aggregate_limit": {
        "old": 3000000,
        "new": 5000000
    },
    "aggregate_coverages": {
        "side_a_do": {"old": 3000000, "new": 5000000},
        "side_b_do": {"old": 3000000, "new": 5000000},
        "side_c_entity": {"old": 3000000, "new": 5000000}
    },
    "sublimit_coverages": {},
    "primary_retention": {
        "old": 50000,
        "new": 50000
    }
}
```

---

## Implementation Order

### Phase 1: Foundation ✅ COMPLETE
1. [x] Extract `coverage_editor.py` from `coverages_panel.py`
2. [x] Update `coverages_panel.py` to use extracted component
3. [x] Add `get_current_coverages()` to `endorsement_management.py`
4. [x] Add `apply_coverage_changes()` helper

### Phase 2: Modal ✅ COMPLETE
5. [x] Create endorsement modal with type selector and basic fields (in `endorsements_history_panel.py`)
6. [x] Implement simple endorsement types in modal (Extension, Name Change, etc.)
7. [x] Implement Coverage Change type with embedded coverage editor
8. [x] Add modal state management and open/close logic

### Phase 3: Policy Tab ✅ MOSTLY COMPLETE
9. [x] Policy tab shows current policy state (status, dates, limits, premium)
10. [x] Policy documents section (filtered to binders/policies/endorsements)
11. [x] Restructure Policy tab with new layout
12. [x] Add [+ New Endorsement] button that opens modal
13. [ ] Auto-add quote to policy documents at bind (Phase 6)

### Phase 4: Computed Policy State ✅ COMPLETE
- [x] `get_current_coverages()` in `endorsement_management.py`
- [x] `apply_coverage_changes()` helper
- [x] `get_effective_policy_state()` for full policy state

### Phase 5: Quote Tab Read-Only ✅ COMPLETE
14. [x] Make Quote tab read-only after bind
15. [x] Add read-only mode to coverage_editor, tower_panel, quote_options_panel
16. [ ] Test full flow: quote → bind → endorsement → computed state

### Phase 6: Auto-Add Quote at Bind ✅ COMPLETE
17. [x] Link quote document to policy documents when binding

### Phase 7: change_details Format ✅ COMPLETE
- [x] Structured format in `coverage_editor.py` compute_coverage_changes()

---

## Files Summary

### New Files
- `pages_components/coverage_editor.py` - Reusable coverage editing component
- `pages_components/endorsement_modal.py` - Modal for mid-term endorsements
- `pages_components/current_policy_state.py` - Computed policy state display
- `pages_components/policy_documents_panel.py` - Policy documents list

### Modified Files
- `pages_components/coverages_panel.py` - Use extracted coverage editor
- `pages_components/quote_options_panel.py` - Read-only mode after bind
- `pages_components/tower_panel.py` - Read-only mode after bind
- `pages_workflows/submissions.py` - Restructure Policy tab
- `core/endorsement_management.py` - Add computed state functions
- `core/bound_option.py` - Auto-link quote at bind
- `core/document_generator.py` - Add is_bound_quote tracking

### Database Changes
- `ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS is_bound_quote BOOLEAN DEFAULT FALSE;`

---

---

## Endorsement Type Analysis (December 2024)

### Code Reuse Strategy

The endorsement modal should leverage existing UI components where possible to:
1. Avoid code duplication
2. Maintain consistent UX across the application
3. Reduce maintenance burden

### Current State by Endorsement Type

| Type | Label | Current Fields | Code Reuse Opportunity | Status |
|------|-------|----------------|----------------------|--------|
| `coverage_change` | Coverage Change | Aggregate Limit, Retention, Coverage Editor | ⚠️ Limit/Retention dropdowns duplicated from Quote page | ✅ Working |
| `cancellation` | Cancellation | Reason dropdown | None needed - simple | ✅ Working |
| `reinstatement` | Reinstatement | Lapse period (days) | None needed - simple | ✅ Working |
| `extension` | Policy Extension | New expiration date picker | 🔄 Could share date logic with renewal panel | ✅ Working |
| `name_change` | Named Insured Change | Old Name, New Name text inputs | 🔄 Could auto-populate, add company search | ✅ Working |
| `address_change` | Address Change | Old/New Address fields (street, suite, city, state, zip) | ✅ Implemented with US state dropdown | ✅ Working |
| `erp` | Extended Reporting Period | Type dropdown, Months input | None needed - specialized | ✅ Working |
| `bor_change` | Broker of Record Change | Full broker search with employment lookup | ✅ Uses `core.bor_management` | ✅ Excellent |
| `other` | Other | Description only | Intentionally generic | ✅ Working |

### Identified Issues

#### Issue #4: Address Change Missing Fields ✅ DONE
**Fixed:** Implemented full address change form with:
- Previous Address: Street, Suite/Unit, City, State dropdown (all US states), ZIP
- New Address: Same structure
- Auto-generates description: "Address change from X to Y"
- Stores structured data in `change_details` for PDF generation

#### Issue #5: Limit/Retention Code Duplication
**Current:** Coverage change modal has its own limit/retention dropdowns
**Problem:** If Quote page dropdowns change, endorsement modal won't automatically update
**Solution:** Extract to shared component in `pages_components/policy_terms_editor.py`

#### Issue #6: Name Change Could Auto-Populate
**Current:** User must manually enter both old and new name
**Improvement:** Auto-populate "Old Name" from submission's applicant_name

### Implementation Priority

1. ✅ Coverage Change - DONE (uses coverage_editor)
2. ✅ Address Change - DONE (full address form with US state dropdown)
3. 🔄 Extract limit/retention to shared component - LATER
4. 🔄 Name Change auto-populate - LATER

---

## Open Questions

1. **Draft endorsements in modal**: Should drafts appear in Policy Documents list with "DRAFT" badge, or only after issue?
   - Recommendation: Show drafts with badge, allows user to see pending work

2. **Multiple coverage changes**: If user does two coverage change endorsements, do we show cumulative state or each delta?
   - Recommendation: Current Policy State shows cumulative; each endorsement record shows its individual delta

3. **Void endorsement**: When voiding, do we recompute state automatically?
   - Recommendation: Yes, `get_current_coverages()` only considers issued (not voided) endorsements

4. **Dec Page / Policy Form**: These are listed as future - should we add placeholder or skip entirely?
   - Recommendation: Skip for now, add when those features are built
