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
    import uuid
    st.session_state["_active_tab"] = tab_name
    # Use unique request ID so we can track this specific request across reruns
    st.session_state["_active_tab_request_id"] = str(uuid.uuid4())[:8]
    st.session_state["_active_tab_injected"] = False
    st.rerun()


def rerun_on_quote_tab():
    """Rerun and return to Quote tab."""
    rerun_on_tab("Quote")


def rerun_on_policy_tab():
    """Rerun and return to Policy tab."""
    import uuid
    st.session_state["_return_to_policy_tab"] = True
    st.session_state["_active_tab_request_id"] = str(uuid.uuid4())[:8]
    st.session_state["_active_tab_injected"] = False
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


# ─────────────────────────────────────────────────────────────
# on_change callbacks: Set tab state BEFORE Streamlit's natural rerun
# Use these with widget on_change parameter to prevent tab bouncing
# ─────────────────────────────────────────────────────────────

def _set_tab_state(tab_name: str):
    """Set tab state without triggering rerun. For use in on_change callbacks."""
    import uuid
    st.session_state["_active_tab"] = tab_name
    st.session_state["_active_tab_request_id"] = str(uuid.uuid4())[:8]
    st.session_state["_active_tab_injected"] = False


def on_change_stay_on_rating():
    """on_change callback to stay on Rating tab after widget change."""
    _set_tab_state("Rating")


def on_change_stay_on_quote():
    """on_change callback to stay on Quote tab after widget change."""
    _set_tab_state("Quote")


def on_change_stay_on_policy():
    """on_change callback to stay on Policy tab after widget change."""
    _set_tab_state("Policy")


def on_change_stay_on_uw():
    """on_change callback to stay on UW tab after widget change."""
    _set_tab_state("UW")


def on_change_stay_on_account():
    """on_change callback to stay on Account tab after widget change."""
    _set_tab_state("Account")
