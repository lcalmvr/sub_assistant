"""
Run Compliance Rules Table Migration
====================================
Creates the compliance_rules table in the database
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import get_conn


def run_migration():
    """Execute the compliance_rules table creation SQL."""
    
    # Read the SQL file
    sql_file_path = os.path.join(os.path.dirname(__file__), "create_compliance_rules.sql")
    
    with open(sql_file_path, "r") as f:
        sql_script = f.read()
    
    print("🔄 Creating compliance_rules table...")
    
    try:
        with get_conn() as conn:
            # Execute the SQL script
            # Split by semicolon but handle multi-line statements properly
            # SQLAlchemy text() can handle full scripts
            conn.execute(text(sql_script))
            
            print("✅ compliance_rules table created successfully!")
            
            # Verify the table was created
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'compliance_rules'
                )
            """))
            
            if result.fetchone()[0]:
                print("✅ Table verification: compliance_rules table exists")
            else:
                print("⚠️  Warning: Table verification failed")
                
    except Exception as e:
        print(f"❌ Error creating table: {e}")
        raise


if __name__ == "__main__":
    run_migration()

