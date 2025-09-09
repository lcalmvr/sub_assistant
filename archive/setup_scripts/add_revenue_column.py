#!/usr/bin/env python3
"""
Migration script to add revenue column to existing submissions table.
Run this script if you have an existing database that needs the revenue column.
"""

import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv(Path('.') / '.env')

DATABASE_URL = os.getenv("DATABASE_URL")

def add_revenue_column():
    """Add revenue column to existing submissions table."""
    if not DATABASE_URL:
        print("❌ DATABASE_URL not found in environment variables")
        return
    
    try:
        print("Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Check if column already exists
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'submissions' AND column_name = 'revenue'
        """)
        
        if cur.fetchone():
            print("✅ Revenue column already exists")
            return
        
        # Add revenue column
        print("Adding revenue column...")
        cur.execute("""
            ALTER TABLE submissions 
            ADD COLUMN revenue BIGINT
        """)
        
        # Add index for better query performance
        print("Adding revenue index...")
        cur.execute("""
            CREATE INDEX idx_submissions_revenue 
            ON submissions(revenue)
        """)
        
        conn.commit()
        print("✅ Revenue column and index added successfully")
        
        # Show table structure
        cur.execute("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'submissions' 
            ORDER BY ordinal_position
        """)
        
        print("\n📋 Current table structure:")
        for row in cur.fetchall():
            print(f"  {row[0]}: {row[1]} ({'NULL' if row[2] == 'YES' else 'NOT NULL'})")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        if conn:
            conn.rollback()
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    add_revenue_column()
