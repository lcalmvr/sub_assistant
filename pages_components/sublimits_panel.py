"""
Sublimits Panel Component
Manages sublimits with AI parsing and proportional calculations.
"""

import re
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


# ─────────────────────── Sublimit Conversion ───────────────────────

def _sublimits_to_dataframe(sublimits: list, calc_fn) -> pd.DataFrame:
    """Convert sublimits list to DataFrame for display.

    Args:
        sublimits: List of sublimit dicts
        calc_fn: Function(primary_limit) -> (our_limit, our_attachment) for proportional calc
    """
    if not sublimits:
        return pd.DataFrame(columns=["coverage", "primary_limit", "treatment", "our_limit", "our_attachment"])

    rows = []
    for sub in sublimits:
        primary_limit = sub.get("primary_limit", 0) or 0
        treatment = sub.get("treatment", "follow_form")

        # Calculate proportional defaults
        prop_limit, prop_attach = calc_fn(primary_limit)

        # Get stored overrides (if any)
        stored_our_limit = sub.get("our_limit")
        stored_our_attach = sub.get("our_attachment")

        # Determine displayed values based on treatment
        if treatment == "no_coverage":
            disp_limit = ""
            disp_attach = ""
        elif treatment == "different":
            disp_limit = _format_amount(stored_our_limit) if stored_our_limit else _format_amount(prop_limit)
            disp_attach = _format_amount(stored_our_attach) if stored_our_attach else _format_amount(prop_attach)
        else:  # follow_form
            disp_limit = _format_amount(prop_limit) if prop_limit else ""
            disp_attach = _format_amount(prop_attach) if prop_attach else ""

        rows.append({
            "coverage": sub.get("coverage", ""),
            "primary_limit": _format_amount(primary_limit) if primary_limit else "",
            "treatment": treatment,
            "our_limit": disp_limit,
            "our_attachment": disp_attach,
        })

    return pd.DataFrame(rows)


def _dataframe_to_sublimits(df: pd.DataFrame, existing_sublimits: list, calc_fn) -> list:
    """Convert DataFrame back to sublimits list.

    Args:
        df: Edited DataFrame from data_editor
        existing_sublimits: Previous sublimits list (for detecting changes)
        calc_fn: Function(primary_limit) -> (our_limit, our_attachment) for proportional calc
    """
    sublimits = []

    for idx, row in df.iterrows():
        coverage = str(row.get("coverage", "") or "").strip()
        primary_limit_str = str(row.get("primary_limit", "") or "").strip()
        treatment = row.get("treatment") or "follow_form"
        our_limit_str = str(row.get("our_limit", "") or "").strip()
        our_attach_str = str(row.get("our_attachment", "") or "").strip()

        # Skip fully empty rows
        if not coverage and not primary_limit_str:
            continue

        # Parse primary limit
        primary_limit = _parse_amount(primary_limit_str) if primary_limit_str else 0

        # Calculate expected proportional values
        prop_limit, prop_attach = calc_fn(primary_limit)

        # Determine our_limit - store only if treatment is "different"
        our_limit = None
        if treatment == "different" and our_limit_str:
            our_limit = _parse_amount(our_limit_str)

        # Determine our_attachment - store only if treatment is "different"
        our_attachment = None
        if treatment == "different" and our_attach_str:
            our_attachment = _parse_amount(our_attach_str)

        sublimits.append({
            "coverage": coverage,
            "primary_limit": primary_limit,
            "treatment": treatment,
            "our_limit": our_limit,
            "our_attachment": our_attachment,
        })

    return sublimits


# ─────────────────────── Main Render Function ───────────────────────

def render_sublimits_panel(sub_id: str, expanded: bool = False):
    """
    Render the sublimits panel.

    Args:
        sub_id: Submission ID
        expanded: Whether to expand the section by default
    """
    # Initialize session state
    if "sublimits" not in st.session_state:
        st.session_state.sublimits = []

    with st.expander("📋 Sublimits", expanded=expanded):
        st.caption("Define primary carrier sublimits, then specify your drop-down treatment for each.")

        # Calculate tower context for proportional sublimit calculations
        tower_context = _get_tower_context()

        # Display position info
        _render_position_info(tower_context)

        # Natural language input for sublimits
        sublimit_input = st.text_area(
            "Describe sublimits:",
            placeholder="Example: 'Primary has 1M ransomware, 500K business interruption, 250K social engineering'",
            height=80,
            key="sublimit_input"
        )

        col_process, col_clear = st.columns([1, 4])
        with col_process:
            process_sublimits = st.button("Process with AI", key="process_sublimits_btn")
        with col_clear:
            if st.button("Clear Sublimits", key="clear_sublimits_btn"):
                st.session_state.sublimits = []
                st.rerun()

        # Process with AI
        if process_sublimits and sublimit_input.strip():
            _process_sublimits_with_ai(sublimit_input, tower_context)

        # Create the proportional calculation function
        def calc_proportional_sublimit(primary_sublimit: float) -> tuple[float, float]:
            return _calc_proportional_sublimit(primary_sublimit, tower_context)

        # Convert sublimits to DataFrame for display
        sublimits_df = _sublimits_to_dataframe(st.session_state.sublimits, calc_proportional_sublimit)

        # Display editable table
        edited_sublimits = st.data_editor(
            sublimits_df,
            num_rows="dynamic",
            use_container_width=True,
            column_config={
                "coverage": st.column_config.TextColumn("Coverage", width="medium"),
                "primary_limit": st.column_config.TextColumn("Primary Limit", width="small", help="e.g., 250K, 1M, 500K"),
                "treatment": st.column_config.SelectboxColumn(
                    "Our Treatment", width="small",
                    options=["follow_form", "different", "no_coverage"],
                    default="follow_form"
                ),
                "our_limit": st.column_config.TextColumn(
                    "Our Limit", width="small",
                    help="Auto-calculated for follow_form. Editable when treatment is 'different'."
                ),
                "our_attachment": st.column_config.TextColumn(
                    "Our Attachment", width="small",
                    help="Auto-calculated for follow_form. Editable when treatment is 'different'."
                ),
            },
            key="sublimits_editor"
        )

        # Update session state when table is edited
        if not edited_sublimits.equals(sublimits_df):
            updated_sublimits = _dataframe_to_sublimits(
                edited_sublimits,
                st.session_state.sublimits,
                calc_proportional_sublimit
            )
            st.session_state.sublimits = updated_sublimits
            st.rerun()


def _get_tower_context() -> dict:
    """Get tower context needed for sublimit calculations."""
    tower_layers = st.session_state.get("tower_layers", [])

    # Find CMAI layer in the tower
    cmai_layer_idx = None
    cmai_layer = None
    for idx, layer in enumerate(tower_layers or []):
        carrier_name = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier_name:
            cmai_layer_idx = idx
            cmai_layer = layer
            break

    # Calculate aggregates
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
        st.info(
            f"**CMAI Layer:** {_format_amount(ctx['our_aggregate_limit'])} xs "
            f"{_format_amount(ctx['our_aggregate_attachment'])} "
            f"(Layer {ctx['cmai_layer_idx'] + 1} of {len(ctx['tower_layers'])}) | "
            f"Primary agg: {_format_amount(ctx['primary_aggregate_limit'])} | "
            f"{ctx['layers_below_count']} layers below"
        )
    elif ctx["tower_layers"]:
        st.warning("CMAI not found in tower. Add CMAI as a carrier to auto-calculate sublimits.")
        st.caption(f"Tower has {len(ctx['tower_layers'])} layers, primary agg: {_format_amount(ctx['primary_aggregate_limit'])}")


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


def _process_sublimits_with_ai(sublimit_input: str, ctx: dict):
    """Process sublimit input with AI."""
    try:
        from ai.sublimit_intel import parse_sublimits_with_ai, edit_sublimits_with_ai

        current_sublimits = st.session_state.get("sublimits", [])
        primary_aggregate_limit = ctx["primary_aggregate_limit"]

        context = f"Primary aggregate limit: {_format_amount(primary_aggregate_limit)}" if primary_aggregate_limit else ""

        if current_sublimits:
            result = edit_sublimits_with_ai(current_sublimits, sublimit_input)
        else:
            result = parse_sublimits_with_ai(sublimit_input, context)

        st.session_state.sublimits = result
        st.success(f"Parsed {len(result)} sublimits")
        st.rerun()

    except Exception as e:
        st.error(f"Error processing sublimits: {e}")
