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
from core.endorsement_catalog import get_entries_for_type


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
                       Expected keys: bound_option, effective_state, endorsements,
                                     endorsement_catalog, submission
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
        endorsement_catalog = preloaded_data.get("endorsement_catalog", [])
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
        endorsements = get_endorsements(submission_id, include_voided=False)
        endorsement_catalog = None  # Will fetch on demand
        policy_dates = None  # Will fetch on demand

    # Endorsements section header with count
    endorsement_count = state.get("endorsement_count", 0)
    if endorsement_count > 0:
        st.markdown(f"##### Endorsements ({endorsement_count})")
    else:
        st.markdown("##### Endorsements")

    # Show premium adjustments only if there are any
    adjustments = state.get("premium_adjustments", 0)
    if adjustments != 0:
        adj_str = f"+${adjustments:,.0f}" if adjustments > 0 else f"-${abs(adjustments):,.0f}"
        st.caption(f"Premium adjustments from endorsements: {adj_str}")

    # List existing endorsements
    if endorsements:
        _render_endorsement_list(endorsements)
    else:
        st.caption("No endorsements yet.")

    # New endorsement form - collapsed by default
    with st.expander("+ New Endorsement", expanded=False):
        _render_new_endorsement_form(
            submission_id,
            bound,
            endorsement_catalog=endorsement_catalog,
            policy_dates=policy_dates
        )


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
        status_icon = ":green_circle:"
    else:
        status_icon = ":red_circle:"

    # Premium display
    if endorsement_type == "bor_change":
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
        st.markdown(f"{status_icon} **#{number}** {title}")
        st.caption(f"{eff_str}")

    with col2:
        if premium_str:
            st.markdown(f"**{premium_str}**")

    with col3:
        if status == "draft":
            if st.button("Issue", key=f"issue_{endorsement_id}", type="primary", use_container_width=True):
                try:
                    issue_endorsement(endorsement_id, issued_by="user")
                    try:
                        from core.package_generator import generate_midterm_endorsement_document
                        doc_result = generate_midterm_endorsement_document(endorsement_id, created_by="user")
                        pdf_url = doc_result.get("pdf_url")
                        if pdf_url:
                            save_endorsement_document_url(endorsement_id, pdf_url)
                        st.success("Issued")
                    except Exception:
                        pass  # Document generation is optional
                    st.rerun()
                except Exception as ex:
                    st.error(f"Error: {ex}")
        elif status == "issued":
            pdf_url = e.get("document_url")
            if pdf_url:
                st.markdown(f"[PDF]({pdf_url})")
            else:
                st.caption("Issued")

    # Expandable actions for drafts (Edit/Delete) - only show if user clicks
    if status == "draft":
        with st.expander("Options", expanded=False):
            col_a, col_b, col_c = st.columns(3)
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
            with col_c:
                if st.button("Void", key=f"void_{endorsement_id}"):
                    st.session_state[f"confirm_void_{endorsement_id}"] = True

    # Void confirmation (inline, simple)
    if st.session_state.get(f"confirm_void_{endorsement_id}"):
        reason = st.text_input("Void reason", key=f"void_reason_{endorsement_id}")
        col_a, col_b = st.columns(2)
        with col_a:
            if st.button("Confirm", key=f"confirm_void_btn_{endorsement_id}", type="primary"):
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


def _render_edit_endorsement_form(e: dict):
    """Render inline edit form for a draft endorsement."""
    endorsement_id = e["id"]
    endorsement_type = e["endorsement_type"]

    with st.container():
        st.markdown("---")
        st.markdown("**Edit Endorsement**")

        col1, col2 = st.columns(2)

        with col1:
            new_effective_date = st.date_input(
                "Effective Date",
                value=e.get("effective_date") or date.today(),
                key=f"edit_eff_date_{endorsement_id}"
            )

        with col2:
            new_description = st.text_input(
                "Description",
                value=e.get("description", ""),
                key=f"edit_desc_{endorsement_id}"
            )

        new_notes = st.text_area(
            "Notes",
            value=e.get("notes") or "",
            key=f"edit_notes_{endorsement_id}"
        )

        # For BOR, also allow editing change_details
        new_change_details = None
        if endorsement_type == "bor_change":
            st.markdown("**BOR Details**")
            change_details = e.get("change_details", {})

            col1, col2 = st.columns(2)
            with col1:
                prev_broker = st.text_input(
                    "Previous Broker",
                    value=change_details.get("previous_broker_name", ""),
                    key=f"edit_prev_broker_{endorsement_id}"
                )
            with col2:
                new_broker = st.text_input(
                    "New Broker",
                    value=change_details.get("new_broker_name", ""),
                    key=f"edit_new_broker_{endorsement_id}"
                )

            change_reason = st.text_input(
                "Change Reason",
                value=change_details.get("change_reason", ""),
                key=f"edit_change_reason_{endorsement_id}"
            )

            new_change_details = {
                **change_details,
                "previous_broker_name": prev_broker,
                "new_broker_name": new_broker,
                "change_reason": change_reason,
            }

        col_a, col_b = st.columns(2)
        with col_a:
            if st.button("Save Changes", key=f"save_edit_{endorsement_id}", type="primary"):
                try:
                    update_endorsement(
                        endorsement_id=endorsement_id,
                        effective_date=new_effective_date,
                        description=new_description if new_description else None,
                        change_details=new_change_details,
                        notes=new_notes if new_notes else None,
                        updated_by="user"
                    )
                    st.session_state.pop(f"editing_endorsement_{endorsement_id}", None)
                    st.success("Endorsement updated")
                    st.rerun()
                except Exception as ex:
                    st.error(f"Error: {ex}")

        with col_b:
            if st.button("Cancel", key=f"cancel_edit_{endorsement_id}"):
                st.session_state.pop(f"editing_endorsement_{endorsement_id}", None)
                st.rerun()

        st.markdown("---")


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

        elif endorsement_type == "cancellation":
            st.markdown("**Cancellation Details**")
            reason = change_details.get("cancellation_reason", "N/A")
            st.write(f"**Reason:** {reason.replace('_', ' ').title()}")

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
    endorsement_catalog: list = None,
    policy_dates: tuple = None
):
    """Render form for creating a new endorsement.

    Args:
        submission_id: UUID of the submission
        bound: Bound option dict
        endorsement_catalog: Optional pre-loaded catalog entries (avoids DB query)
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

    # Template selector from endorsement bank (use pre-loaded if available)
    if endorsement_catalog is not None:
        # Filter pre-loaded catalog by type
        catalog_entries = [
            e for e in endorsement_catalog
            if e.get("endorsement_type") == endorsement_type
        ]
    else:
        catalog_entries = get_entries_for_type(endorsement_type, position)
    selected_template = None
    formal_title = None
    catalog_id = None

    if catalog_entries:
        template_options = [{"id": None, "code": "", "title": "(No template - custom)"}] + catalog_entries
        selected_template = st.selectbox(
            "Template",
            options=template_options,
            format_func=lambda x: f"{x['code']} - {x['title']}" if x.get('code') else x['title'],
            key=f"new_end_template_{submission_id}"
        )
        if selected_template and selected_template.get("id"):
            formal_title = selected_template["title"]
            catalog_id = selected_template["id"]

    # Type-specific fields (render before description so we can use details for auto-description)
    change_details = {}
    _render_type_specific_fields(endorsement_type, change_details, submission_id)

    # Description - optional for self-explanatory types or when template selected
    # BOR uses Change Reason field instead of Description, so skip entirely
    self_explanatory_types = {"extension", "cancellation", "reinstatement", "erp"}
    no_description_types = {"bor_change"}  # These types don't need description at all

    if endorsement_type in no_description_types:
        description = ""  # BOR uses change_reason from type-specific fields
    elif endorsement_type in self_explanatory_types or catalog_id:
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

    # Premium section - not applicable for BOR endorsements
    no_premium_types = {"bor_change"}
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
            # Use template title as description if template selected
            if formal_title:
                final_description = formal_title
            else:
                final_description = _generate_auto_description(endorsement_type, change_details)

        if not final_description:
            st.error("Description is required")
            return

        try:
            tower_id = bound["id"]

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
                catalog_id=catalog_id,
                formal_title=formal_title,
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

    return ""


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
        st.caption("Address change details can be added in notes")

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
