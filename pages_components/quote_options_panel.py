"""
Quote Options Panel Component
Displays saved quote options as a dropdown selector with View/Clone/Delete actions.
Provides buttons to create new Primary or Excess quote options.
"""
from __future__ import annotations

import streamlit as st
import os
import importlib.util
from pages_components.tower_db import (
    list_quotes_for_submission,
    get_quote_by_id,
    clone_quote,
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


def render_quote_options_panel(sub_id: str):
    """
    Render saved quote options as a dropdown selector with action buttons.

    Args:
        sub_id: Submission ID
    """
    if not sub_id:
        st.warning("No submission selected.")
        return

    # Get all saved quote options for this submission
    all_quotes = list_quotes_for_submission(sub_id)

    # Add Primary/Excess option buttons
    _render_add_option_buttons(sub_id, all_quotes)

    if not all_quotes:
        st.caption("No saved options yet. Use the buttons above to create your first quote option.")
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

    # Layout: Dropdown | Bind | Clone | Delete
    col_select, col_bind, col_clone, col_delete = st.columns([4, 1, 1, 1])

    with col_select:
        # Build options list with IDs (no empty placeholder needed now)
        option_ids = list(quote_options.keys())
        option_labels = [quote_options[qid]["label"] for qid in quote_options.keys()]

        # Find current index
        default_idx = 0
        if viewing_quote_id and viewing_quote_id in quote_options:
            default_idx = option_ids.index(viewing_quote_id)

        selected_id = st.selectbox(
            f"Saved Quote Options ({len(all_quotes)})",
            options=option_ids,
            format_func=lambda x: option_labels[option_ids.index(x)] if x in option_ids else x,
            index=default_idx,
            key="saved_quote_selector",
        )

        # Auto-load when selection changes
        if selected_id and selected_id != viewing_quote_id:
            _view_quote(selected_id)

    with col_bind:
        st.markdown("<br>", unsafe_allow_html=True)  # Align with dropdown
        bind_disabled = not viewing_quote_id

        # Check if currently viewing option is bound
        is_currently_bound = False
        if viewing_quote_id and viewing_quote_id in quote_options:
            is_currently_bound = quote_options[viewing_quote_id]["is_bound"]

        if is_currently_bound:
            # Show unbind button
            if st.button("Unbind", key="unbind_selected_btn", use_container_width=True, disabled=bind_disabled):
                if viewing_quote_id:
                    unbind_option(viewing_quote_id)
                    st.success("Option unbound")
                    st.rerun()
        else:
            # Show bind button
            if st.button("Bind", key="bind_selected_btn", use_container_width=True, disabled=bind_disabled, type="primary"):
                if viewing_quote_id:
                    bind_option(viewing_quote_id, bound_by="user")
                    st.success("Option bound!")
                    st.rerun()

    with col_clone:
        st.markdown("<br>", unsafe_allow_html=True)  # Align with dropdown
        clone_disabled = not viewing_quote_id
        if st.button("Clone", key="clone_selected_btn", use_container_width=True, disabled=clone_disabled):
            if viewing_quote_id:
                _clone_quote_to_draft(viewing_quote_id, sub_id, all_quotes)

    with col_delete:
        st.markdown("<br>", unsafe_allow_html=True)  # Align with dropdown
        delete_disabled = not viewing_quote_id
        if st.button("Delete", key="delete_selected_btn", use_container_width=True, disabled=delete_disabled):
            if viewing_quote_id:
                _delete_quote(viewing_quote_id, viewing_quote_id)

    # Show premium summary when viewing a quote
    if viewing_quote_id:
        _render_premium_summary(viewing_quote_id)


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


def _render_premium_summary(quote_id: str, sub_id: str = None):
    """
    Render premium summary - handles both primary and excess quotes.

    For PRIMARY quotes:
      - Row 1: Limit (dropdown) | Retention (dropdown) | Sold Premium (editable)
      - Row 2: Technical | Risk-Adjusted | Market Adjustment

    For EXCESS quotes:
      - Primary Pricing Analysis: Technical/Risk-Adjusted based on primary's limit
      - Market Adj compares primary's actual premium to our model
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
        _render_primary_premium_summary(quote_id, quote_data, tower_json, current_retention, sub_id)


def _render_primary_premium_summary(quote_id: str, quote_data: dict, tower_json: list, current_retention: int, sub_id: str):
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
    _render_primary_premium_row1(quote_id, quote_data, tower_json, current_limit, current_retention, sold_premium)

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


def _render_primary_premium_row1(quote_id: str, quote_data: dict, tower_json: list, current_limit: int, current_retention: int, sold_premium: float):
    """Render row 1 for primary quotes - editable limit/retention dropdowns."""
    # Standard options for dropdowns
    limit_options = [
        ("$1M", 1_000_000),
        ("$2M", 2_000_000),
        ("$3M", 3_000_000),
        ("$5M", 5_000_000),
    ]
    retention_options = [
        ("$10K", 10_000),
        ("$25K", 25_000),
        ("$50K", 50_000),
        ("$100K", 100_000),
        ("$250K", 250_000),
        ("$500K", 500_000),
    ]

    col_limit, col_ret, col_sold = st.columns([1, 1, 1])

    with col_limit:
        limit_labels = [opt[0] for opt in limit_options]
        limit_values = {opt[0]: opt[1] for opt in limit_options}
        limit_default_idx = next(
            (i for i, opt in enumerate(limit_options) if opt[1] == current_limit), 1
        )
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
        retention_labels = [opt[0] for opt in retention_options]
        retention_values = {opt[0]: opt[1] for opt in retention_options}
        retention_default_idx = next(
            (i for i, opt in enumerate(retention_options) if opt[1] == current_retention), 1
        )
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
    quote_data = get_quote_by_id(quote_id)
    if quote_data:
        # Store viewing state
        st.session_state.viewing_quote_id = quote_id

        # Load tower data for display
        st.session_state.tower_layers = quote_data["tower_json"]
        st.session_state.primary_retention = quote_data["primary_retention"]
        st.session_state.sublimits = quote_data.get("sublimits") or []
        st.session_state.loaded_tower_id = quote_data["id"]
        st.session_state.quote_name = quote_data.get("quote_name", "Option A")
        st.session_state.quoted_premium = quote_data.get("quoted_premium")

        # Mark as viewing (read-only), not as a draft being edited
        st.session_state._viewing_saved_option = True
        st.session_state._quote_just_loaded = True

        # Load coverages and policy form from saved quote
        sub_id = quote_data.get("submission_id")
        if sub_id:
            # Clear old widget keys so selectboxes pick up new values
            keys_to_clear = [k for k in list(st.session_state.keys())
                           if k.startswith(f"quote_sublimit_{sub_id}_")
                           or k.startswith(f"quote_agg_{sub_id}_")
                           or k.startswith("_saved_cmai_limit_")
                           or k.startswith("_saved_cmai_premium_")]
            for k in keys_to_clear:
                del st.session_state[k]

            # Load saved coverages into session state for the coverages panel
            saved_coverages = quote_data.get("coverages")
            if saved_coverages:
                st.session_state[f"quote_coverages_{sub_id}"] = saved_coverages

            # Load policy form
            saved_policy_form = quote_data.get("policy_form")
            if saved_policy_form:
                st.session_state[f"policy_form_{sub_id}"] = saved_policy_form

        # Sync dropdowns to show the viewed option's values
        tower_json = quote_data["tower_json"]
        if tower_json and len(tower_json) > 0:
            first_layer = tower_json[0]
            limit = first_layer.get("limit")
            st.session_state._loaded_quote_limit = limit
            st.session_state._loaded_quote_retention = quote_data.get("primary_retention")

            # Update selected_limit so coverages panel uses correct aggregate
            if sub_id and limit:
                st.session_state[f"selected_limit_{sub_id}"] = limit

        st.rerun()


def _clone_quote_to_draft(quote_id: str, sub_id: str, all_quotes: list):
    """
    Clone a saved quote to create a new saved option in the database.
    The new option will be immediately selectable in the dropdown.
    """
    try:
        # Generate unique name for the clone
        quote_data = get_quote_by_id(quote_id)
        if not quote_data:
            st.error("Could not load quote data")
            return

        original_name = quote_data.get("quote_name", "Option")
        existing_names = [q.get("quote_name", "") for q in all_quotes]

        # Generate "Copy of X" or "Copy of X (2)" etc.
        new_name = f"Copy of {original_name}"
        if new_name in existing_names:
            i = 2
            while f"Copy of {original_name} ({i})" in existing_names:
                i += 1
            new_name = f"Copy of {original_name} ({i})"

        # Actually create new record in database
        new_quote_id = clone_quote(quote_id, new_name)

        # Select the newly created clone
        st.session_state.viewing_quote_id = new_quote_id

        st.success(f"Created: {new_name}")
        st.rerun()

    except Exception as e:
        st.error(f"Error cloning: {e}")


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


# ─────────────────────── Add Option Buttons ───────────────────────

def _render_add_option_buttons(sub_id: str, all_quotes: list):
    """Render buttons to add new Primary or Excess quote options."""
    col_primary, col_excess, col_spacer = st.columns([1, 1, 2])

    with col_primary:
        if st.button("+ Add Primary", key=f"add_primary_opt_{sub_id}", use_container_width=True):
            # _view_quote inside _create_primary_option calls rerun
            _create_primary_option(sub_id, all_quotes)

    with col_excess:
        if st.button("+ Add Excess", key=f"add_excess_opt_{sub_id}", use_container_width=True):
            st.session_state[f"show_excess_dialog_{sub_id}"] = True

    # Handle excess dialog
    if st.session_state.get(f"show_excess_dialog_{sub_id}"):
        _render_excess_option_dialog(sub_id, all_quotes)


def _create_primary_option(sub_id: str, all_quotes: list):
    """Create a new primary quote option with defaults."""
    from pages_components.coverages_panel import build_coverages_from_rating
    from rating_engine.coverage_config import get_default_policy_form

    default_limit = 1_000_000
    default_retention = 25_000

    # Build tower with CMAI as primary
    tower_json = [{
        "carrier": "CMAI",
        "limit": default_limit,
        "attachment": 0,
        "premium": None,
    }]

    # Count existing primary options for naming
    primary_quotes = [q for q in all_quotes if q.get("position", "primary") == "primary"]
    next_num = len(primary_quotes) + 1
    quote_name = generate_quote_name(default_limit, default_retention)

    # Check for duplicate names
    existing_names = [q["quote_name"] for q in all_quotes]
    if quote_name in existing_names:
        n = 2
        while f"{quote_name} ({n})" in existing_names:
            n += 1
        quote_name = f"{quote_name} ({n})"

    # Get policy form and coverages from Rating tab
    policy_form = st.session_state.get(f"policy_form_{sub_id}", get_default_policy_form())
    coverages = build_coverages_from_rating(sub_id, default_limit)

    # Save to database
    new_id = save_tower(
        submission_id=sub_id,
        tower_json=tower_json,
        primary_retention=default_retention,
        quote_name=quote_name,
        position="primary",
        policy_form=policy_form,
        coverages=coverages,
    )

    # Load the newly created quote into session state
    # This ensures the tower panel displays correctly
    _view_quote(new_id)
    st.success(f"Created: {quote_name}")


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
    from rating_engine.coverage_config import get_default_policy_form

    # Build tower showing underlying + CMAI excess
    # The underlying layer represents total limits below us
    tower_json = [
        {
            "carrier": underlying_carrier,
            "limit": our_attachment,  # Underlying limits = our attachment
            "attachment": 0,
            "retention": primary_retention,
            "premium": None,  # Unknown until captured
        },
        {
            "carrier": "CMAI",
            "limit": our_limit,
            "attachment": our_attachment,
            "premium": None,
        },
    ]

    # Count existing excess options for naming
    excess_quotes = [q for q in all_quotes if q.get("position") == "excess"]
    next_num = len(excess_quotes) + 1

    # Generate name showing our layer
    quote_name = f"${our_limit // 1_000_000}M xs ${our_attachment // 1_000_000}M"

    # Check for duplicate names
    existing_names = [q["quote_name"] for q in all_quotes]
    if quote_name in existing_names:
        n = 2
        while f"{quote_name} ({n})" in existing_names:
            n += 1
        quote_name = f"{quote_name} ({n})"

    policy_form = st.session_state.get(f"policy_form_{sub_id}", get_default_policy_form())

    # Save to database
    new_id = save_tower(
        submission_id=sub_id,
        tower_json=tower_json,
        primary_retention=primary_retention,
        quote_name=quote_name,
        position="excess",
        policy_form=policy_form,
    )

    # Load the newly created quote into session state
    # This ensures the tower panel displays correctly
    _view_quote(new_id)
    st.success(f"Created: {quote_name}")


def get_current_quote_position(sub_id: str) -> str:
    """Get the position (primary/excess) of the currently viewed quote."""
    viewing_quote_id = st.session_state.get("viewing_quote_id")
    if not viewing_quote_id:
        return "primary"  # Default to primary

    quote = get_quote_by_id(viewing_quote_id)
    if not quote:
        return "primary"

    return quote.get("position", "primary")
