"""
Tab State Utility

Provides helper functions for preserving tab state across Streamlit reruns.
Use these instead of raw st.rerun() to prevent bouncing back to the Account tab.

For cache-aware reruns, use the save_and_rerun_* functions which clear
submission caches before rerunning.
"""
import streamlit as st


def _clear_caches():
    """Clear submission caches. Import here to avoid circular imports."""
    try:
        from pages_workflows.submissions import clear_submission_caches
        clear_submission_caches()
    except ImportError:
        pass  # May not be available in all contexts


def rerun_on_tab(tab_name: str):
    """
    Trigger a rerun while preserving the current tab.

    Args:
        tab_name: One of "Account", "Review", "UW", "Comps", "Rating", "Quote", "Policy"
    """
    st.session_state["_active_tab"] = tab_name
    st.rerun()


def rerun_on_quote_tab():
    """Rerun and return to Quote tab."""
    rerun_on_tab("Quote")


def rerun_on_policy_tab():
    """Rerun and return to Policy tab."""
    st.session_state["_return_to_policy_tab"] = True
    st.rerun()


def rerun_on_rating_tab():
    """Rerun and return to Rating tab."""
    rerun_on_tab("Rating")


def rerun_on_review_tab():
    """Rerun and return to Review tab."""
    rerun_on_tab("Review")


def rerun_on_account_tab():
    """Rerun and return to Account tab."""
    rerun_on_tab("Account")


def rerun_on_uw_tab():
    """Rerun and return to UW tab."""
    rerun_on_tab("UW")


def rerun_on_comps_tab():
    """Rerun and return to Comps/Benchmark tab."""
    rerun_on_tab("Comps")


# ─────────────────────────────────────────────────────────────
# Cache-aware reruns: Clear caches before rerun (use after saves)
# ─────────────────────────────────────────────────────────────

def save_and_rerun_on_rating_tab():
    """Clear caches and rerun on Rating tab. Use after saving data."""
    _clear_caches()
    rerun_on_rating_tab()


def save_and_rerun_on_quote_tab():
    """Clear caches and rerun on Quote tab. Use after saving data."""
    _clear_caches()
    rerun_on_quote_tab()


def save_and_rerun_on_uw_tab():
    """Clear caches and rerun on UW tab. Use after saving data."""
    _clear_caches()
    rerun_on_uw_tab()


def save_and_rerun_on_policy_tab():
    """Clear caches and rerun on Policy tab. Use after saving data."""
    _clear_caches()
    rerun_on_policy_tab()


def save_and_rerun_on_account_tab():
    """Clear caches and rerun on Account tab. Use after saving data."""
    _clear_caches()
    rerun_on_account_tab()


def save_and_rerun_on_review_tab():
    """Clear caches and rerun on Review tab. Use after saving data."""
    _clear_caches()
    rerun_on_review_tab()


def save_and_rerun_on_comps_tab():
    """Clear caches and rerun on Comps tab. Use after saving data."""
    _clear_caches()
    rerun_on_comps_tab()
