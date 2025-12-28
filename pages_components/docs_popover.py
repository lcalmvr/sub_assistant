"""
Documents Popover Component

Compact document access from the header (next to Load/Edit).
Shows document count badge, scrollable list, and quick actions.
"""

import streamlit as st
import os
import glob
from typing import Optional


def get_document_count(submission_id: str, get_conn) -> int:
    """Get count of documents for a submission."""
    try:
        conn = get_conn() if callable(get_conn) else get_conn
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM documents WHERE submission_id = %s",
                (submission_id,)
            )
            result = cur.fetchone()
            return result[0] if result else 0
    except Exception:
        return 0


def get_documents_list(submission_id: str, get_conn) -> list[dict]:
    """Get documents for a submission."""
    try:
        conn = get_conn() if callable(get_conn) else get_conn
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, filename, document_type, page_count, is_priority, created_at
                FROM documents
                WHERE submission_id = %s
                ORDER BY is_priority DESC, created_at DESC
                """,
                (submission_id,)
            )
            rows = cur.fetchall()
            return [
                {
                    "id": str(row[0]),
                    "filename": row[1],
                    "document_type": row[2],
                    "page_count": row[3],
                    "is_priority": row[4],
                    "created_at": row[5],
                }
                for row in rows
            ]
    except Exception:
        return []


def _get_doc_icon(doc_type: str) -> str:
    """Get icon for document type."""
    icons = {
        "Submission Email": "📧",
        "Application Form": "📋",
        "Questionnaire/Form": "📝",
        "Loss Run": "📊",
        "Other": "📄",
    }
    return icons.get(doc_type, "📄")


def _find_file_path(filename: str) -> Optional[str]:
    """Find the actual file path for a document."""
    # Direct paths to check
    possible_paths = [
        f"./attachments/{filename}",
        f"./fixtures/{filename}",
        f"./archive/attachments/{filename}",
        f"./{filename}",
    ]

    for path in possible_paths:
        if os.path.exists(path):
            return path

    # Search recursively in all likely locations
    search_patterns = [
        f"./attachments/**/{filename}",
        f"./fixtures/**/{filename}",
        f"./archive/**/{filename}",
    ]

    for pattern in search_patterns:
        matches = glob.glob(pattern, recursive=True)
        if matches:
            return matches[0]

    return None


@st.dialog("Document Preview", width="large")
def _show_document_dialog(file_path: str, filename: str):
    """Show document preview in a dialog."""
    filename_lower = filename.lower()

    if filename_lower.endswith(".pdf"):
        # PDF preview - full width
        try:
            from streamlit_pdf_viewer import pdf_viewer
            with open(file_path, "rb") as f:
                pdf_bytes = f.read()

            col1, col2 = st.columns([4, 1])
            with col1:
                st.caption(filename)
            with col2:
                st.download_button(
                    "⬇ Download",
                    data=pdf_bytes,
                    file_name=filename,
                    mime="application/pdf",
                    use_container_width=True,
                )

            pdf_viewer(input=pdf_bytes, width=1200, height=700)
        except Exception as e:
            st.error(f"Error loading PDF: {e}")

    elif filename_lower.endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp")):
        # Image preview
        try:
            col1, col2 = st.columns([4, 1])
            with col1:
                st.caption(filename)
            with col2:
                with open(file_path, "rb") as f:
                    img_bytes = f.read()
                ext = filename_lower.split(".")[-1]
                st.download_button(
                    "⬇ Download",
                    data=img_bytes,
                    file_name=filename,
                    mime=f"image/{ext}",
                    use_container_width=True,
                )

            st.image(file_path, use_container_width=True)
        except Exception as e:
            st.error(f"Error loading image: {e}")

    else:
        # Other files - just download
        try:
            st.caption(filename)
            with open(file_path, "rb") as f:
                file_bytes = f.read()
            st.download_button(
                "⬇ Download File",
                data=file_bytes,
                file_name=filename,
                mime="application/octet-stream",
            )
            st.info("Preview not available for this file type")
        except Exception as e:
            st.error(f"Error: {e}")


def _render_preview_dialog():
    """Check if we should show preview dialog."""
    if "preview_doc_path" in st.session_state and "preview_doc_name" in st.session_state:
        file_path = st.session_state.pop("preview_doc_path")
        filename = st.session_state.pop("preview_doc_name")
        _show_document_dialog(file_path, filename)


def render_docs_popover(submission_id: str, get_conn) -> None:
    """
    Render the documents popover button with count badge.

    Placed in header next to Load/Edit button.
    """
    if not submission_id:
        return

    # Handle document preview dialog
    _render_preview_dialog()

    # Get source documents (uploaded apps, loss runs, emails, etc.)
    source_docs = get_documents_list(submission_id, get_conn)
    total_count = len(source_docs)

    # Popover button with count badge
    with st.popover(f"📄 {total_count}" if total_count > 0 else "📄", use_container_width=True):
        st.markdown("**Documents**")

        # Search filter
        search = st.text_input(
            "Search",
            placeholder="Filter...",
            key=f"doc_search_{submission_id}",
            label_visibility="collapsed",
        )
        search_lower = search.lower() if search else ""

        # Scrollable container for document list
        with st.container(height=280, border=False):

            # Filter documents
            filtered_docs = [
                d for d in source_docs
                if not search_lower or search_lower in d["filename"].lower() or search_lower in (d["document_type"] or "").lower()
            ] if source_docs else []

            if filtered_docs:
                st.caption(f"📥 Source ({len(filtered_docs)})")

                for doc in filtered_docs:
                    icon = _get_doc_icon(doc["document_type"])
                    priority = "⭐ " if doc["is_priority"] else ""
                    filename = doc["filename"]
                    doc_type = doc["document_type"] or "Other"

                    # Truncate long filenames for display
                    display_name = filename if len(filename) <= 28 else filename[:25] + "..."

                    # Find actual file
                    file_path = _find_file_path(filename)

                    if file_path:
                        col1, col2 = st.columns([5, 1])
                        with col1:
                            # Button to open preview dialog
                            if st.button(
                                f"{icon} {priority}{display_name}",
                                key=f"view_{doc['id']}",
                                use_container_width=True,
                                help="Click to preview",
                            ):
                                st.session_state["preview_doc_path"] = file_path
                                st.session_state["preview_doc_name"] = filename
                                st.rerun()
                        with col2:
                            st.caption(doc_type[:6])
                    else:
                        st.markdown(f"{icon} {priority}{display_name}")
                        st.caption("(not found)")

            # === EMPTY STATE ===
            if not source_docs:
                st.info("No documents yet")
            elif search and not filtered_docs:
                st.caption("No matches")

        st.divider()

        # Quick upload section
        with st.expander("➕ Upload", expanded=False):
            uploaded = st.file_uploader(
                "Upload",
                type=["pdf", "doc", "docx", "txt", "eml", "msg"],
                key=f"doc_upload_{submission_id}",
                label_visibility="collapsed",
            )

            if uploaded:
                doc_type = st.selectbox(
                    "Type",
                    ["Submission Email", "Application Form", "Questionnaire/Form", "Loss Run", "Other"],
                    key=f"doc_type_pop_{submission_id}",
                    label_visibility="collapsed",
                )
                if st.button("Upload", key=f"doc_upload_btn_{submission_id}", use_container_width=True, type="primary"):
                    try:
                        _quick_upload(submission_id, uploaded, doc_type, get_conn)
                        st.success(f"✓ {uploaded.name}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error: {e}")


def _quick_upload(submission_id: str, uploaded_file, doc_type: str, get_conn) -> None:
    """Quick upload a document."""
    conn = get_conn() if callable(get_conn) else get_conn

    # Get company name for folder
    with conn.cursor() as cur:
        cur.execute("SELECT applicant_name FROM submissions WHERE id = %s", (submission_id,))
        result = cur.fetchone()
        company_name = result[0] if result else "unknown"

    # Create folder and save file
    folder = f"fixtures/{company_name.lower().replace(' ', '_').replace('.', '').replace(',', '')}"
    os.makedirs(folder, exist_ok=True)

    file_path = os.path.join(folder, uploaded_file.name)
    with open(file_path, "wb") as f:
        f.write(uploaded_file.getbuffer())

    # Count pages if PDF
    page_count = 0
    if uploaded_file.name.lower().endswith(".pdf"):
        try:
            import fitz
            pdf = fitz.open(file_path)
            page_count = len(pdf)
            pdf.close()
        except Exception:
            pass

    # Insert into database
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (
                submission_id, filename, document_type, page_count,
                is_priority, doc_metadata, extracted_data, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, now())
            """,
            (submission_id, uploaded_file.name, doc_type, page_count, False, None, None)
        )
