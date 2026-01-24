"""
🏢 Brokers
=========
Standard brokers management page powered by brokers_alt schema.
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the alternate broker functionality as the new standard
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.brokers_alt import render

# Set page config for this page
st.set_page_config(page_title="Brokers", page_icon="🏢", layout="wide")

# Render the brokers (alt) page
render()
