"""
Document History Panel

Displays all generated policy documents for a submission with
download links, status badges, and management actions.

Performance note: This panel can accept pre-loaded documents data
to avoid a database query. Pass the documents list from policy_tab_data.
"""

import streamlit as st
from datetime import datetime
from typing import Optional

from core.document_generator import (
    get_documents,
    void_document,
    DOCUMENT_TYPES,
)


def render_document_history_panel(
    submission_id: str,
    expanded: bool = True,
    preloaded_documents: Optional[list] = None
):
    """
    Render the document history panel for a submission.

    Shows all generated documents with:
    - Document type and number
    - Created date
    - Download link
    - Status badge
    - Void action (for non-void documents)

    Args:
        submission_id: UUID of the submission
        expanded: Whether the expander is initially expanded
        preloaded_documents: Optional pre-loaded documents list (avoids DB query)
    """
    if not submission_id:
        return

    with st.expander("Generated Documents", expanded=expanded):
        # Use pre-loaded data if available, otherwise fetch
        documents = preloaded_documents if preloaded_documents is not None else get_documents(submission_id)

        if not documents:
            st.caption("No documents generated yet.")
            return

        # Group by status for better organization
        active_docs = [d for d in documents if d["status"] != "void"]
        voided_docs = [d for d in documents if d["status"] == "void"]

        # Active Documents
        if active_docs:
            for doc in active_docs:
                _render_document_row(doc, submission_id)

        # Voided Documents (collapsed)
        if voided_docs:
            st.markdown("---")
            with st.expander(f"Voided Documents ({len(voided_docs)})", expanded=False):
                for doc in voided_docs:
                    _render_document_row(doc, submission_id, is_voided=True)


def _render_document_row(doc: dict, submission_id: str, is_voided: bool = False):
    """Render a single document row with actions."""
    doc_id = doc["id"]
    doc_type = doc.get("type_label", doc.get("document_type", "Document"))
    doc_number = doc.get("document_number", "")
    pdf_url = doc.get("pdf_url", "")
    status = doc.get("status", "draft")
    created_at = doc.get("created_at")
    display_name = doc.get("display_name", "")

    # Format created_at
    if created_at and hasattr(created_at, 'strftime'):
        created_str = created_at.strftime("%b %d, %Y %I:%M %p")
    elif created_at:
        created_str = str(created_at)[:16]
    else:
        created_str = ""

    # Build label with display name
    if display_name:
        label = f"{doc_type} ({display_name}): {doc_number}"
    else:
        label = f"{doc_type}: {doc_number}"

    # Layout: Type | Number | Date | Status | Actions
    col1, col2, col3, col4 = st.columns([3, 1.5, 1.5, 1])

    with col1:
        if pdf_url and not is_voided:
            st.markdown(f"[{label}]({pdf_url})")
        else:
            if is_voided:
                st.markdown(f"~~{label}~~")
            else:
                st.markdown(label)

    with col2:
        st.caption(created_str)

    with col3:
        _render_status_badge(status)

    with col4:
        if not is_voided and status != "void":
            if st.button("Void", key=f"void_{doc_id}", type="secondary", use_container_width=True):
                st.session_state[f"confirm_void_{doc_id}"] = True

            # Confirmation dialog
            if st.session_state.get(f"confirm_void_{doc_id}"):
                st.warning("Void this document?")
                c1, c2 = st.columns(2)
                with c1:
                    if st.button("Yes", key=f"confirm_yes_{doc_id}"):
                        void_document(doc_id, "User voided", "user")
                        st.session_state.pop(f"confirm_void_{doc_id}", None)
                        st.rerun()
                with c2:
                    if st.button("No", key=f"confirm_no_{doc_id}"):
                        st.session_state.pop(f"confirm_void_{doc_id}", None)
                        st.rerun()


def _render_status_badge(status: str):
    """Render a colored status badge."""
    if status == "void":
        st.markdown(":red[VOID]")
    elif status == "issued":
        st.markdown(":green[Issued]")
    elif status == "superseded":
        st.markdown(":orange[Superseded]")
    else:
        st.markdown(":blue[Draft]")


def render_document_history_compact(submission_id: str):
    """
    Render a compact document history for inline display.

    Shows most recent documents with minimal UI.

    Args:
        submission_id: UUID of the submission
    """
    if not submission_id:
        return

    documents = get_documents(submission_id)

    if not documents:
        st.caption("No documents generated.")
        return

    # Show only active documents (non-void)
    active_docs = [d for d in documents if d["status"] != "void"][:5]  # Limit to 5

    for doc in active_docs:
        doc_type = doc.get("type_label", doc.get("document_type", ""))
        doc_number = doc.get("document_number", "")
        pdf_url = doc.get("pdf_url", "")
        status = doc.get("status", "draft")

        col1, col2 = st.columns([4, 1])

        with col1:
            if pdf_url:
                st.markdown(f"[{doc_type}: {doc_number}]({pdf_url})")
            else:
                st.text(f"{doc_type}: {doc_number}")

        with col2:
            _render_status_badge(status)


def get_latest_document(submission_id: str, doc_type: str = None) -> dict:
    """
    Get the most recent non-void document for a submission.

    Args:
        submission_id: UUID of the submission
        doc_type: Optional filter by document type

    Returns:
        Document dict or None if not found
    """
    documents = get_documents(submission_id)

    for doc in documents:
        if doc["status"] == "void":
            continue
        if doc_type and doc["document_type"] != doc_type:
            continue
        return doc

    return None
