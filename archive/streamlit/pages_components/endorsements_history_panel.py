"""
Endorsements History Panel

Displays midterm policy endorsements for bound submissions.
Provides ability to create, issue, and void endorsements.

Performance note: This panel can accept pre-loaded data via policy_tab_data
to avoid redundant database queries. When called from Policy tab, pass the
pre-loaded data dict to eliminate 5+ database round-trips.
"""
import streamlit as st
from datetime import date, datetime
from typing import Optional

from core.bound_option import get_bound_option, has_bound_option
from core.endorsement_management import (
    ENDORSEMENT_TYPES,
    PREMIUM_METHODS,
    create_endorsement,
    update_endorsement,
    delete_draft_endorsement,
    issue_endorsement,
    void_endorsement,
    get_endorsements,
    get_endorsement,
    get_effective_policy_state,
    get_policy_dates,
    calculate_days_remaining,
    calculate_pro_rata_premium,
    save_endorsement_document_url,
)
from pages_components.shared_address_form import render_address_form, format_address


def render_endorsements_history_panel(
    submission_id: str,
    preloaded_data: Optional[dict] = None
):
    """
    Render the endorsements history panel for a submission.

    Only displays for bound policies.

    Args:
        submission_id: UUID of the current submission
        preloaded_data: Optional pre-loaded data from policy_tab_data.load_policy_tab_data()
                       If provided, uses this data instead of making database queries.
                       Expected keys: bound_option, effective_state, endorsements, submission
    """
    if not submission_id:
        return

    # Use pre-loaded data if available, otherwise fetch (backward compatibility)
    if preloaded_data:
        if not preloaded_data.get("has_bound_option"):
            return
        state = preloaded_data.get("effective_state", {})
        bound = preloaded_data.get("bound_option")
        endorsements = preloaded_data.get("endorsements", [])
        policy_dates = (
            preloaded_data.get("submission", {}).get("effective_date"),
            preloaded_data.get("submission", {}).get("expiration_date"),
        )
    else:
        # Legacy path - fetch data (slower)
        if not has_bound_option(submission_id):
            return
        state = get_effective_policy_state(submission_id)
        bound = get_bound_option(submission_id)
        endorsements = get_endorsements(submission_id, include_voided=True)
        policy_dates = None  # Will fetch on demand

    # Mid-term Endorsements header with New button
    endorsement_count = state.get("endorsement_count", 0)

    col1, col2 = st.columns([3, 1])
    with col1:
        st.markdown(f"##### Mid-term Endorsements ({endorsement_count})" if endorsement_count else "##### Mid-term Endorsements")
    with col2:
        _render_new_endorsement_form_v2(
            submission_id,
            bound,
            policy_dates=policy_dates
        )

    # Render endorsements list
    _render_endorsements_list_compact(endorsements, bound, policy_dates)

    # Edit dialog - rendered at panel level (not inside row loop)
    _render_edit_endorsement_dialog()


def _render_premium_summary(state: dict):
    """Render premium summary showing base + adjustments = effective, plus extension info."""
    # Show extension info if extended
    if state.get("is_extended"):
        original_exp = state.get("original_expiration")
        effective_exp = state.get("effective_expiration")
        if original_exp and effective_exp:
            exp_str = effective_exp.strftime("%m/%d/%Y") if hasattr(effective_exp, 'strftime') else str(effective_exp)
            st.info(f"**Policy Extended** | Original expiration: {original_exp} | New expiration: {exp_str}")

    col1, col2, col3 = st.columns(3)

    base = state.get("base_premium", 0)
    adjustments = state.get("premium_adjustments", 0)
    effective = state.get("effective_premium", 0)

    with col1:
        st.metric("Base Premium", f"${base:,.0f}")
    with col2:
        adj_str = f"+${adjustments:,.0f}" if adjustments >= 0 else f"-${abs(adjustments):,.0f}"
        st.metric("Adjustments", adj_str)
    with col3:
        st.metric("Effective Premium", f"${effective:,.0f}")


def _render_endorsement_list(endorsements: list):
    """Render list of endorsements - simplified view."""
    st.markdown("**Endorsement History**")

    for e in endorsements:
        _render_endorsement_row(e)


def _render_endorsement_row(e: dict):
    """Render a single endorsement row - simplified to 3 columns max."""
    endorsement_id = e["id"]
    number = e["endorsement_number"]
    status = e["status"]
    eff_date = e["effective_date"]
    eff_str = eff_date.strftime("%m/%d/%Y") if eff_date else ""
    description = e["description"]
    premium_change = e.get("premium_change", 0)
    endorsement_type = e["endorsement_type"]
    formal_title = e.get("formal_title")

    # Status styling
    if status == "draft":
        status_icon = ":orange_circle:"
    elif status == "issued":
        status_icon = ":white_check_mark:"
    elif status == "void":
        status_icon = ":no_entry_sign:"
    else:
        status_icon = ":red_circle:"

    # Premium display (not for voided)
    if status == "void" or endorsement_type == "bor_change":
        premium_str = ""
    elif premium_change > 0:
        premium_str = f"+${premium_change:,.0f}"
    elif premium_change < 0:
        premium_str = f"-${abs(premium_change):,.0f}"
    else:
        premium_str = ""

    # Build title
    title = formal_title if formal_title else description
    if len(title) > 50:
        title = title[:47] + "..."

    # Simple 3-column layout: Info | Premium | Action
    col1, col2, col3 = st.columns([4, 1, 1.5])

    with col1:
        if status == "void":
            st.markdown(f"{status_icon} ~~**#{number}** {title}~~ **VOID**")
            void_reason = e.get("void_reason", "")
            st.caption(f"{eff_str} | Voided{': ' + void_reason if void_reason else ''}")
        else:
            st.markdown(f"{status_icon} **#{number}** {title}")
            st.caption(f"{eff_str}")

    with col2:
        if premium_str:
            st.markdown(f"**{premium_str}**")

    with col3:
        if status == "draft":
            # Show PDF link if available (generated on creation)
            pdf_url = e.get("document_url")
            if pdf_url:
                st.markdown(f"[PDF]({pdf_url})")
            # Issue button just locks it in
            if st.button("Issue", key=f"issue_{endorsement_id}", type="primary", use_container_width=True):
                try:
                    issue_endorsement(endorsement_id, issued_by="user")
                    st.rerun()
                except Exception as ex:
                    st.error(f"Error: {ex}")
        elif status == "issued":
            pdf_url = e.get("document_url")
            if pdf_url:
                st.markdown(f"[PDF]({pdf_url})")

    # Draft actions - Edit and Delete buttons
    if status == "draft":
        col_a, col_b, _ = st.columns([1, 1, 3])
        with col_a:
            if st.button("Edit", key=f"edit_{endorsement_id}"):
                st.session_state[f"editing_endorsement_{endorsement_id}"] = True
                st.rerun()
        with col_b:
            if st.button("Delete", key=f"delete_{endorsement_id}"):
                try:
                    delete_draft_endorsement(endorsement_id)
                    st.rerun()
                except Exception as ex:
                    st.error(f"Error: {ex}")

    # Issued actions - Void button
    if status == "issued":
        if st.button("Void", key=f"void_{endorsement_id}"):
            st.session_state[f"confirm_void_{endorsement_id}"] = True

        # Void confirmation
        if st.session_state.get(f"confirm_void_{endorsement_id}"):
            reason = st.text_input("Reason for voiding", key=f"void_reason_{endorsement_id}")
            col_a, col_b, _ = st.columns([1, 1, 3])
            with col_a:
                if st.button("Confirm Void", key=f"confirm_void_btn_{endorsement_id}", type="primary"):
                    if reason:
                        try:
                            void_endorsement(endorsement_id, reason, voided_by="user")
                            st.session_state.pop(f"confirm_void_{endorsement_id}", None)
                            st.rerun()
                        except Exception as ex:
                            st.error(f"Error: {ex}")
                    else:
                        st.warning("Enter a reason")
            with col_b:
                if st.button("Cancel", key=f"cancel_void_{endorsement_id}"):
                    st.session_state.pop(f"confirm_void_{endorsement_id}", None)
                    st.rerun()

    # Edit form (for drafts)
    if st.session_state.get(f"editing_endorsement_{endorsement_id}"):
        _render_edit_endorsement_form(e)


def _render_edit_endorsement_dialog():
    """Render edit dialog at panel level - triggered by session state."""
    edit_data = st.session_state.get("_edit_endorsement_data")
    if not edit_data:
        return

    @st.dialog("Edit Endorsement", width="large")
    def show_dialog():
        _render_edit_dialog_content(
            edit_data["endorsement"],
            edit_data.get("bound"),
            edit_data.get("policy_dates")
        )

    show_dialog()


def _render_edit_dialog_content(e: dict, bound: dict = None, policy_dates: tuple = None):
    """Render edit dialog content - same fields as create dialog but pre-populated."""
    endorsement_id = e["id"]
    endorsement_type = e["endorsement_type"]
    submission_id = e.get("submission_id")
    change_details = e.get("change_details", {}) or {}

    # Get policy dates and base premium from bound option
    if bound is None:
        from core.bound_option import get_bound_option
        bound = get_bound_option(submission_id) or {}
    base_premium = float(bound.get("sold_premium") or e.get("original_annual_premium") or 0)

    # Get policy expiration date
    if policy_dates:
        eff_date, exp_date = policy_dates
    else:
        eff_date, exp_date = get_policy_dates(submission_id)

    # Show type (read-only)
    type_label = ENDORSEMENT_TYPES.get(endorsement_type, {}).get("label", endorsement_type)
    st.text_input("Type", value=type_label, disabled=True)

    # Effective date
    new_effective_date = st.date_input(
        "Effective Date",
        value=e.get("effective_date") or date.today(),
        key=f"edit_dlg_eff_date_{endorsement_id}"
    )

    # Type-specific fields
    new_change_details = dict(change_details)

    if endorsement_type == "bor_change":
        from core.bor_management import get_all_broker_employments

        prev_name = change_details.get("previous_broker_name", "Unknown")
        prev_contact = change_details.get("previous_contact_name", "")
        if prev_contact:
            st.caption(f"Previous: {prev_name} - {prev_contact}")
        else:
            st.caption(f"Previous: {prev_name}")

        employments = get_all_broker_employments()
        if employments:
            emp_options = {emp["id"]: emp["display_name"] for emp in employments}
            current_contact_id = change_details.get("new_contact_id")
            default_idx = 0
            if current_contact_id:
                keys = list(emp_options.keys())
                if current_contact_id in keys:
                    default_idx = keys.index(current_contact_id)

            selected_emp_id = st.selectbox(
                "New Broker",
                options=list(emp_options.keys()),
                index=default_idx,
                format_func=lambda x: emp_options.get(x, ""),
                key=f"edit_dlg_bor_emp_{endorsement_id}"
            )

            if selected_emp_id:
                for emp in employments:
                    if emp["id"] == selected_emp_id:
                        new_change_details["new_broker_id"] = emp["org_id"]
                        new_change_details["new_broker_name"] = emp["org_name"]
                        new_change_details["new_contact_id"] = emp["id"]
                        new_change_details["new_contact_name"] = emp["person_name"]
                        break

    elif endorsement_type == "extension":
        from datetime import timedelta
        st.markdown("**Extension Details**")

        # Show current expiration
        if exp_date:
            st.caption(f"Current expiration: {exp_date.strftime('%m/%d/%Y')}")

        current_new_exp = change_details.get("new_expiration_date")
        if current_new_exp and isinstance(current_new_exp, str):
            from datetime import datetime as dt
            current_new_exp = dt.strptime(current_new_exp, "%Y-%m-%d").date()
        elif not current_new_exp:
            current_new_exp = (exp_date or date.today()) + timedelta(days=90)

        new_exp = st.date_input(
            "New Expiration Date *",
            value=current_new_exp,
            key=f"edit_dlg_new_exp_{endorsement_id}"
        )
        new_change_details["new_expiration_date"] = new_exp.isoformat() if new_exp else None

    elif endorsement_type == "name_change":
        st.markdown("**Name Change**")
        col1, col2 = st.columns(2)
        with col1:
            old_name = st.text_input(
                "Old Name *",
                value=change_details.get("old_name", ""),
                key=f"edit_dlg_old_name_{endorsement_id}"
            )
        with col2:
            new_name = st.text_input(
                "New Name *",
                value=change_details.get("new_name", ""),
                key=f"edit_dlg_new_name_{endorsement_id}"
            )
        new_change_details["old_name"] = old_name
        new_change_details["new_name"] = new_name

    elif endorsement_type == "cancellation":
        reason_opts = ["insured_request", "non_payment", "underwriting", "other"]
        current_reason = change_details.get("cancellation_reason", "insured_request")
        reason = st.selectbox(
            "Reason",
            options=reason_opts,
            index=reason_opts.index(current_reason) if current_reason in reason_opts else 0,
            format_func=lambda x: x.replace("_", " ").title(),
            key=f"edit_dlg_cancel_reason_{endorsement_id}"
        )
        new_change_details["cancellation_reason"] = reason

    elif endorsement_type == "address_change":
        st.markdown("**Address Change**")
        # Show current/previous address as info only
        old_address = change_details.get("old_address", {})
        old_display = change_details.get("old_address_display") or format_address(old_address)
        if old_display:
            st.info(f"**Previous Address:** {old_display}")
        # Only allow editing new address
        st.caption("New Address")
        new_address = render_address_form(
            key_prefix=f"edit_dlg_addr_new_{endorsement_id}",
            default_values=change_details.get("new_address", {}),
        )
        new_change_details["old_address"] = old_address  # Keep existing
        new_change_details["new_address"] = new_address
        new_change_details["old_address_display"] = old_display
        new_change_details["new_address_display"] = format_address(new_address)

    # Premium section (for non-BOR types)
    premium_change = e.get("premium_change", 0) or 0
    premium_method = e.get("premium_method", "manual")
    days_rem = e.get("days_remaining")

    if endorsement_type != "bor_change":
        st.markdown("**Premium**")
        col1, col2 = st.columns(2)

        with col1:
            method_opts = list(PREMIUM_METHODS.keys())
            current_idx = method_opts.index(premium_method) if premium_method in method_opts else 0
            premium_method = st.selectbox(
                "Method",
                options=method_opts,
                index=current_idx,
                format_func=lambda x: PREMIUM_METHODS[x],
                key=f"edit_dlg_method_{endorsement_id}"
            )

        with col2:
            if premium_method == "pro_rata":
                # For extension, calculate days from new expiration
                if endorsement_type == "extension":
                    new_exp_val = st.session_state.get(f"edit_dlg_new_exp_{endorsement_id}")
                    if new_exp_val and exp_date:
                        days_rem = (new_exp_val - exp_date).days
                    else:
                        days_rem = days_rem or 90

                calculated_amt = calculate_pro_rata_premium(base_premium, days_rem) if days_rem and days_rem > 0 else 0.0
                amt_key = f"edit_dlg_prorata_amt_{endorsement_id}_{days_rem}"
                premium_change = st.number_input(
                    f"Amount ({days_rem} days)",
                    value=calculated_amt,
                    step=100.0,
                    key=amt_key
                )
                if days_rem and days_rem > 0:
                    st.caption(f"${base_premium:,.0f} × {days_rem}/365 = ${calculated_amt:,.0f}")
            else:
                premium_change = st.number_input(
                    "Amount",
                    value=float(e.get("premium_change") or 0),
                    step=100.0,
                    key=f"edit_dlg_flat_amt_{endorsement_id}"
                )

    # Notes
    new_notes = st.text_area(
        "Notes (optional)",
        value=e.get("notes") or "",
        key=f"edit_dlg_notes_{endorsement_id}",
        height=80
    )

    # Action buttons: Save, Issue, Delete, Cancel
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        if st.button("Save", type="primary", key=f"edit_dlg_save_{endorsement_id}"):
            try:
                update_endorsement(
                    endorsement_id=endorsement_id,
                    effective_date=new_effective_date,
                    change_details=new_change_details,
                    premium_method=premium_method,
                    premium_change=premium_change,
                    notes=new_notes if new_notes else None,
                    updated_by="user"
                )
                st.session_state.pop("_edit_endorsement_data", None)
                st.success("Saved!")
                st.rerun()
            except Exception as ex:
                st.error(f"Error: {ex}")
    with col2:
        if st.button("Issue", key=f"edit_dlg_issue_{endorsement_id}"):
            try:
                # Save first, then issue
                update_endorsement(
                    endorsement_id=endorsement_id,
                    effective_date=new_effective_date,
                    change_details=new_change_details,
                    premium_method=premium_method,
                    premium_change=premium_change,
                    notes=new_notes if new_notes else None,
                    updated_by="user"
                )
                issue_endorsement(endorsement_id, issued_by="user")
                st.session_state.pop("_edit_endorsement_data", None)
                st.success("Issued!")
                st.rerun()
            except Exception as ex:
                st.error(f"Error: {ex}")
    with col3:
        if st.button("Delete", key=f"edit_dlg_delete_{endorsement_id}"):
            try:
                delete_draft_endorsement(endorsement_id)
                st.session_state.pop("_edit_endorsement_data", None)
                st.rerun()
            except Exception as ex:
                st.error(f"Error: {ex}")
    with col4:
        if st.button("Cancel", key=f"edit_dlg_cancel_{endorsement_id}"):
            st.session_state.pop("_edit_endorsement_data", None)
            st.rerun()


def _render_endorsement_details(e: dict, endorsement_type: str, change_details: dict, notes: str, created_at, issued_at):
    """Render expanded details for an endorsement."""
    col1, col2 = st.columns(2)

    with col1:
        if endorsement_type == "bor_change":
            st.markdown("**Broker Change Details**")
            prev_broker = change_details.get("previous_broker_name", "N/A")
            new_broker = change_details.get("new_broker_name", "N/A")
            prev_contact = change_details.get("previous_contact_name", "")
            new_contact = change_details.get("new_contact_name", "")
            bor_date = change_details.get("bor_letter_received_date", "")
            reason = change_details.get("change_reason", "")

            st.write(f"**Previous Broker:** {prev_broker}" + (f" ({prev_contact})" if prev_contact else ""))
            st.write(f"**New Broker:** {new_broker}" + (f" ({new_contact})" if new_contact else ""))
            if bor_date:
                st.write(f"**BOR Letter Received:** {bor_date}")
            if reason:
                st.write(f"**Reason:** {reason}")

        elif endorsement_type == "extension":
            st.markdown("**Extension Details**")
            orig_exp = change_details.get("original_expiration_date", "N/A")
            new_exp = change_details.get("new_expiration_date", "N/A")
            st.write(f"**Original Expiration:** {orig_exp}")
            st.write(f"**New Expiration:** {new_exp}")

        elif endorsement_type == "name_change":
            st.markdown("**Name Change Details**")
            old_name = change_details.get("old_name", "N/A")
            new_name = change_details.get("new_name", "N/A")
            st.write(f"**Old Name:** {old_name}")
            st.write(f"**New Name:** {new_name}")

        elif endorsement_type == "address_change":
            st.markdown("**Address Change Details**")
            old_addr = change_details.get("old_address_display") or change_details.get("old_address", "N/A")
            new_addr = change_details.get("new_address_display") or change_details.get("new_address", "N/A")
            if isinstance(old_addr, dict):
                old_addr = f"{old_addr.get('street', '')}, {old_addr.get('city', '')}, {old_addr.get('state', '')} {old_addr.get('zip', '')}"
            if isinstance(new_addr, dict):
                new_addr = f"{new_addr.get('street', '')}, {new_addr.get('city', '')}, {new_addr.get('state', '')} {new_addr.get('zip', '')}"
            st.write(f"**Old Address:** {old_addr}")
            st.write(f"**New Address:** {new_addr}")

        elif endorsement_type == "cancellation":
            st.markdown("**Cancellation Details**")
            reason = change_details.get("cancellation_reason", "N/A")
            st.write(f"**Reason:** {reason.replace('_', ' ').title()}")

            reason_detail = change_details.get("reason_details")
            if reason_detail:
                st.write(f"**Details:** {reason_detail}")

            # Non-payment specific fields
            outstanding = change_details.get("outstanding_balance")
            if outstanding:
                st.write(f"**Outstanding Balance:** ${outstanding:,.2f}")

            last_payment = change_details.get("last_payment_date")
            if last_payment:
                st.write(f"**Last Payment:** {last_payment}")

            # Notice info
            notice_sent = change_details.get("notice_sent_date")
            if notice_sent:
                st.write(f"**Notice Sent:** {notice_sent}")

            # Return premium method
            return_method = change_details.get("return_premium_method")
            if return_method:
                method_display = return_method.replace("_", " ").title()
                if return_method == "short_rate":
                    penalty = change_details.get("short_rate_penalty_pct", 0)
                    method_display += f" ({penalty}% penalty)"
                st.write(f"**Return Method:** {method_display}")

        elif endorsement_type == "erp":
            st.markdown("**ERP Details**")
            erp_type = change_details.get("erp_type", "N/A")
            erp_months = change_details.get("erp_months", "N/A")
            erp_effective = change_details.get("erp_effective_date", "N/A")
            st.write(f"**Type:** {erp_type.title() if isinstance(erp_type, str) else erp_type}")
            st.write(f"**Coverage Period:** {erp_months} months")
            st.write(f"**Effective Date:** {erp_effective}")

            expiring_premium = change_details.get("expiring_premium")
            erp_rate = change_details.get("erp_rate")
            if expiring_premium and erp_rate:
                st.write(f"**Expiring Premium:** ${expiring_premium:,.0f}")
                st.write(f"**Rate Applied:** {erp_rate:.0%}")

        elif endorsement_type == "reinstatement":
            st.markdown("**Reinstatement Details**")
            lapse_days = change_details.get("lapse_period_days", 0)
            st.write(f"**Lapse Period:** {lapse_days} days")

        elif change_details:
            st.markdown("**Details**")
            for k, v in change_details.items():
                st.write(f"**{k.replace('_', ' ').title()}:** {v}")

    with col2:
        st.markdown("**Audit Trail**")
        if created_at:
            st.write(f"**Created:** {created_at.strftime('%m/%d/%Y %H:%M') if hasattr(created_at, 'strftime') else created_at}")
        if issued_at:
            st.write(f"**Issued:** {issued_at.strftime('%m/%d/%Y %H:%M') if hasattr(issued_at, 'strftime') else issued_at}")
        if notes:
            st.write(f"**Notes:** {notes}")


def _render_new_endorsement_form(
    submission_id: str,
    bound: dict,
    policy_dates: tuple = None
):
    """Render form for creating a new endorsement.

    Args:
        submission_id: UUID of the submission
        bound: Bound option dict
        policy_dates: Optional tuple of (effective_date, expiration_date) (avoids DB query)
    """
    st.markdown("**New Endorsement**")

    # Get policy dates for pro-rata calculations (use pre-loaded if available)
    if policy_dates:
        eff_date, exp_date = policy_dates
    else:
        eff_date, exp_date = get_policy_dates(submission_id)

    # Get policy position from bound option
    position = bound.get("position", "primary")

    # Type selection
    type_options = list(ENDORSEMENT_TYPES.keys())
    type_labels = {k: v["label"] for k, v in ENDORSEMENT_TYPES.items()}

    col1, col2 = st.columns(2)

    with col1:
        endorsement_type = st.selectbox(
            "Type",
            options=type_options,
            format_func=lambda x: type_labels[x],
            key=f"new_end_type_{submission_id}"
        )

    with col2:
        effective_date = st.date_input(
            "Effective Date",
            value=date.today(),
            key=f"new_end_date_{submission_id}"
        )

    # Type-specific fields (render before description so we can use details for auto-description)
    change_details = {}
    _render_type_specific_fields(endorsement_type, change_details, submission_id)

    # Description - optional for self-explanatory types
    # BOR uses Change Reason field instead of Description, so skip entirely
    self_explanatory_types = {"extension", "cancellation", "reinstatement", "erp", "name_change", "address_change", "coverage_change"}
    no_description_types = {"bor_change"}  # These types don't need description at all

    if endorsement_type in no_description_types:
        description = ""  # BOR uses change_reason from type-specific fields
    elif endorsement_type in self_explanatory_types:
        description = st.text_input(
            "Description (optional)",
            placeholder="Auto-generated if left blank",
            key=f"new_end_desc_{submission_id}"
        )
    else:
        description = st.text_input(
            "Description",
            placeholder="Brief description of the endorsement...",
            key=f"new_end_desc_{submission_id}"
        )

    # Premium section - not applicable for BOR or cancellation (handled in type-specific fields)
    no_premium_types = {"bor_change", "cancellation"}
    base_premium = float(bound.get("sold_premium") or 0)
    days_rem = None
    premium_change = 0.0
    premium_method = "manual"  # Default

    if endorsement_type not in no_premium_types:
        st.markdown("**Premium Adjustment**")

        col1, col2 = st.columns(2)

        with col1:
            premium_method = st.selectbox(
                "Method",
                options=list(PREMIUM_METHODS.keys()),
                format_func=lambda x: PREMIUM_METHODS[x],
                key=f"new_end_method_{submission_id}"
            )

        with col2:
            if premium_method == "pro_rata":
                # For extensions, calculate based on extension period
                if endorsement_type == "extension" and change_details.get("new_expiration_date"):
                    from datetime import datetime as dt
                    new_exp_str = change_details.get("new_expiration_date")
                    new_exp_date = dt.strptime(new_exp_str, "%Y-%m-%d").date() if isinstance(new_exp_str, str) else new_exp_str
                    if exp_date and new_exp_date:
                        extension_days = (new_exp_date - exp_date).days
                        st.caption(f"Extension period: {extension_days} days")
                        days_rem = extension_days
                    else:
                        days_rem = 0
                else:
                    # Calculate days remaining in current term
                    if effective_date and exp_date:
                        days_rem = calculate_days_remaining(eff_date, exp_date, effective_date)
                    else:
                        days_rem = 0
                    st.caption(f"Days remaining: {days_rem}")

            elif premium_method == "flat":
                st.caption("Enter flat premium amount")
            else:
                st.caption("Enter premium manually")

        # Premium input based on method
        if premium_method == "pro_rata":
            col1, col2, col3 = st.columns(3)

            with col1:
                annual_rate = st.number_input(
                    "Annual Premium Rate",
                    value=base_premium,
                    step=1000.0,
                    help="Annual premium to pro-rate from",
                    key=f"new_end_annual_{submission_id}"
                )

            with col2:
                if days_rem and days_rem > 0:
                    premium_change = calculate_pro_rata_premium(annual_rate, days_rem)
                else:
                    premium_change = 0.0

            with col3:
                st.empty()

            # Show calculation preview
            if days_rem and days_rem > 0:
                calc_str = f"${annual_rate:,.0f} x ({days_rem} / 365) = **${premium_change:,.2f}**"
                st.info(f"Pro-rata calculation: {calc_str}")

        elif premium_method == "flat":
            premium_change = st.number_input(
                "Flat Premium",
                value=0.0,
                step=100.0,
                key=f"new_end_flat_{submission_id}"
            )

        else:  # manual
            premium_change = st.number_input(
                "Premium Change",
                value=0.0,
                step=100.0,
                help="Positive for additional premium, negative for return premium",
                key=f"new_end_premium_{submission_id}"
            )

        # Premium summary box
        st.divider()
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Current Premium", f"${base_premium:,.0f}")
        with col2:
            change_label = f"+${premium_change:,.0f}" if premium_change >= 0 else f"-${abs(premium_change):,.0f}"
            st.metric("This Endorsement", change_label)
        with col3:
            new_effective = base_premium + premium_change
            st.metric("New Effective", f"${new_effective:,.0f}")

    # Carryover option
    default_carries = ENDORSEMENT_TYPES[endorsement_type]["carries_to_renewal"]
    carries_to_renewal = st.checkbox(
        "Carries to renewal",
        value=default_carries,
        help="If checked, this endorsement will be noted on the renewal",
        key=f"new_end_carries_{submission_id}"
    )

    # Notes
    notes = st.text_area(
        "Notes (optional)",
        placeholder="Additional details...",
        key=f"new_end_notes_{submission_id}"
    )

    # Create button
    if st.button("Create Endorsement", type="primary", key=f"create_end_{submission_id}"):
        # Auto-generate description for self-explanatory types if not provided
        final_description = description
        if not final_description:
            final_description = _generate_auto_description(endorsement_type, change_details)

        if not final_description:
            st.error("Description is required")
            return

        try:
            tower_id = bound["id"]

            # For cancellation, use the calculated return premium from the type fields
            if endorsement_type == "cancellation":
                premium_change = st.session_state.get(f"_cancel_premium_{submission_id}", 0.0)
                premium_method = change_details.get("return_premium_method", "flat")

            endorsement_id = create_endorsement(
                submission_id=submission_id,
                tower_id=tower_id,
                endorsement_type=endorsement_type,
                effective_date=effective_date,
                description=final_description,
                change_details=change_details if change_details else None,
                premium_method=premium_method,
                premium_change=premium_change,
                original_annual_premium=base_premium,
                days_remaining=days_rem if premium_method == "pro_rata" else None,
                carries_to_renewal=carries_to_renewal,
                notes=notes if notes else None,
                created_by="user"
            )

            st.success(f"Endorsement created (draft)")
            st.rerun()

        except Exception as ex:
            st.error(f"Error creating endorsement: {ex}")


def _generate_auto_description(endorsement_type: str, change_details: dict) -> str:
    """Generate automatic description for self-explanatory endorsement types."""
    if endorsement_type == "extension":
        new_exp = change_details.get("new_expiration_date", "")
        if new_exp:
            return f"Policy extended to {new_exp}"
        return "Policy extension"

    elif endorsement_type == "cancellation":
        reason = change_details.get("cancellation_reason", "").replace("_", " ").title()
        if reason:
            return f"Policy cancellation - {reason}"
        return "Policy cancellation"

    elif endorsement_type == "reinstatement":
        lapse_days = change_details.get("lapse_period_days", 0)
        if lapse_days:
            return f"Policy reinstatement ({lapse_days} day lapse)"
        return "Policy reinstatement"

    elif endorsement_type == "erp":
        erp_type = change_details.get("erp_type", "").title()
        erp_months = change_details.get("erp_months", "")
        if erp_type and erp_months:
            return f"{erp_type} ERP - {erp_months} months"
        return "Extended Reporting Period"

    elif endorsement_type == "bor_change":
        prev_broker = change_details.get("previous_broker_name", "")
        new_broker = change_details.get("new_broker_name", "")
        if prev_broker and new_broker:
            return f"Broker of Record changed from {prev_broker} to {new_broker}"
        return "Broker of Record Change"

    elif endorsement_type == "coverage_change":
        return _generate_coverage_change_description(change_details)

    elif endorsement_type == "address_change":
        old_addr = change_details.get("old_address_display", "")
        new_addr = change_details.get("new_address_display", "")
        if old_addr and new_addr:
            return f"Address change from {old_addr} to {new_addr}"
        elif new_addr:
            return f"Address changed to {new_addr}"
        return "Address change"

    elif endorsement_type == "name_change":
        old_name = change_details.get("old_name", "")
        new_name = change_details.get("new_name", "")
        if old_name and new_name:
            return f"Named insured changed from {old_name} to {new_name}"
        elif new_name:
            return f"Named insured changed to {new_name}"
        return "Named insured change"

    return ""


def _generate_coverage_change_description(change_details: dict) -> str:
    """Generate description for coverage change endorsement based on computed changes."""
    from rating_engine.coverage_config import (
        get_aggregate_coverage_definitions,
        get_sublimit_coverage_definitions,
        format_limit_display,
    )

    parts = []
    coverage_type = change_details.get("coverage_type", "")

    # Handle aggregate limit change
    if "aggregate_limit" in change_details:
        old_val = change_details["aggregate_limit"].get("old", 0)
        new_val = change_details["aggregate_limit"].get("new", 0)
        if new_val > old_val:
            parts.append(f"Aggregate limit increased to {format_limit_display(new_val)}")
        elif new_val < old_val:
            parts.append(f"Aggregate limit reduced to {format_limit_display(new_val)}")

    # Handle retention change
    if "retention" in change_details:
        old_ret = change_details["retention"].get("old", 0)
        new_ret = change_details["retention"].get("new", 0)
        if new_ret != old_ret:
            parts.append(f"Retention changed to {format_limit_display(new_ret)}")

    # Count other coverage changes
    agg_changes = change_details.get("aggregate_coverages", {})
    sub_changes = change_details.get("sublimit_coverages", {})
    total_changes = len(agg_changes) + len(sub_changes)

    if total_changes > 0 and not parts:
        # No aggregate limit change but coverage changes
        if coverage_type == "limit_increase":
            parts.append("Coverage limits increased")
        elif coverage_type == "limit_decrease":
            parts.append("Coverage limits reduced")
        elif coverage_type == "coverage_add":
            parts.append("Coverage added")
        elif coverage_type == "coverage_remove":
            parts.append("Coverage removed")
        else:
            parts.append(f"Coverage modification ({total_changes} changes)")

    if parts:
        return " - ".join(parts)
    return "Coverage change"


def _render_type_specific_fields(endorsement_type: str, change_details: dict, submission_id: str):
    """Render type-specific form fields and populate change_details."""

    if endorsement_type == "coverage_change":
        change_type = st.selectbox(
            "Change Type",
            options=["limit_increase", "limit_decrease", "retention_change", "coverage_add", "coverage_remove", "other"],
            format_func=lambda x: x.replace("_", " ").title(),
            key=f"cov_change_type_{submission_id}"
        )
        change_details["coverage_type"] = change_type

    elif endorsement_type == "cancellation":
        reason = st.selectbox(
            "Cancellation Reason",
            options=["insured_request", "non_payment", "underwriting", "other"],
            format_func=lambda x: x.replace("_", " ").title(),
            key=f"cancel_reason_{submission_id}"
        )
        change_details["cancellation_reason"] = reason

    elif endorsement_type == "reinstatement":
        lapse_days = st.number_input(
            "Lapse Period (days)",
            value=0,
            min_value=0,
            key=f"lapse_days_{submission_id}"
        )
        change_details["lapse_period_days"] = lapse_days

    elif endorsement_type == "name_change":
        col1, col2 = st.columns(2)
        with col1:
            old_name = st.text_input("Old Name", key=f"old_name_{submission_id}")
        with col2:
            new_name = st.text_input("New Name", key=f"new_name_{submission_id}")
        change_details["old_name"] = old_name
        change_details["new_name"] = new_name

    elif endorsement_type == "address_change":
        _render_address_change_fields(change_details, submission_id, key_prefix="")

    elif endorsement_type == "erp":
        erp_type = st.selectbox(
            "ERP Type",
            options=["basic", "extended"],
            format_func=lambda x: x.title(),
            key=f"erp_type_{submission_id}"
        )
        erp_months = st.number_input(
            "ERP Months",
            value=12,
            min_value=1,
            max_value=60,
            key=f"erp_months_{submission_id}"
        )
        change_details["erp_type"] = erp_type
        change_details["erp_months"] = erp_months

    elif endorsement_type == "extension":
        # Get current expiration date for reference
        eff_date, exp_date = get_policy_dates(submission_id)
        if exp_date:
            st.caption(f"Current expiration: {exp_date.strftime('%m/%d/%Y')}")
            from datetime import timedelta
            default_new_exp = exp_date + timedelta(days=90)
        else:
            from datetime import timedelta
            default_new_exp = date.today() + timedelta(days=90)

        new_exp = st.date_input(
            "New Expiration Date",
            value=default_new_exp,
            key=f"new_exp_date_{submission_id}"
        )
        change_details["new_expiration_date"] = new_exp.isoformat() if new_exp else None
        change_details["original_expiration_date"] = exp_date.isoformat() if exp_date else None

    elif endorsement_type == "bor_change":
        _render_bor_change_fields(change_details, submission_id)


def _render_bor_change_fields(change_details: dict, submission_id: str):
    """Render Broker of Record change form fields."""
    from core.bor_management import (
        get_current_broker,
        get_brokers_list,
        get_broker_contacts,
    )

    # Get current broker info
    current_broker = get_current_broker(submission_id)

    if current_broker:
        st.info(f"**Current Broker:** {current_broker.get('broker_name', 'Unknown')}"
                + (f" ({current_broker.get('contact_name', '')})" if current_broker.get('contact_name') else ""))
        change_details["previous_broker_id"] = current_broker.get("broker_id")
        change_details["previous_broker_name"] = current_broker.get("broker_name")
        change_details["previous_contact_id"] = current_broker.get("broker_contact_id")
        change_details["previous_contact_name"] = current_broker.get("contact_name")
    else:
        st.warning("No current broker assigned to this submission")

    # New broker selection
    brokers = get_brokers_list()

    if not brokers:
        st.warning("No brokers found in the system. Please add brokers first.")
        return

    broker_options = {b["id"]: b["company_name"] for b in brokers}

    new_broker_id = st.selectbox(
        "New Broker",
        options=list(broker_options.keys()),
        format_func=lambda x: broker_options.get(x, ""),
        key=f"bor_new_broker_{submission_id}"
    )

    if new_broker_id:
        change_details["new_broker_id"] = new_broker_id
        change_details["new_broker_name"] = broker_options.get(new_broker_id)

        # Contact selection for new broker
        contacts = get_broker_contacts(new_broker_id)

        if contacts:
            contact_options = {c["id"]: f"{c['full_name']} ({c['email']})" for c in contacts}
            contact_options[""] = "(No specific contact)"

            new_contact_id = st.selectbox(
                "New Broker Contact",
                options=list(contact_options.keys()),
                format_func=lambda x: contact_options.get(x, ""),
                key=f"bor_new_contact_{submission_id}"
            )

            if new_contact_id:
                change_details["new_contact_id"] = new_contact_id
                # Find contact name
                for c in contacts:
                    if c["id"] == new_contact_id:
                        change_details["new_contact_name"] = c["full_name"]
                        break

    # BOR letter received date
    bor_letter_date = st.date_input(
        "BOR Letter Received Date (optional)",
        value=None,
        key=f"bor_letter_date_{submission_id}"
    )
    if bor_letter_date:
        change_details["bor_letter_received_date"] = bor_letter_date.isoformat()

    # Change reason
    change_reason = st.text_input(
        "Change Reason (optional)",
        placeholder="e.g., Insured requested broker change",
        key=f"bor_reason_{submission_id}"
    )
    if change_reason:
        change_details["change_reason"] = change_reason

    # Warning if no BOR letter
    if not bor_letter_date:
        st.caption("Note: No BOR letter date provided. You can still create the endorsement.")


def _render_endorsements_list_compact(endorsements: list, bound: dict = None, policy_dates: tuple = None):
    """Render endorsements using st.dataframe with single action dropdown."""
    import pandas as pd

    if not endorsements:
        st.caption("No mid-term endorsements.")
        return

    # Reset action selector if edit dialog is open (prevents infinite loop)
    if st.session_state.get("_edit_endorsement_data"):
        st.session_state["_endorsement_action"] = "Select action..."

    drafts = [e for e in endorsements if e["status"] == "draft"]
    issued = [e for e in endorsements if e["status"] == "issued"]

    # Build dataframe
    rows = []
    for e in endorsements:
        number = e["endorsement_number"]
        status = e["status"]
        eff_date = e["effective_date"]
        eff_str = eff_date.strftime("%m/%d/%Y") if eff_date else ""
        premium_change = e.get("premium_change", 0)
        endorsement_type = e["endorsement_type"]
        formal_title = e.get("formal_title")
        description = e["description"]
        pdf_url = e.get("document_url")

        icon = {"draft": "🟠", "issued": "✅", "void": "🚫"}.get(status, "❌")

        title = formal_title if formal_title else description
        if len(title) > 45:
            title = title[:42] + "..."

        if status == "void" or endorsement_type == "bor_change":
            premium_str = ""
        elif premium_change > 0:
            premium_str = f"+${premium_change:,.0f}"
        elif premium_change < 0:
            premium_str = f"-${abs(premium_change):,.0f}"
        else:
            premium_str = ""

        rows.append({
            " ": icon,
            "Endorsement": f"#{number} {title}",
            "Date": eff_str,
            "Premium": premium_str,
            "PDF": pdf_url or "",
        })

    df = pd.DataFrame(rows)

    st.dataframe(
        df,
        hide_index=True,
        use_container_width=True,
        column_config={
            " ": st.column_config.TextColumn(width="small"),
            "Endorsement": st.column_config.TextColumn(width="large"),
            "Date": st.column_config.TextColumn(width="small"),
            "Premium": st.column_config.TextColumn(width="small"),
            "PDF": st.column_config.LinkColumn(display_text="PDF", width="small"),
        },
        height=(len(rows) * 35) + 38,
    )

    # Single action dropdown - drafts first (descending), then issued (descending)
    action_options = ["Select action..."]
    action_map = {}

    # Drafts first, sorted descending by number - two entries each (Issue, Edit/Delete)
    for e in sorted(drafts, key=lambda x: x["endorsement_number"], reverse=True):
        num = e["endorsement_number"]
        title = e.get("formal_title") or e["description"]
        if len(title) > 25:
            title = title[:22] + "..."

        issue_label = f"#{num} {title} - Issue"
        edit_label = f"#{num} {title} - Edit/Delete"
        action_options.append(issue_label)
        action_options.append(edit_label)
        action_map[issue_label] = ("issue", e)
        action_map[edit_label] = ("edit", e)

    # Issued next, sorted descending by number
    for e in sorted(issued, key=lambda x: x["endorsement_number"], reverse=True):
        num = e["endorsement_number"]
        title = e.get("formal_title") or e["description"]
        if len(title) > 25:
            title = title[:22] + "..."
        label = f"#{num} {title} - Void"
        action_options.append(label)
        action_map[label] = ("void", e)

    if len(action_options) > 1:
        selected = st.selectbox("Actions", action_options, key="_endorsement_action", label_visibility="collapsed")

        if selected and selected != "Select action..." and selected in action_map:
            action, e = action_map[selected]
            eid = e["id"]

            if action == "issue":
                # Direct issue
                try:
                    issue_endorsement(eid, issued_by="user")
                    st.rerun()
                except Exception as ex:
                    st.error(str(ex))

            elif action == "edit":
                # Open edit dialog
                keys_to_clear = [k for k in st.session_state.keys() if k.startswith("edit_dlg_")]
                for k in keys_to_clear:
                    del st.session_state[k]
                st.session_state["_edit_endorsement_data"] = {
                    "endorsement": e,
                    "bound": bound,
                    "policy_dates": policy_dates
                }
                st.rerun()  # Reset at top of function prevents infinite loop

            elif action == "void":
                # Clear any edit state
                st.session_state.pop("_edit_endorsement_data", None)
                # Void flow inline
                reason = st.text_input("Void reason", key=f"void_reason_{eid}", label_visibility="collapsed", placeholder="Enter reason...")
                if st.button("Confirm Void", key=f"void_{eid}", type="primary"):
                    if reason:
                        void_endorsement(eid, reason, voided_by="user")
                        st.rerun()
                    else:
                        st.warning("Enter reason")


def _render_new_endorsement_form_v2(
    submission_id: str,
    bound: dict,
    policy_dates: tuple = None
):
    """Render simplified, type-driven new endorsement form.

    Design principles:
    - Type selection drives which fields appear
    - Only show fields relevant to the selected type
    - Simple premium: amount + method dropdown
    - Store calculation details for renewal reference
    """
    # Use dialog for better UX
    @st.dialog("New Endorsement", width="large")
    def show_new_endorsement_dialog():
        _render_endorsement_dialog_content(
            submission_id, bound, policy_dates
        )

    if st.button("➕ New Endorsement", key=f"open_endorsement_dialog_{submission_id}"):
        # Set flag to reset form values on dialog open
        st.session_state["_new_endorsement_reset"] = True
        show_new_endorsement_dialog()


def _render_endorsement_dialog_content(
    submission_id: str,
    bound: dict,
    policy_dates: tuple = None
):
    """Content for the new endorsement dialog."""
    # Check if we should reset form values (fresh dialog open)
    if st.session_state.pop("_new_endorsement_reset", False):
        # Clear stale form keys including coverage editor state
        prefixes = ("new_v2_", "type_v2_", "coverage_editor_endorsement_", "_endorsement_coverage", "cov_diff_endorsement_")
        keys_to_clear = [k for k in list(st.session_state.keys()) if k.startswith(prefixes)]
        for k in keys_to_clear:
            st.session_state.pop(k, None)

    with st.container():
        # Get policy dates
        if policy_dates:
            eff_date, exp_date = policy_dates
        else:
            eff_date, exp_date = get_policy_dates(submission_id)

        position = bound.get("position", "primary")
        base_premium = float(bound.get("sold_premium") or 0)

        # Type selection - this drives everything
        type_options = list(ENDORSEMENT_TYPES.keys())
        type_labels = {k: v["label"] for k, v in ENDORSEMENT_TYPES.items()}

        endorsement_type = st.selectbox(
            "Type",
            options=type_options,
            format_func=lambda x: type_labels[x],
            key=f"new_v2_type_{submission_id}"
        )

        # Effective date
        effective_date = st.date_input(
            "Effective Date",
            value=date.today(),
            key=f"new_v2_date_{submission_id}"
        )

        # Type-specific fields
        change_details = {}
        _render_type_fields_v2(endorsement_type, change_details, submission_id, exp_date)

        # Description - only if not self-explanatory
        self_explanatory = {"extension", "cancellation", "reinstatement", "erp", "bor_change", "coverage_change", "address_change", "name_change"}
        if endorsement_type not in self_explanatory:
            description = st.text_input(
                "Description",
                placeholder="Brief description...",
                key=f"new_v2_desc_{submission_id}"
            )
        else:
            description = ""

        # Premium section - skip for BOR and cancellation (handled in type fields)
        premium_change = 0.0
        premium_method = "flat"
        days_rem = None
        annual_premium = 0.0

        if endorsement_type not in ("bor_change", "cancellation"):
            st.markdown("**Premium**")

            # Calculate days remaining for display
            if endorsement_type == "extension":
                new_exp_key = f"type_v2_new_exp_{submission_id}"
                new_exp_dt = st.session_state.get(new_exp_key)
                if exp_date and new_exp_dt:
                    days_rem = (new_exp_dt - exp_date).days
                    change_details["new_expiration_date"] = new_exp_dt.isoformat()
                else:
                    days_rem = 90
            else:
                if effective_date and exp_date:
                    days_rem = calculate_days_remaining(eff_date, exp_date, effective_date)
                else:
                    days_rem = 0

            # For extensions, use base premium; for others, user enters annual rate
            if endorsement_type == "extension":
                annual_premium = base_premium
                st.caption(f"Policy premium: ${base_premium:,.0f} | {days_rem} days remaining")
            else:
                annual_premium = st.number_input(
                    "Annual Premium Change",
                    value=0.0,
                    step=1000.0,
                    help="Full-year premium for this coverage change",
                    key=f"new_v2_annual_{submission_id}"
                )
                st.caption(f"{days_rem} days remaining in policy term")

            # Method selection
            premium_method = st.selectbox(
                "Calculation",
                options=["flat", "pro_rata"],
                format_func=lambda x: "Flat (charge full amount)" if x == "flat" else "Pro-Rata (by days remaining)",
                key=f"new_v2_method_{submission_id}"
            )

            # Calculate and display result
            if premium_method == "pro_rata" and days_rem and days_rem > 0:
                premium_change = calculate_pro_rata_premium(annual_premium, days_rem)
                st.success(f"**Charge: ${premium_change:,.0f}** (${annual_premium:,.0f} × {days_rem}/365)")
            else:
                premium_change = annual_premium
                if annual_premium:
                    st.success(f"**Charge: ${premium_change:,.0f}**")

        # Notes
        notes = st.text_area("Notes (optional)", key=f"new_v2_notes_{submission_id}", height=80)

        # Create button
        if st.button("Create Endorsement", type="primary", key=f"new_v2_create_{submission_id}"):
            # Generate description if not provided
            final_desc = description
            if not final_desc:
                final_desc = _generate_auto_description(endorsement_type, change_details)

            if not final_desc:
                st.error("Description is required")
                return

            try:
                tower_id = bound["id"]

                # For cancellation, use the calculated return premium from the type fields
                if endorsement_type == "cancellation":
                    premium_change = st.session_state.get(f"_cancel_premium_{submission_id}", 0.0)
                    premium_method = change_details.get("return_premium_method", "flat")

                endorsement_id = create_endorsement(
                    submission_id=submission_id,
                    tower_id=tower_id,
                    endorsement_type=endorsement_type,
                    effective_date=effective_date,
                    description=final_desc,
                    change_details=change_details if change_details else None,
                    premium_method=premium_method,
                    premium_change=premium_change,
                    original_annual_premium=annual_premium,
                    days_remaining=days_rem if premium_method == "pro_rata" else None,
                    carries_to_renewal=ENDORSEMENT_TYPES[endorsement_type]["carries_to_renewal"],
                    notes=notes if notes else None,
                    created_by="user"
                )

                st.success("Endorsement created (draft)")
                st.rerun()

            except Exception as ex:
                st.error(f"Error: {ex}")


def _render_type_fields_v2(endorsement_type: str, change_details: dict, submission_id: str, exp_date=None):
    """Render only the fields relevant to this endorsement type."""

    if endorsement_type == "extension":
        # Extension MUST capture new expiration date
        st.markdown("**Extension Details**")
        if exp_date:
            st.caption(f"Current expiration: {exp_date.strftime('%m/%d/%Y')}")
            from datetime import timedelta
            default_new = exp_date + timedelta(days=90)
        else:
            from datetime import timedelta
            default_new = date.today() + timedelta(days=90)

        new_exp = st.date_input(
            "New Expiration Date *",
            value=default_new,
            key=f"type_v2_new_exp_{submission_id}"
        )
        change_details["new_expiration_date"] = new_exp.isoformat() if new_exp else None
        change_details["original_expiration_date"] = exp_date.isoformat() if exp_date else None

    elif endorsement_type == "name_change":
        _render_name_change_fields(change_details, submission_id)

    elif endorsement_type == "cancellation":
        _render_cancellation_fields(change_details, submission_id)

    elif endorsement_type == "reinstatement":
        lapse_days = st.number_input(
            "Lapse Period (days)",
            value=0,
            min_value=0,
            key=f"type_v2_lapse_{submission_id}"
        )
        change_details["lapse_period_days"] = lapse_days

    elif endorsement_type == "erp":
        _render_erp_fields(change_details, submission_id)

    elif endorsement_type == "coverage_change":
        # Use the coverage editor component for full coverage editing
        _render_coverage_change_with_editor(submission_id, change_details)

    elif endorsement_type == "bor_change":
        _render_bor_fields_v2(change_details, submission_id)

    elif endorsement_type == "address_change":
        _render_address_change_fields(change_details, submission_id, key_prefix="type_v2_")


def _render_name_change_fields(change_details: dict, submission_id: str):
    """Render name change form fields with auto-populated current name."""
    from sqlalchemy import text
    from core.db import get_conn

    # Get current applicant name from submission
    current_name = ""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT applicant_name FROM submissions WHERE id = :submission_id
        """), {"submission_id": submission_id})
        row = result.fetchone()
        if row:
            current_name = row[0] or ""

    st.markdown("**Name Change**")

    if current_name:
        st.info(f"**Current Name:** {current_name}")

    col1, col2 = st.columns(2)
    with col1:
        old_name = st.text_input(
            "Old Name *",
            value=current_name,
            key=f"type_v2_old_name_{submission_id}"
        )
    with col2:
        new_name = st.text_input(
            "New Name *",
            placeholder="Enter new insured name",
            key=f"type_v2_new_name_{submission_id}"
        )

    change_details["old_name"] = old_name
    change_details["new_name"] = new_name


def _render_erp_fields(change_details: dict, submission_id: str):
    """Render Extended Reporting Period form fields."""
    from sqlalchemy import text
    from core.db import get_conn
    from core.bound_option import get_bound_option

    st.markdown("**Extended Reporting Period**")

    # Check if policy is cancelled
    is_cancelled = False
    policy_expiration = None
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                expiration_date,
                data_sources->>'cancelled' as cancelled,
                data_sources->>'original_expiration' as original_exp
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})
        row = result.fetchone()
        if row:
            policy_expiration = row[0]
            is_cancelled = row[1] == 'true'

    if not is_cancelled:
        st.warning("**Note:** ERP is typically issued after policy cancellation. "
                   "No cancellation endorsement found for this policy.")
    else:
        st.success("Policy is cancelled. ERP will provide tail coverage.")

    # Show ERP effective date (= policy expiration/cancellation date)
    if policy_expiration:
        st.info(f"**ERP Effective Date:** {policy_expiration.strftime('%m/%d/%Y') if hasattr(policy_expiration, 'strftime') else policy_expiration}")
        change_details["erp_effective_date"] = policy_expiration.isoformat() if hasattr(policy_expiration, 'isoformat') else str(policy_expiration)

    # ERP Type and Months
    col1, col2 = st.columns(2)
    with col1:
        erp_type = st.selectbox(
            "ERP Type *",
            options=["basic", "extended"],
            format_func=lambda x: x.title(),
            key=f"type_v2_erp_type_{submission_id}"
        )
    with col2:
        erp_months = st.number_input(
            "Coverage Period (months) *",
            value=12,
            min_value=1,
            max_value=60,
            key=f"type_v2_erp_months_{submission_id}"
        )

    change_details["erp_type"] = erp_type
    change_details["erp_months"] = erp_months

    # Premium calculation
    st.markdown("**Premium Calculation**")

    # Get expiring premium
    bound = get_bound_option(submission_id) or {}
    expiring_premium = float(bound.get("sold_premium") or 0)

    # Standard ERP rates as % of expiring premium
    erp_rates = {
        12: 0.75,   # 75% for 12 months
        24: 1.25,   # 125% for 24 months
        36: 1.50,   # 150% for 36 months
    }

    # Find closest rate or interpolate
    if erp_months in erp_rates:
        rate = erp_rates[erp_months]
    elif erp_months < 12:
        rate = 0.75 * (erp_months / 12)
    elif erp_months < 24:
        rate = 0.75 + (0.50 * ((erp_months - 12) / 12))
    elif erp_months < 36:
        rate = 1.25 + (0.25 * ((erp_months - 24) / 12))
    else:
        rate = 1.50 + (0.25 * ((erp_months - 36) / 12))

    suggested_premium = expiring_premium * rate

    col1, col2 = st.columns(2)
    with col1:
        st.caption(f"Expiring premium: ${expiring_premium:,.0f}")
        st.caption(f"Suggested rate: {rate:.0%} for {erp_months} months")
        st.caption(f"**Suggested ERP premium: ${suggested_premium:,.0f}**")
    with col2:
        use_suggested = st.checkbox(
            "Use suggested premium",
            value=True,
            key=f"erp_use_suggested_{submission_id}"
        )

    change_details["expiring_premium"] = expiring_premium
    change_details["erp_rate"] = rate
    change_details["suggested_premium"] = suggested_premium
    change_details["use_suggested_premium"] = use_suggested

    # Store for premium section to pick up
    if use_suggested:
        st.session_state[f"_erp_suggested_premium_{submission_id}"] = suggested_premium
    else:
        st.session_state.pop(f"_erp_suggested_premium_{submission_id}", None)


def _render_cancellation_fields(change_details: dict, submission_id: str):
    """Render cancellation endorsement form fields with integrated premium calculation."""
    from core.bound_option import get_bound_option

    # Get bound policy data for premium calculation
    bound = get_bound_option(submission_id) or {}
    annual_premium = float(bound.get("sold_premium") or 0)

    # Get policy dates for pro-rata calculation
    from sqlalchemy import text
    from core.db import get_conn
    exp_date = None
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT expiration_date FROM submissions WHERE id = :sid
        """), {"sid": submission_id})
        row = result.fetchone()
        if row:
            exp_date = row[0]

    # Reason dropdown
    reason_options = [
        ("insured_request", "Insured Request"),
        ("non_payment", "Non-Payment"),
        ("underwriting", "Underwriting"),
        ("other", "Other"),
    ]

    col1, col2 = st.columns(2)
    with col1:
        reason = st.selectbox(
            "Reason *",
            options=[r[0] for r in reason_options],
            format_func=lambda x: dict(reason_options)[x],
            key=f"cancel_reason_{submission_id}"
        )
        change_details["cancellation_reason"] = reason

    # Reason details for underwriting/other
    if reason in ["underwriting", "other"]:
        with col2:
            reason_detail = st.text_input(
                "Details",
                placeholder="Specify reason...",
                key=f"cancel_reason_detail_{submission_id}"
            )
            change_details["reason_details"] = reason_detail

    # Outstanding balance for non-payment (inline)
    if reason == "non_payment":
        with col2:
            outstanding = st.number_input(
                "Outstanding Balance",
                value=0.0,
                min_value=0.0,
                step=100.0,
                key=f"cancel_outstanding_{submission_id}"
            )
            change_details["outstanding_balance"] = outstanding

    # Return premium section
    st.markdown("---")
    st.markdown("**Return Premium**")

    return_method_options = [
        ("pro_rata", "Pro-Rata"),
        ("short_rate", "Short-Rate"),
        ("flat", "Flat/Override"),
    ]

    col1, col2 = st.columns(2)
    with col1:
        return_method = st.selectbox(
            "Calculation Method",
            options=[r[0] for r in return_method_options],
            format_func=lambda x: dict(return_method_options)[x],
            key=f"cancel_return_method_{submission_id}"
        )
        change_details["return_premium_method"] = return_method

    # Calculate days remaining from effective date (check both form variants)
    effective_date = (
        st.session_state.get(f"new_v2_date_{submission_id}") or
        st.session_state.get(f"new_end_date_{submission_id}")
    )
    days_remaining = 0
    if effective_date and exp_date:
        from datetime import date
        if isinstance(effective_date, date) and isinstance(exp_date, date):
            days_remaining = (exp_date - effective_date).days
            if days_remaining < 0:
                days_remaining = 0

    # Calculate return premium based on method
    return_premium = 0.0
    penalty_pct = 0.0

    if return_method == "pro_rata":
        if days_remaining > 0 and annual_premium > 0:
            return_premium = (days_remaining / 365) * annual_premium
        with col2:
            st.caption(f"Days remaining: {days_remaining}")
            st.caption(f"Annual premium: ${annual_premium:,.0f}")

    elif return_method == "short_rate":
        with col2:
            penalty_pct = st.number_input(
                "Penalty %",
                value=10.0,
                min_value=0.0,
                max_value=50.0,
                step=5.0,
                key=f"cancel_penalty_pct_{submission_id}"
            )
            change_details["short_rate_penalty_pct"] = penalty_pct
        if days_remaining > 0 and annual_premium > 0:
            pro_rata = (days_remaining / 365) * annual_premium
            return_premium = pro_rata * (1 - penalty_pct / 100)

    elif return_method == "flat":
        with col2:
            return_premium = st.number_input(
                "Return Amount",
                value=0.0,
                min_value=0.0,
                step=100.0,
                key=f"cancel_flat_return_{submission_id}"
            )

    # Show calculated return premium
    if return_method in ["pro_rata", "short_rate"] and return_premium > 0:
        if return_method == "short_rate":
            st.success(f"**Return Premium: ${return_premium:,.0f}** (pro-rata ${(days_remaining/365)*annual_premium:,.0f} minus {penalty_pct:.0f}% penalty)")
        else:
            st.success(f"**Return Premium: ${return_premium:,.0f}** ({days_remaining} days ÷ 365 × ${annual_premium:,.0f})")
    elif return_method == "flat" and return_premium > 0:
        st.success(f"**Return Premium: ${return_premium:,.0f}**")

    # Store return premium as negative for the endorsement
    change_details["calculated_return_premium"] = -return_premium
    st.session_state[f"_cancel_premium_{submission_id}"] = -return_premium


def _render_address_change_fields(change_details: dict, submission_id: str, key_prefix: str = ""):
    """Render address change form fields using shared component."""
    from core.account_management import (
        get_submission_account,
        get_account_address_dict,
        format_account_address,
    )

    st.markdown("**Address Change**")

    # Get current address from account
    account = get_submission_account(submission_id)
    current_address = get_account_address_dict(account) if account else {}
    current_display = format_account_address(account) if account else ""

    # Show current address from account if available
    if current_display:
        st.info(f"**Current Address (from Account):** {current_display}")
        # Pre-fill old address with account address
        default_old = current_address
    else:
        st.caption("No address on file. Enter current address below.")
        default_old = {}

    # Old Address section using shared component
    st.caption("Previous Address")
    old_address = render_address_form(
        key_prefix=f"{key_prefix}addr_old_{submission_id}",
        default_values=default_old,
    )

    # New Address section using shared component
    st.caption("New Address")
    new_address = render_address_form(
        key_prefix=f"{key_prefix}addr_new_{submission_id}",
    )

    # Store account_id so we can update account when endorsement is issued
    if account:
        change_details["account_id"] = account.get("id")

    # Store in change_details
    change_details["old_address"] = old_address
    change_details["new_address"] = new_address

    # Formatted display strings for PDF/description using shared format function
    change_details["old_address_display"] = format_address(old_address)
    change_details["new_address_display"] = format_address(new_address)


def _render_bor_fields_v2(change_details: dict, submission_id: str):
    """Simplified BOR change fields - single broker dropdown."""
    from core.bor_management import get_current_broker, get_all_broker_employments

    # Current broker
    current = get_current_broker(submission_id)
    if current:
        current_display = current.get('broker_name', 'Unknown')
        if current.get('contact_name'):
            current_display += f" - {current.get('contact_name')}"
        st.info(f"**Current:** {current_display}")
        change_details["previous_broker_id"] = current.get("broker_id")
        change_details["previous_broker_name"] = current.get("broker_name")
        change_details["previous_contact_id"] = current.get("broker_contact_id")
        change_details["previous_contact_name"] = current.get("contact_name")
    else:
        st.warning("No current broker assigned")

    # Single broker employment dropdown
    employments = get_all_broker_employments()
    if not employments:
        st.warning("No brokers in system")
        return

    emp_options = {e["id"]: e["display_name"] for e in employments}
    selected_emp_id = st.selectbox(
        "New Broker *",
        options=list(emp_options.keys()),
        format_func=lambda x: emp_options.get(x, ""),
        key=f"bor_v2_emp_{submission_id}"
    )

    if selected_emp_id:
        # Find the selected employment and populate change details
        for emp in employments:
            if emp["id"] == selected_emp_id:
                change_details["new_broker_id"] = emp["org_id"]
                change_details["new_broker_name"] = emp["org_name"]
                change_details["new_contact_id"] = emp["id"]
                change_details["new_contact_name"] = emp["person_name"]
                break


def _render_coverage_change_with_editor(submission_id: str, change_details: dict):
    """
    Render coverage change fields using the embedded coverage editor component.

    This replaces the basic limit/retention fields with a full coverage editor
    that shows all coverages and computes diffs automatically.
    """
    from pages_components.coverage_editor import (
        render_coverage_editor,
        compute_coverage_changes,
        reset_coverage_editor,
    )
    from core.bound_option import get_bound_option
    from rating_engine.coverage_config import format_limit_display

    # Get bound option with current coverages
    bound = get_bound_option(submission_id) or {}
    current_coverages = bound.get("coverages", {})
    tower_json = bound.get("tower_json", [])
    current_aggregate = int(tower_json[0].get("limit", 0)) if tower_json else current_coverages.get("aggregate_limit", 2_000_000)
    current_retention = int(bound.get("primary_retention", 0) or 0)

    if not current_coverages:
        st.warning("No coverage data found for bound policy")
        return

    # Editor ID for session state isolation in modal context
    editor_id = f"endorsement_{submission_id}"

    # ── Policy Aggregate Limit & Retention ──
    st.markdown("**Policy Limits**")
    col1, col2 = st.columns(2)

    # Use shared limit/retention options from coverage_config
    from rating_engine.coverage_config import (
        get_aggregate_limit_options,
        get_retention_options,
        get_limit_index,
    )

    limit_options = get_aggregate_limit_options()
    limit_values = [v for v, _ in limit_options]
    limit_labels = [l for _, l in limit_options]
    current_limit_idx = get_limit_index(current_aggregate, limit_options, default=1)

    with col1:
        new_limit_idx = st.selectbox(
            f"Aggregate Limit (current: {format_limit_display(current_aggregate)})",
            options=range(len(limit_options)),
            index=current_limit_idx,
            format_func=lambda i: limit_labels[i],
            key=f"cov_change_agg_limit_{submission_id}"
        )
        new_aggregate = limit_values[new_limit_idx]

    retention_options = get_retention_options()
    retention_values = [v for v, _ in retention_options]
    retention_labels = [l for _, l in retention_options]
    current_ret_idx = get_limit_index(current_retention, retention_options, default=1)

    with col2:
        new_ret_idx = st.selectbox(
            f"Retention (current: {format_limit_display(current_retention)})",
            options=range(len(retention_options)),
            index=current_ret_idx,
            format_func=lambda i: retention_labels[i],
            key=f"cov_change_retention_{submission_id}"
        )
        new_retention = retention_values[new_ret_idx]

    # Track aggregate limit / retention changes
    if new_aggregate != current_aggregate:
        change_details["aggregate_limit"] = {"old": current_aggregate, "new": new_aggregate}
    if new_retention != current_retention:
        change_details["retention"] = {"old": current_retention, "new": new_retention}

    # ── Individual Coverage Limits ──
    st.markdown("**Coverage Schedule**")

    # Use the selected aggregate limit for the coverage editor
    aggregate_limit = new_aggregate

    # Render the coverage editor in diff mode
    # This shows all coverages with editable values and change indicators
    new_coverages = render_coverage_editor(
        editor_id=editor_id,
        current_coverages=current_coverages,
        aggregate_limit=aggregate_limit,
        mode="diff",
        original_coverages=current_coverages,
        show_header=False,
    )

    # Compute changes between original and edited coverages
    changes = compute_coverage_changes(current_coverages, new_coverages)

    # Store computed changes in session state for form submission
    st.session_state["_endorsement_coverage_changes"] = changes
    st.session_state["_endorsement_new_coverages"] = new_coverages
    st.session_state["_endorsement_original_coverages"] = current_coverages

    # Update change_details dict that gets saved with endorsement
    if changes:
        change_details.update(changes)
        change_details["coverage_type"] = _infer_change_type(change_details)
    elif "aggregate_limit" in change_details or "retention" in change_details:
        change_details["coverage_type"] = _infer_change_type(change_details)
    else:
        change_details["coverage_type"] = "no_change"

    # Divider before premium section
    st.divider()


def _infer_change_type(changes: dict) -> str:
    """Infer the type of coverage change from the computed diff."""
    if "aggregate_limit" in changes:
        old_limit = changes["aggregate_limit"].get("old", 0)
        new_limit = changes["aggregate_limit"].get("new", 0)
        if new_limit > old_limit:
            return "limit_increase"
        elif new_limit < old_limit:
            return "limit_decrease"

    if "retention" in changes:
        return "retention_change"

    # Check if any coverages were added or removed (changed to/from 0)
    for section in ["aggregate_coverages", "sublimit_coverages"]:
        if section in changes:
            for cov_id, vals in changes[section].items():
                old_val = vals.get("old", 0)
                new_val = vals.get("new", 0)
                if old_val == 0 and new_val > 0:
                    return "coverage_add"
                elif old_val > 0 and new_val == 0:
                    return "coverage_remove"

    return "coverage_modification"
