"""
UW Guide Page
=============
Reference guide for underwriters with common conflicts, guidelines, and best practices
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the UW Guide functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.uw_guide import render

# Set page config for this page
st.set_page_config(page_title="UW Guide", page_icon="📚", layout="wide")

# Render the UW Guide page
render()
