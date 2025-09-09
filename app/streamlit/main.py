"""
Main Streamlit application entry point
"""
import os
import streamlit as st
import pandas as pd

from .config.settings import CURRENT_USER
from .utils.database import get_conn, load_submissions
from .components.rating_panel import render_rating_panel

# Page config
st.set_page_config(page_title="Submission Viewer", layout="wide")

def main():
    """Main application"""
    st.title("📂 AI-Processed Submissions")
    
    # Search and filters
    col1, col2 = st.columns([2, 1])
    
    with col1:
        search_term = st.text_input("🔍 Search by company name", key="search_submissions", placeholder="Enter company name...")
        
        if search_term != st.session_state.get("last_search_term", ""):
            st.session_state.last_search_term = search_term
            st.rerun()
    
    # Load submissions
    if search_term:
        where_clause = "applicant_name ILIKE %s"
        params = [f"%{search_term}%"]
    else:
        where_clause = "TRUE"
        params = []
    
    try:
        df = load_submissions(where_clause, params)
        
        if df.empty:
            st.info("No submissions found matching your criteria.")
            return
        
        # Display submissions
        st.markdown(f"### Found {len(df)} submission(s)")
        
        # Simple list view for now
        for _, row in df.iterrows():
            with st.expander(f"📋 {row['applicant_name']} - ${row.get('annual_revenue', 'N/A'):,}" if pd.notna(row.get('annual_revenue')) else f"📋 {row['applicant_name']} - Revenue TBD"):
                
                # Basic info
                st.markdown(f"**Date Received:** {row['date_received']}")
                st.markdown(f"**Industry:** {row.get('naics_primary_title', 'N/A')}")
                if pd.notna(row.get('industry_tags')):
                    tags = row['industry_tags'] if isinstance(row['industry_tags'], list) else []
                    if tags:
                        st.markdown(f"**Tags:** {', '.join(tags)}")
                
                # Get detailed submission data for rating
                with get_conn().cursor() as cur:
                    cur.execute(
                        """
                        SELECT applicant_name, business_summary, annual_revenue, naics_primary_title, 
                               bullet_point_summary, nist_controls_summary
                        FROM submissions
                        WHERE id = %s
                        """,
                        (row['id'],),
                    )
                    sub_data = cur.fetchone()
                
                if sub_data:
                    # Render rating panel
                    with st.expander("⭐ Rate & Quote", expanded=False):
                        render_rating_panel(row['id'], sub_data)
    
    except Exception as e:
        st.error(f"Error loading submissions: {e}")

if __name__ == "__main__":
    main()