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
    STATUS_LABELS = submission_status.STATUS_LABELS

    # Import status history
    spec_history = importlib.util.spec_from_file_location("status_history", os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "status_history.py"))
    status_history = importlib.util.module_from_spec(spec_history)
    spec_history.loader.exec_module(status_history)
    get_status_history = status_history.get_status_history

    # Import bound option functions
    from core.bound_option import get_bound_option, get_quote_options, bind_option

    if not submission_id:
        return

    try:
        # Get current status
        current_status_data = get_submission_status(submission_id)
        current_status = current_status_data.get("submission_status", "received")
        current_outcome = current_status_data.get("submission_outcome", "pending")
        current_reason = current_status_data.get("outcome_reason", "")
        status_updated_at = current_status_data.get("status_updated_at")

    except Exception as e:
        st.error(f"Error loading status: {e}")
        return

    # Create intelligent status display
    if current_status == "received":
        smart_status = "Received"
    elif current_status == "pending_info":
        smart_status = "Pending Info"
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

        # Show bound option indicator if one exists (regardless of current outcome)
        existing_bound = get_bound_option(submission_id)
        if existing_bound:
            bound_name = existing_bound.get("quote_name", "Option")
            bound_premium = existing_bound.get("sold_premium")
            premium_str = f" | Premium: ${bound_premium:,.0f}" if bound_premium else ""
            st.info(f"**Bound Option:** {bound_name}{premium_str}")

        # Status selection - use new status labels
        status_options = {
            "received": "Received",
            "pending_info": "Pending Info",
            "quoted": "Quoted",
            "declined": "Declined"
        }

        # Handle legacy status values
        if current_status not in status_options:
            current_status = "received"

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
            if selected_status in ["received", "pending_info"]:
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

        # Show bound option info/selection when outcome is "bound"
        bound_option_to_bind = None
        if selected_outcome == "bound":
            bound_option = existing_bound  # Reuse the query from above
            available_quotes = get_quote_options(submission_id)

            if bound_option and available_quotes:
                # Show bound option with ability to change
                sold_premium = bound_option.get("sold_premium")
                premium_display = f"${sold_premium:,.0f}" if sold_premium else "—"
                current_bound_id = bound_option.get("id")

                # Build options with current bound option first
                quote_options_map = {q["id"]: q["quote_name"] for q in available_quotes}

                col_bound, col_change = st.columns([4, 1])
                with col_bound:
                    selected_bound = st.selectbox(
                        "Bound Option",
                        options=list(quote_options_map.keys()),
                        format_func=lambda x: f"✓ {quote_options_map[x]}" if x == current_bound_id else quote_options_map[x],
                        index=list(quote_options_map.keys()).index(current_bound_id) if current_bound_id in quote_options_map else 0,
                        key=f"change_bound_select_{submission_id}"
                    )
                    # If selection changed, set it to be bound on update
                    if selected_bound != current_bound_id:
                        bound_option_to_bind = selected_bound
                with col_change:
                    st.caption(f"Premium: {premium_display}")

            elif available_quotes:
                # No bound option but quotes exist - prompt to select one
                st.warning("Select which quote option was bound:")
                quote_options_map = {q["id"]: q["quote_name"] for q in available_quotes}
                bound_option_to_bind = st.selectbox(
                    "Select Bound Option",
                    options=list(quote_options_map.keys()),
                    format_func=lambda x: quote_options_map[x],
                    key=f"bind_option_select_{submission_id}"
                )
            else:
                st.warning("No quote options available. Create a quote option first before binding.")

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
                    # If binding and an option was selected, bind it first
                    if selected_outcome == "bound" and bound_option_to_bind:
                        bind_option(bound_option_to_bind, bound_by="user")

                    # Handle None reason safely
                    reason_value = (selected_reason or "").strip() or None

                    success = update_submission_status(
                        submission_id,
                        selected_status,
                        selected_outcome,
                        reason_value
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

        # Status history section
        st.divider()
        st.markdown("**Status History**")

        try:
            history = get_status_history(submission_id)

            if history:
                for record in history[:10]:  # Show last 10 changes
                    changed_at = record.get("changed_at")
                    if isinstance(changed_at, datetime):
                        time_str = changed_at.strftime("%m/%d/%y %H:%M")
                    else:
                        time_str = str(changed_at) if changed_at else "N/A"

                    old_status = record.get("old_status", "—")
                    new_status = record.get("new_status", "—")
                    changed_by = record.get("changed_by", "system")
                    notes = record.get("notes", "")

                    # Format the change
                    change_text = f"`{time_str}` — {old_status} → **{new_status}**"
                    if record.get("new_outcome"):
                        change_text += f" ({record['new_outcome']})"
                    change_text += f" — *{changed_by}*"

                    st.caption(change_text)

                    if notes:
                        st.caption(f"   _{notes}_")
            else:
                st.caption("No status changes recorded yet")

        except Exception as e:
            st.caption(f"Could not load history: {e}")

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

        # Calculate totals - handle both old and new status names
        received_data = summary.get("received", {})
        pending_info_data = summary.get("pending_info", {})
        pending_decision_data = summary.get("pending_decision", {})  # Legacy

        received_count = received_data.get("pending", 0)
        pending_info_count = pending_info_data.get("pending", 0)
        legacy_pending = pending_decision_data.get("pending", 0)
        total_in_progress = received_count + pending_info_count + legacy_pending

        quoted_data = summary.get("quoted", {})
        bound_count = quoted_data.get("bound", 0)
        lost_count = quoted_data.get("lost", 0)
        waiting_count = quoted_data.get("waiting_for_response", 0)
        total_quoted = bound_count + lost_count + waiting_count

        declined_data = summary.get("declined", {})
        declined_count = declined_data.get("declined", 0)

        total_submissions = total_in_progress + total_quoted + declined_count

        # Row 1: Total, In Progress, Quoted, Declined
        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.metric("Total Submissions", total_submissions)
        with col2:
            st.metric("In Progress", total_in_progress)
        with col3:
            st.metric("Quoted", total_quoted)
        with col4:
            st.metric("Declined", declined_count)

        # Divider line
        st.divider()

        # Row 2: In Progress breakdown + Quoted breakdown
        col1, col2, col3, col4, col5 = st.columns(5)

        with col1:
            st.metric("Received", received_count)
        with col2:
            st.metric("Pending Info", pending_info_count)
        with col3:
            st.metric("Waiting", waiting_count)
        with col4:
            st.metric("Bound", bound_count)
        with col5:
            st.metric("Lost", lost_count)

    except Exception as e:
        st.error(f"Error loading status summary: {e}")

def render_submissions_by_status():
    """
    Renders a filterable table of submissions by status.
    """
    import os
    import importlib.util
    spec = importlib.util.spec_from_file_location("submission_status", os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "submission_status.py"))
    submission_status = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(submission_status)
    get_submissions_by_status = submission_status.get_submissions_by_status
    import pandas as pd

    st.subheader("Filter Submissions by Status")

    # Status filters
    col1, col2 = st.columns(2)

    with col1:
        status_filter = st.selectbox(
            "Filter by Status",
            options=[None, "received", "pending_info", "quoted", "declined"],
            format_func=lambda x: "All" if x is None else x.replace("_", " ").title(),
            key="status_filter"
        )

    with col2:
        outcome_filter = st.selectbox(
            "Filter by Outcome",
            options=[None, "pending", "bound", "lost", "declined", "waiting_for_response"],
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