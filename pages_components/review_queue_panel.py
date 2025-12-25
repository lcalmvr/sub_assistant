"""
Review Queue Panel Component

Provides a focused interface for humans to review and resolve conflicts
detected during submission data extraction.

See docs/conflict_review_implementation_plan.md for full documentation.
"""
from __future__ import annotations

import streamlit as st
from datetime import date, datetime
from typing import Callable

from core.conflict_service import (
    ConflictService,
    get_field_values_for_field,
    get_review_items,
    save_field_value,
    set_active_field_value,
)
from core.conflict_config import CONFIDENCE_THRESHOLD


# =============================================================================
# MAIN COMPONENT
# =============================================================================

def render_review_queue_panel(
    submission_id: str,
    expanded: bool = True,
    show_resolved: bool = False,
    on_resolve: Callable[[str], None] | None = None,
) -> dict:
    """
    Render the review queue panel for a submission.

    Args:
        submission_id: UUID of the submission
        expanded: Whether the panel is initially expanded
        show_resolved: Whether to show resolved/deferred items
        on_resolve: Callback when an item is resolved (for UI refresh)

    Returns:
        Summary dict with counts: {pending, high_priority, resolved, has_blockers}
    """
    service = ConflictService()
    _inject_review_queue_styles()

    # Get pending items first
    pending_items = get_review_items(submission_id, status="pending")

    # Deduplicate: if a field has a conflict, skip verification for same field
    deduplicated_items = _deduplicate_items(pending_items)

    # Calculate summary from deduplicated items (fixes count mismatch)
    pending = len(deduplicated_items)
    high = sum(1 for item in deduplicated_items if item.get("priority") == "high")
    medium = sum(1 for item in deduplicated_items if item.get("priority") == "medium")
    
    # Get resolved/deferred counts from service (these don't need deduplication)
    summary = service.get_review_summary(submission_id)
    resolved = summary["approved"] + summary["rejected"]
    deferred = summary["deferred"]

    # Build expander title with counts
    if pending == 0:
        title = "Review Queue (All clear)"
    else:
        priority_parts = []
        if high > 0:
            priority_parts.append(f"{high} high")
        if medium > 0:
            priority_parts.append(f"{medium} medium")
        priority_str = ", ".join(priority_parts)
        title = f"Review Queue ({pending} pending: {priority_str})"

    with st.expander(title, expanded=expanded and pending > 0):
        # Header with summary + refresh
        col1, col2 = st.columns([6, 1])
        with col1:
            st.markdown(
                _render_queue_summary_html(pending, high, medium),
                unsafe_allow_html=True,
            )
        with col2:
            if st.button("Refresh", key=f"review_refresh_{submission_id}"):
                service.force_refresh(submission_id)
                st.rerun()

        if not deduplicated_items:
            st.success("All items have been reviewed.")
            return {
                "pending": 0,
                "high_priority": 0,
                "resolved": resolved,
                "deferred": deferred,
                "has_blockers": False,
            }

        # Group items by category
        conflicts = []  # Actual conflicts that need resolution
        verifications = []  # Sign-off items

        for item in deduplicated_items:
            ctype = item.get("conflict_type", "")
            if ctype == "VERIFICATION_REQUIRED":
                verifications.append(item)
            else:
                conflicts.append(item)

        # Group conflicts by type, sorted by priority
        conflicts_by_type = _group_conflicts_by_type(conflicts)

        # Render conflicts grouped by type
        if conflicts:
            st.markdown("#### Issues to Resolve")
            st.caption("Resolve conflicts in priority order. High priority items block submission.")
            st.markdown("")
            
            # Render each conflict type group
            for idx, (conflict_type, items) in enumerate(conflicts_by_type):
                type_label = _get_conflict_type_label(conflict_type)
                st.markdown(f"**{type_label}**")
                
                for item in items:
                    resolved_now = _render_conflict_card(item, submission_id, service)
                    if resolved_now:
                        if on_resolve:
                            on_resolve(item["id"])
                        st.rerun()
                    # Add spacing between cards
                    st.markdown("")
                
                # Add divider between groups (except after last group)
                if idx < len(conflicts_by_type) - 1:
                    st.divider()
                    st.markdown("")

        # Then verification sign-offs
        if verifications:
            if conflicts:
                st.divider()
                st.markdown("")
            st.markdown("#### Sign-off Required")
            st.caption("Confirm or correct AI-extracted values")
            st.markdown("")
            for item in verifications:
                resolved_now = _render_verification_card(item, submission_id, service)
                if resolved_now:
                    if on_resolve:
                        on_resolve(item["id"])
                    st.rerun()
                # Add spacing between verification cards
                st.markdown("")

        # Show resolved items if requested
        if show_resolved and (resolved > 0 or deferred > 0):
            st.markdown("---")
            with st.expander(f"Completed ({resolved + deferred})", expanded=False):
                resolved_items = get_review_items(submission_id, status="approved")
                deferred_items = get_review_items(submission_id, status="deferred")

                for item in resolved_items:
                    _render_resolved_item(item)
                for item in deferred_items:
                    _render_resolved_item(item)

    return {
        "pending": pending,
        "high_priority": high,
        "resolved": resolved,
        "deferred": deferred,
        "has_blockers": high > 0,
    }


def _group_conflicts_by_type(conflicts: list[dict]) -> list[tuple[str, list[dict]]]:
    """
    Group conflicts by type and sort by priority.
    
    Returns list of (conflict_type, items) tuples, sorted by:
    1. Priority of conflict type (high priority types first)
    2. Priority of items within each group (high → medium → low)
    """
    # Priority order for conflict types (higher priority types first)
    type_priority = {
        "VALUE_MISMATCH": 1,
        "CROSS_FIELD": 2,
        "APPLICATION_CONTRADICTION": 3,
        "MISSING_REQUIRED": 4,
        "LOW_CONFIDENCE": 5,
        "OUTLIER_VALUE": 6,
        "DUPLICATE_SUBMISSION": 7,
    }
    
    # Group by type
    groups = {}
    for item in conflicts:
        ctype = item.get("conflict_type", "")
        if ctype not in groups:
            groups[ctype] = []
        groups[ctype].append(item)
    
    # Sort items within each group by priority
    priority_order = {"high": 1, "medium": 2, "low": 3}
    for ctype in groups:
        groups[ctype].sort(key=lambda x: priority_order.get(x.get("priority", "low"), 3))
    
    # Sort groups by type priority
    sorted_groups = sorted(
        groups.items(),
        key=lambda x: (type_priority.get(x[0], 999), x[0])
    )
    
    return sorted_groups


def _deduplicate_items(items: list[dict]) -> list[dict]:
    """
    Remove verification items for fields that already have conflicts.

    If annual_revenue has a VALUE_MISMATCH, don't also show
    a VERIFICATION_REQUIRED for annual_revenue.
    """
    # Find fields that have actual conflicts
    conflict_fields = set()
    for item in items:
        ctype = item.get("conflict_type", "")
        field = item.get("field_name")
        if ctype != "VERIFICATION_REQUIRED" and field:
            conflict_fields.add(field)

    # Filter out verification items for those fields
    result = []
    for item in items:
        ctype = item.get("conflict_type", "")
        field = item.get("field_name")

        # Skip verification if field already has a conflict
        if ctype == "VERIFICATION_REQUIRED" and field in conflict_fields:
            continue

        result.append(item)

    return result


# =============================================================================
# CONFLICT CARDS
# =============================================================================

def _render_conflict_card(
    item: dict,
    submission_id: str,
    service: ConflictService,
) -> bool:
    """
    Render a single conflict card with resolution options.
    Returns True if the item was resolved (triggers refresh).
    """
    conflict_type = item["conflict_type"]
    field_name = item.get("field_name")
    priority = item["priority"]
    details = item.get("conflict_details", {})

    # Get field values if this is a field-level conflict
    field_values = []
    if field_name:
        field_values = get_field_values_for_field(submission_id, field_name)

    # Card container
    with st.container(border=True):
        header_col1, header_col2 = st.columns([1, 7])

        with header_col1:
            st.markdown(_get_priority_badge_html(priority), unsafe_allow_html=True)

        with header_col2:
            type_label = _get_conflict_type_label(conflict_type)
            st.markdown(f"**{type_label}**")
            if field_name:
                field_label = _format_field_name(field_name)
                st.caption(f"Field: {field_label}")

        message = details.get("message", "")
        if message:
            st.caption(message)

        st.markdown("")

        # Render type-specific UI
        if conflict_type == "VALUE_MISMATCH":
            return _render_value_mismatch_ui(item, field_values, submission_id, service)
        elif conflict_type == "LOW_CONFIDENCE":
            return _render_low_confidence_ui(item, field_values, submission_id, service)
        elif conflict_type == "MISSING_REQUIRED":
            return _render_missing_required_ui(item, submission_id, service)
        elif conflict_type == "CROSS_FIELD":
            return _render_cross_field_ui(item, submission_id, service)
        elif conflict_type == "APPLICATION_CONTRADICTION":
            return _render_contradiction_ui(item, submission_id, service)
        elif conflict_type == "OUTLIER_VALUE":
            return _render_outlier_ui(item, submission_id, service)
        else:
            return _render_generic_ui(item, submission_id, service)

    return False


def _render_verification_card(
    item: dict,
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Render a verification/sign-off card."""
    item_id = item["id"]
    field_name = item.get("field_name", "")
    priority = item["priority"]
    details = item.get("conflict_details", {})

    description = details.get("description", "")
    current_value = details.get("current_value")
    sign_off_name = details.get("sign_off_name", "")

    with st.container(border=True):
        header_col1, header_col2 = st.columns([1, 7])

        with header_col1:
            st.markdown(_get_priority_badge_html(priority), unsafe_allow_html=True)

        with header_col2:
            field_label = _format_field_name(field_name)
            st.markdown(f"**Verify {field_label}**")

        st.markdown("")

        formatted_value = _format_value_for_display(current_value, field_name)
        st.markdown(f"**Current value:** {formatted_value}")

        if description:
            st.caption(description)

        col_spacer, col_primary, col_secondary, col_tertiary = st.columns([5, 2, 1, 1])

        with col_primary:
            if st.button("Confirm", key=f"verify_{item_id}", type="primary"):
                resolution = {
                    "action": "verified",
                    "verified_value": current_value,
                    "sign_off_name": sign_off_name,
                }
                service.resolve_conflict(item_id, resolution, "review_queue")
                return True

        with col_secondary:
            if st.button("Edit", key=f"edit_verify_{item_id}"):
                st.session_state[f"editing_{item_id}"] = True
                st.rerun()

        with col_tertiary:
            if st.button("Defer", key=f"defer_verify_{item_id}"):
                service.defer_conflict(item_id, "Deferred for later verification", "review_queue")
                return True

        # Edit mode
        if st.session_state.get(f"editing_{item_id}", False):
            new_value = _render_field_input(field_name, current_value, f"edit_val_{item_id}")

            ecol1, ecol2 = st.columns(2)
            with ecol1:
                if st.button("Save", key=f"save_edit_{item_id}", type="primary"):
                    if new_value:
                        save_field_value(
                            submission_id=submission_id,
                            field_name=field_name,
                            value=new_value if not isinstance(new_value, date) else new_value.isoformat(),
                            source_type="user_edit",
                            created_by="review_queue",
                        )
                        resolution = {
                            "action": "edited_and_verified",
                            "original_value": current_value,
                            "new_value": new_value,
                        }
                        service.resolve_conflict(item_id, resolution, "review_queue")
                        st.session_state[f"editing_{item_id}"] = False
                        return True

            with ecol2:
                if st.button("Cancel", key=f"cancel_edit_{item_id}"):
                    st.session_state[f"editing_{item_id}"] = False
                    st.rerun()

    return False


# =============================================================================
# TYPE-SPECIFIC UI RENDERERS
# =============================================================================

def _render_value_mismatch_ui(
    item: dict,
    field_values: list[dict],
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Radio buttons to select between conflicting values."""
    item_id = item["id"]
    field_name = item.get("field_name", "")
    details = item.get("conflict_details", {})

    # Get conflicting values from details or field_values
    conflicting = details.get("conflicting_values", [])
    if not conflicting and field_values:
        conflicting = field_values

    st.markdown("**Conflicting values**")
    for fv in conflicting:
        value = fv.get("value")
        source = fv.get("source_type", "unknown")
        formatted = _format_value_for_display(value, field_name)
        source_label = _get_source_label(source)
        row = st.columns([2, 5])
        with row[0]:
            st.markdown(_get_source_badge_html(source_label), unsafe_allow_html=True)
        with row[1]:
            st.markdown(formatted)

    st.markdown("")

    # Build radio options
    options = []
    option_map = {}

    for fv in conflicting:
        value = fv.get("value")
        source = fv.get("source_type", "unknown")
        fv_id = fv.get("id")

        formatted = _format_value_for_display(value, field_name)
        source_label = _get_source_label(source)
        label = f"Use {source_label} ({formatted})"

        options.append(label)
        option_map[label] = {"value": value, "id": fv_id, "source": source}

    options.append("Enter different value...")

    selected = st.radio(
        "Select correct value:",
        options,
        key=f"mismatch_{item_id}",
        label_visibility="collapsed",
    )

    # Manual entry
    manual_value = None
    if selected == "Enter different value...":
        manual_value = _render_field_input(field_name, None, f"manual_{item_id}")

    col_spacer, col_primary, col_secondary, col_tertiary = st.columns([5, 2, 1, 1])

    with col_primary:
        if st.button("Resolve", key=f"approve_{item_id}", type="primary"):
            if selected == "Enter different value...":
                if not manual_value:
                    st.error("Enter a value")
                    return False
                save_field_value(
                    submission_id=submission_id,
                    field_name=field_name,
                    value=manual_value if not isinstance(manual_value, date) else manual_value.isoformat(),
                    source_type="user_edit",
                    created_by="review_queue",
                )
                resolution = {"chosen_value": manual_value, "source": "manual"}
            else:
                chosen = option_map.get(selected, {})
                if chosen.get("id"):
                    set_active_field_value(submission_id, field_name, chosen["id"])
                resolution = {"chosen_value": chosen.get("value"), "source": chosen.get("source")}

            service.resolve_conflict(item_id, resolution, "review_queue")
            return True

    with col_secondary:
        if st.button("Defer", key=f"defer_{item_id}"):
            service.defer_conflict(item_id, "Deferred", "review_queue")
            return True

    with col_tertiary:
        if st.button("Dismiss", key=f"reject_{item_id}"):
            service.reject_conflict(item_id, "Not a real conflict", "review_queue")
            return True

    return False


def _render_low_confidence_ui(
    item: dict,
    field_values: list[dict],
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Confirm or edit low-confidence extraction."""
    item_id = item["id"]
    field_name = item.get("field_name", "")
    details = item.get("conflict_details", {})

    extracted_value = details.get("value")
    confidence = details.get("confidence", 0)

    # Handle case where no value was extracted
    if extracted_value is None:
        st.markdown("**No value extracted**")
        st.caption(f"Confidence: {confidence:.0%} (threshold: {CONFIDENCE_THRESHOLD:.0%})")
    else:
        formatted = _format_value_for_display(extracted_value, field_name)
        st.markdown(f"**Extracted:** {formatted}")
        st.caption(f"Confidence: {confidence:.0%} (threshold: {CONFIDENCE_THRESHOLD:.0%})")

    col_spacer, col_primary, col_secondary, col_tertiary = st.columns([5, 2, 1, 1])

    with col_primary:
        if st.button("Confirm", key=f"confirm_{item_id}", type="primary"):
            resolution = {"action": "confirmed", "value": extracted_value}
            service.resolve_conflict(item_id, resolution, "review_queue")
            return True

    with col_secondary:
        if st.button("Edit", key=f"edit_{item_id}"):
            st.session_state[f"editing_{item_id}"] = True
            st.rerun()

    with col_tertiary:
        if st.button("Defer", key=f"defer_{item_id}"):
            service.defer_conflict(item_id, "Deferred", "review_queue")
            return True

    # Edit mode
    if st.session_state.get(f"editing_{item_id}", False):
        new_value = _render_field_input(field_name, extracted_value, f"edit_{item_id}")

        ecol1, ecol2 = st.columns(2)
        with ecol1:
            if st.button("Save", key=f"save_{item_id}", type="primary"):
                if new_value:
                    save_field_value(
                        submission_id=submission_id,
                        field_name=field_name,
                        value=new_value if not isinstance(new_value, date) else new_value.isoformat(),
                        source_type="user_edit",
                        created_by="review_queue",
                    )
                    resolution = {"action": "corrected", "original": extracted_value, "corrected": new_value}
                    service.resolve_conflict(item_id, resolution, "review_queue")
                    st.session_state[f"editing_{item_id}"] = False
                    return True

        with ecol2:
            if st.button("Cancel", key=f"cancel_{item_id}"):
                st.session_state[f"editing_{item_id}"] = False
                st.rerun()

    return False


def _render_missing_required_ui(
    item: dict,
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Input field for missing required value."""
    item_id = item["id"]
    field_name = item.get("field_name", "")

    new_value = _render_field_input(field_name, None, f"missing_{item_id}")

    col_spacer, col_primary, col_secondary = st.columns([6, 2, 1])

    with col_primary:
        if st.button("Save", key=f"save_{item_id}", type="primary"):
            if not new_value:
                st.error("Value required")
                return False

            save_field_value(
                submission_id=submission_id,
                field_name=field_name,
                value=new_value if not isinstance(new_value, date) else new_value.isoformat(),
                source_type="user_edit",
                created_by="review_queue",
            )
            resolution = {"action": "provided", "value": new_value}
            service.resolve_conflict(item_id, resolution, "review_queue")
            return True

    with col_secondary:
        if st.button("Defer", key=f"defer_{item_id}"):
            service.defer_conflict(item_id, "Deferred", "review_queue")
            return True

    return False


def _render_cross_field_ui(
    item: dict,
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Show and edit related fields."""
    item_id = item["id"]
    details = item.get("conflict_details", {})

    inner_details = details.get("details", {})
    fields = inner_details.get("fields", [])
    values = inner_details.get("values", {})

    # Show current values
    st.markdown("**Current values**")
    edited_values = {}
    for field in fields:
        current = values.get(field, "")
        formatted = _format_value_for_display(current, field)
        edited_values[field] = _render_field_input(field, current, f"cross_{item_id}_{field}")

    col_spacer, col_primary, col_secondary = st.columns([6, 2, 1])

    with col_primary:
        if st.button("Resolve", key=f"save_{item_id}", type="primary"):
            for field, value in edited_values.items():
                if value:
                    save_field_value(
                        submission_id=submission_id,
                        field_name=field,
                        value=value if not isinstance(value, date) else value.isoformat(),
                        source_type="user_edit",
                        created_by="review_queue",
                    )
            resolution = {"action": "corrected", "values": edited_values}
            service.resolve_conflict(item_id, resolution, "review_queue")
            return True

    with col_secondary:
        if st.button("Defer", key=f"defer_{item_id}"):
            service.defer_conflict(item_id, "Deferred", "review_queue")
            return True

    return False


def _render_contradiction_ui(
    item: dict,
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Show application contradiction details."""
    item_id = item["id"]
    details = item.get("conflict_details", {})

    field_a = details.get("field_a", "")
    field_b = details.get("field_b", "")
    value_a = details.get("field_a_value")
    value_b = details.get("field_b_value")

    # Format values properly, handling None
    value_a_display = _format_value_for_display(value_a, field_a) if value_a is not None else "Not specified"
    value_b_display = _format_value_for_display(value_b, field_b) if value_b is not None else "Not specified"

    # Show the contradiction clearly
    st.markdown("**Conflicting answers in application**")
    col1, col2 = st.columns(2)
    with col1:
        field_a_label = _format_field_name(field_a) if field_a else "Field A"
        st.markdown(f"**{field_a_label}:** {value_a_display}")
    with col2:
        field_b_label = _format_field_name(field_b) if field_b else "Field B"
        st.markdown(f"**{field_b_label}:** {value_b_display}")

    st.caption("These answers appear to contradict each other. Please review the application.")

    col_spacer, col_primary, col_secondary, col_tertiary = st.columns([5, 2, 1, 1])

    with col_primary:
        if st.button("Resolve", key=f"ack_{item_id}", type="primary"):
            resolution = {"action": "acknowledged", "note": "Reviewed application contradiction"}
            service.resolve_conflict(item_id, resolution, "review_queue")
            return True

    with col_secondary:
        if st.button("Defer", key=f"defer_{item_id}"):
            service.defer_conflict(item_id, "Deferred for review", "review_queue")
            return True

    with col_tertiary:
        if st.button("Dismiss", key=f"reject_{item_id}"):
            service.reject_conflict(item_id, "Not a real contradiction", "review_queue")
            return True

    return False


def _render_outlier_ui(
    item: dict,
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Handle outlier values."""
    item_id = item["id"]
    field_name = item.get("field_name", "")
    details = item.get("conflict_details", {})

    inner = details.get("details", {})
    value = inner.get("value")
    min_val = inner.get("min")
    max_val = inner.get("max")

    formatted = _format_value_for_display(value, field_name)
    min_formatted = _format_value_for_display(min_val, field_name)
    max_formatted = _format_value_for_display(max_val, field_name)

    st.markdown(f"**Value:** {formatted}")
    st.caption(f"Expected range: {min_formatted} to {max_formatted}")

    col_spacer, col_primary, col_secondary, col_tertiary = st.columns([5, 2, 1, 1])

    with col_primary:
        if st.button("Confirm", key=f"confirm_{item_id}", type="primary"):
            resolution = {"action": "confirmed_outlier", "value": value}
            service.resolve_conflict(item_id, resolution, "review_queue")
            return True

    with col_secondary:
        if st.button("Edit", key=f"edit_{item_id}"):
            st.session_state[f"editing_{item_id}"] = True
            st.rerun()

    with col_tertiary:
        if st.button("Defer", key=f"defer_{item_id}"):
            service.defer_conflict(item_id, "Deferred", "review_queue")
            return True

    if st.session_state.get(f"editing_{item_id}", False):
        new_value = _render_field_input(field_name, value, f"outlier_{item_id}")

        ecol1, ecol2 = st.columns(2)
        with ecol1:
            if st.button("Save", key=f"save_{item_id}", type="primary"):
                if new_value:
                    save_field_value(
                        submission_id=submission_id,
                        field_name=field_name,
                        value=new_value,
                        source_type="user_edit",
                        created_by="review_queue",
                    )
                    resolution = {"action": "corrected", "original": value, "new": new_value}
                    service.resolve_conflict(item_id, resolution, "review_queue")
                    st.session_state[f"editing_{item_id}"] = False
                    return True

        with ecol2:
            if st.button("Cancel", key=f"cancel_{item_id}"):
                st.session_state[f"editing_{item_id}"] = False
                st.rerun()

    return False


def _render_generic_ui(
    item: dict,
    submission_id: str,
    service: ConflictService,
) -> bool:
    """Fallback for unknown types."""
    item_id = item["id"]
    details = item.get("conflict_details", {})

    # Show key details without raw JSON
    if details.get("message"):
        st.markdown(f"**Details:** {details.get('message')}")

    col_spacer, col_primary, col_secondary, col_tertiary = st.columns([5, 2, 1, 1])

    with col_primary:
        if st.button("Resolve", key=f"approve_{item_id}", type="primary"):
            resolution = {"action": "approved"}
            service.resolve_conflict(item_id, resolution, "review_queue")
            return True

    with col_secondary:
        if st.button("Defer", key=f"defer_{item_id}"):
            service.defer_conflict(item_id, "Deferred", "review_queue")
            return True

    with col_tertiary:
        if st.button("Dismiss", key=f"reject_{item_id}"):
            service.reject_conflict(item_id, "Rejected", "review_queue")
            return True

    return False


def _render_resolved_item(item: dict) -> None:
    """Compact display of resolved items."""
    status = item["status"]
    conflict_type = item["conflict_type"]
    field_name = item.get("field_name", "")

    status_emoji = {"approved": "✅", "deferred": "⏸️", "rejected": "❌"}.get(status, "")
    type_label = _get_conflict_type_label(conflict_type)
    field_label = _format_field_name(field_name) if field_name else ""

    parts = [status_emoji, type_label]
    if field_label:
        parts.append(field_label)

    st.caption(" | ".join(parts))


# =============================================================================
# HELPERS
# =============================================================================

def _render_field_input(field_name: str, current_value, key: str):
    """Render appropriate input based on field type."""
    field_lower = field_name.lower()

    if "date" in field_lower:
        try:
            if current_value:
                if isinstance(current_value, str):
                    date_val = datetime.fromisoformat(current_value[:10]).date()
                elif isinstance(current_value, datetime):
                    date_val = current_value.date()
                elif isinstance(current_value, date):
                    date_val = current_value
                else:
                    date_val = None
            else:
                date_val = None
        except (ValueError, TypeError):
            date_val = None

        return st.date_input(
            _format_field_name(field_name),
            value=date_val,
            key=key,
        )

    elif "revenue" in field_lower or "amount" in field_lower or "premium" in field_lower:
        try:
            num_val = float(current_value) if current_value else 0
        except (ValueError, TypeError):
            num_val = 0

        return st.number_input(
            _format_field_name(field_name),
            value=num_val,
            min_value=0.0,
            step=10000.0,
            format="%.0f",
            key=key,
        )

    else:
        return st.text_input(
            _format_field_name(field_name),
            value=str(current_value) if current_value else "",
            key=key,
        )


def _get_priority_indicator(priority: str) -> str:
    """Return emoji for priority."""
    return {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(priority, "⚪")


def _get_priority_badge(priority: str) -> str:
    """Return formatted priority badge for display."""
    badges = {
        "high": "🔴 **High**",
        "medium": "🟡 **Medium**",
        "low": "🟢 **Low**",
    }
    return badges.get(priority, "⚪ **Unknown**")


def _get_priority_badge_html(priority: str) -> str:
    """HTML badge for priority."""
    label = {"high": "High", "medium": "Medium", "low": "Low"}.get(priority, "Unknown")
    return f'<span class="rq-badge rq-badge--{priority}">{label}</span>'


def _get_source_badge_html(source_label: str) -> str:
    """HTML badge for source labels."""
    return f'<span class="rq-badge rq-badge--source">{source_label}</span>'


def _render_queue_summary_html(pending: int, high: int, medium: int) -> str:
    """Small summary banner for the queue."""
    severity_parts = []
    if high:
        severity_parts.append(f"{high} high")
    if medium:
        severity_parts.append(f"{medium} medium")
    severity_text = ", ".join(severity_parts) if severity_parts else "no conflicts"
    return (
        '<div class="rq-summary">'
        f"<div class='rq-summary-title'>Review Queue</div>"
        f"<div class='rq-summary-sub'>{pending} pending · {severity_text}</div>"
        "</div>"
    )


def _inject_review_queue_styles() -> None:
    """Inject CSS for the review queue layout."""
    st.markdown(
        """
<style>
.rq-summary {
  border: 1px solid #ececf0;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 14px;
  padding: 10px 14px;
  margin-bottom: 8px;
}
.rq-summary-title {
  font-weight: 700;
  font-size: 16px;
  color: #111827;
}
.rq-summary-sub {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}
.rq-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.rq-badge--high {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.rq-badge--medium {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.rq-badge--low {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.rq-badge--source {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfdbfe;
  font-weight: 600;
}
div[data-testid="stVerticalBlockBorderWrapper"] {
  border: 1px solid #e5e7eb !important;
  border-radius: 14px !important;
  padding: 14px 16px !important;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
}
div[data-testid="stButton"] > button {
  border-radius: 10px;
}
</style>
""",
        unsafe_allow_html=True,
    )


def _get_conflict_type_label(conflict_type: str) -> str:
    """Human-readable label for conflict type."""
    return {
        "VALUE_MISMATCH": "Value Mismatch",
        "LOW_CONFIDENCE": "Low Confidence",
        "MISSING_REQUIRED": "Missing Required",
        "CROSS_FIELD": "Date/Logic Error",
        "DUPLICATE_SUBMISSION": "Potential Duplicate",
        "OUTLIER_VALUE": "Unusual Value",
        "APPLICATION_CONTRADICTION": "App Contradiction",
        "VERIFICATION_REQUIRED": "Needs Verification",
    }.get(conflict_type, conflict_type)


def _get_source_label(source_type: str) -> str:
    """Human-readable label for source type."""
    return {
        "ai_extraction": "AI Extraction",
        "document_form": "Document",
        "user_edit": "Manual",
        "broker_submission": "Broker",
        "carried_over": "Prior Policy",
    }.get(source_type, source_type)


def _format_field_name(field_name: str) -> str:
    """Format field name for display."""
    return field_name.replace("_", " ").title()


def _format_value_for_display(value, field_name: str) -> str:
    """Format value appropriately based on field type."""
    if value is None:
        return "Not specified"

    field_lower = field_name.lower() if field_name else ""

    # Currency formatting (escape $ for markdown)
    if "revenue" in field_lower or "amount" in field_lower or "premium" in field_lower:
        try:
            num = float(value)
            if num >= 1_000_000:
                return f"\\${num / 1_000_000:.1f}M"
            elif num >= 1_000:
                return f"\\${num / 1_000:.0f}K"
            else:
                return f"\\${num:,.0f}"
        except (ValueError, TypeError):
            pass

    # Date formatting
    if "date" in field_lower:
        if isinstance(value, (date, datetime)):
            return value.strftime("%m/%d/%Y")
        elif isinstance(value, str) and len(value) >= 10:
            try:
                return datetime.fromisoformat(value[:10]).strftime("%m/%d/%Y")
            except ValueError:
                pass

    return str(value)
