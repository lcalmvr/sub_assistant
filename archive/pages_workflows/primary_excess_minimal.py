import streamlit as st
import pandas as pd
import re


def _usd_to_float(inp) -> float:
    if inp is None:
        return 0.0
    if isinstance(inp, (int, float)):
        return float(inp)
    s = str(inp).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0


def _parse_limit_millions_default(val: str) -> float:
    s = str(val or "").strip().upper().replace(",", "").replace("$", "")
    if not s:
        return 0.0
    try:
        if s.endswith("K"):
            return float(s[:-1] or 0) * 1_000
        if s.endswith("M"):
            return float(s[:-1] or 0) * 1_000_000
        # default bare numbers to millions
        return float(s) * 1_000_000
    except Exception:
        return 0.0


def _parse_rpm_value(val) -> float | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        x = float(val)
        return x * 1000.0 if 0 < x < 1000 else x
    s = str(val).strip().upper().replace(",", "")
    if not s:
        return None
    mult = 1.0
    if s.endswith("K"):
        mult = 1_000.0
        s = s[:-1]
    elif s.endswith("M"):
        mult = 1_000_000.0
        s = s[:-1]
    try:
        x = float(re.sub(r"[^0-9.]+", "", s)) * mult
        if 0 < x < 1000:
            x *= 1000.0
        return x
    except Exception:
        return None


def _fmt_compact(n) -> str:
    try:
        n = float(n or 0)
    except Exception:
        return ""
    if n <= 0:
        return ""
    if n >= 1_000_000 and abs(n % 1_000_000) < 1e-6:
        return f"{int(n // 1_000_000)}M"
    if n >= 1_000 and abs(n % 1_000) < 1e-6:
        return f"{int(n // 1_000)}K"
    return f"{n:,.0f}"


def _fmt_num(n) -> str:
    if n is None:
        return ""
    try:
        return f"{float(n):, .0f}".replace(" ", "")
    except Exception:
        return ""


def _fmt_rpm(n) -> str:
    if n is None:
        return ""
    try:
        k = float(n) / 1000.0
        return (f"{int(k)}K" if abs(k - int(k)) < 1e-6 else f"{k:.2f}K")
    except Exception:
        return ""


def _fmt_percent(p: float | None) -> str:
    if not p:
        return ""
    s = f"{p*100:.2f}%"
    return s.rstrip("0").rstrip(".")


def render():
    st.title("Primary + Excess — Minimal Stable Editor")
    st.caption("Single-table source of truth. Deterministic math. No AI.")

    key = "ux_minimal_grid"
    if key not in st.session_state:
        st.session_state[key] = pd.DataFrame([
            {"carrier": "", "limit": "", "retention": "", "attachment": "", "premium": "", "rpm": "", "ilf": "", "waiting_hours": ""}
        ])

    st.markdown("Columns: carrier, limit, retention (row 0), attachment (auto for rows ≥ 1), premium, rpm, ilf, waiting_hours")
    df = st.data_editor(st.session_state[key], num_rows="dynamic", use_container_width=True, key="min_grid")

    # Deterministic auto-calc
    df_calc = df.fillna("")

    # Pass A: compute premium/rpm per row
    for i in range(len(df_calc)):
        lim_txt = str(df_calc.at[i, "limit"]).strip() if "limit" in df_calc.columns else ""
        prem_txt = str(df_calc.at[i, "premium"]).strip() if "premium" in df_calc.columns else ""
        rpm_txt = str(df_calc.at[i, "rpm"]).strip() if "rpm" in df_calc.columns else ""
        lim_val = _parse_limit_millions_default(lim_txt) if lim_txt else 0.0
        prem_val = _usd_to_float(prem_txt) if prem_txt else None
        rpm_val = _parse_rpm_value(rpm_txt)
        if (prem_val is not None) and (rpm_val is None) and lim_val:
            rpm_val = prem_val / max(1.0, (lim_val/1_000_000.0))
            df_calc.at[i, "rpm"] = _fmt_rpm(rpm_val)
        elif (rpm_val is not None) and (prem_val is None) and lim_val:
            prem_val = rpm_val * (lim_val/1_000_000.0)
            df_calc.at[i, "premium"] = _fmt_num(prem_val)
        # Normalize formats if both are present
        if prem_val is not None:
            df_calc.at[i, "premium"] = _fmt_num(prem_val)
        if rpm_val is not None:
            df_calc.at[i, "rpm"] = _fmt_rpm(rpm_val)
        if lim_txt:
            df_calc.at[i, "limit"] = _fmt_compact(lim_val)

    # Pass B: attachments from primary limit (row 0), ILF from previous row
    base_attach = 0.0
    if len(df_calc) > 0:
        lim0_txt = str(df_calc.at[0, "limit"]).strip() if "limit" in df_calc.columns else ""
        base_attach = _parse_limit_millions_default(lim0_txt) if lim0_txt else 0.0
    running_attach = base_attach
    prev_rpm = None
    for i in range(len(df_calc)):
        lim_txt = str(df_calc.at[i, "limit"]).strip()
        lim_val = _parse_limit_millions_default(lim_txt) if lim_txt else 0.0
        rpm_txt = str(df_calc.at[i, "rpm"]).strip() if "rpm" in df_calc.columns else ""
        rpm_val = _parse_rpm_value(rpm_txt)
        if i >= 1:
            # attachment auto
            df_calc.at[i, "attachment"] = _fmt_compact(running_attach)
            running_attach += lim_val
        # ilf
        if i == 0:
            df_calc.at[i, "ilf"] = ""
        else:
            df_calc.at[i, "ilf"] = _fmt_percent((rpm_val/prev_rpm) if (rpm_val and prev_rpm) else None)
        prev_rpm = rpm_val if rpm_val is not None else prev_rpm

    # Persist and show
    st.session_state[key] = df_calc
    st.dataframe(df_calc, use_container_width=True, hide_index=True)


if __name__ == "__main__":
    render()

