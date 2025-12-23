"""
Coverages Panel for Quote Tab

Inherits coverage configuration from Rating tab and applies option-specific limits.
Shows the full coverage schedule for PDF generation.

Uses the shared coverage_editor component for rendering.
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
from pages_components.coverage_editor import (
    render_coverage_editor,
    render_coverage_summary,
    reset_coverage_editor,
)


def render_coverages_panel(
    sub_id: str,
    expanded: bool = False,
    saved_coverages: Optional[dict] = None,
    readonly: bool = False,
):
    """
    Render the coverages panel for Quote tab.
    Inherits from Rating tab config, applies option-specific limit.

    Args:
        sub_id: Submission ID
        expanded: Whether expander starts expanded
        saved_coverages: Pre-loaded coverages from database (optional)
        readonly: If True, render in read-only mode (for post-bind)
    """
    # Get the selected limit for this option
    aggregate_limit = st.session_state.get(f"selected_limit_{sub_id}", 1_000_000)

    with st.expander("Coverage Schedule", expanded=expanded):
        # Initialize from Rating tab or saved quote (only if not already set)
        session_key = f"quote_coverages_{sub_id}"

        # Only initialize if not already in session state - preserves edits
        if session_key not in st.session_state:
            # First try to load from database if we have a quote selected
            quote_id = st.session_state.get("viewing_quote_id")
            loaded_from_db = False
            if quote_id:
                from pages_components.tower_db import get_quote_by_id
                quote = get_quote_by_id(quote_id)
                if quote and quote.get("coverages"):
                    db_coverages = quote.get("coverages")
                    if db_coverages.get("sublimit_coverages") or db_coverages.get("aggregate_coverages"):
                        st.session_state[session_key] = db_coverages
                        loaded_from_db = True

            # Fall back to building from Rating defaults
            if not loaded_from_db:
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
        current_quote_id = st.session_state.get("viewing_quote_id")
        last_synced_quote_key = f"last_synced_quote_{sub_id}"
        last_synced_quote = st.session_state.get(last_synced_quote_key)

        if current_quote_id != last_synced_quote:
            # Option changed - reset coverage editor to pick up new values
            reset_coverage_editor(f"quote_{sub_id}")
            st.session_state[last_synced_quote_key] = current_quote_id

        # Determine mode based on readonly flag
        mode = "readonly" if readonly else "edit"

        # Check if we're editing a saved quote (for save callback)
        quote_id = st.session_state.get("viewing_quote_id")

        def on_coverage_change(updated_coverages: dict):
            """Callback when coverages change - save to session and DB."""
            st.session_state[session_key] = updated_coverages
            if quote_id:
                update_quote_field(quote_id, "coverages", updated_coverages)

        # Use the shared coverage editor component
        updated_coverages = render_coverage_editor(
            editor_id=f"quote_{sub_id}",
            current_coverages=coverages,
            aggregate_limit=aggregate_limit,
            mode=mode,
            on_change=on_coverage_change if not readonly else None,
            show_header=True,
        )

        # Update session state with any changes
        st.session_state[session_key] = updated_coverages

        # Bulk update buttons (only in edit mode)
        if not readonly:
            st.markdown("---")
            render_bulk_coverage_buttons(sub_id, updated_coverages, "this option")


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
    # Use reset_coverage_editor which handles refresh counter
    reset_coverage_editor(f"quote_{sub_id}")

    # Also clear legacy keys
    keys_to_clear = [k for k in list(st.session_state.keys())
                     if k.startswith(f"quote_sublimit_{sub_id}_")
                     or k.startswith(f"quote_agg_{sub_id}_")]
    for k in keys_to_clear:
        del st.session_state[k]


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
