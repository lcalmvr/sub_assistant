"""
Renewal Panel Component

Displays renewal chain, prior year information, and provides
renewal creation functionality for bound submissions.
"""
import streamlit as st
from datetime import datetime
from typing import Optional

from core.renewal_management import (
    create_renewal_expectation,
    convert_to_received,
    mark_renewal_not_received,
    get_renewal_chain,
    get_upcoming_renewals,
    set_policy_dates,
)
from core.bound_option import get_bound_option, has_bound_option
from core.endorsement_management import get_endorsements_for_renewal


def render_renewal_panel(submission_id: str):
    """
    Render the renewal panel showing renewal chain and actions.

    Args:
        submission_id: UUID of the current submission
    """
    if not submission_id:
        return

    # Get submission details to check if it's bound
    from core.submission_status import get_submission_status

    try:
        status_data = get_submission_status(submission_id)
        current_outcome = status_data.get("submission_outcome")
        current_status = status_data.get("submission_status")
    except Exception:
        return

    # Get renewal chain
    try:
        chain = get_renewal_chain(submission_id)
    except Exception:
        chain = []

    # Build expander title
    chain_length = len(chain) if chain else 1
    if chain_length > 1:
        expander_title = f"🔄 Renewal Chain ({chain_length} years)"
    else:
        expander_title = "🔄 Renewal Info"

    # Check if policy is actually bound (has a bound tower)
    is_bound = has_bound_option(submission_id)

    with st.expander(expander_title, expanded=False):
        # Show renewal chain if exists
        if chain and len(chain) > 1:
            _render_renewal_chain(chain, submission_id)
            st.divider()

        # Show prior year bound terms if this is a renewal
        _render_prior_year_info(submission_id, chain)

        # Show renewal actions based on status
        if current_status == "renewal_expected":
            _render_renewal_expected_actions(submission_id)
        elif is_bound or current_outcome == "bound":
            _render_create_renewal_section(submission_id)
        else:
            # For unbound submissions, show a message
            st.caption("Bind the policy to enable renewal management.")


def _render_policy_dates_section(submission_id: str):
    """Render policy effective/expiration date inputs."""
    from sqlalchemy import text
    from core.db import get_conn

    # Get current dates from submission
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT effective_date, expiration_date, renewal_type
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})
        row = result.fetchone()

    effective_date = row[0] if row else None
    expiration_date = row[1] if row else None
    renewal_type = row[2] if row else "new_business"

    st.markdown("**Policy Dates**")

    col1, col2, col3 = st.columns([1, 1, 1])

    with col1:
        new_effective = st.date_input(
            "Effective Date",
            value=effective_date,
            key=f"effective_date_{submission_id}"
        )

    with col2:
        new_expiration = st.date_input(
            "Expiration Date",
            value=expiration_date,
            key=f"expiration_date_{submission_id}"
        )

    with col3:
        renewal_type_display = "Renewal" if renewal_type == "renewal" else "New Business"
        st.text_input("Type", value=renewal_type_display, disabled=True)

    # Save changes if dates changed
    if new_effective != effective_date or new_expiration != expiration_date:
        if st.button("Save Dates", key=f"save_dates_{submission_id}"):
            try:
                set_policy_dates(submission_id, new_effective, new_expiration)
                st.success("Dates saved")
                st.rerun()
            except Exception as e:
                st.error(f"Error saving dates: {e}")


def _render_renewal_chain(chain: list, current_submission_id: str):
    """Render the renewal chain timeline."""
    st.markdown("**Renewal History**")

    for i, submission in enumerate(chain):
        sub_id = submission["id"]
        is_current = sub_id == current_submission_id

        # Build display info
        effective = submission.get("effective_date")
        effective_str = effective.strftime("%m/%d/%Y") if effective else "—"

        status = (submission.get("submission_status") or "").replace("_", " ").title()
        outcome = (submission.get("submission_outcome") or "").replace("_", " ").title()

        # Icon based on outcome
        if submission.get("submission_outcome") == "bound":
            icon = "✅"
        elif submission.get("submission_outcome") == "lost":
            icon = "❌"
        elif submission.get("submission_status") == "renewal_expected":
            icon = "⏳"
        else:
            icon = "📄"

        # Format as timeline entry
        if is_current:
            st.markdown(f"**{icon} {effective_str}** — {status} ({outcome}) ← *Current*")
        else:
            # Create link to prior submission
            st.markdown(f"{icon} [{effective_str}](?selected_submission_id={sub_id}) — {status} ({outcome})")


def _render_prior_year_info(submission_id: str, chain: list):
    """Show prior year's bound option terms if this is a renewal."""
    # Find prior submission in chain
    prior_submission_id = None
    for i, sub in enumerate(chain):
        if sub["id"] == submission_id and i > 0:
            prior_submission_id = chain[i - 1]["id"]
            break

    if not prior_submission_id:
        return

    # Get prior year's bound option
    prior_bound = get_bound_option(prior_submission_id)
    if not prior_bound:
        return

    st.markdown("**Prior Year Bound Terms**")

    sold_premium = prior_bound.get("sold_premium")
    premium_display = f"${sold_premium:,.0f}" if sold_premium else "—"

    tower_json = prior_bound.get("tower_json", [])
    if tower_json and len(tower_json) > 0:
        first_layer = tower_json[0]
        limit = first_layer.get("limit", 0)
        limit_display = f"${limit / 1_000_000:.0f}M" if limit >= 1_000_000 else f"${limit:,.0f}"
    else:
        limit_display = "—"

    retention = prior_bound.get("primary_retention")
    retention_display = f"${retention / 1_000:,.0f}K" if retention else "—"

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Prior Limit", limit_display)
    with col2:
        st.metric("Prior Retention", retention_display)
    with col3:
        st.metric("Prior Premium", premium_display)

    # Show endorsements carrying forward from prior year
    try:
        carryover = get_endorsements_for_renewal(prior_submission_id)
        if carryover:
            st.markdown("**Endorsements Carrying Forward**")
            for e in carryover:
                eff_date = e.get("effective_date")
                eff_str = eff_date.strftime("%m/%d/%y") if eff_date else ""
                premium = e.get("premium_change", 0)
                premium_str = f" (+${premium:,.0f})" if premium > 0 else f" (-${abs(premium):,.0f})" if premium < 0 else ""
                st.caption(f"- {e['description']}{premium_str} ({eff_str})")
    except Exception:
        pass  # Gracefully handle if endorsement table doesn't exist yet


def _render_renewal_expected_actions(submission_id: str):
    """Render actions for renewal_expected status."""
    st.markdown("**Renewal Actions**")
    st.caption("This renewal is expected but not yet received from the broker.")

    col1, col2 = st.columns(2)

    with col1:
        if st.button("Mark as Received", key=f"mark_received_{submission_id}", type="primary"):
            try:
                convert_to_received(submission_id, changed_by="user")
                st.success("Renewal marked as received")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

    with col2:
        reason = st.text_input("Reason (if not received)", key=f"not_received_reason_{submission_id}")
        if st.button("Mark Not Received", key=f"mark_not_received_{submission_id}"):
            try:
                mark_renewal_not_received(submission_id, changed_by="user", reason=reason)
                st.success("Renewal marked as not received")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")


def _render_create_renewal_section(submission_id: str):
    """Render the create renewal section for bound submissions."""
    st.markdown("**Create Renewal**")

    # Check if a renewal already exists
    from sqlalchemy import text
    from core.db import get_conn

    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, submission_status
            FROM submissions
            WHERE prior_submission_id = :submission_id
            ORDER BY created_at DESC
            LIMIT 1
        """), {"submission_id": submission_id})
        existing_renewal = result.fetchone()

    if existing_renewal:
        renewal_id = str(existing_renewal[0])
        renewal_status = existing_renewal[1].replace("_", " ").title()
        st.info(f"Renewal already created: [{renewal_status}](?selected_submission_id={renewal_id})")
        return

    # Check if this submission has a bound option
    if not has_bound_option(submission_id):
        st.warning("Bind a quote option first to enable renewal creation.")
        return

    st.caption("Create a placeholder for next year's renewal to track it before the broker sends it.")

    if st.button("Create Renewal Expectation", key=f"create_renewal_{submission_id}"):
        try:
            new_id = create_renewal_expectation(submission_id, created_by="user")
            st.success(f"Renewal expectation created!")
            # Navigate to the new renewal
            st.query_params["submission_id"] = new_id
            st.rerun()
        except Exception as e:
            st.error(f"Error creating renewal: {e}")


def render_upcoming_renewals_report():
    """Render a report of upcoming policy renewals."""
    st.subheader("Upcoming Renewals")

    days_options = [30, 60, 90, 120]
    days_ahead = st.selectbox(
        "Show renewals due in",
        options=days_options,
        format_func=lambda x: f"{x} days",
        index=2,  # Default to 90 days
        key="renewal_days_ahead"
    )

    try:
        renewals = get_upcoming_renewals(days_ahead)

        if not renewals:
            st.info(f"No policies expiring in the next {days_ahead} days.")
            return

        st.write(f"Found {len(renewals)} upcoming renewals")

        for renewal in renewals:
            days_until = renewal.get("days_until_expiry")
            if isinstance(days_until, int):
                if days_until <= 30:
                    urgency = "🔴"
                elif days_until <= 60:
                    urgency = "🟡"
                else:
                    urgency = "🟢"
            else:
                urgency = "⚪"
                days_until = "—"

            expiration = renewal.get("expiration_date")
            exp_str = expiration.strftime("%m/%d/%Y") if expiration else "—"

            premium = renewal.get("sold_premium")
            premium_str = f"${premium:,.0f}" if premium else "—"

            applicant = renewal.get("applicant_name", "Unknown")
            account = renewal.get("account_name")

            display_name = account if account else applicant

            col1, col2, col3, col4 = st.columns([3, 1, 1, 1])

            with col1:
                st.markdown(f"{urgency} [{display_name}](/submissions?selected_submission_id={renewal['id']})")
            with col2:
                st.caption(f"Expires: {exp_str}")
            with col3:
                st.caption(f"Days: {days_until}")
            with col4:
                st.caption(f"Premium: {premium_str}")

    except Exception as e:
        st.error(f"Error loading renewals: {e}")


def render_renewals_not_received_report():
    """Render a report of renewals that were expected but not received."""
    from core.renewal_management import get_renewals_not_received

    st.subheader("Renewals Not Received")

    try:
        not_received = get_renewals_not_received()

        if not not_received:
            st.info("No missed renewals.")
            return

        st.write(f"Found {len(not_received)} missed renewals")

        for renewal in not_received:
            applicant = renewal.get("applicant_name", "Unknown")
            account = renewal.get("account_name")
            display_name = account if account else applicant

            effective = renewal.get("effective_date")
            eff_str = effective.strftime("%m/%d/%Y") if effective else "—"

            reason = renewal.get("outcome_reason", "—")

            col1, col2, col3 = st.columns([3, 1, 2])

            with col1:
                st.markdown(f"❌ [{display_name}](/submissions?selected_submission_id={renewal['id']})")
            with col2:
                st.caption(f"Expected: {eff_str}")
            with col3:
                st.caption(f"Reason: {reason}")

    except Exception as e:
        st.error(f"Error loading data: {e}")
