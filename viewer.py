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

st.set_page_config(page_title="Submission Viewer", layout="wide")

DATABASE_URL = os.getenv("DATABASE_URL")
CURRENT_USER = st.session_state.get("current_user", os.getenv("USER", "unknown"))

# ░░░░░░░░░░░░░░  QUOTE HELPERS  ░░░░░░░░░░░░░░░
from rating_engine.engine import price as rate_quote, price_with_breakdown
from app.pipeline import parse_controls_from_summary

def map_industry_to_slug(industry_name):
    """Map NAICS industry names to rating engine slugs"""
    industry_mapping = {
        "Media Buying Agencies": "Advertising_Marketing_Technology",
        "Advertising Agencies": "Advertising_Marketing_Technology", 
        "Marketing Consultants": "Advertising_Marketing_Technology",
        "Software Publishers": "Software_as_a_Service_SaaS",
        "Computer Systems Design Services": "Professional_Services_Consulting",
        "Management Consultants": "Professional_Services_Consulting",
        # Add more mappings as needed
    }
    return industry_mapping.get(industry_name, "Professional_Services_Consulting")  # Default fallback

def parse_dollar_input(value_str):
    """Parse dollar input with M/K suffixes (e.g., '1M' -> 1000000, '50K' -> 50000)"""
    if not value_str:
        return 0
    
    value_str = str(value_str).strip().upper()
    
    if value_str.endswith('M'):
        try:
            return int(float(value_str[:-1]) * 1_000_000)
        except:
            return 0
    elif value_str.endswith('K'):
        try:
            return int(float(value_str[:-1]) * 1_000)
        except:
            return 0
    else:
        try:
            return int(float(value_str))
        except:
            return 0

def format_dollar_display(value):
    """Format dollar value for display (e.g., 1000000 -> '1M', 50000 -> '50K')"""
    if value >= 1_000_000 and value % 1_000_000 == 0:
        return f"{value // 1_000_000}M"
    elif value >= 1_000 and value % 1_000 == 0:
        return f"{value // 1_000}K"
    else:
        return f"{value:,}"
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
               annual_revenue,
               naics_primary_title,
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

def load_submission(submission_id: str) -> pd.DataFrame:
    """Load a single submission with all details for comparison"""
    qry = """
    SELECT id, date_received, applicant_name, annual_revenue, naics_primary_title,
           naics_secondary_title, industry_tags, business_summary, cyber_exposures,
           nist_controls_summary, nist_controls, bullet_point_summary
    FROM submissions
    WHERE id = %s
    """
    return pd.read_sql(qry, get_conn(), params=[submission_id])

def _safe_json(data):
    if isinstance(data, str):
        try:
            return json.loads(data)
        except:
            return data
    return data

def format_nist_controls_list(nist_controls_json):
    """Format NIST controls JSON data as a labeled list, one per line"""
    if not nist_controls_json:
        return "No NIST controls available"
    
    try:
        # Parse JSON if it's a string
        if isinstance(nist_controls_json, str):
            controls_data = json.loads(nist_controls_json)
        else:
            controls_data = nist_controls_json
        
        # Extract labels and values and format as list
        if isinstance(controls_data, dict):
            # If it's a dict, show key: value pairs
            formatted_items = []
            for key, value in controls_data.items():
                if isinstance(value, list):
                    # If value is a list, show each item
                    for item in value:
                        if item:
                            formatted_items.append(f"• {key}: {item}")
                elif value:
                    formatted_items.append(f"• {key}: {value}")
            return '\n'.join(formatted_items) if formatted_items else "No NIST controls available"
        elif isinstance(controls_data, list):
            # If it's already a list, show with index or as-is
            formatted_items = []
            for i, item in enumerate(controls_data):
                if item:
                    if isinstance(item, dict):
                        # If list contains dicts, format each dict
                        for k, v in item.items():
                            formatted_items.append(f"• {k}: {v}")
                    else:
                        formatted_items.append(f"• Item {i+1}: {item}")
            return '\n'.join(formatted_items) if formatted_items else "No NIST controls available"
        else:
            return f"• Value: {controls_data}"
        
    except (json.JSONDecodeError, TypeError, AttributeError):
        return "Error parsing NIST controls data"

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
                # Try pypdf first, then fallback to basic estimation
                try:
                    import pypdf
                    with open(file_path, 'rb') as f:
                        pdf_reader = pypdf.PdfReader(f)
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

# Search and submission selection in same row
col1, col2 = st.columns([2, 1])

with col1:
    search_term = st.text_input("🔍 Search by company name", key="search_submissions", placeholder="Enter company name...")
    # Trigger rerun when search term changes
    if search_term != st.session_state.get("last_search_term", ""):
        st.session_state.last_search_term = search_term
        st.rerun()

with col2:
    # Load submissions with search filter
    if search_term:
        where_sql = "LOWER(applicant_name) LIKE LOWER(%s)"
        params = [f"%{search_term}%"]
    else:
        where_sql = "TRUE"
        params = []
    
    sub_df = load_submissions(where_sql, params)
    label_map = {f"{r.applicant_name} – {str(r.id)[:8]}": r.id for r in sub_df.itertuples()}
    label_selected = st.selectbox("Open submission:", list(label_map.keys()) or ["—"])
    sub_id = label_map.get(label_selected)

st.subheader("Recent submissions")

# Configure column display
column_config = {
    "id": st.column_config.TextColumn(
        "ID", 
        width="small",
        help="Submission ID (first 8 characters)"
    ),
    "date_received": st.column_config.DateColumn(
        "Date Received", 
        format="MM/DD/YYYY",
        width="small"
    ),
    "applicant_name": st.column_config.TextColumn(
        "Company Name", 
        width="medium"
    ),
    "annual_revenue": st.column_config.NumberColumn(
        "Revenue", 
        format="compact",
        width="small",
        help="Annual revenue in USD"
    ),
    "naics_primary_title": st.column_config.TextColumn(
        "Primary Industry", 
        width="medium"
    ),
    "industry_tags": st.column_config.ListColumn(
        "Industry Tags"
    )
}

# Format the ID column to show only first 8 characters
if not sub_df.empty and 'id' in sub_df.columns:
    sub_df_display = sub_df.copy()
    sub_df_display['id'] = sub_df_display['id'].astype(str).str[:8]
else:
    sub_df_display = sub_df

st.dataframe(
    sub_df_display, 
    use_container_width=True, 
    hide_index=True,
    column_config=column_config
)


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
                   industry_tags,
                   annual_revenue
            FROM submissions
            WHERE id = %s
            """,
            (sub_id,),
        )
        result = cur.fetchone()
        biz_sum, exp_sum, ctrl_sum, bullet_sum, ops_vec, ctrl_vec, naics_code, naics_title, naics_sec_code, naics_sec_title, industry_tags, annual_revenue = result

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
                    conn = get_conn()
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE submissions SET business_summary = %s WHERE id = %s",
                            (edited_biz, sub_id)
                        )
                        conn.commit()
                    
                    # Track the edit in feedback system
                    save_feedback(
                        submission_id=sub_id,
                        section="business_summary",
                        original_text=biz_sum or "",
                        edited_text=edited_biz,
                        feedback_label=None,
                        comment="Updated business_summary",
                        user_id=CURRENT_USER
                    )
                    
                    st.session_state[f"editing_biz_{sub_id}"] = False
                    st.success("✅ Business summary saved successfully!")
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_biz_{sub_id}"):
                    st.session_state[f"editing_biz_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(biz_sum or "No business summary available")
        
        st.divider()
        
        # Annual Revenue and Industry Classification
        all_lines = []
        
        # Add revenue line
        if annual_revenue:
            all_lines.append(f"**Annual Revenue:** ${annual_revenue:,.0f}")
        else:
            all_lines.append("**Annual Revenue:** Not specified")
            
        # Add industry lines
        if naics_code and naics_title:
            all_lines.append(f"**Primary:** {naics_code} - {naics_title}")
        if naics_sec_code and naics_sec_title:
            all_lines.append(f"**Secondary:** {naics_sec_code} - {naics_sec_title}")
        if industry_tags:
            all_lines.append(f"**Industry Tags:** {', '.join(industry_tags)}")
        
        if all_lines:
            st.markdown("  \n".join(all_lines))
    
    # ------------------- Exposure Summary --------------------
    with st.expander("⚠️ Exposure Summary", expanded=False):
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
                    conn = get_conn()
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE submissions SET cyber_exposures = %s WHERE id = %s",
                            (edited_exp, sub_id)
                        )
                        conn.commit()
                    
                    # Track the edit in feedback system
                    save_feedback(
                        submission_id=sub_id,
                        section="cyber_exposures",
                        original_text=exp_sum or "",
                        edited_text=edited_exp,
                        feedback_label=None,
                        comment="Updated cyber_exposures",
                        user_id=CURRENT_USER
                    )
                    
                    st.session_state[f"editing_exp_{sub_id}"] = False
                    st.success("✅ Exposure summary saved successfully!")
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_exp_{sub_id}"):
                    st.session_state[f"editing_exp_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(exp_sum or "No exposure summary available")
    
    # ------------------- NIST Controls Summary --------------------
    with st.expander("🔐 NIST Controls Summary", expanded=False):
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
                    conn = get_conn()
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE submissions SET nist_controls_summary = %s WHERE id = %s",
                            (edited_ctrl, sub_id)
                        )
                        conn.commit()
                    
                    # Track the edit in feedback system
                    save_feedback(
                        submission_id=sub_id,
                        section="nist_controls_summary",
                        original_text=ctrl_sum or "",
                        edited_text=edited_ctrl,
                        feedback_label=None,
                        comment="Updated nist_controls_summary",
                        user_id=CURRENT_USER
                    )
                    
                    st.session_state[f"editing_ctrl_{sub_id}"] = False
                    st.success("✅ NIST controls summary saved successfully!")
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_ctrl_{sub_id}"):
                    st.session_state[f"editing_ctrl_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(ctrl_sum or "No NIST controls summary available")
    
    # ------------------- Bullet Point Summary --------------------
    with st.expander("📌 Bullet Point Summary", expanded=False):
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
                    conn = get_conn()
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE submissions SET bullet_point_summary = %s WHERE id = %s",
                            (edited_bullet, sub_id)
                        )
                        conn.commit()
                    
                    # Track the edit in feedback system
                    save_feedback(
                        submission_id=sub_id,
                        section="bullet_point_summary",
                        original_text=bullet_sum or "",
                        edited_text=edited_bullet,
                        feedback_label=None,
                        comment="Updated bullet_point_summary",
                        user_id=CURRENT_USER
                    )
                    
                    st.session_state[f"editing_bullet_{sub_id}"] = False
                    st.success("✅ Bullet point summary saved successfully!")
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_bullet_{sub_id}"):
                    st.session_state[f"editing_bullet_{sub_id}"] = False
                    st.rerun()
        else:
            st.markdown(bullet_sum or "No bullet point summary available")
    
    # ------------------- Underwriter Decision --------------------
    with st.expander("👤 Underwriter Decision", expanded=False):
        if st.button("✏️ Edit", key=f"edit_underwriter_{sub_id}"):
            st.session_state[f"editing_underwriter_{sub_id}"] = True
        
        if st.session_state.get(f"editing_underwriter_{sub_id}", False):
            # Get existing decision from session state (like other sections get from DB)
            uw_decision = st.session_state.get(f"underwriter_decision_{sub_id}", "")
            edited_decision = st.text_area(
                "Edit Underwriter Decision",
                value=uw_decision or "",
                height=200,
                key=f"underwriter_edit_{sub_id}"
            )
            col1, col2 = st.columns(2)
            with col1:
                if st.button("💾 Save", key=f"save_underwriter_{sub_id}"):
                    # Store in session state (TODO: add to database later)
                    st.session_state[f"underwriter_decision_{sub_id}"] = edited_decision
                    
                    # Track the edit in feedback system (like other sections)
                    save_feedback(
                        submission_id=sub_id,
                        section="underwriter_decision",
                        original_text=uw_decision or "",
                        edited_text=edited_decision,
                        feedback_label=None,
                        comment="Updated underwriter_decision",
                        user_id=CURRENT_USER
                    )
                    
                    st.session_state[f"editing_underwriter_{sub_id}"] = False
                    st.success("✅ Underwriter decision saved successfully!")
                    st.rerun()
            with col2:
                if st.button("❌ Cancel", key=f"cancel_underwriter_{sub_id}"):
                    st.session_state[f"editing_underwriter_{sub_id}"] = False
                    st.rerun()
        else:
            # Display current decision (like other sections display their content)
            uw_decision = st.session_state.get(f"underwriter_decision_{sub_id}")
            st.markdown(uw_decision or "No underwriter decision available")

    # ------------------- AI Recommendation --------------------
    with st.expander("🤖 AI Recommendation", expanded=False):
        # Check if we already have a cached recommendation for this submission
        cache_key = f"ai_recommendation_{sub_id}"
        
        if cache_key in st.session_state:
            # Use cached result
            cached_result = st.session_state[cache_key]
            st.markdown(cached_result["answer"])
            if cached_result.get("citations"):
                st.markdown("**Citations:**")
                for citation in cached_result["citations"]:
                    st.markdown(f"- {citation}")
            st.info("ℹ️ Using cached recommendation")
        else:
            # Generate new recommendation
            if st.button("🔄 Generate AI Recommendation", key=f"generate_ai_rec_{sub_id}"):
                try:
                    from guideline_rag import get_ai_decision
                    if biz_sum or exp_sum or ctrl_sum:
                        with st.spinner("Generating AI recommendation..."):
                            result = get_ai_decision(biz_sum, exp_sum, ctrl_sum)
                            # Cache the result
                            st.session_state[cache_key] = result
                            st.markdown(result["answer"])
                            if result.get("citations"):
                                st.markdown("**Citations:**")
                                for citation in result["citations"]:
                                    st.markdown(f"- {citation}")
                            st.success("✅ AI recommendation generated!")
                            st.rerun()
                    else:
                        st.info("No data available for AI recommendation")
                except Exception as e:
                    st.error(f"Error generating AI recommendation: {e}")
            else:
                st.info("Click the button above to generate an AI recommendation for this submission.")
    
    # ------------------- AI Chat --------------------
    with st.expander("🤖 AI Chat Assistant", expanded=False):
        # Initialize chat history
        if 'chat_history' not in st.session_state:
            st.session_state.chat_history = []
        
        # Chat input at the top
        if prompt := st.chat_input("Ask about this submission..."):
            # Add user message to history
            st.session_state.chat_history.append({"role": "user", "content": prompt})
            
            # Get AI response
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
                    
                    # Add AI response to history
                    st.session_state.chat_history.append({"role": "assistant", "content": response})
                except Exception as e:
                    error_msg = f"❌ Error getting AI response: {e}"
                    st.session_state.chat_history.append({"role": "assistant", "content": error_msg})
            
            # Rerun to refresh the display
            st.rerun()
        
        # Display chat history in reverse order (most recent at top)
        if st.session_state.chat_history:
            st.divider()
            for message in reversed(st.session_state.chat_history):
                with st.chat_message(message["role"]):
                    st.markdown(message["content"])

    # ------------------- Rating --------------------
    with st.expander("⭐ Rate & Quote", expanded=False):
        # Get submission data for both preview and quote generation
        with get_conn().cursor() as cur:
            cur.execute(
                """
                SELECT applicant_name, business_summary, annual_revenue, naics_primary_title, 
                       bullet_point_summary, nist_controls_summary
                FROM submissions
                WHERE id = %s
                """,
                (sub_id,),
            )
            sub_data = cur.fetchone()
        
        if sub_data:
            # Check if revenue exists
            if sub_data[2] is not None:  # Revenue exists
                # Map industry name to rating engine slug
                industry_slug = map_industry_to_slug(sub_data[3])
                
                # Rating Preview Section
                st.markdown("#### 🔍 Rating Preview")
                
                # Policy Configuration
                config_col1, config_col2 = st.columns([1, 1])
                
                with config_col1:
                    st.markdown("**Policy Limit:**")
                    # Left-aligned buttons with proper spacing
                    button_cols = st.columns([1, 1, 1, 1, 4])  # Last column takes remaining space
                    
                    with button_cols[0]:
                        if st.button("$1M", key=f"limit_1m_{sub_id}"):
                            st.session_state[f"selected_limit_{sub_id}"] = 1_000_000
                            st.session_state[f"selected_limit_text_{sub_id}"] = "1M"
                            st.rerun()
                    with button_cols[1]:
                        if st.button("$2M", key=f"limit_2m_{sub_id}"):
                            st.session_state[f"selected_limit_{sub_id}"] = 2_000_000
                            st.session_state[f"selected_limit_text_{sub_id}"] = "2M"
                            st.rerun()
                    with button_cols[2]:
                        if st.button("$3M", key=f"limit_3m_{sub_id}"):
                            st.session_state[f"selected_limit_{sub_id}"] = 3_000_000
                            st.session_state[f"selected_limit_text_{sub_id}"] = "3M"
                            st.rerun()
                    with button_cols[3]:
                        if st.button("$5M", key=f"limit_5m_{sub_id}"):
                            st.session_state[f"selected_limit_{sub_id}"] = 5_000_000
                            st.session_state[f"selected_limit_text_{sub_id}"] = "5M"
                            st.rerun()
                    
                    # Get current values
                    current_limit = st.session_state.get(f"selected_limit_{sub_id}", 2_000_000)
                    current_limit_text = st.session_state.get(f"selected_limit_text_{sub_id}", "2M")
                    
                    # Text input for limit with M/K formatting
                    limit_input = st.text_input(
                        "Policy Limit (e.g., 2M, 500K)",
                        value=current_limit_text,
                        key=f"limit_text_input_{sub_id}",
                        help="Enter limit using M for millions (2M = $2,000,000) or K for thousands (500K = $500,000)"
                    )
                    
                    # Parse and update limit
                    parsed_limit = parse_dollar_input(limit_input)
                    if parsed_limit > 0:
                        st.session_state[f"selected_limit_{sub_id}"] = parsed_limit
                        selected_limit = parsed_limit
                        st.caption(f"Parsed as: ${parsed_limit:,}")
                    else:
                        selected_limit = current_limit
                        if limit_input.strip():
                            st.error("Invalid format. Use: 2M, 500K, or 2000000")
                
                with config_col2:
                    st.markdown("**Retention/Deductible:**")
                    # Left-aligned buttons with proper spacing
                    ret_button_cols = st.columns([1, 1, 1, 1, 1, 1, 2])  # Last column takes remaining space
                    
                    with ret_button_cols[0]:
                        if st.button("$10K", key=f"ret_10k_{sub_id}"):
                            st.session_state[f"selected_retention_{sub_id}"] = 10_000
                            st.session_state[f"selected_retention_text_{sub_id}"] = "10K"
                            st.rerun()
                    with ret_button_cols[1]:
                        if st.button("$25K", key=f"ret_25k_{sub_id}"):
                            st.session_state[f"selected_retention_{sub_id}"] = 25_000
                            st.session_state[f"selected_retention_text_{sub_id}"] = "25K"
                            st.rerun()
                    with ret_button_cols[2]:
                        if st.button("$50K", key=f"ret_50k_{sub_id}"):
                            st.session_state[f"selected_retention_{sub_id}"] = 50_000
                            st.session_state[f"selected_retention_text_{sub_id}"] = "50K"
                            st.rerun()
                    with ret_button_cols[3]:
                        if st.button("$100K", key=f"ret_100k_{sub_id}"):
                            st.session_state[f"selected_retention_{sub_id}"] = 100_000
                            st.session_state[f"selected_retention_text_{sub_id}"] = "100K"
                            st.rerun()
                    with ret_button_cols[4]:
                        if st.button("$250K", key=f"ret_250k_{sub_id}"):
                            st.session_state[f"selected_retention_{sub_id}"] = 250_000
                            st.session_state[f"selected_retention_text_{sub_id}"] = "250K"
                            st.rerun()
                    with ret_button_cols[5]:
                        if st.button("$500K", key=f"ret_500k_{sub_id}"):
                            st.session_state[f"selected_retention_{sub_id}"] = 500_000
                            st.session_state[f"selected_retention_text_{sub_id}"] = "500K"
                            st.rerun()
                    
                    # Get current values
                    current_retention = st.session_state.get(f"selected_retention_{sub_id}", 25_000)
                    current_retention_text = st.session_state.get(f"selected_retention_text_{sub_id}", "25K")
                    
                    # Text input for retention with M/K formatting
                    retention_input = st.text_input(
                        "Retention Amount (e.g., 25K, 100K)",
                        value=current_retention_text,
                        key=f"retention_text_input_{sub_id}",
                        help="Enter retention using K for thousands (25K = $25,000) or full amount (25000)"
                    )
                    
                    # Parse and update retention
                    parsed_retention = parse_dollar_input(retention_input)
                    if parsed_retention > 0:
                        st.session_state[f"selected_retention_{sub_id}"] = parsed_retention
                        selected_retention = parsed_retention
                        st.caption(f"Parsed as: ${parsed_retention:,}")
                    else:
                        selected_retention = current_retention
                        if retention_input.strip():
                            st.error("Invalid format. Use: 25K, 100K, or 25000")
                
                # Auto-generate rating preview
                try:
                    # Parse controls from bullet and NIST summaries
                    bullet_summary = sub_data[4] or ""  # bullet_point_summary
                    nist_summary = sub_data[5] or ""    # nist_controls_summary
                    parsed_controls = parse_controls_from_summary(bullet_summary, nist_summary)
                    
                    quote_data = {
                        "industry": industry_slug,
                        "revenue": sub_data[2],
                        "limit": selected_limit,
                        "retention": selected_retention,
                        "controls": parsed_controls,
                    }
                    
                    # Get detailed rating breakdown
                    rating_result = price_with_breakdown(quote_data)
                    breakdown = rating_result["breakdown"]
                    
                    # Display premium prominently
                    st.markdown("---")
                    col_prem, col_info = st.columns([1, 2])
                    
                    with col_prem:
                        st.metric("Annual Premium", f"${rating_result['premium']:,}", help="Based on current configuration")
                    
                    with col_info:
                        st.info(f"Policy: ${selected_limit:,} limit / ${selected_retention:,} retention • Hazard Class: {breakdown['hazard_class']} • Rate: ${breakdown['base_rate_per_1k']:.2f} per $1K revenue")
                    
                    # Rating assumptions in expander
                    with st.expander("📋 View Detailed Rating Breakdown", expanded=False):
                        col_left, col_right = st.columns([1, 1])
                        
                        with col_left:
                            st.markdown(f"**Industry:** {breakdown['industry'].replace('_', ' ')}")
                            st.markdown(f"**Hazard Class:** {breakdown['hazard_class']} (1=lowest risk, 5=highest)")
                            st.markdown(f"**Revenue Band:** {breakdown['revenue_band']}")
                            st.markdown(f"**Base Rate:** ${breakdown['base_rate_per_1k']:.2f} per $1K revenue")
                        
                        with col_right:
                            st.markdown(f"**Policy Limit:** ${rating_result['limit']:,}")
                            st.markdown(f"**Limit Factor:** {breakdown['limit_factor']:.2f}x")
                            st.markdown(f"**Retention/Deductible:** ${rating_result['retention']:,}")
                            st.markdown(f"**Retention Factor:** {breakdown['retention_factor']:.2f}x")
                        
                        # Show control modifiers if any
                        if breakdown['control_modifiers']:
                            st.markdown("**Control Adjustments:**")
                            for mod in breakdown['control_modifiers']:
                                modifier_pct = mod['modifier'] * 100
                                sign = "+" if modifier_pct > 0 else ""
                                st.markdown(f"• {mod['reason']}: {sign}{modifier_pct:.1f}%")
                        else:
                            st.markdown("**Control Adjustments:** None applied")
                        
                        # Show calculation steps
                        st.markdown("**Premium Calculation:**")
                        st.markdown(f"1. Base Premium: ${breakdown['base_premium']:,.0f}")
                        st.markdown(f"2. After Limit Factor: ${breakdown['premium_after_limit']:,.0f}")
                        st.markdown(f"3. After Retention Factor: ${breakdown['premium_after_retention']:,.0f}")
                        st.markdown(f"4. After Control Adjustments: ${breakdown['premium_after_controls']:,.0f}")
                        st.markdown(f"5. **Final Premium (rounded):** ${breakdown['final_premium']:,}")
                
                except Exception as e:
                    st.error(f"Error calculating premium: {e}")
            
            else:  # Revenue missing
                st.markdown("#### 🔍 Rating Preview")
                st.warning("Annual revenue is required for rating preview.")
                
                # Revenue input line below the warning
                rev_col1, rev_col2 = st.columns([3, 1])
                
                with rev_col1:
                    revenue_input = st.text_input(
                        "Annual Revenue (enter amount like: 1M, 500K, or 1000000)",
                        value="1M",
                        key=f"preview_revenue_text_{sub_id}",
                        help="Enter revenue using M for millions (1M = $1,000,000) or K for thousands (500K = $500,000)"
                    )
                    preview_revenue = parse_dollar_input(revenue_input)
                    if preview_revenue > 0:
                        st.caption(f"Parsed as: ${preview_revenue:,}")
                    else:
                        st.error("Invalid format. Use: 1M, 500K, or 1000000")
                
                with rev_col2:
                    if st.button("💾 Save to DB", key=f"save_revenue_inline_{sub_id}", help="Save revenue to database"):
                        if preview_revenue > 0:
                            try:
                                conn = get_conn()
                                with conn.cursor() as cur:
                                    cur.execute(
                                        "UPDATE submissions SET annual_revenue = %s WHERE id = %s",
                                        (preview_revenue, sub_id)
                                    )
                                    conn.commit()
                                st.success("Saved!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"Error: {e}")
                        else:
                            st.error("Enter valid revenue first")
                
                # Policy Configuration - same layout as above
                config_col1, config_col2 = st.columns([1, 1])
                
                with config_col1:
                    st.markdown("**Policy Limit:**")
                    # Left-aligned buttons with proper spacing
                    button_cols_temp = st.columns([1, 1, 1, 1, 4])
                    
                    with button_cols_temp[0]:
                        if st.button("$1M", key=f"limit_1m_temp_{sub_id}"):
                            st.session_state[f"selected_limit_temp_{sub_id}"] = 1_000_000
                            st.session_state[f"selected_limit_temp_text_{sub_id}"] = "1M"
                            st.rerun()
                    with button_cols_temp[1]:
                        if st.button("$2M", key=f"limit_2m_temp_{sub_id}"):
                            st.session_state[f"selected_limit_temp_{sub_id}"] = 2_000_000
                            st.session_state[f"selected_limit_temp_text_{sub_id}"] = "2M"
                            st.rerun()
                    with button_cols_temp[2]:
                        if st.button("$3M", key=f"limit_3m_temp_{sub_id}"):
                            st.session_state[f"selected_limit_temp_{sub_id}"] = 3_000_000
                            st.session_state[f"selected_limit_temp_text_{sub_id}"] = "3M"
                            st.rerun()
                    with button_cols_temp[3]:
                        if st.button("$5M", key=f"limit_5m_temp_{sub_id}"):
                            st.session_state[f"selected_limit_temp_{sub_id}"] = 5_000_000
                            st.session_state[f"selected_limit_temp_text_{sub_id}"] = "5M"
                            st.rerun()
                    
                    # Get current values
                    current_limit_temp = st.session_state.get(f"selected_limit_temp_{sub_id}", 2_000_000)
                    current_limit_temp_text = st.session_state.get(f"selected_limit_temp_text_{sub_id}", "2M")
                    
                    # Text input for limit with M/K formatting
                    limit_input_temp = st.text_input(
                        "Policy Limit (e.g., 2M, 500K)",
                        value=current_limit_temp_text,
                        key=f"limit_text_input_temp_{sub_id}",
                        help="Enter limit using M for millions (2M = $2,000,000) or K for thousands (500K = $500,000)"
                    )
                    
                    # Parse and update limit
                    parsed_limit_temp = parse_dollar_input(limit_input_temp)
                    if parsed_limit_temp > 0:
                        st.session_state[f"selected_limit_temp_{sub_id}"] = parsed_limit_temp
                        selected_limit_temp = parsed_limit_temp
                        st.caption(f"Parsed as: ${parsed_limit_temp:,}")
                    else:
                        selected_limit_temp = current_limit_temp
                        if limit_input_temp.strip():
                            st.error("Invalid format. Use: 2M, 500K, or 2000000")
                
                with config_col2:
                    st.markdown("**Retention/Deductible:**")
                    # Left-aligned buttons with proper spacing
                    ret_button_cols_temp = st.columns([1, 1, 1, 1, 1, 1, 2])
                    
                    with ret_button_cols_temp[0]:
                        if st.button("$10K", key=f"ret_10k_temp_{sub_id}"):
                            st.session_state[f"selected_retention_temp_{sub_id}"] = 10_000
                            st.session_state[f"selected_retention_temp_text_{sub_id}"] = "10K"
                            st.rerun()
                    with ret_button_cols_temp[1]:
                        if st.button("$25K", key=f"ret_25k_temp_{sub_id}"):
                            st.session_state[f"selected_retention_temp_{sub_id}"] = 25_000
                            st.session_state[f"selected_retention_temp_text_{sub_id}"] = "25K"
                            st.rerun()
                    with ret_button_cols_temp[2]:
                        if st.button("$50K", key=f"ret_50k_temp_{sub_id}"):
                            st.session_state[f"selected_retention_temp_{sub_id}"] = 50_000
                            st.session_state[f"selected_retention_temp_text_{sub_id}"] = "50K"
                            st.rerun()
                    with ret_button_cols_temp[3]:
                        if st.button("$100K", key=f"ret_100k_temp_{sub_id}"):
                            st.session_state[f"selected_retention_temp_{sub_id}"] = 100_000
                            st.session_state[f"selected_retention_temp_text_{sub_id}"] = "100K"
                            st.rerun()
                    with ret_button_cols_temp[4]:
                        if st.button("$250K", key=f"ret_250k_temp_{sub_id}"):
                            st.session_state[f"selected_retention_temp_{sub_id}"] = 250_000
                            st.session_state[f"selected_retention_temp_text_{sub_id}"] = "250K"
                            st.rerun()
                    with ret_button_cols_temp[5]:
                        if st.button("$500K", key=f"ret_500k_temp_{sub_id}"):
                            st.session_state[f"selected_retention_temp_{sub_id}"] = 500_000
                            st.session_state[f"selected_retention_temp_text_{sub_id}"] = "500K"
                            st.rerun()
                    
                    # Get current values
                    current_retention_temp = st.session_state.get(f"selected_retention_temp_{sub_id}", 25_000)
                    current_retention_temp_text = st.session_state.get(f"selected_retention_temp_text_{sub_id}", "25K")
                    
                    # Text input for retention with M/K formatting
                    retention_input_temp = st.text_input(
                        "Retention Amount (e.g., 25K, 100K)",
                        value=current_retention_temp_text,
                        key=f"retention_text_input_temp_{sub_id}",
                        help="Enter retention using K for thousands (25K = $25,000) or full amount (25000)"
                    )
                    
                    # Parse and update retention
                    parsed_retention_temp = parse_dollar_input(retention_input_temp)
                    if parsed_retention_temp > 0:
                        st.session_state[f"selected_retention_temp_{sub_id}"] = parsed_retention_temp
                        selected_retention_temp = parsed_retention_temp
                        st.caption(f"Parsed as: ${parsed_retention_temp:,}")
                    else:
                        selected_retention_temp = current_retention_temp
                        if retention_input_temp.strip():
                            st.error("Invalid format. Use: 25K, 100K, or 25000")
                
                # Auto-generate rating preview for temp scenario
                if preview_revenue > 0:
                    try:
                        industry_slug = map_industry_to_slug(sub_data[3])
                        # Parse controls from bullet and NIST summaries
                        bullet_summary = sub_data[4] or ""  # bullet_point_summary
                        nist_summary = sub_data[5] or ""    # nist_controls_summary
                        parsed_controls = parse_controls_from_summary(bullet_summary, nist_summary)
                        
                        quote_data = {
                            "industry": industry_slug,
                            "revenue": preview_revenue,
                            "limit": selected_limit_temp,
                            "retention": selected_retention_temp,
                            "controls": parsed_controls,
                        }
                        
                        rating_result = price_with_breakdown(quote_data)
                        breakdown = rating_result["breakdown"]
                        
                        # Display premium prominently
                        st.markdown("---")
                        col_prem, col_info, col_save = st.columns([1, 2, 1])
                        
                        with col_prem:
                            st.metric("Annual Premium", f"${rating_result['premium']:,}", help="Based on entered revenue")
                        
                        with col_info:
                            st.info(f"Using revenue: ${preview_revenue:,} • Policy: ${selected_limit_temp:,} / ${selected_retention_temp:,} • Hazard Class: {breakdown['hazard_class']}")
                        
                        with col_save:
                            st.write("")  # Empty space for alignment
                        
                        # Rating breakdown in expander
                        with st.expander("📋 View Detailed Rating Breakdown", expanded=False):
                            col_left, col_right = st.columns([1, 1])
                            
                            with col_left:
                                st.markdown(f"**Industry:** {breakdown['industry'].replace('_', ' ')}")
                                st.markdown(f"**Hazard Class:** {breakdown['hazard_class']} (1=lowest risk, 5=highest)")
                                st.markdown(f"**Revenue Band:** {breakdown['revenue_band']}")
                                st.markdown(f"**Base Rate:** ${breakdown['base_rate_per_1k']:.2f} per $1K revenue")
                            
                            with col_right:
                                st.markdown(f"**Policy Limit:** ${rating_result['limit']:,}")
                                st.markdown(f"**Limit Factor:** {breakdown['limit_factor']:.2f}x")
                                st.markdown(f"**Retention/Deductible:** ${rating_result['retention']:,}")
                                st.markdown(f"**Retention Factor:** {breakdown['retention_factor']:.2f}x")
                            
                            if breakdown['control_modifiers']:
                                st.markdown("**Control Adjustments:**")
                                for mod in breakdown['control_modifiers']:
                                    modifier_pct = mod['modifier'] * 100
                                    sign = "+" if modifier_pct > 0 else ""
                                    st.markdown(f"• {mod['reason']}: {sign}{modifier_pct:.1f}%")
                            else:
                                st.markdown("**Control Adjustments:** None applied")
                            
                            st.markdown("**Premium Calculation:**")
                            st.markdown(f"1. Base Premium: ${breakdown['base_premium']:,.0f}")
                            st.markdown(f"2. After Limit Factor: ${breakdown['premium_after_limit']:,.0f}")
                            st.markdown(f"3. After Retention Factor: ${breakdown['premium_after_retention']:,.0f}")
                            st.markdown(f"4. After Control Adjustments: ${breakdown['premium_after_controls']:,.0f}")
                            st.markdown(f"5. **Final Premium (rounded):** ${breakdown['final_premium']:,}")
                    
                    except Exception as e:
                        st.error(f"Error calculating premium: {e}")
        
        else:
            st.error("Could not load submission data")
        
        st.divider()
        
        # Quote Generation Section
        st.markdown("#### 💰 Generate Quote Draft")
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
                    
                    # Debug: Show what we got from database
                    st.write("Debug - Database data:", sub_data)
                    
                    if sub_data:
                        # Check if revenue is missing and we're not auto-generating
                        should_auto_generate = st.session_state.get(f"auto_generate_quote_{sub_id}", False)
                        if sub_data[2] is None and not should_auto_generate:
                            st.warning("Annual revenue is required to generate a quote.")
                            revenue_input = st.number_input(
                                "Enter Annual Revenue ($)",
                                min_value=0,
                                value=1000000,
                                step=100000,
                                key=f"revenue_input_{sub_id}"
                            )
                            
                            col1, col2 = st.columns(2)
                            with col1:
                                if st.button("Save Revenue & Generate Quote", key=f"save_revenue_{sub_id}"):
                                    # Save revenue to database
                                    conn = get_conn()
                                    with conn.cursor() as cur:
                                        cur.execute(
                                            "UPDATE submissions SET annual_revenue = %s WHERE id = %s",
                                            (revenue_input, sub_id)
                                        )
                                        conn.commit()
                                    # Set flag to auto-generate quote after save
                                    st.session_state[f"auto_generate_quote_{sub_id}"] = True
                                    st.success("Revenue saved! Generating quote...")
                                    st.rerun()
                            with col2:
                                if st.button("Cancel", key=f"cancel_revenue_{sub_id}"):
                                    st.info("Quote generation cancelled.")
                        else:
                            # Clear auto-generate flag if it was set
                            if should_auto_generate:
                                st.session_state.pop(f"auto_generate_quote_{sub_id}", None)
                            
                            # Map industry name to rating engine slug
                            industry_slug = map_industry_to_slug(sub_data[3])
                            st.write(f"Debug - Mapping '{sub_data[3]}' to '{industry_slug}'")
                            
                            # Get selected policy configuration (use session state or defaults)
                            final_limit = st.session_state.get(f"selected_limit_{sub_id}", 2_000_000)
                            final_retention = st.session_state.get(f"selected_retention_{sub_id}", 25_000)
                            
                            # Parse controls from bullet and NIST summaries
                            bullet_summary = sub_data[4] or ""  # bullet_point_summary
                            nist_summary = sub_data[5] or ""    # nist_controls_summary
                            parsed_controls = parse_controls_from_summary(bullet_summary, nist_summary)
                            
                            quote_data = {
                                "applicant_name": sub_data[0],
                                "business_summary": sub_data[1],
                                "revenue": sub_data[2],
                                "industry": industry_slug,
                                "limit": final_limit,
                                "retention": final_retention,
                                "controls": parsed_controls,
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
    
    # ------------------- Feedback History --------------------
    with st.expander("🔎 Feedback History", expanded=False):
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

    st.divider()

       # ------------------- Similar Submissions --------------------
    st.subheader("Similar Submissions")
    
    # First line: Radio buttons for similarity search
    sim_mode = st.radio(
        "Similarity Search Options",
        ("None", "Business operations", "Controls (NIST)", "Operations & NIST"),
        horizontal=True,
        key="sim_mode"
    )
    
    # Second line: Search bar and dropdown
    sim_col1, sim_col2 = st.columns([2, 1])
    
    with sim_col1:
        sim_search_term = st.text_input("🔍 Search similar submissions by company name", key="search_similar_submissions", placeholder="Enter company name...")
        
        # Override similarity mode when there's a search term
        if sim_search_term:
            sim_mode = "None"  # Override similarity mode when searching
    
    with sim_col2:
        # This will be populated with the submission selection dropdown after data is loaded
        sim_dropdown_placeholder = st.empty()
    
    # Determine which submissions to show
    if sim_search_term:
        # Search mode: load submissions based on search term
        where_sql = "LOWER(applicant_name) LIKE LOWER(%s) AND id <> %s"
        params = [f"%{sim_search_term}%", sub_id]
        sim_df = load_submissions(where_sql, params)
        
        # Add similarity column as None for search results
        if not sim_df.empty:
            sim_df['similarity'] = None
            
        search_mode = True
    elif sim_mode != "None":
        # Similarity mode: use vector embeddings
        if ops_vec is None and ctrl_vec is None:
            st.info("No embeddings available for similarity search. Please ensure the submission has been processed with embeddings.")
            sim_df = pd.DataFrame()
            search_mode = False
        else:
            vec_lookup = {
                "Business operations": ("ops_embedding", ops_vec),
                "Controls (NIST)": ("controls_embedding", ctrl_vec),
                "Operations & NIST": (
                    "(ops_embedding + controls_embedding)",
                    [a + b for a, b in zip(ops_vec, ctrl_vec)] if (ops_vec is not None and ctrl_vec is not None) else None,
                ),
            }
            col_expr, q_vec = vec_lookup[sim_mode]
            
            if q_vec is not None:  # Only proceed if we have a valid query vector
                with get_conn().cursor() as cur:
                    cur.execute(
                        f"""
                        SELECT id,
                               date_received,
                               applicant_name,
                               annual_revenue,
                               naics_primary_title,
                               industry_tags,
                               {col_expr} <=> %s AS dist
                        FROM submissions
                        WHERE id <> %s
                        ORDER BY dist
                        LIMIT 10
                        """,
                        [Vector(q_vec), sub_id],
                    )
                    rows = cur.fetchall()

                sim_data = []
                for r in rows:
                    sim_data.append({
                        "id": str(r[0])[:8],
                        "date_received": r[1],
                        "applicant_name": r[2],
                        "annual_revenue": r[3],
                        "naics_primary_title": r[4],
                        "industry_tags": r[5],
                        "similarity": round(1 - r[6], 3)
                    })

                sim_df = pd.DataFrame(sim_data)
                search_mode = False
            else:
                sim_df = pd.DataFrame()
                search_mode = False
    else:
        # No search or similarity mode
        sim_df = pd.DataFrame()
        search_mode = False

    # Display results if we have any
    if not sim_df.empty:
        # Configure column display
        sim_column_config = {
            "id": st.column_config.TextColumn(
                "ID",
                width="small",
                help="Submission ID (first 8 characters)"
            ),
            "date_received": st.column_config.DateColumn(
                "Date Received",
                format="MM/DD/YYYY",
                width="small"
            ),
            "applicant_name": st.column_config.TextColumn(
                "Company Name",
                width="medium"
            ),
            "annual_revenue": st.column_config.NumberColumn(
                "Revenue",
                format="compact",
                width="small",
                help="Annual revenue in USD"
            ),
            "naics_primary_title": st.column_config.TextColumn(
                "Primary Industry",
                width="medium"
            ),
            "industry_tags": st.column_config.ListColumn(
                "Industry Tags"
            ),
        }
        
        # Add similarity column only if not in search mode
        if not search_mode:
            sim_column_config["similarity"] = st.column_config.NumberColumn(
                "Similarity",
                format="%.3f",
                width="small",
                help="Similarity score (0-1)"
            )

        # Display similar submissions dataframe
        st.dataframe(
            sim_df,
            use_container_width=True,
            hide_index=True,
            column_config=sim_column_config
        )

        # Create dropdown for selection
        sim_label_map = {}
        for _, row in sim_df.iterrows():
            if search_mode:
                display_text = f"{row['applicant_name']} – {str(row['id'])}"
            else:
                display_text = f"{row['applicant_name']} - {row['naics_primary_title']} (Similarity: {row['similarity']})"
            sim_label_map[display_text] = row['id']
        
        # Selection dropdown - moved to top right column
        if sim_label_map:
            with sim_dropdown_placeholder.container():
                sim_label_selected = st.selectbox(
                    "Select a submission to compare:",
                    list(sim_label_map.keys()) or ["—"],
                    key=f"sim_selection_{sub_id}"
                )
            selected_sim_id = sim_label_map.get(sim_label_selected)
            
            if selected_sim_id:
                # Get full submission ID (we only stored first 8 chars)
                with get_conn().cursor() as cur:
                    cur.execute(
                        "SELECT id FROM submissions WHERE id::text LIKE %s",
                        (f"{selected_sim_id}%",)
                    )
                    result = cur.fetchone()
                    if result:
                        full_selected_id = result[0]
                        
                        st.markdown("---")
                        st.markdown("### 📊 Side-by-Side Comparison")
                        
                        # Get both submission details
                        current_sub = load_submission(sub_id)
                        selected_sub = load_submission(full_selected_id)
                        
                        if not current_sub.empty and not selected_sub.empty:
                            current_row = current_sub.iloc[0]
                            selected_row_data = selected_sub.iloc[0]
                            
                            # Create two columns for comparison
                            col1, col2 = st.columns(2)
                            
                            with col1:
                                st.markdown(f"**Current Account: {current_row['applicant_name']}**")
                            with col2:
                                st.markdown(f"**Similar Account: {selected_row_data['applicant_name']}**")
                            
                            # Basic Information Section
                            with st.container():
                                st.markdown("#### 📋 Basic Information")
                                col1, col2 = st.columns(2)
                                
                                with col1:
                                    st.markdown(f"**ID:** {str(sub_id)[:8]}")
                                    st.markdown(f"**Date Received:** {current_row['date_received']}")
                                    st.markdown(f"**Revenue:** ${current_row['annual_revenue']:,.0f}" if current_row['annual_revenue'] else "**Revenue:** Not specified")
                                
                                with col2:
                                    st.markdown(f"**ID:** {str(full_selected_id)[:8]}")
                                    st.markdown(f"**Date Received:** {selected_row_data['date_received']}")
                                    st.markdown(f"**Revenue:** ${selected_row_data['annual_revenue']:,.0f}" if selected_row_data['annual_revenue'] else "**Revenue:** Not specified")
                        
                            # Industry Information Section
                            with st.container():
                                st.markdown("#### 🏭 Industry Information")
                                col1, col2 = st.columns(2)
                                
                                with col1:
                                    st.markdown(f"**Primary Industry:** {current_row['naics_primary_title']}")
                                    st.markdown(f"**Industry Tags:** {', '.join(current_row['industry_tags']) if current_row['industry_tags'] else 'None'}")
                                
                                with col2:
                                    st.markdown(f"**Primary Industry:** {selected_row_data['naics_primary_title']}")
                                    st.markdown(f"**Industry Tags:** {', '.join(selected_row_data['industry_tags']) if selected_row_data['industry_tags'] else 'None'}")
                            
                            # Business Summary Section
                            with st.container():
                                st.markdown("#### 📊 Business Summary")
                                col1, col2 = st.columns(2)
                                
                                with col1:
                                    st.markdown("**Current Account Business Summary**")
                                    if current_row['business_summary']:
                                        st.markdown(current_row['business_summary'])
                                    else:
                                        st.markdown("*No business summary available*")
                                
                                with col2:
                                    st.markdown("**Similar Account Business Summary**")
                                    if selected_row_data['business_summary']:
                                        st.markdown(selected_row_data['business_summary'])
                                    else:
                                        st.markdown("*No business summary available*")
                            
                            # NIST Controls Summary Section
                            with st.container():
                                st.markdown("#### 🔐 NIST Controls Summary")
                                col1, col2 = st.columns(2)
                                
                                with col1:
                                    st.markdown("**Current Account NIST Controls**")
                                    current_controls_formatted = format_nist_controls_list(current_row['nist_controls'])
                                    st.markdown(current_controls_formatted)
                                
                                with col2:
                                    st.markdown("**Similar Account NIST Controls**")
                                    similar_controls_formatted = format_nist_controls_list(selected_row_data['nist_controls'])
                                    st.markdown(similar_controls_formatted)
                            
                            # Bullet Point Summary Section
                            with st.container():
                                st.markdown("#### 📌 Bullet Point Summary")
                                col1, col2 = st.columns(2)
                                
                                with col1:
                                    st.markdown("**Current Account Bullet Points**")
                                    if current_row['bullet_point_summary']:
                                        st.markdown(current_row['bullet_point_summary'])
                                    else:
                                        st.markdown("*No bullet point summary available*")
                                
                                with col2:
                                    st.markdown("**Similar Account Bullet Points**")
                                    if selected_row_data['bullet_point_summary']:
                                        st.markdown(selected_row_data['bullet_point_summary'])
                                    else:
                                        st.markdown("*No bullet point summary available*")
                        else:
                            st.error("Could not load submission details for comparison")

    st.divider()

    # ------------------- Documents Section -----------------------
    st.subheader("📄 Documents")
    
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
        "Upload documents",
        accept_multiple_files=True,
        type=['pdf', 'txt', 'doc', 'docx', 'json'],
        key=f"upload_{sub_id}",
        label_visibility="collapsed"
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

    #