"""
Account Management Module

Handles account CRUD operations and fuzzy matching for linking submissions
to persistent account entities across policy years.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import text
import os
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn


def normalize_name(name: str) -> str:
    """Normalize company name for matching - lowercase and stripped."""
    if not name:
        return ""
    return name.lower().strip()


def create_account(
    name: str,
    website: Optional[str] = None,
    industry: Optional[str] = None,
    naics_code: Optional[str] = None,
    naics_title: Optional[str] = None,
    notes: Optional[str] = None
) -> dict:
    """
    Create a new account.

    Args:
        name: Company/insured name
        website: Company website
        industry: Industry description
        naics_code: NAICS code
        naics_title: NAICS title
        notes: Additional notes

    Returns:
        dict with created account data including id
    """
    normalized = normalize_name(name)

    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO accounts (name, normalized_name, website, industry, naics_code, naics_title, notes)
            VALUES (:name, :normalized_name, :website, :industry, :naics_code, :naics_title, :notes)
            RETURNING id, name, normalized_name, website, industry, naics_code, naics_title, notes, created_at, updated_at
        """), {
            "name": name,
            "normalized_name": normalized,
            "website": website,
            "industry": industry,
            "naics_code": naics_code,
            "naics_title": naics_title,
            "notes": notes
        })

        row = result.fetchone()
        conn.commit()

        return {
            "id": str(row[0]),
            "name": row[1],
            "normalized_name": row[2],
            "website": row[3],
            "industry": row[4],
            "naics_code": row[5],
            "naics_title": row[6],
            "notes": row[7],
            "created_at": row[8],
            "updated_at": row[9]
        }


def get_account(account_id: str) -> Optional[dict]:
    """
    Get an account by ID.

    Args:
        account_id: UUID of the account

    Returns:
        dict with account data or None if not found
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, name, normalized_name, website, industry, naics_code, naics_title, notes, created_at, updated_at
            FROM accounts
            WHERE id = :account_id
        """), {"account_id": account_id})

        row = result.fetchone()
        if not row:
            return None

        return {
            "id": str(row[0]),
            "name": row[1],
            "normalized_name": row[2],
            "website": row[3],
            "industry": row[4],
            "naics_code": row[5],
            "naics_title": row[6],
            "notes": row[7],
            "created_at": row[8],
            "updated_at": row[9]
        }


def update_account(
    account_id: str,
    name: Optional[str] = None,
    website: Optional[str] = None,
    industry: Optional[str] = None,
    naics_code: Optional[str] = None,
    naics_title: Optional[str] = None,
    notes: Optional[str] = None
) -> Optional[dict]:
    """
    Update an existing account. Only provided fields are updated.

    Returns:
        Updated account dict or None if not found
    """
    updates = []
    params = {"account_id": account_id}

    if name is not None:
        updates.append("name = :name")
        updates.append("normalized_name = :normalized_name")
        params["name"] = name
        params["normalized_name"] = normalize_name(name)
    if website is not None:
        updates.append("website = :website")
        params["website"] = website
    if industry is not None:
        updates.append("industry = :industry")
        params["industry"] = industry
    if naics_code is not None:
        updates.append("naics_code = :naics_code")
        params["naics_code"] = naics_code
    if naics_title is not None:
        updates.append("naics_title = :naics_title")
        params["naics_title"] = naics_title
    if notes is not None:
        updates.append("notes = :notes")
        params["notes"] = notes

    if not updates:
        return get_account(account_id)

    with get_conn() as conn:
        result = conn.execute(text(f"""
            UPDATE accounts
            SET {", ".join(updates)}
            WHERE id = :account_id
            RETURNING id, name, normalized_name, website, industry, naics_code, naics_title, notes, created_at, updated_at
        """), params)

        row = result.fetchone()
        conn.commit()

        if not row:
            return None

        return {
            "id": str(row[0]),
            "name": row[1],
            "normalized_name": row[2],
            "website": row[3],
            "industry": row[4],
            "naics_code": row[5],
            "naics_title": row[6],
            "notes": row[7],
            "created_at": row[8],
            "updated_at": row[9]
        }


def find_matching_accounts(applicant_name: str, threshold: float = 0.3, limit: int = 5) -> list[dict]:
    """
    Find accounts matching applicant name using trigram similarity.

    Uses PostgreSQL pg_trgm extension for fuzzy matching.

    Args:
        applicant_name: Name to search for
        threshold: Minimum similarity score (0-1), default 0.3
        limit: Maximum number of results

    Returns:
        List of matching accounts with similarity scores, ordered by score desc
    """
    if not applicant_name:
        return []

    normalized = normalize_name(applicant_name)

    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, name, website, industry, naics_code, naics_title,
                   similarity(normalized_name, :name) as score
            FROM accounts
            WHERE similarity(normalized_name, :name) > :threshold
            ORDER BY score DESC
            LIMIT :limit
        """), {"name": normalized, "threshold": threshold, "limit": limit})

        return [
            {
                "id": str(row[0]),
                "name": row[1],
                "website": row[2],
                "industry": row[3],
                "naics_code": row[4],
                "naics_title": row[5],
                "score": float(row[6])
            }
            for row in result.fetchall()
        ]


def search_accounts(query: str, limit: int = 10) -> list[dict]:
    """
    Search accounts by name (partial match).

    Args:
        query: Search string
        limit: Maximum number of results

    Returns:
        List of matching accounts
    """
    if not query:
        return []

    normalized = normalize_name(query)

    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, name, website, industry, naics_code, naics_title
            FROM accounts
            WHERE normalized_name LIKE :pattern
            ORDER BY name ASC
            LIMIT :limit
        """), {"pattern": f"%{normalized}%", "limit": limit})

        return [
            {
                "id": str(row[0]),
                "name": row[1],
                "website": row[2],
                "industry": row[3],
                "naics_code": row[4],
                "naics_title": row[5]
            }
            for row in result.fetchall()
        ]


def link_submission_to_account(submission_id: str, account_id: str) -> bool:
    """
    Associate a submission with an account.

    Args:
        submission_id: UUID of the submission
        account_id: UUID of the account

    Returns:
        True if successful
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE submissions
            SET account_id = :account_id,
                updated_at = :updated_at
            WHERE id = :submission_id
        """), {
            "submission_id": submission_id,
            "account_id": account_id,
            "updated_at": datetime.utcnow()
        })

        conn.commit()
        return result.rowcount > 0


def unlink_submission_from_account(submission_id: str) -> bool:
    """
    Remove account association from a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        True if successful
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE submissions
            SET account_id = NULL,
                updated_at = :updated_at
            WHERE id = :submission_id
        """), {
            "submission_id": submission_id,
            "updated_at": datetime.utcnow()
        })

        conn.commit()
        return result.rowcount > 0


def get_submission_account(submission_id: str) -> Optional[dict]:
    """
    Get the account associated with a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        Account dict or None if not linked
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT a.id, a.name, a.normalized_name, a.website, a.industry,
                   a.naics_code, a.naics_title, a.notes, a.created_at, a.updated_at
            FROM accounts a
            JOIN submissions s ON s.account_id = a.id
            WHERE s.id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row:
            return None

        return {
            "id": str(row[0]),
            "name": row[1],
            "normalized_name": row[2],
            "website": row[3],
            "industry": row[4],
            "naics_code": row[5],
            "naics_title": row[6],
            "notes": row[7],
            "created_at": row[8],
            "updated_at": row[9]
        }


def get_account_submissions(account_id: str) -> list[dict]:
    """
    Get all submissions for an account, ordered by date.

    Args:
        account_id: UUID of the account

    Returns:
        List of submission summaries for this account
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, applicant_name, date_received, submission_status,
                   submission_outcome, outcome_reason, annual_revenue,
                   naics_primary_title, created_at
            FROM submissions
            WHERE account_id = :account_id
            ORDER BY date_received DESC
        """), {"account_id": account_id})

        return [
            {
                "id": str(row[0]),
                "applicant_name": row[1],
                "date_received": row[2],
                "submission_status": row[3],
                "submission_outcome": row[4],
                "outcome_reason": row[5],
                "annual_revenue": row[6],
                "naics_primary_title": row[7],
                "created_at": row[8]
            }
            for row in result.fetchall()
        ]


def get_all_accounts(limit: int = 100, offset: int = 0) -> list[dict]:
    """
    Get all accounts with pagination.

    Args:
        limit: Maximum number of results
        offset: Number of records to skip

    Returns:
        List of accounts
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT a.id, a.name, a.website, a.industry, a.naics_code, a.naics_title,
                   a.created_at, a.updated_at,
                   COUNT(s.id) as submission_count
            FROM accounts a
            LEFT JOIN submissions s ON s.account_id = a.id
            GROUP BY a.id, a.name, a.website, a.industry, a.naics_code, a.naics_title,
                     a.created_at, a.updated_at
            ORDER BY a.name ASC
            LIMIT :limit OFFSET :offset
        """), {"limit": limit, "offset": offset})

        return [
            {
                "id": str(row[0]),
                "name": row[1],
                "website": row[2],
                "industry": row[3],
                "naics_code": row[4],
                "naics_title": row[5],
                "created_at": row[6],
                "updated_at": row[7],
                "submission_count": row[8]
            }
            for row in result.fetchall()
        ]


def create_account_from_submission(submission_id: str) -> dict:
    """
    Create a new account using data from an existing submission and link them.

    Args:
        submission_id: UUID of the submission to create account from

    Returns:
        Created account dict
    """
    with get_conn() as conn:
        # Fetch submission data
        result = conn.execute(text("""
            SELECT applicant_name, website, naics_primary_code, naics_primary_title
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row:
            raise ValueError(f"Submission {submission_id} not found")

        applicant_name, website, naics_code, naics_title = row

    # Create the account
    account = create_account(
        name=applicant_name,
        website=website,
        naics_code=naics_code,
        naics_title=naics_title
    )

    # Link submission to account
    link_submission_to_account(submission_id, account["id"])

    return account
