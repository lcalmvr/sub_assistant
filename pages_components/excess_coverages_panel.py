"""
Excess Coverage Panel Component

For excess quotes, displays coverage schedule showing:
- Primary Limit (what underlying carrier offers)
- Our Limit (proportional default, editable)
- Our Attachment (calculated from layers below, editable)

This replaces the standard coverages_panel when viewing an excess quote.
"""
from __future__ import annotations

import streamlit as st
from typing import Optional

from rating_engine.coverage_config import (
    get_aggregate_coverage_definitions,
    get_sublimit_coverage_definitions,
    format_limit_display,
)
from pages_components.tower_db import update_quote_field, get_quote_by_id


def render_excess_coverages_panel(
    sub_id: str,
    quote_id: str,
    expanded: bool = True,
) -> dict:
    """
    Render the excess coverage panel for an excess quote.

    Args:
        sub_id: Submission ID
        quote_id: The excess quote ID being viewed
        expanded: Whether to expand the panel by default

    Returns:
        The current coverages dict
    """
    quote = get_quote_by_id(quote_id)
    if not quote:
        st.warning("No quote data found.")
        return {}

    # Get tower structure to calculate proportions
    tower_json = quote.get("tower_json", [])
    position = quote.get("position", "primary")

    if position != "excess":
        st.warning("This panel is for excess quotes only.")
        return {}

    # Calculate tower context
    tower_context = _get_tower_context(tower_json)

    # Get or initialize excess coverages
    coverages = quote.get("coverages") or {}
    excess_coverages = coverages.get("excess_coverages") or {}

    # Initialize from primary if not set
    if not excess_coverages:
        excess_coverages = _initialize_excess_coverages(tower_context)
        coverages["excess_coverages"] = excess_coverages

    with st.expander("Coverage Schedule (Excess)", expanded=expanded):
        # Show tower position summary
        _render_tower_position_summary(tower_context)

        st.markdown("---")

        # Render editable coverage table
        updated_coverages = _render_excess_coverage_table(
            sub_id, quote_id, excess_coverages, tower_context
        )

        if updated_coverages != excess_coverages:
            # Save changes
            coverages["excess_coverages"] = updated_coverages
            update_quote_field(quote_id, "coverages", coverages)
            st.rerun()

    return coverages


def _get_tower_context(tower_json: list) -> dict:
    """
    Analyze tower structure to determine CMAI's position and calculate
    proportional values.
    """
    if not tower_json:
        return {
            "primary_limit": 0,
            "primary_retention": 0,
            "our_limit": 0,
            "our_attachment": 0,
            "cmai_layer_idx": None,
            "layers_below": [],
            "total_underlying": 0,
        }

    # Find CMAI layer
    cmai_layer_idx = None
    cmai_layer = None
    for idx, layer in enumerate(tower_json):
        carrier = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier:
            cmai_layer_idx = idx
            cmai_layer = layer
            break

    # Primary is always layer 0
    primary_layer = tower_json[0] if tower_json else {}
    primary_limit = primary_layer.get("limit", 0) or 0
    primary_retention = primary_layer.get("retention", 0) or primary_layer.get("attachment", 0) or 0

    # Calculate our position
    if cmai_layer_idx is not None and cmai_layer_idx > 0:
        # We're excess - sum up layers below us
        layers_below = tower_json[:cmai_layer_idx]
        total_underlying = sum(l.get("limit", 0) or 0 for l in layers_below)
        our_limit = cmai_layer.get("limit", 0) or 0
        our_attachment = total_underlying
    else:
        # CMAI is layer 0 or not found
        layers_below = []
        total_underlying = 0
        our_limit = primary_limit
        our_attachment = 0

    return {
        "primary_limit": primary_limit,
        "primary_retention": primary_retention,
        "our_limit": our_limit,
        "our_attachment": our_attachment,
        "cmai_layer_idx": cmai_layer_idx,
        "layers_below": layers_below,
        "total_underlying": total_underlying,
        "tower_json": tower_json,
    }


def _render_tower_position_summary(ctx: dict):
    """Show a summary of our position in the tower."""
    if ctx["cmai_layer_idx"] is not None and ctx["cmai_layer_idx"] > 0:
        st.info(
            f"**Our Position:** {format_limit_display(ctx['our_limit'])} xs "
            f"{format_limit_display(ctx['our_attachment'])} "
            f"(Layer {ctx['cmai_layer_idx'] + 1} of {len(ctx['tower_json'])})"
        )
        st.caption(
            f"Primary: {format_limit_display(ctx['primary_limit'])} | "
            f"Underlying: {format_limit_display(ctx['total_underlying'])}"
        )
    else:
        st.warning("CMAI position not found in tower. Add layers to define excess structure.")


def _initialize_excess_coverages(ctx: dict) -> dict:
    """
    Initialize excess coverages with proportional defaults based on primary.

    For each coverage, calculate:
    - primary_limit: What the primary carrier offers (default to their aggregate)
    - our_limit: Proportional to our aggregate limit
    - our_attachment: Where we attach for this coverage
    """
    primary_limit = ctx["primary_limit"]
    our_limit = ctx["our_limit"]
    our_attachment = ctx["our_attachment"]

    if not primary_limit:
        primary_limit = 1_000_000  # Default

    # Calculate proportion
    proportion = our_limit / primary_limit if primary_limit else 1.0

    excess_coverages = {}

    # Standard/aggregate coverages
    for cov in get_aggregate_coverage_definitions():
        cov_id = cov["id"]
        # Default: primary offers full limits, we follow proportionally
        excess_coverages[cov_id] = {
            "primary_limit": primary_limit,
            "our_limit": our_limit,
            "our_attachment": our_attachment,
        }

    # Variable/sublimit coverages
    for cov in get_sublimit_coverage_definitions():
        cov_id = cov["id"]
        # Default: same as aggregate (full limits)
        excess_coverages[cov_id] = {
            "primary_limit": primary_limit,
            "our_limit": our_limit,
            "our_attachment": our_attachment,
        }

    return excess_coverages


def _render_excess_coverage_table(
    sub_id: str,
    quote_id: str,
    excess_coverages: dict,
    ctx: dict,
) -> dict:
    """
    Render the editable excess coverage table.

    Columns: Coverage | Primary Limit | Our Limit | Our Attachment
    """
    updated = dict(excess_coverages)

    # Combine all coverage definitions
    all_covs = []
    for cov in get_aggregate_coverage_definitions():
        all_covs.append({"id": cov["id"], "label": cov["label"], "type": "aggregate"})
    for cov in get_sublimit_coverage_definitions():
        all_covs.append({"id": cov["id"], "label": cov["label"], "type": "sublimit"})

    # Build limit options for dropdowns
    limit_options = [
        ("Full Limits", "full"),
        ("$5M", 5_000_000),
        ("$3M", 3_000_000),
        ("$2M", 2_000_000),
        ("$1M", 1_000_000),
        ("$500K", 500_000),
        ("$250K", 250_000),
        ("$100K", 100_000),
        ("None", 0),
    ]

    # Header row
    col_cov, col_primary, col_our, col_attach = st.columns([2, 1.5, 1.5, 1.5])
    col_cov.markdown("**Coverage**")
    col_primary.markdown("**Primary Limit**")
    col_our.markdown("**Our Limit**")
    col_attach.markdown("**Our Attachment**")

    # Render each coverage row
    for cov in all_covs:
        cov_id = cov["id"]
        cov_label = cov["label"]

        # Get current values or defaults
        cov_data = updated.get(cov_id, {})
        primary_limit = cov_data.get("primary_limit", ctx["primary_limit"])
        our_limit = cov_data.get("our_limit", ctx["our_limit"])
        our_attachment = cov_data.get("our_attachment", ctx["our_attachment"])

        col_cov, col_primary, col_our, col_attach = st.columns([2, 1.5, 1.5, 1.5])

        with col_cov:
            st.markdown(f"**{cov_label}**")

        with col_primary:
            # Primary limit dropdown
            primary_options = [opt[0] for opt in limit_options]
            primary_values = {opt[0]: opt[1] for opt in limit_options}

            # Find matching option or use "Full Limits"
            current_primary_label = _find_limit_label(primary_limit, limit_options, ctx["primary_limit"])

            new_primary_label = st.selectbox(
                "Primary",
                options=primary_options,
                index=primary_options.index(current_primary_label) if current_primary_label in primary_options else 0,
                key=f"excess_primary_{sub_id}_{cov_id}",
                label_visibility="collapsed",
            )
            new_primary = _resolve_limit_value(primary_values.get(new_primary_label), ctx["primary_limit"])

        with col_our:
            # Our limit dropdown
            current_our_label = _find_limit_label(our_limit, limit_options, ctx["our_limit"])

            new_our_label = st.selectbox(
                "Our Limit",
                options=primary_options,
                index=primary_options.index(current_our_label) if current_our_label in primary_options else 0,
                key=f"excess_our_{sub_id}_{cov_id}",
                label_visibility="collapsed",
            )
            new_our = _resolve_limit_value(primary_values.get(new_our_label), ctx["our_limit"])

        with col_attach:
            # Our attachment - calculated or editable
            # For simplicity, show proportional attachment based on primary sublimit
            if new_primary and ctx["primary_limit"]:
                sublimit_ratio = new_primary / ctx["primary_limit"]
                calculated_attachment = int(ctx["our_attachment"] * sublimit_ratio)
            else:
                calculated_attachment = our_attachment

            st.markdown(f"{format_limit_display(calculated_attachment)}")
            new_attachment = calculated_attachment

        # Update if changed
        if (new_primary != primary_limit or
            new_our != our_limit or
            new_attachment != our_attachment):
            updated[cov_id] = {
                "primary_limit": new_primary,
                "our_limit": new_our,
                "our_attachment": new_attachment,
            }

    return updated


def _find_limit_label(value: int, options: list, full_limit: int) -> str:
    """Find the matching label for a limit value."""
    if value == full_limit or value == "full":
        return "Full Limits"
    for label, opt_value in options:
        if opt_value == value:
            return label
    # Default to Full Limits if no match
    return "Full Limits"


def _resolve_limit_value(value, full_limit: int) -> int:
    """Resolve 'full' to actual full limit value."""
    if value == "full":
        return full_limit
    return value or 0


def get_excess_coverages_for_quote(quote_id: str) -> dict:
    """Get the excess coverages for a quote."""
    quote = get_quote_by_id(quote_id)
    if not quote:
        return {}
    coverages = quote.get("coverages") or {}
    return coverages.get("excess_coverages") or {}
