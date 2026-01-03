"""
OCR Utilities for Scanned Document Handling

Provides:
1. Detection of scanned/image PDFs (no text layer)
2. OCR fallback using AWS Textract
3. Confidence scoring adjustments for OCR'd content

The key insight: if PyMuPDF extracts very little text from a PDF,
it's likely a scanned document that needs OCR.
"""

import os
from dataclasses import dataclass
from typing import Optional, Tuple
from pathlib import Path


@dataclass
class TextExtractionResult:
    """Result of text extraction with OCR metadata."""
    text: str
    page_count: int
    is_scanned: bool  # True if OCR was needed
    ocr_method: Optional[str] = None  # "textract", "pymupdf", etc.
    ocr_confidence: Optional[float] = None  # Average OCR confidence
    pages_ocrd: int = 0  # Number of pages that required OCR
    extraction_cost: float = 0.0  # Cost of extraction


# Threshold: if average chars per page is below this, consider it scanned
MIN_CHARS_PER_PAGE = 100


def is_pdf_scanned(file_path: str, sample_pages: int = 3) -> Tuple[bool, int, int]:
    """
    Detect if a PDF is scanned (image-based) vs text-based.

    Args:
        file_path: Path to PDF file
        sample_pages: Number of pages to sample

    Returns:
        Tuple of (is_scanned, total_pages, chars_extracted)
    """
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(file_path)
        total_pages = len(doc)

        # Sample first N pages
        pages_to_check = min(sample_pages, total_pages)
        total_chars = 0

        for i in range(pages_to_check):
            page = doc[i]
            text = page.get_text()
            total_chars += len(text.strip())

        doc.close()

        # Calculate average chars per sampled page
        avg_chars = total_chars / pages_to_check if pages_to_check > 0 else 0
        is_scanned = avg_chars < MIN_CHARS_PER_PAGE

        return is_scanned, total_pages, total_chars

    except Exception as e:
        print(f"[ocr_utils] Error checking PDF: {e}")
        return True, 0, 0  # Assume scanned if we can't read it


def extract_text_with_ocr_fallback(
    file_path: str,
    force_ocr: bool = False,
    max_pages: Optional[int] = None,
) -> TextExtractionResult:
    """
    Extract text from PDF with automatic OCR fallback for scanned documents.

    Strategy:
    1. Try PyMuPDF first (free, fast)
    2. If text is sparse, fall back to Textract OCR

    Args:
        file_path: Path to PDF file
        force_ocr: If True, skip PyMuPDF and go straight to OCR
        max_pages: Maximum pages to process (None = all)

    Returns:
        TextExtractionResult with text and metadata
    """
    import fitz

    doc = fitz.open(file_path)
    total_pages = len(doc)
    pages_to_process = min(max_pages, total_pages) if max_pages else total_pages

    if not force_ocr:
        # Try PyMuPDF first
        text_parts = []
        total_chars = 0

        for i in range(pages_to_process):
            page = doc[i]
            page_text = page.get_text()
            text_parts.append(f"--- Page {i+1} ---\n{page_text}")
            total_chars += len(page_text.strip())

        doc.close()

        avg_chars = total_chars / pages_to_process if pages_to_process > 0 else 0

        # If we got enough text, we're done
        if avg_chars >= MIN_CHARS_PER_PAGE:
            return TextExtractionResult(
                text="\n\n".join(text_parts),
                page_count=total_pages,
                is_scanned=False,
                ocr_method="pymupdf",
                ocr_confidence=1.0,  # Native text is high confidence
                pages_ocrd=0,
                extraction_cost=0.0,
            )

        print(f"[ocr_utils] Low text density ({avg_chars:.0f} chars/page), using OCR fallback")

    doc.close()

    # Fall back to Textract OCR
    return _extract_with_textract_ocr(file_path, max_pages=pages_to_process)


def _extract_with_textract_ocr(
    file_path: str,
    max_pages: Optional[int] = None,
) -> TextExtractionResult:
    """
    Extract text using AWS Textract OCR.

    Uses TEXTRACT_DETECT (basic OCR) at $0.0015/page for cost efficiency.
    """
    from pdf2image import convert_from_path
    import io

    # Check for AWS credentials
    if not os.getenv("AWS_ACCESS_KEY_ID") and not os.getenv("AWS_DEFAULT_REGION"):
        print("[ocr_utils] Warning: AWS credentials not configured, OCR unavailable")
        return TextExtractionResult(
            text="",
            page_count=0,
            is_scanned=True,
            ocr_method="failed",
            ocr_confidence=0.0,
            extraction_cost=0.0,
        )

    try:
        import boto3
        from dotenv import load_dotenv
        load_dotenv()

        client = boto3.client(
            'textract',
            region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
        )

        # Convert PDF to images
        images = convert_from_path(
            file_path,
            dpi=200,
            first_page=1,
            last_page=max_pages if max_pages else None
        )

        text_parts = []
        total_confidence = 0.0
        confidence_count = 0

        for i, img in enumerate(images):
            page_num = i + 1

            # Convert PIL image to bytes
            img_buffer = io.BytesIO()
            img.save(img_buffer, format='PNG')
            img_bytes = img_buffer.getvalue()

            try:
                # Use detect_document_text for basic OCR ($0.0015/page)
                response = client.detect_document_text(
                    Document={'Bytes': img_bytes}
                )

                # Extract text from response
                page_text_parts = []
                for block in response.get('Blocks', []):
                    if block['BlockType'] == 'LINE':
                        page_text_parts.append(block.get('Text', ''))
                        if 'Confidence' in block:
                            total_confidence += block['Confidence']
                            confidence_count += 1

                page_text = '\n'.join(page_text_parts)
                text_parts.append(f"--- Page {page_num} ---\n{page_text}")

            except Exception as e:
                print(f"[ocr_utils] OCR failed for page {page_num}: {e}")
                text_parts.append(f"--- Page {page_num} ---\n[OCR FAILED]")

        # Calculate average confidence
        avg_confidence = (total_confidence / confidence_count / 100) if confidence_count > 0 else 0.0

        # Cost: $0.0015 per page for detect_document_text
        cost = len(images) * 0.0015

        return TextExtractionResult(
            text="\n\n".join(text_parts),
            page_count=len(images),
            is_scanned=True,
            ocr_method="textract_detect",
            ocr_confidence=avg_confidence,
            pages_ocrd=len(images),
            extraction_cost=cost,
        )

    except ImportError as e:
        print(f"[ocr_utils] Missing dependency: {e}")
        return TextExtractionResult(
            text="",
            page_count=0,
            is_scanned=True,
            ocr_method="failed",
            ocr_confidence=0.0,
        )
    except Exception as e:
        print(f"[ocr_utils] Textract OCR failed: {e}")
        return TextExtractionResult(
            text="",
            page_count=0,
            is_scanned=True,
            ocr_method="failed",
            ocr_confidence=0.0,
        )


def adjust_confidence_for_ocr(
    base_confidence: float,
    is_scanned: bool,
    ocr_confidence: Optional[float] = None,
) -> float:
    """
    Adjust extraction confidence based on OCR quality.

    Scanned documents inherently have lower confidence due to:
    - OCR errors
    - Image quality issues
    - Layout interpretation challenges

    Args:
        base_confidence: Original confidence from extraction
        is_scanned: Whether document was scanned
        ocr_confidence: Average OCR confidence (0-1)

    Returns:
        Adjusted confidence score
    """
    if not is_scanned:
        return base_confidence

    # Apply OCR penalty
    ocr_factor = ocr_confidence if ocr_confidence else 0.8

    # Combine: base confidence * OCR quality factor
    adjusted = base_confidence * ocr_factor

    # Floor at 0.5 for scanned docs (still useful, just less certain)
    return max(0.5, adjusted)


# Convenience function for testing
def test_ocr(file_path: str):
    """Test OCR extraction on a file."""
    print(f"Testing OCR on: {file_path}")

    # Check if scanned
    is_scanned, pages, chars = is_pdf_scanned(file_path)
    print(f"Scanned: {is_scanned}, Pages: {pages}, Chars extracted: {chars}")

    # Extract with OCR fallback
    result = extract_text_with_ocr_fallback(file_path)
    print(f"\nResult:")
    print(f"  Is scanned: {result.is_scanned}")
    print(f"  OCR method: {result.ocr_method}")
    print(f"  OCR confidence: {result.ocr_confidence:.2f}" if result.ocr_confidence else "  OCR confidence: N/A")
    print(f"  Pages OCR'd: {result.pages_ocrd}")
    print(f"  Cost: ${result.extraction_cost:.4f}")
    print(f"  Text length: {len(result.text)} chars")
    print(f"\nFirst 500 chars:\n{result.text[:500]}")

    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        test_ocr(sys.argv[1])
    else:
        print("Usage: python ocr_utils.py <pdf_file>")
