"""
Expiring Tower Management

Handles capturing and comparing expiring/incumbent coverage for renewals.
Enables side-by-side comparison of expiring vs proposed coverage.
"""

from typing import Optional
from sqlalchemy import text
from core.db import get_conn


def capture_expiring_tower(
    submission_id: str,
    prior_submission_id: str,
    created_by: str = "system"
) -> Optional[dict]:
    """
    Capture expiring tower from a prior submission's bound tower.

    Called when:
    - A renewal expectation is created
    - A submission is linked to a prior submission

    Returns the created/updated expiring tower record or None if no bound tower exists.
    """
    with get_conn() as conn:
        result = conn.execute(
            text("SELECT capture_expiring_tower_from_prior(:sub_id, :prior_id, :created_by)"),
            {"sub_id": submission_id, "prior_id": prior_submission_id, "created_by": created_by}
        )
        new_id = result.scalar()
        conn.commit()

        if new_id:
            return get_expiring_tower(submission_id)
        return None


def get_expiring_tower(submission_id: str) -> Optional[dict]:
    """
    Get the expiring tower for a submission.

    Returns None if no expiring tower exists.
    """
    with get_conn() as conn:
        result = conn.execute(
            text("""
                SELECT
                    id,
                    submission_id,
                    prior_submission_id,
                    incumbent_carrier,
                    policy_number,
                    expiration_date,
                    tower_json,
                    total_limit,
                    primary_retention,
                    premium,
                    policy_form,
                    sublimits,
                    source,
                    created_at,
                    updated_at,
                    created_by
                FROM expiring_towers
                WHERE submission_id = :sub_id
            """),
            {"sub_id": submission_id}
        )
        row = result.fetchone()

        if not row:
            return None

        return dict(row._mapping)


def save_expiring_tower(
    submission_id: str,
    data: dict,
    created_by: str = "system"
) -> dict:
    """
    Save or update an expiring tower (manual entry or document extract).

    Args:
        submission_id: The submission to save expiring tower for
        data: Dict with tower data:
            - incumbent_carrier
            - policy_number (optional)
            - expiration_date (optional)
            - tower_json (optional - layer structure)
            - total_limit
            - primary_retention
            - premium
            - policy_form (optional)
            - sublimits (optional)
            - source (optional, defaults to 'manual')
    """
    with get_conn() as conn:
        result = conn.execute(
            text("""
                INSERT INTO expiring_towers (
                    submission_id,
                    prior_submission_id,
                    incumbent_carrier,
                    policy_number,
                    expiration_date,
                    tower_json,
                    total_limit,
                    primary_retention,
                    premium,
                    policy_form,
                    sublimits,
                    source,
                    created_by
                ) VALUES (
                    :submission_id,
                    :prior_submission_id,
                    :incumbent_carrier,
                    :policy_number,
                    :expiration_date,
                    :tower_json,
                    :total_limit,
                    :primary_retention,
                    :premium,
                    :policy_form,
                    :sublimits,
                    :source,
                    :created_by
                )
                ON CONFLICT (submission_id) DO UPDATE SET
                    prior_submission_id = EXCLUDED.prior_submission_id,
                    incumbent_carrier = EXCLUDED.incumbent_carrier,
                    policy_number = EXCLUDED.policy_number,
                    expiration_date = EXCLUDED.expiration_date,
                    tower_json = EXCLUDED.tower_json,
                    total_limit = EXCLUDED.total_limit,
                    primary_retention = EXCLUDED.primary_retention,
                    premium = EXCLUDED.premium,
                    policy_form = EXCLUDED.policy_form,
                    sublimits = EXCLUDED.sublimits,
                    source = EXCLUDED.source,
                    updated_at = now()
                RETURNING id
            """),
            {
                "submission_id": submission_id,
                "prior_submission_id": data.get("prior_submission_id"),
                "incumbent_carrier": data.get("incumbent_carrier"),
                "policy_number": data.get("policy_number"),
                "expiration_date": data.get("expiration_date"),
                "tower_json": data.get("tower_json"),
                "total_limit": data.get("total_limit"),
                "primary_retention": data.get("primary_retention"),
                "premium": data.get("premium"),
                "policy_form": data.get("policy_form"),
                "sublimits": data.get("sublimits"),
                "source": data.get("source", "manual"),
                "created_by": created_by
            }
        )
        conn.commit()

        return get_expiring_tower(submission_id)


def update_expiring_tower(submission_id: str, updates: dict) -> Optional[dict]:
    """
    Partially update an expiring tower.

    Args:
        submission_id: The submission whose expiring tower to update
        updates: Dict with fields to update (only non-None values are applied)
    """
    # Build dynamic update
    allowed_fields = [
        "incumbent_carrier", "policy_number", "expiration_date",
        "tower_json", "total_limit", "primary_retention", "premium",
        "policy_form", "sublimits", "source"
    ]

    set_clauses = []
    params = {"sub_id": submission_id}

    for field in allowed_fields:
        if field in updates and updates[field] is not None:
            set_clauses.append(f"{field} = :{field}")
            params[field] = updates[field]

    if not set_clauses:
        return get_expiring_tower(submission_id)

    set_clauses.append("updated_at = now()")

    with get_conn() as conn:
        conn.execute(
            text(f"""
                UPDATE expiring_towers
                SET {', '.join(set_clauses)}
                WHERE submission_id = :sub_id
            """),
            params
        )
        conn.commit()

        return get_expiring_tower(submission_id)


def delete_expiring_tower(submission_id: str) -> bool:
    """
    Delete an expiring tower record.

    Returns True if deleted, False if not found.
    """
    with get_conn() as conn:
        result = conn.execute(
            text("DELETE FROM expiring_towers WHERE submission_id = :sub_id RETURNING id"),
            {"sub_id": submission_id}
        )
        conn.commit()
        return result.rowcount > 0


def get_tower_comparison(submission_id: str) -> dict:
    """
    Get side-by-side comparison of expiring vs proposed coverage.

    Returns dict with:
        - has_expiring: bool
        - has_proposed: bool
        - expiring: dict with carrier, limit, retention, premium, etc.
        - proposed: dict with quote_name, limit, retention, premium, etc.
        - changes: dict with limit_change, premium_change, etc.
    """
    with get_conn() as conn:
        result = conn.execute(
            text("SELECT get_tower_comparison(:sub_id)"),
            {"sub_id": submission_id}
        )
        comparison = result.scalar()

        if comparison:
            return comparison
        return {
            "has_expiring": False,
            "has_proposed": False,
            "expiring": None,
            "proposed": None,
            "changes": None
        }


def get_incumbent_analytics() -> list[dict]:
    """
    Get win/loss analytics by incumbent carrier.

    Returns list of dicts with:
        - incumbent_carrier
        - submission_count
        - won_count
        - lost_count
        - win_rate_pct
        - avg_premium_when_won
        - avg_limit
    """
    with get_conn() as conn:
        result = conn.execute(text("SELECT * FROM v_incumbent_analytics"))
        return [dict(row._mapping) for row in result.fetchall()]


def has_expiring_tower(submission_id: str) -> bool:
    """Check if a submission has an expiring tower."""
    with get_conn() as conn:
        result = conn.execute(
            text("SELECT 1 FROM expiring_towers WHERE submission_id = :sub_id LIMIT 1"),
            {"sub_id": submission_id}
        )
        return result.fetchone() is not None
