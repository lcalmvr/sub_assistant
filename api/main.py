"""
FastAPI backend for the React frontend.
Exposes the existing database and business logic via REST API.
"""
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Any
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Underwriting Assistant API")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
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
    """List all submissions with bound status and workflow stage."""
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
                    bound.quote_name as bound_quote_name,
                    sw.current_stage as workflow_stage,
                    sw.assigned_uw_name as assigned_to_name
                FROM submissions s
                LEFT JOIN (
                    SELECT DISTINCT ON (submission_id)
                        submission_id, is_bound, quote_name
                    FROM insurance_towers
                    WHERE is_bound = true
                    ORDER BY submission_id, created_at DESC
                ) bound ON s.id = bound.submission_id
                LEFT JOIN submission_workflow sw ON s.id = sw.submission_id
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
                SELECT s.id, s.applicant_name, s.business_summary, s.annual_revenue,
                       s.naics_primary_title, s.naics_primary_code,
                       s.naics_secondary_title, s.naics_secondary_code,
                       s.industry_tags,
                       s.submission_status, s.submission_outcome, s.outcome_reason,
                       s.bullet_point_summary, s.nist_controls_summary,
                       s.hazard_override, s.control_overrides, s.default_retroactive_date,
                       s.ai_recommendation, s.ai_guideline_citations,
                       s.decision_tag, s.decision_reason, s.decided_at, s.decided_by,
                       s.cyber_exposures, s.nist_controls,
                       s.website, s.broker_email, s.broker_employment_id,
                       s.effective_date, s.expiration_date,
                       s.opportunity_notes,
                       s.created_at,
                       e.org_id as broker_org_id,
                       o.name as broker_company,
                       CONCAT(p.first_name, ' ', p.last_name) as broker_name
                FROM submissions s
                LEFT JOIN brkr_employments e ON e.employment_id::text = s.broker_employment_id
                LEFT JOIN brkr_organizations o ON o.org_id = e.org_id
                LEFT JOIN brkr_people p ON p.person_id = e.person_id
                WHERE s.id = %s
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
    broker_employment_id: Optional[str] = None
    # Financial
    annual_revenue: Optional[int] = None
    naics_primary_title: Optional[str] = None
    # Policy dates
    effective_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    expiration_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    # Status fields
    submission_status: Optional[str] = None  # received, pending_info, quoted, declined
    submission_outcome: Optional[str] = None  # pending, bound, lost, waiting_for_response, declined
    outcome_reason: Optional[str] = None  # Required for lost/declined
    # Rating overrides
    hazard_override: Optional[int] = None
    control_overrides: Optional[dict] = None
    default_retroactive_date: Optional[str] = None
    # Decision fields
    decision_tag: Optional[str] = None
    decision_reason: Optional[str] = None
    # AI-generated fields (editable by UW)
    business_summary: Optional[str] = None
    cyber_exposures: Optional[str] = None
    nist_controls_summary: Optional[str] = None
    bullet_point_summary: Optional[str] = None
    # Opportunity/broker request
    opportunity_notes: Optional[str] = None


@app.patch("/api/submissions/{submission_id}")
def update_submission(submission_id: str, data: SubmissionUpdate):
    """Update a submission."""
    from datetime import datetime

    # Use exclude_unset to distinguish "not provided" from "explicitly set to null"
    # Fields that are explicitly set (even to None) will be included
    provided_fields = data.model_dump(exclude_unset=True)
    if not provided_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Build updates - include None values for explicitly provided fields
    updates = provided_fields

    # Auto-set decided_at when decision_tag is provided
    # Note: decided_by is a UUID foreign key, so we skip it for now (no auth)
    if "decision_tag" in updates:
        updates["decided_at"] = datetime.utcnow()

    # Auto-set status_updated_at when status changes
    if "submission_status" in updates or "submission_outcome" in updates:
        updates["status_updated_at"] = datetime.utcnow()

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
# Brokers Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/brokers")
def list_brokers():
    """List all brokers with their primary contact."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    b.id,
                    b.company_name,
                    b.city,
                    b.state,
                    pc.email as primary_email,
                    pc.first_name as primary_first_name,
                    pc.last_name as primary_last_name
                FROM brokers b
                LEFT JOIN broker_contacts pc ON pc.broker_id = b.id AND pc.is_primary = true
                ORDER BY b.company_name
            """)
            return cur.fetchall()


@app.get("/api/broker-contacts")
def list_broker_contacts():
    """List all broker contacts (unique by email) for dropdown selection."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    bc.id,
                    bc.broker_id,
                    bc.email,
                    bc.first_name,
                    bc.last_name,
                    bc.title,
                    b.company_name as broker_company
                FROM broker_contacts bc
                JOIN brokers b ON b.id = bc.broker_id
                ORDER BY b.company_name, bc.last_name, bc.first_name
            """)
            return cur.fetchall()


class BrokerCreate(BaseModel):
    company_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    # Primary contact info
    contact_first_name: str
    contact_last_name: str
    contact_email: str
    contact_title: Optional[str] = None


@app.post("/api/brokers")
def create_broker(data: BrokerCreate):
    """Create a new broker with primary contact."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if email already exists
            cur.execute("""
                SELECT id FROM broker_contacts WHERE email = %s
            """, (data.contact_email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="A contact with this email already exists")

            # Create broker
            cur.execute("""
                INSERT INTO brokers (company_name, city, state)
                VALUES (%s, %s, %s)
                RETURNING id
            """, (data.company_name, data.city, data.state))
            broker_id = cur.fetchone()['id']

            # Create primary contact
            cur.execute("""
                INSERT INTO broker_contacts (broker_id, first_name, last_name, email, title, is_primary)
                VALUES (%s, %s, %s, %s, %s, true)
                RETURNING id
            """, (broker_id, data.contact_first_name, data.contact_last_name,
                  data.contact_email, data.contact_title))
            contact_id = cur.fetchone()['id']

            conn.commit()

            return {
                "broker_id": str(broker_id),
                "contact_id": str(contact_id),
                "message": "Broker created successfully"
            }


class ContactCreate(BaseModel):
    broker_id: str
    first_name: str
    last_name: str
    email: str
    title: Optional[str] = None


@app.post("/api/broker-contacts")
def create_broker_contact(data: ContactCreate):
    """Add a contact to an existing broker."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if email already exists
            cur.execute("""
                SELECT id FROM broker_contacts WHERE email = %s
            """, (data.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="A contact with this email already exists")

            # Check broker exists
            cur.execute("SELECT id FROM brokers WHERE id = %s", (data.broker_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Broker not found")

            # Create contact
            cur.execute("""
                INSERT INTO broker_contacts (broker_id, first_name, last_name, email, title)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (data.broker_id, data.first_name, data.last_name, data.email, data.title))
            contact_id = cur.fetchone()['id']

            conn.commit()

            return {
                "contact_id": str(contact_id),
                "message": "Contact added successfully"
            }


# ─────────────────────────────────────────────────────────────
# Credibility & Conflicts Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/submissions/{submission_id}/credibility")
def get_credibility(submission_id: str):
    """Get credibility score breakdown for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT total_score, label, consistency_score, plausibility_score,
                       completeness_score, issue_count, score_details, calculated_at
                FROM credibility_scores
                WHERE submission_id = %s
            """, (submission_id,))
            row = cur.fetchone()
            if not row:
                # No score calculated yet - return null response
                return {
                    "has_score": False,
                    "total_score": None,
                    "label": None,
                    "dimensions": None,
                }
            return {
                "has_score": True,
                "total_score": float(row["total_score"]) if row["total_score"] else None,
                "label": row["label"],
                "dimensions": {
                    "consistency": float(row["consistency_score"]) if row["consistency_score"] else None,
                    "plausibility": float(row["plausibility_score"]) if row["plausibility_score"] else None,
                    "completeness": float(row["completeness_score"]) if row["completeness_score"] else None,
                },
                "issue_count": row["issue_count"],
                "details": row["score_details"],
                "calculated_at": row["calculated_at"].isoformat() if row["calculated_at"] else None,
            }


@app.get("/api/submissions/{submission_id}/conflicts")
def get_conflicts(submission_id: str):
    """Get list of detected conflicts for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, conflict_type, field_name, priority, status,
                       conflict_details, resolution, reviewed_by, reviewed_at, detected_at
                FROM review_items
                WHERE submission_id = %s
                ORDER BY
                    CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                    detected_at DESC
            """, (submission_id,))
            rows = cur.fetchall()

            # Group by status
            pending = [r for r in rows if r["status"] == "pending"]
            resolved = [r for r in rows if r["status"] != "pending"]

            return {
                "pending_count": len(pending),
                "high_priority_count": len([r for r in pending if r["priority"] == "high"]),
                "pending": [
                    {
                        "id": str(r["id"]),
                        "type": r["conflict_type"],
                        "field": r["field_name"],
                        "priority": r["priority"],
                        "details": r["conflict_details"],
                        "detected_at": r["detected_at"].isoformat() if r["detected_at"] else None,
                    }
                    for r in pending
                ],
                "resolved": [
                    {
                        "id": str(r["id"]),
                        "type": r["conflict_type"],
                        "field": r["field_name"],
                        "status": r["status"],
                        "resolution": r["resolution"],
                        "reviewed_by": r["reviewed_by"],
                        "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None,
                    }
                    for r in resolved
                ],
            }


class ConflictResolution(BaseModel):
    status: str  # approved, rejected, deferred
    notes: Optional[str] = None


@app.post("/api/submissions/{submission_id}/conflicts/{conflict_id}/resolve")
def resolve_conflict(submission_id: str, conflict_id: str, data: ConflictResolution):
    """Resolve a conflict."""
    from datetime import datetime

    if data.status not in ("approved", "rejected", "deferred"):
        raise HTTPException(status_code=400, detail="Invalid status")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE review_items
                SET status = %s,
                    resolution = %s,
                    reviewed_at = %s
                WHERE id = %s AND submission_id = %s
                RETURNING id
            """, (
                data.status,
                {"notes": data.notes} if data.notes else None,
                datetime.utcnow(),
                conflict_id,
                submission_id,
            ))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Conflict not found")
            conn.commit()
    return {"status": "resolved"}


@app.get("/api/submissions/{submission_id}/documents")
def get_submission_documents(submission_id: str):
    """Get list of source documents for a submission with signed URLs."""
    # Import storage module for URL generation
    try:
        from core.storage import get_document_url, is_configured as storage_configured
        use_storage = storage_configured()
    except ImportError:
        use_storage = False

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, filename, document_type, page_count, is_priority, created_at, doc_metadata
                FROM documents
                WHERE submission_id = %s
                ORDER BY is_priority DESC, created_at DESC
            """, (submission_id,))
            rows = cur.fetchall()

            documents = []
            for r in rows:
                # Parse metadata
                metadata = r["doc_metadata"] if isinstance(r["doc_metadata"], dict) else {}

                doc = {
                    "id": str(r["id"]),
                    "filename": r["filename"],
                    "type": r["document_type"],
                    "page_count": r["page_count"],
                    "is_priority": r["is_priority"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "url": None,  # Will be populated if storage is configured
                    # OCR metadata for scanned documents
                    "is_scanned": metadata.get("is_scanned", False),
                    "ocr_confidence": metadata.get("ocr_confidence"),
                    "extraction_strategy": metadata.get("extraction_strategy"),
                }

                # Try storage URL first
                if use_storage:
                    storage_key = metadata.get("storage_key")
                    if storage_key:
                        try:
                            doc["url"] = get_document_url(storage_key, expires_sec=3600)
                        except Exception as e:
                            print(f"[api] Failed to get URL for {r['filename']}: {e}")

                # Fallback to local file URL if no storage URL
                if not doc["url"]:
                    file_path = metadata.get("file_path")
                    if file_path and os.path.exists(file_path):
                        doc["url"] = f"http://localhost:8001/api/documents/{r['id']}/file"

                documents.append(doc)

            return {
                "count": len(documents),
                "documents": documents,
            }


@app.get("/api/documents/{document_id}/file")
def serve_document_file(document_id: str):
    """Serve a local document file by ID."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT filename, doc_metadata
                FROM documents
                WHERE id = %s
            """, (document_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")

            metadata = row["doc_metadata"] if isinstance(row["doc_metadata"], dict) else {}
            file_path = metadata.get("file_path")

            if not file_path or not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="Document file not found on disk")

            # Determine content type
            if file_path.lower().endswith('.pdf'):
                media_type = "application/pdf"
            elif file_path.lower().endswith('.png'):
                media_type = "image/png"
            elif file_path.lower().endswith('.jpg') or file_path.lower().endswith('.jpeg'):
                media_type = "image/jpeg"
            else:
                media_type = "application/octet-stream"

            return FileResponse(file_path, media_type=media_type, filename=row["filename"])


@app.get("/api/documents/{document_id}/bbox")
def get_document_bbox(document_id: str, search_text: Optional[str] = None, page: Optional[int] = None):
    """
    Get Textract bounding box data for a document.

    Used for highlighting extracted fields on the PDF.

    Args:
        document_id: The document ID
        search_text: Optional text to search for (fuzzy match on field_key and field_value)
        page: Optional page number to filter by

    Returns:
        List of {field_key, field_value, page, bbox: {left, top, width, height}}
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            if search_text:
                # Search in both field_key and field_value using ILIKE and trigram
                # If page is specified, prioritize matches on that page
                cur.execute("""
                    SELECT field_key, field_value, page_number, field_type,
                           bbox_left, bbox_top, bbox_width, bbox_height,
                           confidence,
                           GREATEST(
                               COALESCE(similarity(field_value, %s), 0),
                               COALESCE(similarity(field_key, %s), 0)
                           ) as sim,
                           CASE WHEN page_number = %s THEN 1 ELSE 0 END as page_match
                    FROM textract_extractions
                    WHERE document_id = %s
                      AND (
                          field_value ILIKE %s
                          OR field_key ILIKE %s
                          OR similarity(field_value, %s) > 0.2
                          OR similarity(field_key, %s) > 0.2
                      )
                    ORDER BY page_match DESC, sim DESC
                    LIMIT 10
                """, (search_text, search_text, page or 0, document_id,
                      f"%{search_text}%", f"%{search_text}%", search_text, search_text))
            elif page:
                # Return all bbox data for a specific page
                cur.execute("""
                    SELECT field_key, field_value, page_number, field_type,
                           bbox_left, bbox_top, bbox_width, bbox_height,
                           confidence
                    FROM textract_extractions
                    WHERE document_id = %s AND page_number = %s
                    ORDER BY bbox_top
                """, (document_id, page))
            else:
                # Return all bbox data for the document
                cur.execute("""
                    SELECT field_key, field_value, page_number, field_type,
                           bbox_left, bbox_top, bbox_width, bbox_height,
                           confidence
                    FROM textract_extractions
                    WHERE document_id = %s
                    ORDER BY page_number, bbox_top
                """, (document_id,))

            rows = cur.fetchall()

            return {
                "document_id": document_id,
                "count": len(rows),
                "extractions": [
                    {
                        "field_key": r["field_key"],
                        "field_value": r["field_value"],
                        "page": r["page_number"],
                        "type": r["field_type"],
                        "confidence": float(r["confidence"]) if r["confidence"] else None,
                        "bbox": {
                            "left": float(r["bbox_left"]) if r["bbox_left"] else None,
                            "top": float(r["bbox_top"]) if r["bbox_top"] else None,
                            "width": float(r["bbox_width"]) if r["bbox_width"] else None,
                            "height": float(r["bbox_height"]) if r["bbox_height"] else None,
                        }
                    }
                    for r in rows
                ]
            }


@app.get("/api/submissions/{submission_id}/bbox-diagnostics")
def get_bbox_diagnostics(submission_id: str):
    """
    Get diagnostics for bbox linking.

    Returns stats on how many extraction_provenance records have linked bbox
    and samples of unlinked records for debugging.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Total provenance records
            cur.execute("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE textract_extraction_id IS NOT NULL) as linked,
                    COUNT(*) FILTER (WHERE source_text IS NOT NULL) as with_source
                FROM extraction_provenance
                WHERE submission_id = %s
            """, (submission_id,))
            stats = cur.fetchone()

            # Total textract extractions
            cur.execute("""
                SELECT COUNT(*)
                FROM textract_extractions te
                JOIN documents d ON d.id = te.document_id
                WHERE d.submission_id = %s
            """, (submission_id,))
            textract_count = cur.fetchone()["count"]

            # Sample unlinked records
            cur.execute("""
                SELECT field_name, source_text, source_page
                FROM extraction_provenance
                WHERE submission_id = %s
                  AND source_text IS NOT NULL
                  AND textract_extraction_id IS NULL
                LIMIT 10
            """, (submission_id,))
            unlinked = cur.fetchall()

            # Sample linked records with their bbox
            cur.execute("""
                SELECT ep.field_name, te.field_key, te.page_number, te.bbox_top
                FROM extraction_provenance ep
                JOIN textract_extractions te ON te.id = ep.textract_extraction_id
                WHERE ep.submission_id = %s
                LIMIT 10
            """, (submission_id,))
            linked_samples = cur.fetchall()

            link_rate = stats["linked"] / max(stats["with_source"], 1) * 100

            return {
                "submission_id": submission_id,
                "stats": {
                    "total_provenance": stats["total"],
                    "with_source_text": stats["with_source"],
                    "linked_to_bbox": stats["linked"],
                    "link_rate_percent": round(link_rate, 1),
                    "textract_entries": textract_count,
                },
                "unlinked_samples": [
                    {
                        "field": r["field_name"],
                        "source_text": r["source_text"][:80] if r["source_text"] else None,
                        "page": r["source_page"],
                    }
                    for r in unlinked
                ],
                "linked_samples": [
                    {
                        "field": r["field_name"],
                        "matched_key": r["field_key"],
                        "page": r["page_number"],
                        "bbox_y": float(r["bbox_top"]) if r["bbox_top"] else None,
                    }
                    for r in linked_samples
                ],
            }


@app.post("/api/submissions/{submission_id}/relink-bbox")
def relink_bbox(submission_id: str):
    """
    Re-run bbox linking for a submission.

    Clears existing links and re-runs the matching algorithm.
    """
    try:
        from core.extraction_orchestrator import link_provenance_to_textract

        # Clear existing links
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE extraction_provenance
                    SET textract_extraction_id = NULL
                    WHERE submission_id = %s
                """, (submission_id,))
                conn.commit()

        # Re-run linking
        result = link_provenance_to_textract(submission_id)

        return {
            "success": True,
            "linked_count": result.get("linked_count", 0),
            "total_provenance": result.get("total_provenance", 0),
            "total_textract": result.get("total_textract", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/documents/{document_id}/extract-integrated")
def extract_document_integrated(document_id: str):
    """
    Run integrated Textract + Claude extraction with direct bbox linking.

    This is the NEW extraction approach that provides ~100% bbox coverage:
    1. Textract extracts all text lines with bbox
    2. Claude receives lines and references which line each field came from
    3. Provenance is saved with direct textract_extraction_id (no post-hoc matching)

    Returns extraction stats including bbox coverage percentage.
    """
    try:
        from core.extraction_orchestrator import extract_application_integrated

        # Get document info (file_path is in doc_metadata JSON)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, submission_id, doc_metadata
                    FROM documents
                    WHERE id = %s
                """, (document_id,))
                doc = cur.fetchone()

                if not doc:
                    raise HTTPException(status_code=404, detail="Document not found")

        # Extract file_path from metadata
        metadata = doc["doc_metadata"] or {}
        file_path = metadata.get("file_path")
        if not file_path:
            raise HTTPException(status_code=400, detail="Document has no file_path in metadata")

        # Run integrated extraction
        result = extract_application_integrated(
            document_id=str(doc["id"]),
            file_path=file_path,
            submission_id=str(doc["submission_id"]),
        )

        return {
            "document_id": document_id,
            "success": result.get("success", False),
            "lines_extracted": result.get("lines_extracted", 0),
            "fields_extracted": result.get("fields_extracted", 0),
            "fields_with_bbox": result.get("fields_with_bbox", 0),
            "bbox_coverage_percent": round(result.get("bbox_coverage", 0), 1),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/submissions/{submission_id}/documents")
async def upload_submission_document(
    submission_id: str,
    file: UploadFile = File(...),
    document_type: Optional[str] = None,
    run_extraction: bool = True,
):
    """
    Upload a document to an existing submission.

    - Saves file to local storage
    - Classifies document type (or uses provided document_type override)
    - Optionally triggers extraction via the orchestrator

    document_type options: application, policy, loss_run, financial, other
    """
    import tempfile
    import shutil
    from pathlib import Path

    # Verify submission exists
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM submissions WHERE id = %s", (submission_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Submission not found")

    # Save uploaded file
    uploads_dir = Path("uploads") / submission_id
    uploads_dir.mkdir(parents=True, exist_ok=True)

    file_path = uploads_dir / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Get page count for PDFs
    page_count = None
    if file.filename.lower().endswith('.pdf'):
        try:
            import fitz
            doc = fitz.open(str(file_path))
            page_count = len(doc)
            doc.close()
        except Exception:
            pass
    elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
        page_count = 1

    # Classify document type (use override if provided)
    if document_type:
        doc_type = document_type
    else:
        doc_type = "other"
        try:
            from ai.document_classifier import classify_document
            classification = classify_document(str(file_path))
            if classification:
                doc_type = classification.get("document_type", "other")
        except Exception as e:
            print(f"[api] Classification failed for {file.filename}: {e}")
            # Fallback: guess from filename
            fname_lower = file.filename.lower()
            if "app" in fname_lower or "application" in fname_lower:
                doc_type = "application"
            elif "policy" in fname_lower or "dec" in fname_lower:
                doc_type = "policy"
            elif "loss" in fname_lower:
                doc_type = "loss_run"

    # Insert document record
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO documents (submission_id, filename, document_type, page_count, doc_metadata)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (
                submission_id,
                file.filename,
                doc_type,
                page_count,
                json.dumps({"file_path": str(file_path), "ingest_source": "api_upload"})
            ))
            doc_id = str(cur.fetchone()["id"])
            conn.commit()

    result = {
        "id": doc_id,
        "filename": file.filename,
        "document_type": doc_type,
        "page_count": page_count,
        "file_path": str(file_path),
    }

    # Run extraction if requested
    if run_extraction and doc_type in ("application", "policy", "loss_run"):
        try:
            from core.extraction_orchestrator import extract_document
            extraction = extract_document(
                document_id=doc_id,
                file_path=str(file_path),
                doc_type=doc_type,
                submission_id=submission_id,
            )
            result["extraction"] = {
                "status": "completed" if not extraction.errors else "error",
                "strategy": extraction.strategy_used,
                "pages_processed": extraction.pages_extracted,
                "cost": extraction.cost,
                "errors": extraction.errors,
            }
        except Exception as e:
            result["extraction"] = {"status": "error", "error": str(e)}

    # For applications, also run Claude extraction to populate extraction_provenance
    is_application = doc_type.lower() in ("application", "application form", "application_supplemental", "application_acord")
    if run_extraction and is_application and str(file_path).lower().endswith('.pdf'):
        try:
            from ai.application_extractor import extract_from_pdf
            from datetime import datetime

            start_time = datetime.utcnow()
            ai_result = extract_from_pdf(str(file_path))
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            with get_conn() as conn:
                with conn.cursor() as cur:
                    # Save extraction run
                    cur.execute("""
                        INSERT INTO extraction_runs
                        (submission_id, model_used, input_tokens, output_tokens, duration_ms,
                         fields_extracted, high_confidence_count, low_confidence_count, status, completed_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'completed', NOW())
                        RETURNING id
                    """, (
                        submission_id,
                        ai_result.model_used,
                        ai_result.extraction_metadata.get("input_tokens"),
                        ai_result.extraction_metadata.get("output_tokens"),
                        duration_ms,
                        sum(len(fields) for fields in ai_result.data.values()),
                        sum(1 for s in ai_result.data.values() for f in s.values() if f.confidence >= 0.8),
                        sum(1 for s in ai_result.data.values() for f in s.values() if f.confidence < 0.5 and f.is_present),
                    ))

                    # Save provenance records
                    for record in ai_result.to_provenance_records(submission_id):
                        cur.execute("""
                            INSERT INTO extraction_provenance
                            (submission_id, field_name, extracted_value, confidence,
                             source_document_id, source_page, source_text, is_present, model_used)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (submission_id, field_name, source_document_id)
                            DO UPDATE SET
                                extracted_value = EXCLUDED.extracted_value,
                                confidence = EXCLUDED.confidence,
                                source_page = EXCLUDED.source_page,
                                source_text = EXCLUDED.source_text,
                                is_present = EXCLUDED.is_present,
                                model_used = EXCLUDED.model_used,
                                created_at = NOW()
                        """, (
                            record["submission_id"],
                            record["field_name"],
                            json.dumps(record["extracted_value"]) if record["extracted_value"] is not None else None,
                            record["confidence"],
                            doc_id,
                            record["source_page"],
                            record["source_text"],
                            record["is_present"],
                            ai_result.model_used,
                        ))

                    conn.commit()

            result["ai_extraction"] = {
                "status": "completed",
                "fields_extracted": sum(len(fields) for fields in ai_result.data.values()),
                "model": ai_result.model_used,
            }
        except Exception as e:
            print(f"[api] AI extraction failed for {file.filename}: {e}")
            result["ai_extraction"] = {"status": "error", "error": str(e)}

    return result


# ─────────────────────────────────────────────────────────────
# Document Extraction Endpoints
# ─────────────────────────────────────────────────────────────

def _find_nearest_checkbox(checkboxes: list, question_bbox: dict, value: any) -> dict:
    """
    Find the nearest checkbox to a question bbox that matches the expected value.

    For boolean fields where Textract didn't link the checkbox to the question,
    we find the checkbox closest to the question that matches the extracted value.
    """
    if not checkboxes or not question_bbox:
        return None

    page = question_bbox.get("page")
    q_top = question_bbox.get("top", 0)
    q_left = question_bbox.get("left", 0)

    # Determine if we're looking for a selected or unselected checkbox
    is_selected = value is True or value == "True"

    best_match = None
    best_distance = float('inf')

    for cb in checkboxes:
        if cb["page"] != page:
            continue

        # Check if checkbox selection matches the extracted value
        cb_selected = cb["value"] == "True"
        if cb_selected != is_selected:
            continue

        # Calculate distance (prefer checkboxes on same row, slightly to the right)
        cb_top = cb["top"]
        cb_left = cb["left"]

        # Vertical distance matters more than horizontal
        v_dist = abs(cb_top - q_top)
        h_dist = cb_left - q_left  # Positive = to the right of question

        # Only consider checkboxes roughly on the same row (within 5% vertical distance)
        if v_dist > 0.05:
            continue

        # Prefer checkboxes to the right of the question text
        if h_dist < -0.1:  # Skip checkboxes far to the left
            continue

        distance = v_dist * 10 + abs(h_dist)  # Weight vertical more

        if distance < best_distance:
            best_distance = distance
            best_match = {
                "left": cb["left"],
                "top": cb["top"],
                "width": cb["width"],
                "height": cb["height"],
                "page": cb["page"],
            }

    return best_match


@app.get("/api/submissions/{submission_id}/extractions")
def get_extractions(submission_id: str):
    """Get extraction provenance data for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get extraction quality summary
            cur.execute("""
                SELECT
                    COUNT(*) as total_fields,
                    COUNT(*) FILTER (WHERE is_present) as fields_present,
                    COUNT(*) FILTER (WHERE confidence >= 0.8) as high_confidence,
                    COUNT(*) FILTER (WHERE confidence < 0.5 AND is_present) as low_confidence,
                    ROUND(AVG(confidence)::numeric, 2) as avg_confidence
                FROM extraction_provenance
                WHERE submission_id = %s
            """, (submission_id,))
            summary = cur.fetchone()

            # Pre-fetch all raw checkboxes for position-based matching
            cur.execute("""
                SELECT te.page_number, te.field_value, te.bbox_left, te.bbox_top,
                       te.bbox_width, te.bbox_height, te.document_id
                FROM textract_extractions te
                JOIN documents d ON d.id = te.document_id
                WHERE d.submission_id = %s AND te.field_type = 'raw_checkbox'
                ORDER BY te.page_number, te.bbox_top
            """, (submission_id,))
            raw_checkboxes = [
                {"page": r["page_number"], "value": r["field_value"],
                 "left": float(r["bbox_left"]) if r["bbox_left"] else 0,
                 "top": float(r["bbox_top"]) if r["bbox_top"] else 0,
                 "width": float(r["bbox_width"]) if r["bbox_width"] else 0,
                 "height": float(r["bbox_height"]) if r["bbox_height"] else 0,
                 "document_id": str(r["document_id"])}
                for r in cur.fetchall()
            ]

            # Get all extractions with document info and linked bbox (answer + question)
            cur.execute("""
                SELECT
                    ep.id,
                    ep.field_name,
                    ep.extracted_value,
                    ep.confidence,
                    ep.source_text,
                    ep.source_page,
                    ep.source_document_id,
                    ep.is_present,
                    ep.is_accepted,
                    ep.textract_extraction_id,
                    ep.question_textract_id,
                    d.filename as document_name,
                    d.is_priority as is_priority_doc,
                    -- Answer bbox (primary)
                    te.bbox_left as answer_left,
                    te.bbox_top as answer_top,
                    te.bbox_width as answer_width,
                    te.bbox_height as answer_height,
                    te.page_number as answer_page,
                    -- Question bbox (secondary)
                    qte.bbox_left as question_left,
                    qte.bbox_top as question_top,
                    qte.bbox_width as question_width,
                    qte.bbox_height as question_height,
                    qte.page_number as question_page
                FROM extraction_provenance ep
                LEFT JOIN documents d ON d.id = ep.source_document_id
                LEFT JOIN textract_extractions te ON te.id = ep.textract_extraction_id
                LEFT JOIN textract_extractions qte ON qte.id = ep.question_textract_id
                WHERE ep.submission_id = %s
                ORDER BY ep.field_name, d.is_priority DESC NULLS LAST, ep.confidence DESC
            """, (submission_id,))
            rows = cur.fetchall()

            # Group by section and field, tracking conflicts
            sections = {}
            field_values = {}  # Track all values per field for conflict detection

            for row in rows:
                parts = row["field_name"].split(".", 1)
                section = parts[0] if len(parts) > 1 else "other"
                field = parts[1] if len(parts) > 1 else parts[0]
                full_field = row["field_name"]

                # Track all values for this field
                if full_field not in field_values:
                    field_values[full_field] = []

                # Build answer bbox (where the answer is)
                answer_bbox = None
                if row.get("answer_left") is not None:
                    answer_bbox = {
                        "left": float(row["answer_left"]),
                        "top": float(row["answer_top"]),
                        "width": float(row["answer_width"]),
                        "height": float(row["answer_height"]),
                        "page": row["answer_page"] or row["source_page"],
                    }

                # Build question bbox (where the question is)
                question_bbox = None
                if row.get("question_left") is not None:
                    question_bbox = {
                        "left": float(row["question_left"]),
                        "top": float(row["question_top"]),
                        "width": float(row["question_width"]),
                        "height": float(row["question_height"]),
                        "page": row["question_page"] or row["source_page"],
                    }

                # For boolean fields where answer_bbox equals question_bbox (or is missing),
                # try to find a nearby checkbox using position-based matching
                value = row["extracted_value"]
                is_boolean = value in [True, False, "True", "False", None]

                if is_boolean and question_bbox:
                    # Check if answer is missing or same as question
                    needs_checkbox_lookup = (
                        answer_bbox is None or
                        (answer_bbox and question_bbox and
                         abs(answer_bbox["top"] - question_bbox["top"]) < 0.02 and
                         abs(answer_bbox["left"] - question_bbox["left"]) < 0.02)
                    )
                    if needs_checkbox_lookup and value is not None:
                        # Find nearest checkbox that matches the expected selection state
                        nearby_cb = _find_nearest_checkbox(raw_checkboxes, question_bbox, value)
                        if nearby_cb:
                            answer_bbox = nearby_cb

                # Primary bbox: answer if available, otherwise question (backward compat)
                bbox = answer_bbox or question_bbox

                field_values[full_field].append({
                    "id": str(row["id"]),
                    "value": row["extracted_value"],
                    "confidence": float(row["confidence"]) if row["confidence"] else None,
                    "source_text": row["source_text"],
                    "page": row["source_page"],
                    "document_id": str(row["source_document_id"]) if row["source_document_id"] else None,
                    "document_name": row["document_name"],
                    "is_priority_doc": row["is_priority_doc"],
                    "is_accepted": row["is_accepted"],
                    "is_present": row["is_present"],
                    "bbox": bbox,  # Primary (for backward compat)
                    "answer_bbox": answer_bbox,  # Answer location
                    "question_bbox": question_bbox,  # Question location
                })

            # Build sections with primary value and conflicts
            for full_field, values in field_values.items():
                parts = full_field.split(".", 1)
                section = parts[0] if len(parts) > 1 else "other"
                field = parts[1] if len(parts) > 1 else parts[0]

                if section not in sections:
                    sections[section] = {}

                # Filter to present values only
                present_values = [v for v in values if v["is_present"]]
                if not present_values:
                    continue

                # Primary value: accepted one, or from priority doc, or highest confidence
                primary = next((v for v in present_values if v["is_accepted"]), None)
                if not primary:
                    primary = present_values[0]  # Already sorted by priority, confidence

                # Check for conflicts (different values from different documents)
                unique_values = set()
                for v in present_values:
                    val_str = json.dumps(v["value"]) if v["value"] is not None else "null"
                    unique_values.add(val_str)

                has_conflict = len(unique_values) > 1

                sections[section][field] = {
                    "value": primary["value"],
                    "confidence": primary["confidence"],
                    "source_text": primary["source_text"],
                    "page": primary["page"],
                    "document_id": primary["document_id"],
                    "document_name": primary["document_name"],
                    "is_present": primary["is_present"],
                    "has_conflict": has_conflict,
                    "all_values": present_values if has_conflict else None,
                    "bbox": primary.get("bbox"),  # Primary bbox (backward compat)
                    "answer_bbox": primary.get("answer_bbox"),  # Answer location
                    "question_bbox": primary.get("question_bbox"),  # Question location
                }

            # Count conflicts
            conflict_count = sum(
                1 for sec in sections.values()
                for f in sec.values()
                if f.get("has_conflict")
            )

            # Load active schema to identify unmapped fields
            cur.execute("""
                SELECT schema_definition FROM extraction_schemas WHERE is_active = true LIMIT 1
            """)
            schema_row = cur.fetchone()
            schema_def = schema_row["schema_definition"] if schema_row else {}

            # Build set of valid schema field paths
            schema_fields = set()
            schema_sections = set()
            for section_key, section_data in schema_def.items():
                schema_sections.add(section_key)
                if isinstance(section_data, dict) and "fields" in section_data:
                    for field_key in section_data["fields"]:
                        schema_fields.add(f"{section_key}.{field_key}")

            # Mark sections and fields as in_schema or not
            unmapped_sections = {}
            mapped_sections = {}

            for section_name, fields in sections.items():
                is_schema_section = section_name in schema_sections

                # Check each field
                mapped_fields = {}
                unmapped_fields = {}

                for field_name, field_data in fields.items():
                    full_path = f"{section_name}.{field_name}"
                    if full_path in schema_fields:
                        field_data["in_schema"] = True
                        mapped_fields[field_name] = field_data
                    else:
                        field_data["in_schema"] = False
                        unmapped_fields[field_name] = field_data

                if mapped_fields:
                    mapped_sections[section_name] = mapped_fields
                if unmapped_fields:
                    if "_unmapped" not in unmapped_sections:
                        unmapped_sections["_unmapped"] = {}
                    for fname, fdata in unmapped_fields.items():
                        # Store with original section prefix for clarity
                        unmapped_sections["_unmapped"][f"{section_name}.{fname}"] = fdata

            # Merge mapped sections with unmapped section at the end
            final_sections = mapped_sections
            if unmapped_sections.get("_unmapped"):
                final_sections["_unmapped"] = unmapped_sections["_unmapped"]

            return {
                "has_extractions": len(rows) > 0,
                "summary": {
                    "total_fields": summary["total_fields"] if summary else 0,
                    "fields_present": summary["fields_present"] if summary else 0,
                    "high_confidence": summary["high_confidence"] if summary else 0,
                    "low_confidence": summary["low_confidence"] if summary else 0,
                    "avg_confidence": float(summary["avg_confidence"]) if summary and summary["avg_confidence"] else None,
                    "conflict_count": conflict_count,
                    "unmapped_count": len(unmapped_sections.get("_unmapped", {})),
                },
                "sections": final_sections,
            }


@app.post("/api/submissions/{submission_id}/extract")
def trigger_extraction(submission_id: str, document_id: Optional[str] = None):
    """
    Trigger native document extraction for a submission.

    If document_id is provided, extract from that specific document.
    Otherwise, extract from the primary document.
    """
    from datetime import datetime
    import os
    import tempfile

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Find the document to extract from
            if document_id:
                cur.execute("""
                    SELECT id, filename, doc_metadata
                    FROM documents
                    WHERE id = %s AND submission_id = %s
                """, (document_id, submission_id))
            else:
                # Get the primary document (is_priority=true) or most recent
                cur.execute("""
                    SELECT id, filename, doc_metadata
                    FROM documents
                    WHERE submission_id = %s
                    ORDER BY is_priority DESC, created_at DESC
                    LIMIT 1
                """, (submission_id,))

            doc = cur.fetchone()
            if not doc:
                raise HTTPException(status_code=404, detail="No document found for extraction")

            # Determine file path from metadata
            metadata = doc.get("doc_metadata") or {}
            file_path = metadata.get("file_path") or metadata.get("storage_key")
            if not file_path or not os.path.exists(file_path):
                raise HTTPException(
                    status_code=400,
                    detail="Document file not found on disk. Re-upload the document."
                )

            # Run extraction
            try:
                from ai.application_extractor import extract_from_pdf

                start_time = datetime.utcnow()
                result = extract_from_pdf(file_path)
                duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

                # Save extraction run
                cur.execute("""
                    INSERT INTO extraction_runs
                    (submission_id, model_used, input_tokens, output_tokens, duration_ms,
                     fields_extracted, high_confidence_count, low_confidence_count, status, completed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'completed', NOW())
                    RETURNING id
                """, (
                    submission_id,
                    result.model_used,
                    result.extraction_metadata.get("input_tokens"),
                    result.extraction_metadata.get("output_tokens"),
                    duration_ms,
                    sum(len(fields) for fields in result.data.values()),
                    sum(1 for s in result.data.values() for f in s.values() if f.confidence >= 0.8),
                    sum(1 for s in result.data.values() for f in s.values() if f.confidence < 0.5 and f.is_present),
                ))
                run_id = cur.fetchone()["id"]

                # Save provenance records (one per field per document)
                for record in result.to_provenance_records(submission_id):
                    cur.execute("""
                        INSERT INTO extraction_provenance
                        (submission_id, field_name, extracted_value, confidence,
                         source_document_id, source_page, source_text, is_present, model_used)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (submission_id, field_name, source_document_id)
                        DO UPDATE SET
                            extracted_value = EXCLUDED.extracted_value,
                            confidence = EXCLUDED.confidence,
                            source_page = EXCLUDED.source_page,
                            source_text = EXCLUDED.source_text,
                            is_present = EXCLUDED.is_present,
                            model_used = EXCLUDED.model_used,
                            created_at = NOW()
                    """, (
                        record["submission_id"],
                        record["field_name"],
                        json.dumps(record["extracted_value"]) if record["extracted_value"] is not None else None,
                        record["confidence"],
                        str(doc["id"]),
                        record["source_page"],
                        record["source_text"],
                        record["is_present"],
                        result.model_used,
                    ))

                conn.commit()

                # Return summary
                docupipe_format = result.to_docupipe_format()
                return {
                    "status": "success",
                    "run_id": str(run_id),
                    "document_id": str(doc["id"]),
                    "filename": doc["filename"],
                    "pages": result.page_count,
                    "model": result.model_used,
                    "duration_ms": duration_ms,
                    "fields_extracted": sum(len(fields) for fields in result.data.values()),
                    "high_confidence": sum(1 for s in result.data.values() for f in s.values() if f.confidence >= 0.8),
                    "low_confidence": sum(1 for s in result.data.values() for f in s.values() if f.confidence < 0.5 and f.is_present),
                    "data": docupipe_format["data"],
                }

            except Exception as e:
                # Log failed run
                cur.execute("""
                    INSERT INTO extraction_runs
                    (submission_id, status, error_message)
                    VALUES (%s, 'failed', %s)
                """, (submission_id, str(e)))
                conn.commit()
                raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@app.post("/api/extractions/{extraction_id}/correct")
def correct_extraction(extraction_id: str, corrected_value: Any, reason: Optional[str] = None):
    """Record a human correction to an extraction."""
    from datetime import datetime

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get original extraction
            cur.execute("""
                SELECT id, extracted_value FROM extraction_provenance WHERE id = %s
            """, (extraction_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Extraction not found")

            # Insert correction record
            cur.execute("""
                INSERT INTO extraction_corrections
                (provenance_id, original_value, corrected_value, correction_reason)
                VALUES (%s, %s, %s, %s)
                RETURNING id
            """, (
                extraction_id,
                row["extracted_value"],
                json.dumps(corrected_value),
                reason,
            ))

            # Update the extraction with corrected value
            cur.execute("""
                UPDATE extraction_provenance
                SET extracted_value = %s, confidence = 1.0
                WHERE id = %s
            """, (json.dumps(corrected_value), extraction_id))

            conn.commit()

            return {"status": "corrected", "extraction_id": extraction_id}


@app.post("/api/extractions/{extraction_id}/accept")
def accept_extraction_value(extraction_id: str):
    """
    Accept this extraction value as the correct one when there's a conflict.
    Marks this value as accepted and clears accepted flag from other values for same field.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get the extraction to find submission_id and field_name
            cur.execute("""
                SELECT submission_id, field_name FROM extraction_provenance WHERE id = %s
            """, (extraction_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Extraction not found")

            submission_id = row["submission_id"]
            field_name = row["field_name"]

            # Clear accepted flag from all other values for this field
            cur.execute("""
                UPDATE extraction_provenance
                SET is_accepted = NULL
                WHERE submission_id = %s AND field_name = %s AND id != %s
            """, (submission_id, field_name, extraction_id))

            # Set this one as accepted
            cur.execute("""
                UPDATE extraction_provenance
                SET is_accepted = TRUE
                WHERE id = %s
            """, (extraction_id,))

            conn.commit()

            return {
                "status": "accepted",
                "extraction_id": extraction_id,
                "field_name": field_name,
            }


@app.post("/api/extractions/{extraction_id}/unaccept")
def unaccept_extraction_value(extraction_id: str):
    """
    Clear the accepted flag from an extraction value.
    Used when undoing a conflict resolution.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Clear accepted flag from this extraction
            cur.execute("""
                UPDATE extraction_provenance
                SET is_accepted = NULL
                WHERE id = %s
                RETURNING field_name
            """, (extraction_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Extraction not found")

            conn.commit()

            return {
                "status": "unaccepted",
                "extraction_id": extraction_id,
                "field_name": row["field_name"],
            }


class TextractRequest(BaseModel):
    document_id: Optional[str] = None


@app.post("/api/submissions/{submission_id}/extract-textract")
def trigger_textract_extraction(submission_id: str, request: TextractRequest = None):
    """
    Trigger Textract extraction with bounding box coordinates for highlighting.

    Returns extraction data with bbox coordinates for each field.
    """
    from datetime import datetime
    import os

    document_id = request.document_id if request else None

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Find the document to extract from
            if document_id:
                cur.execute("""
                    SELECT id, filename, doc_metadata
                    FROM documents
                    WHERE id = %s AND submission_id = %s
                """, (document_id, submission_id))
            else:
                cur.execute("""
                    SELECT id, filename, doc_metadata
                    FROM documents
                    WHERE submission_id = %s
                    ORDER BY is_priority DESC, created_at DESC
                    LIMIT 1
                """, (submission_id,))

            doc = cur.fetchone()
            if not doc:
                raise HTTPException(status_code=404, detail="No document found for extraction")

            # Determine file path from metadata
            metadata = doc.get("doc_metadata") or {}
            file_path = metadata.get("file_path") or metadata.get("storage_key")
            if not file_path or not os.path.exists(file_path):
                raise HTTPException(
                    status_code=400,
                    detail="Document file not found on disk. Re-upload the document."
                )

            # Run Textract extraction
            try:
                from ai.textract_extractor import extract_from_pdf

                start_time = datetime.utcnow()
                result = extract_from_pdf(file_path)
                duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

                return {
                    "status": "success",
                    "document_id": str(doc["id"]),
                    "filename": doc["filename"],
                    "pages": result.pages,
                    "duration_ms": duration_ms,
                    "extraction": result.to_dict(),
                }

            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Textract extraction failed: {str(e)}")


# ─────────────────────────────────────────────────────────────
# Feedback Tracking Endpoints
# ─────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    field_name: str
    original_value: Optional[str] = None
    edited_value: Optional[str] = None
    edit_type: str = "modification"
    edit_reason: Optional[str] = None
    time_to_edit_seconds: Optional[int] = None


@app.post("/api/submissions/{submission_id}/feedback")
def save_feedback(submission_id: str, feedback: FeedbackCreate):
    """Save feedback when an AI-generated field is edited."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO ai_feedback
                (submission_id, field_name, original_value, edited_value,
                 edit_type, edit_reason, time_to_edit_seconds)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                submission_id,
                feedback.field_name,
                feedback.original_value,
                feedback.edited_value,
                feedback.edit_type,
                feedback.edit_reason,
                feedback.time_to_edit_seconds,
            ))
            result = cur.fetchone()
            conn.commit()
            return {"status": "saved", "feedback_id": str(result["id"])}


@app.get("/api/submissions/{submission_id}/feedback")
def get_submission_feedback(submission_id: str):
    """Get all feedback for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, field_name, original_value, edited_value,
                       edit_type, edit_reason, time_to_edit_seconds,
                       edited_by, edited_at
                FROM ai_feedback
                WHERE submission_id = %s
                ORDER BY edited_at DESC
            """, (submission_id,))
            rows = cur.fetchall()
            return {
                "count": len(rows),
                "feedback": [
                    {
                        "id": str(r["id"]),
                        "field_name": r["field_name"],
                        "original_value": r["original_value"],
                        "edited_value": r["edited_value"],
                        "edit_type": r["edit_type"],
                        "edit_reason": r["edit_reason"],
                        "time_to_edit_seconds": r["time_to_edit_seconds"],
                        "edited_by": r["edited_by"],
                        "edited_at": r["edited_at"].isoformat() if r["edited_at"] else None,
                    }
                    for r in rows
                ],
            }


@app.get("/api/submissions/{submission_id}/loss-history")
def get_loss_history(submission_id: str):
    """Get loss history records for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, loss_date, loss_type, loss_description, loss_amount,
                       claim_status, claim_number, carrier_name, policy_period_start,
                       policy_period_end, deductible, reserve_amount, paid_amount,
                       recovery_amount, loss_ratio,
                       uw_notes, expected_total, note_source, note_updated_at, note_updated_by
                FROM loss_history
                WHERE submission_id = %s
                ORDER BY loss_date DESC
            """, (submission_id,))
            rows = cur.fetchall()

            # Calculate summary metrics
            total_paid = sum(float(r["paid_amount"] or 0) for r in rows)
            total_incurred = sum(float(r["loss_amount"] or 0) for r in rows)
            closed_count = sum(1 for r in rows if (r["claim_status"] or "").upper() == "CLOSED")

            return {
                "count": len(rows),
                "summary": {
                    "total_paid": total_paid,
                    "total_incurred": total_incurred,
                    "closed_claims": closed_count,
                    "open_claims": len(rows) - closed_count,
                    "avg_paid": total_paid / len(rows) if rows else 0,
                },
                "claims": [
                    {
                        "id": r["id"],
                        "loss_date": r["loss_date"].isoformat() if r["loss_date"] else None,
                        "loss_type": r["loss_type"],
                        "description": r["loss_description"],
                        "loss_amount": float(r["loss_amount"]) if r["loss_amount"] else None,
                        "status": r["claim_status"],
                        "claim_number": r["claim_number"],
                        "carrier": r["carrier_name"],
                        "policy_period_start": r["policy_period_start"].isoformat() if r["policy_period_start"] else None,
                        "policy_period_end": r["policy_period_end"].isoformat() if r["policy_period_end"] else None,
                        "deductible": float(r["deductible"]) if r["deductible"] else None,
                        "reserve_amount": float(r["reserve_amount"]) if r["reserve_amount"] else None,
                        "paid_amount": float(r["paid_amount"]) if r["paid_amount"] else None,
                        "recovery_amount": float(r["recovery_amount"]) if r["recovery_amount"] else None,
                        # UW notes fields
                        "uw_notes": r["uw_notes"],
                        "expected_total": float(r["expected_total"]) if r["expected_total"] else None,
                        "note_source": r["note_source"],
                        "note_updated_at": r["note_updated_at"].isoformat() if r["note_updated_at"] else None,
                        "note_updated_by": r["note_updated_by"],
                    }
                    for r in rows
                ],
            }


class ClaimNotesUpdate(BaseModel):
    uw_notes: str | None = None
    expected_total: float | None = None
    note_source: str | None = None


@app.patch("/api/claims/{claim_id}/notes")
def update_claim_notes(claim_id: int, notes: ClaimNotesUpdate):
    """Update UW notes on a loss history claim."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE loss_history
                SET uw_notes = %s,
                    expected_total = %s,
                    note_source = %s,
                    note_updated_at = NOW(),
                    note_updated_by = 'underwriter'
                WHERE id = %s
                RETURNING id, uw_notes, expected_total, note_source, note_updated_at
            """, (notes.uw_notes, notes.expected_total, notes.note_source, claim_id))
            result = cur.fetchone()
            conn.commit()

            if not result:
                raise HTTPException(status_code=404, detail="Claim not found")

            return {
                "id": result["id"],
                "uw_notes": result["uw_notes"],
                "expected_total": float(result["expected_total"]) if result["expected_total"] else None,
                "note_source": result["note_source"],
                "note_updated_at": result["note_updated_at"].isoformat() if result["note_updated_at"] else None,
            }


@app.get("/api/feedback/analytics")
def get_feedback_analytics():
    """Get feedback analytics for the dashboard."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Field edit rates (last 30 days)
            cur.execute("""
                SELECT * FROM v_field_edit_rates
            """)
            field_rates = cur.fetchall()

            # AI accuracy estimates
            cur.execute("""
                SELECT * FROM v_ai_accuracy
            """)
            accuracy = cur.fetchall()

            # Daily volume (last 30 days)
            cur.execute("""
                SELECT feedback_date, SUM(edit_count) as total_edits
                FROM v_daily_feedback
                WHERE feedback_date > NOW() - INTERVAL '30 days'
                GROUP BY feedback_date
                ORDER BY feedback_date DESC
            """)
            daily_volume = cur.fetchall()

            # Total stats
            cur.execute("""
                SELECT
                    COUNT(*) as total_feedback,
                    COUNT(DISTINCT submission_id) as submissions_with_feedback,
                    COUNT(DISTINCT field_name) as fields_edited
                FROM ai_feedback
            """)
            totals = cur.fetchone()

            return {
                "totals": {
                    "total_feedback": totals["total_feedback"],
                    "submissions_with_feedback": totals["submissions_with_feedback"],
                    "fields_edited": totals["fields_edited"],
                },
                "field_edit_rates": [
                    {
                        "field_name": r["field_name"],
                        "total_edits": r["total_edits"],
                        "submissions_edited": r["submissions_edited"],
                        "avg_length_change": r["avg_length_change"],
                        "avg_time_to_edit_seconds": r["avg_time_to_edit_seconds"],
                    }
                    for r in field_rates
                ],
                "ai_accuracy": [
                    {
                        "field_name": r["field_name"],
                        "edited_submissions": r["edited_submissions"],
                        "total_submissions": r["total_submissions"],
                        "accuracy_pct": float(r["accuracy_pct"]) if r["accuracy_pct"] else None,
                    }
                    for r in accuracy
                ],
                "daily_volume": [
                    {
                        "date": r["feedback_date"].isoformat(),
                        "edits": r["total_edits"],
                    }
                    for r in daily_volume
                ],
            }


# ─────────────────────────────────────────────────────────────
# Extraction Stats Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/extraction/stats")
def get_extraction_stats(days: int = 30):
    """Get extraction statistics for monitoring and cost tracking."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Overall stats
            cur.execute("""
                SELECT
                    COUNT(*) as total_extractions,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    COALESCE(SUM(pages_processed), 0) as total_pages,
                    COALESCE(SUM(actual_cost), 0) as total_cost,
                    COALESCE(AVG(duration_ms), 0) as avg_duration_ms
                FROM extraction_logs
                WHERE created_at > NOW() - INTERVAL '%s days'
            """ % days)
            overall = cur.fetchone()

            # By strategy
            cur.execute("""
                SELECT
                    strategy,
                    COUNT(*) as extractions,
                    COALESCE(SUM(pages_processed), 0) as pages,
                    COALESCE(SUM(actual_cost), 0) as cost,
                    COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed
                FROM extraction_logs
                WHERE created_at > NOW() - INTERVAL '%s days'
                GROUP BY strategy
                ORDER BY extractions DESC
            """ % days)
            by_strategy = cur.fetchall()

            # Daily breakdown
            cur.execute("""
                SELECT
                    DATE_TRUNC('day', created_at)::date as date,
                    COUNT(*) as extractions,
                    COALESCE(SUM(pages_processed), 0) as pages,
                    COALESCE(SUM(actual_cost), 0) as cost
                FROM extraction_logs
                WHERE created_at > NOW() - INTERVAL '%s days'
                GROUP BY DATE_TRUNC('day', created_at)
                ORDER BY date DESC
            """ % days)
            daily = cur.fetchall()

            # Recent extractions
            cur.execute("""
                SELECT
                    filename,
                    document_type,
                    strategy,
                    pages_processed,
                    actual_cost,
                    duration_ms,
                    status,
                    error_message,
                    created_at
                FROM extraction_logs
                ORDER BY created_at DESC
                LIMIT 20
            """)
            recent = cur.fetchall()

            # Policy form catalog stats
            cur.execute("""
                SELECT
                    COUNT(*) as total_forms,
                    COUNT(*) FILTER (WHERE form_type = 'base_policy') as base_policies,
                    COUNT(*) FILTER (WHERE form_type = 'endorsement') as endorsements,
                    COUNT(DISTINCT carrier) as carriers,
                    COALESCE(SUM(times_referenced), 0) as total_references
                FROM policy_form_catalog
            """)
            catalog = cur.fetchone()

            # Extraction queue
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'processing') as processing,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed
                FROM form_extraction_queue
            """)
            queue = cur.fetchone()

            return {
                "period_days": days,
                "overall": {
                    "total_extractions": overall["total_extractions"],
                    "completed": overall["completed"],
                    "failed": overall["failed"],
                    "total_pages": overall["total_pages"],
                    "total_cost": float(overall["total_cost"]) if overall["total_cost"] else 0,
                    "avg_duration_ms": float(overall["avg_duration_ms"]) if overall["avg_duration_ms"] else 0,
                },
                "by_strategy": [
                    {
                        "strategy": r["strategy"],
                        "extractions": r["extractions"],
                        "pages": r["pages"],
                        "cost": float(r["cost"]) if r["cost"] else 0,
                        "avg_duration_ms": float(r["avg_duration_ms"]) if r["avg_duration_ms"] else 0,
                        "completed": r["completed"],
                        "failed": r["failed"],
                    }
                    for r in by_strategy
                ],
                "daily": [
                    {
                        "date": r["date"].isoformat() if r["date"] else None,
                        "extractions": r["extractions"],
                        "pages": r["pages"],
                        "cost": float(r["cost"]) if r["cost"] else 0,
                    }
                    for r in daily
                ],
                "recent": [
                    {
                        "filename": r["filename"],
                        "document_type": r["document_type"],
                        "strategy": r["strategy"],
                        "pages": r["pages_processed"],
                        "cost": float(r["actual_cost"]) if r["actual_cost"] else 0,
                        "duration_ms": r["duration_ms"],
                        "status": r["status"],
                        "error": r["error_message"],
                        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    }
                    for r in recent
                ],
                "catalog": {
                    "total_forms": catalog["total_forms"],
                    "base_policies": catalog["base_policies"],
                    "endorsements": catalog["endorsements"],
                    "carriers": catalog["carriers"],
                    "total_references": catalog["total_references"],
                },
                "queue": {
                    "pending": queue["pending"],
                    "processing": queue["processing"],
                    "completed": queue["completed"],
                    "failed": queue["failed"],
                },
            }


# ─────────────────────────────────────────────────────────────
# Policy Form Catalog Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/policy-form-catalog")
def get_policy_form_catalog(
    carrier: Optional[str] = None,
    form_type: Optional[str] = None,
    search: Optional[str] = None,
):
    """Get policy form catalog entries with optional filters."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            conditions = ["1=1"]
            params = []

            if carrier:
                conditions.append("carrier ILIKE %s")
                params.append(f"%{carrier}%")

            if form_type:
                conditions.append("form_type = %s")
                params.append(form_type)

            if search:
                conditions.append("(form_number ILIKE %s OR form_name ILIKE %s OR carrier ILIKE %s)")
                params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

            where_clause = " AND ".join(conditions)

            cur.execute(f"""
                SELECT
                    id, form_number, form_name, form_type, carrier,
                    edition_date, page_count, times_referenced,
                    extraction_source, extraction_cost,
                    created_at, updated_at
                FROM policy_form_catalog
                WHERE {where_clause}
                ORDER BY times_referenced DESC, created_at DESC
            """, params)

            forms = cur.fetchall()

            # Get carrier counts for filter
            cur.execute("""
                SELECT carrier, COUNT(*) as count
                FROM policy_form_catalog
                WHERE carrier IS NOT NULL
                GROUP BY carrier
                ORDER BY count DESC
            """)
            carriers = cur.fetchall()

            return {
                "forms": [dict(f) for f in forms],
                "count": len(forms),
                "carriers": [{"name": c["carrier"], "count": c["count"]} for c in carriers],
            }


@app.get("/api/policy-form-catalog/lookup")
def lookup_policy_form(form_number: str, carrier: Optional[str] = None):
    """Look up a policy form by form number and optionally carrier."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if carrier:
                cur.execute("""
                    SELECT
                        id, form_number, form_name, form_type, carrier,
                        edition_date, page_count, times_referenced,
                        coverage_grants, exclusions, definitions,
                        source_document_path, source_document_id,
                        extraction_source, created_at
                    FROM policy_form_catalog
                    WHERE form_number = %s AND carrier ILIKE %s
                    LIMIT 1
                """, (form_number, f"%{carrier}%"))
            else:
                cur.execute("""
                    SELECT
                        id, form_number, form_name, form_type, carrier,
                        edition_date, page_count, times_referenced,
                        coverage_grants, exclusions, definitions,
                        source_document_path, source_document_id,
                        extraction_source, created_at
                    FROM policy_form_catalog
                    WHERE form_number = %s
                    LIMIT 1
                """, (form_number,))
            form = cur.fetchone()
            if not form:
                return None
            return dict(form)


@app.get("/api/policy-form-catalog/{form_id}")
def get_policy_form(form_id: str):
    """Get a single policy form with full details."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id, form_number, form_name, form_type, carrier,
                    edition_date, page_count, times_referenced,
                    coverage_grants, exclusions, definitions, conditions,
                    key_provisions, sublimit_fields,
                    source_document_path, source_document_id,
                    extraction_source, extraction_cost,
                    created_at, updated_at
                FROM policy_form_catalog
                WHERE id = %s
            """, (form_id,))
            form = cur.fetchone()
            if not form:
                raise HTTPException(status_code=404, detail="Form not found")
            return dict(form)


@app.get("/api/policy-form-catalog/{form_id}/document")
def get_policy_form_document(form_id: str):
    """Serve the source document for a policy form."""
    import os as os_module
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT source_document_path FROM policy_form_catalog WHERE id = %s
            """, (form_id,))
            row = cur.fetchone()
            if not row or not row["source_document_path"]:
                raise HTTPException(status_code=404, detail="Document not found")

            path = row["source_document_path"]
            if not os_module.path.exists(path):
                raise HTTPException(status_code=404, detail="Document file not found")

            return FileResponse(path, media_type="application/pdf", filename=os_module.path.basename(path))


@app.get("/api/policy-form-catalog/queue")
def get_form_extraction_queue(status: Optional[str] = None):
    """Get form extraction queue entries."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if status:
                cur.execute("""
                    SELECT q.*, d.filename as source_filename
                    FROM form_extraction_queue q
                    LEFT JOIN documents d ON d.id = q.source_document_id
                    WHERE q.status = %s
                    ORDER BY q.created_at DESC
                """, (status,))
            else:
                cur.execute("""
                    SELECT q.*, d.filename as source_filename
                    FROM form_extraction_queue q
                    LEFT JOIN documents d ON d.id = q.source_document_id
                    ORDER BY q.created_at DESC
                    LIMIT 50
                """)

            return [dict(row) for row in cur.fetchall()]


@app.post("/api/policy-form-catalog/{form_id}/resync-coverages")
def resync_form_coverages_endpoint(form_id: str):
    """Re-sync coverages from a cataloged form with AI normalization."""
    from core.policy_catalog import resync_form_coverages

    try:
        count = resync_form_coverages(form_id)
        return {"success": True, "coverages_synced": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
                       policy_form, coverages, sublimits, endorsements, subjectivities,
                       is_bound, retroactive_date, retro_schedule, retro_notes, created_at
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
                       policy_form, coverages, sublimits, endorsements, subjectivities,
                       is_bound, retroactive_date, retro_schedule, retro_notes, created_at
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


@app.get("/api/submissions/{submission_id}/policy-documents")
def get_submission_policy_documents(submission_id: str):
    """Get all generated quote/binder documents for a submission."""
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
    retro_schedule: Optional[list] = None  # Per-coverage retro dates
    retro_notes: Optional[str] = None  # Free-text retro notes
    is_bound: Optional[bool] = None
    primary_retention: Optional[int] = None
    policy_form: Optional[str] = None
    tower_json: Optional[list] = None
    coverages: Optional[dict] = None
    sublimits: Optional[list] = None  # Excess quote coverage schedule
    endorsements: Optional[list] = None  # Endorsement names/titles
    subjectivities: Optional[list] = None  # Subjectivity strings


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
    retro_schedule_raw = None
    for k, v in data.model_dump(exclude_unset=True).items():
        # Convert dict/list to JSON string for JSONB columns
        if k in ('tower_json', 'coverages', 'sublimits', 'endorsements', 'subjectivities', 'retro_schedule') and v is not None:
            if k == 'retro_schedule':
                retro_schedule_raw = v  # Keep raw for checking
            updates[k] = json.dumps(v)
        else:
            updates[k] = v

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
    values = list(updates.values()) + [quote_id]

    prior_acts_attached = False
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE insurance_towers SET {set_clause}, updated_at = NOW() WHERE id = %s RETURNING id, position, submission_id",
                values
            )
            result = cur.fetchone()
            if result is None:
                raise HTTPException(status_code=404, detail="Quote not found")

            # Auto-attach Prior Acts Endorsement for excess with restricted retro
            if retro_schedule_raw and result.get('position') == 'excess':
                needs_prior_acts = any(
                    entry.get('retro') not in ('full_prior_acts', 'follow_form')
                    for entry in retro_schedule_raw
                    if entry.get('retro')
                )
                if needs_prior_acts:
                    # Get PA-001 endorsement ID
                    cur.execute("""
                        SELECT id FROM document_library
                        WHERE code = 'PA-001' AND status = 'active'
                    """)
                    pa_row = cur.fetchone()
                    if pa_row:
                        # Check if already attached
                        cur.execute("""
                            SELECT 1 FROM quote_endorsements
                            WHERE quote_id = %s AND endorsement_id = %s
                        """, (quote_id, pa_row['id']))
                        if not cur.fetchone():
                            # Auto-attach
                            cur.execute("""
                                INSERT INTO quote_endorsements (quote_id, endorsement_id)
                                VALUES (%s, %s)
                            """, (quote_id, pa_row['id']))
                            prior_acts_attached = True

            conn.commit()

    response = {"status": "updated"}
    if prior_acts_attached:
        response["prior_acts_endorsement_attached"] = True
    return response


class ApplyToAllRequest(BaseModel):
    endorsements: Optional[bool] = False
    subjectivities: Optional[bool] = False
    retro_schedule: Optional[bool] = False


@app.post("/api/quotes/{quote_id}/apply-to-all")
def apply_to_all_quotes(quote_id: str, request: ApplyToAllRequest):
    """
    Apply endorsements, subjectivities, and/or retro_schedule from this quote to all other quotes
    in the same submission. Uses junction table for subjectivities.
    """
    import json

    if not request.endorsements and not request.subjectivities and not request.retro_schedule:
        raise HTTPException(status_code=400, detail="Must specify endorsements, subjectivities, or retro_schedule to apply")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get source quote's data, submission_id, and position
            cur.execute("""
                SELECT submission_id, position, endorsements, retro_schedule, retro_notes
                FROM insurance_towers
                WHERE id = %s
            """, (quote_id,))
            source = cur.fetchone()
            if not source:
                raise HTTPException(status_code=404, detail="Quote not found")

            submission_id = source["submission_id"]
            position = source.get("position") or "primary"
            endorsements = source.get("endorsements") or []
            retro_schedule = source.get("retro_schedule")
            retro_notes = source.get("retro_notes")

            # Parse JSON if needed
            if isinstance(endorsements, str):
                endorsements = json.loads(endorsements)

            updated_count = 0
            subj_links_created = 0
            retro_updated = 0

            # Handle endorsements - position-aware (only apply to same position)
            if request.endorsements and endorsements:
                cur.execute("""
                    UPDATE insurance_towers
                    SET endorsements = %s, updated_at = NOW()
                    WHERE submission_id = %s AND id != %s
                      AND COALESCE(position, 'primary') = %s
                    RETURNING id
                """, (json.dumps(endorsements), submission_id, quote_id, position))
                updated_count = cur.rowcount

            # Handle retro_schedule - position-aware (only apply to same position)
            if request.retro_schedule:
                cur.execute("""
                    UPDATE insurance_towers
                    SET retro_schedule = %s, retro_notes = %s, updated_at = NOW()
                    WHERE submission_id = %s AND id != %s
                      AND COALESCE(position, 'primary') = %s
                    RETURNING id
                """, (json.dumps(retro_schedule) if retro_schedule else None, retro_notes, submission_id, quote_id, position))
                retro_updated = cur.rowcount
                updated_count = max(updated_count, retro_updated)

            # Handle subjectivities (uses junction table)
            if request.subjectivities:
                # Get all other quote IDs for this submission
                cur.execute("""
                    SELECT id FROM insurance_towers
                    WHERE submission_id = %s AND id != %s
                """, (submission_id, quote_id))
                other_quotes = [row["id"] for row in cur.fetchall()]

                # Copy subjectivity links from source to all other quotes
                for other_quote_id in other_quotes:
                    cur.execute("""
                        INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
                        SELECT %s, subjectivity_id
                        FROM quote_subjectivities
                        WHERE quote_id = %s
                        ON CONFLICT DO NOTHING
                    """, (other_quote_id, quote_id))
                    subj_links_created += cur.rowcount

                updated_count = max(updated_count, len(other_quotes))

            conn.commit()

    return {
        "status": "applied",
        "updated_count": updated_count,
        "endorsements_applied": request.endorsements,
        "subjectivities_applied": request.subjectivities,
        "retro_schedule_applied": request.retro_schedule,
        "subjectivity_links_created": subj_links_created if request.subjectivities else 0,
    }


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
            cur.execute("""
                SELECT submission_id
                FROM insurance_towers WHERE id = %s
            """, (quote_id,))
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

            # Auto-update submission status to quoted/bound
            cur.execute("""
                UPDATE submissions
                SET submission_status = 'quoted',
                    submission_outcome = 'bound',
                    status_updated_at = %s
                WHERE id = %s
            """, (datetime.utcnow(), submission_id))

            # Count linked subjectivities (for informational return)
            cur.execute("""
                SELECT COUNT(*) as count
                FROM quote_subjectivities
                WHERE quote_id = %s
            """, (quote_id,))
            subj_count = cur.fetchone()["count"]

            conn.commit()
            return {
                "status": "bound",
                "quote_id": quote_id,
                "linked_subjectivities": subj_count
            }


@app.post("/api/quotes/{quote_id}/unbind")
def unbind_quote(quote_id: str):
    """Unbind a quote option. Subjectivity status is preserved (tracking is in submission_subjectivities)."""
    from datetime import datetime

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get submission_id
            cur.execute("""
                SELECT submission_id FROM insurance_towers WHERE id = %s
            """, (quote_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Quote not found")

            submission_id = row["submission_id"]

            # Unbind the quote
            cur.execute("""
                UPDATE insurance_towers
                SET is_bound = false, bound_at = NULL
                WHERE id = %s
                RETURNING id
            """, (quote_id,))

            # Auto-update submission outcome to waiting_for_response (keep status as quoted)
            cur.execute("""
                UPDATE submissions
                SET submission_outcome = 'waiting_for_response',
                    status_updated_at = %s
                WHERE id = %s
            """, (datetime.utcnow(), submission_id))

            conn.commit()
            return {
                "status": "unbound",
                "quote_id": quote_id
            }


# ─────────────────────────────────────────────────────────────
# Coverage Extraction Endpoints
# ─────────────────────────────────────────────────────────────

@app.post("/api/extract-coverages")
async def extract_coverages(file: UploadFile = File(...)):
    """
    Extract coverages from an uploaded insurance document (PDF, DOCX).
    Uses AI to parse coverage schedules from primary carrier quotes/binders.
    """
    import tempfile
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # Validate file type
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ['.pdf', '.docx', '.doc']:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        from ai.document_extractor import extract_text_from_document
        from ai.sublimit_intel import parse_coverages_from_document

        # Extract text from document
        document_text = extract_text_from_document(tmp_path)

        if not document_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from document")

        # Parse coverages with AI
        result = parse_coverages_from_document(document_text)

        return result

    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependency: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.get("/api/coverage-catalog/lookup")
def lookup_coverage_mapping(carrier_name: str, coverage_original: str, policy_form: Optional[str] = None):
    """
    Look up a coverage mapping from the catalog.
    Returns the normalized tags if found.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            if policy_form:
                cur.execute("""
                    SELECT id, coverage_normalized, status
                    FROM coverage_catalog
                    WHERE carrier_name = %s AND coverage_original = %s AND policy_form = %s
                    ORDER BY status = 'approved' DESC
                    LIMIT 1
                """, (carrier_name, coverage_original, policy_form))
            else:
                cur.execute("""
                    SELECT id, coverage_normalized, status
                    FROM coverage_catalog
                    WHERE carrier_name = %s AND coverage_original = %s
                    ORDER BY status = 'approved' DESC
                    LIMIT 1
                """, (carrier_name, coverage_original))

            row = cur.fetchone()
            if row:
                return {
                    "id": row["id"],
                    "coverage_normalized": row["coverage_normalized"],
                    "status": row["status"],
                }
            return None


class CoverageMappingBatch(BaseModel):
    carrier_name: str
    policy_form: Optional[str] = None
    coverages: List[dict]  # List of {coverage, coverage_normalized}


@app.post("/api/coverage-catalog/batch")
def submit_coverage_mappings(data: CoverageMappingBatch):
    """
    Submit multiple coverage mappings to the catalog.
    Used when applying extracted coverages to save the carrier-specific mappings.
    """
    import json

    count = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            for cov in data.coverages:
                coverage_original = cov.get("coverage", "")
                coverage_normalized = cov.get("coverage_normalized", [])

                if not coverage_original:
                    continue

                # Ensure coverage_normalized is a list
                if isinstance(coverage_normalized, str):
                    coverage_normalized = [coverage_normalized] if coverage_normalized else []

                try:
                    cur.execute("""
                        INSERT INTO coverage_catalog (
                            carrier_name, policy_form, coverage_original, coverage_normalized,
                            submitted_by, status
                        ) VALUES (%s, %s, %s, %s, %s, 'pending')
                        ON CONFLICT (carrier_name, policy_form, coverage_original)
                        DO UPDATE SET updated_at = now()
                        RETURNING id
                    """, (
                        data.carrier_name,
                        data.policy_form,
                        coverage_original,
                        coverage_normalized,
                        "api",
                    ))
                    if cur.fetchone():
                        count += 1
                except Exception:
                    pass  # Skip duplicates or errors

            conn.commit()

    return {"submitted": count}


@app.get("/api/coverage-catalog/standard-tags")
def get_standard_coverage_tags():
    """
    Get list of standard coverage tags for mapping.
    """
    return {
        "tags": [
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
        ]
    }


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
    """Get policies with pending subjectivities (for bound options only)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Use new table: get subjectivities linked to bound quote options
            cur.execute("""
                SELECT
                    s.id as submission_id,
                    s.applicant_name,
                    ss.id as subjectivity_id,
                    ss.text,
                    ss.status,
                    ss.due_date,
                    ss.created_at
                FROM submissions s
                JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = true
                JOIN quote_subjectivities qs ON qs.quote_id = t.id
                JOIN submission_subjectivities ss ON ss.id = qs.subjectivity_id
                WHERE ss.status = 'pending'
                ORDER BY s.applicant_name, ss.created_at
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
                    "due_date": row.get("due_date"),
                    "created_at": row["created_at"]
                })

            return list(grouped.values())


@app.post("/api/admin/subjectivities/{subjectivity_id}/received")
def mark_subjectivity_received(subjectivity_id: str):
    """Mark a subjectivity as received."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Try new table first, fall back to old
            cur.execute("""
                UPDATE submission_subjectivities
                SET status = 'received',
                    received_at = NOW(),
                    received_by = 'admin'
                WHERE id = %s
                RETURNING id
            """, (subjectivity_id,))
            result = cur.fetchone()
            if not result:
                # Fall back to old table during transition
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
            # Try new table first, fall back to old
            cur.execute("""
                UPDATE submission_subjectivities
                SET status = 'waived',
                    waived_at = NOW(),
                    waived_by = 'admin'
                WHERE id = %s
                RETURNING id
            """, (subjectivity_id,))
            result = cur.fetchone()
            if not result:
                # Fall back to old table during transition
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


# ─────────────────────────────────────────────────────────────
# Subjectivities Endpoints (new junction table architecture)
# ─────────────────────────────────────────────────────────────

@app.get("/api/submissions/{submission_id}/subjectivities")
def get_submission_subjectivities(submission_id: str):
    """Get all subjectivities for a submission with their quote option links."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    ss.id,
                    ss.text,
                    ss.category,
                    ss.status,
                    ss.due_date,
                    ss.received_at,
                    ss.received_by,
                    ss.waived_at,
                    ss.waived_by,
                    ss.waived_reason,
                    ss.notes,
                    ss.created_at,
                    COALESCE(
                        array_agg(qs.quote_id) FILTER (WHERE qs.quote_id IS NOT NULL),
                        '{}'
                    ) as quote_ids
                FROM submission_subjectivities ss
                LEFT JOIN quote_subjectivities qs ON qs.subjectivity_id = ss.id
                WHERE ss.submission_id = %s
                GROUP BY ss.id
                ORDER BY ss.created_at
            """, (submission_id,))
            return cur.fetchall()


@app.get("/api/quotes/{quote_id}/subjectivities")
def get_quote_subjectivities(quote_id: str):
    """Get subjectivities linked to a specific quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    ss.id,
                    ss.text,
                    ss.category,
                    ss.status,
                    ss.due_date,
                    ss.received_at,
                    ss.notes,
                    ss.created_at,
                    qs.linked_at
                FROM submission_subjectivities ss
                JOIN quote_subjectivities qs ON qs.subjectivity_id = ss.id
                WHERE qs.quote_id = %s
                ORDER BY ss.created_at
            """, (quote_id,))
            return cur.fetchall()


class SubjectivityCreate(BaseModel):
    text: str
    category: Optional[str] = "general"
    position: Optional[str] = None  # If set, only link to quotes with this position
    quote_ids: Optional[List[str]] = None  # Or specify specific quotes


@app.post("/api/submissions/{submission_id}/subjectivities")
def create_subjectivity(submission_id: str, data: SubjectivityCreate):
    """Create a new subjectivity and link to quote options.

    If position is provided, links only to quotes with that position (e.g., 'primary' or 'excess').
    Otherwise links to all quotes for the submission.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Create the subjectivity
            cur.execute("""
                INSERT INTO submission_subjectivities (submission_id, text, category)
                VALUES (%s, %s, %s)
                ON CONFLICT (submission_id, text) DO UPDATE SET
                    updated_at = NOW()
                RETURNING id, text, category, status, created_at
            """, (submission_id, data.text, data.category or 'general'))
            subj = cur.fetchone()
            subj_id = subj["id"]

            # Determine which quotes to link
            if data.quote_ids:
                # Link to specific quotes
                for qid in data.quote_ids:
                    cur.execute("""
                        INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                    """, (qid, subj_id))
            elif data.position:
                # Link to all quotes with the specified position
                cur.execute("""
                    INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
                    SELECT id, %s FROM insurance_towers
                    WHERE submission_id = %s AND position = %s
                    ON CONFLICT DO NOTHING
                """, (subj_id, submission_id, data.position))
            else:
                # Link to all quotes for this submission
                cur.execute("""
                    INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
                    SELECT id, %s FROM insurance_towers WHERE submission_id = %s
                    ON CONFLICT DO NOTHING
                """, (subj_id, submission_id))

            linked_count = cur.rowcount
            conn.commit()

            return {
                **dict(subj),
                "linked_to_quotes": linked_count,
                "position": data.position
            }


class SubjectivityUpdate(BaseModel):
    text: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[str] = None


@app.patch("/api/subjectivities/{subjectivity_id}")
def update_subjectivity(subjectivity_id: str, data: SubjectivityUpdate):
    """Update a subjectivity."""
    updates = {}
    for k, v in data.model_dump(exclude_unset=True).items():
        updates[k] = v

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
    values = list(updates.values()) + [subjectivity_id]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE submission_subjectivities SET {set_clause}, updated_at = NOW() WHERE id = %s RETURNING *",
                values
            )
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="Subjectivity not found")
            conn.commit()
            return result


@app.delete("/api/subjectivities/{subjectivity_id}")
def delete_subjectivity(subjectivity_id: str):
    """Delete a subjectivity (cascades to junction table)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM submission_subjectivities
                WHERE id = %s
                RETURNING id
            """, (subjectivity_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Subjectivity not found")
            conn.commit()
            return {"status": "deleted", "id": subjectivity_id}


@app.post("/api/quotes/{quote_id}/subjectivities/{subjectivity_id}/link")
def link_subjectivity_to_quote(quote_id: str, subjectivity_id: str):
    """Link an existing subjectivity to a quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
                RETURNING quote_id
            """, (quote_id, subjectivity_id))
            result = cur.fetchone()
            conn.commit()
            return {"status": "linked" if result else "already_linked"}


@app.delete("/api/quotes/{quote_id}/subjectivities/{subjectivity_id}/link")
def unlink_subjectivity_from_quote(quote_id: str, subjectivity_id: str):
    """Unlink a subjectivity from a quote option (doesn't delete the subjectivity)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM quote_subjectivities
                WHERE quote_id = %s AND subjectivity_id = %s
                RETURNING quote_id
            """, (quote_id, subjectivity_id))
            result = cur.fetchone()
            conn.commit()
            if not result:
                raise HTTPException(status_code=404, detail="Link not found")
            return {"status": "unlinked"}


@app.post("/api/quotes/{quote_id}/subjectivities/pull/{source_quote_id}")
def pull_subjectivities_from_quote(quote_id: str, source_quote_id: str):
    """Pull (copy) subjectivity links from another quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO quote_subjectivities (quote_id, subjectivity_id)
                SELECT %s, subjectivity_id
                FROM quote_subjectivities
                WHERE quote_id = %s
                ON CONFLICT DO NOTHING
            """, (quote_id, source_quote_id))
            linked_count = cur.rowcount
            conn.commit()
            return {"status": "pulled", "linked_count": linked_count}


@app.delete("/api/subjectivities/{subjectivity_id}/position/{position}")
def unlink_subjectivity_from_position(subjectivity_id: str, position: str):
    """Unlink a subjectivity from all quotes of a specific position (primary/excess)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM quote_subjectivities qs
                USING insurance_towers t
                WHERE qs.quote_id = t.id
                  AND qs.subjectivity_id = %s
                  AND t.position = %s
                RETURNING qs.quote_id
            """, (subjectivity_id, position))
            unlinked_count = cur.rowcount
            conn.commit()
            return {"status": "unlinked", "position": position, "unlinked_count": unlinked_count}


@app.get("/api/subjectivity-templates")
def get_subjectivity_templates(position: str = None, include_inactive: bool = False):
    """Get stock subjectivity templates, optionally filtered by position.

    Position filter:
    - None: returns all templates
    - 'primary': returns templates where position is NULL or 'primary'
    - 'excess': returns templates where position is NULL or 'excess'

    Returns templates with auto_apply flag indicating if they should be auto-added.
    Set include_inactive=true for admin view to see all templates.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            active_filter = "" if include_inactive else "WHERE is_active = true"
            if position:
                cur.execute(f"""
                    SELECT id, text, position, category, display_order, auto_apply, is_active
                    FROM subjectivity_templates
                    WHERE (position IS NULL OR position = %s)
                      {"AND is_active = true" if not include_inactive else ""}
                    ORDER BY display_order, text
                """, (position,))
            else:
                cur.execute(f"""
                    SELECT id, text, position, category, display_order, auto_apply, is_active
                    FROM subjectivity_templates
                    {active_filter}
                    ORDER BY display_order, text
                """)
            return cur.fetchall()


@app.post("/api/subjectivity-templates")
def create_subjectivity_template(data: dict):
    """Create a new subjectivity template."""
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    position = data.get("position")  # NULL = all, 'primary', 'excess'
    category = data.get("category", "general")
    display_order = data.get("display_order", 100)
    auto_apply = data.get("auto_apply", False)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO subjectivity_templates (text, position, category, display_order, auto_apply)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, text, position, category, display_order, auto_apply, is_active
            """, (text, position, category, display_order, auto_apply))
            conn.commit()
            return cur.fetchone()


@app.patch("/api/subjectivity-templates/{template_id}")
def update_subjectivity_template(template_id: str, data: dict):
    """Update a subjectivity template."""
    updates = []
    values = []

    if "text" in data:
        updates.append("text = %s")
        values.append(data["text"].strip())
    if "position" in data:
        updates.append("position = %s")
        values.append(data["position"])
    if "category" in data:
        updates.append("category = %s")
        values.append(data["category"])
    if "display_order" in data:
        updates.append("display_order = %s")
        values.append(data["display_order"])
    if "auto_apply" in data:
        updates.append("auto_apply = %s")
        values.append(data["auto_apply"])
    if "is_active" in data:
        updates.append("is_active = %s")
        values.append(data["is_active"])

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = NOW()")
    values.append(template_id)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                UPDATE subjectivity_templates
                SET {", ".join(updates)}
                WHERE id = %s
                RETURNING id, text, position, category, display_order, auto_apply, is_active
            """, values)
            conn.commit()
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            return row


@app.delete("/api/subjectivity-templates/{template_id}")
def delete_subjectivity_template(template_id: str):
    """Delete a subjectivity template (hard delete)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM subjectivity_templates WHERE id = %s", (template_id,))
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Template not found")
            return {"status": "deleted"}


# =============================================================================
# Endorsement Component Templates
# =============================================================================

@app.get("/api/endorsement-component-templates")
def get_endorsement_component_templates(
    component_type: str = None,
    position: str = None,
    defaults_only: bool = False
):
    """Get endorsement component templates (header, lead_in, closing).

    Filters:
    - component_type: 'header', 'lead_in', 'closing'
    - position: 'primary', 'excess', 'either'
    - defaults_only: only return default templates
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            conditions = []
            values = []

            if component_type:
                conditions.append("component_type = %s")
                values.append(component_type)
            if position:
                # Return templates for this position OR 'either'
                conditions.append("(position = %s OR position = 'either')")
                values.append(position)
            if defaults_only:
                conditions.append("is_default = true")

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

            cur.execute(f"""
                SELECT id, component_type, name, content_html, position, is_default,
                       created_at, updated_at, created_by, updated_by
                FROM endorsement_component_templates
                {where_clause}
                ORDER BY component_type, position, name
            """, values)
            return cur.fetchall()


@app.get("/api/endorsement-component-templates/{template_id}")
def get_endorsement_component_template(template_id: str):
    """Get a single endorsement component template."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, component_type, name, content_html, position, is_default,
                       created_at, updated_at, created_by, updated_by
                FROM endorsement_component_templates
                WHERE id = %s
            """, (template_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            return row


@app.post("/api/endorsement-component-templates")
def create_endorsement_component_template(data: dict):
    """Create a new endorsement component template."""
    component_type = data.get("component_type")
    name = data.get("name", "").strip()

    if not component_type or component_type not in ('header', 'lead_in', 'closing'):
        raise HTTPException(status_code=400, detail="component_type must be header, lead_in, or closing")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    content_html = data.get("content_html", "")
    position = data.get("position", "either")
    is_default = data.get("is_default", False)
    created_by = data.get("created_by", "user")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # If setting as default, unset other defaults for this type+position
            if is_default:
                cur.execute("""
                    UPDATE endorsement_component_templates
                    SET is_default = false
                    WHERE component_type = %s AND position = %s AND is_default = true
                """, (component_type, position))

            cur.execute("""
                INSERT INTO endorsement_component_templates
                    (component_type, name, content_html, position, is_default, created_by)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, component_type, name, content_html, position, is_default,
                          created_at, updated_at, created_by, updated_by
            """, (component_type, name, content_html, position, is_default, created_by))
            conn.commit()
            return cur.fetchone()


@app.patch("/api/endorsement-component-templates/{template_id}")
def update_endorsement_component_template(template_id: str, data: dict):
    """Update an endorsement component template."""
    updates = []
    values = []

    if "name" in data:
        updates.append("name = %s")
        values.append(data["name"].strip())
    if "content_html" in data:
        updates.append("content_html = %s")
        values.append(data["content_html"])
    if "position" in data:
        updates.append("position = %s")
        values.append(data["position"])
    if "is_default" in data:
        updates.append("is_default = %s")
        values.append(data["is_default"])
    if "updated_by" in data:
        updates.append("updated_by = %s")
        values.append(data["updated_by"])

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(template_id)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # If setting as default, first get the template's type and position
            if data.get("is_default"):
                cur.execute("""
                    SELECT component_type, position FROM endorsement_component_templates WHERE id = %s
                """, (template_id,))
                row = cur.fetchone()
                if row:
                    # Unset other defaults for this type+position
                    cur.execute("""
                        UPDATE endorsement_component_templates
                        SET is_default = false
                        WHERE component_type = %s AND position = %s AND is_default = true AND id != %s
                    """, (row["component_type"], row["position"], template_id))

            cur.execute(f"""
                UPDATE endorsement_component_templates
                SET {", ".join(updates)}
                WHERE id = %s
                RETURNING id, component_type, name, content_html, position, is_default,
                          created_at, updated_at, created_by, updated_by
            """, values)
            conn.commit()
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            return row


@app.delete("/api/endorsement-component-templates/{template_id}")
def delete_endorsement_component_template(template_id: str):
    """Delete an endorsement component template."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM endorsement_component_templates WHERE id = %s
            """, (template_id,))
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Template not found")
            return {"status": "deleted"}


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
                    CONCAT(p.first_name, ' ', p.last_name) as person_name,
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

# Standard normalized tags (keep in sync with policy_catalog.py)
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
    "Event Response",
    "Computer Fraud",
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


@app.post("/api/coverage-catalog/{coverage_id}/explain")
def explain_coverage_classification(coverage_id: str):
    """
    Use AI to explain why a coverage was classified with its current tags.
    Returns a detailed explanation of the reasoning.
    """
    import os
    from openai import OpenAI

    # Get the coverage mapping
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT coverage_original, coverage_normalized, carrier_name, policy_form, coverage_description
                FROM coverage_catalog WHERE id = %s
            """, (coverage_id,))
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Coverage mapping not found")

    coverage_original = row["coverage_original"]
    coverage_normalized = row["coverage_normalized"] or []
    carrier_name = row["carrier_name"]
    policy_form = row["policy_form"]
    description = row["coverage_description"]

    # Build context for AI
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="AI service not configured")

    client = OpenAI(api_key=key)
    model = os.getenv("TOWER_AI_MODEL", "gpt-5.1")

    tags_str = ", ".join(coverage_normalized) if coverage_normalized else "None"

    prompt = f"""You are an expert insurance policy analyst. A coverage from a cyber insurance policy was classified with the following normalized tags. Explain why these tags are appropriate (or if they might be incorrect, explain that too).

**Carrier:** {carrier_name}
**Policy Form:** {policy_form or 'Unknown'}
**Original Coverage Name:** "{coverage_original}"
{f'**Description:** {description}' if description else ''}
**Assigned Tags:** {tags_str}

**Standard Tags Available:**
{chr(10).join(f"- {tag}" for tag in COVERAGE_STANDARD_TAGS)}

Provide a concise explanation (2-4 sentences) of:
1. Why the assigned tags are appropriate based on the coverage name and common industry understanding
2. If any tags seem incorrect or if additional tags might be more appropriate

Be specific and educational. Focus on helping an underwriter understand the classification."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_completion_tokens=300,
        )
        explanation = response.choices[0].message.content or "Unable to generate explanation."
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


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
        from datetime import datetime
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

                # Auto-update submission status to "quoted" if currently received/pending_info
                cur.execute("""
                    UPDATE submissions
                    SET submission_status = 'quoted',
                        submission_outcome = CASE
                            WHEN submission_outcome IN ('pending') THEN 'waiting_for_response'
                            ELSE submission_outcome
                        END,
                        status_updated_at = %s
                    WHERE id = %s
                    AND submission_status IN ('received', 'pending_info')
                """, (datetime.utcnow(), submission_id))
                conn.commit()

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
    Get endorsements attached to a quote option from junction table.
    Returns endorsements with library details and field values.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify quote exists
            cur.execute("SELECT id FROM insurance_towers WHERE id = %s", (quote_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Quote not found")

            # Get endorsements from junction table with library details
            cur.execute("""
                SELECT
                    qe.id,
                    qe.endorsement_id,
                    qe.field_values,
                    qe.created_at,
                    dl.title,
                    dl.code,
                    dl.category,
                    dl.position,
                    dl.fill_in_mappings
                FROM quote_endorsements qe
                JOIN document_library dl ON dl.id = qe.endorsement_id
                WHERE qe.quote_id = %s
                ORDER BY dl.default_sort_order, dl.code
            """, (quote_id,))

            endorsements = []
            for row in cur.fetchall():
                endorsements.append({
                    "id": str(row["id"]),
                    "endorsement_id": str(row["endorsement_id"]),
                    "field_values": row["field_values"] or {},
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "title": row["title"],
                    "code": row["code"],
                    "category": row["category"],
                    "position": row["position"],
                    "fill_in_mappings": row["fill_in_mappings"],
                })

            # Also return legacy format for backwards compatibility
            matched_library_ids = [e["endorsement_id"] for e in endorsements]

    return {
        "endorsements": endorsements,
        "matched_library_ids": matched_library_ids,
    }


class EndorsementFieldValues(BaseModel):
    field_values: dict = {}


@app.post("/api/quotes/{quote_id}/endorsements/{endorsement_id}")
def link_endorsement_to_quote(quote_id: str, endorsement_id: str, data: EndorsementFieldValues = None):
    """Link an endorsement to a quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify quote exists
            cur.execute("SELECT id FROM insurance_towers WHERE id = %s", (quote_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Quote not found")

            # Verify endorsement exists in library
            cur.execute("SELECT id FROM document_library WHERE id = %s", (endorsement_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Endorsement not found")

            # Insert link (ignore if already exists)
            field_values = data.field_values if data else {}
            cur.execute("""
                INSERT INTO quote_endorsements (quote_id, endorsement_id, field_values)
                VALUES (%s, %s, %s)
                ON CONFLICT (quote_id, endorsement_id)
                DO UPDATE SET field_values = EXCLUDED.field_values
                RETURNING id
            """, (quote_id, endorsement_id, psycopg2.extras.Json(field_values)))

            result = cur.fetchone()
            conn.commit()

    return {"id": str(result["id"]), "linked": True}


@app.delete("/api/quotes/{quote_id}/endorsements/{endorsement_id}")
def unlink_endorsement_from_quote(quote_id: str, endorsement_id: str):
    """Unlink an endorsement from a quote option."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM quote_endorsements
                WHERE quote_id = %s AND endorsement_id = %s
            """, (quote_id, endorsement_id))

            deleted = cur.rowcount > 0
            conn.commit()

    return {"unlinked": deleted}


@app.patch("/api/quotes/{quote_id}/endorsements/{endorsement_id}")
def update_endorsement_field_values(quote_id: str, endorsement_id: str, data: EndorsementFieldValues):
    """Update field values for a quote-endorsement link."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE quote_endorsements
                SET field_values = %s
                WHERE quote_id = %s AND endorsement_id = %s
                RETURNING id
            """, (psycopg2.extras.Json(data.field_values), quote_id, endorsement_id))

            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="Endorsement link not found")

            conn.commit()

    return {"id": str(result["id"]), "updated": True}


@app.get("/api/submissions/{submission_id}/endorsements")
def get_submission_endorsements(submission_id: str):
    """
    Get all endorsements across all quote options for a submission.
    Returns each endorsement with the list of quote IDs it's linked to.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    dl.id AS endorsement_id,
                    dl.title,
                    dl.code,
                    dl.category,
                    dl.position,
                    array_agg(DISTINCT t.id) AS quote_ids
                FROM quote_endorsements qe
                JOIN document_library dl ON dl.id = qe.endorsement_id
                JOIN insurance_towers t ON t.id = qe.quote_id
                WHERE t.submission_id = %s
                GROUP BY dl.id, dl.title, dl.code, dl.category, dl.position
                ORDER BY dl.default_sort_order, dl.code
            """, (submission_id,))

            endorsements = []
            for row in cur.fetchall():
                # Handle PostgreSQL array - may come as list or string
                quote_ids = row["quote_ids"]
                if isinstance(quote_ids, str):
                    # Parse PostgreSQL array string format: {uuid1,uuid2,...}
                    quote_ids = quote_ids.strip('{}').split(',') if quote_ids.strip('{}') else []
                elif quote_ids is None:
                    quote_ids = []

                endorsements.append({
                    "endorsement_id": str(row["endorsement_id"]),
                    "title": row["title"],
                    "code": row["code"],
                    "category": row["category"],
                    "position": row["position"],
                    "quote_ids": [str(qid) for qid in quote_ids] if quote_ids else [],
                })

    return {"endorsements": endorsements}


@app.get("/api/quotes/{quote_id}/auto-endorsements")
def get_quote_auto_endorsements(quote_id: str):
    """
    Get endorsements that should auto-attach based on quote data and endorsement rules.
    Returns endorsements with auto_reason explaining why they were attached.
    """
    import json
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT tower_json, position, sublimits, coverages, primary_retention
                FROM insurance_towers
                WHERE id = %s
            """, (quote_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Quote not found")

            tower_json = row.get("tower_json", [])
            if isinstance(tower_json, str):
                tower_json = json.loads(tower_json)

            position = row.get("position", "primary")
            sublimits = row.get("sublimits", [])
            if isinstance(sublimits, str):
                sublimits = json.loads(sublimits)

            coverages = row.get("coverages", {})
            if isinstance(coverages, str):
                coverages = json.loads(coverages)

            # Calculate limit and retention from tower
            limit = 0
            retention = row.get("primary_retention", 25000)
            if tower_json:
                cmai_layer = next((l for l in tower_json if "CMAI" in (l.get("carrier") or "").upper()), tower_json[0] if tower_json else None)
                if cmai_layer:
                    limit = cmai_layer.get("limit", 0)
                # Get retention from primary layer
                if tower_json[0]:
                    retention = tower_json[0].get("retention", retention)

            # Build quote_data dict for auto-attach evaluation
            quote_data = {
                "sublimits": sublimits,
                "limit": limit,
                "retention": retention,
                "coverages": coverages,
                "follow_form": position != "primary",  # Excess quotes follow form
            }

    # Get auto-attach endorsements
    try:
        from core.document_library import get_auto_attach_endorsements

        auto_endorsements = get_auto_attach_endorsements(quote_data, position)

        # Return simplified data for frontend
        return {
            "auto_endorsements": [
                {
                    "id": e.get("id"),
                    "code": e.get("code"),
                    "title": e.get("title"),
                    "category": e.get("category"),
                    "auto_reason": e.get("auto_reason"),
                }
                for e in auto_endorsements
            ]
        }
    except Exception as e:
        # If auto-attach fails, return empty list
        return {"auto_endorsements": [], "error": str(e)}


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
# Extraction Schema Management
# ─────────────────────────────────────────────────────────────

@app.get("/api/schemas")
def list_schemas():
    """List all extraction schemas."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, version, description, is_active, created_at, updated_at, created_by
                FROM extraction_schemas
                ORDER BY name, version DESC
            """)
            rows = cur.fetchall()
            return {
                "count": len(rows),
                "schemas": [dict(r) for r in rows]
            }


@app.get("/api/schemas/active")
def get_active_schema():
    """Get the currently active extraction schema."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, version, description, schema_definition, created_at, updated_at
                FROM extraction_schemas
                WHERE is_active = true
                LIMIT 1
            """)
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No active schema found")
            return dict(row)


@app.get("/api/schemas/{schema_id}")
def get_schema(schema_id: str):
    """Get a specific extraction schema by ID."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, version, description, is_active, schema_definition, created_at, updated_at, created_by
                FROM extraction_schemas
                WHERE id = %s
            """, (schema_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Schema not found")
            return dict(row)


class SchemaCreate(BaseModel):
    name: str
    description: Optional[str] = None
    schema_definition: dict
    set_active: bool = False


@app.post("/api/schemas")
def create_schema(schema: SchemaCreate):
    """Create a new extraction schema (as a new version)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get next version number for this schema name
            cur.execute("""
                SELECT COALESCE(MAX(version), 0) + 1 as next_version
                FROM extraction_schemas
                WHERE name = %s
            """, (schema.name,))
            next_version = cur.fetchone()["next_version"]

            # If setting as active, deactivate other schemas with same name
            if schema.set_active:
                cur.execute("""
                    UPDATE extraction_schemas SET is_active = false WHERE name = %s
                """, (schema.name,))

            # Insert new schema
            cur.execute("""
                INSERT INTO extraction_schemas (name, version, description, is_active, schema_definition, created_by)
                VALUES (%s, %s, %s, %s, %s, 'api')
                RETURNING id, name, version, is_active, created_at
            """, (schema.name, next_version, schema.description, schema.set_active, Json(schema.schema_definition)))

            row = cur.fetchone()
            return {
                "message": "Schema created",
                "schema": dict(row)
            }


class SchemaUpdate(BaseModel):
    description: Optional[str] = None
    schema_definition: Optional[dict] = None
    is_active: Optional[bool] = None


@app.patch("/api/schemas/{schema_id}")
def update_schema(schema_id: str, updates: SchemaUpdate):
    """Update an extraction schema."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Build dynamic update
            set_clauses = ["updated_at = NOW()"]
            params = []

            if updates.description is not None:
                set_clauses.append("description = %s")
                params.append(updates.description)

            if updates.schema_definition is not None:
                set_clauses.append("schema_definition = %s")
                params.append(Json(updates.schema_definition))

            if updates.is_active is not None:
                # If activating, deactivate others with same name first
                if updates.is_active:
                    cur.execute("""
                        UPDATE extraction_schemas es
                        SET is_active = false
                        WHERE es.name = (SELECT name FROM extraction_schemas WHERE id = %s)
                    """, (schema_id,))
                set_clauses.append("is_active = %s")
                params.append(updates.is_active)

            params.append(schema_id)
            cur.execute(f"""
                UPDATE extraction_schemas
                SET {', '.join(set_clauses)}
                WHERE id = %s
                RETURNING id, name, version, is_active, updated_at
            """, params)

            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Schema not found")
            return {"message": "Schema updated", "schema": dict(row)}


# Schema field management
@app.post("/api/schemas/{schema_id}/fields")
def add_schema_field(schema_id: str, category: str, field_key: str, field_def: dict):
    """Add a field to a schema category."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT schema_definition FROM extraction_schemas WHERE id = %s", (schema_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Schema not found")

            schema_def = row["schema_definition"]
            if category not in schema_def:
                raise HTTPException(status_code=400, detail=f"Category '{category}' not found in schema")

            if "fields" not in schema_def[category]:
                schema_def[category]["fields"] = {}

            schema_def[category]["fields"][field_key] = field_def

            cur.execute("""
                UPDATE extraction_schemas
                SET schema_definition = %s, updated_at = NOW()
                WHERE id = %s
            """, (Json(schema_def), schema_id))

            return {"message": f"Field '{field_key}' added to category '{category}'"}


@app.delete("/api/schemas/{schema_id}/fields/{field_key}")
def remove_schema_field(schema_id: str, field_key: str):
    """Remove a field from a schema."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT schema_definition FROM extraction_schemas WHERE id = %s", (schema_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Schema not found")

            schema_def = row["schema_definition"]
            found = False

            for category in schema_def.values():
                if "fields" in category and field_key in category["fields"]:
                    del category["fields"][field_key]
                    found = True
                    break

            if not found:
                raise HTTPException(status_code=404, detail=f"Field '{field_key}' not found in schema")

            cur.execute("""
                UPDATE extraction_schemas
                SET schema_definition = %s, updated_at = NOW()
                WHERE id = %s
            """, (Json(schema_def), schema_id))

            return {"message": f"Field '{field_key}' removed"}


# Schema recommendations
@app.get("/api/schemas/recommendations")
def list_recommendations(status: str = "pending"):
    """List schema recommendations."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT r.*, s.name as schema_name, s.version as schema_version
                FROM schema_recommendations r
                LEFT JOIN extraction_schemas s ON r.schema_id = s.id
                WHERE r.status = %s
                ORDER BY r.created_at DESC
            """, (status,))
            rows = cur.fetchall()
            return {
                "count": len(rows),
                "recommendations": [dict(r) for r in rows]
            }


class RecommendationAction(BaseModel):
    action: str  # approve, reject, defer
    notes: Optional[str] = None


@app.post("/api/schemas/recommendations/{rec_id}")
def action_recommendation(rec_id: str, action: RecommendationAction):
    """Approve, reject, or defer a schema recommendation."""
    if action.action not in ("approved", "rejected", "deferred"):
        raise HTTPException(status_code=400, detail="Action must be: approved, rejected, or deferred")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get recommendation
            cur.execute("SELECT * FROM schema_recommendations WHERE id = %s", (rec_id,))
            rec = cur.fetchone()
            if not rec:
                raise HTTPException(status_code=404, detail="Recommendation not found")

            # Update status
            cur.execute("""
                UPDATE schema_recommendations
                SET status = %s, review_notes = %s, reviewed_at = NOW(), reviewed_by = 'api'
                WHERE id = %s
            """, (action.action, action.notes, rec_id))

            # If approved, apply the change to the schema
            if action.action == "approved" and rec["schema_id"]:
                if rec["recommendation_type"] == "new_field":
                    cur.execute("SELECT schema_definition FROM extraction_schemas WHERE id = %s", (rec["schema_id"],))
                    schema_row = cur.fetchone()
                    if schema_row:
                        schema_def = schema_row["schema_definition"]
                        category = rec["suggested_category"]

                        if category not in schema_def:
                            # Create new category
                            schema_def[category] = {
                                "displayName": category.replace("_", " ").title(),
                                "description": "",
                                "displayOrder": len(schema_def) + 1,
                                "fields": {}
                            }

                        field_def = {
                            "type": rec["suggested_type"] or "string",
                            "displayName": rec["suggested_field_name"],
                            "description": rec["suggested_description"] or ""
                        }
                        if rec["suggested_enum_values"]:
                            field_def["enumValues"] = rec["suggested_enum_values"]

                        schema_def[category]["fields"][rec["suggested_field_key"]] = field_def

                        cur.execute("""
                            UPDATE extraction_schemas
                            SET schema_definition = %s, updated_at = NOW()
                            WHERE id = %s
                        """, (Json(schema_def), rec["schema_id"]))

            return {"message": f"Recommendation {action.action}", "id": rec_id}


@app.post("/api/schemas/analyze-document/{document_id}")
def analyze_document_for_schema(document_id: str):
    """Analyze a document for potential schema additions."""
    from ai.schema_recommender import analyze_document_for_schema_gaps

    # Get document text
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.id, d.filename, d.doc_metadata, t.raw_json
                FROM documents d
                LEFT JOIN textract_extractions t ON t.document_id = d.id
                WHERE d.id = %s
            """, (document_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")

            # Get text from textract if available
            doc_text = ""
            if row.get("raw_json"):
                raw = row["raw_json"]
                if isinstance(raw, dict) and "Blocks" in raw:
                    lines = [b.get("Text", "") for b in raw["Blocks"] if b.get("BlockType") == "LINE"]
                    doc_text = "\n".join(lines)

            if not doc_text:
                # Try to get text from file
                metadata = row.get("doc_metadata") or {}
                file_path = metadata.get("file_path")
                if file_path and os.path.exists(file_path):
                    import pdfplumber
                    with pdfplumber.open(file_path) as pdf:
                        doc_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

            if not doc_text:
                raise HTTPException(status_code=400, detail="Could not extract text from document")

            # Analyze for gaps
            recommendations = analyze_document_for_schema_gaps(
                document_text=doc_text,
                document_id=document_id,
                document_name=row.get("filename"),
            )

            return {
                "document_id": document_id,
                "document_name": row.get("filename"),
                "recommendations_created": len(recommendations),
                "recommendations": recommendations,
            }


@app.get("/api/schemas/coverage")
def get_schema_coverage(days: int = 30):
    """Get field coverage statistics across recent extractions."""
    from ai.schema_recommender import analyze_extraction_coverage
    return analyze_extraction_coverage(days=days)


# ─────────────────────────────────────────────────────────────
# AI Correction Review Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/submissions/{submission_id}/ai-corrections")
def get_ai_corrections(submission_id: str):
    """Get pending AI corrections for a submission that need UW review."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get pending corrections count
            cur.execute("""
                SELECT COUNT(*) as pending_count
                FROM extraction_corrections ec
                JOIN extraction_provenance ep ON ec.provenance_id = ep.id
                WHERE ep.submission_id = %s
                  AND ec.correction_type = 'ai_auto'
                  AND ec.status = 'pending'
            """, (submission_id,))
            count_row = cur.fetchone()

            # Get all AI corrections (pending first, then others)
            cur.execute("""
                SELECT
                    ec.id,
                    ec.provenance_id,
                    ep.field_name,
                    ec.original_value,
                    ec.corrected_value,
                    ec.correction_reason,
                    ec.status,
                    ec.reviewed_by,
                    ec.reviewed_at,
                    ec.corrected_at as detected_at,
                    ep.source_document_id,
                    ep.source_page,
                    ep.source_text,
                    ep.confidence,
                    ep.source_bbox
                FROM extraction_corrections ec
                JOIN extraction_provenance ep ON ec.provenance_id = ep.id
                WHERE ep.submission_id = %s
                  AND ec.correction_type = 'ai_auto'
                ORDER BY
                    CASE ec.status WHEN 'pending' THEN 0 ELSE 1 END,
                    ec.corrected_at DESC
            """, (submission_id,))
            corrections = cur.fetchall()

            return {
                "pending_count": count_row["pending_count"],
                "corrections": corrections,
            }


class CorrectionReview(BaseModel):
    reviewed_by: Optional[str] = "underwriter"
    edited_value: Optional[str] = None  # Allow UW to modify value before accepting


@app.post("/api/corrections/{correction_id}/accept")
def accept_ai_correction(correction_id: str, review: CorrectionReview = None):
    """Accept an AI correction - keep the corrected value (or use edited value if provided)."""
    from datetime import datetime

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify correction exists and is pending
            cur.execute("""
                SELECT ec.id, ec.status, ec.corrected_value, ep.id as provenance_id
                FROM extraction_corrections ec
                JOIN extraction_provenance ep ON ec.provenance_id = ep.id
                WHERE ec.id = %s
            """, (correction_id,))
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Correction not found")

            if row["status"] != "pending":
                raise HTTPException(status_code=400, detail=f"Correction already {row['status']}")

            reviewed_by = review.reviewed_by if review else "underwriter"
            edited_value = review.edited_value if review else None

            # If UW provided an edited value, update the provenance with that value
            if edited_value is not None:
                cur.execute("""
                    UPDATE extraction_provenance
                    SET extracted_value = %s
                    WHERE id = %s
                """, (Json(edited_value), row["provenance_id"]))

            # Mark as accepted
            cur.execute("""
                UPDATE extraction_corrections
                SET status = 'accepted',
                    reviewed_by = %s,
                    reviewed_at = %s
                WHERE id = %s
            """, (reviewed_by, datetime.now(), correction_id))

            conn.commit()

            return {
                "status": "accepted",
                "correction_id": correction_id,
                "message": "AI correction accepted" + (" with edits" if edited_value else " - corrected value kept"),
                "final_value": edited_value if edited_value else row["corrected_value"],
            }


@app.post("/api/corrections/{correction_id}/reject")
def reject_ai_correction(correction_id: str, review: CorrectionReview = None):
    """Reject an AI correction - revert to original value."""
    from datetime import datetime

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get correction and provenance
            cur.execute("""
                SELECT ec.id, ec.status, ec.original_value, ep.id as provenance_id
                FROM extraction_corrections ec
                JOIN extraction_provenance ep ON ec.provenance_id = ep.id
                WHERE ec.id = %s
            """, (correction_id,))
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Correction not found")

            if row["status"] != "pending":
                raise HTTPException(status_code=400, detail=f"Correction already {row['status']}")

            # Revert the extraction to original value
            cur.execute("""
                UPDATE extraction_provenance
                SET extracted_value = %s
                WHERE id = %s
            """, (Json(row["original_value"]), row["provenance_id"]))

            # Mark correction as rejected
            reviewed_by = review.reviewed_by if review else "underwriter"
            cur.execute("""
                UPDATE extraction_corrections
                SET status = 'rejected',
                    reviewed_by = %s,
                    reviewed_at = %s
                WHERE id = %s
            """, (reviewed_by, datetime.now(), correction_id))

            conn.commit()

            return {
                "status": "rejected",
                "correction_id": correction_id,
                "message": "AI correction rejected - reverted to original value",
                "original_value": row["original_value"],
            }


# ─────────────────────────────────────────────────────────────
# AI Research Task Endpoints (for flagged business descriptions, etc.)
# ─────────────────────────────────────────────────────────────

class AIResearchTaskRequest(BaseModel):
    task_type: str  # 'business_description', 'industry_classification'
    flag_type: str  # 'wrong_company', 'inaccurate', 'other'
    uw_context: Optional[str] = None
    original_value: Optional[str] = None


class AIResearchTaskReview(BaseModel):
    review_outcome: str  # 'accepted', 'rejected', 'modified'
    final_value: Optional[str] = None
    reviewed_by: Optional[str] = "underwriter"


@app.post("/api/submissions/{submission_id}/ai-research-tasks")
def create_ai_research_task(submission_id: str, request: AIResearchTaskRequest):
    """Create an AI research task when UW flags something for AI to investigate."""
    from datetime import datetime

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get submission info for context
            cur.execute("""
                SELECT applicant_name, business_summary, website
                FROM submissions WHERE id = %s
            """, (submission_id,))
            sub = cur.fetchone()

            if not sub:
                raise HTTPException(status_code=404, detail="Submission not found")

            # Determine original value if not provided
            original_value = request.original_value
            if not original_value and request.task_type == 'business_description':
                original_value = sub.get('business_summary')

            # Create the task
            cur.execute("""
                INSERT INTO ai_research_tasks (
                    submission_id, task_type, flag_type,
                    uw_context, original_value, status
                ) VALUES (%s, %s, %s, %s, %s, 'pending')
                RETURNING id, created_at
            """, (submission_id, request.task_type, request.flag_type,
                  request.uw_context, original_value))
            task = cur.fetchone()
            conn.commit()

            # Trigger async AI research (in production, this would be a background job)
            # For now, we'll do it synchronously
            try:
                _process_ai_research_task(task['id'], submission_id, request, sub, conn)
            except Exception as e:
                print(f"AI research task processing error: {e}")
                # Task remains in pending state for retry

            return {
                "task_id": str(task['id']),
                "status": "created",
                "message": "AI research task created. Check back for results."
            }


def _process_ai_research_task(task_id, submission_id, request, submission, conn):
    """Process an AI research task - research and propose a correction."""
    import os
    from datetime import datetime

    # Mark as processing
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE ai_research_tasks SET status = 'processing' WHERE id = %s
        """, (task_id,))
        conn.commit()

    try:
        # Build prompt based on task type
        if request.task_type == 'business_description':
            proposed_value, reasoning, sources, confidence = _research_business_description(
                submission, request.flag_type, request.uw_context
            )
        else:
            # Generic fallback
            proposed_value = None
            reasoning = "Task type not yet supported"
            sources = []
            confidence = 0.0

        # Update task with results
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE ai_research_tasks
                SET status = 'completed',
                    proposed_value = %s,
                    ai_reasoning = %s,
                    sources_consulted = %s,
                    confidence = %s,
                    processed_at = %s
                WHERE id = %s
            """, (proposed_value, reasoning, Json(sources), confidence,
                  datetime.now(), task_id))
            conn.commit()

    except Exception as e:
        # Mark as failed
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE ai_research_tasks
                SET status = 'failed', ai_reasoning = %s, processed_at = %s
                WHERE id = %s
            """, (f"Error: {str(e)}", datetime.now(), task_id))
            conn.commit()
        raise


def _research_business_description(submission, flag_type, uw_context):
    """Use AI to research and propose a corrected business description."""
    import os

    company_name = submission.get('applicant_name', 'Unknown Company')
    website = submission.get('website')
    current_description = submission.get('business_summary', '')

    # Build context for AI
    context_parts = []
    if flag_type == 'wrong_company':
        context_parts.append(f"The underwriter believes this description is for the WRONG company, not {company_name}.")
    elif flag_type == 'inaccurate':
        context_parts.append(f"The underwriter believes this description is inaccurate or outdated for {company_name}.")
    else:
        context_parts.append(f"The underwriter has flagged an issue with the business description for {company_name}.")

    if uw_context:
        context_parts.append(f"UW's additional context: {uw_context}")

    if website:
        context_parts.append(f"Company website: {website}")

    context_parts.append(f"Current description: {current_description[:500]}..." if len(current_description) > 500 else f"Current description: {current_description}")

    # Try to use Claude for research
    try:
        import anthropic

        client = anthropic.Anthropic()
        prompt = f"""You are helping an insurance underwriter verify company information.

{chr(10).join(context_parts)}

Please research {company_name} and provide:
1. An accurate, factual business description (2-3 sentences)
2. Focus on: what the company does, their main products/services, and industry sector
3. Only include verifiable facts

Respond in this exact format:
DESCRIPTION: [Your proposed description here]
REASONING: [Brief explanation of how you verified this]
CONFIDENCE: [high/medium/low]
SOURCES: [List any sources you'd recommend checking]"""

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text

        # Parse response
        proposed_value = ""
        reasoning = ""
        confidence = 0.7
        sources = []

        for line in response_text.split('\n'):
            line = line.strip()
            if line.startswith('DESCRIPTION:'):
                proposed_value = line.replace('DESCRIPTION:', '').strip()
            elif line.startswith('REASONING:'):
                reasoning = line.replace('REASONING:', '').strip()
            elif line.startswith('CONFIDENCE:'):
                conf_text = line.replace('CONFIDENCE:', '').strip().lower()
                if 'high' in conf_text:
                    confidence = 0.9
                elif 'medium' in conf_text:
                    confidence = 0.7
                else:
                    confidence = 0.5
            elif line.startswith('SOURCES:'):
                sources = [s.strip() for s in line.replace('SOURCES:', '').split(',') if s.strip()]

        return proposed_value, reasoning, sources, confidence

    except Exception as e:
        # Fallback if AI fails
        return (
            f"[AI research failed: {str(e)}] Please manually research {company_name}.",
            f"AI research encountered an error: {str(e)}",
            [],
            0.0
        )


@app.get("/api/submissions/{submission_id}/ai-research-tasks")
def get_ai_research_tasks(submission_id: str):
    """Get all AI research tasks for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id, task_type, flag_type, uw_context,
                    original_value, status, proposed_value,
                    ai_reasoning, sources_consulted, confidence,
                    reviewed_by, reviewed_at, review_outcome, final_value,
                    created_at, processed_at
                FROM ai_research_tasks
                WHERE submission_id = %s
                ORDER BY created_at DESC
            """, (submission_id,))
            tasks = cur.fetchall()

            return {
                "tasks": tasks,
                "pending_count": sum(1 for t in tasks if t['status'] in ('pending', 'processing')),
                "completed_count": sum(1 for t in tasks if t['status'] == 'completed'),
            }


@app.get("/api/ai-research-tasks/{task_id}")
def get_ai_research_task(task_id: str):
    """Get a single AI research task by ID."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    t.id, t.submission_id, t.task_type, t.flag_type, t.uw_context,
                    t.original_value, t.status, t.proposed_value,
                    t.ai_reasoning, t.sources_consulted, t.confidence,
                    t.reviewed_by, t.reviewed_at, t.review_outcome, t.final_value,
                    t.created_at, t.processed_at,
                    s.applicant_name
                FROM ai_research_tasks t
                JOIN submissions s ON s.id = t.submission_id
                WHERE t.id = %s
            """, (task_id,))
            task = cur.fetchone()

            if not task:
                raise HTTPException(status_code=404, detail="Task not found")

            return task


@app.post("/api/ai-research-tasks/{task_id}/review")
def review_ai_research_task(task_id: str, review: AIResearchTaskReview):
    """Review and accept/reject/modify an AI research task result."""
    from datetime import datetime

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get task
            cur.execute("""
                SELECT id, submission_id, task_type, status, proposed_value
                FROM ai_research_tasks WHERE id = %s
            """, (task_id,))
            task = cur.fetchone()

            if not task:
                raise HTTPException(status_code=404, detail="Task not found")

            if task['status'] != 'completed':
                raise HTTPException(status_code=400, detail="Task not ready for review")

            # Determine final value
            if review.review_outcome == 'accepted':
                final_value = task['proposed_value']
            elif review.review_outcome == 'modified':
                final_value = review.final_value
            else:  # rejected
                final_value = None

            # Update task
            cur.execute("""
                UPDATE ai_research_tasks
                SET review_outcome = %s,
                    final_value = %s,
                    reviewed_by = %s,
                    reviewed_at = %s
                WHERE id = %s
            """, (review.review_outcome, final_value, review.reviewed_by,
                  datetime.now(), task_id))

            # If accepted or modified, update the submission field
            if final_value and task['task_type'] == 'business_description':
                cur.execute("""
                    UPDATE submissions SET business_summary = %s WHERE id = %s
                """, (final_value, task['submission_id']))

            conn.commit()

            return {
                "status": "reviewed",
                "task_id": task_id,
                "review_outcome": review.review_outcome,
                "final_value": final_value,
                "message": f"Task {review.review_outcome}" + (
                    " - submission updated" if final_value else ""
                )
            }


# ─────────────────────────────────────────────────────────────
# Collaborative Workflow Endpoints
# ─────────────────────────────────────────────────────────────

class VoteRequest(BaseModel):
    user_id: Optional[str] = None
    user_name: str
    vote: str  # pre_screen: 'pursue', 'pass', 'unsure' | formal: 'approve', 'decline', 'send_back'
    comment: Optional[str] = None
    reasons: Optional[List[str]] = None


class ClaimRequest(BaseModel):
    user_id: Optional[str] = None
    user_name: str


class CommentRequest(BaseModel):
    user_id: Optional[str] = None
    user_name: str
    comment: str


class SubmitForReviewRequest(BaseModel):
    user_id: Optional[str] = None
    user_name: str
    recommendation: str  # 'quote' or 'decline'
    summary: str
    suggested_premium: Optional[float] = None
    suggested_terms: Optional[dict] = None
    decline_reasons: Optional[List[str]] = None


@app.get("/api/workflow/stages")
def get_workflow_stages():
    """Get workflow stage configuration."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT stage_key, stage_name, stage_order, required_votes,
                       timeout_hours, timeout_action, is_active
                FROM workflow_stages
                WHERE is_active = true
                ORDER BY stage_order
            """)
            return {"stages": cur.fetchall()}


@app.get("/api/workflow/queue")
def get_workflow_queue(user_name: Optional[str] = None):
    """Get the voting queue - items needing votes and ready to work."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get items needing votes
            cur.execute("""
                SELECT
                    nv.submission_id,
                    nv.applicant_name,
                    nv.submitted_at,
                    nv.current_stage,
                    nv.stage_entered_at,
                    nv.deadline,
                    nv.hours_remaining,
                    nv.votes_cast,
                    nv.votes_needed,
                    nv.required_votes,
                    s.opportunity_notes,
                    s.naics_primary_title,
                    s.annual_revenue,
                    s.broker_email,
                    s.bullet_point_summary,
                    o.name as broker_company,
                    CONCAT(p.first_name, ' ', p.last_name) as broker_person
                FROM v_needs_votes nv
                JOIN submissions s ON s.id = nv.submission_id
                LEFT JOIN brkr_employments e ON (
                    e.employment_id::text = s.broker_employment_id
                    OR (s.broker_employment_id IS NULL AND e.email = s.broker_email)
                )
                LEFT JOIN brkr_organizations o ON o.org_id = e.org_id
                LEFT JOIN brkr_people p ON p.person_id = e.person_id
                ORDER BY nv.hours_remaining ASC
            """)
            needs_votes = cur.fetchall()

            # Get items ready to work (unclaimed)
            cur.execute("""
                SELECT
                    submission_id,
                    applicant_name,
                    submitted_at,
                    stage_entered_at,
                    hours_waiting
                FROM v_ready_to_work
                ORDER BY stage_entered_at ASC
            """)
            ready_to_work = cur.fetchall()

            # Get current vote tallies for items needing votes
            if needs_votes:
                submission_ids = [str(n['submission_id']) for n in needs_votes]
                cur.execute("""
                    SELECT submission_id, current_stage, vote, vote_count, voters
                    FROM v_vote_tally
                    WHERE submission_id = ANY(%s::uuid[])
                """, (submission_ids,))
                tallies = cur.fetchall()

                # Group tallies by submission
                tally_map = {}
                for t in tallies:
                    sid = str(t['submission_id'])
                    if sid not in tally_map:
                        tally_map[sid] = {}
                    if t['vote']:
                        tally_map[sid][t['vote']] = {
                            'count': t['vote_count'],
                            'voters': t['voters']
                        }

                # Add tallies to needs_votes
                for nv in needs_votes:
                    nv['vote_tally'] = tally_map.get(str(nv['submission_id']), {})

            # If user specified, mark which ones they've voted on
            if user_name:
                cur.execute("""
                    SELECT submission_id, stage, vote
                    FROM workflow_votes
                    WHERE user_name = %s
                """, (user_name,))
                user_votes = {(str(v['submission_id']), v['stage']): v['vote'] for v in cur.fetchall()}

                for nv in needs_votes:
                    key = (str(nv['submission_id']), nv['current_stage'])
                    nv['my_vote'] = user_votes.get(key)

            # Get comments for all needs_votes items
            if needs_votes:
                submission_ids = [str(n['submission_id']) for n in needs_votes]
                cur.execute("""
                    SELECT submission_id, user_name, comment, voted_at as created_at, vote
                    FROM workflow_votes
                    WHERE submission_id = ANY(%s::uuid[])
                      AND comment IS NOT NULL AND comment != ''
                    ORDER BY voted_at DESC
                """, (submission_ids,))
                all_comments = cur.fetchall()

                # Group comments by submission
                comment_map = {}
                for c in all_comments:
                    sid = str(c['submission_id'])
                    if sid not in comment_map:
                        comment_map[sid] = []
                    comment_map[sid].append({
                        'user_name': c['user_name'],
                        'comment': c['comment'],
                        'created_at': c['created_at'].isoformat() if c['created_at'] else None,
                        'vote': c['vote']
                    })

                for nv in needs_votes:
                    nv['comments'] = comment_map.get(str(nv['submission_id']), [])

            return {
                "needs_votes": needs_votes,
                "ready_to_work": ready_to_work,
                "summary": {
                    "needs_votes_count": len(needs_votes),
                    "ready_to_work_count": len(ready_to_work)
                }
            }


@app.post("/api/workflow/{submission_id}/comment")
def add_workflow_comment(submission_id: str, request: CommentRequest):
    """Add a comment to a submission without voting."""
    import uuid as uuid_module

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get current stage
            cur.execute("""
                SELECT current_stage FROM submission_workflow
                WHERE submission_id = %s
            """, (submission_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Submission not in workflow")

            stage = row['current_stage']
            user_id = request.user_id or str(uuid_module.uuid4())

            # Insert comment as a 'comment' type entry (not a vote)
            cur.execute("""
                INSERT INTO workflow_votes (submission_id, stage, user_id, user_name, vote, comment)
                VALUES (%s, %s, %s, %s, 'comment', %s)
            """, (submission_id, stage, user_id, request.user_name, request.comment))

            conn.commit()

            return {"status": "comment_added", "submission_id": submission_id}


@app.get("/api/workflow/{submission_id}/comments")
def get_workflow_comments(submission_id: str):
    """Get all comments for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT user_name, comment, voted_at as created_at, vote
                FROM workflow_votes
                WHERE submission_id = %s
                  AND comment IS NOT NULL AND comment != ''
                ORDER BY voted_at DESC
            """, (submission_id,))
            comments = cur.fetchall()

            return {
                "comments": [
                    {
                        'user_name': c['user_name'],
                        'comment': c['comment'],
                        'created_at': c['created_at'].isoformat() if c['created_at'] else None,
                        'vote': c['vote']
                    }
                    for c in comments
                ]
            }


@app.get("/api/workflow/my-work")
def get_my_work(user_name: str):
    """Get submissions I'm currently working on."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    s.id as submission_id,
                    s.applicant_name,
                    s.naics_primary_title,
                    s.annual_revenue,
                    sw.assigned_at,
                    sw.work_started_at,
                    EXTRACT(EPOCH FROM (now() - COALESCE(sw.work_started_at, sw.assigned_at))) / 60 as minutes_working
                FROM submissions s
                JOIN submission_workflow sw ON sw.submission_id = s.id
                WHERE sw.current_stage = 'uw_work'
                  AND sw.assigned_uw_name = %s
                  AND sw.completed_at IS NULL
                ORDER BY sw.assigned_at
            """, (user_name,))
            return {"my_work": cur.fetchall()}


@app.get("/api/workflow/summary")
def get_workflow_summary():
    """Get workflow summary counts for dashboard."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT current_stage, count, assigned_count,
                       ROUND(avg_hours_in_stage::numeric, 1) as avg_hours_in_stage
                FROM v_workflow_summary
                ORDER BY
                    CASE current_stage
                        WHEN 'intake' THEN 1
                        WHEN 'pre_screen' THEN 2
                        WHEN 'uw_work' THEN 3
                        WHEN 'formal' THEN 4
                        WHEN 'complete' THEN 5
                        ELSE 6
                    END
            """)
            stages = cur.fetchall()

            # Get totals
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE completed_at IS NULL) as in_progress,
                    COUNT(*) FILTER (WHERE final_decision = 'quoted') as quoted,
                    COUNT(*) FILTER (WHERE final_decision = 'declined') as declined
                FROM submission_workflow
            """)
            totals = cur.fetchone()

            return {
                "by_stage": stages,
                "totals": totals
            }


@app.get("/api/workflow/{submission_id}")
def get_submission_workflow(submission_id: str):
    """Get workflow state for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get workflow state
            cur.execute("""
                SELECT
                    sw.*,
                    ws.stage_name,
                    ws.required_votes,
                    ws.timeout_hours,
                    sw.stage_entered_at + (ws.timeout_hours || ' hours')::INTERVAL as deadline
                FROM submission_workflow sw
                JOIN workflow_stages ws ON ws.stage_key = sw.current_stage
                WHERE sw.submission_id = %s
            """, (submission_id,))
            workflow = cur.fetchone()

            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found for submission")

            # Get votes for current stage
            cur.execute("""
                SELECT user_name, vote, comment, reasons, voted_at, is_recommender
                FROM workflow_votes
                WHERE submission_id = %s AND stage = %s
                ORDER BY voted_at
            """, (submission_id, workflow['current_stage']))
            votes = cur.fetchall()

            # Get vote tally
            cur.execute("""
                SELECT vote, vote_count, voters
                FROM v_vote_tally
                WHERE submission_id = %s AND current_stage = %s
            """, (submission_id, workflow['current_stage']))
            tally = {r['vote']: {'count': r['vote_count'], 'voters': r['voters']}
                     for r in cur.fetchall() if r['vote']}

            return {
                "workflow": workflow,
                "votes": votes,
                "vote_tally": tally
            }


@app.get("/api/workflow/{submission_id}/history")
def get_submission_workflow_history(submission_id: str):
    """Get full workflow history/audit trail for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    event_type,
                    event_at,
                    event_detail,
                    event_trigger,
                    user_name,
                    vote,
                    comment
                FROM v_submission_audit
                WHERE submission_id = %s
                ORDER BY event_at DESC
            """, (submission_id,))
            return {"history": cur.fetchall()}


@app.post("/api/workflow/{submission_id}/vote")
def record_workflow_vote(submission_id: str, vote_request: VoteRequest):
    """Record a vote on a submission."""
    from datetime import datetime
    import uuid

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get current workflow state
            cur.execute("""
                SELECT sw.current_stage, ws.required_votes
                FROM submission_workflow sw
                JOIN workflow_stages ws ON ws.stage_key = sw.current_stage
                WHERE sw.submission_id = %s
            """, (submission_id,))
            workflow = cur.fetchone()

            if not workflow:
                raise HTTPException(status_code=404, detail="Submission not in workflow")

            stage = workflow['current_stage']

            # Validate vote type for stage
            valid_votes = {
                'pre_screen': ['pursue', 'pass', 'unsure'],
                'formal': ['approve', 'decline', 'send_back']
            }

            if stage not in valid_votes:
                raise HTTPException(status_code=400, detail=f"Cannot vote in stage: {stage}")

            if vote_request.vote not in valid_votes[stage]:
                raise HTTPException(status_code=400,
                    detail=f"Invalid vote '{vote_request.vote}' for stage '{stage}'. Valid: {valid_votes[stage]}")

            # Generate user_id if not provided
            user_id = vote_request.user_id or str(uuid.uuid4())

            # Record the vote using the database function
            cur.execute("""
                SELECT record_vote(%s, %s, %s, %s, %s, %s, %s) as result
            """, (
                submission_id,
                stage,
                user_id,
                vote_request.user_name,
                vote_request.vote,
                vote_request.comment,
                vote_request.reasons
            ))
            result = cur.fetchone()['result']

            conn.commit()

            # If threshold met, auto-advance stage
            if result.get('threshold_met'):
                winning_vote = result.get('winning_vote')
                next_stage = None
                final_decision = None

                if stage == 'pre_screen':
                    if winning_vote == 'pursue':
                        next_stage = 'uw_work'
                    elif winning_vote == 'pass':
                        next_stage = 'complete'
                        final_decision = 'pending_decline'  # Not 'declined' yet - needs UW review
                elif stage == 'formal':
                    if winning_vote == 'approve':
                        next_stage = 'complete'
                        final_decision = 'quoted'
                    elif winning_vote == 'decline':
                        next_stage = 'complete'
                        final_decision = 'declined'
                    elif winning_vote == 'send_back':
                        next_stage = 'uw_work'

                if next_stage:
                    cur.execute("""
                        SELECT advance_workflow_stage(%s, %s, %s, %s, %s, %s)
                    """, (
                        submission_id,
                        next_stage,
                        'vote_threshold',
                        Json(result),
                        user_id,
                        vote_request.user_name
                    ))

                    # Update final decision if completing
                    if final_decision:
                        cur.execute("""
                            UPDATE submission_workflow
                            SET completed_at = now(),
                                final_decision = %s
                            WHERE submission_id = %s
                        """, (final_decision, submission_id))

                        # Also update the submission status
                        cur.execute("""
                            UPDATE submissions
                            SET submission_status = %s
                            WHERE id = %s
                        """, (final_decision, submission_id))

                        # If pending_decline, create pending decline record with aggregated reasons
                        if final_decision == 'pending_decline':
                            # Get all decline reasons from pass voters
                            cur.execute("""
                                SELECT DISTINCT unnest(reasons) as reason
                                FROM workflow_votes
                                WHERE submission_id = %s AND stage = 'pre_screen' AND vote = 'pass'
                                  AND reasons IS NOT NULL
                            """, (submission_id,))
                            all_reasons = [r['reason'] for r in cur.fetchall()]

                            # Get comments from pass voters as additional notes
                            cur.execute("""
                                SELECT user_name, comment
                                FROM workflow_votes
                                WHERE submission_id = %s AND stage = 'pre_screen' AND vote = 'pass'
                                  AND comment IS NOT NULL AND comment != ''
                            """, (submission_id,))
                            comments = [f"{r['user_name']}: {r['comment']}" for r in cur.fetchall()]
                            additional_notes = "\n".join(comments) if comments else None

                            # Create pending decline
                            cur.execute("""
                                INSERT INTO pending_declines (submission_id, decline_reasons, additional_notes)
                                VALUES (%s, %s, %s)
                                ON CONFLICT (submission_id) DO UPDATE
                                SET decline_reasons = EXCLUDED.decline_reasons,
                                    additional_notes = EXCLUDED.additional_notes,
                                    status = 'pending',
                                    updated_at = now()
                            """, (submission_id, all_reasons or ['No specific reason provided'], additional_notes))

                    conn.commit()
                    result['stage_advanced'] = True
                    result['new_stage'] = next_stage
                    result['final_decision'] = final_decision

            return result


@app.post("/api/workflow/{submission_id}/claim")
def claim_submission_for_work(submission_id: str, claim: ClaimRequest):
    """Claim a submission for UW work."""
    import uuid

    with get_conn() as conn:
        with conn.cursor() as cur:
            user_id = claim.user_id or str(uuid.uuid4())

            try:
                cur.execute("""
                    SELECT claim_submission(%s, %s, %s)
                """, (submission_id, user_id, claim.user_name))
                conn.commit()

                return {
                    "status": "claimed",
                    "submission_id": submission_id,
                    "claimed_by": claim.user_name
                }
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workflow/{submission_id}/unclaim")
def unclaim_submission(submission_id: str, claim: ClaimRequest):
    """Release a claimed submission back to the queue."""
    import uuid

    with get_conn() as conn:
        with conn.cursor() as cur:
            user_id = claim.user_id or str(uuid.uuid4())

            try:
                cur.execute("""
                    SELECT unclaim_submission(%s, %s, %s)
                """, (submission_id, user_id, claim.user_name))
                conn.commit()

                return {
                    "status": "unclaimed",
                    "submission_id": submission_id,
                    "released_by": claim.user_name
                }
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workflow/{submission_id}/start-prescreen")
def start_prescreen(submission_id: str):
    """Move a submission from intake to pre-screen (called after AI extraction)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check current stage
            cur.execute("""
                SELECT current_stage FROM submission_workflow
                WHERE submission_id = %s
            """, (submission_id,))
            row = cur.fetchone()

            if not row:
                # Initialize workflow if not exists
                cur.execute("SELECT init_submission_workflow(%s)", (submission_id,))
                row = {'current_stage': 'intake'}

            if row['current_stage'] != 'intake':
                raise HTTPException(status_code=400,
                    detail=f"Submission is in '{row['current_stage']}', not intake")

            # Advance to pre-screen
            cur.execute("""
                SELECT advance_workflow_stage(%s, %s, %s, %s, %s, %s)
            """, (
                submission_id,
                'pre_screen',
                'ai_complete',
                Json({'triggered_by': 'system'}),
                None,
                None
            ))

            conn.commit()

            return {
                "status": "started",
                "submission_id": submission_id,
                "new_stage": "pre_screen"
            }


@app.post("/api/workflow/{submission_id}/submit-for-review")
def submit_for_formal_review(submission_id: str, request: SubmitForReviewRequest):
    """Submit UW work for formal team review."""
    import uuid

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify submission is in uw_work stage and claimed by this user
            cur.execute("""
                SELECT current_stage, assigned_uw_name
                FROM submission_workflow
                WHERE submission_id = %s
            """, (submission_id,))
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Submission not in workflow")

            if row['current_stage'] != 'uw_work':
                raise HTTPException(status_code=400,
                    detail=f"Submission is in '{row['current_stage']}', not uw_work")

            if row['assigned_uw_name'] != request.user_name:
                raise HTTPException(status_code=400,
                    detail=f"Submission is assigned to {row['assigned_uw_name']}, not you")

            user_id = request.user_id or str(uuid.uuid4())

            # Save the recommendation
            cur.execute("""
                INSERT INTO uw_recommendations (
                    submission_id, uw_id, uw_name, recommendation, summary,
                    suggested_premium, suggested_terms, decline_reasons, submitted_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (submission_id) DO UPDATE SET
                    recommendation = EXCLUDED.recommendation,
                    summary = EXCLUDED.summary,
                    suggested_premium = EXCLUDED.suggested_premium,
                    suggested_terms = EXCLUDED.suggested_terms,
                    decline_reasons = EXCLUDED.decline_reasons,
                    submitted_at = now()
            """, (
                submission_id,
                user_id,
                request.user_name,
                request.recommendation,
                request.summary,
                request.suggested_premium,
                Json(request.suggested_terms) if request.suggested_terms else None,
                request.decline_reasons
            ))

            # Advance to formal review
            cur.execute("""
                SELECT advance_workflow_stage(%s, %s, %s, %s, %s, %s)
            """, (
                submission_id,
                'formal',
                'submitted_for_review',
                Json({
                    'recommendation': request.recommendation,
                    'submitted_by': request.user_name
                }),
                user_id,
                request.user_name
            ))

            # The submitter automatically gets a vote as "recommender"
            cur.execute("""
                INSERT INTO workflow_votes (
                    submission_id, stage, user_id, user_name, vote, comment, is_recommender
                ) VALUES (%s, 'formal', %s, %s, %s, %s, true)
                ON CONFLICT (submission_id, stage, user_id) DO UPDATE SET
                    vote = EXCLUDED.vote,
                    comment = EXCLUDED.comment,
                    is_recommender = true
            """, (
                submission_id,
                user_id,
                request.user_name,
                'approve' if request.recommendation == 'quote' else 'decline',
                request.summary
            ))

            conn.commit()

            return {
                "status": "submitted",
                "submission_id": submission_id,
                "new_stage": "formal",
                "recommendation": request.recommendation
            }


# ─────────────────────────────────────────────────────────────
# Workflow Notifications
# ─────────────────────────────────────────────────────────────

@app.get("/api/workflow/notifications")
def get_notifications(user_name: str, unread_only: bool = False):
    """Get notifications for a user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT
                    id, type, title, body, submission_id, workflow_stage,
                    priority, read_at, acted_at, created_at, expires_at
                FROM workflow_notifications
                WHERE user_email = %s OR user_id::text = %s
            """
            if unread_only:
                query += " AND read_at IS NULL"
            query += " ORDER BY created_at DESC LIMIT 50"

            cur.execute(query, (user_name, user_name))
            notifications = cur.fetchall()

            # Count unread
            cur.execute("""
                SELECT COUNT(*) as unread_count
                FROM workflow_notifications
                WHERE (user_email = %s OR user_id::text = %s)
                  AND read_at IS NULL
            """, (user_name, user_name))
            unread_count = cur.fetchone()['unread_count']

            return {
                "notifications": notifications,
                "unread_count": unread_count
            }


@app.post("/api/workflow/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str):
    """Mark a notification as read."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE workflow_notifications
                SET read_at = now()
                WHERE id = %s AND read_at IS NULL
                RETURNING id
            """, (notification_id,))
            result = cur.fetchone()
            conn.commit()

            if not result:
                raise HTTPException(status_code=404, detail="Notification not found or already read")

            return {"status": "read", "notification_id": notification_id}


@app.post("/api/workflow/notifications/read-all")
def mark_all_notifications_read(user_name: str):
    """Mark all notifications as read for a user."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE workflow_notifications
                SET read_at = now()
                WHERE (user_email = %s OR user_id::text = %s)
                  AND read_at IS NULL
                RETURNING id
            """, (user_name, user_name))
            count = cur.rowcount
            conn.commit()

            return {"status": "read", "count": count}


# ─────────────────────────────────────────────────────────────
# UW Recommendations
# ─────────────────────────────────────────────────────────────

@app.get("/api/workflow/{submission_id}/recommendation")
def get_uw_recommendation(submission_id: str):
    """Get the UW recommendation for a submission."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id, uw_name, recommendation, summary,
                    suggested_premium, suggested_terms, decline_reasons,
                    work_started_at, work_minutes, submitted_at
                FROM uw_recommendations
                WHERE submission_id = %s
                ORDER BY submitted_at DESC
                LIMIT 1
            """, (submission_id,))
            rec = cur.fetchone()

            if not rec:
                return {"recommendation": None}

            return {"recommendation": rec}


# ─────────────────────────────────────────────────────────────
# Pending Declines
# ─────────────────────────────────────────────────────────────

@app.get("/api/pending-declines")
def list_pending_declines():
    """List pending declines awaiting review."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    pd.id,
                    pd.submission_id,
                    s.applicant_name,
                    s.broker_email,
                    b.company_name as broker_company,
                    pd.decline_reasons,
                    pd.additional_notes,
                    pd.status,
                    pd.created_at,
                    pd.reviewed_by_name,
                    pd.reviewed_at,
                    EXTRACT(EPOCH FROM (now() - pd.created_at)) / 3600 as hours_pending
                FROM pending_declines pd
                JOIN submissions s ON s.id = pd.submission_id
                LEFT JOIN brokers b ON b.id = s.broker_id
                WHERE pd.status = 'pending'
                ORDER BY pd.created_at
            """)
            return cur.fetchall()


@app.get("/api/pending-declines/{decline_id}")
def get_pending_decline(decline_id: str):
    """Get a specific pending decline."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    pd.*,
                    s.applicant_name,
                    s.broker_email,
                    s.naics_primary_title,
                    s.annual_revenue,
                    b.company_name as broker_company,
                    b.contact_email as broker_contact
                FROM pending_declines pd
                JOIN submissions s ON s.id = pd.submission_id
                LEFT JOIN brokers b ON b.id = s.broker_id
                WHERE pd.id = %s
            """, (decline_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Pending decline not found")
            return row


class UpdatePendingDeclineRequest(BaseModel):
    decline_reasons: Optional[List[str]] = None
    additional_notes: Optional[str] = None
    decline_letter: Optional[str] = None
    reviewed_by_name: Optional[str] = None


@app.patch("/api/pending-declines/{decline_id}")
def update_pending_decline(decline_id: str, data: UpdatePendingDeclineRequest):
    """Update a pending decline (edit reasons, letter, mark reviewed)."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # If reviewed_by_name is provided, mark as reviewed
    if 'reviewed_by_name' in updates:
        updates['reviewed_at'] = 'now()'
        updates['status'] = 'reviewed'

    updates['updated_at'] = 'now()'

    # Build SQL - handle the now() special case
    set_parts = []
    values = []
    for k, v in updates.items():
        if v == 'now()':
            set_parts.append(f"{k} = now()")
        else:
            set_parts.append(f"{k} = %s")
            values.append(v)

    set_clause = ", ".join(set_parts)
    values.append(decline_id)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE pending_declines SET {set_clause} WHERE id = %s RETURNING id",
                values
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Pending decline not found")
            conn.commit()

    return {"status": "updated", "id": decline_id}


class SendDeclineRequest(BaseModel):
    user_name: str


@app.post("/api/pending-declines/{decline_id}/send")
def send_decline(decline_id: str, data: SendDeclineRequest):
    """Mark decline as sent and finalize the submission status."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get the pending decline
            cur.execute("""
                SELECT submission_id, status
                FROM pending_declines
                WHERE id = %s
            """, (decline_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Pending decline not found")

            if row['status'] == 'sent':
                raise HTTPException(status_code=400, detail="Decline already sent")

            submission_id = row['submission_id']

            # Update pending decline status to sent
            cur.execute("""
                UPDATE pending_declines
                SET status = 'sent',
                    sent_at = now(),
                    sent_by_name = %s,
                    updated_at = now()
                WHERE id = %s
            """, (data.user_name, decline_id))

            # Update submission status from pending_decline to declined
            cur.execute("""
                UPDATE submissions
                SET submission_status = 'declined'
                WHERE id = %s
            """, (submission_id,))

            # Update workflow final_decision to declined
            cur.execute("""
                UPDATE submission_workflow
                SET final_decision = 'declined'
                WHERE submission_id = %s
            """, (submission_id,))

            conn.commit()

            return {
                "status": "sent",
                "submission_id": submission_id,
                "message": "Decline sent to broker"
            }


@app.post("/api/pending-declines/{decline_id}/cancel")
def cancel_pending_decline(decline_id: str, user_name: str):
    """Cancel a pending decline (if team decides to pursue after all)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get the pending decline
            cur.execute("""
                SELECT submission_id, status
                FROM pending_declines
                WHERE id = %s
            """, (decline_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Pending decline not found")

            if row['status'] == 'sent':
                raise HTTPException(status_code=400, detail="Cannot cancel - decline already sent")

            submission_id = row['submission_id']

            # Update pending decline status to cancelled
            cur.execute("""
                UPDATE pending_declines
                SET status = 'cancelled',
                    updated_at = now()
                WHERE id = %s
            """, (decline_id,))

            # Move submission back to uw_work stage
            cur.execute("""
                UPDATE submission_workflow
                SET current_stage = 'uw_work',
                    stage_entered_at = now(),
                    completed_at = NULL,
                    final_decision = NULL,
                    updated_at = now()
                WHERE submission_id = %s
            """, (submission_id,))

            # Update submission status back to received
            cur.execute("""
                UPDATE submissions
                SET submission_status = 'received'
                WHERE id = %s
            """, (submission_id,))

            # Log transition
            cur.execute("""
                INSERT INTO workflow_transitions (
                    submission_id, from_stage, to_stage, trigger,
                    trigger_details, triggered_by_user_name
                )
                VALUES (%s, 'complete', 'uw_work', 'decline_cancelled',
                        %s, %s)
            """, (submission_id, Json({'cancelled_by': user_name}), user_name))

            conn.commit()

            return {
                "status": "cancelled",
                "submission_id": submission_id,
                "message": "Decline cancelled - submission moved back to UW work"
            }


# ─────────────────────────────────────────────────────────────
# Field Verifications (SetupPage HITL workflow)
# ─────────────────────────────────────────────────────────────

REQUIRED_VERIFICATION_FIELDS = [
    "company_name",
    "revenue",
    "business_description",
    "website",
    "broker",
    "policy_period",
    "industry",
]


@app.get("/api/submissions/{submission_id}/verifications")
def get_field_verifications(submission_id: str):
    """
    Get verification status for all fields on a submission.
    Returns both the verification records and progress stats.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get all verifications for this submission
            cur.execute("""
                SELECT field_name, status, original_value, corrected_value,
                       verified_by, verified_at
                FROM field_verifications
                WHERE submission_id = %s
            """, (submission_id,))
            rows = cur.fetchall()

            # Build verifications dict
            verifications = {}
            for row in rows:
                verifications[row["field_name"]] = {
                    "status": row["status"],
                    "original_value": row["original_value"],
                    "corrected_value": row["corrected_value"],
                    "verified_by": row["verified_by"],
                    "verified_at": row["verified_at"].isoformat() if row["verified_at"] else None,
                }

            # Calculate progress for required fields
            completed = sum(
                1 for f in REQUIRED_VERIFICATION_FIELDS
                if f in verifications and verifications[f]["status"] in ("confirmed", "corrected")
            )

            return {
                "verifications": verifications,
                "progress": {
                    "completed": completed,
                    "total": len(REQUIRED_VERIFICATION_FIELDS),
                    "required_fields": REQUIRED_VERIFICATION_FIELDS,
                }
            }


class FieldVerificationUpdate(BaseModel):
    status: str  # 'confirmed' or 'corrected'
    original_value: Optional[str] = None
    corrected_value: Optional[str] = None
    verified_by: Optional[str] = None


@app.patch("/api/submissions/{submission_id}/verifications/{field_name}")
def update_field_verification(
    submission_id: str,
    field_name: str,
    data: FieldVerificationUpdate
):
    """
    Update verification status for a single field.
    Creates record if doesn't exist, updates if it does.
    Also updates the submission field if corrected.
    """
    if data.status not in ("confirmed", "corrected", "pending"):
        raise HTTPException(status_code=400, detail="Invalid status")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Upsert the verification record
            cur.execute("""
                INSERT INTO field_verifications (
                    submission_id, field_name, status,
                    original_value, corrected_value, verified_by
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (submission_id, field_name)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    corrected_value = EXCLUDED.corrected_value,
                    verified_by = EXCLUDED.verified_by,
                    verified_at = NOW()
                RETURNING *
            """, (
                submission_id,
                field_name,
                data.status,
                data.original_value,
                data.corrected_value,
                data.verified_by,
            ))
            verification = cur.fetchone()

            # If corrected, also update the actual submission field
            if data.status == "corrected" and data.corrected_value is not None:
                field_mapping = {
                    "company_name": "applicant_name",
                    "revenue": "annual_revenue",
                    "business_description": "business_summary",
                    "website": "website",
                    "industry": "naics_primary_title",
                    # broker and policy_period are compound - handle separately
                }
                if field_name in field_mapping:
                    col = field_mapping[field_name]
                    # Special handling for revenue (integer)
                    if field_name == "revenue":
                        try:
                            val = int(data.corrected_value.replace(",", "").replace("$", ""))
                        except ValueError:
                            val = data.corrected_value
                    else:
                        val = data.corrected_value

                    cur.execute(f"""
                        UPDATE submissions
                        SET {col} = %s
                        WHERE id = %s
                    """, (val, submission_id))

            conn.commit()

            return {
                "field_name": field_name,
                "status": verification["status"],
                "verified_at": verification["verified_at"].isoformat() if verification["verified_at"] else None,
            }


# ─────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
