"""
Enhancement Management Module

Handles CRUD operations for enhancement types (admin) and quote enhancements (user).
Includes auto-attach logic to link endorsements when enhancements are added.
"""

from sqlalchemy import text
from typing import Optional
import os
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn

# Import document library for endorsement linking
spec2 = importlib.util.spec_from_file_location(
    "document_library",
    os.path.join(os.path.dirname(__file__), "document_library.py")
)
document_library = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(document_library)


# ─────────────────────────────────────────────────────────────
# Enhancement Types (Admin Configuration)
# ─────────────────────────────────────────────────────────────

def get_enhancement_types(
    position: str = None,
    active_only: bool = True
) -> list[dict]:
    """
    Get all enhancement types with optional filters.

    Args:
        position: Filter by position (primary, excess, either)
        active_only: Only return active types

    Returns:
        List of enhancement type dicts
    """
    conditions = []
    params = {}

    if active_only:
        conditions.append("active = true")

    if position:
        conditions.append("(position = :position OR position = 'either')")
        params["position"] = position

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT
                id, code, name, description, data_schema,
                linked_endorsement_code, position, sort_order,
                active, created_at, updated_at
            FROM enhancement_types
            {where_clause}
            ORDER BY sort_order, name
        """), params)

        return [dict(row._mapping) for row in result]


def get_enhancement_type(type_id: str) -> Optional[dict]:
    """Get a single enhancement type by ID."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                id, code, name, description, data_schema,
                linked_endorsement_code, position, sort_order,
                active, created_at, updated_at
            FROM enhancement_types
            WHERE id = :id
        """), {"id": type_id})

        row = result.fetchone()
        return dict(row._mapping) if row else None


def get_enhancement_type_by_code(code: str) -> Optional[dict]:
    """Get a single enhancement type by code."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                id, code, name, description, data_schema,
                linked_endorsement_code, position, sort_order,
                active, created_at, updated_at
            FROM enhancement_types
            WHERE code = :code
        """), {"code": code})

        row = result.fetchone()
        return dict(row._mapping) if row else None


def create_enhancement_type(
    code: str,
    name: str,
    data_schema: dict,
    description: str = None,
    linked_endorsement_code: str = None,
    position: str = "either",
    sort_order: int = 100,
    created_by: str = None
) -> str:
    """
    Create a new enhancement type.

    Returns:
        ID of the created type
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO enhancement_types (
                code, name, description, data_schema,
                linked_endorsement_code, position, sort_order, created_by
            ) VALUES (
                :code, :name, :description, CAST(:data_schema AS jsonb),
                :linked_endorsement_code, :position, :sort_order, :created_by
            )
            RETURNING id
        """), {
            "code": code,
            "name": name,
            "description": description,
            "data_schema": str(data_schema).replace("'", '"') if isinstance(data_schema, dict) else data_schema,
            "linked_endorsement_code": linked_endorsement_code,
            "position": position,
            "sort_order": sort_order,
            "created_by": created_by
        })
        conn.commit()
        return str(result.fetchone()[0])


def update_enhancement_type(type_id: str, updates: dict) -> bool:
    """
    Update an enhancement type.

    Args:
        type_id: ID of the type to update
        updates: Dict of fields to update

    Returns:
        True if updated successfully
    """
    allowed_fields = {
        "code", "name", "description", "data_schema",
        "linked_endorsement_code", "position", "sort_order", "active"
    }

    # Filter to allowed fields
    update_fields = {k: v for k, v in updates.items() if k in allowed_fields}
    if not update_fields:
        return False

    # Build SET clause
    set_parts = []
    params = {"id": type_id}

    for field, value in update_fields.items():
        if field == "data_schema":
            set_parts.append(f"{field} = CAST(:{field} AS jsonb)")
            params[field] = str(value).replace("'", '"') if isinstance(value, dict) else value
        else:
            set_parts.append(f"{field} = :{field}")
            params[field] = value

    with get_conn() as conn:
        result = conn.execute(text(f"""
            UPDATE enhancement_types
            SET {', '.join(set_parts)}
            WHERE id = :id
        """), params)
        conn.commit()
        return result.rowcount > 0


def delete_enhancement_type(type_id: str) -> bool:
    """
    Delete an enhancement type.
    Will fail if any quote_enhancements reference this type.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            DELETE FROM enhancement_types WHERE id = :id
        """), {"id": type_id})
        conn.commit()
        return result.rowcount > 0


# ─────────────────────────────────────────────────────────────
# Quote Enhancements (Instances)
# ─────────────────────────────────────────────────────────────

def get_quote_enhancements(quote_id: str) -> list[dict]:
    """
    Get all enhancements for a quote with type details.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                qe.id,
                qe.quote_id,
                qe.enhancement_type_id,
                qe.data,
                qe.linked_endorsement_junction_id,
                qe.created_at,
                qe.updated_at,
                qe.created_by,
                et.code AS type_code,
                et.name AS type_name,
                et.description AS type_description,
                et.data_schema,
                et.linked_endorsement_code
            FROM quote_enhancements qe
            JOIN enhancement_types et ON et.id = qe.enhancement_type_id
            WHERE qe.quote_id = :quote_id
            ORDER BY et.sort_order, et.name
        """), {"quote_id": quote_id})

        return [dict(row._mapping) for row in result]


def get_submission_enhancements(submission_id: str) -> list[dict]:
    """
    Get all enhancements across all quotes in a submission.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                qe.id,
                qe.quote_id,
                qe.enhancement_type_id,
                qe.data,
                qe.linked_endorsement_junction_id,
                qe.created_at,
                et.code AS type_code,
                et.name AS type_name,
                et.linked_endorsement_code,
                t.name AS quote_name
            FROM quote_enhancements qe
            JOIN enhancement_types et ON et.id = qe.enhancement_type_id
            JOIN insurance_towers t ON t.id = qe.quote_id
            WHERE t.submission_id = :submission_id
            ORDER BY et.sort_order, t.name
        """), {"submission_id": submission_id})

        return [dict(row._mapping) for row in result]


def get_quote_enhancement(enhancement_id: str) -> Optional[dict]:
    """Get a single quote enhancement by ID."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                qe.id,
                qe.quote_id,
                qe.enhancement_type_id,
                qe.data,
                qe.linked_endorsement_junction_id,
                qe.created_at,
                qe.updated_at,
                et.code AS type_code,
                et.name AS type_name,
                et.data_schema,
                et.linked_endorsement_code
            FROM quote_enhancements qe
            JOIN enhancement_types et ON et.id = qe.enhancement_type_id
            WHERE qe.id = :id
        """), {"id": enhancement_id})

        row = result.fetchone()
        return dict(row._mapping) if row else None


def add_quote_enhancement(
    quote_id: str,
    enhancement_type_id: str,
    data: dict,
    created_by: str = None,
    auto_attach_endorsement: bool = True
) -> dict:
    """
    Add an enhancement to a quote.

    If the enhancement type has a linked_endorsement_code and auto_attach_endorsement
    is True, will automatically link the endorsement to the quote.

    Args:
        quote_id: ID of the quote
        enhancement_type_id: ID of the enhancement type
        data: Enhancement data (matches type's data_schema)
        created_by: User creating the enhancement
        auto_attach_endorsement: Whether to auto-attach linked endorsement

    Returns:
        Dict with enhancement_id and linked_endorsement_junction_id (if attached)
    """
    import json

    # Get the enhancement type
    enhancement_type = get_enhancement_type(enhancement_type_id)
    if not enhancement_type:
        raise ValueError(f"Enhancement type not found: {enhancement_type_id}")

    # Create the enhancement record
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO quote_enhancements (
                quote_id, enhancement_type_id, data, created_by
            ) VALUES (
                :quote_id, :enhancement_type_id, CAST(:data AS jsonb), :created_by
            )
            RETURNING id
        """), {
            "quote_id": quote_id,
            "enhancement_type_id": enhancement_type_id,
            "data": json.dumps(data),
            "created_by": created_by
        })
        conn.commit()
        enhancement_id = str(result.fetchone()[0])

    # Auto-attach linked endorsement if configured
    linked_endorsement_junction_id = None
    if auto_attach_endorsement and enhancement_type.get("linked_endorsement_code"):
        endorsement = document_library.get_library_entry_by_code(
            enhancement_type["linked_endorsement_code"]
        )
        if endorsement:
            # Map enhancement data to endorsement field_values
            field_values = _map_enhancement_to_field_values(
                data,
                enhancement_type.get("data_schema", {}),
                endorsement.get("fill_in_mappings", {})
            )

            # Link endorsement to quote
            linked_endorsement_junction_id = _link_endorsement_to_quote(
                quote_id,
                endorsement["id"],
                field_values
            )

            # Update enhancement with linked endorsement
            if linked_endorsement_junction_id:
                with get_conn() as conn:
                    conn.execute(text("""
                        UPDATE quote_enhancements
                        SET linked_endorsement_junction_id = :junction_id
                        WHERE id = :id
                    """), {
                        "id": enhancement_id,
                        "junction_id": linked_endorsement_junction_id
                    })
                    conn.commit()

    return {
        "enhancement_id": enhancement_id,
        "linked_endorsement_junction_id": linked_endorsement_junction_id
    }


def update_quote_enhancement(enhancement_id: str, data: dict) -> bool:
    """
    Update a quote enhancement's data.
    Also updates the linked endorsement's field_values if one exists.
    """
    import json

    # Get the enhancement to check for linked endorsement
    enhancement = get_quote_enhancement(enhancement_id)
    if not enhancement:
        return False

    with get_conn() as conn:
        conn.execute(text("""
            UPDATE quote_enhancements
            SET data = CAST(:data AS jsonb)
            WHERE id = :id
        """), {
            "id": enhancement_id,
            "data": json.dumps(data)
        })
        conn.commit()

    # Update linked endorsement field_values if exists
    if enhancement.get("linked_endorsement_junction_id"):
        # Get the endorsement details
        endorsement = document_library.get_library_entry_by_code(
            enhancement.get("linked_endorsement_code")
        )
        if endorsement:
            field_values = _map_enhancement_to_field_values(
                data,
                enhancement.get("data_schema", {}),
                endorsement.get("fill_in_mappings", {})
            )
            _update_endorsement_field_values(
                enhancement["linked_endorsement_junction_id"],
                field_values
            )

    return True


def remove_quote_enhancement(
    enhancement_id: str,
    also_remove_endorsement: bool = True
) -> bool:
    """
    Remove a quote enhancement.

    Args:
        enhancement_id: ID of the enhancement to remove
        also_remove_endorsement: If True, also removes the linked endorsement

    Returns:
        True if removed successfully
    """
    # Get the enhancement first
    enhancement = get_quote_enhancement(enhancement_id)
    if not enhancement:
        return False

    # Remove linked endorsement if requested
    if also_remove_endorsement and enhancement.get("linked_endorsement_junction_id"):
        _unlink_endorsement(enhancement["linked_endorsement_junction_id"])

    # Delete the enhancement
    with get_conn() as conn:
        result = conn.execute(text("""
            DELETE FROM quote_enhancements WHERE id = :id
        """), {"id": enhancement_id})
        conn.commit()
        return result.rowcount > 0


# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────

def _map_enhancement_to_field_values(
    data: dict,
    data_schema: dict,
    fill_in_mappings: dict
) -> dict:
    """
    Map enhancement data to endorsement field_values based on mappings.

    For array types (like additional_insureds), the entire array is passed through.
    For object types, individual fields are mapped.
    """
    # For now, pass through the data directly
    # The key insight is that enhancement data structure should match
    # what the endorsement template expects

    # If the schema is an array type (like additional insureds),
    # return the data as-is under the mapped key
    schema_type = data_schema.get("type") if isinstance(data_schema, dict) else None

    if schema_type == "array":
        # Find the mapping key that would use this data
        # e.g., {"{{additional_insureds_schedule}}": "additional_insureds"}
        for placeholder, field_name in fill_in_mappings.items():
            if field_name in ("additional_insureds", "items"):
                return {"additional_insureds": data if isinstance(data, list) else [data]}

    # For object types, return the data dict directly
    return data


def _link_endorsement_to_quote(
    quote_id: str,
    endorsement_id: str,
    field_values: dict
) -> Optional[str]:
    """Link an endorsement to a quote with field values."""
    import json

    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                INSERT INTO quote_endorsements (quote_id, endorsement_id, field_values)
                VALUES (:quote_id, :endorsement_id, CAST(:field_values AS jsonb))
                ON CONFLICT (quote_id, endorsement_id)
                DO UPDATE SET field_values = EXCLUDED.field_values
                RETURNING id
            """), {
                "quote_id": quote_id,
                "endorsement_id": endorsement_id,
                "field_values": json.dumps(field_values)
            })
            conn.commit()
            row = result.fetchone()
            return str(row[0]) if row else None
    except Exception as e:
        print(f"Error linking endorsement: {e}")
        return None


def _update_endorsement_field_values(junction_id: str, field_values: dict):
    """Update field_values on an existing endorsement junction."""
    import json

    with get_conn() as conn:
        conn.execute(text("""
            UPDATE quote_endorsements
            SET field_values = CAST(:field_values AS jsonb)
            WHERE id = :id
        """), {
            "id": junction_id,
            "field_values": json.dumps(field_values)
        })
        conn.commit()


def _unlink_endorsement(junction_id: str):
    """Remove an endorsement junction."""
    with get_conn() as conn:
        conn.execute(text("""
            DELETE FROM quote_endorsements WHERE id = :id
        """), {"id": junction_id})
        conn.commit()
