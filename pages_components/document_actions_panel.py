"""
Document Actions Panel

Provides UI for generating quotes and binders for a submission.
Supports package generation with endorsements and other library documents.
"""

import streamlit as st
from typing import Optional

from core.document_generator import (
    generate_document,
    get_documents_for_quote,
    DOCUMENT_TYPES,
)
from core.bound_option import has_bound_option
from core.package_generator import generate_package
from core.document_library import get_entries_for_package, DOCUMENT_TYPES as LIB_DOC_TYPES


def render_document_actions(
    submission_id: str,
    quote_option_id: str,
    position: str = "primary"
):
    """
    Render document generation buttons for a quote option.

    Args:
        submission_id: UUID of the submission
        quote_option_id: UUID of the quote option
        position: Quote position ('primary' or 'excess')
    """
    if not quote_option_id:
        return

    st.markdown("#### Documents")

    # Determine document type based on position
    doc_type = "quote_excess" if position == "excess" else "quote_primary"
    doc_label = "Excess Quote" if position == "excess" else "Quote"

    # Get existing documents for this quote
    existing_docs = get_documents_for_quote(quote_option_id)

    # Check if this is a bound option
    is_bound = has_bound_option(submission_id)

    # Package options expander
    with st.expander("Package Options", expanded=False):
        package_type = st.radio(
            "Include in package:",
            options=["quote_only", "full_package"],
            format_func=lambda x: "Quote Only" if x == "quote_only" else "Full Package (Quote + Endorsements)",
            horizontal=True,
            key=f"pkg_type_{quote_option_id}"
        )

        selected_documents = []

        if package_type == "full_package":
            # Get available library documents
            all_docs = get_entries_for_package(position=position)

            if all_docs:
                # Group by type
                docs_by_type = {}
                for doc in all_docs:
                    dtype = doc.get("document_type", "other")
                    if dtype not in docs_by_type:
                        docs_by_type[dtype] = []
                    docs_by_type[dtype].append(doc)

                # Show checkboxes for each type
                for dtype, label in LIB_DOC_TYPES.items():
                    docs = docs_by_type.get(dtype, [])
                    if docs:
                        st.markdown(f"**{label}:**")
                        for doc in docs:
                            # Default select endorsements and claims sheets
                            default = dtype in ("endorsement", "claims_sheet")
                            if st.checkbox(
                                f"{doc['code']} - {doc['title']}",
                                value=default,
                                key=f"pkg_doc_{doc['id']}_{quote_option_id}"
                            ):
                                selected_documents.append(doc["id"])
            else:
                st.info("No library documents available. Add documents in the Document Library.")
                package_type = "quote_only"

    # Generate buttons
    col1, col2, col3 = st.columns([1, 1, 2])

    with col1:
        btn_label = f"Generate {doc_label}" if package_type == "quote_only" else f"Generate Package"
        if st.button(btn_label, key=f"gen_quote_{quote_option_id}", type="primary"):
            try:
                with st.spinner("Generating document..."):
                    if package_type == "full_package" and selected_documents:
                        result = generate_package(
                            submission_id=submission_id,
                            quote_option_id=quote_option_id,
                            doc_type=doc_type,
                            package_type=package_type,
                            selected_documents=selected_documents,
                            created_by="user"
                        )
                    else:
                        result = generate_document(
                            submission_id=submission_id,
                            quote_option_id=quote_option_id,
                            doc_type=doc_type,
                            created_by="user"
                        )
                st.success(f"Generated: {result['document_number']}")
                if result.get("manifest"):
                    st.caption(f"Included {len(result['manifest'])} documents")
                st.rerun()
            except Exception as e:
                st.error(f"Error generating document: {e}")

    with col2:
        # Only show binder button if the quote is bound
        if is_bound:
            if st.button("Generate Binder", key=f"gen_binder_{quote_option_id}"):
                try:
                    with st.spinner("Generating binder..."):
                        result = generate_document(
                            submission_id=submission_id,
                            quote_option_id=quote_option_id,
                            doc_type="binder",
                            created_by="user"
                        )
                    st.success(f"Generated: {result['document_number']}")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error generating binder: {e}")
        else:
            st.button("Generate Binder", key=f"gen_binder_{quote_option_id}", disabled=True,
                     help="Bind the quote first to generate a binder")

    # Show existing documents
    if existing_docs:
        st.markdown("**Generated Documents:**")
        for doc in existing_docs:
            _render_document_link(doc)


def _render_document_link(doc: dict):
    """Render a single document link with status badge."""
    doc_type = doc.get("type_label", doc.get("document_type", "Document"))
    doc_number = doc.get("document_number", "")
    pdf_url = doc.get("pdf_url", "")
    status = doc.get("status", "draft")
    created_at = doc.get("created_at")
    display_name = doc.get("display_name", "")

    # Format created_at
    if created_at and hasattr(created_at, 'strftime'):
        created_str = created_at.strftime("%m/%d/%y %H:%M")
    else:
        created_str = str(created_at)[:16] if created_at else ""

    # Status badge
    if status == "void":
        status_badge = "~~VOID~~"
    elif status == "issued":
        status_badge = "Issued"
    else:
        status_badge = ""

    # Build label with display name
    if display_name:
        label = f"{doc_type} ({display_name}): {doc_number}"
    else:
        label = f"{doc_type}: {doc_number}"

    # Render as markdown link
    col1, col2, col3 = st.columns([2.5, 1.5, 1])

    with col1:
        if pdf_url and status != "void":
            st.markdown(f"[{label}]({pdf_url})")
        else:
            st.markdown(label)

    with col2:
        st.caption(created_str)

    with col3:
        if status_badge:
            if status == "void":
                st.caption(f":red[{status_badge}]")
            else:
                st.caption(f":green[{status_badge}]")


def render_quick_quote_button(
    submission_id: str,
    quote_option_id: str,
    position: str = "primary",
    button_label: str = None
) -> Optional[str]:
    """
    Render a simple quote generation button.
    Returns the PDF URL if generated, None otherwise.

    Args:
        submission_id: UUID of the submission
        quote_option_id: UUID of the quote option
        position: Quote position ('primary' or 'excess')
        button_label: Custom button label

    Returns:
        PDF URL if document was generated, None otherwise
    """
    if not quote_option_id:
        return None

    doc_type = "quote_excess" if position == "excess" else "quote_primary"
    label = button_label or ("Generate Excess Quote" if position == "excess" else "Generate Quote")

    if st.button(label, key=f"quick_quote_{quote_option_id}"):
        try:
            with st.spinner("Generating..."):
                result = generate_document(
                    submission_id=submission_id,
                    quote_option_id=quote_option_id,
                    doc_type=doc_type,
                    created_by="user"
                )
            st.success(f"Generated: {result['document_number']}")
            return result.get("pdf_url")
        except Exception as e:
            st.error(f"Error: {e}")
            return None

    return None
