"""
Endorsement Catalog Module

Manages the endorsement bank - reusable endorsement templates with
formal titles for printing and categorization.
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


# Position options
POSITION_OPTIONS = {
    "primary": "Primary Only",
    "excess": "Excess Only",
    "either": "Primary or Excess",
}


def get_catalog_entries(
    position: str = None,
    endorsement_type: str = None,
    midterm_only: bool = None,
    active_only: bool = True,
    search: str = None
) -> list[dict]:
    """
    Get endorsement catalog entries with optional filters.

    Args:
        position: Filter by position (primary, excess, either)
        endorsement_type: Filter by endorsement type
        midterm_only: Filter by midterm_only flag
        active_only: Only return active entries (default True)
        search: Search term to filter by code, title, or description

    Returns:
        List of catalog entry dicts
    """
    conditions = []
    params = {}

    if active_only:
        conditions.append("active = TRUE")

    if position:
        # 'either' matches anything, specific position matches that or 'either'
        if position in ("primary", "excess"):
            conditions.append("(position = :position OR position = 'either')")
            params["position"] = position
        else:
            conditions.append("position = :position")
            params["position"] = position

    if endorsement_type:
        conditions.append("(endorsement_type = :endorsement_type OR endorsement_type IS NULL)")
        params["endorsement_type"] = endorsement_type

    if midterm_only is not None:
        if midterm_only:
            conditions.append("midterm_only = TRUE")
        else:
            conditions.append("midterm_only = FALSE")

    if search:
        conditions.append("""
            (LOWER(code) LIKE :search
             OR LOWER(title) LIKE :search
             OR LOWER(COALESCE(description, '')) LIKE :search)
        """)
        params["search"] = f"%{search.lower()}%"

    where_clause = " AND ".join(conditions) if conditions else "TRUE"

    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT id, code, title, description, endorsement_type,
                   position, midterm_only, active, created_at, updated_at
            FROM endorsement_catalog
            WHERE {where_clause}
            ORDER BY code
        """), params)

        return [_row_to_dict(row) for row in result.fetchall()]


def get_catalog_entry(entry_id: str) -> Optional[dict]:
    """Get a single catalog entry by ID."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, code, title, description, endorsement_type,
                   position, midterm_only, active, created_at, updated_at
            FROM endorsement_catalog
            WHERE id = :entry_id
        """), {"entry_id": entry_id})

        row = result.fetchone()
        return _row_to_dict(row) if row else None


def get_catalog_entry_by_code(code: str) -> Optional[dict]:
    """Get a single catalog entry by code."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, code, title, description, endorsement_type,
                   position, midterm_only, active, created_at, updated_at
            FROM endorsement_catalog
            WHERE code = :code
        """), {"code": code})

        row = result.fetchone()
        return _row_to_dict(row) if row else None


def create_catalog_entry(
    code: str,
    title: str,
    description: str = None,
    endorsement_type: str = None,
    position: str = "either",
    midterm_only: bool = False,
    created_by: str = "system"
) -> str:
    """
    Create a new endorsement catalog entry.

    Args:
        code: Unique code (e.g., "EXT-001")
        title: Formal title for printing
        description: Longer description
        endorsement_type: Associated transaction type (or None for general)
        position: primary, excess, or either
        midterm_only: Only applicable mid-term
        created_by: User creating the entry

    Returns:
        UUID of the new entry
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO endorsement_catalog (
                code, title, description, endorsement_type,
                position, midterm_only, created_by
            ) VALUES (
                :code, :title, :description, :endorsement_type,
                :position, :midterm_only, :created_by
            )
            RETURNING id
        """), {
            "code": code,
            "title": title,
            "description": description,
            "endorsement_type": endorsement_type,
            "position": position,
            "midterm_only": midterm_only,
            "created_by": created_by,
        })

        return str(result.fetchone()[0])


def update_catalog_entry(
    entry_id: str,
    code: str = None,
    title: str = None,
    description: str = None,
    endorsement_type: str = None,
    position: str = None,
    midterm_only: bool = None,
    active: bool = None
) -> bool:
    """
    Update an endorsement catalog entry.

    Args:
        entry_id: UUID of the entry
        Other args: Fields to update (None = no change)

    Returns:
        True if successful
    """
    updates = []
    params = {"entry_id": entry_id}

    if code is not None:
        updates.append("code = :code")
        params["code"] = code
    if title is not None:
        updates.append("title = :title")
        params["title"] = title
    if description is not None:
        updates.append("description = :description")
        params["description"] = description
    if endorsement_type is not None:
        updates.append("endorsement_type = :endorsement_type")
        params["endorsement_type"] = endorsement_type if endorsement_type else None
    if position is not None:
        updates.append("position = :position")
        params["position"] = position
    if midterm_only is not None:
        updates.append("midterm_only = :midterm_only")
        params["midterm_only"] = midterm_only
    if active is not None:
        updates.append("active = :active")
        params["active"] = active

    if not updates:
        return False

    updates.append("updated_at = now()")

    with get_conn() as conn:
        result = conn.execute(text(f"""
            UPDATE endorsement_catalog
            SET {", ".join(updates)}
            WHERE id = :entry_id
        """), params)

        return result.rowcount > 0


def deactivate_catalog_entry(entry_id: str) -> bool:
    """Deactivate a catalog entry (soft delete)."""
    return update_catalog_entry(entry_id, active=False)


def get_entries_for_type(endorsement_type: str, position: str = None) -> list[dict]:
    """
    Get catalog entries appropriate for a given endorsement type and position.

    Args:
        endorsement_type: The transaction type (extension, cancellation, etc.)
        position: The policy position (primary, excess)

    Returns:
        List of matching catalog entries
    """
    return get_catalog_entries(
        position=position,
        endorsement_type=endorsement_type,
        active_only=True
    )


def _row_to_dict(row) -> dict:
    """Convert database row to dict."""
    return {
        "id": str(row[0]),
        "code": row[1],
        "title": row[2],
        "description": row[3],
        "endorsement_type": row[4],
        "position": row[5],
        "midterm_only": row[6],
        "active": row[7],
        "created_at": row[8],
        "updated_at": row[9],
        "position_label": POSITION_OPTIONS.get(row[5], row[5]),
    }
