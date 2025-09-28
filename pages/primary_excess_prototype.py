"""
🧪 Primary vs. Excess Prototype Page
"""

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from pages_workflows.primary_excess_prototype import render

st.set_page_config(page_title="Primary/Excess Prototype", page_icon="🧪", layout="wide")

render()

