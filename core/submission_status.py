from datetime import datetime
from typing import Optional, Literal
from sqlalchemy import text
import os
import importlib.util
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn

# Import status history for audit trail
from core.status_history import record_status_change

SubmissionStatus = Literal[
    "renewal_expected",      # Placeholder for upcoming renewal
    "renewal_not_received",  # Renewal never arrived
    "received",
    "pending_info",
    "quoted",
    "declined"
]
SubmissionOutcome = Literal["pending", "bound", "lost", "declined", "waiting_for_response"]

# Status display labels for UI
STATUS_LABELS = {
    "renewal_expected": "Renewal Expected",
    "renewal_not_received": "Renewal Not Received",
    "received": "Received",
    "pending_info": "Pending Info",
    "quoted": "Quoted",
    "declined": "Declined"
}

# Valid status transitions (what status can follow what)
VALID_STATUS_TRANSITIONS = {
    "renewal_expected": ["received", "renewal_not_received"],  # Awaiting broker
    "renewal_not_received": [],  # Terminal state
    "received": ["pending_info", "quoted", "declined"],
    "pending_info": ["received", "quoted", "declined"],
    "quoted": ["declined"],  # Can still decline after quoting
    "declined": []  # Terminal state
}

VALID_STATUS_OUTCOMES = {
    "renewal_expected": ["pending"],       # Awaiting broker submission
    "renewal_not_received": ["lost"],      # Never received = lost
    "received": ["pending"],
    "pending_info": ["pending"],
    "quoted": ["bound", "lost", "waiting_for_response"],
    "declined": ["declined"]
}

# Statuses to exclude from total submission counts in reporting
EXCLUDED_FROM_COUNTS = ["renewal_expected"]

def get_submission_status(submission_id: str) -> dict:
    """Get current status and outcome for a submission."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT submission_status, submission_outcome, outcome_reason, status_updated_at
            FROM submissions 
            WHERE id = :submission_id
        """), {"submission_id": submission_id})
        
        row = result.fetchone()
        if not row:
            raise ValueError(f"Submission {submission_id} not found")
            
        return {
            "submission_status": row[0],
            "submission_outcome": row[1], 
            "outcome_reason": row[2],
            "status_updated_at": row[3]
        }

def update_submission_status(
    submission_id: str,
    status: SubmissionStatus,
    outcome: Optional[SubmissionOutcome] = None,
    reason: Optional[str] = None,
    changed_by: str = "system",
    notes: Optional[str] = None
) -> bool:
    """
    Update submission status and outcome.

    Args:
        submission_id: UUID of the submission
        status: New primary status
        outcome: New outcome (optional, will be set based on status if not provided)
        reason: Required for 'lost' and 'declined' outcomes
        changed_by: User or system making the change (for audit trail)
        notes: Optional notes about the change (for audit trail)

    Returns:
        True if update successful

    Raises:
        ValueError: If status/outcome combination is invalid
    """

    # Get current status for history logging
    current = get_submission_status(submission_id)
    old_status = current.get("submission_status")
    old_outcome = current.get("submission_outcome")

    # Set default outcome if not provided
    if outcome is None:
        if status in ["received", "pending_info", "renewal_expected"]:
            outcome = "pending"
        elif status == "declined":
            outcome = "declined"
        elif status == "renewal_not_received":
            outcome = "lost"
        else:  # quoted
            raise ValueError("Outcome must be specified for 'quoted' status")

    # Validate status/outcome combination
    if outcome not in VALID_STATUS_OUTCOMES.get(status, []):
        valid_outcomes = VALID_STATUS_OUTCOMES.get(status, [])
        raise ValueError(f"Invalid outcome '{outcome}' for status '{status}'. Valid outcomes: {valid_outcomes}")

    # Validate reason requirement
    if outcome in ["lost", "declined"] and not reason:
        raise ValueError(f"Reason is required for outcome '{outcome}'")

    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE submissions
            SET submission_status = :status,
                submission_outcome = :outcome,
                outcome_reason = :reason,
                status_updated_at = :updated_at,
                updated_at = :updated_at
            WHERE id = :submission_id
        """), {
            "submission_id": submission_id,
            "status": status,
            "outcome": outcome,
            "reason": reason,
            "updated_at": datetime.utcnow()
        })

        conn.commit()

        if result.rowcount > 0:
            # Record the status change in history
            record_status_change(
                submission_id=submission_id,
                old_status=old_status,
                new_status=status,
                old_outcome=old_outcome,
                new_outcome=outcome,
                changed_by=changed_by,
                notes=notes
            )
            return True
        return False

def get_available_outcomes(status: SubmissionStatus) -> list[SubmissionOutcome]:
    """Get valid outcomes for a given status."""
    return VALID_STATUS_OUTCOMES.get(status, [])

def get_submissions_by_status(status: Optional[SubmissionStatus] = None, outcome: Optional[SubmissionOutcome] = None) -> list[dict]:
    """Get submissions filtered by status and/or outcome."""
    where_conditions = []
    params = {}
    
    if status:
        where_conditions.append("submission_status = :status")
        params["status"] = status
        
    if outcome:
        where_conditions.append("submission_outcome = :outcome") 
        params["outcome"] = outcome
    
    where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
    
    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT id, broker_email, date_received, business_summary, submission_status, 
                   submission_outcome, outcome_reason, status_updated_at, revenue
            FROM submissions 
            WHERE {where_clause}
            ORDER BY status_updated_at DESC, date_received DESC
        """), params)
        
        rows = result.fetchall()
        return [
            {
                "id": row[0],
                "broker_email": row[1],
                "date_received": row[2],
                "business_summary": row[3],
                "submission_status": row[4],
                "submission_outcome": row[5], 
                "outcome_reason": row[6],
                "status_updated_at": row[7],
                "revenue": row[8]
            }
            for row in rows
        ]

def get_status_summary() -> dict:
    """Get counts of submissions by status and outcome."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT submission_status, submission_outcome, COUNT(*) as count
            FROM submissions
            GROUP BY submission_status, submission_outcome
            ORDER BY submission_status, submission_outcome
        """))
        
        rows = result.fetchall()
        summary = {}
        
        for row in rows:
            status, outcome, count = row
            if status not in summary:
                summary[status] = {}
            summary[status][outcome] = count
            
        return summary