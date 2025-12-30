"""
utils/quote_option_factory.py
=============================

Single source of truth for creating quote options.
Consolidates logic from quote_options_panel.py and quote_options_cards.py.
"""
from __future__ import annotations

import streamlit as st
from typing import Optional
from utils.quote_formatting import format_currency, generate_quote_name


def create_primary_quote_option(
    sub_id: str,
    limit: int,
    retention: int,
    existing_quote_names: list = None,
    policy_form: str = None,
    coverages: dict = None,
    clone_from_quote_id: str = None,
    retroactive_date: str = None,
) -> str:
    """
    Create and save a new primary quote option.

    Args:
        sub_id: Submission ID
        limit: Policy limit
        retention: Retention/deductible
        existing_quote_names: List of existing quote names (for deduplication)
        policy_form: Optional policy form override
        coverages: Optional coverages override
        clone_from_quote_id: If provided, clone settings from this quote
        retroactive_date: Optional retroactive date override (defaults to submission default)

    Returns:
        ID of the created quote option
    """
    from pages_components.tower_db import save_tower, get_quote_by_id, get_conn
    from pages_components.coverages_panel import build_coverages_from_rating
    from rating_engine.coverage_config import get_default_policy_form
    from rating_engine.premium_calculator import calculate_premium_for_submission

    # If cloning, get settings from source quote
    if clone_from_quote_id:
        source_quote = get_quote_by_id(clone_from_quote_id)
        if source_quote:
            tower_json_source = source_quote.get("tower_json", [])
            if tower_json_source and len(tower_json_source) > 0:
                limit = tower_json_source[0].get("limit", limit)
            retention = source_quote.get("primary_retention", retention)
            if policy_form is None:
                policy_form = source_quote.get("policy_form")
            if coverages is None:
                coverages = source_quote.get("coverages")
            if retroactive_date is None:
                retroactive_date = source_quote.get("retroactive_date")

    # Calculate premium from rating engine
    technical_premium = None
    risk_adjusted_premium = None
    premium_result = calculate_premium_for_submission(sub_id, limit, retention)
    if premium_result and "error" not in premium_result:
        technical_premium = premium_result.get("technical_premium")
        risk_adjusted_premium = premium_result.get("risk_adjusted_premium")

    # Build tower with CMAI as primary
    tower_json = [{
        "carrier": "CMAI",
        "limit": limit,
        "attachment": 0,
        "premium": risk_adjusted_premium,
    }]

    # Generate quote name
    quote_name = generate_quote_name(limit, retention)

    # Handle duplicate names
    existing_names = existing_quote_names or []
    if quote_name in existing_names:
        n = 2
        while f"{quote_name} ({n})" in existing_names:
            n += 1
        quote_name = f"{quote_name} ({n})"

    # Set defaults if not provided
    if policy_form is None:
        policy_form = st.session_state.get(f"policy_form_{sub_id}", get_default_policy_form())
    if coverages is None:
        coverages = build_coverages_from_rating(sub_id, limit)

    # Fetch submission default retroactive date if not provided
    if retroactive_date is None:
        with get_conn().cursor() as cur:
            cur.execute(
                "SELECT default_retroactive_date FROM submissions WHERE id = %s",
                (sub_id,)
            )
            row = cur.fetchone()
            if row and row[0]:
                retroactive_date = row[0]

    # Save to database with rater premium as starting point
    new_id = save_tower(
        submission_id=sub_id,
        tower_json=tower_json,
        primary_retention=retention,
        quote_name=quote_name,
        position="primary",
        policy_form=policy_form,
        coverages=coverages,
        technical_premium=technical_premium,
        risk_adjusted_premium=risk_adjusted_premium,
        sold_premium=risk_adjusted_premium,
        retroactive_date=retroactive_date,
    )

    return new_id


def create_excess_quote_option(
    sub_id: str,
    our_limit: int,
    our_attachment: int,
    primary_retention: int,
    underlying_carrier: str = "Primary Carrier",
    existing_quote_names: list = None,
    policy_form: str = None,
    retroactive_date: str = None,
) -> str:
    """
    Create and save a new excess quote option.

    Args:
        sub_id: Submission ID
        our_limit: CMAI excess limit
        our_attachment: Attachment point (total underlying limits)
        primary_retention: Primary retention for the tower
        underlying_carrier: Name of underlying carrier
        existing_quote_names: List of existing quote names (for deduplication)
        policy_form: Optional policy form override
        retroactive_date: Optional retroactive date override (defaults to submission default)

    Returns:
        ID of the created quote option
    """
    from pages_components.tower_db import save_tower, get_conn
    from rating_engine.coverage_config import get_default_policy_form
    from rating_engine.premium_calculator import calculate_premium_for_submission

    # Calculate premium for CMAI excess layer using ILF approach
    technical_premium = None
    risk_adjusted_premium = None
    cmai_premium = None

    # Calculate premium for full tower limit
    total_limit = our_attachment + our_limit
    premium_result = calculate_premium_for_submission(sub_id, total_limit, primary_retention)
    if premium_result and "error" not in premium_result:
        total_risk_adj = premium_result.get("risk_adjusted_premium")
        total_technical = premium_result.get("technical_premium")

        # Get premium for just the underlying to calculate excess portion
        underlying_result = calculate_premium_for_submission(sub_id, our_attachment, primary_retention)
        if underlying_result and "error" not in underlying_result:
            underlying_risk_adj = underlying_result.get("risk_adjusted_premium") or 0
            underlying_technical = underlying_result.get("technical_premium") or 0

            # Excess premium = full tower premium - underlying premium
            if total_risk_adj and underlying_risk_adj:
                cmai_premium = total_risk_adj - underlying_risk_adj
                technical_premium = (total_technical - underlying_technical) if total_technical else None
                risk_adjusted_premium = cmai_premium

    # Build tower with underlying + CMAI excess
    tower_json = [
        {
            "carrier": underlying_carrier,
            "limit": our_attachment,
            "attachment": 0,
            "retention": primary_retention,
            "premium": None,
        },
        {
            "carrier": "CMAI",
            "limit": our_limit,
            "attachment": our_attachment,
            "premium": cmai_premium,
        },
    ]

    # Generate quote name for excess
    quote_name = generate_quote_name(our_limit, primary_retention, "excess", our_attachment)

    # Handle duplicate names
    existing_names = existing_quote_names or []
    if quote_name in existing_names:
        n = 2
        while f"{quote_name} ({n})" in existing_names:
            n += 1
        quote_name = f"{quote_name} ({n})"

    # Set default policy form if not provided
    if policy_form is None:
        policy_form = st.session_state.get(f"policy_form_{sub_id}", get_default_policy_form())

    # Fetch submission default retroactive date if not provided
    if retroactive_date is None:
        with get_conn().cursor() as cur:
            cur.execute(
                "SELECT default_retroactive_date FROM submissions WHERE id = %s",
                (sub_id,)
            )
            row = cur.fetchone()
            if row and row[0]:
                retroactive_date = row[0]

    # Save to database
    new_id = save_tower(
        submission_id=sub_id,
        tower_json=tower_json,
        primary_retention=primary_retention,
        quote_name=quote_name,
        position="excess",
        policy_form=policy_form,
        technical_premium=technical_premium,
        risk_adjusted_premium=risk_adjusted_premium,
        sold_premium=risk_adjusted_premium,
        retroactive_date=retroactive_date,
    )

    return new_id


def load_quote_into_session(quote_id: str):
    """
    Load a quote into session state for viewing/editing.

    Args:
        quote_id: ID of the quote to load
    """
    from pages_components.tower_db import get_quote_by_id

    quote_data = get_quote_by_id(quote_id)
    if not quote_data:
        return

    # Store viewing state
    st.session_state.viewing_quote_id = quote_id

    # Load tower data
    st.session_state.tower_layers = quote_data["tower_json"]
    st.session_state.primary_retention = quote_data["primary_retention"]
    st.session_state.sublimits = quote_data.get("sublimits") or []
    st.session_state.loaded_tower_id = quote_data["id"]
    st.session_state.quote_name = quote_data.get("quote_name", "Option A")
    st.session_state.quoted_premium = quote_data.get("quoted_premium")

    # Mark as viewing saved option
    st.session_state._viewing_saved_option = True
    st.session_state._quote_just_loaded = True

    # Load coverages and policy form
    sub_id = quote_data.get("submission_id")
    if sub_id:
        # Clear old widget keys
        keys_to_clear = [k for k in list(st.session_state.keys())
                       if k.startswith(f"quote_sublimit_{sub_id}_")
                       or k.startswith(f"quote_agg_{sub_id}_")
                       or k.startswith("_saved_cmai_limit_")
                       or k.startswith("_saved_cmai_premium_")]
        for k in keys_to_clear:
            del st.session_state[k]

        # Load saved coverages
        saved_coverages = quote_data.get("coverages")
        if saved_coverages:
            st.session_state[f"quote_coverages_{sub_id}"] = saved_coverages

        # Load policy form
        saved_policy_form = quote_data.get("policy_form")
        if saved_policy_form:
            st.session_state[f"policy_form_{sub_id}"] = saved_policy_form

    # Sync dropdown values
    tower_json = quote_data["tower_json"]
    if tower_json and len(tower_json) > 0:
        first_layer = tower_json[0]
        limit = first_layer.get("limit")
        st.session_state._loaded_quote_limit = limit
        st.session_state._loaded_quote_retention = quote_data.get("primary_retention")

        if sub_id and limit:
            st.session_state[f"selected_limit_{sub_id}"] = limit
