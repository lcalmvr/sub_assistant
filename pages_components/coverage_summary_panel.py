"""
Coverage Summary Panel for Rating Tab

Configures coverage STRUCTURE and DEFAULTS (option-agnostic):
- Policy form selection (Cyber / Cyber+Tech / Tech)
- Standard Full Limit Coverages (Aggregate / $1M / None)
- Variable + Sublimit Coverages (fixed amounts, 50% Agg, Full Agg)
"""
from __future__ import annotations

import streamlit as st
from typing import Optional

from rating_engine.coverage_config import (
    get_policy_forms,
    get_default_policy_form,
    get_coverages_for_form,
    get_aggregate_coverage_definitions,
    get_sublimit_coverage_definitions,
)
from pages_components.bulk_coverage_update import render_bulk_coverage_buttons_rating


def render_coverage_summary_panel(
    sub_id: str,
    aggregate_limit: int,
    get_conn_func,
    on_change_callback: Optional[callable] = None,
) -> dict:
    """
    Render coverage configuration panel for Rating tab.
    This is option-agnostic - configures structure and defaults.
    """
    # Get submission's default policy form
    default_form = _get_submission_policy_form(sub_id, get_conn_func)

    # Policy Form selector
    policy_forms = get_policy_forms()
    form_labels = [f["label"] for f in policy_forms]
    form_ids = [f["id"] for f in policy_forms]

    # Keys
    session_key = f"policy_form_{sub_id}"
    prev_form_key = f"policy_form_prev_{sub_id}"
    agg_override_key = f"agg_overrides_{sub_id}"
    sublimit_key = f"sublimit_defaults_{sub_id}"

    # Initialize session state if not set
    if session_key not in st.session_state:
        st.session_state[session_key] = default_form
    if prev_form_key not in st.session_state:
        st.session_state[prev_form_key] = st.session_state[session_key]

    # Initialize coverage overrides if not set
    if agg_override_key not in st.session_state:
        st.session_state[agg_override_key] = {}

    # Always refresh from config to pick up any config changes
    config_defaults = {cov["id"]: cov.get("default", 0) for cov in get_sublimit_coverage_definitions()}
    if sublimit_key not in st.session_state:
        st.session_state[sublimit_key] = config_defaults.copy()
    else:
        # Update any values that are still at old defaults to new defaults
        current = st.session_state[sublimit_key]
        for cov_id, new_default in config_defaults.items():
            if cov_id not in current:
                current[cov_id] = new_default

    # Use same coverage editor component as Quote tab
    from pages_components.coverage_editor import render_coverage_editor, reset_coverage_editor
    from pages_components.coverages_panel import build_coverages_from_rating

    with st.expander("Coverage Schedule", expanded=True):
        # Policy form radio buttons with Edit button inline
        radio_col, btn_col = st.columns([4, 1])

        # Get current form for radio default
        current_form = st.session_state[session_key]
        current_idx = form_ids.index(current_form) if current_form in form_ids else 0

        # Use on_change callback to set tab state BEFORE Streamlit's natural rerun
        from utils.tab_state import on_change_stay_on_rating
        selected_form_label = radio_col.radio(
            "Policy Form",
            options=form_labels,
            index=current_idx,
            key=f"policy_form_radio_{sub_id}",
            horizontal=True,
            label_visibility="collapsed",
            on_change=on_change_stay_on_rating,
        )
        selected_form = form_ids[form_labels.index(selected_form_label)]

        # Always update session_key to match widget selection
        st.session_state[session_key] = selected_form

        # Check if form changed from PREVIOUS render (not current session state)
        prev_form = st.session_state[prev_form_key]
        form_changed = (selected_form != prev_form)

        with btn_col:
            render_bulk_coverage_buttons_rating(
                sub_id,
                selected_form,
                st.session_state[sublimit_key],
                st.session_state[agg_override_key],
            )

        # Reset coverages if form changed
        if form_changed:
            # Reset sublimit defaults for new form
            st.session_state[sublimit_key] = {}
            for cov in get_sublimit_coverage_definitions():
                st.session_state[sublimit_key][cov["id"]] = cov.get("default", 0)

            # Clear aggregate overrides too
            st.session_state[agg_override_key] = {}

            # Use proper reset function to clear editor AND widget keys
            reset_coverage_editor(f"rating_{sub_id}")

            # Update prev_form to current
            st.session_state[prev_form_key] = selected_form
            # Use tab-aware rerun to stay on Rating tab
            from utils.tab_state import rerun_on_rating_tab
            rerun_on_rating_tab()

        # Build coverages dict from current session state
        rating_coverages = build_coverages_from_rating(sub_id, aggregate_limit)

        # Use shared coverage editor (same as Quote tab)
        def on_rating_coverage_change(updated_coverages: dict):
            # Sync changes back to Rating tab session state
            if "sublimit_coverages" in updated_coverages:
                for cov_id, val in updated_coverages["sublimit_coverages"].items():
                    st.session_state[sublimit_key][cov_id] = val
            if "aggregate_coverages" in updated_coverages:
                for cov_id, val in updated_coverages["aggregate_coverages"].items():
                    if val != aggregate_limit:
                        st.session_state[agg_override_key][cov_id] = val
                    elif cov_id in st.session_state[agg_override_key]:
                        del st.session_state[agg_override_key][cov_id]

        render_coverage_editor(
            editor_id=f"rating_{sub_id}",
            current_coverages=rating_coverages,
            aggregate_limit=aggregate_limit,
            mode="edit",
            on_change=on_rating_coverage_change,
            show_header=False,
        )

    # Build final coverage config - read from session state (updated by fragment)
    final_coverages = {
        "policy_form": st.session_state.get(session_key, default_form),
        "aggregate_overrides": st.session_state[agg_override_key],
        "sublimit_defaults": st.session_state[sublimit_key],
    }

    return final_coverages


def _get_submission_policy_form(sub_id: str, get_conn_func) -> str:
    """Get default policy form from submission, or global default."""
    try:
        with get_conn_func().cursor() as cur:
            cur.execute(
                "SELECT default_policy_form FROM submissions WHERE id = %s",
                (sub_id,),
            )
            row = cur.fetchone()
            if row and row[0]:
                return row[0]
    except Exception:
        pass
    return get_default_policy_form()


def _format_limit_display(value: int) -> str:
    """Format a limit value for display."""
    if value == 0:
        return "$0"
    elif value >= 1000000 and value % 1000000 == 0:
        return f"${value // 1000000}M"
    elif value >= 1000 and value % 1000 == 0:
        return f"${value // 1000}K"
    else:
        return f"${value:,}"


def _render_unified_summary(sub_id: str, policy_form: str, aggregate_limit: int) -> None:
    """Render unified summary of all coverages grouped by limit type."""
    agg_defs = get_aggregate_coverage_definitions()
    sub_defs = get_sublimit_coverage_definitions()
    agg_override_key = f"agg_overrides_{sub_id}"
    sublimit_key = f"sublimit_defaults_{sub_id}"

    overrides = st.session_state.get(agg_override_key, {})
    sublimit_defaults = st.session_state.get(sublimit_key, {})

    # Group all coverages by their limit type
    full_limits = []
    sublimits = []
    no_coverage = []

    # Process aggregate/standard coverages
    for cov in agg_defs:
        cov_id = cov["id"]
        label = cov["label"]
        form_default = cov.get(policy_form, 0)
        default_status = "Aggregate" if form_default == "aggregate" else "None"
        current_status = overrides.get(cov_id, default_status)

        if current_status == "Aggregate":
            full_limits.append(label)
        elif current_status == "None":
            no_coverage.append(label)
        else:
            # $1M or other sublimits
            sublimits.append((label, current_status))

    # Process variable/sublimit coverages
    for cov in sub_defs:
        cov_id = cov["id"]
        label = cov["label"]
        config_default = cov.get("default", 0)
        form_setting = cov.get(policy_form, 0)

        if form_setting != "sublimit":
            # Excluded for this form
            no_coverage.append(label)
            continue

        current_val = sublimit_defaults.get(cov_id, config_default)

        # Rating tab is option-agnostic: only symbolic "aggregate" = Full Limits
        # Fixed amounts are always sublimits regardless of current aggregate_limit
        if current_val == "aggregate":
            full_limits.append(label)
        elif current_val == "none" or current_val == 0:
            no_coverage.append(label)
        elif current_val == "50%":
            sublimits.append((label, "50% Agg"))
        elif isinstance(current_val, (int, float)):
            # Fixed amounts are always sublimits on Rating tab
            sublimits.append((label, _format_limit_display(int(current_val))))
        else:
            sublimits.append((label, str(current_val)))

    # Display grouped summary - only Sub Limit and No Coverage
    # (Full Limits are assumed for anything not listed)
    if sublimits:
        items = "".join([f"<div>{label} - {val}</div>" for label, val in sublimits])
        st.markdown(f"<div><strong>Sub Limit:</strong>{items}</div>", unsafe_allow_html=True)

    if no_coverage:
        items = "".join([f"<div>{label}</div>" for label in no_coverage])
        margin = "margin-top: 1em;" if sublimits else ""
        st.markdown(f"<div style='{margin}'><strong>No Coverage:</strong>{items}</div>", unsafe_allow_html=True)

    if not sublimits and not no_coverage:
        st.markdown("_All coverages at Full Limits_")


def _render_aggregate_coverages_edit(sub_id: str, policy_form: str) -> None:
    """Render aggregate coverages edit mode with two-column grid layout."""
    agg_defs = get_aggregate_coverage_definitions()
    agg_override_key = f"agg_overrides_{sub_id}"
    overrides = st.session_state.get(agg_override_key, {})

    # Options for edit mode
    options = ["Full Limits", "$1M", "No Coverage"]
    storage_map = {"Full Limits": "Aggregate", "$1M": "$1M", "No Coverage": "None"}
    display_map = {"Aggregate": "Full Limits", "$1M": "$1M", "None": "No Coverage"}

    # Build coverage list - Tech E&O first
    coverage_list = []
    for cov in agg_defs:
        if cov["id"] == "tech_eo":
            coverage_list.insert(0, cov)
        else:
            coverage_list.append(cov)

    # Split into two columns
    mid = (len(coverage_list) + 1) // 2
    col_a, col_b = st.columns(2)

    def render_coverage_row(cov, parent_col):
        cov_id = cov["id"]
        label = cov["label"]
        form_default = cov.get(policy_form, 0)
        default_status = "Aggregate" if form_default == "aggregate" else "None"
        current_status = overrides.get(cov_id, default_status)

        display_current = display_map.get(current_status, current_status)
        idx = options.index(display_current) if display_current in options else 0

        with parent_col:
            c1, c2 = st.columns([1.8, 1])
            with c1:
                st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{label}</div>", unsafe_allow_html=True)
            with c2:
                new_display = st.selectbox(
                    label,
                    options=options,
                    index=idx,
                    key=f"agg_{sub_id}_{policy_form}_{cov_id}",
                    label_visibility="collapsed",
                )

            new_status = storage_map.get(new_display, new_display)

            # Store override if different from form default
            if new_status != default_status:
                st.session_state[agg_override_key][cov_id] = new_status
            elif cov_id in st.session_state[agg_override_key]:
                del st.session_state[agg_override_key][cov_id]

    for cov in coverage_list[:mid]:
        render_coverage_row(cov, col_a)

    for cov in coverage_list[mid:]:
        render_coverage_row(cov, col_b)


def _render_aggregate_coverages(sub_id: str, policy_form: str) -> None:
    """Render aggregate coverages - list view by default, edit mode optional."""
    agg_defs = get_aggregate_coverage_definitions()
    agg_override_key = f"agg_overrides_{sub_id}"
    overrides = st.session_state.get(agg_override_key, {})

    # Options for edit mode (internal values)
    options = ["Full Limits", "$1M", "No Coverage"]
    # Map to storage values
    storage_map = {"Full Limits": "Aggregate", "$1M": "$1M", "No Coverage": "None"}
    display_map = {"Aggregate": "Full Limits", "$1M": "$1M", "None": "No Coverage"}

    # Toggle for edit mode
    edit_key = f"edit_agg_{sub_id}"
    if edit_key not in st.session_state:
        st.session_state[edit_key] = False

    # Build current status for each coverage - Tech E&O first
    coverage_status = []
    # Find Tech E&O and add first
    for cov in agg_defs:
        if cov["id"] == "tech_eo":
            form_default = cov.get(policy_form, 0)
            default_status = "Aggregate" if form_default == "aggregate" else "None"
            current_status = overrides.get(cov["id"], default_status)
            coverage_status.append((cov["id"], cov["label"], current_status, default_status))
            break

    # Add rest of coverages
    for cov in agg_defs:
        if cov["id"] == "tech_eo":
            continue
        cov_id = cov["id"]
        label = cov["label"]
        form_default = cov.get(policy_form, 0)
        default_status = "Aggregate" if form_default == "aggregate" else "None"
        current_status = overrides.get(cov_id, default_status)
        coverage_status.append((cov_id, label, current_status, default_status))

    if not st.session_state[edit_key]:
        # Edit link at top right
        col1, col2 = st.columns([4, 1])
        with col2:
            if st.button("Edit", key=f"edit_btn_{sub_id}", use_container_width=True):
                st.session_state[edit_key] = True
                from utils.tab_state import rerun_on_rating_tab
                rerun_on_rating_tab()

        # Group coverages by status
        full_limits = []
        sublimits = []  # $1M or other sub-limits
        no_coverage = []

        for cov_id, label, status, _ in coverage_status:
            if status == "Aggregate":
                full_limits.append(label)
            elif status == "None":
                no_coverage.append(label)
            else:
                # $1M or other sublimits
                sublimits.append((label, status))

        # Display grouped summary (combined to remove spacing)
        if full_limits:
            items = "  \n".join(full_limits)
            st.markdown(f"**Full Limits:**  \n{items}")

        if sublimits:
            items = "  \n".join([f"{label} - {status}" for label, status in sublimits])
            st.markdown(f"**Sub Limit:**  \n{items}")

        if no_coverage:
            items = "  \n".join(no_coverage)
            st.markdown(f"**No Coverage:**  \n{items}")
    else:
        # Done link at top right
        col1, col2 = st.columns([4, 1])
        with col2:
            if st.button("Done", key=f"done_btn_{sub_id}", use_container_width=True):
                st.session_state[edit_key] = False
                from utils.tab_state import rerun_on_rating_tab
                rerun_on_rating_tab()

        # Edit view
        for cov_id, label, current_status, default_status in coverage_status:
            display_current = display_map.get(current_status, current_status)
            idx = options.index(display_current) if display_current in options else 0
            new_display = st.selectbox(
                label,
                options=options,
                index=idx,
                key=f"agg_{sub_id}_{policy_form}_{cov_id}",
            )
            new_status = storage_map.get(new_display, new_display)

            # Store override if different from form default
            if new_status != default_status:
                st.session_state[agg_override_key][cov_id] = new_status
            elif cov_id in st.session_state[agg_override_key]:
                del st.session_state[agg_override_key][cov_id]


def _render_sublimit_defaults(sub_id: str, policy_form: str) -> None:
    """Render sublimit default configuration with two-column grid layout."""
    sub_defs = get_sublimit_coverage_definitions()
    sublimit_key = f"sublimit_defaults_{sub_id}"
    defaults = st.session_state.get(sublimit_key, {})

    # Options: fixed amounts + percentage-based + none
    options = [
        ("$100K", 100_000),
        ("$250K", 250_000),
        ("$500K", 500_000),
        ("$1M", 1_000_000),
        ("50% Agg", "50%"),
        ("Aggregate", "aggregate"),
        ("None", "none"),
    ]
    option_labels = [o[0] for o in options]
    option_values = [o[1] for o in options]

    # Split into two columns
    mid = (len(sub_defs) + 1) // 2
    col_a, col_b = st.columns(2)

    def render_coverage_row(cov, parent_col):
        cov_id = cov["id"]
        label = cov["label"]
        config_default = cov.get("default", 0)
        form_setting = cov.get(policy_form, 0)

        # If excluded for this form (e.g., Tech), default to "none"
        if form_setting != "sublimit":
            current_val = "none"
        else:
            current_val = defaults.get(cov_id, config_default)

        # Find current index in options
        if current_val in option_values:
            idx = option_values.index(current_val)
        elif config_default in option_values:
            idx = option_values.index(config_default)
        else:
            idx = 0

        with parent_col:
            c1, c2 = st.columns([1.8, 1])
            with c1:
                st.markdown(f"<div style='font-size: 14px; padding: 8px 0;'>{label}</div>", unsafe_allow_html=True)
            with c2:
                new_idx = st.selectbox(
                    label,
                    options=range(len(options)),
                    index=idx,
                    format_func=lambda i: option_labels[i],
                    key=f"sub_{sub_id}_{policy_form}_{cov_id}",
                    label_visibility="collapsed",
                )

            # Update session state with the value
            st.session_state[sublimit_key][cov_id] = option_values[new_idx]

    for cov in sub_defs[:mid]:
        render_coverage_row(cov, col_a)

    for cov in sub_defs[mid:]:
        render_coverage_row(cov, col_b)


def save_submission_policy_form(sub_id: str, policy_form: str, get_conn_func) -> bool:
    """Save policy form as submission default."""
    try:
        with get_conn_func().cursor() as cur:
            cur.execute(
                "UPDATE submissions SET default_policy_form = %s WHERE id = %s",
                (policy_form, sub_id),
            )
            get_conn_func().commit()
        return True
    except Exception:
        return False
