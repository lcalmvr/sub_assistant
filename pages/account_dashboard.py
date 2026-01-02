"""
🏷️ Account Dashboard
====================
Account-centric view for navigating submissions across policy years.
"""

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.account_dashboard import render

st.set_page_config(page_title="Account Dashboard", page_icon="🏷️", layout="wide")

render()

