"""
Endorsement Bank Panel

Management UI for the endorsement catalog/bank.
Allows viewing, creating, and editing endorsement templates.
"""
import streamlit as st
from typing import Optional

from core.endorsement_catalog import (
    POSITION_OPTIONS,
    get_catalog_entries,
    get_catalog_entry,
    create_catalog_entry,
    update_catalog_entry,
    deactivate_catalog_entry,
)
from core.endorsement_management import ENDORSEMENT_TYPES


def render_endorsement_bank_panel():
    """Render the endorsement bank management panel."""
    st.subheader("Endorsement Bank")
    st.caption("Manage reusable endorsement templates with formal titles for policy documents.")

    # Search bar
    search_query = st.text_input(
        "Search",
        placeholder="Search by code, title, or description...",
        key="bank_search"
    )

    # Filters
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        position_filter = st.selectbox(
            "Position",
            options=[None, "primary", "excess", "either"],
            format_func=lambda x: "All" if x is None else POSITION_OPTIONS.get(x, x),
            key="bank_position_filter"
        )

    with col2:
        type_options = [None] + list(ENDORSEMENT_TYPES.keys())
        type_filter = st.selectbox(
            "Type",
            options=type_options,
            format_func=lambda x: "All" if x is None else ENDORSEMENT_TYPES.get(x, {}).get("label", x),
            key="bank_type_filter"
        )

    with col3:
        midterm_filter = st.selectbox(
            "Midterm Only",
            options=[None, True, False],
            format_func=lambda x: "All" if x is None else ("Yes" if x else "No"),
            key="bank_midterm_filter"
        )

    with col4:
        show_inactive = st.checkbox("Show inactive", key="bank_show_inactive")

    # Get entries
    entries = get_catalog_entries(
        position=position_filter,
        endorsement_type=type_filter,
        midterm_only=midterm_filter,
        active_only=not show_inactive,
        search=search_query if search_query else None
    )

    st.divider()

    # Add new button
    if st.button("+ Add Endorsement", key="add_endorsement_btn"):
        st.session_state["editing_endorsement"] = "new"
        st.session_state.pop("previewing_endorsement", None)

    # Show add/edit form if active
    if st.session_state.get("editing_endorsement"):
        _render_endorsement_form(st.session_state["editing_endorsement"])
        st.divider()

    # Show preview if active
    if st.session_state.get("previewing_endorsement"):
        _render_endorsement_preview(st.session_state["previewing_endorsement"])
        st.divider()

    # Display entries
    if entries:
        st.markdown(f"**{len(entries)} endorsements**")

        for entry in entries:
            _render_endorsement_row(entry)
    else:
        st.info("No endorsements found matching filters.")


def _render_endorsement_row(entry: dict):
    """Render a single endorsement catalog entry."""
    entry_id = entry["id"]
    code = entry["code"]
    title = entry["title"]
    description = entry.get("description", "")
    position = entry.get("position_label", entry.get("position", ""))
    midterm_only = entry.get("midterm_only", False)
    active = entry.get("active", True)
    etype = entry.get("endorsement_type")

    # Build tags
    tags = []
    if position:
        tags.append(position)
    if midterm_only:
        tags.append("Mid-term Only")
    if etype:
        type_label = ENDORSEMENT_TYPES.get(etype, {}).get("label", etype)
        tags.append(type_label)
    if not active:
        tags.append("INACTIVE")

    tags_str = " | ".join(tags) if tags else ""

    col1, col2, col3, col4 = st.columns([1, 4, 0.7, 0.7])

    with col1:
        st.markdown(f"**`{code}`**")

    with col2:
        st.markdown(f"**{title}**")
        if description:
            st.caption(description)
        if tags_str:
            st.caption(tags_str)

    with col3:
        if st.button("Preview", key=f"preview_{entry_id}"):
            st.session_state["previewing_endorsement"] = entry_id
            st.session_state.pop("editing_endorsement", None)
            st.rerun()

    with col4:
        if st.button("Edit", key=f"edit_{entry_id}"):
            st.session_state["editing_endorsement"] = entry_id
            st.session_state.pop("previewing_endorsement", None)
            st.rerun()


def _render_endorsement_form(entry_id: str):
    """Render form for adding or editing an endorsement."""
    is_new = entry_id == "new"

    if is_new:
        st.markdown("**Add New Endorsement**")
        entry = {}
    else:
        st.markdown("**Edit Endorsement**")
        entry = get_catalog_entry(entry_id) or {}

    with st.form(key="endorsement_form"):
        col1, col2 = st.columns(2)

        with col1:
            code = st.text_input(
                "Code",
                value=entry.get("code", ""),
                placeholder="e.g., EXT-001",
                help="Unique identifier for this endorsement"
            )

        with col2:
            position = st.selectbox(
                "Position Applicability",
                options=list(POSITION_OPTIONS.keys()),
                format_func=lambda x: POSITION_OPTIONS[x],
                index=list(POSITION_OPTIONS.keys()).index(entry.get("position", "either"))
            )

        title = st.text_input(
            "Formal Title",
            value=entry.get("title", ""),
            placeholder="e.g., Endorsement No. 1 - Policy Extension",
            help="Title that appears on printed documents"
        )

        description = st.text_area(
            "Description",
            value=entry.get("description", ""),
            placeholder="Longer description of the endorsement..."
        )

        col1, col2 = st.columns(2)

        with col1:
            type_options = [None] + list(ENDORSEMENT_TYPES.keys())
            current_type = entry.get("endorsement_type")
            type_index = type_options.index(current_type) if current_type in type_options else 0

            endorsement_type = st.selectbox(
                "Associated Type",
                options=type_options,
                format_func=lambda x: "None (General)" if x is None else ENDORSEMENT_TYPES.get(x, {}).get("label", x),
                index=type_index,
                help="Transaction type this endorsement is associated with"
            )

        with col2:
            midterm_only = st.checkbox(
                "Mid-term Only",
                value=entry.get("midterm_only", False),
                help="Check if this endorsement can only be used mid-term (not at bind)"
            )

        if not is_new:
            active = st.checkbox(
                "Active",
                value=entry.get("active", True),
                help="Inactive endorsements won't appear in selection lists"
            )
        else:
            active = True

        col1, col2, col3 = st.columns([1, 1, 2])

        with col1:
            submitted = st.form_submit_button("Save", type="primary")

        with col2:
            cancelled = st.form_submit_button("Cancel")

        if cancelled:
            st.session_state.pop("editing_endorsement", None)
            st.rerun()

        if submitted:
            if not code or not title:
                st.error("Code and Title are required")
            else:
                try:
                    if is_new:
                        create_catalog_entry(
                            code=code,
                            title=title,
                            description=description if description else None,
                            endorsement_type=endorsement_type,
                            position=position,
                            midterm_only=midterm_only,
                            created_by="user"
                        )
                        st.success("Endorsement created")
                    else:
                        update_catalog_entry(
                            entry_id=entry_id,
                            code=code,
                            title=title,
                            description=description if description else None,
                            endorsement_type=endorsement_type,
                            position=position,
                            midterm_only=midterm_only,
                            active=active
                        )
                        st.success("Endorsement updated")

                    st.session_state.pop("editing_endorsement", None)
                    st.rerun()

                except Exception as ex:
                    st.error(f"Error: {ex}")


def _render_endorsement_preview(entry_id: str):
    """Render a preview of how the endorsement will appear on documents."""
    entry = get_catalog_entry(entry_id)
    if not entry:
        st.error("Endorsement not found")
        return

    st.markdown("### Endorsement Preview")

    # Close button
    if st.button("Close Preview", key="close_preview"):
        st.session_state.pop("previewing_endorsement", None)
        st.rerun()

    # Preview container styled like a document
    with st.container(border=True):
        # Header
        st.markdown(
            f"""
            <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="margin: 0;">{entry['title']}</h2>
                <p style="margin: 5px 0 0 0; color: #666;">Code: {entry['code']}</p>
            </div>
            """,
            unsafe_allow_html=True
        )

        # Metadata section
        col1, col2, col3 = st.columns(3)

        with col1:
            position_label = POSITION_OPTIONS.get(entry.get("position"), entry.get("position", ""))
            st.markdown(f"**Position:** {position_label}")

        with col2:
            etype = entry.get("endorsement_type")
            if etype:
                type_label = ENDORSEMENT_TYPES.get(etype, {}).get("label", etype)
            else:
                type_label = "General"
            st.markdown(f"**Type:** {type_label}")

        with col3:
            midterm = "Yes" if entry.get("midterm_only") else "No"
            st.markdown(f"**Midterm Only:** {midterm}")

        st.divider()

        # Description
        if entry.get("description"):
            st.markdown("**Description:**")
            st.markdown(entry["description"])
        else:
            st.caption("No description provided.")

        st.divider()

        # Sample document appearance
        st.markdown("**Sample Document Appearance:**")
        st.markdown(
            f"""
            <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 20px; font-family: 'Times New Roman', serif;">
                <p style="text-align: center; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                    {entry['title']}
                </p>
                <p style="text-align: center; font-size: 12px; color: #666;">
                    Effective Date: [EFFECTIVE DATE]
                </p>
                <hr style="border: none; border-top: 1px solid #999; margin: 15px 0;">
                <p style="font-size: 12px; line-height: 1.6;">
                    This endorsement modifies the policy to which it is attached and is effective
                    on the date indicated above.
                </p>
                <p style="font-size: 12px; line-height: 1.6;">
                    {entry.get('description', 'All other terms and conditions remain unchanged.')}
                </p>
                <div style="margin-top: 30px; font-size: 11px;">
                    <p><strong>Policy Number:</strong> [POLICY NUMBER]</p>
                    <p><strong>Named Insured:</strong> [NAMED INSURED]</p>
                </div>
            </div>
            """,
            unsafe_allow_html=True
        )

        # Status
        st.divider()
        status = "Active" if entry.get("active", True) else "Inactive"
        status_color = "green" if entry.get("active", True) else "red"
        st.markdown(f"**Status:** :{status_color}[{status}]")

        if entry.get("created_at"):
            created = entry["created_at"]
            if hasattr(created, 'strftime'):
                created_str = created.strftime("%B %d, %Y")
            else:
                created_str = str(created)
            st.caption(f"Created: {created_str}")


def render_endorsement_selector(
    endorsement_type: str,
    position: str = None,
    key_suffix: str = ""
) -> Optional[dict]:
    """
    Render a dropdown to select an endorsement from the bank.

    Args:
        endorsement_type: The transaction type to filter by
        position: Policy position (primary, excess)
        key_suffix: Unique suffix for widget keys

    Returns:
        Selected catalog entry dict, or None
    """
    from core.endorsement_catalog import get_entries_for_type

    entries = get_entries_for_type(endorsement_type, position)

    if not entries:
        return None

    # Add "Custom" option
    options = [{"id": None, "code": "", "title": "Custom (no template)"}] + entries

    selected = st.selectbox(
        "Template (optional)",
        options=options,
        format_func=lambda x: f"{x['code']} - {x['title']}" if x.get('code') else x['title'],
        key=f"endorsement_template_{key_suffix}"
    )

    return selected if selected.get("id") else None
