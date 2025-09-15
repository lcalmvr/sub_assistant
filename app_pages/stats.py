"""
Stats Page Module
=================
Statistics and analytics functionality for the main app
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def render():
    """Main render function for the stats page"""
    st.title("📊 Submission Statistics")

    # Import and render the status summary that was in the sidebar
    from components.submission_status_panel import render_status_summary
    render_status_summary()

    # Add additional analytics and charts here in the future
    st.divider()
    st.info("📈 Additional analytics and reporting features coming soon!")

# Entry point for backwards compatibility
if __name__ == "__main__":
    st.set_page_config(page_title="Stats", page_icon="📊", layout="wide")
    render()