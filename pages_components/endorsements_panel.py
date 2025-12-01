"""
Endorsements Panel Component
Option-specific endorsements management.
"""
from __future__ import annotations

import streamlit as st


# Stock endorsements
STOCK_ENDORSEMENTS = [
    "War and Terrorism Exclusion",
    "Nuclear Risks Exclusion",
    "Communicable Disease Exclusion",
    "Cyber and Data Exclusion",
    "Professional Services Exclusion",
    "Contractual Liability Limitation",
    "Prior Acts Coverage Extension",
    "Extended Reporting Period",
    "Innocent Party Coverage",
    "Regulatory Defense Coverage",
]

# Default endorsements (always included)
DEFAULT_ENDORSEMENTS = ["OFAC", "Service of Suit"]


def render_endorsements_panel(sub_id: str, expanded: bool = False):
    """
    Render option-specific endorsements panel.

    Endorsements are stored per quote option since they can vary
    (e.g., follow-form vs modified terms for different options).
    """
    with st.expander("📄 Endorsements", expanded=expanded):
        # Session keys - option-specific (tied to current quote option)
        session_key = f"endorsements_{sub_id}"
        id_counter_key = f"endorsements_id_counter_{sub_id}"

        # Initialize if needed
        if session_key not in st.session_state:
            st.session_state[session_key] = []
            for i, default in enumerate(DEFAULT_ENDORSEMENTS):
                st.session_state[session_key].append({
                    'id': i,
                    'text': default,
                    'is_default': True
                })

        if id_counter_key not in st.session_state:
            st.session_state[id_counter_key] = len(st.session_state[session_key])

        # Ensure defaults are present
        existing_texts = [item['text'] for item in st.session_state[session_key]]
        for default in DEFAULT_ENDORSEMENTS:
            if default not in existing_texts:
                st.session_state[session_key].insert(0, {
                    'id': st.session_state[id_counter_key],
                    'text': default,
                    'is_default': True
                })
                st.session_state[id_counter_key] += 1

        # Get current items
        current_items = {item['text'] for item in st.session_state[session_key]}
        available_stock = [e for e in STOCK_ENDORSEMENTS if e not in current_items]

        # Quick add from stock
        if available_stock:
            selected_stock = st.multiselect(
                "Add endorsements:",
                available_stock,
                key=f"stock_endorse_{sub_id}",
                help="Select from common endorsements"
            )

            for item in selected_stock:
                if item not in current_items:
                    st.session_state[session_key].append({
                        'id': st.session_state[id_counter_key],
                        'text': item,
                        'is_default': False
                    })
                    st.session_state[id_counter_key] += 1
                    st.rerun()

        # Custom input
        col_text, col_add = st.columns([4, 1])
        clear_key = f"clear_endorse_{sub_id}"
        if clear_key not in st.session_state:
            st.session_state[clear_key] = 0

        with col_text:
            custom = st.text_input(
                "Custom endorsement:",
                key=f"custom_endorse_{sub_id}_{st.session_state[clear_key]}",
                placeholder="Enter custom endorsement...",
                label_visibility="collapsed"
            )
        with col_add:
            if st.button("Add", key=f"add_endorse_{sub_id}"):
                if custom.strip() and custom.strip() not in current_items:
                    st.session_state[session_key].append({
                        'id': st.session_state[id_counter_key],
                        'text': custom.strip(),
                        'is_default': False
                    })
                    st.session_state[id_counter_key] += 1
                    st.session_state[clear_key] += 1
                    st.rerun()

        # Display current endorsements
        if st.session_state[session_key]:
            st.markdown("**Current Endorsements:**")

            for item in st.session_state[session_key]:
                item_id = item['id']
                item_text = item['text']
                is_default = item.get('is_default', False)

                col_text, col_action = st.columns([6, 1])

                with col_text:
                    if is_default:
                        st.markdown(f"🔒 **{item_text}** *(required)*")
                    else:
                        edited = st.text_input(
                            "",
                            value=item_text,
                            key=f"edit_endorse_{item_id}_{sub_id}",
                            label_visibility="collapsed"
                        )
                        if edited != item_text:
                            for j, e in enumerate(st.session_state[session_key]):
                                if e['id'] == item_id:
                                    st.session_state[session_key][j]['text'] = edited
                                    break

                with col_action:
                    if is_default:
                        st.write("")  # Placeholder
                    else:
                        if st.button("🗑️", key=f"rm_endorse_{item_id}_{sub_id}"):
                            st.session_state[session_key] = [
                                e for e in st.session_state[session_key]
                                if e['id'] != item_id
                            ]
                            st.rerun()


def get_endorsements_list(sub_id: str) -> list[str]:
    """Get current endorsements as a simple list of strings."""
    session_key = f"endorsements_{sub_id}"
    if session_key in st.session_state:
        return [item['text'] for item in st.session_state[session_key]]
    return DEFAULT_ENDORSEMENTS.copy()
