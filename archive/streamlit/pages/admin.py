"""
Admin Page
==========
AI-powered admin console for policy administration tasks
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the admin functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.admin import render

# Set page config for this page
st.set_page_config(page_title="Admin Console", page_icon="🤖", layout="wide")

# Render the admin page
render()
