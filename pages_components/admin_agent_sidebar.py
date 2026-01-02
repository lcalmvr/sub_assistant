"""
Admin Agent Sidebar Component

Contextual AI admin assistant for the Policy tab.
Knows the current submission context for streamlined commands.
"""
from __future__ import annotations

import streamlit as st
from utils.tab_state import rerun_on_policy_tab
from ai.admin_agent import (
    process_command,
    execute_action,
    get_action_for_policy,
    AdminIntent,
    ActionPreview,
    get_supported_intents
)


def render_admin_agent_sidebar(
    submission_id: str,
    applicant_name: str,
    is_bound: bool = False
):
    """
    Render the admin agent sidebar for the Policy tab.

    Args:
        submission_id: Current submission context
        applicant_name: For display
        is_bound: Whether the submission has a bound option
    """
    st.sidebar.markdown("---")
    st.sidebar.subheader("AI Admin Assistant")
    st.sidebar.caption(f"Policy: {applicant_name}")

    # Session keys for this submission
    preview_key = f"admin_preview_{submission_id}"
    result_key = f"admin_result_{submission_id}"
    cmd_counter_key = f"admin_cmd_counter_{submission_id}"

    # Initialize counter for clearing input
    if cmd_counter_key not in st.session_state:
        st.session_state[cmd_counter_key] = 0

    # Show recent result if any
    if result_key in st.session_state:
        result = st.session_state[result_key]
        if result["success"]:
            st.sidebar.success(result["message"])
        else:
            st.sidebar.error(result["message"])
        # Clear after showing
        if st.sidebar.button("Dismiss", key=f"dismiss_result_{submission_id}"):
            del st.session_state[result_key]
            rerun_on_policy_tab()
        return

    # If we have a pending preview, show confirmation
    if preview_key in st.session_state:
        _render_confirmation_card(
            st.session_state[preview_key],
            submission_id,
            preview_key,
            result_key
        )
        return

    # Command input
    command = st.sidebar.text_input(
        "Command",
        placeholder="e.g., Extend policy 30 days",
        key=f"admin_cmd_{submission_id}_{st.session_state[cmd_counter_key]}",
        label_visibility="collapsed"
    )

    # Quick action buttons (only show if bound)
    if is_bound:
        st.sidebar.caption("Quick Actions:")
        cols = st.sidebar.columns(2)
        with cols[0]:
            if st.button("Extend 30d", key=f"quick_extend_{submission_id}", use_container_width=True):
                _process_quick_action(
                    AdminIntent.EXTEND_POLICY,
                    submission_id,
                    {"extension_days": 30},
                    preview_key
                )
        with cols[1]:
            if st.button("Mark Subj", key=f"quick_subj_{submission_id}", use_container_width=True):
                st.session_state[f"admin_mode_{submission_id}"] = "subjectivity_select"
                rerun_on_policy_tab()

    # Subjectivity selection mode
    if st.session_state.get(f"admin_mode_{submission_id}") == "subjectivity_select":
        _render_subjectivity_selector(submission_id, preview_key)
        return

    # Process free-form command
    if command:
        with st.sidebar.status("Processing...", expanded=False):
            parsed, matches, preview = process_command(
                user_input=command,
                context_submission_id=submission_id
            )

            if parsed.intent == AdminIntent.UNKNOWN:
                st.sidebar.error(f"Could not understand command: {parsed.error or 'Unknown'}")
                st.sidebar.caption("Try: 'Extend policy 30 days' or 'Mark financials received'")
                return

            if not matches:
                st.sidebar.warning("No matching policy found")
                return

            if len(matches) > 1 and not preview:
                # Multiple matches - need disambiguation
                st.sidebar.warning("Multiple policies found. Please be more specific:")
                for m in matches[:3]:
                    st.sidebar.caption(f"- {m.applicant_name} ({m.policy_number or 'No #'})")
                return

            if preview:
                st.session_state[preview_key] = preview
                st.session_state[cmd_counter_key] += 1
                rerun_on_policy_tab()

    # Help text
    with st.sidebar.expander("Examples", expanded=False):
        for intent_info in get_supported_intents():
            st.caption(f"**{intent_info['name']}**")
            st.caption(f"_{intent_info['example']}_")


def _render_confirmation_card(
    preview: ActionPreview,
    submission_id: str,
    preview_key: str,
    result_key: str
):
    """Render confirmation card for a pending action."""
    st.sidebar.markdown("### Confirm Action")
    st.sidebar.markdown(f"**{preview.description}**")

    # Show changes
    if preview.changes:
        for change in preview.changes:
            st.sidebar.markdown(
                f"- **{change['field']}**: `{change['from']}` → `{change['to']}`"
            )

    # Show warnings
    for warning in preview.warnings:
        st.sidebar.warning(warning, icon="⚠️")

    # Confirm/Cancel buttons
    col1, col2 = st.sidebar.columns(2)
    with col1:
        if st.button("Confirm", type="primary", key=f"confirm_{submission_id}", use_container_width=True):
            result = execute_action(preview)
            st.session_state[result_key] = {
                "success": result.success,
                "message": result.message
            }
            # Clear cache so changes show immediately
            from pages_workflows.submissions import clear_submission_caches
            clear_submission_caches()
            # Show toast notification for visibility
            if result.success:
                st.toast(result.message, icon="✅")
            else:
                st.toast(result.message, icon="❌")
            # Mark to stay on Policy tab
            st.session_state["_return_to_policy_tab"] = True
            st.session_state["_active_tab"] = "Policy"
            del st.session_state[preview_key]
            rerun_on_policy_tab()

    with col2:
        if st.button("Cancel", key=f"cancel_{submission_id}", use_container_width=True):
            del st.session_state[preview_key]
            rerun_on_policy_tab()


def _process_quick_action(
    intent: AdminIntent,
    submission_id: str,
    entities: dict,
    preview_key: str
):
    """Process a quick action button click."""
    preview = get_action_for_policy(intent, submission_id, entities)
    if preview:
        st.session_state[preview_key] = preview
        rerun_on_policy_tab()
    else:
        st.sidebar.error("Could not create action preview")


def _render_subjectivity_selector(submission_id: str, preview_key: str):
    """Render subjectivity selection dropdown."""
    from core import subjectivity_management as subj_mgmt

    st.sidebar.markdown("### Mark Subjectivity Received")

    pending = subj_mgmt.get_subjectivities(submission_id, status="pending")

    if not pending:
        st.sidebar.info("No pending subjectivities")
        if st.sidebar.button("Back", key=f"subj_back_{submission_id}"):
            del st.session_state[f"admin_mode_{submission_id}"]
            rerun_on_policy_tab()
        return

    # Create options
    options = {s["id"]: s["text"][:60] + ("..." if len(s["text"]) > 60 else "") for s in pending}

    selected_id = st.sidebar.selectbox(
        "Select subjectivity",
        options=list(options.keys()),
        format_func=lambda x: options[x],
        key=f"subj_select_{submission_id}"
    )

    col1, col2 = st.sidebar.columns(2)
    with col1:
        if st.button("Mark Received", type="primary", key=f"subj_confirm_{submission_id}", use_container_width=True):
            # Find full subjectivity
            selected = next((s for s in pending if s["id"] == selected_id), None)
            if selected:
                preview = get_action_for_policy(
                    AdminIntent.MARK_SUBJECTIVITY,
                    submission_id,
                    {"subjectivity_description": selected["text"]}
                )
                if preview:
                    st.session_state[preview_key] = preview
                    del st.session_state[f"admin_mode_{submission_id}"]
                    rerun_on_policy_tab()

    with col2:
        if st.button("Cancel", key=f"subj_cancel_{submission_id}", use_container_width=True):
            del st.session_state[f"admin_mode_{submission_id}"]
            rerun_on_policy_tab()


def render_admin_agent_minimal(submission_id: str, applicant_name: str):
    """
    Minimal admin agent widget for embedding in tight spaces.
    Just shows command input and result.
    """
    preview_key = f"admin_preview_{submission_id}"
    result_key = f"admin_result_{submission_id}"

    # Show result
    if result_key in st.session_state:
        result = st.session_state[result_key]
        if result["success"]:
            st.success(result["message"])
        else:
            st.error(result["message"])
        if st.button("OK", key=f"min_dismiss_{submission_id}"):
            del st.session_state[result_key]
            rerun_on_policy_tab()
        return

    # Show confirmation
    if preview_key in st.session_state:
        preview = st.session_state[preview_key]
        st.info(f"**{preview.description}**")
        col1, col2 = st.columns(2)
        with col1:
            if st.button("Confirm", key=f"min_confirm_{submission_id}"):
                result = execute_action(preview)
                st.session_state[result_key] = {"success": result.success, "message": result.message}
                del st.session_state[preview_key]
                rerun_on_policy_tab()
        with col2:
            if st.button("Cancel", key=f"min_cancel_{submission_id}"):
                del st.session_state[preview_key]
                rerun_on_policy_tab()
        return

    # Command input
    col1, col2 = st.columns([4, 1])
    with col1:
        cmd = st.text_input(
            "Admin command",
            placeholder="e.g., Extend 30 days",
            key=f"min_cmd_{submission_id}",
            label_visibility="collapsed"
        )
    with col2:
        if st.button("Go", key=f"min_go_{submission_id}"):
            if cmd:
                parsed, matches, preview = process_command(cmd, submission_id)
                if preview:
                    st.session_state[preview_key] = preview
                    rerun_on_policy_tab()
                elif parsed.intent == AdminIntent.UNKNOWN:
                    st.error("Command not understood")
