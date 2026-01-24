"""
Coverage Schedule Layout Mockups
Run with: streamlit run mockups/coverage_schedule_layouts.py
"""
import streamlit as st

st.set_page_config(page_title="Coverage Schedule Mockups", layout="wide")

# Sample data
VARIABLE_LIMITS = [
    ("Dependent System Failure", "$100K"),
    ("Social Engineering", "$100K"),
    ("Invoice Manipulation", "$100K"),
    ("Funds Transfer Fraud", "$100K"),
    ("Telecommunications Fraud", "$100K"),
    ("Cryptojacking", "$100K"),
]

STANDARD_LIMITS = [
    ("Network Security & Privacy Liability", "Full Limits"),
    ("Privacy Regulatory Proceedings", "Full Limits"),
    ("Business Interruption", "Full Limits"),
    ("Cyber Extortion", "Full Limits"),
    ("Data Recovery", "Full Limits"),
    ("Tech E&O", "None"),
]

VALUE_OPTIONS_VARIABLE = ["$100K", "$250K", "$500K", "$1M", "None"]
VALUE_OPTIONS_STANDARD = ["Full Limits", "$1M", "None"]

st.title("Coverage Schedule - Layout Options")
st.markdown("---")

# ============== OPTION A: Current Layout (for comparison) ==============
st.header("Option A: Current Layout (for reference)")
with st.expander("Coverage Schedule", expanded=True):
    st.caption("Policy Form: Cyber · Aggregate: $2M")

    col_left, col_right = st.columns([1.5, 1])

    with col_left:
        tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

        with tab1:
            for name, val in VARIABLE_LIMITS:
                st.markdown(f"**{name}**")
                st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=0, key=f"a_var_{name}", label_visibility="collapsed")

        with tab2:
            for name, val in STANDARD_LIMITS:
                st.markdown(f"**{name}**")
                idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"a_std_{name}", label_visibility="collapsed")

    with col_right:
        st.markdown("**Summary**")
        st.markdown("**Sub Limits:**")
        for name, val in VARIABLE_LIMITS:
            st.markdown(f"{name} - {val}")
        st.markdown("**No Coverage:**")
        st.markdown("Tech E&O")

    st.markdown("---")
    st.button("Edit Coverages", key="a_edit", use_container_width=True)

st.markdown("---")
st.markdown("---")

# ============== OPTION B: Compact Table with Tabs ==============
st.header("Option B: Compact Table with Tabs")
st.markdown("*Tighter layout, inline label + dropdown, no summary*")

with st.expander("Coverage Schedule", expanded=True):
    st.caption("Policy Form: Cyber · Aggregate: $2M")

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        for name, val in VARIABLE_LIMITS:
            col1, col2 = st.columns([3, 1])
            with col1:
                st.markdown(f"<div style='padding-top: 8px'>{name}</div>", unsafe_allow_html=True)
            with col2:
                st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=0, key=f"b_var_{name}", label_visibility="collapsed")

    with tab2:
        for name, val in STANDARD_LIMITS:
            col1, col2 = st.columns([3, 1])
            with col1:
                st.markdown(f"<div style='padding-top: 8px'>{name}</div>", unsafe_allow_html=True)
            with col2:
                idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"b_std_{name}", label_visibility="collapsed")

    st.markdown("---")
    st.button("Edit Coverages", key="b_edit", use_container_width=True)

st.markdown("---")
st.markdown("---")

# ============== OPTION C: Side-by-Side (No Tabs) ==============
st.header("Option C: Side-by-Side (No Tabs)")
st.markdown("*Both visible at once, no clicking between tabs*")

with st.expander("Coverage Schedule", expanded=True):
    st.caption("Policy Form: Cyber · Aggregate: $2M")

    col_var, col_std = st.columns(2)

    with col_var:
        st.markdown("**Variable Limits**")
        for name, val in VARIABLE_LIMITS:
            c1, c2 = st.columns([2.5, 1])
            with c1:
                st.markdown(f"<div style='padding-top: 8px; font-size: 14px'>{name}</div>", unsafe_allow_html=True)
            with c2:
                st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=0, key=f"c_var_{name}", label_visibility="collapsed")

    with col_std:
        st.markdown("**Standard Limits**")
        for name, val in STANDARD_LIMITS:
            c1, c2 = st.columns([2.5, 1])
            with c1:
                st.markdown(f"<div style='padding-top: 8px; font-size: 14px'>{name}</div>", unsafe_allow_html=True)
            with c2:
                idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"c_std_{name}", label_visibility="collapsed")

    st.markdown("---")
    st.button("Edit Coverages", key="c_edit", use_container_width=True)

st.markdown("---")
st.markdown("---")

# ============== OPTION D: Single Combined Table ==============
st.header("Option D: Single Combined Table")
st.markdown("*Everything in one list, grouped by type*")

with st.expander("Coverage Schedule", expanded=True):
    st.caption("Policy Form: Cyber · Aggregate: $2M")

    st.markdown("##### Variable Limits")
    for name, val in VARIABLE_LIMITS:
        col1, col2 = st.columns([4, 1])
        with col1:
            st.markdown(f"<div style='padding-top: 8px'>{name}</div>", unsafe_allow_html=True)
        with col2:
            st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=0, key=f"d_var_{name}", label_visibility="collapsed")

    st.markdown("##### Standard Limits")
    for name, val in STANDARD_LIMITS:
        col1, col2 = st.columns([4, 1])
        with col1:
            st.markdown(f"<div style='padding-top: 8px'>{name}</div>", unsafe_allow_html=True)
        with col2:
            idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
            st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"d_std_{name}", label_visibility="collapsed")

    st.markdown("---")
    st.button("Edit Coverages", key="d_edit", use_container_width=True)

st.markdown("---")
st.markdown("---")

# ============== OPTION E: Summary-First (Read-Only Default) ==============
st.header("Option E: Summary-First (Read-Only Default)")
st.markdown("*Clean summary view, edit mode expands dropdowns*")

with st.expander("Coverage Schedule", expanded=True):
    st.caption("Policy Form: Cyber · Aggregate: $2M")

    edit_mode = st.checkbox("Edit Mode", key="e_edit_mode")

    col_var, col_std = st.columns(2)

    with col_var:
        st.markdown("**Variable Limits**")
        if edit_mode:
            for name, val in VARIABLE_LIMITS:
                c1, c2 = st.columns([2.5, 1])
                with c1:
                    st.markdown(f"<div style='padding-top: 8px; font-size: 14px'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=0, key=f"e_var_{name}", label_visibility="collapsed")
        else:
            for name, val in VARIABLE_LIMITS:
                st.markdown(f"<span style='color: #666'>{name}</span> — **{val}**", unsafe_allow_html=True)

    with col_std:
        st.markdown("**Standard Limits**")
        if edit_mode:
            for name, val in STANDARD_LIMITS:
                c1, c2 = st.columns([2.5, 1])
                with c1:
                    st.markdown(f"<div style='padding-top: 8px; font-size: 14px'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"e_std_{name}", label_visibility="collapsed")
        else:
            for name, val in STANDARD_LIMITS:
                if val == "None":
                    st.markdown(f"<span style='color: #999; text-decoration: line-through'>{name}</span> — **{val}**", unsafe_allow_html=True)
                else:
                    st.markdown(f"<span style='color: #666'>{name}</span> — **{val}**", unsafe_allow_html=True)

    if not edit_mode:
        st.markdown("---")
        st.button("Edit Coverages", key="e_edit_btn", use_container_width=True)
