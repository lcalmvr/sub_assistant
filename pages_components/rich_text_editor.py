"""
Rich Text Editor Component

Provides a WYSIWYG editor for document content using streamlit-quill.
Used by legal and product experts to create endorsement and marketing content.
"""

import streamlit as st

try:
    from streamlit_quill import st_quill
    QUILL_AVAILABLE = True
except ImportError:
    QUILL_AVAILABLE = False


# Default toolbar configuration for document editing
DEFAULT_TOOLBAR = [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote'],
    [{'header': 1}, {'header': 2}, {'header': 3}],
    [{'list': 'ordered'}, {'list': 'bullet'}],
    [{'indent': '-1'}, {'indent': '+1'}],
    ['link'],
    ['clean']
]

# Minimal toolbar for simple text
MINIMAL_TOOLBAR = [
    ['bold', 'italic', 'underline'],
    [{'list': 'ordered'}, {'list': 'bullet'}],
    ['clean']
]

# Full toolbar with more options
FULL_TOOLBAR = [
    [{'header': [1, 2, 3, 4, 5, 6, False]}],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{'list': 'ordered'}, {'list': 'bullet'}],
    [{'indent': '-1'}, {'indent': '+1'}],
    [{'align': []}],
    ['link'],
    ['clean']
]


def render_rich_text_editor(
    initial_content: str = "",
    key: str = "rich_text_editor",
    toolbar: str = "default",
    placeholder: str = "Enter document content...",
    height: int = 300
) -> str:
    """
    Render a rich text editor.

    Args:
        initial_content: Initial HTML content to display
        key: Unique key for the editor instance
        toolbar: Toolbar preset ('minimal', 'default', 'full')
        placeholder: Placeholder text
        height: Editor height in pixels

    Returns:
        HTML content from the editor
    """
    if not QUILL_AVAILABLE:
        st.warning("Rich text editor not available. Using plain text input.")
        return st.text_area(
            "Content",
            value=initial_content,
            height=height,
            key=key,
            placeholder=placeholder
        )

    # Select toolbar configuration
    if toolbar == "minimal":
        toolbar_config = MINIMAL_TOOLBAR
    elif toolbar == "full":
        toolbar_config = FULL_TOOLBAR
    else:
        toolbar_config = DEFAULT_TOOLBAR

    # Render the Quill editor
    content = st_quill(
        value=initial_content,
        key=key,
        toolbar=toolbar_config,
        placeholder=placeholder,
    )

    return content or ""


def render_content_preview(content_html: str, max_height: int = 400):
    """
    Render a preview of HTML content.

    Args:
        content_html: HTML content to preview
        max_height: Maximum height for scrollable preview
    """
    if not content_html:
        st.caption("No content to preview")
        return

    # Wrap in a styled container
    preview_html = f"""
    <div style="
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        padding: 16px;
        background: white;
        max-height: {max_height}px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.6;
    ">
        {content_html}
    </div>
    """
    st.markdown(preview_html, unsafe_allow_html=True)


def render_document_preview(
    title: str,
    code: str = None,
    content_html: str = None,
    document_type: str = None
):
    """
    Render a preview of a document as it would appear in a PDF.

    Args:
        title: Document title
        code: Document code
        content_html: HTML content
        document_type: Type of document for styling
    """
    # Build preview HTML matching the PDF template style
    preview_html = f"""
    <div style="
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 24px;
        background: white;
        max-height: 500px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
        <div style="
            border-bottom: 2px solid #1a365d;
            padding-bottom: 12px;
            margin-bottom: 16px;
        ">
            <div style="font-size: 18px; font-weight: bold; color: #1a365d;">
                {title}
            </div>
            {'<div style="font-size: 12px; color: #666; margin-top: 4px;">' + code + '</div>' if code else ''}
        </div>
        <div style="font-size: 14px; line-height: 1.6;">
            {content_html or '<em style="color: #999;">No content</em>'}
        </div>
    </div>
    """
    st.markdown(preview_html, unsafe_allow_html=True)


def get_editor_help_text():
    """Return help text for the editor."""
    return """
    **Formatting Tips:**
    - Use **Bold** for emphasis
    - Use *Italic* for definitions
    - Use headers (H1, H2, H3) for sections
    - Use numbered lists for sequential items
    - Use bullet lists for non-sequential items

    **Best Practices:**
    - Keep paragraphs concise
    - Use clear, legal language
    - Define terms on first use
    - Structure content with headers
    """
