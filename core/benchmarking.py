"""
Benchmarking Module

Finds comparable submissions with pricing, outcome, and performance data
for underwriting decision support.
"""

from typing import Optional
from datetime import date
from pgvector import Vector


def get_comparables(
    submission_id: str,
    get_conn,
    *,
    similarity_mode: str = "operations",  # operations, controls, combined
    revenue_tolerance: float = 0.25,  # ±25%
    same_industry: bool = False,
    outcome_filter: Optional[str] = None,  # None=all, bound, lost, declined
    limit: int = 15,
) -> list[dict]:
    """
    Get comparable submissions with pricing and outcome data.

    Args:
        submission_id: Current submission UUID
        get_conn: Database connection function
        similarity_mode: Vector similarity basis
        revenue_tolerance: Revenue match tolerance (0.25 = ±25%)
        same_industry: Require same NAICS code
        outcome_filter: Filter by outcome
        limit: Max results

    Returns:
        List of comparable dicts with pricing/outcome/performance
    """
    conn = get_conn() if callable(get_conn) else get_conn

    # Get current submission's embedding and profile
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ops_embedding, controls_embedding,
                   annual_revenue, naics_primary_code
            FROM submissions WHERE id = %s
        """, (submission_id,))
        row = cur.fetchone()

    if not row:
        return []

    ops_vec, ctrl_vec, current_revenue, current_naics = row

    # Determine query vector based on mode
    if similarity_mode == "operations" and ops_vec is not None:
        query_vec = ops_vec
        vec_col = "ops_embedding"
    elif similarity_mode == "controls" and ctrl_vec is not None:
        query_vec = ctrl_vec
        vec_col = "controls_embedding"
    elif similarity_mode == "combined" and ops_vec is not None and ctrl_vec is not None:
        query_vec = [a + b for a, b in zip(ops_vec, ctrl_vec)]
        vec_col = "(ops_embedding + controls_embedding)"
    else:
        # Fallback to operations
        if ops_vec is not None:
            query_vec = ops_vec
            vec_col = "ops_embedding"
        else:
            return []

    # Build WHERE clauses
    where_clauses = ["s.id <> %s"]
    params = [submission_id]

    # Revenue filter
    if current_revenue and revenue_tolerance > 0:
        rev = float(current_revenue)
        min_rev = rev * (1 - revenue_tolerance)
        max_rev = rev * (1 + revenue_tolerance)
        where_clauses.append("s.annual_revenue BETWEEN %s AND %s")
        params.extend([min_rev, max_rev])

    # Industry filter
    if same_industry and current_naics:
        where_clauses.append("s.naics_primary_code = %s")
        params.append(current_naics)

    # Outcome filter
    if outcome_filter == "bound":
        where_clauses.append("s.submission_outcome = 'bound'")
    elif outcome_filter == "lost":
        where_clauses.append("s.submission_outcome = 'lost'")
    elif outcome_filter == "declined":
        where_clauses.append("s.submission_status = 'declined'")

    where_sql = " AND ".join(where_clauses)

    # Main query - insurance_towers stores tower_json as JSONB array
    # Extract first layer's limit from tower_json, position from position column
    query = f"""
        WITH matched_subs AS (
            SELECT
                s.id,
                s.applicant_name,
                s.date_received,
                s.annual_revenue,
                s.naics_primary_code,
                s.naics_primary_title,
                s.industry_tags,
                s.submission_status,
                s.submission_outcome,
                s.outcome_reason,
                s.effective_date,
                {vec_col} <=> %s AS distance
            FROM submissions s
            WHERE {where_sql}
              AND {vec_col} IS NOT NULL
            ORDER BY distance
            LIMIT %s
        ),
        best_tower AS (
            SELECT DISTINCT ON (t.submission_id)
                t.submission_id,
                t.position as layer_type,
                (t.tower_json->0->>'attachment')::numeric as attachment_point,
                (t.tower_json->0->>'limit')::numeric as limit_amount,
                t.primary_retention as retention,
                COALESCE(t.sold_premium, t.quoted_premium) as premium,
                (t.sold_premium IS NOT NULL) as is_bound
            FROM insurance_towers t
            WHERE t.submission_id IN (SELECT id FROM matched_subs)
            ORDER BY t.submission_id, t.sold_premium DESC NULLS LAST, t.created_at DESC
        ),
        loss_agg AS (
            SELECT
                submission_id,
                COUNT(*) as claims_count,
                COALESCE(SUM(paid_amount), 0) as claims_paid
            FROM loss_history
            WHERE submission_id IN (SELECT id FROM matched_subs)
            GROUP BY submission_id
        )
        SELECT
            m.id,
            m.applicant_name,
            m.date_received,
            m.annual_revenue,
            m.naics_primary_code,
            m.naics_primary_title,
            m.industry_tags,
            m.submission_status,
            m.submission_outcome,
            m.outcome_reason,
            m.effective_date,
            1 - m.distance as similarity_score,
            bt.layer_type,
            bt.attachment_point,
            bt.limit_amount,
            bt.retention,
            bt.premium,
            bt.is_bound,
            la.claims_count,
            la.claims_paid
        FROM matched_subs m
        LEFT JOIN best_tower bt ON bt.submission_id = m.id
        LEFT JOIN loss_agg la ON la.submission_id = m.id
        ORDER BY similarity_score DESC
    """

    params_full = [Vector(query_vec)] + params + [limit]

    with conn.cursor() as cur:
        cur.execute(query, params_full)
        rows = cur.fetchall()

    comparables = []
    for row in rows:
        (
            sub_id, name, date_recv, revenue, naics_code, naics_title,
            tags, status, outcome, reason, eff_date, similarity,
            layer_type, attachment, limit_amt, retention, premium, is_bound,
            claims_count, claims_paid
        ) = row

        # Calculate rate per mil
        rate_per_mil = None
        if premium and limit_amt and limit_amt > 0:
            rate_per_mil = premium / (limit_amt / 1_000_000)

        # Calculate loss ratio
        loss_ratio = None
        if is_bound and premium and premium > 0:
            loss_ratio = (claims_paid or 0) / premium

        comparables.append({
            "id": str(sub_id),
            "applicant_name": name,
            "date_received": date_recv,
            "annual_revenue": revenue,
            "naics_code": naics_code,
            "naics_title": naics_title,
            "industry_tags": tags or [],
            "submission_status": status,
            "submission_outcome": outcome,
            "outcome_reason": reason,
            "effective_date": eff_date,
            "similarity_score": round(similarity, 3) if similarity else 0,
            "layer_type": layer_type,
            "attachment_point": attachment or 0,
            "limit": limit_amt,
            "retention": retention,
            "premium": premium,
            "rate_per_mil": round(rate_per_mil, 0) if rate_per_mil else None,
            "is_bound": is_bound or False,
            "claims_count": claims_count or 0,
            "claims_paid": claims_paid or 0,
            "loss_ratio": round(loss_ratio, 3) if loss_ratio is not None else None,
        })

    return comparables


def get_benchmark_metrics(comparables: list[dict]) -> dict:
    """
    Calculate summary metrics from comparables.

    Returns:
        Dict with count, bind_rate, avg_rate_per_mil, avg_loss_ratio
    """
    if not comparables:
        return {
            "count": 0,
            "bound_count": 0,
            "bind_rate": None,
            "avg_rate_per_mil": None,
            "avg_loss_ratio": None,
            "rate_range": None,
        }

    count = len(comparables)

    # Count outcomes
    bound = [c for c in comparables if c["submission_outcome"] == "bound"]
    bound_count = len(bound)

    # Bind rate (of quoted)
    quoted = [c for c in comparables if c["submission_status"] == "quoted"]
    bind_rate = bound_count / len(quoted) if quoted else None

    # Average rate per mil (bound only)
    rates = [c["rate_per_mil"] for c in bound if c["rate_per_mil"]]
    avg_rate = sum(rates) / len(rates) if rates else None
    rate_range = (min(rates), max(rates)) if rates else None

    # Average loss ratio (bound with claims data)
    loss_ratios = [c["loss_ratio"] for c in bound if c["loss_ratio"] is not None]
    avg_loss = sum(loss_ratios) / len(loss_ratios) if loss_ratios else None

    return {
        "count": count,
        "bound_count": bound_count,
        "bind_rate": round(bind_rate, 2) if bind_rate is not None else None,
        "avg_rate_per_mil": round(avg_rate, 0) if avg_rate else None,
        "avg_loss_ratio": round(avg_loss, 3) if avg_loss is not None else None,
        "rate_range": rate_range,
    }


def get_current_submission_profile(submission_id: str, get_conn) -> dict:
    """Get current submission's profile for comparison display."""
    conn = get_conn() if callable(get_conn) else get_conn

    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                s.applicant_name,
                s.annual_revenue,
                s.naics_primary_code,
                s.naics_primary_title,
                s.industry_tags,
                t.position as layer_type,
                (t.tower_json->0->>'attachment')::numeric as attachment_point,
                (t.tower_json->0->>'limit')::numeric as limit_amount,
                t.primary_retention as retention,
                COALESCE(t.sold_premium, t.quoted_premium) as premium
            FROM submissions s
            LEFT JOIN insurance_towers t ON t.submission_id = s.id
            WHERE s.id = %s
            ORDER BY t.sold_premium DESC NULLS LAST, t.created_at DESC
            LIMIT 1
        """, (submission_id,))
        row = cur.fetchone()

    if not row:
        return {}

    (
        name, revenue, naics_code, naics_title, tags,
        layer_type, attachment, limit_amt, retention, premium
    ) = row

    rate_per_mil = None
    if premium and limit_amt and limit_amt > 0:
        rate_per_mil = float(premium) / (float(limit_amt) / 1_000_000)

    return {
        "applicant_name": name,
        "annual_revenue": float(revenue) if revenue else None,
        "naics_code": naics_code,
        "naics_title": naics_title,
        "industry_tags": tags or [],
        "layer_type": layer_type,
        "attachment_point": float(attachment) if attachment else 0,
        "limit": float(limit_amt) if limit_amt else None,
        "retention": float(retention) if retention else None,
        "premium": float(premium) if premium else None,
        "rate_per_mil": round(rate_per_mil, 0) if rate_per_mil else None,
    }


# Outcome display mapping
OUTCOME_DISPLAY = {
    "bound": ("✅", "Bound"),
    "lost": ("❌", "Lost"),
    "declined": ("🚫", "Declined"),
    "pending": ("⏳", "Pending"),
    "waiting_for_response": ("⏳", "Waiting"),
}


def format_outcome(status: str, outcome: str) -> str:
    """Format outcome for display."""
    if status == "declined":
        emoji, text = OUTCOME_DISPLAY.get("declined", ("", "Declined"))
    else:
        emoji, text = OUTCOME_DISPLAY.get(outcome, ("", outcome or "—"))
    return f"{emoji} {text}"
