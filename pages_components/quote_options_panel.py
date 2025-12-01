"""
Quote Options Panel Component
Manages quote option selection, naming, and persistence.
"""

import streamlit as st
from pages_components.tower_db import (
    list_quotes_for_submission,
    get_quote_by_id,
    save_tower,
    update_tower,
    clone_quote,
    delete_tower,
)


def render_quote_options_panel(sub_id: str):
    """
    Render the quote options selector and management UI.

    Args:
        sub_id: Submission ID
    """
    if not sub_id:
        st.warning("No submission selected.")
        return

    # Get all quote options for this submission
    all_quotes = list_quotes_for_submission(sub_id)

    # Quote selection and name row
    col_select, col_name, col_actions = st.columns([2, 2, 2])

    with col_select:
        if all_quotes:
            quote_options = {q["id"]: f"{q['quote_name']} ({q['updated_at'].strftime('%m/%d')})" for q in all_quotes}
            quote_options["__new__"] = "+ New Quote Option"

            current_quote_id = st.session_state.get("loaded_tower_id")
            default_idx = 0
            if current_quote_id and current_quote_id in quote_options:
                default_idx = list(quote_options.keys()).index(current_quote_id)

            selected_quote_id = st.selectbox(
                "Quote Option",
                options=list(quote_options.keys()),
                format_func=lambda x: quote_options[x],
                index=default_idx,
                key="quote_selector",
                label_visibility="collapsed"
            )

            # Load selected quote if changed
            if selected_quote_id != "__new__" and selected_quote_id != current_quote_id:
                _load_quote(selected_quote_id)
            elif selected_quote_id == "__new__":
                _start_new_quote(all_quotes)
        else:
            st.caption("No saved quotes yet")

    with col_name:
        quote_name = st.text_input(
            "Quote Name",
            value=st.session_state.get("quote_name", "Option A"),
            key="quote_name_input",
            label_visibility="collapsed",
            placeholder="Quote name..."
        )
        if quote_name != st.session_state.get("quote_name"):
            st.session_state.quote_name = quote_name

    with col_actions:
        btn_cols = st.columns([1, 1, 1])

        with btn_cols[0]:
            if st.button("💾 Save", type="primary", use_container_width=True, key="save_quote_btn"):
                _save_quote(sub_id, all_quotes)

        with btn_cols[1]:
            if st.session_state.get("loaded_tower_id") and st.button("📋 Clone", use_container_width=True, key="clone_quote_btn"):
                _clone_current_quote(all_quotes)

        with btn_cols[2]:
            if st.session_state.get("loaded_tower_id") and st.button("🗑️ Delete", use_container_width=True, key="delete_quote_btn"):
                _delete_current_quote()


def _load_quote(quote_id: str):
    """Load a quote into session state."""
    quote_data = get_quote_by_id(quote_id)
    if quote_data:
        st.session_state.tower_layers = quote_data["tower_json"]
        st.session_state.primary_retention = quote_data["primary_retention"]
        st.session_state.sublimits = quote_data.get("sublimits") or []
        st.session_state.loaded_tower_id = quote_data["id"]
        st.session_state.quote_name = quote_data.get("quote_name", "Option A")
        st.session_state.quoted_premium = quote_data.get("quoted_premium")
        st.rerun()


def _start_new_quote(all_quotes: list):
    """Start a new quote option."""
    if st.session_state.get("loaded_tower_id"):
        st.session_state.tower_layers = []
        st.session_state.primary_retention = None
        st.session_state.sublimits = []
        st.session_state.loaded_tower_id = None
        # Auto-generate next option name
        existing_names = [q["quote_name"] for q in all_quotes]
        for letter in "BCDEFGHIJ":
            new_name = f"Option {letter}"
            if new_name not in existing_names:
                st.session_state.quote_name = new_name
                break
        else:
            st.session_state.quote_name = f"Option {len(all_quotes) + 1}"
        st.session_state.quoted_premium = None
        st.rerun()


def _save_quote(sub_id: str, all_quotes: list):
    """Save current quote to database."""
    if not st.session_state.get("tower_layers"):
        st.warning("No tower data to save.")
        return

    try:
        retention = st.session_state.get("primary_retention")
        sublimits = st.session_state.get("sublimits", [])
        quote_name = st.session_state.get("quote_name", "Option A")
        quoted_premium = st.session_state.get("quoted_premium")

        if st.session_state.get("loaded_tower_id"):
            update_tower(
                st.session_state.loaded_tower_id,
                st.session_state.tower_layers,
                retention,
                sublimits,
                quote_name,
                quoted_premium
            )
            st.success("Quote updated!")
        else:
            tower_id = save_tower(
                sub_id,
                st.session_state.tower_layers,
                retention,
                sublimits,
                quote_name,
                quoted_premium
            )
            st.session_state.loaded_tower_id = tower_id
            st.success("Quote saved!")
        st.rerun()
    except Exception as e:
        st.error(f"Error saving: {e}")


def _clone_current_quote(all_quotes: list):
    """Clone the current quote."""
    try:
        existing_names = [q["quote_name"] for q in all_quotes]
        for letter in "BCDEFGHIJ":
            new_name = f"Option {letter}"
            if new_name not in existing_names:
                break
        else:
            new_name = f"Option {len(all_quotes) + 1}"

        new_id = clone_quote(st.session_state.loaded_tower_id, new_name)
        st.session_state.loaded_tower_id = new_id
        st.session_state.quote_name = new_name
        st.success(f"Cloned as '{new_name}'")
        st.rerun()
    except Exception as e:
        st.error(f"Error cloning: {e}")


def _delete_current_quote():
    """Delete the current quote."""
    try:
        delete_tower(st.session_state.loaded_tower_id)
        st.session_state.loaded_tower_id = None
        st.session_state.quote_name = "Option A"
        st.session_state.quoted_premium = None
        st.success("Quote deleted.")
        st.rerun()
    except Exception as e:
        st.error(f"Error deleting: {e}")


def auto_load_quote_for_submission(sub_id: str):
    """
    Auto-load the most recent quote when submission changes.
    Call this before rendering the quote panel.
    """
    if not sub_id:
        return

    last_loaded_sub = st.session_state.get("_tower_loaded_for_sub")
    if last_loaded_sub != sub_id:
        try:
            from pages_components.tower_db import get_tower_for_submission
            tower_data = get_tower_for_submission(sub_id)
            if tower_data:
                st.session_state.tower_layers = tower_data["tower_json"]
                st.session_state.primary_retention = tower_data["primary_retention"]
                st.session_state.sublimits = tower_data.get("sublimits") or []
                st.session_state.loaded_tower_id = tower_data["id"]
                st.session_state.quote_name = tower_data.get("quote_name", "Option A")
                st.session_state.quoted_premium = tower_data.get("quoted_premium")
            else:
                # No saved tower - start fresh
                st.session_state.tower_layers = []
                st.session_state.primary_retention = None
                st.session_state.sublimits = []
                st.session_state.loaded_tower_id = None
                st.session_state.quote_name = "Option A"
                st.session_state.quoted_premium = None
        except Exception:
            st.session_state.tower_layers = []
            st.session_state.sublimits = []
            st.session_state.loaded_tower_id = None
            st.session_state.quote_name = "Option A"
            st.session_state.quoted_premium = None
        st.session_state._tower_loaded_for_sub = sub_id
