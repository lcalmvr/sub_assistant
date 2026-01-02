"""
Standalone Rating Panel Component (v2)
Extracted from viewer.py for reusability and alternate rating system integration
"""
import streamlit as st
from datetime import datetime

from rating_engine.engine import price_with_breakdown
import sys
import os
import importlib.util
spec = importlib.util.spec_from_file_location("pipeline", os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "pipeline.py"))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
parse_controls_from_summary = pipeline.parse_controls_from_summary

def _load_quote_parameters_into_session(sub_id: str, quote_data: dict):
    """Load quote parameters into session state for form population"""
    # Load limit and retention with proper text format
    limit = quote_data.get("limit")
    retention = quote_data.get("retention")

    if limit:
        st.session_state[f"selected_limit_{sub_id}"] = limit
        # Convert numeric to text format (e.g., 5000000 -> "5M")
        if limit >= 1_000_000:
            limit_text = f"{limit // 1_000_000}M"
        else:
            limit_text = f"{limit // 1_000}K"
        st.session_state[f"selected_limit_text_{sub_id}"] = limit_text
        # Also update the dropdown widget key to force it to show the new value
        st.session_state[f"limit_dropdown_{sub_id}"] = f"${limit_text}"
        print(f"DEBUG: Loaded limit: ${limit:,} ({limit_text})")  # Debug

    if retention:
        st.session_state[f"selected_retention_{sub_id}"] = retention
        # Convert numeric to text format
        if retention >= 1_000_000:
            retention_text = f"{retention // 1_000_000}M"
        else:
            retention_text = f"{retention // 1_000}K"
        st.session_state[f"selected_retention_text_{sub_id}"] = retention_text
        # Also update the dropdown widget key
        st.session_state[f"retention_dropdown_{sub_id}"] = f"${retention_text}"
        print(f"DEBUG: Loaded retention: ${retention:,} ({retention_text})")  # Debug

    # Load coverage limits
    if "coverage_limits" in quote_data:
        st.session_state[f"coverage_limits_{sub_id}"] = quote_data["coverage_limits"]

    # Load subjectivities (convert to dict format if needed)
    if "subjectivities" in quote_data:
        subj_list = quote_data["subjectivities"]

        if subj_list:
            if isinstance(subj_list[0], dict) and 'id' in subj_list[0]:
                # Already in correct format
                st.session_state[f"subjectivities_{sub_id}"] = subj_list
            elif isinstance(subj_list[0], str):
                # Convert list of strings to ID-based dict format
                converted_list = []
                for i, text in enumerate(subj_list):
                    converted_list.append({
                        'id': i,
                        'text': text
                    })
                st.session_state[f"subjectivities_{sub_id}"] = converted_list
                st.session_state[f"subjectivities_id_counter_{sub_id}"] = len(converted_list)
            else:
                # Unknown format, skip
                pass

    # Load endorsements (convert to dict format if needed)
    if "endorsements" in quote_data:
        endorse_list = quote_data["endorsements"]
        default_endorsements = ["OFAC Compliance", "Service of Suit"]

        if endorse_list:
            if isinstance(endorse_list[0], dict) and 'id' in endorse_list[0]:
                # Already in correct format
                st.session_state[f"endorsements_{sub_id}"] = endorse_list
            elif isinstance(endorse_list[0], str):
                # Convert list of strings to ID-based dict format
                converted_list = []
                for i, text in enumerate(endorse_list):
                    converted_list.append({
                        'id': i,
                        'text': text,
                        'is_default': text in default_endorsements
                    })
                st.session_state[f"endorsements_{sub_id}"] = converted_list
                st.session_state[f"endorsements_id_counter_{sub_id}"] = len(converted_list)
            else:
                # Unknown format, skip
                pass

def render_rating_panel(sub_id: str, get_conn_func, quote_helpers=None):
    """
    Render the complete rating and quote panel for a submission.

    Args:
        sub_id: Submission ID
        get_conn_func: Function that returns database connection
        quote_helpers: Optional dict with quote generation helper functions
                      {'render_pdf': func, 'upload_pdf': func, 'save_quote': func, 'update_quote': func}
    """
    # Check if we need to load quote parameters
    if "loaded_quote_data" in st.session_state and "loaded_quote_id" in st.session_state:
        _load_quote_parameters_into_session(sub_id, st.session_state["loaded_quote_data"])
        # Clear the loaded data flag so we don't reload on every rerun
        st.session_state.pop("loaded_quote_data", None)
        # Show confirmation
        st.success("✅ Quote parameters loaded! Scroll down to see the loaded values.")

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
                _render_with_revenue(sub_id, sub_data, get_conn_func, quote_helpers)
            else:  # Revenue missing
                _render_without_revenue(sub_id, sub_data, get_conn_func, quote_helpers)

def _render_with_revenue(sub_id: str, sub_data: tuple, get_conn_func, quote_helpers=None):
    """Render rating panel when revenue exists"""
    # Map industry name to rating engine slug
    industry_slug = _map_industry_to_slug(sub_data[3])

    # Rating Preview Section
    st.markdown("#### 🔍 Rating Preview")

    # Show prior year rating context if available
    from pages_components.show_prior_panel import render_prior_rating_context
    render_prior_rating_context(sub_id)
    
    # Policy Configuration
    config_col1, config_col2 = st.columns([1, 1])
    
    with config_col1:
        selected_limit = _render_limit_controls(sub_id)

    with config_col2:
        selected_retention = _render_retention_controls(sub_id)

    # Retroactive Date (submission default - applies to all quote options)
    _render_retroactive_date_controls(sub_id, get_conn_func)

    # Auto-generate rating preview
    try:
        # Parse controls from bullet and NIST summaries
        bullet_summary = sub_data[4] or ""  # bullet_point_summary
        nist_summary = sub_data[5] or ""    # nist_controls_summary
        parsed_controls = parse_controls_from_summary(bullet_summary, nist_summary)
        
        # Get coverage limits configuration
        coverage_config = _get_coverage_configuration(sub_id, selected_limit)
        
        quote_data = {
            "industry": industry_slug,
            "revenue": sub_data[2],
            "limit": selected_limit,
            "retention": selected_retention,
            "controls": parsed_controls,
            "coverage_limits": coverage_config,
        }
        
        # Get detailed rating breakdown
        rating_result = price_with_breakdown(quote_data)
        breakdown = rating_result["breakdown"]
        
        # Display premium prominently
        st.markdown("---")
        col_prem, col_info = st.columns([1, 2])
        
        # Calculate Rate Per Million of Limit (RPM)
        rate_per_million_limit = (rating_result['premium'] / selected_limit) * 1_000_000
        
        # Format limit and retention in compact format
        limit_text = f"${selected_limit/1_000_000:.0f}M" if selected_limit >= 1_000_000 else f"${selected_limit/1_000:.0f}K"
        retention_text = f"${selected_retention/1_000:.0f}K" if selected_retention >= 1_000 else f"${selected_retention:,.0f}"
        
        # Format RPM in compact format
        if rate_per_million_limit >= 1000:
            rpm_text = f"${rate_per_million_limit/1000:.1f}K"
        else:
            rpm_text = f"${rate_per_million_limit:.0f}"
        
        with col_prem:
            # Simple approach - just premium and RPM
            premium_line = f"${rating_result['premium']:,} | RPM: {rpm_text}"
            st.metric("Annual Premium", premium_line, help="Based on current configuration")
        
        with col_info:
            st.text("")
        
        # Rating assumptions in expander
        with st.expander("📋 View Detailed Rating Breakdown", expanded=False):
            _render_rating_breakdown(rating_result, breakdown)
        
        # Coverage limits configuration is now displayed above subjectivities
        
        # Additional quote sections
        st.markdown("---")
        
        # Subjectivities section
        with st.expander("📋 Subjectivities", expanded=False):
                
                # Stock subjectivities list
                stock_subjectivities = [
                    "Coverage is subject to policy terms and conditions",
                    "Premium subject to minimum retained premium",
                    "Rate subject to satisfactory inspection",
                    "Subject to completion of application",
                    "Subject to receipt of additional underwriting information",
                    "Coverage bound subject to company acceptance",
                    "Premium subject to audit",
                    "Policy subject to terrorism exclusion",
                    "Subject to cyber security questionnaire completion",
                    "Coverage subject to satisfactory financial review"
                ]
                
                # Initialize session state for subjectivities
                subj_session_key = f"subjectivities_{sub_id}"
                if subj_session_key not in st.session_state:
                    st.session_state[subj_session_key] = []
                
                # Migration: convert old format to new format if needed
                if st.session_state[subj_session_key] and isinstance(st.session_state[subj_session_key][0], str):
                    old_items = st.session_state[subj_session_key].copy()
                    st.session_state[subj_session_key] = []
                    for i, item in enumerate(old_items):
                        st.session_state[subj_session_key].append({'id': i, 'text': item})
                
                subj_id_counter_key = f"subjectivities_id_counter_{sub_id}"
                if subj_id_counter_key not in st.session_state:
                    st.session_state[subj_id_counter_key] = len(st.session_state[subj_session_key])
                
                # Get current items in the main list
                current_items = {subj_data['text'] for subj_data in st.session_state[subj_session_key]}
                
                # Filter out items that are already in the main list from multiselect options
                available_stock = [item for item in stock_subjectivities if item not in current_items]
                
                # Multiselect for stock subjectivities - only show available items
                selected_stock = st.multiselect(
                    "Select common subjectivities:",
                    available_stock,
                    key=f"stock_subj_{sub_id}",
                    help="Choose from pre-defined subjectivities"
                )
                
                # Add selected stock items to main list
                for item in selected_stock:
                    if item not in current_items:
                        st.session_state[subj_session_key].append({
                            'id': st.session_state[subj_id_counter_key],
                            'text': item
                        })
                        st.session_state[subj_id_counter_key] += 1
                        st.rerun()
                
                # Text input for custom subjectivity
                st.markdown("**Add custom subjectivity:**")
                col_text, col_add = st.columns([3, 1])
                
                # Use a counter to reset the input field
                clear_counter_key = f"clear_counter_{sub_id}"
                if clear_counter_key not in st.session_state:
                    st.session_state[clear_counter_key] = 0
                
                with col_text:
                    custom_subj = st.text_input(
                        "",
                        key=f"custom_subj_input_{sub_id}_{st.session_state[clear_counter_key]}",
                        placeholder="Enter custom subjectivity...",
                        label_visibility="collapsed"
                    )
                with col_add:
                    if st.button("Add", key=f"add_subj_{sub_id}"):
                        if custom_subj.strip() and not any(subj_data['text'] == custom_subj.strip() for subj_data in st.session_state[subj_session_key]):
                            st.session_state[subj_session_key].append({
                                'id': st.session_state[subj_id_counter_key],
                                'text': custom_subj.strip()
                            })
                            st.session_state[subj_id_counter_key] += 1
                            st.session_state[clear_counter_key] += 1  # This will create a new input field
                            st.rerun()
                
                # Display current subjectivities with edit/remove options
                if st.session_state[subj_session_key]:
                    st.markdown("**Current Subjectivities:**")
                    
                    # Create a copy of the list to iterate over
                    subj_list = st.session_state[subj_session_key].copy()
                    
                    for i, subj_data in enumerate(subj_list):
                        subj_id_val = subj_data['id']
                        subj_text = subj_data['text']
                        
                        col_text, col_remove = st.columns([7, 1])
                        
                        with col_text:
                            # Show as single-line editable text input with unique ID-based key
                            edited_subj = st.text_input(
                                "",
                                value=subj_text,
                                key=f"edit_subj_{subj_id_val}_{sub_id}",
                                help="Edit text and changes will be saved automatically",
                                label_visibility="collapsed"
                            )
                            # Update if changed immediately in session state
                            if edited_subj != subj_text:
                                # Find the actual item in session state and update it
                                for j, item in enumerate(st.session_state[subj_session_key]):
                                    if item['id'] == subj_id_val:
                                        st.session_state[subj_session_key][j]['text'] = edited_subj
                                        break
                        
                        with col_remove:
                            # Use a callback approach to handle deletion
                            remove_key = f"remove_subj_{subj_id_val}_{sub_id}"
                            if st.button("🗑️", key=remove_key, help="Remove this subjectivity"):
                                # Immediately remove from session state
                                st.session_state[subj_session_key] = [
                                    item for item in st.session_state[subj_session_key] 
                                    if item['id'] != subj_id_val
                                ]
                                st.rerun()
                else:
                    st.caption("No subjectivities added yet")
        
        # Endorsements section
        with st.expander("📄 Endorsements", expanded=False):
            from pages_components.endorsement_selector import (
                render_endorsement_selector,
                initialize_from_existing,
                get_endorsement_names_for_quote,
            )

            # Initialize from existing quote endorsements if loading
            existing_endorsements = quote_data.get("endorsements", [])
            if existing_endorsements:
                initialize_from_existing(sub_id, existing_endorsements, position="primary")

            # Render the endorsement selector
            selected_endorsements = render_endorsement_selector(
                submission_id=sub_id,
                quote_data=quote_data,
                position="primary"
            )

            # Store count for display
            st.session_state[f"endorsement_count_{sub_id}"] = len(selected_endorsements)
        
        # Quote generation section
        _render_quote_generation(sub_id, quote_data, sub_data, get_conn_func, quote_helpers)
    
    except Exception as e:
        st.error(f"Error calculating premium: {e}")

def _render_without_revenue(sub_id: str, sub_data: tuple, get_conn_func, quote_helpers=None):
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
            pass
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
            
            # Get coverage limits configuration
            coverage_config = _get_coverage_configuration(sub_id, selected_limit_temp, suffix="_temp")
            
            quote_data = {
                "industry": industry_slug,
                "revenue": preview_revenue,
                "limit": selected_limit_temp,
                "retention": selected_retention_temp,
                "controls": parsed_controls,
                "coverage_limits": coverage_config,
            }
            
            rating_result = price_with_breakdown(quote_data)
            breakdown = rating_result["breakdown"]
            
            st.markdown("---")
            col_prem, col_info = st.columns([1, 2])
            
            with col_prem:
                st.metric("Temp Premium", f"${rating_result['premium']:,}", help="Temporary rating with entered revenue")
            
            with col_info:
                st.info(f"Using revenue: ${preview_revenue:,} • Rate: ${breakdown['base_rate_per_1k']:.2f} per $1K revenue")
            
            with st.expander("📋 View Detailed Rating Breakdown", expanded=False):
                _render_rating_breakdown(rating_result, breakdown)
        
        except Exception as e:
            st.error(f"Error calculating premium: {e}")

def _render_limit_controls(sub_id: str, suffix: str = "") -> int:
    """Render policy limit controls"""
    st.markdown("**Policy Limit:**")

    limits = [
        (1_000_000, "1M"),
        (2_000_000, "2M"),
        (3_000_000, "3M"),
        (5_000_000, "5M")
    ]

    # Create dropdown options including custom option
    limit_options = [f"${limit_text}" for _, limit_text in limits] + ["Enter Custom Amount"]
    limit_values = {f"${limit_text}": limit_val for limit_val, limit_text in limits}

    # Get current selection or default to 2M
    current_limit = st.session_state.get(f"selected_limit{suffix}_{sub_id}", 2_000_000)
    current_limit_text = st.session_state.get(f"selected_limit{suffix}_text_{sub_id}", "2M")

    print(f"DEBUG: Current limit in session: {current_limit:,}, text: {current_limit_text}")  # Debug

    # Find default index
    default_option = f"${current_limit_text}"
    default_index = limit_options.index(default_option) if default_option in limit_options else 1

    # Set the widget's session state key to force the dropdown to show the loaded value
    widget_key = f"limit_dropdown{suffix}_{sub_id}"
    if widget_key not in st.session_state:
        st.session_state[widget_key] = default_option

    # Dropdown for policy limit selection
    selected_option = st.selectbox(
        "Select Policy Limit:",
        options=limit_options,
        index=default_index,
        key=widget_key,
        help="Choose from standard policy limits or enter custom amount"
    )

    # Handle selection
    if selected_option == "Enter Custom Amount":
        # Show custom input field
        limit_input = st.text_input(
            "Enter Custom Policy Limit (e.g., 2M, 500K):",
            value="",
            key=f"limit_text_input{suffix}_{sub_id}",
            help="Enter limit using M for millions (2M = $2,000,000) or K for thousands (500K = $500,000)",
            placeholder="Enter custom amount (e.g., 2M, 750K, 4M)"
        )

        # Process custom input
        if limit_input.strip():
            parsed_limit = _parse_dollar_input(limit_input)
            if parsed_limit > 0:
                st.session_state[f"selected_limit{suffix}_{sub_id}"] = parsed_limit
                selected_limit = parsed_limit
            else:
                st.error("Invalid format. Use: 2M, 500K, or 2000000")
                selected_limit = current_limit
        else:
            selected_limit = current_limit
    else:
        # Use dropdown selection
        selected_limit = limit_values[selected_option]
        selected_text = selected_option[1:]  # Remove the $ prefix
        st.session_state[f"selected_limit{suffix}_{sub_id}"] = selected_limit
        st.session_state[f"selected_limit{suffix}_text_{sub_id}"] = selected_text

    return selected_limit

def _render_retention_controls(sub_id: str, suffix: str = "") -> int:
    """Render retention/deductible controls"""
    st.markdown("**Retention/Deductible:**")

    retentions = [
        (10_000, "10K"),
        (25_000, "25K"),
        (50_000, "50K"),
        (100_000, "100K"),
        (250_000, "250K"),
        (500_000, "500K")
    ]

    # Create dropdown options including custom option
    retention_options = [f"${ret_text}" for _, ret_text in retentions] + ["Enter Custom Amount"]
    retention_values = {f"${ret_text}": ret_val for ret_val, ret_text in retentions}

    # Get current selection or default to 25K
    current_retention = st.session_state.get(f"selected_retention{suffix}_{sub_id}", 25_000)
    current_retention_text = st.session_state.get(f"selected_retention{suffix}_text_{sub_id}", "25K")

    # Find default index
    default_option = f"${current_retention_text}"
    default_index = retention_options.index(default_option) if default_option in retention_options else 1

    # Dropdown for retention selection
    selected_option = st.selectbox(
        "Select Retention/Deductible:",
        options=retention_options,
        index=default_index,
        key=f"retention_dropdown{suffix}_{sub_id}",
        help="Choose from standard retention amounts or enter custom amount"
    )

    # Handle selection
    if selected_option == "Enter Custom Amount":
        # Show custom input field
        retention_input = st.text_input(
            "Enter Custom Retention Amount (e.g., 25K, 100K):",
            value="",
            key=f"retention_text_input{suffix}_{sub_id}",
            help="Enter retention using K for thousands (25K = $25,000) or full amount (25000)",
            placeholder="Enter custom amount (e.g., 25K, 75K, 150K)"
        )

        # Process custom input
        if retention_input.strip():
            parsed_retention = _parse_dollar_input(retention_input)
            if parsed_retention > 0:
                st.session_state[f"selected_retention{suffix}_{sub_id}"] = parsed_retention
                selected_retention = parsed_retention
            else:
                st.error("Invalid format. Use: 25K, 100K, or 25000")
                selected_retention = current_retention
        else:
            selected_retention = current_retention
    else:
        # Use dropdown selection
        selected_retention = retention_values[selected_option]
        selected_text = selected_option[1:]  # Remove the $ prefix
        st.session_state[f"selected_retention{suffix}_{sub_id}"] = selected_retention
        st.session_state[f"selected_retention{suffix}_text_{sub_id}"] = selected_text

    return selected_retention


def _render_retroactive_date_controls(sub_id: str, get_conn_func):
    """
    Render retroactive date controls - sets the default for ALL quote options.

    This is a submission-level setting stored in submissions.default_retroactive_date.
    """
    from utils.tab_state import on_change_stay_on_rating

    st.markdown("**Retroactive Date:**")

    # Fetch current default from database
    current_retro = None
    with get_conn_func().cursor() as cur:
        cur.execute(
            "SELECT default_retroactive_date FROM submissions WHERE id = %s",
            (sub_id,)
        )
        row = cur.fetchone()
        if row and row[0]:
            current_retro = row[0]

    # Preset options
    presets = ["", "Full Prior Acts", "Inception"]

    # Determine if current value is a preset or custom
    is_custom = current_retro and current_retro not in presets

    # Build dropdown options
    dropdown_options = presets + ["Custom..."]

    # Find default index
    if is_custom:
        default_idx = len(presets)  # "Custom..."
    elif current_retro in presets:
        default_idx = presets.index(current_retro)
    else:
        default_idx = 0  # Empty/not set

    col1, col2 = st.columns([1, 1])

    with col1:
        selected = st.selectbox(
            "Select Retroactive Date:",
            options=dropdown_options,
            index=default_idx,
            key=f"retro_select_{sub_id}",
            on_change=on_change_stay_on_rating,
            help="Applies to all quote options. Select a preset or enter custom text."
        )

    # Handle selection
    if selected == "Custom...":
        with col2:
            custom_value = st.text_input(
                "Custom Retro Date:",
                value=current_retro if is_custom else "",
                key=f"retro_text_{sub_id}",
                placeholder="e.g., 1/1/2020, Inception for Tech E&O",
                help="Enter a date or descriptive text"
            )
            final_value = custom_value.strip() if custom_value else None
    else:
        final_value = selected if selected else None

    # Save to database if changed
    if final_value != current_retro:
        with get_conn_func().cursor() as cur:
            cur.execute(
                "UPDATE submissions SET default_retroactive_date = %s WHERE id = %s",
                (final_value, sub_id)
            )
        # Show confirmation
        if final_value:
            st.caption(f"Saved: {final_value}")


def _get_coverage_configuration(sub_id: str, aggregate_limit: int, suffix: str = "") -> dict:
    """Get comprehensive coverage limits configuration"""
    
    # Add coverage configuration expander
    with st.expander("🛡️ Coverage Limits Configuration", expanded=False):
        st.markdown("**Coverage Structure:**")
        st.info(f"Aggregate Limit: ${aggregate_limit:,}")
        
        # Standard coverages (default to full aggregate)
        standard_coverages = {}
        st.markdown("**Standard Coverages (Default to Aggregate Limit):**")
        
        standard_coverage_names = [
            "Standard Coverage 1", "Standard Coverage 2", "Standard Coverage 3", 
            "Standard Coverage 4", "Standard Coverage 5", "Standard Coverage 6",
            "Standard Coverage 7", "Standard Coverage 8", "Standard Coverage 9", 
            "Standard Coverage 10"
        ]
        
        # Display standard coverages in a compact format
        for i, coverage_name in enumerate(standard_coverage_names):
            default_limit = aggregate_limit
            session_key = f"coverage_{i+1}_limit{suffix}_{sub_id}"
            
            if session_key not in st.session_state:
                st.session_state[session_key] = default_limit
            
            standard_coverages[coverage_name] = st.session_state[session_key]
        
        st.caption("Standard coverages automatically set to aggregate limit")
        
        # Sublimit coverages (configurable)  
        st.markdown("**Sublimit Coverages (Configurable):**")
        
        sublimit_coverage_names = [
            "Social Engineering", "Funds Transfer Fraud", "Invoice Manipulation",
            "Telecommunications Fraud", "Cryptojacking"
        ]
        
        # Quick select buttons for common sublimit amounts
        button_cols = st.columns([1, 1, 1, 4])
        quick_amounts = [(100_000, "100K"), (250_000, "250K"), (500_000, "500K")]
        
        for i, (amount, label) in enumerate(quick_amounts):
            with button_cols[i]:
                if st.button(f"${label}", key=f"quick_sublimit_{label.lower()}{suffix}_{sub_id}"):
                    # Apply this amount to all sublimit coverages
                    for j in range(len(sublimit_coverage_names)):
                        session_key = f"sublimit_{j+1}_limit{suffix}_{sub_id}"
                        text_session_key = f"sublimit_{j+1}_text{suffix}_{sub_id}"
                        st.session_state[session_key] = amount
                        st.session_state[text_session_key] = label
                    st.rerun()
        
        sublimit_coverages = {}
        
        # Default sublimit amounts
        default_sublimits = [100_000, 250_000, 500_000, 1_000_000, 500_000]
        
        # Stack sublimit coverages vertically for compact display
        # Create a narrow column just wide enough for the longest label ("Telecommunications Fraud")
        col_narrow, col_wide = st.columns([0.35, 0.65])
        
        with col_narrow:
            for i, (coverage_name, default_sublimit) in enumerate(zip(sublimit_coverage_names, default_sublimits)):
                session_key = f"sublimit_{i+1}_limit{suffix}_{sub_id}"
                text_session_key = f"sublimit_{i+1}_text{suffix}_{sub_id}"
                
                # Initialize session state
                if session_key not in st.session_state:
                    st.session_state[session_key] = default_sublimit
                    st.session_state[text_session_key] = _format_limit_display(default_sublimit)
                
                # Process the input and update session state first
                current_input = st.session_state.get(text_session_key, _format_limit_display(default_sublimit))
                parsed_current = _parse_dollar_input(current_input)
                
                # Create label with confirmed amount
                if parsed_current > 0 and parsed_current <= aggregate_limit:
                    label_text = f"{coverage_name}: ✓ ${parsed_current:,}"
                else:
                    label_text = f"{coverage_name}:"
                
                # Text input with updated label
                limit_input = st.text_input(
                    label_text,
                    value=current_input,
                    key=f"sublimit_{i+1}_input{suffix}_{sub_id}",
                    help="Enter limit using K/M format (e.g., 100K, 1M)"
                )
                
                # Process the new input and update session state
                parsed_limit = _parse_dollar_input(limit_input)
                if parsed_limit > 0:
                    if parsed_limit <= aggregate_limit:  # Sublimit can't exceed aggregate
                        st.session_state[session_key] = parsed_limit
                        st.session_state[text_session_key] = limit_input
                        sublimit_coverages[coverage_name] = parsed_limit
                    else:
                        st.error(f"Cannot exceed aggregate limit of ${aggregate_limit:,}")
                        sublimit_coverages[coverage_name] = st.session_state[session_key]
                else:
                    if limit_input.strip():
                        st.error("Invalid format")
                    sublimit_coverages[coverage_name] = st.session_state[session_key]
        
        # Combine all coverage limits
        all_coverage_limits = {**standard_coverages, **sublimit_coverages}
        
        return {
            "aggregate_limit": aggregate_limit,
            "standard_coverages": standard_coverages,
            "sublimit_coverages": sublimit_coverages,
            "all_coverages": all_coverage_limits
        }

def _format_limit_display(amount: int) -> str:
    """Format dollar amount for display (e.g., 1000000 -> '1M')"""
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"{amount // 1_000_000}M"
    elif amount >= 1_000 and amount % 1_000 == 0:
        return f"{amount // 1_000}K"
    else:
        return str(amount)

def _render_rating_breakdown(rating_result: dict, breakdown: dict):
    """Render detailed rating breakdown"""
    col_left, col_right = st.columns([1, 1])
    
    with col_left:
        st.markdown(f"""**Industry:** {breakdown['industry'].replace('_', ' ')}  
**Hazard Class:** {breakdown['hazard_class']} (1=lowest risk, 5=highest)  
**Revenue Band:** {breakdown['revenue_band']}  
**Base Rate:** ${breakdown['base_rate_per_1k']:.2f} per $1K revenue""")
    
    with col_right:
        st.markdown(f"""**Policy Limit:** ${rating_result['limit']:,}  
**Limit Factor:** {breakdown['limit_factor']:.2f}x  
**Retention/Deductible:** ${rating_result['retention']:,}  
**Retention Factor:** {breakdown['retention_factor']:.2f}x""")
    
    # Show control modifiers if any
    if breakdown['control_modifiers']:
        control_lines = ["**Control Adjustments:**"]
        for mod in breakdown['control_modifiers']:
            modifier_pct = mod['modifier'] * 100
            sign = "+" if modifier_pct > 0 else ""
            control_lines.append(f"• {mod['reason']}: {sign}{modifier_pct:.1f}%")
        st.markdown("  \n".join(control_lines))
    else:
        st.markdown("**Control Adjustments:** None applied")
    
    # Show calculation steps
    calc_lines = [
        "**Premium Calculation:**",
        f"1. Base Premium: ${breakdown['base_premium']:,.0f}",
        f"2. After Limit Factor: ${breakdown['premium_after_limit']:,.0f}",
        f"3. After Retention Factor: ${breakdown['premium_after_retention']:,.0f}",
        f"4. After Control Adjustments: ${breakdown['premium_after_controls']:,.0f}",
        f"5. **Final Premium (rounded):** ${breakdown['final_premium']:,}"
    ]
    st.markdown("  \n".join(calc_lines))

def _render_quote_generation(sub_id: str, quote_data: dict, sub_data: tuple, get_conn_func, quote_helpers=None):
    """Render complete quote generation section"""

    # Check if a quote is loaded
    loaded_quote_id = st.session_state.get("loaded_quote_id")

    # Show different buttons based on whether a quote is loaded
    if loaded_quote_id:
        st.info(f"✏️ Editing loaded quote. You can update the existing quote or save as a new option.")
        col1, col2, col3 = st.columns([2, 2, 1])
        with col1:
            update_clicked = st.button("Update This Quote", key=f"update_quote_{sub_id}", type="primary")
        with col2:
            new_clicked = st.button("Save as New Quote", key=f"save_new_quote_{sub_id}")
        with col3:
            if st.button("Cancel", key=f"cancel_edit_{sub_id}"):
                st.session_state.pop("loaded_quote_id", None)
                st.rerun()

        generate_clicked = update_clicked or new_clicked
        is_update = update_clicked
    else:
        generate_clicked = st.button("Generate Quote", key=f"generate_quote_{sub_id}", type="primary")
        is_update = False

    if generate_clicked:
        if not quote_helpers:
            st.error("Quote generation not available - helper functions not provided")
            return
            
        with st.spinner("Generating quote..."):
            try:
                from datetime import datetime
                from rating_engine.engine import price as rate_quote
                
                # Get helper functions from the passed dictionary
                _render_quote_pdf = quote_helpers.get('render_pdf')
                _upload_pdf = quote_helpers.get('upload_pdf')
                _save_quote_row = quote_helpers.get('save_quote')
                _update_quote_row = quote_helpers.get('update_quote')

                if not all([_render_quote_pdf, _upload_pdf, _save_quote_row]):
                    st.error("Quote generation helpers incomplete")
                    return

                if is_update and not _update_quote_row:
                    st.error("Update quote helper not available")
                    return
                
                # Extract text-only lists for quote generation
                subjectivities_text = []
                if f"subjectivities_{sub_id}" in st.session_state:
                    subj_data = st.session_state[f"subjectivities_{sub_id}"]
                    if subj_data:
                        if isinstance(subj_data[0], dict):
                            subjectivities_text = [item['text'] for item in subj_data]
                        else:
                            subjectivities_text = subj_data  # backward compatibility
                
                # Get endorsements from the new selector
                from pages_components.endorsement_selector import get_endorsement_names_for_quote
                endorsements_text = get_endorsement_names_for_quote(
                    sub_id,
                    quote_data,
                    position="primary"
                )
                
                # Enhanced quote data with complete submission information
                enhanced_quote_data = {
                    "applicant_name": sub_data[0],  # applicant_name
                    "business_summary": sub_data[1],  # business_summary 
                    "revenue": quote_data["revenue"],
                    "industry": quote_data["industry"],
                    "limit": quote_data["limit"],
                    "retention": quote_data["retention"],
                    "controls": quote_data["controls"],
                    "coverage_limits": quote_data["coverage_limits"],
                    "subjectivities": subjectivities_text,
                    "endorsements": endorsements_text,
                    "quote_date": datetime.now().strftime("%Y-%m-%d"),
                }
                
                # Generate quote using rating engine
                quote_result = rate_quote(enhanced_quote_data)
                
                # Render PDF
                pdf_path = _render_quote_pdf(quote_result)
                
                # Upload to storage
                pdf_url = _upload_pdf(pdf_path)

                # Save or update quote record based on mode
                if is_update:
                    _update_quote_row(loaded_quote_id, quote_result, pdf_url)
                    st.success(f"✅ Quote updated successfully!")
                    st.session_state.pop("loaded_quote_id", None)  # Clear loaded quote after update
                else:
                    quote_id = _save_quote_row(sub_id, quote_result, pdf_url)
                    st.success(f"✅ Quote generated successfully! ID: {quote_id}")

                st.markdown(f"[📥 Download Quote PDF]({pdf_url})")

                # Clean up temp file
                pdf_path.unlink()

                # Trigger rerun to refresh the saved quotes list
                st.session_state["_active_tab"] = "Rating"
                st.rerun()
                
            except Exception as e:
                st.error(f"Error generating quote: {e}")
                import traceback
                st.text(f"Debug info: {traceback.format_exc()}")

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
