"""
Integration with existing core modules
"""
import os
import sys
import smtplib
from email.message import EmailMessage
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
import json

# Add parent directory to path to import core modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.db import get_conn
from core.submission_status import update_submission_status
from sqlalchemy import text


def send_email_notification(to_email: str, subject: str, body: str, html_body: Optional[str] = None):
    """
    Send email notification using SMTP.
    Falls back to print in dev mode if SMTP not configured.
    """
    smtp_enabled = os.getenv("SMTP_ENABLED", "false").lower() == "true"
    
    if not smtp_enabled:
        # Dev mode: just print
        print(f"[EMAIL] To: {to_email}")
        print(f"[EMAIL] Subject: {subject}")
        print(f"[EMAIL] Body: {body}")
        return
    
    try:
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "465"))
        smtp_user = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        from_email = os.getenv("BROKER_PORTAL_EMAIL_FROM", smtp_user)
        
        if not smtp_user or not smtp_password:
            print(f"[EMAIL] SMTP not configured, skipping email to {to_email}")
            return
        
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = to_email
        msg.set_content(body)
        
        if html_body:
            msg.add_alternative(html_body, subtype="html")
        
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        print(f"[EMAIL] Sent notification to {to_email}")
    except Exception as e:
        print(f"[EMAIL] Error sending email: {e}")


def notify_uw_document_upload(submission_id: str, broker_email: str, filename: str):
    """
    Notify UW team that a broker has uploaded a document.
    """
    uw_email = os.getenv("BROKER_PORTAL_UW_NOTIFICATION_EMAIL")
    if not uw_email:
        print(f"[UW NOTIFICATION] No UW email configured, skipping notification")
        return
    
    # Get submission details for context
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT applicant_name, submission_status
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})
        row = result.fetchone()
        applicant_name = row[0] if row else "Unknown"
        current_status = row[1] if row else "Unknown"
    
    subject = f"Document Uploaded: {applicant_name} - {filename}"
    body = f"""
A broker has uploaded a new document for submission {submission_id}.

Account: {applicant_name}
Broker: {broker_email}
Document: {filename}
Current Status: {current_status}

Please review the document in the UW system.
"""
    
    html_body = f"""
    <html>
    <body>
        <h3>Document Uploaded</h3>
        <p>A broker has uploaded a new document for submission <strong>{submission_id}</strong>.</p>
        <ul>
            <li><strong>Account:</strong> {applicant_name}</li>
            <li><strong>Broker:</strong> {broker_email}</li>
            <li><strong>Document:</strong> {filename}</li>
            <li><strong>Current Status:</strong> {current_status}</li>
        </ul>
        <p>Please review the document in the UW system.</p>
    </body>
    </html>
    """
    
    send_email_notification(uw_email, subject, body, html_body)


def process_document_upload(
    submission_id: str,
    filename: str,
    file_path: str,
    doc_type: str,
    uploaded_by: str
) -> str:
    """
    Process and store uploaded document.
    Reuses logic from pages_workflows/submissions.py
    Returns document ID.
    """
    import os
    
    # Basic file metadata
    file_size = os.path.getsize(file_path)
    file_ext = os.path.splitext(filename)[1].lower()
    
    # Determine page count
    page_count = 1
    if file_ext == '.pdf':
        try:
            import pypdf
            with open(file_path, 'rb') as f:
                pdf_reader = pypdf.PdfReader(f)
                page_count = len(pdf_reader.pages)
        except Exception:
            page_count = max(1, file_size // 50000)  # Estimate
    
    # Create document metadata
    doc_metadata = {
        "filename": filename,
        "file_size": file_size,
        "file_extension": file_ext,
        "upload_timestamp": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": uploaded_by,
        "file_path": file_path
    }
    
    extracted_data = {
        "file_path": file_path,
        "extraction_method": "broker_upload"
    }
    
    # Store in database
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO documents (
                submission_id, filename, document_type, page_count,
                is_priority, doc_metadata, extracted_data, created_at
            ) VALUES (
                :submission_id, :filename, :doc_type, :page_count,
                FALSE, :doc_metadata, :extracted_data, :created_at
            )
            RETURNING id
        """), {
            "submission_id": submission_id,
            "filename": filename,
            "doc_type": doc_type,
            "page_count": page_count,
            "doc_metadata": json.dumps(doc_metadata),
            "extracted_data": json.dumps(extracted_data),
            "created_at": datetime.now(timezone.utc)
        })
        
        document_id = str(result.fetchone()[0])
    
    return document_id


def update_submission_status_pending_info(submission_id: str, changed_by: str):
    """
    Update submission status to pending_info when document is uploaded.
    """
    try:
        update_submission_status(
            submission_id=submission_id,
            status="pending_info",
            outcome="pending",
            changed_by=changed_by,
            notes="Document uploaded by broker"
        )
    except Exception as e:
        print(f"[WARNING] Failed to update submission status: {e}")



