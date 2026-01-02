"""
FastAPI backend for the React frontend.
Exposes the existing database and business logic via REST API.
"""
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any
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
                       submission_status, submission_outcome, outcome_reason,
                       bullet_point_summary, nist_controls_summary,
                       hazard_override, control_overrides, default_retroactive_date,
                       ai_recommendation, ai_guideline_citations,
                       decision_tag, decision_reason, decided_at, decided_by,
                       cyber_exposures, nist_controls,
                       website, broker_email,
                       effective_date, expiration_date,
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
                doc = {
                    "id": str(r["id"]),
                    "filename": r["filename"],
                    "type": r["document_type"],
                    "page_count": r["page_count"],
                    "is_priority": r["is_priority"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "url": None,  # Will be populated if storage is configured
                }

                # Generate signed URL if document has storage_key
                if use_storage and r["doc_metadata"]:
                    metadata = r["doc_metadata"] if isinstance(r["doc_metadata"], dict) else {}
                    storage_key = metadata.get("storage_key")
                    if storage_key:
                        try:
                            doc["url"] = get_document_url(storage_key, expires_sec=3600)
                        except Exception as e:
                            print(f"[api] Failed to get URL for {r['filename']}: {e}")

                documents.append(doc)

            return {
                "count": len(documents),
                "documents": documents,
            }


# ─────────────────────────────────────────────────────────────
# Document Extraction Endpoints
# ─────────────────────────────────────────────────────────────

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

            # Get all extractions grouped by section
            cur.execute("""
                SELECT
                    field_name,
                    extracted_value,
                    confidence,
                    source_text,
                    source_page,
                    is_present,
                    model_used,
                    created_at
                FROM extraction_provenance
                WHERE submission_id = %s
                ORDER BY field_name
            """, (submission_id,))
            rows = cur.fetchall()

            # Group by section
            sections = {}
            for row in rows:
                parts = row["field_name"].split(".", 1)
                section = parts[0] if len(parts) > 1 else "other"
                field = parts[1] if len(parts) > 1 else parts[0]

                if section not in sections:
                    sections[section] = {}

                sections[section][field] = {
                    "value": row["extracted_value"],
                    "confidence": float(row["confidence"]) if row["confidence"] else None,
                    "source_text": row["source_text"],
                    "page": row["source_page"],
                    "is_present": row["is_present"],
                }

            return {
                "has_extractions": len(rows) > 0,
                "summary": {
                    "total_fields": summary["total_fields"] if summary else 0,
                    "fields_present": summary["fields_present"] if summary else 0,
                    "high_confidence": summary["high_confidence"] if summary else 0,
                    "low_confidence": summary["low_confidence"] if summary else 0,
                    "avg_confidence": float(summary["avg_confidence"]) if summary and summary["avg_confidence"] else None,
                },
                "sections": sections,
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
                    SELECT id, filename, file_path, storage_path
                    FROM documents
                    WHERE id = %s AND submission_id = %s
                """, (document_id, submission_id))
            else:
                # Get the primary document (is_priority=true) or most recent
                cur.execute("""
                    SELECT id, filename, file_path, storage_path
                    FROM documents
                    WHERE submission_id = %s
                    ORDER BY is_priority DESC, created_at DESC
                    LIMIT 1
                """, (submission_id,))

            doc = cur.fetchone()
            if not doc:
                raise HTTPException(status_code=404, detail="No document found for extraction")

            # Determine file path
            file_path = doc.get("file_path") or doc.get("storage_path")
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

                # Save provenance records
                for record in result.to_provenance_records(submission_id):
                    cur.execute("""
                        INSERT INTO extraction_provenance
                        (submission_id, field_name, extracted_value, confidence,
                         source_document_id, source_page, source_text, is_present, model_used)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (submission_id, field_name)
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
# Health Check
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
