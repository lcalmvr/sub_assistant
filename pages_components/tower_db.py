"""
Tower/Quote Database Operations
Shared database helpers for insurance tower and quote management.
"""
from __future__ import annotations

import os
import json
from typing import Optional
import psycopg2
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CURRENT_USER = st.session_state.get("current_user", os.getenv("USER", "unknown"))


def get_conn():
    """Get or create database connection."""
    conn = st.session_state.get("tower_db_conn")

    try:
        if conn is not None and conn.closed == 0:
            with conn.cursor() as test_cur:
                test_cur.execute("SELECT 1")
            return conn
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        st.session_state.pop("tower_db_conn", None)
        conn = None

    if conn is None or conn.closed != 0:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        st.session_state["tower_db_conn"] = conn

    return conn


def _parse_tower_json(val):
    """Parse JSON field that could be string, list, or None."""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return json.loads(val) if val else []


def _parse_json_field(val):
    """Parse JSON field that could be string, dict, list, or None."""
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val) if val else None
    except (json.JSONDecodeError, TypeError):
        return None


def _row_to_quote(row) -> dict:
    """Convert a database row to a quote dict.

    Three-tier premium model:
      - technical_premium: Pure exposure-based (before controls)
      - risk_adjusted_premium: After control credits/debits
      - sold_premium: UW's final quoted price (market adjustment = sold - risk_adjusted)
    """
    return {
        "id": str(row[0]),
        "tower_json": _parse_tower_json(row[1]),
        "primary_retention": float(row[2]) if row[2] else None,
        "sublimits": _parse_tower_json(row[3]),
        "quote_name": row[4] or "Option A",
        "quoted_premium": float(row[5]) if row[5] else None,
        "quote_notes": row[6],
        "created_at": row[7],
        "updated_at": row[8],
        "technical_premium": float(row[9]) if len(row) > 9 and row[9] else None,
        "risk_adjusted_premium": float(row[10]) if len(row) > 10 and row[10] else None,
        "sold_premium": float(row[11]) if len(row) > 11 and row[11] else None,
        "endorsements": _parse_tower_json(row[12]) if len(row) > 12 else [],
        "position": row[13] if len(row) > 13 else "primary",
        "submission_id": str(row[14]) if len(row) > 14 and row[14] else None,
        "policy_form": row[15] if len(row) > 15 else "cyber",
        "coverages": _parse_json_field(row[16]) if len(row) > 16 else None,
        "is_bound": bool(row[17]) if len(row) > 17 and row[17] is not None else False,
        "retroactive_date": row[18] if len(row) > 18 else None,
    }


def save_tower(submission_id: str, tower_json: list, primary_retention: Optional[float],
               sublimits: Optional[list] = None, quote_name: str = "Option A",
               quoted_premium: Optional[float] = None, quote_notes: Optional[str] = None,
               technical_premium: Optional[float] = None, risk_adjusted_premium: Optional[float] = None,
               sold_premium: Optional[float] = None,
               endorsements: Optional[list] = None, position: str = "primary",
               policy_form: str = "cyber", coverages: Optional[dict] = None,
               retroactive_date: Optional[str] = None) -> str:
    """Save a new tower/quote option for a submission.

    Three-tier premium model:
      - technical_premium: Pure exposure-based (before controls)
      - risk_adjusted_premium: After control credits/debits
      - sold_premium: UW's final quoted price (market adjustment = sold - risk_adjusted)
    """
    # Use sold_premium if provided, otherwise fall back to quoted_premium for backwards compat
    final_sold = sold_premium if sold_premium is not None else quoted_premium
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO insurance_towers (submission_id, tower_json, primary_retention,
                                          sublimits, quote_name, quoted_premium, quote_notes,
                                          technical_premium, risk_adjusted_premium, sold_premium,
                                          endorsements, position, policy_form, coverages, created_by,
                                          retroactive_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (submission_id, json.dumps(tower_json), primary_retention,
             json.dumps(sublimits or []), quote_name, quoted_premium, quote_notes,
             technical_premium, risk_adjusted_premium, final_sold,
             json.dumps(endorsements or []), position, policy_form,
             json.dumps(coverages) if coverages else None, CURRENT_USER,
             retroactive_date),
        )
        return str(cur.fetchone()[0])


def update_tower(tower_id: str, tower_json: list, primary_retention: Optional[float],
                 sublimits: Optional[list] = None, quote_name: Optional[str] = None,
                 quoted_premium: Optional[float] = None, quote_notes: Optional[str] = None,
                 technical_premium: Optional[float] = None, risk_adjusted_premium: Optional[float] = None,
                 sold_premium: Optional[float] = None,
                 endorsements: Optional[list] = None, position: Optional[str] = None,
                 policy_form: Optional[str] = None, coverages: Optional[dict] = None,
                 retroactive_date: Optional[str] = None):
    """Update an existing tower/quote option."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            UPDATE insurance_towers
            SET tower_json = %s, primary_retention = %s,
                sublimits = %s, quote_name = COALESCE(%s, quote_name),
                quoted_premium = %s, quote_notes = %s,
                technical_premium = COALESCE(%s, technical_premium),
                risk_adjusted_premium = COALESCE(%s, risk_adjusted_premium),
                sold_premium = COALESCE(%s, sold_premium),
                endorsements = COALESCE(%s, endorsements),
                position = COALESCE(%s, position),
                policy_form = COALESCE(%s, policy_form),
                coverages = COALESCE(%s, coverages),
                retroactive_date = COALESCE(%s, retroactive_date),
                updated_at = now()
            WHERE id = %s
            """,
            (json.dumps(tower_json), primary_retention,
             json.dumps(sublimits or []), quote_name, quoted_premium, quote_notes,
             technical_premium, risk_adjusted_premium, sold_premium,
             json.dumps(endorsements) if endorsements is not None else None,
             position, policy_form,
             json.dumps(coverages) if coverages is not None else None,
             retroactive_date,
             tower_id),
        )


def get_tower_for_submission(submission_id: str) -> Optional[dict]:
    """Get the most recent quote for a submission."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at,
                   technical_premium, risk_adjusted_premium, sold_premium, endorsements, position,
                   submission_id, policy_form, coverages, is_bound, retroactive_date
            FROM insurance_towers
            WHERE submission_id = %s
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (submission_id,),
        )
        row = cur.fetchone()
    return _row_to_quote(row) if row else None


def get_quote_by_id(quote_id: str) -> Optional[dict]:
    """Get a specific quote by ID."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at,
                   technical_premium, risk_adjusted_premium, sold_premium, endorsements, position,
                   submission_id, policy_form, coverages, is_bound, retroactive_date
            FROM insurance_towers
            WHERE id = %s
            """,
            (quote_id,),
        )
        row = cur.fetchone()
    return _row_to_quote(row) if row else None


def list_quotes_for_submission(submission_id: str) -> list[dict]:
    """List all quote options for a submission."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at,
                   technical_premium, risk_adjusted_premium, sold_premium, endorsements, position,
                   submission_id, policy_form, coverages, is_bound, retroactive_date
            FROM insurance_towers
            WHERE submission_id = %s
            ORDER BY quote_name, created_at
            """,
            (submission_id,),
        )
        rows = cur.fetchall()
    return [_row_to_quote(row) for row in rows]


def clone_quote(quote_id: str, new_name: str) -> str:
    """Clone an existing quote with a new name. Returns new quote ID."""
    original = get_quote_by_id(quote_id)
    if not original:
        raise ValueError(f"Quote {quote_id} not found")

    with get_conn().cursor() as cur:
        cur.execute("SELECT submission_id FROM insurance_towers WHERE id = %s", (quote_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Quote {quote_id} not found")
        submission_id = str(row[0])

    return save_tower(
        submission_id=submission_id,
        tower_json=original["tower_json"],
        primary_retention=original["primary_retention"],
        sublimits=original["sublimits"],
        quote_name=new_name,
        quoted_premium=original["quoted_premium"],
        quote_notes=original.get("quote_notes"),
        technical_premium=original.get("technical_premium"),
        risk_adjusted_premium=original.get("risk_adjusted_premium"),
        sold_premium=original.get("sold_premium"),
        endorsements=original.get("endorsements"),
        position=original.get("position", "primary"),
        policy_form=original.get("policy_form", "cyber"),
        coverages=original.get("coverages"),
        retroactive_date=original.get("retroactive_date"),
    )


def delete_tower(tower_id: str):
    """Delete a tower/quote."""
    with get_conn().cursor() as cur:
        cur.execute("DELETE FROM insurance_towers WHERE id = %s", (tower_id,))


def update_quote_field(quote_id: str, field: str, value):
    """
    Update a single field on a quote. Used for auto-save inline edits.

    Allowed fields: sold_premium, technical_premium, risk_adjusted_premium,
                   primary_retention, quote_name, endorsements, sublimits, position,
                   policy_form, coverages, retroactive_date
    """
    allowed_fields = {
        "sold_premium", "technical_premium", "risk_adjusted_premium",
        "primary_retention", "quote_name", "endorsements", "sublimits", "position",
        "policy_form", "coverages", "retroactive_date"
    }
    if field not in allowed_fields:
        raise ValueError(f"Field {field} not allowed for direct update")

    # Handle JSON fields
    if field in ("endorsements", "sublimits") and isinstance(value, list):
        value = json.dumps(value)
    elif field == "coverages" and isinstance(value, dict):
        value = json.dumps(value)

    with get_conn().cursor() as cur:
        cur.execute(
            f"""
            UPDATE insurance_towers
            SET {field} = %s, updated_at = now()
            WHERE id = %s
            """,
            (value, quote_id),
        )


def update_quote_limit(quote_id: str, new_limit: float):
    """
    Update the limit in the tower_json for the CMAI layer.
    Returns the updated tower_json.
    """
    quote = get_quote_by_id(quote_id)
    if not quote:
        raise ValueError(f"Quote {quote_id} not found")

    tower_json = quote["tower_json"]

    # Find and update CMAI layer limit
    for layer in tower_json:
        carrier = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier:
            layer["limit"] = new_limit
            break
    else:
        # If no CMAI layer, update first layer
        if tower_json:
            tower_json[0]["limit"] = new_limit

    with get_conn().cursor() as cur:
        cur.execute(
            """
            UPDATE insurance_towers
            SET tower_json = %s, updated_at = now()
            WHERE id = %s
            """,
            (json.dumps(tower_json), quote_id),
        )

    return tower_json
