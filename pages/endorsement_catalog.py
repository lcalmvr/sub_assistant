"""
📝 Endorsement Catalog Page
===========================
Admin interface for managing the endorsement bank -
reusable endorsement templates with formal titles for policy documents.
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the panel functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_components.endorsement_bank_panel import render_endorsement_bank_panel

# Set page config for this page
st.set_page_config(page_title="Endorsement Catalog", page_icon="📝", layout="wide")

# Page title
st.title("📝 Endorsement Catalog")

# Render the endorsement bank panel
render_endorsement_bank_panel()
