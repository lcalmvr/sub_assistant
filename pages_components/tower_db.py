"""
Tower/Quote Database Operations
Shared database helpers for insurance tower and quote management.
"""

import os
import json
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


def _row_to_quote(row) -> dict:
    """Convert a database row to a quote dict."""
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
    }


def save_tower(submission_id: str, tower_json: list, primary_retention: float | None,
               sublimits: list | None = None, quote_name: str = "Option A",
               quoted_premium: float | None = None, quote_notes: str | None = None) -> str:
    """Save a new tower/quote option for a submission."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO insurance_towers (submission_id, tower_json, primary_retention,
                                          sublimits, quote_name, quoted_premium, quote_notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (submission_id, json.dumps(tower_json), primary_retention,
             json.dumps(sublimits or []), quote_name, quoted_premium, quote_notes, CURRENT_USER),
        )
        return str(cur.fetchone()[0])


def update_tower(tower_id: str, tower_json: list, primary_retention: float | None,
                 sublimits: list | None = None, quote_name: str | None = None,
                 quoted_premium: float | None = None, quote_notes: str | None = None):
    """Update an existing tower/quote option."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            UPDATE insurance_towers
            SET tower_json = %s, primary_retention = %s,
                sublimits = %s, quote_name = COALESCE(%s, quote_name),
                quoted_premium = %s, quote_notes = %s, updated_at = now()
            WHERE id = %s
            """,
            (json.dumps(tower_json), primary_retention,
             json.dumps(sublimits or []), quote_name, quoted_premium, quote_notes, tower_id),
        )


def get_tower_for_submission(submission_id: str) -> dict | None:
    """Get the most recent quote for a submission."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at
            FROM insurance_towers
            WHERE submission_id = %s
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (submission_id,),
        )
        row = cur.fetchone()
    return _row_to_quote(row) if row else None


def get_quote_by_id(quote_id: str) -> dict | None:
    """Get a specific quote by ID."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at
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
                   quote_name, quoted_premium, quote_notes, created_at, updated_at
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
    )


def delete_tower(tower_id: str):
    """Delete a tower/quote."""
    with get_conn().cursor() as cur:
        cur.execute("DELETE FROM insurance_towers WHERE id = %s", (tower_id,))
