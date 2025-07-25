import os, json, psycopg2, pandas as pd, streamlit as st
from datetime import datetime

st.set_page_config(page_title="Submission Viewer", layout="wide")

DATABASE_URL = os.getenv("DATABASE_URL")  # Render will inject; local dev: export it

@st.cache_resource(show_spinner=False)
def get_conn():
    return psycopg2.connect(DATABASE_URL)

def load_submissions(limit=200):
    q = """
        SELECT id, broker_email, date_received, quote_ready,
               created_at AT TIME ZONE 'UTC' AS created_utc
        FROM submissions
        ORDER BY created_at DESC
        LIMIT %s;
    """
    return pd.read_sql(q, get_conn(), params=[limit])

def load_documents(submission_id):
    q = """
        SELECT filename, document_type, page_count, is_priority,
               doc_metadata, extracted_data
        FROM documents
        WHERE submission_id = %s;
    """
    return pd.read_sql(q, get_conn(), params=[submission_id])

st.title("📂 AI-Processed Submissions")

sub_df = load_submissions()
st.subheader("Recent submissions")

st.dataframe(sub_df, use_container_width=True, hide_index=True)

choice = st.radio(
    "Select a submission to open ↓",
    sub_df.index,
    format_func=lambda i: f"{sub_df.at[i, 'id']} — {sub_df.at[i, 'broker_email']}"
)

sub_id = sub_df.at[choice, "id"]
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
            st.write(f"Pages: {row['page_count']}  |  Priority: {row['is_priority']}")
            st.markdown("**Metadata**")
            st.json(json.loads(row["doc_metadata"] or "{}"))
            st.markdown("**Extracted Data (truncated)**")
            st.json(json.loads(row["extracted_data"] or "{}"))

