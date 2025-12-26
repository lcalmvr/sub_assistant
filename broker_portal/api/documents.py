"""
Documents API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List
from sqlalchemy import text
import sys
import os
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.db import get_conn
from broker_portal.api.auth import get_current_broker_from_session, check_broker_access_to_submission
from broker_portal.api.models import DocumentInfo, DocumentUploadResponse, ErrorResponse
from broker_portal.api.integrations import (
    process_document_upload,
    notify_uw_document_upload,
    update_submission_status_pending_info
)

router = APIRouter()


@router.get("/{submission_id}/documents", response_model=List[DocumentInfo])
async def list_documents(
    submission_id: str,
    broker: dict = Depends(get_current_broker_from_session)
):
    """
    List all documents for a submission.
    """
    # Check access
    if not check_broker_access_to_submission(broker, submission_id):
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this submission"
        )
    
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                id, filename, document_type, page_count, created_at
            FROM documents
            WHERE submission_id = :submission_id
            ORDER BY created_at DESC
        """), {"submission_id": submission_id})
        
        documents = []
        for row in result:
            documents.append(DocumentInfo(
                id=str(row[0]),
                filename=row[1],
                document_type=row[2],
                page_count=row[3],
                created_at=row[4]
            ))
    
    return documents


@router.post("/{submission_id}/documents", response_model=DocumentUploadResponse)
async def upload_document(
    submission_id: str,
    file: UploadFile = File(...),
    document_type: str = Form("Other"),
    broker: dict = Depends(get_current_broker_from_session)
):
    """
    Upload a document for a submission.
    Notifies UW team and updates submission status to pending_info.
    """
    # Check access
    if not check_broker_access_to_submission(broker, submission_id):
        raise HTTPException(
            status_code=403,
            detail="You don't have access to this submission"
        )
    
    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No filename provided"
        )
    
    # Create temp file to store upload
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
        try:
            # Save uploaded file
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
            
            # Process document
            document_id = process_document_upload(
                submission_id=submission_id,
                filename=file.filename,
                file_path=tmp_file_path,
                doc_type=document_type,
                uploaded_by=broker["email"]
            )
            
            # Update submission status
            update_submission_status_pending_info(
                submission_id=submission_id,
                changed_by=f"broker:{broker['email']}"
            )
            
            # Notify UW team
            notify_uw_document_upload(
                submission_id=submission_id,
                broker_email=broker["email"],
                filename=file.filename
            )
            
            return DocumentUploadResponse(
                success=True,
                document_id=document_id,
                message="Document uploaded successfully"
            )
        
        except Exception as e:
            # Clean up temp file on error
            if os.path.exists(tmp_file_path):
                os.unlink(tmp_file_path)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload document: {str(e)}"
            )

