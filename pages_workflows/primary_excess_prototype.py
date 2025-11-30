"""
Primary vs. Excess Prototype - Simplified
=========================================

A clean Streamlit interface for capturing insurance tower structures.
Features:
- Natural language input box above the table
- AI processing to populate the tower table
- Simple table for recording primary carrier and excess carriers
"""

from __future__ import annotations

import os
import re
import json
import pandas as pd
import streamlit as st
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CURRENT_USER = os.getenv("CURRENT_USER", "system")


# ───────────────────────── Database Helpers ─────────────────────────

def _get_conn():
    """Get database connection with session caching."""
    conn = st.session_state.get("db_conn")
    try:
        if conn is not None and conn.closed == 0:
            with conn.cursor() as test_cur:
                test_cur.execute("SELECT 1")
            return conn
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        st.session_state.pop("db_conn", None)
        conn = None

    if conn is None or conn.closed != 0:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        st.session_state["db_conn"] = conn
    return conn


def _save_tower(submission_id: str, tower_json: list, primary_retention: float | None,
                sublimits: list | None = None, quote_name: str = "Option A",
                quoted_premium: float | None = None, quote_notes: str | None = None) -> str:
    """Save a new tower/quote option for a submission."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO insurance_towers (submission_id, tower_json, primary_retention,
                                          sublimits, quote_name, quoted_premium, quote_notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (submission_id, json.dumps(tower_json), primary_retention,
             json.dumps(sublimits or []), quote_name, quoted_premium, quote_notes, CURRENT_USER),
        )
        return str(cur.fetchone()[0])


def _update_tower(tower_id: str, tower_json: list, primary_retention: float | None,
                  sublimits: list | None = None, quote_name: str | None = None,
                  quoted_premium: float | None = None, quote_notes: str | None = None):
    """Update an existing tower/quote option."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            UPDATE insurance_towers
            SET tower_json = %s, primary_retention = %s,
                sublimits = %s, quote_name = COALESCE(%s, quote_name),
                quoted_premium = %s, quote_notes = %s, updated_at = now()
            WHERE id = %s
            """,
            (json.dumps(tower_json), primary_retention,
             json.dumps(sublimits or []), quote_name, quoted_premium, quote_notes, tower_id),
        )


def _parse_tower_json(val):
    """Parse JSON field that could be string, list, or None."""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return json.loads(val) if val else []


def _row_to_quote(row) -> dict:
    """Convert a database row to a quote dict."""
    return {
        "id": str(row[0]),
        "tower_json": _parse_tower_json(row[1]),
        "primary_retention": float(row[2]) if row[2] else None,
        "sublimits": _parse_tower_json(row[3]),
        "quote_name": row[4] or "Option A",
        "quoted_premium": float(row[5]) if row[5] else None,
        "quote_notes": row[6],
        "created_at": row[7],
        "updated_at": row[8],
    }


def _get_tower_for_submission(submission_id: str) -> dict | None:
    """Get the most recent quote for a submission."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at
            FROM insurance_towers
            WHERE submission_id = %s
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (submission_id,),
        )
        row = cur.fetchone()
    return _row_to_quote(row) if row else None


def _get_quote_by_id(quote_id: str) -> dict | None:
    """Get a specific quote by ID."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at
            FROM insurance_towers
            WHERE id = %s
            """,
            (quote_id,),
        )
        row = cur.fetchone()
    return _row_to_quote(row) if row else None


def _list_quotes_for_submission(submission_id: str) -> list[dict]:
    """List all quote options for a submission."""
    with _get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, tower_json, primary_retention, sublimits,
                   quote_name, quoted_premium, quote_notes, created_at, updated_at
            FROM insurance_towers
            WHERE submission_id = %s
            ORDER BY quote_name, created_at
            """,
            (submission_id,),
        )
        rows = cur.fetchall()
    return [_row_to_quote(row) for row in rows]


def _clone_quote(quote_id: str, new_name: str) -> str:
    """Clone an existing quote with a new name. Returns new quote ID."""
    original = _get_quote_by_id(quote_id)
    if not original:
        raise ValueError(f"Quote {quote_id} not found")

    with _get_conn().cursor() as cur:
        # Get submission_id for the original quote
        cur.execute("SELECT submission_id FROM insurance_towers WHERE id = %s", (quote_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Quote {quote_id} not found")
        submission_id = str(row[0])

    return _save_tower(
        submission_id=submission_id,
        tower_json=original["tower_json"],
        primary_retention=original["primary_retention"],
        sublimits=original["sublimits"],
        quote_name=new_name,
        quoted_premium=original["quoted_premium"],
        quote_notes=original.get("quote_notes"),
    )


def _delete_tower(tower_id: str):
    """Delete a tower/quote."""
    with _get_conn().cursor() as cur:
        cur.execute("DELETE FROM insurance_towers WHERE id = %s", (tower_id,))

# ───────────────────────── Helper Functions ─────────────────────────

def _parse_amount(val) -> float:
    """Parse dollar and K/M-suffixed numbers into float dollars."""
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
        num = float(s)
        if abs(num) < 1_000:
            return num * 1_000_000
        return num
    except Exception:
        return 0.0


def _format_amount(amount: float) -> str:
    """Format dollar amounts with K/M suffixes."""
    if not amount:
        return ""
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"${int(amount // 1_000_000)}M"
    if amount >= 1_000 and amount % 1_000 == 0:
        return f"${int(amount // 1_000)}K"
    return f"${amount:,.0f}"


def _format_rpm(rpm: float) -> str:
    """Format rate per million."""
    if not rpm:
        return ""
    k = rpm / 1000.0
    return f"{int(k)}K" if abs(k - int(k)) < 1e-6 else f"{k:.2f}K"


def _format_percent(percent: float) -> str:
    """Format percentage values."""
    if not percent:
        return ""
    return f"{percent:.0f}%" if percent == int(percent) else f"{percent:.1f}%"


def _format_currency(amount: float) -> str:
    """Format full dollar amounts without compact suffixes."""
    if amount is None:
        return ""
    try:
        return f"${amount:,.0f}" if amount else ""
    except Exception:
        return ""


def _parse_percent(val):
    """Parse percentage strings into floats."""
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
    if not text:
        return None
    pattern = re.compile(r"(?:retention|sir|deductible)\s*(?:of|is|:)?\s*([$\d.,\sMKmk]+)", flags=re.I)
    match = pattern.search(text)
    if match:
        return _parse_amount(match.group(1))
    return None


def _parse_premium(val):
    """Parse premium values; assume thousands when users omit suffix."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        num = float(val)
        if num == 0:
            return 0.0
        return num * 1_000 if abs(num) < 1_000 else num

    s = str(val).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return None

    try:
        if s.endswith("K"):
            return float(s[:-1] or 0) * 1_000
        if s.endswith("M"):
            return float(s[:-1] or 0) * 1_000_000
        num = float(s)
        if num == 0:
            return 0.0
        return num * 1_000 if abs(num) < 1_000 else num
    except Exception:
        return None


def _parse_rpm(val):
    """Parse RPM inputs, assuming values are in thousands unless marked."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        num = float(val)
        return num * 1000 if abs(num) < 1000 else num

    s = str(val).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return None

    try:
        if s.endswith("K"):
            return float(s[:-1] or 0) * 1000
        num = float(s)
        return num * 1000 if abs(num) < 1000 else num
    except Exception:
        return None


def _layers_to_dataframe(layers: list) -> pd.DataFrame:
    """Convert layers list to DataFrame for display."""
    if not layers:
        return pd.DataFrame(columns=["carrier", "limit", "attachment", "premium", "rpm", "ilf"])
    
    rows = []
    for layer in layers:
        limit_value = layer.get("limit", 0) or 0
        quota_total = layer.get("quota_share_total_limit")
        quota_percent = layer.get("quota_share_percentage")

        if quota_percent is None and quota_total:
            try:
                if quota_total:
                    quota_percent = (limit_value / quota_total) * 100 if quota_total else None
            except Exception:
                quota_percent = None

        rows.append({
            "carrier": layer.get("carrier", ""),
            "limit": _format_amount(limit_value),
            "attachment": _format_amount(layer.get("attachment", 0)),
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

        layer = {
            "carrier": str(row.get("carrier", "")).strip(),
            "limit": _parse_amount(row.get("limit", 0)),
            "attachment": _parse_amount(row.get("attachment", 0)),
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


# ───────────────────────── Sublimits Helpers ─────────────────────────

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
            # Use stored override or show calculated as starting point
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

        # Determine our_limit - store only if treatment is "different" and value differs from calculated
        our_limit = None
        if treatment == "different" and our_limit_str:
            parsed = _parse_amount(our_limit_str)
            our_limit = parsed  # Always store for "different" treatment

        # Determine our_attachment - store only if treatment is "different" and value differs from calculated
        our_attachment = None
        if treatment == "different" and our_attach_str:
            parsed = _parse_amount(our_attach_str)
            our_attachment = parsed  # Always store for "different" treatment

        sublimits.append({
            "coverage": coverage,
            "primary_limit": primary_limit,
            "treatment": treatment,
            "our_limit": our_limit,
            "our_attachment": our_attachment,
        })

    return sublimits


def _parse_primary_carrier(text: str):
    if not text:
        return None
    patterns = [
        r"([A-Za-z0-9 /&,'-]+?)\s+is\s+the\s+primary",
        r"primary(?: carrier)?(?: is|:)?\s+([^.,;\n]+)",
    ]
    for pat in patterns:
        match = re.search(pat, text, flags=re.I)
        if match:
            return _normalize_carrier_name(match.group(1))
    return None


def _parse_excess_carriers(text: str) -> list[str]:
    carriers = []
    if not text:
        return carriers
    pattern = re.compile(r"(?:excess(?: carriers?)?|xs)(?:\s+tower)?\s*(?:are|is|=|:)?\s+([^.;\n]+)", flags=re.I)
    for match in pattern.finditer(text):
        carriers.extend(_extract_carrier_tokens(match.group(1)))
    return [_normalize_carrier_name(c) for c in carriers if c]


def _parse_premium_hints(text: str) -> list[float]:
    if not text:
        return []
    amounts = []
    pattern = re.compile(r"premium[s]?[^\d$]*([\$\d.,\sMKmkand]+)", flags=re.I)
    for match in pattern.finditer(text):
        segment = match.group(1)
        for amt in re.findall(r"\$?\s*\d[\d,]*(?:\.\d+)?\s*[MKmk]?", segment):
            value = _parse_amount(amt)
            if value:
                amounts.append(value)
    return amounts


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
            # Identify contiguous quota share group with the same total limit
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
                # Should not happen, fallback to regular stacking
                layer["attachment"] = running_attachment
                running_attachment += limit_val
                idx += 1
                continue

            for gi in group_indices:
                glayer = layers[gi]
                glayer["attachment"] = running_attachment
                # Fill percentage if missing
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

    _stack_layers_with_quota(layers)

    prev_rpm = None
    for idx, layer in enumerate(layers):
        limit_val = layer.get("limit") or 0
        exposure = (limit_val / 1_000_000.0) if limit_val else None
        premium = layer.get("premium")
        rpm = layer.get("rpm")
        changes = {c.lower() for c in change_map.get(idx, set())}
        manual_premium = "premium" in changes
        manual_rpm = "rpm" in changes
        manual_ilf = "ilf" in changes
        manual_limit = "limit" in changes

        total = _parse_amount(layer.get("quota_share_total_limit")) if layer.get("quota_share_total_limit") else None
        attachment = layer.get("attachment") or 0

        if idx == 0:
            if manual_premium and exposure:
                layer["rpm"] = (premium / exposure) if premium is not None else None
            elif manual_rpm and exposure:
                layer["premium"] = (rpm * exposure) if rpm is not None else None
            elif manual_limit and exposure:
                if not manual_premium and premium is not None:
                    layer["rpm"] = premium / exposure
                elif not manual_rpm and rpm is not None:
                    layer["premium"] = rpm * exposure
            else:
                if rpm is not None and exposure:
                    layer["premium"] = rpm * exposure
                elif premium is not None and exposure:
                    layer["rpm"] = premium / exposure
            layer["ilf"] = "TBD"
            prev_rpm = layer.get("rpm")
            continue

        prev_layer = layers[idx - 1]
        prev_total = _parse_amount(prev_layer.get("quota_share_total_limit")) if prev_layer.get("quota_share_total_limit") else None
        same_quota_group = (
            total
            and prev_total
            and abs(total - prev_total) < 1e-6
            and (prev_layer.get("attachment") or 0) == attachment
        )

        prev_rpm_effective = prev_layer.get("rpm") if prev_layer.get("rpm") is not None else prev_rpm

        def _apply_ilf_ratio_from_prev(ilf_ratio) -> None:
            if ilf_ratio is None:
                return
            if prev_rpm_effective is None:
                return
            new_rpm = prev_rpm_effective * ilf_ratio
            layer["rpm"] = new_rpm
            if exposure:
                layer["premium"] = new_rpm * exposure

        if manual_ilf:
            ilf_percent = _parse_percent(layer.get("ilf")) if layer.get("ilf") else None
            factor = None
            if ilf_percent is not None:
                factor = ilf_percent / 100.0 if ilf_percent > 1 else ilf_percent
            _apply_ilf_ratio_from_prev(factor)
            if ilf_percent is not None:
                display_percent = ilf_percent if ilf_percent > 1 else ilf_percent * 100
                layer["ilf"] = _format_percent(display_percent)
            else:
                layer["ilf"] = ""
        elif manual_rpm:
            if exposure and rpm is not None:
                layer["premium"] = rpm * exposure
        elif manual_premium:
            if exposure and premium is not None:
                layer["rpm"] = premium / exposure
        elif manual_limit and exposure:
            if premium is not None:
                layer["rpm"] = premium / exposure
            elif rpm is not None:
                layer["premium"] = rpm * exposure
        elif same_quota_group:
            if prev_layer.get("rpm") is not None:
                layer["rpm"] = prev_layer["rpm"]
                if exposure:
                    layer["premium"] = layer["rpm"] * exposure
            layer["ilf"] = prev_layer.get("ilf") or layer.get("ilf") or ""

        # Refresh values after manual precedence
        premium = layer.get("premium")
        rpm = layer.get("rpm")

        if not manual_ilf and not same_quota_group:
            if rpm is not None and prev_rpm_effective:
                ilf_value = (rpm / prev_rpm_effective) * 100
                layer["ilf"] = _format_percent(ilf_value)
            elif layer.get("ilf"):
                pass
            else:
                layer["ilf"] = ""

        if same_quota_group and not manual_ilf:
            if layer.get("ilf") is None or layer.get("ilf") == "":
                layer["ilf"] = prev_layer.get("ilf") or ""

        # Ensure premium/rpm alignment when one exists
        if exposure:
            if rpm is not None and (manual_rpm or not manual_premium):
                layer["premium"] = rpm * exposure
            elif premium is not None and layer.get("rpm") is None:
                layer["rpm"] = premium / exposure

        prev_rpm = layer.get("rpm") if layer.get("rpm") is not None else prev_rpm_effective


# ───────────────────────── Main Interface ─────────────────────────

def render():
    st.title("🧪 Insurance Tower Builder")
    st.markdown("Enter natural language descriptions to build your insurance tower structure.")

    # Initialize session state
    if "tower_layers" not in st.session_state:
        st.session_state.tower_layers = []
    if "loaded_tower_id" not in st.session_state:
        st.session_state.loaded_tower_id = None
    if "sublimits" not in st.session_state:
        st.session_state.sublimits = []

    # ─────────────── Submission Context & Save/Load ───────────────
    # Uses shared session state from submissions page
    selected_sub_id = st.session_state.get("selected_submission_id")

    if selected_sub_id:
        # Fetch submission name for display
        try:
            with _get_conn().cursor() as cur:
                cur.execute("SELECT applicant_name FROM submissions WHERE id = %s", (selected_sub_id,))
                row = cur.fetchone()
                sub_name = row[0] if row else "Unknown"
        except Exception:
            sub_name = "Unknown"

        st.info(f"**Working on:** {sub_name} (`{selected_sub_id[:8]}...`)")

        # Auto-load tower when submission changes
        last_loaded_sub = st.session_state.get("_tower_loaded_for_sub")
        if last_loaded_sub != selected_sub_id:
            try:
                tower_data = _get_tower_for_submission(selected_sub_id)
                if tower_data:
                    st.session_state.tower_layers = tower_data["tower_json"]
                    st.session_state.primary_retention = tower_data["primary_retention"]
                    st.session_state.sublimits = tower_data.get("sublimits") or []
                    st.session_state.loaded_tower_id = tower_data["id"]
                    st.session_state.quote_name = tower_data.get("quote_name", "Option A")
                    st.session_state.quoted_premium = tower_data.get("quoted_premium")
                else:
                    # No saved tower - start fresh
                    st.session_state.tower_layers = []
                    st.session_state.primary_retention = None
                    st.session_state.sublimits = []
                    st.session_state.loaded_tower_id = None
                    st.session_state.quote_name = "Option A"
                    st.session_state.quoted_premium = None
            except Exception:
                st.session_state.tower_layers = []
                st.session_state.sublimits = []
                st.session_state.loaded_tower_id = None
                st.session_state.quote_name = "Option A"
                st.session_state.quoted_premium = None
            st.session_state._tower_loaded_for_sub = selected_sub_id

        # Quote Options UI
        if selected_sub_id:
            # Get all quote options for this submission
            all_quotes = _list_quotes_for_submission(selected_sub_id)

            # Quote selection row
            col_select, col_actions = st.columns([2, 3])

            with col_select:
                if all_quotes:
                    quote_options = {q["id"]: f"{q['quote_name']} ({q['updated_at'].strftime('%m/%d')})" for q in all_quotes}
                    quote_options["__new__"] = "+ New Quote Option"

                    current_quote_id = st.session_state.get("loaded_tower_id")
                    default_idx = 0
                    if current_quote_id and current_quote_id in quote_options:
                        default_idx = list(quote_options.keys()).index(current_quote_id)

                    selected_quote_id = st.selectbox(
                        "Quote Option",
                        options=list(quote_options.keys()),
                        format_func=lambda x: quote_options[x],
                        index=default_idx,
                        key="quote_selector"
                    )

                    # Load selected quote if changed
                    if selected_quote_id != "__new__" and selected_quote_id != current_quote_id:
                        quote_data = _get_quote_by_id(selected_quote_id)
                        if quote_data:
                            st.session_state.tower_layers = quote_data["tower_json"]
                            st.session_state.primary_retention = quote_data["primary_retention"]
                            st.session_state.sublimits = quote_data.get("sublimits") or []
                            st.session_state.loaded_tower_id = quote_data["id"]
                            st.session_state.quote_name = quote_data.get("quote_name", "Option A")
                            st.session_state.quoted_premium = quote_data.get("quoted_premium")
                            st.rerun()
                    elif selected_quote_id == "__new__":
                        # Clear for new quote
                        if st.session_state.get("loaded_tower_id"):
                            st.session_state.tower_layers = []
                            st.session_state.primary_retention = None
                            st.session_state.sublimits = []
                            st.session_state.loaded_tower_id = None
                            # Auto-generate next option name
                            existing_names = [q["quote_name"] for q in all_quotes]
                            for letter in "BCDEFGHIJ":
                                new_name = f"Option {letter}"
                                if new_name not in existing_names:
                                    st.session_state.quote_name = new_name
                                    break
                            else:
                                st.session_state.quote_name = f"Option {len(all_quotes) + 1}"
                            st.session_state.quoted_premium = None
                            st.rerun()
                else:
                    st.caption("No saved quotes yet")

            with col_actions:
                btn_cols = st.columns([1, 1, 1])

                with btn_cols[0]:
                    if st.button("💾 Save", type="primary", use_container_width=True):
                        if not st.session_state.tower_layers:
                            st.warning("No tower data to save.")
                        else:
                            try:
                                retention = st.session_state.get("primary_retention")
                                sublimits = st.session_state.get("sublimits", [])
                                quote_name = st.session_state.get("quote_name", "Option A")
                                quoted_premium = st.session_state.get("quoted_premium")

                                if st.session_state.loaded_tower_id:
                                    _update_tower(
                                        st.session_state.loaded_tower_id,
                                        st.session_state.tower_layers,
                                        retention,
                                        sublimits,
                                        quote_name,
                                        quoted_premium
                                    )
                                    st.success("Quote updated!")
                                else:
                                    tower_id = _save_tower(
                                        selected_sub_id,
                                        st.session_state.tower_layers,
                                        retention,
                                        sublimits,
                                        quote_name,
                                        quoted_premium
                                    )
                                    st.session_state.loaded_tower_id = tower_id
                                    st.success("Quote saved!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"Error saving: {e}")

                with btn_cols[1]:
                    if st.session_state.loaded_tower_id and st.button("📋 Clone", use_container_width=True):
                        try:
                            existing_names = [q["quote_name"] for q in all_quotes]
                            for letter in "BCDEFGHIJ":
                                new_name = f"Option {letter}"
                                if new_name not in existing_names:
                                    break
                            else:
                                new_name = f"Option {len(all_quotes) + 1}"

                            new_id = _clone_quote(st.session_state.loaded_tower_id, new_name)
                            st.session_state.loaded_tower_id = new_id
                            st.session_state.quote_name = new_name
                            st.success(f"Cloned as '{new_name}'")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error cloning: {e}")

                with btn_cols[2]:
                    if st.session_state.loaded_tower_id and st.button("🗑️ Delete", use_container_width=True):
                        try:
                            _delete_tower(st.session_state.loaded_tower_id)
                            st.session_state.loaded_tower_id = None
                            st.session_state.quote_name = "Option A"
                            st.session_state.quoted_premium = None
                            st.success("Quote deleted.")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error deleting: {e}")
    else:
        st.warning("No submission selected. Select a submission from the **Submissions** page to save/load towers.")

    st.divider()

    # Natural Language Input Box (above the table)
    user_input = st.text_area(
        "Describe your insurance tower:",
        placeholder="Example: 'Primary carrier is ABC Insurance with 5M limit and 100K retention. Excess layers: Coalition 5M x 5M at 50K premium, Beazley 5M x 10M at 40K premium, Corvus 5M x 15M at 30K premium.'",
        height=100,
        key="tower_input"
    )
    
    # Process Button
    col1, col2 = st.columns([1, 4])
    with col1:
        process_button = st.button("Process with AI", type="primary")
    
    with col2:
        if st.button("Clear Tower"):
            st.session_state.tower_layers = []
            st.session_state.primary_retention = None
            st.rerun()
    
    # Process the natural language input
    if process_button and user_input.strip():
        try:
            from ai.tower_intel import run_command_with_ai
            
            # Get current layers for context
            current_layers = st.session_state.tower_layers
            
            # Call AI processing
            result = run_command_with_ai(current_layers, user_input, 0.0, None)
            
            # Debug: Show what AI returned
            with st.expander("Debug: AI Response", expanded=False):
                st.json(result)
            
            # Update the tower layers - use the layers exactly as the AI returns them
            layers = result.get("layers", [])
            primary = result.get("primary")
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
                # Filter out any remaining layers whose carrier wasn't requested
                allowed = set(expected_keys)
                filtered_layers = [layer for layer in candidate_layers if _normalize_carrier_name(layer.get("carrier", "")).lower() in allowed]
                if filtered_layers:
                    layers = filtered_layers
                elif ordered_layers:
                    layers = ordered_layers
                else:
                    layers = original_layers

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
                if primary and premium_hints:
                    primary["premium"] = premium_hints[0]
                    primary_limit = primary.get("limit") or (layers[0].get("limit") if layers else 0)
                    expo = (primary_limit / 1_000_000.0) if primary_limit else None
                    if expo:
                        primary["rpm"] = premium_hints[0] / expo

            if layers:
                layers[0]["retention"] = retention_val
            st.session_state.primary_retention = retention_val
            _infer_quota_share_from_text(user_input, layers)

            # If we have a primary, update the first layer with primary data
            if primary and layers:
                # Update the first layer with primary information
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

            # Infer quota share metadata from the prompt and restack
            _stack_layers_with_quota(layers)
            _recalculate_manual_layers(layers, {})

            st.session_state.tower_layers = layers
            
            st.success("✅ Tower updated successfully!")
            
        except Exception as e:
            st.error(f"❌ Error processing input: {str(e)}")
            st.exception(e)
    
    # Tower Table
    st.subheader("Insurance Tower")

    quota_share_detected = _has_quota_share_layer(st.session_state.tower_layers)
    if "quota_share_manual_enable" not in st.session_state:
        st.session_state.quota_share_manual_enable = quota_share_detected
    elif quota_share_detected and not st.session_state.quota_share_manual_enable:
        # Auto-enable if we newly detect quota share layers
        st.session_state.quota_share_manual_enable = True

    show_quota_columns = st.checkbox(
        "Show quota share columns",
        key="quota_share_manual_enable",
        help="Quota share captures scenarios like '5M part of 25M excess 50M'."
    )

    if quota_share_detected:
        st.caption("Quota share layer detected in the excess tower.")

    # Convert layers to DataFrame for editing
    df = _layers_to_dataframe(st.session_state.tower_layers)
    display_columns = ["carrier", "limit"]
    if show_quota_columns:
        display_columns.append("quota_share_part_of")
    display_columns.extend(["attachment", "premium", "rpm", "ilf"])
    if show_quota_columns:
        display_columns.append("quota_share_percentage")
    df_for_editor = df[display_columns]

    # Display and edit the table
    edited_df = st.data_editor(
        df_for_editor,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "carrier": st.column_config.TextColumn("Carrier", width="medium"),
            "limit": st.column_config.TextColumn("Limit", width="small"),
            "attachment": st.column_config.TextColumn("Attachment", width="small"),
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
        key="tower_editor"
    )

    # Update session state when table is edited
    if not edited_df.equals(df_for_editor):
        change_map = _detect_table_changes(df_for_editor, edited_df)
        recalculated_layers = _dataframe_to_layers(edited_df, st.session_state.tower_layers)
        _recalculate_manual_layers(recalculated_layers, change_map)
        st.session_state.tower_layers = recalculated_layers
        st.rerun()

    # ─────────────── Sublimits Section ───────────────
    st.subheader("Sublimits")
    st.caption("Define primary carrier sublimits, then specify your drop-down treatment for each.")

    # Find CMAI layer in the tower to get our position (needed for context and calculations)
    cmai_layer_idx = None
    cmai_layer = None
    for idx, layer in enumerate(st.session_state.tower_layers or []):
        carrier_name = str(layer.get("carrier", "")).upper()
        if "CMAI" in carrier_name:
            cmai_layer_idx = idx
            cmai_layer = layer
            break

    # Calculate our aggregate limit and attachment
    our_aggregate_limit = 0.0
    our_aggregate_attachment = 0.0
    layers_below_count = 0
    primary_aggregate_limit = 0.0

    if st.session_state.tower_layers:
        # Primary is always first layer
        primary_aggregate_limit = st.session_state.tower_layers[0].get("limit", 0) or 0

        if cmai_layer_idx is not None:
            # Sum limits of all layers below CMAI (exclusive)
            our_aggregate_attachment = sum(
                layer.get("limit", 0) for layer in st.session_state.tower_layers[:cmai_layer_idx]
            )
            our_aggregate_limit = cmai_layer.get("limit", 0) or 0
            layers_below_count = cmai_layer_idx  # Number of layers below us
        else:
            # CMAI not in tower - assume we're quoting above the entire tower
            our_aggregate_attachment = sum(
                layer.get("limit", 0) for layer in st.session_state.tower_layers
            )
            layers_below_count = len(st.session_state.tower_layers)
            # Default our limit to match primary if not specified
            our_aggregate_limit = primary_aggregate_limit

    # Display CMAI position info
    if cmai_layer_idx is not None:
        st.info(f"**CMAI Layer:** {_format_amount(our_aggregate_limit)} xs {_format_amount(our_aggregate_attachment)} (Layer {cmai_layer_idx + 1} of {len(st.session_state.tower_layers)}) | Primary agg: {_format_amount(primary_aggregate_limit)} | {layers_below_count} layers below")
    elif st.session_state.tower_layers:
        st.warning("CMAI not found in tower. Add CMAI as a carrier to auto-calculate sublimits.")
        st.caption(f"Tower has {len(st.session_state.tower_layers)} layers, primary agg: {_format_amount(primary_aggregate_limit)}")

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

    # Helper to calculate proportional sublimit values (defined early so it can be used everywhere)
    def calc_proportional_sublimit(primary_sublimit: float) -> tuple[float, float]:
        """Calculate our sublimit and attachment based on proportional logic."""
        if not primary_aggregate_limit or not primary_sublimit:
            return primary_sublimit, 0.0

        sublimit_ratio = primary_sublimit / primary_aggregate_limit
        our_sublimit = sublimit_ratio * our_aggregate_limit if our_aggregate_limit else primary_sublimit

        sublimit_attachment = 0.0
        for layer in (st.session_state.tower_layers or [])[:layers_below_count]:
            layer_limit = layer.get("limit", 0) or 0
            sublimit_attachment += layer_limit * sublimit_ratio

        return our_sublimit, sublimit_attachment

    if process_sublimits and sublimit_input.strip():
        try:
            from ai.sublimit_intel import parse_sublimits_with_ai, edit_sublimits_with_ai

            current_sublimits = st.session_state.get("sublimits", [])

            # If we have existing sublimits, use edit mode; otherwise parse fresh
            if current_sublimits:
                context = f"Primary aggregate limit: {_format_amount(primary_aggregate_limit)}" if primary_aggregate_limit else ""
                result = edit_sublimits_with_ai(current_sublimits, sublimit_input)
            else:
                context = f"Primary aggregate limit: {_format_amount(primary_aggregate_limit)}" if primary_aggregate_limit else ""
                result = parse_sublimits_with_ai(sublimit_input, context)

            # Update session state - single source of truth
            st.session_state.sublimits = result
            st.success(f"Parsed {len(result)} sublimits")
            st.rerun()

        except Exception as e:
            st.error(f"Error processing sublimits: {e}")

    # Convert sublimits to DataFrame for display using helper
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

    # Update session state when table is edited (mirroring tower table pattern)
    if not edited_sublimits.equals(sublimits_df):
        updated_sublimits = _dataframe_to_sublimits(
            edited_sublimits,
            st.session_state.sublimits,
            calc_proportional_sublimit
        )
        st.session_state.sublimits = updated_sublimits
        st.rerun()

    # Rating & Summary
    if st.session_state.tower_layers:
        st.subheader("Rating & Summary")

        total_limit = sum(layer.get("limit", 0) for layer in st.session_state.tower_layers)
        technical_premium = sum(layer.get("premium", 0) for layer in st.session_state.tower_layers if layer.get("premium"))

        # Rating inputs row
        rate_col1, rate_col2, rate_col3 = st.columns([1, 1, 1])

        with rate_col1:
            quote_name = st.text_input(
                "Quote Name",
                value=st.session_state.get("quote_name", "Option A"),
                key="quote_name_input"
            )
            if quote_name != st.session_state.get("quote_name"):
                st.session_state.quote_name = quote_name

        with rate_col2:
            st.metric("Technical Premium", _format_currency(technical_premium))
            st.caption("Sum of layer premiums")

        with rate_col3:
            current_quoted = st.session_state.get("quoted_premium")
            quoted_str = st.text_input(
                "Quoted Premium",
                value=_format_amount(current_quoted) if current_quoted else "",
                placeholder="e.g., 150K, 1.2M",
                key="quoted_premium_input"
            )
            if quoted_str:
                parsed_quoted = _parse_amount(quoted_str)
                if parsed_quoted != current_quoted:
                    st.session_state.quoted_premium = parsed_quoted
            elif current_quoted:
                st.session_state.quoted_premium = None

            # Show variance if both exist
            if technical_premium and st.session_state.get("quoted_premium"):
                variance = st.session_state.quoted_premium - technical_premium
                variance_pct = (variance / technical_premium) * 100 if technical_premium else 0
                if variance >= 0:
                    st.caption(f"+{_format_currency(variance)} ({variance_pct:+.1f}%)")
                else:
                    st.caption(f"{_format_currency(variance)} ({variance_pct:+.1f}%)")

        st.divider()

        # Summary metrics
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
            final_premium = st.session_state.get("quoted_premium") or technical_premium
            st.metric("Final Premium", _format_currency(final_premium))
        
        # Show tower structure with consistent styling
        st.markdown("**Tower Structure:**")
        st.markdown(
            """
            <style>
            .tower-rows {margin-top: 0.25rem;}
            .tower-row {margin-bottom: 0.4rem; font-size: 0.95rem;}
            .tower-row strong {font-weight: 600;}
            .tower-row span {font-weight: 400;}
            </style>
            """,
            unsafe_allow_html=True,
        )

        rows_html = []
        for i, layer in enumerate(st.session_state.tower_layers):
            carrier = layer.get("carrier", "Unknown")
            limit_value = layer.get("limit", 0)
            limit_display = _format_amount(limit_value)
            attachment = _format_amount(layer.get("attachment", 0))
            premium = _format_currency(layer.get("premium")) if layer.get("premium") is not None else "TBD"
            quota_total_raw = layer.get("quota_share_total_limit")
            quota_total = _parse_amount(quota_total_raw) if quota_total_raw else None
            quota_percent = layer.get("quota_share_percentage")

            if quota_percent is None and quota_total and quota_total != 0:
                try:
                    quota_percent = (limit_value / quota_total) * 100 if limit_value else None
                except Exception:
                    quota_percent = None

            structure_text = ""
            if i == 0:
                retention_display = None
                retention_val = layer.get("retention") or st.session_state.get("primary_retention")
                if retention_val:
                    retention_display = _format_amount(retention_val)
                if retention_display:
                    structure_text = f"{limit_display} x {retention_display} SIR"
                else:
                    structure_text = f"{limit_display} x {attachment}"
            else:
                structure_text = f"{limit_display} x {attachment}"

            if i > 0 and quota_total:
                part_of_text = _format_amount(quota_total)
                percent_text = f" ({_format_percent(quota_percent)})" if quota_percent else ""
                structure_text = f"{limit_display} part of {part_of_text}{percent_text}"

            label = "Primary" if i == 0 else f"Layer {i}"
            row_html = (
                f"<div class='tower-row'><strong>{label}:</strong> "
                f"<span>{carrier}</span> — "
                f"<span>{structure_text}</span> "
                f"<span>(Premium: {premium})</span></div>"
            )
            rows_html.append(row_html)

        if rows_html:
            st.markdown("<div class='tower-rows'>" + "".join(rows_html) + "</div>", unsafe_allow_html=True)


# Backwards-compat entry
if __name__ == "__main__":
    st.set_page_config(page_title="Insurance Tower Builder", layout="wide")
    render()
