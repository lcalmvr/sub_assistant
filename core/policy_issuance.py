"""
Policy Issuance Module

Handles the policy issuance workflow:
1. Pre-issuance validation (subjectivities check)
2. Policy number generation (sequential)
3. Combined PDF generation (Dec Page + Policy Form + Endorsements)
4. Policy status tracking
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, date
from typing import Optional, Tuple

from sqlalchemy import text

from core.db import get_conn
from core.subjectivity_management import get_pending_count
from core.bound_option import get_bound_option


logger = logging.getLogger(__name__)


def can_issue_policy(submission_id: str) -> Tuple[bool, str]:
    """
    Check if a policy can be issued.

    Requirements:
    1. Submission must have a bound option
    2. All subjectivities must be received or waived (pending count = 0)
    3. Policy must not already be issued

    Args:
        submission_id: UUID of the submission

    Returns:
        Tuple of (can_issue: bool, reason: str)
    """
    # Check for bound option
    bound_option = get_bound_option(submission_id)
    if not bound_option:
        return False, "No bound option exists. Bind a quote option first."

    # Check subjectivities
    pending_count = get_pending_count(submission_id)
    if pending_count > 0:
        suffix = "y" if pending_count == 1 else "ies"
        return False, f"{pending_count} subjectivit{suffix} still pending."

    # Check if already issued
    if is_policy_issued(submission_id):
        return False, "Policy has already been issued."

    return True, "Ready to issue"


def is_policy_issued(submission_id: str) -> bool:
    """Check if a policy has already been issued for this submission."""
    with get_conn() as conn:
        result = conn.execute(
            text("""
                SELECT 1 FROM policy_documents
                WHERE submission_id = :submission_id
                AND document_type = 'policy'
                AND status != 'void'
                LIMIT 1
            """),
            {"submission_id": submission_id},
        )
        return result.fetchone() is not None


def get_policy_number(submission_id: str) -> Optional[str]:
    """Get the assigned policy number for a submission."""
    with get_conn() as conn:
        result = conn.execute(
            text("""
                SELECT document_number FROM policy_documents
                WHERE submission_id = :submission_id
                AND document_type = 'policy'
                AND status != 'void'
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"submission_id": submission_id},
        )
        row = result.fetchone()
        return row[0] if row else None


def _get_next_policy_number() -> str:
    """
    Get the next sequential policy number.

    Uses the policy_number_sequence table for atomic increment.
    Format: P-YYYY-000001
    """
    with get_conn() as conn:
        result = conn.execute(text("SELECT get_next_policy_number()"))
        row = result.fetchone()
        if row and row[0]:
            return row[0]

        # Fallback if function doesn't exist yet
        logger.warning("get_next_policy_number() function not found, using fallback")
        year = datetime.now().year
        random_suffix = str(uuid.uuid4())[:6].upper()
        return f"P-{year}-{random_suffix}"


def issue_policy(submission_id: str, issued_by: str = "system") -> dict:
    """
    Issue a policy for a bound submission.

    This function:
    1. Validates pre-issuance requirements
    2. Generates a unique policy number (sequential)
    3. Creates combined PDF (Declarations + Policy Form + Endorsements)
    4. Stores the policy document

    Args:
        submission_id: UUID of the submission
        issued_by: User issuing the policy

    Returns:
        dict with policy_number, pdf_url, document_id

    Raises:
        ValueError: If pre-issuance requirements not met
    """
    # Validate
    can_issue, reason = can_issue_policy(submission_id)
    if not can_issue:
        raise ValueError(reason)

    # Get bound option
    bound_option = get_bound_option(submission_id)
    quote_option_id = bound_option["id"]

    # Generate policy number (sequential)
    policy_number = _get_next_policy_number()

    # Import here to avoid circular imports
    from core.document_generator import (
        get_document_context,
        render_and_upload,
        _save_document,
        TEMPLATE_ENV,
    )

    # Build context for combined document
    context = get_document_context(submission_id, quote_option_id)
    context["policy_number"] = policy_number
    context["document_number"] = policy_number
    context["document_id"] = str(uuid.uuid4())[:8].upper()
    context["generated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    context["issued_at"] = datetime.now().isoformat()

    # Determine policy form template
    policy_form = bound_option.get("policy_form", "cyber")
    context["policy_form_code"] = _get_policy_form_code(policy_form)
    context["policy_form_template"] = f"policy_forms/{policy_form}_form.html"
    context["policy_form_type"] = policy_form

    # Get endorsements attached at binding
    endorsement_documents = _get_bound_endorsements(submission_id, bound_option, context)
    context["endorsement_documents"] = endorsement_documents

    # Render and upload combined PDF
    pdf_url = render_and_upload("policy_combined.html", context, "policy")

    # Save document record
    doc_id = _save_document(
        submission_id=submission_id,
        quote_option_id=quote_option_id,
        doc_type="policy",
        document_number=policy_number,
        pdf_url=pdf_url,
        document_json=context,
        created_by=issued_by,
    )

    # Update submission metadata
    _mark_policy_issued(submission_id, policy_number, issued_by)

    logger.info(f"Policy issued: {policy_number} for submission {submission_id}")

    return {
        "id": doc_id,
        "policy_number": policy_number,
        "pdf_url": pdf_url,
        "issued_at": datetime.now().isoformat(),
        "issued_by": issued_by,
    }


def _get_policy_form_code(policy_form: str) -> str:
    """Get the policy form code for display on the document."""
    codes = {
        "cyber": "CMAI-CY-2025",
        "cyber_tech": "CMAI-CT-2025",
        "tech": "CMAI-TE-2025",
    }
    return codes.get(policy_form, "CMAI-CY-2025")


def _get_bound_endorsements(
    submission_id: str,
    bound_option: dict,
    context: dict,
) -> list[dict]:
    """
    Get endorsements that were attached at binding.

    These come from:
    1. The bound option's 'endorsements' field (as-bound endorsement names)
    2. Auto-attach endorsements from document_library

    Returns list of {code, title, content} dicts for rendering.
    """
    endorsements = []

    # Get as-bound endorsement names from bound option
    bound_endorsement_names = bound_option.get("endorsements", [])
    if not bound_endorsement_names:
        bound_endorsement_names = context.get("endorsements", [])

    # Try to get content from document_library for each endorsement
    try:
        with get_conn() as conn:
            for name in bound_endorsement_names:
                # Try to find matching library entry
                result = conn.execute(
                    text("""
                        SELECT code, title, content_html
                        FROM document_library
                        WHERE (title ILIKE :name OR code ILIKE :name)
                        AND document_type = 'endorsement'
                        AND status = 'active'
                        LIMIT 1
                    """),
                    {"name": f"%{name}%"},
                )
                row = result.fetchone()
                if row:
                    endorsements.append({
                        "code": row[0],
                        "title": row[1],
                        "content": row[2] or "",
                    })
                else:
                    # Create placeholder for endorsement not in library
                    endorsements.append({
                        "code": "",
                        "title": name,
                        "content": f"<p><em>See attached endorsement: {name}</em></p>",
                    })
    except Exception as e:
        logger.warning(f"Error fetching endorsement content: {e}")

    return endorsements


def _mark_policy_issued(submission_id: str, policy_number: str, issued_by: str):
    """Update submission metadata to mark policy as issued."""
    try:
        with get_conn() as conn:
            conn.execute(
                text("""
                    UPDATE submissions
                    SET data_sources = COALESCE(data_sources, '{}'::jsonb) ||
                        jsonb_build_object(
                            'policy_issued', true,
                            'policy_number', :policy_number,
                            'policy_issued_at', :issued_at,
                            'policy_issued_by', :issued_by
                        )
                    WHERE id = :submission_id
                """),
                {
                    "submission_id": submission_id,
                    "policy_number": policy_number,
                    "issued_at": datetime.utcnow().isoformat(),
                    "issued_by": issued_by,
                },
            )
    except Exception as e:
        logger.warning(f"Failed to update submission metadata: {e}")


def get_policy_issuance_status(submission_id: str) -> dict:
    """
    Get comprehensive policy issuance status for UI display.

    Returns:
        dict with:
        - is_bound: bool
        - is_issued: bool
        - can_issue: bool
        - issue_blocker: str or None
        - pending_subjectivities: int
        - policy_number: str or None
        - pdf_url: str or None
    """
    bound_option = get_bound_option(submission_id)
    is_bound = bound_option is not None

    pending_count = get_pending_count(submission_id)

    # Check if already issued
    is_issued = is_policy_issued(submission_id)
    policy_number = None
    pdf_url = None

    if is_issued:
        policy_number = get_policy_number(submission_id)
        # Get PDF URL
        with get_conn() as conn:
            result = conn.execute(
                text("""
                    SELECT pdf_url FROM policy_documents
                    WHERE submission_id = :submission_id
                    AND document_type = 'policy'
                    AND status != 'void'
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"submission_id": submission_id},
            )
            row = result.fetchone()
            if row:
                pdf_url = row[0]

    # Determine if can issue
    can_issue = False
    issue_blocker = None

    if not is_bound:
        issue_blocker = "No bound option"
    elif pending_count > 0:
        suffix = "y" if pending_count == 1 else "ies"
        issue_blocker = f"{pending_count} pending subjectivit{suffix}"
    elif is_issued:
        issue_blocker = "Already issued"
    else:
        can_issue = True

    return {
        "is_bound": is_bound,
        "is_issued": is_issued,
        "can_issue": can_issue,
        "issue_blocker": issue_blocker,
        "pending_subjectivities": pending_count,
        "policy_number": policy_number,
        "pdf_url": pdf_url,
    }


def get_issuance_status(submission_id: str) -> dict:
    """
    Get full issuance readiness with checklist format.

    Returns:
        dict with:
        - can_issue: bool
        - checklist: list of {item, status, required, details}
        - warnings: list of warning strings
        - blocking_items: list of items blocking issuance
        - policy_info: dict with policy_number, pdf_url, issued_at (if issued)
    """
    from core.subjectivity_management import (
        check_deadline_warnings,
        get_critical_pending_count,
        get_subjectivities_summary,
    )

    bound_option = get_bound_option(submission_id)
    is_bound = bound_option is not None
    is_issued = is_policy_issued(submission_id)

    # Get subjectivity counts
    summary = get_subjectivities_summary(submission_id)
    critical_pending = get_critical_pending_count(submission_id)
    deadline_info = check_deadline_warnings(submission_id)

    # Build checklist
    checklist = []

    # 1. Bound option check
    checklist.append({
        "item": "Policy bound",
        "status": "complete" if is_bound else "incomplete",
        "required": True,
        "details": bound_option.get("quote_name") if is_bound else "Bind a quote option first",
    })

    # 2. Binder generated check
    binder_url = None
    if is_bound:
        with get_conn() as conn:
            result = conn.execute(
                text("""
                    SELECT pdf_url FROM policy_documents
                    WHERE submission_id = :submission_id
                    AND document_type = 'binder'
                    AND status != 'void'
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"submission_id": submission_id},
            )
            row = result.fetchone()
            if row:
                binder_url = row[0]

    checklist.append({
        "item": "Binder generated",
        "status": "complete" if binder_url else ("incomplete" if is_bound else "pending"),
        "required": False,
        "details": None,
    })

    # 3. Subjectivities check
    if summary["total"] == 0:
        subj_status = "complete"
        subj_details = "No subjectivities required"
    elif critical_pending == 0:
        subj_status = "complete"
        subj_details = f"{summary['received']} received, {summary['waived']} waived"
    else:
        subj_status = "incomplete"
        subj_details = f"{critical_pending} critical pending"

    checklist.append({
        "item": "All critical subjectivities received",
        "status": subj_status,
        "required": True,
        "details": subj_details,
    })

    # 4. Policy issued check
    policy_info = None
    if is_issued:
        policy_number = get_policy_number(submission_id)
        with get_conn() as conn:
            result = conn.execute(
                text("""
                    SELECT pdf_url, created_at FROM policy_documents
                    WHERE submission_id = :submission_id
                    AND document_type = 'policy'
                    AND status != 'void'
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"submission_id": submission_id},
            )
            row = result.fetchone()
            if row:
                policy_info = {
                    "policy_number": policy_number,
                    "pdf_url": row[0],
                    "issued_at": row[1].isoformat() if row[1] else None,
                }

    checklist.append({
        "item": "Policy issued",
        "status": "complete" if is_issued else "pending",
        "required": False,
        "details": policy_info.get("policy_number") if policy_info else None,
    })

    # Determine can_issue
    can_issue = is_bound and critical_pending == 0 and not is_issued

    # Build blocking items from checklist
    blocking_items = []
    if not is_bound:
        blocking_items.append("No bound option")
    if critical_pending > 0:
        blocking_items.extend(deadline_info.get("blocking_items", []))
        if not deadline_info.get("blocking_items"):
            blocking_items.append(f"{critical_pending} critical subjectivit{'y' if critical_pending == 1 else 'ies'} pending")

    return {
        "can_issue": can_issue,
        "is_issued": is_issued,
        "checklist": checklist,
        "warnings": deadline_info.get("warnings", []),
        "blocking_items": blocking_items,
        "policy_info": policy_info,
        "summary": {
            "total_subjectivities": summary["total"],
            "pending": summary["pending"],
            "received": summary["received"],
            "waived": summary["waived"],
            "critical_pending": critical_pending,
        },
    }
