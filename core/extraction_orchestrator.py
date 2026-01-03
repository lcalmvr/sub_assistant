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

    DEPRECATED: Use _save_textract_lines instead for better bbox coverage.
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


def _save_textract_lines(document_id: str, textract_result) -> Tuple[List[Dict], Dict[str, str], List[Dict]]:
    """
    Save Textract LINE blocks, KEY_VALUE_SET data, and raw checkboxes to textract_extractions table.

    Returns:
        Tuple of (lines_for_claude, line_id_map, key_values_for_claude)
        - lines_for_claude: List of {id, text, page, bbox} for Claude prompt
        - line_id_map: Map of line/kv index -> database UUID for linking
        - key_values_for_claude: List of {id, key, value, type, page, bbox} for answers
    """
    from core.db import get_conn

    lines_for_claude = []
    key_values_for_claude = []
    line_id_map = {}  # Maps line/kv index (as string) -> database UUID

    if not textract_result or not textract_result.fields:
        return lines_for_claude, line_id_map, key_values_for_claude

    try:
        with get_conn() as conn:
            # Clear existing extractions for this document
            conn.execute(
                text("DELETE FROM textract_extractions WHERE document_id = :doc_id"),
                {"doc_id": document_id}
            )

            # Save ALL raw checkboxes (SELECTION_ELEMENT) for position-based matching
            # These are checkboxes Textract found but didn't link to KEY_VALUE pairs
            for idx, cb in enumerate(textract_result.checkboxes or []):
                bbox = cb.bbox
                conn.execute(
                    text("""
                        INSERT INTO textract_extractions
                        (document_id, page_number, field_key, field_value, field_type,
                         bbox_left, bbox_top, bbox_width, bbox_height, confidence)
                        VALUES (:doc_id, :page, :key, :value, :type,
                                :left, :top, :width, :height, :conf)
                    """),
                    {
                        "doc_id": document_id,
                        "page": cb.page,
                        "key": f"CB_{idx}",  # Raw checkbox, not KV-linked
                        "value": str(cb.is_selected),
                        "type": "raw_checkbox",
                        "left": bbox.left if bbox else None,
                        "top": bbox.top if bbox else None,
                        "width": bbox.width if bbox else None,
                        "height": bbox.height if bbox else None,
                        "conf": cb.confidence,
                    }
                )

            # Insert LINE blocks
            for idx, field in enumerate(textract_result.fields):
                if field.field_type != "text":
                    continue

                bbox = field.bbox
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
                        "page": field.page,
                        "key": f"LINE_{idx}",
                        "value": field.value,
                        "type": "line",
                        "left": bbox.left if bbox else None,
                        "top": bbox.top if bbox else None,
                        "width": bbox.width if bbox else None,
                        "height": bbox.height if bbox else None,
                        "conf": field.confidence,
                    }
                )
                db_id = str(result.fetchone()[0])

                lines_for_claude.append({
                    "id": str(idx),
                    "text": field.value,
                    "page": field.page,
                    "bbox": bbox.to_dict() if bbox else None,
                })
                line_id_map[f"LINE_{idx}"] = db_id

            # Insert KEY_VALUE_SET data (form fields and checkboxes with answers)
            kv_idx = 0
            for key_text, kv_data in textract_result.key_value_pairs.items():
                kv_id = f"KV_{kv_idx}"
                bbox_data = kv_data.get("bbox", {})

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
                        "page": kv_data.get("page", 1),
                        "key": key_text,  # The form field label/question
                        "value": str(kv_data.get("value", "")),  # The answer
                        "type": kv_data.get("type", "text"),  # "checkbox" or "text"
                        "left": bbox_data.get("left"),
                        "top": bbox_data.get("top"),
                        "width": bbox_data.get("width"),
                        "height": bbox_data.get("height"),
                        "conf": kv_data.get("confidence", 0),
                    }
                )
                db_id = str(result.fetchone()[0])

                key_values_for_claude.append({
                    "id": kv_id,
                    "key": key_text,
                    "value": kv_data.get("value"),
                    "type": kv_data.get("type", "text"),
                    "page": kv_data.get("page", 1),
                    "bbox": bbox_data,
                })
                line_id_map[kv_id] = db_id
                kv_idx += 1

            conn.commit()
            print(f"[orchestrator] Saved {len(lines_for_claude)} LINE blocks + {len(key_values_for_claude)} KEY_VALUE pairs for document {document_id}")

    except Exception as e:
        print(f"[orchestrator] Failed to save textract data: {e}")
        import traceback
        traceback.print_exc()

    return lines_for_claude, line_id_map, key_values_for_claude


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

    DEPRECATED: Use extract_application_integrated instead for better bbox coverage.
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


def _log_extraction_diagnostic(
    filename: str,
    textract_result,
    lines_for_claude: List[Dict],
    key_values_for_claude: List[Dict],
    extraction,
    provenance_records: List[Dict],
    line_id_map: Dict[str, str],
):
    """
    Log comprehensive diagnostic info for debugging bbox linking issues.

    Writes to both console and a diagnostic file for analysis.
    """
    from pathlib import Path
    import json
    from datetime import datetime

    diag_lines = []
    diag_lines.append("")
    diag_lines.append("=" * 70)
    diag_lines.append(f"EXTRACTION DIAGNOSTIC: {filename}")
    diag_lines.append(f"Timestamp: {datetime.now().isoformat()}")
    diag_lines.append("=" * 70)

    # ─── TEXTRACT OUTPUT ───
    diag_lines.append("")
    diag_lines.append("─── TEXTRACT OUTPUT ───")
    diag_lines.append(f"  Total LINE blocks: {len(textract_result.fields)}")
    diag_lines.append(f"  Total KV pairs: {len(textract_result.key_value_pairs)}")
    diag_lines.append(f"  Raw checkboxes: {len(textract_result.checkboxes)}")

    # Count checkbox vs text KV pairs
    checkbox_kvs = [kv for kv in key_values_for_claude if kv.get('type') == 'checkbox']
    text_kvs = [kv for kv in key_values_for_claude if kv.get('type') != 'checkbox']
    diag_lines.append(f"  KV breakdown: {len(checkbox_kvs)} checkbox, {len(text_kvs)} text")

    # ─── KV PAIRS SAMPLE ───
    diag_lines.append("")
    diag_lines.append("─── KV PAIRS (first 20) ───")
    for kv in key_values_for_claude[:20]:
        val_display = kv.get('value')
        if kv.get('type') == 'checkbox':
            val_display = "☑ CHECKED" if kv.get('value') else "☐ NOT CHECKED"
        diag_lines.append(f"  [{kv['id']}] p{kv.get('page', '?')}: \"{kv.get('key', '')[:40]}\" → {val_display}")
    if len(key_values_for_claude) > 20:
        diag_lines.append(f"  ... and {len(key_values_for_claude) - 20} more")

    # ─── CLAUDE RESPONSE ANALYSIS ───
    diag_lines.append("")
    diag_lines.append("─── CLAUDE RESPONSE ANALYSIS ───")

    # Build reverse map: UUID -> LINE_xxx/KV_xxx
    uuid_to_ref = {v: k for k, v in line_id_map.items()}

    # Analyze each field
    boolean_fields = []
    text_fields = []
    problem_fields = []

    for record in provenance_records:
        field_name = record.get("field_name", "")
        value = record.get("extracted_value")
        answer_id = record.get("textract_line_id")  # UUID
        question_id = record.get("question_line_id")  # UUID

        # Convert UUIDs back to refs for display
        answer_ref = uuid_to_ref.get(answer_id, "None") if answer_id else "None"
        question_ref = uuid_to_ref.get(question_id, "None") if question_id else "None"

        is_boolean = value in [True, False, "true", "false", None]

        # Check for problems
        problems = []
        if is_boolean:
            boolean_fields.append(field_name)
            # Problem: answer points to LINE instead of KV for boolean
            if answer_ref.startswith("LINE_"):
                problems.append("BOOL_USES_LINE")
            # Problem: answer == question
            if answer_id and answer_id == question_id:
                problems.append("ANSWER=QUESTION")
        else:
            text_fields.append(field_name)
            # Problem: answer == question for text field
            if answer_id and answer_id == question_id:
                problems.append("ANSWER=QUESTION")

        # Problem: no answer_id at all
        if not answer_id and record.get("is_present"):
            problems.append("NO_ANSWER_ID")

        if problems:
            problem_fields.append({
                "field": field_name,
                "value": value,
                "answer_ref": answer_ref,
                "question_ref": question_ref,
                "problems": problems,
            })

    diag_lines.append(f"  Total fields extracted: {len(provenance_records)}")
    diag_lines.append(f"  Boolean fields: {len(boolean_fields)}")
    diag_lines.append(f"  Text fields: {len(text_fields)}")
    diag_lines.append(f"  Fields with problems: {len(problem_fields)}")

    # ─── PROBLEM FIELDS ───
    if problem_fields:
        diag_lines.append("")
        diag_lines.append("─── PROBLEM FIELDS ───")
        for pf in problem_fields:
            probs = ", ".join(pf["problems"])
            diag_lines.append(f"  {pf['field'][:35]:35} | val={str(pf['value'])[:10]:10} | ans={pf['answer_ref']:10} | q={pf['question_ref']:10} | [{probs}]")

    # ─── SUCCESSFUL BOOLEAN FIELDS ───
    diag_lines.append("")
    diag_lines.append("─── SUCCESSFUL BBOX LINKS (boolean fields using KV) ───")
    success_count = 0
    for record in provenance_records:
        field_name = record.get("field_name", "")
        value = record.get("extracted_value")
        answer_id = record.get("textract_line_id")

        if value in [True, False] and answer_id:
            answer_ref = uuid_to_ref.get(answer_id, "None")
            if answer_ref.startswith("KV_"):
                success_count += 1
                diag_lines.append(f"  ✓ {field_name[:40]:40} = {str(value):5} → {answer_ref}")

    if success_count == 0:
        diag_lines.append("  (none)")

    # ─── SUMMARY STATS ───
    diag_lines.append("")
    diag_lines.append("─── SUMMARY ───")
    fields_with_answer = sum(1 for r in provenance_records if r.get("textract_line_id"))
    fields_with_question = sum(1 for r in provenance_records if r.get("question_line_id"))
    answer_eq_question = sum(1 for r in provenance_records
                            if r.get("textract_line_id") and r.get("textract_line_id") == r.get("question_line_id"))
    bool_with_kv = sum(1 for r in provenance_records
                      if r.get("extracted_value") in [True, False]
                      and r.get("textract_line_id")
                      and uuid_to_ref.get(r.get("textract_line_id"), "").startswith("KV_"))
    bool_total = sum(1 for r in provenance_records if r.get("extracted_value") in [True, False])

    diag_lines.append(f"  Fields with answer_id: {fields_with_answer}/{len(provenance_records)} ({fields_with_answer*100//max(len(provenance_records),1)}%)")
    diag_lines.append(f"  Fields with question_id: {fields_with_question}/{len(provenance_records)}")
    diag_lines.append(f"  answer_id == question_id: {answer_eq_question} (should be ~0)")
    diag_lines.append(f"  Boolean fields with KV answer: {bool_with_kv}/{bool_total} (should be {bool_total})")

    diag_lines.append("")
    diag_lines.append("=" * 70)

    # Print to console
    for line in diag_lines:
        print(line)

    # Also write to file
    diag_dir = Path("diagnostics")
    diag_dir.mkdir(exist_ok=True)
    safe_filename = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)
    diag_path = diag_dir / f"extraction_{safe_filename}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

    with open(diag_path, "w") as f:
        f.write("\n".join(diag_lines))

        # Also dump raw data as JSON for deeper analysis
        f.write("\n\n")
        f.write("=" * 70)
        f.write("\nRAW DATA (JSON)\n")
        f.write("=" * 70)
        f.write("\n\n--- KV PAIRS ---\n")
        f.write(json.dumps(key_values_for_claude, indent=2, default=str))
        f.write("\n\n--- PROVENANCE RECORDS ---\n")
        f.write(json.dumps(provenance_records, indent=2, default=str))
        f.write("\n\n--- LINE ID MAP ---\n")
        f.write(json.dumps(line_id_map, indent=2, default=str))

    print(f"\n[diagnostic] Full diagnostic saved to: {diag_path}")

    return str(diag_path)


def extract_application_integrated(
    document_id: str,
    file_path: str,
    submission_id: str,
    enable_diagnostics: bool = True,
) -> Optional[Dict]:
    """
    Extract application data with integrated Textract + Claude bbox linking.

    This is the NEW approach that provides ~100% bbox coverage:
    1. Run Textract to get ALL text lines with bbox
    2. Save lines to database with UUIDs
    3. Pass lines (with IDs) to Claude for semantic extraction
    4. Claude references which line each field came from
    5. Store direct textract_extraction_id in provenance (no post-hoc matching)

    Args:
        document_id: UUID of the document record
        file_path: Path to the PDF file
        submission_id: Submission ID (required for provenance)
        enable_diagnostics: If True, log detailed diagnostic info

    Returns:
        Dict with extraction results including bbox link stats
    """
    from ai.textract_extractor import extract_from_pdf
    from ai.application_extractor import extract_with_textract_lines
    from pathlib import Path

    filename = Path(file_path).name

    result = {
        "success": False,
        "lines_extracted": 0,
        "fields_extracted": 0,
        "fields_with_bbox": 0,
        "bbox_coverage": 0.0,
    }

    try:
        # Step 1: Run Textract to get LINE blocks with bbox
        print(f"[orchestrator] Running Textract on {file_path}...")
        textract_result = extract_from_pdf(file_path)

        if not textract_result or not textract_result.fields:
            print(f"[orchestrator] Textract returned no lines")
            return result

        result["lines_extracted"] = len(textract_result.fields)
        result["key_values_extracted"] = len(textract_result.key_value_pairs)
        print(f"[orchestrator] Textract found {result['lines_extracted']} lines + {result['key_values_extracted']} key-value pairs")

        # Step 2: Save lines and key-values to database and get ID mapping
        lines_for_claude, line_id_map, key_values_for_claude = _save_textract_lines(document_id, textract_result)

        if not lines_for_claude:
            print(f"[orchestrator] No lines saved to database")
            return result

        # Step 3: Run Claude extraction with Textract lines AND key-value answers
        print(f"[orchestrator] Running Claude extraction with {len(lines_for_claude)} lines + {len(key_values_for_claude)} key-values...")
        extraction = extract_with_textract_lines(
            textract_lines=lines_for_claude,
            key_values=key_values_for_claude,
            line_id_map=line_id_map,
            page_count=textract_result.pages,
        )

        # Step 4: Save provenance with direct textract_extraction_id
        provenance_records = extraction.to_provenance_records(submission_id)
        result["fields_extracted"] = len(provenance_records)

        # Count fields with bbox links
        fields_with_bbox = sum(1 for r in provenance_records if r.get("textract_line_id"))
        result["fields_with_bbox"] = fields_with_bbox
        result["bbox_coverage"] = fields_with_bbox / max(len(provenance_records), 1) * 100

        # ─── DIAGNOSTIC LOGGING ───
        if enable_diagnostics:
            diag_path = _log_extraction_diagnostic(
                filename=filename,
                textract_result=textract_result,
                lines_for_claude=lines_for_claude,
                key_values_for_claude=key_values_for_claude,
                extraction=extraction,
                provenance_records=provenance_records,
                line_id_map=line_id_map,
            )
            result["diagnostic_file"] = diag_path

        # Save provenance to database
        _save_provenance_with_textract_ids(submission_id, document_id, provenance_records)

        result["success"] = True
        print(f"[orchestrator] Extraction complete: {fields_with_bbox}/{len(provenance_records)} fields have bbox ({result['bbox_coverage']:.1f}%)")

        return result

    except Exception as e:
        print(f"[orchestrator] Integrated extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return result


def _save_provenance_with_textract_ids(
    submission_id: str,
    document_id: str,
    provenance_records: List[Dict],
):
    """Save extraction provenance records with direct textract_extraction_id links."""
    from core.db import get_conn

    try:
        with get_conn() as conn:
            for record in provenance_records:
                conn.execute(
                    text("""
                        INSERT INTO extraction_provenance
                        (submission_id, source_document_id, field_name, extracted_value,
                         confidence, source_text, source_page, is_present,
                         textract_extraction_id, question_textract_id)
                        VALUES (:sid, :doc_id, :field, :value, :conf, :source, :page, :present,
                                :textract_id, :question_id)
                        ON CONFLICT (submission_id, source_document_id, field_name)
                        DO UPDATE SET
                            extracted_value = EXCLUDED.extracted_value,
                            confidence = EXCLUDED.confidence,
                            source_text = EXCLUDED.source_text,
                            source_page = EXCLUDED.source_page,
                            is_present = EXCLUDED.is_present,
                            textract_extraction_id = EXCLUDED.textract_extraction_id,
                            question_textract_id = EXCLUDED.question_textract_id
                    """),
                    {
                        "sid": submission_id,
                        "doc_id": document_id,
                        "field": record["field_name"],
                        "value": json.dumps(record["extracted_value"]),  # Always JSON-encode for jsonb column
                        "conf": record["confidence"],
                        "source": record["source_text"],
                        "page": record["source_page"],
                        "present": record["is_present"],
                        "textract_id": record.get("textract_line_id"),  # Answer bbox (primary)
                        "question_id": record.get("question_line_id"),  # Question bbox (secondary)
                    }
                )
            conn.commit()
            print(f"[orchestrator] Saved {len(provenance_records)} provenance records with bbox links")

    except Exception as e:
        print(f"[orchestrator] Failed to save provenance: {e}")


def link_provenance_to_textract(submission_id: str, verbose: bool = False) -> Dict[str, Any]:
    """
    Link extraction_provenance records to textract_extractions.

    Matching strategy:
    1. Match if Textract field_key appears in Claude source_text (primary)
    2. Match if Textract field_value appears in Claude source_text (secondary)
    3. Prefer same page matches

    Args:
        submission_id: The submission ID
        verbose: If True, return detailed match info

    Returns:
        Dict with linked_count and optional diagnostics
    """
    result = {
        "linked_count": 0,
        "total_provenance": 0,
        "total_textract": 0,
        "unlinked_samples": [],
    }

    try:
        with get_conn() as conn:
            # Get all textract extractions for this submission
            textract_rows = conn.execute(
                text("""
                    SELECT te.id, te.document_id, te.page_number, te.field_key, te.field_value
                    FROM textract_extractions te
                    JOIN documents d ON d.id = te.document_id
                    WHERE d.submission_id = :sid
                """),
                {"sid": submission_id}
            ).fetchall()

            if not textract_rows:
                return result

            result["total_textract"] = len(textract_rows)

            # Build lookup dict with both key and value for matching
            textract_entries = []
            for row in textract_rows:
                textract_entries.append({
                    "id": str(row[0]),
                    "document_id": str(row[1]),
                    "page": row[2],
                    "key": str(row[3]).lower().strip() if row[3] else "",
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

            result["total_provenance"] = len(prov_rows)
            linked_count = 0

            for row in prov_rows:
                prov_id, field_name, source_text, source_page, source_doc_id = row

                if not source_text:
                    continue

                source_text_lower = source_text.lower().strip()

                # Find best matching Textract entry
                best_match_id = None
                best_score = 0
                best_match_reason = None

                # Common words to skip (too many false positives)
                skip_words = {"yes", "no", "true", "false", "name", "null", "n/a", "none"}

                for entry in textract_entries:
                    # Prefer matches from same page
                    same_page = source_page == entry["page"]
                    page_bonus = 20 if same_page else 0

                    # Strategy 1: Match field_key in source_text (primary)
                    # e.g., "Daily" in "How frequently is Critical Information backed up? At least: Daily"
                    key = entry["key"]
                    if key and len(key) >= 4 and key not in skip_words:
                        if key in source_text_lower:
                            score = 80 + page_bonus
                            if score > best_score:
                                best_score = score
                                best_match_id = entry["id"]
                                best_match_reason = f"key '{key[:20]}' in source_text"

                    # Strategy 2: Match field_value in source_text (secondary)
                    # e.g., "windows defender" in "EDR solution: Windows Defender"
                    val = entry["value"]
                    if val and len(val) >= 4 and val not in skip_words:
                        if val in source_text_lower:
                            score = 60 + page_bonus
                            if score > best_score:
                                best_score = score
                                best_match_id = entry["id"]
                                best_match_reason = f"value '{val[:20]}' in source_text"

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
                    if verbose:
                        print(f"  [linked] {field_name[:30]:30} <- {best_match_reason}")
                elif verbose and len(result["unlinked_samples"]) < 10:
                    result["unlinked_samples"].append({
                        "field": field_name,
                        "source_text": source_text[:60],
                        "page": source_page,
                    })

            conn.commit()
            result["linked_count"] = linked_count
            print(f"[orchestrator] Linked {linked_count}/{len(prov_rows)} provenance records ({linked_count*100//max(len(prov_rows),1)}%)")

    except Exception as e:
        print(f"[orchestrator] Failed to link provenance: {e}")
        result["error"] = str(e)

    return result


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
