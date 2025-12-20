"""
Document Library Module

Manages the document library - reusable document content for endorsements,
marketing materials, claims sheets, and specimen forms.
Content stored as HTML for rendering through templates.
"""

import re
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


# Document type options
DOCUMENT_TYPES = {
    "endorsement": "Endorsement",
    "marketing": "Marketing Material",
    "claims_sheet": "Claims Reporting Sheet",
    "specimen": "Specimen Policy Form",
}

# Position options (for endorsements primarily)
POSITION_OPTIONS = {
    "primary": "Primary Only",
    "excess": "Excess Only",
    "either": "Primary or Excess",
}

# Status options
STATUS_OPTIONS = {
    "draft": "Draft",
    "active": "Active",
    "archived": "Archived",
}


def get_library_entries(
    document_type: str = None,
    category: str = None,
    position: str = None,
    status: str = "active",
    search: str = None,
    include_archived: bool = False
) -> list[dict]:
    """
    Get document library entries with optional filters.

    Args:
        document_type: Filter by document type (endorsement, marketing, etc.)
        category: Filter by category
        position: Filter by position (primary, excess, either)
        status: Filter by status (default: active only)
        search: Search term to filter by code, title, or content
        include_archived: Include archived entries

    Returns:
        List of library entry dicts
    """
    conditions = []
    params = {}

    if status and not include_archived:
        conditions.append("status = :status")
        params["status"] = status
    elif not include_archived:
        conditions.append("status != 'archived'")

    if document_type:
        conditions.append("document_type = :document_type")
        params["document_type"] = document_type

    if category:
        conditions.append("category = :category")
        params["category"] = category

    if position:
        # 'either' matches anything, specific position matches that or 'either'
        if position in ("primary", "excess"):
            conditions.append("(position = :position OR position = 'either')")
            params["position"] = position
        else:
            conditions.append("position = :position")
            params["position"] = position

    if search:
        conditions.append("""
            (LOWER(code) LIKE :search
             OR LOWER(title) LIKE :search
             OR LOWER(COALESCE(content_plain, '')) LIKE :search)
        """)
        params["search"] = f"%{search.lower()}%"

    where_clause = " AND ".join(conditions) if conditions else "TRUE"

    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT id, code, title, document_type, category,
                   content_html, content_plain, position, midterm_only,
                   version, version_notes, status, default_sort_order,
                   created_at, updated_at, created_by
            FROM document_library
            WHERE {where_clause}
            ORDER BY default_sort_order, code
        """), params)

        return [_row_to_dict(row) for row in result.fetchall()]


def get_library_entry(entry_id: str) -> Optional[dict]:
    """Get a single library entry by ID."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, code, title, document_type, category,
                   content_html, content_plain, position, midterm_only,
                   version, version_notes, status, default_sort_order,
                   created_at, updated_at, created_by
            FROM document_library
            WHERE id = :entry_id
        """), {"entry_id": entry_id})

        row = result.fetchone()
        return _row_to_dict(row) if row else None


def get_library_entry_by_code(code: str) -> Optional[dict]:
    """Get a single library entry by code."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, code, title, document_type, category,
                   content_html, content_plain, position, midterm_only,
                   version, version_notes, status, default_sort_order,
                   created_at, updated_at, created_by
            FROM document_library
            WHERE code = :code
        """), {"code": code})

        row = result.fetchone()
        return _row_to_dict(row) if row else None


def create_library_entry(
    code: str,
    title: str,
    document_type: str,
    content_html: str = None,
    category: str = None,
    position: str = "either",
    midterm_only: bool = False,
    default_sort_order: int = 100,
    status: str = "draft",
    created_by: str = "system"
) -> str:
    """
    Create a new document library entry.

    Args:
        code: Unique code (e.g., "END-WAR-001")
        title: Formal title for printing
        document_type: endorsement, marketing, claims_sheet, specimen
        content_html: Rich text content as HTML
        category: Sub-category for filtering
        position: primary, excess, or either
        midterm_only: Only applicable mid-term (for endorsements)
        default_sort_order: Order in packages (lower = first)
        status: draft, active, archived
        created_by: User creating the entry

    Returns:
        UUID of the new entry
    """
    # Extract plain text from HTML for search indexing
    content_plain = _html_to_plain_text(content_html) if content_html else None

    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO document_library (
                code, title, document_type, category,
                content_html, content_plain, position, midterm_only,
                default_sort_order, status, created_by
            ) VALUES (
                :code, :title, :document_type, :category,
                :content_html, :content_plain, :position, :midterm_only,
                :default_sort_order, :status, :created_by
            )
            RETURNING id
        """), {
            "code": code,
            "title": title,
            "document_type": document_type,
            "category": category,
            "content_html": content_html,
            "content_plain": content_plain,
            "position": position,
            "midterm_only": midterm_only,
            "default_sort_order": default_sort_order,
            "status": status,
            "created_by": created_by,
        })

        return str(result.fetchone()[0])


def update_library_entry(
    entry_id: str,
    code: str = None,
    title: str = None,
    document_type: str = None,
    category: str = None,
    content_html: str = None,
    position: str = None,
    midterm_only: bool = None,
    default_sort_order: int = None,
    status: str = None,
    version_notes: str = None,
    updated_by: str = None
) -> bool:
    """
    Update a document library entry.

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
    if document_type is not None:
        updates.append("document_type = :document_type")
        params["document_type"] = document_type
    if category is not None:
        updates.append("category = :category")
        params["category"] = category if category else None
    if content_html is not None:
        updates.append("content_html = :content_html")
        params["content_html"] = content_html
        # Also update plain text for search
        updates.append("content_plain = :content_plain")
        params["content_plain"] = _html_to_plain_text(content_html) if content_html else None
    if position is not None:
        updates.append("position = :position")
        params["position"] = position
    if midterm_only is not None:
        updates.append("midterm_only = :midterm_only")
        params["midterm_only"] = midterm_only
    if default_sort_order is not None:
        updates.append("default_sort_order = :default_sort_order")
        params["default_sort_order"] = default_sort_order
    if status is not None:
        updates.append("status = :status")
        params["status"] = status
    if version_notes is not None:
        updates.append("version_notes = :version_notes")
        params["version_notes"] = version_notes
    if updated_by is not None:
        updates.append("updated_by = :updated_by")
        params["updated_by"] = updated_by

    if not updates:
        return False

    # Note: updated_at and version are handled by the database trigger

    with get_conn() as conn:
        result = conn.execute(text(f"""
            UPDATE document_library
            SET {", ".join(updates)}
            WHERE id = :entry_id
        """), params)

        return result.rowcount > 0


def archive_library_entry(entry_id: str, archived_by: str = "system") -> bool:
    """Archive a library entry (soft delete)."""
    return update_library_entry(entry_id, status="archived", updated_by=archived_by)


def activate_library_entry(entry_id: str, activated_by: str = "system") -> bool:
    """Activate a library entry (make it available for use)."""
    return update_library_entry(entry_id, status="active", updated_by=activated_by)


def get_entries_for_package(
    position: str = None,
    document_types: list[str] = None
) -> list[dict]:
    """
    Get library entries suitable for package inclusion.

    Args:
        position: Policy position (primary, excess) to filter endorsements
        document_types: List of document types to include (default: all)

    Returns:
        List of active entries sorted by default_sort_order
    """
    conditions = ["status = 'active'"]
    params = {}

    if position and position in ("primary", "excess"):
        conditions.append("(position = :position OR position = 'either')")
        params["position"] = position

    if document_types:
        conditions.append("document_type = ANY(:document_types)")
        params["document_types"] = document_types

    where_clause = " AND ".join(conditions)

    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT id, code, title, document_type, category,
                   content_html, content_plain, position, midterm_only,
                   version, version_notes, status, default_sort_order,
                   created_at, updated_at, created_by
            FROM document_library
            WHERE {where_clause}
            ORDER BY document_type, default_sort_order, code
        """), params)

        return [_row_to_dict(row) for row in result.fetchall()]


def get_endorsements_for_package(position: str = None) -> list[dict]:
    """Get active endorsements suitable for package inclusion."""
    return get_entries_for_package(position=position, document_types=["endorsement"])


def get_categories(document_type: str = None) -> list[str]:
    """Get distinct categories for filtering."""
    conditions = ["category IS NOT NULL"]
    params = {}

    if document_type:
        conditions.append("document_type = :document_type")
        params["document_type"] = document_type

    where_clause = " AND ".join(conditions)

    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT DISTINCT category
            FROM document_library
            WHERE {where_clause}
            ORDER BY category
        """), params)

        return [row[0] for row in result.fetchall()]


def _row_to_dict(row) -> dict:
    """Convert database row to dict."""
    return {
        "id": str(row[0]),
        "code": row[1],
        "title": row[2],
        "document_type": row[3],
        "category": row[4],
        "content_html": row[5],
        "content_plain": row[6],
        "position": row[7],
        "midterm_only": row[8],
        "version": row[9],
        "version_notes": row[10],
        "status": row[11],
        "default_sort_order": row[12],
        "created_at": row[13],
        "updated_at": row[14],
        "created_by": row[15],
        # Labels for display
        "document_type_label": DOCUMENT_TYPES.get(row[3], row[3]),
        "position_label": POSITION_OPTIONS.get(row[7], row[7]),
        "status_label": STATUS_OPTIONS.get(row[11], row[11]),
    }


def _html_to_plain_text(html: str) -> str:
    """
    Extract plain text from HTML for search indexing.
    Simple regex-based extraction.
    """
    if not html:
        return ""

    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', html)
    # Decode common HTML entities
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)

    return text.strip()
