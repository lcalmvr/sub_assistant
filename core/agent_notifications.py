"""
Agent Notifications Module (Phase 6)

Computes proactive notifications for the AI Agent panel.
Aggregates issues from multiple sources:
- Critical controls not confirmed (gap analysis)
- Subjectivity deadlines (overdue/due soon)
- Missing documents (expected document types)
- Data quality issues (conflicts)
- Stale submissions (old application dates)
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import text

from core.db import get_conn


# Notification priority levels
PRIORITY_CRITICAL = "critical"
PRIORITY_WARNING = "warning"
PRIORITY_INFO = "info"

# Stale submission threshold (days)
STALE_SUBMISSION_DAYS = 30

# Expected document types for completeness check
EXPECTED_DOCUMENT_TYPES = [
    "loss_runs",
    "application",
]


def compute_submission_notifications(submission_id: str) -> list[dict]:
    """
    Aggregate notifications from multiple sources.

    Returns list of dicts with:
        - type: Notification type key
        - priority: 'critical', 'warning', or 'info'
        - title: Short title for display
        - body: Longer description
        - key: Unique key for dismissal tracking
        - action_tab: Tab to navigate to
        - count: Optional count of items
    """
    notifications = []

    # 1. Critical controls gaps
    notifications.extend(_check_critical_controls(submission_id))

    # 2. Subjectivity deadlines
    notifications.extend(_check_subjectivity_deadlines(submission_id))

    # 3. Missing documents
    notifications.extend(_check_missing_documents(submission_id))

    # 4. Data quality issues (conflicts)
    notifications.extend(_check_data_quality(submission_id))

    # 5. Stale submission
    notifications.extend(_check_stale_submission(submission_id))

    return notifications


def get_notifications_with_dismissal(submission_id: str) -> list[dict]:
    """
    Get notifications filtered by dismissal state.
    Returns notifications that haven't been dismissed or whose snooze has expired.
    """
    notifications = compute_submission_notifications(submission_id)

    if not notifications:
        return []

    # Get dismissed notifications
    dismissed = _get_dismissed_notifications(submission_id)

    # Filter out dismissed notifications (unless snooze expired)
    now = datetime.utcnow()
    filtered = []
    for notif in notifications:
        key = notif["key"]
        if key in dismissed:
            dismiss_info = dismissed[key]
            snooze_until = dismiss_info.get("snooze_until")

            # If snoozed and not expired, skip
            if snooze_until and snooze_until > now:
                continue
            # If permanently dismissed (no snooze), skip
            elif not snooze_until:
                continue

        filtered.append(notif)

    return filtered


def dismiss_notification(
    submission_id: str,
    notification_key: str,
    snooze_hours: Optional[int] = None,
    dismissed_by: str = "user"
) -> dict:
    """
    Mark notification as dismissed or snoozed.

    Args:
        submission_id: UUID of submission
        notification_key: Unique key of notification to dismiss
        snooze_hours: If provided, notification will reappear after this many hours
        dismissed_by: Who dismissed it

    Returns:
        Dict with dismissal info
    """
    snooze_until = None
    if snooze_hours:
        snooze_until = datetime.utcnow() + timedelta(hours=snooze_hours)

    with get_conn() as conn:
        # Use workflow_notifications table with a special type for agent dismissals
        result = conn.execute(text("""
            INSERT INTO workflow_notifications (
                user_id, submission_id, type, title, body, priority,
                dismissed_at, read_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000000',  -- system user
                :submission_id,
                :type,
                :title,
                :snooze_until,
                'normal',
                NOW(),
                NOW()
            )
            ON CONFLICT DO NOTHING
            RETURNING id
        """), {
            "submission_id": submission_id,
            "type": f"agent_dismiss:{notification_key}",
            "title": notification_key,
            "snooze_until": snooze_until.isoformat() if snooze_until else None,
        })
        row = result.fetchone()

    return {
        "key": notification_key,
        "dismissed": True,
        "snooze_until": snooze_until.isoformat() if snooze_until else None,
    }


def _get_dismissed_notifications(submission_id: str) -> dict[str, dict]:
    """
    Get map of dismissed notification keys to their dismissal info.
    """
    dismissed = {}

    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT title as notification_key, body as snooze_until, dismissed_at
            FROM workflow_notifications
            WHERE submission_id = :submission_id
              AND type LIKE 'agent_dismiss:%'
              AND dismissed_at IS NOT NULL
        """), {"submission_id": submission_id})

        for row in result.fetchall():
            snooze_until = None
            if row[1]:
                try:
                    snooze_until = datetime.fromisoformat(row[1])
                except (ValueError, TypeError):
                    pass

            dismissed[row[0]] = {
                "dismissed_at": row[2],
                "snooze_until": snooze_until,
            }

    return dismissed


# =============================================================================
# NOTIFICATION CHECK FUNCTIONS
# =============================================================================

def _check_critical_controls(submission_id: str) -> list[dict]:
    """
    Check for critical/important fields that are not confirmed.
    Uses the gap analysis query from the extraction schema.
    """
    notifications = []

    with get_conn() as conn:
        # Count critical fields not confirmed
        result = conn.execute(text("""
            SELECT
                fis.importance,
                COUNT(*) as gap_count
            FROM field_importance_settings fis
            JOIN importance_versions iv ON iv.id = fis.version_id AND iv.is_active = true
            LEFT JOIN submission_extracted_values sev
                ON sev.field_key = fis.field_key
                AND sev.submission_id = :submission_id
            WHERE fis.importance IN ('critical', 'important')
              AND COALESCE(sev.status, 'not_asked') IN ('not_asked', 'pending')
            GROUP BY fis.importance
        """), {"submission_id": submission_id})

        critical_count = 0
        important_count = 0

        for row in result.fetchall():
            if row[0] == "critical":
                critical_count = row[1]
            elif row[0] == "important":
                important_count = row[1]

        if critical_count > 0:
            notifications.append({
                "type": "critical_controls",
                "priority": PRIORITY_CRITICAL,
                "title": f"{critical_count} critical control{'s' if critical_count > 1 else ''} unconfirmed",
                "body": "Critical security controls need to be verified before quoting.",
                "key": "critical_controls",
                "action_tab": "analyze",
                "count": critical_count,
            })
        elif important_count > 0:
            notifications.append({
                "type": "important_controls",
                "priority": PRIORITY_WARNING,
                "title": f"{important_count} important control{'s' if important_count > 1 else ''} unconfirmed",
                "body": "Important fields should be reviewed.",
                "key": "important_controls",
                "action_tab": "analyze",
                "count": important_count,
            })

    return notifications


def _check_subjectivity_deadlines(submission_id: str) -> list[dict]:
    """
    Check for overdue or upcoming subjectivity deadlines.
    """
    notifications = []

    with get_conn() as conn:
        # Check for overdue
        result = conn.execute(text("""
            SELECT COUNT(*) as overdue_count
            FROM policy_subjectivities
            WHERE submission_id = :submission_id
              AND status = 'pending'
              AND due_date IS NOT NULL
              AND due_date < CURRENT_DATE
        """), {"submission_id": submission_id})
        row = result.fetchone()
        overdue_count = row[0] if row else 0

        # Check for due soon (next 7 days)
        result = conn.execute(text("""
            SELECT COUNT(*) as due_soon_count
            FROM policy_subjectivities
            WHERE submission_id = :submission_id
              AND status = 'pending'
              AND due_date IS NOT NULL
              AND due_date >= CURRENT_DATE
              AND due_date <= CURRENT_DATE + INTERVAL '7 days'
        """), {"submission_id": submission_id})
        row = result.fetchone()
        due_soon_count = row[0] if row else 0

        if overdue_count > 0:
            notifications.append({
                "type": "subjectivity_overdue",
                "priority": PRIORITY_CRITICAL,
                "title": f"{overdue_count} subjectivit{'ies' if overdue_count > 1 else 'y'} overdue",
                "body": "Pending subjectivities have passed their due date.",
                "key": "subjectivity_overdue",
                "action_tab": "policy",
                "count": overdue_count,
            })
        elif due_soon_count > 0:
            notifications.append({
                "type": "subjectivity_due_soon",
                "priority": PRIORITY_WARNING,
                "title": f"{due_soon_count} subjectivit{'ies' if due_soon_count > 1 else 'y'} due soon",
                "body": "Subjectivities are due within the next 7 days.",
                "key": "subjectivity_due_soon",
                "action_tab": "policy",
                "count": due_soon_count,
            })

    return notifications


def _check_missing_documents(submission_id: str) -> list[dict]:
    """
    Check for expected document types that are missing.
    """
    notifications = []

    with get_conn() as conn:
        # Get document types already uploaded
        result = conn.execute(text("""
            SELECT DISTINCT document_type
            FROM documents
            WHERE submission_id = :submission_id
              AND document_type IS NOT NULL
        """), {"submission_id": submission_id})

        existing_types = {row[0].lower() for row in result.fetchall() if row[0]}

        # Check for loss_runs specifically
        has_loss_runs = any(
            t in existing_types
            for t in ["loss_runs", "loss runs", "loss_run", "lossruns"]
        )

        if not has_loss_runs:
            notifications.append({
                "type": "missing_loss_runs",
                "priority": PRIORITY_WARNING,
                "title": "No loss runs uploaded",
                "body": "Loss run documents are typically required for quoting.",
                "key": "missing_loss_runs",
                "action_tab": "setup",
                "count": 1,
            })

    return notifications


def _check_data_quality(submission_id: str) -> list[dict]:
    """
    Check for data quality issues (conflicts between sources).
    """
    notifications = []

    try:
        with get_conn() as conn:
            # Check for unresolved conflicts (table may not exist in all environments)
            result = conn.execute(text("""
                SELECT COUNT(*) as conflict_count
                FROM submission_conflicts
                WHERE submission_id = :submission_id
                  AND resolution_status = 'pending'
            """), {"submission_id": submission_id})
            row = result.fetchone()
            conflict_count = row[0] if row else 0

            if conflict_count > 0:
                notifications.append({
                    "type": "data_conflicts",
                    "priority": PRIORITY_WARNING,
                    "title": f"{conflict_count} data conflict{'s' if conflict_count > 1 else ''} detected",
                    "body": "Different documents contain conflicting values for the same field.",
                    "key": "data_conflicts",
                    "action_tab": "review",
                    "count": conflict_count,
                })
    except Exception:
        # Table may not exist yet - skip this check
        pass

    return notifications


def _check_stale_submission(submission_id: str) -> list[dict]:
    """
    Check if the submission/application is getting stale.
    """
    notifications = []

    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                date_received,
                effective_date,
                created_at
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})
        row = result.fetchone()

        if not row:
            return notifications

        date_received = row[0]
        effective_date = row[1]
        created_at = row[2]

        # Use date_received if available, otherwise created_at
        reference_date = date_received or (created_at.date() if created_at else None)

        if reference_date:
            days_old = (datetime.now().date() - reference_date).days

            if days_old >= STALE_SUBMISSION_DAYS:
                # Check if effective date is in the past (more critical)
                if effective_date and effective_date < datetime.now().date():
                    notifications.append({
                        "type": "stale_submission",
                        "priority": PRIORITY_CRITICAL,
                        "title": "Policy effective date has passed",
                        "body": f"Effective date was {effective_date}. Consider updating dates.",
                        "key": "stale_effective_date",
                        "action_tab": "setup",
                        "count": days_old,
                    })
                else:
                    notifications.append({
                        "type": "stale_submission",
                        "priority": PRIORITY_INFO,
                        "title": f"Application is {days_old} days old",
                        "body": "Information may be outdated. Consider requesting updated documents.",
                        "key": "stale_submission",
                        "action_tab": "setup",
                        "count": days_old,
                    })

    return notifications


# =============================================================================
# SUMMARY FUNCTION
# =============================================================================

def get_notification_summary(submission_id: str) -> dict:
    """
    Get a summary of notification counts by priority.
    Useful for badge display without full notification details.
    """
    notifications = get_notifications_with_dismissal(submission_id)

    critical_count = sum(1 for n in notifications if n["priority"] == PRIORITY_CRITICAL)
    warning_count = sum(1 for n in notifications if n["priority"] == PRIORITY_WARNING)
    info_count = sum(1 for n in notifications if n["priority"] == PRIORITY_INFO)

    return {
        "total": len(notifications),
        "critical": critical_count,
        "warning": warning_count,
        "info": info_count,
        "has_critical": critical_count > 0,
    }
