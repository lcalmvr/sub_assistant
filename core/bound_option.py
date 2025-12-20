"""
Bound Option Module

Handles tracking which quote option (insurance_tower) was bound for a submission.
Ensures only one option can be bound per submission.
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


def bind_option(tower_id: str, bound_by: str = "system") -> bool:
    """
    Mark a quote option as bound.

    Automatically unbinds any other bound option for the same submission.
    Uses database constraint to ensure only one bound option per submission.

    Args:
        tower_id: UUID of the insurance_tower to bind
        bound_by: User who bound the option

    Returns:
        True if successful
    """
    with get_conn() as conn:
        # First, get the submission_id for this tower
        result = conn.execute(text("""
            SELECT submission_id FROM insurance_towers WHERE id = :tower_id
        """), {"tower_id": tower_id})

        row = result.fetchone()
        if not row:
            raise ValueError(f"Tower {tower_id} not found")

        submission_id = row[0]

        # Unbind any currently bound option for this submission
        conn.execute(text("""
            UPDATE insurance_towers
            SET is_bound = FALSE, bound_at = NULL, bound_by = NULL
            WHERE submission_id = :submission_id AND is_bound = TRUE
        """), {"submission_id": submission_id})

        # Bind the new option
        result = conn.execute(text("""
            UPDATE insurance_towers
            SET is_bound = TRUE,
                bound_at = :bound_at,
                bound_by = :bound_by
            WHERE id = :tower_id
        """), {
            "tower_id": tower_id,
            "bound_at": datetime.utcnow(),
            "bound_by": bound_by
        })

        conn.commit()
        return result.rowcount > 0


def unbind_option(tower_id: str) -> bool:
    """
    Remove bound status from a quote option.

    Args:
        tower_id: UUID of the insurance_tower to unbind

    Returns:
        True if successful
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE insurance_towers
            SET is_bound = FALSE, bound_at = NULL, bound_by = NULL
            WHERE id = :tower_id
        """), {"tower_id": tower_id})

        conn.commit()
        return result.rowcount > 0


def get_bound_option(submission_id: str) -> Optional[dict]:
    """
    Get the bound quote option for a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        dict with bound tower data or None if no option is bound
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, quote_name, tower_json, primary_retention, sublimits,
                   coverages, endorsements, policy_form, position,
                   technical_premium, risk_adjusted_premium, sold_premium,
                   bound_at, bound_by, created_at
            FROM insurance_towers
            WHERE submission_id = :submission_id AND is_bound = TRUE
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row:
            return None

        return {
            "id": str(row[0]),
            "quote_name": row[1],
            "tower_json": row[2],
            "primary_retention": row[3],
            "sublimits": row[4],
            "coverages": row[5],
            "endorsements": row[6],
            "policy_form": row[7],
            "position": row[8],
            "technical_premium": row[9],
            "risk_adjusted_premium": row[10],
            "sold_premium": row[11],
            "bound_at": row[12],
            "bound_by": row[13],
            "created_at": row[14]
        }


def get_quote_options(submission_id: str) -> list[dict]:
    """
    Get all quote options for a submission with bound status.

    Args:
        submission_id: UUID of the submission

    Returns:
        List of quote option summaries
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, quote_name, sold_premium, position, is_bound, bound_at
            FROM insurance_towers
            WHERE submission_id = :submission_id
            ORDER BY created_at
        """), {"submission_id": submission_id})

        return [
            {
                "id": str(row[0]),
                "quote_name": row[1],
                "sold_premium": row[2],
                "position": row[3],
                "is_bound": row[4],
                "bound_at": row[5]
            }
            for row in result.fetchall()
        ]


def copy_bound_option_to_renewal(
    from_submission_id: str,
    to_submission_id: str,
    copy_as_bound: bool = False,
    created_by: str = "system"
) -> Optional[str]:
    """
    Copy the bound option from a prior submission to a renewal submission.

    For PRIMARY positions: Copies everything (tower, coverages, sublimits, endorsements, retention)
    For EXCESS positions: Also copies, but caller should check if AI extracted underlying first

    Args:
        from_submission_id: UUID of the prior submission with bound option
        to_submission_id: UUID of the renewal submission
        copy_as_bound: If True, also mark the new option as bound
        created_by: User/system creating the copy

    Returns:
        UUID of the newly created tower, or None if no bound option exists
    """
    # Get the bound option from prior submission
    bound_option = get_bound_option(from_submission_id)
    if not bound_option:
        return None

    with get_conn() as conn:
        # Create new tower on renewal submission
        result = conn.execute(text("""
            INSERT INTO insurance_towers (
                submission_id, quote_name, tower_json, primary_retention,
                sublimits, coverages, endorsements, policy_form, position,
                technical_premium, risk_adjusted_premium, sold_premium,
                is_bound, bound_at, bound_by, created_by
            ) VALUES (
                :submission_id, :quote_name, :tower_json, :primary_retention,
                :sublimits, :coverages, :endorsements, :policy_form, :position,
                :technical_premium, :risk_adjusted_premium, :sold_premium,
                :is_bound, :bound_at, :bound_by, :created_by
            )
            RETURNING id
        """), {
            "submission_id": to_submission_id,
            "quote_name": f"{bound_option['quote_name']} (from prior)",
            "tower_json": bound_option["tower_json"],
            "primary_retention": bound_option["primary_retention"],
            "sublimits": bound_option["sublimits"],
            "coverages": bound_option["coverages"],
            "endorsements": bound_option["endorsements"],
            "policy_form": bound_option["policy_form"],
            "position": bound_option["position"],
            "technical_premium": bound_option["technical_premium"],
            "risk_adjusted_premium": bound_option["risk_adjusted_premium"],
            "sold_premium": bound_option["sold_premium"],
            "is_bound": copy_as_bound,
            "bound_at": datetime.utcnow() if copy_as_bound else None,
            "bound_by": created_by if copy_as_bound else None,
            "created_by": created_by
        })

        new_tower_id = result.fetchone()[0]
        conn.commit()

        # Update data_sources on the renewal submission to track carryover
        conn.execute(text("""
            UPDATE submissions
            SET data_sources = COALESCE(data_sources, '{}'::jsonb) || :sources
            WHERE id = :submission_id
        """), {
            "submission_id": to_submission_id,
            "sources": {
                "tower_json": "carried_over",
                "coverages": "carried_over",
                "sublimits": "carried_over",
                "endorsements": "carried_over",
                "primary_retention": "carried_over"
            }
        })
        conn.commit()

        return str(new_tower_id)


def has_bound_option(submission_id: str) -> bool:
    """
    Check if a submission has a bound option.

    Args:
        submission_id: UUID of the submission

    Returns:
        True if submission has a bound option
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT 1 FROM insurance_towers
            WHERE submission_id = :submission_id AND is_bound = TRUE
            LIMIT 1
        """), {"submission_id": submission_id})

        return result.fetchone() is not None


def copy_bound_option_to_renewal_with_endorsements(
    from_submission_id: str,
    to_submission_id: str,
    copy_as_bound: bool = False,
    created_by: str = "system"
) -> Optional[str]:
    """
    Copy the bound option from a prior submission to a renewal, applying relevant endorsements.

    This enhanced version:
    1. Gets effective policy state (base + issued endorsements)
    2. Checks if policy is cancelled (returns None if cancelled)
    3. Creates renewal tower with endorsement-modified premium
    4. Records which endorsements were applied in data_sources

    Args:
        from_submission_id: UUID of the prior submission with bound option
        to_submission_id: UUID of the renewal submission
        copy_as_bound: If True, also mark the new option as bound
        created_by: User/system creating the copy

    Returns:
        UUID of the newly created tower, or None if no bound option exists or policy is cancelled
    """
    from core.endorsement_management import (
        get_effective_policy_state,
        get_endorsements_for_renewal,
    )

    # Get the bound option from prior submission
    bound_option = get_bound_option(from_submission_id)
    if not bound_option:
        return None

    # Get effective policy state after endorsements
    state = get_effective_policy_state(from_submission_id)

    # Don't carry cancelled policies
    if state.get("is_cancelled", False):
        return None

    # Get endorsements that carry to renewal
    carryover_endorsements = get_endorsements_for_renewal(from_submission_id)
    carryover_descriptions = [e["description"] for e in carryover_endorsements]

    with get_conn() as conn:
        # Create new tower on renewal submission with effective premium
        result = conn.execute(text("""
            INSERT INTO insurance_towers (
                submission_id, quote_name, tower_json, primary_retention,
                sublimits, coverages, endorsements, policy_form, position,
                technical_premium, risk_adjusted_premium, sold_premium,
                is_bound, bound_at, bound_by, created_by
            ) VALUES (
                :submission_id, :quote_name, :tower_json, :primary_retention,
                :sublimits, :coverages, :endorsements, :policy_form, :position,
                :technical_premium, :risk_adjusted_premium, :sold_premium,
                :is_bound, :bound_at, :bound_by, :created_by
            )
            RETURNING id
        """), {
            "submission_id": to_submission_id,
            "quote_name": f"{bound_option['quote_name']} (from prior)",
            "tower_json": bound_option["tower_json"],
            "primary_retention": bound_option["primary_retention"],
            "sublimits": bound_option["sublimits"],
            "coverages": bound_option["coverages"],
            "endorsements": bound_option["endorsements"],
            "policy_form": bound_option["policy_form"],
            "position": bound_option["position"],
            "technical_premium": bound_option["technical_premium"],
            "risk_adjusted_premium": bound_option["risk_adjusted_premium"],
            # Use effective premium (base + adjustments) for renewal starting point
            "sold_premium": state["effective_premium"],
            "is_bound": copy_as_bound,
            "bound_at": datetime.utcnow() if copy_as_bound else None,
            "bound_by": created_by if copy_as_bound else None,
            "created_by": created_by
        })

        new_tower_id = result.fetchone()[0]
        conn.commit()

        # Update data_sources on the renewal submission to track carryover
        sources = {
            "tower_json": "carried_over",
            "coverages": "carried_over",
            "sublimits": "carried_over",
            "endorsements": "carried_over",
            "primary_retention": "carried_over",
            "effective_premium": "carried_over_with_endorsements",
        }

        # Add endorsement carryover info if any
        if carryover_descriptions:
            sources["carryover_endorsements"] = carryover_descriptions

        conn.execute(text("""
            UPDATE submissions
            SET data_sources = COALESCE(data_sources, '{}'::jsonb) || :sources
            WHERE id = :submission_id
        """), {
            "submission_id": to_submission_id,
            "sources": sources
        })
        conn.commit()

        return str(new_tower_id)
