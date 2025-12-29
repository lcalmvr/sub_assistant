"""
Benchmarking Panel Component

Shows comparable submissions with pricing, outcome, and performance data.
Helps underwriters make pricing decisions based on similar risks.
"""

import json
import re
import streamlit as st
import pandas as pd

from core.benchmarking import (
    get_comparables,
    get_benchmark_metrics,
    get_current_submission_profile,
    get_controls_comparison,
    get_best_tower,
)


def _loss_signal(claims_count: int, claims_paid: float, is_bound: bool) -> str:
    if not is_bound:
        return "—"
    paid = float(claims_paid or 0)
    if not claims_count and paid <= 0:
        return "Clean"
    if claims_count and paid <= 0:
        return "Activity"
    if paid < 100_000:
        return "Low"
    if paid < 1_000_000:
        return "Moderate"
    return "Severe"


def _status_icon_text(status: str, outcome: str) -> tuple[str, str]:
    if status == "declined":
        return "🚫", "Declined"
    if outcome == "bound":
        return "✅", "Bound"
    if outcome == "lost":
        return "❌", "Lost"
    if outcome in {"waiting_for_response", "pending"}:
        return "⏳", "Pending"
    return "⏳", (outcome or status or "—").replace("_", " ").title()


def _parse_nist_flags(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}


def _normalize_flag_value(raw) -> str:
    if not raw:
        return "—"
    if isinstance(raw, str):
        for icon in ("✅", "⚠️", "❌"):
            if icon in raw:
                return icon
        lowered = raw.lower()
        if "strong" in lowered or "comprehensive" in lowered:
            return "✅"
        if "partial" in lowered or "inconsistent" in lowered:
            return "⚠️"
        if "lacking" in lowered or "no information" in lowered or "missing" in lowered:
            return "❌"
        return raw
    return str(raw)


def _join_limited(items: list[str], max_items: int = 2) -> str:
    if len(items) <= max_items:
        return ", ".join(items)
    return ", ".join(items[:max_items]) + " +"


def _controls_delta(current_flags: dict, comparable_flags: dict) -> tuple[int, int, list[str], list[str]]:
    if not current_flags or not comparable_flags:
        return 0, 0, [], []
    rank = {"❌": 0, "⚠️": 1, "✅": 2}
    labels = {
        "identify": "Identify",
        "protect": "Protect",
        "detect": "Detect",
        "respond": "Respond",
        "recover": "Recover",
    }
    stronger = []
    weaker = []
    for key, label in labels.items():
        cur = rank.get(_normalize_flag_value(current_flags.get(key)))
        comp = rank.get(_normalize_flag_value(comparable_flags.get(key)))
        if cur is None or comp is None:
            continue
        if comp > cur:
            stronger.append(label)
        elif comp < cur:
            weaker.append(label)
    return len(stronger), len(weaker), stronger, weaker


def _controls_table_label(
    current_flags: dict,
    comparable_flags: dict,
    similarity: float | None,
) -> str:
    up_count, down_count, _, _ = _controls_delta(current_flags, comparable_flags)
    if up_count == 0 and down_count == 0 and similarity is None:
        return "—"
    parts = []
    if up_count or down_count:
        parts.append(f"▲{up_count} ▼{down_count}")
    if similarity is not None:
        parts.append(f"{int(similarity * 100)}%")
    return " · ".join(parts) if parts else "—"


def _controls_summary(current_flags: dict, comparable_flags: dict) -> str:
    if not current_flags or not comparable_flags:
        return "—"
    _, _, stronger, weaker = _controls_delta(current_flags, comparable_flags)
    if not stronger and not weaker:
        return "Same posture"
    parts = []
    if stronger:
        parts.append(f"Stronger in {', '.join(stronger)}")
    if weaker:
        parts.append(f"Weaker in {', '.join(weaker)}")
    return " · ".join(parts)


def _format_stage(status: str, outcome: str) -> str:
    status_norm = (status or "").lower()
    outcome_norm = (outcome or "").lower()
    if status_norm == "declined":
        return "Declined"
    if outcome_norm == "bound":
        return "Bound"
    if outcome_norm == "lost":
        return "Lost"
    if status_norm == "quoted":
        return "Quoted"
    return "Received"


def _fmt_compact_amount(value: float) -> str:
    if value is None:
        return "—"
    num = float(value)
    if num >= 1_000_000:
        compact = f"{num/1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"${compact}M"
    if num >= 1_000:
        return f"${num/1_000:.0f}K"
    return f"${num:,.0f}"


def _format_layer_band(limit: float | None, attachment: float | None) -> str:
    if not limit:
        return "—"
    limit_label = _fmt_compact_amount(limit)
    if attachment and attachment > 0:
        attach_label = _fmt_compact_amount(attachment)
        return f"{limit_label} xs {attach_label}"
    return limit_label


def _format_ilf(value: float | None) -> str:
    if value is None:
        return "—"
    label = f"{value:.2f}".rstrip("0").rstrip(".")
    return f"{label}x"


def _select_tower_layer(tower_json: list) -> dict:
    if not tower_json:
        return {}
    for layer in tower_json:
        carrier = (layer.get("carrier") or "").upper()
        if carrier == "CMAI":
            return layer
    return min(tower_json, key=lambda layer: float(layer.get("attachment") or 0))


def _build_tower_summary(tower_json: list, tower_premium: float | None = None) -> list[dict]:
    if not tower_json:
        return []
    layers = [dict(layer) for layer in tower_json]
    if tower_premium and not any(layer.get("premium") for layer in layers):
        if len(layers) == 1:
            layers[0]["premium"] = tower_premium

    layers.sort(key=lambda layer: float(layer.get("attachment") or 0))
    rows = []
    prev_rpm = None
    for layer in layers:
        limit_val = float(layer.get("limit") or 0)
        attachment_val = float(layer.get("attachment") or 0)
        premium_val = layer.get("premium")
        premium = float(premium_val) if premium_val is not None else None
        rpm = premium / (limit_val / 1_000_000) if premium and limit_val else None
        ilf = (rpm / prev_rpm) if rpm and prev_rpm else None
        prev_rpm = rpm

        rows.append({
            "Carrier": layer.get("carrier") or "—",
            "Limit": _format_layer_band(limit_val if limit_val else None, attachment_val if attachment_val else None),
            "Premium": _fmt_compact_amount(premium) if premium else "—",
            "RPM": _fmt_compact_amount(rpm) if rpm else "—",
            "ILF": _format_ilf(ilf),
        })

    return rows


def _apply_stage_filter(comparables: list[dict], stage_filter: str | None) -> list[dict]:
    if not stage_filter:
        return comparables
    if stage_filter == "bound":
        return [c for c in comparables if (c.get("submission_outcome") or "").lower() == "bound"]
    if stage_filter == "lost":
        return [c for c in comparables if (c.get("submission_outcome") or "").lower() == "lost"]
    if stage_filter == "declined":
        return [c for c in comparables if (c.get("submission_status") or "").lower() == "declined"]
    if stage_filter == "quoted_plus":
        return [
            c for c in comparables
            if (c.get("submission_status") or "").lower() == "quoted"
            or (c.get("submission_outcome") or "").lower() in {"bound", "lost"}
        ]
    if stage_filter == "received":
        received_statuses = {
            "received",
            "pending",
            "waiting_for_response",
            "open",
            "renewal_expected",
            "renewal_not_received",
        }
        return [
            c for c in comparables
            if (c.get("submission_status") or "").lower() in received_statuses
        ]
    return comparables


def _apply_claims_filter(comparables: list[dict], claims_filter: str | None) -> list[dict]:
    if not claims_filter or claims_filter == "Any":
        return comparables
    filtered = []
    for comp in comparables:
        label = _loss_signal(
            comp.get("claims_count", 0),
            comp.get("claims_paid", 0),
            comp.get("is_bound", False),
        )
        if label == claims_filter:
            filtered.append(comp)
    return filtered


def _apply_similarity_threshold(
    comparables: list[dict],
    *,
    controls_min: float | None,
    sim_min: float | None,
) -> list[dict]:
    if controls_min is None and sim_min is None:
        return comparables
    filtered = []
    for comp in comparables:
        if controls_min is not None:
            ctrl = comp.get("controls_similarity")
            if ctrl is None or ctrl < controls_min:
                continue
        if sim_min is not None:
            sim = comp.get("similarity_score")
            if sim is None or sim < sim_min:
                continue
        filtered.append(comp)
    return filtered


@st.fragment
def _benchmarking_fragment(submission_id: str, get_conn) -> None:
    """Fragment for benchmarking panel to prevent full page reruns."""

    filter_cols = st.columns([1, 1, 1, 1], vertical_alignment="bottom")

    # Revenue size filter
    revenue_options = {
        "±25%": 0.25,
        "±50%": 0.50,
        "±100%": 1.0,
        "Any size": 0,
    }
    with filter_cols[0]:
        layer_choice = st.selectbox(
            "Layer",
            options=["Primary", "Excess"],
            index=0,
            key=f"bench_layer_{submission_id}",
        )
        layer_filter = "primary" if layer_choice == "Primary" else "excess"

    date_options = {
        "Last 12 months": 12,
        "Last 24 months": 24,
        "Last 36 months": 36,
        "Last 60 months": 60,
        "All time": None,
    }
    with filter_cols[1]:
        date_choice = st.selectbox(
            "Date window",
            options=list(date_options.keys()),
            index=1,  # Default to 24 months
            key=f"bench_date_{submission_id}",
        )
        date_window_months = date_options[date_choice]

    stage_options = [
        "All",
        "Received",
        "Quoted",
        "Bound",
        "Lost",
        "Declined",
    ]
    stage_map = {
        "Received": "received",
        "Quoted": "quoted_plus",
        "Bound": "bound",
        "Lost": "lost",
        "Declined": "declined",
    }
    with filter_cols[2]:
        stage_choice = st.selectbox(
            "Stage",
            options=stage_options,
            key=f"bench_stage_{submission_id}",
        )
        stage_filter = stage_map.get(stage_choice)

    with filter_cols[3]:
        industry_query = st.text_input(
            "Industry / vertical (optional)",
            placeholder="SaaS, healthcare, fintech…",
            key=f"bench_industry_{submission_id}",
        )

    attachment_min = None
    attachment_max = None
    range_presets = {}
    range_key = f"bench_attachment_range_{submission_id}"
    min_key = f"bench_attachment_min_{submission_id}"
    max_key = f"bench_attachment_max_{submission_id}"

    if layer_filter == "excess":
        range_presets = {
            "Any": None,
            "0-5M": (0.0, 5.0),
            "5-10M": (5.0, 10.0),
            "10-20M": (10.0, 20.0),
            "20-30M": (20.0, 30.0),
            "30-50M": (30.0, 50.0),
            "50-75M": (50.0, 75.0),
            "75-100M": (75.0, 100.0),
            "100-150M": (100.0, 150.0),
            "150-200M": (150.0, 200.0),
            "200-300M": (200.0, 300.0),
            "300-500M": (300.0, 500.0),
            "500-1000M": (500.0, 1000.0),
            "Custom...": None,
        }

        st.session_state.setdefault(min_key, 0.0)
        st.session_state.setdefault(max_key, 0.0)
        st.session_state.setdefault(range_key, "Any")

        attachment_range_choice = st.session_state.get(range_key, "Any")
        min_m = st.session_state.get(min_key, 10.0)
        max_m = st.session_state.get(max_key, 20.0)

        if attachment_range_choice != "Any":
            if max_m < min_m:
                min_m, max_m = max_m, min_m
            attachment_min = min_m * 1_000_000
            attachment_max = max_m * 1_000_000

    filter_cols_2 = st.columns([1, 1, 1, 1], vertical_alignment="bottom")
    with filter_cols_2[0]:
        revenue_choice = st.selectbox(
            "Revenue range",
            options=list(revenue_options.keys()),
            index=1,  # Default to ±50%
            key=f"bench_rev_{submission_id}",
        )
        revenue_tolerance = revenue_options[revenue_choice]
    sim_options = {
        "Any": None,
        "≥ 90%": 0.90,
        "≥ 80%": 0.80,
        "≥ 70%": 0.70,
        "≥ 60%": 0.60,
        "≥ 50%": 0.50,
    }
    with filter_cols_2[1]:
        sim_choice = st.selectbox(
            "Exposure similarity",
            options=list(sim_options.keys()),
            key=f"bench_sim_min_{submission_id}",
        )
        sim_min = sim_options[sim_choice]
    with filter_cols_2[2]:
        controls_choice = st.selectbox(
            "Controls similarity",
            options=list(sim_options.keys()),
            key=f"bench_controls_min_{submission_id}",
        )
        controls_min = sim_options[controls_choice]
    with filter_cols_2[3]:
        claims_choice = st.selectbox(
            "Claims",
            options=["Any", "Clean", "Activity", "Low", "Moderate", "Severe"],
            key=f"bench_claims_{submission_id}",
        )

    # === FETCH COMPARABLES ===
    # Compare by operations (exposure) + revenue size
    base_limit = 60
    comparables = get_comparables(
        submission_id,
        get_conn,
        similarity_mode="operations",
        revenue_tolerance=revenue_tolerance,
        same_industry=False,
        stage_filter=None,
        date_window_months=date_window_months,
        layer_filter=layer_filter,
        attachment_min=attachment_min,
        attachment_max=attachment_max,
        limit=base_limit,
    )
    comparables = _apply_stage_filter(comparables, stage_filter)

    if industry_query:
        needle = industry_query.strip().lower()
        if needle:
            comparables = [
                c for c in comparables
                if needle in (c.get("naics_title") or "").lower()
                or any(needle in (t or "").lower() for t in (c.get("industry_tags") or []))
            ]

    comparables = _apply_claims_filter(comparables, claims_choice)
    comparables = _apply_similarity_threshold(
        comparables,
        controls_min=controls_min,
        sim_min=sim_min,
    )

    current_profile = get_current_submission_profile(submission_id, get_conn)
    current_flags = _parse_nist_flags(current_profile.get("nist_controls")) if current_profile else {}
    if current_profile and not current_profile.get("has_ops_embedding"):
        st.info("Fallback comps in use — this submission has no embeddings yet, so similarity scores may be missing.")

    # === METRICS CARDS ===
    metrics = get_benchmark_metrics(comparables)

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Comparables", metrics["count"])

    with col2:
        if metrics["avg_rate_per_mil_bound"] is not None:
            st.metric("Avg RPM (bound)", f"${float(metrics['avg_rate_per_mil_bound']):,.0f}")
        else:
            st.metric("Avg RPM (bound)", "—")

    with col3:
        if metrics["avg_rate_per_mil_all"] is not None:
            st.metric("Avg RPM (all)", f"${float(metrics['avg_rate_per_mil_all']):,.0f}")
        else:
            st.metric("Avg RPM (all)", "—")

    with col4:
        if metrics["rate_range"]:
            low, high = metrics["rate_range"]
            if float(low) == float(high):
                value_label = _fmt_compact_amount(low)
            else:
                value_label = f"{_fmt_compact_amount(low)}–{_fmt_compact_amount(high)}"
            st.metric("Rate range (bound)", value_label)
        else:
            st.metric("Rate range (bound)", "—")

    st.divider()

    if layer_filter == "excess":
        def _apply_attachment_preset() -> None:
            choice = st.session_state.get(range_key)
            preset = range_presets.get(choice)
            if preset:
                st.session_state[min_key], st.session_state[max_key] = preset
            elif choice == "Any":
                st.session_state[min_key], st.session_state[max_key] = 0.0, 0.0

        def _force_custom_attachment() -> None:
            if st.session_state.get(range_key) != "Custom...":
                st.session_state[range_key] = "Custom..."

        att_cols = st.columns([2, 1, 1], vertical_alignment="bottom")
        with att_cols[0]:
            attachment_range_choice = st.selectbox(
                "Attachment range",
                options=list(range_presets.keys()),
                key=range_key,
                on_change=_apply_attachment_preset,
            )
        with att_cols[1]:
            st.number_input(
                "Min (M)",
                min_value=0.0,
                step=1.0,
                key=min_key,
                on_change=_force_custom_attachment,
                disabled=attachment_range_choice == "Any",
            )
        with att_cols[2]:
            st.number_input(
                "Max (M)",
                min_value=0.0,
                step=1.0,
                key=max_key,
                on_change=_force_custom_attachment,
                disabled=attachment_range_choice == "Any",
            )

    if not comparables:
        if revenue_tolerance > 0:
            st.info("No comparable submissions found. Try widening the revenue range or date window.")
        else:
            st.info("No comparable submissions found.")
        return

    # === COMPARABLES TABLE ===
    _render_comparables_table(comparables, submission_id, current_flags, layer_filter)

    # === DETAIL COMPARISON ===
    selected_id = st.session_state.get(f"bench_selected_{submission_id}")
    if selected_id:
        selected = next((c for c in comparables if c["id"] == selected_id), None)
        if selected:
            _render_comparison_detail(submission_id, selected, get_conn, current_profile)


def _render_comparables_table(
    comparables: list[dict],
    submission_id: str,
    current_flags: dict,
    layer_filter: str,
) -> None:
    """Render the comparables table with selection."""

    # Build dataframe
    df = pd.DataFrame(comparables)

    # Format columns - convert Decimal to float for formatting
    def _company_label(name: str, max_len: int = 24) -> str:
        if not name:
            return "Submission"
        cleaned = re.sub(r"\\s+", " ", name.strip())
        cleaned = re.sub(r"[^A-Za-z0-9\\-_. ]", "", cleaned)
        cleaned = cleaned or "Submission"
        if len(cleaned) > max_len and max_len > 3:
            return f"{cleaned[:max_len - 3]}..."
        return cleaned

    df["company_link"] = df.apply(
        lambda r: (
            f"/submissions?selected_submission_id={r['id']}"
            f"&label={_company_label(r.get('applicant_name') or '')}"
            f"&short={r['id'][:8]}"
        ),
        axis=1,
    )
    df["revenue_fmt"] = df["annual_revenue"].apply(
        lambda x: f"${float(x)/1e6:.0f}M" if x else "—"
    )
    df["industry"] = df["naics_title"].apply(lambda x: x or "—")
    df["date_label"] = df["benchmark_date"].apply(
        lambda d: d.strftime("%b %d, %y") if d else "—"
    )
    df["carrier_fmt"] = df["carrier"].apply(lambda x: x or "—")
    df["underlying_fmt"] = df["underlying_carrier"].apply(lambda x: x or "—")
    df["limit_fmt"] = df["limit"].apply(
        lambda x: f"${float(x)/1e6:.0f}M" if x else "—"
    )
    def _fmt_sir(val):
        if not val:
            return "—"
        amt = float(val)
        if amt >= 1_000_000:
            return f"${amt/1e6:.0f}M"
        if amt >= 1_000:
            return f"${amt/1e3:.0f}K"
        return f"${amt:,.0f}"

    df["sir_fmt"] = df["retention"].apply(_fmt_sir)
    df["att_fmt"] = df["attachment_point"].apply(
        lambda x: f"${float(x)/1e6:.0f}M" if x else "—"
    )
    df["rate_fmt"] = df["rate_per_mil"].apply(
        lambda x: f"${float(x):,.0f}" if x else "—"
    )
    df["stage_fmt"] = df.apply(
        lambda r: _format_stage(r["submission_status"], r["submission_outcome"]),
        axis=1,
    )
    df["loss_signal"] = df.apply(
        lambda r: _loss_signal(r.get("claims_count", 0), r.get("claims_paid", 0), r.get("is_bound", False)),
        axis=1,
    )
    df["controls_label"] = df.apply(
        lambda r: _controls_table_label(
            current_flags,
            _parse_nist_flags(r.get("nist_controls")),
            r.get("controls_similarity"),
        ),
        axis=1,
    )
    df["sim_fmt"] = df["similarity_score"].apply(
        lambda x: f"{int(float(x) * 100)}%" if x else "—"
    )

    # Display columns
    if layer_filter == "excess":
        base_cols = [
            "company_link", "date_label", "revenue_fmt", "industry",
            "carrier_fmt", "limit_fmt", "att_fmt", "sir_fmt", "rate_fmt", "stage_fmt",
            "loss_signal", "controls_label", "sim_fmt",
        ]
        base_labels = [
            "Company", "Date", "Revenue", "Industry",
            "Carrier", "Limit", "Att", "SIR", "RPM", "Stage",
            "Claims", "Controls", "Sim",
        ]
    else:
        base_cols = [
            "company_link", "date_label", "revenue_fmt", "industry",
            "underlying_fmt", "limit_fmt", "sir_fmt", "rate_fmt", "stage_fmt",
            "loss_signal", "controls_label", "sim_fmt",
        ]
        base_labels = [
            "Company", "Date", "Revenue", "Industry",
            "Primary", "Limit", "SIR", "RPM", "Stage",
            "Claims", "Controls", "Sim",
        ]

    display_df = df[base_cols].copy()
    display_df.columns = base_labels

    # Selection via dataframe
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        height=min(len(comparables) * 35 + 38, 400),
        column_config={
            "Company": st.column_config.LinkColumn(
                "Company",
                help="Open submission",
                display_text=r"label=([^&]+)",
                width="small",
            ),
            "Controls": st.column_config.TextColumn(
                "Controls",
                help="▲/▼ compares the comparable to the current submission. % is controls similarity.",
            ),
            "Date": st.column_config.TextColumn(
                "Date",
                help="Effective date when available; otherwise received date.",
                width="small",
            ),
            "Industry": st.column_config.TextColumn(
                "Industry",
                width=144,
            ),
            "Claims": st.column_config.TextColumn(
                "Claims",
                help="Clean: no claims. Activity: claims with $0 paid. Low: < $100K. Moderate: $100K–$1M. Severe: > $1M.",
            ),
            "Sim": st.column_config.TextColumn(
                "Sim",
                help="Similarity of operations/exposure (may be blank when fallback comps are used).",
            ),
            "Stage": st.column_config.TextColumn(
                "Stage",
                help="Collapsed status/outcome stage.",
                width="small",
            ),
            "Layer": st.column_config.TextColumn(
                "Layer",
                help="Carrier on the selected layer within the tower.",
            ),
            "Primary": st.column_config.TextColumn(
                "Primary",
                help="Primary carrier (attachment 0) when available.",
            ),
        },
    )

    # Selection dropdown for detail view
    options = {c["id"]: f"{c['applicant_name']} ({c['id'][:8]})" for c in comparables}
    selected = st.selectbox(
        "Select for detail comparison",
        options=[None] + list(options.keys()),
        format_func=lambda x: "— Select a comparable —" if x is None else options.get(x, x),
        key=f"bench_select_{submission_id}",
    )

    if selected:
        st.session_state[f"bench_selected_{submission_id}"] = selected


def _render_comparison_detail(
    submission_id: str,
    comparable: dict,
    get_conn,
    current_profile: dict | None = None,
) -> None:
    """Render side-by-side comparison of current vs selected comparable."""
    from utils.policy_summary import render_summary_card

    current = current_profile or get_current_submission_profile(submission_id, get_conn)
    current_tower = get_best_tower(submission_id, get_conn)
    comparable_tower = get_best_tower(comparable["id"], get_conn)

    tower_layer = _select_tower_layer(current_tower.get("tower_json", []))
    tower_limit = tower_layer.get("limit") if tower_layer else None
    tower_premium = tower_layer.get("premium") if tower_layer else None
    if tower_premium is None:
        tower_premium = current_tower.get("tower_premium")
    tower_retention = current_tower.get("primary_retention") or tower_layer.get("retention") if tower_layer else None
    if tower_limit and tower_premium:
        tower_rpm = float(tower_premium) / (float(tower_limit) / 1_000_000)
    else:
        tower_rpm = None

    comp_layer = _select_tower_layer(comparable_tower.get("tower_json", []))
    comp_limit = comp_layer.get("limit") if comp_layer else None
    comp_premium = comp_layer.get("premium") if comp_layer else None
    if comp_premium is None:
        comp_premium = comparable_tower.get("tower_premium")
    comp_retention = comparable_tower.get("primary_retention") or comp_layer.get("retention") if comp_layer else None
    if comp_limit and comp_premium:
        comp_rpm = float(comp_premium) / (float(comp_limit) / 1_000_000)
    else:
        comp_rpm = None

    st.markdown(f"#### Compare: Current vs {comparable['applicant_name']}")

    current_date = current.get("effective_date") or current.get("date_received")
    current_date_label = (
        f"{current_date.strftime('%b %d, %y')} · "
        f"{'Eff' if current.get('effective_date') else 'Rec'}"
        if current_date and hasattr(current_date, "strftime")
        else "—"
    )
    cur_icon, cur_text = _status_icon_text(
        current.get("submission_status"),
        current.get("submission_outcome"),
    )
    current_is_bound = current.get("submission_outcome") == "bound"
    cur_loss_signal = _loss_signal(
        current.get("claims_count", 0),
        current.get("claims_paid", 0),
        current_is_bound,
    )

    comp_date = comparable.get("benchmark_date")
    comp_date_label = (
        f"{comp_date.strftime('%b %d, %y')} · "
        f"{'Eff' if comparable.get('benchmark_date_type') == 'eff' else 'Rec'}"
        if comp_date and hasattr(comp_date, "strftime")
        else "—"
    )
    outcome_icon, outcome_text = _status_icon_text(
        comparable.get("submission_status"),
        comparable.get("submission_outcome"),
    )
    comp_loss_signal = _loss_signal(
        comparable.get("claims_count", 0),
        comparable.get("claims_paid", 0),
        comparable.get("is_bound", False),
    )

    col1, col2 = st.columns(2)

    with col1:
        current_name = current.get("applicant_name") or "Current Submission"
        st.markdown(f"**{current_name} (Current Sub)**")
        with st.container(border=True):
            render_summary_card(
                status_icon=cur_icon,
                status_text=cur_text,
                date_label=current_date_label,
                industry_tags=current.get("industry_tags"),
                limit=tower_limit or current.get("limit"),
                retention=tower_retention or current.get("retention"),
                premium=tower_premium or current.get("premium"),
                rate_per_mil=tower_rpm or current.get("rate_per_mil"),
                loss_signal=cur_loss_signal,
                claims_count=current.get("claims_count") if current_is_bound else None,
                claims_paid=current.get("claims_paid") if current_is_bound else None,
                description=None,
                show_tags=False,
                show_description=False,
                loss_claims_inline=True,
            )
        tags = current.get("industry_tags") or []
        if tags:
            st.markdown(" ".join([f"`{tag}`" for tag in tags]))
        if current.get("ops_summary"):
            st.caption(current["ops_summary"])

    with col2:
        sim_pct = int(float(comparable['similarity_score'])*100)
        st.markdown(f"**{comparable['applicant_name']}** ({sim_pct}% similar)")
        with st.container(border=True):
            render_summary_card(
                status_icon=outcome_icon,
                status_text=outcome_text,
                date_label=comp_date_label,
                industry_tags=comparable.get("industry_tags"),
                limit=comp_limit or comparable.get("limit"),
                retention=comp_retention or comparable.get("retention"),
                premium=comp_premium or comparable.get("premium"),
                rate_per_mil=comp_rpm or comparable.get("rate_per_mil"),
                loss_signal=comp_loss_signal,
                claims_count=comparable.get("claims_count") if comparable.get("is_bound") else None,
                claims_paid=comparable.get("claims_paid") if comparable.get("is_bound") else None,
                description=None,
                show_tags=False,
                show_description=False,
                loss_claims_inline=True,
            )
        tags = comparable.get("industry_tags") or []
        if tags:
            st.markdown(" ".join([f"`{tag}`" for tag in tags]))
        if comparable.get("ops_summary"):
            st.caption(comparable["ops_summary"])

    current_tower_rows = _build_tower_summary(
        current_tower.get("tower_json", []),
        current_tower.get("tower_premium"),
    )
    comparable_tower_rows = _build_tower_summary(
        comparable_tower.get("tower_json", []),
        comparable_tower.get("tower_premium"),
    )

    if current_tower_rows or comparable_tower_rows:
        st.markdown("**Tower summary**")
        tower_cols = st.columns(2)
        with tower_cols[0]:
            st.caption("Current tower")
            if current_tower_rows:
                st.dataframe(
                    pd.DataFrame(current_tower_rows),
                    use_container_width=True,
                    hide_index=True,
                    height=min(len(current_tower_rows) * 35 + 38, 220),
                )
            else:
                st.caption("No tower data")
        with tower_cols[1]:
            st.caption(f"{comparable['applicant_name']} tower")
            if comparable_tower_rows:
                st.dataframe(
                    pd.DataFrame(comparable_tower_rows),
                    use_container_width=True,
                    hide_index=True,
                    height=min(len(comparable_tower_rows) * 35 + 38, 220),
                )
            else:
                st.caption("No tower data")

    # === CONTROLS COMPARISON ===
    controls = get_controls_comparison(submission_id, comparable["id"], get_conn)
    current_flags = _parse_nist_flags(current.get("nist_controls")) if current else {}
    comparable_flags = _parse_nist_flags(comparable.get("nist_controls"))
    controls_label = _controls_summary(current_flags, comparable_flags)
    similarity_pct = int(controls["similarity"] * 100) if controls.get("similarity") is not None else None
    controls_parts = []
    if controls_label != "—":
        controls_parts.append(controls_label)
    if similarity_pct is not None:
        if controls_label == "—":
            controls_parts.append(f"{similarity_pct}% similarity (no flags)")
        else:
            controls_parts.append(f"{similarity_pct}% similarity")
    if controls_parts:
        st.markdown(f"**Controls:** {' · '.join(controls_parts)}")
    if controls.get("current_summary") or controls.get("comparable_summary"):
        with st.expander("Controls details"):
            flag_rows = []
            for key, label in {
                "identify": "Identify",
                "protect": "Protect",
                "detect": "Detect",
                "respond": "Respond",
                "recover": "Recover",
            }.items():
                flag_rows.append({
                    "Control": label,
                    "Current": _normalize_flag_value(current_flags.get(key)),
                    comparable['applicant_name']: _normalize_flag_value(comparable_flags.get(key)),
                })
            st.dataframe(
                pd.DataFrame(flag_rows),
                use_container_width=True,
                hide_index=True,
                height=min(len(flag_rows) * 35 + 38, 240),
            )
            st.caption("Narratives are generated separately and may not match the flags above.")
            c1, c2 = st.columns(2)
            with c1:
                st.markdown("**Current**")
                current_summary = controls.get("current_summary") or "No controls data"
                st.caption(current_summary)
            with c2:
                st.markdown(f"**{comparable['applicant_name']}**")
                comparable_summary = controls.get("comparable_summary") or "No controls data"
                st.caption(comparable_summary)


def render_benchmarking_panel(submission_id: str, get_conn) -> None:
    """
    Render the benchmarking panel with filters, metrics, and comparables table.

    Args:
        submission_id: Current submission UUID
        get_conn: Database connection function
    """
    if not submission_id:
        st.info("Select a submission to see benchmarking data")
        return

    _benchmarking_fragment(submission_id, get_conn)
