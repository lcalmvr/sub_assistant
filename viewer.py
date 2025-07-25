import os
import json
from datetime import datetime

import psycopg2
import pandas as pd
import streamlit as st

# ----------------- CONFIG -----------------
st.set_page_config(page_title="Submission Viewer", layout="wide")

DATABASE_URL = os.getenv("DATABASE_URL")  # provided by Render or .env


# -------------- DB HELPERS ---------------
@st.cache_resource(show_spinner=False)
def get_conn():
    return psycopg2.connect(DATABASE_URL)


def load_submissions(limit: int = 200) -> pd.DataFrame:
    query = """
        SELECT id,
               broker_email,
               date_received,
               quote_ready,
               created_at AT TIME ZONE 'UTC' AS created_utc
        FROM submissions
        ORDER BY created_at DESC
        LIMIT %s;
    """
    return pd.read_sql(query, get_conn(), params=[limit])


def load_documents(submission_id):
    query = """
        SELECT filename,
               document_type,
               page_count,
               is_priority,
               doc_metadata,
               extracted_data
        FROM documents
        WHERE submission_id = %s;
    """
    return pd.read_sql(query, get_conn(), params=[submission_id])


# -------------- SAFE JSON HELPER ---------------
def _safe_json(val):
    """
    Return a JSON-serialisable dict or list regardless of raw storage type.
    Handles: None, empty string, stringified JSON, already-parsed dict/list.
    """
    if val in (None, "", {}):
        return {}
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return {"value": val}
    return val  # already dict / list / other


# -------------- UI -----------------
st.title("📂 AI-Processed Submissions")

sub_df = load_submissions()

st.subheader("Recent submissions")
st.dataframe(sub_df, use_container_width=True, hide_index=True)

sub_id = st.selectbox(
    "Select a submission to open ↓",
    sub_df["id"],
    index=0 if len(sub_df) else None,
)

if sub_id:
    st.divider()

    # --- Summary card ---
    st.subheader(f"Submission {sub_id}")
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT summary FROM submissions WHERE id=%s;", (sub_id,))
        summary = cur.fetchone()[0]
    st.markdown(f"**LLM Summary:**\n\n{summary}")

    # --- Documents ---
    docs = load_documents(sub_id)
    st.subheader("Documents")
    for _, row in docs.iterrows():
        with st.expander(f"{row['filename']} – {row['document_type']}"):
            st.write(
                f"Pages: {row['page_count']}  |  Priority: {row['is_priority']}"
            )

            st.markdown("**Metadata**")
            st.json(_safe_json(row["doc_metadata"]))

            st.markdown("**Extracted Data (truncated)**")
            st.json(_safe_json(row["extracted_data"]))

