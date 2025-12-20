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
    include_archived: bool = False,
    has_auto_attach: bool = None
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
        has_auto_attach: Filter to only entries with auto-attach rules

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

    if has_auto_attach is True:
        conditions.append("auto_attach_rules IS NOT NULL")
    elif has_auto_attach is False:
        conditions.append("auto_attach_rules IS NULL")

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
                   created_at, updated_at, created_by,
                   auto_attach_rules, fill_in_mappings
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
                   created_at, updated_at, created_by,
                   auto_attach_rules, fill_in_mappings
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
                   created_at, updated_at, created_by,
                   auto_attach_rules, fill_in_mappings
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
    created_by: str = "system",
    auto_attach_rules: dict = None,
    fill_in_mappings: dict = None
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
        auto_attach_rules: JSONB rules for auto-attaching (e.g., {"condition": "has_sublimits"})
        fill_in_mappings: JSONB mapping of placeholders to context fields

    Returns:
        UUID of the new entry
    """
    import json

    # Extract plain text from HTML for search indexing
    content_plain = _html_to_plain_text(content_html) if content_html else None

    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO document_library (
                code, title, document_type, category,
                content_html, content_plain, position, midterm_only,
                default_sort_order, status, created_by,
                auto_attach_rules, fill_in_mappings
            ) VALUES (
                :code, :title, :document_type, :category,
                :content_html, :content_plain, :position, :midterm_only,
                :default_sort_order, :status, :created_by,
                :auto_attach_rules, :fill_in_mappings
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
            "auto_attach_rules": json.dumps(auto_attach_rules) if auto_attach_rules else None,
            "fill_in_mappings": json.dumps(fill_in_mappings) if fill_in_mappings else None,
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
    updated_by: str = None,
    auto_attach_rules: dict = None,
    fill_in_mappings: dict = None,
    clear_auto_attach: bool = False,
    clear_fill_in_mappings: bool = False
) -> bool:
    """
    Update a document library entry.

    Args:
        entry_id: UUID of the entry
        Other args: Fields to update (None = no change)
        clear_auto_attach: Set to True to remove auto_attach_rules
        clear_fill_in_mappings: Set to True to remove fill_in_mappings

    Returns:
        True if successful
    """
    import json

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

    # Handle auto_attach_rules
    if clear_auto_attach:
        updates.append("auto_attach_rules = NULL")
    elif auto_attach_rules is not None:
        updates.append("auto_attach_rules = :auto_attach_rules")
        params["auto_attach_rules"] = json.dumps(auto_attach_rules)

    # Handle fill_in_mappings
    if clear_fill_in_mappings:
        updates.append("fill_in_mappings = NULL")
    elif fill_in_mappings is not None:
        updates.append("fill_in_mappings = :fill_in_mappings")
        params["fill_in_mappings"] = json.dumps(fill_in_mappings)

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
                   created_at, updated_at, created_by,
                   auto_attach_rules, fill_in_mappings
            FROM document_library
            WHERE {where_clause}
            ORDER BY document_type, default_sort_order, code
        """), params)

        return [_row_to_dict(row) for row in result.fetchall()]


def get_endorsements_for_package(position: str = None) -> list[dict]:
    """Get active endorsements suitable for package inclusion."""
    return get_entries_for_package(position=position, document_types=["endorsement"])


def get_auto_attach_endorsements(quote_data: dict, position: str = "primary") -> list[dict]:
    """
    Get endorsements that should auto-attach based on their rules and quote data.

    Args:
        quote_data: Dictionary with quote information (sublimits, follow_form, etc.)
        position: Quote position (primary/excess)

    Returns:
        List of endorsement dicts that should auto-attach, with 'auto_reason' added
    """
    # Get all endorsements with auto-attach rules
    endorsements = get_library_entries(
        document_type="endorsement",
        status="active",
        has_auto_attach=True
    )

    auto = []
    for e in endorsements:
        rules = e.get("auto_attach_rules")
        if not rules:
            continue

        # Check position constraint in rules
        rule_position = rules.get("position")
        if rule_position and rule_position != position:
            # Also check if position in entry matches
            e_position = e.get("position", "either")
            if e_position != "either" and e_position != position:
                continue

        # Evaluate the condition
        condition = rules.get("condition")
        should_attach, reason = _evaluate_auto_attach_rule(condition, rules, quote_data)

        if should_attach:
            auto.append({
                **e,
                "auto_reason": reason
            })

    return auto


def _evaluate_auto_attach_rule(condition: str, rules: dict, quote_data: dict) -> tuple[bool, str]:
    """
    Evaluate a single auto-attach rule condition.

    Args:
        condition: The condition type (e.g., "has_sublimits", "follow_form")
        rules: Full rules dict (may contain additional params)
        quote_data: Quote data to evaluate against

    Returns:
        Tuple of (should_attach: bool, reason: str)
    """
    if condition == "has_sublimits":
        sublimits = quote_data.get("sublimits", [])
        if sublimits and len(sublimits) > 0:
            return True, "Quote has sublimits"
        return False, ""

    elif condition == "follow_form":
        expected_value = rules.get("value", True)
        actual_value = quote_data.get("follow_form", True)
        if actual_value == expected_value:
            return True, "Follow form" if expected_value else "Non-follow form"
        return False, ""

    elif condition == "limit_above":
        threshold = rules.get("value", 0)
        limit = quote_data.get("limit", 0)
        if limit > threshold:
            return True, f"Limit above ${threshold:,}"
        return False, ""

    elif condition == "limit_below":
        threshold = rules.get("value", 0)
        limit = quote_data.get("limit", 0)
        if limit < threshold:
            return True, f"Limit below ${threshold:,}"
        return False, ""

    elif condition == "retention_above":
        threshold = rules.get("value", 0)
        retention = quote_data.get("retention", 0)
        if retention > threshold:
            return True, f"Retention above ${threshold:,}"
        return False, ""

    elif condition == "always":
        return True, "Always included"

    elif condition == "endorsement_type":
        # For mid-term endorsements: match by endorsement type
        expected_type = rules.get("value")
        actual_type = quote_data.get("endorsement_type")
        if expected_type and actual_type == expected_type:
            return True, f"Endorsement type: {expected_type}"
        return False, ""

    # Unknown condition
    return False, ""


# Available auto-attach conditions for UI
AUTO_ATTACH_CONDITIONS = {
    "has_sublimits": "Quote has sublimits",
    "follow_form": "Follow form status",
    "limit_above": "Limit above threshold",
    "limit_below": "Limit below threshold",
    "retention_above": "Retention above threshold",
    "always": "Always attach",
    # Mid-term endorsement conditions
    "endorsement_type": "Mid-term endorsement type matches",
}

# Available fill-in variables for UI
FILL_IN_VARIABLES = {
    # Policy/quote data
    "{{insured_name}}": "Insured name",
    "{{effective_date}}": "Policy effective date",
    "{{expiration_date}}": "Policy expiration date",
    "{{policy_number}}": "Policy/quote number",
    "{{aggregate_limit}}": "Aggregate limit (formatted)",
    "{{retention}}": "Retention (formatted)",
    "{{sublimits_schedule}}": "Sublimits schedule table",
    # Mid-term endorsement data (from change_details)
    "{{endorsement_effective_date}}": "Endorsement effective date",
    "{{endorsement_number}}": "Endorsement number",
    "{{previous_broker}}": "Previous broker name (BOR)",
    "{{new_broker}}": "New broker name (BOR)",
    "{{previous_contact}}": "Previous contact name (BOR)",
    "{{new_contact}}": "New contact name (BOR)",
    "{{change_reason}}": "Reason for change",
}


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
    import json

    # Parse JSONB fields
    auto_attach_rules = row[16] if len(row) > 16 else None
    fill_in_mappings = row[17] if len(row) > 17 else None

    # Handle string vs dict for JSONB
    if isinstance(auto_attach_rules, str):
        auto_attach_rules = json.loads(auto_attach_rules)
    if isinstance(fill_in_mappings, str):
        fill_in_mappings = json.loads(fill_in_mappings)

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
        "auto_attach_rules": auto_attach_rules,
        "fill_in_mappings": fill_in_mappings,
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
