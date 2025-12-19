"""
Stats Page Module
=================
Statistics and analytics functionality for the main app
"""

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def render():
    """Main render function for the stats page"""
    st.title("📊 Submission Statistics")

    # Import and render the status summary that was in the sidebar
    from pages_components.submission_status_panel import render_status_summary
    render_status_summary()

    # Renewal Reports Section
    st.divider()
    from pages_components.renewal_panel import (
        render_upcoming_renewals_report,
        render_renewals_not_received_report,
    )

    tab_upcoming, tab_not_received, tab_metrics = st.tabs([
        "📅 Upcoming Renewals",
        "❌ Not Received",
        "📈 Retention Metrics"
    ])

    with tab_upcoming:
        render_upcoming_renewals_report()

    with tab_not_received:
        render_renewals_not_received_report()

    with tab_metrics:
        _render_retention_metrics()


def _render_retention_metrics():
    """Render renewal retention metrics and rate change analysis."""
    from sqlalchemy import text
    from core.db import get_conn

    st.subheader("Retention Metrics")

    try:
        with get_conn() as conn:
            # Get retention metrics by month
            result = conn.execute(text("""
                SELECT
                    DATE_TRUNC('month', s.date_received) as month,
                    COUNT(*) FILTER (WHERE s.submission_status NOT IN ('renewal_expected')) as renewals_received,
                    COUNT(*) FILTER (WHERE s.submission_outcome = 'bound') as renewals_bound,
                    COUNT(*) FILTER (WHERE s.submission_outcome = 'lost') as renewals_lost,
                    COUNT(*) FILTER (WHERE s.submission_status = 'renewal_not_received') as renewals_not_received
                FROM submissions s
                WHERE s.renewal_type = 'renewal'
                AND s.date_received IS NOT NULL
                GROUP BY DATE_TRUNC('month', s.date_received)
                ORDER BY month DESC
                LIMIT 12
            """))

            rows = result.fetchall()

            if not rows:
                st.info("No renewal data available yet.")
                return

            # Summary metrics
            total_received = sum(row[1] or 0 for row in rows)
            total_bound = sum(row[2] or 0 for row in rows)
            total_lost = sum(row[3] or 0 for row in rows)
            total_not_received = sum(row[4] or 0 for row in rows)

            retention_rate = (total_bound / total_received * 100) if total_received > 0 else 0

            col1, col2, col3, col4 = st.columns(4)

            with col1:
                st.metric("Renewals Received", total_received)
            with col2:
                st.metric("Renewals Bound", total_bound)
            with col3:
                st.metric("Renewals Lost", total_lost)
            with col4:
                st.metric("Retention Rate", f"{retention_rate:.1f}%")

            st.divider()

            # Monthly breakdown
            st.markdown("**Monthly Breakdown**")

            for row in rows:
                month, received, bound, lost, not_received = row
                if month:
                    month_str = month.strftime("%B %Y")
                    rate = (bound / received * 100) if received and received > 0 else 0

                    col1, col2, col3, col4, col5 = st.columns([2, 1, 1, 1, 1])

                    with col1:
                        st.markdown(f"**{month_str}**")
                    with col2:
                        st.caption(f"Received: {received or 0}")
                    with col3:
                        st.caption(f"Bound: {bound or 0}")
                    with col4:
                        st.caption(f"Lost: {lost or 0}")
                    with col5:
                        st.caption(f"Rate: {rate:.0f}%")

            # Rate change analysis
            st.divider()
            st.markdown("**Rate Change Analysis**")

            rate_result = conn.execute(text("""
                SELECT
                    s.id,
                    s.applicant_name,
                    bound_opt.sold_premium as current_premium,
                    prior_opt.sold_premium as prior_premium
                FROM submissions s
                JOIN insurance_towers bound_opt ON bound_opt.submission_id = s.id AND bound_opt.is_bound = TRUE
                JOIN submissions prior ON prior.id = s.prior_submission_id
                JOIN insurance_towers prior_opt ON prior_opt.submission_id = prior.id AND prior_opt.is_bound = TRUE
                WHERE s.renewal_type = 'renewal'
                AND bound_opt.sold_premium IS NOT NULL
                AND prior_opt.sold_premium IS NOT NULL
                ORDER BY s.date_received DESC
                LIMIT 20
            """))

            rate_rows = rate_result.fetchall()

            if rate_rows:
                total_current = 0
                total_prior = 0

                for row in rate_rows:
                    sub_id, applicant, current, prior = row
                    if current and prior and prior > 0:
                        change = ((current - prior) / prior) * 100
                        total_current += current
                        total_prior += prior

                        change_str = f"+{change:.1f}%" if change > 0 else f"{change:.1f}%"
                        icon = "📈" if change > 0 else "📉" if change < 0 else "➡️"

                        col1, col2, col3, col4 = st.columns([3, 1, 1, 1])

                        with col1:
                            st.markdown(f"{icon} [{applicant}](?submission_id={sub_id})")
                        with col2:
                            st.caption(f"Prior: ${prior:,.0f}")
                        with col3:
                            st.caption(f"Current: ${current:,.0f}")
                        with col4:
                            st.caption(f"Change: {change_str}")

                # Overall rate change
                if total_prior > 0:
                    overall_change = ((total_current - total_prior) / total_prior) * 100
                    st.divider()
                    st.metric(
                        "Overall Rate Change",
                        f"{overall_change:+.1f}%",
                        delta=f"${total_current - total_prior:,.0f}"
                    )
            else:
                st.caption("No rate change data available. Bind options on renewal submissions to see rate trends.")

    except Exception as e:
        st.error(f"Error loading metrics: {e}")


# Entry point for backwards compatibility
if __name__ == "__main__":
    st.set_page_config(page_title="Stats", page_icon="📊", layout="wide")
    render()