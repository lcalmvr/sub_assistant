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
from typing import Optional

# Load environment variables
load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")
CURRENT_USER = st.session_state.get("current_user", os.getenv("USER", "unknown"))

# ░░░░░░░░░░░░░░  QUOTE HELPERS  ░░░░░░░░░░░░░░░
from rating_engine.engine import price as rate_quote, price_with_breakdown
from rating_engine.premium_calculator import calculate_premium, map_industry_to_slug
import sys
import os
import importlib.util
spec = importlib.util.spec_from_file_location("pipeline", os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "pipeline.py"))
pipeline = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pipeline
spec.loader.exec_module(pipeline)
parse_controls_from_summary = pipeline.parse_controls_from_summary

# Import modular components
from pages_components.rating_panel_v2 import render_rating_panel
from pages_components.similar_submissions_panel import render_similar_submissions_panel
from pages_components.benchmarking_panel import render_benchmarking_panel
from pages_components.details_panel import render_details_panel
from pages_components.status_header import render_status_header
from pages_components.review_queue_panel import render_review_queue_panel
from pages_components.account_history_panel import render_account_history_compact
from pages_components.renewal_panel import render_renewal_panel
from pages_components.endorsements_history_panel import render_endorsements_history_panel
from pages_components.admin_agent_sidebar import render_admin_agent_sidebar
from core.policy_tab_data import load_policy_tab_data as _load_policy_tab_data_uncached

@st.cache_data(ttl=30)
def load_policy_tab_data(submission_id: str) -> dict:
    """Cached wrapper for policy tab data loader. 30s TTL."""
    return _load_policy_tab_data_uncached(submission_id)

def clear_submission_caches():
    """Clear all submission-related caches. Call after any save operation."""
    load_submissions.clear()
    load_documents.clear()
    load_submission.clear()
    load_policy_tab_data.clear()

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

def _get_quotes_for_submission(sub_id: str):
    """Retrieve all quotes for a submission"""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            select id, quote_json, pdf_url, created_by, created_at
            from quotes
            where submission_id = %s
            order by created_at desc
            """,
            (sub_id,),
        )
        rows = cur.fetchall()
        return [
            {
                "id": row[0],
                "quote_json": row[1],
                "pdf_url": row[2],
                "created_by": row[3],
                "created_at": row[4],
            }
            for row in rows
        ]

def _update_quote_row(quote_id: str, quote_json: dict, pdf_url: str):
    """Update an existing quote"""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            update quotes
            set quote_json = %s, pdf_url = %s, created_at = now()
            where id = %s
            """,
            (json.dumps(quote_json), pdf_url, quote_id),
        )

def _delete_quote_row(quote_id: str):
    """Delete a quote"""
    with get_conn().cursor() as cur:
        cur.execute("delete from quotes where id = %s", (quote_id,))
# ░░░░░░░░░░░░░░  END QUOTE HELPERS  ░░░░░░░░░░░░░░

# ─────────────────────── Tower Sync ────────────────────────
def _sync_dropdowns_to_tower(sub_id: str):
    """
    Sync Rating Panel dropdown values to tower layer 1.
    For simple primary quotes, this auto-creates a CMAI primary layer.
    """
    # Skip if a quote was just loaded - don't overwrite loaded tower data
    if st.session_state.get("_quote_just_loaded"):
        st.session_state._quote_just_loaded = False  # Clear the flag
        return

    # Get dropdown values from session state
    limit = st.session_state.get(f"selected_limit_{sub_id}")
    retention = st.session_state.get(f"selected_retention_{sub_id}")

    if not limit:
        return  # No limit selected yet

    # Get current tower state
    tower_layers = st.session_state.get("tower_layers", [])

    # Case 1: Empty tower - create primary CMAI layer
    if not tower_layers:
        st.session_state.tower_layers = [{
            "carrier": "CMAI",
            "limit": limit,
            "attachment": 0,  # Primary sits at ground
            "premium": None,
            "rpm": None,
        }]
        st.session_state.primary_retention = retention
        return

    # Case 2: Single layer tower - update the primary layer
    if len(tower_layers) == 1:
        layer = tower_layers[0]
        # Only update if it's the CMAI layer or unnamed
        carrier = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier or not layer.get("carrier"):
            # Update limit if it changed
            if layer.get("limit") != limit:
                st.session_state.tower_layers[0]["limit"] = limit
                st.session_state.tower_layers[0]["carrier"] = "CMAI"
        st.session_state.primary_retention = retention
        return

    # Case 3: Multi-layer tower - find and update CMAI layer
    for idx, layer in enumerate(tower_layers):
        carrier = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier:
            if layer.get("limit") != limit:
                st.session_state.tower_layers[idx]["limit"] = limit
            break
    st.session_state.primary_retention = retention

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
    edited_text: Optional[str],
    feedback_label: str,
    comment: Optional[str],
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

@st.cache_data(ttl=30)
def load_submissions(where_clause: str, params: tuple) -> pd.DataFrame:
    """Load submissions list with 30s cache to reduce DB hits on reruns."""
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
    return pd.read_sql(qry, get_conn(), params=list(params))

@st.cache_data(ttl=30)
def load_documents(submission_id: str) -> pd.DataFrame:
    """Load documents for a submission with 30s cache."""
    qry = """
    SELECT filename, document_type, page_count, is_priority, doc_metadata, extracted_data
        FROM documents
    WHERE submission_id = %s
    ORDER BY is_priority DESC, filename
    """
    return pd.read_sql(qry, get_conn(), params=[submission_id])

@st.cache_data(ttl=30)
def load_submission(submission_id: str) -> pd.DataFrame:
    """Load a single submission with all details for comparison. Cached 30s."""
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
            clear_submission_caches()

    except Exception as e:
        raise Exception(f"Failed to process document: {str(e)}")

def _to_vector_literal(vec):
    if vec is None:
        return "NULL"
    return f"[{','.join(map(str, vec))}]"


def _render_policy_period_section(sub_id: str):
    """Render policy period with smart expiration."""
    from datetime import date
    from dateutil.relativedelta import relativedelta

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT effective_date, expiration_date FROM submissions WHERE id = %s", (sub_id,))
        row = cur.fetchone()

    effective_date = row[0] if row else None
    expiration_date = row[1] if row else None

    edit_key = f"editing_period_{sub_id}"
    is_editing = st.session_state.get(edit_key, False)

    if not is_editing:
        # Display mode
        col_display, col_btn = st.columns([6, 1])

        with col_display:
            if effective_date:
                eff_str = effective_date.strftime("%m/%d/%Y")
                if expiration_date:
                    exp_str = expiration_date.strftime("%m/%d/%Y")
                else:
                    exp_str = (effective_date + relativedelta(years=1)).strftime("%m/%d/%Y")
                st.markdown(f"**Period:** {eff_str} → {exp_str}")
            else:
                st.markdown("**Period:** TBD (12 months)")

        with col_btn:
            if st.button("Edit", key=f"edit_period_btn_{sub_id}", type="secondary"):
                st.session_state[edit_key] = True
                st.rerun()
    else:
        # Edit mode
        new_effective = st.date_input("Effective Date", value=effective_date, key=f"eff_{sub_id}")

        # Check if custom expiration
        has_custom = False
        if effective_date and expiration_date:
            expected = effective_date + relativedelta(years=1)
            has_custom = (expiration_date != expected)

        use_custom = st.checkbox("Custom expiration", value=has_custom, key=f"cust_{sub_id}")

        if use_custom:
            calc_exp = new_effective + relativedelta(years=1) if new_effective else None
            new_expiration = st.date_input("Expiration Date", value=expiration_date or calc_exp, key=f"exp_{sub_id}")
        else:
            if new_effective:
                new_expiration = new_effective + relativedelta(years=1)
                st.caption(f"Expiration: {new_expiration.strftime('%m/%d/%Y')} (auto)")
            else:
                new_expiration = None

        c1, c2, c3 = st.columns([1, 1, 4])
        with c1:
            if st.button("Save", key=f"save_period_{sub_id}", type="primary"):
                with conn.cursor() as cur:
                    cur.execute("UPDATE submissions SET effective_date = %s, expiration_date = %s, updated_at = now() WHERE id = %s", (new_effective, new_expiration, sub_id))
                clear_submission_caches()
                st.session_state[edit_key] = False
                st.rerun()
        with c2:
            if st.button("Cancel", key=f"cancel_period_{sub_id}"):
                st.session_state[edit_key] = False
                st.rerun()


def _render_broker_section(sub_id: str):
    """Render broker section."""
    from core.bor_management import get_current_broker, get_all_broker_employments

    current = get_current_broker(sub_id)
    edit_key = f"editing_broker_{sub_id}"
    is_editing = st.session_state.get(edit_key, False)

    if not is_editing:
        # Display mode
        col_display, col_btn = st.columns([6, 1])

        with col_display:
            if current:
                display = current.get("broker_name", "Unknown")
                if current.get("contact_name"):
                    display += f" - {current.get('contact_name')}"
                if current.get("contact_email"):
                    display += f" ({current.get('contact_email')})"
                st.markdown(f"**Broker:** {display}")
            else:
                st.markdown("**Broker:** Not assigned")

        with col_btn:
            btn_label = "Change" if current else "Assign"
            if st.button(btn_label, key=f"edit_broker_btn_{sub_id}", type="secondary"):
                st.session_state[edit_key] = True
                st.rerun()
    else:
        # Edit mode
        employments = get_all_broker_employments()
        if employments:
            emp_options = {e["id"]: e["display_name"] for e in employments}

            selected_emp_id = st.selectbox(
                "Select Broker",
                options=list(emp_options.keys()),
                format_func=lambda x: emp_options.get(x, ""),
                key=f"broker_select_{sub_id}"
            )

            c1, c2, c3 = st.columns([1, 1, 4])
            with c1:
                if st.button("Save", key=f"save_broker_{sub_id}", type="primary"):
                    for emp in employments:
                        if emp["id"] == selected_emp_id:
                            conn = get_conn()
                            with conn.cursor() as cur:
                                cur.execute("""
                                    UPDATE submissions
                                    SET broker_org_id = %s, broker_employment_id = %s, updated_at = now()
                                    WHERE id = %s
                                """, (emp["org_id"], emp["id"], sub_id))
                            clear_submission_caches()
                            st.session_state[edit_key] = False
                            st.rerun()
                            break
            with c2:
                if st.button("Cancel", key=f"cancel_broker_{sub_id}"):
                    st.session_state[edit_key] = False
                    st.rerun()
        else:
            st.caption("No brokers available")
            if st.button("Cancel", key=f"cancel_broker_{sub_id}"):
                st.session_state[edit_key] = False
                st.rerun()


# ─────────────────────── UI starts ──────────────────────────
def _sync_selected_submission_from_query_params():
    query_sub_id = st.query_params.get("selected_submission_id")
    if query_sub_id:
        st.session_state.selected_submission_id = str(query_sub_id)
        st.query_params.clear()  # Clear to avoid stale params


def _format_submission_label(applicant_name: str, submission_id: str) -> str:
    return f"{applicant_name} – {str(submission_id)[:8]}"


def _get_current_submission_display(submission_id: str) -> Optional[dict]:
    if not submission_id:
        return None
    try:
        df = load_submission(str(submission_id))
        if df is None or df.empty:
            return None
        row = df.iloc[0]
        applicant_name = row["applicant_name"]
        submission_id = str(row["id"])
        return {
            "id": submission_id,
            "short_id": submission_id[:8],
            "applicant_name": applicant_name,
            "label": _format_submission_label(applicant_name, submission_id),
        }
    except Exception:
        return None


def _render_submission_context(submission_id: str):
    """Compact broker + account context line shown above tabs."""
    if not submission_id:
        return

    try:
        from core.bor_management import get_current_broker
        from core.account_management import get_submission_account

        broker = get_current_broker(submission_id)
        account = get_submission_account(submission_id)

        if account:
            acct_text = account.get("name") or "—"
            if account.get("website"):
                acct_text += f" · {account['website']}"
        else:
            acct_text = "Not linked"

        if broker:
            broker_text = broker.get("broker_name") or "—"
            contact = broker.get("contact_name")
            email = broker.get("contact_email")
            if contact:
                broker_text += f" - {contact}"
            if email:
                broker_text += f" ({email})"
        else:
            broker_text = "Not assigned"

        st.caption(f"Broker: {broker_text}")
    except Exception:
        # Context is helpful but non-critical; avoid breaking page render.
        return


def _render_submission_switcher(current_sub_id: Optional[str], *, status_edit_submission_id: Optional[str] = None):
    """Popover-based submission search/switcher (used in header)."""
    with st.popover("Load / Edit", use_container_width=True):
        # Keep this simple: quick recent picks + a selectbox with built-in type-to-filter.
        sub_df = load_submissions("TRUE", ())
        label_map = {
            _format_submission_label(r.applicant_name, r.id): str(r.id)
            for r in sub_df.itertuples()
        }

        current_display = _get_current_submission_display(current_sub_id) if current_sub_id else None
        current_label = current_display["label"] if current_display else None
        if current_sub_id and current_label and current_label not in label_map:
            label_map = {current_label: str(current_sub_id), **label_map}

        options = list(label_map.keys()) or ["—"]
        default_idx = options.index(current_label) if current_label in options else 0

        st.caption("Search")
        selected_label = st.selectbox(
            "Open submission",
            options,
            index=default_idx,
            key=f"submission_switch_select_{current_sub_id or 'none'}",
            label_visibility="collapsed",
        )

        new_sub_id = label_map.get(selected_label)
        if new_sub_id and str(new_sub_id) != str(current_sub_id):
            st.session_state.selected_submission_id = str(new_sub_id)
            st.rerun()

        if status_edit_submission_id:
            if st.button(
                "Edit status…",
                key=f"edit_status_from_switch_{status_edit_submission_id}",
                use_container_width=True,
            ):
                st.session_state[f"editing_status_{status_edit_submission_id}"] = True
                st.rerun()

            if st.button(
                "Edit broker…",
                key=f"edit_broker_from_switch_{status_edit_submission_id}",
                use_container_width=True,
            ):
                st.session_state[f"editing_parties_{status_edit_submission_id}"] = True
                st.rerun()

            if st.button(
                "Edit account…",
                key=f"edit_account_from_switch_{status_edit_submission_id}",
                use_container_width=True,
            ):
                st.session_state[f"editing_parties_{status_edit_submission_id}"] = True
                st.rerun()

        recent_df = sub_df.head(5) if not sub_df.empty else sub_df
        if recent_df is not None and not recent_df.empty:
            st.divider()
            st.caption("Recent")
            for r in recent_df.itertuples():
                label = _format_submission_label(r.applicant_name, r.id)
                if st.button(label, key=f"recent_submission_btn_{r.id}", use_container_width=True):
                    st.session_state.selected_submission_id = str(r.id)
                    st.rerun()


def render():
    """Main render function for the submissions page"""
    import pandas as pd

    _sync_selected_submission_from_query_params()
    current_sub_id = st.session_state.get("selected_submission_id")

    # Resolve current selection (and display label) from DB.
    sub_id = None
    current_display = None
    if current_sub_id:
        current_display = _get_current_submission_display(str(current_sub_id))
        if current_display:
            sub_id = current_display["id"]
        else:
            # Stale selection (e.g., deleted submission) - clear.
            st.session_state.pop("selected_submission_id", None)
            current_sub_id = None

    sub_df = pd.DataFrame()
    search_term = ""
    if not sub_id:
        # Selection mode: show full picker UI (search/select + recent table)
        st.header("Submissions")
        col1, col2 = st.columns([2, 1])

        with col1:
            search_term = st.text_input(
                "🔍 Search by company name",
                key="submission_picker_search",
                placeholder="Enter company name...",
            )

        with col2:
            if search_term:
                where_sql = "LOWER(applicant_name) LIKE LOWER(%s)"
                params = (f"%{search_term}%",)
            else:
                where_sql = "TRUE"
                params = ()

            sub_df = load_submissions(where_sql, params)
            label_map = {
                _format_submission_label(r.applicant_name, r.id): str(r.id)
                for r in sub_df.itertuples()
            }

            options = list(label_map.keys()) or ["—"]
            chosen_label = st.selectbox("Open submission:", options, index=0)
            chosen = label_map.get(chosen_label)
            if chosen:
                st.session_state.selected_submission_id = str(chosen)
                st.rerun()
    else:
        # Work mode: unified top header with actions on the same row.
        import html as _html
        st.markdown(
            """
<style>
div[data-testid="stButton"] button { white-space: nowrap; }
div[data-testid="stPopover"] button { white-space: nowrap; }
.submission-title {
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1.05 !important;
}
</style>
            """,
            unsafe_allow_html=True,
        )

        # Give the right-side actions enough room so the button label doesn't wrap/truncate.
        title_col, actions_col = st.columns([8, 4])
        with title_col:
            short_id = str(sub_id)[:8]
            st.markdown(
                f"<h1 class='submission-title'>{_html.escape(current_display['applicant_name'])} <span style='color:#9ca3af;font-size:0.5em;font-weight:400'>({short_id})</span></h1>",
                unsafe_allow_html=True,
            )
        with actions_col:
            # Nested cols to right-align the action buttons.
            spacer, docs_col, switcher_col = st.columns([1, 2, 3])
            with docs_col:
                from pages_components.docs_popover import render_docs_popover
                render_docs_popover(sub_id, get_conn)
            with switcher_col:
                _render_submission_switcher(current_sub_id=sub_id, status_edit_submission_id=sub_id)

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

    if not sub_id:
        # Selection mode: show recent submissions table
        title = "📋 Recent submissions (filtered)" if search_term else "📋 Recent submissions"
        with st.expander(title, expanded=True):
            st.dataframe(
                sub_df_display,
                use_container_width=True,
                hide_index=True,
                column_config=column_config,
            )

    if sub_id:
        # ------------------- STATUS HEADER -------------------
        render_status_header(sub_id, get_conn=get_conn, show_change_button=False)
        _render_submission_context(sub_id)

        # Check if we should return to Policy tab (after endorsement/admin action)
        target_tab = None
        if st.session_state.pop("_return_to_policy_tab", False):
            target_tab = "Policy"
        elif st.session_state.get("_active_tab"):
            target_tab = st.session_state.pop("_active_tab", None)

        # ------------------- TABS -------------------
        if target_tab:
            st.markdown(
                "<style>div[data-testid='stTabs']{opacity:0;}</style>",
                unsafe_allow_html=True,
            )
        tab_details, tab_review, tab_uw, tab_benchmark, tab_rating, tab_quote, tab_policy = st.tabs(
            ["📋 Account", "⚠️ Review", "🔍 UW", "📈 Comps", "📊 Rating", "💰 Quote", "📑 Policy"]
        )

        # If we need to switch to a specific tab, inject JavaScript to click it
        if target_tab:
            tab_index = {"Account": 0, "Review": 1, "UW": 2, "Comps": 3, "Rating": 4, "Quote": 5, "Policy": 6}.get(target_tab, 0)
            import streamlit.components.v1 as components
            components.html(f"""
                <script>
                    // Wait for tabs to render then click the target tab
                    function clickTab() {{
                        const root = window.parent.document;
                        const tabs = root.querySelectorAll('[data-baseweb="tab"]');
                        const tabsRoot = root.querySelector('[data-testid="stTabs"]');
                        if (tabs && tabs.length > {tab_index}) {{
                            tabs[{tab_index}].click();
                            if (tabsRoot) {{
                                tabsRoot.style.opacity = '1';
                            }}
                        }} else {{
                            // Retry if tabs aren't rendered yet
                            setTimeout(clickTab, 50);
                        }}
                    }}
                    setTimeout(clickTab, 0);
                </script>
            """, height=0)

        # Define quote_helpers up front for use in Quote tab
        quote_helpers = {
            'render_pdf': _render_quote_pdf,
            'upload_pdf': _upload_pdf,
            'save_quote': _save_quote_row,
            'update_quote': _update_quote_row,
            'get_loaded_quote_id': lambda: st.session_state.get("loaded_quote_id"),
            'clear_loaded_quote': lambda: st.session_state.pop("loaded_quote_id", None)
        }

        # ------------------- RATING TAB -------------------
        with tab_rating:
            st.markdown("##### Premium Calculator")

            # Get submission data for rating
            with get_conn().cursor() as cur:
                cur.execute("""
                    SELECT annual_revenue, naics_primary_title,
                           hazard_override, control_overrides
                    FROM submissions WHERE id = %s
                """, (sub_id,))
                rating_row = cur.fetchone()

            if rating_row:
                import json as json_mod
                rating_sub = {
                    "revenue": rating_row[0],
                    "industry": rating_row[1] or "Technology",
                    "hazard_override": rating_row[2],
                    "control_overrides": rating_row[3]
                }

                # Get raw industry for premium calculation (shared function handles slug mapping)
                raw_industry = rating_sub.get("industry") or "Technology"

                # Rating Parameters setup
                retention_options = [25_000, 50_000, 100_000, 150_000, 250_000]
                retention_labels = ["$25K", "$50K", "$100K", "$150K", "$250K"]

                current_hazard = rating_sub.get("hazard_override")
                current_overrides = rating_sub.get("control_overrides") or {}
                if isinstance(current_overrides, str):
                    try:
                        current_overrides = json_mod.loads(current_overrides)
                    except:
                        current_overrides = {}
                current_adj = current_overrides.get("overall", 0)

                # Get current selections from session state (dropdowns rendered below)
                selected_retention = st.session_state.get(f"rating_retention_{sub_id}", 50_000)
                new_hazard = st.session_state.get(f"rating_hazard_{sub_id}", current_hazard)
                new_adj = st.session_state.get(f"rating_ctrl_adj_{sub_id}", current_adj)

                # Build rating inputs
                revenue = rating_sub.get("revenue") or 0
                display_revenue = revenue if revenue else 10_000_000

                # Determine effective hazard class
                # If hazard override is set, use it; otherwise use industry default
                effective_hazard = new_hazard if new_hazard else None

                limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000]
                limit_labels = ["1M", "2M", "3M", "5M"]

                # Calculate premiums for each limit and get breakdown for first one
                premiums = []
                breakdown_data = None

                for i, limit in enumerate(limits):
                    try:
                        # Use shared premium calculator - single source of truth
                        result = calculate_premium(
                            revenue=display_revenue,
                            limit=limit,
                            retention=selected_retention,
                            industry=raw_industry,  # Pass raw industry - shared function handles slug mapping
                            hazard_override=effective_hazard,
                            control_adjustment=new_adj if new_adj else 0,
                        )

                        # Get risk-adjusted premium (includes both hazard and control adjustments)
                        adjusted_premium = result.get("risk_adjusted_premium", 0)
                        premiums.append(adjusted_premium)

                        # Store breakdown for display (use 1M limit breakdown)
                        if i == 0:
                            breakdown_data = result.get("breakdown", {})
                            breakdown_data["final_adjusted"] = adjusted_premium

                    except Exception as e:
                        premiums.append(0)

                # Format retention for display
                ret_label = f"${selected_retention // 1000}K"

                # Display premium metrics with create option buttons
                col1, col2, col3, col4 = st.columns(4)
                cols = [col1, col2, col3, col4]

                for i, (col, limit_label, limit, premium) in enumerate(zip(cols, limit_labels, limits, premiums)):
                    with col:
                        st.metric(
                            label=f"{limit_label} / {ret_label}",
                            value=f"${premium:,.0f}" if premium > 0 else "N/A"
                        )
                        # Create Quote Option button
                        if premium > 0:
                            if st.button("+ Create Option", key=f"create_opt_{limit}_{selected_retention}_{sub_id}", use_container_width=True):
                                from pages_components.tower_db import save_tower, list_quotes_for_submission
                                from pages_components.coverages_panel import build_coverages_from_rating
                                from rating_engine.coverage_config import get_default_policy_form

                                # Get policy form and build coverages from Rating tab config
                                policy_form = st.session_state.get(f"policy_form_{sub_id}", get_default_policy_form())
                                coverages = build_coverages_from_rating(sub_id, limit)

                                # Create a simple tower with CMAI as primary
                                tower_json = [{
                                    "carrier": "CMAI",
                                    "limit": limit,
                                    "attachment": 0,
                                    "premium": premium
                                }]
                                # Use shared quote naming utility
                                from utils.quote_formatting import generate_quote_name
                                quote_name = generate_quote_name(limit, selected_retention)

                                # Check if this exact name already exists
                                existing = list_quotes_for_submission(sub_id)
                                existing_names = [q["quote_name"] for q in existing]
                                if quote_name in existing_names:
                                    # Add a number suffix
                                    n = 2
                                    while f"{quote_name} ({n})" in existing_names:
                                        n += 1
                                    quote_name = f"{quote_name} ({n})"

                                # Get policy form and build coverages from Rating tab config
                                coverages = build_coverages_from_rating(sub_id, limit)

                                save_tower(
                                    submission_id=sub_id,
                                    tower_json=tower_json,
                                    primary_retention=selected_retention,
                                    quote_name=quote_name,
                                    technical_premium=premium,
                                    position="primary",
                                    policy_form=policy_form,
                                    coverages=coverages,
                                )
                                st.success(f"Created: {quote_name}")
                                st.session_state["_active_tab"] = "Rating"
                                st.rerun()

                # Rating Parameters (Retention, Hazard Class, Control Adjustment)
                col_ret, col_haz, col_adj = st.columns(3)

                with col_ret:
                    selected_retention = st.selectbox(
                        "Retention",
                        options=retention_options,
                        format_func=lambda x: retention_labels[retention_options.index(x)],
                        index=retention_options.index(selected_retention) if selected_retention in retention_options else 1,
                        key=f"rating_retention_{sub_id}"
                    )

                with col_haz:
                    hazard_options = [None, 1, 2, 3, 4, 5]
                    hazard_labels = ["Auto-detect", "1 - Low", "2 - Below Avg", "3 - Average", "4 - Above Avg", "5 - High"]
                    hazard_idx = hazard_options.index(current_hazard) if current_hazard in hazard_options else 0
                    new_hazard = st.selectbox(
                        "Hazard Class",
                        options=hazard_options,
                        format_func=lambda x: hazard_labels[hazard_options.index(x)],
                        index=hazard_idx,
                        key=f"rating_hazard_{sub_id}"
                    )
                    if new_hazard != current_hazard:
                        with get_conn().cursor() as cur:
                            cur.execute(
                                "UPDATE submissions SET hazard_override = %s WHERE id = %s",
                                (new_hazard, sub_id)
                            )
                        clear_submission_caches()
                        st.rerun()

                with col_adj:
                    adj_options = [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15]
                    adj_labels = ["-15%", "-10%", "-5%", "None", "+5%", "+10%", "+15%"]
                    adj_idx = adj_options.index(current_adj) if current_adj in adj_options else 3
                    new_adj = st.selectbox(
                        "Control Adjustment",
                        options=adj_options,
                        format_func=lambda x: adj_labels[adj_options.index(x)],
                        index=adj_idx,
                        key=f"rating_ctrl_adj_{sub_id}"
                    )
                    if new_adj != current_adj:
                        with get_conn().cursor() as cur:
                            cur.execute(
                                "UPDATE submissions SET control_overrides = %s WHERE id = %s",
                                (json_mod.dumps({"overall": new_adj}), sub_id)
                            )
                        clear_submission_caches()
                        st.rerun()

                # ─────────────────────────────────────────────────────────────
                # Rating Factors Summary (concise, universal)
                # ─────────────────────────────────────────────────────────────
                if breakdown_data:
                    with st.expander("Rating Factors", expanded=True):
                        bd = breakdown_data

                        # Compact summary in columns using markdown for single-spaced output
                        col_base, col_factors, col_mods = st.columns(3)

                        with col_base:
                            auto_hazard = bd.get('hazard_class', 3)
                            eff_hazard = bd.get('effective_hazard', auto_hazard)
                            hazard_text = f"Auto: {auto_hazard}" if eff_hazard == auto_hazard else f"Auto: {auto_hazard} → **{eff_hazard}**"
                            st.markdown(f"**Base**<br>Band: {bd.get('revenue_band', 'N/A')}<br>Rate: {bd.get('base_rate_per_1k', 0):.4f} / $1K<br>Hazard: {hazard_text}", unsafe_allow_html=True)

                        with col_factors:
                            ret_factor = bd.get('retention_factor', 1.0)
                            st.markdown(f"**Factors**<br>Retention: {ret_factor:.2f}x<br>Limits: 1M=1.0, 2M=1.7, 3M=2.3, 5M=3.2", unsafe_allow_html=True)

                        with col_mods:
                            control_mods = bd.get('control_modifiers', [])
                            manual_adj = bd.get('control_adjustment', 0)

                            # Build itemized control list
                            ctrl_lines = []
                            total_ctrl_mod = 0
                            for mod in control_mods:
                                mod_val = mod.get('modifier', 0)
                                total_ctrl_mod += mod_val
                                pct = mod_val * 100
                                sign = "+" if pct > 0 else ""
                                reason = mod.get('reason', '?').replace('Missing ', '').replace('Has ', '')
                                ctrl_lines.append(f"{reason}: {sign}{pct:.0f}%")

                            if ctrl_lines:
                                total_pct = total_ctrl_mod * 100
                                total_sign = "+" if total_pct > 0 else ""
                                ctrl_text = "<br>".join(ctrl_lines)
                                adj_text = f"<b>Total: {total_sign}{total_pct:.0f}%</b>"
                            else:
                                ctrl_text = "None"
                                adj_text = "<b>Total: 0%</b>"

                            # Add override if present
                            if manual_adj != 0:
                                adj_pct = manual_adj * 100
                                adj_sign = "+" if adj_pct > 0 else ""
                                override_text = f"<br>Override: {adj_sign}{adj_pct:.0f}%"
                            else:
                                override_text = ""

                            st.markdown(f"**Controls**<br>{ctrl_text}<br>{adj_text}{override_text}", unsafe_allow_html=True)

                        # Revenue & Industry at bottom of expander
                        st.caption(f"Revenue: ${display_revenue:,.0f} | Industry: {raw_industry}")

                from pages_components.coverage_summary_panel import render_coverage_summary_panel
                coverage_config = render_coverage_summary_panel(
                    sub_id=sub_id,
                    aggregate_limit=limits[0],  # Use first limit option for ballpark
                    get_conn_func=get_conn,
                )
            else:
                st.warning("No submission data available for rating.")

        with tab_quote:
            # Import components
            from pages_components.quote_options_panel import (
                render_quote_options_panel,
                auto_load_quote_for_submission,
                is_viewing_saved_option,
                get_draft_name,
                clear_draft_state,
                get_current_quote_position,
            )
            from pages_components.quote_config_inline import render_quote_config_inline
            from pages_components.tower_panel import render_tower_panel
            from pages_components.sublimits_panel import render_sublimits_panel
            from pages_components.endorsements_panel import render_endorsements_panel
            from pages_components.subjectivities_panel import render_subjectivities_panel
            from pages_components.coverages_panel import render_coverages_panel, get_coverages_for_quote
            from pages_components.tower_db import save_tower, list_quotes_for_submission
            from core.bound_option import has_bound_option
            # Bulk coverage buttons are now embedded in coverage panels

            # Auto-load quote data when submission changes
            auto_load_quote_for_submission(sub_id)

            # Check if policy is bound - if so, Quote tab is read-only
            is_bound = has_bound_option(sub_id)

            # ─────────────────────────────────────────────────────────────
            # SAVED QUOTE OPTIONS (Read-Only when bound)
            # ─────────────────────────────────────────────────────────────
            render_quote_options_panel(sub_id, readonly=is_bound)

            # Get config from session state (set by quote_options_panel when viewing saved option)
            viewing_saved = is_viewing_saved_option()
            config = {
                "limit": st.session_state.get(f"selected_limit_{sub_id}", 2_000_000),
                "retention": st.session_state.get(f"selected_retention_{sub_id}", 25_000),
                "premium": None,
                "technical_premium": None,
                "risk_adjusted_premium": None,
            }

            # When bound, the card summaries above are sufficient - skip detail panels
            if not is_bound:
                # Sync dropdown values to tower layer 1 (for primary quotes)
                _sync_dropdowns_to_tower(sub_id)

                # Panel order depends on primary vs excess
                current_position = get_current_quote_position(sub_id)
                viewing_quote_id = st.session_state.get("viewing_quote_id")

                if current_position == "excess" and viewing_quote_id:
                    # EXCESS: Tower structure first, then coverage schedule
                    render_tower_panel(sub_id, expanded=True, readonly=is_bound)
                    render_sublimits_panel(sub_id, quote_id=viewing_quote_id, expanded=False)
                else:
                    # PRIMARY: Coverage panel only (no tower - it only shows us)
                    render_coverages_panel(sub_id, expanded=False, readonly=is_bound)

                # Add coverages to config for quote generation
                config["coverages"] = get_coverages_for_quote(sub_id)

                # Endorsements (option-specific - varies by primary/excess/quote)
                render_endorsements_panel(sub_id, expanded=False)

                # Subjectivities (submission-level - shared across options)
                render_subjectivities_panel(sub_id, expanded=False)

            # ─────────────────────────────────────────────────────────────
            # QUOTE DOCUMENTS (one per option)
            # ─────────────────────────────────────────────────────────────
            st.divider()
            st.markdown("##### Quote Documents")

            # Get all quote documents for this submission (not binders)
            from core.document_generator import get_documents
            all_docs = get_documents(sub_id)
            quote_docs = [
                d for d in all_docs
                if d.get("document_type") in ("quote_primary", "quote_excess")
                and d.get("status") != "void"
            ]

            if not quote_docs:
                st.caption("No quotes generated yet. Select an option above and click Generate Quote.")
            else:
                for doc in quote_docs:
                    doc_type = doc.get("type_label", "Quote")
                    doc_number = doc.get("document_number", "")
                    pdf_url = doc.get("pdf_url", "")
                    display_name = doc.get("display_name") or doc.get("quote_name") or ""
                    created_at = doc.get("created_at")
                    date_str = created_at.strftime("%m/%d/%y") if created_at and hasattr(created_at, 'strftime') else ""

                    col1, col2 = st.columns([5, 1])
                    with col1:
                        label = f"{display_name}: {doc_number}" if display_name else f"{doc_type}: {doc_number}"
                        if pdf_url:
                            st.markdown(f"[{label}]({pdf_url})")
                        else:
                            st.text(label)
                    with col2:
                        st.caption(date_str)

        with tab_details:
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
                    "applicant_name",
                    "website",
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
                    applicant_name,
                    website,
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

            # ------------------- Unified Details Panel --------------------
            render_details_panel(sub_id, applicant_name, website, get_conn=get_conn)

        # =================== REVIEW QUEUE TAB ===================
        with tab_review:
            review_summary = render_review_queue_panel(
                submission_id=sub_id,
                expanded=True,
                show_resolved=False,
            )
            if review_summary.get("has_blockers"):
                st.warning("⚠️ Resolve high-priority conflicts before binding this submission.")

        # =================== POLICY TAB ===================
        with tab_policy:
            # Use shared policy panel component (same as admin console)
            from pages_components.policy_panel import render_policy_panel
            render_policy_panel(
                submission_id=sub_id,
                show_sidebar=True,
                show_renewal=True,
                compact=False
            )

        # =================== BENCHMARK TAB ===================
        with tab_benchmark:
            render_benchmarking_panel(sub_id, get_conn)

        # =================== UW TAB ===================
        with tab_uw:
            # Pull submission data for UW tab (same query as Details tab)
            conn = get_conn()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT business_summary, cyber_exposures, nist_controls_summary,
                           bullet_point_summary, ops_embedding, controls_embedding,
                           naics_primary_code, naics_primary_title,
                           naics_secondary_code, naics_secondary_title,
                           industry_tags, annual_revenue, applicant_name
                    FROM submissions WHERE id = %s
                    """,
                    (sub_id,),
                )
                row = cur.fetchone()
                if row:
                    (biz_sum, exp_sum, ctrl_sum, bullet_sum, ops_vec, ctrl_vec,
                     naics_code, naics_title, naics_sec_code, naics_sec_title,
                     industry_tags, annual_revenue, applicant_name) = row
                else:
                    biz_sum = exp_sum = ctrl_sum = bullet_sum = None
                    ops_vec = ctrl_vec = None
                    naics_code = naics_title = naics_sec_code = naics_sec_title = None
                    industry_tags = None
                    annual_revenue = None
                    applicant_name = None

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
                            clear_submission_caches()
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

                # Annual Revenue - Editable
                rev_col1, rev_col2 = st.columns([4, 1])
                with rev_col1:
                    if annual_revenue:
                        st.markdown(f"**Annual Revenue:** ${annual_revenue:,.0f}")
                    else:
                        st.markdown("**Annual Revenue:** Not specified")
                with rev_col2:
                    if st.button("✏️", key=f"edit_rev_{sub_id}", help="Edit Revenue"):
                        st.session_state[f"editing_rev_{sub_id}"] = True

                if st.session_state.get(f"editing_rev_{sub_id}", False):
                    edited_rev = st.number_input(
                        "Annual Revenue ($)",
                        value=int(annual_revenue) if annual_revenue else 0,
                        min_value=0,
                        step=100000,
                        format="%d",
                        key=f"rev_edit_{sub_id}"
                    )
                    col1, col2 = st.columns(2)
                    with col1:
                        if st.button("💾 Save", key=f"save_rev_{sub_id}"):
                            conn = get_conn()
                            with conn.cursor() as cur:
                                cur.execute(
                                    "UPDATE submissions SET annual_revenue = %s WHERE id = %s",
                                    (edited_rev if edited_rev > 0 else None, sub_id)
                                )
                                conn.commit()
                            clear_submission_caches()
                            st.session_state[f"editing_rev_{sub_id}"] = False
                            st.success("Revenue saved!")
                            st.rerun()
                    with col2:
                        if st.button("❌ Cancel", key=f"cancel_rev_{sub_id}"):
                            st.session_state[f"editing_rev_{sub_id}"] = False
                            st.rerun()

                # Industry Classification
                industry_lines = []
                if naics_code and naics_title:
                    industry_lines.append(f"**Primary:** {naics_code} - {naics_title}")
                if naics_sec_code and naics_sec_title:
                    industry_lines.append(f"**Secondary:** {naics_sec_code} - {naics_sec_title}")
                if industry_tags:
                    industry_lines.append(f"**Industry Tags:** {', '.join(industry_tags)}")

                if industry_lines:
                    st.markdown("  \n".join(industry_lines))
    
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
                            clear_submission_caches()
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
                            clear_submission_caches()
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
                            clear_submission_caches()
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
