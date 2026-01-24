"""
📂 Submissions Page
==================
Submission management page for Streamlit multipage app
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the submission functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.submissions import render

# Set page config for this page
st.set_page_config(page_title="Submissions", page_icon="📂", layout="wide")

# Render the submissions page
render()