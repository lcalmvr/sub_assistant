"""
Subjectivities Panel Component
Submission-level subjectivities management.
"""
from __future__ import annotations

import streamlit as st


# Stock subjectivities
STOCK_SUBJECTIVITIES = [
    "Coverage is subject to policy terms and conditions",
    "Premium subject to minimum retained premium",
    "Rate subject to satisfactory inspection",
    "Subject to completion of application",
    "Subject to receipt of additional underwriting information",
    "Coverage bound subject to company acceptance",
    "Premium subject to audit",
    "Policy subject to terrorism exclusion",
    "Subject to cyber security questionnaire completion",
    "Coverage subject to satisfactory financial review",
]


def render_subjectivities_panel(sub_id: str, expanded: bool = False):
    """
    Render submission-level subjectivities panel.

    Subjectivities are typically the same across all quote options
    for a given submission.
    """
    with st.expander("📋 Subjectivities", expanded=expanded):
        # Session keys - submission-level
        session_key = f"subjectivities_{sub_id}"
        id_counter_key = f"subjectivities_id_counter_{sub_id}"

        # Initialize if needed
        if session_key not in st.session_state:
            st.session_state[session_key] = []

        if id_counter_key not in st.session_state:
            st.session_state[id_counter_key] = len(st.session_state[session_key])

        # Get current items
        current_items = {item['text'] for item in st.session_state[session_key]}
        available_stock = [s for s in STOCK_SUBJECTIVITIES if s not in current_items]

        # Quick add from stock
        if available_stock:
            selected_stock = st.multiselect(
                "Add subjectivities:",
                available_stock,
                key=f"stock_subj_{sub_id}",
                help="Select from common subjectivities"
            )

            for item in selected_stock:
                if item not in current_items:
                    st.session_state[session_key].append({
                        'id': st.session_state[id_counter_key],
                        'text': item
                    })
                    st.session_state[id_counter_key] += 1
                    st.rerun()

        # Custom input
        col_text, col_add = st.columns([4, 1])
        clear_key = f"clear_subj_{sub_id}"
        if clear_key not in st.session_state:
            st.session_state[clear_key] = 0

        with col_text:
            custom = st.text_input(
                "Custom subjectivity:",
                key=f"custom_subj_{sub_id}_{st.session_state[clear_key]}",
                placeholder="Enter custom subjectivity...",
                label_visibility="collapsed"
            )
        with col_add:
            if st.button("Add", key=f"add_subj_{sub_id}"):
                if custom.strip() and custom.strip() not in current_items:
                    st.session_state[session_key].append({
                        'id': st.session_state[id_counter_key],
                        'text': custom.strip()
                    })
                    st.session_state[id_counter_key] += 1
                    st.session_state[clear_key] += 1
                    st.rerun()

        # Display current subjectivities
        if st.session_state[session_key]:
            st.markdown("**Current Subjectivities:**")

            for item in st.session_state[session_key]:
                item_id = item['id']
                item_text = item['text']

                col_text, col_action = st.columns([6, 1])

                with col_text:
                    edited = st.text_input(
                        "",
                        value=item_text,
                        key=f"edit_subj_{item_id}_{sub_id}",
                        label_visibility="collapsed"
                    )
                    if edited != item_text:
                        for j, s in enumerate(st.session_state[session_key]):
                            if s['id'] == item_id:
                                st.session_state[session_key][j]['text'] = edited
                                break

                with col_action:
                    if st.button("🗑️", key=f"rm_subj_{item_id}_{sub_id}"):
                        st.session_state[session_key] = [
                            s for s in st.session_state[session_key]
                            if s['id'] != item_id
                        ]
                        st.rerun()
        else:
            st.caption("No subjectivities added yet")


def get_subjectivities_list(sub_id: str) -> list[str]:
    """Get current subjectivities as a simple list of strings."""
    session_key = f"subjectivities_{sub_id}"
    if session_key in st.session_state:
        return [item['text'] for item in st.session_state[session_key]]
    return []
