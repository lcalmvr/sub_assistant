"""
Subjectivity Management Module

Database-backed CRUD for policy subjectivities.
Migrates from session-state-only implementation in subjectivities_panel.py.
"""

from __future__ import annotations

from datetime import datetime, date
from typing import Optional
from sqlalchemy import text

from core.db import get_conn


# Stock subjectivities (moved from pages_components/subjectivities_panel.py)
STOCK_SUBJECTIVITIES = [
    {"text": "Coverage is subject to policy terms and conditions", "category": "general"},
    {"text": "Premium subject to minimum retained premium", "category": "binding"},
    {"text": "Rate subject to satisfactory inspection", "category": "binding"},
    {"text": "Subject to completion of application", "category": "documentation"},
    {"text": "Subject to receipt of additional underwriting information", "category": "documentation"},
    {"text": "Coverage bound subject to company acceptance", "category": "binding"},
    {"text": "Premium subject to audit", "category": "binding"},
    {"text": "Policy subject to terrorism exclusion", "category": "coverage"},
    {"text": "Subject to cyber security questionnaire completion", "category": "documentation"},
    {"text": "Coverage subject to satisfactory financial review", "category": "documentation"},
]


def create_subjectivity(
    submission_id: str,
    text_content: str,
    category: str = "general",
    due_date: Optional[date] = None,
    created_by: str = "system"
) -> Optional[str]:
    """
    Create a new subjectivity for a submission.

    Uses UPSERT to handle duplicates gracefully - if same text exists for submission,
    updates category and due_date instead of failing.

    Args:
        submission_id: UUID of the submission
        text_content: The subjectivity text
        category: One of 'binding', 'coverage', 'documentation', 'general'
        due_date: Optional due date for the subjectivity
        created_by: User or system creating the subjectivity

    Returns:
        UUID of the created/updated subjectivity, or None on error
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                INSERT INTO policy_subjectivities (
                    submission_id, text, category, due_date, status, created_by
                ) VALUES (
                    :submission_id, :text, :category, :due_date, 'pending', :created_by
                )
                ON CONFLICT (submission_id, text) DO UPDATE SET
                    category = EXCLUDED.category,
                    due_date = EXCLUDED.due_date,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.created_by
                RETURNING id
            """), {
                "submission_id": submission_id,
                "text": text_content,
                "category": category,
                "due_date": due_date,
                "created_by": created_by
            })
            row = result.fetchone()
            return str(row[0]) if row else None
    except Exception as e:
        print(f"Error creating subjectivity: {e}")
        return None


def get_subjectivities(
    submission_id: str,
    status: Optional[str] = None,
    include_waived: bool = True
) -> list[dict]:
    """
    Get all subjectivities for a submission.

    Args:
        submission_id: UUID of the submission
        status: Filter by status ('pending', 'received', 'waived', 'expired')
        include_waived: If False, excludes waived subjectivities

    Returns:
        List of subjectivity dictionaries
    """
    try:
        with get_conn() as conn:
            query = """
                SELECT id, text, category, status, due_date,
                       received_at, received_by, document_ids, notes,
                       created_at, created_by, updated_at, updated_by
                FROM policy_subjectivities
                WHERE submission_id = :submission_id
            """
            params: dict = {"submission_id": submission_id}

            if status:
                query += " AND status = :status"
                params["status"] = status
            elif not include_waived:
                query += " AND status != 'waived'"

            query += " ORDER BY created_at"

            result = conn.execute(text(query), params)

            return [
                {
                    "id": str(row[0]),
                    "text": row[1],
                    "category": row[2],
                    "status": row[3],
                    "due_date": row[4],
                    "received_at": row[5],
                    "received_by": row[6],
                    "document_ids": row[7] or [],
                    "notes": row[8],
                    "created_at": row[9],
                    "created_by": row[10],
                    "updated_at": row[11],
                    "updated_by": row[12]
                }
                for row in result.fetchall()
            ]
    except Exception as e:
        print(f"Error getting subjectivities: {e}")
        return []


def get_subjectivity(subjectivity_id: str) -> Optional[dict]:
    """Get a single subjectivity by ID."""
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT id, submission_id, text, category, status, due_date,
                       received_at, received_by, document_ids, notes,
                       created_at, created_by, updated_at, updated_by
                FROM policy_subjectivities
                WHERE id = :id
            """), {"id": subjectivity_id})
            row = result.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "submission_id": str(row[1]),
                "text": row[2],
                "category": row[3],
                "status": row[4],
                "due_date": row[5],
                "received_at": row[6],
                "received_by": row[7],
                "document_ids": row[8] or [],
                "notes": row[9],
                "created_at": row[10],
                "created_by": row[11],
                "updated_at": row[12],
                "updated_by": row[13]
            }
    except Exception as e:
        print(f"Error getting subjectivity: {e}")
        return None


def mark_received(
    subjectivity_id: str,
    received_by: str = "system",
    notes: Optional[str] = None,
    document_ids: Optional[list[str]] = None
) -> bool:
    """
    Mark a subjectivity as received.

    Args:
        subjectivity_id: UUID of the subjectivity
        received_by: User marking it received
        notes: Optional notes about how/when received
        document_ids: Optional list of document UUIDs that satisfy this subjectivity

    Returns:
        True if updated successfully
    """
    try:
        with get_conn() as conn:
            updates = [
                "status = 'received'",
                "received_at = :received_at",
                "received_by = :received_by",
                "updated_by = :received_by"
            ]
            params: dict = {
                "subjectivity_id": subjectivity_id,
                "received_at": datetime.utcnow(),
                "received_by": received_by
            }

            if notes is not None:
                updates.append("notes = :notes")
                params["notes"] = notes

            if document_ids is not None:
                updates.append("document_ids = :document_ids")
                params["document_ids"] = document_ids

            result = conn.execute(text(f"""
                UPDATE policy_subjectivities
                SET {", ".join(updates)}
                WHERE id = :subjectivity_id
            """), params)

            return result.rowcount > 0
    except Exception as e:
        print(f"Error marking subjectivity received: {e}")
        return False


def waive_subjectivity(
    subjectivity_id: str,
    waived_by: str,
    reason: str
) -> bool:
    """
    Waive a subjectivity (mark as no longer required).

    Args:
        subjectivity_id: UUID of the subjectivity
        waived_by: User waiving it
        reason: Reason for waiver (stored in notes)

    Returns:
        True if updated successfully
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                UPDATE policy_subjectivities
                SET status = 'waived',
                    notes = :reason,
                    updated_by = :waived_by
                WHERE id = :subjectivity_id
            """), {
                "subjectivity_id": subjectivity_id,
                "waived_by": waived_by,
                "reason": reason
            })
            return result.rowcount > 0
    except Exception as e:
        print(f"Error waiving subjectivity: {e}")
        return False


def update_subjectivity(
    subjectivity_id: str,
    text_content: Optional[str] = None,
    category: Optional[str] = None,
    due_date: Optional[date] = None,
    notes: Optional[str] = None,
    updated_by: str = "system"
) -> bool:
    """
    Update a subjectivity's content. Only works for pending subjectivities.

    Args:
        subjectivity_id: UUID of the subjectivity
        text_content: New text (optional)
        category: New category (optional)
        due_date: New due date (optional)
        notes: New notes (optional)
        updated_by: User making the update

    Returns:
        True if updated successfully
    """
    updates = []
    params: dict = {"subjectivity_id": subjectivity_id, "updated_by": updated_by}

    if text_content is not None:
        updates.append("text = :text")
        params["text"] = text_content
    if category is not None:
        updates.append("category = :category")
        params["category"] = category
    if due_date is not None:
        updates.append("due_date = :due_date")
        params["due_date"] = due_date
    if notes is not None:
        updates.append("notes = :notes")
        params["notes"] = notes

    if not updates:
        return False

    updates.append("updated_by = :updated_by")

    try:
        with get_conn() as conn:
            result = conn.execute(text(f"""
                UPDATE policy_subjectivities
                SET {", ".join(updates)}
                WHERE id = :subjectivity_id AND status = 'pending'
            """), params)
            return result.rowcount > 0
    except Exception as e:
        print(f"Error updating subjectivity: {e}")
        return False


def delete_subjectivity(subjectivity_id: str) -> bool:
    """
    Delete a subjectivity. Only works for pending subjectivities.

    Args:
        subjectivity_id: UUID of the subjectivity

    Returns:
        True if deleted successfully
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                DELETE FROM policy_subjectivities
                WHERE id = :subjectivity_id AND status = 'pending'
            """), {"subjectivity_id": subjectivity_id})
            return result.rowcount > 0
    except Exception as e:
        print(f"Error deleting subjectivity: {e}")
        return False


def get_pending_count(submission_id: str) -> int:
    """Get count of pending subjectivities for a submission."""
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT COUNT(*) FROM policy_subjectivities
                WHERE submission_id = :submission_id AND status = 'pending'
            """), {"submission_id": submission_id})
            row = result.fetchone()
            return row[0] if row else 0
    except Exception as e:
        print(f"Error getting pending count: {e}")
        return 0


def get_subjectivities_summary(submission_id: str) -> dict:
    """
    Get summary counts of subjectivities by status.

    Returns:
        Dict with counts: {pending: N, received: N, waived: N, expired: N, total: N}
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT status, COUNT(*) as count
                FROM policy_subjectivities
                WHERE submission_id = :submission_id
                GROUP BY status
            """), {"submission_id": submission_id})

            summary = {"pending": 0, "received": 0, "waived": 0, "expired": 0, "total": 0}
            for row in result.fetchall():
                status, count = row
                if status in summary:
                    summary[status] = count
                summary["total"] += count
            return summary
    except Exception as e:
        print(f"Error getting summary: {e}")
        return {"pending": 0, "received": 0, "waived": 0, "expired": 0, "total": 0}


def find_matching_subjectivity(
    submission_id: str,
    search_text: str,
    status: Optional[str] = None
) -> Optional[dict]:
    """
    Find a subjectivity that matches the search text (case-insensitive partial match).
    Used by AI admin agent to resolve natural language references.

    Args:
        submission_id: UUID of the submission
        search_text: Text to search for (partial match)
        status: Filter by status (optional)

    Returns:
        First matching subjectivity dict, or None if not found
    """
    try:
        with get_conn() as conn:
            query = """
                SELECT id, text, category, status, due_date,
                       received_at, received_by, document_ids, notes,
                       created_at, created_by
                FROM policy_subjectivities
                WHERE submission_id = :submission_id
                  AND LOWER(text) LIKE LOWER(:search_pattern)
            """
            params: dict = {
                "submission_id": submission_id,
                "search_pattern": f"%{search_text}%"
            }

            if status:
                query += " AND status = :status"
                params["status"] = status

            query += " ORDER BY created_at LIMIT 1"

            result = conn.execute(text(query), params)
            row = result.fetchone()

            if not row:
                return None

            return {
                "id": str(row[0]),
                "text": row[1],
                "category": row[2],
                "status": row[3],
                "due_date": row[4],
                "received_at": row[5],
                "received_by": row[6],
                "document_ids": row[7] or [],
                "notes": row[8],
                "created_at": row[9],
                "created_by": row[10]
            }
    except Exception as e:
        print(f"Error finding subjectivity: {e}")
        return None


def migrate_from_session_state(
    submission_id: str,
    session_items: list[dict],
    created_by: str = "migration"
) -> int:
    """
    Migrate subjectivities from session state to database.
    Used for transitioning existing submissions.

    Args:
        submission_id: UUID of the submission
        session_items: List of dicts from session state [{id, text}, ...]
        created_by: User/system performing migration

    Returns:
        Number of subjectivities migrated
    """
    count = 0
    for item in session_items:
        text_content = item.get("text", "")
        if text_content:
            result = create_subjectivity(
                submission_id=submission_id,
                text_content=text_content,
                category="general",
                created_by=created_by
            )
            if result:
                count += 1
    return count


def add_stock_subjectivities(
    submission_id: str,
    created_by: str = "system"
) -> int:
    """
    Add all stock subjectivities to a submission.
    Useful when creating a new quote.

    Returns:
        Number of subjectivities added
    """
    count = 0
    for stock in STOCK_SUBJECTIVITIES:
        result = create_subjectivity(
            submission_id=submission_id,
            text_content=stock["text"],
            category=stock["category"],
            created_by=created_by
        )
        if result:
            count += 1
    return count


# =============================================================================
# DEADLINE ENFORCEMENT FUNCTIONS
# =============================================================================

def get_overdue_subjectivities(submission_id: str) -> list[dict]:
    """
    Get all subjectivities that are past their due date.

    Args:
        submission_id: UUID of the submission

    Returns:
        List of overdue subjectivity dicts with days_overdue
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT id, text, category, status, due_date, is_critical,
                       CURRENT_DATE - due_date AS days_overdue
                FROM policy_subjectivities
                WHERE submission_id = :submission_id
                  AND status = 'pending'
                  AND due_date IS NOT NULL
                  AND due_date < CURRENT_DATE
                ORDER BY due_date
            """), {"submission_id": submission_id})

            return [
                {
                    "id": str(row[0]),
                    "text": row[1],
                    "category": row[2],
                    "status": row[3],
                    "due_date": row[4],
                    "is_critical": row[5] if row[5] is not None else True,
                    "days_overdue": row[6]
                }
                for row in result.fetchall()
            ]
    except Exception as e:
        print(f"Error getting overdue subjectivities: {e}")
        return []


def get_due_soon_subjectivities(submission_id: str, days: int = 7) -> list[dict]:
    """
    Get subjectivities due within the specified number of days.

    Args:
        submission_id: UUID of the submission
        days: Number of days to look ahead (default 7)

    Returns:
        List of subjectivity dicts due soon with days_until_due
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT id, text, category, status, due_date, is_critical,
                       due_date - CURRENT_DATE AS days_until_due
                FROM policy_subjectivities
                WHERE submission_id = :submission_id
                  AND status = 'pending'
                  AND due_date IS NOT NULL
                  AND due_date >= CURRENT_DATE
                  AND due_date <= CURRENT_DATE + :days * INTERVAL '1 day'
                ORDER BY due_date
            """), {"submission_id": submission_id, "days": days})

            return [
                {
                    "id": str(row[0]),
                    "text": row[1],
                    "category": row[2],
                    "status": row[3],
                    "due_date": row[4],
                    "is_critical": row[5] if row[5] is not None else True,
                    "days_until_due": row[6]
                }
                for row in result.fetchall()
            ]
    except Exception as e:
        print(f"Error getting due soon subjectivities: {e}")
        return []


def check_deadline_warnings(submission_id: str) -> dict:
    """
    Check for deadline warnings and blocking issues.

    Returns:
        Dict with:
        - overdue: list of overdue subjectivities
        - due_soon: list due within 7 days
        - blocking_count: count of critical pending subjectivities
        - warnings: list of warning messages
        - blocking_items: list of items blocking issuance
    """
    overdue = get_overdue_subjectivities(submission_id)
    due_soon = get_due_soon_subjectivities(submission_id)

    # Count critical pending
    blocking_count = get_critical_pending_count(submission_id)

    # Build warning messages
    warnings = []
    blocking_items = []

    for subj in overdue:
        msg = f"'{subj['text'][:50]}...' - {subj['days_overdue']} days overdue"
        if subj.get("is_critical", True):
            blocking_items.append(msg)
        else:
            warnings.append(msg)

    for subj in due_soon:
        days = subj.get("days_until_due", 0)
        msg = f"'{subj['text'][:50]}...' - due in {days} day{'s' if days != 1 else ''}"
        warnings.append(msg)

    return {
        "overdue": overdue,
        "due_soon": due_soon,
        "blocking_count": blocking_count,
        "warnings": warnings,
        "blocking_items": blocking_items
    }


def get_critical_pending_count(submission_id: str) -> int:
    """
    Get count of critical pending subjectivities (those that block issuance).

    Args:
        submission_id: UUID of the submission

    Returns:
        Count of critical pending subjectivities
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT COUNT(*) FROM policy_subjectivities
                WHERE submission_id = :submission_id
                  AND status = 'pending'
                  AND (is_critical = true OR is_critical IS NULL)
            """), {"submission_id": submission_id})
            row = result.fetchone()
            return row[0] if row else 0
    except Exception as e:
        print(f"Error getting critical pending count: {e}")
        return 0


def set_subjectivity_critical(
    subjectivity_id: str,
    is_critical: bool,
    updated_by: str = "system"
) -> bool:
    """
    Set whether a subjectivity is critical (blocks issuance).

    Args:
        subjectivity_id: UUID of the subjectivity
        is_critical: True = blocks issuance, False = warning only
        updated_by: User making the change

    Returns:
        True if updated successfully
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                UPDATE policy_subjectivities
                SET is_critical = :is_critical,
                    updated_by = :updated_by,
                    updated_at = NOW()
                WHERE id = :subjectivity_id
            """), {
                "subjectivity_id": subjectivity_id,
                "is_critical": is_critical,
                "updated_by": updated_by
            })
            return result.rowcount > 0
    except Exception as e:
        print(f"Error setting subjectivity critical: {e}")
        return False


def get_all_pending_subjectivities_admin(
    filter_type: str = "all",
    limit: int = 100
) -> list[dict]:
    """
    Get all pending subjectivities across all bound accounts (admin view).

    Args:
        filter_type: "all", "overdue", or "due_soon"
        limit: Maximum number of results

    Returns:
        List of pending subjectivities with account info
    """
    try:
        with get_conn() as conn:
            base_query = """
                SELECT
                    ps.id,
                    ps.submission_id,
                    ps.text,
                    ps.category,
                    ps.due_date,
                    ps.is_critical,
                    ps.created_at,
                    s.applicant_name,
                    t.quote_name AS bound_option_name,
                    CASE
                        WHEN ps.due_date IS NULL THEN 'no_deadline'
                        WHEN ps.due_date < CURRENT_DATE THEN 'overdue'
                        WHEN ps.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
                        ELSE 'on_track'
                    END AS deadline_status,
                    ps.due_date - CURRENT_DATE AS days_until_due
                FROM policy_subjectivities ps
                JOIN submissions s ON s.id = ps.submission_id
                JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = true
                WHERE ps.status = 'pending'
            """

            if filter_type == "overdue":
                base_query += " AND ps.due_date < CURRENT_DATE"
            elif filter_type == "due_soon":
                base_query += " AND ps.due_date >= CURRENT_DATE AND ps.due_date <= CURRENT_DATE + INTERVAL '7 days'"

            base_query += """
                ORDER BY
                    CASE
                        WHEN ps.due_date IS NULL THEN 3
                        WHEN ps.due_date < CURRENT_DATE THEN 1
                        WHEN ps.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 2
                        ELSE 4
                    END,
                    ps.due_date NULLS LAST
                LIMIT :limit
            """

            result = conn.execute(text(base_query), {"limit": limit})

            return [
                {
                    "id": str(row[0]),
                    "submission_id": str(row[1]),
                    "text": row[2],
                    "category": row[3],
                    "due_date": row[4].isoformat() if row[4] else None,
                    "is_critical": row[5] if row[5] is not None else True,
                    "created_at": row[6].isoformat() if row[6] else None,
                    "company_name": row[7],  # actually applicant_name from DB
                    "insured_name": row[7],  # same as company_name for compatibility
                    "bound_option_name": row[8],
                    "deadline_status": row[9],
                    "days_until_due": row[10]
                }
                for row in result.fetchall()
            ]
    except Exception as e:
        print(f"Error getting admin pending subjectivities: {e}")
        return []
