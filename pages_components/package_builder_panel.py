"""
Package Builder Panel

UI for selecting documents to include in a quote package.
Allows users to choose between "Quote Only" and "Full Package" options.
"""

import streamlit as st
from typing import Optional

from core.document_library import (
    DOCUMENT_TYPES,
    get_entries_for_package,
    get_endorsements_for_package,
)
from core.package_generator import generate_package


def render_package_builder(
    submission_id: str,
    quote_option_id: str,
    doc_type: str,
    position: str = "primary",
    key_suffix: str = ""
) -> Optional[dict]:
    """
    Render the package builder UI.

    Args:
        submission_id: UUID of the submission
        quote_option_id: UUID of the quote option
        doc_type: Base document type ('quote_primary', 'quote_excess', 'binder')
        position: Policy position for filtering documents
        key_suffix: Unique suffix for widget keys

    Returns:
        Generated document info if successful, None otherwise
    """
    st.markdown("### Generate Document Package")

    # Package type selector
    package_type = st.radio(
        "Package Type",
        options=["quote_only", "full_package"],
        format_func=lambda x: "Quote Only" if x == "quote_only" else "Full Package",
        horizontal=True,
        key=f"pkg_type_{key_suffix}"
    )

    selected_documents = []

    if package_type == "full_package":
        st.markdown("**Select documents to include:**")

        # Get available documents grouped by type
        all_docs = get_entries_for_package(position=position)

        # Group by document type
        docs_by_type = {}
        for doc in all_docs:
            dtype = doc.get("document_type", "other")
            if dtype not in docs_by_type:
                docs_by_type[dtype] = []
            docs_by_type[dtype].append(doc)

        # Render each document type section
        for dtype, label in DOCUMENT_TYPES.items():
            docs = docs_by_type.get(dtype, [])
            if docs:
                with st.expander(f"{label} ({len(docs)})", expanded=(dtype == "endorsement")):
                    for doc in docs:
                        col1, col2 = st.columns([0.1, 0.9])
                        with col1:
                            selected = st.checkbox(
                                "",
                                key=f"pkg_doc_{doc['id']}_{key_suffix}",
                                value=_get_default_selection(doc, doc_type)
                            )
                        with col2:
                            st.markdown(f"**{doc['code']}** - {doc['title']}")
                            if doc.get("category"):
                                st.caption(doc["category"])

                        if selected:
                            selected_documents.append(doc["id"])

        if not all_docs:
            st.info("No documents available in the library. Add documents in the Document Library admin page.")

    # Generate button
    st.divider()

    col1, col2 = st.columns([1, 3])

    with col1:
        generate_btn = st.button(
            "Generate Package" if package_type == "full_package" else "Generate Quote",
            type="primary",
            key=f"gen_pkg_{key_suffix}"
        )

    if generate_btn:
        with st.spinner("Generating document..."):
            try:
                result = generate_package(
                    submission_id=submission_id,
                    quote_option_id=quote_option_id,
                    doc_type=doc_type,
                    package_type=package_type,
                    selected_documents=selected_documents if package_type == "full_package" else None,
                    created_by="user"
                )

                st.success("Document generated successfully!")

                # Show download link
                st.markdown(f"[Download PDF]({result['pdf_url']})")

                # Show manifest summary
                if result.get("manifest"):
                    st.caption(f"Included {len(result['manifest'])} library documents")

                return result

            except Exception as ex:
                st.error(f"Error generating document: {ex}")
                return None

    return None


def render_package_selector(
    position: str = "primary",
    key_suffix: str = "",
    show_preview: bool = True
) -> list[str]:
    """
    Render just the document selection UI without the generate button.
    Returns list of selected document IDs.

    Args:
        position: Policy position for filtering
        key_suffix: Unique suffix for widget keys
        show_preview: Show document count preview

    Returns:
        List of selected document IDs
    """
    selected_documents = []

    # Get available documents
    all_docs = get_entries_for_package(position=position)

    if not all_docs:
        st.caption("No documents available in the library.")
        return []

    # Group by document type
    docs_by_type = {}
    for doc in all_docs:
        dtype = doc.get("document_type", "other")
        if dtype not in docs_by_type:
            docs_by_type[dtype] = []
        docs_by_type[dtype].append(doc)

    # Render selection
    for dtype, label in DOCUMENT_TYPES.items():
        docs = docs_by_type.get(dtype, [])
        if docs:
            st.markdown(f"**{label}**")

            for doc in docs:
                selected = st.checkbox(
                    f"{doc['code']} - {doc['title']}",
                    key=f"sel_{doc['id']}_{key_suffix}",
                    value=False
                )
                if selected:
                    selected_documents.append(doc["id"])

            st.markdown("")  # Spacing

    if show_preview and selected_documents:
        st.caption(f"Selected: {len(selected_documents)} documents")

    return selected_documents


def render_endorsement_selector(
    position: str = "primary",
    key_suffix: str = "",
    default_codes: list[str] = None
) -> list[str]:
    """
    Render endorsement selection with optional defaults.

    Args:
        position: Policy position for filtering
        key_suffix: Unique suffix for widget keys
        default_codes: List of endorsement codes to select by default

    Returns:
        List of selected endorsement IDs
    """
    default_codes = default_codes or []
    selected = []

    endorsements = get_endorsements_for_package(position=position)

    if not endorsements:
        st.caption("No endorsements available.")
        return []

    for end in endorsements:
        # Check if this should be selected by default
        is_default = end.get("code") in default_codes

        checked = st.checkbox(
            f"{end['code']} - {end['title']}",
            key=f"end_{end['id']}_{key_suffix}",
            value=is_default
        )

        if checked:
            selected.append(end["id"])

    return selected


def _get_default_selection(doc: dict, doc_type: str) -> bool:
    """
    Determine if a document should be selected by default.

    Args:
        doc: Document entry
        doc_type: The quote document type being generated

    Returns:
        True if should be selected by default
    """
    code = doc.get("code", "").upper()
    dtype = doc.get("document_type", "")

    # Always include certain endorsements by default
    default_endorsements = ["END-OFAC", "END-WAR"]

    if dtype == "endorsement":
        for default in default_endorsements:
            if code.startswith(default):
                return True

    # Always include claims sheet
    if dtype == "claims_sheet":
        return True

    return False


def render_quick_package_builder(
    submission_id: str,
    quote_option_id: str,
    doc_type: str,
    position: str = "primary"
) -> Optional[dict]:
    """
    Render a simplified package builder inline with document generation.

    Args:
        submission_id: UUID of the submission
        quote_option_id: UUID of the quote option
        doc_type: Base document type
        position: Policy position

    Returns:
        Generated document info if successful
    """
    with st.expander("Package Options", expanded=False):
        include_endorsements = st.checkbox(
            "Include endorsements",
            value=True,
            key=f"qpb_end_{quote_option_id}"
        )

        include_claims = st.checkbox(
            "Include claims reporting sheet",
            value=True,
            key=f"qpb_claims_{quote_option_id}"
        )

        include_marketing = st.checkbox(
            "Include marketing materials",
            value=False,
            key=f"qpb_mkt_{quote_option_id}"
        )

        # Gather selected types
        doc_types = []
        if include_endorsements:
            doc_types.append("endorsement")
        if include_claims:
            doc_types.append("claims_sheet")
        if include_marketing:
            doc_types.append("marketing")

        # Get matching documents
        if doc_types:
            all_docs = get_entries_for_package(position=position, document_types=doc_types)
            selected_ids = [d["id"] for d in all_docs]
            package_type = "full_package" if selected_ids else "quote_only"
        else:
            selected_ids = []
            package_type = "quote_only"

        st.caption(f"Will include {len(selected_ids)} documents")

    # Generate button
    if st.button("Generate", type="primary", key=f"qpb_gen_{quote_option_id}"):
        with st.spinner("Generating..."):
            try:
                result = generate_package(
                    submission_id=submission_id,
                    quote_option_id=quote_option_id,
                    doc_type=doc_type,
                    package_type=package_type,
                    selected_documents=selected_ids,
                    created_by="user"
                )

                st.success("Generated!")
                st.markdown(f"[Download]({result['pdf_url']})")
                return result

            except Exception as ex:
                st.error(f"Error: {ex}")

    return None
