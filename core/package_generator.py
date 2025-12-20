"""
Package Generator Module

Generates combined document packages (quote + endorsements + other materials)
as a single PDF. Stores manifests for regeneration.

Supports endorsement fill-ins using {{variable}} syntax:
- {{insured_name}} - Insured/applicant name
- {{effective_date}} - Policy effective date
- {{expiration_date}} - Policy expiration date
- {{policy_number}} - Policy/quote number
- {{aggregate_limit}} - Policy aggregate limit
- {{sublimits_schedule}} - Table of dropdown sublimits
"""

import os
import re
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


def process_endorsement_fill_ins(
    content: str,
    context: dict,
    fill_in_mappings: dict = None
) -> str:
    """
    Process fill-in variables in endorsement content.

    Uses database-driven fill_in_mappings when available, with fallback
    to standard variable replacements.

    Supported variables:
    - {{insured_name}} - Insured/applicant name
    - {{effective_date}} - Policy effective date
    - {{expiration_date}} - Policy expiration date
    - {{policy_number}} - Quote/policy number
    - {{aggregate_limit}} - Policy aggregate limit
    - {{retention}} - Retention amount
    - {{sublimits_schedule}} - Table of dropdown sublimits

    Args:
        content: Endorsement HTML content with {{variable}} placeholders
        context: Document context dict with quote/policy data
        fill_in_mappings: Optional dict mapping variables to context fields
                         (from document_library.fill_in_mappings)

    Returns:
        Content with variables replaced
    """
    if not content:
        return content

    # Standard variable to context field mappings
    standard_mappings = {
        "{{insured_name}}": "insured_name",
        "{{effective_date}}": "effective_date",
        "{{expiration_date}}": "expiration_date",
        "{{policy_number}}": "quote_number",
        "{{aggregate_limit}}": "aggregate_limit",
        "{{retention}}": "retention",
    }

    # Merge with database-provided mappings (DB mappings take precedence)
    if fill_in_mappings:
        standard_mappings.update(fill_in_mappings)

    # Process each mapping
    for variable, context_field in standard_mappings.items():
        if variable not in content:
            continue

        # Special rendering for certain variables
        if variable == "{{sublimits_schedule}}" or context_field == "sublimits":
            value = _render_sublimits_schedule(context)
        elif variable in ("{{aggregate_limit}}", "{{retention}}") or \
             context_field in ("aggregate_limit", "retention", "limit"):
            raw_value = context.get(context_field, 0)
            value = format_limit(raw_value) if raw_value else ""
        elif variable in ("{{effective_date}}", "{{expiration_date}}") or \
             context_field in ("effective_date", "expiration_date"):
            value = str(context.get(context_field, ""))
        else:
            value = str(context.get(context_field, ""))

        content = content.replace(variable, value)

    # Handle sublimits_schedule if not already processed via mappings
    if "{{sublimits_schedule}}" in content:
        sublimits_html = _render_sublimits_schedule(context)
        content = content.replace("{{sublimits_schedule}}", sublimits_html)

    return content


def _render_sublimits_schedule(context: dict) -> str:
    """
    Render sublimits as an HTML table for endorsement fill-in.

    Uses sublimit_coverages from context which contains:
    {coverage_name: {"limit": X, "attachment": Y}}
    """
    sublimits = context.get("sublimit_coverages", {})

    if not sublimits:
        return "<p><em>No sublimits applicable.</em></p>"

    rows = []
    for coverage, data in sublimits.items():
        if isinstance(data, dict):
            limit = data.get("limit", 0)
            attachment = data.get("attachment", 0)
            rows.append(f"""
                <tr>
                    <td>{coverage}</td>
                    <td style="text-align: right;">{format_limit(limit)}</td>
                    <td style="text-align: right;">{format_limit(attachment)}</td>
                </tr>
            """)
        else:
            # Simple limit value
            rows.append(f"""
                <tr>
                    <td>{coverage}</td>
                    <td style="text-align: right;">{format_limit(data)}</td>
                    <td style="text-align: right;">—</td>
                </tr>
            """)

    return f"""
    <table class="sublimits-schedule" style="width: 100%; border-collapse: collapse; margin: 15px 0;">
        <thead>
            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #1a365d;">
                <th style="text-align: left; padding: 8px;">Coverage</th>
                <th style="text-align: right; padding: 8px;">Sublimit</th>
                <th style="text-align: right; padding: 8px;">Drop-Down Attachment</th>
            </tr>
        </thead>
        <tbody>
            {''.join(rows)}
        </tbody>
    </table>
    """


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
    fill_in_mappings = doc.get("fill_in_mappings")

    # Process fill-in variables for endorsements
    if doc_type == "endorsement" and content:
        content = process_endorsement_fill_ins(content, context, fill_in_mappings)

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


# =============================================================================
# Mid-Term Endorsement Document Generation
# =============================================================================

def generate_midterm_endorsement_document(
    endorsement_id: str,
    created_by: str = "system"
) -> dict:
    """
    Generate a document for a mid-term policy endorsement.

    Uses the endorsement rule processing engine to:
    1. Find the appropriate template from document_library (by endorsement_type)
    2. Build context from policy data + endorsement change_details
    3. Process fill-in variables
    4. Generate and upload PDF

    Args:
        endorsement_id: UUID of the policy_endorsement record
        created_by: User generating the document

    Returns:
        dict with document_url, endorsement_number, etc.
    """
    from core.endorsement_management import get_endorsement
    from core.document_library import get_library_entries, get_auto_attach_endorsements

    # Get endorsement details
    endorsement = get_endorsement(endorsement_id)
    if not endorsement:
        raise ValueError(f"Endorsement not found: {endorsement_id}")

    submission_id = endorsement["submission_id"]
    endorsement_type = endorsement["endorsement_type"]
    change_details = endorsement.get("change_details", {})

    # Build context for fill-ins
    context = _build_midterm_context(submission_id, endorsement)

    # Find matching template from document_library
    # First try auto-attach rules
    template = _find_endorsement_template(endorsement_type, context)

    if not template:
        raise ValueError(f"No template found for endorsement type: {endorsement_type}")

    # Process fill-ins
    content_html = template.get("content_html", "")
    fill_in_mappings = template.get("fill_in_mappings")

    if content_html:
        content_html = process_endorsement_fill_ins(content_html, context, fill_in_mappings)

    # Render the document HTML
    html_content = _render_midterm_endorsement_html(
        endorsement=endorsement,
        template=template,
        content_html=content_html,
        context=context
    )

    # Generate PDF and upload
    pdf_url = _render_and_upload_endorsement(html_content, endorsement)

    return {
        "endorsement_id": endorsement_id,
        "endorsement_number": endorsement.get("endorsement_number"),
        "pdf_url": pdf_url,
        "template_code": template.get("code"),
        "template_title": template.get("title"),
        "created_at": datetime.now().isoformat(),
        "created_by": created_by,
    }


def _build_midterm_context(submission_id: str, endorsement: dict) -> dict:
    """
    Build context dict for mid-term endorsement fill-ins.

    Combines:
    - Policy/submission data
    - Endorsement metadata
    - Endorsement change_details
    """
    # Get base policy context
    context = {}

    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                s.applicant_name,
                s.effective_date,
                s.expiration_date,
                t.quote_name
            FROM submissions s
            LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if row:
            context["insured_name"] = row[0]
            context["effective_date"] = str(row[1]) if row[1] else ""
            context["expiration_date"] = str(row[2]) if row[2] else ""
            context["policy_number"] = row[3] or ""

    # Add endorsement metadata
    context["endorsement_number"] = endorsement.get("endorsement_number")
    context["endorsement_effective_date"] = str(endorsement.get("effective_date", ""))
    context["endorsement_type"] = endorsement.get("endorsement_type")

    # Merge in change_details (e.g., previous_broker_name, new_broker_name)
    change_details = endorsement.get("change_details", {})
    if isinstance(change_details, str):
        change_details = json.loads(change_details)

    context.update(change_details)

    return context


def _find_endorsement_template(endorsement_type: str, context: dict) -> Optional[dict]:
    """
    Find the document_library template for an endorsement type.

    Uses auto-attach rules with 'endorsement_type' condition.
    """
    from core.document_library import get_auto_attach_endorsements

    # Use auto-attach with endorsement_type in context
    context_with_type = {**context, "endorsement_type": endorsement_type}
    auto_templates = get_auto_attach_endorsements(context_with_type, position="either")

    if auto_templates:
        return auto_templates[0]

    # Fallback: search by code pattern
    # e.g., endorsement_type='bor_change' -> look for 'BOR-*'
    type_code_prefixes = {
        "bor_change": "BOR-",
        "cancellation": "CAN-",
        "reinstatement": "RST-",
        "name_change": "NAM-",
        "address_change": "ADR-",
        "erp": "ERP-",
        "extension": "EXT-",
        "coverage_change": "COV-",
    }

    prefix = type_code_prefixes.get(endorsement_type)
    if prefix:
        from core.document_library import get_library_entries
        templates = get_library_entries(
            document_type="endorsement",
            status="active",
            search=prefix
        )
        if templates:
            return templates[0]

    return None


def _render_midterm_endorsement_html(
    endorsement: dict,
    template: dict,
    content_html: str,
    context: dict
) -> str:
    """
    Render the full HTML for a mid-term endorsement document.
    """
    title = template.get("title", "Policy Endorsement")
    code = template.get("code", "")
    endorsement_number = endorsement.get("endorsement_number", "")
    effective_date = context.get("endorsement_effective_date", "")
    policy_number = context.get("policy_number", "")
    insured_name = context.get("insured_name", "")

    return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
        @page {{
            size: letter;
            margin: 0.75in;
        }}
        body {{
            font-family: 'Georgia', serif;
            font-size: 11px;
            line-height: 1.6;
            color: #1a1a1a;
        }}
        .endorsement-header {{
            text-align: center;
            border-bottom: 2px solid #1a365d;
            padding-bottom: 20px;
            margin-bottom: 25px;
        }}
        .endorsement-title {{
            font-size: 18px;
            font-weight: bold;
            color: #1a365d;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
        }}
        .endorsement-code {{
            font-size: 10px;
            color: #718096;
        }}
        .endorsement-meta {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
        }}
        .meta-item {{
            text-align: center;
        }}
        .meta-label {{
            font-size: 9px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .meta-value {{
            font-size: 12px;
            font-weight: bold;
            color: #1a365d;
        }}
        .endorsement-content {{
            text-align: justify;
        }}
        .endorsement-content h2 {{
            color: #1a365d;
            font-size: 14px;
            margin-top: 20px;
            margin-bottom: 10px;
        }}
        .endorsement-content h3 {{
            color: #1a365d;
            font-size: 12px;
            margin-top: 15px;
            margin-bottom: 8px;
        }}
        .endorsement-content table {{
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }}
        .endorsement-content td, .endorsement-content th {{
            padding: 10px;
            border: 1px solid #ddd;
        }}
        .endorsement-footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-size: 9px;
            color: #718096;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="endorsement-header">
        <div class="endorsement-title">{title}</div>
        <div class="endorsement-code">{code}</div>
    </div>

    <div class="endorsement-meta">
        <div class="meta-item">
            <div class="meta-label">Policy Number</div>
            <div class="meta-value">{policy_number}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Endorsement Number</div>
            <div class="meta-value">{endorsement_number}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Effective Date</div>
            <div class="meta-value">{effective_date}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Named Insured</div>
            <div class="meta-value">{insured_name}</div>
        </div>
    </div>

    <div class="endorsement-content">
        {content_html}
    </div>

    <div class="endorsement-footer">
        <p>This endorsement forms a part of the policy to which it is attached and is subject to all terms, conditions, and exclusions of such policy except as specifically modified herein.</p>
    </div>
</body>
</html>'''


def _render_and_upload_endorsement(html_content: str, endorsement: dict) -> str:
    """Render HTML to PDF and upload to Supabase."""
    with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        HTML(string=html_content).write_pdf(tmp.name)
        pdf_path = Path(tmp.name)

    try:
        bucket = "quotes"  # or create a dedicated 'endorsements' bucket
        endorsement_number = endorsement.get("endorsement_number", "0")
        key = f"endorsements/{endorsement['submission_id']}/endorsement_{endorsement_number}_{uuid.uuid4()}.pdf"

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
