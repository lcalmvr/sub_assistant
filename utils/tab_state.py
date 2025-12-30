"""
Tab State Utility

Provides helper functions for preserving tab state across Streamlit reruns.
Use these instead of raw st.rerun() to prevent bouncing back to the Account tab.
"""
import streamlit as st


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
