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

import os, json, base64, glob
import psycopg2
from pgvector.psycopg2 import register_vector
from pgvector import Vector
import pandas as pd
import streamlit as st
from streamlit_pdf_viewer import pdf_viewer
from datetime import datetime, timezone
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")
CURRENT_USER = st.session_state.get("current_user", os.getenv("USER", "unknown"))

# ░░░░░░░░░░░░░░  QUOTE HELPERS  ░░░░░░░░░░░░░░░
from rating_engine.engine import price as rate_quote, price_with_breakdown
import sys
import os
import importlib.util
spec = importlib.util.spec_from_file_location("pipeline", os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "pipeline.py"))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
parse_controls_from_summary = pipeline.parse_controls_from_summary

# Import modular components
from pages_components.rating_panel_v2 import render_rating_panel
from pages_components.similar_submissions_panel import render_similar_submissions_panel
from pages_components.submission_status_panel import render_submission_status_panel

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


# Disable browser autofill/autocomplete to prevent address book suggestions
def _disable_autofill():
    st.markdown(
        """
        <script>
        (function() {
          const setAttrs = (el) => {
            try {
              el.setAttribute('autocomplete','off');
              el.setAttribute('autocorrect','off');
              el.setAttribute('autocapitalize','none');
              el.setAttribute('spellcheck','false');
            } catch (e) {}
          };
          const apply = () => {
            document.querySelectorAll('input, textarea, select').forEach(setAttrs);
            document.querySelectorAll('form').forEach(f => f.setAttribute('autocomplete','off'));
          };
          const obs = new MutationObserver(apply);
          obs.observe(document.documentElement, {childList: true, subtree: true});
          apply();
        })();
        </script>
        """,
        unsafe_allow_html=True,
    )


def _harden_selectbox_no_autofill(label_text: str):
    """Target a selectbox by its label text and disable typing/autofill on its input."""
    js = f"""
    <script>
    (function() {{
      const labelText = {json.dumps(label_text)};
      const tweak = () => {{
        try {{
          const labels = Array.from(document.querySelectorAll('label, div'));
          for (const lb of labels) {{
            if (!lb.innerText) continue;
            if (lb.innerText.trim() === labelText.trim()) {{
              const root = lb.closest('div')?.parentElement || lb.parentElement;
              if (!root) continue;
              const inp = root.querySelector('input');
              if (inp) {{
                inp.setAttribute('autocomplete','new-password');
                inp.setAttribute('autocorrect','off');
                inp.setAttribute('autocapitalize','none');
                inp.setAttribute('spellcheck','false');
                inp.setAttribute('inputmode','text');
                inp.setAttribute('aria-autocomplete','list');
                inp.readOnly = true; // disable typing to prevent address book
                // prevent paste triggering suggestions
                inp.addEventListener('paste', e => e.preventDefault());
              }}
            }}
          }}
        }} catch (e) {{}}
      }};
      const obs = new MutationObserver(tweak);
      obs.observe(document.documentElement, {{childList: true, subtree: true}});
      tweak();
    }})();
    </script>
    """
    st.markdown(js, unsafe_allow_html=True)

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
    
    # Check if connection exists and is still alive
    try:
        if conn is not None and conn.closed == 0:
            # Test the connection with a simple query
            with conn.cursor() as test_cur:
                test_cur.execute("SELECT 1")
            return conn
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        # Connection is broken, clear it from session state
        st.session_state.pop("db_conn", None)
        conn = None
    
    # Create new connection
    if conn is None or conn.closed != 0:
        try:
            conn = psycopg2.connect(DATABASE_URL)
            conn.autocommit = True
            register_vector(conn)
            st.session_state["db_conn"] = conn
        except Exception as e:
            st.error(f"Failed to connect to database: {e}")
            raise
    
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
           industry_tags,
           submission_status,
           submission_outcome
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
def render():
    """Main render function for the submissions page"""
    import pandas as pd
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

    # Configure column display (shared configuration)
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
        ),
        "submission_status": st.column_config.TextColumn(
            "Status",
            width="small",
            help="Primary submission status"
        ),
        "submission_outcome": st.column_config.TextColumn(
            "Outcome",
            width="small", 
            help="Submission outcome"
        )
    }

    # Format the ID column to show only first 8 characters and status columns for display
    if not sub_df.empty and 'id' in sub_df.columns:
        sub_df_display = sub_df.copy()
        sub_df_display['id'] = sub_df_display['id'].astype(str).str[:8]
    
        # Format status columns for better display
        if 'submission_status' in sub_df_display.columns:
            sub_df_display['submission_status'] = sub_df_display['submission_status'].str.replace('_', ' ').str.title()
        if 'submission_outcome' in sub_df_display.columns:
            sub_df_display['submission_outcome'] = sub_df_display['submission_outcome'].str.replace('_', ' ').str.title()
    else:
        sub_df_display = sub_df

    # Use different expander behavior based on search state
    if search_term:
        # Force expanded when searching
        with st.expander("📋 Recent submissions (filtered)", expanded=True):

            st.dataframe(
                sub_df_display, 
                use_container_width=True, 
                hide_index=True,
                column_config=column_config
            )
    else:
        # Default expander behavior when not searching
        with st.expander("📋 Recent submissions", expanded=True):

            st.dataframe(
                sub_df_display, 
                use_container_width=True, 
                hide_index=True,
                column_config=column_config
            )


    if sub_id:
        st.divider()
        st.subheader(label_selected)
    

        # ------------------- pull AI originals -------------------
        # Pull core columns first, then optional broker columns depending on schema
        conn = get_conn()
        with conn.cursor() as cur:
            # discover optional broker columns
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema='public' AND table_name='submissions'
                """
            )
            existing_cols = {r[0] for r in cur.fetchall()}

            base_cols = [
                "business_summary",
                "cyber_exposures",
                "nist_controls_summary",
                "bullet_point_summary",
                "ops_embedding",
                "controls_embedding",
                "naics_primary_code",
                "naics_primary_title",
                "naics_secondary_code",
                "naics_secondary_title",
                "industry_tags",
                "annual_revenue",
            ]
            opt_cols = [c for c in [
                "broker_email",
                "broker_company_id",
                "broker_org_id",
                "broker_employment_id",
                "broker_person_id",
            ] if c in existing_cols]

            select_cols = base_cols + opt_cols
            cur.execute(
                f"SELECT {', '.join(select_cols)} FROM submissions WHERE id = %s",
                (sub_id,),
            )
            row = cur.fetchone()
            # Map base columns
            (
                biz_sum,
                exp_sum,
                ctrl_sum,
                bullet_sum,
                ops_vec,
                ctrl_vec,
                naics_code,
                naics_title,
                naics_sec_code,
                naics_sec_title,
                industry_tags,
                annual_revenue,
                *opt_values,
            ) = row
            # Initialize optionals
            broker_email = None
            broker_company_id = None
            broker_org_id = None
            broker_employment_id = None
            broker_person_id = None
            # Assign dynamic optionals by name order
            for name, val in zip(opt_cols, opt_values):
                if name == "broker_email":
                    broker_email = val
                elif name == "broker_company_id":
                    broker_company_id = val
                elif name == "broker_org_id":
                    broker_org_id = val
                elif name == "broker_employment_id":
                    broker_employment_id = val
                elif name == "broker_person_id":
                    broker_person_id = val

        # ------------------- pull latest edits -------------------
        latest_edits = latest_edits_map(sub_id)

        # ------------------- Submission Status --------------------
        render_submission_status_panel(sub_id)

        # ------------------- Broker Assignment --------------------
        with st.expander("🤝 Broker Assignment", expanded=True):
            # Prevent browser autofill from showing address-book suggestions
            _disable_autofill()
            # Prefer brokers_alt tables in DB when available; otherwise fallback to fixtures store
            conn = get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema='public'
                    """
                )
                have_alt_db = {r[0] for r in cur.fetchall()}

            use_brkr = {'brkr_organizations','brkr_people','brkr_employments'}.issubset(have_alt_db)

            if use_brkr:
                # DB-backed: single employment dropdown (person — org — address)
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT e.employment_id, e.email, e.person_id, e.org_id,
                               p.first_name, p.last_name, org.name as org_name,
                               COALESCE(a.line1,'') as line1, COALESCE(a.line2,'') as line2,
                               COALESCE(a.city,'') as city, COALESCE(a.state,'') as state,
                               COALESCE(a.postal_code,'') as postal_code
                        FROM brkr_employments e
                        JOIN brkr_people p ON p.person_id = e.person_id
                        JOIN brkr_organizations org ON org.org_id = e.org_id
                        LEFT JOIN brkr_offices off ON off.office_id = e.office_id
                        LEFT JOIN brkr_org_addresses a ON a.address_id = COALESCE(e.override_address_id, off.default_address_id)
                        WHERE e.email IS NOT NULL AND e.active = TRUE
                        ORDER BY lower(p.last_name), lower(p.first_name), lower(org.name)
                        """
                    )
                    rows = cur.fetchall()

                def _fmt_addr(l1,l2,city,state,pc):
                    parts = [l1]
                    if l2:
                        parts.append(l2)
                    city_state = ", ".join([p for p in [city, state] if p])
                    tail = " ".join([p for p in [city_state, pc] if p]).strip()
                    if tail:
                        parts.append(tail)
                    return ", ".join([p for p in parts if p]) or "—"

                emp_map = {}
                for eid, email, pid, oid, fn, ln, org_name, l1,l2,city,state,pc in rows:
                    label = f"{(fn or '').strip()} {(ln or '').strip()} — {org_name} — {_fmt_addr(l1,l2,city,state,pc)}"
                    emp_map[str(eid)] = {
                        "label": label,
                        "email": email,
                        "person_id": str(pid),
                        "org_id": str(oid)
                    }

                options = [""] + list(emp_map.keys())
                # Default selection by broker_employment_id then by broker_email
                default_emp = None
                if broker_employment_id and str(broker_employment_id) in emp_map:
                    default_emp = str(broker_employment_id)
                elif broker_email:
                    for k,v in emp_map.items():
                        if (v.get("email") or "").lower() == str(broker_email).lower():
                            default_emp = k
                            break

                sel_emp = st.selectbox(
                    "Broker Employment",
                    options=options,
                    format_func=lambda x: ("— Select —" if x == "" else emp_map.get(x,{}).get("label", x)),
                    index=(options.index(default_emp) if default_emp in options else 0),
                    key=f"broker_emp_select_{sub_id}"
                )
                _harden_selectbox_no_autofill("Broker Employment")

                if st.button("Save Broker", key=f"save_broker_emp_{sub_id}"):
                    try:
                        if not sel_emp:
                            st.error("Please select a broker employment record.")
                            st.stop()
                        chosen = emp_map.get(sel_emp) or {}
                        chosen_email = chosen.get("email")
                        chosen_org = chosen.get("org_id")
                        chosen_person = chosen.get("person_id")

                        # Determine which columns exist
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                SELECT column_name FROM information_schema.columns
                                WHERE table_schema='public' AND table_name='submissions'
                                AND column_name IN ('broker_email','broker_org_id','broker_employment_id','broker_person_id')
                                """
                            )
                            cols = {r[0] for r in cur.fetchall()}

                        set_clauses = []
                        params = {"sid": sub_id}
                        if 'broker_email' in cols and chosen_email is not None:
                            set_clauses.append("broker_email = %(bemail)s")
                            params["bemail"] = chosen_email
                        if 'broker_org_id' in cols and chosen_org is not None:
                            set_clauses.append("broker_org_id = %(borg)s")
                            params["borg"] = chosen_org
                        if 'broker_employment_id' in cols:
                            set_clauses.append("broker_employment_id = %(bemp)s")
                            params["bemp"] = sel_emp
                        if 'broker_person_id' in cols and chosen_person is not None:
                            set_clauses.append("broker_person_id = %(bper)s")
                            params["bper"] = chosen_person

        
                        if set_clauses:
                            with conn.cursor() as cur:
                                cur.execute(
                                    f"UPDATE submissions SET {', '.join(set_clauses)} WHERE id = %(sid)s",
                                    params,
                                )

                        st.success("Broker assignment saved.")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error saving broker: {e}")

            else:
                st.warning("Broker directory tables (brkr_*) not found. Please set up the broker directory in the database.")

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
    
        # ------------------- Loss History --------------------
        with st.expander("📊 Loss History", expanded=False):
            # Load loss history data
            conn = get_conn()
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT loss_date, loss_type, loss_description, loss_amount, 
                           claim_status, claim_number, carrier_name, paid_amount
                    FROM loss_history 
                    WHERE submission_id = %s 
                    ORDER BY loss_date DESC
                """, (sub_id,))
                loss_records = cur.fetchall()
        
            if loss_records:
                st.write(f"**Found {len(loss_records)} loss records**")
            
                # Create DataFrame for better display
                import pandas as pd
                loss_df = pd.DataFrame(loss_records, columns=[
                    'Loss Date', 'Type', 'Description', 'Loss Amount', 
                    'Status', 'Claim Number', 'Carrier', 'Paid Amount'
                ])
            
                # Display summary metrics
                col1, col2, col3 = st.columns(3)
                with col1:
                    total_paid = sum([float(amt) for amt in loss_df['Paid Amount'] if amt])
                    st.metric("Total Paid", f"${total_paid:,.2f}")
                with col2:
                    closed_claims = len([s for s in loss_df['Status'] if s == 'CLOSED'])
                    st.metric("Closed Claims", closed_claims)
                with col3:
                    avg_paid = total_paid / len(loss_df) if len(loss_df) > 0 else 0
                    st.metric("Avg per Claim", f"${avg_paid:,.2f}")
            
                # Display detailed table
                st.markdown("**Claims Detail:**")
            
                # Format the dataframe for better display
                display_df = loss_df.copy()
                display_df['Loss Date'] = pd.to_datetime(display_df['Loss Date']).dt.strftime('%Y-%m-%d')
                display_df['Description'] = display_df['Description'].str[:100] + '...' if len(display_df) > 0 else display_df['Description']
                display_df['Paid Amount'] = display_df['Paid Amount'].apply(lambda x: f"${float(x):,.2f}" if x else "N/A")
            
                st.dataframe(
                    display_df,
                    use_container_width=True,
                    hide_index=True
                )
            
            else:
                st.info("No loss history records found for this submission.")
    
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
                        from ai.guideline_rag import get_ai_decision
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
                        from ai.guideline_rag import get_chat_response
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
        quote_helpers = {
            'render_pdf': _render_quote_pdf,
            'upload_pdf': _upload_pdf,
            'save_quote': _save_quote_row
        }
        render_rating_panel(sub_id, get_conn, quote_helpers)
    
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
        render_similar_submissions_panel(sub_id, ops_vec, ctrl_vec, get_conn, load_submissions, load_submission, format_nist_controls_list)

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
                
                    # Check file type and display accordingly
                    filename = r['filename'].lower()
                    file_path = None
                
                    # Search for the file in common locations
                    possible_paths = [
                        f"./attachments/{r['filename']}",
                        f"./fixtures/{r['filename']}",
                        f"./{r['filename']}"
                    ]
                
                    # Also search in subdirectories
                    search_patterns = [
                        f"./attachments/**/{r['filename']}",
                        f"./fixtures/**/{r['filename']}",
                        f"./**/{r['filename']}"
                    ]
                
                    # First try direct paths
                    for path in possible_paths:
                        if os.path.exists(path):
                            file_path = path
                            break
                
                    # If not found, try searching recursively
                    if not file_path:
                        for pattern in search_patterns:
                            matches = glob.glob(pattern, recursive=True)
                            if matches:
                                file_path = matches[0]  # Take the first match
                                break
                
                    if filename.endswith('.pdf'):
                        # Handle PDF files
                        if file_path:
                            try:
                                with open(file_path, "rb") as file:
                                    pdf_bytes = file.read()
                                    st.download_button(
                                        label="📄 Download PDF",
                                        data=pdf_bytes,
                                        file_name=r['filename'],
                                        mime="application/pdf"
                                    )
                                    st.write("**PDF Preview:**")
                                    try:
                                        pdf_viewer(input=pdf_bytes, width=1200, height=800)
                                    except Exception as pdf_error:
                                        st.error(f"Error displaying PDF: {pdf_error}")
                            except Exception as e:
                                st.error(f"Error loading PDF: {e}")
                        else:
                            st.info(f"PDF file '{r['filename']}' not found in storage locations")
                        
                    elif filename.endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff')):
                        # Handle image files
                        if file_path:
                            try:
                                st.write("**Image Preview:**")
                                st.image(file_path, caption=r['filename'], use_container_width=True)
                            
                                # Add download button for images
                                with open(file_path, "rb") as file:
                                    image_bytes = file.read()
                                    st.download_button(
                                        label="📷 Download Image",
                                        data=image_bytes,
                                        file_name=r['filename'],
                                        mime=f"image/{filename.split('.')[-1]}"
                                    )
                            except Exception as e:
                                st.error(f"Error loading image: {e}")
                        else:
                            st.info(f"Image file '{r['filename']}' not found in storage locations")
                        
                    else:
                        # For other files (JSON, text, etc.), show metadata and extracted data
                        st.markdown("**Metadata**")
                        st.json(_safe_json(r["doc_metadata"]))
                        st.markdown("**Extracted Data (truncated)**")
                        st.json(_safe_json(r["extracted_data"]))

        #

# Entry point for backwards compatibility
if __name__ == "__main__":
    st.set_page_config(page_title="Submissions", layout="wide")
    render()
