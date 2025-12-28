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
