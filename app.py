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
- 🏷️ **Account Dashboard** - Search accounts and open submissions
- 📂 **Submissions** - Manage and review AI-processed submissions
- 🏢 **Brokers** - Broker and company management
- 📊 **Stats** - Submission statistics and analytics
- 📋 **Coverage Catalog** - Manage carrier coverage mappings
- 📚 **Document Library** - Manage endorsements, marketing materials, and claims sheets
- ⚖️ **Compliance** - Compliance resources and rules engine for quotes, binders, and policies

Use the sidebar to navigate between pages.
""")

st.markdown("---")
st.markdown("**Quick Actions:**")

row1 = st.columns(3)
with row1[0]:
    st.page_link("pages/submissions.py", label="Submissions", icon="📂", use_container_width=True)
with row1[1]:
    st.page_link("pages/account_dashboard.py", label="Accounts", icon="🏷️", use_container_width=True)
with row1[2]:
    st.page_link("pages/brokers.py", label="Brokers", icon="🏢", use_container_width=True)

row2 = st.columns(3)
with row2[0]:
    st.page_link("pages/stats.py", label="Statistics", icon="📊", use_container_width=True)
with row2[1]:
    st.page_link("pages/coverage_catalog.py", label="Catalog", icon="📋", use_container_width=True)
with row2[2]:
    st.page_link("pages/document_library.py", label="Documents", icon="📚", use_container_width=True)

row3 = st.columns(3)
with row3[0]:
    st.page_link("pages/compliance.py", label="Compliance", icon="⚖️", use_container_width=True)
