"""
Main App Entry Point
====================
Streamlit multipage application with navigation
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure the main page
st.set_page_config(
    page_title="Submission Management System",
    page_icon="🏢",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Main page content
st.title("🏢 Submission Management System")
st.markdown("Welcome to the comprehensive submission management platform.")

st.info("""
**Available Pages:**
- 📂 **Submissions** - Manage and review AI-processed submissions
- 🏢 **Brokers** - Broker and company management
- 📊 **Stats** - Submission statistics and analytics
- 📋 **Coverage Catalog** - Manage carrier coverage mappings

Use the sidebar to navigate between pages.
""")

st.markdown("---")
st.markdown("**Quick Actions:**")

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.markdown("### 📂 Submissions")
    if st.button("View Submissions", use_container_width=True):
        st.switch_page("pages/submissions.py")

with col2:
    st.markdown("### 🏢 Brokers")
    if st.button("Manage Brokers", use_container_width=True):
        st.switch_page("pages/brokers.py")

with col3:
    st.markdown("### 📊 Statistics")
    if st.button("View Analytics", use_container_width=True):
        st.switch_page("pages/stats.py")

with col4:
    st.markdown("### 📋 Catalog")
    if st.button("Coverage Catalog", use_container_width=True):
        st.switch_page("pages/coverage_catalog.py")