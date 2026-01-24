"""
Coverage Schedule Layout V3 - Constrained Width
Run with: streamlit run mockups/coverage_schedule_v3.py --server.address localhost
"""
import streamlit as st

st.set_page_config(page_title="Coverage Schedule V3", layout="wide")

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

st.title("Coverage Schedule - V3 Constrained Width")
st.markdown("*Focus: Active dropdowns, prominent button, tighter horizontal spacing*")
st.markdown("---")

# ============== OPTION K: Constrained Width Container ==============
st.header("Option K: Constrained Width")
st.markdown("*Content doesn't stretch to edges - uses ~70% of available width*")

with st.expander("Coverage Schedule", expanded=True):
    # Use columns to constrain width: [content area, empty spacer]
    content_area, spacer = st.columns([2, 1])

    with content_area:
        # Header with button
        header_left, header_right = st.columns([2, 1])
        with header_left:
            st.caption("Policy Form: Cyber · Aggregate: $2M")
        with header_right:
            st.button("Edit Coverages", key="k_edit", type="primary", use_container_width=True)

        tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

        with tab1:
            for name, val in VARIABLE_LIMITS:
                col1, col2 = st.columns([3, 1])
                with col1:
                    st.markdown(f"<div style='padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"k_var_{name}", label_visibility="collapsed")

        with tab2:
            for name, val in STANDARD_LIMITS:
                col1, col2 = st.columns([3, 1])
                with col1:
                    st.markdown(f"<div style='padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"k_std_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION L: Even Tighter ==============
st.header("Option L: Tighter Ratio")
st.markdown("*2:1 label:dropdown ratio, constrained to ~60% width*")

with st.expander("Coverage Schedule", expanded=True):
    content_area, spacer = st.columns([1.5, 1])

    with content_area:
        header_left, header_right = st.columns([2, 1])
        with header_left:
            st.caption("Policy Form: Cyber · Aggregate: $2M")
        with header_right:
            st.button("Edit Coverages", key="l_edit", type="primary", use_container_width=True)

        tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

        with tab1:
            for name, val in VARIABLE_LIMITS:
                col1, col2 = st.columns([2, 1])
                with col1:
                    st.markdown(f"<div style='padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"l_var_{name}", label_visibility="collapsed")

        with tab2:
            for name, val in STANDARD_LIMITS:
                col1, col2 = st.columns([2, 1])
                with col1:
                    st.markdown(f"<div style='padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"l_std_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION M: Max Tight ==============
st.header("Option M: Maximum Compact")
st.markdown("*Constrained to ~50% width, 1.5:1 ratio*")

with st.expander("Coverage Schedule", expanded=True):
    content_area, spacer = st.columns([1, 1])

    with content_area:
        header_left, header_right = st.columns([1.5, 1])
        with header_left:
            st.caption("Cyber · $2M")
        with header_right:
            st.button("Edit Coverages", key="m_edit", type="primary", use_container_width=True)

        tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

        with tab1:
            for name, val in VARIABLE_LIMITS:
                col1, col2 = st.columns([1.5, 1])
                with col1:
                    st.markdown(f"<div style='padding: 6px 0; font-size: 14px;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"m_var_{name}", label_visibility="collapsed")

        with tab2:
            for name, val in STANDARD_LIMITS:
                col1, col2 = st.columns([1.5, 1])
                with col1:
                    st.markdown(f"<div style='padding: 6px 0; font-size: 14px;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"m_std_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION N: Two-Column Fixed ==============
st.header("Option N: Two-Column with Wider Dropdowns")
st.markdown("*Like Option I but with wider dropdowns so 'Full Limits' doesn't truncate*")

with st.expander("Coverage Schedule", expanded=True):
    top1, top2, top3 = st.columns([2, 2, 1])
    with top1:
        st.markdown("**Policy Form:** Cyber")
    with top2:
        st.markdown("**Aggregate:** $2M")
    with top3:
        st.button("Edit Coverages", key="n_edit", type="primary", use_container_width=True)

    st.markdown("---")

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        items = VARIABLE_LIMITS
        mid = (len(items) + 1) // 2
        col_a, col_b = st.columns(2)

        with col_a:
            for name, val in items[:mid]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"n_var_a_{name}", label_visibility="collapsed")

        with col_b:
            for name, val in items[mid:]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"n_var_b_{name}", label_visibility="collapsed")

    with tab2:
        items = STANDARD_LIMITS
        mid = (len(items) + 1) // 2
        col_a, col_b = st.columns(2)

        with col_a:
            for name, val in items[:mid]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"n_std_a_{name}", label_visibility="collapsed")

        with col_b:
            for name, val in items[mid:]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"n_std_b_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION O: Single Column Constrained + Summary Right ==============
st.header("Option O: Constrained Left + Summary Right")
st.markdown("*Dropdowns on left (constrained), clean summary on right (uses the empty space)*")

with st.expander("Coverage Schedule", expanded=True):
    header_left, header_mid, header_right = st.columns([2, 1, 1])
    with header_left:
        st.caption("Policy Form: Cyber · Aggregate: $2M")
    with header_right:
        st.button("Edit Coverages", key="o_edit", type="primary", use_container_width=True)

    st.markdown("---")

    left_panel, right_panel = st.columns([1.2, 1])

    with left_panel:
        tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

        with tab1:
            for name, val in VARIABLE_LIMITS:
                col1, col2 = st.columns([2, 1])
                with col1:
                    st.markdown(f"<div style='padding: 6px 0; font-size: 14px;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"o_var_{name}", label_visibility="collapsed")

        with tab2:
            for name, val in STANDARD_LIMITS:
                col1, col2 = st.columns([2, 1])
                with col1:
                    st.markdown(f"<div style='padding: 6px 0; font-size: 14px;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"o_std_{name}", label_visibility="collapsed")

    with right_panel:
        st.markdown("**Summary**")
        st.markdown("---")

        # Variable limits summary
        st.markdown("**Sub Limits:**")
        for name, val in VARIABLE_LIMITS:
            if val != "None":
                st.markdown(f"<div style='font-size: 13px; color: #555;'>{name} — <b>{val}</b></div>", unsafe_allow_html=True)

        st.markdown("")
        st.markdown("**No Coverage:**")
        # Show items with None
        none_items = [name for name, val in VARIABLE_LIMITS + STANDARD_LIMITS if val == "None"]
        for name in none_items:
            st.markdown(f"<div style='font-size: 13px; color: #999;'>{name}</div>", unsafe_allow_html=True)
