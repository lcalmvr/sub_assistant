"""
Unified Insurance Application
============================
Multi-page Streamlit app with submissions and broker management
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

st.set_page_config(
    page_title="submissions",
    layout="wide",
    initial_sidebar_state="expanded"
)

def main():
    # Main content - always show submissions page since this is the main app
    import app_pages.submissions as submissions_page
    submissions_page.render()

if __name__ == "__main__":
    main()