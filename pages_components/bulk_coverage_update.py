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

        @st.dialog("Edit Coverages Across Options", width="large")
        def show_modal():
            _render_bulk_update_ui(sub_id, saved_options, in_modal=True)

        show_modal()


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

    # Session state for coverage rows: list of {"coverage_id": str, "value": any}
    rows_key = f"{prefix}bulk_cov_rows_{sub_id}"
    if rows_key not in st.session_state:
        # Start with one empty row
        st.session_state[rows_key] = [{"coverage_id": coverage_options[0]["id"], "value": 100_000}]

    # Initialize selection state
    selection_key = f"{prefix}bulk_cov_selections_{sub_id}"
    if selection_key not in st.session_state:
        st.session_state[selection_key] = {opt["id"]: True for opt in saved_options}

    # Use fragment for the entire UI to allow independent rerun
    @st.fragment
    def render_bulk_ui_fragment():
        rows = st.session_state[rows_key]

        # Track rows to remove (can't modify list while iterating)
        row_to_remove = None

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

        # Add coverage button
        all_selected_ids = {r["coverage_id"] for r in rows if r["coverage_id"]}
        unselected = [c for c in coverage_options if c["id"] not in all_selected_ids]
        if unselected:
            if st.button("Add Coverage", key=f"{prefix}bulk_add_row_{sub_id}"):
                default_val = 100_000 if unselected[0]["type"] == "sublimit" else "full"
                rows.append({"coverage_id": unselected[0]["id"], "value": default_val})
                st.session_state[rows_key] = rows
                st.rerun(scope="fragment")

        st.markdown("---")
        st.markdown("**Apply to:**")

        # Select All / Select None buttons
        col_all, col_none, col_spacer = st.columns([1, 1, 3])
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

        # Option checkboxes
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

        st.markdown("---")

        # Count for button label
        coverage_count = len(rows)
        selected_count = sum(1 for v in st.session_state[selection_key].values() if v)

        # Apply button
        if st.button(
            f"Apply {coverage_count} Coverage{'s' if coverage_count != 1 else ''} to {selected_count} Option{'s' if selected_count != 1 else ''}",
            key=f"{prefix}bulk_apply_{sub_id}",
            type="primary",
            disabled=selected_count == 0 or coverage_count == 0
        ):
            _apply_bulk_coverage_update(
                sub_id, rows, saved_options, coverage_options,
                selection_key, rows_key, prefix, in_modal
            )

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

        if not coverages:
            # Initialize empty coverages structure
            coverages = {
                "policy_form": quote.get("policy_form", "cyber"),
                "aggregate_limit": 0,
                "aggregate_coverages": {},
                "sublimit_coverages": {}
            }

        # Get aggregate limit for "full" resolution
        tower_json = quote.get("tower_json", [])
        aggregate_limit = tower_json[0].get("limit", 1_000_000) if tower_json else 1_000_000

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
    # Clear the rows for next time
    if rows_key in st.session_state:
        del st.session_state[rows_key]

    if in_modal:
        st.session_state[f"show_{prefix}bulk_cov_modal_{sub_id}"] = False
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
    Render both bulk coverage update buttons side by side (Quote tab version).

    Args:
        sub_id: Submission ID
        source_coverages: The current coverage settings to push (actual values from Quote tab)
        source_label: Label for the source (e.g., "this option")
    """
    # Get all primary options for this submission
    all_quotes = list_quotes_for_submission(sub_id)
    primary_options = [q for q in all_quotes if q.get("position", "primary") == "primary"]

    if not primary_options:
        return

    col1, col2 = st.columns(2)

    with col1:
        # Button 1: Single coverage update modal
        _render_single_coverage_button(sub_id, primary_options, key_prefix="quote")

    with col2:
        # Button 2: Push all coverages
        _render_push_all_button(sub_id, primary_options, source_coverages, source_label, key_prefix="quote")


def render_bulk_coverage_buttons_rating(
    sub_id: str,
    policy_form: str,
    sublimit_defaults: dict,
    agg_overrides: dict,
):
    """
    Render both bulk coverage update buttons (Rating tab version).

    Handles symbolic values like "aggregate", "50%" by converting them
    per-option based on each option's aggregate limit.
    """
    # Get all primary options for this submission
    all_quotes = list_quotes_for_submission(sub_id)
    primary_options = [q for q in all_quotes if q.get("position", "primary") == "primary"]

    if not primary_options:
        return

    col1, col2 = st.columns(2)

    with col1:
        # Button 1: Single coverage update modal
        _render_single_coverage_button(sub_id, primary_options, key_prefix="rating")

    with col2:
        # Button 2: Push all coverages from Rating defaults
        _render_push_all_rating_button(sub_id, primary_options, policy_form, sublimit_defaults, agg_overrides)


def _render_single_coverage_button(sub_id: str, saved_options: list[dict], key_prefix: str = ""):
    """Render the coverage update modal button."""
    prefix = f"{key_prefix}_" if key_prefix else ""
    modal_key = f"show_{prefix}bulk_cov_modal_{sub_id}"
    trigger_key = f"{prefix}bulk_cov_modal_triggered_{sub_id}"
    rows_key = f"{prefix}bulk_cov_rows_{sub_id}"

    if st.button("Edit Coverages", key=f"{prefix}bulk_cov_modal_btn_{sub_id}", use_container_width=True):
        st.session_state[trigger_key] = True
        st.session_state[modal_key] = True
        # Reset rows when opening dialog fresh
        if rows_key in st.session_state:
            del st.session_state[rows_key]

    if st.session_state.get(trigger_key, False):
        st.session_state[trigger_key] = False

        @st.dialog("Edit Coverages Across Options", width="large")
        def show_modal():
            _render_bulk_update_ui(sub_id, saved_options, in_modal=True, key_prefix=key_prefix)

        show_modal()


def _render_push_all_button(sub_id: str, primary_options: list[dict], source_coverages: dict, source_label: str, key_prefix: str = ""):
    """Render the push all coverages button (Quote tab version)."""
    prefix = f"{key_prefix}_" if key_prefix else ""
    trigger_key = f"{prefix}push_all_cov_triggered_{sub_id}"

    if st.button("Push All to Options", key=f"{prefix}push_all_cov_btn_{sub_id}", use_container_width=True):
        st.session_state[trigger_key] = True

    if st.session_state.get(trigger_key, False):
        st.session_state[trigger_key] = False

        @st.dialog("Push All Coverages", width="large")
        def show_push_modal():
            _render_push_all_ui(sub_id, primary_options, source_coverages, source_label, key_prefix=key_prefix)

        show_push_modal()


def _render_push_all_rating_button(
    sub_id: str,
    primary_options: list[dict],
    policy_form: str,
    sublimit_defaults: dict,
    agg_overrides: dict,
):
    """Render the push all coverages button (Rating tab version)."""
    trigger_key = f"push_all_rating_triggered_{sub_id}"

    if st.button("Push All to Options", key=f"push_all_rating_btn_{sub_id}", use_container_width=True):
        st.session_state[trigger_key] = True

    if st.session_state.get(trigger_key, False):
        st.session_state[trigger_key] = False

        @st.dialog("Push Rating Defaults to Options", width="large")
        def show_push_modal():
            _render_push_all_rating_ui(sub_id, primary_options, policy_form, sublimit_defaults, agg_overrides)

        show_push_modal()


def _render_push_all_ui(sub_id: str, primary_options: list[dict], source_coverages: dict, source_label: str, key_prefix: str = ""):
    """Render the push all coverages UI."""
    prefix = f"{key_prefix}_" if key_prefix else ""
    st.markdown(f"Push **{source_label}** coverage settings to all primary options.")
    st.markdown("---")

    # Show current coverage summary
    st.markdown("**Coverage settings to push:**")

    sublimit_covs = source_coverages.get("sublimit_coverages", {})
    aggregate_covs = source_coverages.get("aggregate_coverages", {})

    # Build summary
    sub_defs = {c["id"]: c["label"] for c in get_sublimit_coverage_definitions()}
    agg_defs = {c["id"]: c["label"] for c in get_aggregate_coverage_definitions()}

    coverage_items = []
    for cov_id, value in sublimit_covs.items():
        label = sub_defs.get(cov_id, cov_id)
        display = format_limit_display(value) if value else "None"
        coverage_items.append(f"• {label}: {display}")

    for cov_id, value in aggregate_covs.items():
        label = agg_defs.get(cov_id, cov_id)
        display = format_limit_display(value) if value else "None"
        coverage_items.append(f"• {label}: {display}")

    if coverage_items:
        # Show in two columns to save space
        mid = len(coverage_items) // 2 + len(coverage_items) % 2
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("\n".join(coverage_items[:mid]))
        with col2:
            st.markdown("\n".join(coverage_items[mid:]))
    else:
        st.info("No coverage settings to push.")
        return

    st.markdown("---")
    st.markdown(f"**Will update {len(primary_options)} primary option{'s' if len(primary_options) != 1 else ''}:**")

    for opt in primary_options:
        st.markdown(f"• {opt.get('quote_name', 'Unnamed')}")

    st.markdown("---")

    col_cancel, col_apply = st.columns(2)

    with col_cancel:
        if st.button("Cancel", key=f"{prefix}push_all_cancel_{sub_id}", use_container_width=True):
            st.rerun()

    with col_apply:
        if st.button("Push to All", key=f"{prefix}push_all_apply_{sub_id}", type="primary", use_container_width=True):
            updated_count = 0

            for opt in primary_options:
                opt_id = opt["id"]

                # Get fresh quote from database
                quote = get_quote_by_id(opt_id)
                if not quote:
                    continue

                # Get current coverages or initialize
                coverages = quote.get("coverages", {})
                if not coverages:
                    coverages = {
                        "policy_form": source_coverages.get("policy_form", "cyber"),
                        "aggregate_limit": 0,
                        "aggregate_coverages": {},
                        "sublimit_coverages": {}
                    }

                # Update aggregate limit from tower if available
                tower_json = quote.get("tower_json", [])
                if tower_json:
                    coverages["aggregate_limit"] = tower_json[0].get("limit", 1_000_000)

                # Copy all coverage values from source
                coverages["policy_form"] = source_coverages.get("policy_form", coverages.get("policy_form", "cyber"))
                coverages["sublimit_coverages"] = dict(sublimit_covs)
                coverages["aggregate_coverages"] = dict(aggregate_covs)

                # Save to database
                update_quote_field(opt_id, "coverages", coverages)
                updated_count += 1

            st.success(f"Pushed coverage settings to {updated_count} option{'s' if updated_count != 1 else ''}")

            # Clear cached coverages so they reload from DB
            if f"quote_coverages_{sub_id}" in st.session_state:
                del st.session_state[f"quote_coverages_{sub_id}"]
            if f"last_synced_quote_{sub_id}" in st.session_state:
                del st.session_state[f"last_synced_quote_{sub_id}"]
            # Reset the coverage editor to pick up new values
            reset_coverage_editor(f"quote_{sub_id}")

            st.rerun()


def _render_push_all_rating_ui(
    sub_id: str,
    primary_options: list[dict],
    policy_form: str,
    sublimit_defaults: dict,
    agg_overrides: dict,
):
    """Render the push all coverages UI for Rating tab."""
    st.markdown("Push **Rating defaults** to all primary options.")
    st.markdown("_Values like 'Aggregate' and '50%' will be calculated per-option based on each option's limit._")
    st.markdown("---")

    # Show current coverage summary (symbolic values)
    st.markdown("**Coverage settings to push:**")

    sub_defs = {c["id"]: c["label"] for c in get_sublimit_coverage_definitions()}
    agg_defs = {c["id"]: c["label"] for c in get_aggregate_coverage_definitions()}

    # Format sublimit defaults for display
    def format_symbolic(val):
        if val == "aggregate":
            return "Full Limits"
        elif val == "50%":
            return "50% Agg"
        elif val == "none" or val == 0:
            return "None"
        elif isinstance(val, (int, float)):
            return format_limit_display(int(val))
        return str(val)

    coverage_items = []

    # Variable/sublimit coverages
    for cov in get_sublimit_coverage_definitions():
        cov_id = cov["id"]
        label = cov["label"]
        config_default = cov.get("default", 0)
        form_setting = cov.get(policy_form, 0)

        if form_setting != "sublimit":
            coverage_items.append(f"• {label}: None")
        else:
            val = sublimit_defaults.get(cov_id, config_default)
            coverage_items.append(f"• {label}: {format_symbolic(val)}")

    # Aggregate/standard coverages
    for cov in get_aggregate_coverage_definitions():
        cov_id = cov["id"]
        label = cov["label"]
        form_default = cov.get(policy_form, 0)
        default_status = "Aggregate" if form_default == "aggregate" else "None"
        override = agg_overrides.get(cov_id, default_status)

        if override == "Aggregate":
            display = "Full Limits"
        elif override == "$1M":
            display = "$1M"
        elif override == "None":
            display = "None"
        else:
            display = "Full Limits" if form_default == "aggregate" else "None"
        coverage_items.append(f"• {label}: {display}")

    if coverage_items:
        mid = len(coverage_items) // 2 + len(coverage_items) % 2
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("\n".join(coverage_items[:mid]))
        with col2:
            st.markdown("\n".join(coverage_items[mid:]))

    st.markdown("---")
    st.markdown(f"**Will update {len(primary_options)} primary option{'s' if len(primary_options) != 1 else ''}:**")

    for opt in primary_options:
        tower_json = opt.get("tower_json", [])
        opt_limit = tower_json[0].get("limit", 1_000_000) if tower_json else 1_000_000
        st.markdown(f"• {opt.get('quote_name', 'Unnamed')} ({format_limit_display(opt_limit)} limit)")

    st.markdown("---")

    col_cancel, col_apply = st.columns(2)

    with col_cancel:
        if st.button("Cancel", key=f"push_rating_cancel_{sub_id}", use_container_width=True):
            st.rerun()

    with col_apply:
        if st.button("Push to All", key=f"push_rating_apply_{sub_id}", type="primary", use_container_width=True):
            updated_count = 0

            for opt in primary_options:
                opt_id = opt["id"]

                # Get option's aggregate limit from tower
                tower_json = opt.get("tower_json", [])
                aggregate_limit = tower_json[0].get("limit", 1_000_000) if tower_json else 1_000_000

                # Build coverages for this option using Rating defaults
                new_coverages = build_coverages_for_option_from_rating(
                    sub_id, aggregate_limit, policy_form, sublimit_defaults, agg_overrides
                )

                # Save to database
                update_quote_field(opt_id, "coverages", new_coverages)
                updated_count += 1

            st.success(f"Pushed Rating defaults to {updated_count} option{'s' if updated_count != 1 else ''}")

            # Clear cached coverages so they reload from DB
            if f"quote_coverages_{sub_id}" in st.session_state:
                del st.session_state[f"quote_coverages_{sub_id}"]
            if f"last_synced_quote_{sub_id}" in st.session_state:
                del st.session_state[f"last_synced_quote_{sub_id}"]
            # Reset the coverage editor to pick up new values
            reset_coverage_editor(f"quote_{sub_id}")

            st.rerun()
