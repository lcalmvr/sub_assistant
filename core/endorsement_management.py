"""
Endorsement Management Module

Handles midterm policy transactions/modifications during the policy term.
Distinct from "as-bound endorsements" which are policy form modifications.

Endorsement types:
- coverage_change: Limit/retention/coverage modifications
- cancellation: Policy cancellation
- reinstatement: Policy reinstatement after cancellation
- name_change: Named insured change
- address_change: Address change
- erp: Extended Reporting Period
- other: Miscellaneous endorsements
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


# Endorsement type configuration
ENDORSEMENT_TYPES = {
    "coverage_change": {"label": "Coverage Change", "carries_to_renewal": True},
    "cancellation": {"label": "Cancellation", "carries_to_renewal": False},
    "reinstatement": {"label": "Reinstatement", "carries_to_renewal": False},
    "name_change": {"label": "Named Insured Change", "carries_to_renewal": True},
    "address_change": {"label": "Address Change", "carries_to_renewal": True},
    "erp": {"label": "Extended Reporting Period", "carries_to_renewal": False},
    "extension": {"label": "Policy Extension", "carries_to_renewal": False},
    "bor_change": {"label": "Broker of Record Change", "carries_to_renewal": True},
    "other": {"label": "Other", "carries_to_renewal": True},
}

PREMIUM_METHODS = {
    "pro_rata": "Pro-Rata",
    "flat": "Flat",
    "manual": "Manual Entry",
}


def get_next_endorsement_number(submission_id: str) -> int:
    """Get the next sequential endorsement number for a submission."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT COALESCE(MAX(endorsement_number), 0) + 1
            FROM policy_endorsements
            WHERE submission_id = :submission_id
            AND status != 'void'
        """), {"submission_id": submission_id})
        return result.fetchone()[0]


def create_endorsement(
    submission_id: str,
    tower_id: str,
    endorsement_type: str,
    effective_date: date,
    description: str,
    change_details: dict = None,
    premium_method: str = "manual",
    premium_change: float = 0,
    original_annual_premium: float = None,
    days_remaining: int = None,
    carries_to_renewal: bool = None,
    notes: str = None,
    catalog_id: str = None,
    formal_title: str = None,
    created_by: str = "system"
) -> str:
    """
    Create a draft endorsement.

    Args:
        submission_id: UUID of the submission
        tower_id: UUID of the bound tower
        endorsement_type: Type from ENDORSEMENT_TYPES
        effective_date: When endorsement takes effect
        description: Description of the endorsement
        change_details: JSONB with type-specific details
        premium_method: pro_rata, flat, or manual
        premium_change: Premium adjustment amount
        original_annual_premium: For pro-rata calculations
        days_remaining: Days remaining in policy term
        carries_to_renewal: Override default carryover behavior
        notes: Additional notes
        catalog_id: UUID of endorsement catalog entry (optional)
        formal_title: Formal title for printing (optional, uses catalog title if catalog_id provided)
        created_by: User creating the endorsement

    Returns:
        UUID of the new endorsement
    """
    if endorsement_type not in ENDORSEMENT_TYPES:
        raise ValueError(f"Invalid endorsement type: {endorsement_type}")

    # Use default carryover behavior if not specified
    if carries_to_renewal is None:
        carries_to_renewal = ENDORSEMENT_TYPES[endorsement_type]["carries_to_renewal"]

    endorsement_number = get_next_endorsement_number(submission_id)

    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO policy_endorsements (
                submission_id, tower_id, endorsement_number, endorsement_type,
                effective_date, description, change_details,
                premium_method, premium_change, original_annual_premium, days_remaining,
                carries_to_renewal, notes, catalog_id, formal_title, created_by, status
            ) VALUES (
                :submission_id, :tower_id, :endorsement_number, :endorsement_type,
                :effective_date, :description, :change_details,
                :premium_method, :premium_change, :original_annual_premium, :days_remaining,
                :carries_to_renewal, :notes, :catalog_id, :formal_title, :created_by, 'draft'
            )
            RETURNING id
        """), {
            "submission_id": submission_id,
            "tower_id": tower_id,
            "endorsement_number": endorsement_number,
            "endorsement_type": endorsement_type,
            "effective_date": effective_date,
            "description": description,
            "change_details": json.dumps(change_details or {}),
            "premium_method": premium_method,
            "premium_change": premium_change,
            "original_annual_premium": original_annual_premium,
            "days_remaining": days_remaining,
            "carries_to_renewal": carries_to_renewal,
            "notes": notes,
            "catalog_id": catalog_id,
            "formal_title": formal_title,
            "created_by": created_by,
        })

        return str(result.fetchone()[0])


def issue_endorsement(endorsement_id: str, issued_by: str = "system") -> bool:
    """
    Issue a draft endorsement, making it effective.

    For extension endorsements, also updates the submission's expiration_date.

    Args:
        endorsement_id: UUID of the endorsement
        issued_by: User issuing the endorsement

    Returns:
        True if successful
    """
    with get_conn() as conn:
        # First get the endorsement details
        result = conn.execute(text("""
            SELECT submission_id, endorsement_type, change_details
            FROM policy_endorsements
            WHERE id = :endorsement_id AND status = 'draft'
        """), {"endorsement_id": endorsement_id})

        row = result.fetchone()
        if not row:
            return False

        submission_id = row[0]
        endorsement_type = row[1]
        change_details = row[2] or {}

        # Issue the endorsement
        result = conn.execute(text("""
            UPDATE policy_endorsements
            SET status = 'issued',
                issued_at = :issued_at,
                issued_by = :issued_by
            WHERE id = :endorsement_id
            AND status = 'draft'
        """), {
            "endorsement_id": endorsement_id,
            "issued_at": datetime.utcnow(),
            "issued_by": issued_by,
        })

        if result.rowcount == 0:
            return False

        # Apply extension effects - update submission expiration date
        if endorsement_type == "extension":
            new_expiration = change_details.get("new_expiration_date")
            if new_expiration:
                # Store original expiration before updating
                conn.execute(text("""
                    UPDATE submissions
                    SET expiration_date = :new_expiration,
                        data_sources = COALESCE(data_sources, '{}'::jsonb) ||
                            jsonb_build_object('expiration_extended', true,
                                             'original_expiration', expiration_date::text)
                    WHERE id = :submission_id
                """), {
                    "submission_id": submission_id,
                    "new_expiration": new_expiration,
                })

        # Apply BOR change effects - update broker history and submission
        if endorsement_type == "bor_change":
            from core.bor_management import process_bor_issuance
            # Get effective_date from the endorsement
            eff_result = conn.execute(text("""
                SELECT effective_date FROM policy_endorsements WHERE id = :endorsement_id
            """), {"endorsement_id": endorsement_id})
            eff_row = eff_result.fetchone()
            effective_date = eff_row[0] if eff_row else None

            if effective_date:
                process_bor_issuance(
                    endorsement_id=endorsement_id,
                    submission_id=submission_id,
                    change_details=change_details,
                    effective_date=effective_date,
                    issued_by=issued_by
                )

        return True


def void_endorsement(endorsement_id: str, reason: str, voided_by: str = "system") -> bool:
    """
    Void an endorsement (draft or issued).

    For BOR endorsements that were issued, also reverts the broker change.

    Args:
        endorsement_id: UUID of the endorsement
        reason: Reason for voiding
        voided_by: User voiding the endorsement

    Returns:
        True if successful
    """
    with get_conn() as conn:
        # First get endorsement details to check if we need to revert BOR
        result = conn.execute(text("""
            SELECT submission_id, endorsement_type, status
            FROM policy_endorsements
            WHERE id = :endorsement_id AND status != 'void'
        """), {"endorsement_id": endorsement_id})

        row = result.fetchone()
        if not row:
            return False

        submission_id = row[0]
        endorsement_type = row[1]
        current_status = row[2]

        # Void the endorsement
        result = conn.execute(text("""
            UPDATE policy_endorsements
            SET status = 'void',
                voided_at = :voided_at,
                voided_by = :voided_by,
                void_reason = :void_reason
            WHERE id = :endorsement_id
            AND status != 'void'
        """), {
            "endorsement_id": endorsement_id,
            "voided_at": datetime.utcnow(),
            "voided_by": voided_by,
            "void_reason": reason,
        })

        if result.rowcount == 0:
            return False

        # Revert BOR change if this was an issued BOR endorsement
        if endorsement_type == "bor_change" and current_status == "issued":
            from core.bor_management import revert_bor_change
            revert_bor_change(endorsement_id, submission_id)

        return True


def get_endorsement(endorsement_id: str) -> Optional[dict]:
    """Get a single endorsement by ID."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, submission_id, tower_id, endorsement_number, endorsement_type,
                   effective_date, created_at, issued_at, voided_at, status,
                   description, change_details, premium_method, premium_change,
                   original_annual_premium, days_remaining, carries_to_renewal,
                   created_by, issued_by, voided_by, void_reason, notes,
                   catalog_id, formal_title
            FROM policy_endorsements
            WHERE id = :endorsement_id
        """), {"endorsement_id": endorsement_id})

        row = result.fetchone()
        if not row:
            return None

        return _row_to_dict(row)


def get_endorsements(submission_id: str, include_voided: bool = False) -> list[dict]:
    """
    Get all endorsements for a submission.

    Args:
        submission_id: UUID of the submission
        include_voided: Include voided endorsements

    Returns:
        List of endorsement dicts ordered by endorsement_number
    """
    with get_conn() as conn:
        if include_voided:
            result = conn.execute(text("""
                SELECT id, submission_id, tower_id, endorsement_number, endorsement_type,
                       effective_date, created_at, issued_at, voided_at, status,
                       description, change_details, premium_method, premium_change,
                       original_annual_premium, days_remaining, carries_to_renewal,
                       created_by, issued_by, voided_by, void_reason, notes,
                       catalog_id, formal_title
                FROM policy_endorsements
                WHERE submission_id = :submission_id
                ORDER BY endorsement_number
            """), {"submission_id": submission_id})
        else:
            result = conn.execute(text("""
                SELECT id, submission_id, tower_id, endorsement_number, endorsement_type,
                       effective_date, created_at, issued_at, voided_at, status,
                       description, change_details, premium_method, premium_change,
                       original_annual_premium, days_remaining, carries_to_renewal,
                       created_by, issued_by, voided_by, void_reason, notes,
                       catalog_id, formal_title
                FROM policy_endorsements
                WHERE submission_id = :submission_id
                AND status != 'void'
                ORDER BY endorsement_number
            """), {"submission_id": submission_id})

        return [_row_to_dict(row) for row in result.fetchall()]


def get_issued_endorsements(submission_id: str) -> list[dict]:
    """Get only issued endorsements for a submission, ordered by effective date."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, submission_id, tower_id, endorsement_number, endorsement_type,
                   effective_date, created_at, issued_at, voided_at, status,
                   description, change_details, premium_method, premium_change,
                   original_annual_premium, days_remaining, carries_to_renewal,
                   created_by, issued_by, voided_by, void_reason, notes,
                   catalog_id, formal_title
            FROM policy_endorsements
            WHERE submission_id = :submission_id
            AND status = 'issued'
            ORDER BY effective_date, endorsement_number
        """), {"submission_id": submission_id})

        return [_row_to_dict(row) for row in result.fetchall()]


def get_endorsements_for_renewal(submission_id: str) -> list[dict]:
    """
    Get endorsements that should carry forward to renewal.

    Filters to issued endorsements where carries_to_renewal=TRUE.

    Args:
        submission_id: UUID of the prior submission

    Returns:
        List of endorsement dicts that carry to renewal
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, submission_id, tower_id, endorsement_number, endorsement_type,
                   effective_date, created_at, issued_at, voided_at, status,
                   description, change_details, premium_method, premium_change,
                   original_annual_premium, days_remaining, carries_to_renewal,
                   created_by, issued_by, voided_by, void_reason, notes,
                   catalog_id, formal_title
            FROM policy_endorsements
            WHERE submission_id = :submission_id
            AND status = 'issued'
            AND carries_to_renewal = TRUE
            ORDER BY effective_date, endorsement_number
        """), {"submission_id": submission_id})

        return [_row_to_dict(row) for row in result.fetchall()]


def calculate_pro_rata_premium(
    annual_premium: float,
    days_remaining: int,
    total_days: int = 365
) -> float:
    """
    Calculate pro-rata premium adjustment.

    Args:
        annual_premium: Full annual premium amount
        days_remaining: Days remaining in policy term
        total_days: Total days in policy term (default 365)

    Returns:
        Pro-rata premium amount (positive for additional, negative for return)
    """
    if total_days <= 0:
        return 0
    return round(annual_premium * (days_remaining / total_days), 2)


def get_effective_policy_state(submission_id: str) -> dict:
    """
    Compute the current effective policy state after all issued endorsements.

    Returns:
        dict with:
        - is_cancelled: bool
        - is_reinstated: bool
        - has_erp: bool
        - is_extended: bool
        - original_expiration: date or None
        - effective_expiration: date or None
        - base_premium: float
        - premium_adjustments: float
        - effective_premium: float
        - endorsement_count: int
        - latest_endorsement_date: date or None
        - change_summary: list of descriptions
    """
    from core.bound_option import get_bound_option

    # Get base state from bound option
    bound = get_bound_option(submission_id)
    if not bound:
        return {
            "is_cancelled": False,
            "is_reinstated": False,
            "has_erp": False,
            "is_extended": False,
            "original_expiration": None,
            "effective_expiration": None,
            "base_premium": 0,
            "premium_adjustments": 0,
            "effective_premium": 0,
            "endorsement_count": 0,
            "latest_endorsement_date": None,
            "change_summary": [],
        }

    base_premium = float(bound.get("sold_premium") or 0)

    # Get current and original expiration dates
    eff_date, exp_date = get_policy_dates(submission_id)
    original_expiration = None
    effective_expiration = exp_date

    # Check if extended - look for original_expiration in data_sources
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT data_sources->>'original_expiration',
                   COALESCE((data_sources->>'expiration_extended')::boolean, false)
            FROM submissions WHERE id = :submission_id
        """), {"submission_id": submission_id})
        row = result.fetchone()
        if row and row[1]:  # is extended
            original_expiration = row[0]

    # Get all issued endorsements
    endorsements = get_issued_endorsements(submission_id)

    is_cancelled = False
    is_reinstated = False
    has_erp = False
    is_extended = original_expiration is not None
    premium_adjustments = 0
    latest_date = None
    change_summary = []

    for e in endorsements:
        premium_adjustments += float(e.get("premium_change") or 0)

        eff_date = e.get("effective_date")
        if eff_date and (latest_date is None or eff_date > latest_date):
            latest_date = eff_date

        change_summary.append(e["description"])

        # Track policy state changes
        if e["endorsement_type"] == "cancellation":
            is_cancelled = True
            is_reinstated = False
        elif e["endorsement_type"] == "reinstatement":
            is_reinstated = True
            is_cancelled = False
        elif e["endorsement_type"] == "erp":
            has_erp = True
        elif e["endorsement_type"] == "extension":
            is_extended = True

    return {
        "is_cancelled": is_cancelled,
        "is_reinstated": is_reinstated,
        "has_erp": has_erp,
        "is_extended": is_extended,
        "original_expiration": original_expiration,
        "effective_expiration": effective_expiration,
        "base_premium": base_premium,
        "premium_adjustments": premium_adjustments,
        "effective_premium": base_premium + premium_adjustments,
        "endorsement_count": len(endorsements),
        "latest_endorsement_date": latest_date,
        "change_summary": change_summary,
    }


def get_policy_dates(submission_id: str) -> tuple:
    """Get effective and expiration dates for a submission."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT effective_date, expiration_date
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if row:
            return row[0], row[1]
        return None, None


def calculate_days_remaining(effective_date: date, expiration_date: date, as_of: date = None) -> int:
    """Calculate days remaining in policy term."""
    if not effective_date or not expiration_date:
        return 0

    if as_of is None:
        as_of = date.today()

    if as_of >= expiration_date:
        return 0

    return (expiration_date - as_of).days


def _row_to_dict(row) -> dict:
    """Convert database row to endorsement dict."""
    return {
        "id": str(row[0]),
        "submission_id": str(row[1]),
        "tower_id": str(row[2]),
        "endorsement_number": row[3],
        "endorsement_type": row[4],
        "effective_date": row[5],
        "created_at": row[6],
        "issued_at": row[7],
        "voided_at": row[8],
        "status": row[9],
        "description": row[10],
        "change_details": row[11] or {},
        "premium_method": row[12],
        "premium_change": float(row[13]) if row[13] else 0,
        "original_annual_premium": float(row[14]) if row[14] else None,
        "days_remaining": row[15],
        "carries_to_renewal": row[16],
        "created_by": row[17],
        "issued_by": row[18],
        "voided_by": row[19],
        "void_reason": row[20],
        "notes": row[21],
        "catalog_id": str(row[22]) if len(row) > 22 and row[22] else None,
        "formal_title": row[23] if len(row) > 23 else None,
        "type_label": ENDORSEMENT_TYPES.get(row[4], {}).get("label", row[4]),
    }
