"""
Policy Form Catalog Manager

Manages the catalog of insurance policy forms and endorsements.
Follows the "extract once, reuse forever" principle - when we see a form
for the first time, we do full extraction and AI analysis. For subsequent
encounters, we pull from the catalog and only extract variable data (fill-ins).

Integrates with:
- coverage_catalog: Links form coverages to normalized tags
- document_router: Uses form detection to plan extraction
- extraction pipeline: Stores extracted form data
"""
from __future__ import annotations

from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
import json
import os
import re

from sqlalchemy import text
from core.db import get_conn
from core.document_router import detect_form_numbers, find_key_pages


# ─────────────────────────────────────────────────────────────────────────────
# Coverage Normalization Constants (same as sublimit_intel.py)
# ─────────────────────────────────────────────────────────────────────────────

STANDARD_COVERAGE_TAGS = [
    "Network Security Liability",
    "Privacy Liability",
    "Privacy Regulatory Defense",
    "Privacy Regulatory Penalties",
    "PCI DSS Assessment",
    "Media Liability",
    "Business Interruption",
    "System Failure (Non-Malicious BI)",
    "Dependent BI - IT Providers",
    "Dependent BI - Non-IT Providers",
    "Cyber Extortion / Ransomware",
    "Data Recovery / Restoration",
    "Reputational Harm",
    "Crisis Management / PR",
    "Technology E&O",
    "Social Engineering",
    "Invoice Manipulation",
    "Funds Transfer Fraud",
    "Telecommunications Fraud",
    "Breach Response / Notification",
    "Forensics",
    "Credit Monitoring",
    "Cryptojacking",
    "Betterment",
    "Bricking",
    "Event Response",
    "Computer Fraud",
    "Other",
]


# ─────────────────────────────────────────────────────────────────────────────
# Data Classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PolicyForm:
    """A cataloged policy form."""
    id: str
    form_number: str
    form_name: Optional[str]
    form_type: str  # 'base_policy', 'endorsement', 'schedule'
    carrier: Optional[str]
    edition_date: Optional[datetime]
    coverage_grants: Optional[List[dict]]
    exclusions: Optional[List[dict]]
    definitions: Optional[dict]
    conditions: Optional[List[dict]]
    key_provisions: Optional[List[dict]]
    sublimit_fields: Optional[List[str]]
    times_referenced: int = 0


@dataclass
class FormMatch:
    """Result of matching a form number against the catalog."""
    form_number: str
    status: str  # 'matched', 'queued', 'queued_new', 'not_found'
    catalog_entry: Optional[PolicyForm] = None
    queue_id: Optional[str] = None


@dataclass
class FillInValue:
    """A variable value extracted from a specific policy."""
    field_category: str  # 'limit', 'sublimit', 'retention', 'date', 'name', 'schedule_item'
    field_name: str
    field_value: str
    field_value_numeric: Optional[float] = None
    page: Optional[int] = None
    bbox: Optional[dict] = None
    form_number: Optional[str] = None
    confidence: Optional[float] = None


# ─────────────────────────────────────────────────────────────────────────────
# AI Coverage Normalization
# ─────────────────────────────────────────────────────────────────────────────

def normalize_coverage_tags(coverages: List[dict]) -> List[dict]:
    """
    Normalize coverage names to standard tags using AI.

    This uses the same standard tags as parse_coverages_from_document()
    in sublimit_intel.py to ensure consistency.

    Args:
        coverages: List of coverage dicts with 'name' or 'coverage' field

    Returns:
        Same list with 'coverage_normalized' array added to each
    """
    if not coverages:
        return coverages

    try:
        from openai import OpenAI

        key = os.getenv("OPENAI_API_KEY")
        if not key:
            # Fallback: return coverages with ["Other"] tags
            return [
                {**cov, "coverage_normalized": ["Other"]}
                for cov in coverages
            ]

        client = OpenAI(api_key=key)
        model = os.getenv("TOWER_AI_MODEL", "gpt-5.1")

        # Build prompt with coverage list
        coverage_list = []
        for i, cov in enumerate(coverages):
            name = cov.get("name") or cov.get("coverage", "")
            desc = cov.get("description", "")
            coverage_list.append(f"{i+1}. {name}: {desc}" if desc else f"{i+1}. {name}")

        system_prompt = """You are an expert insurance policy analyst. Map carrier-specific coverage names to standardized industry tags.

For each coverage, provide an array of standardized tags that best describe it. One coverage may map to multiple tags if it covers multiple areas.

Standard tags to use:
""" + "\n".join(f"- {tag}" for tag in STANDARD_COVERAGE_TAGS)

        user_prompt = f"""Map these coverages to standard tags:

{chr(10).join(coverage_list)}

Return JSON with this schema:
{{
  "mappings": [
    {{
      "index": 1,
      "coverage_normalized": ["Tag1", "Tag2"]
    }}
  ]
}}

Rules:
- Use ONLY tags from the standard list above
- Use "Other" only if no standard tag fits
- One coverage can have multiple tags (e.g., "Privacy Liability" + "Privacy Regulatory Defense")
- Be specific: prefer "Privacy Liability" over generic "Other"
"""

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        mappings = {m["index"]: m["coverage_normalized"] for m in data.get("mappings", [])}

        # Apply mappings to coverages
        result = []
        for i, cov in enumerate(coverages):
            normalized = mappings.get(i + 1, ["Other"])
            # Validate tags against standard list
            validated = [t for t in normalized if t in STANDARD_COVERAGE_TAGS]
            if not validated:
                validated = ["Other"]
            result.append({**cov, "coverage_normalized": validated})

        return result

    except Exception as e:
        # On error, return with "Other" tags but log the error
        import logging
        logging.warning(f"Coverage normalization failed: {e}")
        return [
            {**cov, "coverage_normalized": ["Other"]}
            for cov in coverages
        ]


# ─────────────────────────────────────────────────────────────────────────────
# Catalog Lookup
# ─────────────────────────────────────────────────────────────────────────────

def lookup_form(
    form_number: str,
    carrier: Optional[str] = None,
) -> Optional[PolicyForm]:
    """
    Look up a policy form in the catalog.

    Args:
        form_number: The form identifier (e.g., "ISO CG 00 01 04 13")
        carrier: Optional carrier name to narrow search

    Returns:
        PolicyForm if found, None otherwise
    """
    with get_conn() as conn:
        if carrier:
            result = conn.execute(text("""
                SELECT * FROM policy_form_catalog
                WHERE form_number = :form_number
                AND (carrier = :carrier OR carrier IS NULL)
                ORDER BY carrier IS NOT NULL DESC
                LIMIT 1
            """), {"form_number": form_number, "carrier": carrier})
        else:
            result = conn.execute(text("""
                SELECT * FROM policy_form_catalog
                WHERE form_number = :form_number
                LIMIT 1
            """), {"form_number": form_number})

        row = result.mappings().fetchone()
        if not row:
            return None

        return PolicyForm(
            id=str(row["id"]),
            form_number=row["form_number"],
            form_name=row["form_name"],
            form_type=row["form_type"],
            carrier=row["carrier"],
            edition_date=row["edition_date"],
            coverage_grants=row["coverage_grants"],
            exclusions=row["exclusions"],
            definitions=row["definitions"],
            conditions=row["conditions"],
            key_provisions=row["key_provisions"],
            sublimit_fields=row["sublimit_fields"],
            times_referenced=row["times_referenced"] or 0,
        )


def lookup_forms_batch(form_numbers: List[str], carrier: Optional[str] = None) -> Dict[str, PolicyForm]:
    """
    Look up multiple forms at once.

    Returns:
        Dict mapping form_number to PolicyForm for found forms
    """
    if not form_numbers:
        return {}

    with get_conn() as conn:
        # Use ANY for batch lookup
        if carrier:
            result = conn.execute(text("""
                SELECT * FROM policy_form_catalog
                WHERE form_number = ANY(:form_numbers)
                AND (carrier = :carrier OR carrier IS NULL)
            """), {"form_numbers": form_numbers, "carrier": carrier})
        else:
            result = conn.execute(text("""
                SELECT * FROM policy_form_catalog
                WHERE form_number = ANY(:form_numbers)
            """), {"form_numbers": form_numbers})

        found = {}
        for row in result.mappings():
            form = PolicyForm(
                id=str(row["id"]),
                form_number=row["form_number"],
                form_name=row["form_name"],
                form_type=row["form_type"],
                carrier=row["carrier"],
                edition_date=row["edition_date"],
                coverage_grants=row["coverage_grants"],
                exclusions=row["exclusions"],
                definitions=row["definitions"],
                conditions=row["conditions"],
                key_provisions=row["key_provisions"],
                sublimit_fields=row["sublimit_fields"],
                times_referenced=row["times_referenced"] or 0,
            )
            # Prefer carrier-specific over generic
            if form.form_number not in found or (form.carrier and not found[form.form_number].carrier):
                found[form.form_number] = form

        return found


def increment_reference_count(form_id: str) -> None:
    """Increment the reference count for a cataloged form."""
    with get_conn() as conn:
        conn.execute(text("""
            UPDATE policy_form_catalog
            SET times_referenced = times_referenced + 1
            WHERE id = :form_id
        """), {"form_id": form_id})


# ─────────────────────────────────────────────────────────────────────────────
# Form Matching (Catalog + Queue)
# ─────────────────────────────────────────────────────────────────────────────

def match_form(
    form_number: str,
    carrier: Optional[str] = None,
    source_document_id: Optional[str] = None,
    page_start: Optional[int] = None,
    page_end: Optional[int] = None,
) -> FormMatch:
    """
    Match a form number against the catalog, queueing for extraction if not found.

    This is the primary entry point for the "extract once, reuse forever" pattern:
    1. If form is in catalog → return it, increment reference count
    2. If form is already queued → return queue status
    3. If form is unknown → queue for extraction

    Args:
        form_number: The form identifier
        carrier: Optional carrier name
        source_document_id: Document where form was found (for extraction queue)
        page_start: Starting page of form in source document
        page_end: Ending page of form in source document

    Returns:
        FormMatch with status and catalog/queue info
    """
    # Try catalog first
    form = lookup_form(form_number, carrier)
    if form:
        increment_reference_count(form.id)
        return FormMatch(
            form_number=form_number,
            status="matched",
            catalog_entry=form,
        )

    # Check if already queued
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, status FROM form_extraction_queue
            WHERE form_number = :form_number
            AND (carrier = :carrier OR (carrier IS NULL AND :carrier IS NULL))
            AND status IN ('pending', 'processing')
            LIMIT 1
        """), {"form_number": form_number, "carrier": carrier})

        row = result.fetchone()
        if row:
            return FormMatch(
                form_number=form_number,
                status="queued",
                queue_id=str(row[0]),
            )

        # Queue for extraction
        result = conn.execute(text("""
            INSERT INTO form_extraction_queue (
                form_number, carrier, source_document_id, page_start, page_end
            ) VALUES (
                :form_number, :carrier, :source_document_id, :page_start, :page_end
            )
            RETURNING id
        """), {
            "form_number": form_number,
            "carrier": carrier,
            "source_document_id": source_document_id,
            "page_start": page_start,
            "page_end": page_end,
        })

        queue_id = str(result.fetchone()[0])
        return FormMatch(
            form_number=form_number,
            status="queued_new",
            queue_id=queue_id,
        )


def match_forms_from_document(
    document_id: str,
    pages_text: List[str],
    carrier: Optional[str] = None,
) -> Tuple[Dict[str, FormMatch], dict]:
    """
    Detect and match all forms in a document.

    Uses document_router's detection to find form numbers, then matches
    each against the catalog.

    Args:
        document_id: The document being processed
        pages_text: List of text content by page (index 0 = page 1)
        carrier: Optional carrier name

    Returns:
        Tuple of:
        - Dict mapping form_number to FormMatch
        - Key pages info from find_key_pages()
    """
    # Find key pages and form numbers
    key_pages = find_key_pages(pages_text)
    form_numbers = key_pages["form_numbers"]

    # Match each form
    matches = {}
    for form_num in form_numbers:
        matches[form_num] = match_form(
            form_number=form_num,
            carrier=carrier,
            source_document_id=document_id,
        )

    return matches, key_pages


# ─────────────────────────────────────────────────────────────────────────────
# Catalog Submission (Add New Forms)
# ─────────────────────────────────────────────────────────────────────────────

def add_form_to_catalog(
    form_number: str,
    form_type: str,
    full_text: Optional[str] = None,
    form_name: Optional[str] = None,
    carrier: Optional[str] = None,
    edition_date: Optional[datetime] = None,
    page_count: Optional[int] = None,
    coverage_grants: Optional[List[dict]] = None,
    exclusions: Optional[List[dict]] = None,
    definitions: Optional[dict] = None,
    conditions: Optional[List[dict]] = None,
    key_provisions: Optional[List[dict]] = None,
    sublimit_fields: Optional[List[str]] = None,
    extraction_source: Optional[str] = None,
    extraction_cost: Optional[float] = None,
    source_document_path: Optional[str] = None,
    source_document_id: Optional[str] = None,
) -> str:
    """
    Add a new policy form to the catalog.

    This is called after full extraction and AI analysis of a new form.

    Args:
        source_document_path: Path or URL to the original document file
        source_document_id: UUID reference to documents table if uploaded through system

    Returns:
        The catalog entry ID
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO policy_form_catalog (
                form_number, form_name, form_type, carrier, edition_date,
                full_text, page_count,
                coverage_grants, exclusions, definitions, conditions,
                key_provisions, sublimit_fields,
                extraction_source, extraction_cost,
                source_document_path, source_document_id
            ) VALUES (
                :form_number, :form_name, :form_type, :carrier, :edition_date,
                :full_text, :page_count,
                :coverage_grants, :exclusions, :definitions, :conditions,
                :key_provisions, :sublimit_fields,
                :extraction_source, :extraction_cost,
                :source_document_path, :source_document_id
            )
            ON CONFLICT (form_number, carrier, edition_date)
            DO UPDATE SET
                full_text = COALESCE(EXCLUDED.full_text, policy_form_catalog.full_text),
                coverage_grants = COALESCE(EXCLUDED.coverage_grants, policy_form_catalog.coverage_grants),
                exclusions = COALESCE(EXCLUDED.exclusions, policy_form_catalog.exclusions),
                source_document_path = COALESCE(EXCLUDED.source_document_path, policy_form_catalog.source_document_path),
                source_document_id = COALESCE(EXCLUDED.source_document_id, policy_form_catalog.source_document_id),
                updated_at = now()
            RETURNING id
        """), {
            "form_number": form_number,
            "form_name": form_name,
            "form_type": form_type,
            "carrier": carrier,
            "edition_date": edition_date,
            "full_text": full_text,
            "page_count": page_count,
            "coverage_grants": json.dumps(coverage_grants) if coverage_grants else None,
            "exclusions": json.dumps(exclusions) if exclusions else None,
            "definitions": json.dumps(definitions) if definitions else None,
            "conditions": json.dumps(conditions) if conditions else None,
            "key_provisions": json.dumps(key_provisions) if key_provisions else None,
            "sublimit_fields": sublimit_fields,
            "extraction_source": extraction_source,
            "extraction_cost": extraction_cost,
            "source_document_path": source_document_path,
            "source_document_id": source_document_id,
        })

        return str(result.fetchone()[0])


# ─────────────────────────────────────────────────────────────────────────────
# Extraction Queue Management
# ─────────────────────────────────────────────────────────────────────────────

def get_pending_extractions(limit: int = 10) -> List[dict]:
    """
    Get forms pending extraction, ordered by priority.

    Returns:
        List of queue entries with source document info
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                q.id,
                q.form_number,
                q.carrier,
                q.priority,
                q.source_document_id,
                q.page_start,
                q.page_end,
                q.created_at,
                d.filename as source_filename
            FROM form_extraction_queue q
            LEFT JOIN documents d ON q.source_document_id = d.id
            WHERE q.status = 'pending'
            ORDER BY q.priority, q.created_at
            LIMIT :limit
        """), {"limit": limit})

        return [dict(row) for row in result.mappings()]


def start_extraction(queue_id: str) -> bool:
    """Mark a queue entry as being processed."""
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE form_extraction_queue
            SET status = 'processing', started_at = now()
            WHERE id = :queue_id AND status = 'pending'
        """), {"queue_id": queue_id})

        return result.rowcount > 0


def complete_extraction(queue_id: str, catalog_entry_id: str) -> bool:
    """Mark a queue entry as completed with its catalog entry."""
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE form_extraction_queue
            SET status = 'completed',
                completed_at = now(),
                catalog_entry_id = :catalog_entry_id
            WHERE id = :queue_id
        """), {"queue_id": queue_id, "catalog_entry_id": catalog_entry_id})

        return result.rowcount > 0


def fail_extraction(queue_id: str, error_message: str) -> bool:
    """Mark a queue entry as failed."""
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE form_extraction_queue
            SET status = 'failed',
                completed_at = now(),
                error_message = :error_message
            WHERE id = :queue_id
        """), {"queue_id": queue_id, "error_message": error_message})

        return result.rowcount > 0


def retry_failed_extraction(queue_id: str) -> bool:
    """Reset a failed extraction to pending for retry."""
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE form_extraction_queue
            SET status = 'pending',
                started_at = NULL,
                completed_at = NULL,
                error_message = NULL
            WHERE id = :queue_id AND status = 'failed'
        """), {"queue_id": queue_id})

        return result.rowcount > 0


# ─────────────────────────────────────────────────────────────────────────────
# Fill-In Values (Per-Policy Variable Data)
# ─────────────────────────────────────────────────────────────────────────────

def save_fill_in_values(
    document_id: str,
    fill_ins: List[FillInValue],
    submission_id: Optional[str] = None,
    extractor: Optional[str] = None,
) -> int:
    """
    Save extracted fill-in values for a policy document.

    These are the variable values (limits, sublimits, dates, etc.) that
    are specific to each policy, as opposed to the boilerplate form language.

    Returns:
        Number of values saved
    """
    if not fill_ins:
        return 0

    with get_conn() as conn:
        count = 0
        for fill_in in fill_ins:
            conn.execute(text("""
                INSERT INTO policy_fill_in_values (
                    document_id, submission_id,
                    field_category, field_name, field_label,
                    field_value, field_value_numeric, page, bbox,
                    form_number, confidence, extractor
                ) VALUES (
                    :document_id, :submission_id,
                    :field_category, :field_name, :field_label,
                    :field_value, :field_value_numeric, :page, :bbox,
                    :form_number, :confidence, :extractor
                )
            """), {
                "document_id": document_id,
                "submission_id": submission_id,
                "field_category": fill_in.field_category,
                "field_name": fill_in.field_name,
                "field_label": fill_in.field_name,  # Can be customized
                "field_value": fill_in.field_value,
                "field_value_numeric": fill_in.field_value_numeric,
                "page": fill_in.page,
                "bbox": json.dumps(fill_in.bbox) if fill_in.bbox else None,
                "form_number": fill_in.form_number,
                "confidence": fill_in.confidence,
                "extractor": extractor,
            })
            count += 1

        return count


def get_fill_in_values(
    document_id: Optional[str] = None,
    submission_id: Optional[str] = None,
    field_category: Optional[str] = None,
) -> List[dict]:
    """
    Get fill-in values for a document or submission.

    Returns:
        List of fill-in value dicts with bbox info for highlighting
    """
    with get_conn() as conn:
        conditions = []
        params = {}

        if document_id:
            conditions.append("document_id = :document_id")
            params["document_id"] = document_id
        if submission_id:
            conditions.append("submission_id = :submission_id")
            params["submission_id"] = submission_id
        if field_category:
            conditions.append("field_category = :field_category")
            params["field_category"] = field_category

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        result = conn.execute(text(f"""
            SELECT * FROM policy_fill_in_values
            WHERE {where_clause}
            ORDER BY field_category, field_name
        """), params)

        return [dict(row) for row in result.mappings()]


# ─────────────────────────────────────────────────────────────────────────────
# Declarations (Structured Dec Page Data)
# ─────────────────────────────────────────────────────────────────────────────

def save_declarations(
    document_id: str,
    policy_number: Optional[str] = None,
    carrier: Optional[str] = None,
    named_insured: Optional[str] = None,
    insured_address: Optional[str] = None,
    effective_date: Optional[datetime] = None,
    expiration_date: Optional[datetime] = None,
    limits: Optional[dict] = None,
    retentions: Optional[dict] = None,
    premium_total: Optional[float] = None,
    premium_by_coverage: Optional[dict] = None,
    form_schedule: Optional[List[str]] = None,
    submission_id: Optional[str] = None,
    source_pages: Optional[List[int]] = None,
    field_locations: Optional[dict] = None,
    extractor: Optional[str] = None,
    confidence: Optional[float] = None,
) -> str:
    """
    Save structured declarations page data.

    Returns:
        The declarations entry ID
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO policy_declarations (
                document_id, submission_id,
                policy_number, carrier, named_insured, insured_address,
                effective_date, expiration_date,
                limits, retentions, premium_total, premium_by_coverage,
                form_schedule, source_pages, field_locations,
                extractor, extraction_confidence
            ) VALUES (
                :document_id, :submission_id,
                :policy_number, :carrier, :named_insured, :insured_address,
                :effective_date, :expiration_date,
                :limits, :retentions, :premium_total, :premium_by_coverage,
                :form_schedule, :source_pages, :field_locations,
                :extractor, :confidence
            )
            ON CONFLICT (document_id) DO UPDATE SET
                policy_number = COALESCE(EXCLUDED.policy_number, policy_declarations.policy_number),
                carrier = COALESCE(EXCLUDED.carrier, policy_declarations.carrier),
                limits = COALESCE(EXCLUDED.limits, policy_declarations.limits),
                retentions = COALESCE(EXCLUDED.retentions, policy_declarations.retentions),
                extracted_at = now()
            RETURNING id
        """), {
            "document_id": document_id,
            "submission_id": submission_id,
            "policy_number": policy_number,
            "carrier": carrier,
            "named_insured": named_insured,
            "insured_address": insured_address,
            "effective_date": effective_date,
            "expiration_date": expiration_date,
            "limits": json.dumps(limits) if limits else None,
            "retentions": json.dumps(retentions) if retentions else None,
            "premium_total": premium_total,
            "premium_by_coverage": json.dumps(premium_by_coverage) if premium_by_coverage else None,
            "form_schedule": form_schedule,
            "source_pages": source_pages,
            "field_locations": json.dumps(field_locations) if field_locations else None,
            "extractor": extractor,
            "confidence": confidence,
        })

        return str(result.fetchone()[0])


def get_declarations(document_id: str) -> Optional[dict]:
    """Get declarations data for a document."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT * FROM policy_declarations
            WHERE document_id = :document_id
        """), {"document_id": document_id})

        row = result.mappings().fetchone()
        return dict(row) if row else None


# ─────────────────────────────────────────────────────────────────────────────
# Coverage Catalog Integration
# ─────────────────────────────────────────────────────────────────────────────

def sync_form_coverages_to_catalog(
    form_id: str,
    carrier: str,
    policy_form: str,
    coverages: List[dict],
    source_submission_id: Optional[str] = None,
    use_ai_normalization: bool = True,
) -> int:
    """
    Sync coverage grants from a policy form to the coverage catalog.

    When we catalog a new policy form, we can auto-submit its coverages
    to the coverage catalog for normalization.

    Args:
        form_id: The policy_form_catalog entry ID
        carrier: Carrier name
        policy_form: Form identifier (e.g., "CY 01 2023")
        coverages: List of coverage dicts with 'coverage' and optional 'coverage_normalized'
        source_submission_id: Submission where form was found
        use_ai_normalization: If True, use AI to normalize coverages that don't have tags

    Returns:
        Number of coverages submitted to catalog
    """
    # Import here to avoid circular dependency
    from pages_components.coverage_catalog_db import submit_coverage_mapping

    # Check if any coverages need normalization
    needs_normalization = any(
        not cov.get("coverage_normalized") or cov.get("coverage_normalized") == ["Other"]
        for cov in coverages
    )

    # Apply AI normalization if needed
    if needs_normalization and use_ai_normalization:
        # Convert to format expected by normalize_coverage_tags
        cov_list = [
            {"name": cov.get("name") or cov.get("coverage", ""), "description": cov.get("description", "")}
            for cov in coverages
        ]
        normalized_list = normalize_coverage_tags(cov_list)

        # Merge normalized tags back into original coverages
        for i, cov in enumerate(coverages):
            if i < len(normalized_list):
                cov["coverage_normalized"] = normalized_list[i].get("coverage_normalized", ["Other"])

    count = 0
    for cov in coverages:
        coverage_name = cov.get("name") or cov.get("coverage", "")
        normalized = cov.get("coverage_normalized", ["Other"])

        if coverage_name:
            result = submit_coverage_mapping(
                carrier_name=carrier,
                coverage_original=coverage_name,
                coverage_normalized=normalized if isinstance(normalized, list) else [normalized],
                policy_form=policy_form,
                coverage_description=cov.get("description"),
                notes=f"Auto-submitted from policy form catalog (form_id: {form_id})",
                source_submission_id=source_submission_id,
            )
            if result:
                count += 1

    return count


def resync_form_coverages(
    form_id: str,
    source_submission_id: Optional[str] = None,
) -> int:
    """
    Re-sync coverages from a cataloged form, applying AI normalization.

    This is useful when a form was initially synced with ["Other"] tags
    and needs to be re-normalized.

    Args:
        form_id: The policy_form_catalog entry ID
        source_submission_id: Optional submission context

    Returns:
        Number of coverages updated
    """
    # Get the form from catalog
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT form_number, carrier, coverage_grants
            FROM policy_form_catalog
            WHERE id = :form_id
        """), {"form_id": form_id})

        row = result.mappings().fetchone()
        if not row:
            return 0

        form_number = row["form_number"]
        carrier = row["carrier"]
        coverage_grants = row["coverage_grants"] or []

        # Parse if JSON string
        if isinstance(coverage_grants, str):
            coverage_grants = json.loads(coverage_grants)

        if not coverage_grants or not carrier:
            return 0

        # Re-sync with AI normalization forced on
        return sync_form_coverages_to_catalog(
            form_id=form_id,
            carrier=carrier,
            policy_form=form_number,
            coverages=coverage_grants,
            source_submission_id=source_submission_id,
            use_ai_normalization=True,
        )


def get_form_coverages_from_catalog(
    carrier: str,
    policy_form: str,
) -> List[dict]:
    """
    Get normalized coverages for a policy form from the coverage catalog.

    This is the reverse lookup - given a form, what coverages does it provide?

    Returns:
        List of coverage mappings from coverage_catalog
    """
    from pages_components.coverage_catalog_db import get_carrier_coverages

    return get_carrier_coverages(carrier, policy_form, approved_only=True)


# ─────────────────────────────────────────────────────────────────────────────
# Statistics
# ─────────────────────────────────────────────────────────────────────────────

def get_catalog_stats() -> dict:
    """Get summary statistics for the policy form catalog."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_forms,
                COUNT(*) FILTER (WHERE form_type = 'base_policy') as base_policies,
                COUNT(*) FILTER (WHERE form_type = 'endorsement') as endorsements,
                COUNT(DISTINCT carrier) as carriers,
                SUM(times_referenced) as total_references,
                SUM(extraction_cost) as total_extraction_cost
            FROM policy_form_catalog
        """))
        catalog_stats = dict(result.mappings().fetchone())

        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_queue,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM form_extraction_queue
        """))
        queue_stats = dict(result.mappings().fetchone())

        return {
            **catalog_stats,
            "queue": queue_stats,
        }


def get_catalog_by_carrier() -> List[dict]:
    """Get catalog summary grouped by carrier."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                COALESCE(carrier, 'ISO/Standard') as carrier,
                form_type,
                COUNT(*) as form_count,
                SUM(times_referenced) as total_references
            FROM policy_form_catalog
            GROUP BY carrier, form_type
            ORDER BY carrier, form_type
        """))

        return [dict(row) for row in result.mappings()]


# ─────────────────────────────────────────────────────────────────────────────
# Document-Form Linking
# ─────────────────────────────────────────────────────────────────────────────

def link_document_to_form(
    document_id: str,
    form_number: str,
    form_id: Optional[str] = None,
    form_type: Optional[str] = None,
    page_start: Optional[int] = None,
    page_end: Optional[int] = None,
    catalog_status: str = "pending",
) -> str:
    """
    Link a document to a policy form.

    Creates an entry in document_policy_forms tracking which forms
    appear in which documents.

    Returns:
        The link entry ID
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO document_policy_forms (
                document_id, form_id, form_number, form_type,
                page_start, page_end, catalog_status
            ) VALUES (
                :document_id, :form_id, :form_number, :form_type,
                :page_start, :page_end, :catalog_status
            )
            ON CONFLICT DO NOTHING
            RETURNING id
        """), {
            "document_id": document_id,
            "form_id": form_id,
            "form_number": form_number,
            "form_type": form_type,
            "page_start": page_start,
            "page_end": page_end,
            "catalog_status": catalog_status,
        })

        row = result.fetchone()
        return str(row[0]) if row else None


def get_document_forms(document_id: str) -> List[dict]:
    """Get all forms linked to a document with their catalog info."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                dpf.*,
                pfc.form_name,
                pfc.coverage_grants,
                pfc.exclusions,
                pfc.definitions
            FROM document_policy_forms dpf
            LEFT JOIN policy_form_catalog pfc ON dpf.form_id = pfc.id
            WHERE dpf.document_id = :document_id
            ORDER BY dpf.page_start
        """), {"document_id": document_id})

        return [dict(row) for row in result.mappings()]


def update_document_form_status(
    document_id: str,
    form_number: str,
    catalog_status: str,
    form_id: Optional[str] = None,
) -> bool:
    """Update the catalog status for a document-form link."""
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE document_policy_forms
            SET catalog_status = :catalog_status,
                form_id = COALESCE(:form_id, form_id)
            WHERE document_id = :document_id
            AND form_number = :form_number
        """), {
            "document_id": document_id,
            "form_number": form_number,
            "catalog_status": catalog_status,
            "form_id": form_id,
        })

        return result.rowcount > 0


# ─────────────────────────────────────────────────────────────────────────────
# High-Level Orchestration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PolicyExtractionResult:
    """Result of processing a policy document."""
    document_id: str
    carrier: Optional[str]
    key_pages: dict
    form_matches: Dict[str, FormMatch]
    declarations: Optional[dict]
    fill_ins: List[dict]
    forms_in_catalog: int
    forms_queued: int
    extraction_cost_estimate: float


def process_policy_document(
    document_id: str,
    pages_text: List[str],
    carrier: Optional[str] = None,
    submission_id: Optional[str] = None,
    save_to_db: bool = True,
) -> PolicyExtractionResult:
    """
    High-level function to process a policy document.

    This is the main entry point for policy extraction:
    1. Detect form numbers and key pages
    2. Match forms against catalog (queue unknown forms)
    3. Link document to found forms
    4. Return structured result

    Note: This does NOT perform the actual OCR extraction - that's handled
    by the extraction pipeline. This function orchestrates the catalog
    lookups and database updates.

    Args:
        document_id: The document being processed
        pages_text: List of text content by page (already OCR'd)
        carrier: Optional carrier name (helps with form matching)
        submission_id: Submission context
        save_to_db: Whether to save links to database

    Returns:
        PolicyExtractionResult with all extracted/matched data
    """
    from core.document_router import COST_PER_PAGE, ExtractionStrategy

    # Step 1: Detect forms and key pages
    form_matches, key_pages = match_forms_from_document(
        document_id=document_id,
        pages_text=pages_text,
        carrier=carrier,
    )

    # Step 2: Count results
    forms_in_catalog = sum(1 for m in form_matches.values() if m.status == "matched")
    forms_queued = sum(1 for m in form_matches.values() if m.status in ("queued", "queued_new"))

    # Step 3: Link document to forms (if saving)
    if save_to_db:
        for form_num, match in form_matches.items():
            status = "matched" if match.status == "matched" else "queued_for_extraction"
            form_id = match.catalog_entry.id if match.catalog_entry else None

            link_document_to_form(
                document_id=document_id,
                form_number=form_num,
                form_id=form_id,
                catalog_status=status,
            )

    # Step 4: Estimate cost (for queued forms that need extraction)
    page_count = len(pages_text)
    if forms_queued > 0:
        # Need full extraction for new forms
        extraction_cost = page_count * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS]
    else:
        # Just dec pages and fill-ins
        dec_pages = len(key_pages.get("dec_pages", [1, 2, 3]))
        fill_in_pages = len(key_pages.get("endorsement_pages", []))
        extraction_cost = (dec_pages + fill_in_pages) * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS]

    return PolicyExtractionResult(
        document_id=document_id,
        carrier=carrier,
        key_pages=key_pages,
        form_matches=form_matches,
        declarations=None,  # Populated by extraction pipeline
        fill_ins=[],  # Populated by extraction pipeline
        forms_in_catalog=forms_in_catalog,
        forms_queued=forms_queued,
        extraction_cost_estimate=extraction_cost,
    )


def process_extracted_form(
    queue_id: str,
    form_number: str,
    full_text: str,
    carrier: Optional[str] = None,
    form_name: Optional[str] = None,
    form_type: str = "endorsement",
    coverage_grants: Optional[List[dict]] = None,
    exclusions: Optional[List[dict]] = None,
    definitions: Optional[dict] = None,
    extraction_source: str = "textract_forms",
    extraction_cost: Optional[float] = None,
    sync_coverages: bool = True,
    source_submission_id: Optional[str] = None,
) -> str:
    """
    Process a form that was just extracted (from the queue).

    This is called after full extraction and AI analysis of a new form:
    1. Add form to catalog
    2. Mark queue entry as complete
    3. Optionally sync coverages to coverage catalog

    Returns:
        The catalog entry ID
    """
    # Add to catalog
    catalog_id = add_form_to_catalog(
        form_number=form_number,
        form_type=form_type,
        full_text=full_text,
        form_name=form_name,
        carrier=carrier,
        coverage_grants=coverage_grants,
        exclusions=exclusions,
        definitions=definitions,
        extraction_source=extraction_source,
        extraction_cost=extraction_cost,
    )

    # Mark queue entry complete
    complete_extraction(queue_id, catalog_id)

    # Sync coverages if we have them
    if sync_coverages and coverage_grants and carrier:
        sync_form_coverages_to_catalog(
            form_id=catalog_id,
            carrier=carrier,
            policy_form=form_number,
            coverages=coverage_grants,
            source_submission_id=source_submission_id,
        )

    return catalog_id
