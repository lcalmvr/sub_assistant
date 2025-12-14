"""
Bulk Coverage Update Component

Allows updating a specific coverage across multiple quote options at once.
Can be rendered as an expander or in a modal dialog.
"""
from __future__ import annotations

import streamlit as st
from typing import Optional

from rating_engine.coverage_config import (
    get_sublimit_coverage_definitions,
    get_aggregate_coverage_definitions,
    format_limit_display,
)
from pages_components.tower_db import update_quote_field, get_quote_by_id


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

    # Modal trigger button - set a trigger flag
    if st.button("Update Coverage Across Options", key=f"bulk_cov_modal_btn_{sub_id}"):
        st.session_state[trigger_key] = True
        st.session_state[modal_key] = True

    # Only show modal if it was just triggered (not on random reruns)
    if st.session_state.get(trigger_key, False):
        # Clear the trigger immediately so it doesn't persist
        st.session_state[trigger_key] = False

        @st.dialog("Update Coverage Across Options", width="large")
        def show_modal():
            _render_bulk_update_ui(sub_id, saved_options, in_modal=True)

        show_modal()


def _render_bulk_update_ui(sub_id: str, saved_options: list[dict], in_modal: bool = False):
    """Render the bulk update UI (shared between expander and modal)."""

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

    coverage_labels = [c["label"] for c in coverage_options]

    # Coverage selector
    col1, col2 = st.columns(2)

    with col1:
        selected_coverage_label = st.selectbox(
            "Coverage",
            options=coverage_labels,
            key=f"bulk_cov_select_{sub_id}"
        )
        selected_coverage = next(c for c in coverage_options if c["label"] == selected_coverage_label)

    # Value options depend on coverage type
    with col2:
        if selected_coverage["type"] == "sublimit":
            value_options = [
                ("$100K", 100_000),
                ("$250K", 250_000),
                ("$500K", 500_000),
                ("$1M", 1_000_000),
                ("None", 0),
            ]
        else:
            value_options = [
                ("Full Limits", "full"),  # Will be resolved per-option based on aggregate
                ("$1M", 1_000_000),
                ("No Coverage", 0),
            ]

        value_labels = [v[0] for v in value_options]
        selected_value_label = st.selectbox(
            "New Value",
            options=value_labels,
            key=f"bulk_val_select_{sub_id}"
        )
        selected_value = next(v[1] for v in value_options if v[0] == selected_value_label)

    st.markdown("---")
    st.markdown("**Apply to:**")

    # Initialize selection state
    selection_key = f"bulk_cov_selections_{sub_id}"
    if selection_key not in st.session_state:
        st.session_state[selection_key] = {opt["id"]: True for opt in saved_options}

    # Select All / Select None buttons
    col_all, col_none, col_spacer = st.columns([1, 1, 3])
    with col_all:
        if st.button("Select All", key=f"bulk_select_all_{sub_id}", use_container_width=True):
            st.session_state[selection_key] = {opt["id"]: True for opt in saved_options}
            st.rerun()
    with col_none:
        if st.button("Select None", key=f"bulk_select_none_{sub_id}", use_container_width=True):
            st.session_state[selection_key] = {opt["id"]: False for opt in saved_options}
            st.rerun()

    # Option checkboxes with current values
    st.markdown("")  # Spacing

    for opt in saved_options:
        opt_id = opt["id"]
        opt_name = opt.get("quote_name", f"Option {opt_id[:8]}")

        # Get current value for this coverage
        coverages = opt.get("coverages", {})
        if selected_coverage["type"] == "sublimit":
            current_val = coverages.get("sublimit_coverages", {}).get(selected_coverage["id"], 0)
        else:
            current_val = coverages.get("aggregate_coverages", {}).get(selected_coverage["id"], 0)

        current_display = format_limit_display(current_val) if current_val else "None"

        # Checkbox with current value shown
        col_check, col_current = st.columns([3, 1])
        with col_check:
            is_selected = st.checkbox(
                opt_name,
                value=st.session_state[selection_key].get(opt_id, True),
                key=f"bulk_opt_{sub_id}_{opt_id}"
            )
            st.session_state[selection_key][opt_id] = is_selected
        with col_current:
            st.caption(f"Current: {current_display}")

    st.markdown("---")

    # Count selected
    selected_count = sum(1 for v in st.session_state[selection_key].values() if v)

    # Apply button
    if st.button(
        f"Apply to {selected_count} Option{'s' if selected_count != 1 else ''}",
        key=f"bulk_apply_{sub_id}",
        type="primary",
        disabled=selected_count == 0
    ):
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

            # Determine the actual value to set
            actual_value = selected_value
            if selected_value == "full":
                # Get aggregate limit from tower_json
                tower_json = quote.get("tower_json", [])
                if tower_json:
                    actual_value = tower_json[0].get("limit", 1_000_000)
                else:
                    actual_value = 1_000_000

            # Update the coverage
            if selected_coverage["type"] == "sublimit":
                if "sublimit_coverages" not in coverages:
                    coverages["sublimit_coverages"] = {}
                coverages["sublimit_coverages"][selected_coverage["id"]] = actual_value
            else:
                if "aggregate_coverages" not in coverages:
                    coverages["aggregate_coverages"] = {}
                coverages["aggregate_coverages"][selected_coverage["id"]] = actual_value

            # Save to database
            update_quote_field(opt_id, "coverages", coverages)
            updated_count += 1

        st.success(f"Updated {selected_coverage_label} to {selected_value_label} on {updated_count} option{'s' if updated_count != 1 else ''}")

        # Clear the viewing quote to force reload
        if "viewing_quote_id" in st.session_state:
            # Clear cached coverages so they reload from DB
            if f"quote_coverages_{sub_id}" in st.session_state:
                del st.session_state[f"quote_coverages_{sub_id}"]
            if f"last_synced_quote_{sub_id}" in st.session_state:
                del st.session_state[f"last_synced_quote_{sub_id}"]

        if in_modal:
            st.session_state[f"show_bulk_cov_modal_{sub_id}"] = False
            st.rerun()
