"""
Policy Tab Data Loader

Consolidates all database queries needed for the Policy tab into a single
efficient load operation. This eliminates the 11+ sequential queries that
were making the Policy tab slow.

Usage:
    data = load_policy_tab_data(submission_id)
    # data contains: bound_option, endorsements, documents, broker_info, policy_dates, etc.
"""

from datetime import date
from typing import Optional
from sqlalchemy import text
import json
import os
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn

# Import constants
from core.endorsement_management import ENDORSEMENT_TYPES
from core.document_generator import DOCUMENT_TYPES


def load_policy_tab_data(submission_id: str) -> dict:
    """
    Load all data needed for the Policy tab in a single database round-trip.

    This replaces 11+ separate queries with 1 connection and a few efficient queries.

    Args:
        submission_id: UUID of the submission

    Returns:
        dict with keys:
        - submission: Basic submission data (dates, broker info)
        - bound_option: Bound tower data or None
        - endorsements: List of endorsement dicts
        - documents: List of document dicts
        - broker_employments: List of available broker employments
        - effective_state: Computed policy state (premium, cancellation, etc.)
        - endorsement_catalog: Available endorsement templates
    """
    with get_conn() as conn:
        # Query 1: Get submission basics + bound option in one query
        result = conn.execute(text("""
            SELECT
                s.id,
                s.effective_date,
                s.expiration_date,
                s.broker_email,
                s.broker_employment_id,
                s.broker_org_id,
                s.broker_person_id,
                -- Bound tower data (LEFT JOIN so we get submission even if no bound option)
                t.id as tower_id,
                t.quote_name,
                t.tower_json,
                t.primary_retention,
                t.sublimits,
                t.coverages,
                t.endorsements as tower_endorsements,
                t.policy_form,
                t.position,
                t.technical_premium,
                t.risk_adjusted_premium,
                t.sold_premium,
                t.bound_at,
                t.bound_by,
                t.created_at as tower_created_at
            FROM submissions s
            LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row:
            return {"error": "Submission not found"}

        # Build submission dict
        submission = {
            "id": str(row[0]),
            "effective_date": row[1],
            "expiration_date": row[2],
            "broker_email": row[3],
            "broker_employment_id": row[4],
            "broker_org_id": row[5],
            "broker_person_id": row[6],
        }

        # Build bound_option dict (or None if not bound)
        bound_option = None
        if row[7]:  # tower_id exists
            tower_json = row[9]
            if isinstance(tower_json, str):
                tower_json = json.loads(tower_json)

            sublimits = row[11]
            if isinstance(sublimits, str):
                sublimits = json.loads(sublimits)

            coverages = row[12]
            if isinstance(coverages, str):
                coverages = json.loads(coverages)

            tower_endorsements = row[13]
            if isinstance(tower_endorsements, str):
                tower_endorsements = json.loads(tower_endorsements)

            bound_option = {
                "id": str(row[7]),
                "quote_name": row[8],
                "tower_json": tower_json,
                "primary_retention": row[10],
                "sublimits": sublimits,
                "coverages": coverages,
                "endorsements": tower_endorsements,
                "policy_form": row[14],
                "position": row[15] or "primary",
                "technical_premium": row[16],
                "risk_adjusted_premium": row[17],
                "sold_premium": row[18],
                "bound_at": row[19],
                "bound_by": row[20],
                "created_at": row[21],
            }

        # Query 2: Get all endorsements for this submission
        endorsements_result = conn.execute(text("""
            SELECT
                id, submission_id, tower_id, endorsement_number, endorsement_type,
                effective_date, created_at, issued_at, voided_at, status,
                description, change_details, premium_method, premium_change,
                original_annual_premium, days_remaining, carries_to_renewal,
                created_by, issued_by, voided_by, void_reason, notes,
                catalog_id, formal_title, document_url
            FROM policy_endorsements
            WHERE submission_id = :submission_id
            AND status != 'void'
            ORDER BY endorsement_number
        """), {"submission_id": submission_id})

        endorsements = []
        for erow in endorsements_result.fetchall():
            change_details = erow[11]
            if isinstance(change_details, str):
                change_details = json.loads(change_details)
            elif change_details is None:
                change_details = {}

            endorsements.append({
                "id": str(erow[0]),
                "submission_id": str(erow[1]),
                "tower_id": str(erow[2]) if erow[2] else None,
                "endorsement_number": erow[3],
                "endorsement_type": erow[4],
                "effective_date": erow[5],
                "created_at": erow[6],
                "issued_at": erow[7],
                "voided_at": erow[8],
                "status": erow[9],
                "description": erow[10],
                "change_details": change_details,
                "premium_method": erow[12],
                "premium_change": float(erow[13] or 0),
                "original_annual_premium": float(erow[14] or 0) if erow[14] else None,
                "days_remaining": erow[15],
                "carries_to_renewal": erow[16],
                "created_by": erow[17],
                "issued_by": erow[18],
                "voided_by": erow[19],
                "void_reason": erow[20],
                "notes": erow[21],
                "catalog_id": str(erow[22]) if erow[22] else None,
                "formal_title": erow[23],
                "document_url": erow[24],
                "type_label": ENDORSEMENT_TYPES.get(erow[4], {}).get("label", erow[4]),
            })

        # Query 3: Get all documents for this submission
        docs_result = conn.execute(text("""
            SELECT
                pd.id, pd.document_type, pd.document_number, pd.pdf_url,
                pd.version, pd.status, pd.created_by, pd.created_at,
                pd.document_json->>'display_name' as display_name,
                pd.document_json->>'quote_name' as quote_name
            FROM policy_documents pd
            WHERE pd.submission_id = :submission_id
            ORDER BY pd.created_at DESC
        """), {"submission_id": submission_id})

        documents = []
        for drow in docs_result.fetchall():
            documents.append({
                "id": str(drow[0]),
                "document_type": drow[1],
                "document_number": drow[2],
                "pdf_url": drow[3],
                "version": drow[4],
                "status": drow[5],
                "created_by": drow[6],
                "created_at": drow[7],
                "display_name": drow[8] or "",
                "quote_name": drow[9],
                "type_label": DOCUMENT_TYPES.get(drow[1], {}).get("label", drow[1]),
            })

        # Query 4: Get broker employments (cached check for brkr tables already done)
        broker_employments = []
        try:
            broker_result = conn.execute(text("""
                SELECT e.employment_id, e.email, e.person_id, e.org_id,
                       p.first_name, p.last_name, org.name as org_name,
                       COALESCE(a.line1,'') as line1, COALESCE(a.line2,'') as line2,
                       COALESCE(a.city,'') as city, COALESCE(a.state,'') as state,
                       COALESCE(a.postal_code,'') as postal_code
                FROM brkr_employments e
                JOIN brkr_people p ON p.person_id = e.person_id
                JOIN brkr_organizations org ON org.org_id = e.org_id
                LEFT JOIN brkr_offices off ON off.office_id = e.office_id
                LEFT JOIN brkr_org_addresses a ON a.address_id = COALESCE(e.override_address_id, off.default_address_id)
                WHERE e.email IS NOT NULL AND e.active = TRUE
                ORDER BY lower(p.last_name), lower(p.first_name), lower(org.name)
            """))

            for brow in broker_result.fetchall():
                broker_employments.append({
                    "employment_id": str(brow[0]),
                    "email": brow[1],
                    "person_id": str(brow[2]),
                    "org_id": str(brow[3]),
                    "first_name": brow[4] or "",
                    "last_name": brow[5] or "",
                    "org_name": brow[6] or "",
                    "line1": brow[7],
                    "line2": brow[8],
                    "city": brow[9],
                    "state": brow[10],
                    "postal_code": brow[11],
                })
        except Exception:
            # brkr tables don't exist - that's fine
            pass

        # Query 5: Get endorsement catalog entries for the form
        endorsement_catalog = []
        position = bound_option.get("position", "primary") if bound_option else "primary"
        try:
            catalog_result = conn.execute(text("""
                SELECT id, code, title, endorsement_type, description
                FROM endorsement_catalog
                WHERE status = 'active'
                AND (position IS NULL OR position = :position OR position = 'both')
                ORDER BY code
            """), {"position": position})

            for crow in catalog_result.fetchall():
                endorsement_catalog.append({
                    "id": str(crow[0]),
                    "code": crow[1],
                    "title": crow[2],
                    "endorsement_type": crow[3],
                    "description": crow[4],
                })
        except Exception:
            # endorsement_catalog table might not exist
            pass

        # Compute effective state from the data we already have
        effective_state = _compute_effective_state(bound_option, endorsements, submission)

        return {
            "submission": submission,
            "bound_option": bound_option,
            "has_bound_option": bound_option is not None,
            "endorsements": endorsements,
            "documents": documents,
            "broker_employments": broker_employments,
            "endorsement_catalog": endorsement_catalog,
            "effective_state": effective_state,
        }


def _compute_effective_state(bound_option: Optional[dict], endorsements: list, submission: dict) -> dict:
    """
    Compute the current effective policy state from loaded data.

    This replicates the logic from get_effective_policy_state() but without
    additional database queries.
    """
    if not bound_option:
        return {
            "is_cancelled": False,
            "is_reinstated": False,
            "has_erp": False,
            "is_extended": False,
            "original_expiration": None,
            "effective_expiration": None,
            "base_premium": 0,
            "premium_adjustments": 0,
            "effective_premium": 0,
            "endorsement_count": 0,
            "latest_endorsement_date": None,
            "change_summary": [],
        }

    base_premium = float(bound_option.get("sold_premium") or 0)
    original_expiration = submission.get("expiration_date")

    # Process issued endorsements to compute state
    is_cancelled = False
    is_reinstated = False
    has_erp = False
    is_extended = False
    effective_expiration = original_expiration
    premium_adjustments = 0
    latest_date = None
    change_summary = []
    endorsement_count = 0

    for e in endorsements:
        if e["status"] != "issued":
            continue

        endorsement_count += 1
        etype = e["endorsement_type"]
        eff_date = e["effective_date"]

        if latest_date is None or (eff_date and eff_date > latest_date):
            latest_date = eff_date

        premium_adjustments += e.get("premium_change", 0)
        change_summary.append(e.get("description", ""))

        if etype == "cancellation":
            is_cancelled = True
            is_reinstated = False
        elif etype == "reinstatement":
            is_reinstated = True
            is_cancelled = False
        elif etype == "erp":
            has_erp = True
        elif etype == "extension":
            is_extended = True
            change_details = e.get("change_details", {})
            new_exp = change_details.get("new_expiration_date")
            if new_exp:
                if isinstance(new_exp, str):
                    from datetime import datetime
                    try:
                        effective_expiration = datetime.strptime(new_exp, "%Y-%m-%d").date()
                    except:
                        pass
                else:
                    effective_expiration = new_exp

    return {
        "is_cancelled": is_cancelled,
        "is_reinstated": is_reinstated,
        "has_erp": has_erp,
        "is_extended": is_extended,
        "original_expiration": original_expiration,
        "effective_expiration": effective_expiration,
        "base_premium": base_premium,
        "premium_adjustments": premium_adjustments,
        "effective_premium": base_premium + premium_adjustments,
        "endorsement_count": endorsement_count,
        "latest_endorsement_date": latest_date,
        "change_summary": change_summary,
    }


def get_entries_for_type_from_cache(endorsement_catalog: list, endorsement_type: str) -> list:
    """
    Filter endorsement catalog entries by type.

    Uses pre-loaded catalog data instead of a database query.
    """
    return [e for e in endorsement_catalog if e.get("endorsement_type") == endorsement_type]
