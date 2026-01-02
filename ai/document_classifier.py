"""
Document classifier for insurance submission attachments.

Classifies PDFs into categories:
- application_supplemental: Carrier-specific cyber/tech applications (Axis, Coalition, At Bay, etc.) - PRIMARY
- application_acord: ACORD application forms - DEPRIORITIZED (often have minimal useful data for cyber)
- loss_runs: Loss history reports - auto-processed for claims history
- quote: Quote or indication from another carrier - used to populate underlying tower for excess
- financial: Financial statements, K-1s, etc. - fallback for revenue when app is blank
- other: Marketing materials, miscellaneous

Uses first-page analysis via OpenAI vision for accurate classification.
Cyber/tech insurance primarily uses carrier-specific applications, not ACORD forms.
"""

import base64
import io
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional

from openai import OpenAI


class DocumentType(str, Enum):
    """Document type categories."""
    APPLICATION_ACORD = "application_acord"
    APPLICATION_SUPPLEMENTAL = "application_supplemental"
    LOSS_RUNS = "loss_runs"
    QUOTE = "quote"
    FINANCIAL = "financial"
    OTHER = "other"


@dataclass
class ClassificationResult:
    """Result of document classification."""
    document_type: DocumentType
    confidence: float  # 0.0 to 1.0
    reason: str  # Brief explanation
    detected_carrier: Optional[str] = None  # For supplementals/quotes
    detected_form_number: Optional[str] = None  # For ACORD forms


def _get_client() -> OpenAI:
    """Get OpenAI client with API key from environment."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    return OpenAI(api_key=key)


def _pdf_first_page_to_image(pdf_path: str) -> bytes:
    """Convert first page of PDF to PNG image bytes."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("PyMuPDF (fitz) required for PDF processing. Install with: pip install pymupdf")

    doc = fitz.open(pdf_path)
    if len(doc) == 0:
        raise ValueError(f"PDF has no pages: {pdf_path}")

    page = doc[0]
    # Render at 150 DPI for good quality without huge size
    mat = fitz.Matrix(150/72, 150/72)
    pix = page.get_pixmap(matrix=mat)

    img_bytes = pix.tobytes("png")
    doc.close()

    return img_bytes


def _encode_image_base64(image_bytes: bytes) -> str:
    """Encode image bytes to base64 string."""
    return base64.b64encode(image_bytes).decode("utf-8")


CLASSIFICATION_PROMPT = """Analyze this document's first page and classify it into one of these categories:

1. **application_acord** - ACORD insurance application forms (look for "ACORD" logo, form numbers like "ACORD 125", "ACORD 130", standardized form layout)

2. **application_supplemental** - Carrier-specific supplemental applications (look for carrier logos like "Axis", "Chubb", "AIG", "Travelers", "At Bay", "Coalition", questions about cyber security, business operations)

3. **loss_runs** - Loss history/claims reports (look for "Loss Run", "Loss History", claim listings with dates/amounts, carrier letterhead showing historical claims)

4. **quote** - Quote or indication from another carrier (look for "Quote", "Indication", premium amounts, coverage terms, limits/deductibles)

5. **financial** - Financial statements (look for "Balance Sheet", "Income Statement", "K-1", "Tax Return", financial figures)

6. **other** - Marketing materials, broker correspondence, or anything else

Respond with JSON only:
{
    "document_type": "one of the types above",
    "confidence": 0.0-1.0,
    "reason": "brief explanation of why you classified it this way",
    "detected_carrier": "carrier name if visible, null otherwise",
    "detected_form_number": "ACORD form number if applicable, null otherwise"
}"""


def classify_document(pdf_path: str, model: str = "gpt-4o") -> ClassificationResult:
    """
    Classify a PDF document by analyzing its first page.

    Args:
        pdf_path: Path to the PDF file
        model: OpenAI model to use (must support vision)

    Returns:
        ClassificationResult with document type and metadata
    """
    if not Path(pdf_path).exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # Convert first page to image
    image_bytes = _pdf_first_page_to_image(pdf_path)
    image_base64 = _encode_image_base64(image_bytes)

    client = _get_client()

    response = client.chat.completions.create(
        model=model,
        max_tokens=500,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": CLASSIFICATION_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}",
                            "detail": "low"  # Use low detail for faster/cheaper classification
                        }
                    }
                ]
            }
        ],
        response_format={"type": "json_object"}
    )

    result = response.choices[0].message.content

    import json
    data = json.loads(result)

    # Map to enum
    doc_type_str = data.get("document_type", "other")
    try:
        doc_type = DocumentType(doc_type_str)
    except ValueError:
        doc_type = DocumentType.OTHER

    return ClassificationResult(
        document_type=doc_type,
        confidence=float(data.get("confidence", 0.5)),
        reason=data.get("reason", ""),
        detected_carrier=data.get("detected_carrier"),
        detected_form_number=data.get("detected_form_number")
    )


def classify_documents(pdf_paths: list[str], model: str = "gpt-4o") -> dict[str, ClassificationResult]:
    """
    Classify multiple PDF documents.

    Args:
        pdf_paths: List of paths to PDF files
        model: OpenAI model to use

    Returns:
        Dict mapping file path to ClassificationResult
    """
    results = {}
    for path in pdf_paths:
        try:
            results[path] = classify_document(path, model)
        except Exception as e:
            # Log error but continue with other documents
            print(f"[classifier] Failed to classify {path}: {e}")
            results[path] = ClassificationResult(
                document_type=DocumentType.OTHER,
                confidence=0.0,
                reason=f"Classification failed: {e}"
            )
    return results


def get_applications(classifications: dict[str, ClassificationResult]) -> list[tuple[str, ClassificationResult]]:
    """
    Get all application documents from classifications.
    Returns list of (path, result) tuples, sorted with carrier supplementals FIRST.

    For cyber/tech insurance, carrier-specific applications (Axis, Coalition, At Bay, etc.)
    contain the most useful data. ACORD forms are deprioritized as they often have
    minimal relevant information for cyber risk assessment.
    """
    apps = []
    for path, result in classifications.items():
        if result.document_type in (DocumentType.APPLICATION_ACORD, DocumentType.APPLICATION_SUPPLEMENTAL):
            apps.append((path, result))

    # Sort: Carrier supplementals FIRST (priority), ACORD last (deprioritized)
    apps.sort(key=lambda x: (0 if x[1].document_type == DocumentType.APPLICATION_SUPPLEMENTAL else 1))
    return apps


def get_financials(classifications: dict[str, ClassificationResult]) -> list[tuple[str, ClassificationResult]]:
    """Get all financial documents from classifications."""
    return [(p, r) for p, r in classifications.items() if r.document_type == DocumentType.FINANCIAL]


def get_loss_runs(classifications: dict[str, ClassificationResult]) -> list[tuple[str, ClassificationResult]]:
    """Get all loss runs documents from classifications."""
    return [(p, r) for p, r in classifications.items() if r.document_type == DocumentType.LOSS_RUNS]


def get_quotes(classifications: dict[str, ClassificationResult]) -> list[tuple[str, ClassificationResult]]:
    """Get all quote documents from classifications."""
    return [(p, r) for p, r in classifications.items() if r.document_type == DocumentType.QUOTE]


# ─────────────────────────────────────────────────────────────
# Quick text-based pre-filter (for speed)
# ─────────────────────────────────────────────────────────────

def quick_classify_by_filename(filename: str) -> Optional[DocumentType]:
    """
    Quick heuristic classification based on filename.
    Returns None if uncertain (should use vision classifier).
    """
    name_lower = filename.lower()

    # Strong filename indicators
    if "acord" in name_lower:
        return DocumentType.APPLICATION_ACORD
    if "loss" in name_lower and "run" in name_lower:
        return DocumentType.LOSS_RUNS
    if "loss" in name_lower and "history" in name_lower:
        return DocumentType.LOSS_RUNS
    if "quote" in name_lower or "indication" in name_lower:
        return DocumentType.QUOTE
    if any(x in name_lower for x in ["k-1", "k1", "tax return", "financial", "balance sheet"]):
        return DocumentType.FINANCIAL

    # Common application keywords (less certain)
    if "application" in name_lower or "app" in name_lower or "supplemental" in name_lower:
        return None  # Could be ACORD or supplemental, use vision

    return None  # Uncertain, use vision


def smart_classify_documents(pdf_paths: list[str], model: str = "gpt-4o") -> dict[str, ClassificationResult]:
    """
    Classify documents using filename heuristics first, then vision for uncertain ones.
    More efficient than classifying everything with vision.
    """
    results = {}
    need_vision = []

    for path in pdf_paths:
        filename = Path(path).name
        quick_type = quick_classify_by_filename(filename)

        if quick_type is not None:
            results[path] = ClassificationResult(
                document_type=quick_type,
                confidence=0.7,  # Moderate confidence for filename-based
                reason=f"Classified by filename: {filename}"
            )
        else:
            need_vision.append(path)

    # Use vision for uncertain documents
    if need_vision:
        vision_results = classify_documents(need_vision, model)
        results.update(vision_results)

    return results


# ─────────────────────────────────────────────────────────────
# CLI for testing
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python document_classifier.py <pdf_path> [pdf_path2 ...]")
        sys.exit(1)

    paths = sys.argv[1:]
    print(f"Classifying {len(paths)} document(s)...\n")

    results = smart_classify_documents(paths)

    for path, result in results.items():
        print(f"📄 {Path(path).name}")
        print(f"   Type: {result.document_type.value}")
        print(f"   Confidence: {result.confidence:.0%}")
        print(f"   Reason: {result.reason}")
        if result.detected_carrier:
            print(f"   Carrier: {result.detected_carrier}")
        if result.detected_form_number:
            print(f"   Form: {result.detected_form_number}")
        print()
