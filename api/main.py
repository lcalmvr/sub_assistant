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
                SELECT id, quote_name, option_descriptor, tower_json, primary_retention, position,
                       technical_premium, risk_adjusted_premium, sold_premium,
                       policy_form, coverages, is_bound, retroactive_date, created_at
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
                SELECT id, submission_id, quote_name, option_descriptor, tower_json, primary_retention,
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
                SELECT
                    pd.id,
                    pd.document_type,
                    pd.document_number,
                    pd.pdf_url,
                    pd.created_at,
                    t.quote_name
                FROM policy_documents pd
                LEFT JOIN insurance_towers t ON pd.quote_option_id = t.id
                WHERE pd.quote_option_id = %s
                AND pd.document_type IN ('quote_primary', 'quote_excess')
                AND pd.status != 'void'
                ORDER BY pd.created_at DESC
            """, (quote_id,))
            return cur.fetchall()


@app.get("/api/submissions/{submission_id}/latest-document")
def get_latest_quote_document(submission_id: str):
    """Get the most recent quote document for a submission (across all options)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    pd.id,
                    pd.document_type,
                    pd.document_number,
                    pd.pdf_url,
                    pd.created_at,
                    t.quote_name,
                    t.id as quote_option_id
                FROM policy_documents pd
                LEFT JOIN insurance_towers t ON pd.quote_option_id = t.id
                WHERE pd.submission_id = %s
                AND pd.document_type IN ('quote_primary', 'quote_excess')
                AND pd.status != 'void'
                ORDER BY pd.created_at DESC
                LIMIT 1
            """, (submission_id,))
            row = cur.fetchone()
            return row if row else None


@app.get("/api/submissions/{submission_id}/documents")
def get_submission_documents(submission_id: str):
    """Get all quote documents for a submission (across all options)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    pd.id,
                    pd.document_type,
                    pd.document_number,
                    pd.pdf_url,
                    pd.created_at,
                    t.quote_name,
                    t.position,
                    t.id as quote_option_id
                FROM policy_documents pd
                LEFT JOIN insurance_towers t ON pd.quote_option_id = t.id
                WHERE pd.submission_id = %s
                AND pd.document_type IN ('quote_primary', 'quote_excess')
                AND pd.status != 'void'
                ORDER BY pd.created_at DESC
            """, (submission_id,))
            return cur.fetchall()


class QuoteCreate(BaseModel):
    quote_name: str
    primary_retention: Optional[int] = 25000
    policy_form: Optional[str] = "claims_made"
    position: Optional[str] = "primary"
    tower_json: Optional[list] = None
    coverages: Optional[dict] = None
    # Excess quote specific fields
    underlying_carrier: Optional[str] = "Primary Carrier"


class QuoteUpdate(BaseModel):
    quote_name: Optional[str] = None
    option_descriptor: Optional[str] = None
    sold_premium: Optional[int] = None
    retroactive_date: Optional[str] = None
    is_bound: Optional[bool] = None
    primary_retention: Optional[int] = None
    policy_form: Optional[str] = None
    tower_json: Optional[list] = None
    coverages: Optional[dict] = None


@app.post("/api/submissions/{submission_id}/quotes")
def create_quote(submission_id: str, data: QuoteCreate):
    """Create a new quote option (primary or excess)."""
    import json
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify submission exists
            cur.execute("SELECT id FROM submissions WHERE id = %s", (submission_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Submission not found")

    position = data.position or 'primary'
    technical_premium = None
    risk_adjusted_premium = None

    if position == 'excess':
        # Excess quote: Use ILF approach for premium calculation
        from rating_engine.premium_calculator import calculate_premium_for_submission

        # Extract limit and attachment from tower_json
        tower_json = data.tower_json or []
        cmai_layer = next((l for l in tower_json if l.get('carrier') == 'CMAI'), None)

        if cmai_layer:
            our_limit = cmai_layer.get('limit', 1000000)
            our_attachment = cmai_layer.get('attachment', 0)

            # Calculate premium for full tower (underlying + excess)
            total_limit = our_attachment + our_limit
            total_result = calculate_premium_for_submission(
                submission_id, total_limit, data.primary_retention
            )

            if total_result and "error" not in total_result:
                total_risk_adj = total_result.get("risk_adjusted_premium") or 0
                total_technical = total_result.get("technical_premium") or 0

                # Calculate premium for just underlying
                underlying_result = calculate_premium_for_submission(
                    submission_id, our_attachment, data.primary_retention
                )

                if underlying_result and "error" not in underlying_result:
                    underlying_risk_adj = underlying_result.get("risk_adjusted_premium") or 0
                    underlying_technical = underlying_result.get("technical_premium") or 0

                    # Excess premium = full tower - underlying (ILF approach)
                    risk_adjusted_premium = max(0, total_risk_adj - underlying_risk_adj)
                    technical_premium = max(0, total_technical - underlying_technical)

                    # Update CMAI layer premium in tower_json
                    cmai_layer['premium'] = risk_adjusted_premium

            # Build proper excess tower structure if not fully specified
            if our_attachment > 0:
                # Ensure underlying layer exists
                underlying_layer = next(
                    (l for l in tower_json if l.get('carrier') != 'CMAI'),
                    None
                )
                if not underlying_layer:
                    tower_json = [
                        {
                            "carrier": data.underlying_carrier or "Primary Carrier",
                            "limit": our_attachment,
                            "attachment": 0,
                            "retention": data.primary_retention,
                            "premium": None,
                        },
                        cmai_layer
                    ]
    else:
        # Primary quote: Standard premium calculation
        from rating_engine.premium_calculator import calculate_premium_for_submission

        tower_json = data.tower_json or [
            {"carrier": "CMAI", "limit": 1000000, "attachment": 0, "premium": None}
        ]

        cmai_layer = tower_json[0] if tower_json else None
        if cmai_layer:
            limit = cmai_layer.get('limit', 1000000)
            result = calculate_premium_for_submission(
                submission_id, limit, data.primary_retention
            )
            if result and "error" not in result:
                technical_premium = result.get("technical_premium")
                risk_adjusted_premium = result.get("risk_adjusted_premium")
                cmai_layer['premium'] = risk_adjusted_premium

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO insurance_towers (
                    submission_id, quote_name, primary_retention, policy_form,
                    tower_json, coverages, position,
                    technical_premium, risk_adjusted_premium, sold_premium
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, quote_name, created_at
            """, (
                submission_id,
                data.quote_name,
                data.primary_retention,
                data.policy_form,
                json.dumps(tower_json),
                json.dumps(data.coverages or {}),
                position,
                technical_premium,
                risk_adjusted_premium,
                risk_adjusted_premium,  # sold_premium defaults to risk_adjusted
            ))
            row = cur.fetchone()
            conn.commit()
            return {
                "id": row["id"],
                "quote_name": row["quote_name"],
                "created_at": row["created_at"],
                "technical_premium": technical_premium,
                "risk_adjusted_premium": risk_adjusted_premium,
            }


@app.patch("/api/quotes/{quote_id}")
def update_quote(quote_id: str, data: QuoteUpdate):
    """Update a quote option."""
    import json

    # Use exclude_unset to only get fields that were explicitly provided
    # This allows sending null to clear fields like option_descriptor
    updates = {}
    for k, v in data.model_dump(exclude_unset=True).items():
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


@app.delete("/api/quotes/{quote_id}")
def delete_quote(quote_id: str):
    """Delete a quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM insurance_towers WHERE id = %s RETURNING id", (quote_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Quote not found")
            conn.commit()
    return {"status": "deleted"}


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

def get_conn_raw():
    """Get database connection without RealDictCursor (for modules expecting tuples)."""
    from pgvector.psycopg2 import register_vector
    conn = psycopg2.connect(os.environ.get("DATABASE_URL"))
    register_vector(conn)
    return conn


@app.get("/api/submissions/{submission_id}/comparables")
def get_comparables_endpoint(
    submission_id: str,
    layer: str = "primary",
    months: int = 24,
    revenue_tolerance: float = 0.5,
    attachment_min: float = None,
    attachment_max: float = None,
    limit: int = 60
):
    """Get comparable submissions for benchmarking with vector similarity."""
    from core.benchmarking import get_comparables as get_comparables_core

    comparables = get_comparables_core(
        submission_id,
        get_conn_raw,
        similarity_mode="operations",
        revenue_tolerance=revenue_tolerance if revenue_tolerance > 0 else 0,
        same_industry=False,
        stage_filter=None,
        date_window_months=months,
        layer_filter=layer,
        attachment_min=attachment_min,
        attachment_max=attachment_max,
        limit=limit,
    )

    # Transform field names to match frontend expectations
    result = []
    for comp in comparables:
        result.append({
            "id": comp.get("id"),
            "applicant_name": comp.get("applicant_name"),
            "annual_revenue": comp.get("annual_revenue"),
            "naics_primary_title": comp.get("naics_title"),
            "submission_status": comp.get("submission_status"),
            "submission_outcome": comp.get("submission_outcome"),
            "effective_date": comp.get("effective_date"),
            "date_received": comp.get("date_received"),
            "primary_retention": comp.get("retention"),
            "policy_limit": comp.get("limit_amount"),
            "attachment_point": comp.get("attachment_point"),
            "carrier": comp.get("layer_carrier") or comp.get("underlying_carrier"),
            "rate_per_mil": comp.get("rate_per_mil"),
            "similarity_score": comp.get("similarity_score"),
            "controls_similarity": comp.get("controls_similarity"),
            "stage": _format_stage(comp.get("submission_status"), comp.get("submission_outcome")),
            "is_bound": comp.get("is_bound"),
        })
    return result


def _format_stage(status: str | None, outcome: str | None) -> str:
    """Format stage from status/outcome."""
    status = (status or "").lower()
    outcome = (outcome or "").lower()
    if status == "declined":
        return "Declined"
    elif outcome == "bound":
        return "Bound"
    elif outcome == "lost":
        return "Lost"
    elif status == "quoted":
        return "Quoted"
    return "Received"


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

            # Get subjectivities (table may not exist)
            subjectivities = []
            try:
                cur.execute("""
                    SELECT id, text, status
                    FROM subjectivities
                    WHERE submission_id = %s
                    ORDER BY created_at
                """, (submission_id,))
                subjectivities = [dict(row) for row in cur.fetchall()]
            except Exception:
                conn.rollback()  # Reset transaction state

            # Get endorsements (include void for audit trail)
            endorsements = []
            cur.execute("""
                SELECT id, endorsement_number, endorsement_type, effective_date,
                       description, premium_change, status, document_url,
                       formal_title, change_details
                FROM policy_endorsements
                WHERE submission_id = %s
                ORDER BY endorsement_number
            """, (submission_id,))
            endorsements = [dict(row) for row in cur.fetchall()]

            # Compute premium breakdown
            base_premium = 0
            if bound_option:
                base_premium = float(bound_option.get("sold_premium") or bound_option.get("risk_adjusted_premium") or 0)

            # Calculate endorsement totals (only issued, not void)
            endorsement_total = 0
            annual_adjustment = 0  # Adjustments that affect the annual rate (coverage_change)
            for e in endorsements:
                if e.get("status") == "issued":
                    premium_change = float(e.get("premium_change") or 0)
                    endorsement_total += premium_change
                    # Coverage changes affect the annual rate
                    if e.get("endorsement_type") == "coverage_change":
                        # The premium_change is pro-rated, need to annualize it
                        change_details = e.get("change_details") or {}
                        annual_rate = change_details.get("annual_premium_rate", 0)
                        if annual_rate:
                            annual_adjustment += float(annual_rate)

            effective_premium = base_premium + endorsement_total
            # Current annual rate = base + annual adjustments from coverage changes
            current_annual_rate = base_premium + annual_adjustment

            return {
                "submission": dict(submission) if submission else None,
                "bound_option": dict(bound_option) if bound_option else None,
                "documents": [dict(d) for d in documents] if documents else [],
                "subjectivities": subjectivities,
                "endorsements": endorsements,
                "effective_premium": effective_premium,
                "base_premium": base_premium,
                "endorsement_total": endorsement_total,
                "current_annual_rate": current_annual_rate if current_annual_rate != base_premium else None,
                "is_issued": any(d.get("document_type") == "policy" for d in (documents or []))
            }


# Endorsement types for validation
ENDORSEMENT_TYPES = [
    "extension", "name_change", "address_change", "cancellation",
    "reinstatement", "erp", "coverage_change", "bor_change", "other"
]


class EndorsementCreate(BaseModel):
    endorsement_type: str
    effective_date: str  # ISO date string
    description: Optional[str] = None
    change_details: Optional[dict] = None
    premium_change: Optional[float] = 0
    notes: Optional[str] = None


@app.post("/api/submissions/{submission_id}/endorsements")
def create_endorsement_endpoint(submission_id: str, data: EndorsementCreate):
    """Create a new draft endorsement for a submission."""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from core.endorsement_management import create_endorsement, ENDORSEMENT_TYPES as VALID_TYPES
    from datetime import datetime

    if data.endorsement_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid endorsement type: {data.endorsement_type}")

    # Get bound option for the submission
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, sold_premium
                FROM insurance_towers
                WHERE submission_id = %s AND is_bound = true
                LIMIT 1
            """, (submission_id,))
            bound = cur.fetchone()
            if not bound:
                raise HTTPException(status_code=400, detail="No bound policy found")

    tower_id = bound["id"]
    base_premium = float(bound.get("sold_premium") or 0)

    # Parse effective date
    try:
        effective_date = datetime.strptime(data.effective_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Generate description if not provided
    description = data.description
    if not description:
        type_labels = {
            "extension": "Policy Extension",
            "name_change": "Named Insured Change",
            "address_change": "Address Change",
            "cancellation": "Cancellation",
            "reinstatement": "Reinstatement",
            "erp": "Extended Reporting Period",
            "coverage_change": "Coverage Change",
            "bor_change": "Broker of Record Change",
            "other": "Endorsement",
        }
        description = type_labels.get(data.endorsement_type, "Endorsement")
        # Add details to description
        if data.change_details:
            if data.endorsement_type == "name_change" and data.change_details.get("new_name"):
                description = f"Named insured changed to {data.change_details['new_name']}"
            elif data.endorsement_type == "extension" and data.change_details.get("new_expiration_date"):
                description = f"Policy extended to {data.change_details['new_expiration_date']}"

    try:
        endorsement_id = create_endorsement(
            submission_id=submission_id,
            tower_id=tower_id,
            endorsement_type=data.endorsement_type,
            effective_date=effective_date,
            description=description,
            change_details=data.change_details,
            premium_method="flat",
            premium_change=data.premium_change or 0,
            original_annual_premium=base_premium,
            notes=data.notes,
            created_by="user"
        )
        return {"id": endorsement_id, "status": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/endorsements/{endorsement_id}/issue")
def issue_endorsement_endpoint(endorsement_id: str):
    """Issue a draft endorsement."""
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from core.endorsement_management import issue_endorsement

    try:
        issue_endorsement(endorsement_id, issued_by="user")
        return {"status": "issued"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/endorsements/{endorsement_id}/void")
def void_endorsement_endpoint(endorsement_id: str):
    """Void an issued endorsement."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        # Get current status
        cur.execute("SELECT status FROM policy_endorsements WHERE id = %s", (endorsement_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Endorsement not found")

        current_status = row['status']
        if current_status == 'void':
            raise HTTPException(status_code=400, detail="Endorsement is already void")

        # Update status to void
        cur.execute(
            "UPDATE policy_endorsements SET status = 'void' WHERE id = %s",
            (endorsement_id,)
        )
        conn.commit()
        return {"status": "void"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()


@app.delete("/api/endorsements/{endorsement_id}")
def delete_endorsement_endpoint(endorsement_id: str):
    """Delete a draft endorsement."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        # Get current status
        cur.execute("SELECT status FROM policy_endorsements WHERE id = %s", (endorsement_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Endorsement not found")

        current_status = row['status']
        if current_status != 'draft':
            raise HTTPException(status_code=400, detail="Only draft endorsements can be deleted")

        # Delete the endorsement
        cur.execute("DELETE FROM policy_endorsements WHERE id = %s", (endorsement_id,))
        conn.commit()
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()


@app.post("/api/endorsements/{endorsement_id}/reinstate")
def reinstate_endorsement_endpoint(endorsement_id: str):
    """Reinstate a voided endorsement back to issued status."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        # Get current status
        cur.execute("SELECT status FROM policy_endorsements WHERE id = %s", (endorsement_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Endorsement not found")

        current_status = row['status']
        if current_status != 'void':
            raise HTTPException(status_code=400, detail="Only voided endorsements can be reinstated")

        # Update status back to issued
        cur.execute(
            "UPDATE policy_endorsements SET status = 'issued' WHERE id = %s",
            (endorsement_id,)
        )
        conn.commit()
        return {"status": "issued"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()


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
# Brokers (brkr_* schema)
# ─────────────────────────────────────────────────────────────

# Organizations
@app.get("/api/brkr/organizations")
def get_brkr_organizations(search: str = None, org_type: str = None):
    """Get all broker organizations with counts."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT
                    o.org_id, o.name, o.org_type,
                    COUNT(DISTINCT off.office_id) as office_count,
                    COUNT(DISTINCT e.employment_id) as people_count,
                    o.created_at
                FROM brkr_organizations o
                LEFT JOIN brkr_offices off ON o.org_id = off.org_id
                LEFT JOIN brkr_employments e ON o.org_id = e.org_id AND e.active = true
                WHERE 1=1
            """
            params = []
            if search:
                query += " AND LOWER(o.name) LIKE LOWER(%s)"
                params.append(f"%{search}%")
            if org_type:
                query += " AND o.org_type = %s"
                params.append(org_type)
            query += """
                GROUP BY o.org_id, o.name, o.org_type, o.created_at
                ORDER BY o.name
            """
            cur.execute(query, params)
            return cur.fetchall()


@app.post("/api/brkr/organizations")
def create_brkr_organization(data: dict):
    """Create a new organization."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO brkr_organizations (name, org_type)
                VALUES (%s, %s)
                RETURNING org_id
            """, (name, data.get("org_type", "brokerage")))
            row = cur.fetchone()
            conn.commit()
            return {"org_id": str(row["org_id"]), "message": "Organization created"}


@app.patch("/api/brkr/organizations/{org_id}")
def update_brkr_organization(org_id: str, data: dict):
    """Update an organization."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE brkr_organizations
                SET name = COALESCE(%s, name),
                    org_type = COALESCE(%s, org_type),
                    updated_at = now()
                WHERE org_id = %s
            """, (data.get("name"), data.get("org_type"), org_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Organization not found")
            conn.commit()
            return {"message": "Organization updated"}


# Offices
@app.get("/api/brkr/offices")
def get_brkr_offices(org_id: str = None, search: str = None):
    """Get offices, optionally filtered by org."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT
                    off.office_id, off.org_id, off.office_name, off.status,
                    o.name as org_name,
                    addr.line1, addr.city, addr.state, addr.postal_code
                FROM brkr_offices off
                JOIN brkr_organizations o ON off.org_id = o.org_id
                LEFT JOIN brkr_org_addresses addr ON off.default_address_id = addr.address_id
                WHERE 1=1
            """
            params = []
            if org_id:
                query += " AND off.org_id = %s"
                params.append(org_id)
            if search:
                query += " AND (LOWER(off.office_name) LIKE LOWER(%s) OR LOWER(o.name) LIKE LOWER(%s))"
                params.extend([f"%{search}%", f"%{search}%"])
            query += " ORDER BY o.name, off.office_name"
            cur.execute(query, params)
            return cur.fetchall()


@app.post("/api/brkr/offices")
def create_brkr_office(data: dict):
    """Create a new office."""
    org_id = data.get("org_id")
    office_name = data.get("office_name", "").strip()
    if not org_id or not office_name:
        raise HTTPException(status_code=400, detail="org_id and office_name are required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO brkr_offices (org_id, office_name, status)
                VALUES (%s, %s, %s)
                RETURNING office_id
            """, (org_id, office_name, data.get("status", "active")))
            row = cur.fetchone()
            conn.commit()
            return {"office_id": str(row["office_id"]), "message": "Office created"}


@app.patch("/api/brkr/offices/{office_id}")
def update_brkr_office(office_id: str, data: dict):
    """Update an office."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE brkr_offices
                SET office_name = COALESCE(%s, office_name),
                    status = COALESCE(%s, status),
                    updated_at = now()
                WHERE office_id = %s
            """, (data.get("office_name"), data.get("status"), office_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Office not found")
            conn.commit()
            return {"message": "Office updated"}


# People
@app.get("/api/brkr/people")
def get_brkr_people(search: str = None, org_id: str = None):
    """Get people with their active employment info."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT
                    p.person_id, p.first_name, p.last_name,
                    e.employment_id, e.email, e.phone, e.active,
                    o.org_id, o.name as org_name,
                    off.office_id, off.office_name
                FROM brkr_people p
                LEFT JOIN brkr_employments e ON p.person_id = e.person_id AND e.active = true
                LEFT JOIN brkr_organizations o ON e.org_id = o.org_id
                LEFT JOIN brkr_offices off ON e.office_id = off.office_id
                WHERE 1=1
            """
            params = []
            if search:
                query += " AND (LOWER(p.first_name || ' ' || p.last_name) LIKE LOWER(%s) OR LOWER(e.email) LIKE LOWER(%s))"
                params.extend([f"%{search}%", f"%{search}%"])
            if org_id:
                query += " AND e.org_id = %s"
                params.append(org_id)
            query += " ORDER BY p.last_name, p.first_name"
            cur.execute(query, params)
            return cur.fetchall()


@app.post("/api/brkr/people")
def create_brkr_person(data: dict):
    """Create a new person."""
    first_name = data.get("first_name", "").strip()
    last_name = data.get("last_name", "").strip()
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO brkr_people (first_name, last_name)
                VALUES (%s, %s)
                RETURNING person_id
            """, (first_name, last_name))
            row = cur.fetchone()
            conn.commit()
            return {"person_id": str(row["person_id"]), "message": "Person created"}


@app.patch("/api/brkr/people/{person_id}")
def update_brkr_person(person_id: str, data: dict):
    """Update a person."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE brkr_people
                SET first_name = COALESCE(%s, first_name),
                    last_name = COALESCE(%s, last_name),
                    updated_at = now()
                WHERE person_id = %s
            """, (data.get("first_name"), data.get("last_name"), person_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Person not found")
            conn.commit()
            return {"message": "Person updated"}


# Employments
@app.get("/api/brkr/employments")
def get_brkr_employments(org_id: str = None, office_id: str = None, active_only: bool = True):
    """Get employments with full details."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT
                    e.employment_id, e.person_id, e.org_id, e.office_id,
                    e.email, e.phone, e.active,
                    p.first_name, p.last_name,
                    o.name as org_name,
                    off.office_name
                FROM brkr_employments e
                JOIN brkr_people p ON e.person_id = p.person_id
                JOIN brkr_organizations o ON e.org_id = o.org_id
                LEFT JOIN brkr_offices off ON e.office_id = off.office_id
                WHERE 1=1
            """
            params = []
            if active_only:
                query += " AND e.active = true"
            if org_id:
                query += " AND e.org_id = %s"
                params.append(org_id)
            if office_id:
                query += " AND e.office_id = %s"
                params.append(office_id)
            query += " ORDER BY p.last_name, p.first_name"
            cur.execute(query, params)
            return cur.fetchall()


@app.post("/api/brkr/employments")
def create_brkr_employment(data: dict):
    """Create a new employment record."""
    person_id = data.get("person_id")
    org_id = data.get("org_id")
    office_id = data.get("office_id")
    if not person_id or not org_id or not office_id:
        raise HTTPException(status_code=400, detail="person_id, org_id, and office_id are required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Deactivate existing active employments for this person
            cur.execute("""
                UPDATE brkr_employments SET active = false WHERE person_id = %s AND active = true
            """, (person_id,))

            cur.execute("""
                INSERT INTO brkr_employments (person_id, org_id, office_id, email, phone, active)
                VALUES (%s, %s, %s, %s, %s, true)
                RETURNING employment_id
            """, (person_id, org_id, office_id, data.get("email"), data.get("phone")))
            row = cur.fetchone()
            conn.commit()
            return {"employment_id": str(row["employment_id"]), "message": "Employment created"}


@app.patch("/api/brkr/employments/{employment_id}")
def update_brkr_employment(employment_id: str, data: dict):
    """Update an employment record."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE brkr_employments
                SET email = COALESCE(%s, email),
                    phone = COALESCE(%s, phone),
                    active = COALESCE(%s, active),
                    updated_at = now()
                WHERE employment_id = %s
            """, (data.get("email"), data.get("phone"), data.get("active"), employment_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Employment not found")
            conn.commit()
            return {"message": "Employment updated"}


# Teams
@app.get("/api/brkr/teams")
def get_brkr_teams(org_id: str = None, search: str = None):
    """Get teams with member counts."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT
                    t.team_id, t.team_name, t.org_id, t.status, t.description,
                    o.name as org_name,
                    COUNT(DISTINCT tm.person_id) FILTER (WHERE tm.active = true) as member_count
                FROM brkr_teams t
                LEFT JOIN brkr_organizations o ON t.org_id = o.org_id
                LEFT JOIN brkr_team_memberships tm ON t.team_id = tm.team_id
                WHERE 1=1
            """
            params = []
            if org_id:
                query += " AND t.org_id = %s"
                params.append(org_id)
            if search:
                query += " AND LOWER(t.team_name) LIKE LOWER(%s)"
                params.append(f"%{search}%")
            query += " GROUP BY t.team_id, t.team_name, t.org_id, t.status, t.description, o.name ORDER BY t.team_name"
            cur.execute(query, params)
            return cur.fetchall()


@app.post("/api/brkr/teams")
def create_brkr_team(data: dict):
    """Create a new team."""
    team_name = data.get("team_name", "").strip()
    if not team_name:
        raise HTTPException(status_code=400, detail="team_name is required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO brkr_teams (team_name, org_id, status, description)
                VALUES (%s, %s, %s, %s)
                RETURNING team_id
            """, (team_name, data.get("org_id"), data.get("status", "active"), data.get("description")))
            row = cur.fetchone()
            conn.commit()
            return {"team_id": str(row["team_id"]), "message": "Team created"}


@app.get("/api/brkr/teams/{team_id}/members")
def get_brkr_team_members(team_id: str):
    """Get team members."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    tm.team_membership_id, tm.person_id, tm.active, tm.role_label,
                    p.first_name, p.last_name,
                    e.email, e.phone
                FROM brkr_team_memberships tm
                JOIN brkr_people p ON tm.person_id = p.person_id
                LEFT JOIN brkr_employments e ON p.person_id = e.person_id AND e.active = true
                WHERE tm.team_id = %s
                ORDER BY p.last_name, p.first_name
            """, (team_id,))
            return cur.fetchall()


@app.post("/api/brkr/teams/{team_id}/members")
def add_brkr_team_member(team_id: str, data: dict):
    """Add a person to a team."""
    person_id = data.get("person_id")
    if not person_id:
        raise HTTPException(status_code=400, detail="person_id is required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO brkr_team_memberships (team_id, person_id, active, role_label)
                VALUES (%s, %s, true, %s)
                ON CONFLICT (team_id, person_id) DO UPDATE SET active = true, role_label = EXCLUDED.role_label
                RETURNING team_membership_id
            """, (team_id, person_id, data.get("role_label")))
            row = cur.fetchone()
            conn.commit()
            return {"team_membership_id": str(row["team_membership_id"]), "message": "Member added"}


# DBA Names
@app.get("/api/brkr/dbas")
def get_brkr_dbas(org_id: str = None):
    """Get DBA names for organizations."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT d.dba_id, d.org_id, d.name, d.normalized, o.name as org_name
                FROM brkr_dba_names d
                JOIN brkr_organizations o ON d.org_id = o.org_id
                WHERE 1=1
            """
            params = []
            if org_id:
                query += " AND d.org_id = %s"
                params.append(org_id)
            query += " ORDER BY o.name, d.name"
            cur.execute(query, params)
            return cur.fetchall()


@app.post("/api/brkr/dbas")
def create_brkr_dba(data: dict):
    """Create a DBA name for an organization."""
    org_id = data.get("org_id")
    name = data.get("name", "").strip()
    if not org_id or not name:
        raise HTTPException(status_code=400, detail="org_id and name are required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            normalized = name.lower().strip()
            cur.execute("""
                INSERT INTO brkr_dba_names (org_id, name, normalized)
                VALUES (%s, %s, %s)
                RETURNING dba_id
            """, (org_id, name, normalized))
            row = cur.fetchone()
            conn.commit()
            return {"dba_id": str(row["dba_id"]), "message": "DBA created"}


# Addresses
@app.get("/api/brkr/addresses")
def get_brkr_addresses(org_id: str = None):
    """Get addresses for organizations."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT a.address_id, a.org_id, a.line1, a.line2, a.city, a.state,
                       a.postal_code, a.country, o.name as org_name
                FROM brkr_org_addresses a
                JOIN brkr_organizations o ON a.org_id = o.org_id
                WHERE 1=1
            """
            params = []
            if org_id:
                query += " AND a.org_id = %s"
                params.append(org_id)
            query += " ORDER BY o.name, a.city"
            cur.execute(query, params)
            return cur.fetchall()


@app.post("/api/brkr/addresses")
def create_brkr_address(data: dict):
    """Create an address for an organization."""
    org_id = data.get("org_id")
    line1 = data.get("line1", "").strip()
    city = data.get("city", "").strip()
    state = data.get("state", "").strip()
    postal_code = data.get("postal_code", "").strip()
    if not org_id or not line1 or not city or not state or not postal_code:
        raise HTTPException(status_code=400, detail="org_id, line1, city, state, postal_code are required")

    with get_conn() as conn:
        with conn.cursor() as cur:
            normalized = f"{line1} {city} {state} {postal_code}".lower()
            cur.execute("""
                INSERT INTO brkr_org_addresses (org_id, line1, line2, city, state, postal_code, country, normalized)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING address_id
            """, (org_id, line1, data.get("line2"), city, state, postal_code, data.get("country", "US"), normalized))
            row = cur.fetchone()
            conn.commit()
            return {"address_id": str(row["address_id"]), "message": "Address created"}


# ─────────────────────────────────────────────────────────────
# Coverage Catalog
# ─────────────────────────────────────────────────────────────

# Standard normalized tags
COVERAGE_STANDARD_TAGS = [
    "Network Security Liability",
    "Privacy Liability",
    "Privacy Regulatory Defense",
    "Privacy Regulatory Penalties",
    "PCI DSS Assessment",
    "Media Liability",
    "Business Interruption",
    "System Failure (Non-Malicious BI)",
    "Dependent BI - IT Providers",
    "Dependent BI - Non-IT Providers",
    "Cyber Extortion / Ransomware",
    "Data Recovery / Restoration",
    "Reputational Harm",
    "Crisis Management / PR",
    "Technology E&O",
    "Social Engineering",
    "Invoice Manipulation",
    "Funds Transfer Fraud",
    "Telecommunications Fraud",
    "Breach Response / Notification",
    "Forensics",
    "Credit Monitoring",
    "Cryptojacking",
    "Betterment",
    "Bricking",
    "Other",
]


@app.get("/api/coverage-catalog/stats")
def get_coverage_catalog_stats():
    """Get summary statistics for the coverage catalog."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'approved') as approved,
                    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                    COUNT(DISTINCT carrier_name) as carriers,
                    COUNT(DISTINCT coverage_normalized) as unique_tags
                FROM coverage_catalog
            """)
            row = cur.fetchone()
            return {
                "total": row["total"],
                "pending": row["pending"],
                "approved": row["approved"],
                "rejected": row["rejected"],
                "carriers": row["carriers"],
                "unique_tags": row["unique_tags"],
            }


@app.get("/api/coverage-catalog/tags")
def get_coverage_standard_tags():
    """Get the list of standard normalized tags."""
    return COVERAGE_STANDARD_TAGS


@app.get("/api/coverage-catalog/pending")
def get_coverage_pending_reviews():
    """Get all coverage mappings pending review."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM coverage_catalog
                WHERE status = 'pending'
                ORDER BY submitted_at DESC
            """)
            return cur.fetchall()


@app.get("/api/coverage-catalog/carriers")
def get_coverage_carriers():
    """Get list of all carriers in the catalog."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT carrier_name
                FROM coverage_catalog
                ORDER BY carrier_name
            """)
            return [row["carrier_name"] for row in cur.fetchall()]


@app.get("/api/coverage-catalog/carrier/{carrier_name}")
def get_coverage_by_carrier(carrier_name: str, approved_only: bool = False):
    """Get all coverage mappings for a specific carrier."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT * FROM coverage_catalog
                WHERE carrier_name = %s
            """
            params = [carrier_name]
            if approved_only:
                query += " AND status = 'approved'"
            query += " ORDER BY policy_form, coverage_original"
            cur.execute(query, params)
            return cur.fetchall()


@app.get("/api/coverage-catalog/lookup")
def lookup_coverage_mapping(carrier_name: str, coverage_original: str, approved_only: bool = False):
    """Look up a specific coverage mapping."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT * FROM coverage_catalog
                WHERE carrier_name = %s
                AND coverage_original = %s
            """
            params = [carrier_name, coverage_original]
            if approved_only:
                query += " AND status = 'approved'"
            query += " ORDER BY status = 'approved' DESC LIMIT 1"
            cur.execute(query, params)
            row = cur.fetchone()
            return dict(row) if row else None


@app.post("/api/coverage-catalog/{catalog_id}/approve")
def approve_coverage_mapping(catalog_id: str, data: dict = None):
    """Approve a coverage mapping."""
    data = data or {}
    review_notes = data.get("review_notes")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET status = 'approved',
                    reviewed_by = 'api',
                    reviewed_at = now(),
                    review_notes = %s
                WHERE id = %s
            """, (review_notes, catalog_id))
            conn.commit()
            return {"success": cur.rowcount > 0}


@app.post("/api/coverage-catalog/{catalog_id}/reject")
def reject_coverage_mapping(catalog_id: str, data: dict = None):
    """Reject a coverage mapping."""
    data = data or {}
    review_notes = data.get("review_notes")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET status = 'rejected',
                    reviewed_by = 'api',
                    reviewed_at = now(),
                    review_notes = %s
                WHERE id = %s
            """, (review_notes, catalog_id))
            conn.commit()
            return {"success": cur.rowcount > 0}


@app.post("/api/coverage-catalog/{catalog_id}/reset")
def reset_coverage_mapping(catalog_id: str):
    """Reset a coverage mapping back to pending status."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET status = 'pending',
                    reviewed_by = NULL,
                    reviewed_at = NULL,
                    review_notes = NULL
                WHERE id = %s
            """, (catalog_id,))
            conn.commit()
            return {"success": cur.rowcount > 0}


@app.patch("/api/coverage-catalog/{catalog_id}/tags")
def update_coverage_tags(catalog_id: str, data: dict):
    """Update the normalized tags for a coverage mapping."""
    tags = data.get("coverage_normalized", [])
    if isinstance(tags, str):
        tags = [tags] if tags else []
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET coverage_normalized = %s
                WHERE id = %s
            """, (tags, catalog_id))
            conn.commit()
            return {"success": cur.rowcount > 0}


@app.delete("/api/coverage-catalog/{catalog_id}")
def delete_coverage_mapping(catalog_id: str):
    """Delete a coverage mapping from the catalog."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM coverage_catalog WHERE id = %s", (catalog_id,))
            conn.commit()
            return {"success": cur.rowcount > 0}


@app.delete("/api/coverage-catalog/rejected")
def delete_rejected_coverages():
    """Delete all rejected coverage mappings."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM coverage_catalog WHERE status = 'rejected'")
            count = cur.rowcount
            conn.commit()
            return {"deleted": count}


# ─────────────────────────────────────────────────────────────
# Account Dashboard
# ─────────────────────────────────────────────────────────────

@app.get("/api/dashboard/submission-status-counts")
def get_submission_status_counts(days: int = 30):
    """Get submission status counts for the last N days."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT submission_status, COUNT(*)::int
                FROM submissions
                WHERE COALESCE(date_received, created_at) >= (now() - (%s || ' days')::interval)
                GROUP BY submission_status
            """, (days,))
            rows = cur.fetchall()
            return {str(row["submission_status"] or "unknown"): row["count"] for row in rows}


@app.get("/api/dashboard/recent-submissions")
def get_recent_submissions(search: str = None, status: str = None, outcome: str = None, limit: int = 50):
    """Get recent submissions with optional filters."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            where_clauses = ["TRUE"]
            params = [limit]

            if search:
                where_clauses.append("LOWER(s.applicant_name) LIKE LOWER(%s)")
                params.insert(0, f"%{search.strip()}%")
            if status and status != "all":
                where_clauses.append("s.submission_status = %s")
                params.insert(-1, status)
            if outcome and outcome != "all":
                where_clauses.append("s.submission_outcome = %s")
                params.insert(-1, outcome)

            query = f"""
                SELECT
                    s.id,
                    COALESCE(s.date_received, s.created_at)::date AS date_received,
                    s.applicant_name,
                    a.name AS account_name,
                    s.submission_status,
                    s.submission_outcome,
                    s.annual_revenue,
                    s.naics_primary_title
                FROM submissions s
                LEFT JOIN accounts a ON a.id = s.account_id
                WHERE {" AND ".join(where_clauses)}
                ORDER BY COALESCE(s.date_received, s.created_at) DESC
                LIMIT %s
            """
            cur.execute(query, params)
            return cur.fetchall()


@app.get("/api/accounts")
def get_accounts_list(search: str = None, limit: int = 50, offset: int = 0):
    """Get accounts list with optional search."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if search:
                cur.execute("""
                    SELECT id, name, website, industry, naics_title, created_at
                    FROM accounts
                    WHERE LOWER(name) LIKE LOWER(%s)
                       OR LOWER(website) LIKE LOWER(%s)
                    ORDER BY name
                    LIMIT %s OFFSET %s
                """, (f"%{search}%", f"%{search}%", limit, offset))
            else:
                cur.execute("""
                    SELECT id, name, website, industry, naics_title, created_at
                    FROM accounts
                    ORDER BY name
                    LIMIT %s OFFSET %s
                """, (limit, offset))
            return cur.fetchall()


@app.get("/api/accounts/recent")
def get_recent_accounts(limit: int = 10):
    """Get recently active accounts."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    a.id,
                    a.name,
                    a.website,
                    MAX(COALESCE(s.date_received, s.created_at)) AS last_activity,
                    COUNT(s.id)::int AS submission_count
                FROM accounts a
                LEFT JOIN submissions s ON s.account_id = a.id
                GROUP BY a.id, a.name, a.website
                ORDER BY last_activity DESC NULLS LAST, a.updated_at DESC
                LIMIT %s
            """, (limit,))
            return cur.fetchall()


@app.get("/api/accounts/{account_id}")
def get_account_details(account_id: str):
    """Get account details by ID."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, normalized_name, website, industry, naics_code, naics_title, notes,
                       address_street, address_street2, address_city, address_state, address_zip, address_country,
                       created_at, updated_at
                FROM accounts
                WHERE id = %s
            """, (account_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Account not found")
            return dict(row)


@app.get("/api/accounts/{account_id}/written-premium")
def get_account_written_premium(account_id: str):
    """Get total written (bound) premium for an account, including endorsement adjustments."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get bound tower premiums + issued endorsement premium changes
            cur.execute("""
                WITH bound_premium AS (
                    SELECT COALESCE(SUM(COALESCE(t.sold_premium, 0)), 0) AS base_premium
                    FROM submissions s
                    LEFT JOIN insurance_towers t
                      ON t.submission_id = s.id
                     AND t.is_bound = TRUE
                    WHERE s.account_id = %s
                ),
                endorsement_premium AS (
                    SELECT COALESCE(SUM(COALESCE(pe.premium_change, 0)), 0) AS endorsement_total
                    FROM submissions s
                    LEFT JOIN policy_endorsements pe
                      ON pe.submission_id = s.id
                     AND pe.status = 'issued'
                    WHERE s.account_id = %s
                )
                SELECT
                    (SELECT base_premium FROM bound_premium)::float AS base_premium,
                    (SELECT endorsement_total FROM endorsement_premium)::float AS endorsement_total,
                    ((SELECT base_premium FROM bound_premium) + (SELECT endorsement_total FROM endorsement_premium))::float AS total_premium
            """, (account_id, account_id))
            row = cur.fetchone()
            return {
                "written_premium": float(row["total_premium"] or 0),
                "base_premium": float(row["base_premium"] or 0),
                "endorsement_premium": float(row["endorsement_total"] or 0),
            }


@app.get("/api/accounts/{account_id}/submissions")
def get_account_submissions(account_id: str):
    """Get all submissions for an account."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    s.id,
                    COALESCE(s.date_received, s.created_at)::date AS date_received,
                    s.applicant_name,
                    s.submission_status,
                    s.submission_outcome,
                    s.annual_revenue,
                    s.naics_primary_title
                FROM submissions s
                WHERE s.account_id = %s
                ORDER BY COALESCE(s.date_received, s.created_at) DESC
            """, (account_id,))
            return cur.fetchall()


# ─────────────────────────────────────────────────────────────
# Document Library
# ─────────────────────────────────────────────────────────────

DOCUMENT_TYPES = {
    "endorsement": "Endorsement",
    "marketing": "Marketing Material",
    "claims_sheet": "Claims Reporting Sheet",
    "specimen": "Specimen Policy Form",
}

POSITION_OPTIONS = {
    "primary": "Primary Only",
    "excess": "Excess Only",
    "either": "Primary or Excess",
}

STATUS_OPTIONS = {
    "draft": "Draft",
    "active": "Active",
    "archived": "Archived",
}


@app.get("/api/document-library")
def get_document_library_entries(
    document_type: str = None,
    category: str = None,
    position: str = None,
    status: str = None,
    search: str = None,
    include_archived: bool = False
):
    """Get document library entries with optional filters."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            conditions = []
            params = []

            if status and not include_archived:
                conditions.append("status = %s")
                params.append(status)
            elif not include_archived:
                conditions.append("status != 'archived'")

            if document_type:
                conditions.append("document_type = %s")
                params.append(document_type)

            if category:
                conditions.append("category = %s")
                params.append(category)

            if position:
                if position in ("primary", "excess"):
                    conditions.append("(position = %s OR position = 'either')")
                    params.append(position)
                else:
                    conditions.append("position = %s")
                    params.append(position)

            if search:
                conditions.append("""
                    (LOWER(code) LIKE LOWER(%s)
                     OR LOWER(title) LIKE LOWER(%s)
                     OR LOWER(COALESCE(content_plain, '')) LIKE LOWER(%s))
                """)
                search_param = f"%{search}%"
                params.extend([search_param, search_param, search_param])

            where_clause = " AND ".join(conditions) if conditions else "TRUE"

            cur.execute(f"""
                SELECT id, code, title, document_type, category,
                       content_html, position, midterm_only,
                       version, status, default_sort_order,
                       created_at, updated_at,
                       auto_attach_rules, fill_in_mappings
                FROM document_library
                WHERE {where_clause}
                ORDER BY default_sort_order, code
            """, params)

            rows = cur.fetchall()
            return [
                {
                    **dict(row),
                    "document_type_label": DOCUMENT_TYPES.get(row["document_type"], row["document_type"]),
                    "position_label": POSITION_OPTIONS.get(row["position"], row["position"]),
                    "status_label": STATUS_OPTIONS.get(row["status"], row["status"]),
                }
                for row in rows
            ]


@app.get("/api/document-library/categories")
def get_document_library_categories(document_type: str = None):
    """Get distinct categories for filtering."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if document_type:
                cur.execute("""
                    SELECT DISTINCT category
                    FROM document_library
                    WHERE category IS NOT NULL AND document_type = %s
                    ORDER BY category
                """, (document_type,))
            else:
                cur.execute("""
                    SELECT DISTINCT category
                    FROM document_library
                    WHERE category IS NOT NULL
                    ORDER BY category
                """)
            return [row["category"] for row in cur.fetchall()]


@app.get("/api/document-library/{entry_id}")
def get_document_library_entry(entry_id: str):
    """Get a single document library entry."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, code, title, document_type, category,
                       content_html, position, midterm_only,
                       version, version_notes, status, default_sort_order,
                       created_at, updated_at, created_by,
                       auto_attach_rules, fill_in_mappings
                FROM document_library
                WHERE id = %s
            """, (entry_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            return {
                **dict(row),
                "document_type_label": DOCUMENT_TYPES.get(row["document_type"], row["document_type"]),
                "position_label": POSITION_OPTIONS.get(row["position"], row["position"]),
                "status_label": STATUS_OPTIONS.get(row["status"], row["status"]),
            }


@app.post("/api/document-library")
def create_document_library_entry(data: dict):
    """Create a new document library entry."""
    import json
    import re

    code = data.get("code", "").strip()
    title = data.get("title", "").strip()
    document_type = data.get("document_type")

    if not code or not title or not document_type:
        raise HTTPException(status_code=400, detail="code, title, and document_type are required")

    content_html = data.get("content_html")
    content_plain = None
    if content_html:
        # Simple HTML to plain text
        text = re.sub(r'<[^>]+>', ' ', content_html)
        text = re.sub(r'\s+', ' ', text)
        content_plain = text.strip()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO document_library (
                    code, title, document_type, category,
                    content_html, content_plain, position, midterm_only,
                    default_sort_order, status, created_by,
                    auto_attach_rules, fill_in_mappings
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING id
            """, (
                code,
                title,
                document_type,
                data.get("category"),
                content_html,
                content_plain,
                data.get("position", "either"),
                data.get("midterm_only", False),
                data.get("default_sort_order", 100),
                data.get("status", "draft"),
                "api",
                json.dumps(data.get("auto_attach_rules")) if data.get("auto_attach_rules") else None,
                json.dumps(data.get("fill_in_mappings")) if data.get("fill_in_mappings") else None,
            ))
            row = cur.fetchone()
            conn.commit()
            return {"id": str(row["id"]), "message": "Document created"}


@app.patch("/api/document-library/{entry_id}")
def update_document_library_entry(entry_id: str, data: dict):
    """Update a document library entry."""
    import json
    import re

    updates = []
    params = []

    if "code" in data:
        updates.append("code = %s")
        params.append(data["code"])
    if "title" in data:
        updates.append("title = %s")
        params.append(data["title"])
    if "document_type" in data:
        updates.append("document_type = %s")
        params.append(data["document_type"])
    if "category" in data:
        updates.append("category = %s")
        params.append(data["category"] or None)
    if "content_html" in data:
        updates.append("content_html = %s")
        params.append(data["content_html"])
        # Update plain text
        content_plain = None
        if data["content_html"]:
            text = re.sub(r'<[^>]+>', ' ', data["content_html"])
            text = re.sub(r'\s+', ' ', text)
            content_plain = text.strip()
        updates.append("content_plain = %s")
        params.append(content_plain)
    if "position" in data:
        updates.append("position = %s")
        params.append(data["position"])
    if "midterm_only" in data:
        updates.append("midterm_only = %s")
        params.append(data["midterm_only"])
    if "default_sort_order" in data:
        updates.append("default_sort_order = %s")
        params.append(data["default_sort_order"])
    if "status" in data:
        updates.append("status = %s")
        params.append(data["status"])
    if "version_notes" in data:
        updates.append("version_notes = %s")
        params.append(data["version_notes"])

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(entry_id)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE document_library
                SET {", ".join(updates)}, updated_at = now()
                WHERE id = %s
            """, params)
            conn.commit()
            return {"success": cur.rowcount > 0}


@app.post("/api/document-library/{entry_id}/activate")
def activate_document_library_entry(entry_id: str):
    """Activate a document library entry."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE document_library
                SET status = 'active', updated_at = now()
                WHERE id = %s
            """, (entry_id,))
            conn.commit()
            return {"success": cur.rowcount > 0}


@app.post("/api/document-library/{entry_id}/archive")
def archive_document_library_entry(entry_id: str):
    """Archive a document library entry."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE document_library
                SET status = 'archived', updated_at = now()
                WHERE id = %s
            """, (entry_id,))
            conn.commit()
            return {"success": cur.rowcount > 0}


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
# Package Builder
# ─────────────────────────────────────────────────────────────

@app.get("/api/package-documents/{position}")
def get_package_documents(position: str = "primary"):
    """
    Get available documents for package building, grouped by type.
    Returns claims sheets, marketing materials, and specimen forms.
    Endorsements are NOT included here - they come from the quote option.
    """
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from core.document_library import get_entries_for_package, DOCUMENT_TYPES

        # Get active documents for this position, excluding endorsements
        # (endorsements come from the quote option itself)
        all_docs = get_entries_for_package(
            position=position,
            document_types=["claims_sheet", "marketing", "specimen"]
        )

        # Group by document type
        docs_by_type = {}
        for doc in all_docs:
            dtype = doc.get("document_type", "other")
            if dtype not in docs_by_type:
                docs_by_type[dtype] = []
            docs_by_type[dtype].append({
                "id": doc["id"],
                "code": doc["code"],
                "title": doc["title"],
                "category": doc.get("category"),
                "default_sort_order": doc.get("default_sort_order", 100),
                "midterm_only": doc.get("midterm_only", False),
            })

        # Filter document types to only include the ones we're returning
        filtered_types = {k: v for k, v in DOCUMENT_TYPES.items()
                        if k in ["claims_sheet", "marketing", "specimen"]}

        return {
            "position": position,
            "document_types": filtered_types,
            "documents": docs_by_type,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/quotes/{quote_id}/endorsements")
def get_quote_endorsements(quote_id: str):
    """
    Get endorsements attached to a quote option.
    Returns endorsement names and matched library document IDs for rich formatting.
    """
    import json
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT endorsements, position FROM insurance_towers WHERE id = %s",
                (quote_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Quote not found")

            endorsements = row.get("endorsements", [])
            if isinstance(endorsements, str):
                endorsements = json.loads(endorsements)

            position = row.get("position", "primary")

    # Match endorsement names to library documents
    matched_library_ids = []
    if endorsements:
        try:
            from core.document_library import get_library_entries

            # Get all endorsements from library for this position
            library_endorsements = get_library_entries(
                document_type="endorsement",
                position=position,
                status="active"
            )

            # Try to match by title or code (case-insensitive partial match)
            for name in endorsements:
                name_lower = name.lower().strip()
                for lib_doc in library_endorsements:
                    title_lower = lib_doc.get('title', '').lower()
                    code_lower = lib_doc.get('code', '').lower()

                    # Check for matches
                    if (name_lower in title_lower or
                        title_lower in name_lower or
                        name_lower in code_lower or
                        name_lower.replace(' ', '') in title_lower.replace(' ', '')):
                        if lib_doc['id'] not in matched_library_ids:
                            matched_library_ids.append(lib_doc['id'])
                        break
        except Exception:
            pass  # If matching fails, just return names without library IDs

    return {
        "endorsements": endorsements or [],
        "matched_library_ids": matched_library_ids,
    }


class PackageGenerateRequest(BaseModel):
    package_type: str = "quote_only"  # "quote_only" or "full_package"
    selected_documents: list = []  # List of document library IDs
    include_specimen: bool = False  # Include policy specimen form


@app.post("/api/quotes/{quote_id}/generate-package")
def generate_quote_package(quote_id: str, request: PackageGenerateRequest):
    """
    Generate a quote document package with optional library documents.

    package_type: "quote_only" or "full_package"
    selected_documents: List of document library entry IDs to include
    include_specimen: Include policy specimen form (rendered from template)
    """
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from core.package_generator import generate_package
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

        if request.package_type == "full_package" or request.include_specimen:
            # Generate full package with library documents and/or specimen
            result = generate_package(
                submission_id=str(submission_id),
                quote_option_id=quote_id,
                doc_type=doc_type,
                package_type="full_package",
                selected_documents=request.selected_documents,
                created_by="api",
                include_specimen=request.include_specimen
            )
        else:
            # Generate quote only
            result = generate_document(
                submission_id=str(submission_id),
                quote_option_id=quote_id,
                doc_type=doc_type,
                created_by="api"
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Package generation failed: {str(e)}")


# ─────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
