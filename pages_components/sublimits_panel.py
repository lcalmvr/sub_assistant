"""
Sublimits Panel Component (Coverage Schedule for Excess Quotes)

For excess quotes, this panel serves as the Coverage Schedule, showing:
- Dynamic coverages from the underlying primary carrier (not predefined)
- Primary Limit | Our Limit | Our Attachment per coverage
- AI parsing to extract coverages from quote documents
- Proportional defaults with UW override capability

Each excess quote option can have different coverage settings.
"""
from __future__ import annotations

import re
import streamlit as st
from typing import Optional

from pages_components.tower_db import get_quote_by_id, update_quote_field


# ─────────────────────── Formatting Helpers ───────────────────────

def _parse_amount(val) -> float:
    """Parse dollar amounts including K/M notation."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return 0.0
    try:
        if s.endswith("K"):
            return float(s[:-1] or 0) * 1_000
        if s.endswith("M"):
            return float(s[:-1] or 0) * 1_000_000
        return float(s)
    except Exception:
        try:
            n = float(re.sub(r"[^0-9.]+", "", s))
            return n
        except Exception:
            return 0.0


def _format_amount(amount: float) -> str:
    """Format amount for display (e.g., 1000000 -> '1M')."""
    if amount is None or amount == 0:
        return ""
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"{int(amount // 1_000_000)}M"
    if amount >= 1_000 and amount % 1_000 == 0:
        return f"{int(amount // 1_000)}K"
    return f"{amount:,.0f}"


def _format_amount_short(amount: float) -> str:
    """Format amount for compact display (no $ to avoid LaTeX issues)."""
    if amount is None or amount == 0:
        return "—"
    if amount >= 1_000_000:
        return f"{int(amount // 1_000_000)}M"
    if amount >= 1_000:
        return f"{int(amount // 1_000)}K"
    return f"{int(amount)}"


# ─────────────────────── Main Render Function ───────────────────────

def render_sublimits_panel(sub_id: str, quote_id: Optional[str] = None, expanded: bool = False):
    """
    Render the sublimits/excess coverage panel.

    For excess quotes, this serves as the Coverage Schedule showing dynamic
    coverages from the underlying carrier (not our predefined list).

    Args:
        sub_id: Submission ID
        quote_id: Quote ID for per-option storage (required for excess quotes)
        expanded: Whether to expand the section by default
    """
    is_excess_mode = quote_id is not None
    session_key = f"quote_sublimits_{quote_id}" if quote_id else "sublimits"

    # Load sublimits from database if viewing a saved quote
    if quote_id:
        _load_sublimits_from_quote(quote_id, session_key)

    # Initialize session state if needed
    if session_key not in st.session_state:
        st.session_state[session_key] = []

    panel_title = "📋 Coverage Schedule (Excess)" if is_excess_mode else "📋 Sublimits"

    with st.expander(panel_title, expanded=expanded):
        # Calculate tower context for proportional sublimit calculations
        tower_context = _get_tower_context_for_quote(quote_id) if quote_id else _get_tower_context()

        # Display position info (compact)
        _render_position_info(tower_context)

        # Header row with toggle
        col_title, col_toggle = st.columns([3, 1])
        with col_title:
            st.caption("Define underlying coverages and your treatment for each")
        with col_toggle:
            view_mode = st.toggle("Card", key=f"sublimits_card_view_{quote_id or sub_id}", help="Switch to card view for mobile")

        # Add coverage button
        if st.button("+ Add Coverage", key=f"add_coverage_btn_{quote_id or sub_id}", use_container_width=True):
            _add_new_coverage(session_key, quote_id)

        sublimits = st.session_state.get(session_key, [])

        if not sublimits:
            st.caption("No coverages defined yet.")
            _render_bulk_add_section(sub_id, quote_id, session_key, tower_context)
            return

        # Proportional calculation function
        def calc_proportional(primary_limit: float) -> tuple[float, float]:
            return _calc_proportional_sublimit(primary_limit, tower_context)

        if view_mode:
            # Card view - compact clickable cards
            st.caption("Tap a card to edit")
            for idx, coverage in enumerate(sublimits):
                _render_coverage_card(sub_id, quote_id, session_key, idx, coverage, calc_proportional)
        else:
            # Table view - desktop
            _render_coverage_table_headers()
            for idx, coverage in enumerate(sublimits):
                _render_coverage_row(sub_id, quote_id, session_key, idx, coverage, calc_proportional)

        # Bulk add section at bottom
        st.markdown("---")
        _render_bulk_add_section(sub_id, quote_id, session_key, tower_context)


# ─────────────────────── Table View ───────────────────────

def _render_coverage_table_headers():
    """Render column headers for coverage table."""
    hdr_cov, hdr_primary, hdr_treatment, hdr_limit, hdr_attach, hdr_del = st.columns([2, 1, 1.2, 1, 1, 0.4])
    hdr_cov.caption("Coverage")
    hdr_primary.caption("Primary Limit")
    hdr_treatment.caption("Treatment")
    hdr_limit.caption("Our Limit")
    hdr_attach.caption("Our Attach")


def _render_coverage_row(sub_id: str, quote_id: str, session_key: str, idx: int, coverage: dict, calc_fn):
    """Render a single coverage as an inline editable row."""
    cov_name = coverage.get("coverage", "")
    primary_limit = coverage.get("primary_limit", 0)
    treatment = coverage.get("treatment", "follow_form")
    stored_our_limit = coverage.get("our_limit")
    stored_our_attach = coverage.get("our_attachment")

    # Calculate proportional defaults
    prop_limit, prop_attach = calc_fn(primary_limit)

    # Columns: Coverage | Primary Limit | Treatment | Our Limit | Our Attach | Delete
    col_cov, col_primary, col_treatment, col_limit, col_attach, col_delete = st.columns([2, 1, 1.2, 1, 1, 0.4])

    with col_cov:
        new_cov = st.text_input(
            "Coverage",
            value=cov_name,
            key=f"cov_name_{quote_id}_{idx}",
            label_visibility="collapsed",
            placeholder="Coverage name"
        )

    with col_primary:
        # Primary limit dropdown
        limit_options = ["$100K", "$250K", "$500K", "$1M", "$2M", "$3M", "$5M"]
        limit_map = {"$100K": 100_000, "$250K": 250_000, "$500K": 500_000, "$1M": 1_000_000,
                     "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000}
        reverse_map = {v: k for k, v in limit_map.items()}

        current_label = reverse_map.get(primary_limit, "$1M")
        new_primary_label = st.selectbox(
            "Primary Limit",
            options=limit_options,
            index=limit_options.index(current_label) if current_label in limit_options else 3,
            key=f"cov_primary_{quote_id}_{idx}",
            label_visibility="collapsed"
        )
        new_primary_limit = limit_map[new_primary_label]

    with col_treatment:
        treatment_options = ["follow_form", "different", "no_coverage"]
        treatment_labels = {"follow_form": "Follow Form", "different": "Different", "no_coverage": "No Coverage"}
        current_treatment_idx = treatment_options.index(treatment) if treatment in treatment_options else 0

        new_treatment = st.selectbox(
            "Treatment",
            options=treatment_options,
            index=current_treatment_idx,
            format_func=lambda x: treatment_labels.get(x, x),
            key=f"cov_treatment_{quote_id}_{idx}",
            label_visibility="collapsed"
        )

    # Recalculate proportional with potentially new primary limit
    prop_limit, prop_attach = calc_fn(new_primary_limit)

    with col_limit:
        # Our limit - editable dropdown, defaults to proportional
        our_limit_options = ["$100K", "$250K", "$500K", "$1M", "$2M", "$3M", "$5M", "Prop"]
        our_limit_map = {"$100K": 100_000, "$250K": 250_000, "$500K": 500_000, "$1M": 1_000_000,
                        "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000}

        if new_treatment == "no_coverage":
            st.text_input("Our Limit", value="—", disabled=True, label_visibility="collapsed", key=f"cov_our_limit_{quote_id}_{idx}")
            new_our_limit = None
        else:
            # Determine current value - use stored if "different", else proportional
            if new_treatment == "different" and stored_our_limit:
                current_our_label = reverse_map.get(stored_our_limit) if stored_our_limit in reverse_map.values() else f"${stored_our_limit/1000:.0f}K" if stored_our_limit >= 1000 else ""
                if current_our_label not in our_limit_options:
                    current_our_label = "Prop"
            else:
                current_our_label = "Prop"

            new_our_limit_label = st.selectbox(
                "Our Limit",
                options=our_limit_options,
                index=our_limit_options.index(current_our_label) if current_our_label in our_limit_options else 7,
                key=f"cov_our_limit_{quote_id}_{idx}",
                label_visibility="collapsed"
            )

            if new_our_limit_label == "Prop":
                new_our_limit = prop_limit
            else:
                new_our_limit = our_limit_map.get(new_our_limit_label, prop_limit)

    with col_attach:
        # Our attachment - editable dropdown, defaults to proportional
        attach_options = ["$0", "$100K", "$250K", "$500K", "$1M", "$2M", "$3M", "$5M", "Prop"]
        attach_map = {"$0": 0, "$100K": 100_000, "$250K": 250_000, "$500K": 500_000, "$1M": 1_000_000,
                      "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000}
        attach_reverse = {v: k for k, v in attach_map.items()}

        if new_treatment == "no_coverage":
            st.text_input("Our Attach", value="—", disabled=True, label_visibility="collapsed", key=f"cov_our_attach_{quote_id}_{idx}")
            new_our_attach = None
        else:
            # Determine current value
            if new_treatment == "different" and stored_our_attach is not None:
                current_attach_label = attach_reverse.get(stored_our_attach, "Prop")
                if current_attach_label not in attach_options:
                    current_attach_label = "Prop"
            else:
                current_attach_label = "Prop"

            new_attach_label = st.selectbox(
                "Our Attach",
                options=attach_options,
                index=attach_options.index(current_attach_label) if current_attach_label in attach_options else 8,
                key=f"cov_our_attach_{quote_id}_{idx}",
                label_visibility="collapsed"
            )

            if new_attach_label == "Prop":
                new_our_attach = prop_attach
            else:
                new_our_attach = attach_map.get(new_attach_label, prop_attach)

    with col_delete:
        if st.button("×", key=f"delete_cov_{quote_id}_{idx}", help="Remove coverage"):
            sublimits = st.session_state.get(session_key, [])
            sublimits.pop(idx)
            st.session_state[session_key] = sublimits
            if quote_id:
                _save_sublimits_to_quote(quote_id, sublimits)
            st.rerun()

    # Check for changes and save
    changed = False
    if new_cov != cov_name:
        coverage["coverage"] = new_cov
        changed = True
    if new_primary_limit != primary_limit:
        coverage["primary_limit"] = new_primary_limit
        changed = True
    if new_treatment != treatment:
        coverage["treatment"] = new_treatment
        changed = True

    # Store our_limit/our_attachment only if treatment is "different" and not proportional
    if new_treatment == "different":
        if new_our_limit != stored_our_limit:
            coverage["our_limit"] = new_our_limit
            changed = True
        if new_our_attach != stored_our_attach:
            coverage["our_attachment"] = new_our_attach
            changed = True
    elif new_treatment == "follow_form":
        # Clear overrides when switching to follow_form
        if stored_our_limit is not None or stored_our_attach is not None:
            coverage["our_limit"] = None
            coverage["our_attachment"] = None
            changed = True

    if changed:
        sublimits = st.session_state.get(session_key, [])
        st.session_state[session_key] = sublimits
        if quote_id:
            _save_sublimits_to_quote(quote_id, sublimits)


# ─────────────────────── Card View ───────────────────────

def _render_coverage_card(sub_id: str, quote_id: str, session_key: str, idx: int, coverage: dict, calc_fn):
    """Render a single coverage as a compact clickable card."""
    cov_name = coverage.get("coverage", "") or "Unnamed Coverage"
    primary_limit = coverage.get("primary_limit", 0)
    treatment = coverage.get("treatment", "follow_form")
    stored_our_limit = coverage.get("our_limit")
    stored_our_attach = coverage.get("our_attachment")

    # Calculate proportional defaults
    prop_limit, prop_attach = calc_fn(primary_limit)

    # Determine display values based on treatment
    if treatment == "no_coverage":
        our_limit_str = "No Cov"
        our_attach_str = ""
    elif treatment == "different" and stored_our_limit:
        our_limit_str = _format_amount_short(stored_our_limit)
        our_attach_str = f"xs {_format_amount_short(stored_our_attach)}" if stored_our_attach else ""
    else:
        our_limit_str = _format_amount_short(prop_limit)
        our_attach_str = f"xs {_format_amount_short(prop_attach)}" if prop_attach else ""

    # Treatment label
    treatment_labels = {"follow_form": "Follow", "different": "Modified", "no_coverage": "Excluded"}
    treatment_str = treatment_labels.get(treatment, treatment)

    # Build card content (no $ to avoid LaTeX issues)
    line1 = f"**{cov_name}**"
    line2 = f"Primary: {_format_amount_short(primary_limit)} · {treatment_str}"
    line3 = f"Ours: {our_limit_str}" + (f" {our_attach_str}" if our_attach_str else "")

    # Clickable card button
    card_key = f"coverage_card_{quote_id}_{idx}"
    if st.button(
        f"{line1}\n\n{line2}\n\n{line3}",
        key=card_key,
        use_container_width=True,
        help="Tap to edit"
    ):
        st.session_state[f"editing_coverage_{quote_id}_{idx}"] = True
        st.rerun()

    # Show edit dialog if this card is being edited
    if st.session_state.get(f"editing_coverage_{quote_id}_{idx}"):
        _render_coverage_edit_dialog(sub_id, quote_id, session_key, idx, coverage, calc_fn)


def _render_coverage_edit_dialog(sub_id: str, quote_id: str, session_key: str, idx: int, coverage: dict, calc_fn):
    """Render edit dialog for a coverage."""

    @st.dialog("Edit Coverage", width="small")
    def show_edit():
        cov_name = coverage.get("coverage", "")
        primary_limit = coverage.get("primary_limit", 0)
        treatment = coverage.get("treatment", "follow_form")
        stored_our_limit = coverage.get("our_limit")
        stored_our_attach = coverage.get("our_attachment")

        new_cov = st.text_input("Coverage Name", value=cov_name, key=f"edit_cov_name_{quote_id}_{idx}")

        col1, col2 = st.columns(2)

        with col1:
            limit_options = ["$100K", "$250K", "$500K", "$1M", "$2M", "$3M", "$5M"]
            limit_map = {"$100K": 100_000, "$250K": 250_000, "$500K": 500_000, "$1M": 1_000_000,
                         "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000}
            reverse_map = {v: k for k, v in limit_map.items()}

            current_label = reverse_map.get(primary_limit, "$1M")
            new_primary_label = st.selectbox(
                "Primary Limit",
                options=limit_options,
                index=limit_options.index(current_label) if current_label in limit_options else 3,
                key=f"edit_cov_primary_{quote_id}_{idx}"
            )
            new_primary_limit = limit_map[new_primary_label]

        with col2:
            treatment_options = ["follow_form", "different", "no_coverage"]
            treatment_labels = {"follow_form": "Follow Form", "different": "Different", "no_coverage": "No Coverage"}
            current_treatment_idx = treatment_options.index(treatment) if treatment in treatment_options else 0

            new_treatment = st.selectbox(
                "Treatment",
                options=treatment_options,
                index=current_treatment_idx,
                format_func=lambda x: treatment_labels.get(x, x),
                key=f"edit_cov_treatment_{quote_id}_{idx}"
            )

        # Calculate proportional with new primary
        prop_limit, prop_attach = calc_fn(new_primary_limit)

        st.markdown("---")
        st.caption("Our Coverage (editable)")

        col3, col4 = st.columns(2)

        with col3:
            if new_treatment == "no_coverage":
                st.text_input("Our Limit", value="—", disabled=True, key=f"edit_our_limit_{quote_id}_{idx}")
                new_our_limit = None
            else:
                our_limit_options = ["$100K", "$250K", "$500K", "$1M", "$2M", "$3M", "$5M", "Proportional"]
                our_limit_map = {"$100K": 100_000, "$250K": 250_000, "$500K": 500_000, "$1M": 1_000_000,
                                "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000}
                our_reverse = {v: k for k, v in our_limit_map.items()}

                if new_treatment == "different" and stored_our_limit:
                    current_our_label = our_reverse.get(stored_our_limit, "Proportional")
                else:
                    current_our_label = "Proportional"

                new_our_limit_label = st.selectbox(
                    "Our Limit",
                    options=our_limit_options,
                    index=our_limit_options.index(current_our_label) if current_our_label in our_limit_options else 7,
                    key=f"edit_our_limit_{quote_id}_{idx}"
                )

                if new_our_limit_label == "Proportional":
                    new_our_limit = prop_limit
                    st.caption(f"= {_format_amount(prop_limit)}")
                else:
                    new_our_limit = our_limit_map.get(new_our_limit_label, prop_limit)

        with col4:
            if new_treatment == "no_coverage":
                st.text_input("Our Attachment", value="—", disabled=True, key=f"edit_our_attach_{quote_id}_{idx}")
                new_our_attach = None
            else:
                attach_options = ["$0", "$100K", "$250K", "$500K", "$1M", "$2M", "$3M", "$5M", "Proportional"]
                attach_map = {"$0": 0, "$100K": 100_000, "$250K": 250_000, "$500K": 500_000, "$1M": 1_000_000,
                              "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000}
                attach_reverse = {v: k for k, v in attach_map.items()}

                if new_treatment == "different" and stored_our_attach is not None:
                    current_attach_label = attach_reverse.get(stored_our_attach, "Proportional")
                else:
                    current_attach_label = "Proportional"

                new_attach_label = st.selectbox(
                    "Our Attachment",
                    options=attach_options,
                    index=attach_options.index(current_attach_label) if current_attach_label in attach_options else 8,
                    key=f"edit_our_attach_{quote_id}_{idx}"
                )

                if new_attach_label == "Proportional":
                    new_our_attach = prop_attach
                    st.caption(f"= {_format_amount(prop_attach)}")
                else:
                    new_our_attach = attach_map.get(new_attach_label, prop_attach)

        st.markdown("---")

        col_save, col_delete, col_cancel = st.columns(3)

        with col_save:
            if st.button("Save", type="primary", use_container_width=True, key=f"save_cov_{quote_id}_{idx}"):
                coverage["coverage"] = new_cov
                coverage["primary_limit"] = new_primary_limit
                coverage["treatment"] = new_treatment

                if new_treatment == "different":
                    coverage["our_limit"] = new_our_limit
                    coverage["our_attachment"] = new_our_attach
                else:
                    coverage["our_limit"] = None
                    coverage["our_attachment"] = None

                sublimits = st.session_state.get(session_key, [])
                st.session_state[session_key] = sublimits
                if quote_id:
                    _save_sublimits_to_quote(quote_id, sublimits)
                st.session_state[f"editing_coverage_{quote_id}_{idx}"] = False
                st.rerun()

        with col_delete:
            if st.button("Delete", use_container_width=True, key=f"del_cov_{quote_id}_{idx}"):
                sublimits = st.session_state.get(session_key, [])
                sublimits.pop(idx)
                st.session_state[session_key] = sublimits
                if quote_id:
                    _save_sublimits_to_quote(quote_id, sublimits)
                st.session_state[f"editing_coverage_{quote_id}_{idx}"] = False
                st.rerun()

        with col_cancel:
            if st.button("Cancel", use_container_width=True, key=f"cancel_cov_{quote_id}_{idx}"):
                st.session_state[f"editing_coverage_{quote_id}_{idx}"] = False
                st.rerun()

    show_edit()


# ─────────────────────── Add/Bulk Functions ───────────────────────

def _add_new_coverage(session_key: str, quote_id: str):
    """Add a new empty coverage row."""
    sublimits = st.session_state.get(session_key, [])
    sublimits.append({
        "coverage": "",
        "primary_limit": 1_000_000,
        "treatment": "follow_form",
        "our_limit": None,
        "our_attachment": None,
    })
    st.session_state[session_key] = sublimits
    if quote_id:
        _save_sublimits_to_quote(quote_id, sublimits)
    st.rerun()


def _render_bulk_add_section(sub_id: str, quote_id: str, session_key: str, tower_context: dict):
    """Render section for bulk adding coverages via AI."""
    with st.container():
        st.caption("Bulk add via AI")

        sublimit_input = st.text_area(
            "Describe coverages:",
            placeholder="Example: 'Primary has 1M ransomware, 500K business interruption, 250K social engineering'",
            height=80,
            key=f"sublimit_input_{quote_id or sub_id}",
            label_visibility="collapsed"
        )

        col_process, col_clear = st.columns([1, 4])
        with col_process:
            if st.button("Parse", key=f"process_sublimits_btn_{quote_id or sub_id}"):
                if sublimit_input.strip():
                    _process_sublimits_with_ai(sublimit_input, tower_context, session_key, quote_id)
        with col_clear:
            if st.button("Clear All", key=f"clear_sublimits_btn_{quote_id or sub_id}"):
                st.session_state[session_key] = []
                if quote_id:
                    _save_sublimits_to_quote(quote_id, [])
                st.rerun()


# ─────────────────────── Tower Context & Calculations ───────────────────────

def _load_sublimits_from_quote(quote_id: str, session_key: str):
    """Load sublimits from the quote's database record."""
    last_loaded_key = "last_loaded_sublimits_quote"
    last_loaded_quote = st.session_state.get(last_loaded_key)

    if last_loaded_quote != quote_id:
        quote = get_quote_by_id(quote_id)
        if quote:
            sublimits = quote.get("sublimits") or []
            st.session_state[session_key] = sublimits
        else:
            st.session_state[session_key] = []
        st.session_state[last_loaded_key] = quote_id


def _save_sublimits_to_quote(quote_id: str, sublimits: list):
    """Save sublimits to the quote's database record."""
    update_quote_field(quote_id, "sublimits", sublimits)


def _get_tower_context_for_quote(quote_id: str) -> dict:
    """Get tower context from a specific quote's tower_json."""
    quote = get_quote_by_id(quote_id)
    if not quote:
        return _get_tower_context()

    tower_json = quote.get("tower_json", [])
    return _build_tower_context(tower_json)


def _get_tower_context() -> dict:
    """Get tower context from session state tower_layers."""
    tower_layers = st.session_state.get("tower_layers", [])
    return _build_tower_context(tower_layers)


def _build_tower_context(tower_layers: list) -> dict:
    """Build tower context from tower_json for sublimit calculations."""
    cmai_layer_idx = None
    cmai_layer = None
    for idx, layer in enumerate(tower_layers or []):
        carrier_name = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier_name:
            cmai_layer_idx = idx
            cmai_layer = layer
            break

    our_aggregate_limit = 0.0
    our_aggregate_attachment = 0.0
    layers_below_count = 0
    primary_aggregate_limit = 0.0

    if tower_layers:
        primary_aggregate_limit = tower_layers[0].get("limit", 0) or 0

        if cmai_layer_idx is not None:
            our_aggregate_attachment = sum(
                layer.get("limit", 0) for layer in tower_layers[:cmai_layer_idx]
            )
            our_aggregate_limit = cmai_layer.get("limit", 0) or 0
            layers_below_count = cmai_layer_idx
        else:
            our_aggregate_attachment = sum(
                layer.get("limit", 0) for layer in tower_layers
            )
            layers_below_count = len(tower_layers)
            our_aggregate_limit = primary_aggregate_limit

    return {
        "tower_layers": tower_layers,
        "cmai_layer_idx": cmai_layer_idx,
        "cmai_layer": cmai_layer,
        "our_aggregate_limit": our_aggregate_limit,
        "our_aggregate_attachment": our_aggregate_attachment,
        "layers_below_count": layers_below_count,
        "primary_aggregate_limit": primary_aggregate_limit,
    }


def _render_position_info(ctx: dict):
    """Render position information in the tower."""
    if ctx["cmai_layer_idx"] is not None:
        st.caption(
            f"**CMAI:** {_format_amount(ctx['our_aggregate_limit'])} xs "
            f"{_format_amount(ctx['our_aggregate_attachment'])} · "
            f"Primary agg: {_format_amount(ctx['primary_aggregate_limit'])}"
        )
    elif ctx["tower_layers"]:
        st.warning("CMAI not found in tower. Add CMAI as a carrier to auto-calculate.")


def _calc_proportional_sublimit(primary_sublimit: float, ctx: dict) -> tuple[float, float]:
    """Calculate our sublimit and attachment based on proportional logic."""
    primary_aggregate_limit = ctx["primary_aggregate_limit"]
    our_aggregate_limit = ctx["our_aggregate_limit"]
    layers_below_count = ctx["layers_below_count"]
    tower_layers = ctx["tower_layers"]

    if not primary_aggregate_limit or not primary_sublimit:
        return primary_sublimit, 0.0

    sublimit_ratio = primary_sublimit / primary_aggregate_limit
    our_sublimit = sublimit_ratio * our_aggregate_limit if our_aggregate_limit else primary_sublimit

    sublimit_attachment = 0.0
    for layer in (tower_layers or [])[:layers_below_count]:
        layer_limit = layer.get("limit", 0) or 0
        sublimit_attachment += layer_limit * sublimit_ratio

    return our_sublimit, sublimit_attachment


def _process_sublimits_with_ai(sublimit_input: str, ctx: dict, session_key: str = "sublimits", quote_id: Optional[str] = None):
    """Process sublimit input with AI."""
    try:
        from ai.sublimit_intel import parse_sublimits_with_ai, edit_sublimits_with_ai

        current_sublimits = st.session_state.get(session_key, [])
        primary_aggregate_limit = ctx["primary_aggregate_limit"]

        context = f"Primary aggregate limit: {_format_amount(primary_aggregate_limit)}" if primary_aggregate_limit else ""

        if current_sublimits:
            result = edit_sublimits_with_ai(current_sublimits, sublimit_input)
        else:
            result = parse_sublimits_with_ai(sublimit_input, context)

        st.session_state[session_key] = result

        if quote_id:
            _save_sublimits_to_quote(quote_id, result)

        st.success(f"Parsed {len(result)} coverages")
        st.rerun()

    except Exception as e:
        st.error(f"Error processing: {e}")
