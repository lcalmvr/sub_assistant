"""
Database utilities for Streamlit application
"""
import os
import pandas as pd
import psycopg2
import psycopg2.extras
import streamlit as st
from pgvector.psycopg2 import register_vector
from sqlalchemy import create_engine

DATABASE_URL = os.getenv("DATABASE_URL")

# Create SQLAlchemy engine for pandas operations
_sqlalchemy_engine = None

def get_sqlalchemy_engine():
    """Get SQLAlchemy engine for pandas operations"""
    global _sqlalchemy_engine
    if _sqlalchemy_engine is None and DATABASE_URL:
        _sqlalchemy_engine = create_engine(DATABASE_URL)
    return _sqlalchemy_engine

def get_conn():
    """Get database connection from session state or create new one"""
    conn = st.session_state.get("db_conn")
    if conn is None or conn.closed != 0:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        register_vector(conn)
        st.session_state["db_conn"] = conn
    return conn

def save_feedback(
    submission_id: str,
    section: str,
    original_text: str,
    edited_text: str | None,
    feedback_label: str,
    comment: str | None,
    user_id: str,
):
    """Save user feedback to database"""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO submission_feedback
              (submission_id, section, original_text, edited_text,
               feedback_label, comment, user_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                submission_id,
                section,
                original_text,
                edited_text,
                feedback_label,
                comment,
                user_id,
            ),
        )

def latest_edits_map(submission_id: str) -> dict[str, str]:
    """Get latest edits for a submission"""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT section, edited_text
            FROM submission_feedback
            WHERE submission_id = %s AND edited_text IS NOT NULL
            ORDER BY created_at DESC
            """,
            (submission_id,),
        )
        return {row[0]: row[1] for row in cur.fetchall()}

def load_submissions(where_clause: str, params: list) -> pd.DataFrame:
    """Load submissions list with filtering"""
    qry = f"""
        SELECT id,
           date_received,
               applicant_name,
               annual_revenue,
               naics_primary_title,
           industry_tags
        FROM submissions
    WHERE {where_clause}
    ORDER BY date_received DESC
    LIMIT 100
    """
    engine = get_sqlalchemy_engine()
    if engine:
        return pd.read_sql(qry, engine, params=params)
    else:
        # Fallback to psycopg2 connection
        return pd.read_sql(qry, get_conn(), params=params)

def load_documents(submission_id: str) -> pd.DataFrame:
    """Load documents for a submission"""
    qry = """
    SELECT filename, document_type, page_count, is_priority, doc_metadata, extracted_data
        FROM documents
    WHERE submission_id = %s
    ORDER BY is_priority DESC, filename
    """
    engine = get_sqlalchemy_engine()
    if engine:
        return pd.read_sql(qry, engine, params=[submission_id])
    else:
        return pd.read_sql(qry, get_conn(), params=[submission_id])

def load_submission(submission_id: str) -> pd.DataFrame:
    """Load a single submission with all details"""
    qry = """
    SELECT id, date_received, applicant_name, annual_revenue, naics_primary_title,
           naics_secondary_title, industry_tags, business_summary, cyber_exposures,
           nist_controls_summary, nist_controls, bullet_point_summary
    FROM submissions
    WHERE id = %s
    """
    engine = get_sqlalchemy_engine()
    if engine:
        return pd.read_sql(qry, engine, params=[submission_id])
    else:
        return pd.read_sql(qry, get_conn(), params=[submission_id])

def get_similar_submissions(ops_vec: list, ctrl_vec: list, current_id: str, limit: int = 10) -> list:
    """Find similar submissions using vector similarity"""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT 
                id, applicant_name, business_summary, nist_controls_summary,
                (ops_vec <=> %s) + (ctrl_vec <=> %s) as total_distance
            FROM submissions 
            WHERE ops_vec IS NOT NULL 
              AND ctrl_vec IS NOT NULL 
              AND id != %s
            ORDER BY total_distance ASC
            LIMIT %s
            """, 
            (ops_vec, ctrl_vec, current_id, limit)
        )
        return cur.fetchall()

def save_quote_to_db(sub_id: str, quote_json: dict, pdf_url: str):
    """Save quote data to database"""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO quotes (submission_id, quote_data, pdf_url)
            VALUES (%s, %s, %s)
            ON CONFLICT (submission_id) 
            DO UPDATE SET 
                quote_data = EXCLUDED.quote_data,
                pdf_url = EXCLUDED.pdf_url,
                updated_at = CURRENT_TIMESTAMP
            """,
            (sub_id, psycopg2.extras.Json(quote_json), pdf_url)
        )

def update_submission_field(sub_id: str, field: str, value):
    """Update a single field in submissions table"""
    with get_conn().cursor() as cur:
        cur.execute(
            f"UPDATE submissions SET {field} = %s WHERE id = %s",
            (value, sub_id)
        )