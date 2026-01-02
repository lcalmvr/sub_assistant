"""
Policy Summary Utility

Single shared format for policy/submission summaries across:
- Policy tab (policy_panel.py)
- Benchmarking comparison cards (benchmarking_panel.py)
"""

import streamlit as st
from typing import Optional


def fmt_currency(val, millions: bool = False) -> str:
    """Format currency with \\$ escaping for markdown."""
    if val is None:
        return "—"
    v = float(val)
    if millions:
        return f"\\${v/1e6:.0f}M"
    return f"\\${v:,.0f}"


def fmt_currency_compact(val) -> str:
    """Format currency in compact K/M form."""
    if val is None:
        return "—"
    v = float(val)
    if v >= 1_000_000:
        compact = f"{v/1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"\\${compact}M"
    if v >= 1_000:
        compact = f"{v/1_000:.1f}".rstrip("0").rstrip(".")
        return f"\\${compact}K"
    return f"\\${v:,.0f}"


def calculate_rate_per_mil(premium: float, limit: float) -> Optional[float]:
    """Calculate rate per million."""
    if premium and limit and limit > 0:
        return premium / (limit / 1_000_000)
    return None


def render_summary_card(
    # Identity
    name: str = None,
    industry_tags: list[str] | None = None,
    # Status/Outcome
    status_icon: str = None,
    status_text: str = None,
    # Dates
    date_label: str = None,
    eff_date_str: str = None,
    exp_date_str: str = None,
    # Terms
    limit: float = None,
    retention: float = None,
    premium: float = None,
    rate_per_mil: Optional[float] = None,
    # Form/Layer
    policy_form: str = None,
    layer_type: str = None,
    # Claims (for bound comparables)
    claims_count: int = None,
    claims_paid: float = None,
    loss_ratio: float = None,
    loss_signal: str = None,
    # Description
    description: str = None,
    show_tags: bool = True,
    show_description: bool = True,
    loss_claims_inline: bool = False,
) -> None:
    """
    Render a summary card with consistent formatting.

    Used by both Policy tab and Benchmarking comparison cards.
    All parameters are optional - only provided fields are shown.
    """
    # Calculate RPM if not provided
    if rate_per_mil is None and premium and limit:
        rate_per_mil = calculate_rate_per_mil(premium, limit)

    lines = []
    tag_items = []

    # Row 1: Status/Outcome
    if status_icon and status_text:
        lines.append(f"**Status:** {status_icon} {status_text}")

    # Row 2: Date or Period
    if date_label:
        lines.append(f"**Date:** {date_label}")
    elif eff_date_str and exp_date_str:
        lines.append(f"**Period:** {eff_date_str} → {exp_date_str}")

    # Row 3: Terms
    if limit or retention:
        limit_str = fmt_currency_compact(limit) if limit else "—"
        retention_str = fmt_currency_compact(retention) if retention else "—"
        lines.append(f"**Terms:** {limit_str} x {retention_str} SIR")

    # Row 4: Premium & RPM
    if premium is not None:
        premium_str = fmt_currency(premium)
        lines.append(f"**Premium:** {premium_str}")
        rpm_str = fmt_currency_compact(rate_per_mil) if rate_per_mil else "—"
        lines.append(f"**RPM:** {rpm_str}")

    # Row 5: Form or Layer
    if policy_form:
        lines.append(f"**Form:** {policy_form.title()}")
    elif layer_type:
        layer = "Excess" if layer_type == "excess" else "Primary"
        lines.append(f"**Layer:** {layer}")

    if loss_claims_inline:
        parts = []
        if loss_signal:
            parts.append(loss_signal)
        if loss_signal != "Clean" and claims_count is not None and premium:
            paid_str = fmt_currency(claims_paid)
            loss_suffix = f" · {int(float(loss_ratio) * 100)}% loss" if loss_ratio is not None else ""
            parts.append(f"{claims_count} claims · {paid_str} paid{loss_suffix}")
        if parts:
            lines.append(f"**Loss history:** {' · '.join(parts)}")
    else:
        # Row 6: Loss signal (if provided)
        if loss_signal:
            lines.append(f"**Loss history:** {loss_signal}")

        # Row 7: Claims data (optional)
        if claims_count is not None and premium and loss_signal != "Clean":
            paid_str = fmt_currency(claims_paid)
            loss_suffix = f" · {int(float(loss_ratio) * 100)}% loss" if loss_ratio is not None else ""
            lines.append(f"**Claims:** {claims_count} · {paid_str} paid{loss_suffix}")

    if industry_tags:
        tag_items = [t for t in industry_tags if t]

    # Render main content
    if lines:
        st.markdown("  \n".join(lines))
    else:
        st.markdown("*No data available*")

    if show_tags and tag_items:
        chips = " ".join([f"`{tag}`" for tag in tag_items])
        st.markdown(chips)

    # Description in gray (optional)
    if show_description and description:
        st.caption(description)
