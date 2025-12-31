"""
Document Generator Module

Generates professional PDF documents (quotes, binders) for submissions.
Uses Jinja2 templates + WeasyPrint for HTML-to-PDF conversion.
Stores generated documents in Supabase.
"""

import os
import uuid
import json
from datetime import datetime, date, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from sqlalchemy import text

# Coverage configuration
from rating_engine.coverage_config import (
    get_coverages_for_form,
    get_coverage_label,
    get_default_policy_form,
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

# Template environment
TEMPLATE_DIR = Path(__file__).parent.parent / "rating_engine" / "templates"
TEMPLATE_ENV = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))

# Register custom filters
def format_currency(value):
    """Format currency with K/M suffixes."""
    if value is None:
        return "—"
    if isinstance(value, str):
        return value
    if value >= 1_000_000 and value % 1_000_000 == 0:
        return f"${value // 1_000_000}M"
    elif value >= 1_000 and value % 1_000 == 0:
        return f"${value // 1_000}K"
    return f"${value:,}"

def format_date(dt):
    """Format date for display."""
    if dt is None:
        return "—"
    if isinstance(dt, str):
        return dt
    if hasattr(dt, 'strftime'):
        return dt.strftime("%B %d, %Y")
    return str(dt)

def format_limit(value):
    """Format limit with K/M suffixes (no $ sign)."""
    if value is None:
        return "—"
    if value >= 1_000_000 and value % 1_000_000 == 0:
        return f"{value // 1_000_000}M"
    elif value >= 1_000 and value % 1_000 == 0:
        return f"{value // 1_000}K"
    return f"{value:,}"

TEMPLATE_ENV.filters['format_currency'] = format_currency
TEMPLATE_ENV.filters['format_date'] = format_date
TEMPLATE_ENV.filters['format_limit'] = format_limit


def format_quote_display_name(limit: int, retention_or_attachment: int, position: str = "primary") -> str:
    """
    Format a quote display name like '1M x 50K SIR' or '5M x 1M'.

    Args:
        limit: The policy limit
        retention_or_attachment: Retention for primary, attachment for excess
        position: 'primary' or 'excess'

    Returns:
        Formatted string like '1M x 50K SIR' or '5M x 1M'
    """
    def fmt(value):
        if value >= 1_000_000 and value % 1_000_000 == 0:
            return f"{value // 1_000_000}M"
        elif value >= 1_000 and value % 1_000 == 0:
            return f"{value // 1_000}K"
        return f"{value:,}"

    limit_str = fmt(limit)
    ret_str = fmt(retention_or_attachment)

    if position == "excess":
        return f"{limit_str} x {ret_str}"
    else:
        return f"{limit_str} x {ret_str} SIR"


# Document type mappings
DOCUMENT_TYPES = {
    "quote_primary": {
        "template": "quote_primary.html",
        "prefix": "Q",
        "label": "Primary Quote",
    },
    "quote_excess": {
        "template": "quote_excess.html",
        "prefix": "QX",
        "label": "Excess Quote",
    },
    "binder": {
        "template": "binder.html",
        "prefix": "B",
        "label": "Binder",
    },
    "policy": {
        "template": "policy_combined.html",
        "prefix": "P",
        "label": "Policy",
    },
}


def generate_document(
    submission_id: str,
    quote_option_id: str,
    doc_type: str,
    created_by: str = "user"
) -> dict:
    """
    Generate a policy document (quote or binder).

    For quote documents, voids any previous quote for the same option
    (one quote per option - latest prevails).

    Args:
        submission_id: UUID of the submission
        quote_option_id: UUID of the quote option (insurance_towers)
        doc_type: Type of document ('quote_primary', 'quote_excess', 'binder')
        created_by: User generating the document

    Returns:
        dict with id, pdf_url, document_number, etc.
    """
    if doc_type not in DOCUMENT_TYPES:
        raise ValueError(f"Invalid document type: {doc_type}")

    doc_config = DOCUMENT_TYPES[doc_type]

    # For quote documents, void any previous quote for this option (one quote per option)
    if doc_type in ("quote_primary", "quote_excess"):
        _void_previous_quotes_for_option(quote_option_id, doc_type)

    # Gather context data
    context = get_document_context(submission_id, quote_option_id)
    
    # Check if this is a revised binder (there's already a binder for this quote option)
    is_revised = False
    if doc_type == "binder":
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT COUNT(*) FROM policy_documents
                WHERE quote_option_id = :quote_option_id
                AND document_type = 'binder'
                AND status != 'void'
            """), {"quote_option_id": quote_option_id})
            existing_count = result.fetchone()[0]
            is_revised = existing_count > 0
        context["is_revised_binder"] = is_revised

    # Generate document number
    document_number = _generate_document_number(doc_config["prefix"])
    context["document_number"] = document_number
    context["document_id"] = str(uuid.uuid4())[:8].upper()
    context["generated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Render and upload PDF
    pdf_url = render_and_upload(doc_config["template"], context, doc_type)

    # Save to database
    doc_id = _save_document(
        submission_id=submission_id,
        quote_option_id=quote_option_id,
        doc_type=doc_type,
        document_number=document_number,
        pdf_url=pdf_url,
        document_json=context,
        created_by=created_by
    )

    return {
        "id": doc_id,
        "document_number": document_number,
        "document_type": doc_type,
        "pdf_url": pdf_url,
        "created_at": datetime.now().isoformat(),
    }


def get_document_context(submission_id: str, quote_option_id: str) -> dict:
    """
    Gather all data needed for document templates.

    Returns dict with insured, broker, policy, quote, tower data.
    """
    context = {}

    with get_conn() as conn:
        # Get submission data
        result = conn.execute(text("""
            SELECT
                s.applicant_name,
                s.annual_revenue,
                s.website,
                s.effective_date,
                s.expiration_date,
                s.naics_primary_code,
                s.naics_primary_title,
                s.broker_employment_id
            FROM submissions s
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})
        sub_row = result.fetchone()

        if sub_row:
            context["insured_name"] = sub_row[0] or "—"
            context["annual_revenue"] = sub_row[1]
            context["insured_website"] = sub_row[2]
            context["effective_date"] = format_date(sub_row[3])
            context["expiration_date"] = format_date(sub_row[4])
            context["insured_industry"] = sub_row[6] or sub_row[5]  # title or code

            # Calculate valid_until (30 days from today)
            context["valid_until"] = format_date(date.today() + timedelta(days=30))
            context["quote_date"] = format_date(date.today())

            # Get broker info if available
            broker_id = sub_row[7]
            if broker_id:
                broker_result = conn.execute(text("""
                    SELECT
                        p.first_name || ' ' || p.last_name as broker_name,
                        org.name as org_name,
                        e.email
                    FROM brkr_employments e
                    JOIN brkr_people p ON p.person_id = e.person_id
                    JOIN brkr_organizations org ON org.org_id = e.org_id
                    WHERE e.employment_id = :broker_id
                """), {"broker_id": broker_id})
                broker_row = broker_result.fetchone()
                if broker_row:
                    context["broker_name"] = broker_row[0]
                    context["broker_company"] = broker_row[1]
                    context["broker_email"] = broker_row[2]

        # Get quote option data
        result = conn.execute(text("""
            SELECT
                tower_json,
                primary_retention,
                coverages,
                endorsements,
                sublimits,
                sold_premium,
                technical_premium,
                risk_adjusted_premium,
                position,
                policy_form,
                quote_name
            FROM insurance_towers
            WHERE id = :quote_option_id
        """), {"quote_option_id": quote_option_id})
        quote_row = result.fetchone()

        if quote_row:
            tower_json = quote_row[0] or []
            retention = quote_row[1] or 0
            coverages = quote_row[2] or {}
            endorsements = quote_row[3] or []
            sublimits = quote_row[4] or []
            sold_premium = quote_row[5] or 0
            position = quote_row[8] or "primary"
            policy_form = quote_row[9]
            quote_name = quote_row[10]

            # Calculate limit and attachment based on position
            aggregate_limit = 0
            our_attachment = 0
            our_premium = sold_premium or 0

            if tower_json:
                if position == "excess":
                    # For excess, find the CMAI layer
                    for layer in tower_json:
                        carrier = layer.get("carrier", "")
                        if "CMAI" in carrier:
                            # Handle various numeric formats (int, float, string)
                            limit_raw = layer.get("limit", 0)
                            attachment_raw = layer.get("attachment", 0)
                            premium_raw = layer.get("premium", 0)

                            aggregate_limit = int(float(limit_raw)) if limit_raw else 0
                            our_attachment = int(float(attachment_raw)) if attachment_raw else 0
                            # Get premium from layer if not set at quote level
                            if not our_premium:
                                our_premium = int(float(premium_raw)) if premium_raw else 0
                            break
                    # Fallback if no CMAI layer found
                    if aggregate_limit == 0 and tower_json:
                        fallback_limit = tower_json[0].get("limit", 0)
                        fallback_attachment = tower_json[0].get("attachment", 0)
                        aggregate_limit = int(float(fallback_limit)) if fallback_limit else 0
                        our_attachment = int(float(fallback_attachment)) if fallback_attachment else 0
                else:
                    # For primary, find the primary layer (attachment = 0)
                    for layer in tower_json:
                        limit_raw = layer.get("limit", 0)
                        attachment_raw = layer.get("attachment", 0)
                        attachment = int(float(attachment_raw)) if attachment_raw else 0
                        if attachment == 0:  # Primary layer
                            aggregate_limit = int(float(limit_raw)) if limit_raw else 0
                            break
                    # Fallback to first layer
                    if aggregate_limit == 0 and tower_json:
                        fallback_limit = tower_json[0].get("limit", 0)
                        aggregate_limit = int(float(fallback_limit)) if fallback_limit else 0

            context["aggregate_limit"] = aggregate_limit
            context["retention"] = int(retention or 0)
            context["our_attachment"] = our_attachment
            context["premium"] = int(our_premium or 0)
            context["position"] = position
            context["policy_form"] = policy_form
            context["quote_name"] = quote_name

            # Generate display name for document listing
            if position == "excess":
                context["display_name"] = format_quote_display_name(aggregate_limit, our_attachment, position)
            else:
                context["display_name"] = format_quote_display_name(aggregate_limit, retention, position)

            # Parse coverages - build from config if not in database
            agg_cov = coverages.get("aggregate_coverages", {})
            sub_cov = coverages.get("sublimit_coverages", {})

            # If coverages are empty, build from coverage config
            if not agg_cov and not sub_cov:
                form = policy_form or get_default_policy_form()
                built_coverages = get_coverages_for_form(form, aggregate_limit)
                agg_cov = built_coverages.get("aggregate_coverages", {})
                sub_cov = built_coverages.get("sublimit_coverages", {})

            # Convert coverage IDs to labels for display
            context["aggregate_coverages"] = {
                get_coverage_label(k): v for k, v in agg_cov.items() if v > 0
            }

            # For excess quotes, use sublimits from database with proper attachment calculation
            if position == "excess" and sublimits:
                # Count underlying layers (layers below CMAI)
                num_underlying = 0
                for layer in tower_json:
                    if "CMAI" not in layer.get("carrier", ""):
                        num_underlying += 1

                # Build sublimit coverages with drop-down attachment
                # Format: {coverage_name: {"limit": X, "attachment": Y}}
                excess_sublimits = {}
                for sub in sublimits:
                    cov_name = sub.get("coverage", "")
                    # Handle various numeric formats (int, float, string)
                    primary_limit_raw = sub.get("primary_limit", 0)
                    primary_limit = int(float(primary_limit_raw)) if primary_limit_raw else 0
                    if primary_limit > 0:
                        # Attachment = primary_limit × number of underlying layers
                        attachment = primary_limit * num_underlying
                        excess_sublimits[cov_name] = {
                            "limit": primary_limit,
                            "attachment": attachment
                        }

                context["sublimit_coverages"] = excess_sublimits
                context["has_dropdown_sublimits"] = len(excess_sublimits) > 0
            else:
                context["sublimit_coverages"] = {
                    get_coverage_label(k): v for k, v in sub_cov.items() if v > 0
                }
                context["has_dropdown_sublimits"] = False

            # Endorsements as list of strings
            if isinstance(endorsements, list):
                context["endorsements"] = endorsements.copy()
            elif isinstance(endorsements, dict):
                context["endorsements"] = list(endorsements.keys())
            else:
                context["endorsements"] = []

            # Tower data for excess quotes
            context["tower"] = tower_json

            # For excess quotes with drop-down sublimits: add endorsement
            if context["has_dropdown_sublimits"]:
                drop_down_endorsement = "Drop Down Over Sublimits"
                if drop_down_endorsement not in context["endorsements"]:
                    context["endorsements"].insert(0, drop_down_endorsement)

            # Subjectivities (placeholder for now)
            context["subjectivities"] = []

            # Terms text
            context["terms"] = """Coverage is subject to the terms, conditions, and exclusions of the policy. This quote is valid for 30 days from the date of issuance. Binding is subject to receipt of completed application, premium payment, and underwriter approval. Claims-made policy form applies; coverage is provided for claims first made during the policy period. Defense costs are included within the policy limit unless otherwise stated."""

    return context


def render_and_upload(template_name: str, context: dict, doc_type: str) -> str:
    """
    Render template to PDF and upload to Supabase.

    Returns the public URL of the uploaded PDF.
    """
    # Render HTML
    template = TEMPLATE_ENV.get_template(template_name)
    html_content = template.render(**context)

    # Generate PDF
    with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        HTML(string=html_content).write_pdf(tmp.name)
        pdf_path = Path(tmp.name)

    try:
        # Upload to Supabase
        bucket = "quotes"
        key = f"{doc_type}/{uuid.uuid4()}.pdf"

        with pdf_path.open("rb") as f:
            SB.storage.from_(bucket).upload(
                key,
                f,
                {"content-type": "application/pdf"}
            )

        # Get public URL
        base_url = os.getenv("SUPABASE_URL")
        pdf_url = f"{base_url}/storage/v1/object/public/{bucket}/{key}"

        return pdf_url

    finally:
        # Clean up temp file
        pdf_path.unlink(missing_ok=True)


def get_documents(submission_id: str) -> list[dict]:
    """Get all documents for a submission."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                pd.id, pd.document_type, pd.document_number, pd.pdf_url,
                pd.version, pd.status, pd.created_by, pd.created_at,
                pd.document_json->>'display_name' as display_name,
                pd.document_json->>'quote_name' as quote_name
            FROM policy_documents pd
            WHERE pd.submission_id = :submission_id
            ORDER BY pd.created_at DESC
        """), {"submission_id": submission_id})

        return [
            {
                "id": str(row[0]),
                "document_type": row[1],
                "document_number": row[2],
                "pdf_url": row[3],
                "version": row[4],
                "status": row[5],
                "created_by": row[6],
                "created_at": row[7],
                "display_name": row[8] or "",
                "quote_name": row[9],
                "type_label": DOCUMENT_TYPES.get(row[1], {}).get("label", row[1]),
            }
            for row in result.fetchall()
        ]


def get_documents_for_quote(quote_option_id: str) -> list[dict]:
    """Get all documents for a specific quote option."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                pd.id, pd.document_type, pd.document_number, pd.pdf_url,
                pd.version, pd.status, pd.created_by, pd.created_at,
                pd.document_json->>'display_name' as display_name,
                pd.document_json->>'quote_name' as quote_name
            FROM policy_documents pd
            WHERE pd.quote_option_id = :quote_option_id
            ORDER BY pd.created_at DESC
        """), {"quote_option_id": quote_option_id})

        return [
            {
                "id": str(row[0]),
                "document_type": row[1],
                "document_number": row[2],
                "pdf_url": row[3],
                "version": row[4],
                "status": row[5],
                "created_by": row[6],
                "created_at": row[7],
                "display_name": row[8] or "",
                "quote_name": row[9],
                "type_label": DOCUMENT_TYPES.get(row[1], {}).get("label", row[1]),
            }
            for row in result.fetchall()
        ]


def _void_previous_quotes_for_option(quote_option_id: str, doc_type: str) -> int:
    """
    Void any previous quote documents for this option.

    Ensures one quote per option - when generating a new quote,
    previous quotes for the same option are voided.

    Args:
        quote_option_id: UUID of the quote option
        doc_type: Document type (quote_primary or quote_excess)

    Returns:
        Number of documents voided
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE policy_documents
            SET status = 'void',
                voided_at = now(),
                void_reason = 'Superseded by new quote'
            WHERE quote_option_id = :quote_option_id
            AND document_type = :doc_type
            AND status != 'void'
        """), {
            "quote_option_id": quote_option_id,
            "doc_type": doc_type
        })
        return result.rowcount


def void_document(document_id: str, reason: str, voided_by: str) -> bool:
    """Void a document."""
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE policy_documents
            SET status = 'void',
                voided_at = now(),
                voided_by = :voided_by,
                void_reason = :reason
            WHERE id = :document_id
        """), {
            "document_id": document_id,
            "voided_by": voided_by,
            "reason": reason
        })
        return result.rowcount > 0


def _generate_document_number(prefix: str) -> str:
    """Generate a unique document number."""
    year = datetime.now().year
    random_suffix = str(uuid.uuid4())[:6].upper()
    return f"{prefix}-{year}-{random_suffix}"


def link_quote_to_policy(quote_option_id: str, submission_id: str) -> bool:
    """
    Mark the quote document for this option as the bound quote.

    When a quote option is bound, we mark its quote document so it appears
    in the Policy Documents list alongside binders and endorsements.

    Args:
        quote_option_id: UUID of the bound quote option (insurance_towers)
        submission_id: UUID of the submission

    Returns:
        True if a document was marked, False otherwise
    """
    with get_conn() as conn:
        # First, clear any previously bound quote for this submission
        conn.execute(text("""
            UPDATE policy_documents
            SET is_bound_quote = FALSE
            WHERE submission_id = :submission_id
            AND is_bound_quote = TRUE
        """), {"submission_id": submission_id})

        # Mark the quote document(s) for this option as bound
        result = conn.execute(text("""
            UPDATE policy_documents
            SET is_bound_quote = TRUE
            WHERE quote_option_id = :quote_option_id
            AND document_type IN ('quote_primary', 'quote_excess')
            AND status != 'void'
        """), {"quote_option_id": quote_option_id})

        conn.commit()
        return result.rowcount > 0


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
    # Serialize context for JSON storage (handle dates)
    serializable_json = {}
    for key, value in document_json.items():
        if isinstance(value, (date, datetime)):
            serializable_json[key] = value.isoformat()
        elif isinstance(value, dict) or isinstance(value, list):
            serializable_json[key] = value
        else:
            serializable_json[key] = str(value) if value is not None else None

    with get_conn() as conn:
        # Void any existing documents of the same type for this quote option
        conn.execute(text("""
            UPDATE policy_documents
            SET status = 'void'
            WHERE quote_option_id = :quote_option_id
            AND document_type = :doc_type
            AND status != 'void'
        """), {
            "quote_option_id": quote_option_id,
            "doc_type": doc_type,
        })

        # Insert the new document
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
