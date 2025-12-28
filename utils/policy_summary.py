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


def calculate_rate_per_mil(premium: float, limit: float) -> Optional[float]:
    """Calculate rate per million."""
    if premium and limit and limit > 0:
        return premium / (limit / 1_000_000)
    return None


def render_summary_card(
    # Identity
    name: str = None,
    # Status/Outcome
    status_icon: str = None,
    status_text: str = None,
    # Dates
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
    # Description
    description: str = None,
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

    # Row 1: Status/Outcome
    if status_icon and status_text:
        lines.append(f"**Status:** {status_icon} {status_text}")

    # Row 2: Period (if dates provided)
    if eff_date_str and exp_date_str:
        lines.append(f"**Period:** {eff_date_str} → {exp_date_str}")

    # Row 3: Terms
    if limit or retention:
        limit_str = fmt_currency(limit) if limit else "—"
        retention_str = fmt_currency(retention) if retention else "—"
        lines.append(f"**Terms:** {limit_str} x {retention_str} SIR")

    # Row 4: Premium & RPM
    if premium is not None:
        premium_str = fmt_currency(premium)
        rpm_str = fmt_currency(rate_per_mil) if rate_per_mil else "—"
        lines.append(f"**Premium:** {premium_str} · **RPM:** {rpm_str}")

    # Row 5: Form or Layer
    if policy_form:
        lines.append(f"**Form:** {policy_form.title()}")
    elif layer_type:
        layer = "Excess" if layer_type == "excess" else "Primary"
        lines.append(f"**Layer:** {layer}")

    # Row 6: Claims data (for bound comparables)
    if claims_count is not None and premium:
        loss_pct = f"{int(float(loss_ratio or 0) * 100)}%" if loss_ratio is not None else "—"
        lines.append(f"**Claims:** {claims_count} · {fmt_currency(claims_paid)} paid · {loss_pct} loss")

    # Render main content
    if lines:
        st.markdown("  \n".join(lines))
    else:
        st.markdown("*No data available*")

    # Description in gray (optional)
    if description:
        desc = description[:400] + "..." if len(description) > 400 else description
        st.caption(desc)
