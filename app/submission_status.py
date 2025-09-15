from datetime import datetime
from typing import Optional, Literal
from sqlalchemy import text
import os
import importlib.util
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn

SubmissionStatus = Literal["pending_decision", "quoted", "declined"]
SubmissionOutcome = Literal["pending", "bound", "lost", "declined", "waiting_for_response"]

VALID_STATUS_OUTCOMES = {
    "pending_decision": ["pending"],
    "quoted": ["bound", "lost", "waiting_for_response"],
    "declined": ["declined"]
}

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
    reason: Optional[str] = None
) -> bool:
    """
    Update submission status and outcome.
    
    Args:
        submission_id: UUID of the submission
        status: New primary status
        outcome: New outcome (optional, will be set based on status if not provided)
        reason: Required for 'lost' and 'declined' outcomes
        
    Returns:
        True if update successful
        
    Raises:
        ValueError: If status/outcome combination is invalid
    """
    
    # Set default outcome if not provided
    if outcome is None:
        if status == "pending_decision":
            outcome = "pending"
        elif status == "declined":
            outcome = "declined"
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
        return result.rowcount > 0

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