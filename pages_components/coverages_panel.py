"""
Coverages Panel for Quote Tab

Inherits coverage configuration from Rating tab and applies option-specific limits.
Shows the full coverage schedule for PDF generation.
"""
from __future__ import annotations

import streamlit as st
from typing import Optional

from rating_engine.coverage_config import (
    get_policy_forms,
    get_default_policy_form,
    get_coverages_for_form,
    get_aggregate_coverage_definitions,
    get_sublimit_coverage_definitions,
    format_limit_display,
    validate_sublimit,
)
from pages_components.tower_db import update_quote_field
from pages_components.bulk_coverage_update import render_bulk_coverage_buttons


def render_coverages_panel(
    sub_id: str,
    expanded: bool = False,
    saved_coverages: Optional[dict] = None,
):
    """
    Render the coverages panel for Quote tab.
    Inherits from Rating tab config, applies option-specific limit.
    """
    # Get the selected limit for this option
    aggregate_limit = st.session_state.get(f"selected_limit_{sub_id}", 1_000_000)

    with st.expander("Coverage Schedule", expanded=expanded):
        # Initialize from Rating tab or saved quote (only if not already set)
        session_key = f"quote_coverages_{sub_id}"

        # Only initialize if not already in session state - preserves edits
        if session_key not in st.session_state:
            st.session_state[session_key] = build_coverages_from_rating(sub_id, aggregate_limit)
            # Clear widget keys so selectboxes use fresh values from coverages
            _clear_coverage_widget_keys(sub_id)

        coverages = st.session_state[session_key]

        # Update if aggregate limit changed
        stored_limit = coverages.get("aggregate_limit", 0)
        if stored_limit != aggregate_limit:
            coverages = _update_for_new_limit(coverages, aggregate_limit, sub_id)
            st.session_state[session_key] = coverages
            _clear_coverage_widget_keys(sub_id)

        # Sync widget keys with coverages only when viewing a different quote option
        # This prevents overwriting user edits while still syncing on option switch
        current_quote_id = st.session_state.get("viewing_quote_id")
        last_synced_quote_key = f"last_synced_quote_{sub_id}"
        last_synced_quote = st.session_state.get(last_synced_quote_key)

        if current_quote_id != last_synced_quote:
            # Option changed - sync widget keys to match loaded coverages
            _sync_widget_keys_with_coverages(sub_id, coverages, aggregate_limit)
            st.session_state[last_synced_quote_key] = current_quote_id

        # Header
        form_label = _get_form_label(coverages.get("policy_form", "cyber"))
        st.caption(f"Policy Form: {form_label} · Limit: {format_limit_display(aggregate_limit)}")

        # Two-column layout: Edit tabs on left, Summary on right (same as Rating tab)
        col_edit, col_summary = st.columns([1, 1])

        # Process edit column FIRST to update session state
        with col_edit:
            tab_var, tab_std = st.tabs(["Variable Limits", "Standard Limits"])

            with tab_var:
                _render_variable_limits_edit(sub_id, coverages, aggregate_limit)

            with tab_std:
                _render_standard_limits_edit(sub_id, coverages, aggregate_limit)

        # Then render summary using updated values
        with col_summary:
            st.markdown("**Summary**")
            _render_summary(coverages, aggregate_limit)

            # Bulk update buttons
            st.markdown("---")
            render_bulk_coverage_buttons(sub_id, coverages, "this option")


def build_coverages_from_rating(sub_id: str, aggregate_limit: int) -> dict:
    """Build coverages dict from Rating tab session state."""
    # Get policy form from Rating tab
    policy_form = st.session_state.get(f"policy_form_{sub_id}", get_default_policy_form())

    # Sublimit options (must match coverage_summary_panel.py)
    sublimit_options = [
        ("$100K", 100_000),
        ("$250K", 250_000),
        ("$500K", 500_000),
        ("$1M", 1_000_000),
        ("50% of Aggregate", "50%"),
        ("Aggregate", "aggregate"),
        ("None", "none"),
    ]
    sublimit_values = [o[1] for o in sublimit_options]

    # Get aggregate overrides dict (updated by coverage_summary_panel on each render)
    agg_overrides = st.session_state.get(f"agg_overrides_{sub_id}", {})

    # Build aggregate coverages with actual dollar amounts
    aggregate_coverages = {}
    for cov in get_aggregate_coverage_definitions():
        cov_id = cov["id"]
        form_default = cov.get(policy_form, 0)

        # Try widget key first - stores display string like "Full Limits"
        widget_key = f"agg_{sub_id}_{policy_form}_{cov_id}"
        widget_val = st.session_state.get(widget_key)

        override = None
        if widget_val is not None and isinstance(widget_val, str):
            # Widget stores display values, map to storage values
            display_to_storage = {"Full Limits": "Aggregate", "$1M": "$1M", "No Coverage": "None"}
            override = display_to_storage.get(widget_val)

        # Fallback to agg_overrides dict (populated on previous rerun)
        if override is None:
            override = agg_overrides.get(cov_id)

        if override:
            if override == "Aggregate":
                aggregate_coverages[cov_id] = aggregate_limit
            elif override == "$1M":
                aggregate_coverages[cov_id] = 1_000_000
            elif override == "None":
                aggregate_coverages[cov_id] = 0
            else:
                aggregate_coverages[cov_id] = aggregate_limit if form_default == "aggregate" else 0
        else:
            # Use form default
            aggregate_coverages[cov_id] = aggregate_limit if form_default == "aggregate" else 0

    # Get sublimit defaults dict (updated by coverage_summary_panel on each render)
    sublimit_defaults = st.session_state.get(f"sublimit_defaults_{sub_id}", {})

    # Build sublimit coverages with actual dollar amounts
    sublimit_coverages = {}
    for cov in get_sublimit_coverage_definitions():
        cov_id = cov["id"]
        config_default = cov.get("default", 0)
        form_setting = cov.get(policy_form, 0)

        if form_setting != "sublimit":
            sublimit_coverages[cov_id] = 0
            continue

        # Try widget key first (for immediate reads during same rerun)
        widget_key = f"sub_{sub_id}_{policy_form}_{cov_id}"
        widget_idx = st.session_state.get(widget_key)

        rating_val = None
        if widget_idx is not None:
            try:
                if isinstance(widget_idx, int) and widget_idx < len(sublimit_values):
                    rating_val = sublimit_values[widget_idx]
            except (TypeError, IndexError):
                pass

        # Fallback to sublimit_defaults (populated on previous rerun)
        if rating_val is None:
            rating_val = sublimit_defaults.get(cov_id, config_default)

        # Convert percentage-based values to actual amounts
        if rating_val == "50%":
            sublimit_coverages[cov_id] = aggregate_limit // 2
        elif rating_val == "aggregate":
            sublimit_coverages[cov_id] = aggregate_limit
        elif rating_val == "none":
            sublimit_coverages[cov_id] = 0
        elif isinstance(rating_val, (int, float)):
            sublimit_coverages[cov_id] = min(int(rating_val), aggregate_limit)
        else:
            sublimit_coverages[cov_id] = min(config_default, aggregate_limit)

    return {
        "policy_form": policy_form,
        "aggregate_limit": aggregate_limit,
        "aggregate_coverages": aggregate_coverages,
        "sublimit_coverages": sublimit_coverages,
    }


def _update_for_new_limit(coverages: dict, new_limit: int, sub_id: str) -> dict:
    """Update coverages when aggregate limit changes."""
    # Rebuild from Rating tab with new limit
    return build_coverages_from_rating(sub_id, new_limit)


def _clear_coverage_widget_keys(sub_id: str):
    """Clear all coverage-related widget keys so selectboxes use fresh values."""
    keys_to_clear = [k for k in list(st.session_state.keys())
                     if k.startswith(f"quote_sublimit_{sub_id}_")
                     or k.startswith(f"quote_agg_{sub_id}_")]
    for k in keys_to_clear:
        del st.session_state[k]


def _sync_widget_keys_with_coverages(sub_id: str, coverages: dict, aggregate_limit: int):
    """
    Sync widget keys with coverages values.
    Set widget keys to match coverages so selectboxes show correct values.
    """
    sub_values = coverages.get("sublimit_coverages", {})
    agg_values = coverages.get("aggregate_coverages", {})

    # Variable limits options (must match order in _render_variable_limits_edit)
    var_options = [100_000, 250_000, 500_000, 1_000_000, aggregate_limit // 2, aggregate_limit, 0]

    # Set sublimit widget keys to correct index
    for cov in get_sublimit_coverage_definitions():
        cov_id = cov["id"]
        widget_key = f"quote_sublimit_{sub_id}_{cov_id}"
        coverage_val = sub_values.get(cov_id, 0)

        # Find correct index for this coverage value
        if coverage_val in var_options:
            correct_idx = var_options.index(coverage_val)
        elif coverage_val == 0:
            correct_idx = var_options.index(0)
        else:
            correct_idx = 0

        # Set widget key to correct index (will be used by selectbox)
        st.session_state[widget_key] = correct_idx

    # Standard limits options (must match order in _render_standard_limits_edit)
    std_options = [aggregate_limit, 1_000_000, 0]

    # Set aggregate widget keys to correct index
    for cov in get_aggregate_coverage_definitions():
        cov_id = cov["id"]
        widget_key = f"quote_agg_{sub_id}_{cov_id}"
        coverage_val = agg_values.get(cov_id, 0)

        # Find correct index for this coverage value
        if coverage_val in std_options:
            correct_idx = std_options.index(coverage_val)
        elif coverage_val == aggregate_limit:
            correct_idx = 0
        elif coverage_val == 0:
            correct_idx = 2
        else:
            correct_idx = 0

        # Set widget key to correct index (will be used by selectbox)
        st.session_state[widget_key] = correct_idx


def _get_form_label(form_id: str) -> str:
    """Get display label for policy form."""
    forms = get_policy_forms()
    for f in forms:
        if f["id"] == form_id:
            return f["label"]
    return form_id


def _render_summary(coverages: dict, aggregate_limit: int):
    """Render summary showing only Sub Limit and No Coverage (Full Limits assumed for rest)."""
    agg_values = coverages.get("aggregate_coverages", {})
    sub_values = coverages.get("sublimit_coverages", {})

    # Get coverage definitions for labels
    agg_defs = {c["id"]: c["label"] for c in get_aggregate_coverage_definitions()}
    sub_defs = {c["id"]: c["label"] for c in get_sublimit_coverage_definitions()}

    # Group coverages - only track sublimits and no coverage
    sublimits = []
    no_coverage = []

    # Process aggregate coverages
    for cov_id, value in agg_values.items():
        label = agg_defs.get(cov_id, cov_id)
        if value == 0:
            no_coverage.append(label)
        elif value != aggregate_limit:
            # Not full limit - it's a sublimit
            sublimits.append((label, value))

    # Process variable/sublimit coverages
    for cov_id, value in sub_values.items():
        label = sub_defs.get(cov_id, cov_id)
        if value == 0:
            no_coverage.append(label)
        elif value != aggregate_limit:
            # Not full limit - it's a sublimit
            sublimits.append((label, value))

    # Display only Sub Limit and No Coverage (Full Limits assumed for anything not listed)
    if sublimits:
        items = "".join([f"<div>{label} - {format_limit_display(value)}</div>" for label, value in sublimits])
        st.markdown(f"<div><strong>Sub Limit:</strong>{items}</div>", unsafe_allow_html=True)

    if no_coverage:
        items = "".join([f"<div>{label}</div>" for label in no_coverage])
        margin = "margin-top: 1em;" if sublimits else ""
        st.markdown(f"<div style='{margin}'><strong>No Coverage:</strong>{items}</div>", unsafe_allow_html=True)

    if not sublimits and not no_coverage:
        st.markdown("_All coverages at Full Limits_")


def _render_variable_limits_edit(sub_id: str, coverages: dict, aggregate_limit: int):
    """Render variable/sublimit coverages edit mode with dropdowns."""
    session_key = f"quote_coverages_{sub_id}"
    sub_defs = get_sublimit_coverage_definitions()
    sub_values = coverages.get("sublimit_coverages", {})

    # Check if we're editing a saved quote
    quote_id = st.session_state.get("viewing_quote_id")

    # Options for dropdown
    options = [
        ("$100K", 100_000),
        ("$250K", 250_000),
        ("$500K", 500_000),
        ("$1M", 1_000_000),
        ("50% Agg", aggregate_limit // 2),
        ("Aggregate", aggregate_limit),
        ("None", 0),
    ]
    option_labels = [o[0] for o in options]
    option_values = [o[1] for o in options]

    for cov in sub_defs:
        cov_id = cov["id"]
        label = cov["label"]
        current_val = sub_values.get(cov_id, 0)

        # Find matching option index
        if current_val in option_values:
            idx = option_values.index(current_val)
        elif current_val == 0:
            idx = option_values.index(0)
        else:
            idx = 0

        new_idx = st.selectbox(
            label,
            options=range(len(options)),
            index=idx,
            format_func=lambda i: option_labels[i],
            key=f"quote_sublimit_{sub_id}_{cov_id}",
        )

        new_val = option_values[new_idx]

        # Update if changed
        if new_val != current_val:
            coverages["sublimit_coverages"][cov_id] = new_val
            st.session_state[session_key] = coverages
            # Save to database if editing a saved quote
            if quote_id:
                update_quote_field(quote_id, "coverages", coverages)


def _render_standard_limits_edit(sub_id: str, coverages: dict, aggregate_limit: int):
    """Render standard/aggregate coverages edit mode with dropdowns."""
    session_key = f"quote_coverages_{sub_id}"
    agg_defs = get_aggregate_coverage_definitions()
    agg_values = coverages.get("aggregate_coverages", {})

    # Check if we're editing a saved quote
    quote_id = st.session_state.get("viewing_quote_id")

    # Options for edit mode
    options = [
        ("Full Limits", aggregate_limit),
        ("$1M", 1_000_000),
        ("No Coverage", 0),
    ]
    option_labels = [o[0] for o in options]
    option_values = [o[1] for o in options]

    # Build coverage list - Tech E&O first
    coverage_list = []
    for cov in agg_defs:
        if cov["id"] == "tech_eo":
            coverage_list.insert(0, cov)
        else:
            coverage_list.append(cov)

    for cov in coverage_list:
        cov_id = cov["id"]
        label = cov["label"]
        current_val = agg_values.get(cov_id, 0)

        # Find matching option index
        if current_val in option_values:
            idx = option_values.index(current_val)
        elif current_val == aggregate_limit:
            idx = 0
        elif current_val == 0:
            idx = 2
        else:
            idx = 0

        new_idx = st.selectbox(
            label,
            options=range(len(options)),
            index=idx,
            format_func=lambda i: option_labels[i],
            key=f"quote_agg_{sub_id}_{cov_id}",
        )

        new_val = option_values[new_idx]

        # Update if changed
        if new_val != current_val:
            coverages["aggregate_coverages"][cov_id] = new_val
            st.session_state[session_key] = coverages
            # Save to database if editing a saved quote
            if quote_id:
                update_quote_field(quote_id, "coverages", coverages)


# Keep old functions for backward compatibility but they're no longer used
def _render_variable_limits(sub_id: str, coverages: dict, aggregate_limit: int):
    """Render variable/sublimit coverages - list view with edit toggle."""
    session_key = f"quote_coverages_{sub_id}"
    sub_defs = get_sublimit_coverage_definitions()
    sub_values = coverages.get("sublimit_coverages", {})
    policy_form = coverages.get("policy_form", "cyber")

    # Edit toggle
    edit_key = f"edit_quote_sub_{sub_id}"
    if edit_key not in st.session_state:
        st.session_state[edit_key] = False

    # Options for edit mode
    options = [
        ("$100K", 100_000),
        ("$250K", 250_000),
        ("$500K", 500_000),
        ("$1M", 1_000_000),
        ("50% Agg", aggregate_limit // 2),
        ("Aggregate", aggregate_limit),
        ("None", 0),
    ]
    option_labels = [o[0] for o in options]
    option_values = [o[1] for o in options]

    if not st.session_state[edit_key]:
        # Edit button
        if st.button("Edit", key=f"edit_quote_sub_btn_{sub_id}"):
            st.session_state[edit_key] = True
            st.rerun()

        # List view - display current values as text
        for cov in sub_defs:
            cov_id = cov["id"]
            label = cov["label"]
            current_val = sub_values.get(cov_id, 0)

            # Format display value
            if current_val == 0:
                display = "None"
            elif current_val == aggregate_limit:
                display = "Aggregate"
            elif current_val == aggregate_limit // 2:
                display = "50% Agg"
            else:
                display = format_limit_display(current_val)

            st.markdown(f"{label}: {display}")
    else:
        # Done button
        if st.button("Done", key=f"done_quote_sub_btn_{sub_id}"):
            st.session_state[edit_key] = False
            st.rerun()

        # Edit view with dropdowns
        for cov in sub_defs:
            cov_id = cov["id"]
            label = cov["label"]
            current_val = sub_values.get(cov_id, 0)

            # Find matching option index
            if current_val in option_values:
                idx = option_values.index(current_val)
            elif current_val == 0:
                idx = option_values.index(0)  # None
            else:
                idx = 0

            new_idx = st.selectbox(
                label,
                options=range(len(options)),
                index=idx,
                format_func=lambda i: option_labels[i],
                key=f"quote_sublimit_{sub_id}_{cov_id}",
            )

            new_val = option_values[new_idx]

            # Update if changed
            if new_val != current_val:
                coverages["sublimit_coverages"][cov_id] = new_val
                st.session_state[session_key] = coverages


def _render_standard_limits(sub_id: str, coverages: dict, aggregate_limit: int):
    """Render standard/aggregate coverages - grouped summary view with edit toggle."""
    session_key = f"quote_coverages_{sub_id}"
    agg_defs = get_aggregate_coverage_definitions()
    agg_values = coverages.get("aggregate_coverages", {})

    # Edit toggle
    edit_key = f"edit_quote_agg_{sub_id}"
    if edit_key not in st.session_state:
        st.session_state[edit_key] = False

    # Options for edit mode
    options = [
        ("Full Limits", aggregate_limit),
        ("$1M", 1_000_000),
        ("No Coverage", 0),
    ]
    option_labels = [o[0] for o in options]
    option_values = [o[1] for o in options]

    # Build coverage list - Tech E&O first
    coverage_list = []
    for cov in agg_defs:
        if cov["id"] == "tech_eo":
            coverage_list.insert(0, cov)
        else:
            coverage_list.append(cov)

    if not st.session_state[edit_key]:
        # Edit button
        if st.button("Edit", key=f"edit_quote_btn_{sub_id}"):
            st.session_state[edit_key] = True
            st.rerun()

        # Group coverages by value
        full_limits = []
        sublimits = []  # coverages with values between 0 and aggregate
        no_coverage = []

        for cov in coverage_list:
            cov_id = cov["id"]
            label = cov["label"]
            value = agg_values.get(cov_id, 0)

            if value == 0:
                no_coverage.append(label)
            elif value == aggregate_limit:
                full_limits.append(label)
            else:
                sublimits.append((label, value))

        # Display grouped summary (combined to remove spacing)
        if full_limits:
            items = "  \n".join(full_limits)
            st.markdown(f"**Full Limits:**  \n{items}")

        if sublimits:
            items = "  \n".join([f"{label} - {format_limit_display(value)}" for label, value in sublimits])
            st.markdown(f"**Sub Limit:**  \n{items}")

        if no_coverage:
            items = "  \n".join(no_coverage)
            st.markdown(f"**No Coverage:**  \n{items}")
    else:
        # Done button
        if st.button("Done", key=f"done_quote_btn_{sub_id}"):
            st.session_state[edit_key] = False
            st.rerun()

        # Edit view
        for cov in coverage_list:
            cov_id = cov["id"]
            label = cov["label"]
            current_val = agg_values.get(cov_id, 0)

            # Find matching option
            if current_val in option_values:
                idx = option_values.index(current_val)
            elif current_val == aggregate_limit:
                idx = 0  # Full Limits
            elif current_val == 0:
                idx = 2  # No Coverage
            else:
                idx = 0

            new_idx = st.selectbox(
                label,
                options=range(len(options)),
                index=idx,
                format_func=lambda i: option_labels[i],
                key=f"quote_agg_{sub_id}_{cov_id}",
            )

            new_val = option_values[new_idx]

            # Update if changed
            if new_val != current_val:
                coverages["aggregate_coverages"][cov_id] = new_val
                st.session_state[session_key] = coverages


# ─────────────────────── Export for Quote Generation ───────────────────────

def get_coverages_for_quote(sub_id: str) -> dict:
    """
    Get coverages formatted for quote PDF generation.
    """
    session_key = f"quote_coverages_{sub_id}"
    coverages = st.session_state.get(session_key, {})

    if not coverages:
        aggregate_limit = st.session_state.get(f"selected_limit_{sub_id}", 1_000_000)
        coverages = build_coverages_from_rating(sub_id, aggregate_limit)

    policy_form = coverages.get("policy_form", "cyber")
    agg_values = coverages.get("aggregate_coverages", {})
    sub_values = coverages.get("sublimit_coverages", {})

    aggregate_list = []
    sublimit_list = []
    all_covs = {}

    # Process aggregate coverages - Tech E&O first
    agg_defs = get_aggregate_coverage_definitions()
    ordered_defs = []
    for cov in agg_defs:
        if cov["id"] == "tech_eo":
            ordered_defs.insert(0, cov)
        else:
            ordered_defs.append(cov)

    for cov in ordered_defs:
        cov_id = cov["id"]
        label = cov["label"]
        value = agg_values.get(cov_id, 0)
        aggregate_list.append((label, value))
        all_covs[label] = value

    # Process sublimit coverages
    for cov in get_sublimit_coverage_definitions():
        cov_id = cov["id"]
        label = cov["label"]
        value = sub_values.get(cov_id, 0)
        sublimit_list.append((label, value))
        all_covs[label] = value

    return {
        "policy_form": policy_form,
        "aggregate_coverages": aggregate_list,
        "sublimit_coverages": sublimit_list,
        "all_coverages": all_covs,
        "raw": coverages,
    }


def load_coverages_from_db(coverages_json: Optional[dict]) -> Optional[dict]:
    """Load and validate coverages from database JSON."""
    if not coverages_json:
        return None

    required_keys = ["policy_form", "aggregate_coverages", "sublimit_coverages"]
    if not all(k in coverages_json for k in required_keys):
        return None

    return coverages_json
