"""
Document Library Panel

Management UI for the document library.
Allows viewing, creating, and editing reusable document content
(endorsements, marketing materials, claims sheets, specimen forms).
"""
import streamlit as st
from typing import Optional

from core.document_library import (
    DOCUMENT_TYPES,
    POSITION_OPTIONS,
    STATUS_OPTIONS,
    get_library_entries,
    get_library_entry,
    create_library_entry,
    update_library_entry,
    archive_library_entry,
    activate_library_entry,
    get_categories,
)
from pages_components.rich_text_editor import (
    render_rich_text_editor,
    render_document_preview,
)


def render_document_library_panel():
    """Render the document library management panel."""
    st.subheader("Document Library")
    st.caption("Manage reusable document content for quotes and policy packages.")

    # Tabs for document types
    tabs = st.tabs(["Endorsements", "Marketing", "Claims Sheets", "Specimen Forms", "All"])
    tab_types = ["endorsement", "marketing", "claims_sheet", "specimen", None]

    for tab, doc_type in zip(tabs, tab_types):
        with tab:
            _render_document_list(doc_type)


def _render_document_list(document_type: str = None):
    """Render the document list for a specific type."""
    type_label = DOCUMENT_TYPES.get(document_type, "All Documents")
    type_key = document_type or "all"

    # Search bar
    search_query = st.text_input(
        "Search",
        placeholder="Search by code, title, or content...",
        key=f"lib_search_{type_key}"
    )

    # Filters
    col1, col2, col3 = st.columns(3)

    with col1:
        status_filter = st.selectbox(
            "Status",
            options=["active", "draft", "archived", None],
            format_func=lambda x: "All" if x is None else STATUS_OPTIONS.get(x, x),
            key=f"lib_status_{type_key}"
        )

    with col2:
        position_filter = st.selectbox(
            "Position",
            options=[None, "primary", "excess", "either"],
            format_func=lambda x: "All" if x is None else POSITION_OPTIONS.get(x, x),
            key=f"lib_position_{type_key}"
        )

    with col3:
        # Get categories for this type
        categories = get_categories(document_type)
        category_options = [None] + categories
        category_filter = st.selectbox(
            "Category",
            options=category_options,
            format_func=lambda x: "All" if x is None else x,
            key=f"lib_category_{type_key}"
        )

    # Get entries
    entries = get_library_entries(
        document_type=document_type,
        category=category_filter,
        position=position_filter,
        status=status_filter,
        search=search_query if search_query else None,
        include_archived=(status_filter == "archived")
    )

    st.divider()

    # Add new button
    btn_label = f"+ Add {type_label}" if document_type else "+ Add Document"
    if st.button(btn_label, key=f"add_doc_{type_key}"):
        st.session_state["editing_library_doc"] = {"id": "new", "type": document_type}
        st.session_state.pop("previewing_library_doc", None)

    # Show add/edit form if active
    editing = st.session_state.get("editing_library_doc")
    if editing and (editing.get("type") == document_type or document_type is None):
        _render_document_form(editing.get("id"), editing.get("type"))
        st.divider()

    # Show preview if active
    previewing = st.session_state.get("previewing_library_doc")
    if previewing:
        _render_library_preview(previewing)
        st.divider()

    # Display entries
    if entries:
        st.markdown(f"**{len(entries)} documents**")

        for entry in entries:
            _render_document_row(entry)
    else:
        st.info("No documents found matching filters.")


def _render_document_row(entry: dict):
    """Render a single document library entry."""
    entry_id = entry["id"]
    code = entry["code"]
    title = entry["title"]
    doc_type = entry.get("document_type_label", entry.get("document_type", ""))
    category = entry.get("category", "")
    position = entry.get("position_label", "")
    status = entry.get("status", "active")
    version = entry.get("version", 1)

    # Build status badge
    status_colors = {
        "active": "green",
        "draft": "orange",
        "archived": "red",
    }
    status_color = status_colors.get(status, "gray")

    # Build tags
    tags = []
    if position:
        tags.append(position)
    if category:
        tags.append(category)
    tags.append(f"v{version}")

    tags_str = " | ".join(tags)

    col1, col2, col3, col4, col5 = st.columns([1.2, 3.5, 1, 0.7, 0.7])

    with col1:
        st.markdown(f"**`{code}`**")
        st.caption(doc_type)

    with col2:
        st.markdown(f"**{title}**")
        if tags_str:
            st.caption(tags_str)

    with col3:
        st.markdown(f":{status_color}[{status.upper()}]")

    with col4:
        if st.button("Preview", key=f"preview_lib_{entry_id}"):
            st.session_state["previewing_library_doc"] = entry_id
            st.session_state.pop("editing_library_doc", None)
            st.rerun()

    with col5:
        if st.button("Edit", key=f"edit_lib_{entry_id}"):
            st.session_state["editing_library_doc"] = {
                "id": entry_id,
                "type": entry.get("document_type")
            }
            st.session_state.pop("previewing_library_doc", None)
            st.rerun()


def _render_document_form(entry_id: str, doc_type: str = None):
    """Render form for adding or editing a document."""
    is_new = entry_id == "new"

    if is_new:
        st.markdown("### Add New Document")
        entry = {"document_type": doc_type} if doc_type else {}
    else:
        st.markdown("### Edit Document")
        entry = get_library_entry(entry_id) or {}

    # Form fields
    col1, col2, col3 = st.columns(3)

    with col1:
        code = st.text_input(
            "Code *",
            value=entry.get("code", ""),
            placeholder="e.g., END-WAR-001",
            help="Unique identifier for this document",
            key="lib_form_code"
        )

    with col2:
        if is_new and not doc_type:
            document_type = st.selectbox(
                "Document Type *",
                options=list(DOCUMENT_TYPES.keys()),
                format_func=lambda x: DOCUMENT_TYPES[x],
                key="lib_form_type"
            )
        else:
            document_type = entry.get("document_type", doc_type)
            st.text_input(
                "Document Type",
                value=DOCUMENT_TYPES.get(document_type, document_type),
                disabled=True,
                key="lib_form_type_display"
            )

    with col3:
        position = st.selectbox(
            "Position",
            options=list(POSITION_OPTIONS.keys()),
            format_func=lambda x: POSITION_OPTIONS[x],
            index=list(POSITION_OPTIONS.keys()).index(entry.get("position", "either")),
            key="lib_form_position"
        )

    title = st.text_input(
        "Title *",
        value=entry.get("title", ""),
        placeholder="e.g., War & Terrorism Exclusion Endorsement",
        help="Formal title for printed documents",
        key="lib_form_title"
    )

    col1, col2, col3 = st.columns(3)

    with col1:
        category = st.text_input(
            "Category",
            value=entry.get("category", ""),
            placeholder="e.g., exclusion, extension",
            help="Sub-category for filtering",
            key="lib_form_category"
        )

    with col2:
        default_sort_order = st.number_input(
            "Sort Order",
            value=entry.get("default_sort_order", 100),
            min_value=0,
            max_value=999,
            help="Lower numbers appear first in packages",
            key="lib_form_sort"
        )

    with col3:
        midterm_only = st.checkbox(
            "Midterm Only",
            value=entry.get("midterm_only", False),
            help="Only applicable mid-term (not at bind)",
            key="lib_form_midterm"
        )

    # Content editor
    st.markdown("**Content**")
    st.caption("Use the editor below to format the document content.")

    content_html = render_rich_text_editor(
        initial_content=entry.get("content_html", ""),
        key="lib_form_content",
        toolbar="default"
    )

    # Version notes (for updates)
    if not is_new:
        version_notes = st.text_input(
            "Version Notes",
            placeholder="Describe what changed in this version...",
            key="lib_form_version_notes"
        )
        current_version = entry.get("version", 1)
        st.caption(f"Current version: {current_version}")
    else:
        version_notes = None

    # Status (for existing entries)
    if not is_new:
        status = st.selectbox(
            "Status",
            options=list(STATUS_OPTIONS.keys()),
            format_func=lambda x: STATUS_OPTIONS[x],
            index=list(STATUS_OPTIONS.keys()).index(entry.get("status", "draft")),
            key="lib_form_status"
        )
    else:
        status = "draft"

    st.divider()

    # Action buttons
    col1, col2, col3 = st.columns([1, 1, 4])

    with col1:
        if st.button("Save", type="primary", key="lib_form_save"):
            if not code or not title:
                st.error("Code and Title are required")
            else:
                try:
                    if is_new:
                        create_library_entry(
                            code=code,
                            title=title,
                            document_type=document_type,
                            content_html=content_html if content_html else None,
                            category=category if category else None,
                            position=position,
                            midterm_only=midterm_only,
                            default_sort_order=default_sort_order,
                            status=status,
                            created_by="user"
                        )
                        st.success("Document created!")
                    else:
                        update_library_entry(
                            entry_id=entry_id,
                            code=code,
                            title=title,
                            content_html=content_html if content_html else None,
                            category=category if category else None,
                            position=position,
                            midterm_only=midterm_only,
                            default_sort_order=default_sort_order,
                            status=status,
                            version_notes=version_notes if version_notes else None,
                            updated_by="user"
                        )
                        st.success("Document updated!")

                    st.session_state.pop("editing_library_doc", None)
                    st.rerun()

                except Exception as ex:
                    st.error(f"Error: {ex}")

    with col2:
        if st.button("Cancel", key="lib_form_cancel"):
            st.session_state.pop("editing_library_doc", None)
            st.rerun()


def _render_library_preview(entry_id: str):
    """Render a preview of how the document will appear."""
    entry = get_library_entry(entry_id)
    if not entry:
        st.error("Document not found")
        return

    st.markdown("### Document Preview")

    # Close button
    if st.button("Close Preview", key="close_lib_preview"):
        st.session_state.pop("previewing_library_doc", None)
        st.rerun()

    # Metadata
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.markdown(f"**Code:** `{entry['code']}`")

    with col2:
        st.markdown(f"**Type:** {entry.get('document_type_label', '')}")

    with col3:
        st.markdown(f"**Version:** {entry.get('version', 1)}")

    with col4:
        status = entry.get("status", "draft")
        status_colors = {"active": "green", "draft": "orange", "archived": "red"}
        st.markdown(f"**Status:** :{status_colors.get(status, 'gray')}[{status.upper()}]")

    st.divider()

    # Document preview
    render_document_preview(
        title=entry.get("title", ""),
        code=entry.get("code", ""),
        content_html=entry.get("content_html", ""),
        document_type=entry.get("document_type", "")
    )

    # Additional metadata
    st.divider()

    col1, col2 = st.columns(2)

    with col1:
        if entry.get("category"):
            st.caption(f"Category: {entry['category']}")
        if entry.get("position"):
            st.caption(f"Position: {entry.get('position_label', entry['position'])}")

    with col2:
        if entry.get("created_at"):
            created = entry["created_at"]
            if hasattr(created, 'strftime'):
                st.caption(f"Created: {created.strftime('%B %d, %Y')}")
        if entry.get("updated_at"):
            updated = entry["updated_at"]
            if hasattr(updated, 'strftime'):
                st.caption(f"Updated: {updated.strftime('%B %d, %Y')}")

    # Quick actions
    st.divider()
    col1, col2, col3 = st.columns([1, 1, 4])

    with col1:
        if entry.get("status") == "draft":
            if st.button("Activate", key="activate_lib_doc"):
                activate_library_entry(entry_id, activated_by="user")
                st.success("Document activated!")
                st.rerun()

    with col2:
        if entry.get("status") != "archived":
            if st.button("Archive", key="archive_lib_doc"):
                archive_library_entry(entry_id, archived_by="user")
                st.success("Document archived!")
                st.rerun()


def render_document_selector(
    document_type: str,
    position: str = None,
    key_suffix: str = "",
    multi_select: bool = False
):
    """
    Render a selector for choosing documents from the library.

    Args:
        document_type: Type of documents to show
        position: Policy position for filtering
        key_suffix: Unique suffix for widget keys
        multi_select: Allow multiple selections

    Returns:
        Selected entry(s) - dict or list of dicts
    """
    from core.document_library import get_entries_for_package

    entries = get_entries_for_package(
        position=position,
        document_types=[document_type] if document_type else None
    )

    if not entries:
        st.caption(f"No {DOCUMENT_TYPES.get(document_type, 'documents')} available")
        return [] if multi_select else None

    if multi_select:
        selected = st.multiselect(
            f"Select {DOCUMENT_TYPES.get(document_type, 'Documents')}",
            options=entries,
            format_func=lambda x: f"{x['code']} - {x['title']}",
            key=f"doc_select_{document_type}_{key_suffix}"
        )
        return selected
    else:
        # Add "None" option for single select
        options = [None] + entries
        selected = st.selectbox(
            f"Select {DOCUMENT_TYPES.get(document_type, 'Document')}",
            options=options,
            format_func=lambda x: "None" if x is None else f"{x['code']} - {x['title']}",
            key=f"doc_select_{document_type}_{key_suffix}"
        )
        return selected
