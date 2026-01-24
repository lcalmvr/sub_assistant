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
    AUTO_ATTACH_CONDITIONS,
    FILL_IN_VARIABLES,
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
    tab_keys = ["endorsement", "marketing", "claims_sheet", "specimen", "all"]

    for tab, doc_type, tab_key in zip(tabs, tab_types, tab_keys):
        with tab:
            _render_document_list(doc_type, tab_key)


def _render_document_list(document_type: str = None, tab_key: str = None):
    """Render the document list for a specific type."""
    type_label = DOCUMENT_TYPES.get(document_type, "All Documents")
    type_key = tab_key or document_type or "all"

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
        _render_document_form(editing.get("id"), editing.get("type"), type_key)
        st.divider()

    # Show preview if active
    previewing = st.session_state.get("previewing_library_doc")
    if previewing:
        _render_library_preview(previewing, type_key)
        st.divider()

    # Display entries
    if entries:
        st.markdown(f"**{len(entries)} documents**")

        for entry in entries:
            _render_document_row(entry, type_key)
    else:
        st.info("No documents found matching filters.")


def _render_document_row(entry: dict, tab_key: str = ""):
    """Render a single document library entry."""
    entry_id = entry["id"]
    code = entry["code"]
    title = entry["title"]
    doc_type = entry.get("document_type_label", entry.get("document_type", ""))
    category = entry.get("category", "")
    position = entry.get("position_label", "")
    status = entry.get("status", "active")
    version = entry.get("version", 1)
    has_auto_attach = bool(entry.get("auto_attach_rules"))
    has_fill_ins = bool(entry.get("fill_in_mappings"))

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
    if has_auto_attach:
        tags.append("auto-attach")
    if has_fill_ins:
        tags.append("fill-ins")
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
        if st.button("Preview", key=f"preview_lib_{tab_key}_{entry_id}"):
            st.session_state["previewing_library_doc"] = entry_id
            st.session_state.pop("editing_library_doc", None)
            st.rerun()

    with col5:
        if st.button("Edit", key=f"edit_lib_{tab_key}_{entry_id}"):
            st.session_state["editing_library_doc"] = {
                "id": entry_id,
                "type": entry.get("document_type")
            }
            st.session_state.pop("previewing_library_doc", None)
            st.rerun()


def _render_document_form(entry_id: str, doc_type: str = None, tab_key: str = ""):
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
            key=f"lib_form_code_{tab_key}"
        )

    with col2:
        if is_new and not doc_type:
            document_type = st.selectbox(
                "Document Type *",
                options=list(DOCUMENT_TYPES.keys()),
                format_func=lambda x: DOCUMENT_TYPES[x],
                key=f"lib_form_type_{tab_key}"
            )
        else:
            document_type = entry.get("document_type", doc_type)
            st.text_input(
                "Document Type",
                value=DOCUMENT_TYPES.get(document_type, document_type),
                disabled=True,
                key=f"lib_form_type_display_{tab_key}"
            )

    with col3:
        position = st.selectbox(
            "Position",
            options=list(POSITION_OPTIONS.keys()),
            format_func=lambda x: POSITION_OPTIONS[x],
            index=list(POSITION_OPTIONS.keys()).index(entry.get("position", "either")),
            key=f"lib_form_position_{tab_key}"
        )

    title = st.text_input(
        "Title *",
        value=entry.get("title", ""),
        placeholder="e.g., War & Terrorism Exclusion Endorsement",
        help="Formal title for printed documents",
        key=f"lib_form_title_{tab_key}"
    )

    col1, col2, col3 = st.columns(3)

    with col1:
        category = st.text_input(
            "Category",
            value=entry.get("category", ""),
            placeholder="e.g., exclusion, extension",
            help="Sub-category for filtering",
            key=f"lib_form_category_{tab_key}"
        )

    with col2:
        default_sort_order = st.number_input(
            "Sort Order",
            value=entry.get("default_sort_order", 100),
            min_value=0,
            max_value=999,
            help="Lower numbers appear first in packages",
            key=f"lib_form_sort_{tab_key}"
        )

    with col3:
        midterm_only = st.checkbox(
            "Midterm Only",
            value=entry.get("midterm_only", False),
            help="Only applicable mid-term (not at bind)",
            key=f"lib_form_midterm_{tab_key}"
        )

    # Content editor
    st.markdown("**Content**")
    st.caption("Use the editor below to format the document content.")

    content_html = render_rich_text_editor(
        initial_content=entry.get("content_html", ""),
        key=f"lib_form_content_{tab_key}",
        toolbar="default"
    )

    # Version notes (for updates)
    if not is_new:
        version_notes = st.text_input(
            "Version Notes",
            placeholder="Describe what changed in this version...",
            key=f"lib_form_version_notes_{tab_key}"
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
            key=f"lib_form_status_{tab_key}"
        )
    else:
        status = "draft"

    # Automation Settings (for endorsements)
    if document_type == "endorsement":
        st.divider()
        st.markdown("**Automation Settings**")
        st.caption("Configure when this endorsement auto-attaches and how placeholders are filled.")

        # Auto-attach rules
        auto_attach_rules, clear_auto_attach = _render_auto_attach_editor(
            entry.get("auto_attach_rules"),
            tab_key
        )

        # Fill-in mappings
        fill_in_mappings, clear_fill_in = _render_fill_in_editor(
            entry.get("fill_in_mappings"),
            tab_key
        )
    else:
        auto_attach_rules = None
        fill_in_mappings = None
        clear_auto_attach = False
        clear_fill_in = False

    st.divider()

    # Action buttons
    col1, col2, col3 = st.columns([1, 1, 4])

    with col1:
        if st.button("Save", type="primary", key=f"lib_form_save_{tab_key}"):
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
                            created_by="user",
                            auto_attach_rules=auto_attach_rules,
                            fill_in_mappings=fill_in_mappings
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
                            updated_by="user",
                            auto_attach_rules=auto_attach_rules,
                            fill_in_mappings=fill_in_mappings,
                            clear_auto_attach=clear_auto_attach,
                            clear_fill_in_mappings=clear_fill_in
                        )
                        st.success("Document updated!")

                    st.session_state.pop("editing_library_doc", None)
                    st.rerun()

                except Exception as ex:
                    st.error(f"Error: {ex}")

    with col2:
        if st.button("Cancel", key=f"lib_form_cancel_{tab_key}"):
            st.session_state.pop("editing_library_doc", None)
            st.rerun()


def _render_library_preview(entry_id: str, tab_key: str = ""):
    """Render a preview of how the document will appear."""
    entry = get_library_entry(entry_id)
    if not entry:
        st.error("Document not found")
        return

    st.markdown("### Document Preview")

    # Close button
    if st.button("Close Preview", key=f"close_lib_preview_{tab_key}"):
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

    # Show automation settings if present
    auto_attach = entry.get("auto_attach_rules")
    fill_ins = entry.get("fill_in_mappings")

    if auto_attach or fill_ins:
        st.divider()
        st.markdown("**Automation Settings**")

        if auto_attach:
            condition = auto_attach.get("condition", "")
            condition_label = AUTO_ATTACH_CONDITIONS.get(condition, condition)
            position_constraint = auto_attach.get("position", "any")
            value = auto_attach.get("value")
            rule_desc = f"Auto-attach: {condition_label}"
            if value is not None:
                rule_desc += f" (value: {value})"
            if position_constraint and position_constraint != "any":
                rule_desc += f" [{position_constraint} only]"
            st.caption(rule_desc)

        if fill_ins:
            variables = ", ".join(fill_ins.keys())
            st.caption(f"Fill-ins: {variables}")

    # Quick actions
    st.divider()
    col1, col2, col3 = st.columns([1, 1, 4])

    with col1:
        if entry.get("status") == "draft":
            if st.button("Activate", key=f"activate_lib_doc_{tab_key}"):
                activate_library_entry(entry_id, activated_by="user")
                st.success("Document activated!")
                st.rerun()

    with col2:
        if entry.get("status") != "archived":
            if st.button("Archive", key=f"archive_lib_doc_{tab_key}"):
                archive_library_entry(entry_id, archived_by="user")
                st.success("Document archived!")
                st.rerun()


def _render_auto_attach_editor(current_rules: dict = None, tab_key: str = "") -> tuple:
    """
    Render editor for auto-attach rules.

    Returns:
        Tuple of (rules_dict or None, clear_flag)
    """
    with st.expander("Auto-Attach Rules", expanded=bool(current_rules)):
        # Enable auto-attach
        enable_auto = st.checkbox(
            "Enable auto-attach",
            value=bool(current_rules),
            key=f"lib_auto_attach_enable_{tab_key}",
            help="Automatically add this endorsement when conditions are met"
        )

        if not enable_auto:
            return None, bool(current_rules)  # Clear if was set before

        # Condition type
        current_condition = current_rules.get("condition", "") if current_rules else ""
        condition = st.selectbox(
            "Condition",
            options=list(AUTO_ATTACH_CONDITIONS.keys()),
            format_func=lambda x: AUTO_ATTACH_CONDITIONS[x],
            index=list(AUTO_ATTACH_CONDITIONS.keys()).index(current_condition) if current_condition in AUTO_ATTACH_CONDITIONS else 0,
            key=f"lib_auto_attach_condition_{tab_key}"
        )

        rules = {"condition": condition}

        # Additional parameters based on condition
        if condition in ("follow_form",):
            current_value = current_rules.get("value", True) if current_rules else True
            value = st.checkbox(
                "Value (checked = true)",
                value=current_value,
                key=f"lib_auto_attach_value_{tab_key}"
            )
            rules["value"] = value

        elif condition in ("limit_above", "limit_below", "retention_above"):
            current_value = current_rules.get("value", 0) if current_rules else 0
            value = st.number_input(
                "Threshold ($)",
                value=current_value,
                min_value=0,
                step=100000,
                key=f"lib_auto_attach_threshold_{tab_key}"
            )
            rules["value"] = value

        # Position constraint
        current_position = current_rules.get("position") if current_rules else None
        position_opts = [None, "primary", "excess"]
        position = st.selectbox(
            "Position Constraint",
            options=position_opts,
            format_func=lambda x: "Any" if x is None else x.title(),
            index=position_opts.index(current_position) if current_position in position_opts else 0,
            key=f"lib_auto_attach_position_{tab_key}",
            help="Only attach for this position type"
        )
        if position:
            rules["position"] = position

        return rules, False


def _render_fill_in_editor(current_mappings: dict = None, tab_key: str = "") -> tuple:
    """
    Render editor for fill-in variable mappings.

    Returns:
        Tuple of (mappings_dict or None, clear_flag)
    """
    with st.expander("Fill-in Mappings", expanded=bool(current_mappings)):
        st.caption("Map {{placeholders}} in content to document data fields")

        # Enable fill-ins
        enable_fill = st.checkbox(
            "Enable fill-in processing",
            value=bool(current_mappings),
            key=f"lib_fill_in_enable_{tab_key}",
            help="Process {{variable}} placeholders in this endorsement"
        )

        if not enable_fill:
            return None, bool(current_mappings)  # Clear if was set before

        current_mappings = current_mappings or {}

        # Show available variables
        st.markdown("**Available Variables:**")

        mappings = {}
        for variable, description in FILL_IN_VARIABLES.items():
            # Check if currently mapped
            is_mapped = variable in current_mappings

            col1, col2 = st.columns([1, 2])
            with col1:
                use_var = st.checkbox(
                    variable,
                    value=is_mapped,
                    key=f"lib_fill_in_use_{variable}_{tab_key}"
                )
            with col2:
                st.caption(description)

            if use_var:
                # Get current mapping or default
                current_mapping = current_mappings.get(variable, variable.strip("{}"))
                mappings[variable] = current_mapping

        if mappings:
            return mappings, False
        else:
            return None, True  # Clear if nothing selected


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
