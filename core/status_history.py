"""
Status History Module

Provides audit trail for submission status changes.
Records every status transition with timestamp, user, and optional notes.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import text
import os
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn


def record_status_change(
    submission_id: str,
    new_status: str,
    new_outcome: Optional[str] = None,
    old_status: Optional[str] = None,
    old_outcome: Optional[str] = None,
    changed_by: str = "system",
    notes: Optional[str] = None
) -> dict:
    """
    Record a status change in the audit trail.

    Args:
        submission_id: UUID of the submission
        new_status: The new status value
        new_outcome: The new outcome value (optional)
        old_status: The previous status value (optional)
        old_outcome: The previous outcome value (optional)
        changed_by: User or system that made the change
        notes: Optional notes about the change

    Returns:
        dict with the created history record
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO submission_status_history
                (submission_id, old_status, new_status, old_outcome, new_outcome, changed_by, notes)
            VALUES
                (:submission_id, :old_status, :new_status, :old_outcome, :new_outcome, :changed_by, :notes)
            RETURNING id, submission_id, old_status, new_status, old_outcome, new_outcome, changed_by, changed_at, notes
        """), {
            "submission_id": submission_id,
            "old_status": old_status,
            "new_status": new_status,
            "old_outcome": old_outcome,
            "new_outcome": new_outcome,
            "changed_by": changed_by,
            "notes": notes
        })

        row = result.fetchone()
        conn.commit()

        return {
            "id": str(row[0]),
            "submission_id": str(row[1]),
            "old_status": row[2],
            "new_status": row[3],
            "old_outcome": row[4],
            "new_outcome": row[5],
            "changed_by": row[6],
            "changed_at": row[7],
            "notes": row[8]
        }


def get_status_history(submission_id: str) -> list[dict]:
    """
    Get the full status change history for a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        List of status change records, ordered by changed_at desc (most recent first)
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, submission_id, old_status, new_status, old_outcome, new_outcome,
                   changed_by, changed_at, notes
            FROM submission_status_history
            WHERE submission_id = :submission_id
            ORDER BY changed_at DESC
        """), {"submission_id": submission_id})

        return [
            {
                "id": str(row[0]),
                "submission_id": str(row[1]),
                "old_status": row[2],
                "new_status": row[3],
                "old_outcome": row[4],
                "new_outcome": row[5],
                "changed_by": row[6],
                "changed_at": row[7],
                "notes": row[8]
            }
            for row in result.fetchall()
        ]


def get_recent_status_changes(limit: int = 50) -> list[dict]:
    """
    Get recent status changes across all submissions.
    Useful for admin dashboard / activity feed.

    Args:
        limit: Maximum number of records to return

    Returns:
        List of status change records with submission info
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT h.id, h.submission_id, h.old_status, h.new_status,
                   h.old_outcome, h.new_outcome, h.changed_by, h.changed_at, h.notes,
                   s.applicant_name
            FROM submission_status_history h
            JOIN submissions s ON s.id = h.submission_id
            ORDER BY h.changed_at DESC
            LIMIT :limit
        """), {"limit": limit})

        return [
            {
                "id": str(row[0]),
                "submission_id": str(row[1]),
                "old_status": row[2],
                "new_status": row[3],
                "old_outcome": row[4],
                "new_outcome": row[5],
                "changed_by": row[6],
                "changed_at": row[7],
                "notes": row[8],
                "applicant_name": row[9]
            }
            for row in result.fetchall()
        ]


def get_status_change_count(submission_id: str) -> int:
    """
    Get the number of status changes for a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        Count of status changes
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT COUNT(*) FROM submission_status_history
            WHERE submission_id = :submission_id
        """), {"submission_id": submission_id})

        return result.fetchone()[0]


def get_status_duration(submission_id: str, status: str) -> Optional[dict]:
    """
    Calculate how long a submission spent in a specific status.

    Args:
        submission_id: UUID of the submission
        status: The status to calculate duration for

    Returns:
        dict with first_entered, last_exited, and total_duration or None
    """
    history = get_status_history(submission_id)

    if not history:
        return None

    # Reverse to get chronological order
    history = list(reversed(history))

    entered_at = None
    exited_at = None
    total_seconds = 0

    for i, record in enumerate(history):
        if record["new_status"] == status:
            # Entered this status
            entered_at = entered_at or record["changed_at"]
            current_enter = record["changed_at"]

            # Find when we exited (next record where we left this status)
            for j in range(i + 1, len(history)):
                if history[j]["old_status"] == status:
                    exit_time = history[j]["changed_at"]
                    exited_at = exit_time
                    if current_enter and exit_time:
                        total_seconds += (exit_time - current_enter).total_seconds()
                    break

    # If still in this status, calculate from last entry to now
    if history and history[-1]["new_status"] == status:
        current_enter = history[-1]["changed_at"]
        if current_enter:
            total_seconds += (datetime.utcnow() - current_enter).total_seconds()

    if entered_at is None:
        return None

    return {
        "first_entered": entered_at,
        "last_exited": exited_at,
        "total_seconds": total_seconds,
        "total_hours": round(total_seconds / 3600, 2),
        "total_days": round(total_seconds / 86400, 2)
    }


def format_status_change(record: dict) -> str:
    """
    Format a status change record for display.

    Args:
        record: Status history record dict

    Returns:
        Human-readable description of the change
    """
    old = record.get("old_status", "—")
    new = record.get("new_status", "—")
    old_outcome = record.get("old_outcome")
    new_outcome = record.get("new_outcome")

    parts = [f"{old} → {new}"]

    if old_outcome != new_outcome and new_outcome:
        parts.append(f"(outcome: {new_outcome})")

    return " ".join(parts)
