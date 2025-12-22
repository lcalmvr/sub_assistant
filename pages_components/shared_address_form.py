"""
Shared Address Form Component

Reusable address form fields for consistent address entry across the application.
Used by account panel, endorsement forms, and anywhere else address input is needed.
"""

import streamlit as st
from typing import Optional

# US states for dropdown
US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
]


def render_address_form(
    key_prefix: str,
    default_values: Optional[dict] = None,
    show_header: bool = False,
    header_text: str = "Address",
) -> dict:
    """
    Render address input fields and return the entered values.

    Args:
        key_prefix: Unique prefix for Streamlit widget keys
        default_values: Optional dict with default values for fields
            Expected keys: street, street2, city, state, zip
        show_header: Whether to show an "Address" header above fields
        header_text: Text for the header (if show_header is True)

    Returns:
        Dict with keys: street, street2, city, state, zip
    """
    defaults = default_values or {}

    if show_header:
        st.markdown(f"**{header_text}**")

    # Street and Suite/Unit row
    col1, col2 = st.columns(2)
    with col1:
        street = st.text_input(
            "Street Address",
            value=defaults.get("street", ""),
            placeholder="123 Main St",
            key=f"{key_prefix}_street"
        )
    with col2:
        street2 = st.text_input(
            "Suite/Unit",
            value=defaults.get("street2", ""),
            placeholder="Suite 100",
            key=f"{key_prefix}_street2"
        )

    # City, State, ZIP row
    col3, col4, col5 = st.columns([2, 1, 1])
    with col3:
        city = st.text_input(
            "City",
            value=defaults.get("city", ""),
            key=f"{key_prefix}_city"
        )
    with col4:
        # State dropdown
        default_state = defaults.get("state", "")
        state_options = [""] + US_STATES
        default_state_idx = state_options.index(default_state) if default_state in state_options else 0
        state = st.selectbox(
            "State",
            options=state_options,
            index=default_state_idx,
            key=f"{key_prefix}_state"
        )
    with col5:
        zip_code = st.text_input(
            "ZIP",
            value=defaults.get("zip", ""),
            max_chars=10,
            key=f"{key_prefix}_zip"
        )

    return {
        "street": street,
        "street2": street2,
        "city": city,
        "state": state,
        "zip": zip_code,
    }


def format_address(address: dict) -> str:
    """
    Format an address dict into a display string.

    Args:
        address: Dict with street, street2, city, state, zip keys

    Returns:
        Formatted address like "123 Main St, Suite 100, Boston, MA 02101"
    """
    if not address or not isinstance(address, dict):
        return ""

    parts = []

    # Street line(s)
    street = str(address.get("street", "") or "").strip()
    street2 = str(address.get("street2", "") or "").strip()
    if street:
        parts.append(street)
    if street2:
        parts.append(street2)

    # City, State ZIP
    city = str(address.get("city", "") or "").strip()
    state = str(address.get("state", "") or "").strip()
    zip_code = str(address.get("zip", "") or "").strip()

    city_state_zip = ""
    if city:
        city_state_zip = city
        if state:
            city_state_zip += f", {state}"
        if zip_code:
            city_state_zip += f" {zip_code}"
    elif state and zip_code:
        city_state_zip = f"{state} {zip_code}"

    if city_state_zip:
        parts.append(city_state_zip)

    return ", ".join(parts) if parts else ""
