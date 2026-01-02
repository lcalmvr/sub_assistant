"""
Show Prior Panel Component

Reusable component to display prior submission context.
Used across tabs to show historical data without copying/inheriting.
"""

import streamlit as st
from typing import Optional


def render_prior_context_banner(submission_id: str) -> bool:
    """
    Render a compact banner showing prior submission exists.

    Returns True if prior exists, False otherwise.
    Use this at the top of tabs to indicate historical context is available.
    """
    from core.prior_submission import get_prior_submission_summary

    prior = get_prior_submission_summary(submission_id)
    if not prior:
        return False

    # Determine label based on outcome
    if prior["was_bound"]:
        label = "Renewal"
        icon = "🔄"
    elif prior["outcome"] == "Lost":
        label = "Remarket"
        icon = "🔁"
    else:
        label = "Prior"
        icon = "📋"

    st.caption(f"{icon} {label} of {prior['effective_date']} ({prior['outcome']})")
    return True


def render_prior_terms_inline(submission_id: str):
    """
    Render prior terms as inline reference (for Rating/Quote tabs).

    Shows: Limit / Retention @ Premium
    """
    from core.prior_submission import get_prior_submission_summary

    prior = get_prior_submission_summary(submission_id)
    if not prior or not prior["was_bound"]:
        return

    st.markdown(
        f"**Prior:** {prior['limit']} / {prior['retention']} @ {prior['premium']}",
        help=f"From {prior['effective_date']} policy"
    )


def render_prior_summary_card(submission_id: str, expanded: bool = False):
    """
    Render a collapsible card with prior submission summary.

    Full summary with outcome, terms, and link to prior.
    """
    from core.prior_submission import get_prior_submission_summary

    prior = get_prior_submission_summary(submission_id)
    if not prior:
        return

    # Build title
    if prior["was_bound"]:
        title = f"🔄 Prior Policy ({prior['effective_date']})"
    elif prior["outcome"] == "Lost":
        title = f"🔁 Prior Quote - Lost ({prior['effective_date']})"
    else:
        title = f"📋 Prior Submission ({prior['effective_date']})"

    with st.expander(title, expanded=expanded):
        col1, col2 = st.columns(2)

        with col1:
            st.markdown("**Outcome**")
            outcome_text = prior["outcome"]
            if prior["outcome_reason"]:
                outcome_text += f" - {prior['outcome_reason']}"
            st.caption(outcome_text)

            if prior["was_bound"]:
                st.markdown("**Terms**")
                st.caption(f"Limit: {prior['limit']}")
                st.caption(f"Retention: {prior['retention']}")
                st.caption(f"Premium: {prior['premium']}")
                if prior["policy_form"]:
                    st.caption(f"Form: {prior['policy_form'].title()}")

        with col2:
            st.markdown("**Exposure**")
            st.caption(f"Revenue: {prior['revenue']}")
            if prior["industry"]:
                st.caption(f"Industry: {prior['industry']}")

        # Link to prior
        st.markdown(f"[Open prior submission](?selected_submission_id={prior['id']})")


def render_yoy_changes(submission_id: str, compact: bool = False):
    """
    Render year-over-year changes between current and prior.

    Shows change direction with arrows and percentages.
    """
    from core.prior_submission import calculate_yoy_changes

    changes_data = calculate_yoy_changes(submission_id)
    if not changes_data:
        return

    changes = changes_data["changes"]

    if compact:
        # Single line summary of key changes
        parts = []
        if "revenue" in changes and changes["revenue"]["pct"]:
            parts.append(f"Rev {changes['revenue']['pct']}")
        if "premium" in changes and changes["premium"]["pct"]:
            parts.append(f"Prem {changes['premium']['pct']}")
        if parts:
            st.caption(f"YoY: {' · '.join(parts)}")
        return

    # Full change table
    title = "📊 Year-over-Year Changes"
    if changes_data["prior_was_bound"]:
        title += " (vs Prior Policy)"
    else:
        title += " (vs Prior Quote)"

    with st.expander(title, expanded=False):
        # Build rows
        rows = []

        def direction_icon(direction):
            if direction == "up":
                return "↑"
            elif direction == "down":
                return "↓"
            return "→"

        for key, label in [("revenue", "Revenue")]:
            if key in changes:
                c = changes[key]
                rows.append({
                    "Metric": label,
                    "Prior": c["prior"],
                    "Current": c["current"],
                    "Change": f"{direction_icon(c['direction'])} {c['change']}" if c["change"] != "—" else "—",
                    "%": c["pct"] or "",
                })

        # Only show bound-specific metrics if prior was bound
        if changes_data["prior_was_bound"]:
            for key, label in [("premium", "Premium"), ("limit", "Limit"), ("retention", "Retention")]:
                if key in changes:
                    c = changes[key]
                    rows.append({
                        "Metric": label,
                        "Prior": c["prior"],
                        "Current": c["current"],
                        "Change": f"{direction_icon(c['direction'])} {c['change']}" if c["change"] != "—" else "—",
                        "%": c["pct"] or "",
                    })

        if rows:
            import pandas as pd
            df = pd.DataFrame(rows)
            st.dataframe(
                df,
                hide_index=True,
                use_container_width=True,
                column_config={
                    "Metric": st.column_config.TextColumn(width="small"),
                    "Prior": st.column_config.TextColumn(width="small"),
                    "Current": st.column_config.TextColumn(width="small"),
                    "Change": st.column_config.TextColumn(width="small"),
                    "%": st.column_config.TextColumn(width="small"),
                },
            )

        # Link to prior
        eff_date = changes_data.get("prior_effective")
        eff_str = eff_date.strftime("%m/%d/%Y") if eff_date and hasattr(eff_date, 'strftime') else str(eff_date or "")
        st.caption(f"Compared to: [{eff_str}](?selected_submission_id={changes_data['prior_id']})")


def render_prior_rating_context(submission_id: str):
    """
    Render prior context specifically for the Rating tab.

    Shows prior premium breakdown and rate info.
    """
    from core.prior_submission import get_prior_submission

    prior = get_prior_submission(submission_id)
    if not prior or not prior["was_bound"]:
        return

    st.markdown("##### Prior Year Rating")

    col1, col2, col3 = st.columns(3)

    premium = prior["sold_premium"]
    revenue = prior["annual_revenue"]

    with col1:
        premium_str = f"${premium:,.0f}" if premium else "—"
        st.metric("Prior Premium", premium_str)

    with col2:
        # Calculate rate if we have revenue
        if premium and revenue and revenue > 0:
            rate = (premium / revenue) * 100
            st.metric("Prior Rate", f"{rate:.2f}%")
        else:
            st.metric("Prior Rate", "—")

    with col3:
        revenue_str = f"${revenue/1_000_000:.1f}M" if revenue and revenue >= 1_000_000 else f"${revenue:,.0f}" if revenue else "—"
        st.metric("Prior Revenue", revenue_str)

    # Show tower structure if available
    tower_json = prior.get("tower_json") or []
    if tower_json:
        st.caption("**Prior Tower Structure:**")
        for i, layer in enumerate(tower_json):
            limit = layer.get("limit", 0)
            premium = layer.get("premium", 0)
            carrier = layer.get("carrier_name", "TBD")
            attachment = layer.get("attachment_point", 0)

            if i == 0:
                st.caption(f"  Primary: ${limit:,.0f} @ ${premium:,.0f} ({carrier})")
            else:
                st.caption(f"  Excess {i}: ${limit:,.0f} xs ${attachment:,.0f} @ ${premium:,.0f} ({carrier})")


def render_prior_quote_context(submission_id: str):
    """
    Render prior context specifically for the Quote tab.

    Shows what was quoted/bound previously.
    """
    from core.prior_submission import get_prior_submission_summary

    prior = get_prior_submission_summary(submission_id)
    if not prior:
        return

    if prior["was_bound"]:
        label = "Prior Bound Terms"
        icon = "✅"
    else:
        label = "Prior Quoted Terms"
        icon = "📝"

    with st.container(border=True):
        st.markdown(f"**{icon} {label}** ({prior['effective_date']})")

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.caption("Limit")
            st.markdown(f"**{prior['limit']}**")

        with col2:
            st.caption("Retention")
            st.markdown(f"**{prior['retention']}**")

        with col3:
            st.caption("Premium")
            st.markdown(f"**{prior['premium']}**")

        with col4:
            st.caption("Outcome")
            outcome = prior["outcome"]
            if prior["outcome_reason"]:
                outcome += f"\n({prior['outcome_reason']})"
            st.markdown(f"**{outcome}**")
