"""
Submissions API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from sqlalchemy import text
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.db import get_conn
from broker_portal.api.auth import get_current_broker_from_session, check_broker_access_to_submission
from broker_portal.api.models import SubmissionSummary, SubmissionDetail, ErrorResponse

router = APIRouter()


def get_broker_submission_ids(broker: dict) -> List[str]:
    """
    Get all submission IDs that the broker has access to (own + designee).
    Returns list of submission UUIDs.
    """
    submission_ids = set()
    
    with get_conn() as conn:
        # Get submissions by broker_email
        result = conn.execute(text("""
            SELECT id
            FROM submissions
            WHERE LOWER(broker_email) = :email
        """), {"email": broker["email"].lower()})
        
        for row in result:
            submission_ids.add(str(row[0]))
        
        # Get submissions via broker_contact_id in broker_of_record_history
        if broker["broker_contact_id"]:
            result = conn.execute(text("""
                SELECT DISTINCT submission_id
                FROM broker_of_record_history
                WHERE broker_contact_id = :contact_id
                AND end_date IS NULL
            """), {"contact_id": broker["broker_contact_id"]})
            
            for row in result:
                submission_ids.add(str(row[0]))
        
        # Get submissions via broker_employment_id
        if broker["broker_employment_id"]:
            result = conn.execute(text("""
                SELECT DISTINCT submission_id
                FROM broker_of_record_history
                WHERE broker_contact_id = :employment_id
                AND end_date IS NULL
            """), {"employment_id": broker["broker_employment_id"]})
            
            for row in result:
                submission_ids.add(str(row[0]))
        
        # Get submissions where broker is a designee
        if broker["broker_contact_id"]:
            result = conn.execute(text("""
                SELECT DISTINCT bh.submission_id
                FROM broker_designees d
                JOIN broker_of_record_history bh ON (
                    (d.owner_contact_id = bh.broker_contact_id) OR
                    (d.owner_employment_id::text = bh.broker_contact_id::text)
                )
                WHERE d.designee_contact_id = :contact_id
                AND d.can_view_submissions = TRUE
                AND bh.end_date IS NULL
            """), {"contact_id": broker["broker_contact_id"]})
            
            for row in result:
                submission_ids.add(str(row[0]))
        
        if broker["broker_employment_id"]:
            result = conn.execute(text("""
                SELECT DISTINCT bh.submission_id
                FROM broker_designees d
                JOIN broker_of_record_history bh ON (
                    (d.owner_contact_id::text = bh.broker_contact_id::text) OR
                    (d.owner_employment_id = bh.broker_contact_id)
                )
                WHERE d.designee_employment_id = :employment_id
                AND d.can_view_submissions = TRUE
                AND bh.end_date IS NULL
            """), {"employment_id": broker["broker_employment_id"]})
            
            for row in result:
                submission_ids.add(str(row[0]))
    
    return list(submission_ids)


@router.get("", response_model=List[SubmissionSummary])
async def list_submissions(
    status_filter: Optional[str] = Query(None, alias="status"),
    outcome_filter: Optional[str] = Query(None, alias="outcome"),
    broker: dict = Depends(get_current_broker_from_session)
):
    """
    List all submissions for the authenticated broker.
    Supports filtering by status and outcome.
    """
    # Get submission IDs the broker can access
    submission_ids = get_broker_submission_ids(broker)
    
    if not submission_ids:
        return []
    
    # Build query - use IN clause with proper array handling
    submission_ids_list = [str(sid) for sid in submission_ids]
    query = """
        SELECT
            s.id,
            s.applicant_name,
            a.name as account_name,
            s.submission_status as status,
            s.submission_outcome as outcome,
            s.date_received,
            s.revenue,
            COALESCE((
                SELECT sold_premium
                FROM insurance_towers
                WHERE submission_id = s.id
                AND is_bound = TRUE
                LIMIT 1
            ), NULL) as premium,
            COALESCE((
                SELECT (tower_json->0->>'aggregate_limit')::numeric
                FROM insurance_towers
                WHERE submission_id = s.id
                AND is_bound = TRUE
                AND tower_json IS NOT NULL
                AND jsonb_array_length(tower_json) > 0
                LIMIT 1
            ), NULL) as policy_limit,
            COALESCE((
                SELECT primary_retention
                FROM insurance_towers
                WHERE submission_id = s.id
                AND is_bound = TRUE
                LIMIT 1
            ), NULL) as retention
        FROM submissions s
        LEFT JOIN accounts a ON s.account_id = a.id
        WHERE s.id::text IN (SELECT unnest(CAST(:submission_ids AS text[])))
    """
    
    params = {"submission_ids": submission_ids_list}
    
    if status_filter:
        query += " AND s.submission_status = :status_filter"
        params["status_filter"] = status_filter
    
    if outcome_filter:
        query += " AND s.submission_outcome = :outcome_filter"
        params["outcome_filter"] = outcome_filter
    
    query += " ORDER BY s.date_received DESC"
    
    with get_conn() as conn:
        result = conn.execute(text(query), params)
        
        submissions = []
        for row in result:
            # Safely access columns - handle case where subqueries return NULL
            # Column indices: 0=id, 1=applicant_name, 2=account_name, 3=status, 4=outcome, 
            # 5=date_received, 6=revenue, 7=premium, 8=policy_limit, 9=retention
            try:
                premium = float(row[7]) if len(row) > 7 and row[7] is not None else None
            except (IndexError, ValueError, TypeError):
                premium = None
            
            try:
                policy_limit = float(row[8]) if len(row) > 8 and row[8] is not None else None
            except (IndexError, ValueError, TypeError):
                policy_limit = None
            
            try:
                retention = float(row[9]) if len(row) > 9 and row[9] is not None else None
            except (IndexError, ValueError, TypeError):
                retention = None
            
            submissions.append(SubmissionSummary(
                id=str(row[0]),
                applicant_name=row[1],
                account_name=row[2],
                status=row[3] or "unknown",
                outcome=row[4],
                date_received=row[5],
                premium=premium,
                policy_limit=policy_limit,
                retention=retention
            ))
    
    return submissions


@router.get("/{submission_id}", response_model=SubmissionDetail)
async def get_submission(
    submission_id: str,
    broker: dict = Depends(get_current_broker_from_session)
):
    """
    Get detailed information about a specific submission.
    """
    # Check access
    if not check_broker_access_to_submission(broker, submission_id):
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this submission"
        )
    
    with get_conn() as conn:
        # Get submission details
        result = conn.execute(text("""
            SELECT
                s.id,
                s.applicant_name,
                a.name as account_name,
                s.submission_status as status,
                s.submission_outcome as outcome,
                s.outcome_reason,
                s.date_received,
                s.status_updated_at,
                s.business_summary,
                s.revenue,
                -- Get premium from bound quote
                (SELECT sold_premium
                 FROM insurance_towers
                 WHERE submission_id = s.id
                 AND is_bound = TRUE
                 LIMIT 1) as premium,
                -- Get policy details from bound quote
                (SELECT (tower_json->0->>'aggregate_limit')::numeric
                 FROM insurance_towers
                 WHERE submission_id = s.id
                 AND is_bound = TRUE
                 AND tower_json IS NOT NULL
                 AND jsonb_array_length(tower_json) > 0
                 LIMIT 1) as policy_limit,
                (SELECT primary_retention
                 FROM insurance_towers
                 WHERE submission_id = s.id
                 AND is_bound = TRUE
                 LIMIT 1) as retention,
                (SELECT effective_date
                 FROM insurance_towers
                 WHERE submission_id = s.id
                 AND is_bound = TRUE
                 LIMIT 1) as effective_date,
                (SELECT expiration_date
                 FROM insurance_towers
                 WHERE submission_id = s.id
                 AND is_bound = TRUE
                 LIMIT 1) as expiration_date
            FROM submissions s
            LEFT JOIN accounts a ON s.account_id = a.id
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})
        
        row = result.fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="Submission not found"
            )
        
        # Get status history
        history_result = conn.execute(text("""
            SELECT
                old_status, new_status, old_outcome, new_outcome,
                changed_by, changed_at, notes
            FROM submission_status_history
            WHERE submission_id = :submission_id
            ORDER BY changed_at DESC
        """), {"submission_id": submission_id})
        
        status_history = []
        for hist_row in history_result:
            status_history.append({
                "old_status": hist_row[0],
                "new_status": hist_row[1],
                "old_outcome": hist_row[2],
                "new_outcome": hist_row[3],
                "changed_by": hist_row[4],
                "changed_at": hist_row[5].isoformat() if hist_row[5] else None,
                "notes": hist_row[6]
            })
        
        return SubmissionDetail(
            id=str(row[0]),
            applicant_name=row[1],
            account_name=row[2],
            status=row[3] or "unknown",
            outcome=row[4],
            outcome_reason=row[5],
            date_received=row[6],
            status_updated_at=row[7],
            business_summary=row[8],
            premium=float(row[11]) if row[11] else None,
            policy_limit=float(row[12]) if row[12] else None,
            retention=float(row[13]) if row[13] else None,
            effective_date=row[14].isoformat() if row[14] else None,
            expiration_date=row[15].isoformat() if row[15] else None,
            status_history=status_history
        )

