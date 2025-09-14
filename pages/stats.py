"""
Stats Page
==========
Statistics and analytics for submissions
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the submission status functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Set page config for this page
st.set_page_config(page_title="Stats", page_icon="📊", layout="wide")

st.title("📊 Submission Statistics")

# Import and render the status summary that was in the sidebar
from components.submission_status_panel import render_status_summary
render_status_summary()

# Add additional analytics and charts here in the future
st.divider()
st.info("📈 Additional analytics and reporting features coming soon!")