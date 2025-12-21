"""
Broker of Record (BOR) Management Module

Handles tracking and managing broker of record changes for submissions.
Works in conjunction with the endorsement system for workflow/approval.

Key concepts:
- broker_of_record_history: Tracks all broker assignments over time
- bor_change endorsement: Used for midterm BOR changes (draft -> issued -> void)
- Original assignment created when policy binds
"""

from datetime import datetime, date
from typing import Optional
from sqlalchemy import text
import os
import json
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn


def initialize_broker_history(
    submission_id: str,
    broker_id: str,
    broker_contact_id: str = None,
    effective_date: date = None,
    created_by: str = "system"
) -> Optional[str]:
    """
    Create the initial broker history record when a policy binds.

    This establishes the original broker assignment before any BOR changes.
    Should be called from bind_option() after marking a tower as bound.

    Args:
        submission_id: UUID of the submission
        broker_id: UUID of the assigned broker
        broker_contact_id: UUID of the broker contact (optional)
        effective_date: Policy effective date (fetched from submission if not provided)
        created_by: User/system creating the record

    Returns:
        UUID of the history record, or None if broker_id is None
    """
    if not broker_id:
        return None

    with get_conn() as conn:
        # Get effective date from submission if not provided
        if effective_date is None:
            result = conn.execute(text("""
                SELECT effective_date FROM submissions WHERE id = :submission_id
            """), {"submission_id": submission_id})
            row = result.fetchone()
            effective_date = row[0] if row else date.today()

        # Check if history already exists for this submission
        result = conn.execute(text("""
            SELECT id FROM broker_of_record_history
            WHERE submission_id = :submission_id
            LIMIT 1
        """), {"submission_id": submission_id})

        if result.fetchone():
            # History already exists, don't create duplicate
            return None

        # Create initial history record
        result = conn.execute(text("""
            INSERT INTO broker_of_record_history (
                submission_id, broker_id, broker_contact_id,
                effective_date, end_date, change_type, created_by
            ) VALUES (
                :submission_id, :broker_id, :broker_contact_id,
                :effective_date, NULL, 'original', :created_by
            )
            RETURNING id
        """), {
            "submission_id": submission_id,
            "broker_id": broker_id,
            "broker_contact_id": broker_contact_id,
            "effective_date": effective_date,
            "created_by": created_by,
        })

        return str(result.fetchone()[0])


def process_bor_issuance(
    endorsement_id: str,
    submission_id: str,
    change_details: dict,
    effective_date: date,
    issued_by: str = "system"
) -> bool:
    """
    Process a BOR endorsement being issued.

    Called by issue_endorsement() when endorsement_type is 'bor_change'.

    Actions:
    1. Close the current broker history record (set end_date)
    2. Create new broker history record with new broker
    3. Update submissions.broker_id to new broker

    Args:
        endorsement_id: UUID of the BOR endorsement being issued
        submission_id: UUID of the submission
        change_details: JSONB with new_broker_id, new_contact_id, etc.
        effective_date: When the BOR takes effect
        issued_by: User issuing the endorsement

    Returns:
        True if successful
    """
    new_broker_id = change_details.get("new_broker_id")
    new_contact_id = change_details.get("new_contact_id")
    bor_letter_doc_id = change_details.get("bor_letter_document_id")
    change_reason = change_details.get("change_reason")

    if not new_broker_id:
        return False

    with get_conn() as conn:
        # Get current broker record to validate dates
        result = conn.execute(text("""
            SELECT id, effective_date FROM broker_of_record_history
            WHERE submission_id = :submission_id
            AND end_date IS NULL
        """), {"submission_id": submission_id})

        current_record = result.fetchone()

        if current_record:
            current_effective = current_record[1]

            # Validate: BOR effective date must be >= current broker's effective date
            if effective_date < current_effective:
                raise ValueError(
                    f"BOR effective date ({effective_date}) cannot be before "
                    f"current broker's effective date ({current_effective})"
                )

            # Close current broker history record
            conn.execute(text("""
                UPDATE broker_of_record_history
                SET end_date = :effective_date
                WHERE id = :record_id
            """), {
                "record_id": current_record[0],
                "effective_date": effective_date,
            })

        # Create new broker history record
        conn.execute(text("""
            INSERT INTO broker_of_record_history (
                submission_id, broker_id, broker_contact_id,
                effective_date, end_date, change_type,
                change_reason, bor_letter_document_id, endorsement_id,
                created_by
            ) VALUES (
                :submission_id, :broker_id, :broker_contact_id,
                :effective_date, NULL, 'bor_change',
                :change_reason, :bor_letter_document_id, :endorsement_id,
                :created_by
            )
        """), {
            "submission_id": submission_id,
            "broker_id": new_broker_id,
            "broker_contact_id": new_contact_id,
            "effective_date": effective_date,
            "change_reason": change_reason,
            "bor_letter_document_id": bor_letter_doc_id,
            "endorsement_id": endorsement_id,
            "created_by": issued_by,
        })

        # Update submission's broker fields
        # The brkr system uses: broker_org_id (TEXT), broker_employment_id (TEXT)
        # Also update broker_id (UUID) for compatibility
        conn.execute(text("""
            UPDATE submissions
            SET broker_id = CAST(:broker_id AS uuid),
                broker_org_id = :broker_org_id,
                broker_employment_id = :broker_employment_id
            WHERE id = :submission_id
        """), {
            "submission_id": submission_id,
            "broker_id": str(new_broker_id) if new_broker_id else None,
            "broker_org_id": str(new_broker_id) if new_broker_id else None,  # TEXT column
            "broker_employment_id": str(new_contact_id) if new_contact_id else None,  # TEXT column
        })

        return True


def revert_bor_change(
    endorsement_id: str,
    submission_id: str
) -> bool:
    """
    Revert a BOR change when an endorsement is voided.

    Called by void_endorsement() when endorsement_type is 'bor_change'.

    Actions:
    1. Delete the broker history record created by this endorsement
    2. Reopen the previous broker history record (set end_date to NULL)
    3. Update submissions.broker_id to previous broker

    Args:
        endorsement_id: UUID of the BOR endorsement being voided
        submission_id: UUID of the submission

    Returns:
        True if successful
    """
    with get_conn() as conn:
        # Get the history record for this endorsement
        result = conn.execute(text("""
            SELECT id, effective_date FROM broker_of_record_history
            WHERE endorsement_id = :endorsement_id
        """), {"endorsement_id": endorsement_id})

        row = result.fetchone()
        if not row:
            return False

        bor_history_id = row[0]
        effective_date = row[1]

        # Find the previous broker history record
        result = conn.execute(text("""
            SELECT id, broker_id FROM broker_of_record_history
            WHERE submission_id = :submission_id
            AND end_date = :effective_date
            AND id != :current_id
        """), {
            "submission_id": submission_id,
            "effective_date": effective_date,
            "current_id": bor_history_id,
        })

        prev_row = result.fetchone()

        # Delete the current BOR history record
        conn.execute(text("""
            DELETE FROM broker_of_record_history
            WHERE id = :bor_history_id
        """), {"bor_history_id": bor_history_id})

        if prev_row:
            prev_broker_id = prev_row[1]

            # Reopen the previous record
            conn.execute(text("""
                UPDATE broker_of_record_history
                SET end_date = NULL
                WHERE id = :prev_id
            """), {"prev_id": prev_row[0]})

            # Get previous contact_id from history
            prev_contact_result = conn.execute(text("""
                SELECT broker_contact_id FROM broker_of_record_history
                WHERE id = :prev_id
            """), {"prev_id": prev_row[0]})
            prev_contact_row = prev_contact_result.fetchone()
            prev_contact_id = prev_contact_row[0] if prev_contact_row else None

            # Restore submission's broker fields to previous broker
            conn.execute(text("""
                UPDATE submissions
                SET broker_id = CAST(:broker_id AS uuid),
                    broker_org_id = :broker_org_id,
                    broker_employment_id = :broker_employment_id
                WHERE id = :submission_id
            """), {
                "submission_id": submission_id,
                "broker_id": str(prev_broker_id) if prev_broker_id else None,
                "broker_org_id": str(prev_broker_id) if prev_broker_id else None,
                "broker_employment_id": str(prev_contact_id) if prev_contact_id else None,
            })

        return True


def get_current_broker(submission_id: str) -> Optional[dict]:
    """
    Get the current broker assignment for a submission.

    Returns the active broker history record (where end_date IS NULL),
    falling back to submissions.broker_id if no history exists.

    Supports both brkr_organizations (alt system) and simple brokers table.

    Args:
        submission_id: UUID of the submission

    Returns:
        dict with broker info or None
    """
    with get_conn() as conn:
        # First try broker history with brkr_organizations
        result = conn.execute(text("""
            SELECT
                bh.id as history_id,
                bh.broker_id,
                COALESCE(bo.name, b.company_name) as broker_name,
                bh.broker_contact_id,
                COALESCE(
                    p.first_name || ' ' || p.last_name,
                    bc.first_name || ' ' || bc.last_name
                ) as contact_name,
                COALESCE(e.email, bc.email) as contact_email,
                bh.effective_date,
                bh.change_type
            FROM broker_of_record_history bh
            LEFT JOIN brkr_organizations bo ON bh.broker_id = bo.org_id
            LEFT JOIN brokers b ON bh.broker_id = b.id
            LEFT JOIN brkr_employments e ON bh.broker_contact_id = e.employment_id
            LEFT JOIN brkr_people p ON e.person_id = p.person_id
            LEFT JOIN broker_contacts bc ON bh.broker_contact_id = bc.id
            WHERE bh.submission_id = :submission_id
            AND bh.end_date IS NULL
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if row:
            return {
                "history_id": str(row[0]),
                "broker_id": str(row[1]),
                "broker_name": row[2],
                "broker_contact_id": str(row[3]) if row[3] else None,
                "contact_name": row[4],
                "contact_email": row[5],
                "effective_date": row[6],
                "change_type": row[7],
            }

        # Fall back to submissions broker fields with support for both broker systems
        # Check broker_org_id/broker_employment_id first (brkr system), then broker_id
        # Note: broker_org_id and broker_employment_id are TEXT, need to cast to UUID safely
        # Use NULLIF to convert empty strings to NULL before casting
        result = conn.execute(text("""
            SELECT
                COALESCE(NULLIF(s.broker_org_id, '')::uuid, s.broker_id) as broker_id,
                COALESCE(bo.name, bo2.name, b.company_name) as broker_name,
                s.broker_employment_id,
                p.first_name || ' ' || p.last_name as contact_name,
                e.email as contact_email
            FROM submissions s
            LEFT JOIN brkr_organizations bo ON NULLIF(s.broker_org_id, '')::uuid = bo.org_id
            LEFT JOIN brkr_organizations bo2 ON s.broker_id = bo2.org_id
            LEFT JOIN brokers b ON s.broker_id = b.id
            LEFT JOIN brkr_employments e ON NULLIF(s.broker_employment_id, '')::uuid = e.employment_id
            LEFT JOIN brkr_people p ON e.person_id = p.person_id
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if row and row[0]:
            return {
                "history_id": None,
                "broker_id": str(row[0]),
                "broker_name": row[1],
                "broker_contact_id": str(row[2]) if row[2] else None,
                "contact_name": row[3],
                "contact_email": row[4],
                "effective_date": None,
                "change_type": "original",
            }

        return None


def get_broker_at_date(submission_id: str, as_of_date: date) -> Optional[dict]:
    """
    Get the broker who was assigned on a specific date.

    Supports both brkr_organizations (alt system) and simple brokers table.

    Args:
        submission_id: UUID of the submission
        as_of_date: The date to check

    Returns:
        dict with broker info or None
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                bh.id as history_id,
                bh.broker_id,
                COALESCE(bo.name, b.company_name) as broker_name,
                bh.broker_contact_id,
                COALESCE(
                    p.first_name || ' ' || p.last_name,
                    bc.first_name || ' ' || bc.last_name
                ) as contact_name,
                bh.effective_date,
                bh.end_date,
                bh.change_type
            FROM broker_of_record_history bh
            LEFT JOIN brkr_organizations bo ON bh.broker_id = bo.org_id
            LEFT JOIN brokers b ON bh.broker_id = b.id
            LEFT JOIN brkr_employments e ON bh.broker_contact_id = e.employment_id
            LEFT JOIN brkr_people p ON e.person_id = p.person_id
            LEFT JOIN broker_contacts bc ON bh.broker_contact_id = bc.id
            WHERE bh.submission_id = :submission_id
            AND bh.effective_date <= :as_of_date
            AND (bh.end_date IS NULL OR bh.end_date > :as_of_date)
        """), {
            "submission_id": submission_id,
            "as_of_date": as_of_date,
        })

        row = result.fetchone()
        if row:
            return {
                "history_id": str(row[0]),
                "broker_id": str(row[1]),
                "broker_name": row[2],
                "broker_contact_id": str(row[3]) if row[3] else None,
                "contact_name": row[4],
                "effective_date": row[5],
                "end_date": row[6],
                "change_type": row[7],
            }

        return None


def get_broker_history(submission_id: str) -> list[dict]:
    """
    Get the full broker assignment history for a submission.

    Returns all broker history records ordered by effective date.
    Supports both brkr_organizations (alt system) and simple brokers table.

    Args:
        submission_id: UUID of the submission

    Returns:
        List of broker history records
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                bh.id,
                bh.broker_id,
                COALESCE(bo.name, b.company_name) as broker_name,
                bh.broker_contact_id,
                COALESCE(
                    p.first_name || ' ' || p.last_name,
                    bc.first_name || ' ' || bc.last_name
                ) as contact_name,
                COALESCE(e.email, bc.email) as contact_email,
                bh.effective_date,
                bh.end_date,
                bh.change_type,
                bh.change_reason,
                bh.endorsement_id,
                bh.created_at,
                bh.created_by
            FROM broker_of_record_history bh
            LEFT JOIN brkr_organizations bo ON bh.broker_id = bo.org_id
            LEFT JOIN brokers b ON bh.broker_id = b.id
            LEFT JOIN brkr_employments e ON bh.broker_contact_id = e.employment_id
            LEFT JOIN brkr_people p ON e.person_id = p.person_id
            LEFT JOIN broker_contacts bc ON bh.broker_contact_id = bc.id
            WHERE bh.submission_id = :submission_id
            ORDER BY bh.effective_date ASC
        """), {"submission_id": submission_id})

        return [
            {
                "id": str(row[0]),
                "broker_id": str(row[1]),
                "broker_name": row[2],
                "broker_contact_id": str(row[3]) if row[3] else None,
                "contact_name": row[4],
                "contact_email": row[5],
                "effective_date": row[6],
                "end_date": row[7],
                "change_type": row[8],
                "change_reason": row[9],
                "endorsement_id": str(row[10]) if row[10] else None,
                "created_at": row[11],
                "created_by": row[12],
                "is_current": row[7] is None,  # end_date is NULL
            }
            for row in result.fetchall()
        ]


def get_brokers_list() -> list[dict]:
    """
    Get all brokerage organizations for selection dropdowns.

    Uses brkr_organizations table (the alt broker system).

    Returns:
        List of broker dicts with id, company_name
    """
    with get_conn() as conn:
        # First try brkr_organizations (alt system)
        result = conn.execute(text("""
            SELECT org_id, name
            FROM brkr_organizations
            WHERE org_type = 'brokerage'
            ORDER BY name
        """))

        rows = result.fetchall()
        if rows:
            return [
                {"id": str(row[0]), "company_name": row[1]}
                for row in rows
            ]

        # Fallback to simple brokers table
        result = conn.execute(text("""
            SELECT id, company_name
            FROM brokers
            ORDER BY company_name
        """))

        return [
            {"id": str(row[0]), "company_name": row[1]}
            for row in result.fetchall()
        ]


def get_broker_contacts(broker_id: str) -> list[dict]:
    """
    Get contacts (employees) for a specific broker organization.

    Uses brkr_employments + brkr_people tables (the alt broker system).

    Args:
        broker_id: UUID of the broker organization (org_id)

    Returns:
        List of contact dicts
    """
    with get_conn() as conn:
        # First try brkr_employments (alt system)
        result = conn.execute(text("""
            SELECT
                e.employment_id,
                p.first_name,
                p.last_name,
                e.email,
                e.active
            FROM brkr_employments e
            JOIN brkr_people p ON e.person_id = p.person_id
            WHERE e.org_id = :org_id
            AND e.active = TRUE
            ORDER BY p.last_name, p.first_name
        """), {"org_id": broker_id})

        rows = result.fetchall()
        if rows:
            return [
                {
                    "id": str(row[0]),  # employment_id
                    "first_name": row[1],
                    "last_name": row[2],
                    "full_name": f"{row[1]} {row[2]}",
                    "email": row[3],
                    "title": None,
                    "is_primary": False,
                }
                for row in rows
            ]

        # Fallback to simple broker_contacts table
        result = conn.execute(text("""
            SELECT id, first_name, last_name, email, title, is_primary
            FROM broker_contacts
            WHERE broker_id = :broker_id
            ORDER BY is_primary DESC, last_name, first_name
        """), {"broker_id": broker_id})

        return [
            {
                "id": str(row[0]),
                "first_name": row[1],
                "last_name": row[2],
                "full_name": f"{row[1]} {row[2]}",
                "email": row[3],
                "title": row[4],
                "is_primary": row[5],
            }
            for row in result.fetchall()
        ]


def get_all_broker_employments() -> list[dict]:
    """
    Get all broker employments as a flat list for dropdown selection.

    Returns list of dicts with employment details including org name,
    suitable for a single searchable dropdown.

    Returns:
        List of dicts with id, display_name, org_id, org_name, person_name, email
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                e.employment_id,
                o.org_id,
                o.name as org_name,
                p.first_name,
                p.last_name,
                e.email
            FROM brkr_employments e
            JOIN brkr_organizations o ON e.org_id = o.org_id
            JOIN brkr_people p ON e.person_id = p.person_id
            WHERE e.active = TRUE
            ORDER BY o.name, p.last_name, p.first_name
        """))

        results = []
        for row in result.fetchall():
            emp_id, org_id, org_name, first, last, email = row
            person_name = f"{first} {last}"
            display = f"{org_name} - {person_name}"
            if email:
                display += f" ({email})"
            results.append({
                "id": str(emp_id),
                "org_id": str(org_id),
                "org_name": org_name,
                "person_name": person_name,
                "email": email,
                "display_name": display,
            })
        return results


def build_bor_change_details(
    previous_broker_id: str,
    previous_broker_name: str,
    new_broker_id: str,
    new_broker_name: str,
    previous_contact_id: str = None,
    previous_contact_name: str = None,
    new_contact_id: str = None,
    new_contact_name: str = None,
    bor_letter_received_date: date = None,
    bor_letter_document_id: str = None,
    change_reason: str = None
) -> dict:
    """
    Build the change_details JSONB structure for a BOR endorsement.

    This helper ensures consistent structure for BOR endorsement data.

    Returns:
        dict suitable for storing in change_details column
    """
    details = {
        "previous_broker_id": previous_broker_id,
        "previous_broker_name": previous_broker_name,
        "new_broker_id": new_broker_id,
        "new_broker_name": new_broker_name,
    }

    if previous_contact_id:
        details["previous_contact_id"] = previous_contact_id
    if previous_contact_name:
        details["previous_contact_name"] = previous_contact_name
    if new_contact_id:
        details["new_contact_id"] = new_contact_id
    if new_contact_name:
        details["new_contact_name"] = new_contact_name
    if bor_letter_received_date:
        details["bor_letter_received_date"] = str(bor_letter_received_date)
    if bor_letter_document_id:
        details["bor_letter_document_id"] = bor_letter_document_id
    if change_reason:
        details["change_reason"] = change_reason

    return details
