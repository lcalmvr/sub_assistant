"""
📊 Stats Page
=============
Statistics page for Streamlit multipage app
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the stats functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app_pages.stats import render

# Set page config for this page
st.set_page_config(page_title="Stats", page_icon="📊", layout="wide")

# Render the stats page
render()