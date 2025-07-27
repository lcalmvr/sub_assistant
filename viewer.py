# viewer.py
"""
Streamlit admin viewer with:
  • Recent-submission table (filtered)
  • Detailed document explorer
  • Vector similarity search on
        – Business-operations embedding
        – Controls embedding
        – Combined (sum)
  • Sidebar filters powered by LLM-normalized fields:
        – MFA absent
        – Industry = manufacturing
------------------------------------------------------------
Env-vars:
  DATABASE_URL      Supabase pooler URL
  OPENAI_API_KEY    for text-embedding-3-small
"""

import os, json
from datetime import datetime

import psycopg2
from pgvector.psycopg2 import register_vector
from pgvector import Vector
import pandas as pd
import streamlit as st
import openai

# ---------- CONFIG ----------
st.set_page_config(page_title="Submission Viewer", layout="wide")

DATABASE_URL   = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
oa_client      = openai.OpenAI(api_key=OPENAI_API_KEY)


# ---------- DB helper ----------
@st.cache_resource(show_spinner=False)
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    register_vector(conn)
    return conn


def load_submissions(sql_where: str, limit: int = 200) -> pd.DataFrame:
    qry = f"""
        SELECT id,
               applicant_name,
               broker_email,
               date_received,
               quote_ready,
               created_at AT TIME ZONE 'UTC' AS created_utc
        FROM submissions
        WHERE {sql_where}
        ORDER BY created_at DESC
        LIMIT %s;
    """
    return pd.read_sql(qry, get_conn(), params=[limit])


def load_documents(submission_id):
    qry = """
        SELECT filename,
               document_type,
               page_count,
               is_priority,
               doc_metadata,
               extracted_data
        FROM documents
        WHERE submission_id = %s;
    """
    return pd.read_sql(qry, get_conn(), params=[submission_id])


# ---------- safe-JSON ----------
def _safe_json(val):
    if val in (None, "", {}):
        return {}
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return {"value": val}
    return val


# ============================================================
st.title("📂 AI-Processed Submissions")

# ---------- Sidebar filters ----------
with st.sidebar:
    st.header("Filters")
    filt_no_mfa   = st.checkbox("MFA absent")
    filt_mfg_only = st.checkbox("Industry: manufacturing")

where_clauses = ["TRUE"]
if filt_no_mfa:
    where_clauses.append("flags->>'mfa' = 'absent'")
if filt_mfg_only:
    where_clauses.append("industry_code = 'manufacturing'")

SQL_WHERE = " AND ".join(where_clauses)

# ---------- Vector search panel ----------
with st.expander("🔍 Find similar submissions"):
    query_text = st.text_input("Describe the account (free text):", key="vec_query")
    vec_mode   = st.radio(
        "Search vector",
        ["Business operations", "Controls", "Combined"],
        horizontal=True,
        key="vec_mode",
    )

    if query_text:
        # column/expression to compare
        col_expr = {
            "Business operations": "ops_embedding",
            "Controls":            "controls_embedding",
            "Combined":            "(ops_embedding + controls_embedding)"
        }[vec_mode]

        # embed query
        q_vec = oa_client.embeddings.create(
            model="text-embedding-3-small",
            input=query_text,
            encoding_format="float"
        ).data[0].embedding

        rows = []
        try:
            cur = get_conn().cursor()
            cur.execute(
                f"""
                SELECT id,
                       applicant_name,
                       broker_email,
                       left(operations_summary, 60)        AS ops_snip,
                       left(security_controls_summary, 60) AS ctrl_snip,
                       {col_expr} <=> %s AS dist
                FROM submissions
                WHERE {SQL_WHERE}
                ORDER BY dist
                LIMIT 10;
                """,
                (Vector(q_vec),)
            )
            rows = cur.fetchall()
        except psycopg2.Error as e:
            get_conn().rollback()
            st.error(f"Query failed: {e}")
        finally:
            cur.close()

        st.markdown("**Top matches:**")
        st.table([
            {
                "ID":          r[0],
                "Applicant":   r[1] or "(unknown)",
                "Broker":      r[2],
                "Ops preview": r[3] + "…",
                "Ctrl preview": r[4] + "…",
                "Similarity":  round(1 - r[5], 3)
            } for r in rows
        ])

st.divider()

# ---------- Recent submissions ----------
sub_df = load_submissions(SQL_WHERE)

st.subheader("Recent submissions")
st.dataframe(sub_df, use_container_width=True, hide_index=True)

sub_id = st.selectbox(
    "Select a submission to open ↓",
    sub_df["id"],
    index=0 if len(sub_df) else None,
)

if sub_id:
    st.divider()

    # ----- detailed summary -----
    st.subheader(f"Submission {sub_id}")
    with get_conn().cursor() as cur:
        cur.execute("""
            SELECT summary,
                   operations_summary,
                   security_controls_summary
            FROM submissions
            WHERE id=%s;
        """, (sub_id,))
        summary, ops_sum, ctrl_sum = cur.fetchone()

    st.markdown("### LLM Summary")
    st.markdown(summary)

    with st.expander("Business-Ops bullets"):
        st.markdown(ops_sum or "_not available_")
    with st.expander("Controls bullets"):
        st.markdown(ctrl_sum or "_not available_")

    # ----- documents -----
    st.subheader("Documents")
    docs = load_documents(sub_id)
    for _, row in docs.iterrows():
        with st.expander(f"{row['filename']} – {row['document_type']}"):
            st.write(
                f"Pages: {row['page_count']}  |  Priority: {row['is_priority']}"
            )
            st.markdown("**Metadata**")
            st.json(_safe_json(row["doc_metadata"]))
            st.markdown("**Extracted Data (truncated)**")
            st.json(_safe_json(row["extracted_data"]))
