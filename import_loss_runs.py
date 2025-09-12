#!/usr/bin/env python3
"""
Import loss runs documents and populate loss history table
"""

import os
import json
import psycopg2
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

def get_moog_submission_id():
    """Get the submission ID for Moog"""
    conn = psycopg2.connect(DATABASE_URL)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM submissions WHERE applicant_name ILIKE '%moog%' LIMIT 1")
        result = cur.fetchone()
        if result:
            return result[0]
    conn.close()
    return None

def import_document(file_path, submission_id, document_type="loss_runs"):
    """Import a document into the documents table"""
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    
    filename = os.path.basename(file_path)
    
    # Read file content based on type
    if file_path.endswith('.json'):
        with open(file_path, 'r') as f:
            content = f.read()
            extracted_data = json.loads(content)
    elif file_path.endswith(('.pdf', '.png', '.jpg', '.jpeg')):
        with open(file_path, 'rb') as f:
            content = f.read()
            file_ext = os.path.splitext(file_path)[1]
            extracted_data = {"file_size": len(content), "file_type": file_ext[1:]}
    else:
        with open(file_path, 'r') as f:
            content = f.read()
            extracted_data = {"file_size": len(content)}
    
    # Check if document already exists
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM documents WHERE submission_id = %s AND filename = %s",
            (submission_id, filename)
        )
        if cur.fetchone():
            print(f"Document {filename} already exists, skipping...")
            conn.close()
            return
    
    # Insert document
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO documents 
            (submission_id, filename, document_type, page_count, is_priority, doc_metadata, extracted_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            submission_id,
            filename,
            document_type,
            1,  # page_count
            True,  # is_priority for loss runs
            json.dumps({"imported_at": datetime.now().isoformat()}),
            json.dumps(extracted_data)
        ))
    
    conn.close()
    print(f"Imported document: {filename}")

def parse_loss_runs_json(json_file_path, submission_id):
    """Parse loss runs JSON and populate loss history table"""
    with open(json_file_path, 'r') as f:
        loss_data = json.load(f)
    
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    
    # Clear existing loss history for this submission
    with conn.cursor() as cur:
        cur.execute("DELETE FROM loss_history WHERE submission_id = %s", (submission_id,))
        
        # Parse and insert loss history records
        if isinstance(loss_data, dict) and 'data' in loss_data and 'claims' in loss_data['data']:
            # Handle ProAssurance format
            for claim in loss_data['data']['claims']:
                insert_loss_record(cur, submission_id, claim, loss_data['data'].get('reportInfo', {}))
        elif isinstance(loss_data, list):
            # Handle array of loss records
            for loss in loss_data:
                insert_loss_record(cur, submission_id, loss)
        elif isinstance(loss_data, dict):
            # Handle single loss record or other structured data
            if 'losses' in loss_data:
                for loss in loss_data['losses']:
                    insert_loss_record(cur, submission_id, loss)
            else:
                insert_loss_record(cur, submission_id, loss_data)
    
    conn.close()
    print(f"Imported loss history data from {json_file_path}")

def insert_loss_record(cursor, submission_id, loss_record, report_info=None):
    """Insert a single loss record into the database"""
    try:
        # Handle ProAssurance format
        loss_date = loss_record.get('lossDate') or loss_record.get('loss_date') or loss_record.get('date_of_loss')
        if loss_date:
            loss_date = datetime.strptime(loss_date, '%Y-%m-%d').date() if isinstance(loss_date, str) else loss_date
        
        # Extract carrier name from report_info if available
        carrier_name = (report_info or {}).get('carrier', '') or loss_record.get('issueCompany', '') or loss_record.get('carrier_name', '')
        
        cursor.execute("""
            INSERT INTO loss_history 
            (submission_id, loss_date, loss_type, loss_description, loss_amount, 
             claim_status, claim_number, carrier_name, policy_period_start, 
             policy_period_end, deductible, reserve_amount, paid_amount, recovery_amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            submission_id,
            loss_date,
            loss_record.get('claimType') or loss_record.get('loss_type', 'Unknown'),
            loss_record.get('description', ''),
            float(loss_record.get('totalIncurred', 0)) if loss_record.get('totalIncurred') else (float(loss_record.get('loss_amount', 0)) if loss_record.get('loss_amount') else None),
            loss_record.get('status') or loss_record.get('claim_status', 'Unknown'),
            loss_record.get('claimNumber') or loss_record.get('claim_number', ''),
            carrier_name,
            loss_record.get('policy_period_start'),
            loss_record.get('policy_period_end'),
            float(loss_record.get('deductible', 0)) if loss_record.get('deductible') else None,
            float(loss_record.get('reserve_amount', 0)) if loss_record.get('reserve_amount') else None,
            float(loss_record.get('totalPaid', 0)) if loss_record.get('totalPaid') else (float(loss_record.get('paid_amount', 0)) if loss_record.get('paid_amount') else None),
            float(loss_record.get('recovery_amount', 0)) if loss_record.get('recovery_amount') else None
        ))
    except Exception as e:
        print(f"Error inserting loss record: {e}")
        print(f"Record data: {loss_record}")

if __name__ == "__main__":
    submission_id = get_moog_submission_id()
    
    if not submission_id:
        print("Could not find Moog submission ID")
        exit(1)
    
    print(f"Found Moog submission ID: {submission_id}")
    
    # Look for loss runs files in fixtures/moog/
    fixtures_dir = "fixtures/moog/"
    
    # Import ProAssurance loss runs files
    proassurance_files = [
        ("ProAssurance.png", "loss_runs_image"),
        ("ProAssurance.png.standardized.json", "loss_runs_json")
    ]
    
    for filename, doc_type in proassurance_files:
        file_path = os.path.join(fixtures_dir, filename)
        
        if os.path.exists(file_path):
            print(f"Importing {doc_type}: {filename}")
            import_document(file_path, submission_id, doc_type)
            
            # If it's the JSON file, also parse it for loss history data
            if filename.endswith('.json'):
                parse_loss_runs_json(file_path, submission_id)
        else:
            print(f"File not found: {filename}")
    
    print("Import complete!")