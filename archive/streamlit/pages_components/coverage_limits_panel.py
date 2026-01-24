"""
Coverage Limits Panel Component
Configures coverage limits for the policy form (option-specific).
"""
from __future__ import annotations

import streamlit as st


# Standard coverages (default to aggregate limit)
STANDARD_COVERAGES = [
    "Standard Coverage 1",
    "Standard Coverage 2",
    "Standard Coverage 3",
    "Standard Coverage 4",
    "Standard Coverage 5",
    "Standard Coverage 6",
    "Standard Coverage 7",
    "Standard Coverage 8",
    "Standard Coverage 9",
    "Standard Coverage 10",
]

# Sublimit coverages with their default values
SUBLIMIT_COVERAGES = [
    ("Social Engineering", 100_000),
    ("Funds Transfer Fraud", 250_000),
    ("Invoice Manipulation", 500_000),
    ("Telecommunications Fraud", 1_000_000),
    ("Cryptojacking", 500_000),
]


def _format_amount(amount: int) -> str:
    """Format amount for display."""
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"{amount // 1_000_000}M"
    elif amount >= 1_000 and amount % 1_000 == 0:
        return f"{amount // 1_000}K"
    return str(amount)


def _parse_amount(value_str: str) -> int:
    """Parse amount input with K/M suffixes."""
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
            return int(float(value_str.replace(',', '')))
        except:
            return 0


def render_coverage_limits_panel(sub_id: str, aggregate_limit: int, expanded: bool = False):
    """
    Render coverage limits configuration panel.

    These are the coverage limits that appear on the quote PDF.
    Standard coverages default to aggregate limit.
    Sublimit coverages are configurable.

    Args:
        sub_id: Submission ID
        aggregate_limit: The policy aggregate limit (from dropdowns)
        expanded: Whether to expand by default
    """
    with st.expander("🛡️ Coverage Limits", expanded=expanded):
        st.caption(f"Aggregate Limit: ${aggregate_limit:,}")

        # Session key for storing coverage config
        session_key = f"coverage_limits_{sub_id}"

        # Initialize if needed
        if session_key not in st.session_state:
            st.session_state[session_key] = _get_default_config(aggregate_limit)

        config = st.session_state[session_key]

        # Update standard coverages if aggregate changed
        for name in STANDARD_COVERAGES:
            config["standard"][name] = aggregate_limit

        # Quick-set buttons for sublimit coverages
        st.markdown("**Sublimit Coverages:**")

        col_btns = st.columns([1, 1, 1, 2])
        quick_amounts = [(100_000, "100K"), (250_000, "250K"), (500_000, "500K")]

        for i, (amount, label) in enumerate(quick_amounts):
            with col_btns[i]:
                if st.button(f"All ${label}", key=f"quick_cov_{label}_{sub_id}", use_container_width=True):
                    for name, _ in SUBLIMIT_COVERAGES:
                        config["sublimits"][name] = amount
                    st.session_state[session_key] = config
                    st.rerun()

        # Sublimit inputs
        for name, default in SUBLIMIT_COVERAGES:
            current = config["sublimits"].get(name, default)
            col_name, col_input = st.columns([2, 1])

            with col_name:
                st.markdown(f"**{name}**")

            with col_input:
                new_value = st.text_input(
                    name,
                    value=_format_amount(current),
                    key=f"cov_{name}_{sub_id}",
                    label_visibility="collapsed"
                )
                parsed = _parse_amount(new_value)
                if parsed > 0:
                    if parsed > aggregate_limit:
                        st.error("Exceeds aggregate")
                    else:
                        config["sublimits"][name] = parsed

        # Save config back
        st.session_state[session_key] = config

        # Show standard coverages info
        with st.expander("Standard Coverages (auto-set to aggregate)", expanded=False):
            st.caption("These 10 standard coverages automatically match the aggregate limit.")
            for name in STANDARD_COVERAGES:
                st.text(f"{name}: ${aggregate_limit:,}")


def _get_default_config(aggregate_limit: int) -> dict:
    """Get default coverage configuration."""
    return {
        "standard": {name: aggregate_limit for name in STANDARD_COVERAGES},
        "sublimits": {name: default for name, default in SUBLIMIT_COVERAGES},
    }


def get_coverage_limits(sub_id: str, aggregate_limit: int) -> dict:
    """
    Get current coverage limits configuration for quote generation.

    Returns dict with:
    - aggregate_limit: int
    - standard_coverages: dict[str, int]
    - sublimit_coverages: dict[str, int]
    - all_coverages: dict[str, int] (combined)
    """
    session_key = f"coverage_limits_{sub_id}"

    if session_key in st.session_state:
        config = st.session_state[session_key]
    else:
        config = _get_default_config(aggregate_limit)

    # Ensure standard coverages match current aggregate
    standard = {name: aggregate_limit for name in STANDARD_COVERAGES}
    sublimits = config.get("sublimits", {name: default for name, default in SUBLIMIT_COVERAGES})

    return {
        "aggregate_limit": aggregate_limit,
        "standard_coverages": standard,
        "sublimit_coverages": sublimits,
        "all_coverages": {**standard, **sublimits},
    }
