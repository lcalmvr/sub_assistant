"""
📚 Document Library Page
========================
Admin interface for managing the document library -
reusable document content for endorsements, marketing materials,
claims sheets, and specimen policy forms.
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import the panel functionality
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_components.document_library_panel import render_document_library_panel

# Set page config for this page
st.set_page_config(page_title="Document Library", page_icon="📚", layout="wide")

# Page title
st.title("📚 Document Library")

# Render the document library panel
render_document_library_panel()
