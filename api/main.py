"""
FastAPI backend for the React frontend.
Exposes the existing database and business logic via REST API.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Underwriting Assistant API")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    """Get database connection using existing DATABASE_URL."""
    return psycopg2.connect(
        os.environ.get("DATABASE_URL"),
        cursor_factory=RealDictCursor
    )


# ─────────────────────────────────────────────────────────────
# Submissions Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/submissions")
def list_submissions():
    """List all submissions with bound status."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.naics_primary_title,
                    s.annual_revenue,
                    s.submission_status as status,
                    s.created_at,
                    s.decision_tag,
                    COALESCE(bound.is_bound, false) as has_bound_quote,
                    bound.quote_name as bound_quote_name
                FROM submissions s
                LEFT JOIN (
                    SELECT DISTINCT ON (submission_id)
                        submission_id, is_bound, quote_name
                    FROM insurance_towers
                    WHERE is_bound = true
                    ORDER BY submission_id, created_at DESC
                ) bound ON s.id = bound.submission_id
                ORDER BY s.created_at DESC
                LIMIT 100
            """)
            return cur.fetchall()


@app.get("/api/submissions/{submission_id}")
def get_submission(submission_id: str):
    """Get a single submission with full details."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, applicant_name, business_summary, annual_revenue,
                       naics_primary_title, naics_primary_code,
                       submission_status as status,
                       bullet_point_summary, nist_controls_summary,
                       hazard_override, control_overrides, default_retroactive_date,
                       ai_recommendation, ai_guideline_citations,
                       decision_tag, decision_reason, decided_at, decided_by,
                       cyber_exposures, nist_controls,
                       website, broker_email,
                       created_at
                FROM submissions
                WHERE id = %s
            """, (submission_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Submission not found")
            return row


class SubmissionUpdate(BaseModel):
    # Company info
    applicant_name: Optional[str] = None
    website: Optional[str] = None
    broker_email: Optional[str] = None
    # Financial
    annual_revenue: Optional[int] = None
    naics_primary_title: Optional[str] = None
    # Rating overrides
    hazard_override: Optional[int] = None
    control_overrides: Optional[dict] = None
    default_retroactive_date: Optional[str] = None
    # Decision fields
    decision_tag: Optional[str] = None
    decision_reason: Optional[str] = None


@app.patch("/api/submissions/{submission_id}")
def update_submission(submission_id: str, data: SubmissionUpdate):
    """Update a submission."""
    from datetime import datetime

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Auto-set decided_at when decision_tag is provided
    # Note: decided_by is a UUID foreign key, so we skip it for now (no auth)
    if "decision_tag" in updates:
        updates["decided_at"] = datetime.utcnow()

    set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
    values = list(updates.values()) + [submission_id]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE submissions SET {set_clause} WHERE id = %s RETURNING id",
                values
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Submission not found")
            conn.commit()
    return {"status": "updated"}


# ─────────────────────────────────────────────────────────────
# Quote Options Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/submissions/{submission_id}/quotes")
def list_quotes(submission_id: str):
    """List quote options for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, quote_name, tower_json, primary_retention, position,
                       technical_premium, risk_adjusted_premium, sold_premium,
                       policy_form, is_bound, retroactive_date, created_at
                FROM insurance_towers
                WHERE submission_id = %s
                ORDER BY created_at DESC
            """, (submission_id,))
            return cur.fetchall()


@app.get("/api/quotes/{quote_id}")
def get_quote(quote_id: str):
    """Get a single quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, submission_id, quote_name, tower_json, primary_retention,
                       position, technical_premium, risk_adjusted_premium, sold_premium,
                       policy_form, coverages, sublimits, is_bound, retroactive_date,
                       created_at
                FROM insurance_towers
                WHERE id = %s
            """, (quote_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Quote not found")
            return row


@app.get("/api/quotes/{quote_id}/documents")
def get_quote_documents(quote_id: str):
    """Get documents for a specific quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, document_type, document_number, pdf_url, created_at
                FROM policy_documents
                WHERE quote_option_id = %s
                AND document_type IN ('quote_primary', 'quote_excess')
                AND status != 'void'
                ORDER BY created_at DESC
            """, (quote_id,))
            return cur.fetchall()


class QuoteCreate(BaseModel):
    quote_name: str
    primary_retention: Optional[int] = 25000
    policy_form: Optional[str] = "claims_made"
    tower_json: Optional[list] = None
    coverages: Optional[dict] = None


class QuoteUpdate(BaseModel):
    quote_name: Optional[str] = None
    sold_premium: Optional[int] = None
    retroactive_date: Optional[str] = None
    is_bound: Optional[bool] = None
    primary_retention: Optional[int] = None
    policy_form: Optional[str] = None
    tower_json: Optional[list] = None
    coverages: Optional[dict] = None


@app.post("/api/submissions/{submission_id}/quotes")
def create_quote(submission_id: str, data: QuoteCreate):
    """Create a new quote option."""
    import json

    # Default tower structure if not provided
    tower_json = data.tower_json or [
        {"carrier": "CMAI", "limit": 1000000, "attachment": 0, "premium": None}
    ]

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify submission exists
            cur.execute("SELECT id FROM submissions WHERE id = %s", (submission_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Submission not found")

            cur.execute("""
                INSERT INTO insurance_towers (
                    submission_id, quote_name, primary_retention, policy_form,
                    tower_json, coverages, position
                ) VALUES (%s, %s, %s, %s, %s, %s, 'primary')
                RETURNING id, quote_name, created_at
            """, (
                submission_id,
                data.quote_name,
                data.primary_retention,
                data.policy_form,
                json.dumps(tower_json),
                json.dumps(data.coverages or {}),
            ))
            row = cur.fetchone()
            conn.commit()
            return {"id": row["id"], "quote_name": row["quote_name"], "created_at": row["created_at"]}


@app.patch("/api/quotes/{quote_id}")
def update_quote(quote_id: str, data: QuoteUpdate):
    """Update a quote option."""
    import json

    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            # Convert dict/list to JSON string for JSONB columns
            if k in ('tower_json', 'coverages') and v is not None:
                updates[k] = json.dumps(v)
            else:
                updates[k] = v

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
    values = list(updates.values()) + [quote_id]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE insurance_towers SET {set_clause}, updated_at = NOW() WHERE id = %s RETURNING id",
                values
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Quote not found")
            conn.commit()
    return {"status": "updated"}


@app.post("/api/quotes/{quote_id}/clone")
def clone_quote(quote_id: str):
    """Clone a quote option."""
    import json

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get original quote
            cur.execute("""
                SELECT submission_id, quote_name, tower_json, primary_retention,
                       policy_form, coverages, sublimits, position
                FROM insurance_towers WHERE id = %s
            """, (quote_id,))
            original = cur.fetchone()
            if not original:
                raise HTTPException(status_code=404, detail="Quote not found")

            # Create clone with modified name
            new_name = f"{original['quote_name']} (Copy)"

            # Serialize JSON fields
            tower_json = json.dumps(original['tower_json']) if original['tower_json'] else None
            coverages = json.dumps(original['coverages']) if original['coverages'] else None
            sublimits = json.dumps(original['sublimits']) if original['sublimits'] else None

            cur.execute("""
                INSERT INTO insurance_towers (
                    submission_id, quote_name, tower_json, primary_retention,
                    policy_form, coverages, sublimits, position
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, quote_name, created_at
            """, (
                original['submission_id'],
                new_name,
                tower_json,
                original['primary_retention'],
                original['policy_form'],
                coverages,
                sublimits,
                original['position'],
            ))
            row = cur.fetchone()
            conn.commit()
            return {"id": row["id"], "quote_name": row["quote_name"], "created_at": row["created_at"]}


@app.post("/api/quotes/{quote_id}/bind")
def bind_quote(quote_id: str):
    """Bind a quote option (and unbind others for the same submission)."""
    from datetime import datetime

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get submission_id for this quote
            cur.execute("SELECT submission_id FROM insurance_towers WHERE id = %s", (quote_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Quote not found")

            submission_id = row["submission_id"]

            # Unbind all other quotes for this submission
            cur.execute("""
                UPDATE insurance_towers
                SET is_bound = false, bound_at = NULL
                WHERE submission_id = %s AND id != %s
            """, (submission_id, quote_id))

            # Bind this quote
            cur.execute("""
                UPDATE insurance_towers
                SET is_bound = true, bound_at = %s
                WHERE id = %s
                RETURNING id
            """, (datetime.utcnow(), quote_id))

            conn.commit()
            return {"status": "bound", "quote_id": quote_id}


@app.post("/api/quotes/{quote_id}/unbind")
def unbind_quote(quote_id: str):
    """Unbind a quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE insurance_towers
                SET is_bound = false, bound_at = NULL
                WHERE id = %s
                RETURNING id
            """, (quote_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Quote not found")
            conn.commit()
            return {"status": "unbound", "quote_id": quote_id}


# ─────────────────────────────────────────────────────────────
# Comparables Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/submissions/{submission_id}/comparables")
def get_comparables(
    submission_id: str,
    layer: str = "primary",
    months: int = 24,
    revenue_tolerance: float = 0.5,
    limit: int = 30
):
    """Get comparable submissions for benchmarking."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get current submission's revenue for filtering
            cur.execute(
                "SELECT annual_revenue FROM submissions WHERE id = %s",
                (submission_id,)
            )
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Submission not found")

            current_revenue = float(current.get("annual_revenue") or 0)

            # Calculate revenue bounds
            if revenue_tolerance > 0 and current_revenue > 0:
                min_rev = current_revenue * (1 - revenue_tolerance)
                max_rev = current_revenue * (1 + revenue_tolerance)
                revenue_clause = "AND s.annual_revenue BETWEEN %s AND %s"
                revenue_params = [min_rev, max_rev]
            else:
                revenue_clause = ""
                revenue_params = []

            # Layer filter (primary = attachment 0, excess = attachment > 0)
            if layer == "excess":
                layer_clause = "AND COALESCE((t.tower_json->0->>'attachment')::numeric, 0) > 0"
            else:
                layer_clause = "AND COALESCE((t.tower_json->0->>'attachment')::numeric, 0) = 0"

            query = f"""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.annual_revenue,
                    s.naics_primary_title,
                    s.submission_status,
                    s.submission_outcome,
                    s.effective_date,
                    s.date_received,
                    t.id as tower_id,
                    t.tower_json,
                    t.primary_retention,
                    t.risk_adjusted_premium,
                    t.sold_premium,
                    t.is_bound,
                    (t.tower_json->0->>'limit')::numeric as policy_limit,
                    (t.tower_json->0->>'attachment')::numeric as attachment_point,
                    (t.tower_json->0->>'carrier') as carrier
                FROM submissions s
                LEFT JOIN insurance_towers t ON t.submission_id = s.id
                WHERE s.id != %s
                AND s.created_at >= NOW() - INTERVAL '%s months'
                {revenue_clause}
                {layer_clause}
                ORDER BY s.created_at DESC
                LIMIT %s
            """

            params = [submission_id, months] + revenue_params + [limit]
            cur.execute(query, params)
            rows = cur.fetchall()

            # Process rows to add computed fields
            comparables = []
            for row in rows:
                row_dict = dict(row)
                # Compute rate per million
                premium = row_dict.get("sold_premium") or row_dict.get("risk_adjusted_premium")
                policy_limit = row_dict.get("policy_limit")
                if premium and policy_limit and policy_limit > 0:
                    row_dict["rate_per_mil"] = float(premium) / (float(policy_limit) / 1_000_000)
                else:
                    row_dict["rate_per_mil"] = None

                # Format stage
                status = (row_dict.get("submission_status") or "").lower()
                outcome = (row_dict.get("submission_outcome") or "").lower()
                if status == "declined":
                    row_dict["stage"] = "Declined"
                elif outcome == "bound":
                    row_dict["stage"] = "Bound"
                elif outcome == "lost":
                    row_dict["stage"] = "Lost"
                elif status == "quoted":
                    row_dict["stage"] = "Quoted"
                else:
                    row_dict["stage"] = "Received"

                comparables.append(row_dict)

            return comparables


@app.get("/api/submissions/{submission_id}/comparables/metrics")
def get_comparables_metrics(submission_id: str):
    """Get aggregate metrics for comparables."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get current submission's revenue
            cur.execute(
                "SELECT annual_revenue FROM submissions WHERE id = %s",
                (submission_id,)
            )
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Submission not found")

            current_revenue = float(current.get("annual_revenue") or 0)
            min_rev = current_revenue * 0.5 if current_revenue > 0 else 0
            max_rev = current_revenue * 1.5 if current_revenue > 0 else float('inf')

            # Get metrics from bound comparables
            cur.execute("""
                SELECT
                    COUNT(*) as total_count,
                    COUNT(*) FILTER (WHERE t.is_bound = true) as bound_count,
                    AVG(
                        CASE WHEN t.is_bound = true AND (t.tower_json->0->>'limit')::numeric > 0
                        THEN COALESCE(t.sold_premium, t.risk_adjusted_premium)::numeric /
                             ((t.tower_json->0->>'limit')::numeric / 1000000)
                        END
                    ) as avg_rpm_bound,
                    AVG(
                        CASE WHEN (t.tower_json->0->>'limit')::numeric > 0
                        THEN COALESCE(t.sold_premium, t.risk_adjusted_premium)::numeric /
                             ((t.tower_json->0->>'limit')::numeric / 1000000)
                        END
                    ) as avg_rpm_all,
                    MIN(
                        CASE WHEN t.is_bound = true AND (t.tower_json->0->>'limit')::numeric > 0
                        THEN COALESCE(t.sold_premium, t.risk_adjusted_premium)::numeric /
                             ((t.tower_json->0->>'limit')::numeric / 1000000)
                        END
                    ) as min_rpm_bound,
                    MAX(
                        CASE WHEN t.is_bound = true AND (t.tower_json->0->>'limit')::numeric > 0
                        THEN COALESCE(t.sold_premium, t.risk_adjusted_premium)::numeric /
                             ((t.tower_json->0->>'limit')::numeric / 1000000)
                        END
                    ) as max_rpm_bound
                FROM submissions s
                JOIN insurance_towers t ON t.submission_id = s.id
                WHERE s.id != %s
                AND s.created_at >= NOW() - INTERVAL '24 months'
                AND (s.annual_revenue IS NULL OR s.annual_revenue BETWEEN %s AND %s)
            """, (submission_id, min_rev, max_rev))

            row = cur.fetchone()
            return {
                "count": row.get("total_count") or 0,
                "bound_count": row.get("bound_count") or 0,
                "avg_rpm_bound": float(row["avg_rpm_bound"]) if row.get("avg_rpm_bound") else None,
                "avg_rpm_all": float(row["avg_rpm_all"]) if row.get("avg_rpm_all") else None,
                "rate_range": [
                    float(row["min_rpm_bound"]) if row.get("min_rpm_bound") else None,
                    float(row["max_rpm_bound"]) if row.get("max_rpm_bound") else None
                ] if row.get("min_rpm_bound") else None
            }


# ─────────────────────────────────────────────────────────────
# Policy Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/submissions/{submission_id}/policy")
def get_policy_data(submission_id: str):
    """Get policy data for a submission including bound option and documents."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get submission info
            cur.execute("""
                SELECT id, applicant_name, effective_date, expiration_date,
                       submission_status, submission_outcome
                FROM submissions
                WHERE id = %s
            """, (submission_id,))
            submission = cur.fetchone()
            if not submission:
                raise HTTPException(status_code=404, detail="Submission not found")

            # Get bound option
            cur.execute("""
                SELECT id, quote_name, tower_json, primary_retention,
                       risk_adjusted_premium, sold_premium, policy_form,
                       is_bound, retroactive_date, coverages, sublimits
                FROM insurance_towers
                WHERE submission_id = %s AND is_bound = true
                LIMIT 1
            """, (submission_id,))
            bound_option = cur.fetchone()

            # Get policy documents from policy_documents table (exclude quote documents)
            cur.execute("""
                SELECT id, document_type, document_number, pdf_url, created_at
                FROM policy_documents
                WHERE submission_id = %s
                AND status != 'void'
                AND document_type NOT IN ('quote_primary', 'quote_excess')
                ORDER BY created_at DESC
            """, (submission_id,))
            documents = cur.fetchall()

            # Subjectivities and endorsements tables may not exist yet
            # Return empty arrays for now - these can be added when tables are created
            subjectivities = []
            endorsements = []

            # Compute effective premium
            base_premium = 0
            if bound_option:
                base_premium = float(bound_option.get("sold_premium") or bound_option.get("risk_adjusted_premium") or 0)

            return {
                "submission": dict(submission) if submission else None,
                "bound_option": dict(bound_option) if bound_option else None,
                "documents": [dict(d) for d in documents] if documents else [],
                "subjectivities": subjectivities,
                "endorsements": endorsements,
                "effective_premium": base_premium,
                "is_issued": any(d.get("document_type") == "policy" for d in (documents or []))
            }


# ─────────────────────────────────────────────────────────────
# Rating / Premium Calculation
# ─────────────────────────────────────────────────────────────

class PremiumRequest(BaseModel):
    limit: int
    retention: int
    hazard_override: Optional[int] = None
    control_adjustment: Optional[float] = 0


@app.post("/api/submissions/{submission_id}/calculate-premium")
def calculate_premium_endpoint(submission_id: str, data: PremiumRequest):
    """Calculate premium for a submission with given parameters."""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from rating_engine.premium_calculator import calculate_premium

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get submission data
            cur.execute("""
                SELECT annual_revenue, naics_primary_title, hazard_override, control_overrides
                FROM submissions
                WHERE id = %s
            """, (submission_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Submission not found")

            revenue = row.get("annual_revenue")
            industry = row.get("naics_primary_title") or "Technology"

            if not revenue:
                return {
                    "error": "No revenue set - add on Account tab",
                    "technical_premium": 0,
                    "risk_adjusted_premium": 0,
                    "rate_per_mil": 0
                }

            # Use request hazard_override if provided, else use submission's stored override
            effective_hazard = data.hazard_override
            if effective_hazard is None:
                effective_hazard = row.get("hazard_override")

            # Parse control adjustment from request or from stored control_overrides
            control_adj = data.control_adjustment or 0
            if control_adj == 0 and row.get("control_overrides"):
                import json
                try:
                    overrides = row["control_overrides"]
                    if isinstance(overrides, str):
                        overrides = json.loads(overrides)
                    control_adj = overrides.get("overall", 0)
                except:
                    pass

            # Calculate premium
            result = calculate_premium(
                revenue=float(revenue),
                limit=data.limit,
                retention=data.retention,
                industry=industry,
                hazard_override=effective_hazard,
                control_adjustment=control_adj,
            )

            # Add rate per million
            if result.get("risk_adjusted_premium") and data.limit > 0:
                result["rate_per_mil"] = result["risk_adjusted_premium"] / (data.limit / 1_000_000)
            else:
                result["rate_per_mil"] = 0

            return result


@app.post("/api/submissions/{submission_id}/calculate-premium-grid")
def calculate_premium_grid(submission_id: str):
    """Calculate premium for multiple limits at once (for the rating grid)."""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from rating_engine.premium_calculator import calculate_premium

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get submission data
            cur.execute("""
                SELECT annual_revenue, naics_primary_title, hazard_override, control_overrides
                FROM submissions
                WHERE id = %s
            """, (submission_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Submission not found")

            revenue = row.get("annual_revenue")
            industry = row.get("naics_primary_title") or "Technology"

            if not revenue:
                return {
                    "error": "No revenue set - add on Account tab",
                    "grid": []
                }

            hazard_override = row.get("hazard_override")
            control_adj = 0
            if row.get("control_overrides"):
                import json
                try:
                    overrides = row["control_overrides"]
                    if isinstance(overrides, str):
                        overrides = json.loads(overrides)
                    control_adj = overrides.get("overall", 0)
                except:
                    pass

            # Calculate for standard limits
            limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000]
            retentions = [25_000, 50_000, 100_000]
            default_retention = 25_000

            grid = []
            for limit in limits:
                result = calculate_premium(
                    revenue=float(revenue),
                    limit=limit,
                    retention=default_retention,
                    industry=industry,
                    hazard_override=hazard_override,
                    control_adjustment=control_adj,
                )
                grid.append({
                    "limit": limit,
                    "retention": default_retention,
                    "technical_premium": result.get("technical_premium", 0),
                    "risk_adjusted_premium": result.get("risk_adjusted_premium", 0),
                    "rate_per_mil": result.get("risk_adjusted_premium", 0) / (limit / 1_000_000) if result.get("risk_adjusted_premium") else 0
                })

            return {
                "grid": grid,
                "hazard_class": grid[0].get("breakdown", {}).get("hazard_class") if grid else None,
                "industry_slug": grid[0].get("breakdown", {}).get("industry_slug") if grid else None
            }


# ─────────────────────────────────────────────────────────────
# Statistics Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/stats/summary")
def get_stats_summary():
    """Get submission status summary counts."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    submission_status,
                    submission_outcome,
                    COUNT(*) as count
                FROM submissions
                GROUP BY submission_status, submission_outcome
            """)
            rows = cur.fetchall()

            # Build summary structure
            summary = {}
            for row in rows:
                status = row["submission_status"] or "unknown"
                outcome = row["submission_outcome"] or "pending"
                count = row["count"]

                if status not in summary:
                    summary[status] = {}
                summary[status][outcome] = count

            # Calculate totals
            received = summary.get("received", {}).get("pending", 0)
            pending_info = summary.get("pending_info", {}).get("pending", 0)

            quoted = summary.get("quoted", {})
            bound = quoted.get("bound", 0)
            lost = quoted.get("lost", 0)
            waiting = quoted.get("waiting_for_response", 0)

            declined = summary.get("declined", {}).get("declined", 0)

            return {
                "total": received + pending_info + bound + lost + waiting + declined,
                "in_progress": received + pending_info,
                "quoted": bound + lost + waiting,
                "declined": declined,
                "breakdown": {
                    "received": received,
                    "pending_info": pending_info,
                    "waiting": waiting,
                    "bound": bound,
                    "lost": lost
                },
                "raw": summary
            }


@app.get("/api/stats/upcoming-renewals")
def get_upcoming_renewals(days: int = 90):
    """Get policies with upcoming renewals."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.expiration_date,
                    (s.expiration_date - CURRENT_DATE) as days_until_expiry,
                    t.sold_premium
                FROM submissions s
                LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = true
                WHERE s.expiration_date IS NOT NULL
                AND s.expiration_date >= CURRENT_DATE
                AND s.expiration_date <= CURRENT_DATE + %s
                AND t.is_bound = true
                ORDER BY s.expiration_date ASC
            """, (days,))
            return cur.fetchall()


@app.get("/api/stats/renewals-not-received")
def get_renewals_not_received():
    """Get renewals that were expected but not received."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.effective_date,
                    s.outcome_reason
                FROM submissions s
                WHERE s.submission_status = 'renewal_not_received'
                OR (s.submission_status = 'renewal_expected'
                    AND s.effective_date < CURRENT_DATE)
                ORDER BY s.effective_date DESC
                LIMIT 50
            """)
            return cur.fetchall()


@app.get("/api/stats/retention-metrics")
def get_retention_metrics():
    """Get renewal retention metrics by month."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Monthly breakdown
            cur.execute("""
                SELECT
                    DATE_TRUNC('month', s.date_received) as month,
                    COUNT(*) FILTER (WHERE s.submission_status NOT IN ('renewal_expected')) as renewals_received,
                    COUNT(*) FILTER (WHERE s.submission_outcome = 'bound') as renewals_bound,
                    COUNT(*) FILTER (WHERE s.submission_outcome = 'lost') as renewals_lost,
                    COUNT(*) FILTER (WHERE s.submission_status = 'renewal_not_received') as renewals_not_received
                FROM submissions s
                WHERE s.renewal_type = 'renewal'
                AND s.date_received IS NOT NULL
                GROUP BY DATE_TRUNC('month', s.date_received)
                ORDER BY month DESC
                LIMIT 12
            """)
            monthly = cur.fetchall()

            # Rate change analysis
            cur.execute("""
                SELECT
                    s.id,
                    s.applicant_name,
                    bound_opt.sold_premium as current_premium,
                    prior_opt.sold_premium as prior_premium
                FROM submissions s
                JOIN insurance_towers bound_opt ON bound_opt.submission_id = s.id AND bound_opt.is_bound = TRUE
                JOIN submissions prior ON prior.id = s.prior_submission_id
                JOIN insurance_towers prior_opt ON prior_opt.submission_id = prior.id AND prior_opt.is_bound = TRUE
                WHERE s.renewal_type = 'renewal'
                AND bound_opt.sold_premium IS NOT NULL
                AND prior_opt.sold_premium IS NOT NULL
                ORDER BY s.date_received DESC
                LIMIT 20
            """)
            rate_changes = cur.fetchall()

            return {
                "monthly": monthly,
                "rate_changes": rate_changes
            }


# ─────────────────────────────────────────────────────────────
# Admin Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/admin/bound-policies")
def get_bound_policies(search: str = None):
    """Get recently bound policies with optional search."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if search:
                cur.execute("""
                    SELECT
                        s.id,
                        s.applicant_name,
                        s.effective_date,
                        s.expiration_date,
                        t.bound_at,
                        t.sold_premium,
                        t.quote_name
                    FROM submissions s
                    JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
                    WHERE LOWER(s.applicant_name) LIKE LOWER(%s)
                    ORDER BY t.bound_at DESC NULLS LAST
                    LIMIT 50
                """, (f"%{search}%",))
            else:
                cur.execute("""
                    SELECT
                        s.id,
                        s.applicant_name,
                        s.effective_date,
                        s.expiration_date,
                        t.bound_at,
                        t.sold_premium,
                        t.quote_name
                    FROM submissions s
                    JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
                    ORDER BY t.bound_at DESC NULLS LAST
                    LIMIT 50
                """)
            return cur.fetchall()


@app.get("/api/admin/pending-subjectivities")
def get_pending_subjectivities():
    """Get policies with pending subjectivities."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    s.id as submission_id,
                    s.applicant_name,
                    ps.id as subjectivity_id,
                    ps.text,
                    ps.status,
                    ps.created_at
                FROM submissions s
                JOIN policy_subjectivities ps ON ps.submission_id = s.id
                WHERE ps.status = 'pending'
                ORDER BY s.applicant_name, ps.created_at
                LIMIT 100
            """)
            rows = cur.fetchall()

            # Group by submission
            grouped = {}
            for row in rows:
                sub_id = str(row["submission_id"])
                if sub_id not in grouped:
                    grouped[sub_id] = {
                        "submission_id": sub_id,
                        "applicant_name": row["applicant_name"],
                        "subjectivities": []
                    }
                grouped[sub_id]["subjectivities"].append({
                    "id": str(row["subjectivity_id"]),
                    "text": row["text"],
                    "status": row["status"],
                    "created_at": row["created_at"]
                })

            return list(grouped.values())


@app.post("/api/admin/subjectivities/{subjectivity_id}/received")
def mark_subjectivity_received(subjectivity_id: str):
    """Mark a subjectivity as received."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE policy_subjectivities
                SET status = 'received',
                    received_at = NOW(),
                    received_by = 'admin'
                WHERE id = %s
                RETURNING id
            """, (subjectivity_id,))
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="Subjectivity not found")
            conn.commit()
            return {"status": "received", "id": subjectivity_id}


@app.post("/api/admin/subjectivities/{subjectivity_id}/waive")
def waive_subjectivity(subjectivity_id: str):
    """Waive a subjectivity."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE policy_subjectivities
                SET status = 'waived',
                    waived_at = NOW(),
                    waived_by = 'admin'
                WHERE id = %s
                RETURNING id
            """, (subjectivity_id,))
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="Subjectivity not found")
            conn.commit()
            return {"status": "waived", "id": subjectivity_id}


@app.get("/api/admin/search-policies")
def search_policies(q: str):
    """Search for policies by name."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    s.id,
                    s.applicant_name,
                    s.effective_date,
                    s.expiration_date,
                    s.submission_status,
                    COALESCE(t.is_bound, false) as is_bound,
                    t.sold_premium
                FROM submissions s
                LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
                WHERE LOWER(s.applicant_name) LIKE LOWER(%s)
                ORDER BY s.created_at DESC
                LIMIT 20
            """, (f"%{q}%",))
            return cur.fetchall()


# ─────────────────────────────────────────────────────────────
# Compliance Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/compliance/stats")
def get_compliance_stats():
    """Get compliance rules statistics."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if table exists first
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'compliance_rules'
                )
            """)
            if not cur.fetchone()["exists"]:
                return {
                    "total": 0,
                    "active": 0,
                    "ofac_count": 0,
                    "nyftz_count": 0,
                    "state_rule_count": 0,
                    "table_exists": False
                }

            cur.execute("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'active') as active,
                    COUNT(*) FILTER (WHERE category = 'ofac') as ofac_count,
                    COUNT(*) FILTER (WHERE category = 'nyftz') as nyftz_count,
                    COUNT(*) FILTER (WHERE category = 'state_rule') as state_rule_count,
                    COUNT(*) FILTER (WHERE category = 'notice_stamping') as notice_stamping_count,
                    COUNT(*) FILTER (WHERE category = 'service_of_suit') as sos_count
                FROM compliance_rules
            """)
            row = cur.fetchone()
            return {
                "total": row["total"] or 0,
                "active": row["active"] or 0,
                "ofac_count": row["ofac_count"] or 0,
                "nyftz_count": row["nyftz_count"] or 0,
                "state_rule_count": (row["state_rule_count"] or 0) + (row["notice_stamping_count"] or 0),
                "sos_count": row["sos_count"] or 0,
                "table_exists": True
            }


@app.get("/api/compliance/rules")
def get_compliance_rules(
    category: str = None,
    state: str = None,
    product: str = None,
    search: str = None,
    status: str = "active"
):
    """Get compliance rules with optional filters."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'compliance_rules'
                )
            """)
            if not cur.fetchone()["exists"]:
                return []

            query = """
                SELECT
                    id, code, title, category, subcategory, rule_type,
                    applies_to_states, applies_to_jurisdictions,
                    applies_to_products, description, requirements, procedures,
                    legal_reference, source_url, requires_endorsement,
                    required_endorsement_code, requires_notice, notice_text,
                    requires_stamping, stamping_office, priority, status
                FROM compliance_rules
                WHERE 1=1
            """
            params = []

            if status:
                query += " AND status = %s"
                params.append(status)

            if category:
                query += " AND category = %s"
                params.append(category)

            if state:
                query += " AND (applies_to_states IS NULL OR %s = ANY(applies_to_states))"
                params.append(state)

            if product:
                query += " AND (applies_to_products IS NULL OR %s = ANY(applies_to_products) OR 'both' = ANY(applies_to_products))"
                params.append(product)

            if search:
                query += " AND (LOWER(code) LIKE LOWER(%s) OR LOWER(title) LIKE LOWER(%s) OR LOWER(description) LIKE LOWER(%s))"
                search_term = f"%{search}%"
                params.extend([search_term, search_term, search_term])

            query += " ORDER BY priority DESC, category, title"

            cur.execute(query, params)
            return cur.fetchall()


@app.get("/api/compliance/rules/{code}")
def get_compliance_rule(code: str):
    """Get a specific compliance rule by code."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id, code, title, category, subcategory, rule_type,
                    applies_to_states, applies_to_jurisdictions,
                    applies_to_products, description, requirements, procedures,
                    legal_reference, source_url, check_config, requires_endorsement,
                    required_endorsement_code, requires_notice, notice_text,
                    requires_stamping, stamping_office, priority, status
                FROM compliance_rules
                WHERE code = %s
            """, (code,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Rule not found")
            return row


# ─────────────────────────────────────────────────────────────
# UW Guide
# ─────────────────────────────────────────────────────────────

@app.get("/api/uw-guide/conflict-rules")
def get_conflict_rules(
    category: str = None,
    severity: str = None,
    source: str = None,
):
    """Get conflict rules with optional filters."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            where_clauses = ["is_active = true"]
            params = []

            if category:
                where_clauses.append("category = %s")
                params.append(category)
            if severity:
                where_clauses.append("severity = %s")
                params.append(severity)
            if source:
                where_clauses.append("source = %s")
                params.append(source)

            where_sql = " AND ".join(where_clauses)

            cur.execute(f"""
                SELECT
                    id, rule_name, category, severity, title, description,
                    detection_pattern, example_bad, example_explanation,
                    times_detected, times_confirmed, times_dismissed,
                    source, is_active, requires_review,
                    created_at, updated_at, last_detected_at
                FROM conflict_rules
                WHERE {where_sql}
                ORDER BY
                    CASE severity
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        ELSE 4
                    END,
                    times_detected DESC,
                    rule_name
            """, params)
            return cur.fetchall()


@app.get("/api/uw-guide/market-news")
def get_market_news(
    search: str = None,
    category: str = None,
    limit: int = 100,
):
    """Get market news articles."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            where_clauses = ["TRUE"]
            params = []

            if search:
                where_clauses.append("(title ILIKE %s OR COALESCE(source,'') ILIKE %s OR COALESCE(summary,'') ILIKE %s)")
                search_term = f"%{search}%"
                params.extend([search_term, search_term, search_term])
            if category and category != "all":
                where_clauses.append("category = %s")
                params.append(category)

            params.append(limit)
            where_sql = " AND ".join(where_clauses)

            cur.execute(f"""
                SELECT id, title, url, source, category, published_at, tags,
                       summary, internal_notes, created_by, created_at, updated_at
                FROM market_news
                WHERE {where_sql}
                ORDER BY COALESCE(published_at, created_at::date) DESC, created_at DESC
                LIMIT %s
            """, params)
            return cur.fetchall()


@app.post("/api/uw-guide/market-news")
def create_market_news(data: dict):
    """Create a new market news article."""
    title = data.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    category = data.get("category", "cyber_insurance")
    if category not in ("cyber_insurance", "cybersecurity"):
        raise HTTPException(status_code=400, detail="Invalid category")

    tags = data.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO market_news (
                    title, url, source, category, published_at, tags, summary, internal_notes, created_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                title,
                data.get("url") or None,
                data.get("source") or None,
                category,
                data.get("published_at") or None,
                json.dumps(tags),
                data.get("summary") or None,
                data.get("internal_notes") or None,
                data.get("created_by") or "api",
            ))
            row = cur.fetchone()
            conn.commit()
            return {"id": str(row["id"]), "message": "Article created"}


@app.delete("/api/uw-guide/market-news/{article_id}")
def delete_market_news(article_id: str):
    """Delete a market news article."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM market_news WHERE id = %s", (article_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Article not found")
            conn.commit()
            return {"message": "Article deleted"}


# ─────────────────────────────────────────────────────────────
# Document Generation
# ─────────────────────────────────────────────────────────────

@app.post("/api/quotes/{quote_id}/generate-document")
def generate_quote_document(quote_id: str):
    """Generate a quote document (PDF) for a quote option."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from core.document_generator import generate_document

        # Get submission_id for this quote
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT submission_id, position FROM insurance_towers WHERE id = %s",
                    (quote_id,)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Quote not found")
                submission_id = row["submission_id"]
                position = row.get("position", "primary")

        # Determine doc type based on position
        doc_type = "quote_excess" if position == "excess" else "quote_primary"

        # Generate the document
        result = generate_document(
            submission_id=str(submission_id),
            quote_option_id=quote_id,
            doc_type=doc_type,
            created_by="api"
        )

        return result

    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Document generation failed: {str(e)}")


@app.post("/api/quotes/{quote_id}/generate-binder")
def generate_binder_document(quote_id: str):
    """Generate a binder document (PDF) for a bound quote."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from core.document_generator import generate_document

        # Get submission_id and check if bound
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT submission_id, is_bound FROM insurance_towers WHERE id = %s",
                    (quote_id,)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Quote not found")
                if not row.get("is_bound"):
                    raise HTTPException(status_code=400, detail="Quote must be bound to generate binder")
                submission_id = row["submission_id"]

        # Generate the binder
        result = generate_document(
            submission_id=str(submission_id),
            quote_option_id=quote_id,
            doc_type="binder",
            created_by="api"
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Binder generation failed: {str(e)}")


@app.post("/api/quotes/{quote_id}/generate-policy")
def generate_policy_document(quote_id: str):
    """Generate a policy document (PDF) for issuance."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from core.document_generator import generate_document

        # Get submission_id and check if bound
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT submission_id, is_bound FROM insurance_towers WHERE id = %s",
                    (quote_id,)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Quote not found")
                if not row.get("is_bound"):
                    raise HTTPException(status_code=400, detail="Quote must be bound to issue policy")
                submission_id = row["submission_id"]

        # Generate the policy
        result = generate_document(
            submission_id=str(submission_id),
            quote_option_id=quote_id,
            doc_type="policy",
            created_by="api"
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Policy generation failed: {str(e)}")


# ─────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
