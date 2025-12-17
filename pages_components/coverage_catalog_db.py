"""
Coverage Catalog Database Operations
Manages the master catalog of carrier-specific coverages mapped to standardized tags.
"""
from __future__ import annotations

import os
from typing import Optional, List, Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def _get_conn():
    """Get or create database connection for coverage catalog."""
    conn = st.session_state.get("coverage_catalog_conn")

    try:
        if conn is not None and conn.closed == 0:
            with conn.cursor() as test_cur:
                test_cur.execute("SELECT 1")
            return conn
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        st.session_state.pop("coverage_catalog_conn", None)
        conn = None

    if conn is None or conn.closed != 0:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        st.session_state["coverage_catalog_conn"] = conn

    return conn


def _get_current_user() -> str:
    """Get current user from session state or environment."""
    return st.session_state.get("current_user", os.getenv("USER", "unknown"))


# ─────────────────────── Submission Functions ───────────────────────

def submit_coverage_mapping(
    carrier_name: str,
    coverage_original: str,
    coverage_normalized: List[str],
    policy_form: Optional[str] = None,
    coverage_description: Optional[str] = None,
    notes: Optional[str] = None,
    source_quote_id: Optional[str] = None,
    source_submission_id: Optional[str] = None,
) -> Optional[str]:
    """
    Submit a new coverage mapping to the catalog.

    If the mapping already exists (same carrier + policy_form + coverage_original),
    returns the existing ID without creating a duplicate.

    Args:
        coverage_normalized: List of standardized tags (one coverage can map to multiple)

    Returns:
        The catalog entry ID (new or existing), or None on error
    """
    conn = _get_conn()
    user = _get_current_user()

    # Ensure coverage_normalized is a list
    if isinstance(coverage_normalized, str):
        coverage_normalized = [coverage_normalized]

    try:
        with conn.cursor() as cur:
            # Try to insert, on conflict return existing
            cur.execute("""
                INSERT INTO coverage_catalog (
                    carrier_name, policy_form, coverage_original, coverage_normalized,
                    coverage_description, notes, submitted_by,
                    source_quote_id, source_submission_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (carrier_name, policy_form, coverage_original)
                DO UPDATE SET updated_at = now()
                RETURNING id
            """, (
                carrier_name,
                policy_form,
                coverage_original,
                coverage_normalized,  # PostgreSQL will accept Python list as array
                coverage_description,
                notes,
                user,
                source_quote_id,
                source_submission_id,
            ))
            result = cur.fetchone()
            return str(result[0]) if result else None
    except Exception as e:
        st.error(f"Error submitting coverage mapping: {e}")
        return None


def submit_coverages_batch(
    carrier_name: str,
    coverages: List[Dict[str, Any]],
    policy_form: Optional[str] = None,
    source_quote_id: Optional[str] = None,
    source_submission_id: Optional[str] = None,
) -> int:
    """
    Submit multiple coverage mappings at once.

    Args:
        carrier_name: Name of the insurance carrier
        coverages: List of dicts with 'coverage' and 'coverage_normalized' keys
        policy_form: Optional policy form identifier
        source_quote_id: Quote where these were extracted
        source_submission_id: Submission context

    Returns:
        Number of coverages submitted (new or updated)
    """
    count = 0
    for cov in coverages:
        coverage_original = cov.get("coverage", "")
        coverage_normalized = cov.get("coverage_normalized", "")
        notes = cov.get("notes")

        if coverage_original and coverage_normalized:
            result = submit_coverage_mapping(
                carrier_name=carrier_name,
                coverage_original=coverage_original,
                coverage_normalized=coverage_normalized,
                policy_form=policy_form,
                notes=notes,
                source_quote_id=source_quote_id,
                source_submission_id=source_submission_id,
            )
            if result:
                count += 1

    return count


# ─────────────────────── Lookup Functions ───────────────────────

def lookup_coverage(
    carrier_name: str,
    coverage_original: str,
    policy_form: Optional[str] = None,
    approved_only: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Look up a coverage mapping from the catalog.

    Args:
        carrier_name: Name of the insurance carrier
        coverage_original: Original coverage name from document
        policy_form: Optional policy form to narrow search
        approved_only: If True, only return approved mappings

    Returns:
        Dict with coverage info, or None if not found
    """
    conn = _get_conn()

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if policy_form:
                cur.execute("""
                    SELECT * FROM coverage_catalog
                    WHERE carrier_name = %s
                    AND coverage_original = %s
                    AND policy_form = %s
                    AND (NOT %s OR status = 'approved')
                    ORDER BY status = 'approved' DESC
                    LIMIT 1
                """, (carrier_name, coverage_original, policy_form, approved_only))
            else:
                cur.execute("""
                    SELECT * FROM coverage_catalog
                    WHERE carrier_name = %s
                    AND coverage_original = %s
                    AND (NOT %s OR status = 'approved')
                    ORDER BY status = 'approved' DESC
                    LIMIT 1
                """, (carrier_name, coverage_original, approved_only))

            row = cur.fetchone()
            return dict(row) if row else None
    except Exception:
        return None


def get_carrier_coverages(
    carrier_name: str,
    policy_form: Optional[str] = None,
    approved_only: bool = True,
) -> List[Dict[str, Any]]:
    """
    Get all coverage mappings for a carrier.

    Returns:
        List of coverage mapping dicts
    """
    conn = _get_conn()

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if policy_form:
                cur.execute("""
                    SELECT * FROM coverage_catalog
                    WHERE carrier_name = %s
                    AND policy_form = %s
                    AND (NOT %s OR status = 'approved')
                    ORDER BY coverage_original
                """, (carrier_name, policy_form, approved_only))
            else:
                cur.execute("""
                    SELECT * FROM coverage_catalog
                    WHERE carrier_name = %s
                    AND (NOT %s OR status = 'approved')
                    ORDER BY policy_form, coverage_original
                """, (carrier_name, approved_only))

            return [dict(row) for row in cur.fetchall()]
    except Exception:
        return []


def get_all_carriers() -> List[str]:
    """Get list of all carriers in the catalog."""
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT carrier_name
                FROM coverage_catalog
                ORDER BY carrier_name
            """)
            return [row[0] for row in cur.fetchall()]
    except Exception:
        return []


# ─────────────────────── Admin/Review Functions ───────────────────────

def get_pending_reviews() -> List[Dict[str, Any]]:
    """Get all coverage mappings pending review."""
    conn = _get_conn()

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM coverage_catalog
                WHERE status = 'pending'
                ORDER BY submitted_at DESC
            """)
            return [dict(row) for row in cur.fetchall()]
    except Exception:
        return []


def approve_coverage(catalog_id: str, review_notes: Optional[str] = None) -> bool:
    """Approve a coverage mapping."""
    conn = _get_conn()
    user = _get_current_user()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET status = 'approved',
                    reviewed_by = %s,
                    reviewed_at = now(),
                    review_notes = %s
                WHERE id = %s
            """, (user, review_notes, catalog_id))
            return cur.rowcount > 0
    except Exception:
        return False


def reject_coverage(catalog_id: str, review_notes: Optional[str] = None) -> bool:
    """Reject a coverage mapping."""
    conn = _get_conn()
    user = _get_current_user()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET status = 'rejected',
                    reviewed_by = %s,
                    reviewed_at = now(),
                    review_notes = %s
                WHERE id = %s
            """, (user, review_notes, catalog_id))
            return cur.rowcount > 0
    except Exception:
        return False


def update_normalized_tags(catalog_id: str, coverage_normalized: List[str]) -> bool:
    """Update the normalized tags for a coverage mapping."""
    conn = _get_conn()

    # Ensure it's a list
    if isinstance(coverage_normalized, str):
        coverage_normalized = [coverage_normalized]

    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET coverage_normalized = %s
                WHERE id = %s
            """, (coverage_normalized, catalog_id))
            return cur.rowcount > 0
    except Exception:
        return False


def add_normalized_tag(catalog_id: str, tag: str) -> bool:
    """Add a normalized tag to a coverage mapping (if not already present)."""
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET coverage_normalized = array_append(coverage_normalized, %s)
                WHERE id = %s
                AND NOT %s = ANY(coverage_normalized)
            """, (tag, catalog_id, tag))
            return cur.rowcount > 0
    except Exception:
        return False


def remove_normalized_tag(catalog_id: str, tag: str) -> bool:
    """Remove a normalized tag from a coverage mapping."""
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET coverage_normalized = array_remove(coverage_normalized, %s)
                WHERE id = %s
            """, (tag, catalog_id))
            return cur.rowcount > 0
    except Exception:
        return False


def delete_coverage(catalog_id: str) -> bool:
    """Delete a coverage mapping from the catalog."""
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM coverage_catalog WHERE id = %s", (catalog_id,))
            return cur.rowcount > 0
    except Exception:
        return False


def delete_rejected_coverages(carrier_name: Optional[str] = None) -> int:
    """Delete all rejected coverage mappings, optionally filtered by carrier."""
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            if carrier_name:
                cur.execute("""
                    DELETE FROM coverage_catalog
                    WHERE status = 'rejected' AND carrier_name = %s
                """, (carrier_name,))
            else:
                cur.execute("DELETE FROM coverage_catalog WHERE status = 'rejected'")
            return cur.rowcount
    except Exception:
        return 0


def reset_to_pending(catalog_id: str) -> bool:
    """Reset a coverage mapping back to pending status."""
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE coverage_catalog
                SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL
                WHERE id = %s
            """, (catalog_id,))
            return cur.rowcount > 0
    except Exception:
        return False


# ─────────────────────── Statistics ───────────────────────

def get_catalog_stats() -> Dict[str, int]:
    """Get summary statistics for the coverage catalog."""
    conn = _get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'approved') as approved,
                    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                    COUNT(DISTINCT carrier_name) as carriers,
                    COUNT(DISTINCT coverage_normalized) as unique_tags
                FROM coverage_catalog
            """)
            row = cur.fetchone()
            return {
                "total": row[0],
                "pending": row[1],
                "approved": row[2],
                "rejected": row[3],
                "carriers": row[4],
                "unique_tags": row[5],
            }
    except Exception:
        return {"total": 0, "pending": 0, "approved": 0, "rejected": 0, "carriers": 0, "unique_tags": 0}
