"""
Compact Status Header Component

Displays submission status + date inline in page header.
Status: [Quoted & Bound] · Effective 5/1/25 · Updated 12/19/25    [Change]
"""

import streamlit as st
from typing import Optional
from datetime import datetime
from dateutil.relativedelta import relativedelta

# Standardized decline reasons (multi-select)
DECLINE_REASONS = [
    "Outside appetite",
    "Insufficient controls",
    "Claims history",
    "Revenue outside range",
    "Industry exclusion",
    "Inadequate limits requested",
    "Unable to obtain information",
    "Broker relationship",
]

# Lost reasons (why broker didn't bind)
LOST_REASONS = [
    "Price",
    "Coverage terms",
    "Competitor won",
    "Insured declined coverage",
    "No response from broker",
    "Renewal with incumbent",
]


def render_status_header(submission_id: str, get_conn=None):
    """
    Renders compact status header with inline editing.

    Displays: Status: [Quoted & Bound] · Effective 5/1/25 · Updated 12/19/25    [Change]
    Or if no effective date: Status: [Received] · Received 5/1/25 · Updated 12/19/25
    """
    import os
    import importlib.util

    # Import core modules
    spec = importlib.util.spec_from_file_location(
        "submission_status",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "submission_status.py")
    )
    submission_status = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(submission_status)

    get_submission_status = submission_status.get_submission_status
    update_submission_status = submission_status.update_submission_status
    get_available_outcomes = submission_status.get_available_outcomes

    if not submission_id:
        return

    # Get connection for date queries
    if get_conn is None:
        conn = st.session_state.get("db_conn")
    else:
        conn = get_conn()

    # Fetch dates from submission
    effective_date = None
    date_received = None
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT effective_date, date_received
                    FROM submissions WHERE id = %s
                """, (submission_id,))
                row = cur.fetchone()
                if row:
                    effective_date = row[0]
                    date_received = row[1]
        except Exception:
            pass

    try:
        current = get_submission_status(submission_id)
        current_status = current.get("submission_status", "received")
        current_outcome = current.get("submission_outcome", "pending")
        current_reason = current.get("outcome_reason", "")
        status_updated_at = current.get("status_updated_at")
    except Exception as e:
        st.error(f"Error loading status: {e}")
        return

    # Build smart status display
    smart_status = _get_smart_status(current_status, current_outcome)
    updated_display = status_updated_at.strftime("%m/%d/%y") if status_updated_at else "—"

    # Build date display
    if effective_date:
        date_display = f"Effective {effective_date.strftime('%m/%d/%y')}"
    elif date_received:
        date_display = f"Received {date_received.strftime('%m/%d/%y')}"
    else:
        date_display = None

    edit_key = f"editing_status_{submission_id}"
    is_editing = st.session_state.get(edit_key, False)

    if not is_editing:
        # Display mode
        col_status, col_btn = st.columns([6, 1])

        with col_status:
            display_parts = [f"**Status:** {smart_status}"]
            if current_reason and current_outcome in ["declined", "lost"]:
                reason_display = current_reason if len(current_reason) <= 50 else current_reason[:47] + "..."
                display_parts.append(f"· {reason_display}")
            if date_display:
                display_parts.append(f"· {date_display}")
            display_parts.append(f"· Updated {updated_display}")
            st.markdown(" ".join(display_parts))

        with col_btn:
            if st.button("Change", key=f"change_status_btn_{submission_id}", type="secondary"):
                st.session_state[edit_key] = True
                st.rerun()
    else:
        # Edit mode
        _render_status_edit_form(
            submission_id=submission_id,
            current_status=current_status,
            current_outcome=current_outcome,
            current_reason=current_reason,
            effective_date=effective_date,
            edit_key=edit_key,
            get_available_outcomes=get_available_outcomes,
            update_submission_status=update_submission_status,
            conn=conn,
        )


def _get_smart_status(status: str, outcome: str) -> str:
    """Build human-readable combined status string."""
    if status == "received":
        return "Received"
    elif status == "pending_info":
        return "Pending Info"
    elif status == "declined":
        return "Declined"
    elif status == "quoted":
        if outcome == "waiting_for_response":
            return "Quoted (Waiting)"
        elif outcome == "bound":
            return "Quoted & Bound"
        elif outcome == "lost":
            return "Quoted & Lost"
        else:
            return "Quoted"
    elif status == "renewal_expected":
        return "Renewal Expected"
    elif status == "renewal_not_received":
        return "Renewal Not Received"
    else:
        return status.replace("_", " ").title()


def _render_status_edit_form(
    submission_id: str,
    current_status: str,
    current_outcome: str,
    current_reason: str,
    effective_date,
    edit_key: str,
    get_available_outcomes,
    update_submission_status,
    conn,
):
    """Render status and date edit form."""

    # Status and Date on same row
    col_status, col_outcome, col_date = st.columns([2, 2, 2])

    status_options = {
        "received": "Received",
        "pending_info": "Pending Info",
        "quoted": "Quoted",
        "declined": "Declined"
    }

    if current_status not in status_options:
        current_status = "received"

    with col_status:
        selected_status = st.selectbox(
            "Status",
            options=list(status_options.keys()),
            format_func=lambda x: status_options[x],
            index=list(status_options.keys()).index(current_status),
            key=f"status_sel_{submission_id}"
        )

    # Get valid outcomes for selected status
    available_outcomes = get_available_outcomes(selected_status)
    outcome_labels = {
        "pending": "Pending",
        "bound": "Bound",
        "lost": "Lost",
        "declined": "Declined",
        "waiting_for_response": "Waiting"
    }
    valid_outcomes = {k: v for k, v in outcome_labels.items() if k in available_outcomes}

    # Default outcome when status changes
    if selected_status != current_status:
        if selected_status in ["received", "pending_info"]:
            default_outcome = "pending"
        elif selected_status == "declined":
            default_outcome = "declined"
        else:
            default_outcome = "waiting_for_response" if "waiting_for_response" in available_outcomes else available_outcomes[0]
    else:
        default_outcome = current_outcome

    with col_outcome:
        selected_outcome = st.selectbox(
            "Outcome",
            options=list(valid_outcomes.keys()),
            format_func=lambda x: valid_outcomes[x],
            index=list(valid_outcomes.keys()).index(default_outcome) if default_outcome in valid_outcomes else 0,
            key=f"outcome_sel_{submission_id}"
        )

    with col_date:
        new_effective = st.date_input("Effective Date", value=effective_date, key=f"eff_date_{submission_id}")

    # Conditional reason field
    reason_value = None

    if selected_outcome == "declined":
        existing_reasons = []
        if current_reason and current_outcome == "declined":
            for reason in DECLINE_REASONS:
                if reason in current_reason:
                    existing_reasons.append(reason)

        selected_reasons = st.multiselect(
            "Decline reasons",
            options=DECLINE_REASONS,
            default=existing_reasons,
            key=f"decline_reasons_{submission_id}"
        )
        other_reason = st.text_input("Other", key=f"decline_other_{submission_id}", placeholder="Other reason...")

        all_reasons = selected_reasons.copy()
        if other_reason.strip():
            all_reasons.append(f"Other: {other_reason.strip()}")
        reason_value = "; ".join(all_reasons) if all_reasons else None

    elif selected_outcome == "lost":
        existing_reasons = []
        if current_reason and current_outcome == "lost":
            for reason in LOST_REASONS:
                if reason in current_reason:
                    existing_reasons.append(reason)

        selected_reasons = st.multiselect(
            "Lost reasons",
            options=LOST_REASONS,
            default=existing_reasons,
            key=f"lost_reasons_{submission_id}"
        )
        other_reason = st.text_input("Other", key=f"lost_other_{submission_id}", placeholder="Other reason...")

        all_reasons = selected_reasons.copy()
        if other_reason.strip():
            all_reasons.append(f"Other: {other_reason.strip()}")
        reason_value = "; ".join(all_reasons) if all_reasons else None

    elif selected_status == "pending_info":
        reason_value = st.text_input(
            "Waiting for",
            value=current_reason if current_status == "pending_info" else "",
            placeholder="What info needed?",
            key=f"pending_reason_{submission_id}"
        )

    # Buttons
    c1, c2, c3 = st.columns([1, 1, 4])
    with c1:
        if st.button("Update", key=f"update_status_{submission_id}", type="primary"):
            if selected_outcome in ["lost", "declined"] and not reason_value:
                st.error("Select at least one reason")
            else:
                try:
                    # Update status
                    update_submission_status(
                        submission_id,
                        selected_status,
                        selected_outcome,
                        reason_value.strip() if reason_value else None
                    )
                    # Update effective date
                    if conn and new_effective:
                        expiration = new_effective + relativedelta(years=1)
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE submissions SET effective_date = %s, expiration_date = %s, updated_at = now() WHERE id = %s",
                                (new_effective, expiration, submission_id)
                            )
                    elif conn and not new_effective:
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE submissions SET effective_date = NULL, expiration_date = NULL, updated_at = now() WHERE id = %s",
                                (submission_id,)
                            )
                    st.session_state[edit_key] = False
                    st.rerun()
                except ValueError as e:
                    st.error(str(e))
    with c2:
        if st.button("Cancel", key=f"cancel_status_{submission_id}"):
            st.session_state[edit_key] = False
            st.rerun()
