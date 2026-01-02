"""
Prior Submission Lookup

Finds and retrieves prior submission data for an account.
Used to show historical context without copying/inheriting data.
"""

from typing import Optional
from sqlalchemy import text
from core.db import get_conn


def get_prior_submission(submission_id: str) -> Optional[dict]:
    """
    Find the most recent prior submission for the same account.

    Logic:
    1. Get the account_id for current submission
    2. Find the most recent submission for that account BEFORE current one
    3. Return full submission data for comparison

    Returns None if:
    - No account linked
    - No prior submissions exist
    """
    with get_conn() as conn:
        # First get current submission's account and date
        result = conn.execute(text("""
            SELECT account_id, date_received, effective_date, created_at
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})

        current = result.fetchone()
        if not current or not current[0]:  # No account linked
            return None

        account_id = current[0]
        # Use effective_date if available, otherwise date_received, otherwise created_at
        current_date = current[2] or current[1] or current[3]

        # Find the most recent prior submission for this account
        result = conn.execute(text("""
            SELECT
                s.id,
                s.applicant_name,
                s.date_received,
                s.effective_date,
                s.expiration_date,
                s.submission_status,
                s.submission_outcome,
                s.outcome_reason,
                s.annual_revenue,
                s.naics_primary_code,
                s.naics_primary_title,
                s.website,
                s.broker_org_id,
                s.broker_employment_id,
                -- Get bound option data if exists
                t.id as tower_id,
                t.sold_premium,
                t.primary_retention,
                t.policy_form,
                t.tower_json
            FROM submissions s
            LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.account_id = :account_id
              AND s.id != :submission_id
              AND COALESCE(s.effective_date, s.date_received, s.created_at) < :current_date
            ORDER BY COALESCE(s.effective_date, s.date_received, s.created_at) DESC
            LIMIT 1
        """), {
            "account_id": account_id,
            "submission_id": submission_id,
            "current_date": current_date,
        })

        row = result.fetchone()
        if not row:
            return None

        # Parse tower_json for limit info (index 18 after removing employee_count)
        tower_json = row[18] or []
        total_limit = 0
        if tower_json and len(tower_json) > 0:
            total_limit = sum(layer.get("limit", 0) for layer in tower_json)

        return {
            "id": str(row[0]),
            "applicant_name": row[1],
            "date_received": row[2],
            "effective_date": row[3],
            "expiration_date": row[4],
            "submission_status": row[5],
            "submission_outcome": row[6],
            "outcome_reason": row[7],
            "annual_revenue": row[8],
            "naics_primary_code": row[9],
            "naics_primary_title": row[10],
            "website": row[11],
            "broker_org_id": row[12],
            "broker_employment_id": row[13],
            # Bound option data
            "tower_id": str(row[14]) if row[14] else None,
            "sold_premium": row[15],
            "primary_retention": row[16],
            "policy_form": row[17],
            "tower_json": tower_json,
            "total_limit": total_limit,
            # Computed
            "was_bound": row[14] is not None,
        }


def get_prior_submission_summary(submission_id: str) -> Optional[dict]:
    """
    Get a compact summary of prior submission for display.

    Returns simplified dict with formatted values for UI.
    """
    prior = get_prior_submission(submission_id)
    if not prior:
        return None

    # Format outcome
    status = (prior["submission_status"] or "").replace("_", " ").title()
    outcome = (prior["submission_outcome"] or "").replace("_", " ").title()

    # Format dates
    eff_date = prior["effective_date"]
    eff_str = eff_date.strftime("%m/%d/%Y") if eff_date else "—"

    # Format financials
    premium = prior["sold_premium"]
    premium_str = f"${premium:,.0f}" if premium else "—"

    limit = prior["total_limit"]
    limit_str = f"${limit/1_000_000:.0f}M" if limit >= 1_000_000 else f"${limit:,.0f}" if limit else "—"

    retention = prior["primary_retention"]
    retention_str = f"${retention/1_000:,.0f}K" if retention and retention >= 1000 else f"${retention:,.0f}" if retention else "—"

    revenue = prior["annual_revenue"]
    revenue_str = f"${revenue/1_000_000:.1f}M" if revenue and revenue >= 1_000_000 else f"${revenue:,.0f}" if revenue else "—"

    return {
        "id": prior["id"],
        "effective_date": eff_str,
        "status": status,
        "outcome": outcome,
        "outcome_reason": prior["outcome_reason"],
        "was_bound": prior["was_bound"],
        # Formatted values
        "premium": premium_str,
        "premium_raw": premium,
        "limit": limit_str,
        "limit_raw": limit,
        "retention": retention_str,
        "retention_raw": retention,
        "revenue": revenue_str,
        "revenue_raw": revenue,
        "policy_form": prior["policy_form"],
        "industry": prior["naics_primary_title"],
    }


def calculate_yoy_changes(submission_id: str) -> Optional[dict]:
    """
    Calculate year-over-year changes between current and prior submission.

    Returns dict with change metrics and percentages.
    """
    prior = get_prior_submission(submission_id)
    if not prior:
        return None

    with get_conn() as conn:
        # Get current submission data
        result = conn.execute(text("""
            SELECT
                s.annual_revenue,
                t.sold_premium,
                t.primary_retention,
                t.tower_json
            FROM submissions s
            LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})

        current = result.fetchone()
        if not current:
            return None

    current_revenue = current[0]
    current_premium = current[1]
    current_retention = current[2]
    current_tower = current[3] or []
    current_limit = sum(layer.get("limit", 0) for layer in current_tower) if current_tower else None

    prior_revenue = prior["annual_revenue"]
    prior_premium = prior["sold_premium"]
    prior_retention = prior["primary_retention"]
    prior_limit = prior["total_limit"]

    def calc_change(current_val, prior_val):
        """Calculate change and percentage."""
        if current_val is None or prior_val is None:
            return None, None
        if prior_val == 0:
            return current_val - prior_val, None
        change = current_val - prior_val
        pct = (change / prior_val) * 100
        return change, pct

    def format_currency(val, short=True):
        if val is None:
            return "—"
        if short and abs(val) >= 1_000_000:
            return f"${val/1_000_000:.1f}M"
        if short and abs(val) >= 1_000:
            return f"${val/1_000:.0f}K"
        return f"${val:,.0f}"

    def format_change(change, pct, is_currency=True):
        if change is None:
            return "—", None
        sign = "+" if change > 0 else ""
        if is_currency:
            change_str = f"{sign}{format_currency(change, short=True)}"
        else:
            change_str = f"{sign}{change:,.0f}"
        pct_str = f"{sign}{pct:.0f}%" if pct is not None else None
        return change_str, pct_str

    changes = {}

    # Revenue
    rev_change, rev_pct = calc_change(current_revenue, prior_revenue)
    changes["revenue"] = {
        "prior": format_currency(prior_revenue),
        "current": format_currency(current_revenue),
        "change": format_change(rev_change, rev_pct)[0],
        "pct": format_change(rev_change, rev_pct)[1],
        "direction": "up" if rev_change and rev_change > 0 else "down" if rev_change and rev_change < 0 else "same",
    }

    # Premium (only if both had bound options)
    if prior["was_bound"]:
        prem_change, prem_pct = calc_change(current_premium, prior_premium)
        changes["premium"] = {
            "prior": format_currency(prior_premium),
            "current": format_currency(current_premium) if current_premium else "—",
            "change": format_change(prem_change, prem_pct)[0] if current_premium else "—",
            "pct": format_change(prem_change, prem_pct)[1] if current_premium else None,
            "direction": "up" if prem_change and prem_change > 0 else "down" if prem_change and prem_change < 0 else "same",
        }

        # Limit
        limit_change, limit_pct = calc_change(current_limit, prior_limit)
        changes["limit"] = {
            "prior": format_currency(prior_limit),
            "current": format_currency(current_limit) if current_limit else "—",
            "change": format_change(limit_change, limit_pct)[0] if current_limit else "—",
            "pct": format_change(limit_change, limit_pct)[1] if current_limit else None,
            "direction": "up" if limit_change and limit_change > 0 else "down" if limit_change and limit_change < 0 else "same",
        }

        # Retention
        ret_change, ret_pct = calc_change(current_retention, prior_retention)
        changes["retention"] = {
            "prior": format_currency(prior_retention),
            "current": format_currency(current_retention) if current_retention else "—",
            "change": format_change(ret_change, ret_pct)[0] if current_retention else "—",
            "pct": format_change(ret_change, ret_pct)[1] if current_retention else None,
            "direction": "up" if ret_change and ret_change > 0 else "down" if ret_change and ret_change < 0 else "same",
        }

    return {
        "prior_id": prior["id"],
        "prior_effective": prior["effective_date"],
        "prior_outcome": prior["submission_outcome"],
        "prior_was_bound": prior["was_bound"],
        "changes": changes,
    }
