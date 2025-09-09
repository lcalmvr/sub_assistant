#!/usr/bin/env python3
"""
Setup script for RAG performance metrics table
Creates the rag_metrics table in Supabase for tracking RAG system performance
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv(Path(__file__).resolve().parents[0] / ".env")

def create_metrics_table():
    """Create the rag_metrics table in Supabase"""
    
    # Initialize Supabase client with service role key for DDL operations
    supabase = create_client(
        os.getenv("SUPABASE_URL"), 
        os.getenv("SUPABASE_SERVICE_ROLE")
    )
    
    # SQL to create the metrics table
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS rag_metrics (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        operation_type VARCHAR(50) NOT NULL,
        submission_id UUID,
        query TEXT,
        response_time_ms FLOAT NOT NULL,
        retrieval_time_ms FLOAT,
        generation_time_ms FLOAT,
        num_documents_retrieved INTEGER,
        num_tokens_input INTEGER,
        num_tokens_output INTEGER,
        user_feedback VARCHAR(20),
        accuracy_score FLOAT,
        error_message TEXT,
        metadata JSONB
    );
    
    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_rag_metrics_timestamp ON rag_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_rag_metrics_operation ON rag_metrics(operation_type);
    CREATE INDEX IF NOT EXISTS idx_rag_metrics_submission ON rag_metrics(submission_id);
    CREATE INDEX IF NOT EXISTS idx_rag_metrics_feedback ON rag_metrics(user_feedback);
    """
    
    try:
        # Execute the SQL
        result = supabase.postgrest.rpc('exec_sql', {'sql': create_table_sql}).execute()
        print("✅ Successfully created rag_metrics table and indexes")
        return True
        
    except Exception as e:
        print(f"❌ Error creating metrics table: {e}")
        print("\nTrying alternative approach...")
        
        # Alternative: Try to create table directly
        try:
            # Create table using direct SQL execution
            supabase.postgrest.rpc('exec', {'sql': create_table_sql}).execute()
            print("✅ Successfully created rag_metrics table using alternative method")
            return True
        except Exception as e2:
            print(f"❌ Alternative method also failed: {e2}")
            print("\nManual setup required:")
            print("1. Go to your Supabase dashboard")
            print("2. Navigate to SQL Editor")
            print("3. Run the following SQL:")
            print("\n" + "="*50)
            print(create_table_sql)
            print("="*50)
            return False

def verify_table_exists():
    """Verify that the table was created successfully"""
    supabase = create_client(
        os.getenv("SUPABASE_URL"), 
        os.getenv("SUPABASE_SERVICE_ROLE")
    )
    
    try:
        # Try to query the table
        result = supabase.table('rag_metrics').select('id').limit(1).execute()
        print("✅ rag_metrics table exists and is accessible")
        return True
    except Exception as e:
        print(f"❌ rag_metrics table not accessible: {e}")
        return False

def main():
    """Main setup function"""
    print("🚀 Setting up RAG Performance Metrics Table")
    print("=" * 50)
    
    # Check environment variables
    required_vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print(f"❌ Missing required environment variables: {missing_vars}")
        print("Please ensure your .env file contains:")
        for var in missing_vars:
            print(f"  {var}=your_value_here")
        return False
    
    print("✅ Environment variables found")
    
    # Create the table
    if create_metrics_table():
        # Verify it was created
        if verify_table_exists():
            print("\n🎉 Setup complete! Performance metrics are ready to track.")
            print("\nNext steps:")
            print("1. Run your RAG system to start collecting metrics")
            print("2. Use the '📊 Show Performance Stats' button in the viewer")
            print("3. Provide feedback on AI recommendations to improve accuracy tracking")
            return True
    
    return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

