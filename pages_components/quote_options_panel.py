"""
Quote Options Panel Component
Displays saved quote options with a single-row layout: Dropdown | + Add | Bind | Delete.
Adding a new option clones settings from the currently loaded quote.
"""
from __future__ import annotations

import streamlit as st
from pages_components.tower_db import (
    list_quotes_for_submission,
    get_quote_by_id,
    delete_tower,
    update_quote_field,
    save_tower,
    get_conn,
)
from core.bound_option import bind_option, unbind_option, get_bound_option, has_bound_option

# Import shared premium calculator - single source of truth for premium calculations
from rating_engine.premium_calculator import calculate_premium_for_submission
from utils.quote_formatting import format_currency, generate_quote_name


def _format_premium(amount: float) -> str:
    """Format premium for display."""
    if not amount:
        return "—"
    if amount >= 1_000_000:
        return f"${amount/1_000_000:.1f}M"
    if amount >= 1_000:
        return f"${amount/1_000:.0f}K"
    return f"${amount:,.0f}"


def _parse_currency(val) -> float:
    """Parse currency input including K/M notation."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return None
    try:
        if s.endswith("K"):
            return float(s[:-1]) * 1_000
        if s.endswith("M"):
            return float(s[:-1]) * 1_000_000
        return float(s)
    except Exception:
        return None


def render_quote_options_panel(sub_id: str, readonly: bool = False):
    """
    Render saved quote options as a dropdown selector with action buttons.

    Args:
        sub_id: Submission ID
        readonly: If True, render in read-only mode (for post-bind state)
    """
    if not sub_id:
        st.warning("No submission selected.")
        return

    # Check if policy is bound - if so, force readonly mode
    bound_option = get_bound_option(sub_id)
    is_bound = bound_option is not None
    if is_bound:
        readonly = True

    # Get all saved quote options for this submission
    all_quotes = list_quotes_for_submission(sub_id)

    # Show prior year quote context if available
    from pages_components.show_prior_panel import render_prior_quote_context
    render_prior_quote_context(sub_id)

    if not all_quotes and not readonly:
        # No quotes yet - show simple add buttons
        col_primary, col_excess, col_spacer = st.columns([1, 1, 2])
        with col_primary:
            if st.button("Add Primary", key=f"add_primary_empty_{sub_id}", use_container_width=True):
                _create_primary_option(sub_id, [], None)
        with col_excess:
            if st.button("Add Excess", key=f"add_excess_empty_{sub_id}", use_container_width=True):
                st.session_state[f"show_excess_dialog_{sub_id}"] = True
        if st.session_state.get(f"show_excess_dialog_{sub_id}"):
            _render_excess_option_dialog(sub_id, [])
        return
    elif not all_quotes:
        st.caption("No saved quote options.")
        return

    # Build dropdown options with bound indicator
    # Quote name already includes date in format: "$1M x $25K - 12.17.25"
    quote_options = {}
    bound_quote_id = None
    for quote in all_quotes:
        quote_id = quote["id"]
        quote_name = quote.get("quote_name", "Unnamed Option")
        is_bound = quote.get("is_bound", False)

        if is_bound:
            bound_quote_id = quote_id
            label = f"✓ {quote_name} (BOUND)"
        else:
            label = quote_name

        quote_options[quote_id] = {
            "label": label,
            "name": quote_name,
            "is_bound": is_bound,
        }

    # Currently viewing quote
    viewing_quote_id = st.session_state.get("viewing_quote_id")

    # Determine default selection:
    # 1. If already viewing a quote, keep that
    # 2. Else if there's a bound option, select that
    # 3. Else select the most recently created option
    if not viewing_quote_id or viewing_quote_id not in quote_options:
        if bound_quote_id:
            # Auto-select bound option
            default_quote_id = bound_quote_id
        else:
            # Find most recently created option
            most_recent = max(all_quotes, key=lambda q: q.get("created_at") or "")
            default_quote_id = most_recent["id"]

        # Auto-load the default option
        if default_quote_id:
            _view_quote(default_quote_id)
            viewing_quote_id = default_quote_id

    # Layout depends on readonly mode
    if readonly:
        # Post-bind: Show card summaries instead of dropdown
        _render_bound_quote_cards(sub_id, all_quotes, bound_option, viewing_quote_id)

        # Override toggle - only show if user wants to switch options
        if st.checkbox("Override: View different option", key=f"override_bound_{sub_id}", help="Switch to a different quote option for reference"):
            st.warning("⚠️ Viewing a different option. The bound option remains unchanged.")
            selected_id = st.selectbox(
                "Select option to view",
                options=list(quote_options.keys()),
                format_func=lambda x: quote_options[x]["label"] if x in quote_options else x,
                index=list(quote_options.keys()).index(viewing_quote_id) if viewing_quote_id and viewing_quote_id in quote_options else 0,
                key="saved_quote_selector_override",
            )
            if selected_id and selected_id != viewing_quote_id:
                _view_quote(selected_id)
    else:
        # Full edit mode: Two rows - buttons on top, dropdown below
        # Row 1: Action buttons (Add, Delete, Quote, Bind)
        col_add, col_delete, col_quote, col_bind = st.columns(4)

        with col_add:
            with st.popover("Add", use_container_width=True):
                if st.button("Primary", key=f"add_primary_{sub_id}", use_container_width=True):
                    _create_primary_option(sub_id, all_quotes, viewing_quote_id)
                if st.button("Excess", key=f"add_excess_{sub_id}", use_container_width=True):
                    st.session_state[f"show_excess_dialog_{sub_id}"] = True
                    st.rerun()

        with col_delete:
            delete_disabled = not viewing_quote_id
            if st.button("Delete", key="delete_selected_btn", use_container_width=True, disabled=delete_disabled):
                if viewing_quote_id:
                    _delete_quote(viewing_quote_id, viewing_quote_id)

        with col_quote:
            quote_disabled = not viewing_quote_id
            if st.button("Quote", key="generate_quote_btn", use_container_width=True, disabled=quote_disabled, type="primary"):
                if viewing_quote_id:
                    st.session_state[f"show_generate_dialog_{sub_id}"] = True

        with col_bind:
            bind_disabled = not viewing_quote_id
            is_currently_bound = False
            if viewing_quote_id and viewing_quote_id in quote_options:
                is_currently_bound = quote_options[viewing_quote_id]["is_bound"]

            if is_currently_bound:
                if st.button("Unbind", key="unbind_selected_btn", use_container_width=True, disabled=bind_disabled, type="primary"):
                    if viewing_quote_id:
                        unbind_option(viewing_quote_id)
                        st.success("Option unbound")
                        st.rerun()
            else:
                if st.button("Bind", key="bind_selected_btn", use_container_width=True, disabled=bind_disabled, type="primary"):
                    if viewing_quote_id:
                        bind_option(viewing_quote_id, bound_by="user")
                        st.success("Option bound!")
                        st.rerun()

        # Row 2: Dropdown selector
        option_ids = list(quote_options.keys())
        option_labels = [quote_options[qid]["label"] for qid in quote_options.keys()]

        default_idx = 0
        if viewing_quote_id and viewing_quote_id in quote_options:
            default_idx = option_ids.index(viewing_quote_id)

        selected_id = st.selectbox(
            "Quote Options",
            options=option_ids,
            format_func=lambda x: option_labels[option_ids.index(x)] if x in option_ids else x,
            index=default_idx,
            key="saved_quote_selector",
            label_visibility="collapsed",
        )

        # Auto-load when selection changes
        if selected_id and selected_id != viewing_quote_id:
            _view_quote(selected_id)

        # Handle dialogs (outside columns)
        if st.session_state.get(f"show_excess_dialog_{sub_id}"):
            _render_excess_option_dialog(sub_id, all_quotes)

        if st.session_state.get(f"show_generate_dialog_{sub_id}") and viewing_quote_id:
            _render_generate_dialog(sub_id, viewing_quote_id)

    # Show premium summary when viewing a quote (skip when bound - card has the info)
    if viewing_quote_id and not readonly:
        _render_premium_summary(viewing_quote_id, readonly=readonly)


def _update_quote_limit_retention(quote_id: str, quote_data: dict, new_limit: int, new_retention: int):
    """
    Update the quote's limit, retention, regenerate quote name, and recalculate premiums.
    """
    import json
    from pages_components.tower_db import get_conn

    # Update tower_json with new limit
    tower_json = quote_data.get("tower_json", [])
    if tower_json and len(tower_json) > 0:
        tower_json[0]["limit"] = new_limit
        # Update attachment point for layers above the first
        for i, layer in enumerate(tower_json):
            if i == 0:
                layer["attachment"] = new_retention
            else:
                # Excess layers attach on top of previous
                prev_limit = tower_json[i-1].get("limit", 0)
                prev_attach = tower_json[i-1].get("attachment", 0)
                layer["attachment"] = prev_attach + prev_limit

    # Generate new quote name using shared utility
    new_name = generate_quote_name(new_limit, new_retention)

    # Recalculate premiums using rating engine
    technical_premium = None
    risk_adjusted_premium = None
    sub_id = quote_data.get("submission_id")

    if sub_id:
        premium_result = _calculate_premium_for_quote(sub_id, new_limit, new_retention)
        if premium_result and "error" not in premium_result:
            technical_premium = premium_result.get("technical_premium")
            risk_adjusted_premium = premium_result.get("risk_adjusted_premium")
            # Update first layer premium in tower_json
            if tower_json and len(tower_json) > 0 and risk_adjusted_premium:
                tower_json[0]["premium"] = risk_adjusted_premium

    # Update in database
    with get_conn().cursor() as cur:
        cur.execute(
            """
            UPDATE insurance_towers
            SET tower_json = %s,
                primary_retention = %s,
                quote_name = %s,
                technical_premium = %s,
                risk_adjusted_premium = %s,
                quoted_premium = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (json.dumps(tower_json), new_retention, new_name,
             technical_premium, risk_adjusted_premium, risk_adjusted_premium, quote_id)
        )
        get_conn().commit()

    # Update session state
    st.session_state.tower_layers = tower_json
    st.session_state.primary_retention = new_retention
    st.session_state.quote_name = new_name

    st.rerun()


def _calculate_premium_for_quote(sub_id: str, limit: int, retention: int) -> dict:
    """
    Calculate both technical and risk-adjusted premiums using the shared premium calculator.
    This ensures Quote tab premiums match Rating tab premiums exactly.
    """
    # Use the shared premium calculator - single source of truth
    return calculate_premium_for_submission(sub_id, limit, retention)


def _map_industry_to_slug(industry_name: str) -> str:
    """Map NAICS industry names to rating engine slugs."""
    if not industry_name:
        return "Professional_Services_Consulting"

    industry_mapping = {
        "Media Buying Agencies": "Advertising_Marketing_Technology",
        "Advertising Agencies": "Advertising_Marketing_Technology",
        "Marketing Consultants": "Advertising_Marketing_Technology",
        "Software Publishers": "Software_as_a_Service_SaaS",
        "Computer Systems Design Services": "Professional_Services_Consulting",
        "Management Consultants": "Professional_Services_Consulting",
    }
    return industry_mapping.get(industry_name, "Professional_Services_Consulting")


def _save_calculated_premiums(quote_id: str, technical_premium: float, risk_adjusted_premium: float):
    """Save calculated premiums to the database."""
    try:
        from pages_components.tower_db import get_conn
        with get_conn().cursor() as cur:
            cur.execute(
                """
                UPDATE insurance_towers
                SET technical_premium = %s,
                    risk_adjusted_premium = %s,
                    quoted_premium = COALESCE(quoted_premium, %s),
                    updated_at = NOW()
                WHERE id = %s
                """,
                (technical_premium, risk_adjusted_premium, risk_adjusted_premium, quote_id)
            )
            get_conn().commit()
    except Exception as e:
        pass  # Silent fail - premiums will just recalculate on next load


def _render_premium_summary(quote_id: str, sub_id: str = None, readonly: bool = False):
    """
    Render premium summary - handles both primary and excess quotes.

    For PRIMARY quotes:
      - Row 1: Limit (dropdown) | Retention (dropdown) | Sold Premium (editable)
      - Row 2: Technical | Risk-Adjusted | Market Adjustment

    For EXCESS quotes:
      - Primary Pricing Analysis: Technical/Risk-Adjusted based on primary's limit
      - Market Adj compares primary's actual premium to our model

    Args:
        quote_id: The quote ID to render
        sub_id: Optional submission ID
        readonly: If True, render in read-only mode (for post-bind state)
    """
    quote_data = get_quote_by_id(quote_id)
    if not quote_data:
        return

    position = quote_data.get("position", "primary")
    is_excess = position == "excess"

    # Get tower data
    tower_json = quote_data.get("tower_json", [])
    current_retention = quote_data.get("primary_retention") or 25_000
    sub_id = quote_data.get("submission_id")

    if is_excess:
        _render_excess_premium_summary(quote_id, quote_data, tower_json, current_retention, sub_id)
    else:
        _render_primary_premium_summary(quote_id, quote_data, tower_json, current_retention, sub_id, readonly=readonly)


def _render_primary_premium_summary(quote_id: str, quote_data: dict, tower_json: list, current_retention: int, sub_id: str, readonly: bool = False):
    """Render premium summary for primary quotes."""
    # Get sold premium from DB
    sold_premium = quote_data.get("sold_premium") or quote_data.get("quoted_premium")
    current_limit = tower_json[0].get("limit") if tower_json else 2_000_000

    # Calculate premiums from rating engine
    premium_error = None
    technical_premium = None
    risk_adjusted_premium = None

    if sub_id:
        premium_result = _calculate_premium_for_quote(sub_id, current_limit, current_retention)
        if premium_result:
            if "error" in premium_result:
                premium_error = premium_result["error"]
            else:
                technical_premium = premium_result.get("technical_premium")
                risk_adjusted_premium = premium_result.get("risk_adjusted_premium")

    # Fallback
    if not risk_adjusted_premium:
        risk_adjusted_premium = quote_data.get("quoted_premium")

    # Calculate market adjustment
    market_adjustment = None
    if sold_premium and risk_adjusted_premium:
        market_adjustment = sold_premium - risk_adjusted_premium

    # ROW 1: Limit | Retention | Sold Premium
    _render_primary_premium_row1(quote_id, quote_data, tower_json, current_limit, current_retention, sold_premium, readonly=readonly)

    # ROW 2: Technical | Risk-Adjusted | Market Adjustment
    col_tech, col_risk, col_mkt = st.columns([1, 1, 1])

    with col_tech:
        if premium_error:
            st.metric("Technical", "—", help=premium_error)
            st.caption(f"⚠️ {premium_error}")
        else:
            st.metric(
                "Technical",
                f"${technical_premium:,.0f}" if technical_premium else "—",
                help="Pure exposure-based premium (hazard + revenue + limit + retention factors)"
            )

    with col_risk:
        st.metric(
            "Risk-Adjusted",
            f"${risk_adjusted_premium:,.0f}" if risk_adjusted_premium else "—",
            help="Premium after control credits/debits"
        )

    with col_mkt:
        if market_adjustment is not None:
            if market_adjustment > 0:
                st.metric("Market Adj", f"+${market_adjustment:,.0f}")
            elif market_adjustment < 0:
                st.metric("Market Adj", f"${market_adjustment:,.0f}")
            else:
                st.metric("Market Adj", "$0")
        else:
            st.metric("Market Adj", "—", help="Set sold premium to see adjustment")


def _render_excess_premium_summary(quote_id: str, quote_data: dict, tower_json: list, current_retention: int, sub_id: str):
    """
    Render premium summary for excess quotes - analyzes PRIMARY layer pricing.

    Shows how the primary's actual premium compares to our model's price for that layer.
    """
    # Find primary layer (first non-CMAI layer)
    primary_layer = None
    for layer in tower_json:
        if "CMAI" not in str(layer.get("carrier", "")).upper():
            primary_layer = layer
            break

    if not primary_layer:
        st.caption("Add underlying layers to see primary pricing analysis.")
        return

    primary_limit = primary_layer.get("limit", 0)
    primary_premium = primary_layer.get("premium")

    # Calculate what we'd price the primary layer at
    premium_error = None
    technical_premium = None
    risk_adjusted_premium = None

    if sub_id and primary_limit:
        premium_result = _calculate_premium_for_quote(sub_id, primary_limit, current_retention)
        if premium_result:
            if "error" in premium_result:
                premium_error = premium_result["error"]
            else:
                technical_premium = premium_result.get("technical_premium")
                risk_adjusted_premium = premium_result.get("risk_adjusted_premium")

    # Market adjustment: how primary is priced vs our model
    primary_vs_model = None
    if primary_premium and risk_adjusted_premium:
        primary_vs_model = primary_premium - risk_adjusted_premium

    # Section header
    st.caption("Primary Pricing Analysis")

    # Single row: Technical | Risk-Adjusted | Primary vs Model
    col_tech, col_risk, col_mkt = st.columns([1, 1, 1])

    with col_tech:
        if premium_error:
            st.metric("Our Technical", "—", help=premium_error)
        else:
            st.metric(
                "Our Technical",
                f"${technical_premium:,.0f}" if technical_premium else "—",
                help=f"What we'd price a ${primary_limit/1_000_000:.0f}M primary at (technical)"
            )

    with col_risk:
        st.metric(
            "Our Risk-Adj",
            f"${risk_adjusted_premium:,.0f}" if risk_adjusted_premium else "—",
            help=f"What we'd price a ${primary_limit/1_000_000:.0f}M primary at (risk-adjusted)"
        )

    with col_mkt:
        if primary_vs_model is not None:
            delta_pct = (primary_vs_model / risk_adjusted_premium * 100) if risk_adjusted_premium else 0
            if primary_vs_model > 0:
                st.metric(
                    "Primary vs Model",
                    f"+${primary_vs_model:,.0f}",
                    delta=f"{delta_pct:+.0f}%",
                    help="Primary is priced above our model (rich)"
                )
            elif primary_vs_model < 0:
                st.metric(
                    "Primary vs Model",
                    f"${primary_vs_model:,.0f}",
                    delta=f"{delta_pct:+.0f}%",
                    delta_color="inverse",
                    help="Primary is priced below our model (cheap)"
                )
            else:
                st.metric("Primary vs Model", "$0", help="Primary matches our model")
        else:
            st.metric(
                "Primary vs Model",
                "—",
                help="Enter primary's premium in the tower to see comparison"
            )


def _render_primary_premium_row1(quote_id: str, quote_data: dict, tower_json: list, current_limit: int, current_retention: int, sold_premium: float, readonly: bool = False):
    """Render row 1 for primary quotes - editable limit/retention dropdowns or read-only display."""
    col_limit, col_ret, col_sold = st.columns([1, 1, 1])

    if readonly:
        # Read-only mode: display values as metrics
        with col_limit:
            limit_display = f"${current_limit / 1_000_000:.0f}M" if current_limit >= 1_000_000 else f"${current_limit / 1_000:.0f}K"
            st.metric("Limit", limit_display)

        with col_ret:
            ret_display = f"${current_retention / 1_000:.0f}K" if current_retention >= 1_000 else f"${current_retention:,.0f}"
            st.metric("Retention", ret_display)

        with col_sold:
            sold_display = f"${sold_premium:,.0f}" if sold_premium else "—"
            st.metric("Sold Premium", sold_display)
    else:
        # Edit mode: dropdowns and input
        # Use shared limit/retention options from coverage_config
        from rating_engine.coverage_config import (
            get_aggregate_limit_options,
            get_retention_options,
            get_limit_index,
        )

        limit_options = get_aggregate_limit_options()
        retention_options = get_retention_options()

        with col_limit:
            limit_labels = [label for _, label in limit_options]
            limit_values = {label: val for val, label in limit_options}
            limit_default_idx = get_limit_index(current_limit, limit_options, default=1)
            selected_limit_label = st.selectbox(
                "Limit",
                options=limit_labels,
                index=limit_default_idx,
                key=f"view_limit_{quote_id}",
            )
            selected_limit = limit_values[selected_limit_label]

            # Auto-save limit change
            if selected_limit != current_limit:
                _update_quote_limit_retention(quote_id, quote_data, selected_limit, current_retention)

        with col_ret:
            retention_labels = [label for _, label in retention_options]
            retention_values = {label: val for val, label in retention_options}
            retention_default_idx = get_limit_index(current_retention, retention_options, default=1)
            selected_retention_label = st.selectbox(
                "Retention",
                options=retention_labels,
                index=retention_default_idx,
                key=f"view_retention_{quote_id}",
            )
            selected_retention = retention_values[selected_retention_label]

            # Auto-save retention change
            if selected_retention != current_retention:
                _update_quote_limit_retention(quote_id, quote_data, current_limit, selected_retention)

        with col_sold:
            _render_sold_premium_input(quote_id, sold_premium)


def _render_sold_premium_input(quote_id: str, sold_premium: float):
    """Render the editable sold premium input field."""
    widget_key = f"sold_premium_{quote_id}"

    # Initialize session state if not present (use DB value)
    if widget_key not in st.session_state:
        st.session_state[widget_key] = f"${sold_premium:,.0f}" if sold_premium else ""
    else:
        # Reformat if user entered unformatted value (e.g., "45000" -> "$45,000")
        current_val = st.session_state[widget_key]
        parsed = _parse_currency(current_val)
        if parsed is not None:
            expected = f"${parsed:,.0f}"
            if current_val.strip() != expected:
                # Save to database BEFORE reformatting and rerun
                if parsed != sold_premium:
                    update_quote_field(quote_id, "sold_premium", parsed)
                st.session_state[widget_key] = expected
                st.rerun()

    new_sold_str = st.text_input(
        "Sold Premium",
        key=widget_key,
        placeholder="$0"
    )
    new_sold = _parse_currency(new_sold_str)

    # Auto-save on change
    if new_sold != sold_premium and new_sold is not None:
        update_quote_field(quote_id, "sold_premium", new_sold)


def _view_quote(quote_id: str):
    """
    Load a saved quote for VIEWING (read-only comparison).
    This populates the tower display but does NOT enable editing.
    """
    from utils.quote_option_factory import load_quote_into_session
    load_quote_into_session(quote_id)
    st.rerun()




def _delete_quote(quote_id: str, viewing_quote_id: str):
    """Delete a saved quote option."""
    try:
        delete_tower(quote_id)

        # If we were viewing the deleted quote, clear viewing state
        if viewing_quote_id == quote_id:
            st.session_state.viewing_quote_id = None
            st.session_state.loaded_tower_id = None
            st.session_state._viewing_saved_option = False

        st.success("Quote deleted.")
        st.rerun()
    except Exception as e:
        st.error(f"Error deleting: {e}")


def _render_generate_dialog(sub_id: str, quote_id: str):
    """Render dialog for generating quote with package options."""
    from core.document_generator import generate_document
    from core.package_generator import generate_package
    from core.document_library import get_entries_for_package, DOCUMENT_TYPES as LIB_DOC_TYPES

    quote_data = get_quote_by_id(quote_id)
    position = quote_data.get("position", "primary") if quote_data else "primary"
    doc_type = "quote_excess" if position == "excess" else "quote_primary"

    @st.dialog("Generate Quote", width="large")
    def show_dialog():
        # Get quote's endorsements
        quote_endorsements = _get_quote_endorsements(quote_id)
        matched_endorsements = _match_endorsements_to_library(quote_endorsements, position)

        package_type = st.radio(
            "Output type:",
            options=["quote_only", "full_package"],
            format_func=lambda x: "Quote Only" if x == "quote_only" else "Full Package",
            horizontal=True,
            key=f"gen_pkg_type_{quote_id}"
        )

        selected_documents = []

        if package_type == "full_package":
            st.markdown("---")

            # Show endorsements from the quote
            if quote_endorsements:
                st.markdown("**Endorsements** (from quote):")
                for name in quote_endorsements:
                    st.caption(f"• {name}")
                if matched_endorsements:
                    st.caption(f"_{len(matched_endorsements)} matched to library_")
                    selected_documents.extend([e['id'] for e in matched_endorsements])
            else:
                st.caption("_No endorsements on this quote_")

            st.markdown("---")

            # Additional documents
            st.markdown("**Additional Documents:**")
            additional_docs = get_entries_for_package(
                position=position,
                document_types=["claims_sheet", "marketing"]
            )

            if additional_docs:
                for doc in additional_docs:
                    dtype = doc.get("document_type", "")
                    type_label = LIB_DOC_TYPES.get(dtype, dtype)
                    default = dtype == "claims_sheet"

                    if st.checkbox(
                        f"{doc['code']} - {doc['title']}",
                        value=default,
                        key=f"gen_doc_{doc['id']}_{quote_id}",
                        help=type_label
                    ):
                        selected_documents.append(doc["id"])
            else:
                st.caption("_No additional documents available_")

        st.markdown("---")
        col_cancel, col_generate = st.columns(2)

        with col_cancel:
            if st.button("Cancel", key=f"gen_cancel_{quote_id}", use_container_width=True):
                st.session_state[f"show_generate_dialog_{sub_id}"] = False
                st.rerun()

        with col_generate:
            btn_label = "Generate Quote" if package_type == "quote_only" else "Generate Package"
            if st.button(btn_label, key=f"gen_confirm_{quote_id}", type="primary", use_container_width=True):
                try:
                    with st.spinner("Generating..."):
                        if package_type == "full_package" and selected_documents:
                            result = generate_package(
                                submission_id=sub_id,
                                quote_option_id=quote_id,
                                doc_type=doc_type,
                                package_type=package_type,
                                selected_documents=selected_documents,
                                created_by="user"
                            )
                        else:
                            result = generate_document(
                                submission_id=sub_id,
                                quote_option_id=quote_id,
                                doc_type=doc_type,
                                created_by="user"
                            )
                    st.session_state[f"show_generate_dialog_{sub_id}"] = False
                    st.success(f"Generated: {result['document_number']}")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

    show_dialog()


def _get_quote_endorsements(quote_id: str) -> list:
    """Get endorsement names from the quote option."""
    import json
    try:
        with get_conn().cursor() as cur:
            cur.execute(
                "SELECT endorsements FROM insurance_towers WHERE id = %s",
                (quote_id,)
            )
            row = cur.fetchone()
            if row and row[0]:
                endorsements = row[0]
                if isinstance(endorsements, str):
                    endorsements = json.loads(endorsements)
                if isinstance(endorsements, list):
                    return endorsements
    except Exception:
        pass
    return []


def _match_endorsements_to_library(endorsement_names: list, position: str) -> list:
    """Match quote endorsement names to library documents."""
    from core.document_library import get_library_entries

    if not endorsement_names:
        return []

    library_endorsements = get_library_entries(
        document_type="endorsement",
        position=position,
        status="active"
    )

    matched = []
    for name in endorsement_names:
        name_lower = name.lower().strip()
        for lib_doc in library_endorsements:
            if lib_doc['id'] in [m['id'] for m in matched]:
                continue
            title_lower = lib_doc.get('title', '').lower()
            code_lower = lib_doc.get('code', '').lower()
            if (name_lower in title_lower or title_lower in name_lower or
                name_lower in code_lower):
                matched.append(lib_doc)
                break
    return matched


def auto_load_quote_for_submission(sub_id: str):
    """
    Handle submission changes - clear state when switching submissions.
    """
    if not sub_id:
        return

    last_loaded_sub = st.session_state.get("_tower_loaded_for_sub")
    if last_loaded_sub != sub_id:
        # Switching to a different submission - reset state
        st.session_state.tower_layers = []
        st.session_state.primary_retention = None
        st.session_state.sublimits = []
        st.session_state.loaded_tower_id = None
        st.session_state.viewing_quote_id = None
        st.session_state._viewing_saved_option = False
        st.session_state.quote_name = "New Option"
        st.session_state.quoted_premium = None
        st.session_state.draft_quote_name = None
        st.session_state._tower_loaded_for_sub = sub_id


def is_viewing_saved_option() -> bool:
    """
    Check if we're currently viewing a saved option (read-only mode).
    Used by other components to determine if editing should be disabled.
    """
    return st.session_state.get("_viewing_saved_option", False)


def get_draft_name() -> str:
    """Get the current draft name for saving a new option."""
    return st.session_state.get("draft_quote_name", "New Option")


def clear_draft_state():
    """Clear the draft state after saving."""
    st.session_state.draft_quote_name = None
    st.session_state.viewing_quote_id = None
    st.session_state._viewing_saved_option = False


# ─────────────────────── Bound Quote Cards ───────────────────────

def _format_amount_short(amount: float) -> str:
    """Format amount for compact display (no $ to avoid LaTeX issues)."""
    if amount is None or amount == 0:
        return "—"
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"{int(amount // 1_000_000)}M"
    elif amount >= 1_000 and amount % 1_000 == 0:
        return f"{int(amount // 1_000)}K"
    return f"{int(amount):,}"


def _render_clickable_quote_card(
    quote: dict,
    quote_id: str,
    sub_id: str,
    is_bound: bool = False,
    bound_option: dict = None
):
    """
    Render a clickable quote card - the button IS the card (no container wrapper).
    Matches the pattern used in excess tower and coverage cards.
    
    Args:
        quote: Quote data dict
        quote_id: Quote ID
        sub_id: Submission ID
        is_bound: Whether this is the bound option
        bound_option: Full bound option dict (for bound card only)
    """
    # Get quote data - use bound_option for bound card, quote for others
    if is_bound and bound_option:
        tower_json = bound_option.get("tower_json") or []
        limit = tower_json[0].get("limit", 0) if tower_json else 0
        retention = bound_option.get("primary_retention", 0)
        premium = bound_option.get("sold_premium") or bound_option.get("quoted_premium") or 0
        position = (bound_option.get("position") or "primary").title()
        policy_form = bound_option.get("policy_form") or "cyber"
        quote_name = quote.get("quote_name", "Option")
    else:
        tower_json = quote.get("tower_json") or []
        limit = tower_json[0].get("limit", 0) if tower_json else 0
        retention = quote.get("primary_retention", 0)
        premium = quote.get("sold_premium") or quote.get("quoted_premium") or 0
        position = (quote.get("position") or "primary").title()
        policy_form = quote.get("policy_form") or "cyber"
        quote_name = quote.get("quote_name", "Option")
    
    # Sanitize quote name (remove $ that cause LaTeX issues)
    safe_name = quote_name.replace("$", "").replace("  ", " ") if quote_name else "Option"
    
    # Format premium WITHOUT $ to avoid LaTeX issues (same pattern as coverage/tower cards)
    premium_str = _format_amount_short(premium)
    
    # Build card content - option name on top, premium on bottom
    # No checkmark needed for bound (primary button type makes it clear)
    if is_bound:
        # Bound card - primary styling
        line1 = f"**{safe_name} — BOUND**"
        line2 = premium_str
        button_type = "primary"
    else:
        # Other options - secondary styling
        line1 = f"**{safe_name}**"
        line2 = premium_str
        button_type = "secondary"
    
    # Clickable card button - button IS the card (no container wrapper)
    card_key = f"quote_card_{quote_id}_{sub_id}"
    if st.button(
        f"{line1}\n\n{line2}",
        key=card_key,
        use_container_width=True,
        type=button_type,
        help="Click to view details"
    ):
        st.session_state[f"view_quote_modal_{sub_id}"] = quote_id


def _render_bound_quote_cards(sub_id: str, all_quotes: list, bound_option: dict, viewing_quote_id: str):
    """
    Render quote options as compact card summaries when policy is bound.

    Shows:
    - Bound option as prominent card at top
    - Other options in cards below
    - Each entire card is clickable to view details in modal
    """
    bound_option_id = bound_option.get("id") if bound_option else None

    # Get full quote data for bound option
    bound_quote_data = None
    other_quotes = []

    for quote in all_quotes:
        if quote["id"] == bound_option_id:
            bound_quote_data = quote
        else:
            other_quotes.append(quote)

    # Render bound option as prominent card at top
    if bound_quote_data:
        bound_quote_id = bound_quote_data.get("id")
        _render_clickable_quote_card(
            quote=bound_quote_data,
            quote_id=bound_quote_id,
            sub_id=sub_id,
            is_bound=True,
            bound_option=bound_option
        )
        st.markdown("")  # Spacing

    # Show other options in cards below
    if other_quotes:
        st.caption(f"{len(other_quotes)} other option(s):")
        
        # Render in rows of 3
        for i in range(0, len(other_quotes), 3):
            row_quotes = other_quotes[i:i+3]
            cols = st.columns(3)

            for col_idx, quote in enumerate(row_quotes):
                with cols[col_idx]:
                    quote_id = quote.get("id")
                    _render_clickable_quote_card(
                        quote=quote,
                        quote_id=quote_id,
                        sub_id=sub_id,
                        is_bound=False
                    )

    # Render modal if one is requested
    modal_quote_id = st.session_state.get(f"view_quote_modal_{sub_id}")
    if modal_quote_id:
        _render_quote_detail_modal(sub_id, modal_quote_id)


def _render_quote_detail_modal(sub_id: str, quote_id: str):
    """Render a modal showing full quote details (read-only)."""
    from pages_components.tower_db import get_quote_by_id
    from pages_components.tower_panel import render_tower_panel
    from pages_components.coverages_panel import render_coverages_panel
    from pages_components.endorsements_panel import render_endorsements_panel

    quote_data = get_quote_by_id(quote_id)
    if not quote_data:
        st.session_state[f"view_quote_modal_{sub_id}"] = None
        return

    quote_name = quote_data.get("quote_name", "Quote Option")
    # Sanitize for dialog title
    safe_title = quote_name.replace("$", "").replace("  ", " ")

    @st.dialog(f"Quote: {safe_title}", width="large")
    def show_modal():
        # Load quote into session for panels to read
        from utils.quote_option_factory import load_quote_into_session
        load_quote_into_session(quote_id)

        # Get quote position (primary vs excess)
        position = quote_data.get("position", "primary")
        is_excess = position == "excess"
        
        # Check if this is a bound quote
        is_bound_quote = quote_data.get("is_bound", False)

        # Premium summary
        st.subheader("Premium")
        _render_premium_summary(quote_id, sub_id=sub_id, readonly=True)

        # Tower - only show for excess (same rule as quote screen)
        if is_excess:
            st.subheader("Tower")
            render_tower_panel(sub_id, expanded=True, readonly=True)

        # Coverages - editable for bound quotes (changes will create revised binder)
        render_coverages_panel(
            sub_id=sub_id,
            expanded=True,
            readonly=not is_bound_quote,  # Allow editing if bound quote
            hide_bulk_edit=is_bound_quote,  # Hide bulk edit button for bound quotes in modal
        )

        # Endorsements (title is in expander)
        render_endorsements_panel(sub_id, expanded=True, position=position)

        # Action buttons
        if is_bound_quote:
            # Info box above buttons for bound quotes
            st.info("📝 Saving changes will create a new revised binder.")
            
            # Save/Cancel buttons for bound quotes
            col_cancel, col_save = st.columns([1, 1])
            with col_cancel:
                if st.button("Cancel", key=f"cancel_{quote_id}", use_container_width=True):
                    # Clear coverage editor state to reset changes
                    from pages_components.coverage_editor import reset_coverage_editor
                    reset_coverage_editor(f"quote_{sub_id}")
                    st.session_state[f"view_quote_modal_{sub_id}"] = None
                    st.rerun()
            with col_save:
                if st.button("Save Changes & Revise Binder", key=f"save_{quote_id}", type="primary", use_container_width=True):
                    # Save coverages to quote
                    session_key = f"quote_coverages_{sub_id}"
                    updated_coverages = st.session_state.get(session_key)
                    if updated_coverages:
                        from pages_components.tower_db import update_quote_field
                        update_quote_field(quote_id, "coverages", updated_coverages)
                    
                    # Generate revised binder
                    try:
                        from core.document_generator import generate_document
                        result = generate_document(
                            submission_id=sub_id,
                            quote_option_id=quote_id,
                            doc_type="binder",
                            created_by="user"
                        )
                        st.session_state[f"view_quote_modal_{sub_id}"] = None
                        st.success(f"Coverages updated. Revised binder created: {result.get('document_number', 'N/A')}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Coverages updated, but binder generation failed: {e}")
        else:
            # Close button for non-bound quotes
            if st.button("Close", key=f"close_modal_{quote_id}", use_container_width=True):
                st.session_state[f"view_quote_modal_{sub_id}"] = None
                st.rerun()

    show_modal()


def _create_primary_option(sub_id: str, all_quotes: list, clone_from_quote_id: str = None):
    """Create a new primary quote option, optionally cloning from an existing quote.

    Args:
        sub_id: Submission ID
        all_quotes: List of existing quotes
        clone_from_quote_id: If provided, clone settings from this quote
    """
    from utils.quote_option_factory import create_primary_quote_option, load_quote_into_session

    # Get existing names for deduplication
    existing_names = [q["quote_name"] for q in all_quotes] if all_quotes else []

    # Use shared factory to create the quote
    new_id = create_primary_quote_option(
        sub_id=sub_id,
        limit=1_000_000,  # Default limit
        retention=25_000,  # Default retention
        existing_quote_names=existing_names,
        clone_from_quote_id=clone_from_quote_id,
    )

    # Load the newly created quote into session state
    load_quote_into_session(new_id)
    quote_data = get_quote_by_id(new_id)
    st.success(f"Created: {quote_data.get('quote_name', 'New Option')}")
    st.rerun()


def _render_excess_option_dialog(sub_id: str, all_quotes: list):
    """Render dialog to collect our excess layer info."""

    @st.dialog("Add Excess Option", width="large")
    def show_dialog():
        st.markdown("Define **our excess layer** position:")
        st.caption("You can add underlying carrier details via the Tower panel after creation.")
        st.markdown("---")

        col1, col2 = st.columns(2)

        with col1:
            our_limit = st.selectbox(
                "Our Limit",
                options=["$1M", "$2M", "$3M", "$5M", "$10M"],
                index=2,  # Default to $3M
                key=f"our_excess_limit_{sub_id}",
            )

        with col2:
            our_attachment = st.selectbox(
                "Our Attachment",
                options=["$1M", "$2M", "$3M", "$5M", "$10M", "$15M", "$20M", "$25M"],
                index=2,  # Default to $3M
                key=f"our_excess_attachment_{sub_id}",
                help="Total underlying limits below us"
            )

        st.markdown("---")
        st.markdown("**Underlying Primary** (optional - can add via Tower later):")

        col3, col4 = st.columns(2)

        with col3:
            underlying_carrier = st.text_input(
                "Primary Carrier",
                placeholder="e.g., XL Catlin, Beazley, AIG",
                key=f"excess_carrier_{sub_id}",
            )

        with col4:
            underlying_retention = st.selectbox(
                "Primary Retention",
                options=["$10K", "$25K", "$50K", "$100K", "$250K"],
                index=1,  # Default to $25K
                key=f"excess_retention_{sub_id}",
            )

        st.markdown("---")

        col_cancel, col_create = st.columns(2)

        with col_cancel:
            if st.button("Cancel", key=f"excess_cancel_{sub_id}", use_container_width=True):
                st.session_state[f"show_excess_dialog_{sub_id}"] = False
                st.rerun()

        with col_create:
            if st.button("Create Excess Option", key=f"excess_create_{sub_id}", type="primary", use_container_width=True):
                # Parse values
                limit_map = {
                    "$1M": 1_000_000, "$2M": 2_000_000, "$3M": 3_000_000,
                    "$5M": 5_000_000, "$10M": 10_000_000, "$15M": 15_000_000,
                    "$20M": 20_000_000, "$25M": 25_000_000
                }
                retention_map = {"$10K": 10_000, "$25K": 25_000, "$50K": 50_000, "$100K": 100_000, "$250K": 250_000}

                our_limit_val = limit_map.get(our_limit, 3_000_000)
                our_attachment_val = limit_map.get(our_attachment, 3_000_000)
                primary_retention_val = retention_map.get(underlying_retention, 25_000)

                # Close dialog before creating (since _view_quote calls rerun)
                st.session_state[f"show_excess_dialog_{sub_id}"] = False

                # Create the excess option (this will call _view_quote -> rerun)
                _create_excess_option(
                    sub_id=sub_id,
                    all_quotes=all_quotes,
                    underlying_carrier=underlying_carrier or "Primary Carrier",
                    our_limit=our_limit_val,
                    our_attachment=our_attachment_val,
                    primary_retention=primary_retention_val,
                )

    show_dialog()


def _create_excess_option(
    sub_id: str,
    all_quotes: list,
    underlying_carrier: str,
    our_limit: int,
    our_attachment: int,
    primary_retention: int,
):
    """Create a new excess quote option.

    Args:
        sub_id: Submission ID
        all_quotes: List of existing quotes
        underlying_carrier: Primary carrier name (optional placeholder)
        our_limit: Our CMAI excess limit
        our_attachment: Our attachment point (total underlying limits)
        primary_retention: Primary retention for the tower
    """
    from utils.quote_option_factory import create_excess_quote_option, load_quote_into_session

    # Get existing names for deduplication
    existing_names = [q["quote_name"] for q in all_quotes] if all_quotes else []

    # Use shared factory to create the quote
    new_id = create_excess_quote_option(
        sub_id=sub_id,
        our_limit=our_limit,
        our_attachment=our_attachment,
        primary_retention=primary_retention,
        underlying_carrier=underlying_carrier,
        existing_quote_names=existing_names,
    )

    # Load the newly created quote into session state
    load_quote_into_session(new_id)
    quote_data = get_quote_by_id(new_id)
    st.success(f"Created: {quote_data.get('quote_name', 'New Option')}")
    st.rerun()


def get_current_quote_position(sub_id: str) -> str:
    """Get the position (primary/excess) of the currently viewed quote."""
    viewing_quote_id = st.session_state.get("viewing_quote_id")
    if not viewing_quote_id:
        return "primary"  # Default to primary

    quote = get_quote_by_id(viewing_quote_id)
    if not quote:
        return "primary"

    return quote.get("position", "primary")
