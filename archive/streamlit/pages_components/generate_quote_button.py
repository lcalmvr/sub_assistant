"""
Generate Quote Button Component
Handles quote generation with PDF output.
"""
from __future__ import annotations

import streamlit as st
from datetime import datetime
from typing import Callable
from utils.tab_state import rerun_on_quote_tab


def render_generate_quote_button(
    sub_id: str,
    get_conn_func: Callable,
    quote_helpers: dict,
    config: dict
):
    """
    Render the Generate Quote button and handle quote generation.

    Args:
        sub_id: Submission ID
        get_conn_func: Function to get DB connection
        quote_helpers: Dict with render_pdf, upload_pdf, save_quote, update_quote functions
        config: Dict with limit, retention, premium from quote_config_inline
    """
    from pages_components.endorsements_panel import get_endorsements_list
    from pages_components.subjectivities_panel import get_subjectivities_list

    # Check if editing existing quote
    loaded_quote_id = st.session_state.get("loaded_quote_id")

    col_btn, col_status = st.columns([1, 2])

    with col_btn:
        if loaded_quote_id:
            btn_label = "Update Quote"
            btn_type = "primary"
        else:
            btn_label = "Generate Quote"
            btn_type = "primary"

        generate_clicked = st.button(btn_label, type=btn_type, use_container_width=True)

    with col_status:
        if loaded_quote_id:
            st.caption(f"Editing quote #{loaded_quote_id[:8]}...")
            if st.button("Cancel Edit", key="cancel_edit"):
                st.session_state.pop("loaded_quote_id", None)
                st.session_state.pop("loaded_quote_data", None)
                rerun_on_quote_tab()

    if generate_clicked:
        if not quote_helpers:
            st.error("Quote generation not available")
            return

        _generate_quote(sub_id, get_conn_func, quote_helpers, config, loaded_quote_id)


def _generate_quote(
    sub_id: str,
    get_conn_func: Callable,
    quote_helpers: dict,
    config: dict,
    loaded_quote_id: str = None
):
    """Execute quote generation."""
    from pages_components.endorsements_panel import get_endorsements_list
    from pages_components.subjectivities_panel import get_subjectivities_list

    with st.spinner("Generating quote..."):
        try:
            from rating_engine.engine import price as rate_quote
            from core.pipeline import parse_controls_from_summary

            # Get helper functions
            render_pdf = quote_helpers.get('render_pdf')
            upload_pdf = quote_helpers.get('upload_pdf')
            save_quote = quote_helpers.get('save_quote')
            update_quote = quote_helpers.get('update_quote')

            if not all([render_pdf, upload_pdf, save_quote]):
                st.error("Quote helpers incomplete")
                return

            # Get submission data
            with get_conn_func().cursor() as cur:
                cur.execute(
                    """
                    SELECT applicant_name, business_summary, annual_revenue,
                           naics_primary_title, bullet_point_summary, nist_controls_summary
                    FROM submissions WHERE id = %s
                    """,
                    (sub_id,)
                )
                sub_data = cur.fetchone()

            if not sub_data:
                st.error("Submission not found")
                return

            applicant_name, biz_summary, revenue, industry, bullet_sum, nist_sum = sub_data

            if not revenue:
                st.error("Annual revenue required for quote generation")
                return

            # Map industry
            industry_slug = _map_industry(industry)

            # Parse controls
            parsed_controls = parse_controls_from_summary(
                bullet_sum or "",
                nist_sum or ""
            )

            # Get endorsements and subjectivities
            position = st.session_state.get(f"quote_position_{sub_id}", "primary")
            endorsements = get_endorsements_list(sub_id, position=position)
            subjectivities = get_subjectivities_list(sub_id)

            # Build quote data
            quote_data = {
                "applicant_name": applicant_name,
                "business_summary": biz_summary,
                "revenue": revenue,
                "industry": industry_slug,
                "limit": config["limit"],
                "retention": config["retention"],
                "controls": parsed_controls,
                "coverage_limits": config.get("coverage_limits", {}),
                "endorsements": endorsements,
                "subjectivities": subjectivities,
                "quote_date": datetime.now().strftime("%Y-%m-%d"),
            }

            # Generate quote
            quote_result = rate_quote(quote_data)

            # Render PDF
            pdf_path = render_pdf(quote_result)

            # Upload to storage
            pdf_url = upload_pdf(pdf_path)

            # Save or update
            if loaded_quote_id and update_quote:
                update_quote(loaded_quote_id, quote_result, pdf_url)
                st.success("Quote updated!")
                st.session_state.pop("loaded_quote_id", None)
                st.session_state.pop("loaded_quote_data", None)
            else:
                quote_id = save_quote(sub_id, quote_result, pdf_url)
                st.success(f"Quote generated! ID: {quote_id}")

            st.markdown(f"[📥 Download PDF]({pdf_url})")

            # Clean up
            pdf_path.unlink()
            rerun_on_quote_tab()

        except Exception as e:
            st.error(f"Error generating quote: {e}")
            import traceback
            st.text(traceback.format_exc())


def _map_industry(industry_name: str) -> str:
    """Map industry name to rating slug."""
    if not industry_name:
        return "Professional_Services_Consulting"

    mapping = {
        "Media Buying Agencies": "Advertising_Marketing_Technology",
        "Advertising Agencies": "Advertising_Marketing_Technology",
        "Marketing Consultants": "Advertising_Marketing_Technology",
        "Software Publishers": "Software_as_a_Service_SaaS",
        "Computer Systems Design Services": "Professional_Services_Consulting",
        "Management Consultants": "Professional_Services_Consulting",
    }
    return mapping.get(industry_name, "Professional_Services_Consulting")
