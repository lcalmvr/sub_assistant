"""
Standalone Similar Submissions Panel Component
Extracted from viewer.py for reusability and modular architecture
"""
import streamlit as st
import pandas as pd
from pgvector import Vector

def render_similar_submissions_panel(sub_id: str, ops_vec: list, ctrl_vec: list, get_conn_func, load_submissions_func, load_submission_func, format_nist_controls_func):
    """
    Render the complete similar submissions panel with vector similarity search.
    
    Args:
        sub_id: Current submission ID
        ops_vec: Operations embedding vector 
        ctrl_vec: Controls embedding vector
        get_conn_func: Function that returns database connection
        load_submissions_func: Function to load submissions with where clause
        load_submission_func: Function to load single submission
        format_nist_controls_func: Function to format NIST controls display
    """
    st.subheader("Similar Submissions")
    
    # First line: Radio buttons for similarity search
    sim_mode = st.radio(
        "Similarity Search Options",
        ("None", "Business operations", "Controls (NIST)", "Operations & NIST"),
        horizontal=True,
        key="sim_mode"
    )
    
    # Second line: Search bar and dropdown
    sim_col1, sim_col2 = st.columns([2, 1])
    
    with sim_col1:
        sim_search_term = st.text_input("🔍 Search similar submissions by company name", key="search_similar_submissions", placeholder="Enter company name...")
        
        # Override similarity mode when there's a search term
        if sim_search_term:
            sim_mode = "None"  # Override similarity mode when searching
    
    with sim_col2:
        # This will be populated with the submission selection dropdown after data is loaded
        sim_dropdown_placeholder = st.empty()
    
    # Determine which submissions to show
    if sim_search_term:
        # Search mode: load submissions based on search term
        where_sql = "LOWER(applicant_name) LIKE LOWER(%s) AND id <> %s"
        params = [f"%{sim_search_term}%", sub_id]
        sim_df = load_submissions_func(where_sql, params)
        
        # Add similarity column as None for search results
        if not sim_df.empty:
            sim_df['similarity'] = None
            
        search_mode = True
    elif sim_mode != "None":
        # Similarity mode: use vector embeddings
        if ops_vec is None and ctrl_vec is None:
            st.info("No embeddings available for similarity search. Please ensure the submission has been processed with embeddings.")
            sim_df = pd.DataFrame()
            search_mode = False
        else:
            vec_lookup = {
                "Business operations": ("ops_embedding", ops_vec),
                "Controls (NIST)": ("controls_embedding", ctrl_vec),
                "Operations & NIST": (
                    "(ops_embedding + controls_embedding)",
                    [a + b for a, b in zip(ops_vec, ctrl_vec)] if (ops_vec is not None and ctrl_vec is not None) else None,
                ),
            }
            col_expr, q_vec = vec_lookup[sim_mode]
            
            if q_vec is not None:  # Only proceed if we have a valid query vector
                with get_conn_func().cursor() as cur:
                    cur.execute(
                        f"""
                        SELECT id,
                               date_received,
                               applicant_name,
                               annual_revenue,
                               naics_primary_title,
                               industry_tags,
                               {col_expr} <=> %s AS dist
                        FROM submissions
                        WHERE id <> %s
                        ORDER BY dist
                        LIMIT 10
                        """,
                        [Vector(q_vec), sub_id],
                    )
                    rows = cur.fetchall()

                sim_data = []
                for r in rows:
                    sim_data.append({
                        "id": str(r[0])[:8],
                        "date_received": r[1],
                        "applicant_name": r[2],
                        "annual_revenue": r[3],
                        "naics_primary_title": r[4],
                        "industry_tags": r[5],
                        "similarity": round(1 - r[6], 3)
                    })

                sim_df = pd.DataFrame(sim_data)
                search_mode = False
            else:
                sim_df = pd.DataFrame()
                search_mode = False
    else:
        # No search or similarity mode
        sim_df = pd.DataFrame()
        search_mode = False

    # Display results if we have any
    if not sim_df.empty:
        # Configure column display
        sim_column_config = {
            "id": st.column_config.TextColumn(
                "ID",
                width="small",
                help="Submission ID (first 8 characters)"
            ),
            "date_received": st.column_config.DateColumn(
                "Date Received",
                format="MM/DD/YYYY",
                width="small"
            ),
            "applicant_name": st.column_config.TextColumn(
                "Company Name",
                width="medium"
            ),
            "annual_revenue": st.column_config.NumberColumn(
                "Revenue",
                format="compact",
                width="small",
                help="Annual revenue in USD"
            ),
            "naics_primary_title": st.column_config.TextColumn(
                "Primary Industry",
                width="medium"
            ),
            "industry_tags": st.column_config.ListColumn(
                "Industry Tags"
            ),
        }
        
        # Add similarity column only if not in search mode
        if not search_mode:
            sim_column_config["similarity"] = st.column_config.NumberColumn(
                "Similarity",
                format="%.3f",
                width="small",
                help="Similarity score (0-1)"
            )

        # Display similar submissions dataframe
        st.dataframe(
            sim_df,
            use_container_width=True,
            hide_index=True,
            column_config=sim_column_config
        )

        # Create dropdown for selection
        sim_label_map = {}
        for _, row in sim_df.iterrows():
            if search_mode:
                display_text = f"{row['applicant_name']} – {str(row['id'])}"
            else:
                display_text = f"{row['applicant_name']} - {row['naics_primary_title']} (Similarity: {row['similarity']})"
            sim_label_map[display_text] = row['id']
        
        # Selection dropdown - moved to top right column
        if sim_label_map:
            with sim_dropdown_placeholder.container():
                sim_label_selected = st.selectbox(
                    "Select a submission to compare:",
                    list(sim_label_map.keys()) or ["—"],
                    key=f"sim_selection_{sub_id}"
                )
            selected_sim_id = sim_label_map.get(sim_label_selected)
            
            if selected_sim_id:
                _render_side_by_side_comparison(sub_id, selected_sim_id, get_conn_func, load_submission_func, format_nist_controls_func)

    st.divider()

def _render_side_by_side_comparison(sub_id: str, selected_sim_id: str, get_conn_func, load_submission_func, format_nist_controls_func):
    """Render detailed side-by-side comparison of two submissions"""
    # Get full submission ID (we only stored first 8 chars)
    with get_conn_func().cursor() as cur:
        cur.execute(
            "SELECT id FROM submissions WHERE id::text LIKE %s",
            (f"{selected_sim_id}%",)
        )
        result = cur.fetchone()
        if result:
            full_selected_id = result[0]
            
            st.markdown("---")
            st.markdown("### 📊 Side-by-Side Comparison")
            
            # Get both submission details
            current_sub = load_submission_func(sub_id)
            selected_sub = load_submission_func(full_selected_id)
            
            if not current_sub.empty and not selected_sub.empty:
                current_row = current_sub.iloc[0]
                selected_row_data = selected_sub.iloc[0]
                
                # Create two columns for comparison
                col1, col2 = st.columns(2)
                
                with col1:
                    st.markdown(f"**Current Account: {current_row['applicant_name']}**")
                with col2:
                    st.markdown(f"**Similar Account: {selected_row_data['applicant_name']}**")
                
                # Basic Information Section
                with st.container():
                    st.markdown("#### 📋 Basic Information")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown(f"**ID:** {str(sub_id)[:8]}")
                        st.markdown(f"**Date Received:** {current_row['date_received']}")
                        st.markdown(f"**Revenue:** ${current_row['annual_revenue']:,.0f}" if current_row['annual_revenue'] else "**Revenue:** Not specified")
                    
                    with col2:
                        st.markdown(f"**ID:** {str(full_selected_id)[:8]}")
                        st.markdown(f"**Date Received:** {selected_row_data['date_received']}")
                        st.markdown(f"**Revenue:** ${selected_row_data['annual_revenue']:,.0f}" if selected_row_data['annual_revenue'] else "**Revenue:** Not specified")
            
                # Industry Information Section
                with st.container():
                    st.markdown("#### 🏭 Industry Information")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown(f"**Primary Industry:** {current_row['naics_primary_title']}")
                        st.markdown(f"**Industry Tags:** {', '.join(current_row['industry_tags']) if current_row['industry_tags'] else 'None'}")
                    
                    with col2:
                        st.markdown(f"**Primary Industry:** {selected_row_data['naics_primary_title']}")
                        st.markdown(f"**Industry Tags:** {', '.join(selected_row_data['industry_tags']) if selected_row_data['industry_tags'] else 'None'}")
                
                # Business Summary Section
                with st.container():
                    st.markdown("#### 📊 Business Summary")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown("**Current Account Business Summary**")
                        if current_row['business_summary']:
                            st.markdown(current_row['business_summary'])
                        else:
                            st.markdown("*No business summary available*")
                    
                    with col2:
                        st.markdown("**Similar Account Business Summary**")
                        if selected_row_data['business_summary']:
                            st.markdown(selected_row_data['business_summary'])
                        else:
                            st.markdown("*No business summary available*")
                
                # NIST Controls Summary Section
                with st.container():
                    st.markdown("#### 🔐 NIST Controls Summary")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown("**Current Account NIST Controls**")
                        current_controls_formatted = format_nist_controls_func(current_row['nist_controls'])
                        st.markdown(current_controls_formatted)
                    
                    with col2:
                        st.markdown("**Similar Account NIST Controls**")
                        similar_controls_formatted = format_nist_controls_func(selected_row_data['nist_controls'])
                        st.markdown(similar_controls_formatted)
                
                # Bullet Point Summary Section
                with st.container():
                    st.markdown("#### 📌 Bullet Point Summary")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.markdown("**Current Account Bullet Points**")
                        if current_row['bullet_point_summary']:
                            st.markdown(current_row['bullet_point_summary'])
                        else:
                            st.markdown("*No bullet point summary available*")
                    
                    with col2:
                        st.markdown("**Similar Account Bullet Points**")
                        if selected_row_data['bullet_point_summary']:
                            st.markdown(selected_row_data['bullet_point_summary'])
                        else:
                            st.markdown("*No bullet point summary available*")
            else:
                st.error("Could not load submission details for comparison")