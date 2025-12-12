"""
Tower Panel Component
Renders the insurance tower builder with natural language input and editable table.
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


def _format_percent(percent: float) -> str:
    """Format percentage for display."""
    if percent is None:
        return ""
    return f"{percent:.1f}%"


def _format_currency(amount: float) -> str:
    """Format currency for display."""
    if amount is None:
        return ""
    if amount >= 1_000_000:
        return f"${amount/1_000_000:.1f}M"
    if amount >= 1_000:
        return f"${amount/1_000:.0f}K"
    return f"${amount:,.0f}"


def _parse_percent(val):
    """Parse a percentage string into a float."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("%", "")
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _parse_retention_from_text(text: str):
    """Extract retention/deductible from free text."""
    pattern = r"(?:retention|deductible|SIR|self[- ]?insured)\s*(?:of|is|:)?\s*\$?([\d,.]+[KkMm]?)"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return _parse_amount(match.group(1))
    return None


def _parse_premium(val):
    """Parse a premium value, accepting K/M notation."""
    if val is None or str(val).strip() == "":
        return None
    return _parse_amount(val)


def _parse_rpm(val):
    """Parse an RPM value, accepting K/M notation."""
    if val is None or str(val).strip() == "":
        return None
    return _parse_amount(val)


# ─────────────────────── Layer Conversion ───────────────────────

def _layers_to_dataframe(layers: list) -> pd.DataFrame:
    """Convert layers list to DataFrame for display."""
    if not layers:
        return pd.DataFrame(columns=["carrier", "limit", "attachment", "premium", "rpm", "ilf"])

    rows = []
    for idx, layer in enumerate(layers):
        limit_value = layer.get("limit", 0) or 0
        quota_total = layer.get("quota_share_total_limit")
        quota_percent = layer.get("quota_share_percentage")

        if quota_percent is None and quota_total:
            try:
                if quota_total:
                    quota_percent = (limit_value / quota_total) * 100 if quota_total else None
            except Exception:
                quota_percent = None

        # For Layer 1 (idx 0), show retention in attachment column
        if idx == 0:
            retention = layer.get("retention") or st.session_state.get("primary_retention", 0)
            attachment_display = _format_amount(retention) if retention else ""
        else:
            attachment_display = _format_amount(layer.get("attachment", 0))

        rows.append({
            "carrier": layer.get("carrier", ""),
            "limit": _format_amount(limit_value),
            "attachment": attachment_display,
            "premium": _format_currency(layer.get("premium")) if layer.get("premium") is not None else "",
            "rpm": _format_rpm(layer.get("rpm", 0)) if layer.get("rpm") else "",
            "ilf": layer.get("ilf", ""),
            "quota_share_part_of": _format_amount(quota_total) if quota_total else "",
            "quota_share_percentage": _format_percent(quota_percent) if quota_percent else "",
        })

    return pd.DataFrame(rows)


def _dataframe_to_layers(df: pd.DataFrame, existing_layers=None) -> list:
    """Convert DataFrame back to layers list."""
    layers = []
    existing_layers = existing_layers or []
    has_quota_part_of = "quota_share_part_of" in df.columns
    has_quota_percentage = "quota_share_percentage" in df.columns

    for idx, row in df.iterrows():
        if not any(str(row.get(col, "")).strip() for col in ["carrier", "limit", "attachment"]):
            continue

        attachment_value = _parse_amount(row.get("attachment", 0))

        # For Layer 1 (idx 0), attachment column represents retention
        if idx == 0:
            layer = {
                "carrier": str(row.get("carrier", "")).strip(),
                "limit": _parse_amount(row.get("limit", 0)),
                "attachment": 0,  # Primary layer attachment is always 0
                "retention": attachment_value if attachment_value else None,
                "premium": _parse_premium(row.get("premium", 0)) if str(row.get("premium", "")).strip() else None,
                "rpm": _parse_rpm(row.get("rpm", 0)) if str(row.get("rpm", "")).strip() else None,
                "ilf": str(row.get("ilf", "")).strip() or None,
            }
            # Also update session state
            if attachment_value:
                st.session_state.primary_retention = attachment_value
        else:
            layer = {
                "carrier": str(row.get("carrier", "")).strip(),
                "limit": _parse_amount(row.get("limit", 0)),
                "attachment": attachment_value,
                "premium": _parse_premium(row.get("premium", 0)) if str(row.get("premium", "")).strip() else None,
                "rpm": _parse_rpm(row.get("rpm", 0)) if str(row.get("rpm", "")).strip() else None,
                "ilf": str(row.get("ilf", "")).strip() or None,
            }
            if idx < len(existing_layers):
                layer["retention"] = existing_layers[idx].get("retention")

        if has_quota_part_of:
            part_of_val = _parse_amount(row.get("quota_share_part_of")) if str(row.get("quota_share_part_of", "")).strip() else None
            layer["quota_share_total_limit"] = part_of_val if part_of_val else None
        elif idx < len(existing_layers):
            layer["quota_share_total_limit"] = existing_layers[idx].get("quota_share_total_limit")

        if has_quota_percentage:
            percent_val = _parse_percent(row.get("quota_share_percentage")) if str(row.get("quota_share_percentage", "")).strip() else None
            layer["quota_share_percentage"] = percent_val if percent_val else None
        elif idx < len(existing_layers):
            layer["quota_share_percentage"] = existing_layers[idx].get("quota_share_percentage")

        layers.append(layer)

    return layers


def _has_quota_share_layer(layers: list) -> bool:
    """Detect whether any excess layer carries quota share data."""
    for idx, layer in enumerate(layers):
        if idx == 0:
            continue
        total = layer.get("quota_share_total_limit")
        if total and _parse_amount(total):
            return True
    return False


def _normalize_carrier_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip())


# ─────────────────────── Change Detection ───────────────────────

def _detect_table_changes(original: pd.DataFrame, edited: pd.DataFrame) -> dict[int, set[str]]:
    """Identify which columns were modified by the user in the data editor."""
    changes: dict[int, set[str]] = {}
    orig = original.reset_index(drop=True)
    edit = edited.reset_index(drop=True)
    columns = list(edit.columns)

    def _norm(val):
        if pd.isna(val):
            return ""
        return str(val).strip()

    for idx in range(len(edit)):
        row_changes: set[str] = set()
        for col in columns:
            new_val = _norm(edit.at[idx, col])
            old_val = _norm(orig.at[idx, col]) if idx < len(orig) else ""
            if new_val != old_val:
                if new_val or old_val:
                    row_changes.add(col)
        if row_changes:
            changes[idx] = row_changes
    return changes


# ─────────────────────── AI Processing Helpers ───────────────────────

def _extract_carrier_tokens(raw: str) -> list[str]:
    parts = []
    if not raw:
        return parts
    normalized = raw.replace("&", " and ")
    for token in re.split(r",| and |\band\b", normalized, flags=re.I):
        name = token.strip()
        if name:
            parts.append(name)
    return parts


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


def _infer_quota_share_from_text(text: str, layers: list) -> None:
    """Use simple heuristics to populate quota share metadata from the user's description."""
    if not text or not layers:
        return

    pattern = re.compile(
        r"([A-Za-z0-9 /&,'-]+?)\s+(?:are|is|were|being)\s+part of\s+a\s+([0-9.,$\sMKmk]+)\s+quota share(?:[^.]*?each\s+with\s+(?:a\s+)?([0-9.,$\sMKmk]+)\s+limit)?",
        flags=re.I,
    )
    lowered_layers = {str(layer.get("carrier", "")).strip().lower(): layer for layer in layers}

    for match in pattern.finditer(text):
        carriers_block = match.group(1)
        total_raw = match.group(2)
        per_raw = match.group(3) if match.lastindex and match.lastindex >= 3 else None

        total_limit = _parse_amount(total_raw)
        per_limit = _parse_amount(per_raw) if per_raw else None
        if not total_limit:
            continue

        carriers = _extract_carrier_tokens(carriers_block)
        for name in carriers:
            layer = lowered_layers.get(name.lower())
            if not layer:
                continue
            layer["quota_share_total_limit"] = total_limit
            if per_limit and not layer.get("limit"):
                layer["limit"] = per_limit
            limit_val = layer.get("limit") or 0
            if total_limit and limit_val:
                layer["quota_share_percentage"] = (limit_val / total_limit) * 100


def _stack_layers_with_quota(layers: list) -> None:
    """Assign attachments while respecting quota share groups."""
    running_attachment = 0.0
    idx = 0
    while idx < len(layers):
        layer = layers[idx]
        limit_val = layer.get("limit", 0) or 0
        total_limit = _parse_amount(layer.get("quota_share_total_limit")) if layer.get("quota_share_total_limit") else None

        if idx == 0:
            layer["attachment"] = running_attachment
            running_attachment += limit_val
            idx += 1
            continue

        if total_limit:
            group_indices = []
            j = idx
            while j < len(layers):
                candidate = layers[j]
                candidate_total = _parse_amount(candidate.get("quota_share_total_limit")) if candidate.get("quota_share_total_limit") else None
                if candidate_total and abs(candidate_total - total_limit) < 1e-6:
                    group_indices.append(j)
                    j += 1
                else:
                    break

            if not group_indices:
                layer["attachment"] = running_attachment
                running_attachment += limit_val
                idx += 1
                continue

            for gi in group_indices:
                glayer = layers[gi]
                glayer["attachment"] = running_attachment
                if glayer.get("quota_share_percentage") is None:
                    share_limit = glayer.get("limit") or 0
                    if total_limit:
                        glayer["quota_share_percentage"] = (share_limit / total_limit) * 100 if share_limit else None
                glayer["quota_share_total_limit"] = total_limit

            running_attachment += total_limit
            idx = group_indices[-1] + 1
        else:
            layer["attachment"] = running_attachment
            running_attachment += limit_val
            idx += 1


def _recalculate_manual_layers(layers: list, change_map: dict[int, set[str]] | None = None) -> None:
    """Recompute derived premium/RPM/ILF fields after manual edits."""
    if not layers:
        return

    change_map = change_map or {}

    # Get primary layer data for ILF calculations
    primary = layers[0] if layers else {}
    primary_limit = primary.get("limit") or 0
    primary_premium = primary.get("premium")
    base_rpm = primary.get("rpm")

    if not base_rpm and primary_premium and primary_limit:
        base_rpm = primary_premium / max(1.0, (primary_limit / 1_000_000.0))
        primary["rpm"] = base_rpm

    # Process each layer
    for idx, layer in enumerate(layers):
        limit_val = layer.get("limit") or 0
        premium = layer.get("premium")
        rpm = layer.get("rpm")

        row_changed = change_map.get(idx, set())

        exposure = limit_val / 1_000_000.0 if limit_val else 0

        # If premium changed, recalculate RPM
        if "premium" in row_changed and premium is not None and exposure:
            layer["rpm"] = premium / exposure
        # If RPM changed, recalculate premium
        elif "rpm" in row_changed and rpm is not None and exposure:
            layer["premium"] = rpm * exposure

        # Calculate ILF if we have base_rpm
        if base_rpm and layer.get("rpm"):
            layer["ilf"] = f"{layer['rpm'] / base_rpm:.2f}"


# ─────────────────────── Main Render Function ───────────────────────

def render_tower_panel(sub_id: str, expanded: bool = True):
    """
    Render the insurance tower panel.

    Args:
        sub_id: Submission ID
        expanded: Whether to expand the tower section by default
    """
    # Initialize session state
    if "tower_layers" not in st.session_state:
        st.session_state.tower_layers = []
    if "primary_retention" not in st.session_state:
        st.session_state.primary_retention = None

    with st.expander("🏗️ Insurance Tower", expanded=expanded):
        # Clear button only - NL input is handled by unified AI command box
        if st.button("Clear Tower", key="tower_clear_btn"):
            st.session_state.tower_layers = []
            st.session_state.primary_retention = None
            st.rerun()

        # Tower Table
        _render_tower_table()

        # Tower Summary
        _render_tower_summary()


def _process_natural_language_input(user_input: str):
    """Process natural language input with AI."""
    try:
        from ai.tower_intel import run_command_with_ai

        current_layers = st.session_state.tower_layers
        result = run_command_with_ai(current_layers, user_input, 0.0, None)

        with st.expander("Debug: AI Response", expanded=False):
            st.json(result)

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

        _infer_quota_share_from_text(user_input, layers)

        # Update first layer with primary data
        if primary and layers:
            layers[0].update({
                "premium": primary.get("premium"),
                "rpm": primary.get("rpm"),
                "ilf": "TBD"
            })
            if retention_val is not None:
                layers[0]["retention"] = retention_val

            primary_limit = layers[0].get("limit") or primary.get("limit") or 0
            primary_premium = primary.get("premium") if primary else None
            base_rpm = primary.get("rpm") if primary else None

            if not base_rpm and primary_premium and primary_limit:
                base_rpm = primary_premium / max(1.0, (primary_limit / 1_000_000.0))
                primary["rpm"] = base_rpm
            if base_rpm and not layers[0].get("rpm"):
                layers[0]["rpm"] = base_rpm
            if primary_premium and not layers[0].get("premium"):
                layers[0]["premium"] = primary_premium

        _stack_layers_with_quota(layers)
        _recalculate_manual_layers(layers, {})

        st.session_state.tower_layers = layers
        st.success("Tower updated successfully!")

    except Exception as e:
        st.error(f"Error processing input: {str(e)}")
        st.exception(e)


def _render_tower_table():
    """Render the editable tower table."""
    quota_share_detected = _has_quota_share_layer(st.session_state.tower_layers)
    if "quota_share_manual_enable" not in st.session_state:
        st.session_state.quota_share_manual_enable = quota_share_detected
    elif quota_share_detected and not st.session_state.quota_share_manual_enable:
        st.session_state.quota_share_manual_enable = True

    show_quota_columns = st.checkbox(
        "Show quota share columns",
        key="quota_share_manual_enable",
        help="Quota share captures scenarios like '5M part of 25M excess 50M'."
    )

    if quota_share_detected:
        st.caption("Quota share layer detected in the excess tower.")

    df = _layers_to_dataframe(st.session_state.tower_layers)
    display_columns = ["carrier", "limit"]
    if show_quota_columns:
        display_columns.append("quota_share_part_of")
    display_columns.extend(["attachment", "premium", "rpm", "ilf"])
    if show_quota_columns:
        display_columns.append("quota_share_percentage")
    df_for_editor = df[display_columns] if not df.empty else pd.DataFrame(columns=display_columns)

    # Use dynamic key that changes when a different quote is loaded
    # This forces the data_editor to re-render with new data
    loaded_quote_id = st.session_state.get("loaded_tower_id", "new")
    editor_key = f"tower_editor_{loaded_quote_id}"

    edited_df = st.data_editor(
        df_for_editor,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "carrier": st.column_config.TextColumn("Carrier", width="medium"),
            "limit": st.column_config.TextColumn("Limit", width="small"),
            "attachment": st.column_config.TextColumn(
                "Attach/Ret",
                width="small",
                help="Layer 1: Retention/Deductible. Layer 2+: Attachment point."
            ),
            "premium": st.column_config.TextColumn("Premium", width="small"),
            "rpm": st.column_config.TextColumn("RPM", width="small"),
            "ilf": st.column_config.TextColumn("ILF", width="small"),
            "quota_share_part_of": st.column_config.TextColumn(
                "Part Of",
                width="small",
                help="Total shared limit for the quota share layer.",
            ),
            "quota_share_percentage": st.column_config.TextColumn(
                "Quota Share %",
                width="small",
                help="Carrier's share of the quota layer (optional).",
            ),
        },
        key=editor_key
    )

    if not edited_df.equals(df_for_editor):
        change_map = _detect_table_changes(df_for_editor, edited_df)
        recalculated_layers = _dataframe_to_layers(edited_df, st.session_state.tower_layers)
        _recalculate_manual_layers(recalculated_layers, change_map)
        st.session_state.tower_layers = recalculated_layers
        st.rerun()


def _render_tower_summary():
    """Render tower summary metrics."""
    if st.session_state.tower_layers:
        st.markdown("---")
        total_limit = sum(layer.get("limit", 0) for layer in st.session_state.tower_layers)
        total_premium = sum(layer.get("premium", 0) for layer in st.session_state.tower_layers if layer.get("premium"))

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total Layers", len(st.session_state.tower_layers))
        with col2:
            retention_val = st.session_state.get("primary_retention")
            if retention_val is None and st.session_state.tower_layers:
                retention_val = st.session_state.tower_layers[0].get("retention")
            st.metric("Retention", _format_amount(retention_val or 0))
        with col3:
            st.metric("Total Limit", _format_amount(total_limit))
        with col4:
            st.metric("Total Premium", _format_currency(total_premium))
