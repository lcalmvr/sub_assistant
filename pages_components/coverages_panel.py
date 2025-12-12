"""
Unified Coverages Panel Component
Manages primary policy coverages - adapts based on CMAI position (primary vs excess).
"""
from __future__ import annotations

import re
import pandas as pd
import streamlit as st


# ─────────────────────── Standard Policy Coverages ───────────────────────
# These are CMAI's standard policy form coverages

AGGREGATE_COVERAGES = [
    "Network Security & Privacy Liability",
    "Privacy Regulatory Proceedings",
    "Payment Card Industry (PCI)",
    "Media Liability",
    "Network Business Interruption",
    "Dependent Business Interruption",
    "System Failure",
    "Cyber Extortion",
    "Data Recovery",
    "Reputational Harm",
]

SUBLIMIT_COVERAGES = [
    ("Social Engineering", 100_000),
    ("Funds Transfer Fraud", 250_000),
    ("Invoice Manipulation", 250_000),
    ("Telecommunications Fraud", 100_000),
    ("Cryptojacking", 100_000),
]


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
            return float(re.sub(r"[^0-9.]+", "", s))
        except Exception:
            return 0.0


def _format_amount(amount: float) -> str:
    """Format amount for display (e.g., 1000000 -> '$1M')."""
    if amount is None or amount == 0:
        return ""
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"${int(amount // 1_000_000)}M"
    if amount >= 1_000 and amount % 1_000 == 0:
        return f"${int(amount // 1_000)}K"
    return f"${amount:,.0f}"


# ─────────────────────── Position Detection ───────────────────────

def _get_cmai_position() -> dict:
    """
    Determine CMAI's position in the tower.

    Returns:
        dict with:
        - is_primary: bool - True if CMAI is Layer 1
        - cmai_layer_idx: int or None
        - cmai_layer: dict or None
        - aggregate_limit: float - total tower limit
        - our_limit: float - CMAI's layer limit
        - our_attachment: float - sum of layers below CMAI
        - layers_below: int - count of layers below CMAI
    """
    tower_layers = st.session_state.get("tower_layers", [])

    if not tower_layers:
        return {
            "is_primary": True,  # Default to primary if no tower
            "cmai_layer_idx": None,
            "cmai_layer": None,
            "aggregate_limit": 0,
            "our_limit": 0,
            "our_attachment": 0,
            "layers_below": 0,
        }

    # Find CMAI layer
    cmai_layer_idx = None
    cmai_layer = None
    for idx, layer in enumerate(tower_layers):
        carrier_name = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier_name:
            cmai_layer_idx = idx
            cmai_layer = layer
            break

    # Calculate totals
    aggregate_limit = sum(layer.get("limit", 0) or 0 for layer in tower_layers)

    if cmai_layer_idx is not None:
        our_limit = cmai_layer.get("limit", 0) or 0
        our_attachment = sum(
            layer.get("limit", 0) or 0
            for layer in tower_layers[:cmai_layer_idx]
        )
        is_primary = (cmai_layer_idx == 0)
        layers_below = cmai_layer_idx
    else:
        # CMAI not in tower - assume primary position
        our_limit = tower_layers[0].get("limit", 0) if tower_layers else 0
        our_attachment = 0
        is_primary = True
        layers_below = 0

    return {
        "is_primary": is_primary,
        "cmai_layer_idx": cmai_layer_idx,
        "cmai_layer": cmai_layer,
        "aggregate_limit": aggregate_limit,
        "our_limit": our_limit,
        "our_attachment": our_attachment,
        "layers_below": layers_below,
    }


# ─────────────────────── Coverage Data Management ───────────────────────

def _get_default_coverages(aggregate_limit: float, is_primary: bool) -> list[dict]:
    """
    Get default coverages based on position.

    When primary: Pre-populate with CMAI standard policy coverages.
    When excess: Return empty list (AI will populate from primary quote).
    """
    if not is_primary:
        return []

    coverages = []

    # Aggregate coverages - limit = aggregate
    for name in AGGREGATE_COVERAGES:
        coverages.append({
            "coverage": name,
            "primary_limit": aggregate_limit,
            "is_sublimit": False,
            "treatment": "included",
            "our_limit": aggregate_limit,
            "our_attachment": 0,
        })

    # Sublimit coverages - limit = sublimit default
    for name, default_limit in SUBLIMIT_COVERAGES:
        coverages.append({
            "coverage": name,
            "primary_limit": default_limit,
            "is_sublimit": True,
            "treatment": "included",
            "our_limit": default_limit,
            "our_attachment": 0,
        })

    return coverages


def _calc_proportional(primary_limit: float, position: dict) -> tuple[float, float]:
    """
    Calculate our proportional limit and attachment for excess position.

    Args:
        primary_limit: The primary policy's limit for this coverage
        position: Position dict from _get_cmai_position()

    Returns:
        (our_limit, our_attachment)
    """
    if position["is_primary"] or not position["aggregate_limit"]:
        return primary_limit, 0.0

    # Ratio of this coverage to aggregate
    ratio = primary_limit / position["aggregate_limit"] if position["aggregate_limit"] else 1.0

    # Our proportional limit
    our_limit = ratio * position["our_limit"]

    # Our attachment = sum of proportional limits below us
    our_attachment = ratio * position["our_attachment"]

    return our_limit, our_attachment


def _coverages_to_dataframe(coverages: list, position: dict) -> pd.DataFrame:
    """Convert coverages list to DataFrame for display."""
    if not coverages:
        if position["is_primary"]:
            return pd.DataFrame(columns=["coverage", "limit", "type"])
        else:
            return pd.DataFrame(columns=["coverage", "primary_limit", "treatment", "our_limit", "our_attachment"])

    rows = []
    for cov in coverages:
        primary_limit = cov.get("primary_limit", 0) or 0
        treatment = cov.get("treatment", "follow_form")

        if position["is_primary"]:
            # Primary view - simpler
            rows.append({
                "coverage": cov.get("coverage", ""),
                "limit": _format_amount(primary_limit),
                "type": "Sublimit" if cov.get("is_sublimit") else "Aggregate",
            })
        else:
            # Excess view - show proportional calculations
            if treatment == "no_coverage":
                our_limit = ""
                our_attach = ""
            elif treatment == "different":
                our_limit = _format_amount(cov.get("our_limit") or 0)
                our_attach = _format_amount(cov.get("our_attachment") or 0)
            else:  # follow_form
                prop_limit, prop_attach = _calc_proportional(primary_limit, position)
                our_limit = _format_amount(prop_limit)
                our_attach = _format_amount(prop_attach)

            rows.append({
                "coverage": cov.get("coverage", ""),
                "primary_limit": _format_amount(primary_limit),
                "treatment": treatment,
                "our_limit": our_limit,
                "our_attachment": our_attach,
            })

    return pd.DataFrame(rows)


def _dataframe_to_coverages(df: pd.DataFrame, position: dict) -> list:
    """Convert DataFrame back to coverages list."""
    coverages = []

    for _, row in df.iterrows():
        coverage = str(row.get("coverage", "") or "").strip()
        if not coverage:
            continue

        if position["is_primary"]:
            limit_str = str(row.get("limit", "") or "").strip()
            limit = _parse_amount(limit_str)
            cov_type = row.get("type", "Aggregate")

            coverages.append({
                "coverage": coverage,
                "primary_limit": limit,
                "is_sublimit": cov_type == "Sublimit",
                "treatment": "included",
                "our_limit": limit,
                "our_attachment": 0,
            })
        else:
            primary_str = str(row.get("primary_limit", "") or "").strip()
            primary_limit = _parse_amount(primary_str)
            treatment = row.get("treatment", "follow_form") or "follow_form"

            our_limit = None
            our_attachment = None
            if treatment == "different":
                our_limit = _parse_amount(row.get("our_limit", ""))
                our_attachment = _parse_amount(row.get("our_attachment", ""))

            coverages.append({
                "coverage": coverage,
                "primary_limit": primary_limit,
                "is_sublimit": True,  # Assume sublimit for excess
                "treatment": treatment,
                "our_limit": our_limit,
                "our_attachment": our_attachment,
            })

    return coverages


# ─────────────────────── AI Parsing ───────────────────────

def _parse_coverages_with_ai(text: str, position: dict) -> list:
    """Parse coverages from primary quote text using AI."""
    try:
        from ai.sublimit_intel import parse_sublimits_with_ai

        context = f"Primary aggregate limit: {_format_amount(position['aggregate_limit'])}"
        result = parse_sublimits_with_ai(text, context)

        # Convert to our format
        coverages = []
        for item in result:
            primary_limit = item.get("primary_limit", 0)
            prop_limit, prop_attach = _calc_proportional(primary_limit, position)

            coverages.append({
                "coverage": item.get("coverage", ""),
                "primary_limit": primary_limit,
                "is_sublimit": True,
                "treatment": item.get("treatment", "follow_form"),
                "our_limit": prop_limit,
                "our_attachment": prop_attach,
            })

        return coverages
    except Exception as e:
        st.error(f"Error parsing coverages: {e}")
        return []


def _edit_coverages_with_ai(coverages: list, instruction: str, position: dict) -> list:
    """
    Edit coverages based on natural language instruction.

    Examples:
    - "set social engineering to 250K"
    - "add ransomware 500K sublimit"
    - "remove FTF coverage"
    - "increase all sublimits by 50%"
    """
    try:
        from ai.sublimit_intel import edit_sublimits_with_ai

        # Convert to format expected by edit function
        sublimits_format = []
        for cov in coverages:
            sublimits_format.append({
                "coverage": cov.get("coverage", ""),
                "primary_limit": cov.get("primary_limit", 0),
                "treatment": cov.get("treatment", "included"),
                "our_limit": cov.get("our_limit"),
                "our_attachment": cov.get("our_attachment"),
            })

        # Call AI to edit
        result = edit_sublimits_with_ai(sublimits_format, instruction)

        # Convert back to our format
        updated = []
        for item in result:
            # Determine if sublimit based on coverage name
            coverage_name = item.get("coverage", "")
            is_sublimit = coverage_name not in AGGREGATE_COVERAGES

            updated.append({
                "coverage": coverage_name,
                "primary_limit": item.get("primary_limit", 0),
                "is_sublimit": is_sublimit,
                "treatment": item.get("treatment", "included"),
                "our_limit": item.get("our_limit") or item.get("primary_limit", 0),
                "our_attachment": item.get("our_attachment", 0),
            })

        st.success(f"Applied: {instruction}")
        return updated

    except ImportError:
        # Fallback: simple pattern matching for common operations
        return _edit_coverages_simple(coverages, instruction)
    except Exception as e:
        st.error(f"Error editing coverages: {e}")
        return coverages


def _edit_coverages_simple(coverages: list, instruction: str) -> list:
    """Simple pattern-based coverage editing (fallback when AI not available)."""
    instruction_lower = instruction.lower()
    updated = [cov.copy() for cov in coverages]

    # Pattern: "set X to Y" or "change X to Y"
    import re
    set_match = re.search(r'(?:set|change)\s+(.+?)\s+to\s+(\d+[km]?)', instruction_lower)
    if set_match:
        target_name = set_match.group(1).strip()
        new_limit = _parse_amount(set_match.group(2))

        for cov in updated:
            if target_name in cov.get("coverage", "").lower():
                cov["primary_limit"] = new_limit
                cov["our_limit"] = new_limit
                st.success(f"Set {cov['coverage']} to {_format_amount(new_limit)}")
                return updated

    # Pattern: "add X Y sublimit" or "add X at Y"
    add_match = re.search(r'add\s+(.+?)\s+(\d+[km]?)\s*(?:sublimit)?', instruction_lower)
    if add_match:
        new_name = add_match.group(1).strip().title()
        new_limit = _parse_amount(add_match.group(2))

        updated.append({
            "coverage": new_name,
            "primary_limit": new_limit,
            "is_sublimit": True,
            "treatment": "included",
            "our_limit": new_limit,
            "our_attachment": 0,
        })
        st.success(f"Added {new_name} at {_format_amount(new_limit)}")
        return updated

    # Pattern: "remove X"
    remove_match = re.search(r'remove\s+(.+)', instruction_lower)
    if remove_match:
        target_name = remove_match.group(1).strip()
        original_len = len(updated)
        updated = [cov for cov in updated if target_name not in cov.get("coverage", "").lower()]
        if len(updated) < original_len:
            st.success(f"Removed coverage matching '{target_name}'")
            return updated

    st.warning(f"Could not parse instruction: {instruction}")
    return coverages


# ─────────────────────── Main Render Function ───────────────────────

def render_coverages_panel(sub_id: str, expanded: bool = False):
    """
    Render the unified coverages panel.

    Adapts UI based on CMAI position:
    - Primary: Shows our standard policy coverages with editable limits
    - Excess: Shows primary coverages with AI parsing and proportional calculations
    """
    # Get position
    position = _get_cmai_position()

    # Get aggregate limit from dropdown (not retention!)
    aggregate_limit = st.session_state.get(f"selected_limit_{sub_id}", 0)
    if not aggregate_limit:
        # Fallback to tower layer limit
        aggregate_limit = position["our_limit"] or 1_000_000  # Default 1M

    with st.expander("🛡️ Coverages", expanded=expanded):
        # Position indicator with debug info
        if position["is_primary"]:
            st.info(f"**Primary Position** | Aggregate: {_format_amount(aggregate_limit)} (from dropdown)")
        else:
            st.info(
                f"**Excess Position** | Layer {position['cmai_layer_idx'] + 1}: "
                f"{_format_amount(position['our_limit'])} xs {_format_amount(position['our_attachment'])} | "
                f"Primary Aggregate: {_format_amount(position['aggregate_limit'])}"
            )

        # Initialize coverages in session state
        session_key = f"coverages_{sub_id}"
        if session_key not in st.session_state:
            st.session_state[session_key] = _get_default_coverages(aggregate_limit, position["is_primary"])

        coverages = st.session_state[session_key]

        # Handle position change - reset if switching primary/excess
        position_key = f"coverages_position_{sub_id}"
        if position_key in st.session_state:
            if st.session_state[position_key] != position["is_primary"]:
                # Position changed - reset coverages
                coverages = _get_default_coverages(aggregate_limit, position["is_primary"])
                st.session_state[session_key] = coverages
        st.session_state[position_key] = position["is_primary"]

        # Different UI for primary vs excess
        if position["is_primary"]:
            _render_primary_ui(sub_id, coverages, aggregate_limit, position)
        else:
            _render_excess_ui(sub_id, coverages, position)


def _render_primary_ui(sub_id: str, coverages: list, aggregate_limit: float, position: dict):
    """Render UI for primary position."""
    session_key = f"coverages_{sub_id}"

    # Quick action buttons (use unified AI command box at top for text input)
    col_reset, col_update = st.columns([1, 1])
    with col_reset:
        if st.button("Reset Defaults", key=f"reset_cov_{sub_id}"):
            st.session_state[session_key] = _get_default_coverages(aggregate_limit, True)
            st.rerun()
    with col_update:
        if st.button("Sync Aggregate", key=f"update_agg_{sub_id}"):
            # Update all non-sublimit coverages to match current aggregate
            updated_coverages = []
            updated_count = 0
            for cov in coverages:
                updated_cov = cov.copy()
                if not cov.get("is_sublimit"):
                    updated_cov["primary_limit"] = aggregate_limit
                    updated_cov["our_limit"] = aggregate_limit
                    updated_count += 1
                updated_coverages.append(updated_cov)
            st.session_state[session_key] = updated_coverages
            st.toast(f"Synced {updated_count} aggregate coverages to {_format_amount(aggregate_limit)}")
            st.rerun()

    # Convert to DataFrame
    df = _coverages_to_dataframe(coverages, position)

    # Editable table
    edited_df = st.data_editor(
        df,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "coverage": st.column_config.TextColumn("Coverage", width="large"),
            "limit": st.column_config.TextColumn("Limit", width="small", help="e.g., 1M, 500K, 100K"),
            "type": st.column_config.SelectboxColumn(
                "Type", width="small",
                options=["Aggregate", "Sublimit"],
                default="Aggregate"
            ),
        },
        key=f"coverages_editor_{sub_id}"
    )

    # Update on change
    if not edited_df.equals(df):
        st.session_state[session_key] = _dataframe_to_coverages(edited_df, position)
        st.rerun()


def _render_excess_ui(sub_id: str, coverages: list, position: dict):
    """Render UI for excess position."""
    session_key = f"coverages_{sub_id}"

    st.caption("Use the AI command box above to describe primary coverages (e.g., 'primary has $5M aggregate with $500K SE, $250K FTF')")

    # Just clear button - NL input handled by unified AI command box
    if st.button("Clear Coverages", key=f"clear_cov_{sub_id}"):
        st.session_state[session_key] = []
        st.rerun()

    # Convert to DataFrame
    df = _coverages_to_dataframe(coverages, position)

    # Editable table with treatment options
    edited_df = st.data_editor(
        df,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "coverage": st.column_config.TextColumn("Coverage", width="medium"),
            "primary_limit": st.column_config.TextColumn("Primary Limit", width="small"),
            "treatment": st.column_config.SelectboxColumn(
                "Treatment", width="small",
                options=["follow_form", "different", "no_coverage"],
                default="follow_form"
            ),
            "our_limit": st.column_config.TextColumn(
                "Our Limit", width="small",
                help="Auto-calculated. Edit only if treatment is 'different'."
            ),
            "our_attachment": st.column_config.TextColumn(
                "Our Attachment", width="small",
                help="Auto-calculated. Edit only if treatment is 'different'."
            ),
        },
        key=f"coverages_editor_excess_{sub_id}"
    )

    # Update on change
    if not edited_df.equals(df):
        st.session_state[session_key] = _dataframe_to_coverages(edited_df, position)
        st.rerun()


# ─────────────────────── Export for Quote Generation ───────────────────────

def get_coverages_for_quote(sub_id: str) -> dict:
    """
    Get coverages formatted for quote PDF generation.

    Returns:
        dict with:
        - aggregate_coverages: list of (name, limit) for aggregate coverages
        - sublimit_coverages: list of (name, limit) for sublimit coverages
        - all_coverages: dict[name, limit]
    """
    session_key = f"coverages_{sub_id}"
    coverages = st.session_state.get(session_key, [])
    position = _get_cmai_position()

    aggregate_covs = []
    sublimit_covs = []
    all_covs = {}

    for cov in coverages:
        name = cov.get("coverage", "")
        treatment = cov.get("treatment", "follow_form")

        if treatment == "no_coverage":
            continue

        # Determine the limit to use
        if position["is_primary"]:
            limit = cov.get("our_limit") or cov.get("primary_limit", 0)
        else:
            if treatment == "different":
                limit = cov.get("our_limit") or 0
            else:
                # Calculate proportional
                primary_limit = cov.get("primary_limit", 0)
                limit, _ = _calc_proportional(primary_limit, position)

        if cov.get("is_sublimit"):
            sublimit_covs.append((name, limit))
        else:
            aggregate_covs.append((name, limit))

        all_covs[name] = limit

    return {
        "aggregate_coverages": aggregate_covs,
        "sublimit_coverages": sublimit_covs,
        "all_coverages": all_covs,
    }
