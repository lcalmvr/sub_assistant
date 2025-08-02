"""
Streamlit admin viewer (v2) – aligned with updated `submissions` schema
=====================================================================
Features
--------
* **Sidebar filters**
    • ⚠️ *Any below‑average NIST domain*
    • Primary NAICS **prefix** search
    • *Quote‑ready only*
* **Selectbox** now shows **“Applicant – short‑ID”** (name first) for easier scanning.
* Vector similarity search and document explorer remain.

Dependencies: `streamlit`, `psycopg2-binary`, `pgvector`, `openai`, `pandas`
"""

import os, json
import psycopg2
from pgvector.psycopg2 import register_vector
from pgvector import Vector
import pandas as pd
import streamlit as st
import openai

st.set_page_config(page_title="Submission Viewer", layout="wide")

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

oa_client = openai.OpenAI(api_key=OPENAI_API_KEY)

# ──────────────────────────────────────────────────────────────
# DB helpers
# ──────────────────────────────────────────────────────────────
@st.cache_resource(show_spinner=False)
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    register_vector(conn)
    return conn


def load_submissions(where_sql: str, params: list, limit: int = 200) -> pd.DataFrame:
    qry = f"""
        SELECT id,
               applicant_name,
               broker_email,
               naics_primary_code,
               date_received,
               quote_ready,
               created_at AT TIME ZONE 'UTC' AS created_utc
        FROM submissions
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT %s;
    """
    return pd.read_sql(qry, get_conn(), params=params + [limit])


def load_documents(submission_id):
    qry = """
        SELECT filename, document_type, page_count, is_priority, doc_metadata, extracted_data
        FROM documents WHERE submission_id = %s;
    """
    return pd.read_sql(qry, get_conn(), params=[submission_id])


# ──────────────────────────────────────────────────────────────
# Utility
# ──────────────────────────────────────────────────────────────

def _safe_json(val):
    if val in (None, "", {}):
        return {}
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return {"value": val}
    return val


# ──────────────────────────────────────────────────────────────
# UI – Sidebar filters
# ──────────────────────────────────────────────────────────────
st.title("📂 AI‑Processed Submissions")

with st.sidebar:
    st.header("Filters")
    filt_below_avg = st.checkbox("⚠️ Any below‑average NIST domain")
    naics_prefix   = st.text_input("Primary NAICS (starts with)")
    filt_quote     = st.checkbox("Quote ready only")

where_clauses = []
params: list = []

if filt_below_avg:
    where_clauses.append("nist_controls::text ILIKE '%below_average%'")
if naics_prefix.strip():
    where_clauses.append("naics_primary_code LIKE %s")
    params.append(f"{naics_prefix.strip()}%")
if filt_quote:
    where_clauses.append("quote_ready = true")

WHERE_SQL = " AND ".join(where_clauses) or "TRUE"

# ──────────────────────────────────────────────────────────────
# Vector search panel (unchanged)
# ──────────────────────────────────────────────────────────────
with st.expander("🔍 Find similar submissions"):
    query_text = st.text_input("Describe the account (free text):", key="vec_query")
    vec_mode = st.radio(
        "Search vector",
        ["Business operations", "Controls", "Combined"],
        horizontal=True,
        key="vec_mode",
    )

    if query_text:
        col_expr = {
            "Business operations": "ops_embedding",
            "Controls": "controls_embedding",
            "Combined": "(ops_embedding + controls_embedding)",
        }[vec_mode]

        q_vec = oa_client.embeddings.create(
            model="text-embedding-3-small",
            input=query_text,
            encoding_format="float",
        ).data[0].embedding

        cur = get_conn().cursor()
        cur.execute(
            f"""
            SELECT id, applicant_name,
                   left(business_summary, 60) AS biz_snip,
                   left(nist_controls_summary, 60) AS ctrl_snip,
                   {col_expr} <=> %s AS dist
            FROM submissions
            WHERE {WHERE_SQL}
            ORDER BY dist
            LIMIT 10;
            """,
            params + [Vector(q_vec)],
        )
        rows = cur.fetchall(); cur.close()

        st.markdown("**Top matches:**")
        st.table([
            {
                "Applicant": r[1],
                "ID": str(r[0])[:8],
                "Biz preview": (r[2] or "") + "…",
                "Ctrl preview": (r[3] or "") + "…",
                "Similarity": round(1 - r[4], 3),
            }
            for r in rows
        ])

st.divider()

# ──────────────────────────────────────────────────────────────
# Recent submissions table
# ──────────────────────────────────────────────────────────────
sub_df = load_submissions(WHERE_SQL, params)

st.subheader("Recent submissions")
st.dataframe(sub_df, use_container_width=True, hide_index=True)

label_map = {
    f"{row.applicant_name} – {str(row.id)[:8]}": row.id for row in sub_df.itertuples()
}

label_selected = st.selectbox(
    "Open submission:", list(label_map.keys()), index=0 if label_map else None
)
sub_id = label_map.get(label_selected)

if sub_id:
    st.divider()
    st.subheader(label_selected)

    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT business_summary, cyber_exposures, nist_controls_summary
            FROM submissions WHERE id=%s;
            """,
            (sub_id,),
        )
        biz_sum, exp_sum, ctrl_sum = cur.fetchone()

    st.markdown("### Business Summary")
    st.markdown(biz_sum or "_not available_")

    with st.expander("Cyber Exposures"):
        st.markdown(exp_sum or "_not available_")
    with st.expander("NIST Controls Summary"):
        st.markdown(ctrl_sum or "_not available_")

    st.subheader("Documents")
    docs = load_documents(sub_id)
    for _, row in docs.iterrows():
        with st.expander(f"{row['filename']} – {row['document_type']}"):
            st.write(f"Pages: {row['page_count']} | Priority: {row['is_priority']}")
            st.markdown("**Metadata**")
            st.json(_safe_json(row["doc_metadata"]))
            st.markdown("**Extracted Data (truncated)**")
            st.json(_safe_json(row["extracted_data"]))
