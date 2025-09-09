"""
Streamlit admin viewer (v4.0) – Clean rebuild with all features
============================================================================
* New Account/Renewal radio buttons
* Business Summary with industry classification
* Exposure Summary
* NIST Controls Summary
* AI Recommendation
* Underwriter Decision
* Similar Submissions with embeddings fix
* Sidebar AI Chat
* Documents section
* All proper layout and functionality
"""

import os, json
import psycopg2
from pgvector.psycopg2 import register_vector
from pgvector import Vector
import pandas as pd
import streamlit as st
from datetime import datetime, timezone
from sqlalchemy import text

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

def latest_edits_map(submission_id: str) -> dict[str, str]:
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
    qry = f"""
        SELECT id,
           date_received,
               applicant_name,
               naics_primary_title,
               naics_secondary_title,
           industry_tags
        FROM submissions
    WHERE {where_clause}
    ORDER BY date_received DESC
    LIMIT 100
    """
    return pd.read_sql(qry, get_conn(), params=params)

def load_documents(submission_id: str) -> pd.DataFrame:
    qry = """
    SELECT filename, document_type, page_count, is_priority, doc_metadata, extracted_data
        FROM documents
    WHERE submission_id = %s
    ORDER BY is_priority DESC, filename
    """
    return pd.read_sql(qry, get_conn(), params=[submission_id])

def _safe_json(data):
    if isinstance(data, str):
        try:
            return json.loads(data)
        except:
            return data
    return data

def _process_uploaded_document(submission_id, filename, file_path, doc_type, is_priority):
    """Process uploaded document and store in database"""
    try:
        # Basic file metadata
        file_size = os.path.getsize(file_path)
        file_ext = os.path.splitext(filename)[1].lower()
        
        # Determine page count (basic estimation)
        page_count = 1
        if file_ext == '.pdf':
            try:
                # Try PyPDF2 first, then fallback to basic estimation
                try:
                    import PyPDF2
                    with open(file_path, 'rb') as f:
                        pdf_reader = PyPDF2.PdfReader(f)
                        page_count = len(pdf_reader.pages)
                except ImportError:
                    # Fallback: estimate based on file size (rough approximation)
                    page_count = max(1, file_size // 50000)  # ~50KB per page estimate
            except:
                page_count = 1  # Default if all methods fail
        
        # Create document metadata
        doc_metadata = {
            "filename": filename,
            "file_size": file_size,
            "file_extension": file_ext,
            "upload_timestamp": datetime.now(timezone.utc).isoformat(),
            "uploaded_by": CURRENT_USER,
            "file_path": file_path
        }
        
        # Basic extracted data (can be enhanced later)
        extracted_data = {
            "file_path": file_path,
            "processing_status": "uploaded",
            "extraction_method": "manual_upload"
        }
        
        # Store in database
        with get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO documents (
                    submission_id, filename, document_type, page_count, 
                    is_priority, doc_metadata, extracted_data, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    submission_id,
                    filename,
                    doc_type,
                    page_count,
                    is_priority,
                    json.dumps(doc_metadata),
                    json.dumps(extracted_data),
                    datetime.now(timezone.utc)
                )
            )
            get_conn().commit()
            
    except Exception as e:
        raise Exception(f"Failed to process document: {str(e)}")

def _to_vector_literal(vec):
    if vec is None:
        return "NULL"
    return f"[{','.join(map(str, vec))}]"

# ─────────────────────── UI starts ──────────────────────────
st.title("📂 AI-Processed Submissions")

sub_df = load_submissions("TRUE", [])
st.subheader("Recent submissions")
st.dataframe(sub_df, use_container_width=True, hide_index=True)

label_map = {f"{r.applicant_name} – {str(r.id)[:8]}": r.id for r in sub_df.itertuples()}
label_selected = st.selectbox("Open submission:", list(label_map.keys()) or ["—"])
sub_id = label_map.get(label_selected)


if sub_id:
    st.divider()
    st.subheader(label_selected)
    
    # Account Type Selection
    st.radio(
        "Account Type",
        ["New Account", "Renewal"],
        horizontal=True,
        label_visibility="collapsed",
        key=f"account_type_{sub_id}"
    )

    # ------------------- pull AI originals -------------------
    with get_conn().cursor() as cur:
        cur.execute(
                """
                SELECT business_summary,
                       cyber_exposures,
                       nist_controls_summary,
                   bullet_point_summary,
                       ops_embedding,
                       controls_embedding,
                       naics_primary_code,
                       naics_primary_title,
                       naics_secondary_code,
                       naics_secondary_title,
                       industry_tags
                FROM submissions
            WHERE id = %s
            """,
            (sub_id,),
        )
        result = cur.fetchone()
        biz_sum, exp_sum, ctrl_sum, bullet_sum, ops_vec, ctrl_vec, naics_code, naics_title, naics_sec_code, naics_sec_title, industry_tags = result

    # ------------------- pull latest edits -------------------
    latest_edits = latest_edits_map(sub_id)

    # ------------------- Business Summary --------------------
    with st.expander("📊 Business Summary", expanded=True):
        if st.button("✏️ Edit", key=f"edit_biz_{sub_id}"):
            st.session_state[f"editing_biz_{sub_id}"] = True
        
        if st.session_state.get(f"editing_biz_{sub_id}", False):
            edited_biz = st.text_area(
                "Edit Business Summary",
                value=biz_sum or "",
                height=200,
                key=f"biz_edit_{sub_id}"
            )
            col1, col2 = st.columns(2)
            with col1:
                if st.button("💾 Save", key=f"save_biz_{sub_id}"):
                    with get_conn() as conn:
                        conn.execute(
                            text("UPDATE submissions SET business_summary = :summary WHERE id = :sub_id"),
                            {"summary": edited_biz, "sub_id": sub_id}
                        )
                        conn.commit()
                    st.session_state[f"editing_biz_{sub_id}"] = False
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_biz_{sub_id}"):
                    st.session_state[f"editing_biz_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(biz_sum or "No business summary available")
            
        # Industry Classification
        if naics_code and naics_title:
            st.text(f"Primary: {naics_code} - {naics_title}")
        if naics_sec_code and naics_sec_title:
            st.text(f"Secondary: {naics_sec_code} - {naics_sec_title}")
        if industry_tags:
            st.text(f"Industry Tags: {', '.join(industry_tags)}")
    
    # ------------------- Exposure Summary --------------------
    with st.expander("⚠️ Exposure Summary", expanded=True):
        if st.button("✏️ Edit", key=f"edit_exp_{sub_id}"):
            st.session_state[f"editing_exp_{sub_id}"] = True
        
        if st.session_state.get(f"editing_exp_{sub_id}", False):
            edited_exp = st.text_area(
                "Edit Exposure Summary",
                value=exp_sum or "",
                height=200,
                key=f"exp_edit_{sub_id}"
            )
            col1, col2 = st.columns(2)
            with col1:
                if st.button("💾 Save", key=f"save_exp_{sub_id}"):
                    with get_conn() as conn:
                        conn.execute(
                            text("UPDATE submissions SET cyber_exposures = :summary WHERE id = :sub_id"),
                            {"summary": edited_exp, "sub_id": sub_id}
                        )
                        conn.commit()
                    st.session_state[f"editing_exp_{sub_id}"] = False
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_exp_{sub_id}"):
                    st.session_state[f"editing_exp_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(exp_sum or "No exposure summary available")
    
    # ------------------- NIST Controls Summary --------------------
    with st.expander("🔐 NIST Controls Summary", expanded=True):
        if st.button("✏️ Edit", key=f"edit_ctrl_{sub_id}"):
            st.session_state[f"editing_ctrl_{sub_id}"] = True
        
        if st.session_state.get(f"editing_ctrl_{sub_id}", False):
            edited_ctrl = st.text_area(
                "Edit NIST Controls Summary",
                value=ctrl_sum or "",
                height=300,
                key=f"ctrl_edit_{sub_id}"
            )
            col1, col2 = st.columns(2)
            with col1:
                if st.button("💾 Save", key=f"save_ctrl_{sub_id}"):
                    with get_conn() as conn:
                        conn.execute(
                            text("UPDATE submissions SET nist_controls_summary = :summary WHERE id = :sub_id"),
                            {"summary": edited_ctrl, "sub_id": sub_id}
                        )
                        conn.commit()
                    st.session_state[f"editing_ctrl_{sub_id}"] = False
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_ctrl_{sub_id}"):
                    st.session_state[f"editing_ctrl_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(ctrl_sum or "No NIST controls summary available")
    
    # ------------------- Bullet Point Summary --------------------
    with st.expander("📌 Bullet Point Summary", expanded=True):
        if st.button("✏️ Edit", key=f"edit_bullet_{sub_id}"):
            st.session_state[f"editing_bullet_{sub_id}"] = True
        
        if st.session_state.get(f"editing_bullet_{sub_id}", False):
            edited_bullet = st.text_area(
                "Edit Bullet Point Summary",
                value=bullet_sum or "",
                height=300,
                key=f"bullet_edit_{sub_id}"
            )
            col1, col2 = st.columns(2)
            with col1:
                if st.button("💾 Save", key=f"save_bullet_{sub_id}"):
                    with get_conn() as conn:
                        conn.execute(
                            text("UPDATE submissions SET bullet_point_summary = :summary WHERE id = :sub_id"),
                            {"summary": edited_bullet, "sub_id": sub_id}
                        )
                        conn.commit()
                    st.session_state[f"editing_bullet_{sub_id}"] = False
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_bullet_{sub_id}"):
                    st.session_state[f"editing_bullet_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(bullet_sum or "No bullet point summary available")
    
    # ------------------- AI Recommendation --------------------
    with st.expander("🤖 AI Recommendation", expanded=True):
        try:
            from guideline_rag import get_ai_decision
            if biz_sum or exp_sum or ctrl_sum:
                result = get_ai_decision(biz_sum, exp_sum, ctrl_sum)
                st.markdown(result["answer"])
                if result.get("citations"):
                    st.markdown("**Citations:**")
                    for citation in result["citations"]:
                        st.markdown(f"- {citation}")
            else:
                st.info("No data available for AI recommendation")
        except Exception as e:
            st.error(f"Error generating AI recommendation: {e}")
    
    # ------------------- Underwriter Decision & AI Chat --------------------
    with st.expander("👤 Underwriter Decision & AI Chat", expanded=True):
        # Underwriter Decision Section
        st.markdown("**Underwriter Decision**")
        if st.button("✏️ Edit", key=f"edit_underwriter_{sub_id}"):
            st.session_state[f"editing_underwriter_{sub_id}"] = True
        
        if st.session_state.get(f"editing_underwriter_{sub_id}", False):
            edited_decision = st.text_area(
                "Edit Underwriter Decision",
                value="",
                height=200,
                key=f"underwriter_edit_{sub_id}"
            )
            col1, col2 = st.columns(2)
            with col1:
                if st.button("💾 Save", key=f"save_underwriter_{sub_id}"):
                    # Save underwriter decision logic here
                    st.session_state[f"editing_underwriter_{sub_id}"] = False
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_underwriter_{sub_id}"):
                    st.session_state[f"editing_underwriter_{sub_id}"] = False
                    st.rerun()
        else:
            st.info("No underwriter decision recorded yet")
        
        st.divider()
        
        # AI Chat Section
        st.markdown("**🤖 AI Chat Assistant**")
        
        # Initialize chat history
        if 'chat_history' not in st.session_state:
            st.session_state.chat_history = []
        
        # Display chat history
        for message in st.session_state.chat_history:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])
        
        # Chat input
        if prompt := st.chat_input("Ask about this submission..."):
            # Add user message to history
            st.session_state.chat_history.append({"role": "user", "content": prompt})
            
            # Display user message
            with st.chat_message("user"):
                st.markdown(prompt)
            
            # Get AI response
            with st.chat_message("assistant"):
                with st.spinner("Thinking..."):
                    try:
                        from guideline_rag import get_chat_response
                        use_internet = st.checkbox("🌐 Enable internet search", key="internet_search")
                        response = get_chat_response(
                            prompt, 
                            sub_id, 
                            st.session_state.chat_history,
                            use_internet
                        )
                        st.markdown(response)
                        
                        # Add AI response to history
                        st.session_state.chat_history.append({"role": "assistant", "content": response})
                    except Exception as e:
                        st.error(f"❌ Error getting AI response: {e}")

    # ------------------- Similar Submissions --------------------
    st.markdown("**Similar Submissions**")
    
sim_mode = st.radio(
        "Similarity Search Options",
    ("None", "Business operations", "Controls (NIST)", "Operations & NIST"),
    horizontal=True,
    key="sim_mode",
        label_visibility="collapsed"
)

if sim_mode != "None":
    if ops_vec is None and ctrl_vec is None:
        st.info("No embeddings available for similarity search. Please ensure the submission has been processed with embeddings.")
    else:
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
                WHERE id <> %s
                ORDER BY dist
                LIMIT 10
                """,
                [Vector(q_vec), sub_id],
            )
            rows = cur.fetchall()

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

    # ------------------- documents section -----------------------
    st.subheader("Documents")
    
    # Document upload section
    with st.expander("📁 Upload New Documents", expanded=False):
        st.markdown("**Upload documents for this submission**")
        
        # Get submission details for folder structure
        with get_conn().cursor() as cur:
            cur.execute(
                "SELECT applicant_name FROM submissions WHERE id = %s",
                (sub_id,)
            )
            result = cur.fetchone()
            company_name = result[0] if result else "unknown"
        
        # Create company folder path
        company_folder = f"fixtures/{company_name.lower().replace(' ', '_').replace('.', '').replace(',', '')}"
        os.makedirs(company_folder, exist_ok=True)
        
        # File uploader
        uploaded_files = st.file_uploader(
            "Choose files to upload",
            accept_multiple_files=True,
            type=['pdf', 'txt', 'doc', 'docx', 'json'],
            key=f"upload_{sub_id}"
        )
        
        if uploaded_files:
            col1, col2 = st.columns([1, 1])
            
            with col1:
                doc_type = st.selectbox(
                    "Document Type",
                    ["Submission Email", "Application Form", "Questionnaire/Form", "Loss Run", "Other"],
                    key=f"doc_type_{sub_id}"
                )
            
            with col2:
                is_priority = st.checkbox("Priority Document", key=f"priority_{sub_id}")
            
            if st.button("Upload Documents", key=f"upload_btn_{sub_id}"):
                for uploaded_file in uploaded_files:
                    try:
                        # Save file to company folder
                        file_path = os.path.join(company_folder, uploaded_file.name)
                        with open(file_path, "wb") as f:
                            f.write(uploaded_file.getbuffer())
                        
                        # Process and store in database
                        _process_uploaded_document(
                            sub_id, 
                            uploaded_file.name, 
                            file_path, 
                            doc_type, 
                            is_priority
                        )
                        
                        st.success(f"✅ Uploaded: {uploaded_file.name}")
                        
                    except Exception as e:
                        st.error(f"❌ Error uploading {uploaded_file.name}: {str(e)}")
                
                st.rerun()
    
    # Display existing documents
    docs = load_documents(sub_id)
    if docs.empty:
        st.info("No documents found for this submission")
    else:
        st.write(f"Found {len(docs)} documents")
        for _, r in docs.iterrows():
            with st.expander(f"{r['filename']} – {r['document_type']}"):
                st.write(f"Pages: {r['page_count']} | Priority: {r['is_priority']}")
                st.markdown("**Metadata**")
                st.json(_safe_json(r["doc_metadata"]))
                st.markdown("**Extracted Data (truncated)**")
                st.json(_safe_json(r["extracted_data"]))

    # ------------------- feedback history --------------------
    with st.expander("🔎 Feedback History"):
        hist_df = pd.read_sql(
            """
            SELECT section, feedback_label, comment, created_at, user_id
            FROM submission_feedback
            WHERE submission_id = %s
            ORDER BY created_at DESC
            LIMIT 20
            """,
            get_conn(),
            params=[sub_id],
        )
        if not hist_df.empty:
            st.dataframe(hist_df, use_container_width=True, hide_index=True)
        else:
            st.info("No feedback history available")

    # ------------------- quote generation --------------------
    st.subheader("Generate Quote Draft")
    if st.button("Generate Quote", key=f"quote_{sub_id}"):
        with st.spinner("Generating quote..."):
            try:
                # Get submission data for quote
                with get_conn().cursor() as cur:
                    cur.execute(
                        """
                        SELECT applicant_name, business_summary, annual_revenue, naics_primary_title
                        FROM submissions
                        WHERE id = %s
                        """,
                        (sub_id,),
                    )
                    sub_data = cur.fetchone()
                
                if sub_data:
                    quote_data = {
                        "applicant_name": sub_data[0],
                        "business_summary": sub_data[1],
                        "annual_revenue": sub_data[2],
                        "industry": sub_data[3],
                        "quote_date": datetime.now().strftime("%Y-%m-%d"),
                    }
                    
                    # Generate quote using rating engine
                    quote_result = rate_quote(quote_data)
                    
                    # Render PDF
                    pdf_path = _render_quote_pdf(quote_result)
                    
                    # Upload to storage
                    pdf_url = _upload_pdf(pdf_path)
                    
                    # Save quote record
                    quote_id = _save_quote_row(sub_id, quote_result, pdf_url)
                    
                    st.success(f"Quote generated successfully! ID: {quote_id}")
                    st.markdown(f"[📥 Download Quote PDF]({pdf_url})")
                    
                    # Clean up temp file
                    pdf_path.unlink()
                else:
                    st.error("Could not load submission data for quote generation")
            except Exception as e:
                st.error(f"Error generating quote: {e}")