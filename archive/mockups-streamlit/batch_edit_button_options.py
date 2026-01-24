"""
Mockup: Batch Edit Button Placement Options
===========================================
Three different UI options for the Batch Edit functionality
"""

import streamlit as st

st.title("Batch Edit Button Placement Options")
st.markdown("Choose which layout you prefer before implementing")

# Sample coverage data for display
VARIABLE_LIMITS = [
    ("Dependent System Failure", "$1M"),
    ("Social Engineering", "$250K"),
    ("Invoice Manipulation", "$250K"),
    ("Funds Transfer Fraud", "$250K"),
    ("Telecommunications Fraud", "$250K"),
    ("Cryptojacking", "$500K"),
]

STANDARD_LIMITS = [
    ("Network Security Liability", "Full Limits"),
    ("Privacy Liability", "Full Limits"),
    ("PCI Assessment", "Full Limits"),
]

st.markdown("---")

# Option 1: Button at top, full width
st.header("Option 1: Button Stretched Across Top")
with st.expander("Coverage Schedule", expanded=True):
    # Full width button at top
    if st.button("Batch Edit", key="option1_btn", type="primary", use_container_width=True):
        st.info("Batch Edit modal would open here")
    
    st.markdown("---")
    
    tab_var1, tab_std1 = st.tabs(["Variable Limits", "Standard Limits"])
    
    with tab_var1:
        col_a1, col_b1 = st.columns(2)
        mid = len(VARIABLE_LIMITS) // 2
        with col_a1:
            for name, val in VARIABLE_LIMITS[:mid]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    st.selectbox(name, ["$100K", "$250K", "$500K", "$1M"], key=f"opt1_var_{name}", label_visibility="collapsed")
        with col_b1:
            for name, val in VARIABLE_LIMITS[mid:]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    st.selectbox(name, ["$100K", "$250K", "$500K", "$1M"], key=f"opt1_var_b_{name}", label_visibility="collapsed")

st.markdown("---")

# Option 2: Button at bottom, full width
st.header("Option 2: Button Stretched Across Bottom")
with st.expander("Coverage Schedule", expanded=True):
    tab_var2, tab_std2 = st.tabs(["Variable Limits", "Standard Limits"])
    
    with tab_var2:
        col_a2, col_b2 = st.columns(2)
        with col_a2:
            for name, val in VARIABLE_LIMITS[:mid]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    st.selectbox(name, ["$100K", "$250K", "$500K", "$1M"], key=f"opt2_var_{name}", label_visibility="collapsed")
        with col_b2:
            for name, val in VARIABLE_LIMITS[mid:]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    st.selectbox(name, ["$100K", "$250K", "$500K", "$1M"], key=f"opt2_var_b_{name}", label_visibility="collapsed")
    
    st.markdown("---")
    # Full width button at bottom
    if st.button("Batch Edit", key="option2_btn", type="primary", use_container_width=True):
        st.info("Batch Edit modal would open here")

st.markdown("---")

# Option 3: Batch Edit as a third tab
st.header("Option 3: Batch Edit as Third Tab")
with st.expander("Coverage Schedule", expanded=True):
    tab_var3, tab_std3, tab_batch3 = st.tabs(["Variable Limits", "Standard Limits", "Batch Edit"])
    
    with tab_var3:
        col_a3, col_b3 = st.columns(2)
        with col_a3:
            for name, val in VARIABLE_LIMITS[:mid]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    st.selectbox(name, ["$100K", "$250K", "$500K", "$1M"], key=f"opt3_var_{name}", label_visibility="collapsed")
        with col_b3:
            for name, val in VARIABLE_LIMITS[mid:]:
                c1, c2 = st.columns([1.8, 1])
                with c1:
                    st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{name}</div>", unsafe_allow_html=True)
                with c2:
                    st.selectbox(name, ["$100K", "$250K", "$500K", "$1M"], key=f"opt3_var_b_{name}", label_visibility="collapsed")
    
    with tab_batch3:
        st.markdown("### Batch Edit Coverages Across Options")
        st.markdown("This tab would contain the full batch edit interface from the modal.")
        st.markdown("")
        st.info("""
        **Features that would be shown here:**
        - List of all quote options
        - Coverage editing interface
        - "Load Current Settings" button
        - Apply changes to selected options
        """)
        
        # Mock content area
        st.markdown("**Quote Options:**")
        st.checkbox("Option A - Primary", value=True, key="batch_opt_a")
        st.checkbox("Option B - Primary", value=False, key="batch_opt_b")
        st.checkbox("Option C - Primary", value=False, key="batch_opt_c")
        
        st.markdown("")
        st.markdown("**Coverage Settings:**")
        st.selectbox("Dependent System Failure", ["$100K", "$250K", "$500K", "$1M"], key="batch_dep_sys")
        st.selectbox("Social Engineering", ["$100K", "$250K", "$500K", "$1M"], key="batch_soc_eng")
        
        st.markdown("")
        if st.button("Apply to Selected Options", type="primary", key="batch_apply"):
            st.success("Changes would be applied to selected options")

st.markdown("---")
st.markdown("**Which option do you prefer?**")





