"""
Endorsements Panel Component
Option-specific endorsements management using the document library.
"""
from __future__ import annotations

import streamlit as st
from typing import List

from pages_components.endorsement_selector import (
    render_endorsement_selector,
    initialize_from_existing,
    get_endorsement_names_for_quote,
    get_required_endorsements,
    get_auto_endorsements,
)


def render_endorsements_panel(sub_id: str, expanded: bool = False, position: str = None):
    """
    Render option-specific endorsements panel.

    Uses the endorsement selector component which provides:
    - Required endorsements (always included, locked)
    - Auto-added endorsements (based on quote rules)
    - Manual selection with search and category filters

    Args:
        sub_id: Submission ID
        expanded: Whether expander is initially expanded
        position: Quote position ('primary' or 'excess'), defaults to current quote position
    """
    # Determine position from current quote if not provided
    if position is None:
        from pages_components.quote_options_panel import get_current_quote_position
        position = get_current_quote_position(sub_id)

    # Get current quote data from session state for rule-based endorsements
    quote_data = _get_quote_data_for_rules(sub_id)

    # Initialize from existing quote endorsements if loading a saved option
    viewing_quote_id = st.session_state.get("viewing_quote_id")

    # Track if we've initialized for this quote to avoid re-init on every render
    init_key = f"endorsements_initialized_{viewing_quote_id}"
    if viewing_quote_id and init_key not in st.session_state:
        existing_endorsements = _get_existing_endorsements(viewing_quote_id)
        if existing_endorsements:
            initialize_from_existing(sub_id, existing_endorsements, position=position)
        st.session_state[init_key] = True

    # Always save endorsements when we have a quote option (ensures required endorsements are saved)
    if viewing_quote_id:
        _save_endorsements(sub_id, viewing_quote_id, position)

    with st.expander("📄 Endorsements", expanded=expanded):
        # Define on_change callback to auto-save endorsements
        def on_endorsement_change():
            if viewing_quote_id:
                _save_endorsements(sub_id, viewing_quote_id, position)

        # Render the endorsement selector
        selected_endorsements = render_endorsement_selector(
            submission_id=sub_id,
            quote_data=quote_data,
            position=position,
            on_change=on_endorsement_change
        )

        # Store count for display elsewhere
        st.session_state[f"endorsement_count_{sub_id}"] = len(selected_endorsements)


def _get_quote_data_for_rules(sub_id: str) -> dict:
    """
    Get quote data from session state for rule-based endorsement logic.
    Returns minimal dict needed for endorsement rules.
    """
    from pages_components.tower_db import get_quote_by_id

    quote_data = {}

    # Get sublimits for dropdown detection
    # Try session state first, then fall back to database
    viewing_quote_id = st.session_state.get("viewing_quote_id")
    sublimits = []

    if viewing_quote_id:
        # Check session state first
        sublimits = st.session_state.get(f"quote_sublimits_{viewing_quote_id}", [])

        # If not in session state, load from database
        if not sublimits:
            quote = get_quote_by_id(viewing_quote_id)
            if quote:
                sublimits = quote.get("sublimits") or []
    else:
        sublimits = st.session_state.get("sublimits", [])

    if sublimits:
        quote_data["sublimits"] = sublimits

    # Get follow_form status for excess quotes
    follow_form = st.session_state.get(f"follow_form_{sub_id}", True)
    quote_data["follow_form"] = follow_form

    # Get limit and retention
    quote_data["limit"] = st.session_state.get(f"selected_limit_{sub_id}", 2_000_000)
    quote_data["retention"] = st.session_state.get(f"selected_retention_{sub_id}", 25_000)

    return quote_data


def _get_existing_endorsements(quote_id: str) -> List[str]:
    """Get endorsement names from an existing quote option in insurance_towers."""
    from pages_components.tower_db import get_conn
    import json

    try:
        with get_conn().cursor() as cur:
            cur.execute(
                "SELECT endorsements FROM insurance_towers WHERE id = %s",
                (quote_id,)
            )
            row = cur.fetchone()
            if row and row[0]:
                endorsements = row[0]
                # Handle both string (JSON) and list formats
                if isinstance(endorsements, str):
                    endorsements = json.loads(endorsements)
                if isinstance(endorsements, list):
                    return endorsements
    except Exception:
        pass

    return []


def _save_endorsements(sub_id: str, quote_id: str, position: str):
    """Save endorsements to the quote in insurance_towers."""
    from pages_components.tower_db import update_quote_field

    try:
        # Get current endorsements as list of names
        quote_data = _get_quote_data_for_rules(sub_id)
        endorsements = get_endorsement_names_for_quote(sub_id, quote_data, position=position)

        # Save to database
        update_quote_field(quote_id, "endorsements", endorsements)
    except Exception:
        pass  # Silent fail - will retry on next save


def get_endorsements_list(sub_id: str, position: str = "primary") -> List[str]:
    """
    Get current endorsements as a simple list of strings for quote generation.

    This includes:
    - Required endorsements (always)
    - Auto-added endorsements (based on rules)
    - Manually selected endorsements
    """
    quote_data = _get_quote_data_for_rules(sub_id)
    return get_endorsement_names_for_quote(sub_id, quote_data, position=position)
