"""
Quote Options Cards Component
Displays quote options as cards for quick quote creation.
Clicking a card creates and saves a quote to the database.
"""
from __future__ import annotations

import streamlit as st
from typing import Optional
from pages_components.tower_db import save_tower
from utils.quote_formatting import format_currency, generate_quote_name


def _calculate_premium(sub_id: str, limit: int, retention: int, get_conn_func) -> Optional[int]:
    """Calculate premium using rating engine."""
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
        return result.get("premium")

    except Exception as e:
        return None


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


def render_quote_options_cards(sub_id: str, get_conn_func, position: str = "primary"):
    """
    Render quote options as cards for quick quote creation.

    Clicking a card creates and saves a quote to the database immediately.

    Args:
        sub_id: Submission ID
        get_conn_func: Function to get database connection
        position: "primary" or "excess"
    """
    session_key = f"quote_options_{sub_id}"

    # Initialize options if not present
    if session_key not in st.session_state:
        st.session_state[session_key] = []

    options = st.session_state[session_key]

    if not options:
        return None

    # Create columns for cards (up to 4 per row)
    num_cols = min(len(options), 4)
    cols = st.columns(num_cols)

    for idx, option in enumerate(options):
        col_idx = idx % num_cols

        with cols[col_idx]:
            # Calculate premium if not already cached
            if option.get("premium") is None:
                option["premium"] = _calculate_premium(
                    sub_id,
                    option.get("limit", 0),
                    option.get("retention", 0),
                    get_conn_func
                )

            # Build card content
            limit = option.get("limit", 0)
            retention = option.get("retention", 0)
            premium = option.get("premium")

            # For excess, show tower info
            if position == "excess" and option.get("tower"):
                tower = option.get("tower", [])
                cmai_layer = next((l for l in tower if "CMAI" in str(l.get("carrier", "")).upper()), None)
                if cmai_layer:
                    attachment = cmai_layer.get("attachment", 0)
                    card_title = f"{format_currency(limit)} xs {format_currency(attachment)}"
                else:
                    card_title = format_currency(limit)
            else:
                card_title = format_currency(limit)

            # Render card (neutral styling - no selection state)
            st.markdown(f"""
            <div style="
                border: 2px solid #ddd;
                border-radius: 8px;
                padding: 12px;
                background: #fff;
                margin-bottom: 8px;
            ">
                <div style="font-size: 1.2em; font-weight: bold;">{card_title}</div>
                <div style="color: #666;">Ret: {format_currency(retention)}</div>
                <div style="font-size: 1.4em; color: #2e7d32; font-weight: bold;">
                    {f'${premium:,}' if premium else '—'}
                </div>
            </div>
            """, unsafe_allow_html=True)

            # Create Quote button - saves to database on click
            if st.button(
                "Create Quote",
                key=f"create_quote_{sub_id}_{idx}",
                type="secondary",
                use_container_width=True
            ):
                _create_quote_from_option(sub_id, option, position)
                st.rerun()

    # Show more options on new rows if > 4
    if len(options) > num_cols:
        remaining = options[num_cols:]
        extra_cols = st.columns(min(len(remaining), 4))
        for idx, option in enumerate(remaining, start=num_cols):
            col_idx = (idx - num_cols) % len(extra_cols)
            with extra_cols[col_idx]:
                limit = option.get("limit", 0)
                retention = option.get("retention", 0)
                premium = option.get("premium")

                st.markdown(f"**{format_currency(limit)}** / {format_currency(retention)}")
                st.markdown(f"Premium: {f'${premium:,}' if premium else '—'}")

                if st.button(
                    "Create Quote",
                    key=f"create_quote_{sub_id}_{idx}",
                ):
                    _create_quote_from_option(sub_id, option, position)
                    st.rerun()

    return None


def _create_quote_from_option(sub_id: str, option: dict, position: str):
    """
    Create and save a quote to the database from an option card.
    Removes the card from the options list after creating.

    Args:
        sub_id: Submission ID
        option: Option dict with limit, retention, premium, (optional: tower)
        position: "primary" or "excess"
    """
    limit = option.get("limit", 0)
    retention = option.get("retention", 0)
    premium = option.get("premium")

    # Build tower layers
    if position == "primary":
        tower_layers = [{
            "carrier": "CMAI",
            "limit": limit,
            "attachment": 0,
            "premium": premium,
            "retention": retention,
            "rpm": None,
        }]
    else:
        # For excess: Use tower from option or create default
        if option.get("tower"):
            tower_layers = option["tower"]
        else:
            tower_layers = [{
                "carrier": "CMAI",
                "limit": limit,
                "attachment": 0,
                "premium": premium,
                "retention": retention,
                "rpm": None,
            }]

    # Generate smart name - extract attachment for excess positions
    attachment = None
    if position == "excess" and option.get("tower"):
        tower = option.get("tower", [])
        cmai_layer = next((l for l in tower if "CMAI" in str(l.get("carrier", "")).upper()), None)
        if cmai_layer:
            attachment = cmai_layer.get("attachment", 0)
    quote_name = generate_quote_name(limit, retention, position, attachment)

    # Save to database
    try:
        tower_id = save_tower(
            sub_id,
            tower_layers,
            retention,
            [],  # sublimits
            quote_name,
            premium
        )

        # Update session state to load this new quote
        st.session_state.tower_layers = tower_layers
        st.session_state.primary_retention = retention
        st.session_state.sublimits = []
        st.session_state.loaded_tower_id = tower_id
        st.session_state.quote_name = quote_name
        st.session_state.quoted_premium = premium

        # Remove this option from the cards list
        session_key = f"quote_options_{sub_id}"
        if session_key in st.session_state:
            options = st.session_state[session_key]
            # Remove option by matching limit and retention
            st.session_state[session_key] = [
                opt for opt in options
                if not (opt.get("limit") == limit and opt.get("retention") == retention)
            ]

        st.success(f"Created: {quote_name}")
    except Exception as e:
        st.error(f"Error creating quote: {e}")


def add_quote_options(sub_id: str, options: list):
    """
    Add quote options to session state.

    Args:
        sub_id: Submission ID
        options: List of option dicts with limit, retention, (optional: tower, premium)
    """
    session_key = f"quote_options_{sub_id}"

    if session_key not in st.session_state:
        st.session_state[session_key] = []

    st.session_state[session_key] = options


def clear_quote_options(sub_id: str):
    """Clear all quote options."""
    session_key = f"quote_options_{sub_id}"
    st.session_state[session_key] = []
