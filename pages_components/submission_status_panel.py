import streamlit as st
from typing import Optional
from datetime import datetime

def render_submission_status_panel(submission_id: str):
    """
    Renders submission status management panel with status/outcome selection and reason fields.
    """
    # Import here to avoid circular imports
    import sys
    import os
    import importlib.util
    spec = importlib.util.spec_from_file_location("submission_status", os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "submission_status.py"))
    submission_status = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(submission_status)
    get_submission_status = submission_status.get_submission_status
    update_submission_status = submission_status.update_submission_status
    get_available_outcomes = submission_status.get_available_outcomes
    VALID_STATUS_OUTCOMES = submission_status.VALID_STATUS_OUTCOMES
    
    if not submission_id:
        return
    
    try:
        # Get current status
        current_status_data = get_submission_status(submission_id)
        current_status = current_status_data.get("submission_status", "pending_decision")
        current_outcome = current_status_data.get("submission_outcome", "pending")
        current_reason = current_status_data.get("outcome_reason", "")
        status_updated_at = current_status_data.get("status_updated_at")
        
    except Exception as e:
        st.error(f"Error loading status: {e}")
        return
    
    # Create intelligent status display
    if current_status == "pending_decision":
        smart_status = "Pending Decision"
    elif current_status == "declined":
        smart_status = "Declined"
    elif current_status == "quoted":
        if current_outcome == "waiting_for_response":
            smart_status = "Quoted & Waiting"
        elif current_outcome == "bound":
            smart_status = "Quoted & Bound"
        elif current_outcome == "lost":
            smart_status = "Quoted & Lost"
        else:
            smart_status = "Quoted"
    else:
        # Fallback for any unexpected status
        smart_status = current_status.replace("_", " ").title()
    
    updated_display = status_updated_at.strftime("%m/%d/%y") if status_updated_at else "N/A"
    
    expander_title = f"📋 Status: {smart_status} | Updated: {updated_display}"
    
    # Status update form
    with st.expander(expander_title, expanded=False):
        
        # Account Type Selection
        st.radio(
            "Account Type",
            ["New Account", "Renewal"],
            horizontal=True,
            key=f"account_type_{submission_id}"
        )
        
        # Status selection
        status_options = {
            "pending_decision": "Pending Decision",
            "quoted": "Quoted", 
            "declined": "Declined"
        }
        
        selected_status = st.selectbox(
            "Primary Status",
            options=list(status_options.keys()),
            format_func=lambda x: status_options[x],
            index=list(status_options.keys()).index(current_status),
            key=f"status_select_{submission_id}"
        )
        
        # Outcome selection based on status
        available_outcomes = get_available_outcomes(selected_status)
        outcome_options = {
            "pending": "Pending",
            "bound": "Bound",
            "lost": "Lost",
            "declined": "Declined",
            "waiting_for_response": "Waiting For Response"
        }
        
        # Filter outcome options to only show valid ones for selected status
        valid_outcome_options = {k: v for k, v in outcome_options.items() if k in available_outcomes}
        
        # If status changed, set default outcome
        if selected_status != current_status:
            if selected_status == "pending_decision":
                default_outcome = "pending"
            elif selected_status == "declined":
                default_outcome = "declined"
            else:  # quoted
                default_outcome = "waiting_for_response" if "waiting_for_response" in available_outcomes else available_outcomes[0] if available_outcomes else "bound"
        else:
            default_outcome = current_outcome
        
        selected_outcome = st.selectbox(
            "Outcome", 
            options=list(valid_outcome_options.keys()),
            format_func=lambda x: valid_outcome_options[x],
            index=list(valid_outcome_options.keys()).index(default_outcome) if default_outcome in valid_outcome_options else 0,
            key=f"outcome_select_{submission_id}"
        )
        
        # Reason field (optional)
        selected_reason = st.text_area(
            "Reason (optional)",
            value=current_reason if selected_outcome == current_outcome else "",
            placeholder="Additional notes or reason for outcome...",
            key=f"reason_text_{submission_id}"
        )
        
        # Validation and update
        col_btn1, col_btn2 = st.columns([1, 1])
        
        with col_btn1:
            if st.button("Update Status", type="primary", key=f"update_btn_{submission_id}"):
                try:
                    success = update_submission_status(
                        submission_id,
                        selected_status, 
                        selected_outcome,
                        selected_reason.strip() if selected_reason.strip() else None
                    )
                    
                    if success:
                        st.success("✅ Status updated successfully!")
                        st.rerun()
                    else:
                        st.error("Failed to update status")
                        
                except ValueError as e:
                    st.error(f"Validation error: {e}")
                except Exception as e:
                    st.error(f"Error updating status: {e}")
        
        with col_btn2:
            if st.button("Cancel", key=f"cancel_btn_{submission_id}"):
                st.rerun()
        
        # Display reason if exists
        if current_reason:
            st.info(f"**Reason:** {current_reason}")

def render_status_summary():
    """
    Renders a summary of all submission statuses.
    """
    import sys
    import os
    import importlib.util
    spec = importlib.util.spec_from_file_location("submission_status", os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "submission_status.py"))
    submission_status = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(submission_status)
    get_status_summary = submission_status.get_status_summary
    
    
    try:
        summary = get_status_summary()
        
        if not summary:
            st.info("No submissions found")
            return
        
        # Calculate totals
        pending_data = summary.get("pending_decision", {})
        pending_count = pending_data.get("pending", 0)
        
        quoted_data = summary.get("quoted", {})
        bound_count = quoted_data.get("bound", 0)
        lost_count = quoted_data.get("lost", 0)
        waiting_count = quoted_data.get("waiting_for_response", 0)
        total_quoted = bound_count + lost_count + waiting_count
        
        declined_data = summary.get("declined", {})
        declined_count = declined_data.get("declined", 0)
        
        total_submissions = pending_count + total_quoted + declined_count
        
        # Row 1: Total, Pending, Quoted, Declined
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Total Submissions", total_submissions)
        with col2:
            st.metric("Pending", pending_count)
        with col3:
            st.metric("Quoted", total_quoted)
        with col4:
            st.metric("Declined", declined_count)
        
        # Divider line
        st.divider()
        
        # Row 2: Quoted breakdown
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Quoted", total_quoted)
        with col2:
            st.metric("Waiting", waiting_count)
        with col3:
            st.metric("Bound", bound_count)
        with col4:
            st.metric("Lost", lost_count)
    
    except Exception as e:
        st.error(f"Error loading status summary: {e}")

def render_submissions_by_status():
    """
    Renders a filterable table of submissions by status.
    """
    from app.submission_status import get_submissions_by_status
    import pandas as pd
    
    st.subheader("🔍 Filter Submissions by Status")
    
    # Status filters
    col1, col2 = st.columns(2)
    
    with col1:
        status_filter = st.selectbox(
            "Filter by Status",
            options=[None, "pending_decision", "quoted", "declined"],
            format_func=lambda x: "All" if x is None else x.replace("_", " ").title(),
            key="status_filter"
        )
    
    with col2:
        outcome_filter = st.selectbox(
            "Filter by Outcome", 
            options=[None, "pending", "bound", "lost", "declined"],
            format_func=lambda x: "All" if x is None else x.replace("_", " ").title(),
            key="outcome_filter"
        )
    
    try:
        submissions = get_submissions_by_status(status_filter, outcome_filter)
        
        if not submissions:
            st.info("No submissions found with the selected filters")
            return
        
        # Convert to DataFrame for better display
        df = pd.DataFrame(submissions)
        
        # Format columns for display
        display_df = df.copy()
        display_df['submission_status'] = display_df['submission_status'].str.replace('_', ' ').str.title()
        display_df['submission_outcome'] = display_df['submission_outcome'].str.replace('_', ' ').str.title()
        display_df['date_received'] = pd.to_datetime(display_df['date_received']).dt.strftime('%m/%d/%Y')
        
        if 'status_updated_at' in display_df.columns:
            display_df['status_updated_at'] = pd.to_datetime(display_df['status_updated_at']).dt.strftime('%m/%d/%Y %H:%M')
        
        # Show results
        st.write(f"Found {len(submissions)} submissions")
        
        # Configure columns
        column_config = {
            "id": st.column_config.TextColumn("ID", width="small"),
            "broker_email": st.column_config.TextColumn("Broker", width="medium"),
            "date_received": st.column_config.TextColumn("Date Received", width="small"),
            "submission_status": st.column_config.TextColumn("Status", width="small"),
            "submission_outcome": st.column_config.TextColumn("Outcome", width="small"),
            "revenue": st.column_config.NumberColumn("Revenue", format="compact", width="small"),
            "outcome_reason": st.column_config.TextColumn("Reason", width="large")
        }
        
        st.dataframe(
            display_df,
            use_container_width=True,
            hide_index=True,
            column_config=column_config
        )
        
    except Exception as e:
        st.error(f"Error loading submissions: {e}")