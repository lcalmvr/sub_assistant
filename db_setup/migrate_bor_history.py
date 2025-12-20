#!/usr/bin/env python3
"""
Migration script to seed broker_of_record_history from existing bound submissions.

This script:
1. Finds all submissions with a bound option that have a broker_id
2. Creates an initial broker history record for each one
3. Uses the policy effective_date as the history effective_date

Run this after creating the broker_of_record_history table.
"""

import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def migrate_broker_history():
    """Seed broker_of_record_history from existing bound submissions."""
    print("Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Find all bound submissions with broker_id
    print("Finding bound submissions with brokers...")
    cur.execute("""
        SELECT
            s.id as submission_id,
            s.broker_id,
            s.effective_date
        FROM submissions s
        JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
        WHERE s.broker_id IS NOT NULL
    """)

    bound_submissions = cur.fetchall()
    print(f"Found {len(bound_submissions)} bound submissions with brokers")

    # Check how many already have history
    cur.execute("SELECT COUNT(*) FROM broker_of_record_history")
    existing_count = cur.fetchone()[0]
    print(f"Existing broker history records: {existing_count}")

    if existing_count > 0:
        print("Broker history already exists. Skipping entries that already have history...")

    # Insert history records for each submission
    inserted = 0
    skipped = 0

    for submission_id, broker_id, effective_date in bound_submissions:
        # Check if history already exists for this submission
        cur.execute("""
            SELECT 1 FROM broker_of_record_history
            WHERE submission_id = %s
            LIMIT 1
        """, (submission_id,))

        if cur.fetchone():
            skipped += 1
            continue

        # Use effective_date if available, otherwise use current date
        if not effective_date:
            from datetime import date
            effective_date = date.today()

        # Insert initial history record
        cur.execute("""
            INSERT INTO broker_of_record_history (
                submission_id, broker_id, broker_contact_id,
                effective_date, end_date, change_type, created_by
            ) VALUES (
                %s, %s, NULL,
                %s, NULL, 'original', 'migration'
            )
        """, (submission_id, broker_id, effective_date))

        inserted += 1

    conn.commit()

    print(f"Migration complete!")
    print(f"  - Inserted: {inserted} new history records")
    print(f"  - Skipped: {skipped} (already had history)")

    # Verify
    cur.execute("SELECT COUNT(*) FROM broker_of_record_history")
    total_count = cur.fetchone()[0]
    print(f"  - Total history records: {total_count}")

    cur.close()
    conn.close()


def verify_migration():
    """Verify the migration was successful."""
    print("\nVerifying migration...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Count bound submissions with broker
    cur.execute("""
        SELECT COUNT(DISTINCT s.id)
        FROM submissions s
        JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
        WHERE s.broker_id IS NOT NULL
    """)
    bound_with_broker = cur.fetchone()[0]

    # Count history records
    cur.execute("SELECT COUNT(*) FROM broker_of_record_history")
    history_count = cur.fetchone()[0]

    print(f"Bound submissions with broker: {bound_with_broker}")
    print(f"Broker history records: {history_count}")

    if history_count >= bound_with_broker:
        print("Verification PASSED: All bound submissions have broker history")
    else:
        print("Verification WARNING: Some bound submissions may not have broker history")

    # Show sample data
    cur.execute("""
        SELECT
            bh.submission_id,
            b.company_name as broker_name,
            bh.effective_date,
            bh.change_type
        FROM broker_of_record_history bh
        JOIN brokers b ON bh.broker_id = b.id
        ORDER BY bh.created_at DESC
        LIMIT 5
    """)

    print("\nSample broker history records:")
    for row in cur.fetchall():
        print(f"  - Submission {str(row[0])[:8]}... -> {row[1]} (effective: {row[2]}, type: {row[3]})")

    cur.close()
    conn.close()


if __name__ == "__main__":
    migrate_broker_history()
    verify_migration()
