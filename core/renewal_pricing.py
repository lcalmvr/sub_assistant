"""
Renewal Pricing Module

Calculates loss ratios and provides renewal pricing recommendations based on:
- Prior year loss experience
- Multi-year loss history
- Exposure changes (revenue, employees)
- Market trends
"""

from typing import Optional
from decimal import Decimal
from sqlalchemy import text
import os
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn


def calculate_loss_ratio(submission_id: str) -> dict:
    """
    Calculate loss ratio for a submission based on its renewal chain.

    For renewal submissions, calculates loss ratio on the prior (expiring) policy.
    For bound policies, calculates loss ratio on the current policy.

    Returns:
        {
            "has_data": bool,
            "policy_id": str,  # The policy we calculated loss ratio for
            "policy_period": {"start": date, "end": date},
            "earned_premium": float,
            "loss_summary": {
                "claim_count": int,
                "total_paid": float,
                "total_incurred": float,  # paid + reserves
                "total_reserves": float,
            },
            "loss_ratio": {
                "paid": float,  # paid / earned_premium
                "incurred": float,  # incurred / earned_premium
            },
            "multi_year": {  # If multiple years in chain
                "years": int,
                "total_earned": float,
                "total_paid": float,
                "total_incurred": float,
                "loss_ratio_paid": float,
                "loss_ratio_incurred": float,
            },
            "experience_factor": float,  # Multiplier based on loss experience (-0.15 to +0.30)
        }
    """
    with get_conn() as conn:
        # First, determine if this is a renewal and get the prior submission
        result = conn.execute(text("""
            SELECT
                s.id,
                s.prior_submission_id,
                s.renewal_type,
                s.effective_date,
                s.expiration_date,
                s.submission_outcome
            FROM submissions s
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row:
            return {"has_data": False, "error": "Submission not found"}

        # Determine which policy to calculate loss ratio for
        # If this is a renewal, use the prior submission
        # If this is a bound policy, use this submission
        if row.prior_submission_id:
            policy_id = str(row.prior_submission_id)
        elif row.submission_outcome == 'bound':
            policy_id = str(row.id)
        else:
            return {"has_data": False, "error": "No bound policy to calculate loss ratio for"}

        # Get policy details and premium
        result = conn.execute(text("""
            SELECT
                s.id,
                s.applicant_name,
                s.effective_date,
                s.expiration_date,
                t.sold_premium,
                s.prior_submission_id
            FROM submissions s
            LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.id = :policy_id
        """), {"policy_id": policy_id})

        policy = result.fetchone()
        if not policy or not policy.sold_premium:
            return {"has_data": False, "error": "No bound premium found"}

        earned_premium = float(policy.sold_premium)

        # Get loss history for this policy period
        result = conn.execute(text("""
            SELECT
                COUNT(*) as claim_count,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COALESCE(SUM(reserve_amount), 0) as total_reserves,
                COALESCE(SUM(COALESCE(paid_amount, 0) + COALESCE(reserve_amount, 0)), 0) as total_incurred
            FROM loss_history
            WHERE submission_id = :policy_id
        """), {"policy_id": policy_id})

        loss_row = result.fetchone()

        total_paid = float(loss_row.total_paid) if loss_row else 0
        total_reserves = float(loss_row.total_reserves) if loss_row else 0
        total_incurred = float(loss_row.total_incurred) if loss_row else 0
        claim_count = loss_row.claim_count if loss_row else 0

        # Calculate loss ratios
        loss_ratio_paid = round(total_paid / earned_premium, 4) if earned_premium > 0 else 0
        loss_ratio_incurred = round(total_incurred / earned_premium, 4) if earned_premium > 0 else 0

        # Build renewal chain for multi-year analysis
        chain = []
        current_id = policy_id
        while current_id:
            result = conn.execute(text("""
                SELECT
                    s.id,
                    s.effective_date,
                    s.expiration_date,
                    s.prior_submission_id,
                    t.sold_premium,
                    COALESCE(SUM(lh.paid_amount), 0) as losses_paid,
                    COALESCE(SUM(COALESCE(lh.paid_amount, 0) + COALESCE(lh.reserve_amount, 0)), 0) as losses_incurred
                FROM submissions s
                LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
                LEFT JOIN loss_history lh ON lh.submission_id = s.id
                WHERE s.id = :current_id
                GROUP BY s.id, s.effective_date, s.expiration_date, s.prior_submission_id, t.sold_premium
            """), {"current_id": current_id})

            chain_row = result.fetchone()
            if not chain_row:
                break

            if chain_row.sold_premium:  # Only include if bound
                chain.append({
                    "id": str(chain_row.id),
                    "effective_date": chain_row.effective_date,
                    "premium": float(chain_row.sold_premium),
                    "losses_paid": float(chain_row.losses_paid),
                    "losses_incurred": float(chain_row.losses_incurred),
                })

            current_id = str(chain_row.prior_submission_id) if chain_row.prior_submission_id else None

        # Calculate multi-year loss ratio if we have multiple years
        multi_year = None
        if len(chain) > 1:
            total_earned = sum(y["premium"] for y in chain)
            total_paid_multi = sum(y["losses_paid"] for y in chain)
            total_incurred_multi = sum(y["losses_incurred"] for y in chain)

            multi_year = {
                "years": len(chain),
                "total_earned": total_earned,
                "total_paid": total_paid_multi,
                "total_incurred": total_incurred_multi,
                "loss_ratio_paid": round(total_paid_multi / total_earned, 4) if total_earned > 0 else 0,
                "loss_ratio_incurred": round(total_incurred_multi / total_earned, 4) if total_earned > 0 else 0,
            }

        # Calculate experience factor
        # Based on loss ratio, determine credit/debit
        # Good experience (LR < 30%): credit up to -15%
        # Average experience (30-60%): no adjustment
        # Poor experience (> 60%): debit up to +30%
        reference_lr = multi_year["loss_ratio_incurred"] if multi_year else loss_ratio_incurred

        if reference_lr <= 0:
            experience_factor = -0.10  # No claims credit
        elif reference_lr < 0.20:
            experience_factor = -0.15  # Excellent
        elif reference_lr < 0.30:
            experience_factor = -0.10  # Very good
        elif reference_lr < 0.40:
            experience_factor = -0.05  # Good
        elif reference_lr < 0.50:
            experience_factor = 0  # Average
        elif reference_lr < 0.60:
            experience_factor = 0.05  # Below average
        elif reference_lr < 0.70:
            experience_factor = 0.10  # Poor
        elif reference_lr < 0.80:
            experience_factor = 0.15  # Very poor
        else:
            experience_factor = min(0.30, (reference_lr - 0.50) * 0.5)  # Cap at +30%

        return {
            "has_data": True,
            "policy_id": policy_id,
            "policy_period": {
                "start": policy.effective_date.isoformat() if policy.effective_date else None,
                "end": policy.expiration_date.isoformat() if policy.expiration_date else None,
            },
            "earned_premium": earned_premium,
            "loss_summary": {
                "claim_count": claim_count,
                "total_paid": total_paid,
                "total_incurred": total_incurred,
                "total_reserves": total_reserves,
            },
            "loss_ratio": {
                "paid": loss_ratio_paid,
                "incurred": loss_ratio_incurred,
            },
            "multi_year": multi_year,
            "experience_factor": round(experience_factor, 3),
        }


def recommend_renewal_rate(
    submission_id: str,
    proposed_premium: Optional[float] = None,
    trend_factor: float = 0.05,  # Default 5% market trend
) -> dict:
    """
    Generate renewal pricing recommendation.

    Args:
        submission_id: The renewal submission ID
        proposed_premium: Optional proposed premium to compare
        trend_factor: Market trend adjustment (default 5%)

    Returns:
        {
            "has_recommendation": bool,
            "expiring_premium": float,
            "technical_premium": float,  # Expiring * (1 + trend)
            "experience_adjustment": float,  # Based on loss ratio
            "exposure_adjustment": float,  # Based on revenue/employee changes
            "recommended_premium": float,
            "rate_change": {
                "from_expiring": float,  # % change from expiring
                "from_proposed": float,  # % vs proposed (if provided)
            },
            "factors": [
                {"name": str, "factor": float, "description": str}
            ],
            "justification": [str],
        }
    """
    # Get loss ratio data
    loss_data = calculate_loss_ratio(submission_id)

    if not loss_data.get("has_data"):
        return {
            "has_recommendation": False,
            "error": loss_data.get("error", "Unable to calculate loss ratio"),
        }

    expiring_premium = loss_data["earned_premium"]
    experience_factor = loss_data["experience_factor"]

    with get_conn() as conn:
        # Get current and prior submission details for exposure comparison
        result = conn.execute(text("""
            SELECT
                s.id,
                s.annual_revenue,
                s.employee_count,
                s.prior_submission_id,
                prior.annual_revenue as prior_revenue,
                prior.employee_count as prior_employees
            FROM submissions s
            LEFT JOIN submissions prior ON prior.id = s.prior_submission_id
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()

        # Calculate exposure adjustment
        exposure_factor = 0
        exposure_details = []

        if row and row.annual_revenue and row.prior_revenue:
            revenue_change = (float(row.annual_revenue) - float(row.prior_revenue)) / float(row.prior_revenue)
            if abs(revenue_change) > 0.10:  # Only adjust if > 10% change
                # Revenue-based exposure adjustment (half the change rate)
                exposure_factor += revenue_change * 0.5
                exposure_details.append(f"Revenue {'increased' if revenue_change > 0 else 'decreased'} {abs(revenue_change)*100:.0f}%")

        if row and row.employee_count and row.prior_employees:
            employee_change = (row.employee_count - row.prior_employees) / row.prior_employees
            if abs(employee_change) > 0.15:  # Only adjust if > 15% change
                # Employee-based exposure adjustment (quarter the change rate)
                exposure_factor += employee_change * 0.25
                exposure_details.append(f"Employees {'increased' if employee_change > 0 else 'decreased'} {abs(employee_change)*100:.0f}%")

        # Cap exposure factor
        exposure_factor = max(-0.15, min(0.25, exposure_factor))

    # Build factors list
    factors = [
        {
            "name": "Market Trend",
            "factor": trend_factor,
            "description": f"Industry rate trend +{trend_factor*100:.0f}%",
        },
        {
            "name": "Experience",
            "factor": experience_factor,
            "description": f"Loss ratio {loss_data['loss_ratio']['incurred']*100:.0f}% → {'+' if experience_factor >= 0 else ''}{experience_factor*100:.0f}%",
        },
    ]

    if abs(exposure_factor) > 0.01:
        factors.append({
            "name": "Exposure",
            "factor": round(exposure_factor, 3),
            "description": "; ".join(exposure_details) if exposure_details else "Exposure change adjustment",
        })

    # Calculate premiums
    technical_premium = expiring_premium * (1 + trend_factor)
    experience_adjustment = expiring_premium * experience_factor
    exposure_adjustment = expiring_premium * exposure_factor

    recommended_premium = expiring_premium * (1 + trend_factor + experience_factor + exposure_factor)
    recommended_premium = round(recommended_premium, 0)

    # Calculate rate changes
    rate_change_from_expiring = round((recommended_premium - expiring_premium) / expiring_premium * 100, 1)
    rate_change_from_proposed = None
    if proposed_premium:
        rate_change_from_proposed = round((recommended_premium - proposed_premium) / proposed_premium * 100, 1)

    # Build justification
    justification = []

    loss_ratio_pct = loss_data['loss_ratio']['incurred'] * 100
    if loss_ratio_pct == 0:
        justification.append(f"No claims during prior term ({experience_factor*100:+.0f}% experience credit)")
    elif loss_ratio_pct < 30:
        justification.append(f"Excellent loss experience at {loss_ratio_pct:.0f}% ({experience_factor*100:+.0f}% credit)")
    elif loss_ratio_pct < 50:
        justification.append(f"Good loss experience at {loss_ratio_pct:.0f}%")
    elif loss_ratio_pct < 70:
        justification.append(f"Elevated losses at {loss_ratio_pct:.0f}% ({experience_factor*100:+.0f}% debit)")
    else:
        justification.append(f"Poor loss experience at {loss_ratio_pct:.0f}% ({experience_factor*100:+.0f}% debit)")

    justification.append(f"Market trend adjustment +{trend_factor*100:.0f}%")

    if exposure_details:
        justification.extend(exposure_details)

    if loss_data.get("multi_year"):
        years = loss_data["multi_year"]["years"]
        multi_lr = loss_data["multi_year"]["loss_ratio_incurred"] * 100
        justification.append(f"{years}-year loss ratio: {multi_lr:.0f}%")

    return {
        "has_recommendation": True,
        "expiring_premium": expiring_premium,
        "technical_premium": round(technical_premium, 0),
        "experience_adjustment": round(experience_adjustment, 0),
        "exposure_adjustment": round(exposure_adjustment, 0),
        "recommended_premium": recommended_premium,
        "rate_change": {
            "from_expiring": rate_change_from_expiring,
            "from_proposed": rate_change_from_proposed,
        },
        "factors": factors,
        "justification": justification,
        "loss_data": loss_data,
    }


def get_renewal_pricing_summary(submission_id: str) -> dict:
    """
    Get a summary of renewal pricing for display.

    Combines loss ratio calculation and rate recommendation into
    a single response suitable for UI display.
    """
    recommendation = recommend_renewal_rate(submission_id)

    if not recommendation.get("has_recommendation"):
        return recommendation

    # Simplify for UI
    return {
        "has_data": True,
        "expiring_premium": recommendation["expiring_premium"],
        "recommended_premium": recommendation["recommended_premium"],
        "rate_change_pct": recommendation["rate_change"]["from_expiring"],
        "loss_ratio_pct": round(recommendation["loss_data"]["loss_ratio"]["incurred"] * 100, 1),
        "claim_count": recommendation["loss_data"]["loss_summary"]["claim_count"],
        "experience_credit": round(recommendation["loss_data"]["experience_factor"] * 100, 0),
        "factors": recommendation["factors"],
        "justification": recommendation["justification"],
        "multi_year": recommendation["loss_data"].get("multi_year"),
    }
