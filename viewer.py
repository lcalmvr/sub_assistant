"""
Streamlit admin viewer (v3 → v3.1) – now with underwriter feedback logging
===========================================================================

NEW IN v3.1  (Aug 2025)
-----------------------
* 👍 / 👎 / ⚠️  radio buttons + optional edit & comment for:
    • Business Summary
    • Cyber Exposures
    • NIST Controls Summary
* Records saved to `submission_feedback` table (see roadmap Phase 1)
* “🔎 Feedback History” expander shows past feedback for the open submission

Dependencies unchanged: streamlit, psycopg2-binary, pgvector, pandas
"""

import os, json
import psycopg2
from pgvector.psycopg2 import register_vector
from pgvector import Vector
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Submission Viewer", layout="wide")

DATABASE_URL = os.getenv("DATABASE_URL")

# Detect current user – adapt to your auth system as needed
CURRENT_USER = st.session_state.get("current_user", os.getenv("USER", "unknown"))

# ──────────────────────────────────────────────────────────────
# DB helpers
# ──────────────────────────────────────────────────────────────
def get_conn():
    """Return (and cache) a live psycopg2 connection."""
    conn = st.session_state.get("db_conn")
    if conn is None or conn.closed != 0:  # 0=open, 1=closed
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
) -> None:
    """Insert one feedback record into submission_feedback."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO submission_feedback
                (submission_id, section, original_text, edited_text,
                 feedback_label, comment, user_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s);
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


# ──────────────────────────────────────────────────────────────
# Data loaders
# ──────────────────────────────────────────────────────────────
def load_submissions(where_sql: str, params: list, limit: int = 200) -> pd.DataFrame:
    qry = f"""
        SELECT id, applicant_name, broker_email, naics_primary_code,
               date_received, quote_ready,
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
# Sidebar filters
# ──────────────────────────────────────────────────────────────
st.title("📂 AI-Processed Submissions")

with st.sidebar:
    st.header("Filters")
    filt_below_avg = st.checkbox("⚠️ Any below-average NIST domain")
    naics_prefix = st.text_input("Primary NAICS (starts with)")
    filt_quote = st.checkbox("Quote ready only")

where_clauses, params = [], []
if filt_below_avg:
    where_clauses.append("nist_controls::text ILIKE '%below_average%'")
if naics_prefix.strip():
    where_clauses.append("naics_primary_code LIKE %s")
    params.append(f"{naics_prefix.strip()}%")
if filt_quote:
    where_clauses.append("quote_ready = true")
WHERE_SQL = " AND ".join(where_clauses) or "TRUE"

# ──────────────────────────────────────────────────────────────
# Recent submissions table + selector
# ──────────────────────────────────────────────────────────────
sub_df = load_submissions(WHERE_SQL, params)

st.subheader("Recent submissions")
st.dataframe(sub_df, use_container_width=True, hide_index=True)

label_map = {f"{row.applicant_name} – {str(row.id)[:8]}": row.id for row in sub_df.itertuples()}
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
            SELECT business_summary, cyber_exposures, nist_controls_summary,
                   ops_embedding, controls_embedding
            FROM submissions WHERE id = %s;
            """,
            (sub_id,),
        )
        row = cur.fetchone()
        biz_sum, exp_sum, ctrl_sum, ops_vec, ctrl_vec = row

    # ───────────────────────────────
    # Feedback-enabled AI sections
    # ───────────────────────────────
    def feedback_block(
        title: str,
        section_slug: str,
        original_text: str | None,
    ):
        with st.expander(title, expanded=True):
            st.markdown(original_text or "_not available_")

            # --- feedback widgets ---
            cols = st.columns([1, 3])
            with cols[0]:
                feedback = st.radio(
                    "Rating",
                    ["👍", "👎", "⚠️"],
                    horizontal=True,
                    key=f"{section_slug}_fb_{sub_id}",
                )
                comment = st.text_input(
                    "Comment (optional)",
                    key=f"{section_slug}_comment_{sub_id}",
                )
            with cols[1]:
                edited_text = st.text_area(
                    "Edit (optional)",
                    value=original_text or "",
                    height=200,
                    key=f"{section_slug}_edit_{sub_id}",
                )

            if st.button("Submit feedback", key=f"{section_slug}_submit_{sub_id}"):
                save_feedback(
                    submission_id=sub_id,
                    section=section_slug,
                    original_text=original_text or "",
                    edited_text=edited_text
                    if edited_text != (original_text or "")
                    else None,
                    feedback_label=feedback,
                    comment=comment or None,
                    user_id=CURRENT_USER,
                )
                st.success("Saved ✔︎")

    feedback_block("📝 Business Summary", "business_summary", biz_sum)
    feedback_block("🛡️ Cyber Exposures", "cyber_exposures", exp_sum)
    feedback_block("🔐 NIST Controls Summary", "nist_controls", ctrl_sum)

    # ───────────────────────────────
    # Similarity selector (unchanged)
    # ───────────────────────────────
    sim_mode = st.radio(
        "Show similar submissions by…",
        ("None", "Business operations", "Controls (NIST)", "Operations & NIST"),
        horizontal=True,
        key="sim_mode",
    )

    if sim_mode != "None":
        vec_lookup = {
            "Business operations": ("ops_embedding", ops_vec),
            "Controls (NIST)": ("controls_embedding", ctrl_vec),
            "Operations & NIST": (
                "(ops_embedding + controls_embedding)",
                [a + b for a, b in zip(ops_vec, ctrl_vec)],
            ),
        }
        col_expr, q_vec = vec_lookup[sim_mode]

        with get_conn().cursor() as cur:
            cur.execute(
                f"""
                SELECT id, applicant_name,
                       left(business_summary, 60)  AS biz_snip,
                       left(nist_controls_summary, 60) AS ctrl_snip,
                       {col_expr} <=> %s AS dist
                FROM submissions
                WHERE id <> %s AND {WHERE_SQL}
                ORDER BY dist
                LIMIT 10;
                """,
                params + [Vector(q_vec), sub_id],
            )
            rows = cur.fetchall()

        st.markdown("#### Similar submissions")
        st.table(
            [
                {
                    "Applicant": r[1],
                    "ID": str(r[0])[:8],
                    "Biz preview": (r[2] or "") + "…",
                    "Ctrl preview": (r[3] or "") + "…",
                    "Similarity": round(1 - r[4], 3),
                }
                for r in rows
            ]
        )

    # ───────────────────────────────
    # Feedback history
    # ───────────────────────────────
    with st.expander("🔎 Feedback History"):
        hist_df = pd.read_sql(
            """
            SELECT section,
                   coalesce(edited_text, '—') AS edited_text,
                   feedback_label,
                   comment,
                   user_id,
                   created_at AT TIME ZONE 'UTC' AS created_utc
            FROM submission_feedback
            WHERE submission_id = %s
            ORDER BY created_at DESC;
            """,
            get_conn(),
            params=[sub_id],
        )
        st.dataframe(hist_df, use_container_width=True)

    # ───────────────────────────────
    # Documents (unchanged)
    # ───────────────────────────────
    st.subheader("Documents")
    docs = load_documents(sub_id)
    for _, r in docs.iterrows():
        with st.expander(f"{r['filename']} – {r['document_type']}"):
            st.write(
                f"Pages: {r['page_count']} | Priority: {r['is_priority']}"
            )
            st.markdown("**Metadata**")
            st.json(_safe_json(r["doc_metadata"]))
            st.markdown("**Extracted Data (truncated)**")
            st.json(_safe_json(r["extracted_data"]))
