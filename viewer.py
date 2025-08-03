"""
Streamlit admin viewer (v3.2) – Edited text now becomes the displayed source
============================================================================
* Prefers latest non-null edited_text for each section
* Textarea defaults to that edited version
* After Save → auto-refresh via st.experimental_rerun()
"""

import os, json
import psycopg2
from pgvector.psycopg2 import register_vector
from pgvector import Vector
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Submission Viewer", layout="wide")

DATABASE_URL = os.getenv("DATABASE_URL")
CURRENT_USER = st.session_state.get("current_user", os.getenv("USER", "unknown"))

# ░░░░░░░░░░░░░░  QUOTE HELPERS  ░░░░░░░░░░░░░░░
from rating_engine.engine import price as rate_quote
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
import uuid, mimetypes, json
from tempfile import NamedTemporaryFile
from pathlib import Path
from supabase import create_client

SB = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE"))
TEMPLATE_ENV = Environment(loader=FileSystemLoader("rating_engine/templates"))

def _render_quote_pdf(ctx: dict) -> Path:
    html = TEMPLATE_ENV.get_template("quote.html").render(**ctx)
    tmp = NamedTemporaryFile(delete=False, suffix=".pdf")
    HTML(string=html).write_pdf(tmp.name)
    return Path(tmp.name)

def _upload_pdf(pdf_path: Path) -> str:
    bucket = "quotes"
    key = f"{uuid.uuid4()}.pdf"
    with pdf_path.open("rb") as f:
        SB.storage.from_(bucket).upload(
            key, f, {"content-type": mimetypes.guess_type(pdf_path)[0] or "application/pdf"}
        )
    return f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/{bucket}/{key}"

def _save_quote_row(sub_id: str, quote_json: dict, pdf_url: str):
    with get_conn().cursor() as cur:
        cur.execute(
            """
            insert into quotes (submission_id, quote_json, pdf_url, created_by)
            values (%s,%s,%s,%s)
            returning id
            """,
            (sub_id, json.dumps(quote_json), pdf_url, CURRENT_USER),
        )
        return cur.fetchone()[0]
# ░░░░░░░░░░░░░░  END QUOTE HELPERS  ░░░░░░░░░░░░░░



# ─────────────────────── DB helpers ────────────────────────
def get_conn():
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


def latest_edits_map(submission_id: str) -> dict:
    """
    Return {section_slug: latest_non_null_edited_text}
    """
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (section)
                   section, edited_text
            FROM submission_feedback
            WHERE submission_id = %s
              AND edited_text IS NOT NULL
            ORDER BY section, created_at DESC
            """,
            (submission_id,),
        )
        return {row[0]: row[1] for row in cur.fetchall()}


# ─────────────────────── Data loaders ───────────────────────
def load_submissions(where_sql: str, params: list, limit: int = 200):
    qry = f"""
        SELECT id, applicant_name, broker_email,
               naics_primary_code,
               date_received,
               quote_ready,
               created_at AT TIME ZONE 'UTC' AS created_utc
        FROM submissions
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT %s
    """
    return pd.read_sql(qry, get_conn(), params=params + [limit])


def load_documents(submission_id):
    qry = """
        SELECT filename, document_type, page_count, is_priority,
               doc_metadata, extracted_data
        FROM documents
        WHERE submission_id = %s
    """
    return pd.read_sql(qry, get_conn(), params=[submission_id])


# ─────────────────────── Utility ────────────────────────────
def _safe_json(val):
    if val in (None, "", {}):
        return {}
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return {"value": val}
    return val


# ─────────────────────── UI starts ──────────────────────────
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

sub_df = load_submissions(WHERE_SQL, params)
st.subheader("Recent submissions")
st.dataframe(sub_df, use_container_width=True, hide_index=True)

label_map = {f"{r.applicant_name} – {str(r.id)[:8]}": r.id for r in sub_df.itertuples()}
label_selected = st.selectbox("Open submission:", list(label_map.keys()) or ["—"])
sub_id = label_map.get(label_selected)

if sub_id:
    st.divider()
    st.subheader(label_selected)

    # ------------------- pull AI originals -------------------
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT business_summary,
                   cyber_exposures,
                   nist_controls_summary,
                   ops_embedding,
                   controls_embedding
            FROM submissions
            WHERE id = %s
            """,
            (sub_id,),
        )
        biz_sum, exp_sum, ctrl_sum, ops_vec, ctrl_vec = cur.fetchone()

    # ------------------- pull latest edits -------------------
    latest_edits = latest_edits_map(sub_id)

    # ------------------- reusable feedback block -------------
    def feedback_block(title, slug, original):
        # prefer edited version for display & textarea default
        effective_text = latest_edits.get(slug) or original or "_not available_"

        with st.expander(title, expanded=True):
            st.markdown(effective_text)

            cols = st.columns([1, 3])
            with cols[0]:
                feedback = st.radio(
                    "Rating", ["👍", "👎", "⚠️"], horizontal=True, key=f"{slug}_rate_{sub_id}"
                )
                comment = st.text_input(
                    "Comment (optional)", key=f"{slug}_cmt_{sub_id}"
                )
            with cols[1]:
                edited_text = st.text_area(
                    "Edit (optional)",
                    value=effective_text if effective_text != "_not available_" else "",
                    height=200,
                    key=f"{slug}_edit_{sub_id}",
                )

            if st.button("Submit feedback", key=f"{slug}_btn_{sub_id}"):
                save_feedback(
                    sub_id,
                    slug,
                    original_text=original or "",
                    edited_text=edited_text if edited_text != original else None,
                    feedback_label=feedback,
                    comment=comment or None,
                    user_id=CURRENT_USER,
                )
                st.success("Saved ✔︎")
                st.experimental_rerun()  # refresh to display new edit

    feedback_block("📝 Business Summary", "business_summary", biz_sum)
    feedback_block("🛡️ Cyber Exposures", "cyber_exposures", exp_sum)
    feedback_block("🔐 NIST Controls Summary", "nist_controls", ctrl_sum)

    # ───────────────────────────────
    #  Quote Draft Button
    # ───────────────────────────────
    if st.button("🧾 Generate Quote Draft", type="primary"):
        # 1.  Build a minimal dict for rating_engine
        #    (replace revenue/controls fetch with real columns in your DB)
        with get_conn().cursor() as cur:
            cur.execute(
                "select industry_slug, annual_revenue, controls_present from submissions where id=%s",
                (sub_id,),
            )
            ind, rev, ctrl_list = cur.fetchone()
        submission_dict = {
            "industry": ind,
            "revenue":  rev,
            "limit":    2_000_000,    # you may let underwriter choose these later
            "retention":25_000,
            "controls": ctrl_list or [],
        }
        quote_out = rate_quote(submission_dict)      # ← calls your YAML engine
        quote_out["terms"] = "Standard carrier form – subject to underwriting."  # stub

        # 2.  Render PDF
        pdf_path = _render_quote_pdf({
            "applicant": biz_sum.split("\n")[0] if biz_sum else "Applicant",
            **quote_out
        })
        # 3.  Upload & save row
        url   = _upload_pdf(pdf_path)
        qid   = _save_quote_row(sub_id, quote_out, url)

        st.success(f"Draft quote saved (ID {qid}).")
        st.markdown(f"[📥 Download PDF]({url})")


    # ------------------- similarity section (unchanged) ------
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
                SELECT id,
                       applicant_name,
                       left(business_summary,60),
                       left(nist_controls_summary,60),
                       {col_expr} <=> %s AS dist
                FROM submissions
                WHERE id <> %s AND {WHERE_SQL}
                ORDER BY dist
                LIMIT 10
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

    # ------------------- feedback history --------------------
    with st.expander("🔎 Feedback History"):
        hist_df = pd.read_sql(
            """
            SELECT section,
                   COALESCE(edited_text,'—')   AS edited_text,
                   feedback_label,
                   comment,
                   user_id,
                   created_at AT TIME ZONE 'UTC' AS created_utc
            FROM submission_feedback
            WHERE submission_id = %s
            ORDER BY created_at DESC
            """,
            get_conn(),
            params=[sub_id],
        )
        st.dataframe(hist_df, use_container_width=True)

    # ------------------- documents (unchanged) ---------------
    st.subheader("Documents")
    docs = load_documents(sub_id)
    for _, r in docs.iterrows():
        with st.expander(f"{r['filename']} – {r['document_type']}"):
            st.write(f"Pages: {r['page_count']} | Priority: {r['is_priority']}")
            st.markdown("**Metadata**")
            st.json(_safe_json(r["doc_metadata"]))
            st.markdown("**Extracted Data (truncated)**")
            st.json(_safe_json(r["extracted_data"]))
