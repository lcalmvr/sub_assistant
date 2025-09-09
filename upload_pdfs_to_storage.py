#!/usr/bin/env python3
"""
Script to upload PDFs to Supabase storage for clickable access in the viewer.
This creates a more professional solution than local file links.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import hashlib
from datetime import datetime

# Load environment variables
load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
    print("❌ Missing Supabase environment variables")
    print("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE in your .env file")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

def upload_pdf_to_storage(file_path: Path, submission_id: str) -> str:
    """
    Upload a PDF to Supabase storage and return the public URL.
    
    Args:
        file_path: Path to the PDF file
        submission_id: ID of the submission this PDF belongs to
        
    Returns:
        Public URL to access the PDF
    """
    try:
        # Create a unique filename for storage
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_hash = hashlib.md5(f"{submission_id}_{file_path.name}".encode()).hexdigest()[:8]
        storage_filename = f"submissions/{submission_id}/{timestamp}_{file_hash}_{file_path.name}"
        
        # Read the PDF file
        with open(file_path, 'rb') as f:
            pdf_content = f.read()
        
        # Upload to Supabase storage
        result = supabase.storage.from_("documents").upload(
            path=storage_filename,
            file=pdf_content,
            file_options={"content-type": "application/pdf"}
        )
        
        if result:
            # Get the public URL
            public_url = supabase.storage.from_("documents").get_public_url(storage_filename)
            print(f"✅ Uploaded PDF: {file_path.name} → {public_url}")
            return public_url
        else:
            print(f"❌ Failed to upload PDF: {file_path.name}")
            return None
            
    except Exception as e:
        print(f"❌ Error uploading PDF {file_path.name}: {e}")
        return None

def update_document_with_url(document_id: str, pdf_url: str):
    """
    Update the document record with the PDF URL.
    
    Args:
        document_id: ID of the document record
        pdf_url: Public URL to the PDF
    """
    try:
        # Update the extracted_data to include the PDF URL
        from sqlalchemy import create_engine, text
        from dotenv import load_dotenv
        
        load_dotenv()
        DATABASE_URL = os.getenv("DATABASE_URL")
        engine = create_engine(DATABASE_URL)
        
        with engine.connect() as conn:
            # Get current extracted_data
            result = conn.execute(
                text("SELECT extracted_data FROM documents WHERE id = :doc_id"),
                {"doc_id": document_id}
            )
            current_data = result.scalar()
            
            if current_data:
                # Parse and update the extracted_data
                import json
                if isinstance(current_data, str):
                    extracted_data = json.loads(current_data)
                else:
                    extracted_data = current_data
                
                # Add the PDF URL
                extracted_data['pdf_url'] = pdf_url
                extracted_data['note'] = "PDF is now accessible via clickable link above"
                
                # Update the database
                conn.execute(
                    text("UPDATE documents SET extracted_data = :data WHERE id = :doc_id"),
                    {"data": json.dumps(extracted_data), "doc_id": document_id}
                )
                conn.commit()
                print(f"✅ Updated document {document_id} with PDF URL")
            
    except Exception as e:
        print(f"❌ Error updating document {document_id}: {e}")

def main():
    """Main function to demonstrate PDF upload functionality."""
    print("🚀 PDF Upload to Supabase Storage")
    print("=" * 50)
    
    # Example usage
    if len(sys.argv) > 1:
        pdf_path = Path(sys.argv[1])
        submission_id = sys.argv[2] if len(sys.argv) > 2 else "test-submission"
        
        if pdf_path.exists() and pdf_path.suffix.lower() == '.pdf':
            print(f"📄 Processing PDF: {pdf_path}")
            pdf_url = upload_pdf_to_storage(pdf_path, submission_id)
            
            if pdf_url:
                print(f"🔗 PDF accessible at: {pdf_url}")
                print(f"💡 You can now use this URL in your viewer for clickable PDF access!")
            else:
                print("❌ Failed to upload PDF")
        else:
            print(f"❌ Invalid PDF file: {pdf_path}")
    else:
        print("📖 Usage: python upload_pdfs_to_storage.py <pdf_path> [submission_id]")
        print("💡 Example: python upload_pdfs_to_storage.py fixtures/moog/questionnaire.pdf moog-123")

if __name__ == "__main__":
    main()

