"""
🏢 Brokers Page
==============
Broker management page for Streamlit multipage app
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the broker functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app_pages.brokers import render

# Set page config for this page
st.set_page_config(page_title="Brokers", page_icon="🏢", layout="wide")

# Render the brokers page
render()