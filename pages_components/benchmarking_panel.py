"""
Benchmarking Panel Component

Shows comparable submissions with pricing, outcome, and performance data.
Helps underwriters make pricing decisions based on similar risks.
"""

import streamlit as st
import pandas as pd
from typing import Optional

from core.benchmarking import (
    get_comparables,
    get_benchmark_metrics,
    get_current_submission_profile,
    get_controls_comparison,
    format_outcome,
)


@st.fragment
def _benchmarking_fragment(submission_id: str, get_conn) -> None:
    """Fragment for benchmarking panel to prevent full page reruns."""

    # Revenue size filter
    revenue_options = {
        "±25%": 0.25,
        "±50%": 0.50,
        "±100%": 1.0,
        "Any size": 0,
    }
    revenue_choice = st.selectbox(
        "Revenue range",
        options=list(revenue_options.keys()),
        index=1,  # Default to ±50%
        key=f"bench_rev_{submission_id}",
    )
    revenue_tolerance = revenue_options[revenue_choice]

    # === FETCH COMPARABLES ===
    # Compare by operations (exposure) + revenue size
    comparables = get_comparables(
        submission_id,
        get_conn,
        similarity_mode="operations",
        revenue_tolerance=revenue_tolerance,
        same_industry=False,
        outcome_filter=None,
        limit=15,
    )

    if not comparables:
        if revenue_tolerance > 0:
            st.info("No comparable submissions found. Try widening the revenue range.")
        else:
            st.info("No comparable submissions found.")
        return

    # === METRICS CARDS ===
    metrics = get_benchmark_metrics(comparables)

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Comparables", metrics["count"])

    with col2:
        if metrics["avg_rate_per_mil"]:
            st.metric("Avg Rate/Mil", f"${float(metrics['avg_rate_per_mil']):,.0f}")
        else:
            st.metric("Avg Rate/Mil", "—")

    with col3:
        if metrics["avg_loss_ratio"] is not None:
            st.metric("Avg Loss Ratio", f"{int(float(metrics['avg_loss_ratio']) * 100)}%")
        else:
            st.metric("Avg Loss Ratio", "—")

    # Rate range hint
    if metrics["rate_range"]:
        low, high = metrics["rate_range"]
        st.caption(f"Rate range: \\${float(low):,.0f} – \\${float(high):,.0f} per mil (bound policies)")

    st.divider()

    # === COMPARABLES TABLE ===
    _render_comparables_table(comparables, submission_id)

    # === DETAIL COMPARISON ===
    selected_id = st.session_state.get(f"bench_selected_{submission_id}")
    if selected_id:
        selected = next((c for c in comparables if c["id"] == selected_id), None)
        if selected:
            _render_comparison_detail(submission_id, selected, get_conn)


def _render_comparables_table(comparables: list[dict], submission_id: str) -> None:
    """Render the comparables table with selection."""

    # Build dataframe
    df = pd.DataFrame(comparables)

    # Format columns - convert Decimal to float for formatting
    df["id_short"] = df["id"].str[:8]
    df["revenue_fmt"] = df["annual_revenue"].apply(
        lambda x: f"${float(x)/1e6:.0f}M" if x else "—"
    )
    df["industry"] = df["naics_title"].apply(
        lambda x: x[:20] + "..." if x and len(x) > 20 else (x or "—")
    )
    df["layer"] = df.apply(
        lambda r: f"Exc ${float(r['attachment_point'])/1e6:.0f}M" if r["layer_type"] == "excess" and r["attachment_point"]
        else ("Pri" if r["layer_type"] == "primary" else "—"),
        axis=1,
    )
    df["limit_fmt"] = df["limit"].apply(
        lambda x: f"${float(x)/1e6:.0f}M" if x else "—"
    )
    df["rate_fmt"] = df["rate_per_mil"].apply(
        lambda x: f"${float(x):,.0f}" if x else "—"
    )
    df["outcome_fmt"] = df.apply(
        lambda r: format_outcome(r["submission_status"], r["submission_outcome"]),
        axis=1,
    )
    df["loss_fmt"] = df["loss_ratio"].apply(
        lambda x: f"{int(float(x) * 100)}%" if x is not None else "—"
    )
    df["sim_fmt"] = df["similarity_score"].apply(
        lambda x: f"{int(float(x) * 100)}%" if x else "—"
    )

    # Display columns
    display_df = df[[
        "id_short", "applicant_name", "revenue_fmt", "industry",
        "layer", "limit_fmt", "rate_fmt", "outcome_fmt", "loss_fmt", "sim_fmt"
    ]].copy()

    display_df.columns = [
        "ID", "Company", "Revenue", "Industry",
        "Layer", "Limit", "RPM", "Outcome", "Loss%", "Sim"
    ]

    # Selection via dataframe
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        height=min(len(comparables) * 35 + 38, 400),
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
) -> None:
    """Render side-by-side comparison of current vs selected comparable."""
    from utils.policy_summary import render_summary_card

    current = get_current_submission_profile(submission_id, get_conn)

    st.markdown(f"#### Compare: Current vs {comparable['applicant_name']}")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("**Current Submission**")
        with st.container(border=True):
            render_summary_card(
                status_icon="📋",
                status_text=current.get('applicant_name', '—'),
                limit=current.get("limit"),
                retention=current.get("retention"),
                premium=current.get("premium"),
                rate_per_mil=current.get("rate_per_mil"),
                layer_type=current.get("layer_type"),
                description=current.get("ops_summary"),
            )

    with col2:
        sim_pct = int(float(comparable['similarity_score'])*100)
        st.markdown(f"**{comparable['applicant_name']}** ({sim_pct}% similar)")
        with st.container(border=True):
            outcome = format_outcome(comparable["submission_status"], comparable["submission_outcome"])
            # Map outcome to icon
            outcome_icon = "✅" if comparable.get("submission_outcome") == "bound" else "⏳"
            if comparable.get("submission_status") == "declined":
                outcome_icon = "🚫"
            elif comparable.get("submission_outcome") == "lost":
                outcome_icon = "❌"

            render_summary_card(
                status_icon=outcome_icon,
                status_text=outcome.replace(outcome_icon, "").strip(),
                limit=comparable.get("limit"),
                retention=comparable.get("retention"),
                premium=comparable.get("premium"),
                rate_per_mil=comparable.get("rate_per_mil"),
                layer_type=comparable.get("layer_type"),
                claims_count=comparable.get("claims_count") if comparable.get("is_bound") else None,
                claims_paid=comparable.get("claims_paid") if comparable.get("is_bound") else None,
                loss_ratio=comparable.get("loss_ratio") if comparable.get("is_bound") else None,
                description=comparable.get("ops_summary"),
            )

    # === CONTROLS COMPARISON ===
    controls = get_controls_comparison(submission_id, comparable["id"], get_conn)
    if controls.get("similarity") is not None:
        st.markdown(f"**Controls:** {controls['comparison']} ({int(controls['similarity']*100)}% match)")
        with st.expander("View controls details"):
            c1, c2 = st.columns(2)
            with c1:
                st.caption("**Current**")
                st.caption(controls.get("current_summary") or "No controls data")
            with c2:
                st.caption(f"**{comparable['applicant_name']}**")
                st.caption(controls.get("comparable_summary") or "No controls data")


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
