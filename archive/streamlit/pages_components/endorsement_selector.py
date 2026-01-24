"""
Endorsement Selector Component

Smart endorsement selection UI with:
- Required endorsements (always included)
- Rule-based auto-added endorsements (from database rules)
- Manual selection with multiselect and category filters
- LOB filtering (defaults to cyber/tech)
"""

import streamlit as st
from typing import List, Dict, Optional, Callable

from core.document_library import get_library_entries, get_auto_attach_endorsements


# Required endorsements - always included on every quote
REQUIRED_ENDORSEMENT_CODES = [
    "END-OFAC-001",  # OFAC Sanctions Compliance
    "END-WAR-001",   # War & Terrorism Exclusion
]

# Categories that are LOB-specific (not cyber/tech)
OTHER_LOB_CATEGORIES = {"d&o", "epl", "crime", "fiduciary"}

# Categories for cyber/tech (default view)
CYBER_CATEGORIES = {"exclusion", "extension", "cyber", "general", "coverage",
                    "reporting", "administrative", "cancellation"}

# Category display labels
ENDORSEMENT_CATEGORIES = {
    "exclusion": "Exclusions",
    "extension": "Extensions",
    "cyber": "Cyber",
    "general": "General",
    "coverage": "Coverage",
    "reporting": "Reporting",
    "administrative": "Administrative",
    "cancellation": "Cancellation",
    # Other LOBs
    "d&o": "D&O",
    "epl": "EPL",
    "crime": "Crime",
    "fiduciary": "Fiduciary",
}


def get_required_endorsements(position: str = "primary") -> List[dict]:
    """Get endorsements that are always required."""
    required = []
    all_endorsements = get_library_entries(
        document_type="endorsement",
        status="active"
    )

    for code in REQUIRED_ENDORSEMENT_CODES:
        for e in all_endorsements:
            if e.get("code") == code:
                # Check position compatibility
                e_pos = e.get("position", "either")
                if e_pos == "either" or e_pos == position:
                    required.append(e)
                break

    return required


def get_auto_endorsements(quote_data: dict, position: str = "primary") -> List[dict]:
    """
    Get endorsements that should be auto-added based on quote data.

    Uses database-driven auto_attach_rules for flexible rule configuration.
    Rules are defined per-endorsement in the document_library table.

    Supported conditions (defined in document_library.py):
    - has_sublimits: Attach when quote has sublimits
    - follow_form: Attach based on follow_form status
    - limit_above/limit_below: Attach based on limit thresholds
    - retention_above: Attach based on retention thresholds
    - always: Always attach
    """
    return get_auto_attach_endorsements(quote_data, position)


def get_available_endorsements(
    position: str = "primary",
    exclude_codes: List[str] = None,
    include_other_lobs: bool = False
) -> List[dict]:
    """
    Get available endorsements as a flat list.
    Excludes required and already-selected endorsements.
    Filters by LOB unless include_other_lobs is True.
    """
    exclude_codes = exclude_codes or []

    all_endorsements = get_library_entries(
        document_type="endorsement",
        position=position,
        status="active"
    )

    available = []
    for e in all_endorsements:
        code = e.get("code", "")
        category = e.get("category") or "other"

        # Skip excluded codes
        if code in exclude_codes:
            continue
        if code in REQUIRED_ENDORSEMENT_CODES:
            continue

        # Filter by LOB unless showing all
        if not include_other_lobs and category in OTHER_LOB_CATEGORIES:
            continue

        available.append(e)

    # Sort by category then code (handle None values)
    available.sort(key=lambda x: (x.get("category") or "zzz", x.get("code") or ""))
    return available


def render_endorsement_selector(
    submission_id: str,
    quote_data: dict,
    position: str = "primary",
    on_change: Callable = None
) -> List[dict]:
    """
    Render the endorsement selector UI.

    Args:
        submission_id: Submission ID for unique keys
        quote_data: Current quote data (for rule-based endorsements)
        position: Quote position (primary/excess)
        on_change: Optional callback when selection changes

    Returns:
        List of selected endorsement dicts (including required and auto)
    """
    # Session state keys
    session_key = f"selected_endorsements_{submission_id}"
    show_all_lobs_key = f"show_all_lobs_{submission_id}"

    # Initialize session state
    if session_key not in st.session_state:
        st.session_state[session_key] = []
    if show_all_lobs_key not in st.session_state:
        st.session_state[show_all_lobs_key] = False

    # Get required and auto endorsements
    required = get_required_endorsements(position)
    auto = get_auto_endorsements(quote_data, position)

    # Get codes to exclude from manual selection
    required_codes = [e.get("code") for e in required]
    auto_codes = [e.get("code") for e in auto]
    selected_codes = [e.get("code") for e in st.session_state[session_key]]
    exclude_codes = required_codes + auto_codes

    # === Required Section ===
    st.markdown("**Required** (always included):")
    if required:
        for e in required:
            st.caption(f"🔒 {e.get('code')} - {e.get('title')}")
    else:
        st.caption("_None_")

    # === Auto-Added Section ===
    if auto:
        st.markdown("**Auto-Added** (based on quote):")
        for e in auto:
            reason = e.get("auto_reason", "")
            st.caption(f"⚡ {e.get('code')} - {e.get('title')}")
            if reason:
                st.caption(f"   _({reason})_")

    st.markdown("---")

    # === Manual Selection Section ===
    st.markdown("**Add Endorsements:**")

    # Show all LOBs toggle
    show_all_lobs = st.checkbox(
        "Show other LOBs (D&O, EPL, Crime, Fiduciary)",
        value=st.session_state[show_all_lobs_key],
        key=f"show_lobs_chk_{submission_id}"
    )
    st.session_state[show_all_lobs_key] = show_all_lobs

    # Get available endorsements
    available = get_available_endorsements(
        position=position,
        exclude_codes=exclude_codes,
        include_other_lobs=show_all_lobs
    )

    # Build options for multiselect
    # Format: "CODE - Title" for display, store the full dict
    available_by_code = {e.get("code"): e for e in available}

    def format_option(code: str) -> str:
        e = available_by_code.get(code, {})
        title = e.get("title", "")
        category = e.get("category", "")
        cat_label = ENDORSEMENT_CATEGORIES.get(category, category.title()) if category else ""
        return f"{code} - {title}" + (f" [{cat_label}]" if cat_label else "")

    # Current selection as codes
    current_selection = [e.get("code") for e in st.session_state[session_key] if e.get("code") in available_by_code]

    # All available options as codes
    all_options = list(available_by_code.keys())

    # Multiselect for endorsements
    selected_codes_new = st.multiselect(
        "Select endorsements:",
        options=all_options,
        default=current_selection,
        format_func=format_option,
        key=f"endorse_multiselect_{submission_id}",
        placeholder="Search and select endorsements..."
    )

    # Update session state if selection changed
    if set(selected_codes_new) != set(current_selection):
        # Rebuild the selection list from codes
        new_selection = []
        for code in selected_codes_new:
            if code in available_by_code:
                new_selection.append(available_by_code[code])
        st.session_state[session_key] = new_selection
        if on_change:
            on_change()

    # === Selected Summary ===
    manual_selected = st.session_state[session_key]

    if manual_selected:
        st.markdown(f"**Selected** ({len(manual_selected)}):")
        for e in manual_selected:
            code = e.get("code", "")
            title = e.get("title", "")
            st.caption(f"• {code} - {title}")

    # === Return all endorsements ===
    all_selected = required + auto + manual_selected
    return all_selected


def get_endorsement_codes_for_quote(submission_id: str) -> List[str]:
    """Get list of endorsement codes for saving to quote."""
    session_key = f"selected_endorsements_{submission_id}"
    manual = st.session_state.get(session_key, [])

    # Include required codes
    codes = list(REQUIRED_ENDORSEMENT_CODES)

    # Add manual selections
    for e in manual:
        code = e.get("code")
        if code and code not in codes:
            codes.append(code)

    return codes


def get_endorsement_names_for_quote(
    submission_id: str,
    quote_data: dict,
    position: str = "primary"
) -> List[str]:
    """
    Get list of endorsement names/titles for saving to quote.
    This maintains backward compatibility with existing quote_json format.
    """
    session_key = f"selected_endorsements_{submission_id}"
    manual = st.session_state.get(session_key, [])

    required = get_required_endorsements(position)
    auto = get_auto_endorsements(quote_data, position)

    all_endorsements = required + auto + manual

    # Return titles for backward compatibility
    return [e.get("title", e.get("code", "")) for e in all_endorsements]


def initialize_from_existing(submission_id: str, existing_endorsements: List[str], position: str = "primary"):
    """
    Initialize session state from existing endorsement names on a quote.
    Used when loading an existing quote for editing.
    """
    session_key = f"selected_endorsements_{submission_id}"

    if session_key in st.session_state:
        return  # Already initialized

    if not existing_endorsements:
        st.session_state[session_key] = []
        return

    # Get all library endorsements
    all_endorsements = get_library_entries(
        document_type="endorsement",
        position=position,
        status="active"
    )

    # Match existing names to library entries
    matched = []
    required_codes = set(REQUIRED_ENDORSEMENT_CODES)

    for name in existing_endorsements:
        name_lower = name.lower().strip()

        for lib_e in all_endorsements:
            # Skip required (they're always added)
            if lib_e.get("code") in required_codes:
                continue

            # Skip if already matched
            if lib_e in matched:
                continue

            title_lower = lib_e.get("title", "").lower()
            code_lower = lib_e.get("code", "").lower()

            # Check for match
            if (name_lower == title_lower or
                name_lower in title_lower or
                title_lower in name_lower or
                name_lower == code_lower):
                matched.append(lib_e)
                break

    st.session_state[session_key] = matched
