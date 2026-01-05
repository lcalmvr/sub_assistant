#!/usr/bin/env python3
"""
Test script to run extraction with diagnostic logging on a PDF file.

Usage:
    python test_extraction_diagnostic.py AtBay.pdf
    python test_extraction_diagnostic.py path/to/axis_app.pdf
"""

import sys
import os
from pathlib import Path
from uuid import uuid4

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

def run_test_extraction(file_path: str):
    """Run extraction with diagnostics on a PDF file."""
    from core.extraction_orchestrator import extract_application_integrated
    from core.db import get_conn
    from sqlalchemy import text

    file_path = Path(file_path)
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        return

    print(f"\n{'='*70}")
    print(f"TEST EXTRACTION: {file_path.name}")
    print(f"{'='*70}\n")

    # Create a test submission and document record
    test_submission_id = str(uuid4())
    test_document_id = str(uuid4())

    try:
        with get_conn() as conn:
            # Create test submission
            conn.execute(text("""
                INSERT INTO submissions (id, applicant_name, submission_status)
                VALUES (:id, :name, 'test')
            """), {
                "id": test_submission_id,
                "name": f"Test Extraction - {file_path.name}",
            })

            # Create test document record
            conn.execute(text("""
                INSERT INTO documents (id, submission_id, filename, document_type)
                VALUES (:id, :sub_id, :filename, 'application')
            """), {
                "id": test_document_id,
                "sub_id": test_submission_id,
                "filename": file_path.name,
            })
            conn.commit()

        print(f"[test] Created test submission: {test_submission_id}")
        print(f"[test] Created test document: {test_document_id}")
        print()

        # Run extraction with diagnostics
        result = extract_application_integrated(
            document_id=test_document_id,
            file_path=str(file_path.absolute()),
            submission_id=test_submission_id,
            enable_diagnostics=True,
        )

        print(f"\n{'='*70}")
        print("EXTRACTION RESULT")
        print(f"{'='*70}")
        for key, value in result.items():
            print(f"  {key}: {value}")

        # Offer to clean up or keep test data
        print(f"\n[test] Test data created with submission_id: {test_submission_id}")
        print(f"[test] To view in UI, navigate to this submission")
        print(f"[test] To clean up, run:")
        print(f"       DELETE FROM submissions WHERE id = '{test_submission_id}';")

        return result

    except Exception as e:
        print(f"[test] Error: {e}")
        import traceback
        traceback.print_exc()

        # Clean up on error
        try:
            with get_conn() as conn:
                conn.execute(text("DELETE FROM submissions WHERE id = :id"), {"id": test_submission_id})
                conn.commit()
            print(f"[test] Cleaned up test submission after error")
        except:
            pass

        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_extraction_diagnostic.py <pdf_file>")
        print("Example: python test_extraction_diagnostic.py AtBay.pdf")
        sys.exit(1)

    file_path = sys.argv[1]
    run_test_extraction(file_path)
