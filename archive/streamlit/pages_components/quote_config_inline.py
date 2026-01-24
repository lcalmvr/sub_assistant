"""
Inline Quote Configuration Component
Streamlined limit/retention dropdowns with premium display.
"""
from __future__ import annotations

import streamlit as st
from typing import Optional


def _parse_dollar_input(value_str: str) -> int:
    """Parse dollar input with M/K suffixes."""
    if not value_str:
        return 0
    value_str = str(value_str).strip().upper()
    if value_str.endswith('M'):
        try:
            return int(float(value_str[:-1]) * 1_000_000)
        except:
            return 0
    elif value_str.endswith('K'):
        try:
            return int(float(value_str[:-1]) * 1_000)
        except:
            return 0
    else:
        try:
            return int(float(value_str))
        except:
            return 0


def _format_currency(amount: int) -> str:
    """Format amount for display."""
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"${amount // 1_000_000}M"
    elif amount >= 1_000 and amount % 1_000 == 0:
        return f"${amount // 1_000}K"
    return f"${amount:,}"


def render_quote_config_inline(sub_id: str, get_conn_func) -> dict:
    """
    Render inline limit/retention dropdowns with premium calculation.

    Returns dict with selected values for use by other components.
    """
    # Use shared limit/retention options from coverage_config
    from rating_engine.coverage_config import (
        get_aggregate_limit_options,
        get_retention_options,
        get_limit_index,
    )

    limit_options = get_aggregate_limit_options()
    retention_options = get_retention_options()

    # Check if a quote was just loaded - use its values for dropdowns
    loaded_limit = st.session_state.pop("_loaded_quote_limit", None)
    loaded_retention = st.session_state.pop("_loaded_quote_retention", None)

    # Get current values from session state, preferring loaded quote values
    if loaded_limit:
        current_limit = loaded_limit
        st.session_state[f"selected_limit_{sub_id}"] = loaded_limit
    else:
        current_limit = st.session_state.get(f"selected_limit_{sub_id}", 2_000_000)

    if loaded_retention:
        current_retention = loaded_retention
        st.session_state[f"selected_retention_{sub_id}"] = loaded_retention
    else:
        current_retention = st.session_state.get(f"selected_retention_{sub_id}", 25_000)

    # Find default indices using shared helper
    limit_labels = [label for _, label in limit_options]
    retention_labels = [label for _, label in retention_options]

    limit_default_idx = get_limit_index(current_limit, limit_options, default=1)
    retention_default_idx = get_limit_index(current_retention, retention_options, default=1)

    # Layout: Limit | Retention | Premium
    col_limit, col_retention, col_premium = st.columns([1, 1, 1])

    with col_limit:
        selected_limit_label = st.selectbox(
            "Limit",
            options=limit_labels,
            index=limit_default_idx,
            key=f"inline_limit_{sub_id}"
        )
        selected_limit = dict((label, val) for val, label in limit_options)[selected_limit_label]
        st.session_state[f"selected_limit_{sub_id}"] = selected_limit

    with col_retention:
        selected_retention_label = st.selectbox(
            "Retention",
            options=retention_labels,
            index=retention_default_idx,
            key=f"inline_retention_{sub_id}"
        )
        selected_retention = dict((label, val) for val, label in retention_options)[selected_retention_label]
        st.session_state[f"selected_retention_{sub_id}"] = selected_retention

    with col_premium:
        # Calculate premium (returns both technical and risk-adjusted)
        result = _calculate_premium_full(sub_id, selected_limit, selected_retention, get_conn_func)
        if result:
            technical = result.get("technical_premium")
            risk_adj = result.get("risk_adjusted_premium")
            # Show risk-adjusted as the main premium metric
            st.metric(
                "Risk-Adj Premium",
                f"${risk_adj:,}" if risk_adj else "—",
                help=f"Technical: ${technical:,}" if technical else None
            )
        else:
            st.metric("Premium", "—", help="Add revenue to calculate")

    return {
        "limit": selected_limit,
        "retention": selected_retention,
        "premium": result.get("risk_adjusted_premium") if result else None,
        "technical_premium": result.get("technical_premium") if result else None,
        "risk_adjusted_premium": result.get("risk_adjusted_premium") if result else None,
    }


def _calculate_premium_full(sub_id: str, limit: int, retention: int, get_conn_func) -> Optional[dict]:
    """Calculate both technical and risk-adjusted premiums using rating engine.

    Returns dict with:
        - technical_premium: Exposure-based premium (before controls)
        - risk_adjusted_premium: Premium after control credits/debits
    """
    try:
        from rating_engine.engine import price_with_breakdown
        from core.pipeline import parse_controls_from_summary

        # Get submission data
        with get_conn_func().cursor() as cur:
            cur.execute(
                """
                SELECT annual_revenue, naics_primary_title,
                       bullet_point_summary, nist_controls_summary
                FROM submissions WHERE id = %s
                """,
                (sub_id,)
            )
            row = cur.fetchone()

        if not row or not row[0]:  # No revenue
            return None

        revenue, industry, bullet_summary, nist_summary = row

        # Map industry
        industry_slug = _map_industry_to_slug(industry)

        # Parse controls
        parsed_controls = parse_controls_from_summary(
            bullet_summary or "",
            nist_summary or ""
        )

        quote_data = {
            "industry": industry_slug,
            "revenue": revenue,
            "limit": limit,
            "retention": retention,
            "controls": parsed_controls,
        }

        result = price_with_breakdown(quote_data)
        return {
            "technical_premium": result.get("technical_premium"),
            "risk_adjusted_premium": result.get("risk_adjusted_premium"),
        }

    except Exception as e:
        return None


def _calculate_premium(sub_id: str, limit: int, retention: int, get_conn_func) -> Optional[int]:
    """Calculate premium using rating engine (backwards compat)."""
    result = _calculate_premium_full(sub_id, limit, retention, get_conn_func)
    return result.get("risk_adjusted_premium") if result else None


def _map_industry_to_slug(industry_name: str) -> str:
    """Map NAICS industry names to rating engine slugs."""
    if not industry_name:
        return "Professional_Services_Consulting"

    industry_mapping = {
        "Media Buying Agencies": "Advertising_Marketing_Technology",
        "Advertising Agencies": "Advertising_Marketing_Technology",
        "Marketing Consultants": "Advertising_Marketing_Technology",
        "Software Publishers": "Software_as_a_Service_SaaS",
        "Computer Systems Design Services": "Professional_Services_Consulting",
        "Management Consultants": "Professional_Services_Consulting",
    }
    return industry_mapping.get(industry_name, "Professional_Services_Consulting")
