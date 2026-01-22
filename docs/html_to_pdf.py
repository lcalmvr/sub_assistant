#!/usr/bin/env python3
"""
Simple HTML to PDF converter using WeasyPrint.
Same engine used for quote/binder documents.

Usage:
    python html_to_pdf.py input.html [output.pdf]

If output not specified, creates input.pdf in same directory.
"""

import sys
from pathlib import Path
from weasyprint import HTML

def convert(input_path: str, output_path: str = None):
    input_file = Path(input_path)

    if not input_file.exists():
        print(f"Error: {input_path} not found")
        sys.exit(1)

    if output_path is None:
        output_path = input_file.with_suffix('.pdf')

    print(f"Converting {input_file.name} -> {Path(output_path).name}")
    HTML(filename=str(input_file)).write_pdf(output_path)
    print(f"Done: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python html_to_pdf.py input.html [output.pdf]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    convert(input_file, output_file)
