"""
Bulk Coverage Update Component

Provides two bulk update capabilities:
1. Single coverage update - pick one coverage and apply a value to selected options
2. Push all coverages - push current coverage settings to all primary options
"""
from __future__ import annotations

import streamlit as st
from typing import Optional

from rating_engine.coverage_config import (
    get_sublimit_coverage_definitions,
    get_aggregate_coverage_definitions,
    format_limit_display,
)
from pages_components.tower_db import (
    update_quote_field,
    get_quote_by_id,
    list_quotes_for_submission,
)
from pages_components.coverage_editor import reset_coverage_editor


def render_bulk_coverage_expander(sub_id: str, saved_options: list[dict]):
    """
    Render bulk coverage update as an expander.

    Args:
        sub_id: Submission ID
        saved_options: List of saved quote options with id, quote_name, coverages
    """
    if not saved_options:
        return

    with st.expander("Update Coverage Across Options", expanded=False):
        _render_bulk_update_ui(sub_id, saved_options)


def render_bulk_coverage_modal(sub_id: str, saved_options: list[dict]):
    """
    Render bulk coverage update as a modal dialog.

    Args:
        sub_id: Submission ID
        saved_options: List of saved quote options with id, quote_name, coverages
    """
    if not saved_options:
        return

    modal_key = f"show_bulk_cov_modal_{sub_id}"
    trigger_key = f"bulk_cov_modal_triggered_{sub_id}"
    rows_key = f"bulk_cov_rows_{sub_id}"

    # Modal trigger button - set a trigger flag
    if st.button("Update Coverage Across Options", key=f"bulk_cov_modal_btn_{sub_id}"):
        st.session_state[trigger_key] = True
        st.session_state[modal_key] = True
        # Reset rows when opening dialog fresh
        if rows_key in st.session_state:
            del st.session_state[rows_key]

    # Only show modal if it was just triggered (not on random reruns)
    if st.session_state.get(trigger_key, False):
        # Clear the trigger immediately so it doesn't persist
        st.session_state[trigger_key] = False

        @st.dialog("Batch Edit Coverages", width="large")
        def show_modal():
            _render_bulk_update_ui(sub_id, saved_options, in_modal=True)

        show_modal()


def _build_rows_from_source(source_coverages: dict, coverage_options: list, aggregate_limit: int = None) -> list:
    """
    Build coverage rows from source coverages (for "Load Current Settings" feature).

    Handles both:
    - Quote tab: actual values in sublimit_coverages/aggregate_coverages
    - Rating tab: symbolic values in sublimit_defaults/agg_overrides

    Args:
        source_coverages: Coverage settings dict
        coverage_options: List of coverage definitions with id, label, type

    Returns:
        List of row dicts with coverage_id and value
    """
    rows = []

    # Check if this is from Rating tab (has is_rating_source flag)
    is_rating = source_coverages.get("is_rating_source", False)

    if is_rating:
        # Rating tab format: sublimit_defaults and agg_overrides with symbolic values
        sublimit_defaults = source_coverages.get("sublimit_defaults", {})
        agg_overrides = source_coverages.get("agg_overrides", {})

        # Process sublimit coverages
        for cov in coverage_options:
            if cov["type"] == "sublimit":
                cov_id = cov["id"]
                val = sublimit_defaults.get(cov_id)
                if val is not None and val != 0 and val != "none":
                    # Convert symbolic to actual value for the dropdown
                    if val == "aggregate" or val == "50%":
                        # Use $1M as representative for full/50% since actual depends on option
                        actual_val = 1_000_000
                    elif isinstance(val, (int, float)):
                        actual_val = int(val)
                    else:
                        actual_val = 100_000
                    rows.append({"coverage_id": cov_id, "value": actual_val})

        # Process aggregate coverages
        for cov in coverage_options:
            if cov["type"] == "aggregate":
                cov_id = cov["id"]
                val = agg_overrides.get(cov_id)
                if val == "Aggregate" or val == "Full Limits":
                    rows.append({"coverage_id": cov_id, "value": "full"})
                elif val == "$1M":
                    rows.append({"coverage_id": cov_id, "value": 1_000_000})
                elif val != "None" and val is not None:
                    rows.append({"coverage_id": cov_id, "value": "full"})
    else:
        # Quote tab format: sublimit_coverages and aggregate_coverages with actual values
        sublimit_covs = source_coverages.get("sublimit_coverages", {})
        aggregate_covs = source_coverages.get("aggregate_coverages", {})

        # Process sublimit coverages
        for cov in coverage_options:
            if cov["type"] == "sublimit":
                cov_id = cov["id"]
                val = sublimit_covs.get(cov_id, 0)
                if val and val > 0:
                    rows.append({"coverage_id": cov_id, "value": val})

        # Process aggregate coverages
        for cov in coverage_options:
            if cov["type"] == "aggregate":
                cov_id = cov["id"]
                val = aggregate_covs.get(cov_id, 0)
                if val and val > 0:
                    # Map actual value to dropdown option
                    if val == 1_000_000:
                        rows.append({"coverage_id": cov_id, "value": 1_000_000})
                    elif aggregate_limit and val == aggregate_limit:
                        # If value equals aggregate limit, it's "full limits" (not a specific dollar amount)
                        rows.append({"coverage_id": cov_id, "value": "full"})
                    else:
                        # Anything else is "full limits" (fallback for when we don't have aggregate_limit)
                        rows.append({"coverage_id": cov_id, "value": "full"})

    return rows


def _render_bulk_update_ui(sub_id: str, saved_options: list[dict], in_modal: bool = False, key_prefix: str = ""):
    """Render the bulk update UI with support for multiple coverage rows."""
    prefix = f"{key_prefix}_" if key_prefix else ""

    # Get all coverage definitions
    sublimit_covs = get_sublimit_coverage_definitions()
    aggregate_covs = get_aggregate_coverage_definitions()

    # Build coverage options - Variable limits first, then Standard
    coverage_options = []
    for cov in sublimit_covs:
        coverage_options.append({
            "id": cov["id"],
            "label": cov["label"],
            "type": "sublimit"
        })
    for cov in aggregate_covs:
        coverage_options.append({
            "id": cov["id"],
            "label": cov["label"],
            "type": "aggregate"
        })

    # Session state keys
    rows_key = f"{prefix}bulk_cov_rows_{sub_id}"
    selection_key = f"{prefix}bulk_cov_selections_{sub_id}"
    source_key = f"{prefix}bulk_cov_source_{sub_id}"

    # Use fragment for the entire UI to allow independent rerun
    @st.fragment
    def render_bulk_ui_fragment():
        # Initialize session state INSIDE fragment to ensure it's always available
        # Session state for coverage rows: list of {"coverage_id": str, "value": any}
        if rows_key not in st.session_state:
            # Start with one empty row
            st.session_state[rows_key] = [{"coverage_id": coverage_options[0]["id"], "value": 100_000}]

        # Initialize selection state
        if selection_key not in st.session_state:
            st.session_state[selection_key] = {opt["id"]: True for opt in saved_options}

        # Get source coverages for "Load Current Settings" feature
        source_coverages = st.session_state.get(source_key, {})
        
        rows = st.session_state[rows_key]

        # Track rows to remove (can't modify list while iterating)
        row_to_remove = None

        # Add Coverage / Load Current Settings / Clear All buttons (all same size, matching bottom buttons)
        all_selected_ids = {r["coverage_id"] for r in rows if r["coverage_id"]}
        unselected = [c for c in coverage_options if c["id"] not in all_selected_ids]
        has_unselected = len(unselected) > 0
        
        if has_unselected:
            col_add, col_load, col_clear = st.columns([1, 1, 1])
        else:
            col_add, col_load, col_clear = st.columns([0, 1, 1])
        
        with col_add:
            if has_unselected:
                if st.button("Add Coverage", key=f"{prefix}bulk_add_row_{sub_id}", use_container_width=True):
                    default_val = 100_000 if unselected[0]["type"] == "sublimit" else "full"
                    rows.append({"coverage_id": unselected[0]["id"], "value": default_val})
                    st.session_state[rows_key] = rows
                    st.rerun(scope="fragment")
        with col_load:
            if st.button("Load Current Settings", key=f"{prefix}bulk_load_current_{sub_id}", use_container_width=True):
                # Get aggregate limit from source if available (needed to detect "full limits")
                source_agg_limit = source_coverages.get("aggregate_limit")
                new_rows = _build_rows_from_source(source_coverages, coverage_options, source_agg_limit)
                if new_rows:
                    st.session_state[rows_key] = new_rows
                    st.rerun(scope="fragment")
                else:
                    st.warning("No coverage settings to load")
        with col_clear:
            if st.button("Clear All", key=f"{prefix}bulk_clear_all_{sub_id}", use_container_width=True):
                # Reset to single empty row
                st.session_state[rows_key] = [{"coverage_id": coverage_options[0]["id"], "value": 100_000}]
                st.rerun(scope="fragment")

        # Header row
        col_cov_h, col_val_h, col_rm_h = st.columns([2, 2, 0.5])
        with col_cov_h:
            st.caption("Coverage")
        with col_val_h:
            st.caption("New Value")

        # Render each coverage row
        for row_idx, row in enumerate(rows):
            # Get list of already-selected coverage IDs (for filtering dropdowns)
            selected_cov_ids = {r["coverage_id"] for i, r in enumerate(rows) if r["coverage_id"] and i != row_idx}

            col_cov, col_val, col_remove = st.columns([2, 2, 0.5])

            # Available coverages for this row (exclude already selected by other rows)
            available_options = [
                c for c in coverage_options
                if c["id"] not in selected_cov_ids
            ]
            available_labels = [c["label"] for c in available_options]

            # Find current selection
            current_cov = next((c for c in coverage_options if c["id"] == row["coverage_id"]), None)
            if current_cov and current_cov["label"] in available_labels:
                current_idx = available_labels.index(current_cov["label"])
            else:
                current_idx = 0
                if available_options:
                    row["coverage_id"] = available_options[0]["id"]

            with col_cov:
                new_label = st.selectbox(
                    f"Coverage {row_idx}",
                    options=available_labels,
                    index=current_idx,
                    key=f"{prefix}bulk_cov_row_{sub_id}_{row_idx}",
                    label_visibility="collapsed",
                )
                new_cov = next((c for c in available_options if c["label"] == new_label), available_options[0] if available_options else None)
                if new_cov:
                    row["coverage_id"] = new_cov["id"]

            # Value options depend on coverage type
            with col_val:
                cov_type = new_cov["type"] if new_cov else "sublimit"
                if cov_type == "sublimit":
                    value_options = [
                        ("$100K", 100_000),
                        ("$250K", 250_000),
                        ("$500K", 500_000),
                        ("$1M", 1_000_000),
                        ("None", 0),
                    ]
                else:
                    value_options = [
                        ("Full Limits", "full"),
                        ("$1M", 1_000_000),
                        ("No Coverage", 0),
                    ]

                value_labels = [v[0] for v in value_options]
                value_values = [v[1] for v in value_options]

                # Find current value index
                current_val_idx = 0
                if row["value"] is not None and row["value"] in value_values:
                    current_val_idx = value_values.index(row["value"])

                new_val_label = st.selectbox(
                    f"Value {row_idx}",
                    options=value_labels,
                    index=current_val_idx,
                    key=f"{prefix}bulk_val_row_{sub_id}_{row_idx}",
                    label_visibility="collapsed",
                )
                row["value"] = next(v[1] for v in value_options if v[0] == new_val_label)

            with col_remove:
                if len(rows) > 1:
                    if st.button("−", key=f"{prefix}bulk_remove_row_{sub_id}_{row_idx}"):
                        row_to_remove = row_idx

        # Handle row removal after iteration
        if row_to_remove is not None:
            rows.pop(row_to_remove)
            st.session_state[rows_key] = rows
            st.rerun(scope="fragment")

        st.markdown("---")
        
        # Apply button, Select All, Select None buttons (all same size) - Apply first
        # Read checkbox states from session to get current count (checkboxes rendered below)
        coverage_count = len(rows)
        # Calculate selected count by reading checkbox keys directly from session state
        selected_count = 0
        for opt in saved_options:
            opt_id = opt["id"]
            checkbox_key = f"{prefix}bulk_opt_{sub_id}_{opt_id}"
            if st.session_state.get(checkbox_key, st.session_state[selection_key].get(opt_id, True)):
                selected_count += 1
        
        col_apply, col_all, col_none = st.columns([1, 1, 1])
        with col_apply:
            if st.button(
                f"Apply {coverage_count} Coverage{'s' if coverage_count != 1 else ''} to {selected_count} Option{'s' if selected_count != 1 else ''}",
                key=f"{prefix}bulk_apply_{sub_id}",
                type="primary",
                disabled=selected_count == 0 or coverage_count == 0,
                use_container_width=True
            ):
                _apply_bulk_coverage_update(
                    sub_id, rows, saved_options, coverage_options,
                    selection_key, rows_key, prefix, in_modal
                )
        with col_all:
            if st.button("Select All", key=f"{prefix}bulk_select_all_{sub_id}", use_container_width=True):
                for opt in saved_options:
                    st.session_state[f"{prefix}bulk_opt_{sub_id}_{opt['id']}"] = True
                    st.session_state[selection_key][opt["id"]] = True
                st.rerun(scope="fragment")
        with col_none:
            if st.button("Select None", key=f"{prefix}bulk_select_none_{sub_id}", use_container_width=True):
                for opt in saved_options:
                    st.session_state[f"{prefix}bulk_opt_{sub_id}_{opt['id']}"] = False
                    st.session_state[selection_key][opt["id"]] = False
                st.rerun(scope="fragment")
        
        st.markdown("**Apply to:**")

        # Option checkboxes (render after buttons but state is read above)
        for opt in saved_options:
            opt_id = opt["id"]
            opt_name = opt.get("quote_name", f"Option {opt_id[:8]}")
            # Escape $ signs to prevent LaTeX rendering
            opt_name_escaped = opt_name.replace("$", r"\$")
            checkbox_key = f"{prefix}bulk_opt_{sub_id}_{opt_id}"

            default_val = st.session_state.get(checkbox_key, st.session_state[selection_key].get(opt_id, True))

            is_selected = st.checkbox(
                opt_name_escaped,
                value=default_val,
                key=checkbox_key
            )
            st.session_state[selection_key][opt_id] = is_selected

    # Render the fragment
    render_bulk_ui_fragment()


def _apply_bulk_coverage_update(
    sub_id: str,
    rows: list,
    saved_options: list,
    coverage_options: list,
    selection_key: str,
    rows_key: str,
    prefix: str,
    in_modal: bool,
):
    """Apply bulk coverage updates to selected options."""
    # Re-read rows fresh from session state
    apply_rows = st.session_state.get(rows_key, [])
    coverage_count = len(apply_rows)

    # Apply changes
    updated_count = 0
    for opt in saved_options:
        opt_id = opt["id"]
        if not st.session_state[selection_key].get(opt_id, False):
            continue

        # Get fresh coverages from database
        quote = get_quote_by_id(opt_id)
        if not quote:
            continue

        coverages = quote.get("coverages", {})

        # Get aggregate limit for "full" resolution
        tower_json = quote.get("tower_json", [])
        aggregate_limit = tower_json[0].get("limit", 1_000_000) if tower_json else 1_000_000

        if not coverages:
            # Initialize empty coverages structure
            coverages = {
                "policy_form": quote.get("policy_form", "cyber"),
                "aggregate_limit": aggregate_limit,
                "aggregate_coverages": {},
                "sublimit_coverages": {}
            }
        else:
            # Preserve existing structure and ensure aggregate_limit is set
            if "policy_form" not in coverages:
                coverages["policy_form"] = quote.get("policy_form", "cyber")
            if "aggregate_limit" not in coverages:
                coverages["aggregate_limit"] = aggregate_limit
            if "aggregate_coverages" not in coverages:
                coverages["aggregate_coverages"] = {}
            if "sublimit_coverages" not in coverages:
                coverages["sublimit_coverages"] = {}

        # Apply each coverage row
        for row in apply_rows:
            cov_id = row["coverage_id"]
            value = row["value"]
            cov_def = next((c for c in coverage_options if c["id"] == cov_id), None)
            if not cov_def:
                continue

            # Resolve "full" to actual aggregate limit
            actual_value = value
            if value == "full":
                actual_value = aggregate_limit

            # Update the coverage
            if cov_def["type"] == "sublimit":
                if "sublimit_coverages" not in coverages:
                    coverages["sublimit_coverages"] = {}
                coverages["sublimit_coverages"][cov_id] = actual_value
            else:
                if "aggregate_coverages" not in coverages:
                    coverages["aggregate_coverages"] = {}
                coverages["aggregate_coverages"][cov_id] = actual_value

        # Save to database
        update_quote_field(opt_id, "coverages", coverages)
        updated_count += 1

    if updated_count > 0:
        st.success(f"Updated {coverage_count} coverage{'s' if coverage_count != 1 else ''} on {updated_count} option{'s' if updated_count != 1 else ''}")
    else:
        st.warning("No options were updated. Check selections above.")

    # Clear cached coverages so they reload from DB
    if f"quote_coverages_{sub_id}" in st.session_state:
        del st.session_state[f"quote_coverages_{sub_id}"]
    if f"last_synced_quote_{sub_id}" in st.session_state:
        del st.session_state[f"last_synced_quote_{sub_id}"]
    # Reset the coverage editor to pick up new values
    reset_coverage_editor(f"quote_{sub_id}")
    # Clear the rows for next time (but allow reinitialization in fragment)
    if rows_key in st.session_state:
        del st.session_state[rows_key]

    if in_modal:
        st.session_state[f"show_{prefix}bulk_cov_modal_{sub_id}"] = False
        st.rerun()
    else:
        # In tab mode, need to rerun to refresh UI and reinitialize rows_key
        st.rerun()


# ─────────────────────── Push All Coverages ───────────────────────

def build_coverages_for_option_from_rating(
    sub_id: str,
    aggregate_limit: int,
    policy_form: str,
    sublimit_defaults: dict,
    agg_overrides: dict,
) -> dict:
    """
    Build actual coverage values for an option from Rating tab symbolic settings.

    Converts symbolic values like "aggregate", "50%" to actual amounts based on
    the option's aggregate limit.
    """
    sublimit_covs = {}
    aggregate_covs = {}

    # Process sublimit/variable coverages
    for cov in get_sublimit_coverage_definitions():
        cov_id = cov["id"]
        config_default = cov.get("default", 0)
        form_setting = cov.get(policy_form, 0)

        if form_setting != "sublimit":
            sublimit_covs[cov_id] = 0
            continue

        rating_val = sublimit_defaults.get(cov_id, config_default)

        # Convert symbolic to actual
        if rating_val == "50%":
            sublimit_covs[cov_id] = aggregate_limit // 2
        elif rating_val == "aggregate":
            sublimit_covs[cov_id] = aggregate_limit
        elif rating_val == "none":
            sublimit_covs[cov_id] = 0
        elif isinstance(rating_val, (int, float)):
            sublimit_covs[cov_id] = min(int(rating_val), aggregate_limit)
        else:
            sublimit_covs[cov_id] = min(config_default, aggregate_limit)

    # Process aggregate/standard coverages
    for cov in get_aggregate_coverage_definitions():
        cov_id = cov["id"]
        form_default = cov.get(policy_form, 0)
        default_status = "Aggregate" if form_default == "aggregate" else "None"
        override = agg_overrides.get(cov_id, default_status)

        if override == "Aggregate":
            aggregate_covs[cov_id] = aggregate_limit
        elif override == "$1M":
            aggregate_covs[cov_id] = 1_000_000
        elif override == "None":
            aggregate_covs[cov_id] = 0
        else:
            aggregate_covs[cov_id] = aggregate_limit if form_default == "aggregate" else 0

    return {
        "policy_form": policy_form,
        "aggregate_limit": aggregate_limit,
        "sublimit_coverages": sublimit_covs,
        "aggregate_coverages": aggregate_covs,
    }


def render_bulk_coverage_buttons(sub_id: str, source_coverages: dict, source_label: str = "current"):
    """
    Render Edit Coverages button (Quote tab version).

    Args:
        sub_id: Submission ID
        source_coverages: The current coverage settings (for "Load Current Settings" feature)
        source_label: Label for the source (e.g., "this option")
    """
    # Get all primary options for this submission
    all_quotes = list_quotes_for_submission(sub_id)
    primary_options = [q for q in all_quotes if q.get("position", "primary") == "primary"]

    if not primary_options:
        return

    # Single button - Edit Coverages with Load Current Settings capability
    _render_single_coverage_button(sub_id, primary_options, source_coverages=source_coverages, key_prefix="quote")


def render_bulk_coverage_buttons_rating(
    sub_id: str,
    policy_form: str,
    sublimit_defaults: dict,
    agg_overrides: dict,
):
    """
    Render Edit Coverages button (Rating tab version).

    Handles symbolic values like "aggregate", "50%" by converting them
    per-option based on each option's aggregate limit.
    """
    # Get all primary options for this submission
    all_quotes = list_quotes_for_submission(sub_id)
    primary_options = [q for q in all_quotes if q.get("position", "primary") == "primary"]

    if not primary_options:
        return

    # Build source coverages from Rating defaults (for "Load Current Settings" feature)
    # Use a representative aggregate limit - actual values will be calculated per-option
    rating_source = {
        "policy_form": policy_form,
        "sublimit_defaults": sublimit_defaults,
        "agg_overrides": agg_overrides,
        "is_rating_source": True,  # Flag to indicate these are symbolic values
    }

    # Single button - Edit Coverages with Load Current Settings capability
    _render_single_coverage_button(sub_id, primary_options, source_coverages=rating_source, key_prefix="rating")


def _render_single_coverage_button(sub_id: str, saved_options: list[dict], source_coverages: dict = None, key_prefix: str = ""):
    """Render the coverage update modal button."""
    prefix = f"{key_prefix}_" if key_prefix else ""
    modal_key = f"show_{prefix}bulk_cov_modal_{sub_id}"
    trigger_key = f"{prefix}bulk_cov_modal_triggered_{sub_id}"
    rows_key = f"{prefix}bulk_cov_rows_{sub_id}"
    source_key = f"{prefix}bulk_cov_source_{sub_id}"

    if st.button("Batch Edit", key=f"{prefix}bulk_cov_modal_btn_{sub_id}", type="primary"):
        st.session_state[trigger_key] = True
        st.session_state[modal_key] = True
        # Store source coverages for "Load Current Settings" feature
        if source_coverages:
            st.session_state[source_key] = source_coverages
        # Reset rows when opening dialog fresh
        if rows_key in st.session_state:
            del st.session_state[rows_key]

    if st.session_state.get(trigger_key, False):
        st.session_state[trigger_key] = False

        @st.dialog("Batch Edit Coverages", width="large")
        def show_modal():
            _render_bulk_update_ui(sub_id, saved_options, in_modal=True, key_prefix=key_prefix)

        show_modal()
