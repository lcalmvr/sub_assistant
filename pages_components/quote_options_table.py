"""
Quote Options Table Component
Renders a summary table of all quote options with inline editing and expandable detail views.
Implements the redesigned Quote tab per docs/quote_tab_design.md.
"""
from __future__ import annotations

import streamlit as st
from typing import Optional, Callable
from pages_components.tower_db import (
    list_quotes_for_submission,
    get_quote_by_id,
    save_tower,
    update_tower,
    delete_tower,
    update_quote_field,
    update_quote_limit,
)
from utils.quote_formatting import format_currency, generate_quote_name


def _parse_currency(val) -> Optional[float]:
    """Parse currency input including K/M notation."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return None
    try:
        if s.endswith("K"):
            return float(s[:-1]) * 1_000
        if s.endswith("M"):
            return float(s[:-1]) * 1_000_000
        return float(s)
    except Exception:
        return None


def _get_cmai_limit(tower_json: list) -> Optional[float]:
    """Extract the CMAI layer limit from tower_json."""
    if not tower_json:
        return None
    for layer in tower_json:
        carrier = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier:
            return layer.get("limit")
    # Fallback to first layer
    if tower_json:
        return tower_json[0].get("limit")
    return None


def _get_cmai_attachment(tower_json: list) -> Optional[float]:
    """Extract the CMAI layer attachment from tower_json."""
    if not tower_json:
        return None
    for layer in tower_json:
        carrier = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier:
            return layer.get("attachment", 0)
    return 0


def render_quote_options_table(
    sub_id: str,
    get_conn_func: Callable,
    on_expand_quote: Optional[Callable[[str], None]] = None,
) -> Optional[str]:
    """
    Render the quote options summary table with inline editing.

    Args:
        sub_id: Submission ID
        get_conn_func: Function to get database connection
        on_expand_quote: Callback when a quote is expanded for detail view

    Returns:
        ID of the currently expanded quote, or None
    """
    # Get all quotes for this submission
    all_quotes = list_quotes_for_submission(sub_id)

    if not all_quotes:
        return _render_empty_state(sub_id, get_conn_func)

    # Separate primary and excess quotes
    primary_quotes = [q for q in all_quotes if q.get("position", "primary") == "primary"]
    excess_quotes = [q for q in all_quotes if q.get("position") == "excess"]

    expanded_quote_id = st.session_state.get(f"expanded_quote_{sub_id}")

    # Render Primary Options table
    if primary_quotes:
        st.markdown("**Primary Options**")
        expanded = _render_quote_table(
            sub_id, primary_quotes, "primary", get_conn_func, on_expand_quote
        )
        if expanded:
            expanded_quote_id = expanded

    # Render Excess Options table
    if excess_quotes:
        st.markdown("**Excess Options**")
        expanded = _render_quote_table(
            sub_id, excess_quotes, "excess", get_conn_func, on_expand_quote
        )
        if expanded:
            expanded_quote_id = expanded

    # Add new quote button
    st.divider()
    col1, col2, col3 = st.columns([1, 1, 2])
    with col1:
        if st.button("+ Add Primary", key=f"add_primary_{sub_id}"):
            _create_default_quote(sub_id, "primary", get_conn_func)
            st.rerun()
    with col2:
        if st.button("+ Add Excess", key=f"add_excess_{sub_id}"):
            _create_default_quote(sub_id, "excess", get_conn_func)
            st.rerun()

    return expanded_quote_id


def _render_empty_state(sub_id: str, get_conn_func: Callable) -> None:
    """Render the first-time flow when no quotes exist."""
    st.info("No quote options yet.")

    st.markdown("**Generate default options:**")

    col1, col2, col3 = st.columns([1, 1, 2])

    with col1:
        default_retention = st.number_input(
            "Retention",
            min_value=0,
            value=50000,
            step=5000,
            format="%d",
            key=f"default_retention_{sub_id}",
            help="Default retention for generated options"
        )

    with col2:
        if st.button("Generate $1M/$3M/$5M", key=f"generate_defaults_{sub_id}"):
            _generate_default_options(sub_id, default_retention, get_conn_func)
            st.rerun()

    with col3:
        st.caption("Or use AI: \"Create 1M, 2M, 3M options with 25K retention\"")

    return None


def _render_quote_table(
    sub_id: str,
    quotes: list,
    position: str,
    get_conn_func: Callable,
    on_expand_quote: Optional[Callable[[str], None]] = None,
) -> Optional[str]:
    """
    Render a table of quote options (primary or excess).

    Returns the ID of the expanded quote if any.
    """
    expanded_quote_id = None
    is_primary = position == "primary"

    # Table header
    if is_primary:
        header_cols = st.columns([1.8, 1.2, 1.2, 1.3, 1.3, 1.3, 1.3, 1.2])
        headers = ["Name", "Limit", "Ret", "Technical", "Risk Adj", "Sold", "Mkt Adj", ""]
    else:
        header_cols = st.columns([2, 1.5, 1.5, 1.5, 1.5, 1.5])
        headers = ["Name", "Limit", "Attachment", "Retention", "Sold", "Actions"]

    for col, header in zip(header_cols, headers):
        col.markdown(f"**{header}**")

    # Render each quote row
    for quote in quotes:
        quote_id = quote["id"]
        is_expanded = st.session_state.get(f"expanded_quote_{sub_id}") == quote_id

        row_expanded = _render_quote_row(
            sub_id, quote, position, get_conn_func, is_expanded, on_expand_quote
        )

        if row_expanded:
            expanded_quote_id = quote_id

        # Render detail view if expanded
        if is_expanded:
            _render_detail_view(sub_id, quote, get_conn_func)

    return expanded_quote_id


def _render_quote_row(
    sub_id: str,
    quote: dict,
    position: str,
    get_conn_func: Callable,
    is_expanded: bool,
    on_expand_quote: Optional[Callable[[str], None]] = None,
) -> bool:
    """
    Render a single quote row with inline editing.

    Returns True if this row was just expanded.
    """
    quote_id = quote["id"]
    is_primary = position == "primary"

    # Extract values
    quote_name = quote.get("quote_name", "Option")
    tower_json = quote.get("tower_json", [])
    limit = _get_cmai_limit(tower_json)
    attachment = _get_cmai_attachment(tower_json)
    retention = quote.get("primary_retention")
    technical_premium = quote.get("technical_premium")
    risk_adjusted_premium = quote.get("risk_adjusted_premium")
    sold_premium = quote.get("sold_premium") or quote.get("quoted_premium")

    # Calculate market adjustment (Sold - Risk Adjusted)
    market_adjustment = None
    if sold_premium and risk_adjusted_premium:
        market_adjustment = sold_premium - risk_adjusted_premium

    # Render row
    if is_primary:
        cols = st.columns([1.8, 1.2, 1.2, 1.3, 1.3, 1.3, 1.3, 1.2])
    else:
        cols = st.columns([2, 1.5, 1.5, 1.5, 1.5, 1.5])

    row_key = f"row_{quote_id}"

    # Column 0: Name (editable)
    with cols[0]:
        new_name = st.text_input(
            "Name",
            value=quote_name,
            key=f"name_{row_key}",
            label_visibility="collapsed"
        )
        if new_name != quote_name:
            update_quote_field(quote_id, "quote_name", new_name)

    # Column 1: Limit (editable)
    with cols[1]:
        limit_str = format_currency(limit) if limit else ""
        new_limit_str = st.text_input(
            "Limit",
            value=limit_str.replace("$", ""),
            key=f"limit_{row_key}",
            label_visibility="collapsed"
        )
        new_limit = _parse_currency(new_limit_str)
        if new_limit and new_limit != limit:
            update_quote_limit(quote_id, new_limit)
            # Trigger technical premium recalculation for primary
            if is_primary:
                _recalculate_technical_premium(quote_id, sub_id, get_conn_func)

    if is_primary:
        # Column 2: Retention (editable)
        with cols[2]:
            ret_str = format_currency(retention) if retention else ""
            new_ret_str = st.text_input(
                "Retention",
                value=ret_str.replace("$", ""),
                key=f"ret_{row_key}",
                label_visibility="collapsed"
            )
            new_ret = _parse_currency(new_ret_str)
            if new_ret and new_ret != retention:
                update_quote_field(quote_id, "primary_retention", new_ret)
                # Trigger technical premium recalculation
                _recalculate_technical_premium(quote_id, sub_id, get_conn_func)

        # Column 3: Technical Premium (read-only)
        with cols[3]:
            if technical_premium:
                st.markdown(f"${technical_premium:,.0f}")
            else:
                st.markdown("—")

        # Column 4: Risk-Adjusted Premium (read-only)
        with cols[4]:
            if risk_adjusted_premium:
                st.markdown(f"${risk_adjusted_premium:,.0f}")
            else:
                st.markdown("—")

        # Column 5: Sold Premium (editable with dollar formatting)
        with cols[5]:
            widget_key = f"sold_{row_key}"

            # Initialize session state if not present (use DB value)
            if widget_key not in st.session_state:
                st.session_state[widget_key] = f"${sold_premium:,.0f}" if sold_premium else ""
            else:
                # Reformat if user entered unformatted value (e.g., "45000" -> "$45,000")
                current_val = st.session_state[widget_key]
                parsed = _parse_currency(current_val)
                if parsed is not None:
                    expected = f"${parsed:,.0f}"
                    if current_val.strip() != expected:
                        # Save to database BEFORE reformatting and rerun
                        if parsed != sold_premium:
                            update_quote_field(quote_id, "sold_premium", parsed)
                        st.session_state[widget_key] = expected
                        st.rerun()

            new_sold_str = st.text_input(
                "Sold",
                key=widget_key,
                label_visibility="collapsed",
                placeholder="$0"
            )
            new_sold = _parse_currency(new_sold_str)

            # Auto-save on change
            if new_sold != sold_premium and new_sold is not None:
                update_quote_field(quote_id, "sold_premium", new_sold)

        # Column 6: Market Adjustment (read-only, calculated)
        with cols[6]:
            if market_adjustment is not None:
                # Show positive/negative with color
                if market_adjustment > 0:
                    st.markdown(f"<span style='color:green'>+${market_adjustment:,.0f}</span>", unsafe_allow_html=True)
                elif market_adjustment < 0:
                    st.markdown(f"<span style='color:red'>${market_adjustment:,.0f}</span>", unsafe_allow_html=True)
                else:
                    st.markdown("$0")
            else:
                st.markdown("—")
    else:
        # Excess layout: Attachment instead of Technical Premium

        # Column 2: Attachment (read-only, from tower)
        with cols[2]:
            if attachment:
                st.markdown(f"xs {format_currency(attachment)}")
            else:
                st.markdown("—")

        # Column 3: Retention (editable)
        with cols[3]:
            ret_str = format_currency(retention) if retention else ""
            new_ret_str = st.text_input(
                "Retention",
                value=ret_str.replace("$", ""),
                key=f"ret_{row_key}",
                label_visibility="collapsed"
            )
            new_ret = _parse_currency(new_ret_str)
            if new_ret and new_ret != retention:
                update_quote_field(quote_id, "primary_retention", new_ret)

        # Column 4: Sold Premium (editable with dollar formatting)
        with cols[4]:
            widget_key = f"sold_{row_key}"

            # Initialize session state if not present (use DB value)
            if widget_key not in st.session_state:
                st.session_state[widget_key] = f"${sold_premium:,.0f}" if sold_premium else ""
            else:
                # Reformat if user entered unformatted value (e.g., "45000" -> "$45,000")
                current_val = st.session_state[widget_key]
                parsed = _parse_currency(current_val)
                if parsed is not None:
                    expected = f"${parsed:,.0f}"
                    if current_val.strip() != expected:
                        # Save to database BEFORE reformatting and rerun
                        if parsed != sold_premium:
                            update_quote_field(quote_id, "sold_premium", parsed)
                        st.session_state[widget_key] = expected
                        st.rerun()

            new_sold_str = st.text_input(
                "Sold",
                key=widget_key,
                label_visibility="collapsed",
                placeholder="$0"
            )
            new_sold = _parse_currency(new_sold_str)

            # Auto-save on change
            if new_sold != sold_premium and new_sold is not None:
                update_quote_field(quote_id, "sold_premium", new_sold)

    # Actions column (index 7 for primary, 5 for excess)
    action_col_idx = 7 if is_primary else 5
    with cols[action_col_idx]:
        action_cols = st.columns(2)

        # Expand/collapse button
        with action_cols[0]:
            expand_icon = "▲" if is_expanded else "▼"
            if st.button(expand_icon, key=f"expand_{row_key}"):
                if is_expanded:
                    st.session_state[f"expanded_quote_{sub_id}"] = None
                else:
                    st.session_state[f"expanded_quote_{sub_id}"] = quote_id
                    if on_expand_quote:
                        on_expand_quote(quote_id)
                st.rerun()

        # Delete button
        with action_cols[1]:
            if st.button("🗑️", key=f"delete_{row_key}"):
                delete_tower(quote_id)
                if st.session_state.get(f"expanded_quote_{sub_id}") == quote_id:
                    st.session_state[f"expanded_quote_{sub_id}"] = None
                st.rerun()

    return is_expanded


def _render_detail_view(sub_id: str, quote: dict, get_conn_func: Callable):
    """
    Render the expanded detail view for a quote.
    Shows tower visualization, sublimits, and endorsements.
    """
    quote_id = quote["id"]

    st.markdown("---")

    detail_cols = st.columns([1, 1])

    # Left column: Tower
    with detail_cols[0]:
        st.markdown("**Tower**")

        tower_json = quote.get("tower_json", [])
        if tower_json:
            # Simple tower display
            for idx, layer in enumerate(tower_json):
                carrier = layer.get("carrier", "Unknown")
                limit = format_currency(layer.get("limit", 0))
                attachment = layer.get("attachment", 0)
                premium = layer.get("premium")

                if idx == 0:
                    attach_str = f"Ret: {format_currency(quote.get('primary_retention', 0))}"
                else:
                    attach_str = f"xs {format_currency(attachment)}" if attachment else ""

                premium_str = f" @ ${premium:,.0f}" if premium else ""

                st.caption(f"{idx + 1}. {carrier}: {limit} {attach_str}{premium_str}")
        else:
            st.caption("No tower configured")

        # AI Tower command (placeholder for Phase 5)
        st.text_input(
            "AI Tower",
            placeholder="e.g., Add excess layer at $3M",
            key=f"ai_tower_{quote_id}",
            label_visibility="collapsed"
        )

    # Right column: Coverages & Endorsements
    with detail_cols[1]:
        st.markdown("**Coverages & Endorsements**")

        # Sublimits
        sublimits = quote.get("sublimits", [])
        if sublimits:
            for sl in sublimits:
                coverage = sl.get("coverage", "Unknown")
                limit = format_currency(sl.get("limit", 0))
                st.caption(f"• {coverage}: {limit}")
        else:
            st.caption("No sublimits configured")

        # Endorsements
        endorsements = quote.get("endorsements", [])
        if endorsements:
            for endo in endorsements:
                if isinstance(endo, dict):
                    name = endo.get("name", "Unknown")
                    st.caption(f"✓ {name}")
                else:
                    st.caption(f"✓ {endo}")
        else:
            st.caption("No endorsements")

        # AI Coverages command (placeholder for Phase 5)
        st.text_input(
            "AI Coverages",
            placeholder="e.g., Add SE sublimit $500K",
            key=f"ai_coverages_{quote_id}",
            label_visibility="collapsed"
        )

    st.markdown("---")


def _create_default_quote(sub_id: str, position: str, get_conn_func: Callable):
    """Create a new quote with default values."""
    default_limit = 1_000_000
    default_retention = 50_000

    tower_layers = [{
        "carrier": "CMAI",
        "limit": default_limit,
        "attachment": 0,
        "premium": None,
        "retention": default_retention,
    }]

    # Count existing quotes to generate name
    all_quotes = list_quotes_for_submission(sub_id)
    position_quotes = [q for q in all_quotes if q.get("position", "primary") == position]
    next_num = len(position_quotes) + 1

    prefix = "Primary" if position == "primary" else "Excess"
    quote_name = f"{prefix} Option {next_num}"

    save_tower(
        submission_id=sub_id,
        tower_json=tower_layers,
        primary_retention=default_retention,
        sublimits=[],
        quote_name=quote_name,
        quoted_premium=None,
        quote_notes=None,
        technical_premium=None,
        sold_premium=None,
        endorsements=[],
        position=position,
    )


def _generate_default_options(sub_id: str, retention: float, get_conn_func: Callable):
    """Generate default $1M/$3M/$5M primary options."""
    limits = [1_000_000, 3_000_000, 5_000_000]

    for idx, limit in enumerate(limits, 1):
        tower_layers = [{
            "carrier": "CMAI",
            "limit": limit,
            "attachment": 0,
            "premium": None,
            "retention": retention,
        }]

        # Calculate both technical and risk-adjusted premiums
        premiums = _calculate_premiums(sub_id, limit, retention, get_conn_func)
        technical_premium = premiums.get("technical_premium") if premiums else None
        risk_adjusted_premium = premiums.get("risk_adjusted_premium") if premiums else None

        quote_name = generate_quote_name(limit, retention)

        save_tower(
            submission_id=sub_id,
            tower_json=tower_layers,
            primary_retention=retention,
            sublimits=[],
            quote_name=quote_name,
            quoted_premium=None,
            quote_notes=None,
            technical_premium=technical_premium,
            risk_adjusted_premium=risk_adjusted_premium,
            sold_premium=None,
            endorsements=[],
            position="primary",
        )


def _calculate_premiums(
    sub_id: str,
    limit: float,
    retention: float,
    get_conn_func: Callable
) -> Optional[dict]:
    """Calculate technical and risk-adjusted premiums using the rating engine.

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

        # Map industry to rating slug
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

    except Exception:
        return None


def _calculate_technical_premium(
    sub_id: str,
    limit: float,
    retention: float,
    get_conn_func: Callable
) -> Optional[float]:
    """Calculate technical premium using the rating engine (backwards compat)."""
    result = _calculate_premiums(sub_id, limit, retention, get_conn_func)
    return result.get("technical_premium") if result else None


def _recalculate_technical_premium(quote_id: str, sub_id: str, get_conn_func: Callable):
    """Recalculate and update technical and risk-adjusted premiums for a quote."""
    quote = get_quote_by_id(quote_id)
    if not quote:
        return

    # Only for primary quotes
    if quote.get("position") == "excess":
        return

    limit = _get_cmai_limit(quote.get("tower_json", []))
    retention = quote.get("primary_retention")

    if not limit or not retention:
        return

    result = _calculate_premiums(sub_id, limit, retention, get_conn_func)

    if result:
        if result.get("technical_premium"):
            update_quote_field(quote_id, "technical_premium", result["technical_premium"])
        if result.get("risk_adjusted_premium"):
            update_quote_field(quote_id, "risk_adjusted_premium", result["risk_adjusted_premium"])


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


def load_quote_into_session(quote_id: str):
    """Load a quote's data into session state for editing."""
    quote_data = get_quote_by_id(quote_id)
    if quote_data:
        st.session_state.tower_layers = quote_data["tower_json"]
        st.session_state.primary_retention = quote_data["primary_retention"]
        st.session_state.sublimits = quote_data.get("sublimits") or []
        st.session_state.loaded_tower_id = quote_data["id"]
        st.session_state.quote_name = quote_data.get("quote_name", "Option A")
        st.session_state.quoted_premium = quote_data.get("quoted_premium")
        st.session_state.technical_premium = quote_data.get("technical_premium")
        st.session_state.risk_adjusted_premium = quote_data.get("risk_adjusted_premium")
        st.session_state.sold_premium = quote_data.get("sold_premium")
        st.session_state.endorsements = quote_data.get("endorsements") or []
        st.session_state.position = quote_data.get("position", "primary")
