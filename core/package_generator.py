"""
Package Generator Module

Generates combined document packages (quote + endorsements + other materials)
as a single PDF. Stores manifests for regeneration.
"""

import os
import uuid
import json
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from sqlalchemy import text

# Import document library
from core.document_library import get_library_entry, get_library_entries

# Import document generator for context and rendering
from core.document_generator import (
    get_document_context,
    DOCUMENT_TYPES,
    TEMPLATE_ENV,
    format_currency,
    format_date,
    format_limit,
)

# Database connection
import importlib.util
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn

# Supabase client
from supabase import create_client
SB = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


def generate_package(
    submission_id: str,
    quote_option_id: str,
    doc_type: str,
    package_type: str = "quote_only",
    selected_documents: list[str] = None,
    created_by: str = "user"
) -> dict:
    """
    Generate a document package.

    Args:
        submission_id: UUID of the submission
        quote_option_id: UUID of the quote option
        doc_type: Base document type ('quote_primary', 'quote_excess', 'binder')
        package_type: 'quote_only' or 'full_package'
        selected_documents: List of library entry IDs to include
        created_by: User generating the package

    Returns:
        dict with id, pdf_url, document_number, manifest
    """
    if doc_type not in DOCUMENT_TYPES:
        raise ValueError(f"Invalid document type: {doc_type}")

    doc_config = DOCUMENT_TYPES[doc_type]
    selected_documents = selected_documents or []

    # Gather context data
    context = get_document_context(submission_id, quote_option_id)

    # Generate document number
    document_number = _generate_document_number(doc_config["prefix"])
    context["document_number"] = document_number
    context["document_id"] = str(uuid.uuid4())[:8].upper()
    context["generated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Get library documents if full package
    library_docs = []
    manifest = []

    if package_type == "full_package" and selected_documents:
        for doc_id in selected_documents:
            entry = get_library_entry(doc_id)
            if entry and entry.get("status") == "active":
                library_docs.append(entry)
                manifest.append({
                    "library_id": entry["id"],
                    "code": entry["code"],
                    "title": entry["title"],
                    "version": entry.get("version", 1),
                    "document_type": entry.get("document_type"),
                })

        # Sort by default_sort_order
        library_docs.sort(key=lambda x: x.get("default_sort_order", 100))
        manifest.sort(key=lambda x: next(
            (d.get("default_sort_order", 100) for d in library_docs if d["id"] == x["library_id"]),
            100
        ))

    # Render combined HTML
    if library_docs:
        html_content = render_package_html(
            doc_config["template"],
            context,
            library_docs
        )
    else:
        # Just render the quote
        template = TEMPLATE_ENV.get_template(doc_config["template"])
        html_content = template.render(**context)

    # Generate PDF and upload
    pdf_url = _render_and_upload_package(html_content, doc_type)

    # Save document record
    doc_id = _save_document(
        submission_id=submission_id,
        quote_option_id=quote_option_id,
        doc_type=doc_type,
        document_number=document_number,
        pdf_url=pdf_url,
        document_json=context,
        created_by=created_by
    )

    # Save manifest
    if manifest:
        _save_manifest(doc_id, package_type, manifest)

    return {
        "id": doc_id,
        "document_number": document_number,
        "document_type": doc_type,
        "package_type": package_type,
        "pdf_url": pdf_url,
        "manifest": manifest,
        "created_at": datetime.now().isoformat(),
    }


def render_package_html(
    quote_template: str,
    context: dict,
    library_documents: list[dict]
) -> str:
    """
    Render combined HTML for a package with quote + library documents.

    Args:
        quote_template: Template name for the quote
        context: Quote context data
        library_documents: List of library document dicts

    Returns:
        Combined HTML string
    """
    # Render the quote first
    template = TEMPLATE_ENV.get_template(quote_template)
    quote_html = template.render(**context)

    # Find where to insert library documents (before the closing </body>)
    # We'll insert page breaks and library docs before the footer
    insert_marker = "</body>"

    if insert_marker not in quote_html:
        # Fallback: just append
        parts = [quote_html]
    else:
        # Split at </body> and insert library docs
        parts = quote_html.split(insert_marker)
        quote_html_before_close = parts[0]
        quote_html_after_close = insert_marker + (parts[1] if len(parts) > 1 else "")
        parts = [quote_html_before_close]

    # Add library document styles
    library_styles = _get_library_document_styles()

    # Add each library document with page break
    for doc in library_documents:
        parts.append('<div class="page-break"></div>')
        parts.append(_render_library_document_html(doc, context))

    # Close the HTML
    if insert_marker in quote_html:
        parts.append(quote_html_after_close)

    # Insert styles before the first </style> or before </head>
    combined = '\n'.join(parts)

    # Add library styles
    if '</style>' in combined:
        combined = combined.replace('</style>', library_styles + '\n</style>', 1)
    elif '</head>' in combined:
        combined = combined.replace('</head>', '<style>' + library_styles + '</style>\n</head>')

    return combined


def _render_library_document_html(doc: dict, context: dict) -> str:
    """Render a single library document as HTML."""
    doc_type = doc.get("document_type", "endorsement")
    title = doc.get("title", "")
    code = doc.get("code", "")
    content = doc.get("content_html", "")

    # Add context info for endorsements
    effective_date = context.get("effective_date", "")
    policy_number = context.get("quote_number", "")

    if doc_type == "endorsement":
        return f'''
        <div class="library-document endorsement-document">
            <div class="library-document-header">
                <div class="library-document-title">{title}</div>
                <div class="library-document-code">{code}</div>
            </div>

            <div class="endorsement-meta">
                <div class="endorsement-meta-item">
                    <span class="endorsement-meta-label">Effective Date:</span>
                    <span class="endorsement-meta-value">{effective_date}</span>
                </div>
                <div class="endorsement-meta-item">
                    <span class="endorsement-meta-label">Quote Reference:</span>
                    <span class="endorsement-meta-value">{policy_number}</span>
                </div>
            </div>

            <div class="library-document-content">
                {content}
            </div>

            <div class="endorsement-footer">
                <p class="endorsement-footer-text">
                    This endorsement modifies the policy to which it is attached and is effective
                    on the date indicated above. All other terms and conditions of the policy remain unchanged.
                </p>
            </div>
        </div>
        '''
    else:
        # Generic library document
        return f'''
        <div class="library-document">
            <div class="library-document-header">
                <div class="library-document-title">{title}</div>
                {f'<div class="library-document-code">{code}</div>' if code else ''}
            </div>

            <div class="library-document-content">
                {content}
            </div>
        </div>
        '''


def _get_library_document_styles() -> str:
    """Get CSS styles for library documents."""
    return '''
    /* Library Document Styles */
    .library-document {
        margin-bottom: 30px;
    }

    .library-document-header {
        text-align: center;
        border-bottom: 2px solid #1a365d;
        padding-bottom: 15px;
        margin-bottom: 20px;
    }

    .library-document-title {
        font-size: 16px;
        font-weight: 700;
        color: #1a365d;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 5px;
    }

    .library-document-code {
        font-size: 10px;
        color: #718096;
    }

    .library-document-content {
        font-size: 11px;
        line-height: 1.7;
        text-align: justify;
    }

    .library-document-content h1,
    .library-document-content h2,
    .library-document-content h3 {
        color: #1a365d;
        margin-top: 15px;
        margin-bottom: 10px;
    }

    .library-document-content h1 {
        font-size: 14px;
        border-bottom: 1px solid #b7791f;
        padding-bottom: 5px;
    }

    .library-document-content h2 {
        font-size: 12px;
    }

    .library-document-content h3 {
        font-size: 11px;
    }

    .library-document-content p {
        margin-bottom: 10px;
    }

    .library-document-content ul,
    .library-document-content ol {
        margin: 10px 0;
        padding-left: 25px;
    }

    .library-document-content li {
        margin-bottom: 5px;
    }

    .library-document-content blockquote {
        border-left: 3px solid #b7791f;
        margin: 10px 0;
        padding-left: 15px;
        font-style: italic;
        color: #4a5568;
    }

    .endorsement-meta {
        display: flex;
        justify-content: center;
        gap: 30px;
        margin-bottom: 20px;
        font-size: 10px;
    }

    .endorsement-meta-item {
        display: flex;
        gap: 5px;
    }

    .endorsement-meta-label {
        color: #718096;
    }

    .endorsement-meta-value {
        font-weight: 600;
    }

    .endorsement-footer {
        margin-top: 30px;
        padding-top: 15px;
        border-top: 1px solid #e2e8f0;
    }

    .endorsement-footer-text {
        font-size: 9px;
        color: #718096;
        font-style: italic;
        text-align: center;
    }
    '''


def _render_and_upload_package(html_content: str, doc_type: str) -> str:
    """Render HTML to PDF and upload to Supabase."""
    with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        HTML(string=html_content).write_pdf(tmp.name)
        pdf_path = Path(tmp.name)

    try:
        bucket = "quotes"
        key = f"{doc_type}/{uuid.uuid4()}.pdf"

        with pdf_path.open("rb") as f:
            SB.storage.from_(bucket).upload(
                key,
                f,
                {"content-type": "application/pdf"}
            )

        base_url = os.getenv("SUPABASE_URL")
        pdf_url = f"{base_url}/storage/v1/object/public/{bucket}/{key}"

        return pdf_url

    finally:
        pdf_path.unlink(missing_ok=True)


def _generate_document_number(prefix: str) -> str:
    """Generate a unique document number."""
    year = datetime.now().year
    random_suffix = str(uuid.uuid4())[:6].upper()
    return f"{prefix}-{year}-{random_suffix}"


def _save_document(
    submission_id: str,
    quote_option_id: str,
    doc_type: str,
    document_number: str,
    pdf_url: str,
    document_json: dict,
    created_by: str
) -> str:
    """Save document record to database."""
    from datetime import date

    # Serialize context for JSON storage
    serializable_json = {}
    for key, value in document_json.items():
        if isinstance(value, (date, datetime)):
            serializable_json[key] = value.isoformat()
        elif isinstance(value, dict) or isinstance(value, list):
            serializable_json[key] = value
        else:
            serializable_json[key] = str(value) if value is not None else None

    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO policy_documents (
                submission_id, quote_option_id, document_type,
                document_number, pdf_url, document_json, created_by
            ) VALUES (
                :submission_id, :quote_option_id, :doc_type,
                :document_number, :pdf_url, :document_json, :created_by
            )
            RETURNING id
        """), {
            "submission_id": submission_id,
            "quote_option_id": quote_option_id,
            "doc_type": doc_type,
            "document_number": document_number,
            "pdf_url": pdf_url,
            "document_json": json.dumps(serializable_json),
            "created_by": created_by,
        })
        return str(result.fetchone()[0])


def _save_manifest(
    policy_document_id: str,
    package_type: str,
    manifest: list[dict]
) -> str:
    """Save package manifest to database."""
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO document_package_manifests (
                policy_document_id, package_type, manifest
            ) VALUES (
                :policy_document_id, :package_type, :manifest
            )
            RETURNING id
        """), {
            "policy_document_id": policy_document_id,
            "package_type": package_type,
            "manifest": json.dumps(manifest),
        })
        return str(result.fetchone()[0])


def get_manifest(policy_document_id: str) -> Optional[dict]:
    """Get manifest for a policy document."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, package_type, manifest, created_at
            FROM document_package_manifests
            WHERE policy_document_id = :policy_document_id
        """), {"policy_document_id": policy_document_id})

        row = result.fetchone()
        if row:
            return {
                "id": str(row[0]),
                "package_type": row[1],
                "manifest": row[2] if isinstance(row[2], list) else json.loads(row[2]),
                "created_at": row[3],
            }
        return None


def regenerate_package(policy_document_id: str, created_by: str = "user") -> dict:
    """
    Regenerate a package from its stored manifest.

    Args:
        policy_document_id: ID of the original document
        created_by: User regenerating the package

    Returns:
        dict with new document info
    """
    # Get original document info
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT submission_id, quote_option_id, document_type
            FROM policy_documents
            WHERE id = :doc_id
        """), {"doc_id": policy_document_id})

        row = result.fetchone()
        if not row:
            raise ValueError("Document not found")

        submission_id = str(row[0])
        quote_option_id = str(row[1])
        doc_type = row[2]

    # Get manifest
    manifest = get_manifest(policy_document_id)
    if not manifest:
        # No manifest = quote only, regenerate without library docs
        return generate_package(
            submission_id=submission_id,
            quote_option_id=quote_option_id,
            doc_type=doc_type,
            package_type="quote_only",
            created_by=created_by
        )

    # Extract document IDs from manifest
    selected_documents = [item["library_id"] for item in manifest.get("manifest", [])]

    return generate_package(
        submission_id=submission_id,
        quote_option_id=quote_option_id,
        doc_type=doc_type,
        package_type=manifest.get("package_type", "full_package"),
        selected_documents=selected_documents,
        created_by=created_by
    )
