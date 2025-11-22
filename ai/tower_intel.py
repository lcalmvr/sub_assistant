import os
import json
import re
from typing import Any, Dict, List, Optional

from openai import OpenAI


_MODEL_PRIMARY = os.getenv("TOWER_AI_MODEL", "gpt-5.1")


def _client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set for tower AI parser")
    return OpenAI(api_key=key)


SYSTEM = (
    "You are an expert insurance broker assistant. Parse a natural language description of an excess tower into a structured JSON object.\n"
    "Compute missing values per clear rules. Be consistent and conservative.\n"
    "CRITICAL: Never invent carriers or layers that are not explicitly mentioned by the user."
)

USER_TEMPLATE = (
    "Task:\n"
    "- Extract ordered list of carriers in the EXACT order mentioned by the user.\n"
    "- Do NOT introduce carriers that are not explicitly present in the text.\n"
    "- Determine per-layer limit (global), plus any per-carrier overrides.\n"
    "- Determine premiums and/or RPM (rate per $1M). If only the first premium is given and an ILF (as percent) is given for the rest, compute the rest: RPM_i = RPM_(i-1) * ILF. Premium = RPM * (limit/1,000,000).\n"
    "- Attachments stack from the primary limit (base_attachment). Each row's attachment equals the previous attachment plus any quota-share block sum; for simple single-carrier-per-layer, attachment increases by the immediately prior row's limit.\n"
    "- ILF should be percent relative to the immediate previous row's RPM. First row ILF is 'TBD'.\n"
    "- IMPORTANT: When user says '80% ILF' for remaining layers, calculate each subsequent layer's RPM as 80% of the previous layer's RPM.\n"
    "- CRITICAL: Maintain the exact order of carriers as listed by the user. If user says 'Carriers are XL, AIG, Corvus, Proof', then the order should be XL (primary), AIG (1st excess), Corvus (2nd excess), Proof (3rd excess). Do NOT reorder carriers based on limits or other factors.\n"
    "- Example: If first layer has $100K premium on $5M limit (RPM = 20K), then second layer RPM = 20K * 0.8 = 16K, third layer RPM = 16K * 0.8 = 12.8K, etc.\n\n"
    "Inputs:\n"
    "- base_attachment: {base_attachment}\n"
    "- text: '''{text}'''\n\n"
    "Output strictly as JSON with this schema:\n"
    "{{\n"
    "  \"layers\": [\n"
    "    {{\n"
    "      \"carrier\": string,\n"
    "      \"limit\": number,      // dollars\n"
    "      \"attachment\": number, // dollars\n"
    "      \"premium\": number|null,\n"
    "      \"rpm\": number|null,   // per $1,000,000\n"
    "      \"ilf\": string         // 'TBD' for first, else like '80%'\n"
    "    }}\n"
    "  ]\n"
    "}}\n"
)


def parse_tower_with_ai(text: str, base_attachment: float, primary_rpm: Optional[float] = None) -> List[Dict[str, Any]]:
    """Call OpenAI to parse NL tower description into structured layers.
    Returns a list of dict rows suitable for a grid (carrier, limit, attachment, premium, rpm, ilf).
    Raises RuntimeError on API or parsing errors.
    """
    client = _client()
    messages = [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": USER_TEMPLATE.format(text=text, base_attachment=int(base_attachment)),
        },
    ]
    rsp = client.chat.completions.create(
        model=_MODEL_PRIMARY,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = rsp.choices[0].message.content or "{}"
    data = json.loads(content)
    layers = data.get("layers", [])
    return _normalize_and_compute(layers, base_attachment, primary_rpm)


EDIT_SYSTEM = (
    "You are an expert insurance broker assistant. You will receive the current tower as JSON and a user instruction.\n"
    "Apply the instruction to produce a new tower. Then ensure Premium, RPM, and ILF are consistent using these rules:\n"
    "- RPM = Premium / (Limit/1,000,000); Premium = RPM * (Limit/1,000,000);\n"
    "- ILF (row i) = RPM_i / RPM_(i-1); first ILF = 'TBD'.\n"
    "- If ILF given and previous RPM known, RPM_i = ILF * RPM_(i-1).\n"
    "- Attachments stack from the base attachment.\n"
)

EDIT_USER_TMPL = (
    "Base attachment: {base_attachment}\n"
    "Current tower JSON:\n{current_json}\n\n"
    "Instruction:\n{instruction}\n\n"
    "Output strictly as JSON with key 'layers' (same schema as before).\n"
)


def edit_tower_with_ai(current_layers: List[Dict[str, Any]], instruction: str, base_attachment: float, primary_rpm: Optional[float] = None) -> List[Dict[str, Any]]:
    """Edit existing tower per instruction via LLM, then normalize with deterministic rules."""
    client = _client()
    messages = [
        {"role": "system", "content": EDIT_SYSTEM},
        {
            "role": "user",
            "content": EDIT_USER_TMPL.format(
                base_attachment=int(base_attachment), current_json=json.dumps({"layers": current_layers}, indent=2), instruction=instruction
            ),
        },
    ]
    rsp = client.chat.completions.create(
        model=_MODEL_PRIMARY,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = rsp.choices[0].message.content or "{}"
    data = json.loads(content)
    layers = data.get("layers", [])
    return _normalize_and_compute(layers, base_attachment, primary_rpm)


# ───────────────────────── Ops Engine ─────────────────────────
OPS_SYSTEM = (
    "You are a planner that converts natural-language tower edit commands into a sequence of atomic operations.\n"
    "Do NOT compute numbers; only output the minimal ops. Valid ops:\n"
    "- {type:'clear'}\n"
    "- {type:'replace', layers:[{carrier, limit, attachment?, premium?, rpm?, ilf?}...]}\n"
    "- {type:'add', layers:[{carrier, limit, attachment?}...]}\n"
    "- {type:'insert', layer:{carrier, limit, at_attachment}, move:'up'|'none'}\n"
    "- {type:'set', target:{index?|carrier?}, field:'limit'|'premium'|'rpm'|'ilf', value:any}\n"
    "- {type:'set_primary', primary:{carrier, limit, retention?, premium?, rpm?, waiting_hours?}}\n"
    "Constraints: CRITICAL - Maintain the exact order of carriers as listed by the user. If user says 'Carriers are XL, AIG, Corvus, Proof', the order must be XL (primary), AIG (1st excess), Corvus (2nd excess), Proof (3rd excess). For 'insert at A x B', use 'at_attachment=B' and the provided layer.limit. 'move up' means later layers shift above by the inserted limit."
    " NEVER invent new carriers or layers."
)

OPS_USER_TMPL = (
    "Current tower (JSON):\n{current_json}\n\nCommand:\n{instruction}\n\n"
    "Output JSON strictly: {{\n  \"ops\": [ ... ]\n}}\n"
)


def _to_rows_for_ops(layers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for r in layers:
        out.append({
            "carrier": str(r.get("carrier") or "").strip(),
            "limit": float(_parse_amount(r.get("limit"))),
            "attachment": float(_parse_amount(r.get("attachment"))),
            "premium": (float(_parse_amount(r.get("premium"))) if r.get("premium") is not None else None),
            "rpm": (float(_parse_amount(r.get("rpm"))) if r.get("rpm") is not None else None),
            "ilf": r.get("ilf"),
        })
    return out


def _apply_ops(current: List[Dict[str, Any]], ops: List[Dict[str, Any]], base_attachment: float) -> List[Dict[str, Any]]:
    cur = [dict(r) for r in current]
    for op in ops or []:
        t = (op.get("type") or "").lower()
        if t == "clear":
            cur = []
        elif t == "replace":
            layers = op.get("layers") or []
            cur = _to_rows_for_ops(layers)
        elif t == "add":
            layers = op.get("layers") or []
            cur.extend(_to_rows_for_ops(layers))
        elif t == "insert":
            layer = op.get("layer") or {}
            move = (op.get("move") or "none").lower()
            new_row = {
                "carrier": str(layer.get("carrier") or "").strip(),
                "limit": float(_parse_amount(layer.get("limit"))),
                "attachment": float(_parse_amount(layer.get("at_attachment"))),
                "premium": None,
                "rpm": None,
                "ilf": None,
            }
            # find index by attachment using current stacking from base
            idx = len(cur)
            run_att = float(base_attachment or 0.0)
            for i, r in enumerate(cur):
                if run_att >= new_row["attachment"]:
                    idx = i
                    break
                run_att += float(r.get("limit") or 0.0)
            cur.insert(idx, new_row)
            if move == "up":
                # shift subsequent layers' attachments implicitly by position; final recompute will stack
                pass
        elif t == "set":
            tgt = op.get("target") or {}
            field = op.get("field")
            val = op.get("value")
            if not field:
                continue
            target_index = None
            if "index" in tgt:
                try:
                    target_index = int(tgt.get("index"))
                except Exception:
                    target_index = None
            elif "carrier" in tgt:
                name = str(tgt.get("carrier") or "").strip().lower()
                for i, r in enumerate(cur):
                    if (r.get("carrier") or "").strip().lower() == name:
                        target_index = i
                        break
            if target_index is not None and 0 <= target_index < len(cur):
                if field in ("limit", "attachment", "premium", "rpm"):
                    cur[target_index][field] = float(_parse_amount(val))
                elif field == "ilf":
                    cur[target_index][field] = val
    return cur


def run_command_with_ai(current_layers: List[Dict[str, Any]], instruction: str, base_attachment: float, primary_rpm: Optional[float] = None) -> Dict[str, Any]:
    """Turn a natural command into ops via LLM, apply ops deterministically, then normalize numbers.
    Returns dict with keys: 'layers' (list) and optional 'primary' (dict)."""
    client = _client()
    messages = [
        {"role": "system", "content": OPS_SYSTEM},
        {
            "role": "user",
            "content": OPS_USER_TMPL.format(current_json=json.dumps({"layers": current_layers}, indent=2), instruction=instruction),
        },
    ]
    rsp = client.chat.completions.create(
        model=_MODEL_PRIMARY,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = rsp.choices[0].message.content or "{}"
    data = json.loads(content)
    ops = data.get("ops", [])
    # Extract primary from ops if provided
    prim = None
    prim_rpm_local: Optional[float] = primary_rpm
    base_attach_local = base_attachment
    for op in ops:
        if (op.get("type") or "").lower() == "set_primary":
            p = op.get("primary") or {}
            lim = _parse_amount(p.get("limit"))
            ret = _parse_amount(p.get("retention"))
            prem = _parse_amount(p.get("premium")) if p.get("premium") is not None else None
            rpmv = _parse_amount(p.get("rpm")) if p.get("rpm") is not None else None
            wait = p.get("waiting_hours")
            # compute missing primary fields
            if rpmv is None and prem is not None and lim:
                rpmv = prem / max(1.0, (lim/1_000_000.0))
            if prem is None and rpmv is not None and lim:
                prem = rpmv * (lim/1_000_000.0)
            prim = {
                "carrier": str(p.get("carrier") or "").strip(),
                "limit": float(lim or 0.0),
                "retention": float(ret or 0.0),
                "premium": (float(prem) if prem is not None else None),
                "rpm": (float(rpmv) if rpmv is not None else None),
                "waiting_hours": (float(wait) if isinstance(wait, (int, float)) else (float(_parse_amount(wait)) if wait is not None else None)),
            }
            # For excess, base attachment is the primary limit
            if prim["limit"]:
                base_attach_local = prim["limit"]
            prim_rpm_local = prim.get("rpm") if prim.get("rpm") is not None else prim_rpm_local

    applied = _apply_ops(current_layers, ops, base_attach_local)
    layers = _normalize_and_compute(applied, base_attach_local, prim_rpm_local)
    out = {"layers": layers, "ops": ops}
    if prim is not None:
        out["primary"] = prim
    return out


# ───────────────────────── Helpers ─────────────────────────
def _parse_amount(val: Any) -> float:
    """Parse dollar and K/M-suffixed numbers into float dollars.
    Examples: 45K -> 45000, 5M -> 5000000, "$45,000" -> 45000.
    Returns 0.0 for invalid/blank.
    """
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
        # As a convenience, bare integers like 45 interpreted as thousands when small (RPM-style)
        try:
            n = float(re.sub(r"[^0-9.]+", "", s))
            return n
        except Exception:
            return 0.0


def _parse_percent(val: Any) -> Optional[float]:
    """Parse percent strings to fraction: 80% -> 0.8. Returns None if invalid."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) / 100.0 if val > 1.0 else float(val)
    s = str(val).strip().replace("%", "")
    if not s:
        return None
    try:
        return float(s) / 100.0
    except Exception:
        return None


def _fmt_percent(p: Optional[float]) -> str:
    if p is None:
        return ""
    return (f"{p*100:.2f}".rstrip("0").rstrip(".") + "%")


def _normalize_and_compute(rows: List[Dict[str, Any]], base_attachment: float, primary_rpm: Optional[float] = None) -> List[Dict[str, Any]]:
    """Ensure Premium, RPM, and ILF are consistent by computing missing values.
    Rules:
    - RPM = Premium / (Limit/1,000,000)
    - Premium = RPM * (Limit/1,000,000)
    - ILF (row i) = RPM_i / RPM_(i-1); first ILF is 'TBD'
    - If ILF provided and previous RPM known, compute RPM_i = ILF * RPM_(i-1)
    - Attachments stack from base_attachment if missing.
    """
    # Prepare normalized numeric skeleton
    norm: List[Dict[str, Any]] = []
    for r in rows:
        carrier = str(r.get("carrier") or "").strip()
        limit = _parse_amount(r.get("limit"))
        attach = _parse_amount(r.get("attachment"))
        premium = r.get("premium")
        rpm = r.get("rpm")
        ilf_raw = r.get("ilf")
        # Parse rpm: allow K suffix for convenience
        rpm_val = None
        if rpm is not None:
            x = _parse_amount(rpm)
            # If user typed 45 (assume thousands)
            if 0 < x < 1000:
                x *= 1000.0
            rpm_val = x
        prem_val = _parse_amount(premium) if premium is not None else None
        ilf_frac = _parse_percent(ilf_raw)
        norm.append(
            {
                "carrier": carrier,
                "limit": float(limit),
                "attachment": float(attach),
                "premium": (float(prem_val) if prem_val is not None else None),
                "rpm": (float(rpm_val) if rpm_val is not None else None),
                "_ilf_frac": ilf_frac,
            }
        )

    # Always set attachments by stacking deterministically (override if needed)
    running_attach = float(base_attachment or 0.0)
    for row in norm:
        row["attachment"] = running_attach
        running_attach = float(row["attachment"]) + float(row.get("limit") or 0.0)

    # Compute RPM/Premium using rules
    prev_rpm = primary_rpm if (primary_rpm is not None) else None
    for i, row in enumerate(norm):
        limit = float(row.get("limit") or 0.0)
        rpm = row.get("rpm")
        prem = row.get("premium")
        ilf_frac = row.get("_ilf_frac")

        # Priority 1: ILF drives RPM/Premium for rows above the base
        # If ILF provided, use it for rows above the baseline (including first if primary_rpm provided)
        if (i >= 0) and (ilf_frac is not None) and (prev_rpm is not None):
            rpm = prev_rpm * ilf_frac
            row["rpm"] = rpm
            prem = rpm * (limit / 1_000_000.0) if limit else None
            row["premium"] = prem
        else:
            # Priority 2: Premium drives RPM (recompute even if RPM present)
            if (prem is not None) and limit:
                rpm = prem / max(1.0, (limit / 1_000_000.0))
                row["rpm"] = rpm
            # Priority 3: RPM drives Premium when Premium missing
            elif (rpm is not None) and (prem is None) and limit:
                prem = rpm * (limit / 1_000_000.0)
                row["premium"] = prem

        prev_rpm = rpm if rpm is not None else prev_rpm

    # Compute ILF percent strings
    out: List[Dict[str, Any]] = []
    prev_rpm = primary_rpm if (primary_rpm is not None) else None
    for i, row in enumerate(norm):
        rpm = row.get("rpm")
        ilf_str = _fmt_percent((rpm / prev_rpm) if (rpm and prev_rpm) else None)
        prev_rpm = rpm if rpm is not None else prev_rpm
        out.append(
            {
                "carrier": row["carrier"],
                "limit": float(row["limit"] or 0.0),
                "attachment": float(row["attachment"] or 0.0),
                "premium": (float(row["premium"]) if row.get("premium") is not None else None),
                "rpm": (float(row["rpm"]) if row.get("rpm") is not None else None),
                "ilf": ilf_str,
            }
        )

    return out
