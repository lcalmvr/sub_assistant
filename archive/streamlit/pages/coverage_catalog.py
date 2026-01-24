"""
📋 Coverage Catalog Page
========================
Admin interface for managing the coverage catalog -
mapping carrier-specific coverage names to standardized tags.
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the catalog functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.coverage_catalog import render

# Set page config for this page
st.set_page_config(page_title="Coverage Catalog", page_icon="📋", layout="wide")

# Render the coverage catalog page
render()
