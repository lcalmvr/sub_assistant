"""
Broker Relationship Management (v1)

Append-only activity log + reminders ("next steps") for broker people/teams.
Designed to provide value even with incomplete manual data by relying on
auto-derived submission signals for recommendations.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text

from core.db import get_conn
import json


def ensure_tables() -> tuple[bool, Optional[str]]:
    """Best-effort table creation for local/dev environments."""
    statements = [
        """
        CREATE TABLE IF NOT EXISTS broker_activities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          occurred_at TIMESTAMP NOT NULL DEFAULT now(),
          activity_type TEXT NOT NULL,
          summary TEXT NOT NULL,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          subject_type TEXT NOT NULL DEFAULT 'person',
          subject_id UUID NOT NULL,
          next_step TEXT,
          next_step_due_at TIMESTAMP,
          next_step_status TEXT NOT NULL DEFAULT 'open',
          created_by TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_broker_activities_subject ON broker_activities(subject_type, subject_id)",
        "CREATE INDEX IF NOT EXISTS idx_broker_activities_occurred_at ON broker_activities(occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_broker_activities_next_step ON broker_activities(next_step_due_at) WHERE next_step_due_at IS NOT NULL",
        """
        CREATE OR REPLACE FUNCTION update_broker_activities_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """,
        "DROP TRIGGER IF EXISTS broker_activities_updated_at ON broker_activities",
        """
        CREATE TRIGGER broker_activities_updated_at
          BEFORE UPDATE ON broker_activities
          FOR EACH ROW
          EXECUTE FUNCTION update_broker_activities_timestamp()
        """,
        """
        CREATE TABLE IF NOT EXISTS broker_activity_links (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          activity_id UUID NOT NULL REFERENCES broker_activities(id) ON DELETE CASCADE,
          linked_type TEXT NOT NULL,
          linked_id UUID NOT NULL,
          link_reason TEXT NOT NULL DEFAULT 'auto',
          created_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_activity_links ON broker_activity_links(activity_id, linked_type, linked_id)",
        "CREATE INDEX IF NOT EXISTS idx_broker_activity_links_linked ON broker_activity_links(linked_type, linked_id)",
    ]
    try:
        with get_conn() as conn:
            for stmt in statements:
                conn.execute(text(stmt))
        return True, None
    except Exception as e:
        return False, str(e)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

def _as_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def create_activity(
    *,
    subject_type: str,
    subject_id: str,
    activity_type: str,
    summary: str,
    tags: list[str] | None = None,
    occurred_at: Optional[datetime] = None,
    next_step: Optional[str] = None,
    next_step_due_at: Optional[datetime] = None,
    created_by: Optional[str] = None,
    also_link_team_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    if not summary or not summary.strip():
        raise ValueError("summary is required")
    if subject_type not in {"person", "team"}:
        raise ValueError("subject_type must be person or team")

    tags = [t for t in (tags or []) if t]
    occurred_at = occurred_at or _utc_now()

    with get_conn() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO broker_activities (
                  occurred_at, activity_type, summary, tags,
                  subject_type, subject_id,
                  next_step, next_step_due_at, next_step_status,
                  created_by
                )
                VALUES (
                  :occurred_at, :activity_type, :summary, CAST(:tags AS jsonb),
                  :subject_type, CAST(:subject_id AS uuid),
                  :next_step, :next_step_due_at, 'open',
                  :created_by
                )
                RETURNING id, occurred_at, activity_type, summary, tags, subject_type, subject_id,
                          next_step, next_step_due_at, next_step_status, created_by, created_at, updated_at
                """
            ),
            {
                "occurred_at": occurred_at,
                "activity_type": activity_type,
                "summary": summary.strip(),
                "tags": json.dumps(tags),
                "subject_type": subject_type,
                "subject_id": subject_id,
                "next_step": (next_step or "").strip() or None,
                "next_step_due_at": next_step_due_at,
                "created_by": created_by,
            },
        ).fetchone()

        activity_id = str(row[0])

        # Best-effort linking for convenience (does not change the primary subject).
        _create_default_links(conn, activity_id=activity_id, subject_type=subject_type, subject_id=subject_id)
        for team_id in also_link_team_ids or []:
            try:
                conn.execute(
                    text(
                        """
                        INSERT INTO broker_activity_links (activity_id, linked_type, linked_id, link_reason)
                        VALUES (CAST(:activity_id AS uuid), 'team', CAST(:linked_id AS uuid), 'user_selected')
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"activity_id": activity_id, "linked_id": team_id},
                )
            except Exception:
                pass

    return _row_to_activity(row)


def _create_default_links(conn, *, activity_id: str, subject_type: str, subject_id: str) -> None:
    """
    v1 imputation strategy:
    - If subject is a person, link to their current active employment + org, and active team memberships.
    - If subject is a team, link to org if present.
    """
    try:
        if subject_type == "person":
            # Current active employment/org
            emp = conn.execute(
                text(
                    """
                    SELECT e.employment_id, e.org_id
                    FROM brkr_employments e
                    WHERE e.person_id = CAST(:person_id AS uuid)
                      AND e.active = TRUE
                    ORDER BY e.employment_id
                    LIMIT 1
                    """
                ),
                {"person_id": subject_id},
            ).fetchone()
            if emp:
                conn.execute(
                    text(
                        """
                        INSERT INTO broker_activity_links (activity_id, linked_type, linked_id, link_reason)
                        VALUES (CAST(:activity_id AS uuid), 'employment', CAST(:linked_id AS uuid), 'auto')
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"activity_id": activity_id, "linked_id": str(emp[0])},
                )
                conn.execute(
                    text(
                        """
                        INSERT INTO broker_activity_links (activity_id, linked_type, linked_id, link_reason)
                        VALUES (CAST(:activity_id AS uuid), 'org', CAST(:linked_id AS uuid), 'auto')
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"activity_id": activity_id, "linked_id": str(emp[1])},
                )

            # Active teams
            team_rows = conn.execute(
                text(
                    """
                    SELECT tm.team_id
                    FROM brkr_team_memberships tm
                    WHERE tm.person_id = CAST(:person_id AS uuid)
                      AND tm.active = TRUE
                    """
                ),
                {"person_id": subject_id},
            ).fetchall()
            for (team_id,) in team_rows:
                conn.execute(
                    text(
                        """
                        INSERT INTO broker_activity_links (activity_id, linked_type, linked_id, link_reason)
                        VALUES (CAST(:activity_id AS uuid), 'team', CAST(:linked_id AS uuid), 'auto')
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"activity_id": activity_id, "linked_id": str(team_id)},
                )

        if subject_type == "team":
            org_row = conn.execute(
                text("SELECT org_id FROM brkr_teams WHERE team_id = CAST(:team_id AS uuid)"),
                {"team_id": subject_id},
            ).fetchone()
            if org_row and org_row[0]:
                conn.execute(
                    text(
                        """
                        INSERT INTO broker_activity_links (activity_id, linked_type, linked_id, link_reason)
                        VALUES (CAST(:activity_id AS uuid), 'org', CAST(:linked_id AS uuid), 'auto')
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"activity_id": activity_id, "linked_id": str(org_row[0])},
                )
    except Exception:
        # Linking is best-effort; never block activity creation.
        return


def list_activities(
    *,
    subject_type: str,
    subject_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, occurred_at, activity_type, summary, tags, subject_type, subject_id,
                       next_step, next_step_due_at, next_step_status, created_by, created_at, updated_at
                FROM broker_activities
                WHERE subject_type = :subject_type
                  AND subject_id = CAST(:subject_id AS uuid)
                ORDER BY occurred_at DESC, created_at DESC
                LIMIT :limit
                """
            ),
            {"subject_type": subject_type, "subject_id": subject_id, "limit": limit},
        ).fetchall()
    return [_row_to_activity(r) for r in rows]


def list_open_next_steps(
    *,
    subject_type: str,
    subject_id: str,
    limit: int = 25,
) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, occurred_at, activity_type, summary, tags, subject_type, subject_id,
                       next_step, next_step_due_at, next_step_status, created_by, created_at, updated_at
                FROM broker_activities
                WHERE subject_type = :subject_type
                  AND subject_id = CAST(:subject_id AS uuid)
                  AND next_step_due_at IS NOT NULL
                  AND next_step_status = 'open'
                ORDER BY next_step_due_at ASC
                LIMIT :limit
                """
            ),
            {"subject_type": subject_type, "subject_id": subject_id, "limit": limit},
        ).fetchall()
    return [_row_to_activity(r) for r in rows]


def update_next_step_status(*, activity_id: str, status: str) -> None:
    if status not in {"open", "done", "snoozed"}:
        raise ValueError("invalid status")
    with get_conn() as conn:
        conn.execute(
            text(
                """
                UPDATE broker_activities
                SET next_step_status = :status
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"id": activity_id, "status": status},
        )


def snooze_next_step(*, activity_id: str, until_at: datetime) -> None:
    with get_conn() as conn:
        conn.execute(
            text(
                """
                UPDATE broker_activities
                SET next_step_status = 'snoozed',
                    next_step_due_at = :until_at
                WHERE id = CAST(:id AS uuid)
                """
            ),
            {"id": activity_id, "until_at": until_at},
        )


def list_submission_events_for_person(*, person_id: str, limit: int = 25) -> list[dict[str, Any]]:
    """
    Pull a lightweight submission timeline for a person based on submissions.broker_employment_id.
    """
    with get_conn() as conn:
        rows = conn.execute(
            text(
                """
                SELECT
                  s.id,
                  COALESCE(s.date_received, s.created_at) AS occurred_at,
                  s.applicant_name,
                  s.submission_status,
                  s.submission_outcome,
                  s.annual_revenue,
                  s.naics_primary_title
                FROM submissions s
                JOIN brkr_employments e
                  ON (
                    CASE
                      WHEN NULLIF(s.broker_employment_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      THEN NULLIF(s.broker_employment_id, '')::uuid
                      ELSE NULL
                    END
                  ) = e.employment_id
                WHERE e.person_id = CAST(:person_id AS uuid)
                ORDER BY COALESCE(s.date_received, s.created_at) DESC
                LIMIT :limit
                """
            ),
            {"person_id": person_id, "limit": limit},
        ).fetchall()

    out = []
    for sid, occurred_at, applicant, status, outcome, revenue, industry in rows:
        out.append(
            {
                "type": "submission",
                "submission_id": str(sid),
                "occurred_at": occurred_at,
                "title": applicant,
                "status": status,
                "outcome": outcome,
                "annual_revenue": revenue,
                "industry": industry,
            }
        )
    return out


def outreach_recommendations_people(*, limit: int = 30) -> list[dict[str, Any]]:
    """
    Rules-based outreach recommendations by person.
    """
    with get_conn() as conn:
        rows = conn.execute(
            text(
                """
                WITH sub AS (
                  SELECT
                    e.person_id,
                    COUNT(*) FILTER (WHERE COALESCE(s.date_received, s.created_at) >= now() - interval '90 days') AS subs_90d,
                    COUNT(*) FILTER (WHERE COALESCE(s.date_received, s.created_at) >= now() - interval '365 days') AS subs_365d,
                    MAX(COALESCE(s.date_received, s.created_at)) AS last_submission_at,
                    COUNT(*) FILTER (WHERE s.submission_status = 'quoted' AND COALESCE(s.date_received, s.created_at) >= now() - interval '365 days') AS quoted_365d,
                    COUNT(*) FILTER (WHERE t.is_bound = TRUE AND COALESCE(s.date_received, s.created_at) >= now() - interval '365 days') AS bound_365d,
                    COALESCE(SUM(COALESCE(t.sold_premium, 0)) FILTER (WHERE t.is_bound = TRUE AND COALESCE(s.date_received, s.created_at) >= now() - interval '365 days'), 0) AS written_premium_365d
                  FROM submissions s
                  JOIN brkr_employments e ON (
                    CASE
                      WHEN NULLIF(s.broker_employment_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      THEN NULLIF(s.broker_employment_id, '')::uuid
                      ELSE NULL
                    END
                  ) = e.employment_id
                  LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
                  GROUP BY e.person_id
                ),
                touch AS (
                  SELECT subject_id AS person_id, MAX(occurred_at) AS last_touch_at
                  FROM broker_activities
                  WHERE subject_type = 'person'
                  GROUP BY subject_id
                )
                SELECT
                  p.person_id,
                  p.first_name,
                  p.last_name,
                  COALESCE(sub.subs_90d, 0) AS subs_90d,
                  COALESCE(sub.quoted_365d, 0) AS quoted_365d,
                  COALESCE(sub.bound_365d, 0) AS bound_365d,
                  COALESCE(sub.written_premium_365d, 0) AS written_premium_365d,
                  sub.last_submission_at,
                  touch.last_touch_at
                FROM brkr_people p
                LEFT JOIN sub ON sub.person_id = p.person_id
                LEFT JOIN touch ON touch.person_id = p.person_id
                WHERE COALESCE(sub.subs_365d, 0) > 0
                """
            )
        ).fetchall()

    now = _utc_now()
    recs: list[dict[str, Any]] = []
    for (
        person_id,
        first_name,
        last_name,
        subs_90d,
        quoted_365d,
        bound_365d,
        written_premium_365d,
        last_sub_at,
        last_touch_at,
    ) in rows:
        person_id = str(person_id)
        name = f"{first_name or ''} {last_name or ''}".strip() or person_id[:8]

        reasons: list[str] = []
        score = 0.0

        last_sub_at = _as_naive_utc(last_sub_at)
        last_touch_at = _as_naive_utc(last_touch_at)

        days_since_touch = None
        if last_touch_at:
            days_since_touch = (now - last_touch_at).days

        # Rule: strong broker, no touch
        if written_premium_365d and written_premium_365d >= 50_000:
            if days_since_touch is None or days_since_touch >= 45:
                reasons.append("Strong written premium; no recent touch")
                score += 3.0

        # Rule: volume but low binds
        if subs_90d >= 3 and bound_365d == 0:
            reasons.append("Multiple submissions; no binds")
            score += 2.5

        # Rule: quoted but not bound recently
        if quoted_365d >= 3 and bound_365d == 0:
            reasons.append("Quoted activity without binds")
            score += 1.5

        # Rule: no submissions lately but historically active
        if last_sub_at and (now - last_sub_at).days >= 90 and written_premium_365d >= 25_000:
            reasons.append("No recent submissions; consider check-in")
            score += 1.0

        if not reasons:
            continue

        recs.append(
            {
                "person_id": person_id,
                "name": name,
                "subs_90d": int(subs_90d or 0),
                "bound_365d": int(bound_365d or 0),
                "written_premium_365d": float(written_premium_365d or 0),
                "last_submission_at": last_sub_at,
                "last_touch_at": last_touch_at,
                "reasons": reasons,
                "score": score,
                "suggested_action": "Log a touchpoint / schedule follow-up",
            }
        )

    recs.sort(key=lambda r: (r["score"], r["written_premium_365d"], r["subs_90d"]), reverse=True)
    return recs[:limit]


def _row_to_activity(row) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "occurred_at": row[1],
        "activity_type": row[2],
        "summary": row[3],
        "tags": row[4] if isinstance(row[4], list) else (row[4] or []),
        "subject_type": row[5],
        "subject_id": str(row[6]),
        "next_step": row[7],
        "next_step_due_at": row[8],
        "next_step_status": row[9],
        "created_by": row[10],
        "created_at": row[11],
        "updated_at": row[12],
    }
