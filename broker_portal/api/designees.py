"""
Designees API endpoints
Allows brokers to grant access to other users
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy import text
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.db import get_conn
from broker_portal.api.auth import get_current_broker_from_session, find_broker_by_email
from broker_portal.api.models import DesigneeInfo, AddDesigneeRequest, ErrorResponse

router = APIRouter()


@router.get("", response_model=List[DesigneeInfo])
async def list_designees(broker: dict = Depends(get_current_broker_from_session)):
    """
    List all designees for the authenticated broker.
    """
    with get_conn() as conn:
        designees = []
        
        # Get designees via broker_contact_id
        if broker["broker_contact_id"]:
            result = conn.execute(text("""
                SELECT
                    d.id,
                    d.designee_contact_id,
                    d.designee_employment_id,
                    d.can_view_submissions,
                    d.created_at
                FROM broker_designees d
                WHERE d.owner_contact_id = :contact_id
            """), {"contact_id": broker["broker_contact_id"]})
            
            for row in result:
                designee_id = row[1] or row[2]
                if designee_id:
                    # Get designee info
                    if row[1]:  # broker_contact_id
                        info_result = conn.execute(text("""
                            SELECT first_name || ' ' || last_name, email
                            FROM broker_contacts
                            WHERE id = :id
                        """), {"id": row[1]})
                    else:  # broker_employment_id
                        info_result = conn.execute(text("""
                            SELECT p.first_name || ' ' || p.last_name, e.email
                            FROM brkr_employments e
                            JOIN brkr_people p ON e.person_id = p.person_id
                            WHERE e.employment_id = :id
                        """), {"id": row[2]})
                    
                    info_row = info_result.fetchone()
                    if info_row:
                        designees.append(DesigneeInfo(
                            id=str(row[0]),
                            name=info_row[0],
                            email=info_row[1],
                            can_view_submissions=row[3],
                            created_at=row[4]
                        ))
        
        # Get designees via broker_employment_id
        if broker["broker_employment_id"]:
            result = conn.execute(text("""
                SELECT
                    d.id,
                    d.designee_contact_id,
                    d.designee_employment_id,
                    d.can_view_submissions,
                    d.created_at
                FROM broker_designees d
                WHERE d.owner_employment_id = :employment_id
            """), {"employment_id": broker["broker_employment_id"]})
            
            for row in result:
                designee_id = row[1] or row[2]
                if designee_id:
                    # Get designee info
                    if row[1]:  # broker_contact_id
                        info_result = conn.execute(text("""
                            SELECT first_name || ' ' || last_name, email
                            FROM broker_contacts
                            WHERE id = :id
                        """), {"id": row[1]})
                    else:  # broker_employment_id
                        info_result = conn.execute(text("""
                            SELECT p.first_name || ' ' || p.last_name, e.email
                            FROM brkr_employments e
                            JOIN brkr_people p ON e.person_id = p.person_id
                            WHERE e.employment_id = :id
                        """), {"id": row[2]})
                    
                    info_row = info_result.fetchone()
                    if info_row:
                        # Check if already added (avoid duplicates)
                        if not any(d.id == str(row[0]) for d in designees):
                            designees.append(DesigneeInfo(
                                id=str(row[0]),
                                name=info_row[0],
                                email=info_row[1],
                                can_view_submissions=row[3],
                                created_at=row[4]
                            ))
    
    return designees


@router.post("", response_model=DesigneeInfo)
async def add_designee(
    request: AddDesigneeRequest,
    broker: dict = Depends(get_current_broker_from_session)
):
    """
    Add a designee (grant access to another user).
    """
    # Find the designee by email
    designee = find_broker_by_email(request.email)
    if not designee:
        raise HTTPException(
            status_code=404,
            detail="No broker found with this email address"
        )
    
    # Can't add yourself
    if designee["email"].lower() == broker["email"].lower():
        raise HTTPException(
            status_code=400,
            detail="You cannot add yourself as a designee"
        )
    
    with get_conn() as conn:
        # Check if already a designee
        if broker["broker_contact_id"] and designee.get("broker_contact_id"):
            result = conn.execute(text("""
                SELECT id
                FROM broker_designees
                WHERE owner_contact_id = :owner_id
                AND designee_contact_id = :designee_id
            """), {
                "owner_id": broker["broker_contact_id"],
                "designee_id": designee["broker_contact_id"]
            })
            if result.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="This user is already a designee"
                )
        
        if broker["broker_employment_id"] and designee.get("broker_employment_id"):
            result = conn.execute(text("""
                SELECT id
                FROM broker_designees
                WHERE owner_employment_id = :owner_id
                AND designee_employment_id = :designee_id
            """), {
                "owner_id": broker["broker_employment_id"],
                "designee_id": designee["broker_employment_id"]
            })
            if result.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="This user is already a designee"
                )
        
        # Insert designee
        result = conn.execute(text("""
            INSERT INTO broker_designees (
                owner_contact_id, owner_employment_id,
                designee_contact_id, designee_employment_id,
                can_view_submissions, created_by
            ) VALUES (
                :owner_contact_id, :owner_employment_id,
                :designee_contact_id, :designee_employment_id,
                :can_view_submissions, :created_by
            )
            RETURNING id, created_at
        """), {
            "owner_contact_id": broker.get("broker_contact_id"),
            "owner_employment_id": broker.get("broker_employment_id"),
            "designee_contact_id": designee.get("broker_contact_id"),
            "designee_employment_id": designee.get("broker_employment_id"),
            "can_view_submissions": request.can_view_submissions,
            "created_by": broker["email"]
        })
        
        row = result.fetchone()
        designee_id = str(row[0])
        created_at = row[1]
        
        return DesigneeInfo(
            id=designee_id,
            name=designee["name"],
            email=designee["email"],
            can_view_submissions=request.can_view_submissions,
            created_at=created_at
        )


@router.delete("/{designee_id}")
async def remove_designee(
    designee_id: str,
    broker: dict = Depends(get_current_broker_from_session)
):
    """
    Remove a designee (revoke access).
    """
    with get_conn() as conn:
        # Verify ownership
        if broker["broker_contact_id"]:
            result = conn.execute(text("""
                SELECT id
                FROM broker_designees
                WHERE id = :designee_id
                AND owner_contact_id = :owner_id
            """), {
                "designee_id": designee_id,
                "owner_id": broker["broker_contact_id"]
            })
            if not result.fetchone():
                if broker["broker_employment_id"]:
                    result = conn.execute(text("""
                        SELECT id
                        FROM broker_designees
                        WHERE id = :designee_id
                        AND owner_employment_id = :owner_id
                    """), {
                        "designee_id": designee_id,
                        "owner_id": broker["broker_employment_id"]
                    })
                    if not result.fetchone():
                        raise HTTPException(
                            status_code=403,
                            detail="You don't have permission to remove this designee"
                        )
        elif broker["broker_employment_id"]:
            result = conn.execute(text("""
                SELECT id
                FROM broker_designees
                WHERE id = :designee_id
                AND owner_employment_id = :owner_id
            """), {
                "designee_id": designee_id,
                "owner_id": broker["broker_employment_id"]
            })
            if not result.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="You don't have permission to remove this designee"
                )
        
        # Delete designee
        conn.execute(text("""
            DELETE FROM broker_designees
            WHERE id = :designee_id
        """), {"designee_id": designee_id})
        
        return {"success": True, "message": "Designee removed"}

