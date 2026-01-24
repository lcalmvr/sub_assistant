"""
Coverage Schedule Layout V2 - Cleaner Options
Run with: streamlit run mockups/coverage_schedule_v2.py --server.address localhost
"""
import streamlit as st

st.set_page_config(page_title="Coverage Schedule V2", layout="wide")

# Actual data from coverage_defaults.yml
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

st.title("Coverage Schedule - V2 Mockups")
st.markdown("*Focus: Prominent Edit button, compact dropdowns, cleaner layout*")
st.markdown("---")

# ============== OPTION F: Header Button + Compact Inline ==============
st.header("Option F: Header Button + Compact Inline")
st.markdown("*Edit button top-right, inline label+dropdown, no summary*")

with st.expander("Coverage Schedule", expanded=True):
    # Header row with policy info and Edit button
    header_left, header_right = st.columns([3, 1])
    with header_left:
        st.caption("Policy Form: Cyber · Aggregate: $2M")
    with header_right:
        st.button("Edit Coverages", key="f_edit", type="primary", use_container_width=True)

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        for name, val in VARIABLE_LIMITS:
            col1, col2 = st.columns([3, 1])
            with col1:
                st.markdown(f"<div style='padding: 8px 0; font-size: 14px;'>{name}</div>", unsafe_allow_html=True)
            with col2:
                idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"f_var_{name}", label_visibility="collapsed")

    with tab2:
        for name, val in STANDARD_LIMITS:
            col1, col2 = st.columns([3, 1])
            with col1:
                st.markdown(f"<div style='padding: 8px 0; font-size: 14px;'>{name}</div>", unsafe_allow_html=True)
            with col2:
                idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"f_std_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION G: Tighter with Visual Grouping ==============
st.header("Option G: Tighter + Value Alignment")
st.markdown("*Same as F but with better visual rhythm, values right-aligned*")

with st.expander("Coverage Schedule", expanded=True):
    header_left, header_right = st.columns([3, 1])
    with header_left:
        st.caption("Policy Form: Cyber · Aggregate: $2M")
    with header_right:
        st.button("Edit Coverages", key="g_edit", type="primary", use_container_width=True)

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        # Tighter columns
        for name, val in VARIABLE_LIMITS:
            col1, col2 = st.columns([4, 1])
            with col1:
                st.markdown(f"<div style='padding: 6px 0; font-size: 14px; color: #333;'>{name}</div>", unsafe_allow_html=True)
            with col2:
                idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"g_var_{name}", label_visibility="collapsed")

    with tab2:
        for name, val in STANDARD_LIMITS:
            col1, col2 = st.columns([4, 1])
            with col1:
                st.markdown(f"<div style='padding: 6px 0; font-size: 14px; color: #333;'>{name}</div>", unsafe_allow_html=True)
            with col2:
                idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"g_std_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION H: Read-Only Default with Inline Edit ==============
st.header("Option H: Read-Only Default, Inline Values")
st.markdown("*Clean read view, Edit button switches to dropdowns*")

with st.expander("Coverage Schedule", expanded=True):
    header_left, header_right = st.columns([3, 1])
    with header_left:
        st.caption("Policy Form: Cyber · Aggregate: $2M")
    with header_right:
        edit_mode_h = st.toggle("Edit", key="h_edit_toggle")

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        if edit_mode_h:
            for name, val in VARIABLE_LIMITS:
                col1, col2 = st.columns([4, 1])
                with col1:
                    st.markdown(f"<div style='padding: 6px 0;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"h_var_{name}", label_visibility="collapsed")
        else:
            for name, val in VARIABLE_LIMITS:
                col1, col2 = st.columns([4, 1])
                with col1:
                    st.markdown(f"<span style='color: #444;'>{name}</span>", unsafe_allow_html=True)
                with col2:
                    st.markdown(f"<div style='text-align: right; font-weight: 600; color: #1a1a1a;'>{val}</div>", unsafe_allow_html=True)

    with tab2:
        if edit_mode_h:
            for name, val in STANDARD_LIMITS:
                col1, col2 = st.columns([4, 1])
                with col1:
                    st.markdown(f"<div style='padding: 6px 0;'>{name}</div>", unsafe_allow_html=True)
                with col2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"h_std_{name}", label_visibility="collapsed")
        else:
            for name, val in STANDARD_LIMITS:
                col1, col2 = st.columns([4, 1])
                with col1:
                    st.markdown(f"<span style='color: #444;'>{name}</span>", unsafe_allow_html=True)
                with col2:
                    if val == "None":
                        st.markdown(f"<div style='text-align: right; color: #999;'>{val}</div>", unsafe_allow_html=True)
                    else:
                        st.markdown(f"<div style='text-align: right; font-weight: 600; color: #1a1a1a;'>{val}</div>", unsafe_allow_html=True)

    if edit_mode_h:
        st.markdown("---")
        col1, col2 = st.columns([3, 1])
        with col2:
            st.button("Edit Coverages", key="h_bulk_edit", use_container_width=True)

st.markdown("---")
st.markdown("---")

# ============== OPTION I: Card-Style with Prominent Actions ==============
st.header("Option I: Cleaner Card Style")
st.markdown("*Minimal chrome, focus on data*")

with st.expander("Coverage Schedule", expanded=True):
    # Top bar
    top1, top2, top3 = st.columns([2, 2, 1])
    with top1:
        st.markdown("**Policy Form:** Cyber")
    with top2:
        st.markdown("**Aggregate:** $2M")
    with top3:
        st.button("Edit Coverages", key="i_edit", type="primary", use_container_width=True)

    st.markdown("---")

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    with tab1:
        # Two-column grid for variable limits
        items = VARIABLE_LIMITS
        mid = (len(items) + 1) // 2
        col_a, col_b = st.columns(2)

        with col_a:
            for name, val in items[:mid]:
                c1, c2 = st.columns([2.5, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 6px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"i_var_a_{name}", label_visibility="collapsed")

        with col_b:
            for name, val in items[mid:]:
                c1, c2 = st.columns([2.5, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 6px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                    st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"i_var_b_{name}", label_visibility="collapsed")

    with tab2:
        # Two-column grid for standard limits
        items = STANDARD_LIMITS
        mid = (len(items) + 1) // 2
        col_a, col_b = st.columns(2)

        with col_a:
            for name, val in items[:mid]:
                c1, c2 = st.columns([2.5, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 6px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"i_std_a_{name}", label_visibility="collapsed")

        with col_b:
            for name, val in items[mid:]:
                c1, c2 = st.columns([2.5, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 13px; padding: 6px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                    st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"i_std_b_{name}", label_visibility="collapsed")

st.markdown("---")
st.markdown("---")

# ============== OPTION J: Minimal - Just the Essentials ==============
st.header("Option J: Minimal Table Look")
st.markdown("*Most compact possible while still being usable*")

with st.expander("Coverage Schedule", expanded=True):
    col_info, col_btn = st.columns([4, 1])
    with col_info:
        st.caption("Cyber · $2M Aggregate")
    with col_btn:
        st.button("Edit Coverages", key="j_edit", type="primary", use_container_width=True)

    tab1, tab2 = st.tabs(["Variable Limits", "Standard Limits"])

    # Custom CSS to reduce padding
    st.markdown("""
    <style>
    .compact-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid #eee;
    }
    .compact-row:last-child {
        border-bottom: none;
    }
    .compact-label {
        font-size: 13px;
        color: #333;
    }
    .compact-value {
        font-size: 13px;
        font-weight: 600;
        color: #111;
    }
    </style>
    """, unsafe_allow_html=True)

    with tab1:
        for name, val in VARIABLE_LIMITS:
            c1, c2 = st.columns([5, 1])
            with c1:
                st.markdown(f"<div class='compact-label'>{name}</div>", unsafe_allow_html=True)
            with c2:
                idx = VALUE_OPTIONS_VARIABLE.index(val) if val in VALUE_OPTIONS_VARIABLE else 0
                st.selectbox(name, VALUE_OPTIONS_VARIABLE, index=idx, key=f"j_var_{name}", label_visibility="collapsed")

    with tab2:
        for name, val in STANDARD_LIMITS:
            c1, c2 = st.columns([5, 1])
            with c1:
                st.markdown(f"<div class='compact-label'>{name}</div>", unsafe_allow_html=True)
            with c2:
                idx = VALUE_OPTIONS_STANDARD.index(val) if val in VALUE_OPTIONS_STANDARD else 0
                st.selectbox(name, VALUE_OPTIONS_STANDARD, index=idx, key=f"j_std_{name}", label_visibility="collapsed")
