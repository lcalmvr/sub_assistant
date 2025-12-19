"""
Account History Panel

Displays the full history of an account across policy years.
Shows all submissions, their statuses, and a timeline view.
"""

import streamlit as st
from typing import Optional
from datetime import datetime
import os
import importlib.util

# Import account management module
spec = importlib.util.spec_from_file_location(
    "account_management",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "account_management.py")
)
account_mgmt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(account_mgmt)


def render_account_history_panel(account_id: str, current_submission_id: Optional[str] = None):
    """
    Renders a comprehensive history panel for an account.

    Args:
        account_id: UUID of the account
        current_submission_id: Optional - highlight this submission as current
    """
    if not account_id:
        st.info("No account linked")
        return

    account = account_mgmt.get_account(account_id)
    if not account:
        st.error("Account not found")
        return

    submissions = account_mgmt.get_account_submissions(account_id)

    st.markdown(f"### 🏢 {account['name']}")

    # Account metadata
    col1, col2, col3 = st.columns(3)

    with col1:
        if account.get("website"):
            st.markdown(f"**Website:** [{account['website']}](https://{account['website']})")
        else:
            st.markdown("**Website:** N/A")

    with col2:
        if account.get("naics_title"):
            st.markdown(f"**Industry:** {account['naics_title']}")
        elif account.get("industry"):
            st.markdown(f"**Industry:** {account['industry']}")
        else:
            st.markdown("**Industry:** N/A")

    with col3:
        st.markdown(f"**Total Submissions:** {len(submissions)}")

    if account.get("notes"):
        st.info(f"**Notes:** {account['notes']}")

    st.divider()

    # Submission history timeline
    if not submissions:
        st.info("No submissions found for this account")
        return

    st.markdown("### Submission History")

    # Calculate some stats
    bound_count = sum(1 for s in submissions if s.get("submission_outcome") == "bound")
    lost_count = sum(1 for s in submissions if s.get("submission_outcome") == "lost")
    declined_count = sum(1 for s in submissions if s.get("submission_status") == "declined")

    # Stats row
    stat_cols = st.columns(4)
    with stat_cols[0]:
        st.metric("Total", len(submissions))
    with stat_cols[1]:
        st.metric("Bound", bound_count)
    with stat_cols[2]:
        st.metric("Lost", lost_count)
    with stat_cols[3]:
        st.metric("Declined", declined_count)

    st.divider()

    # Timeline view
    for sub in submissions:
        is_current = sub["id"] == current_submission_id

        # Format date
        date_received = sub.get("date_received")
        if isinstance(date_received, datetime):
            date_str = date_received.strftime("%B %d, %Y")
            year = date_received.year
        elif date_received:
            date_str = str(date_received)
            year = ""
        else:
            date_str = "Unknown date"
            year = ""

        # Status formatting
        status = sub.get("submission_status") or "unknown"
        outcome = sub.get("submission_outcome") or ""
        reason = sub.get("outcome_reason") or ""

        # Status emoji
        status_emoji = _get_status_emoji(status, outcome)

        # Format revenue
        revenue = sub.get("annual_revenue")
        if revenue:
            if revenue >= 1_000_000_000:
                revenue_str = f"${revenue/1_000_000_000:.1f}B"
            elif revenue >= 1_000_000:
                revenue_str = f"${revenue/1_000_000:.1f}M"
            else:
                revenue_str = f"${revenue:,.0f}"
        else:
            revenue_str = "N/A"

        # Build display
        if is_current:
            container = st.container(border=True)
        else:
            container = st

        with container:
            cols = st.columns([1, 3, 2, 2])

            with cols[0]:
                st.markdown(f"**{year}**" if year else "")
                st.markdown(status_emoji)

            with cols[1]:
                title = f"**{sub.get('applicant_name', 'Submission')}**"
                if is_current:
                    title += " *(current)*"
                st.markdown(title)
                st.caption(date_str)

            with cols[2]:
                status_display = status.replace("_", " ").title()
                if outcome and outcome != status:
                    status_display += f" ({outcome.replace('_', ' ').title()})"
                st.markdown(status_display)

            with cols[3]:
                st.markdown(f"Revenue: {revenue_str}")

            if reason:
                st.caption(f"Reason: {reason}")

        if not is_current:
            st.markdown("---")


def _get_status_emoji(status: str, outcome: str) -> str:
    """Get an emoji representing the status/outcome combination."""
    if outcome == "bound":
        return "✅"
    elif outcome == "lost":
        return "❌"
    elif status == "declined":
        return "🚫"
    elif status == "quoted":
        return "📝"
    elif status == "pending_info":
        return "⏳"
    elif status == "received":
        return "📥"
    else:
        return "📋"


def render_account_history_compact(account_id: str, current_submission_id: Optional[str] = None):
    """
    Renders a compact version of account history for sidebar or small spaces.

    Args:
        account_id: UUID of the account
        current_submission_id: Optional - the current submission to exclude/highlight
    """
    if not account_id:
        return

    account = account_mgmt.get_account(account_id)
    if not account:
        return

    submissions = account_mgmt.get_account_submissions(account_id)

    # Filter out current submission
    other_submissions = [s for s in submissions if s["id"] != current_submission_id]

    if not other_submissions:
        st.caption("No prior submissions for this account")
        return

    st.markdown(f"**Prior Submissions ({len(other_submissions)})**")

    for sub in other_submissions[:5]:  # Show max 5
        date_received = sub.get("date_received")
        if isinstance(date_received, datetime):
            date_str = date_received.strftime("%m/%d/%y")
        else:
            date_str = "N/A"

        status = sub.get("submission_status") or "unknown"
        outcome = sub.get("submission_outcome") or ""

        emoji = _get_status_emoji(status, outcome)
        status_text = outcome.replace("_", " ").title() if outcome else status.replace("_", " ").title()

        st.caption(f"{emoji} {date_str} - {status_text}")

    if len(other_submissions) > 5:
        st.caption(f"... and {len(other_submissions) - 5} more")


def render_account_summary_card(account_id: str):
    """
    Renders a summary card for an account - useful for list views.

    Args:
        account_id: UUID of the account
    """
    if not account_id:
        return

    account = account_mgmt.get_account(account_id)
    if not account:
        return

    submissions = account_mgmt.get_account_submissions(account_id)

    # Calculate stats
    bound_count = sum(1 for s in submissions if s.get("submission_outcome") == "bound")
    total_count = len(submissions)

    # Most recent submission
    most_recent = submissions[0] if submissions else None

    with st.container(border=True):
        col1, col2 = st.columns([3, 1])

        with col1:
            st.markdown(f"**{account['name']}**")
            if account.get("industry") or account.get("naics_title"):
                st.caption(account.get("naics_title") or account.get("industry"))

        with col2:
            if bound_count > 0:
                st.metric("Bound", f"{bound_count}/{total_count}")
            else:
                st.metric("Submissions", total_count)

        if most_recent:
            date_received = most_recent.get("date_received")
            if isinstance(date_received, datetime):
                st.caption(f"Last activity: {date_received.strftime('%B %Y')}")
