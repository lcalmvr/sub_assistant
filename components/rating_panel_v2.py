"""
Standalone Rating Panel Component (v2)
Extracted from viewer.py for reusability and alternate rating system integration
"""
import streamlit as st
from datetime import datetime

from rating_engine.engine import price_with_breakdown
from app.pipeline import parse_controls_from_summary

def render_rating_panel(sub_id: str, get_conn_func):
    """
    Render the complete rating and quote panel for a submission.
    
    Args:
        sub_id: Submission ID
        get_conn_func: Function that returns database connection
    """
    with st.expander("⭐ Rate & Quote", expanded=False):
        # Get submission data for both preview and quote generation
        with get_conn_func().cursor() as cur:
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
                _render_with_revenue(sub_id, sub_data, get_conn_func)
            else:  # Revenue missing
                _render_without_revenue(sub_id, sub_data, get_conn_func)

def _render_with_revenue(sub_id: str, sub_data: tuple, get_conn_func):
    """Render rating panel when revenue exists"""
    # Map industry name to rating engine slug
    industry_slug = _map_industry_to_slug(sub_data[3])
    
    # Rating Preview Section
    st.markdown("#### 🔍 Rating Preview")
    
    # Policy Configuration
    config_col1, config_col2 = st.columns([1, 1])
    
    with config_col1:
        selected_limit = _render_limit_controls(sub_id)
    
    with config_col2:
        selected_retention = _render_retention_controls(sub_id)
    
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
            _render_rating_breakdown(rating_result, breakdown)
        
        # Quote generation section
        _render_quote_generation(sub_id, quote_data, sub_data, get_conn_func)
    
    except Exception as e:
        st.error(f"Error calculating premium: {e}")

def _render_without_revenue(sub_id: str, sub_data: tuple, get_conn_func):
    """Render rating panel when revenue is missing"""
    st.markdown("#### 🔍 Rating Preview")
    st.warning("Annual revenue is required for rating preview.")
    
    # Revenue input
    rev_col1, rev_col2 = st.columns([3, 1])
    
    with rev_col1:
        revenue_input = st.text_input(
            "Annual Revenue (enter amount like: 1M, 500K, or 1000000)",
            value="1M",
            key=f"preview_revenue_text_{sub_id}",
            help="Enter revenue using M for millions (1M = $1,000,000) or K for thousands (500K = $500,000)"
        )
        preview_revenue = _parse_dollar_input(revenue_input)
        if preview_revenue > 0:
            st.caption(f"Parsed as: ${preview_revenue:,}")
        else:
            st.error("Invalid format. Use: 1M, 500K, or 1000000")
    
    with rev_col2:
        if st.button("💾 Save to DB", key=f"save_revenue_inline_{sub_id}", help="Save revenue to database"):
            if preview_revenue > 0:
                try:
                    with get_conn_func().cursor() as cur:
                        cur.execute(
                            "UPDATE submissions SET annual_revenue = %s WHERE id = %s",
                            (preview_revenue, sub_id)
                        )
                    st.success("Saved!")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")
            else:
                st.error("Enter valid revenue first")
    
    # Policy Configuration for temp scenario
    config_col1, config_col2 = st.columns([1, 1])
    
    with config_col1:
        selected_limit_temp = _render_limit_controls(sub_id, suffix="_temp")
    
    with config_col2:
        selected_retention_temp = _render_retention_controls(sub_id, suffix="_temp")
    
    # Generate temp rating if revenue valid
    if preview_revenue > 0:
        try:
            industry_slug = _map_industry_to_slug(sub_data[3])
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
            
            st.markdown("---")
            col_prem, col_info = st.columns([1, 2])
            
            with col_prem:
                st.metric("Temp Premium", f"${rating_result['premium']:,}", help="Temporary rating with entered revenue")
            
            with col_info:
                st.info(f"Using revenue: ${preview_revenue:,} • Hazard Class: {breakdown['hazard_class']}")
            
            with st.expander("📋 View Detailed Rating Breakdown", expanded=False):
                _render_rating_breakdown(rating_result, breakdown)
        
        except Exception as e:
            st.error(f"Error calculating premium: {e}")

def _render_limit_controls(sub_id: str, suffix: str = "") -> int:
    """Render policy limit controls"""
    st.markdown("**Policy Limit:**")
    button_cols = st.columns([1, 1, 1, 1, 4])
    
    limits = [
        (1_000_000, "1M"),
        (2_000_000, "2M"), 
        (3_000_000, "3M"),
        (5_000_000, "5M")
    ]
    
    for i, (limit_val, limit_text) in enumerate(limits):
        with button_cols[i]:
            if st.button(f"${limit_text}", key=f"limit_{limit_text.lower()}{suffix}_{sub_id}"):
                st.session_state[f"selected_limit{suffix}_{sub_id}"] = limit_val
                st.session_state[f"selected_limit{suffix}_text_{sub_id}"] = limit_text
                st.rerun()
    
    # Text input for custom limit
    current_limit = st.session_state.get(f"selected_limit{suffix}_{sub_id}", 2_000_000)
    current_limit_text = st.session_state.get(f"selected_limit{suffix}_text_{sub_id}", "2M")
    
    limit_input = st.text_input(
        "Policy Limit (e.g., 2M, 500K)",
        value=current_limit_text,
        key=f"limit_text_input{suffix}_{sub_id}",
        help="Enter limit using M for millions (2M = $2,000,000) or K for thousands (500K = $500,000)"
    )
    
    parsed_limit = _parse_dollar_input(limit_input)
    if parsed_limit > 0:
        st.session_state[f"selected_limit{suffix}_{sub_id}"] = parsed_limit
        selected_limit = parsed_limit
        st.caption(f"Parsed as: ${parsed_limit:,}")
    else:
        selected_limit = current_limit
        if limit_input.strip():
            st.error("Invalid format. Use: 2M, 500K, or 2000000")
    
    return selected_limit

def _render_retention_controls(sub_id: str, suffix: str = "") -> int:
    """Render retention/deductible controls"""
    st.markdown("**Retention/Deductible:**")
    ret_button_cols = st.columns([1, 1, 1, 1, 1, 1, 2])
    
    retentions = [
        (10_000, "10K"),
        (25_000, "25K"),
        (50_000, "50K"), 
        (100_000, "100K"),
        (250_000, "250K"),
        (500_000, "500K")
    ]
    
    for i, (ret_val, ret_text) in enumerate(retentions):
        with ret_button_cols[i]:
            if st.button(f"${ret_text}", key=f"ret_{ret_text.lower()}{suffix}_{sub_id}"):
                st.session_state[f"selected_retention{suffix}_{sub_id}"] = ret_val
                st.session_state[f"selected_retention{suffix}_text_{sub_id}"] = ret_text
                st.rerun()
    
    # Text input for custom retention
    current_retention = st.session_state.get(f"selected_retention{suffix}_{sub_id}", 25_000)
    current_retention_text = st.session_state.get(f"selected_retention{suffix}_text_{sub_id}", "25K")
    
    retention_input = st.text_input(
        "Retention Amount (e.g., 25K, 100K)",
        value=current_retention_text,
        key=f"retention_text_input{suffix}_{sub_id}",
        help="Enter retention using K for thousands (25K = $25,000) or full amount (25000)"
    )
    
    parsed_retention = _parse_dollar_input(retention_input)
    if parsed_retention > 0:
        st.session_state[f"selected_retention{suffix}_{sub_id}"] = parsed_retention
        selected_retention = parsed_retention
        st.caption(f"Parsed as: ${parsed_retention:,}")
    else:
        selected_retention = current_retention
        if retention_input.strip():
            st.error("Invalid format. Use: 25K, 100K, or 25000")
    
    return selected_retention

def _render_rating_breakdown(rating_result: dict, breakdown: dict):
    """Render detailed rating breakdown"""
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

def _render_quote_generation(sub_id: str, quote_data: dict, sub_data: tuple, get_conn_func):
    """Render quote generation section (simplified for now)"""
    st.markdown("---")
    st.markdown("#### 📄 Generate Quote")
    
    if st.button("Generate Quote", key=f"generate_quote_{sub_id}"):
        st.info("Quote generation functionality to be implemented")

# Helper functions
def _map_industry_to_slug(industry_name: str) -> str:
    """Map NAICS industry names to rating engine slugs"""
    industry_mapping = {
        "Media Buying Agencies": "Advertising_Marketing_Technology",
        "Advertising Agencies": "Advertising_Marketing_Technology", 
        "Marketing Consultants": "Advertising_Marketing_Technology",
        "Software Publishers": "Software_as_a_Service_SaaS",
        "Computer Systems Design Services": "Professional_Services_Consulting",
        "Management Consultants": "Professional_Services_Consulting",
    }
    return industry_mapping.get(industry_name, "Professional_Services_Consulting")

def _parse_dollar_input(value_str: str) -> int:
    """Parse dollar input with M/K suffixes"""
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