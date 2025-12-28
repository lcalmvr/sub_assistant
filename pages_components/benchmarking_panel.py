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
    format_outcome,
)


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

    # === FILTER CONTROLS ===
    with st.container():
        col1, col2, col3, col4 = st.columns(4)

        with col1:
            similarity_mode = st.selectbox(
                "Similarity",
                options=["operations", "controls", "combined"],
                format_func=lambda x: {
                    "operations": "Business Operations",
                    "controls": "Controls (NIST)",
                    "combined": "Operations & Controls",
                }.get(x, x),
                key=f"bench_sim_{submission_id}",
            )

        with col2:
            revenue_match = st.checkbox(
                "Revenue ±25%",
                value=True,
                key=f"bench_rev_{submission_id}",
            )

        with col3:
            same_industry = st.checkbox(
                "Same Industry",
                value=False,
                key=f"bench_ind_{submission_id}",
            )

        with col4:
            outcome_filter = st.selectbox(
                "Outcome",
                options=[None, "bound", "lost", "declined"],
                format_func=lambda x: {
                    None: "All",
                    "bound": "Bound Only",
                    "lost": "Lost Only",
                    "declined": "Declined Only",
                }.get(x, x),
                key=f"bench_out_{submission_id}",
            )

    # === FETCH COMPARABLES ===
    comparables = get_comparables(
        submission_id,
        get_conn,
        similarity_mode=similarity_mode,
        revenue_tolerance=0.25 if revenue_match else 0,
        same_industry=same_industry,
        outcome_filter=outcome_filter,
        limit=15,
    )

    if not comparables:
        st.info("No comparable submissions found with current filters. Try adjusting the filters.")
        return

    # === METRICS CARDS ===
    metrics = get_benchmark_metrics(comparables)

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Comparables", metrics["count"])

    with col2:
        if metrics["bind_rate"] is not None:
            st.metric("Bind Rate", f"{int(float(metrics['bind_rate']) * 100)}%")
        else:
            st.metric("Bind Rate", "—")

    with col3:
        if metrics["avg_rate_per_mil"]:
            st.metric("Avg Rate/Mil", f"${float(metrics['avg_rate_per_mil']):,.0f}")
        else:
            st.metric("Avg Rate/Mil", "—")

    with col4:
        if metrics["avg_loss_ratio"] is not None:
            st.metric("Avg Loss Ratio", f"{int(float(metrics['avg_loss_ratio']) * 100)}%")
        else:
            st.metric("Avg Loss Ratio", "—")

    # Rate range hint
    if metrics["rate_range"]:
        low, high = metrics["rate_range"]
        st.caption(f"Rate range: ${float(low):,.0f} - ${float(high):,.0f} per mil (bound policies)")

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
        lambda x: f"${float(x)/1e6:.1f}M" if x else "—"
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
        lambda x: f"${float(x)/1e6:.1f}M" if x else "—"
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
        "Layer", "Limit", "Rate/Mil", "Outcome", "Loss%", "Sim"
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

    current = get_current_submission_profile(submission_id, get_conn)

    st.markdown(f"### Compare: Current vs {comparable['applicant_name']}")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("**Current Submission**")
        with st.container(border=True):
            st.markdown(f"**{current.get('applicant_name', '—')}**")

            if current.get("annual_revenue"):
                st.markdown(f"Revenue: ${float(current['annual_revenue'])/1e6:.1f}M")
            if current.get("naics_title"):
                st.markdown(f"Industry: {current['naics_title']}")

            st.divider()

            if current.get("limit"):
                layer = "Excess" if current.get("layer_type") == "excess" else "Primary"
                st.markdown(f"**{layer} Layer**")
                st.markdown(f"Limit: ${float(current['limit'])/1e6:.1f}M")
                if current.get("retention"):
                    st.markdown(f"Retention: ${float(current['retention']):,.0f}")
                if current.get("premium"):
                    st.markdown(f"Premium: ${float(current['premium']):,.0f}")
                if current.get("rate_per_mil"):
                    st.markdown(f"Rate/Mil: ${float(current['rate_per_mil']):,.0f}")
            else:
                st.caption("No pricing entered yet")

    with col2:
        st.markdown(f"**{comparable['applicant_name']}** ({int(float(comparable['similarity_score'])*100)}% similar)")
        with st.container(border=True):
            outcome = format_outcome(
                comparable["submission_status"],
                comparable["submission_outcome"]
            )
            st.markdown(f"**{outcome}**")

            if comparable.get("annual_revenue"):
                st.markdown(f"Revenue: ${float(comparable['annual_revenue'])/1e6:.1f}M")
            if comparable.get("naics_title"):
                st.markdown(f"Industry: {comparable['naics_title']}")

            st.divider()

            if comparable.get("limit"):
                layer = "Excess" if comparable.get("layer_type") == "excess" else "Primary"
                attach = f" xs ${float(comparable['attachment_point'])/1e6:.0f}M" if comparable.get("attachment_point") else ""
                st.markdown(f"**{layer} Layer{attach}**")
                st.markdown(f"Limit: ${float(comparable['limit'])/1e6:.1f}M")
                if comparable.get("retention"):
                    st.markdown(f"Retention: ${float(comparable['retention']):,.0f}")
                if comparable.get("premium"):
                    st.markdown(f"Premium: ${float(comparable['premium']):,.0f}")
                if comparable.get("rate_per_mil"):
                    st.markdown(f"Rate/Mil: ${float(comparable['rate_per_mil']):,.0f}")

            # Performance (if bound)
            if comparable.get("is_bound"):
                st.divider()
                st.markdown("**Performance**")
                st.markdown(f"Claims: {comparable['claims_count']}")
                st.markdown(f"Paid: ${float(comparable['claims_paid']):,.0f}")
                if comparable.get("loss_ratio") is not None:
                    st.markdown(f"Loss Ratio: {int(float(comparable['loss_ratio'])*100)}%")

            # Lost reason
            if comparable.get("submission_outcome") == "lost" and comparable.get("outcome_reason"):
                st.divider()
                st.caption(f"Lost reason: {comparable['outcome_reason']}")
