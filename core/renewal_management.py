"""
Renewal Management Module

Handles renewal workflow operations including:
- Creating renewal expectations for upcoming policy expirations
- Converting expected renewals to received when broker sends submission
- Tracking renewal chains across policy years
- Reporting on renewal metrics
"""

from datetime import datetime, date, timedelta
from typing import Optional
from sqlalchemy import text
import os
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn

# Import bound option for carryover
from core.bound_option import get_bound_option, copy_bound_option_to_renewal


def create_renewal_expectation(
    bound_submission_id: str,
    effective_date: Optional[date] = None,
    created_by: str = "system"
) -> str:
    """
    Create a placeholder submission for an expected renewal.

    This is called when a policy is approaching expiration to track
    the expected renewal before the broker actually sends it.

    Args:
        bound_submission_id: UUID of the bound submission that's expiring
        effective_date: Expected effective date (defaults to expiration + 1 day)
        created_by: User/system creating the expectation

    Returns:
        UUID of the new renewal expectation submission
    """
    with get_conn() as conn:
        # Get the bound submission's details
        result = conn.execute(text("""
            SELECT applicant_name, account_id, expiration_date, website,
                   naics_primary_code, naics_primary_title,
                   naics_secondary_code, naics_secondary_title,
                   annual_revenue, broker_email
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": bound_submission_id})

        row = result.fetchone()
        if not row:
            raise ValueError(f"Submission {bound_submission_id} not found")

        (applicant_name, account_id, expiration_date, website,
         naics_primary_code, naics_primary_title,
         naics_secondary_code, naics_secondary_title,
         annual_revenue, broker_email) = row

        # Calculate new effective date
        if not effective_date:
            if expiration_date:
                effective_date = expiration_date + timedelta(days=1)
            else:
                effective_date = date.today() + timedelta(days=365)

        # Calculate new expiration (1 year from effective)
        new_expiration = effective_date + timedelta(days=365)

        # Create the renewal expectation submission
        result = conn.execute(text("""
            INSERT INTO submissions (
                applicant_name, account_id, website,
                naics_primary_code, naics_primary_title,
                naics_secondary_code, naics_secondary_title,
                annual_revenue, broker_email,
                prior_submission_id, renewal_type,
                effective_date, expiration_date,
                submission_status, submission_outcome,
                date_received
            ) VALUES (
                :applicant_name, :account_id, :website,
                :naics_primary_code, :naics_primary_title,
                :naics_secondary_code, :naics_secondary_title,
                :annual_revenue, :broker_email,
                :prior_submission_id, 'renewal',
                :effective_date, :expiration_date,
                'renewal_expected', 'pending',
                :date_received
            )
            RETURNING id
        """), {
            "applicant_name": applicant_name,
            "account_id": account_id,
            "website": website,
            "naics_primary_code": naics_primary_code,
            "naics_primary_title": naics_primary_title,
            "naics_secondary_code": naics_secondary_code,
            "naics_secondary_title": naics_secondary_title,
            "annual_revenue": annual_revenue,
            "broker_email": broker_email,
            "prior_submission_id": bound_submission_id,
            "effective_date": effective_date,
            "expiration_date": new_expiration,
            "date_received": datetime.utcnow()
        })

        new_submission_id = str(result.fetchone()[0])
        conn.commit()

        return new_submission_id


def convert_to_received(
    submission_id: str,
    carry_over_bound_option: bool = True,
    changed_by: str = "system"
) -> bool:
    """
    Convert a renewal_expected submission to received status.

    Called when the broker actually sends the renewal submission.

    Args:
        submission_id: UUID of the renewal expectation submission
        carry_over_bound_option: If True, copy prior year's bound option
        changed_by: User making the change

    Returns:
        True if successful
    """
    with get_conn() as conn:
        # Update status to received
        result = conn.execute(text("""
            UPDATE submissions
            SET submission_status = 'received',
                date_received = :date_received,
                updated_at = :updated_at
            WHERE id = :submission_id
            AND submission_status = 'renewal_expected'
        """), {
            "submission_id": submission_id,
            "date_received": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        })

        if result.rowcount == 0:
            return False

        conn.commit()

        # Optionally carry over the bound option from prior year
        if carry_over_bound_option:
            # Get prior submission ID
            result = conn.execute(text("""
                SELECT prior_submission_id FROM submissions WHERE id = :submission_id
            """), {"submission_id": submission_id})
            row = result.fetchone()
            if row and row[0]:
                copy_bound_option_to_renewal(
                    from_submission_id=str(row[0]),
                    to_submission_id=submission_id,
                    copy_as_bound=False,
                    created_by=changed_by
                )

        # Record status history
        from core.status_history import record_status_change
        record_status_change(
            submission_id=submission_id,
            old_status="renewal_expected",
            new_status="received",
            old_outcome="pending",
            new_outcome="pending",
            changed_by=changed_by,
            notes="Renewal submission received from broker"
        )

        return True


def mark_renewal_not_received(submission_id: str, changed_by: str = "system", reason: str = "") -> bool:
    """
    Mark a renewal expectation as not received (lost).

    Called when the grace period has passed and no submission arrived.

    Args:
        submission_id: UUID of the renewal expectation submission
        changed_by: User making the change
        reason: Reason for not receiving (optional)

    Returns:
        True if successful
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE submissions
            SET submission_status = 'renewal_not_received',
                submission_outcome = 'lost',
                outcome_reason = :reason,
                status_updated_at = :updated_at,
                updated_at = :updated_at
            WHERE id = :submission_id
            AND submission_status = 'renewal_expected'
        """), {
            "submission_id": submission_id,
            "reason": reason or "Renewal not received from broker",
            "updated_at": datetime.utcnow()
        })

        if result.rowcount == 0:
            return False

        conn.commit()

        # Record status history
        from core.status_history import record_status_change
        record_status_change(
            submission_id=submission_id,
            old_status="renewal_expected",
            new_status="renewal_not_received",
            old_outcome="pending",
            new_outcome="lost",
            changed_by=changed_by,
            notes=reason or "Renewal not received from broker"
        )

        return True


def link_renewal_to_prior(submission_id: str, prior_submission_id: str) -> bool:
    """
    Manually link a submission to its prior year submission.

    Args:
        submission_id: UUID of the current submission
        prior_submission_id: UUID of the prior year submission

    Returns:
        True if successful
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE submissions
            SET prior_submission_id = :prior_submission_id,
                renewal_type = 'renewal',
                updated_at = :updated_at
            WHERE id = :submission_id
        """), {
            "submission_id": submission_id,
            "prior_submission_id": prior_submission_id,
            "updated_at": datetime.utcnow()
        })

        conn.commit()
        return result.rowcount > 0


def get_renewal_chain(submission_id: str) -> list[dict]:
    """
    Get the full renewal chain for a submission (all prior years).

    Args:
        submission_id: UUID of any submission in the chain

    Returns:
        List of submissions in chronological order (oldest first)
    """
    chain = []
    current_id = submission_id

    with get_conn() as conn:
        # Walk backwards through prior_submission_id links
        while current_id:
            result = conn.execute(text("""
                SELECT id, applicant_name, date_received, effective_date, expiration_date,
                       submission_status, submission_outcome, prior_submission_id, renewal_type
                FROM submissions
                WHERE id = :submission_id
            """), {"submission_id": current_id})

            row = result.fetchone()
            if not row:
                break

            chain.append({
                "id": str(row[0]),
                "applicant_name": row[1],
                "date_received": row[2],
                "effective_date": row[3],
                "expiration_date": row[4],
                "submission_status": row[5],
                "submission_outcome": row[6],
                "prior_submission_id": str(row[7]) if row[7] else None,
                "renewal_type": row[8]
            })

            current_id = row[7]  # Move to prior submission

    # Reverse to get chronological order (oldest first)
    chain.reverse()
    return chain


def get_upcoming_renewals(days_ahead: int = 90) -> list[dict]:
    """
    Get submissions with policies expiring in the next X days.

    Args:
        days_ahead: Number of days to look ahead

    Returns:
        List of submissions with upcoming expirations
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT s.id, s.applicant_name, s.expiration_date,
                   s.expiration_date - CURRENT_DATE as days_until_expiry,
                   a.name as account_name,
                   t.sold_premium, t.quote_name
            FROM submissions s
            LEFT JOIN accounts a ON a.id = s.account_id
            LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.submission_outcome = 'bound'
            AND s.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days_ahead * INTERVAL '1 day'
            ORDER BY s.expiration_date
        """), {"days_ahead": days_ahead})

        return [
            {
                "id": str(row[0]),
                "applicant_name": row[1],
                "expiration_date": row[2],
                "days_until_expiry": row[3],
                "account_name": row[4],
                "sold_premium": row[5],
                "quote_name": row[6]
            }
            for row in result.fetchall()
        ]


def get_renewals_not_received() -> list[dict]:
    """
    Get all renewal expectations that were never received.

    Returns:
        List of renewal_not_received submissions
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT s.id, s.applicant_name, s.effective_date, s.expiration_date,
                   s.outcome_reason, s.status_updated_at,
                   a.name as account_name,
                   prior.id as prior_submission_id
            FROM submissions s
            LEFT JOIN accounts a ON a.id = s.account_id
            LEFT JOIN submissions prior ON prior.id = s.prior_submission_id
            WHERE s.submission_status = 'renewal_not_received'
            ORDER BY s.status_updated_at DESC
        """))

        return [
            {
                "id": str(row[0]),
                "applicant_name": row[1],
                "effective_date": row[2],
                "expiration_date": row[3],
                "outcome_reason": row[4],
                "status_updated_at": row[5],
                "account_name": row[6],
                "prior_submission_id": str(row[7]) if row[7] else None
            }
            for row in result.fetchall()
        ]


def get_renewal_expected_submissions() -> list[dict]:
    """
    Get all pending renewal expectations (not yet received).

    Returns:
        List of renewal_expected submissions
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT s.id, s.applicant_name, s.effective_date, s.expiration_date,
                   a.name as account_name,
                   prior.expiration_date as prior_expiration
            FROM submissions s
            LEFT JOIN accounts a ON a.id = s.account_id
            LEFT JOIN submissions prior ON prior.id = s.prior_submission_id
            WHERE s.submission_status = 'renewal_expected'
            ORDER BY s.effective_date
        """))

        return [
            {
                "id": str(row[0]),
                "applicant_name": row[1],
                "effective_date": row[2],
                "expiration_date": row[3],
                "account_name": row[4],
                "prior_expiration": row[5]
            }
            for row in result.fetchall()
        ]


def set_policy_dates(
    submission_id: str,
    effective_date: date,
    expiration_date: Optional[date] = None
) -> bool:
    """
    Set the policy effective and expiration dates for a submission.

    Args:
        submission_id: UUID of the submission
        effective_date: Policy effective date
        expiration_date: Policy expiration date (defaults to effective + 1 year)

    Returns:
        True if successful
    """
    if not expiration_date:
        expiration_date = effective_date + timedelta(days=365)

    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE submissions
            SET effective_date = :effective_date,
                expiration_date = :expiration_date,
                updated_at = :updated_at
            WHERE id = :submission_id
        """), {
            "submission_id": submission_id,
            "effective_date": effective_date,
            "expiration_date": expiration_date,
            "updated_at": datetime.utcnow()
        })

        conn.commit()
        return result.rowcount > 0
