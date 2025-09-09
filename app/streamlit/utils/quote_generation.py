"""
Quote generation utilities for Streamlit application
"""
import json
import mimetypes
import os
import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Dict, Any

# Optional dependencies - fail gracefully if not available
try:
    from jinja2 import Environment, FileSystemLoader
    from supabase import create_client
    from weasyprint import HTML
    DEPENDENCIES_AVAILABLE = True
except ImportError as e:
    DEPENDENCIES_AVAILABLE = False
    print(f"Quote generation dependencies not available: {e}")

from .database import get_conn
from ..config.settings import CURRENT_USER, SUPABASE_URL, SUPABASE_KEY

# Fallback if not set in config
if not SUPABASE_URL:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
if not SUPABASE_KEY:
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Initialize Supabase client and template environment
if DEPENDENCIES_AVAILABLE:
    SB = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
    TEMPLATE_ENV = Environment(loader=FileSystemLoader("rating_engine/templates"))
else:
    SB = None
    TEMPLATE_ENV = None

def render_quote_pdf(ctx: Dict[str, Any]) -> Path:
    """Render quote HTML template to PDF file"""
    if not DEPENDENCIES_AVAILABLE or not TEMPLATE_ENV:
        raise RuntimeError("Quote generation dependencies not available")
    
    html = TEMPLATE_ENV.get_template("quote.html").render(**ctx)
    tmp = NamedTemporaryFile(delete=False, suffix=".pdf")
    HTML(string=html).write_pdf(tmp.name)
    return Path(tmp.name)

def upload_pdf_to_storage(pdf_path: Path) -> str:
    """Upload PDF to Supabase storage and return public URL"""
    if not DEPENDENCIES_AVAILABLE or not SB:
        raise RuntimeError("Storage dependencies not available")
    
    bucket = "quotes"
    key = f"{uuid.uuid4()}.pdf"
    with pdf_path.open("rb") as f:
        SB.storage.from_(bucket).upload(
            key, f, {"content-type": mimetypes.guess_type(pdf_path)[0] or "application/pdf"}
        )
    return f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{key}"

def save_quote_to_database(sub_id: str, quote_json: Dict[str, Any], pdf_url: str) -> int:
    """Save quote data to database and return quote ID"""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO quotes (submission_id, quote_json, pdf_url, created_by)
            VALUES (%s,%s,%s,%s)
            RETURNING id
            """,
            (sub_id, json.dumps(quote_json), pdf_url, CURRENT_USER),
        )
        return cur.fetchone()[0]

def generate_and_save_quote(sub_id: str, quote_data: Dict[str, Any]) -> tuple[int, str]:
    """Complete quote generation workflow: render PDF, upload, and save to DB"""
    # Render PDF
    pdf_path = render_quote_pdf(quote_data)
    
    try:
        # Upload to storage
        pdf_url = upload_pdf_to_storage(pdf_path)
        
        # Save to database
        quote_id = save_quote_to_database(sub_id, quote_data, pdf_url)
        
        return quote_id, pdf_url
    finally:
        # Clean up temporary file
        pdf_path.unlink(missing_ok=True)