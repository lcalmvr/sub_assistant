"""
Phase 1 Data Migration Script

Migrates existing submission data to the new lifecycle management schema:
1. Backfills status history with initial entries for all submissions
2. Auto-creates accounts from existing submissions (grouped by normalized name)
3. Links submissions to their accounts
"""

import os
import sys
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import get_conn


def normalize_name(name: str) -> str:
    """Normalize company name for matching."""
    if not name:
        return ""
    return name.lower().strip()


def backfill_status_history():
    """
    Create initial status history entries for all existing submissions.
    Each submission gets one entry recording its current status.
    """
    print("Backfilling status history...")

    with get_conn() as conn:
        # Get all submissions that don't have any history entries
        result = conn.execute(text("""
            SELECT s.id, s.submission_status, s.submission_outcome, s.status_updated_at, s.created_at
            FROM submissions s
            LEFT JOIN submission_status_history h ON h.submission_id = s.id
            WHERE h.id IS NULL
        """))

        submissions = result.fetchall()
        print(f"Found {len(submissions)} submissions without history entries")

        count = 0
        for sub in submissions:
            sub_id, status, outcome, status_updated_at, created_at = sub

            # Use status_updated_at if available, otherwise use created_at
            changed_at = status_updated_at or created_at or datetime.utcnow()

            conn.execute(text("""
                INSERT INTO submission_status_history
                    (submission_id, old_status, new_status, old_outcome, new_outcome, changed_by, changed_at, notes)
                VALUES
                    (:submission_id, NULL, :new_status, NULL, :new_outcome, 'migration', :changed_at, 'Initial status from migration')
            """), {
                "submission_id": sub_id,
                "new_status": status or "received",
                "new_outcome": outcome or "pending",
                "changed_at": changed_at
            })
            count += 1

        conn.commit()
        print(f"Created {count} status history entries")


def create_accounts_from_submissions():
    """
    Auto-create accounts from existing submissions.
    Groups submissions by normalized applicant_name and creates one account per unique name.
    Links all matching submissions to their account.
    """
    print("Creating accounts from existing submissions...")

    with get_conn() as conn:
        # Get distinct applicant names that don't have accounts yet
        result = conn.execute(text("""
            SELECT DISTINCT applicant_name, website, naics_primary_code, naics_primary_title
            FROM submissions
            WHERE account_id IS NULL
            AND applicant_name IS NOT NULL
            AND applicant_name != ''
            ORDER BY applicant_name
        """))

        # Group by normalized name to avoid duplicates
        name_groups = {}
        for row in result.fetchall():
            name, website, naics_code, naics_title = row
            normalized = normalize_name(name)

            if normalized not in name_groups:
                name_groups[normalized] = {
                    "name": name,  # Use first occurrence as canonical name
                    "website": website,
                    "naics_code": naics_code,
                    "naics_title": naics_title
                }

        print(f"Found {len(name_groups)} unique account names")

        # Create accounts and link submissions
        accounts_created = 0
        submissions_linked = 0

        for normalized, data in name_groups.items():
            # Check if account with this normalized name already exists
            existing = conn.execute(text("""
                SELECT id FROM accounts WHERE normalized_name = :normalized
            """), {"normalized": normalized}).fetchone()

            if existing:
                account_id = existing[0]
            else:
                # Create new account
                result = conn.execute(text("""
                    INSERT INTO accounts (name, normalized_name, website, naics_code, naics_title)
                    VALUES (:name, :normalized_name, :website, :naics_code, :naics_title)
                    RETURNING id
                """), {
                    "name": data["name"],
                    "normalized_name": normalized,
                    "website": data["website"],
                    "naics_code": data["naics_code"],
                    "naics_title": data["naics_title"]
                })
                account_id = result.fetchone()[0]
                accounts_created += 1

            # Link all submissions with this normalized name to the account
            result = conn.execute(text("""
                UPDATE submissions
                SET account_id = :account_id
                WHERE LOWER(TRIM(applicant_name)) = :normalized
                AND account_id IS NULL
            """), {
                "account_id": account_id,
                "normalized": normalized
            })
            submissions_linked += result.rowcount

        conn.commit()
        print(f"Created {accounts_created} new accounts")
        print(f"Linked {submissions_linked} submissions to accounts")


def verify_migration():
    """Verify the migration completed successfully."""
    print("\nVerifying migration...")

    with get_conn() as conn:
        # Check status history
        result = conn.execute(text("""
            SELECT COUNT(*) FROM submission_status_history
        """))
        history_count = result.fetchone()[0]
        print(f"Status history entries: {history_count}")

        # Check accounts
        result = conn.execute(text("""
            SELECT COUNT(*) FROM accounts
        """))
        account_count = result.fetchone()[0]
        print(f"Accounts created: {account_count}")

        # Check linked submissions
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total,
                COUNT(account_id) as linked
            FROM submissions
        """))
        row = result.fetchone()
        total, linked = row
        print(f"Submissions: {linked}/{total} linked to accounts")

        # Check for any orphaned submissions
        if linked < total:
            result = conn.execute(text("""
                SELECT id, applicant_name
                FROM submissions
                WHERE account_id IS NULL
                LIMIT 5
            """))
            orphans = result.fetchall()
            if orphans:
                print("Sample unlinked submissions:")
                for sub_id, name in orphans:
                    print(f"  - {name} ({sub_id})")


def run_migration():
    """Run the full migration."""
    print("=" * 60)
    print("Phase 1 Lifecycle Management Migration")
    print("=" * 60)

    try:
        backfill_status_history()
        print()
        create_accounts_from_submissions()
        print()
        verify_migration()

        print()
        print("=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\nMigration failed: {e}")
        raise


if __name__ == "__main__":
    run_migration()
