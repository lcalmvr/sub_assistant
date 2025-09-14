"""
Simple Navigation Test
======================
Test to verify navigation works properly
"""

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(
    page_title="Navigation Test",
    layout="wide",
    initial_sidebar_state="expanded"
)

def main():
    # Sidebar navigation
    with st.sidebar:
        st.title("🚀 Navigation Test")
        page = st.radio(
            "Select page:",
            ["📂 Submissions Test", "🏢 Brokers Test"],
            key="nav_test"
        )
    
    # Main content
    if page == "📂 Submissions Test":
        st.title("📂 Submissions Page - THIS WORKS!")
        st.success("✅ Navigation to Submissions page successful!")
        st.write("You are now viewing the submissions functionality.")
        
        if st.button("Test Button"):
            st.write("Button clicked successfully!")
    
    elif page == "🏢 Brokers Test":
        st.title("🏢 Brokers Page - THIS WORKS!")  
        st.success("✅ Navigation to Brokers page successful!")
        st.write("You are now viewing the brokers functionality.")
        
        if st.button("Add Test Broker"):
            st.write("Add broker button clicked successfully!")

if __name__ == "__main__":
    main()