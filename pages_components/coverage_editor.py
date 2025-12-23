"""
Reusable Coverage Editor Component

Extracted from coverages_panel.py to support multiple contexts:
- Quote tab: Edit coverages for quote options (pre-bind)
- Endorsement modal: Edit coverages for mid-term changes (post-bind)

Modes:
- "edit": Full editing, updates session state
- "readonly": Display only, no editing
- "diff": Edit with change tracking, highlights differences from original
"""
from __future__ import annotations

import streamlit as st
from typing import Optional, Callable
import copy

from rating_engine.coverage_config import (
    get_aggregate_coverage_definitions,
    get_sublimit_coverage_definitions,
    format_limit_display,
)


def render_coverage_editor(
    editor_id: str,
    current_coverages: dict,
    aggregate_limit: int,
    mode: str = "edit",
    original_coverages: Optional[dict] = None,
    on_change: Optional[Callable[[dict], None]] = None,
    show_header: bool = True,
) -> dict:
    """
    Reusable coverage editor component.

    Args:
        editor_id: Unique identifier for this editor instance (for session state keys)
        current_coverages: Starting coverage state
        aggregate_limit: Policy aggregate limit
        mode: "edit" | "readonly" | "diff"
        original_coverages: For diff mode - the baseline to compare against
        on_change: Callback when coverages change (receives updated coverages dict)
        show_header: Whether to show the policy form header

    Returns:
        Updated coverages dict
    """
    # Initialize working copy in session state
    session_key = f"coverage_editor_{editor_id}"

    if session_key not in st.session_state:
        st.session_state[session_key] = copy.deepcopy(current_coverages)

    coverages = st.session_state[session_key]

    # Header
    if show_header:
        form_label = _get_form_label(coverages.get("policy_form", "cyber"))
        st.caption(f"Policy Form: {form_label} · Aggregate: {format_limit_display(aggregate_limit)}")

    if mode == "readonly":
        _render_readonly(coverages, aggregate_limit)
    elif mode == "diff":
        coverages = _render_diff_mode(
            editor_id, coverages, aggregate_limit, original_coverages, on_change
        )
    else:  # edit mode
        coverages = _render_edit_mode(editor_id, coverages, aggregate_limit, on_change)

    # Update session state
    st.session_state[session_key] = coverages

    return coverages


def render_coverage_summary(
    coverages: dict,
    aggregate_limit: int,
    original_coverages: Optional[dict] = None,
    compact: bool = False,
) -> None:
    """
    Render a summary view of coverages.

    Args:
        coverages: Coverage dict to display
        aggregate_limit: Policy aggregate limit
        original_coverages: If provided, shows changes from original
        compact: If True, renders more compact layout
    """
    agg_values = coverages.get("aggregate_coverages", {})
    sub_values = coverages.get("sublimit_coverages", {})

    orig_agg = original_coverages.get("aggregate_coverages", {}) if original_coverages else {}
    orig_sub = original_coverages.get("sublimit_coverages", {}) if original_coverages else {}

    # Get coverage definitions for labels
    agg_defs = {c["id"]: c["label"] for c in get_aggregate_coverage_definitions()}
    sub_defs = {c["id"]: c["label"] for c in get_sublimit_coverage_definitions()}

    # Group coverages
    sublimits = []
    no_coverage = []
    changes = []

    # Process aggregate coverages
    for cov_id, value in agg_values.items():
        label = agg_defs.get(cov_id, cov_id)
        orig_value = orig_agg.get(cov_id)

        if original_coverages and orig_value is not None and value != orig_value:
            changes.append((label, orig_value, value))
        elif value == 0:
            no_coverage.append(label)
        elif value != aggregate_limit:
            sublimits.append((label, value))

    # Process sublimit coverages
    for cov_id, value in sub_values.items():
        label = sub_defs.get(cov_id, cov_id)
        orig_value = orig_sub.get(cov_id)

        if original_coverages and orig_value is not None and value != orig_value:
            changes.append((label, orig_value, value))
        elif value == 0:
            no_coverage.append(label)
        elif value != aggregate_limit:
            sublimits.append((label, value))

    # Display
    if changes:
        st.markdown("**Changes:**")
        for label, old_val, new_val in changes:
            old_str = format_limit_display(old_val) if old_val else "None"
            new_str = format_limit_display(new_val) if new_val else "None"
            st.markdown(f"• {label}: {old_str} → {new_str}")

    if sublimits and not compact:
        items = "".join([f"<div>{label} - {format_limit_display(value)}</div>" for label, value in sublimits])
        st.markdown(f"<div><strong>Sub Limits:</strong>{items}</div>", unsafe_allow_html=True)

    if no_coverage and not compact:
        items = "".join([f"<div>{label}</div>" for label in no_coverage])
        margin = "margin-top: 1em;" if sublimits else ""
        st.markdown(f"<div style='{margin}'><strong>No Coverage:</strong>{items}</div>", unsafe_allow_html=True)

    if not sublimits and not no_coverage and not changes:
        st.markdown("_All coverages at Full Limits_")


def compute_coverage_changes(original: dict, updated: dict) -> dict:
    """
    Compute the delta between original and updated coverages.

    Returns a change_details dict suitable for storing in endorsement.

    Args:
        original: Original coverage state
        updated: Updated coverage state

    Returns:
        Dict with structure:
        {
            "aggregate_limit": {"old": X, "new": Y},  # if changed
            "aggregate_coverages": {
                "coverage_id": {"old": X, "new": Y},
                ...
            },
            "sublimit_coverages": {
                "coverage_id": {"old": X, "new": Y},
                ...
            }
        }
    """
    changes = {}

    # Check aggregate limit
    orig_limit = original.get("aggregate_limit", 0)
    new_limit = updated.get("aggregate_limit", 0)
    if orig_limit != new_limit:
        changes["aggregate_limit"] = {"old": orig_limit, "new": new_limit}

    # Check aggregate coverages
    orig_agg = original.get("aggregate_coverages", {})
    new_agg = updated.get("aggregate_coverages", {})
    agg_changes = {}

    for cov_id in set(orig_agg.keys()) | set(new_agg.keys()):
        orig_val = orig_agg.get(cov_id, 0)
        new_val = new_agg.get(cov_id, 0)
        if orig_val != new_val:
            agg_changes[cov_id] = {"old": orig_val, "new": new_val}

    if agg_changes:
        changes["aggregate_coverages"] = agg_changes

    # Check sublimit coverages
    orig_sub = original.get("sublimit_coverages", {})
    new_sub = updated.get("sublimit_coverages", {})
    sub_changes = {}

    for cov_id in set(orig_sub.keys()) | set(new_sub.keys()):
        orig_val = orig_sub.get(cov_id, 0)
        new_val = new_sub.get(cov_id, 0)
        if orig_val != new_val:
            sub_changes[cov_id] = {"old": orig_val, "new": new_val}

    if sub_changes:
        changes["sublimit_coverages"] = sub_changes

    return changes


def has_coverage_changes(original: dict, updated: dict) -> bool:
    """Check if there are any differences between original and updated coverages."""
    changes = compute_coverage_changes(original, updated)
    return bool(changes)


def apply_coverage_changes(base_coverages: dict, changes: dict) -> dict:
    """
    Apply coverage changes to a base coverage state.

    Args:
        base_coverages: Starting coverage state
        changes: Change dict from compute_coverage_changes()

    Returns:
        New coverage dict with changes applied
    """
    result = copy.deepcopy(base_coverages)

    # Apply aggregate limit change
    if "aggregate_limit" in changes:
        result["aggregate_limit"] = changes["aggregate_limit"]["new"]

    # Apply aggregate coverage changes
    if "aggregate_coverages" in changes:
        for cov_id, vals in changes["aggregate_coverages"].items():
            if "new" in vals:
                result["aggregate_coverages"][cov_id] = vals["new"]

    # Apply sublimit coverage changes
    if "sublimit_coverages" in changes:
        for cov_id, vals in changes["sublimit_coverages"].items():
            if "new" in vals:
                result["sublimit_coverages"][cov_id] = vals["new"]

    return result


def reset_coverage_editor(editor_id: str) -> None:
    """Clear the session state for a coverage editor instance, including widget keys."""
    session_key = f"coverage_editor_{editor_id}"
    if session_key in st.session_state:
        del st.session_state[session_key]

    # Also clear individual widget keys (selectboxes store their own state)
    keys_to_clear = [
        k for k in list(st.session_state.keys())
        if k.startswith(f"cov_edit_{editor_id}_") or k.startswith(f"cov_diff_{editor_id}_")
    ]
    for k in keys_to_clear:
        del st.session_state[k]

    # Increment refresh counter to force new widget keys
    refresh_key = f"coverage_editor_refresh_{editor_id}"
    st.session_state[refresh_key] = st.session_state.get(refresh_key, 0) + 1


# ─────────────────────── Internal Rendering Functions ───────────────────────


def _get_form_label(form_id: str) -> str:
    """Get display label for policy form."""
    from rating_engine.coverage_config import get_policy_forms
    forms = get_policy_forms()
    for f in forms:
        if f["id"] == form_id:
            return f["label"]
    return form_id


def _render_readonly(coverages: dict, aggregate_limit: int) -> None:
    """Render coverages in read-only mode."""
    render_coverage_summary(coverages, aggregate_limit)


def _render_edit_mode(
    editor_id: str,
    coverages: dict,
    aggregate_limit: int,
    on_change: Optional[Callable[[dict], None]],
) -> dict:
    """Render coverages in full edit mode."""
    # Two-column layout
    col_edit, col_summary = st.columns([1, 1])

    with col_edit:
        tab_var, tab_std = st.tabs(["Variable Limits", "Standard Limits"])

        with tab_var:
            coverages = _render_variable_limits_edit(
                editor_id, coverages, aggregate_limit, on_change
            )

        with tab_std:
            coverages = _render_standard_limits_edit(
                editor_id, coverages, aggregate_limit, on_change
            )

    with col_summary:
        st.markdown("**Summary**")
        render_coverage_summary(coverages, aggregate_limit)

    return coverages


def _render_diff_mode(
    editor_id: str,
    coverages: dict,
    aggregate_limit: int,
    original_coverages: Optional[dict],
    on_change: Optional[Callable[[dict], None]],
) -> dict:
    """Render coverages in diff mode - edit with change highlighting."""
    if original_coverages is None:
        original_coverages = coverages

    # Two-column layout
    col_edit, col_summary = st.columns([1, 1])

    with col_edit:
        tab_var, tab_std = st.tabs(["Variable Limits", "Standard Limits"])

        with tab_var:
            coverages = _render_variable_limits_diff(
                editor_id, coverages, aggregate_limit, original_coverages, on_change
            )

        with tab_std:
            coverages = _render_standard_limits_diff(
                editor_id, coverages, aggregate_limit, original_coverages, on_change
            )

    with col_summary:
        st.markdown("**Changes**")
        if has_coverage_changes(original_coverages, coverages):
            render_coverage_summary(coverages, aggregate_limit, original_coverages)
        else:
            st.caption("No changes yet")

    return coverages


def _render_variable_limits_edit(
    editor_id: str,
    coverages: dict,
    aggregate_limit: int,
    on_change: Optional[Callable[[dict], None]],
) -> dict:
    """Render variable/sublimit coverages edit mode."""
    session_key = f"coverage_editor_{editor_id}"
    refresh = st.session_state.get(f"coverage_editor_refresh_{editor_id}", 0)
    sub_defs = get_sublimit_coverage_definitions()
    sub_values = coverages.get("sublimit_coverages", {})

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
        idx = _find_option_index(current_val, option_values, aggregate_limit)

        new_idx = st.selectbox(
            label,
            options=range(len(options)),
            index=idx,
            format_func=lambda i: option_labels[i],
            key=f"cov_edit_{editor_id}_sub_{cov_id}_r{refresh}",
        )

        new_val = option_values[new_idx]

        # Update if changed
        if new_val != current_val:
            coverages["sublimit_coverages"][cov_id] = new_val
            st.session_state[session_key] = coverages
            if on_change:
                on_change(coverages)

    return coverages


def _render_standard_limits_edit(
    editor_id: str,
    coverages: dict,
    aggregate_limit: int,
    on_change: Optional[Callable[[dict], None]],
) -> dict:
    """Render standard/aggregate coverages edit mode."""
    session_key = f"coverage_editor_{editor_id}"
    refresh = st.session_state.get(f"coverage_editor_refresh_{editor_id}", 0)
    agg_defs = get_aggregate_coverage_definitions()
    agg_values = coverages.get("aggregate_coverages", {})

    # Options for edit mode
    options = [
        ("Full Limits", aggregate_limit),
        ("$1M", 1_000_000),
        ("No Coverage", 0),
    ]
    option_labels = [o[0] for o in options]
    option_values = [o[1] for o in options]

    # Build coverage list - Tech E&O first
    coverage_list = _order_coverages(agg_defs)

    for cov in coverage_list:
        cov_id = cov["id"]
        label = cov["label"]
        current_val = agg_values.get(cov_id, 0)

        # Find matching option index
        idx = _find_standard_option_index(current_val, option_values, aggregate_limit)

        new_idx = st.selectbox(
            label,
            options=range(len(options)),
            index=idx,
            format_func=lambda i: option_labels[i],
            key=f"cov_edit_{editor_id}_agg_{cov_id}_r{refresh}",
        )

        new_val = option_values[new_idx]

        # Update if changed
        if new_val != current_val:
            coverages["aggregate_coverages"][cov_id] = new_val
            st.session_state[session_key] = coverages
            if on_change:
                on_change(coverages)

    return coverages


def _render_variable_limits_diff(
    editor_id: str,
    coverages: dict,
    aggregate_limit: int,
    original_coverages: dict,
    on_change: Optional[Callable[[dict], None]],
) -> dict:
    """Render variable/sublimit coverages in diff mode with change indicators."""
    session_key = f"coverage_editor_{editor_id}"
    refresh = st.session_state.get(f"coverage_editor_refresh_{editor_id}", 0)
    sub_defs = get_sublimit_coverage_definitions()
    sub_values = coverages.get("sublimit_coverages", {})
    orig_sub = original_coverages.get("sublimit_coverages", {})

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
        orig_val = orig_sub.get(cov_id, 0)

        # Add change indicator to label
        is_changed = current_val != orig_val
        display_label = f"● {label}" if is_changed else label

        # Find matching option index
        idx = _find_option_index(current_val, option_values, aggregate_limit)

        new_idx = st.selectbox(
            display_label,
            options=range(len(options)),
            index=idx,
            format_func=lambda i: option_labels[i],
            key=f"cov_diff_{editor_id}_sub_{cov_id}_r{refresh}",
            help=f"Original: {format_limit_display(orig_val)}" if is_changed else None,
        )

        new_val = option_values[new_idx]

        # Update if changed
        if new_val != current_val:
            coverages["sublimit_coverages"][cov_id] = new_val
            st.session_state[session_key] = coverages
            if on_change:
                on_change(coverages)

    return coverages


def _render_standard_limits_diff(
    editor_id: str,
    coverages: dict,
    aggregate_limit: int,
    original_coverages: dict,
    on_change: Optional[Callable[[dict], None]],
) -> dict:
    """Render standard/aggregate coverages in diff mode with change indicators."""
    session_key = f"coverage_editor_{editor_id}"
    refresh = st.session_state.get(f"coverage_editor_refresh_{editor_id}", 0)
    agg_defs = get_aggregate_coverage_definitions()
    agg_values = coverages.get("aggregate_coverages", {})
    orig_agg = original_coverages.get("aggregate_coverages", {})

    # Options for edit mode
    options = [
        ("Full Limits", aggregate_limit),
        ("$1M", 1_000_000),
        ("No Coverage", 0),
    ]
    option_labels = [o[0] for o in options]
    option_values = [o[1] for o in options]

    # Build coverage list - Tech E&O first
    coverage_list = _order_coverages(agg_defs)

    for cov in coverage_list:
        cov_id = cov["id"]
        label = cov["label"]
        current_val = agg_values.get(cov_id, 0)
        orig_val = orig_agg.get(cov_id, 0)

        # Add change indicator to label
        is_changed = current_val != orig_val
        display_label = f"● {label}" if is_changed else label

        # Find matching option index
        idx = _find_standard_option_index(current_val, option_values, aggregate_limit)

        new_idx = st.selectbox(
            display_label,
            options=range(len(options)),
            index=idx,
            format_func=lambda i: option_labels[i],
            key=f"cov_diff_{editor_id}_agg_{cov_id}_r{refresh}",
            help=f"Original: {format_limit_display(orig_val)}" if is_changed else None,
        )

        new_val = option_values[new_idx]

        # Update if changed
        if new_val != current_val:
            coverages["aggregate_coverages"][cov_id] = new_val
            st.session_state[session_key] = coverages
            if on_change:
                on_change(coverages)

    return coverages


def _find_option_index(value: int, option_values: list, aggregate_limit: int) -> int:
    """Find the index of a value in the options list."""
    if value in option_values:
        return option_values.index(value)
    elif value == 0:
        return option_values.index(0) if 0 in option_values else 0
    elif value == aggregate_limit // 2:
        # Try to find 50% option
        try:
            return option_values.index(aggregate_limit // 2)
        except ValueError:
            return 0
    else:
        return 0


def _find_standard_option_index(value: int, option_values: list, aggregate_limit: int) -> int:
    """Find the index for standard limit options."""
    if value in option_values:
        return option_values.index(value)
    elif value == aggregate_limit:
        return 0  # Full Limits
    elif value == 0:
        return 2  # No Coverage
    else:
        return 0


def _order_coverages(coverage_defs: list) -> list:
    """Order coverages with Tech E&O first."""
    coverage_list = []
    for cov in coverage_defs:
        if cov["id"] == "tech_eo":
            coverage_list.insert(0, cov)
        else:
            coverage_list.append(cov)
    return coverage_list
