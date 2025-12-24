"""
⚖️ Compliance Page
==================
Reference library and rules engine for compliance requirements
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the compliance functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.compliance import render

# Set page config for this page
st.set_page_config(page_title="Compliance", page_icon="⚖️", layout="wide")

# Render the compliance page
render()

