"""
Renewal Automation Module

Handles automated renewal workflow operations:
- Auto-create renewal expectations for policies expiring soon
- Auto-mark overdue expectations as not received
- Auto-match incoming submissions to pending expectations

Designed to be run as scheduled tasks (daily cron) or called on submission ingestion.
"""

from datetime import datetime, date, timedelta
from typing import Optional
from sqlalchemy import text
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.db import get_conn
from core.renewal_management import create_renewal_expectation, mark_renewal_not_received


def check_and_create_renewal_expectations(
    days_ahead: int = 90,
    dry_run: bool = False
) -> dict:
    """
    Find bound policies expiring soon without renewal expectations and create them.

    This should be run daily to ensure we're tracking all expected renewals.

    Args:
        days_ahead: Create expectations for policies expiring within this many days
        dry_run: If True, return what would be created without actually creating

    Returns:
        {
            "checked": int,  # Number of policies checked
            "created": int,  # Number of expectations created
            "already_exists": int,  # Number already having expectations
            "details": [...]  # List of created expectations
        }
    """
    with get_conn() as conn:
        # Find bound policies expiring soon without existing renewal expectations
        result = conn.execute(text("""
            SELECT
                s.id,
                s.applicant_name,
                s.expiration_date,
                s.expiration_date - CURRENT_DATE as days_until_expiry,
                t.sold_premium
            FROM submissions s
            JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.submission_outcome = 'bound'
              AND s.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days_ahead * INTERVAL '1 day'
              AND NOT EXISTS (
                  -- No renewal expectation already exists
                  SELECT 1 FROM submissions r
                  WHERE r.prior_submission_id = s.id
                    AND r.submission_status IN ('renewal_expected', 'received', 'in_review', 'quoted')
              )
            ORDER BY s.expiration_date
        """), {"days_ahead": days_ahead})

        policies_to_renew = result.fetchall()

        # Count policies that already have expectations
        result = conn.execute(text("""
            SELECT COUNT(*)
            FROM submissions s
            JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.submission_outcome = 'bound'
              AND s.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days_ahead * INTERVAL '1 day'
              AND EXISTS (
                  SELECT 1 FROM submissions r
                  WHERE r.prior_submission_id = s.id
                    AND r.submission_status IN ('renewal_expected', 'received', 'in_review', 'quoted')
              )
        """), {"days_ahead": days_ahead})
        already_exists = result.fetchone()[0]

        created = []

        if not dry_run:
            for policy in policies_to_renew:
                try:
                    new_id = create_renewal_expectation(
                        bound_submission_id=str(policy.id),
                        created_by="renewal_automation"
                    )
                    created.append({
                        "prior_submission_id": str(policy.id),
                        "applicant_name": policy.applicant_name,
                        "expiration_date": policy.expiration_date.isoformat() if policy.expiration_date else None,
                        "days_until_expiry": policy.days_until_expiry,
                        "premium": float(policy.sold_premium) if policy.sold_premium else None,
                        "new_submission_id": new_id
                    })
                except Exception as e:
                    print(f"[renewal_automation] Failed to create expectation for {policy.applicant_name}: {e}")
        else:
            # Dry run - just return what would be created
            created = [
                {
                    "prior_submission_id": str(p.id),
                    "applicant_name": p.applicant_name,
                    "expiration_date": p.expiration_date.isoformat() if p.expiration_date else None,
                    "days_until_expiry": p.days_until_expiry,
                    "premium": float(p.sold_premium) if p.sold_premium else None,
                }
                for p in policies_to_renew
            ]

        return {
            "checked": len(policies_to_renew) + already_exists,
            "created": len(created),
            "already_exists": already_exists,
            "dry_run": dry_run,
            "details": created
        }


def check_overdue_renewals(
    grace_days: int = 30,
    dry_run: bool = False
) -> dict:
    """
    Find overdue renewal expectations and mark them as not received.

    A renewal expectation is overdue if:
    - Status is 'renewal_expected'
    - The effective_date has passed by more than grace_days

    Args:
        grace_days: Number of days past effective date before marking as not received
        dry_run: If True, return what would be marked without actually marking

    Returns:
        {
            "checked": int,
            "marked_not_received": int,
            "details": [...]
        }
    """
    with get_conn() as conn:
        # Find overdue expectations
        result = conn.execute(text("""
            SELECT
                s.id,
                s.applicant_name,
                s.effective_date,
                s.effective_date - CURRENT_DATE as days_overdue,
                prior.sold_premium as prior_premium
            FROM submissions s
            LEFT JOIN (
                SELECT sub.id, t.sold_premium
                FROM submissions sub
                JOIN insurance_towers t ON t.submission_id = sub.id AND t.is_bound = TRUE
            ) prior ON prior.id = s.prior_submission_id
            WHERE s.submission_status = 'renewal_expected'
              AND s.effective_date < CURRENT_DATE - :grace_days * INTERVAL '1 day'
            ORDER BY s.effective_date
        """), {"grace_days": grace_days})

        overdue = result.fetchall()

        marked = []

        if not dry_run:
            for exp in overdue:
                try:
                    success = mark_renewal_not_received(
                        submission_id=str(exp.id),
                        changed_by="renewal_automation",
                        reason=f"Auto-marked: {abs(exp.days_overdue)} days past expected effective date"
                    )
                    if success:
                        marked.append({
                            "submission_id": str(exp.id),
                            "applicant_name": exp.applicant_name,
                            "effective_date": exp.effective_date.isoformat() if exp.effective_date else None,
                            "days_overdue": abs(exp.days_overdue) if exp.days_overdue else None,
                            "prior_premium": float(exp.prior_premium) if exp.prior_premium else None
                        })
                except Exception as e:
                    print(f"[renewal_automation] Failed to mark {exp.applicant_name} as not received: {e}")
        else:
            marked = [
                {
                    "submission_id": str(e.id),
                    "applicant_name": e.applicant_name,
                    "effective_date": e.effective_date.isoformat() if e.effective_date else None,
                    "days_overdue": abs(e.days_overdue) if e.days_overdue else None,
                    "prior_premium": float(e.prior_premium) if e.prior_premium else None
                }
                for e in overdue
            ]

        return {
            "checked": len(overdue),
            "marked_not_received": len(marked),
            "dry_run": dry_run,
            "details": marked
        }


def match_incoming_to_expected(
    applicant_name: str,
    broker_email: Optional[str] = None,
    website: Optional[str] = None
) -> Optional[dict]:
    """
    Try to match an incoming submission to a pending renewal expectation.

    Matching criteria (in order of priority):
    1. Exact applicant_name match + same broker_email
    2. Exact applicant_name match
    3. Fuzzy applicant_name match (contains) + same broker

    Args:
        applicant_name: Name of the applicant from incoming submission
        broker_email: Broker email from incoming submission
        website: Website from incoming submission

    Returns:
        Matching expectation details or None if no match
    """
    if not applicant_name:
        return None

    with get_conn() as conn:
        # Try exact name + broker match first
        if broker_email:
            result = conn.execute(text("""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.effective_date,
                    s.prior_submission_id,
                    prior.sold_premium as prior_premium,
                    'exact_name_broker' as match_type
                FROM submissions s
                LEFT JOIN (
                    SELECT sub.id, t.sold_premium
                    FROM submissions sub
                    JOIN insurance_towers t ON t.submission_id = sub.id AND t.is_bound = TRUE
                ) prior ON prior.id = s.prior_submission_id
                WHERE s.submission_status = 'renewal_expected'
                  AND LOWER(s.applicant_name) = LOWER(:applicant_name)
                  AND LOWER(s.broker_email) = LOWER(:broker_email)
                LIMIT 1
            """), {"applicant_name": applicant_name, "broker_email": broker_email})

            match = result.fetchone()
            if match:
                return {
                    "expectation_id": str(match.id),
                    "applicant_name": match.applicant_name,
                    "effective_date": match.effective_date.isoformat() if match.effective_date else None,
                    "prior_submission_id": str(match.prior_submission_id) if match.prior_submission_id else None,
                    "prior_premium": float(match.prior_premium) if match.prior_premium else None,
                    "match_type": match.match_type,
                    "confidence": "high"
                }

        # Try exact name match
        result = conn.execute(text("""
            SELECT
                s.id,
                s.applicant_name,
                s.effective_date,
                s.prior_submission_id,
                prior.sold_premium as prior_premium,
                'exact_name' as match_type
            FROM submissions s
            LEFT JOIN (
                SELECT sub.id, t.sold_premium
                FROM submissions sub
                JOIN insurance_towers t ON t.submission_id = sub.id AND t.is_bound = TRUE
            ) prior ON prior.id = s.prior_submission_id
            WHERE s.submission_status = 'renewal_expected'
              AND LOWER(s.applicant_name) = LOWER(:applicant_name)
            LIMIT 1
        """), {"applicant_name": applicant_name})

        match = result.fetchone()
        if match:
            return {
                "expectation_id": str(match.id),
                "applicant_name": match.applicant_name,
                "effective_date": match.effective_date.isoformat() if match.effective_date else None,
                "prior_submission_id": str(match.prior_submission_id) if match.prior_submission_id else None,
                "prior_premium": float(match.prior_premium) if match.prior_premium else None,
                "match_type": match.match_type,
                "confidence": "high"
            }

        # Try fuzzy name match (name contains)
        result = conn.execute(text("""
            SELECT
                s.id,
                s.applicant_name,
                s.effective_date,
                s.prior_submission_id,
                prior.sold_premium as prior_premium,
                'fuzzy_name' as match_type
            FROM submissions s
            LEFT JOIN (
                SELECT sub.id, t.sold_premium
                FROM submissions sub
                JOIN insurance_towers t ON t.submission_id = sub.id AND t.is_bound = TRUE
            ) prior ON prior.id = s.prior_submission_id
            WHERE s.submission_status = 'renewal_expected'
              AND (
                  LOWER(s.applicant_name) LIKE LOWER(:pattern)
                  OR LOWER(:applicant_name) LIKE '%' || LOWER(s.applicant_name) || '%'
              )
            ORDER BY
                -- Prefer shorter names (less likely to be false positives)
                LENGTH(s.applicant_name),
                s.effective_date
            LIMIT 1
        """), {"applicant_name": applicant_name, "pattern": f"%{applicant_name}%"})

        match = result.fetchone()
        if match:
            return {
                "expectation_id": str(match.id),
                "applicant_name": match.applicant_name,
                "effective_date": match.effective_date.isoformat() if match.effective_date else None,
                "prior_submission_id": str(match.prior_submission_id) if match.prior_submission_id else None,
                "prior_premium": float(match.prior_premium) if match.prior_premium else None,
                "match_type": match.match_type,
                "confidence": "medium"
            }

        # Try website match as fallback
        if website:
            # Normalize website
            normalized = website.lower().replace("https://", "").replace("http://", "").replace("www.", "").rstrip("/")

            result = conn.execute(text("""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.effective_date,
                    s.prior_submission_id,
                    prior.sold_premium as prior_premium,
                    'website' as match_type
                FROM submissions s
                LEFT JOIN (
                    SELECT sub.id, t.sold_premium
                    FROM submissions sub
                    JOIN insurance_towers t ON t.submission_id = sub.id AND t.is_bound = TRUE
                ) prior ON prior.id = s.prior_submission_id
                WHERE s.submission_status = 'renewal_expected'
                  AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(s.website, 'https://', ''), 'http://', ''), 'www.', ''), '/', ''))
                      = :normalized_website
                LIMIT 1
            """), {"normalized_website": normalized})

            match = result.fetchone()
            if match:
                return {
                    "expectation_id": str(match.id),
                    "applicant_name": match.applicant_name,
                    "effective_date": match.effective_date.isoformat() if match.effective_date else None,
                    "prior_submission_id": str(match.prior_submission_id) if match.prior_submission_id else None,
                    "prior_premium": float(match.prior_premium) if match.prior_premium else None,
                    "match_type": match.match_type,
                    "confidence": "medium"
                }

        return None


def link_submission_to_expectation(
    submission_id: str,
    expectation_id: str,
    carry_over_bound_option: bool = True
) -> bool:
    """
    Link an incoming submission to a pending renewal expectation.

    This merges the expectation into the incoming submission by:
    1. Copying prior_submission_id to the incoming submission
    2. Marking the incoming submission as a renewal
    3. Deleting the expectation (no longer needed)
    4. Optionally carrying over the bound option from prior year

    Args:
        submission_id: The incoming submission to link
        expectation_id: The renewal expectation to merge
        carry_over_bound_option: Copy prior year's tower as starting point

    Returns:
        True if successful
    """
    from core.bound_option import copy_bound_option_to_renewal

    with get_conn() as conn:
        # Get expectation details
        result = conn.execute(text("""
            SELECT prior_submission_id FROM submissions WHERE id = :expectation_id
        """), {"expectation_id": expectation_id})

        exp = result.fetchone()
        if not exp or not exp.prior_submission_id:
            return False

        prior_id = str(exp.prior_submission_id)

        # Update the incoming submission to link to prior
        conn.execute(text("""
            UPDATE submissions
            SET prior_submission_id = :prior_id,
                renewal_type = 'renewal',
                updated_at = NOW()
            WHERE id = :submission_id
        """), {"submission_id": submission_id, "prior_id": prior_id})

        # Delete the expectation (it's now merged)
        conn.execute(text("""
            DELETE FROM submissions WHERE id = :expectation_id
        """), {"expectation_id": expectation_id})

        conn.commit()

        # Carry over bound option if requested
        if carry_over_bound_option:
            try:
                copy_bound_option_to_renewal(
                    from_submission_id=prior_id,
                    to_submission_id=submission_id,
                    copy_as_bound=False,
                    created_by="renewal_automation"
                )
            except Exception as e:
                print(f"[renewal_automation] Warning: Failed to carry over bound option: {e}")

        return True


def run_daily_automation(dry_run: bool = False) -> dict:
    """
    Run all daily automation tasks.

    This should be called by a cron job or scheduler once daily.

    Args:
        dry_run: If True, report what would happen without making changes

    Returns:
        Combined results from all automation tasks
    """
    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "dry_run": dry_run,
        "tasks": {}
    }

    # Task 1: Create renewal expectations
    try:
        expectations = check_and_create_renewal_expectations(days_ahead=90, dry_run=dry_run)
        results["tasks"]["create_expectations"] = expectations
    except Exception as e:
        results["tasks"]["create_expectations"] = {"error": str(e)}

    # Task 2: Mark overdue as not received
    try:
        overdue = check_overdue_renewals(grace_days=30, dry_run=dry_run)
        results["tasks"]["mark_overdue"] = overdue
    except Exception as e:
        results["tasks"]["mark_overdue"] = {"error": str(e)}

    return results


# CLI interface for manual runs
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Renewal Automation Tasks")
    parser.add_argument("--task", choices=["all", "expectations", "overdue"], default="all",
                        help="Which task to run")
    parser.add_argument("--dry-run", action="store_true", help="Report without making changes")
    parser.add_argument("--days-ahead", type=int, default=90, help="Days ahead for expectations")
    parser.add_argument("--grace-days", type=int, default=30, help="Grace days for overdue")

    args = parser.parse_args()

    if args.task == "all":
        result = run_daily_automation(dry_run=args.dry_run)
    elif args.task == "expectations":
        result = check_and_create_renewal_expectations(days_ahead=args.days_ahead, dry_run=args.dry_run)
    elif args.task == "overdue":
        result = check_overdue_renewals(grace_days=args.grace_days, dry_run=args.dry_run)

    import json
    print(json.dumps(result, indent=2, default=str))
