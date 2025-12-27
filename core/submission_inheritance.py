"""
Submission Data Inheritance

Handles copying/inheriting fields from prior submissions to new ones.
Used when creating renewals, remarkets, or linking existing submissions.
"""

from datetime import datetime, date, timedelta
from typing import Optional
from sqlalchemy import text

from core.db import get_conn


# Fields that can be inherited from prior submission
INHERITABLE_FIELDS = {
    # Field name: (display_name, copy_for_renewal, copy_for_remarket)
    "broker_org_id": ("Broker Organization", True, True),
    "broker_employment_id": ("Broker Contact", True, True),
    "naics_primary_code": ("Primary NAICS Code", True, True),
    "naics_primary_title": ("Primary Industry", True, True),
    "naics_secondary_code": ("Secondary NAICS Code", True, True),
    "naics_secondary_title": ("Secondary Industry", True, True),
    "annual_revenue": ("Annual Revenue", False, False),  # Usually changes YoY, show as reference only
    "website": ("Website", True, True),
    "business_summary": ("Business Description", True, True),
}


def get_inheritable_data(submission_id: str) -> dict:
    """
    Get inheritable field values from a submission.

    Returns dict of field_name -> value for non-null fields.
    """
    fields = list(INHERITABLE_FIELDS.keys())
    field_sql = ", ".join(fields)

    with get_conn() as conn:
        result = conn.execute(
            text(f"SELECT {field_sql} FROM submissions WHERE id = :id"),
            {"id": submission_id}
        )
        row = result.fetchone()

    if not row:
        return {}

    return {
        field: row[i]
        for i, field in enumerate(fields)
        if row[i] is not None
    }


def detect_conflicts(
    target_id: str,
    source_data: dict
) -> list[dict]:
    """
    Detect conflicts between target submission and source data.

    Returns list of conflicts: [{field, display_name, target_value, source_value}]
    """
    target_data = get_inheritable_data(target_id)
    conflicts = []

    for field, source_value in source_data.items():
        if field not in INHERITABLE_FIELDS:
            continue

        target_value = target_data.get(field)

        # Conflict: both have values and they differ
        if target_value is not None and source_value is not None:
            if target_value != source_value:
                display_name = INHERITABLE_FIELDS[field][0]
                conflicts.append({
                    "field": field,
                    "display_name": display_name,
                    "target_value": target_value,
                    "source_value": source_value,
                })

    return conflicts


def inherit_fields(
    target_id: str,
    source_id: str,
    fields_to_copy: Optional[list[str]] = None,
    overwrite_existing: bool = False,
    renewal_type: str = "renewal",
) -> dict:
    """
    Copy fields from source submission to target.

    Args:
        target_id: Submission to update
        source_id: Submission to copy from
        fields_to_copy: Specific fields to copy (None = all applicable)
        overwrite_existing: If True, overwrite even if target has value
        renewal_type: 'renewal' or 'remarket' - affects which fields to copy

    Returns:
        Dict with copied_fields list and any errors
    """
    source_data = get_inheritable_data(source_id)

    if not source_data:
        return {"copied_fields": [], "error": "Source submission not found or has no data"}

    # Determine which fields to copy
    if fields_to_copy:
        fields = [f for f in fields_to_copy if f in INHERITABLE_FIELDS]
    else:
        # Copy fields based on renewal type
        fields = [
            f for f, (_, copy_renewal, copy_remarket) in INHERITABLE_FIELDS.items()
            if (renewal_type == "renewal" and copy_renewal) or
               (renewal_type == "remarket" and copy_remarket)
        ]

    # Get target's current data to check what needs updating
    target_data = get_inheritable_data(target_id)

    # Build update
    updates = {}
    for field in fields:
        source_value = source_data.get(field)
        if source_value is None:
            continue

        target_value = target_data.get(field)

        # Copy if target is empty or we're overwriting
        if target_value is None or overwrite_existing:
            updates[field] = source_value

    if not updates:
        return {"copied_fields": [], "message": "No fields to copy"}

    # Execute update
    set_clauses = [f"{f} = :{f}" for f in updates.keys()]
    set_sql = ", ".join(set_clauses)

    with get_conn() as conn:
        conn.execute(
            text(f"""
                UPDATE submissions
                SET {set_sql}, updated_at = now()
                WHERE id = :target_id
            """),
            {**updates, "target_id": target_id}
        )
        conn.commit()

    return {
        "copied_fields": list(updates.keys()),
        "message": f"Copied {len(updates)} fields"
    }


def create_submission_from_prior(
    prior_id: str,
    renewal_type: str,  # 'renewal' or 'remarket'
    effective_date: Optional[date] = None,
    created_by: str = "system",
) -> str:
    """
    Create a new submission inheriting data from a prior submission.

    This is the main entry point for creating renewals and remarkets.

    Args:
        prior_id: UUID of the prior submission
        renewal_type: 'renewal' or 'remarket'
        effective_date: New effective date (defaults to prior expiration + 1 day)
        created_by: User creating the submission

    Returns:
        UUID of the new submission
    """
    with get_conn() as conn:
        # Get prior submission data
        result = conn.execute(text("""
            SELECT
                applicant_name, account_id, website,
                naics_primary_code, naics_primary_title,
                naics_secondary_code, naics_secondary_title,
                annual_revenue, employee_count,
                broker_org_id, broker_employment_id,
                expiration_date, effective_date
            FROM submissions
            WHERE id = :prior_id
        """), {"prior_id": prior_id})

        row = result.fetchone()
        if not row:
            raise ValueError(f"Prior submission {prior_id} not found")

        (applicant_name, account_id, website,
         naics_primary_code, naics_primary_title,
         naics_secondary_code, naics_secondary_title,
         annual_revenue, employee_count,
         broker_org_id, broker_employment_id,
         prior_expiration, prior_effective) = row

        # Calculate new dates
        # New effective = prior expiration (same day, no gap)
        if not effective_date:
            if prior_expiration:
                effective_date = prior_expiration
            elif prior_effective:
                effective_date = prior_effective + timedelta(days=365)
            else:
                effective_date = date.today()

        new_expiration = effective_date + timedelta(days=365)

        # Set status based on renewal type
        if renewal_type == "renewal":
            status = "renewal_expected"
        else:  # remarket
            status = "received"

        # Create the new submission
        result = conn.execute(text("""
            INSERT INTO submissions (
                applicant_name, account_id, website,
                naics_primary_code, naics_primary_title,
                naics_secondary_code, naics_secondary_title,
                annual_revenue, employee_count,
                broker_org_id, broker_employment_id,
                effective_date, expiration_date,
                prior_submission_id, renewal_type,
                submission_status, submission_outcome,
                date_received
            ) VALUES (
                :applicant_name, :account_id, :website,
                :naics_primary_code, :naics_primary_title,
                :naics_secondary_code, :naics_secondary_title,
                :annual_revenue, :employee_count,
                :broker_org_id, :broker_employment_id,
                :effective_date, :expiration_date,
                :prior_id, :renewal_type,
                :status, 'pending',
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
            "employee_count": employee_count,
            "broker_org_id": broker_org_id,
            "broker_employment_id": broker_employment_id,
            "effective_date": effective_date,
            "expiration_date": new_expiration,
            "prior_id": prior_id,
            "renewal_type": renewal_type,
            "status": status,
            "date_received": datetime.utcnow(),
        })

        new_id = str(result.fetchone()[0])
        conn.commit()

        return new_id


def link_to_prior_with_inheritance(
    submission_id: str,
    prior_id: str,
    renewal_type: str,
    inherit_empty_fields: bool = True,
) -> dict:
    """
    Link a submission to a prior and optionally inherit data.

    Used when manually linking an existing submission to a prior.

    Args:
        submission_id: Current submission to link
        prior_id: Prior submission to link to
        renewal_type: 'renewal' or 'remarket'
        inherit_empty_fields: If True, copy fields where current is empty

    Returns:
        Dict with link status and any conflicts detected
    """
    # Detect conflicts first
    source_data = get_inheritable_data(prior_id)
    conflicts = detect_conflicts(submission_id, source_data)

    # Set the prior link
    with get_conn() as conn:
        conn.execute(
            text("""
                UPDATE submissions
                SET prior_submission_id = :prior_id,
                    renewal_type = :renewal_type,
                    updated_at = now()
                WHERE id = :submission_id
            """),
            {
                "submission_id": submission_id,
                "prior_id": prior_id,
                "renewal_type": renewal_type,
            }
        )
        conn.commit()

    # Inherit empty fields if requested
    inherited = []
    if inherit_empty_fields:
        result = inherit_fields(
            target_id=submission_id,
            source_id=prior_id,
            overwrite_existing=False,
            renewal_type=renewal_type,
        )
        inherited = result.get("copied_fields", [])

    return {
        "linked": True,
        "renewal_type": renewal_type,
        "conflicts": conflicts,
        "inherited_fields": inherited,
    }
