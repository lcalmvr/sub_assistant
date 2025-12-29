"""
Benchmarking Module

Finds comparable submissions with pricing, outcome, and performance data
for underwriting decision support.
"""

from typing import Optional
import json
from datetime import date, timedelta
from pgvector import Vector


def get_comparables(
    submission_id: str,
    get_conn,
    *,
    similarity_mode: str = "operations",  # operations, controls, combined
    revenue_tolerance: float = 0.25,  # ±25%
    same_industry: bool = False,
    stage_filter: Optional[str] = None,  # None=all, quoted, quoted_plus, bound, lost, received, declined
    date_window_months: Optional[int] = 24,
    layer_filter: str = "primary",  # primary, excess
    attachment_min: float | None = None,
    attachment_max: float | None = None,
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
        stage_filter: Filter by collapsed stage
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
            query_vec = None
            vec_col = "ops_embedding"

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

    # Stage filter (collapsed status/outcome)
    if stage_filter == "bound":
        where_clauses.append("s.submission_outcome = 'bound'")
    elif stage_filter == "lost":
        where_clauses.append("s.submission_outcome = 'lost'")
    elif stage_filter == "declined":
        where_clauses.append("s.submission_status = 'declined'")
    elif stage_filter == "quoted":
        where_clauses.append("s.submission_status = 'quoted'")
    elif stage_filter == "quoted_plus":
        where_clauses.append(
            "(s.submission_status = 'quoted' OR s.submission_outcome IN ('bound', 'lost'))"
        )
    elif stage_filter == "received":
        where_clauses.append(
            "s.submission_status IN ('received', 'pending', 'waiting_for_response', 'open', "
            "'renewal_expected', 'renewal_not_received')"
        )

    # Date window filter (effective date if present, else received)
    if date_window_months:
        cutoff = date.today() - timedelta(days=30 * date_window_months)
        where_clauses.append("COALESCE(s.effective_date, s.date_received) >= %s")
        params.append(cutoff)

    where_sql = " AND ".join(where_clauses)

    controls_similarity_select = "NULL::float as controls_similarity"
    if ctrl_vec is not None:
        controls_similarity_select = (
            "CASE WHEN m.controls_embedding IS NULL THEN NULL "
            "ELSE 1 - (m.controls_embedding <=> %s) END as controls_similarity"
        )

    distance_select = "NULL::float as distance"
    embedding_filter = ""
    order_sql = ""
    order_params: list = []
    if query_vec is not None:
        distance_select = f"{vec_col} <=> %s AS distance"
        embedding_filter = f"AND {vec_col} IS NOT NULL"
        order_sql = "ORDER BY distance LIMIT %s"
        order_params = [limit]
    else:
        distance_select = "NULL::float as distance"
        embedding_filter = ""
        order_sql = """
            ORDER BY
                CASE WHEN s.annual_revenue IS NULL THEN 1 ELSE 0 END,
                ABS(s.annual_revenue - %s) ASC NULLS LAST,
                COALESCE(s.effective_date, s.date_received) DESC
            LIMIT %s
        """
        order_params = [current_revenue, limit]

    layer_params: list = []
    layer_filters = []
    if layer_filter == "primary":
        layer_filters.append("COALESCE((layer->>'attachment')::numeric, 0) = 0")
        layer_order = "ASC"
    else:
        layer_filters.append("COALESCE((layer->>'attachment')::numeric, 0) > 0")
        if attachment_min is not None:
            layer_filters.append("(layer->>'attachment')::numeric >= %s")
            layer_params.append(attachment_min)
        if attachment_max is not None:
            layer_filters.append("(layer->>'attachment')::numeric <= %s")
            layer_params.append(attachment_max)
        layer_order = "DESC"
    layer_where = " AND ".join(layer_filters) if layer_filters else "TRUE"

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
                COALESCE(s.effective_date, s.date_received) as benchmark_date,
                CASE WHEN s.effective_date IS NOT NULL THEN 'eff' ELSE 'rec' END as benchmark_date_type,
                s.business_summary,
                s.nist_controls,
                s.controls_embedding,
                {distance_select}
            FROM submissions s
            WHERE {where_sql}
            {embedding_filter}
            {order_sql}
        ),
        best_tower AS (
            SELECT DISTINCT ON (t.submission_id)
                t.submission_id,
                t.tower_json,
                t.primary_retention,
                t.sold_premium,
                t.quoted_premium,
                t.is_bound,
                t.bound_at,
                t.created_at
            FROM insurance_towers t
            WHERE t.submission_id IN (SELECT id FROM matched_subs)
            ORDER BY
                t.submission_id,
                t.is_bound DESC,
                t.bound_at DESC NULLS LAST,
                t.created_at DESC
        ),
        best_layer AS (
            SELECT
                b.submission_id,
                l.attachment_point,
                l.limit_amount,
                l.carrier as layer_carrier,
                u.underlying_carrier,
                b.primary_retention as retention,
                COALESCE(b.sold_premium, b.quoted_premium) as premium,
                (b.is_bound IS TRUE) as is_bound
            FROM best_tower b
            CROSS JOIN LATERAL (
                SELECT
                    (layer->>'attachment')::numeric as attachment_point,
                    (layer->>'limit')::numeric as limit_amount,
                    layer->>'carrier' as carrier
                FROM jsonb_array_elements(COALESCE(b.tower_json, '[]'::jsonb)) layer
                WHERE {layer_where}
                ORDER BY (layer->>'attachment')::numeric {layer_order}
                LIMIT 1
            ) l
            LEFT JOIN LATERAL (
                SELECT
                    layer->>'carrier' as underlying_carrier
                FROM jsonb_array_elements(COALESCE(b.tower_json, '[]'::jsonb)) layer
                WHERE COALESCE((layer->>'attachment')::numeric, 0) = 0
                ORDER BY (layer->>'attachment')::numeric ASC
                LIMIT 1
            ) u ON TRUE
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
            m.benchmark_date,
            m.benchmark_date_type,
            m.business_summary,
            m.nist_controls,
            1 - m.distance as similarity_score,
            {controls_similarity_select},
            bl.attachment_point,
            bl.limit_amount,
            bl.layer_carrier,
            bl.underlying_carrier,
            bl.retention,
            bl.premium,
            bl.is_bound,
            la.claims_count,
            la.claims_paid
        FROM matched_subs m
        JOIN best_layer bl ON bl.submission_id = m.id
        LEFT JOIN loss_agg la ON la.submission_id = m.id
        ORDER BY similarity_score DESC
    """

    params_full: list = []
    if query_vec is not None:
        params_full.append(Vector(query_vec))
    params_full.extend(params)
    params_full.extend(order_params)
    params_full.extend(layer_params)
    if ctrl_vec is not None:
        params_full.append(Vector(ctrl_vec))

    with conn.cursor() as cur:
        cur.execute(query, params_full)
        rows = cur.fetchall()

    comparables = []
    for row in rows:
        (
            sub_id, name, date_recv, revenue, naics_code, naics_title,
            tags, status, outcome, reason, eff_date, bench_date, bench_date_type,
            business_summary, nist_controls, similarity, controls_similarity,
            attachment, limit_amt, layer_carrier, underlying_carrier, retention, premium, is_bound,
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
            "benchmark_date": bench_date,
            "benchmark_date_type": bench_date_type,
            "ops_summary": business_summary,
            "nist_controls": nist_controls,
            "similarity_score": round(similarity, 3) if similarity is not None else None,
            "controls_similarity": round(controls_similarity, 3) if controls_similarity is not None else None,
            "layer_type": "primary" if (attachment or 0) <= 0 else "excess",
            "attachment_point": attachment or 0,
            "limit": limit_amt,
            "carrier": layer_carrier,
            "underlying_carrier": underlying_carrier,
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
        Dict with count, bind_rate, avg_rate_per_mil_bound, avg_rate_per_mil_all, avg_loss_ratio
    """
    if not comparables:
        return {
            "count": 0,
            "bound_count": 0,
            "bind_rate": None,
            "avg_rate_per_mil_bound": None,
            "avg_rate_per_mil_all": None,
            "avg_loss_ratio": None,
            "rate_range": None,
        }

    count = len(comparables)

    # Count outcomes
    bound = [c for c in comparables if c["submission_outcome"] == "bound"]
    bound_count = len(bound)

    # Bind rate (of quoted)
    quoted = [c for c in comparables if c["submission_status"] == "quoted"]
    quoted_count = len(quoted)
    bind_rate = bound_count / quoted_count if quoted_count else None

    # Average rate per mil (bound only)
    rates_bound = [c["rate_per_mil"] for c in bound if c["rate_per_mil"]]
    avg_rate_bound = sum(rates_bound) / len(rates_bound) if rates_bound else None
    rate_range = (min(rates_bound), max(rates_bound)) if rates_bound else None

    # Average rate per mil (all with rate)
    rates_all = [c["rate_per_mil"] for c in comparables if c["rate_per_mil"]]
    avg_rate_all = sum(rates_all) / len(rates_all) if rates_all else None

    # Average loss ratio (bound with claims data)
    loss_ratios = [c["loss_ratio"] for c in bound if c["loss_ratio"] is not None]
    avg_loss = sum(loss_ratios) / len(loss_ratios) if loss_ratios else None

    return {
        "count": count,
        "bound_count": bound_count,
        "quoted_count": quoted_count,
        "bind_rate": round(bind_rate, 2) if bind_rate is not None else None,
        "avg_rate_per_mil_bound": round(avg_rate_bound, 0) if avg_rate_bound else None,
        "avg_rate_per_mil_all": round(avg_rate_all, 0) if avg_rate_all else None,
        "avg_loss_ratio": round(avg_loss, 3) if avg_loss is not None else None,
        "rate_range": rate_range,
    }


def get_current_submission_profile(submission_id: str, get_conn) -> dict:
    """Get current submission's profile for comparison display."""
    conn = get_conn() if callable(get_conn) else get_conn

    with conn.cursor() as cur:
        cur.execute("""
            WITH loss_agg AS (
                SELECT
                    submission_id,
                    COUNT(*) as claims_count,
                    COALESCE(SUM(paid_amount), 0) as claims_paid
                FROM loss_history
                WHERE submission_id = %s
                GROUP BY submission_id
            )
            SELECT
                s.applicant_name,
                s.annual_revenue,
                s.naics_primary_code,
                s.naics_primary_title,
                s.industry_tags,
                s.business_summary,
                s.submission_status,
                s.submission_outcome,
                s.effective_date,
                s.date_received,
                (s.ops_embedding IS NOT NULL) as has_ops_embedding,
                s.nist_controls,
                t.position as layer_type,
                (t.tower_json->0->>'attachment')::numeric as attachment_point,
                (t.tower_json->0->>'limit')::numeric as limit_amount,
                t.primary_retention as retention,
                COALESCE(t.sold_premium, t.quoted_premium) as premium,
                la.claims_count,
                la.claims_paid
            FROM submissions s
            LEFT JOIN insurance_towers t ON t.submission_id = s.id
            LEFT JOIN loss_agg la ON la.submission_id = s.id
            WHERE s.id = %s
            ORDER BY t.sold_premium DESC NULLS LAST, t.created_at DESC
            LIMIT 1
        """, (submission_id, submission_id))
        row = cur.fetchone()

    if not row:
        return {}

    (
        name, revenue, naics_code, naics_title, tags, business_summary,
        submission_status, submission_outcome, effective_date, date_received,
        has_ops_embedding, nist_controls, layer_type, attachment, limit_amt, retention, premium,
        claims_count, claims_paid,
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
        "ops_summary": business_summary,
        "submission_status": submission_status,
        "submission_outcome": submission_outcome,
        "effective_date": effective_date,
        "date_received": date_received,
        "has_ops_embedding": bool(has_ops_embedding),
        "nist_controls": nist_controls,
        "layer_type": layer_type,
        "attachment_point": float(attachment) if attachment else 0,
        "limit": float(limit_amt) if limit_amt else None,
        "retention": float(retention) if retention else None,
        "premium": float(premium) if premium else None,
        "rate_per_mil": round(rate_per_mil, 0) if rate_per_mil else None,
        "claims_count": claims_count or 0,
        "claims_paid": float(claims_paid) if claims_paid else 0,
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


def get_controls_comparison(submission_id: str, comparable_id: str, get_conn) -> dict:
    """
    Compare controls between two submissions.

    Returns dict with:
        - similarity: float 0-1 (controls similarity score)
        - comparison: str ("Stronger", "Weaker", "Similar", "Unknown")
        - current_summary: str
        - comparable_summary: str
    """
    conn = get_conn() if callable(get_conn) else get_conn

    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                id,
                controls_embedding,
                nist_controls_summary
            FROM submissions
            WHERE id IN (%s, %s)
        """, (submission_id, comparable_id))
        rows = cur.fetchall()

    if len(rows) < 2:
        return {
            "similarity": None,
            "comparison": "Unknown",
            "current_summary": None,
            "comparable_summary": None,
        }

    # Organize by ID
    data = {str(r[0]): {"embedding": r[1], "summary": r[2]} for r in rows}
    current = data.get(submission_id, {})
    comparable = data.get(comparable_id, {})

    # Calculate similarity if both have embeddings
    similarity = None
    comparison = "Unknown"

    if current.get("embedding") is not None and comparable.get("embedding") is not None:
        try:
            import numpy as np
            vec1 = np.array(current["embedding"])
            vec2 = np.array(comparable["embedding"])
            # Cosine similarity
            dot = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            if norm1 > 0 and norm2 > 0:
                similarity = float(dot / (norm1 * norm2))
                # Convert to percentage-like scale
                if similarity > 0.90:
                    comparison = "Very similar controls"
                elif similarity > 0.75:
                    comparison = "Similar controls"
                elif similarity > 0.50:
                    comparison = "Somewhat different"
                else:
                    comparison = "Different controls"
        except Exception:
            pass

    return {
        "similarity": round(similarity, 2) if similarity else None,
        "comparison": comparison,
        "current_summary": current.get("summary"),
        "comparable_summary": comparable.get("summary"),
    }


def get_best_tower(submission_id: str, get_conn) -> dict:
    """Return the best (bound else latest) tower for a submission."""
    conn = get_conn() if callable(get_conn) else get_conn

    with conn.cursor() as cur:
        cur.execute("""
            SELECT tower_json, sold_premium, quoted_premium, primary_retention
            FROM insurance_towers
            WHERE submission_id = %s
            ORDER BY is_bound DESC, bound_at DESC NULLS LAST, created_at DESC
            LIMIT 1
        """, (submission_id,))
        row = cur.fetchone()

    if not row:
        return {}

    tower_json, sold_premium, quoted_premium, primary_retention = row
    if isinstance(tower_json, str):
        try:
            tower_json = json.loads(tower_json)
        except json.JSONDecodeError:
            tower_json = []

    return {
        "tower_json": tower_json or [],
        "tower_premium": sold_premium or quoted_premium,
        "primary_retention": float(primary_retention) if primary_retention else None,
    }
