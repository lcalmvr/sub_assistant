# ingest_local.py (short)
from pathlib import Path
import json, argparse
import os
from app.pipeline import process_submission, Attachment
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL) if DATABASE_URL else None

def save_document_to_db(submission_id: str, filename: str, file_path: Path, doc_type: str, content: str = None):
    """Save document metadata to the documents table."""
    if not engine:
        print("⚠️ No database connection available, skipping document save")
        return
    
    try:
        # Estimate page count based on file type
        if file_path.suffix.lower() == '.pdf':
            page_count = 1  # Default for PDFs, could be enhanced with actual page counting
        elif file_path.suffix.lower() == '.json':
            page_count = 1  # JSON files are single "page"
        else:
            page_count = 1  # Default for other file types
        
        # Create metadata based on file type
        if file_path.suffix.lower() == '.txt':
            # For emails, minimal metadata
            doc_metadata = {
                "filename": filename,
                "document_type": doc_type,
                "file_size": file_path.stat().st_size if file_path.exists() else 0,
                "ingest_source": "local_fixture"
            }
        elif file_path.suffix.lower() == '.pdf':
            # For PDFs, include file path for linking
            doc_metadata = {
                "filename": filename,
                "document_type": doc_type,
                "file_size": file_path.stat().st_size if file_path.exists() else 0,
                "ingest_source": "local_fixture",
                "file_path": str(file_path)
            }
        else:
            # For other files, include all metadata
            doc_metadata = {
                "filename": filename,
                "document_type": doc_type,
                "file_extension": file_path.suffix.lower(),
                "file_size": file_path.stat().st_size if file_path.exists() else 0,
                "ingest_source": "local_fixture",
                "full_path": str(file_path)
            }
        
        # Create extracted data based on file type
        if file_path.suffix.lower() == '.json':
            # For JSON files, try to parse and extract meaningful content
            try:
                json_content = json.loads(content) if content else {}
                extracted_data = {
                    "content": json_content,
                    "text_extracted": str(json_content)[:1000] + "..." if len(str(json_content)) > 1000 else str(json_content),
                    "confidence_score": 1.0,
                    "ingest_method": "json_parse"
                }
            except:
                extracted_data = {
                    "content": content,
                    "text_extracted": str(content)[:1000] + "..." if len(str(content)) > 1000 else str(content),
                    "confidence_score": 0.8,
                    "ingest_method": "text_parse"
                }
        elif file_path.suffix.lower() == '.txt':
            # For text files (like email.txt), keep it simple
            extracted_data = {
                "content": content,
                "confidence_score": 1.0
            }
        elif file_path.suffix.lower() == '.pdf':
            # For PDFs, store the file path for linking
            extracted_data = {
                "content": f"PDF document: {filename}",
                "file_path": str(file_path),
                "confidence_score": 1.0,
                "note": "Click to view/download the original PDF document"
            }
        else:
            # For other file types
            extracted_data = {
                "content": f"File: {filename}",
                "text_extracted": f"File uploaded: {filename}",
                "confidence_score": 0.7,
                "ingest_method": "file_upload"
            }
        
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO documents 
                    (submission_id, filename, document_type, page_count, is_priority, doc_metadata, extracted_data)
                    VALUES (:sid, :filename, :doc_type, :page_count, :is_priority, :metadata, :extracted)
                """),
                {
                    "sid": submission_id,
                    "filename": filename,
                    "doc_type": doc_type,
                    "page_count": page_count,
                    "is_priority": False,  # Default priority
                    "metadata": json.dumps(doc_metadata),
                    "extracted": json.dumps(extracted_data)
                }
            )
        print(f"📄 Saved document: {filename} ({doc_type})")
        
    except Exception as e:
        print(f"❌ Error saving document {filename}: {e}")

ap = argparse.ArgumentParser()
ap.add_argument("--dir", required=True)
args = ap.parse_args()

base = Path(args.dir)
subject, body = (base/"email.txt").read_text(encoding="utf-8").split("\n", 1)
sender = "local-fixture@example.com"

# Process JSON files for the submission pipeline
attachments = []
for jf in base.glob("*.json"):
    j = json.loads(jf.read_text(encoding="utf-8"))
    # crude type hint
    hint = "Application" if "generalInformation" in j else ("Loss Run" if "loss" in json.dumps(j).lower() else "Other")
    attachments.append(Attachment(filename=jf.name, standardized_json=j, schema_hint=hint))

sid = process_submission(subject.strip(), body.strip(), sender, attachments, use_docupipe=False)
print("✅ Ingested fixture →", sid)

# Save ALL files in the fixture folder as documents
if sid:
    print(f"📁 Processing all files in {base} as documents...")
    
    # Save email.txt as submission email
    email_path = base / "email.txt"
    if email_path.exists():
        email_content = email_path.read_text(encoding="utf-8")
        save_document_to_db(sid, "email.txt", email_path, "Submission Email", email_content)
    
    # Save JSON files with their standardized content
    for jf in base.glob("*.json"):
        json_content = jf.read_text(encoding="utf-8")
        # Determine document type
        if "generalInformation" in json_content:
            doc_type = "Application Form"
        elif "loss" in json_content.lower():
            doc_type = "Loss Run"
        else:
            doc_type = "Standardized Data"
        save_document_to_db(sid, jf.name, jf, doc_type, json_content)
    
    # Save PDF files
    for pdf_file in base.glob("*.pdf"):
        save_document_to_db(sid, pdf_file.name, pdf_file, "Questionnaire/Form")
    
    # Save any other file types (excluding system files)
    for other_file in base.glob("*"):
        if (other_file.is_file() and 
            other_file.suffix.lower() not in ['.txt', '.json', '.pdf'] and
            not other_file.name.startswith('.') and  # Skip hidden files like .DS_Store
            other_file.name != '.DS_Store'):  # Explicitly skip .DS_Store
            try:
                content = other_file.read_text(encoding="utf-8")
                save_document_to_db(sid, other_file.name, other_file, "Other Document", content)
            except:
                # Binary file or encoding issue
                save_document_to_db(sid, other_file.name, other_file, "Binary File")
    
    print("✅ All documents processed and saved!")
