"""
Extraction Orchestrator

Coordinates document extraction using the intelligent routing system:
1. Routes documents to appropriate extraction strategy based on type
2. Uses policy form catalog for "extract once, reuse forever"
3. Saves fill-in values and declarations with bounding boxes

This module integrates:
- core/document_router.py - Routing decisions
- core/policy_catalog.py - Form catalog management
- ai/textract_extractor.py - AWS Textract extraction
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass

from sqlalchemy import text
from core.db import get_conn
from core.document_router import (
    route_document,
    ExtractionStrategy,
    ExtractionPlan,
    detect_form_numbers,
    find_key_pages,
    COST_PER_PAGE,
)
from core.policy_catalog import (
    match_form,
    lookup_forms_batch,
    process_policy_document,
    save_fill_in_values,
    save_declarations,
    FillInValue,
    PolicyExtractionResult,
    get_catalog_stats,
)


# ─────────────────────────────────────────────────────────────────────────────
# Extraction Logging
# ─────────────────────────────────────────────────────────────────────────────

def _start_extraction_log(
    document_id: str,
    filename: str,
    document_type: str,
    strategy: str,
    pages_total: int,
    estimated_cost: float,
    submission_id: Optional[str] = None,
) -> str:
    """Create an extraction log entry and return the log ID."""
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO extraction_logs (
                document_id, submission_id, filename, document_type,
                strategy, pages_total, estimated_cost, status
            ) VALUES (
                :document_id, :submission_id, :filename, :document_type,
                :strategy, :pages_total, :estimated_cost, 'started'
            )
            RETURNING id
        """), {
            "document_id": document_id,
            "submission_id": submission_id,
            "filename": filename,
            "document_type": document_type,
            "strategy": strategy,
            "pages_total": pages_total,
            "estimated_cost": estimated_cost,
        })
        return str(result.fetchone()[0])


def _complete_extraction_log(
    log_id: str,
    pages_processed: int,
    actual_cost: float,
    duration_ms: int,
    key_value_pairs_count: int = 0,
    checkboxes_count: int = 0,
    form_numbers_found: Optional[List[str]] = None,
    forms_matched: int = 0,
    forms_queued: int = 0,
    phases_executed: Optional[List[str]] = None,
    is_scanned: bool = False,
    ocr_confidence: Optional[float] = None,
) -> None:
    """Mark an extraction log as completed."""
    with get_conn() as conn:
        conn.execute(text("""
            UPDATE extraction_logs SET
                pages_processed = :pages_processed,
                actual_cost = :actual_cost,
                duration_ms = :duration_ms,
                completed_at = NOW(),
                status = 'completed',
                key_value_pairs_count = :kv_count,
                checkboxes_count = :cb_count,
                form_numbers_found = :forms_found,
                forms_matched = :forms_matched,
                forms_queued = :forms_queued,
                phases_executed = :phases,
                is_scanned = :is_scanned,
                ocr_confidence = :ocr_confidence
            WHERE id = :log_id
        """), {
            "log_id": log_id,
            "pages_processed": pages_processed,
            "actual_cost": actual_cost,
            "duration_ms": duration_ms,
            "kv_count": key_value_pairs_count,
            "cb_count": checkboxes_count,
            "forms_found": form_numbers_found,
            "forms_matched": forms_matched,
            "forms_queued": forms_queued,
            "phases": phases_executed,
            "is_scanned": is_scanned,
            "ocr_confidence": ocr_confidence,
        })


def _fail_extraction_log(log_id: str, error_message: str, duration_ms: int = 0) -> None:
    """Mark an extraction log as failed."""
    with get_conn() as conn:
        conn.execute(text("""
            UPDATE extraction_logs SET
                completed_at = NOW(),
                duration_ms = :duration_ms,
                status = 'failed',
                error_message = :error_message
            WHERE id = :log_id
        """), {
            "log_id": log_id,
            "duration_ms": duration_ms,
            "error_message": error_message[:1000],  # Truncate long errors
        })


def get_extraction_stats(days: int = 30) -> Dict[str, Any]:
    """
    Get extraction statistics for monitoring and cost tracking.

    Returns summary of extractions by strategy, cost, and success rate.
    """
    with get_conn() as conn:
        # Overall stats
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_extractions,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                SUM(pages_processed) as total_pages,
                SUM(actual_cost) as total_cost,
                AVG(duration_ms) as avg_duration_ms
            FROM extraction_logs
            WHERE created_at > NOW() - INTERVAL ':days days'
        """.replace(':days', str(days))))
        overall = dict(result.mappings().fetchone())

        # By strategy
        result = conn.execute(text("""
            SELECT
                strategy,
                COUNT(*) as extractions,
                SUM(pages_processed) as pages,
                SUM(actual_cost) as cost,
                AVG(duration_ms) as avg_duration_ms,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM extraction_logs
            WHERE created_at > NOW() - INTERVAL ':days days'
            GROUP BY strategy
            ORDER BY extractions DESC
        """.replace(':days', str(days))))
        by_strategy = [dict(row) for row in result.mappings()]

        # Recent extractions
        result = conn.execute(text("""
            SELECT
                filename,
                document_type,
                strategy,
                pages_processed,
                actual_cost,
                duration_ms,
                status,
                created_at
            FROM extraction_logs
            ORDER BY created_at DESC
            LIMIT 10
        """))
        recent = [dict(row) for row in result.mappings()]

        return {
            "period_days": days,
            "overall": overall,
            "by_strategy": by_strategy,
            "recent": recent,
        }


@dataclass
class ExtractionResult:
    """Result of extracting a document."""
    document_id: str
    document_type: str
    strategy_used: str
    pages_extracted: int
    cost: float
    raw_text: Optional[str] = None
    key_value_pairs: Optional[Dict] = None
    checkboxes: Optional[List[Dict]] = None
    form_matches: Optional[Dict] = None
    declarations: Optional[Dict] = None
    fill_ins: Optional[List[Dict]] = None
    errors: Optional[List[str]] = None
    is_scanned: bool = False  # True if document required OCR
    ocr_confidence: Optional[float] = None  # OCR confidence (0-1)


def extract_document(
    document_id: str,
    file_path: str,
    doc_type: str,
    submission_id: Optional[str] = None,
    carrier: Optional[str] = None,
) -> ExtractionResult:
    """
    Extract a document using the intelligent routing system.

    This is the main entry point for document extraction:
    1. Routes document to appropriate extraction strategy
    2. Executes extraction (Textract or other)
    3. For policy documents, integrates with form catalog
    4. Saves results to database
    5. Logs extraction for cost tracking and debugging

    Args:
        document_id: Database ID of the document
        file_path: Path to the document file
        doc_type: Document type classification
        submission_id: Optional submission context
        carrier: Optional carrier name (helps with form matching)

    Returns:
        ExtractionResult with all extracted data
    """
    from pathlib import Path
    import fitz  # PyMuPDF for page count
    import time

    errors = []
    filename = Path(file_path).name
    start_time = time.time()

    # Get page count
    try:
        pdf = fitz.open(file_path)
        page_count = len(pdf)
        pdf.close()
    except Exception as e:
        errors.append(f"Failed to get page count: {e}")
        page_count = 1

    # Route document to appropriate strategy
    plan = route_document(
        doc_type=doc_type,
        page_count=page_count,
        filename=filename,
    )

    print(f"[orchestrator] Document {filename}: {doc_type} ({page_count} pages)")
    print(f"[orchestrator] Strategy: {plan.strategy.value} (est. ${plan.estimated_cost:.3f})")

    # Start extraction log
    log_id = None
    try:
        log_id = _start_extraction_log(
            document_id=document_id,
            filename=filename,
            document_type=doc_type,
            strategy=plan.strategy.value,
            pages_total=page_count,
            estimated_cost=plan.estimated_cost,
            submission_id=submission_id,
        )
    except Exception as e:
        print(f"[orchestrator] Warning: Failed to create extraction log: {e}")

    # Execute extraction based on strategy
    try:
        if plan.strategy == ExtractionStrategy.TEXTRACT_FORMS:
            result = _extract_with_textract_forms(
                document_id=document_id,
                file_path=file_path,
                plan=plan,
                submission_id=submission_id,
            )
        elif plan.strategy == ExtractionStrategy.TEXTRACT_TABLES:
            result = _extract_with_textract_tables(
                document_id=document_id,
                file_path=file_path,
                plan=plan,
                submission_id=submission_id,
            )
        elif plan.strategy == ExtractionStrategy.TIERED_POLICY:
            result = _extract_tiered_policy(
                document_id=document_id,
                file_path=file_path,
                plan=plan,
                submission_id=submission_id,
                carrier=carrier,
            )
        elif plan.strategy == ExtractionStrategy.QUOTE_ADAPTIVE:
            result = _extract_quote_adaptive(
                document_id=document_id,
                file_path=file_path,
                plan=plan,
                submission_id=submission_id,
                carrier=carrier,
            )
        else:
            # Default: Claude Vision (handled by existing pipeline)
            result = ExtractionResult(
                document_id=document_id,
                document_type=doc_type,
                strategy_used=plan.strategy.value,
                pages_extracted=page_count,
                cost=plan.estimated_cost,
            )

        result.errors = errors

        # Complete extraction log
        duration_ms = int((time.time() - start_time) * 1000)
        if log_id:
            try:
                form_matches = result.form_matches or {}
                _complete_extraction_log(
                    log_id=log_id,
                    pages_processed=result.pages_extracted,
                    actual_cost=result.cost,
                    duration_ms=duration_ms,
                    key_value_pairs_count=len(result.key_value_pairs) if result.key_value_pairs else 0,
                    checkboxes_count=len(result.checkboxes) if result.checkboxes else 0,
                    form_numbers_found=list(form_matches.keys()) if form_matches else None,
                    forms_matched=sum(1 for s in form_matches.values() if s == "matched"),
                    forms_queued=sum(1 for s in form_matches.values() if s in ("queued", "queued_new", "queued_for_extraction")),
                    is_scanned=result.is_scanned,
                    ocr_confidence=result.ocr_confidence,
                )
            except Exception as e:
                print(f"[orchestrator] Warning: Failed to complete extraction log: {e}")

        return result

    except Exception as e:
        # Log failure
        duration_ms = int((time.time() - start_time) * 1000)
        if log_id:
            try:
                _fail_extraction_log(log_id, str(e), duration_ms)
            except Exception:
                pass
        raise


def _save_textract_bbox_data(document_id: str, key_value_pairs: dict) -> Dict[str, Dict]:
    """
    Save Textract key-value pairs with bbox to textract_extractions table.
    Returns a mapping of field_key -> {id, value, page, bbox} for Claude to reference.
    """
    from core.db import get_conn

    if not key_value_pairs:
        return {}

    textract_map: Dict[str, Dict] = {}

    try:
        with get_conn() as conn:
            # Clear existing extractions for this document
            conn.execute(
                text("DELETE FROM textract_extractions WHERE document_id = :doc_id"),
                {"doc_id": document_id}
            )

            # Insert new extractions and capture IDs
            for field_key, data in key_value_pairs.items():
                bbox = data.get("bbox", {})
                result = conn.execute(
                    text("""
                        INSERT INTO textract_extractions
                        (document_id, page_number, field_key, field_value, field_type,
                         bbox_left, bbox_top, bbox_width, bbox_height, confidence)
                        VALUES (:doc_id, :page, :key, :value, :type,
                                :left, :top, :width, :height, :conf)
                        RETURNING id
                    """),
                    {
                        "doc_id": document_id,
                        "page": data.get("page", 1),
                        "key": field_key,
                        "value": str(data.get("value", "")) if data.get("value") is not None else None,
                        "type": data.get("type", "text"),
                        "left": bbox.get("left"),
                        "top": bbox.get("top"),
                        "width": bbox.get("width"),
                        "height": bbox.get("height"),
                        "conf": data.get("confidence"),
                    }
                )
                textract_id = str(result.fetchone()[0])

                # Build mapping for Claude to reference
                textract_map[field_key] = {
                    "id": textract_id,
                    "value": data.get("value"),
                    "page": data.get("page", 1),
                    "bbox": bbox,
                }
            conn.commit()
            print(f"[orchestrator] Saved {len(key_value_pairs)} bbox entries for document {document_id}")
    except Exception as e:
        print(f"[orchestrator] Failed to save bbox data: {e}")

    return textract_map


def _extract_with_textract_forms(
    document_id: str,
    file_path: str,
    plan: ExtractionPlan,
    submission_id: Optional[str] = None,
) -> ExtractionResult:
    """
    Extract using Textract Forms feature.
    Best for: Applications, forms with checkboxes.
    """
    from ai.textract_extractor import extract_from_pdf

    try:
        textract_result = extract_from_pdf(file_path)

        # Save bbox data to database for highlighting
        _save_textract_bbox_data(document_id, textract_result.key_value_pairs)

        return ExtractionResult(
            document_id=document_id,
            document_type="application",
            strategy_used=plan.strategy.value,
            pages_extracted=textract_result.pages,
            cost=textract_result.pages * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS],
            raw_text=textract_result.raw_text,
            key_value_pairs=textract_result.key_value_pairs,
            checkboxes=[cb.__dict__ for cb in textract_result.checkboxes] if textract_result.checkboxes else None,
        )

    except Exception as e:
        return ExtractionResult(
            document_id=document_id,
            document_type="application",
            strategy_used=plan.strategy.value,
            pages_extracted=0,
            cost=0,
            errors=[str(e)],
        )


def _extract_with_textract_tables(
    document_id: str,
    file_path: str,
    plan: ExtractionPlan,
    submission_id: Optional[str] = None,
) -> ExtractionResult:
    """
    Extract using Textract Tables feature.
    Best for: Loss runs, financial statements, schedules.
    """
    # For now, use the same extraction as forms
    # TODO: Implement table-specific extraction when needed
    return _extract_with_textract_forms(document_id, file_path, plan, submission_id)


def _extract_tiered_policy(
    document_id: str,
    file_path: str,
    plan: ExtractionPlan,
    submission_id: Optional[str] = None,
    carrier: Optional[str] = None,
) -> ExtractionResult:
    """
    Tiered extraction for policy documents.

    Phase 1: Cheap scan to find key pages and form numbers (with OCR fallback)
    Phase 2: Full extraction on dec pages
    Phase 3: Full extraction on endorsement fill-ins
    Phase 4: Catalog lookup for known forms
    """
    import fitz
    from ai.ocr_utils import extract_text_with_ocr_fallback, is_pdf_scanned

    errors = []
    total_cost = 0.0
    is_scanned = False
    ocr_confidence = None

    # Phase 1: Cheap scan (extract text only, with OCR fallback)
    print("[orchestrator] Phase 1: Page scan for form numbers and key pages")
    pages_text = []

    try:
        # Check if PDF is scanned
        scanned, total_pages, chars = is_pdf_scanned(file_path)

        if scanned:
            print(f"[orchestrator] Scanned PDF detected, using OCR")
            is_scanned = True

            # Use OCR
            ocr_result = extract_text_with_ocr_fallback(file_path)
            total_cost += ocr_result.extraction_cost
            ocr_confidence = ocr_result.ocr_confidence

            # Split into pages (OCR result includes page markers)
            import re
            page_splits = re.split(r'--- Page \d+ ---', ocr_result.text)
            pages_text = [p.strip() for p in page_splits if p.strip()]

            if not pages_text:
                pages_text = [ocr_result.text]  # Fallback to single page
        else:
            # Standard PyMuPDF extraction
            pdf = fitz.open(file_path)
            for page in pdf:
                pages_text.append(page.get_text())
            pdf.close()

    except Exception as e:
        errors.append(f"Phase 1 scan failed: {e}")
        return ExtractionResult(
            document_id=document_id,
            document_type="policy",
            strategy_used=plan.strategy.value,
            pages_extracted=0,
            cost=0,
            errors=errors,
        )

    # Find key pages and form numbers
    key_pages = find_key_pages(pages_text)
    form_numbers = key_pages.get("form_numbers", [])
    dec_pages = key_pages.get("dec_pages", [1, 2, 3])
    endorsement_pages = key_pages.get("endorsement_pages", [])

    print(f"[orchestrator] Found {len(form_numbers)} form numbers: {form_numbers[:5]}...")
    print(f"[orchestrator] Dec pages: {dec_pages}, Endorsement pages: {len(endorsement_pages)}")

    # Scan cost
    total_cost += len(pages_text) * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_DETECT]

    # Phase 2: Process through policy catalog
    print("[orchestrator] Phase 2: Catalog matching")
    catalog_result = process_policy_document(
        document_id=document_id,
        pages_text=pages_text,
        carrier=carrier,
        submission_id=submission_id,
        save_to_db=True,
    )

    print(f"[orchestrator] Forms in catalog: {catalog_result.forms_in_catalog}")
    print(f"[orchestrator] Forms queued for extraction: {catalog_result.forms_queued}")

    # Phase 3: Extract dec pages with Textract Forms
    print("[orchestrator] Phase 3: Dec page extraction")
    declarations = None
    fill_ins = []

    if dec_pages:
        try:
            from ai.textract_extractor import extract_from_pdf

            # Extract just the dec pages
            textract_result = extract_from_pdf(file_path, max_pages=max(dec_pages))
            total_cost += len(dec_pages) * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS]

            # Parse declarations from key-value pairs
            declarations = _parse_declarations_from_textract(
                textract_result.key_value_pairs,
                carrier=carrier,
            )

            # Save declarations
            if declarations and submission_id:
                save_declarations(
                    document_id=document_id,
                    submission_id=submission_id,
                    **declarations,
                    source_pages=dec_pages,
                    extractor="textract_forms",
                )

        except Exception as e:
            errors.append(f"Dec page extraction failed: {e}")

    # Phase 4: Extract endorsement fill-ins if needed
    if endorsement_pages and catalog_result.forms_queued > 0:
        print(f"[orchestrator] Phase 4: Extracting {len(endorsement_pages)} endorsement pages")
        # For new forms, we need full extraction
        # This would be queued for background processing
        total_cost += len(endorsement_pages) * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS]

    return ExtractionResult(
        document_id=document_id,
        document_type="policy",
        strategy_used=plan.strategy.value,
        pages_extracted=len(pages_text),
        cost=total_cost,
        raw_text="\n\n".join(pages_text),
        form_matches={fn: m.status for fn, m in catalog_result.form_matches.items()},
        declarations=declarations,
        fill_ins=fill_ins,
        errors=errors if errors else None,
        is_scanned=is_scanned,
        ocr_confidence=ocr_confidence,
    )


def _extract_quote_adaptive(
    document_id: str,
    file_path: str,
    plan: ExtractionPlan,
    submission_id: Optional[str] = None,
    carrier: Optional[str] = None,
) -> ExtractionResult:
    """
    Adaptive extraction for quotes.

    Short quotes (<=5 pages): Full Textract Forms (with OCR fallback if scanned)
    Long quotes: Dec pages only + scan for form numbers
    """
    import fitz
    from ai.ocr_utils import is_pdf_scanned, extract_text_with_ocr_fallback

    # Get page count
    pdf = fitz.open(file_path)
    page_count = len(pdf)
    pdf.close()

    if page_count <= 5:
        # Short quote - extract everything
        print(f"[orchestrator] Short quote ({page_count} pages) - full extraction")

        # Check if scanned first
        scanned, _, _ = is_pdf_scanned(file_path)
        if scanned:
            print("[orchestrator] Scanned PDF detected, using OCR for short quote")
            ocr_result = extract_text_with_ocr_fallback(file_path)
            return ExtractionResult(
                document_id=document_id,
                document_type="quote",
                strategy_used=plan.strategy.value,
                pages_extracted=page_count,
                cost=ocr_result.extraction_cost,
                raw_text=ocr_result.text,
                is_scanned=True,
                ocr_confidence=ocr_result.ocr_confidence,
            )

        return _extract_with_textract_forms(document_id, file_path, plan, submission_id)
    else:
        # Long quote - use tiered approach (already handles OCR)
        print(f"[orchestrator] Long quote ({page_count} pages) - tiered extraction")
        return _extract_tiered_policy(document_id, file_path, plan, submission_id, carrier)


def _parse_declarations_from_textract(
    key_value_pairs: Dict,
    carrier: Optional[str] = None,
) -> Optional[Dict]:
    """
    Parse declarations data from Textract key-value pairs.

    Maps common field names to structured dec data.
    """
    if not key_value_pairs:
        return None

    # Field name mappings (Textract key -> dec field)
    field_mappings = {
        # Policy number
        "policy number": "policy_number",
        "policy no": "policy_number",
        "policy #": "policy_number",
        # Named insured
        "named insured": "named_insured",
        "insured": "named_insured",
        "policyholder": "named_insured",
        "applicant": "named_insured",
        # Dates
        "effective date": "effective_date",
        "policy period from": "effective_date",
        "inception date": "effective_date",
        "expiration date": "expiration_date",
        "policy period to": "expiration_date",
        # Limits
        "aggregate limit": "aggregate_limit",
        "policy limit": "policy_limit",
        "each occurrence": "per_occurrence_limit",
        "per occurrence": "per_occurrence_limit",
        # Retention
        "retention": "retention",
        "deductible": "retention",
        "sir": "retention",
        # Premium
        "total premium": "premium_total",
        "premium": "premium_total",
        "annual premium": "premium_total",
    }

    dec = {
        "carrier": carrier,
    }
    limits = {}
    retentions = {}

    for key, value_data in key_value_pairs.items():
        key_lower = key.lower().strip()
        value = value_data.get("value") if isinstance(value_data, dict) else value_data

        # Skip empty values
        if not value or value in ["", "N/A", "n/a"]:
            continue

        # Check for direct field mappings
        for pattern, field in field_mappings.items():
            if pattern in key_lower:
                if "limit" in field:
                    limits[field] = _parse_currency(value)
                elif "retention" in field:
                    retentions["primary"] = _parse_currency(value)
                elif "date" in field:
                    dec[field] = _parse_date(value)
                elif "premium" in field:
                    dec["premium_total"] = _parse_currency(value)
                else:
                    dec[field] = str(value)
                break

    if limits:
        dec["limits"] = limits
    if retentions:
        dec["retentions"] = retentions

    return dec if len(dec) > 1 else None  # More than just carrier


def _parse_currency(value: Any) -> Optional[float]:
    """Parse currency string to float."""
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None

    import re
    # Remove currency symbols and commas
    cleaned = re.sub(r'[$,€£¥\s]', '', value)

    # Handle M/K suffixes
    multiplier = 1
    if cleaned.upper().endswith('M'):
        multiplier = 1_000_000
        cleaned = cleaned[:-1]
    elif cleaned.upper().endswith('K'):
        multiplier = 1_000
        cleaned = cleaned[:-1]

    try:
        return float(cleaned) * multiplier
    except ValueError:
        return None


def _parse_date(value: Any) -> Optional[str]:
    """Parse date string to ISO format."""
    if not isinstance(value, str):
        return None

    from datetime import datetime
    import re

    # Common date patterns
    patterns = [
        (r'(\d{1,2})/(\d{1,2})/(\d{4})', '%m/%d/%Y'),
        (r'(\d{1,2})/(\d{1,2})/(\d{2})', '%m/%d/%y'),
        (r'(\d{4})-(\d{2})-(\d{2})', '%Y-%m-%d'),
        (r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', '%B %d %Y'),
    ]

    for pattern, fmt in patterns:
        match = re.search(pattern, value)
        if match:
            try:
                dt = datetime.strptime(match.group(0).replace(',', ''), fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue

    return value  # Return original if parsing fails


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Integration
# ─────────────────────────────────────────────────────────────────────────────

def process_submission_documents(
    submission_id: str,
    document_classifications: Dict[str, Any],
) -> Dict[str, ExtractionResult]:
    """
    Process all documents in a submission using intelligent routing.

    This is called from the main pipeline after document classification.

    Args:
        submission_id: The submission ID
        document_classifications: Dict mapping file_path to classification result

    Returns:
        Dict mapping document_id to ExtractionResult
    """
    results = {}

    # Get document records from database
    with get_conn() as conn:
        doc_rows = conn.execute(text("""
            SELECT id, filename, document_type, doc_metadata
            FROM documents
            WHERE submission_id = :submission_id
        """), {"submission_id": submission_id}).mappings().fetchall()

    # Build lookup by filename
    docs_by_name = {row["filename"]: dict(row) for row in doc_rows}

    for file_path, classification in document_classifications.items():
        filename = Path(file_path).name
        doc_record = docs_by_name.get(filename)

        if not doc_record:
            print(f"[orchestrator] Skipping {filename} - not in database")
            continue

        document_id = str(doc_record["id"])
        doc_type = classification.document_type.value if hasattr(classification, 'document_type') else str(classification)
        carrier = getattr(classification, 'detected_carrier', None)

        # Skip documents that should use Claude Vision (handled elsewhere)
        strategy_check = route_document(doc_type, page_count=1)
        if strategy_check.strategy == ExtractionStrategy.CLAUDE_VISION:
            print(f"[orchestrator] {filename} uses Claude Vision - skipping Textract")
            continue

        print(f"\n[orchestrator] Processing: {filename}")
        result = extract_document(
            document_id=document_id,
            file_path=file_path,
            doc_type=doc_type,
            submission_id=submission_id,
            carrier=carrier,
        )
        results[document_id] = result

        # Update document record with extraction metadata
        with get_conn() as conn:
            metadata = doc_record.get("doc_metadata") or {}
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            metadata["extraction_strategy"] = result.strategy_used
            metadata["extraction_cost"] = result.cost
            metadata["pages_extracted"] = result.pages_extracted

            # OCR metadata - important for user visibility
            if result.is_scanned:
                metadata["is_scanned"] = True
                metadata["ocr_confidence"] = result.ocr_confidence

            if result.form_matches:
                metadata["form_matches"] = result.form_matches

            conn.execute(text("""
                UPDATE documents
                SET doc_metadata = :metadata,
                    extracted_data = :extracted_data
                WHERE id = :doc_id
            """), {
                "doc_id": document_id,
                "metadata": json.dumps(metadata),
                "extracted_data": json.dumps({
                    "key_value_pairs": result.key_value_pairs,
                    "declarations": result.declarations,
                }) if result.key_value_pairs or result.declarations else None,
            })

    # Print summary
    total_cost = sum(r.cost for r in results.values())
    print(f"\n[orchestrator] Processed {len(results)} documents, total cost: ${total_cost:.3f}")

    # Show catalog stats
    stats = get_catalog_stats()
    print(f"[orchestrator] Catalog: {stats['total_forms']} forms, {stats['queue']['pending']} pending extraction")

    return results


def extract_application_with_bbox(
    document_id: str,
    file_path: str,
    submission_id: Optional[str] = None,
) -> Tuple[Optional[Dict], Dict[str, Dict]]:
    """
    Extract application data using Textract + Claude with bbox linking.

    This runs Textract first to get key-value pairs with bounding boxes,
    saves them to the database, then passes the data to Claude for
    semantic extraction. Claude references which Textract entries
    correspond to each extracted field.

    Args:
        document_id: UUID of the document record
        file_path: Path to the PDF file
        submission_id: Optional submission ID for context

    Returns:
        Tuple of (textract_kv_pairs, textract_map)
        textract_map is dict of field_key -> {id, value, page, bbox}
    """
    from ai.textract_extractor import extract_from_pdf

    textract_map = {}

    try:
        # Step 1: Run Textract to get key-value pairs with bbox
        print(f"[orchestrator] Running Textract on {file_path}...")
        textract_result = extract_from_pdf(file_path)

        # Step 2: Save bbox data and get ID mapping
        textract_map = _save_textract_bbox_data(document_id, textract_result.key_value_pairs)

        print(f"[orchestrator] Saved {len(textract_map)} Textract entries with bbox")

        return textract_result.key_value_pairs, textract_map

    except Exception as e:
        print(f"[orchestrator] Textract extraction failed: {e}")
        return None, {}


def link_provenance_to_textract(submission_id: str) -> int:
    """
    Link extraction_provenance records to textract_extractions using source_text matching.

    This finds provenance records whose source_text matches Textract field_value,
    and sets the textract_extraction_id for direct bbox lookup.

    Args:
        submission_id: The submission ID

    Returns:
        Number of records linked
    """
    linked_count = 0

    try:
        with get_conn() as conn:
            # Get document IDs for this submission
            doc_rows = conn.execute(
                text("""
                    SELECT id FROM documents WHERE submission_id = :sid
                """),
                {"sid": submission_id}
            ).fetchall()

            if not doc_rows:
                return 0

            doc_ids = [str(r[0]) for r in doc_rows]

            # Get all textract extractions for these documents
            # Use a subquery join instead of ANY to avoid UUID casting issues
            textract_rows = conn.execute(
                text("""
                    SELECT te.id, te.document_id, te.page_number, te.field_key, te.field_value
                    FROM textract_extractions te
                    JOIN documents d ON d.id = te.document_id
                    WHERE d.submission_id = :sid AND te.field_value IS NOT NULL
                """),
                {"sid": submission_id}
            ).fetchall()

            if not textract_rows:
                return 0

            # Build lookup dict
            textract_entries = []
            for row in textract_rows:
                textract_entries.append({
                    "id": str(row[0]),
                    "document_id": str(row[1]),
                    "page": row[2],
                    "key": row[3],
                    "value": str(row[4]).lower().strip() if row[4] else "",
                })

            # Get all provenance records for this submission that aren't linked yet
            prov_rows = conn.execute(
                text("""
                    SELECT id, field_name, source_text, source_page, source_document_id
                    FROM extraction_provenance
                    WHERE submission_id = :sid
                      AND source_text IS NOT NULL
                      AND textract_extraction_id IS NULL
                """),
                {"sid": submission_id}
            ).fetchall()

            for row in prov_rows:
                prov_id, field_name, source_text, source_page, source_doc_id = row

                if not source_text:
                    continue

                source_text_lower = source_text.lower().strip()

                # Find best matching Textract entry
                best_match_id = None
                best_score = 0

                for entry in textract_entries:
                    if not entry["value"]:
                        continue

                    # Prefer matches from same document
                    same_doc = source_doc_id and str(source_doc_id) == entry["document_id"]
                    same_page = source_page == entry["page"]

                    # Exact match
                    if source_text_lower == entry["value"]:
                        score = 100 if same_doc and same_page else (90 if same_doc else 80)
                        if score > best_score:
                            best_score = score
                            best_match_id = entry["id"]
                    # Substring match
                    elif entry["value"] in source_text_lower or source_text_lower in entry["value"]:
                        score = 70 if same_doc and same_page else (60 if same_doc else 50)
                        if score > best_score:
                            best_score = score
                            best_match_id = entry["id"]

                if best_match_id:
                    conn.execute(
                        text("""
                            UPDATE extraction_provenance
                            SET textract_extraction_id = :tid
                            WHERE id = :pid
                        """),
                        {"tid": best_match_id, "pid": prov_id}
                    )
                    linked_count += 1

            conn.commit()
            print(f"[orchestrator] Linked {linked_count} provenance records to Textract bbox")

    except Exception as e:
        print(f"[orchestrator] Failed to link provenance: {e}")

    return linked_count


def get_extraction_cost_estimate(
    document_classifications: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Estimate extraction cost before processing.

    Useful for displaying cost to users before starting extraction.
    """
    import fitz

    estimates = []
    total_cost = 0.0

    for file_path, classification in document_classifications.items():
        doc_type = classification.document_type.value if hasattr(classification, 'document_type') else str(classification)

        # Get page count
        try:
            pdf = fitz.open(file_path)
            page_count = len(pdf)
            pdf.close()
        except Exception:
            page_count = 1

        plan = route_document(doc_type, page_count)

        estimates.append({
            "filename": Path(file_path).name,
            "doc_type": doc_type,
            "pages": page_count,
            "strategy": plan.strategy.value,
            "estimated_cost": plan.estimated_cost,
            "notes": plan.notes,
        })
        total_cost += plan.estimated_cost

    return {
        "total_estimated_cost": total_cost,
        "documents": estimates,
    }
