"""
Admin Page Workflow

Dedicated page for admin actions across multiple policies.
Supports batch processing and natural language commands.
"""
from __future__ import annotations

import streamlit as st
from sqlalchemy import text
from core.db import get_conn
from ai.admin_agent import (
    process_command,
    execute_action,
    resolve_policy,
    get_supported_intents,
    get_action_for_policy,
    AdminIntent,
    ActionPreview,
    PolicyMatch
)


def render():
    """Render the admin console page."""
    st.title("Admin Console")

    # Check for pending confirmation or result first
    if "admin_preview" in st.session_state:
        _render_confirmation(st.session_state["admin_preview"])
        return

    if "admin_result" in st.session_state:
        _render_result(st.session_state["admin_result"])
        return

    if st.session_state.get("admin_mode") == "subjectivity_select":
        _render_subjectivity_selector()
        return

    # Show tabs for different admin functions
    tab_actions, tab_pending, tab_policies = st.tabs([
        "Quick Actions",
        "Pending Subjectivities",
        "Bound Policies"
    ])

    with tab_actions:
        _render_quick_actions_tab()

    with tab_pending:
        _render_pending_subjectivities_tab()

    with tab_policies:
        _render_bound_policies_tab()


def _render_quick_actions_tab():
    """Render the Quick Actions tab with unified search and command flow."""

    # Step 1: Search for policy
    st.markdown("#### Find Policy")
    search_term = st.text_input(
        "Search",
        placeholder="Search by company name...",
        key="admin_policy_search",
        label_visibility="collapsed"
    )

    if not search_term:
        # Show helpful examples when no search
        st.caption("Search for a policy, then choose an action or type a command.")
        with st.expander("Command Examples", expanded=False):
            for intent_info in get_supported_intents():
                st.markdown(f"**{intent_info['name']}**: {intent_info['description']}")
                st.code(intent_info['example'], language=None)
        return

    # Search for matching policies
    matches = resolve_policy(search_term)

    if not matches:
        st.warning("No policies found matching your search")
        return

    # Step 2: Select policy if multiple matches
    if len(matches) > 1:
        def format_policy(i):
            p = matches[i]
            # Show policy term (effective → expiration) to differentiate
            eff = p.effective_date.strftime("%m/%d/%y") if p.effective_date else "?"
            exp = p.expiration_date.strftime("%m/%d/%y") if p.expiration_date else "?"
            status = "Bound" if p.is_bound else "Not Bound"
            return f"{p.applicant_name} ({eff} → {exp}) - {status}"

        selected_idx = st.selectbox(
            "Multiple matches found - select one:",
            options=range(len(matches)),
            format_func=format_policy,
            key="admin_policy_select"
        )
        policy = matches[selected_idx]
    else:
        policy = matches[0]

    # Store selected policy for commands
    st.session_state["admin_selected_policy"] = policy

    # Step 3: Show selected policy with actions
    with st.container(border=True):
        col1, col2 = st.columns([2, 1])

        with col1:
            st.markdown(f"### {policy.applicant_name}")
            info_parts = []
            if policy.expiration_date:
                info_parts.append(f"Expires: {policy.expiration_date}")
            info_parts.append(f"Status: {'Bound' if policy.is_bound else 'Not Bound'}")
            st.caption(" · ".join(info_parts))

        with col2:
            # Link to policy page
            if st.button("Open Policy →", key="open_policy_btn", use_container_width=True):
                st.session_state["selected_submission_id"] = policy.submission_id
                st.switch_page("pages/submissions.py")

    st.markdown("---")

    # Command input - the main way to interact
    st.markdown("**Command**")
    command = st.text_input(
        "Command",
        placeholder="e.g., Extend 30 days, Change broker to Marsh, Mark financials received...",
        key="admin_command_input",
        label_visibility="collapsed"
    )

    col1, col2 = st.columns([3, 1])
    with col1:
        if st.button("Run Command", type="primary", use_container_width=True, disabled=not command):
            if command:
                _process_command_with_context(command, policy)
    with col2:
        # Quick shortcut for mark subjectivity (common action)
        if st.button("Mark Subj ✓", key="qa_subj", use_container_width=True):
            st.session_state["admin_mode"] = "subjectivity_select"
            st.session_state["admin_subj_policy"] = policy
            st.rerun()


def _render_pending_subjectivities_tab():
    """Show policies with pending subjectivities."""
    st.markdown("#### Policies with Pending Subjectivities")
    st.caption("Quick access to mark subjectivities as received")

    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT
                    s.id,
                    s.applicant_name,
                    COUNT(ps.id) as pending_count,
                    array_agg(ps.text ORDER BY ps.created_at) as subjectivity_texts
                FROM submissions s
                JOIN policy_subjectivities ps ON ps.submission_id = s.id
                WHERE ps.status = 'pending'
                GROUP BY s.id, s.applicant_name
                ORDER BY pending_count DESC
                LIMIT 20
            """))

            rows = result.fetchall()

            if not rows:
                st.info("No policies have pending subjectivities")
                return

            for row in rows:
                sub_id, name, count, texts = row
                with st.expander(f"**{name}** - {count} pending"):
                    for i, subj_text in enumerate(texts[:5]):  # Show first 5
                        col1, col2 = st.columns([4, 1])
                        with col1:
                            st.markdown(f"• {subj_text[:80]}{'...' if len(subj_text) > 80 else ''}")
                        with col2:
                            if st.button("✓ Received", key=f"mark_{sub_id}_{i}"):
                                # Find and mark this subjectivity
                                from core import subjectivity_management as subj_mgmt
                                match = subj_mgmt.find_matching_subjectivity(sub_id, subj_text, status="pending")
                                if match:
                                    subj_mgmt.mark_received(match["id"], received_by="admin")
                                    st.rerun()

                    if count > 5:
                        st.caption(f"...and {count - 5} more")

    except Exception as e:
        st.error(f"Error loading subjectivities: {e}")


def _render_bound_policies_tab():
    """Show recently bound policies with inline policy panel."""
    selected_sub_id = st.session_state.get("admin_selected_sub_id")

    # If a policy is selected, show its details (full width)
    if selected_sub_id:
        from pages_components.policy_panel import render_policy_panel

        # Back button and title
        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("← Back to list", key="back_to_list"):
                st.session_state.pop("admin_selected_sub_id", None)
                st.rerun()

        render_policy_panel(
            submission_id=selected_sub_id,
            show_sidebar=False,
            show_renewal=False,
            compact=False
        )
        return

    # Search box
    search_term = st.text_input(
        "Search",
        placeholder="Search by company name...",
        key="bound_policy_search",
        label_visibility="collapsed"
    )

    if search_term:
        # Search for matching bound policies
        matches = resolve_policy(search_term, require_bound=True)
        if matches:
            st.markdown(f"#### Search Results ({len(matches)})")
            for policy in matches:
                with st.container(border=True):
                    col1, col2, col3 = st.columns([3, 2, 1])
                    with col1:
                        st.markdown(f"**{policy.applicant_name}**")
                        if policy.effective_date and policy.expiration_date:
                            eff_str = policy.effective_date.strftime("%m/%d/%y")
                            exp_str = policy.expiration_date.strftime("%m/%d/%y")
                            st.caption(f"{eff_str} → {exp_str}")
                    with col2:
                        st.caption("Bound" if policy.is_bound else "")
                    with col3:
                        if st.button("View", key=f"search_view_{policy.submission_id}", use_container_width=True):
                            st.session_state["admin_selected_sub_id"] = policy.submission_id
                            st.rerun()
        else:
            st.warning("No bound policies found matching your search")
        return

    # Show recent policies list
    st.markdown("#### Recently Bound Policies")

    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.effective_date,
                    s.expiration_date,
                    t.bound_at,
                    t.sold_premium
                FROM submissions s
                JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
                ORDER BY t.bound_at DESC NULLS LAST
                LIMIT 20
            """))

            rows = result.fetchall()

            if not rows:
                st.info("No bound policies found")
                return

            for row in rows:
                sub_id, name, eff_date, exp_date, bound_at, premium = row

                # Format display strings
                if eff_date and exp_date:
                    eff_str = eff_date.strftime("%m/%d/%y") if hasattr(eff_date, 'strftime') else str(eff_date)
                    exp_str = exp_date.strftime("%m/%d/%y") if hasattr(exp_date, 'strftime') else str(exp_date)
                    term_str = f"{eff_str} → {exp_str}"
                else:
                    term_str = ""

                premium_str = f"${premium:,.0f}" if premium else ""

                with st.container(border=True):
                    col1, col2, col3 = st.columns([3, 2, 1])

                    with col1:
                        st.markdown(f"**{name}**")
                        st.caption(term_str)

                    with col2:
                        if premium_str:
                            st.caption(f"Premium: {premium_str}")
                        if bound_at:
                            bound_str = bound_at.strftime("%m/%d/%y") if hasattr(bound_at, 'strftime') else str(bound_at)
                            st.caption(f"Bound: {bound_str}")

                    with col3:
                        if st.button("View", key=f"view_{sub_id}", use_container_width=True):
                            st.session_state["admin_selected_sub_id"] = str(sub_id)
                            st.rerun()

    except Exception as e:
        st.error(f"Error loading policies: {e}")


def _create_quick_preview(intent: AdminIntent, policy: PolicyMatch, entities: dict):
    """Create an action preview from a quick action."""
    preview = get_action_for_policy(intent, policy.submission_id, entities)
    if preview:
        st.session_state["admin_preview"] = preview
        st.rerun()


def _render_confirmation(preview: ActionPreview):
    """Render confirmation dialog for an action."""
    from datetime import date

    st.markdown("### Confirm Action")

    is_bor_action = preview.intent == AdminIntent.PROCESS_BOR

    # Check if this is a BOR action that needs broker selection
    needs_broker_selection = (
        is_bor_action and
        not preview.executor_params.get("new_broker_id")
    )

    with st.container(border=True):
        st.markdown(f"#### {preview.description}")
        st.markdown(f"**Policy:** {preview.target.applicant_name}")

        if preview.target.policy_number:
            st.caption(f"Policy #: {preview.target.policy_number}")

        st.markdown("---")

        if preview.changes:
            st.markdown("**Changes:**")
            for change in preview.changes:
                # For BOR, show effective_date as editable field instead of static change
                if is_bor_action and change["field"] == "effective_date":
                    continue  # Skip - will show as date picker below
                st.markdown(f"• **{change['field']}**: `{change['from']}` → `{change['to']}`")

        # For BOR actions, show editable effective date with current broker date info
        date_warning = None
        if is_bor_action:
            st.markdown("---")
            current_broker = preview.executor_params.get("current_broker") or {}
            current_eff = current_broker.get("effective_date")

            # Get the proposed effective date
            eff_str = preview.executor_params.get("effective_date")
            default_date = date.fromisoformat(eff_str) if eff_str else date.today()

            # Show date picker with constraint info
            if current_eff:
                st.caption(f"Current broker effective since: **{current_eff}**")
                min_date = current_eff
            else:
                min_date = None

            new_eff_date = st.date_input(
                "BOR Effective Date",
                value=default_date,
                min_value=min_date,
                key="bor_effective_date"
            )

            # Validate and update params
            if new_eff_date:
                preview.executor_params["effective_date"] = new_eff_date.isoformat()
                if current_eff and new_eff_date < current_eff:
                    date_warning = f"Must be on or after {current_eff}"

        # If BOR needs broker selection, show dropdown
        if needs_broker_selection:
            st.markdown("---")
            st.markdown("**Select Broker:**")
            typed_name = preview.executor_params.get("new_broker_name", "")
            st.caption(f"Searching for: *{typed_name}*")

            # Get all broker employments (person + org combinations)
            from core import bor_management as bor
            all_employments = bor.get_all_broker_employments()

            # Filter by typed name (search person name or org name)
            search_lower = typed_name.lower()
            filtered = [
                e for e in all_employments
                if search_lower in e["person_name"].lower() or search_lower in e["org_name"].lower()
            ]

            # If no matches on search, show all
            options = filtered if filtered else all_employments

            if options:
                selected_emp = st.selectbox(
                    "Select broker",
                    options=options,
                    format_func=lambda e: e["display_name"],
                    key="broker_selection",
                    label_visibility="collapsed"
                )

                # Store selected broker for execute
                if selected_emp:
                    st.session_state["selected_broker"] = selected_emp
            else:
                st.warning("No brokers found in system")

        # Show non-date warnings
        if preview.warnings:
            non_date_warnings = [w for w in preview.warnings if "effective date" not in w.lower()]
            if non_date_warnings:
                st.markdown("---")
                for warning in non_date_warnings:
                    st.warning(warning)

        # Show date warning if any
        if date_warning:
            st.error(date_warning)

    col1, col2, col3 = st.columns([1, 1, 2])
    with col1:
        # Disable confirm if broker selection is required but not made, or date is invalid
        can_confirm = (not needs_broker_selection or st.session_state.get("selected_broker")) and not date_warning

        if st.button("Confirm", type="primary", use_container_width=True, disabled=not can_confirm):
            # If broker was selected, update the preview params
            if needs_broker_selection and st.session_state.get("selected_broker"):
                selected = st.session_state["selected_broker"]
                preview.executor_params["new_broker_id"] = selected["org_id"]
                preview.executor_params["new_broker_name"] = selected["org_name"]
                preview.executor_params["new_contact_id"] = selected["id"]
                # Also update the changes display
                for change in preview.changes:
                    if change["field"] == "broker":
                        change["to"] = f"{selected['org_name']} ({selected['person_name']})"

            result = execute_action(preview)
            st.session_state["admin_result"] = {
                "success": result.success,
                "message": result.message,
                "action": preview.description,
                "submission_id": preview.target.submission_id  # For "Go to Policy" button
            }
            del st.session_state["admin_preview"]
            st.session_state.pop("selected_broker", None)
            st.rerun()

    with col2:
        if st.button("Cancel", use_container_width=True):
            del st.session_state["admin_preview"]
            st.session_state.pop("selected_broker", None)
            st.rerun()


def _render_result(result: dict):
    """Render action result with option to go to policy."""
    if result["success"]:
        st.success(f"✓ {result['message']}")
    else:
        st.error(f"✗ {result['message']}")

    st.caption(f"Action: {result.get('action', 'Unknown')}")

    # Show navigation options
    col1, col2 = st.columns(2)

    with col1:
        if st.button("Continue", type="primary", use_container_width=True):
            del st.session_state["admin_result"]
            st.rerun()

    with col2:
        # If we have a submission_id from the action, offer to go there
        submission_id = result.get("submission_id")
        if submission_id:
            if st.button("Go to Policy →", use_container_width=True):
                del st.session_state["admin_result"]
                st.session_state["selected_submission_id"] = submission_id
                st.session_state["_active_tab"] = "Policy"
                st.switch_page("pages/submissions.py")


def _render_subjectivity_selector():
    """Render subjectivity selection for quick action."""
    from core import subjectivity_management as subj_mgmt

    policy = st.session_state.get("admin_subj_policy")
    if not policy:
        st.session_state["admin_mode"] = None
        st.rerun()
        return

    st.markdown("### Mark Subjectivity Received")
    st.markdown(f"**Policy:** {policy.applicant_name}")

    pending = subj_mgmt.get_subjectivities(policy.submission_id, status="pending")

    if not pending:
        st.info("No pending subjectivities for this policy")
        if st.button("Back"):
            st.session_state["admin_mode"] = None
            st.rerun()
        return

    st.markdown("Select a subjectivity to mark as received:")

    for subj in pending:
        with st.container(border=True):
            col1, col2 = st.columns([4, 1])
            with col1:
                st.markdown(subj['text'])
            with col2:
                if st.button("Mark ✓", key=f"mark_subj_{subj['id']}", type="primary"):
                    preview = get_action_for_policy(
                        AdminIntent.MARK_SUBJECTIVITY,
                        policy.submission_id,
                        {"subjectivity_description": subj["text"]}
                    )
                    if preview:
                        st.session_state["admin_preview"] = preview
                        st.session_state["admin_mode"] = None
                        st.rerun()

    st.markdown("---")
    if st.button("Cancel"):
        st.session_state["admin_mode"] = None
        st.rerun()


def _process_command(command: str):
    """Process a natural language command."""
    with st.spinner("Processing command..."):
        parsed, matches, preview = process_command(command)

        if parsed.intent == AdminIntent.UNKNOWN:
            st.session_state["admin_result"] = {
                "success": False,
                "message": f"Could not understand: {parsed.error or 'Unknown command'}",
                "action": "Parse command"
            }
            st.rerun()
            return

        if not matches:
            st.session_state["admin_result"] = {
                "success": False,
                "message": "No matching policy found. Include the company name in your command.",
                "action": "Find policy"
            }
            st.rerun()
            return

        if len(matches) > 1 and not preview:
            st.session_state["admin_result"] = {
                "success": False,
                "message": f"Multiple policies found: {', '.join(m.applicant_name for m in matches[:3])}. Be more specific.",
                "action": "Disambiguate"
            }
            st.rerun()
            return

        if preview:
            st.session_state["admin_preview"] = preview
            st.rerun()


def _process_command_with_context(command: str, policy: PolicyMatch):
    """Process a command with the selected policy as context (no need to search)."""
    from ai.admin_agent import parse_command

    with st.spinner("Processing command..."):
        parsed = parse_command(command)

        if parsed.intent == AdminIntent.UNKNOWN:
            st.session_state["admin_result"] = {
                "success": False,
                "message": f"Could not understand: {parsed.error or 'Unknown command'}",
                "action": "Parse command",
                "submission_id": policy.submission_id
            }
            st.rerun()
            return

        # Use the already-selected policy - no need to search
        preview = get_action_for_policy(
            parsed.intent,
            policy.submission_id,
            parsed.entities
        )

        if preview:
            st.session_state["admin_preview"] = preview
            st.rerun()
        else:
            st.session_state["admin_result"] = {
                "success": False,
                "message": f"Could not create action for: {parsed.intent.name}",
                "action": "Create preview",
                "submission_id": policy.submission_id
            }
            st.rerun()
