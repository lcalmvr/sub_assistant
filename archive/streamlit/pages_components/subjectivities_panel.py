"""
Subjectivities Panel Component
Submission-level subjectivities management.
Uses @st.fragment for fast partial reruns.
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


@st.fragment
def _render_subjectivities_content(sub_id: str):
    """Fragment for fast subjectivity management."""
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

    # Quick add from stock - use a selectbox + button instead of multiselect for fragment compatibility
    if available_stock:
        col_select, col_add_stock = st.columns([4, 1])
        with col_select:
            selected = st.selectbox(
                "Add from stock:",
                [""] + available_stock,
                key=f"stock_select_{sub_id}",
                label_visibility="collapsed"
            )
        with col_add_stock:
            if st.button("Add", key=f"add_stock_{sub_id}", use_container_width=True):
                if selected and selected not in current_items:
                    st.session_state[session_key].append({
                        'id': st.session_state[id_counter_key],
                        'text': selected
                    })
                    st.session_state[id_counter_key] += 1
                    st.rerun(scope="fragment")

    # Custom input
    col_text, col_add = st.columns([4, 1])
    clear_key = f"clear_subj_{sub_id}"
    if clear_key not in st.session_state:
        st.session_state[clear_key] = 0

    with col_text:
        custom = st.text_input(
            "Custom:",
            key=f"custom_subj_{sub_id}_{st.session_state[clear_key]}",
            placeholder="Enter custom subjectivity...",
            label_visibility="collapsed"
        )
    with col_add:
        if st.button("Add", key=f"add_custom_{sub_id}", use_container_width=True):
            if custom.strip() and custom.strip() not in current_items:
                st.session_state[session_key].append({
                    'id': st.session_state[id_counter_key],
                    'text': custom.strip()
                })
                st.session_state[id_counter_key] += 1
                st.session_state[clear_key] += 1
                st.rerun(scope="fragment")

    # Display current subjectivities
    if st.session_state[session_key]:
        st.markdown("**Current:**")
        for item in st.session_state[session_key]:
            item_id = item['id']
            item_text = item['text']

            col_text, col_del = st.columns([5, 1])
            with col_text:
                st.markdown(f"• {item_text}")
            with col_del:
                if st.button("🗑️", key=f"rm_{item_id}_{sub_id}"):
                    st.session_state[session_key] = [
                        s for s in st.session_state[session_key]
                        if s['id'] != item_id
                    ]
                    st.rerun(scope="fragment")
    else:
        st.caption("No subjectivities added yet")


def render_subjectivities_panel(sub_id: str, expanded: bool = False):
    """
    Render submission-level subjectivities panel.
    Uses @st.fragment for fast partial reruns without page reload.
    """
    with st.expander("📋 Subjectivities", expanded=expanded):
        _render_subjectivities_content(sub_id)


def get_subjectivities_list(sub_id: str) -> list[str]:
    """Get current subjectivities as a simple list of strings."""
    session_key = f"subjectivities_{sub_id}"
    if session_key in st.session_state:
        return [item['text'] for item in st.session_state[session_key]]
    return []
