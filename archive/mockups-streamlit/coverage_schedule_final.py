"""
Coverage Schedule - Final Options (L-modified and N-modified)
Run with: streamlit run mockups/coverage_schedule_final.py --server.address localhost
"""
import streamlit as st

st.set_page_config(page_title="Coverage Schedule Final", layout="wide")

# Actual data
VARIABLE_LIMITS = [
    ("Dependent System Failure", "$1M"),
    ("Social Engineering", "$250K"),
    ("Invoice Manipulation", "$250K"),
    ("Funds Transfer Fraud", "$250K"),
    ("Telecommunications Fraud", "$250K"),
    ("Cryptojacking", "$500K"),
]

STANDARD_LIMITS = [
    ("Network Security & Privacy Liability", "Full Limits"),
    ("Privacy Regulatory Proceedings", "Full Limits"),
    ("Payment Card Industry (PCI)", "Full Limits"),
    ("Media Liability", "Full Limits"),
    ("Business Interruption", "Full Limits"),
    ("System Failure", "Full Limits"),
    ("Dependent Business Interruption", "Full Limits"),
    ("Cyber Extortion", "Full Limits"),
    ("Data Recovery", "Full Limits"),
    ("Reputational Harm", "Full Limits"),
    ("Tech E&O", "None"),
]

VALUE_OPTIONS_VARIABLE = ["$100K", "$250K", "$500K", "$1M", "None"]
VALUE_OPTIONS_STANDARD = ["Full Limits", "$1M", "None"]

st.title("Coverage Schedule - Final Options")
st.markdown("---")

# ============== OPTION L-MODIFIED ==============
st.header("Option L Modified")
st.markdown("*Single column, dropdowns extended to align with Edit Coverages button*")

with st.expander("Coverage Schedule", expanded=True):
    # Header - button aligns to right edge
    header_left, header_right = st.columns([3, 1])
    with header_left:
        st.caption("Policy Form: Cyber · Aggregate: $2M")
    with header_right:
        st.button("Edit Coverages", key="lm_edit", type="primary", use_container_width=True)

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        for name, val in VARIABLE_LIMITS:
            # Ratio matches header: label takes 3 parts, dropdown takes 1 part
            col1, col2 = st.columns([3, 1])
            with col1:
                st.markdown(f"<div style='padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
            with col2:
                idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"lm_var_{name}", label_visibility="collapsed")

    with tab2:
        for name, val in STANDARD_LIMITS:
            col1, col2 = st.columns([3, 1])
            with col1:
                st.markdown(f"<div style='padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
            with col2:
                idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"lm_std_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION N-MODIFIED ==============
st.header("Option N Modified")
st.markdown("*Two-column, no divider line, tighter header*")

with st.expander("Coverage Schedule", expanded=True):
    # Compact header - no divider
    top1, top2, top3 = st.columns([2, 2, 1])
    with top1:
        st.caption("**Policy Form:** Cyber")
    with top2:
        st.caption("**Aggregate:** $2M")
    with top3:
        st.button("Edit Coverages", key="nm_edit", type="primary", use_container_width=True)

    # Tabs directly after header (no st.markdown("---"))
    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        items = VARIABLE_LIMITS
        mid = (len(items) + 1) // 2
        col_a, col_b = st.columns(2)

        with col_a:
            for name, val in items[:mid]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"nm_var_a_{name}", label_visibility="collapsed")

        with col_b:
            for name, val in items[mid:]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"nm_var_b_{name}", label_visibility="collapsed")

    with tab2:
        items = STANDARD_LIMITS
        mid = (len(items) + 1) // 2
        col_a, col_b = st.columns(2)

        with col_a:
            for name, val in items[:mid]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"nm_std_a_{name}", label_visibility="collapsed")

        with col_b:
            for name, val in items[mid:]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"nm_std_b_{name}", label_visibility="collapsed")
