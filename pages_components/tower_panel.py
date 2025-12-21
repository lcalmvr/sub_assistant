"""
Tower Panel Component
Renders the insurance tower builder with card-based editing and read-only table view.
"""
from __future__ import annotations

import re
from typing import Optional
import pandas as pd
import streamlit as st


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


def _format_rpm(rpm: float) -> str:
    """Format RPM for display."""
    if rpm is None or rpm == 0:
        return ""
    if rpm >= 1_000:
        return f"{rpm/1000:.1f}K"
    return f"{rpm:,.0f}"


def _format_currency(amount: float) -> str:
    """Format currency for display."""
    if amount is None:
        return ""
    if amount >= 1_000_000:
        return f"${amount/1_000_000:.1f}M"
    if amount >= 1_000:
        return f"${amount/1_000:.0f}K"
    return f"${amount:,.0f}"


def _parse_premium(val):
    """Parse a premium value, accepting K/M notation."""
    if val is None or str(val).strip() == "":
        return None
    return _parse_amount(val)


# ─────────────────────── Standard Options ───────────────────────

LIMIT_OPTIONS = [
    ("$1M", 1_000_000),
    ("$2M", 2_000_000),
    ("$3M", 3_000_000),
    ("$5M", 5_000_000),
    ("$10M", 10_000_000),
    ("$15M", 15_000_000),
    ("$20M", 20_000_000),
    ("$25M", 25_000_000),
]

RETENTION_OPTIONS = [
    ("$10K", 10_000),
    ("$25K", 25_000),
    ("$50K", 50_000),
    ("$100K", 100_000),
    ("$250K", 250_000),
    ("$500K", 500_000),
    ("$1M", 1_000_000),
]


# ─────────────────────── Layer Calculations ───────────────────────

def _recalculate_attachments(layers: list) -> None:
    """Recalculate attachment points based on layer stacking."""
    if not layers:
        return

    running_attachment = 0.0
    for idx, layer in enumerate(layers):
        if idx == 0:
            layer["attachment"] = 0
        else:
            layer["attachment"] = running_attachment
        running_attachment += layer.get("limit", 0) or 0


def _recalculate_rpm_ilf(layers: list) -> None:
    """Recalculate RPM and ILF for all layers."""
    if not layers:
        return

    # Get primary RPM for ILF calculation
    primary = layers[0] if layers else {}
    primary_limit = primary.get("limit") or 0
    primary_premium = primary.get("premium")
    base_rpm = primary.get("rpm")

    if not base_rpm and primary_premium and primary_limit:
        base_rpm = primary_premium / max(1.0, (primary_limit / 1_000_000.0))
        primary["rpm"] = base_rpm

    # Calculate RPM and ILF for each layer
    for layer in layers:
        limit_val = layer.get("limit") or 0
        premium = layer.get("premium")

        exposure = limit_val / 1_000_000.0 if limit_val else 0

        # Calculate RPM from premium
        if premium and exposure:
            layer["rpm"] = premium / exposure

        # Calculate ILF relative to primary
        if base_rpm and layer.get("rpm"):
            layer["ilf"] = f"{layer['rpm'] / base_rpm:.2f}"


def _recalculate_all(layers: list) -> None:
    """Recalculate all derived fields."""
    _recalculate_attachments(layers)
    _recalculate_rpm_ilf(layers)


# ─────────────────────── Main Render Function ───────────────────────

def render_tower_panel(sub_id: str, expanded: bool = True, position: str = None, readonly: bool = False):
    """
    Render the insurance tower panel.

    For excess quotes: structured template with CMAI at top, underlying below.
    For primary quotes: simple card-based editing.

    Args:
        sub_id: Submission ID
        expanded: Whether to expand the tower section by default
        position: "primary" or "excess" - if None, will detect from current quote
        readonly: If True, render in read-only mode (for post-bind state)
    """
    # Detect position if not provided
    if position is None:
        from pages_components.quote_options_panel import get_current_quote_position
        position = get_current_quote_position(sub_id)

    # Initialize session state
    if "tower_layers" not in st.session_state:
        st.session_state.tower_layers = []
    if "primary_retention" not in st.session_state:
        st.session_state.primary_retention = None
    if "editing_layer_idx" not in st.session_state:
        st.session_state.editing_layer_idx = None
    if "adding_new_layer" not in st.session_state:
        st.session_state.adding_new_layer = False

    # Use different rendering for excess vs primary
    if position == "excess":
        _render_excess_tower_panel(sub_id, expanded, readonly=readonly)
    else:
        _render_primary_tower_panel(sub_id, expanded, readonly=readonly)


def _render_primary_tower_panel(sub_id: str, expanded: bool = True, readonly: bool = False):
    """Render tower panel for primary quotes - simple card-based editing or read-only display."""
    with st.expander("🏗️ Insurance Tower", expanded=expanded):
        if readonly:
            # Read-only mode: just display the tower structure
            _render_tower_cards_readonly()
            _render_tower_summary()
        else:
            # Edit mode: full functionality
            # Action buttons row
            col_add, col_bulk, col_clear, col_spacer = st.columns([1, 1, 1, 1])

            with col_add:
                if st.button("+ Add Layer", key="tower_add_layer_btn", use_container_width=True):
                    st.session_state.adding_new_layer = True
                    st.session_state.editing_layer_idx = None
                    st.rerun()

            with col_bulk:
                if st.button("Bulk Add", key="tower_bulk_btn", use_container_width=True):
                    st.session_state.show_bulk_add_dialog = True

            with col_clear:
                if st.button("Clear", key="tower_clear_btn", use_container_width=True):
                    st.session_state.tower_layers = []
                    st.session_state.primary_retention = None
                    st.session_state.editing_layer_idx = None
                    st.session_state.adding_new_layer = False
                    st.rerun()

            # Show bulk add dialog if triggered
            if st.session_state.get("show_bulk_add_dialog"):
                _render_bulk_add_dialog()

            # Show layer card if adding or editing
            if st.session_state.adding_new_layer:
                _render_new_layer_card()
            elif st.session_state.editing_layer_idx is not None:
                _render_edit_layer_card(st.session_state.editing_layer_idx)

            # Tower Cards (responsive, click to edit)
            _render_tower_cards()

            # Tower Summary
            _render_tower_summary()


def _render_excess_tower_panel(sub_id: str, expanded: bool = True, readonly: bool = False):
    """
    Render structured excess tower panel.

    Layout:
    ┌─ Our Layer (CMAI) ─────────────────┐
    │ Limit: [$5M ▾]   Attach: $5M (auto)│
    └────────────────────────────────────┘
             ↑ We attach here
    ┌─ Underlying Program ───────────────┐
    │ [Excess layers if any]             │
    │ Primary: [Carrier] $[5M] x $[25K]  │
    └────────────────────────────────────┘
    """
    layers = st.session_state.tower_layers or []

    with st.expander("🏗️ Excess Tower Structure", expanded=expanded):
        # Find CMAI layer and underlying layers
        cmai_layer = None
        cmai_idx = None
        underlying_layers = []

        for idx, layer in enumerate(layers):
            if "CMAI" in str(layer.get("carrier", "")).upper():
                cmai_layer = layer
                cmai_idx = idx
            else:
                underlying_layers.append((idx, layer))

        # Get quote_id for unique widget keys
        viewing_quote_id = st.session_state.get("viewing_quote_id", "")

        # Calculate our attachment from underlying layers
        underlying_total = sum(layer.get("limit", 0) for _, layer in underlying_layers)

        if readonly:
            # Read-only mode: simplified display
            _render_excess_tower_readonly(cmai_layer, underlying_layers, underlying_total)
            return

        # ─────────────────────────────────────────────────────
        # HEADER BAR - Toggle and Add button
        # ─────────────────────────────────────────────────────
        col_toggle, col_add = st.columns([1, 3])
        with col_toggle:
            view_mode = st.toggle("Card", key=f"tower_card_view_{viewing_quote_id}", help="Switch to card view for mobile")
        with col_add:
            if st.button("+ Add Underlying Layer", key=f"add_underlying_btn_{viewing_quote_id}", use_container_width=True):
                _add_underlying_layer(sub_id)

        # ─────────────────────────────────────────────────────
        # OUR LAYER (CMAI) - Always at top, aligned with underlying table
        # ─────────────────────────────────────────────────────
        # Column headers row with "Our Layer" as the first column header
        hdr_carrier, hdr_limit, hdr_attach, hdr_premium, hdr_rpm, hdr_ilf, hdr_spacer = st.columns([2, 1, 1, 1.2, 0.8, 0.6, 0.4])
        hdr_carrier.markdown("##### Our Layer")
        hdr_limit.caption("Limit")
        hdr_attach.caption("Ret/Attach")
        hdr_premium.caption("Premium")
        hdr_rpm.caption("RPM")
        hdr_ilf.caption("ILF")

        # Get current values for calculations
        current_cmai_limit = cmai_layer.get("limit", 5_000_000) if cmai_layer else 5_000_000
        current_cmai_premium = cmai_layer.get("premium") if cmai_layer else None

        # Calculate CMAI RPM and ILF (ILF relative to top underlying layer)
        cmai_rpm = None
        cmai_ilf = None

        # Row aligned with underlying table: Carrier | Limit | Attach | Premium | RPM | ILF | (spacer for delete col)
        col_carrier, col_limit, col_attach, col_premium, col_rpm, col_ilf, col_spacer = st.columns([2, 1, 1, 1.2, 0.8, 0.6, 0.4])

        with col_carrier:
            st.markdown("**CMAI**")

        with col_limit:
            limit_options = [
                ("$1M", 1_000_000),
                ("$2M", 2_000_000),
                ("$3M", 3_000_000),
                ("$5M", 5_000_000),
                ("$10M", 10_000_000),
            ]
            limit_labels = [opt[0] for opt in limit_options]
            limit_values = {opt[0]: opt[1] for opt in limit_options}
            default_idx = next(
                (i for i, opt in enumerate(limit_options) if opt[1] == current_cmai_limit),
                3  # Default to $5M
            )
            selected_limit_label = st.selectbox(
                "Limit",
                options=limit_labels,
                index=default_idx,
                key=f"cmai_limit_select_{viewing_quote_id}",
                label_visibility="collapsed"
            )
            new_cmai_limit = limit_values[selected_limit_label]

        with col_attach:
            attach_display = f"xs ${underlying_total / 1_000_000:.0f}M" if underlying_total >= 1_000_000 else f"xs ${underlying_total / 1_000:,.0f}K" if underlying_total >= 1_000 else "xs $0"
            st.markdown(f"**{attach_display}**")

        with col_premium:
            premium_display = f"${current_cmai_premium / 1_000:.0f}K" if current_cmai_premium and current_cmai_premium >= 1_000 else ""
            new_premium_str = st.text_input(
                "Premium",
                value=premium_display,
                key=f"cmai_premium_input_{viewing_quote_id}",
                placeholder="$",
                label_visibility="collapsed"
            )
            new_cmai_premium = _parse_amount(new_premium_str) if new_premium_str else None

        # Calculate RPM and ILF
        if new_cmai_premium and new_cmai_limit:
            cmai_rpm = new_cmai_premium / (new_cmai_limit / 1_000_000)
            if underlying_layers:
                top_underlying_idx = max(idx for idx, _ in underlying_layers)
                top_layer = next((layer for idx, layer in underlying_layers if idx == top_underlying_idx), None)
                if top_layer:
                    top_premium = top_layer.get("premium")
                    top_limit = top_layer.get("limit")
                    if top_premium and top_limit:
                        top_rpm = top_premium / (top_limit / 1_000_000)
                        if top_rpm > 0:
                            cmai_ilf = cmai_rpm / top_rpm

        with col_rpm:
            rpm_display = f"${cmai_rpm/1000:.1f}K" if cmai_rpm and cmai_rpm >= 1000 else f"${cmai_rpm:,.0f}" if cmai_rpm else "—"
            st.markdown(f"**{rpm_display}**")

        with col_ilf:
            ilf_display = f"{cmai_ilf:.2f}" if cmai_ilf else "—"
            st.markdown(f"**{ilf_display}**")

        # Update CMAI layer if values changed
        # Use a separate session state key to track saved limit (avoids issues with tower_layers being reset)
        saved_limit_key = f"_saved_cmai_limit_{viewing_quote_id}"
        saved_premium_key = f"_saved_cmai_premium_{viewing_quote_id}"

        # Initialize saved values from current layer if not set
        if saved_limit_key not in st.session_state and cmai_layer:
            st.session_state[saved_limit_key] = cmai_layer.get("limit")
        if saved_premium_key not in st.session_state and cmai_layer:
            st.session_state[saved_premium_key] = cmai_layer.get("premium")

        last_saved_limit = st.session_state.get(saved_limit_key)
        last_saved_premium = st.session_state.get(saved_premium_key)

        cmai_changed = False
        limit_changed = False
        if cmai_layer:
            # Compare against separately tracked saved values (not tower_layers which may be stale)
            if last_saved_limit != new_cmai_limit:
                cmai_layer["limit"] = new_cmai_limit
                cmai_layer["attachment"] = underlying_total
                st.session_state[saved_limit_key] = new_cmai_limit
                cmai_changed = True
                limit_changed = True
            if new_cmai_premium != last_saved_premium:
                cmai_layer["premium"] = new_cmai_premium
                st.session_state[saved_premium_key] = new_cmai_premium
                cmai_changed = True
            if cmai_changed:
                _recalculate_all(st.session_state.tower_layers)
                _save_tower_changes(sub_id)
                # Rerun to refresh display (quote name for limit, RPM/ILF for premium)
                st.rerun()
        elif not cmai_layer and layers:
            # Create CMAI layer if missing
            new_cmai = {
                "carrier": "CMAI",
                "limit": new_cmai_limit,
                "attachment": underlying_total,
                "premium": new_cmai_premium,
            }
            st.session_state.tower_layers.append(new_cmai)
            _recalculate_all(st.session_state.tower_layers)

        # ─────────────────────────────────────────────────────
        # UNDERLYING PROGRAM
        # ─────────────────────────────────────────────────────
        st.markdown("##### Underlying Program")

        if not underlying_layers:
            st.caption("No underlying layers defined yet.")

        # Create a dict for quick layer lookup by index (for ILF calculations)
        layers_by_idx = {idx: layer for idx, layer in underlying_layers}

        if view_mode:
            # Card view - compact clickable cards
            st.caption("Tap a card to edit")
            for idx, layer in reversed(underlying_layers):
                _render_underlying_layer_card(sub_id, idx, layer, is_primary=(idx == 0), layers_by_idx=layers_by_idx)
        else:
            # Table view - desktop (headers are above "Our Layer" section)
            for idx, layer in reversed(underlying_layers):
                _render_underlying_layer_row(sub_id, idx, layer, is_primary=(idx == 0), layers_by_idx=layers_by_idx)


def _render_underlying_layer_row(sub_id: str, layer_idx: int, layer: dict, is_primary: bool = False, layers_by_idx: dict = None):
    """Render a single underlying layer as an inline editable row."""
    carrier = layer.get("carrier", "")
    limit = layer.get("limit", 0)
    attachment = layer.get("attachment", 0)
    retention = layer.get("retention") or st.session_state.get("primary_retention", 25_000)
    premium = layer.get("premium")
    layers_by_idx = layers_by_idx or {}

    # Get quote_id for unique widget keys
    quote_id = st.session_state.get("viewing_quote_id", "")

    # Column structure: Carrier | Limit | Ret/Attach | Premium | RPM | ILF | Delete
    col_carrier, col_limit, col_ret_attach, col_premium, col_rpm, col_ilf, col_delete = st.columns([2, 1, 1, 1.2, 0.8, 0.6, 0.4])

    with col_carrier:
        new_carrier = st.text_input(
            "Carrier",
            value=carrier,
            key=f"underlying_carrier_{quote_id}_{layer_idx}",
            label_visibility="collapsed",
            placeholder="Carrier name"
        )

    with col_limit:
        limit_options = ["$1M", "$2M", "$3M", "$5M", "$10M", "$15M", "$20M", "$25M"]
        limit_map = {"$1M": 1_000_000, "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000,
                     "$10M": 10_000_000, "$15M": 15_000_000, "$20M": 20_000_000, "$25M": 25_000_000}

        current_label = next((k for k, v in limit_map.items() if v == limit), "$5M")
        new_limit_label = st.selectbox(
            "Limit",
            options=limit_options,
            index=limit_options.index(current_label) if current_label in limit_options else 3,
            key=f"underlying_limit_{quote_id}_{layer_idx}",
            label_visibility="collapsed"
        )
        new_limit = limit_map[new_limit_label]

    # Retention/Attachment column: retention dropdown for primary, attachment display for excess
    new_retention = None
    with col_ret_attach:
        if is_primary:
            ret_options = ["$10K", "$25K", "$50K", "$100K", "$250K"]
            ret_map = {"$10K": 10_000, "$25K": 25_000, "$50K": 50_000, "$100K": 100_000, "$250K": 250_000}

            current_ret_label = next((k for k, v in ret_map.items() if v == retention), "$25K")
            new_ret_label = st.selectbox(
                "Retention",
                options=ret_options,
                index=ret_options.index(current_ret_label) if current_ret_label in ret_options else 1,
                key=f"underlying_ret_{quote_id}_{layer_idx}",
                label_visibility="collapsed"
            )
            new_retention = ret_map[new_ret_label]
        else:
            # Show attachment point (auto-calculated) - use markdown to avoid widget state caching
            attach_display = f"xs ${attachment / 1_000_000:.0f}M" if attachment >= 1_000_000 else f"xs ${attachment / 1_000:.0f}K" if attachment >= 1_000 else "xs $0"
            st.markdown(f"**{attach_display}**")

    with col_premium:
        premium_display = f"${premium / 1_000:.0f}K" if premium and premium >= 1_000 else ""
        new_premium_str = st.text_input(
            "Premium",
            value=premium_display,
            key=f"underlying_premium_{quote_id}_{layer_idx}",
            label_visibility="collapsed",
            placeholder="$"
        )
        new_premium = _parse_amount(new_premium_str) if new_premium_str else None

    # Calculate RPM and ILF using current values (new_premium if entered, else stored premium)
    calc_premium = new_premium if new_premium else premium
    calc_limit = new_limit if new_limit else limit
    rpm = None
    ilf = None
    below_rpm = None
    if calc_premium and calc_limit:
        rpm = calc_premium / (calc_limit / 1_000_000)
        # Calculate ILF relative to layer below (look up dynamically for fresh values)
        if layer_idx > 0:
            below_layer = layers_by_idx.get(layer_idx - 1)
            if below_layer:
                below_premium = below_layer.get("premium")
                below_limit = below_layer.get("limit")
                if below_premium and below_limit:
                    below_rpm = below_premium / (below_limit / 1_000_000)
                    if below_rpm > 0:
                        ilf = rpm / below_rpm

    with col_rpm:
        # RPM display (calculated, read-only) - no key so value updates on each render
        rpm_display = f"${rpm/1000:.1f}K" if rpm and rpm >= 1000 else f"${rpm:,.0f}" if rpm else "—"
        st.markdown(f"**{rpm_display}**")

    with col_ilf:
        # ILF display (calculated, read-only) - no key so value updates on each render
        ilf_display = f"{ilf:.2f}" if ilf else "1.00" if is_primary and rpm else "—"
        st.markdown(f"**{ilf_display}**")

    with col_delete:
        if st.button("×", key=f"delete_underlying_{quote_id}_{layer_idx}", help="Remove layer"):
            st.session_state.tower_layers.pop(layer_idx)
            _recalculate_all(st.session_state.tower_layers)
            _save_tower_changes(sub_id)
            st.rerun()

    # Check for changes and save
    changed = False
    if new_carrier != carrier:
        layer["carrier"] = new_carrier
        changed = True
    if new_limit != limit:
        layer["limit"] = new_limit
        changed = True
    if new_premium != premium:
        layer["premium"] = new_premium
        if new_premium and new_limit:
            layer["rpm"] = new_premium / (new_limit / 1_000_000.0)
        changed = True
    if is_primary and new_retention != retention:
        layer["retention"] = new_retention
        st.session_state.primary_retention = new_retention
        changed = True

    if changed:
        _recalculate_all(st.session_state.tower_layers)
        _save_tower_changes(sub_id)
        # Rerun to refresh RPM/ILF calculations across all layers
        st.rerun()


def _render_underlying_layer_card(sub_id: str, layer_idx: int, layer: dict, is_primary: bool = False, layers_by_idx: dict = None):
    """Render a single underlying layer as a compact clickable card."""
    carrier = layer.get("carrier", "") or "Unnamed"
    limit = layer.get("limit", 0)
    attachment = layer.get("attachment", 0)
    retention = layer.get("retention") or st.session_state.get("primary_retention", 25_000)
    premium = layer.get("premium")
    layers_by_idx = layers_by_idx or {}

    # Get quote_id for unique widget keys
    quote_id = st.session_state.get("viewing_quote_id", "")

    # Calculate RPM and ILF (ILF = this layer RPM / layer below RPM)
    rpm = None
    ilf = None
    if premium and limit:
        rpm = premium / (limit / 1_000_000)
        # Calculate ILF relative to layer below (look up dynamically for fresh values)
        if layer_idx > 0:
            below_layer = layers_by_idx.get(layer_idx - 1)
            if below_layer:
                below_premium = below_layer.get("premium")
                below_limit = below_layer.get("limit")
                if below_premium and below_limit:
                    below_rpm = below_premium / (below_limit / 1_000_000)
                    if below_rpm > 0:
                        ilf = rpm / below_rpm

    # Format display values (no $ to avoid LaTeX issues)
    if limit >= 1_000_000:
        limit_str = f"{int(limit // 1_000_000)}M"
    elif limit >= 1_000:
        limit_str = f"{int(limit // 1_000)}K"
    else:
        limit_str = "—"

    if is_primary:
        attach_str = f"{int(retention // 1_000)}K ret" if retention else ""
    else:
        if attachment >= 1_000_000:
            attach_str = f"xs {int(attachment // 1_000_000)}M"
        elif attachment >= 1_000:
            attach_str = f"xs {int(attachment // 1_000)}K"
        else:
            attach_str = ""

    if premium and premium >= 1_000:
        premium_str = f"{int(premium // 1_000)}K"
    else:
        premium_str = "—"

    if rpm and rpm >= 1000:
        rpm_str = f"{int(rpm // 1000)}K"
    elif rpm:
        rpm_str = f"{int(rpm)}"
    else:
        rpm_str = "—"

    if ilf:
        ilf_str = f"{ilf:.2f}"
    elif is_primary and rpm:
        ilf_str = "1.00"
    else:
        ilf_str = "—"

    # Build card content
    line1 = f"**{carrier}**"
    line2 = f"{limit_str} · {attach_str} · {premium_str}" if attach_str else f"{limit_str} · {premium_str}"
    line3 = f"RPM: {rpm_str} · ILF: {ilf_str}"

    # Clickable card button
    card_key = f"underlying_card_{quote_id}_{layer_idx}"
    if st.button(
        f"{line1}\n\n{line2}\n\n{line3}",
        key=card_key,
        use_container_width=True,
        help="Tap to edit"
    ):
        st.session_state[f"editing_underlying_{quote_id}_{layer_idx}"] = True
        st.rerun()

    # Show edit dialog if this card is being edited
    if st.session_state.get(f"editing_underlying_{quote_id}_{layer_idx}"):
        _render_underlying_edit_dialog(sub_id, layer_idx, layer, is_primary)


def _render_underlying_edit_dialog(sub_id: str, layer_idx: int, layer: dict, is_primary: bool):
    """Render edit dialog for an underlying layer."""
    # Get quote_id for unique widget keys
    quote_id = st.session_state.get("viewing_quote_id", "")

    @st.dialog(f"Edit Layer", width="small")
    def show_edit():
        carrier = layer.get("carrier", "")
        limit = layer.get("limit", 0)
        attachment = layer.get("attachment", 0)
        retention = layer.get("retention") or st.session_state.get("primary_retention", 25_000)
        premium = layer.get("premium")

        new_carrier = st.text_input("Carrier", value=carrier, key=f"edit_carrier_{quote_id}_{layer_idx}")

        col1, col2 = st.columns(2)
        with col1:
            limit_options = ["$1M", "$2M", "$3M", "$5M", "$10M", "$15M", "$20M", "$25M"]
            limit_map = {"$1M": 1_000_000, "$2M": 2_000_000, "$3M": 3_000_000, "$5M": 5_000_000,
                         "$10M": 10_000_000, "$15M": 15_000_000, "$20M": 20_000_000, "$25M": 25_000_000}
            current_label = next((k for k, v in limit_map.items() if v == limit), "$5M")
            new_limit_label = st.selectbox(
                "Limit",
                options=limit_options,
                index=limit_options.index(current_label) if current_label in limit_options else 3,
                key=f"edit_limit_{quote_id}_{layer_idx}"
            )
            new_limit = limit_map[new_limit_label]

        with col2:
            if is_primary:
                ret_options = ["$10K", "$25K", "$50K", "$100K", "$250K"]
                ret_map = {"$10K": 10_000, "$25K": 25_000, "$50K": 50_000, "$100K": 100_000, "$250K": 250_000}
                current_ret_label = next((k for k, v in ret_map.items() if v == retention), "$25K")
                new_ret_label = st.selectbox(
                    "Retention",
                    options=ret_options,
                    index=ret_options.index(current_ret_label) if current_ret_label in ret_options else 1,
                    key=f"edit_ret_{quote_id}_{layer_idx}"
                )
                new_retention = ret_map[new_ret_label]
            else:
                attach_display = f"xs ${attachment // 1_000_000}M" if attachment >= 1_000_000 else f"xs ${attachment // 1_000}K"
                st.text_input("Attachment", value=attach_display, disabled=True)
                new_retention = None

        premium_display = f"${premium // 1_000}K" if premium and premium >= 1_000 else ""
        new_premium_str = st.text_input("Premium", value=premium_display, key=f"edit_premium_{quote_id}_{layer_idx}", placeholder="$")
        new_premium = _parse_amount(new_premium_str) if new_premium_str else None

        st.markdown("---")

        col_save, col_delete, col_cancel = st.columns(3)

        with col_save:
            if st.button("Save", type="primary", use_container_width=True, key=f"save_layer_{quote_id}_{layer_idx}"):
                layer["carrier"] = new_carrier
                layer["limit"] = new_limit
                layer["premium"] = new_premium
                if is_primary and new_retention:
                    layer["retention"] = new_retention
                    st.session_state.primary_retention = new_retention
                _recalculate_all(st.session_state.tower_layers)
                _save_tower_changes(sub_id)
                st.session_state[f"editing_underlying_{quote_id}_{layer_idx}"] = False
                st.rerun()

        with col_delete:
            if st.button("Delete", use_container_width=True, key=f"del_layer_{quote_id}_{layer_idx}"):
                st.session_state.tower_layers.pop(layer_idx)
                _recalculate_all(st.session_state.tower_layers)
                _save_tower_changes(sub_id)
                st.session_state[f"editing_underlying_{quote_id}_{layer_idx}"] = False
                st.rerun()

        with col_cancel:
            if st.button("Cancel", use_container_width=True, key=f"cancel_layer_{quote_id}_{layer_idx}"):
                st.session_state[f"editing_underlying_{quote_id}_{layer_idx}"] = False
                st.rerun()

    show_edit()


def _add_underlying_layer(sub_id: str):
    """Add a new underlying layer (inserted before CMAI)."""
    layers = st.session_state.tower_layers or []

    # Find CMAI index
    cmai_idx = None
    for idx, layer in enumerate(layers):
        if "CMAI" in str(layer.get("carrier", "")).upper():
            cmai_idx = idx
            break

    # Calculate attachment for new layer
    underlying_total = sum(
        layer.get("limit", 0) for layer in layers
        if "CMAI" not in str(layer.get("carrier", "")).upper()
    )

    new_layer = {
        "carrier": "",
        "limit": 5_000_000,
        "attachment": underlying_total,
        "premium": None,
    }

    # Insert before CMAI or at end
    if cmai_idx is not None:
        layers.insert(cmai_idx, new_layer)
    else:
        layers.append(new_layer)

    st.session_state.tower_layers = layers
    _recalculate_all(st.session_state.tower_layers)
    _save_tower_changes(sub_id)
    st.rerun()


def _save_tower_changes(sub_id: str):
    """Save tower changes to the database, including quote name update for excess quotes."""
    import json
    from pages_components.tower_db import get_conn, get_quote_by_id

    viewing_quote_id = st.session_state.get("viewing_quote_id")
    if not viewing_quote_id:
        return

    try:
        tower_json = st.session_state.tower_layers
        primary_retention = st.session_state.get("primary_retention")

        # Check if this is an excess quote and update name based on CMAI limit/attachment
        quote_data = get_quote_by_id(viewing_quote_id)
        new_quote_name = None

        if quote_data and quote_data.get("position") == "excess":
            # Find CMAI layer to get our limit and attachment
            cmai_limit = None
            cmai_attachment = None
            for layer in tower_json or []:
                if "CMAI" in str(layer.get("carrier", "")).upper():
                    cmai_limit = layer.get("limit")
                    cmai_attachment = layer.get("attachment")
                    break

            if cmai_limit and cmai_attachment is not None:
                new_quote_name = _generate_excess_quote_name(cmai_limit, cmai_attachment)

        with get_conn().cursor() as cur:
            if new_quote_name:
                cur.execute(
                    """
                    UPDATE insurance_towers
                    SET tower_json = %s, primary_retention = %s, quote_name = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (json.dumps(tower_json), primary_retention, new_quote_name, viewing_quote_id)
                )
                st.session_state.quote_name = new_quote_name
            else:
                cur.execute(
                    """
                    UPDATE insurance_towers
                    SET tower_json = %s, primary_retention = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (json.dumps(tower_json), primary_retention, viewing_quote_id)
                )
            get_conn().commit()
    except Exception:
        pass  # Silent fail - will retry on next save


def _generate_excess_quote_name(our_limit: float, our_attachment: float) -> str:
    """Generate quote name for excess quotes: '$XM xs $YM' format."""
    # Convert to int to avoid decimal formatting (65.0M -> 65M)
    our_limit = int(our_limit or 0)
    our_attachment = int(our_attachment or 0)

    limit_str = f"${our_limit // 1_000_000}M" if our_limit >= 1_000_000 else f"${our_limit // 1_000}K"
    attach_str = f"${our_attachment // 1_000_000}M" if our_attachment >= 1_000_000 else f"${our_attachment // 1_000}K" if our_attachment >= 1_000 else "$0"
    return f"{limit_str} xs {attach_str}"


# ─────────────────────── Bulk Add Dialog ───────────────────────

def _render_bulk_add_dialog():
    """Render dialog for bulk adding layers via CSV or natural language."""

    @st.dialog("Bulk Add Layers", width="large")
    def show_dialog():
        tab_csv, tab_ai = st.tabs(["📋 Paste CSV", "💬 Describe"])

        with tab_csv:
            st.markdown("Paste tower data in CSV format:")
            st.caption("Columns: Carrier, Limit, Attachment, Premium (optional)")

            csv_example = """Carrier, Limit, Attachment, Premium
Beazley, 5M, 0, 100K
XL Catlin, 5M, 5M, 75K
Argo, 5M, 10M, 50K"""

            csv_input = st.text_area(
                "CSV Data",
                placeholder=csv_example,
                height=150,
                key="bulk_csv_input",
                help="First row should be headers. Supports K/M notation."
            )

            st.caption("Example format:")
            st.code(csv_example, language=None)

            if st.button("Parse & Add Layers", key="bulk_csv_parse", type="primary", use_container_width=True):
                if csv_input.strip():
                    result = _parse_csv_to_layers(csv_input)
                    if result.get("success"):
                        st.session_state.show_bulk_add_dialog = False
                        st.rerun()
                    else:
                        st.error(result.get("error", "Failed to parse CSV"))
                else:
                    st.warning("Please paste CSV data first")

        with tab_ai:
            st.markdown("Describe the tower in natural language:")

            ai_example = "Primary is Beazley at $5M with $25K retention and $100K premium. Excess layers: XL Catlin $5M xs $5M at $75K, then Argo $5M xs $10M at $50K."

            ai_input = st.text_area(
                "Tower Description",
                placeholder=ai_example,
                height=150,
                key="bulk_ai_input",
                help="Describe carriers, limits, attachments, and premiums naturally."
            )

            st.caption("Example:")
            st.code(ai_example, language=None)

            if st.button("Parse & Add Layers", key="bulk_ai_parse", type="primary", use_container_width=True):
                if ai_input.strip():
                    result = process_tower_with_ai(ai_input)
                    if result.get("success"):
                        st.success(result.get("message", "Tower updated"))
                        st.session_state.show_bulk_add_dialog = False
                        st.rerun()
                    else:
                        st.error(result.get("error", "Failed to parse description"))
                else:
                    st.warning("Please enter a description first")

        st.markdown("---")
        if st.button("Cancel", key="bulk_cancel", use_container_width=True):
            st.session_state.show_bulk_add_dialog = False
            st.rerun()

    show_dialog()


def _parse_csv_to_layers(csv_text: str) -> dict:
    """Parse CSV text into tower layers."""
    try:
        import io
        import csv

        lines = csv_text.strip().split("\n")
        if len(lines) < 2:
            return {"success": False, "error": "Need at least a header row and one data row"}

        # Parse header
        reader = csv.reader(io.StringIO(csv_text))
        headers = [h.strip().lower() for h in next(reader)]

        # Map common column names
        col_map = {
            "carrier": ["carrier", "name", "company", "insurer"],
            "limit": ["limit", "limits", "amount"],
            "attachment": ["attachment", "attach", "xs", "excess", "excess point"],
            "premium": ["premium", "prem", "price", "cost"],
            "retention": ["retention", "ret", "deductible", "ded", "sir"],
        }

        def find_col(target_names):
            for i, h in enumerate(headers):
                for name in target_names:
                    if name in h:
                        return i
            return None

        carrier_idx = find_col(col_map["carrier"])
        limit_idx = find_col(col_map["limit"])
        attach_idx = find_col(col_map["attachment"])
        premium_idx = find_col(col_map["premium"])
        retention_idx = find_col(col_map["retention"])

        if carrier_idx is None:
            return {"success": False, "error": "Could not find 'Carrier' column"}
        if limit_idx is None:
            return {"success": False, "error": "Could not find 'Limit' column"}

        # Parse data rows
        new_layers = []
        for row in reader:
            if not row or not any(cell.strip() for cell in row):
                continue

            carrier = row[carrier_idx].strip() if carrier_idx < len(row) else ""
            limit = _parse_amount(row[limit_idx]) if limit_idx < len(row) else 0
            attachment = _parse_amount(row[attach_idx]) if attach_idx is not None and attach_idx < len(row) else None
            premium = _parse_amount(row[premium_idx]) if premium_idx is not None and premium_idx < len(row) else None
            retention = _parse_amount(row[retention_idx]) if retention_idx is not None and retention_idx < len(row) else None

            if not carrier or not limit:
                continue

            layer = {
                "carrier": carrier,
                "limit": limit,
                "attachment": attachment if attachment else 0,
                "premium": premium if premium else None,
            }

            # Calculate RPM if we have premium
            if premium and limit:
                layer["rpm"] = premium / (limit / 1_000_000.0)

            # First layer gets retention
            if len(new_layers) == 0 and retention:
                layer["retention"] = retention

            new_layers.append(layer)

        if not new_layers:
            return {"success": False, "error": "No valid layers found in CSV"}

        # Add to existing layers or replace
        existing_layers = st.session_state.tower_layers or []

        # If first new layer has attachment=0, treat as full tower replacement
        if new_layers[0].get("attachment", 0) == 0:
            st.session_state.tower_layers = new_layers
            if new_layers[0].get("retention"):
                st.session_state.primary_retention = new_layers[0]["retention"]
        else:
            # Append to existing
            st.session_state.tower_layers = existing_layers + new_layers

        # Recalculate attachments and derived fields
        _recalculate_all(st.session_state.tower_layers)

        return {"success": True, "message": f"Added {len(new_layers)} layers"}

    except Exception as e:
        return {"success": False, "error": f"Parse error: {str(e)}"}


# ─────────────────────── Layer Card Components ───────────────────────

def _render_new_layer_card():
    """Render card for adding a new layer."""
    layers = st.session_state.tower_layers
    new_idx = len(layers)
    is_primary = new_idx == 0

    st.markdown("---")

    # Card header
    layer_label = "Layer 1 (Primary)" if is_primary else f"Layer {new_idx + 1}"
    st.subheader(f"➕ Add {layer_label}")

    # Carrier name
    carrier = st.text_input(
        "Carrier Name",
        placeholder="e.g., Beazley, AIG, CMAI",
        key="new_layer_carrier"
    )

    # Limit and Retention/Attachment row
    col1, col2 = st.columns(2)

    with col1:
        limit_labels = [opt[0] for opt in LIMIT_OPTIONS]
        limit_values = {opt[0]: opt[1] for opt in LIMIT_OPTIONS}
        selected_limit_label = st.selectbox(
            "Limit",
            options=limit_labels,
            index=0,
            key="new_layer_limit"
        )
        limit = limit_values[selected_limit_label]

    with col2:
        if is_primary:
            retention_labels = [opt[0] for opt in RETENTION_OPTIONS]
            retention_values = {opt[0]: opt[1] for opt in RETENTION_OPTIONS}
            selected_retention_label = st.selectbox(
                "Retention",
                options=retention_labels,
                index=1,  # Default to $25K
                key="new_layer_retention"
            )
            retention = retention_values[selected_retention_label]
            # Calculate attachment
            attachment = 0
        else:
            # Auto-calculate attachment from layers below
            attachment = sum(layer.get("limit", 0) for layer in layers)
            st.metric("Attachment (auto)", _format_amount(attachment))
            retention = None

    # Premium input
    premium_str = st.text_input(
        "Premium (optional)",
        placeholder="e.g., $45,000 or 45K",
        key="new_layer_premium"
    )
    premium = _parse_premium(premium_str) if premium_str else None

    # Show calculated fields
    if premium and limit:
        exposure = limit / 1_000_000.0
        rpm = premium / exposure if exposure else 0

        # Calculate ILF if we have a primary layer
        ilf = None
        if layers and layers[0].get("rpm"):
            base_rpm = layers[0]["rpm"]
            ilf = rpm / base_rpm if base_rpm else None

        col_rpm, col_ilf = st.columns(2)
        with col_rpm:
            st.metric("RPM (calculated)", _format_currency(rpm))
        with col_ilf:
            st.metric("ILF (calculated)", f"{ilf:.2f}" if ilf else "—")

    st.markdown("---")

    # Action buttons
    col_save, col_cancel = st.columns(2)

    with col_save:
        if st.button("Save Layer", key="new_layer_save", type="primary", use_container_width=True):
            if not carrier.strip():
                st.error("Please enter a carrier name")
            else:
                # Create new layer
                new_layer = {
                    "carrier": carrier.strip(),
                    "limit": limit,
                    "attachment": attachment,
                    "premium": premium,
                    "rpm": (premium / (limit / 1_000_000.0)) if premium and limit else None,
                }
                if is_primary:
                    new_layer["retention"] = retention
                    st.session_state.primary_retention = retention

                # Add to layers and recalculate
                st.session_state.tower_layers.append(new_layer)
                _recalculate_all(st.session_state.tower_layers)

                # Close card
                st.session_state.adding_new_layer = False
                st.rerun()

    with col_cancel:
        if st.button("Cancel", key="new_layer_cancel", use_container_width=True):
            st.session_state.adding_new_layer = False
            st.rerun()


def _render_edit_layer_card(layer_idx: int):
    """Render card for editing an existing layer."""
    layers = st.session_state.tower_layers

    if layer_idx >= len(layers):
        st.session_state.editing_layer_idx = None
        st.rerun()
        return

    layer = layers[layer_idx]
    is_primary = layer_idx == 0

    st.markdown("---")

    # Card header with reorder/delete buttons
    layer_label = "Layer 1 (Primary)" if is_primary else f"Layer {layer_idx + 1}"

    col_title, col_up, col_down, col_delete = st.columns([3, 0.5, 0.5, 0.5])

    with col_title:
        st.subheader(f"✏️ Edit {layer_label}")

    with col_up:
        # Can't move up if already at top
        if layer_idx > 0:
            if st.button("↑", key=f"layer_up_{layer_idx}", help="Move up"):
                layers[layer_idx], layers[layer_idx - 1] = layers[layer_idx - 1], layers[layer_idx]
                _recalculate_all(layers)
                st.session_state.editing_layer_idx = layer_idx - 1
                st.rerun()
        else:
            st.write("")  # Placeholder

    with col_down:
        # Can't move down if already at bottom
        if layer_idx < len(layers) - 1:
            if st.button("↓", key=f"layer_down_{layer_idx}", help="Move down"):
                layers[layer_idx], layers[layer_idx + 1] = layers[layer_idx + 1], layers[layer_idx]
                _recalculate_all(layers)
                st.session_state.editing_layer_idx = layer_idx + 1
                st.rerun()
        else:
            st.write("")  # Placeholder

    with col_delete:
        if st.button("×", key=f"layer_delete_{layer_idx}", help="Delete layer"):
            layers.pop(layer_idx)
            _recalculate_all(layers)
            st.session_state.editing_layer_idx = None
            st.rerun()

    # Carrier name
    carrier = st.text_input(
        "Carrier Name",
        value=layer.get("carrier", ""),
        key=f"edit_layer_carrier_{layer_idx}"
    )

    # Find current limit index
    current_limit = layer.get("limit", 0)
    limit_labels = [opt[0] for opt in LIMIT_OPTIONS]
    limit_values = {opt[0]: opt[1] for opt in LIMIT_OPTIONS}
    limit_default_idx = next(
        (i for i, opt in enumerate(LIMIT_OPTIONS) if opt[1] == current_limit),
        0
    )

    # Limit and Retention/Attachment row
    col1, col2 = st.columns(2)

    with col1:
        selected_limit_label = st.selectbox(
            "Limit",
            options=limit_labels,
            index=limit_default_idx,
            key=f"edit_layer_limit_{layer_idx}"
        )
        limit = limit_values[selected_limit_label]

    with col2:
        if is_primary:
            current_retention = layer.get("retention") or st.session_state.get("primary_retention", 25_000)
            retention_labels = [opt[0] for opt in RETENTION_OPTIONS]
            retention_values = {opt[0]: opt[1] for opt in RETENTION_OPTIONS}
            retention_default_idx = next(
                (i for i, opt in enumerate(RETENTION_OPTIONS) if opt[1] == current_retention),
                1
            )
            selected_retention_label = st.selectbox(
                "Retention",
                options=retention_labels,
                index=retention_default_idx,
                key=f"edit_layer_retention_{layer_idx}"
            )
            retention = retention_values[selected_retention_label]
            attachment = 0
        else:
            # Auto-calculate attachment from layers below
            attachment = sum(layers[i].get("limit", 0) for i in range(layer_idx))
            st.metric("Attachment (auto)", _format_amount(attachment))
            retention = None

    # Premium input
    current_premium = layer.get("premium")
    premium_default = _format_currency(current_premium) if current_premium else ""
    premium_str = st.text_input(
        "Premium",
        value=premium_default,
        placeholder="e.g., $45,000 or 45K",
        key=f"edit_layer_premium_{layer_idx}"
    )
    premium = _parse_premium(premium_str) if premium_str else None

    # Show calculated fields
    col_rpm, col_ilf = st.columns(2)

    rpm = None
    ilf = None
    if premium and limit:
        exposure = limit / 1_000_000.0
        rpm = premium / exposure if exposure else 0

        # Calculate ILF if we have a primary layer with RPM
        if layer_idx > 0 and layers[0].get("rpm"):
            base_rpm = layers[0]["rpm"]
            ilf = rpm / base_rpm if base_rpm else None
        elif layer_idx == 0:
            ilf = 1.0  # Primary is always 1.0

    with col_rpm:
        st.metric("RPM (calculated)", _format_currency(rpm) if rpm else "—")
    with col_ilf:
        st.metric("ILF (calculated)", f"{ilf:.2f}" if ilf else "—")

    st.markdown("---")

    # Action buttons
    col_save, col_cancel = st.columns(2)

    with col_save:
        if st.button("Save Changes", key=f"edit_layer_save_{layer_idx}", type="primary", use_container_width=True):
            if not carrier.strip():
                st.error("Please enter a carrier name")
            else:
                # Update layer
                layer["carrier"] = carrier.strip()
                layer["limit"] = limit
                layer["attachment"] = attachment
                layer["premium"] = premium
                layer["rpm"] = rpm
                layer["ilf"] = f"{ilf:.2f}" if ilf else None

                if is_primary:
                    layer["retention"] = retention
                    st.session_state.primary_retention = retention

                # Recalculate all layers (attachments may have changed)
                _recalculate_all(st.session_state.tower_layers)

                # Close card
                st.session_state.editing_layer_idx = None
                st.rerun()

    with col_cancel:
        if st.button("Cancel", key=f"edit_layer_cancel_{layer_idx}", use_container_width=True):
            st.session_state.editing_layer_idx = None
            st.rerun()


# ─────────────────────── Card-Based Layer Display ───────────────────────

def _render_tower_cards():
    """Render tower layers as responsive cards with click-to-edit."""
    layers = st.session_state.tower_layers

    if not layers:
        st.caption("No layers yet. Click '+ Add Layer' to build your tower.")
        return

    st.markdown("---")
    st.caption("Tap a card to edit")

    # Inject card styling CSS
    st.markdown("""
    <style>
    .tower-card {
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 8px;
        background: #fafafa;
        cursor: pointer;
        transition: border-color 0.2s, box-shadow 0.2s;
    }
    .tower-card:hover {
        border-color: #1f77b4;
        box-shadow: 0 2px 8px rgba(31, 119, 180, 0.15);
    }
    .tower-card-header {
        font-weight: 600;
        font-size: 1.05em;
        margin-bottom: 4px;
        color: #333;
    }
    .tower-card-primary {
        font-size: 0.95em;
        color: #444;
        margin-bottom: 2px;
    }
    .tower-card-secondary {
        font-size: 0.85em;
        color: #888;
    }
    .tower-card-cmai {
        border-left: 3px solid #1f77b4;
    }
    </style>
    """, unsafe_allow_html=True)

    # Render each layer as a card
    for idx, layer in enumerate(layers):
        is_primary = idx == 0
        carrier = layer.get("carrier", "Unknown")
        limit = layer.get("limit", 0)
        premium = layer.get("premium")
        rpm = layer.get("rpm")
        ilf = layer.get("ilf")

        # Determine attachment or retention display
        if is_primary:
            retention = layer.get("retention") or st.session_state.get("primary_retention", 0)
            attach_ret_text = f"{_format_amount(retention)} ret" if retention else ""
        else:
            attachment = layer.get("attachment", 0)
            attach_ret_text = f"xs {_format_amount(attachment)}" if attachment else ""

        # Build display strings
        limit_text = f"{_format_amount(limit)} limit" if limit else ""
        premium_text = f"{_format_currency(premium)}" if premium else "—"

        # Primary line: limit · retention/attachment · premium
        primary_parts = [p for p in [limit_text, attach_ret_text, premium_text] if p and p != "—"]
        primary_line = " · ".join(primary_parts) if primary_parts else "No details"

        # Secondary line: RPM · ILF
        secondary_parts = []
        if rpm:
            secondary_parts.append(f"RPM: {_format_currency(rpm)}")
        if ilf:
            secondary_parts.append(f"ILF: {ilf}")
        secondary_line = " · ".join(secondary_parts) if secondary_parts else ""

        # Check if this is CMAI layer for special styling
        is_cmai = "CMAI" in carrier.upper() if carrier else False
        card_class = "tower-card tower-card-cmai" if is_cmai else "tower-card"

        # Use a button that spans the full card area
        # We'll use a container with the card visuals, then an invisible button overlay
        card_key = f"tower_card_{idx}"

        # Create the card with a button
        with st.container():
            if st.button(
                f"**#{idx + 1} · {carrier}**\n\n{primary_line}\n\n{secondary_line if secondary_line else ''}",
                key=card_key,
                use_container_width=True,
                help="Click to edit this layer"
            ):
                st.session_state.editing_layer_idx = idx
                st.session_state.adding_new_layer = False
                st.rerun()


def _render_tower_cards_readonly():
    """Render tower layers as read-only display cards (no editing)."""
    layers = st.session_state.tower_layers

    if not layers:
        st.caption("No layers in tower.")
        return

    st.markdown("---")

    # Render each layer as a simple display
    for idx, layer in enumerate(layers):
        is_primary = idx == 0
        carrier = layer.get("carrier", "Unknown")
        limit = layer.get("limit", 0)
        premium = layer.get("premium")
        rpm = layer.get("rpm")
        ilf = layer.get("ilf")

        # Determine attachment or retention display
        if is_primary:
            retention = layer.get("retention") or st.session_state.get("primary_retention", 0)
            attach_ret_text = f"{_format_amount(retention)} ret" if retention else ""
        else:
            attachment = layer.get("attachment", 0)
            attach_ret_text = f"xs {_format_amount(attachment)}" if attachment else ""

        # Build display strings
        limit_text = f"{_format_amount(limit)} limit" if limit else ""
        premium_text = f"{_format_currency(premium)}" if premium else "—"

        # Primary line: limit · retention/attachment · premium
        primary_parts = [p for p in [limit_text, attach_ret_text, premium_text] if p and p != "—"]
        primary_line = " · ".join(primary_parts) if primary_parts else "No details"

        # Secondary line: RPM · ILF
        secondary_parts = []
        if rpm:
            secondary_parts.append(f"RPM: {_format_currency(rpm)}")
        if ilf:
            secondary_parts.append(f"ILF: {ilf}")
        secondary_line = " · ".join(secondary_parts) if secondary_parts else ""

        # Check if this is CMAI layer for special styling
        is_cmai = "CMAI" in carrier.upper() if carrier else False
        badge = " 🔵" if is_cmai else ""

        # Display as markdown (no button/interaction)
        with st.container():
            st.markdown(f"**#{idx + 1} · {carrier}{badge}**")
            st.markdown(f"{primary_line}")
            if secondary_line:
                st.caption(secondary_line)
            st.markdown("---")


def _render_excess_tower_readonly(cmai_layer: dict, underlying_layers: list, underlying_total: float):
    """Render excess tower structure in read-only mode."""
    # Our Layer (CMAI)
    st.markdown("##### Our Layer")
    if cmai_layer:
        cmai_limit = cmai_layer.get("limit", 0)
        cmai_premium = cmai_layer.get("premium")

        limit_display = f"${cmai_limit / 1_000_000:.0f}M" if cmai_limit >= 1_000_000 else f"${cmai_limit / 1_000:.0f}K"
        attach_display = f"xs ${underlying_total / 1_000_000:.0f}M" if underlying_total >= 1_000_000 else f"xs ${underlying_total / 1_000:.0f}K"
        premium_display = f"${cmai_premium:,.0f}" if cmai_premium else "—"

        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Limit", limit_display)
        with col2:
            st.metric("Attachment", attach_display)
        with col3:
            st.metric("Premium", premium_display)
    else:
        st.caption("No CMAI layer defined.")

    st.markdown("---")

    # Underlying Program
    st.markdown("##### Underlying Program")
    if not underlying_layers:
        st.caption("No underlying layers defined.")
    else:
        for idx, layer in reversed(underlying_layers):
            carrier = layer.get("carrier", "Unknown")
            limit = layer.get("limit", 0)
            attachment = layer.get("attachment", 0)
            retention = layer.get("retention")
            premium = layer.get("premium")

            limit_str = f"${limit / 1_000_000:.0f}M" if limit >= 1_000_000 else f"${limit / 1_000:.0f}K"

            if idx == 0:  # Primary layer
                attach_str = f"${retention / 1_000:.0f}K ret" if retention else "—"
            else:
                attach_str = f"xs ${attachment / 1_000_000:.0f}M" if attachment >= 1_000_000 else f"xs ${attachment / 1_000:.0f}K"

            premium_str = f"${premium:,.0f}" if premium else "—"

            st.markdown(f"**{carrier}**: {limit_str} {attach_str} · {premium_str}")


def _render_tower_summary():
    """Render tower summary metrics."""
    layers = st.session_state.tower_layers

    if not layers:
        return

    st.markdown("---")

    total_limit = sum(layer.get("limit", 0) for layer in layers)
    total_premium = sum(layer.get("premium", 0) for layer in layers if layer.get("premium"))

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Layers", len(layers))
    with col2:
        retention_val = st.session_state.get("primary_retention")
        if retention_val is None and layers:
            retention_val = layers[0].get("retention")
        st.metric("Retention", _format_amount(retention_val or 0))
    with col3:
        st.metric("Total Limit", _format_amount(total_limit))
    with col4:
        st.metric("Total Premium", _format_currency(total_premium))


# ─────────────────────── AI Processing (kept for compatibility) ───────────────────────

def _normalize_carrier_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip())


def _parse_retention_from_text(text: str):
    """Extract retention/deductible from free text."""
    pattern = r"(?:retention|deductible|SIR|self[- ]?insured)\s*(?:of|is|:)?\s*\$?([\d,.]+[KkMm]?)"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return _parse_amount(match.group(1))
    return None


def _parse_primary_carrier(text: str):
    """Extract primary carrier name from user input."""
    pattern = r"(?:primary|lead)\s+(?:carrier\s+)?(?:is\s+)?([A-Za-z0-9 &,'-]+?)(?:\s+with|\s+at|\s+\d|\s*,|\s*$)"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def _parse_excess_carriers(text: str) -> list[str]:
    """Extract excess carrier names from user input."""
    carriers = []
    pattern = r"(?:excess|layer|layers)[:\s]+([^.]+)"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        section = match.group(1)
        carrier_pattern = r"([A-Za-z][A-Za-z0-9 &'-]*?)(?:\s+\d+[MK]|\s+at\s+|,|$)"
        for m in re.finditer(carrier_pattern, section, re.IGNORECASE):
            name = m.group(1).strip()
            if name and len(name) > 1:
                carriers.append(name)
    return carriers


def _parse_premium_hints(text: str) -> list[float]:
    """Extract premium hints from user input."""
    premiums = []
    pattern = r"(?:premium|at|@)\s*\$?([\d,.]+[KkMm]?)"
    for match in re.finditer(pattern, text, re.IGNORECASE):
        val = _parse_amount(match.group(1))
        if val:
            premiums.append(val)
    return premiums


def process_tower_with_ai(user_input: str):
    """Process natural language input with AI to build/modify tower."""
    try:
        from ai.tower_intel import run_command_with_ai

        current_layers = st.session_state.tower_layers
        result = run_command_with_ai(current_layers, user_input, 0.0, None)

        layers = result.get("layers", [])
        primary = result.get("primary")

        # Reorder layers based on user's prompt
        prompt_primary = _parse_primary_carrier(user_input)
        prompt_excess = _parse_excess_carriers(user_input)
        expected_carriers = []
        if prompt_primary:
            expected_carriers.append(prompt_primary)
        expected_carriers.extend(prompt_excess)
        expected_keys = [_normalize_carrier_name(c).lower() for c in expected_carriers]

        if expected_keys:
            original_layers = layers
            buckets: dict[str, list[dict]] = {}
            for layer in layers:
                key = _normalize_carrier_name(layer.get("carrier", "")).lower()
                buckets.setdefault(key, []).append(layer)

            ordered_layers = []
            for key in expected_keys:
                bucket = buckets.get(key)
                if bucket:
                    ordered_layers.append(bucket.pop(0))

            candidate_layers = ordered_layers if ordered_layers else layers
            allowed = set(expected_keys)
            filtered_layers = [layer for layer in candidate_layers if _normalize_carrier_name(layer.get("carrier", "")).lower() in allowed]
            if filtered_layers:
                layers = filtered_layers
            elif ordered_layers:
                layers = ordered_layers
            else:
                layers = original_layers

        # Ensure primary is first
        primary_names = [
            _normalize_carrier_name(primary.get("carrier")) if isinstance(primary, dict) and primary.get("carrier") else None,
            prompt_primary,
        ]
        primary_names = [name for name in primary_names if name]
        if primary_names and layers:
            primary_lower = {_normalize_carrier_name(name).lower() for name in primary_names}
            primary_idx = next(
                (i for i, layer in enumerate(layers) if _normalize_carrier_name(layer.get("carrier", "")).lower() in primary_lower),
                None,
            )
            if primary_idx is not None and primary_idx != 0:
                primary_layer = layers.pop(primary_idx)
                layers.insert(0, primary_layer)

        # Extract premiums from text
        premium_hints = _parse_premium_hints(user_input)
        retention_val = None
        if primary and primary.get("retention") is not None:
            retention_val = _parse_amount(primary.get("retention"))
        if retention_val is None:
            retention_val = _parse_retention_from_text(user_input)

        if premium_hints:
            for idx, amount in enumerate(premium_hints):
                if idx >= len(layers):
                    break
                layers[idx]["premium"] = amount
                limit_val = layers[idx].get("limit") or 0
                if limit_val:
                    exposure = limit_val / 1_000_000.0
                    if exposure:
                        layers[idx]["rpm"] = amount / exposure

        if layers:
            layers[0]["retention"] = retention_val
        st.session_state.primary_retention = retention_val

        # Update first layer with primary data
        if primary and layers:
            if primary.get("premium"):
                layers[0]["premium"] = primary.get("premium")
            if primary.get("rpm"):
                layers[0]["rpm"] = primary.get("rpm")

            if retention_val is not None:
                layers[0]["retention"] = retention_val

        # Recalculate all derived fields
        _recalculate_all(layers)

        st.session_state.tower_layers = layers
        return {"success": True, "message": f"Tower updated with {len(layers)} layers"}

    except Exception as e:
        return {"success": False, "error": str(e)}
