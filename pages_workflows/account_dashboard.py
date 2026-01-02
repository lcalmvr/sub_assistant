"""
Account Dashboard
================
Lightweight account-centric landing page:
- Search/select an account
- View core account details
- Open related submissions
"""

from __future__ import annotations

import pandas as pd
import streamlit as st
from sqlalchemy import text

from core import account_management as acct
from core.db import get_conn


@st.cache_data(ttl=30)
def _search_accounts_cached(query: str, limit: int = 25) -> list[dict]:
    return acct.search_accounts(query, limit=limit)


@st.cache_data(ttl=30)
def _get_all_accounts_cached(limit: int = 50, offset: int = 0) -> list[dict]:
    return acct.get_all_accounts(limit=limit, offset=offset)

@st.cache_data(ttl=30)
def _get_recent_accounts_cached(limit: int = 8) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            text(
                """
                SELECT
                    a.id,
                    a.name,
                    a.website,
                    MAX(COALESCE(s.date_received, s.created_at)) AS last_activity,
                    COUNT(s.id) AS submission_count
                FROM accounts a
                LEFT JOIN submissions s ON s.account_id = a.id
                GROUP BY a.id, a.name, a.website
                ORDER BY last_activity DESC NULLS LAST, a.updated_at DESC
                LIMIT :limit
                """
            ),
            {"limit": limit},
        ).fetchall()

    return [
        {
            "id": str(r[0]),
            "name": r[1],
            "website": r[2],
            "last_activity": r[3],
            "submission_count": int(r[4] or 0),
        }
        for r in rows
    ]

@st.cache_data(ttl=30)
def _load_recent_submissions_cached(
    *,
    search: str | None = None,
    status: str | None = None,
    outcome: str | None = None,
    limit: int = 50,
) -> pd.DataFrame:
    where = ["TRUE"]
    params: dict = {"limit": limit}
    if search:
        where.append("LOWER(s.applicant_name) LIKE LOWER(:search)")
        params["search"] = f"%{search.strip()}%"
    if status and status != "all":
        where.append("s.submission_status = :status")
        params["status"] = status
    if outcome and outcome != "all":
        where.append("s.submission_outcome = :outcome")
        params["outcome"] = outcome

    sql = f"""
        SELECT
            s.id,
            COALESCE(s.date_received, s.created_at)::date AS date_received,
            s.applicant_name,
            a.name AS account_name,
            s.submission_status,
            s.submission_outcome,
            s.annual_revenue,
            s.naics_primary_title
        FROM submissions s
        LEFT JOIN accounts a ON a.id = s.account_id
        WHERE {" AND ".join(where)}
        ORDER BY COALESCE(s.date_received, s.created_at) DESC
        LIMIT :limit
    """
    with get_conn() as conn:
        return pd.read_sql(text(sql), conn, params=params)


@st.cache_data(ttl=30)
def _submission_status_counts_cached(days: int = 30) -> dict[str, int]:
    with get_conn() as conn:
        rows = conn.execute(
            text(
                """
                SELECT s.submission_status, COUNT(*)::int
                FROM submissions s
                WHERE COALESCE(s.date_received, s.created_at) >= (now() - (:days || ' days')::interval)
                GROUP BY s.submission_status
                """
            ),
            {"days": days},
        ).fetchall()
    return {str(r[0] or "unknown"): int(r[1] or 0) for r in rows}

@st.cache_data(ttl=30)
def _account_written_premium_cached(account_id: str) -> float:
    """
    Sum of bound (sold) premium across all submissions for this account.
    """
    with get_conn() as conn:
        row = conn.execute(
            text(
                """
                SELECT COALESCE(SUM(COALESCE(t.sold_premium, 0)), 0)::float AS total_premium
                FROM submissions s
                LEFT JOIN insurance_towers t
                  ON t.submission_id = s.id
                 AND t.is_bound = TRUE
                WHERE s.account_id = :account_id
                """
            ),
            {"account_id": account_id},
        ).fetchone()
    return float(row[0] or 0)


def _sync_selected_account_from_query_params() -> None:
    account_id = st.query_params.get("account_id")
    if account_id:
        st.session_state.selected_account_id = str(account_id)
        st.query_params.clear()


def _account_label(account_row: dict) -> str:
    name = account_row.get("name") or "—"
    account_id = str(account_row.get("id") or "")
    return f"{name} – {account_id[:8]}" if account_id else name


def _format_status(status: str | None) -> str:
    if not status:
        return "—"
    return str(status).replace("_", " ").title()


def _format_outcome(outcome: str | None) -> str:
    if not outcome:
        return "—"
    return str(outcome).replace("_", " ").title()

def _format_currency(value: float) -> str:
    try:
        v = float(value or 0)
    except Exception:
        v = 0.0
    if v == 0:
        return "—"
    return f"${v:,.0f}"


def render() -> None:
    _sync_selected_account_from_query_params()

    st.markdown(
        """
<style>
.ad-kv { margin: 0 0 10px 0; }
.ad-kv .k { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
.ad-kv .v { font-size: 16px; color: #111827; overflow-wrap: anywhere; }
.ad-card { border: 1px solid #ececf0; border-radius: 14px; padding: 14px; background: #ffffff; }
</style>
        """,
        unsafe_allow_html=True,
    )

    st.header("Account Dashboard")

    selected_account_id = st.session_state.get("selected_account_id")

    overview_tab, account_tab = st.tabs(["📋 Submissions Overview", "🏷️ Account Drilldown"])

    with overview_tab:
        counts = _submission_status_counts_cached(days=30)
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Received (30d)", counts.get("received", 0))
        c2.metric("Pending Info (30d)", counts.get("pending_info", 0))
        c3.metric("Quoted (30d)", counts.get("quoted", 0))
        c4.metric("Declined (30d)", counts.get("declined", 0))

        f1, f2, f3 = st.columns([2, 1, 1])
        with f1:
            sub_search = st.text_input(
                "Search submissions",
                key="dash_sub_search",
                placeholder="Search by company name…",
            )
        with f2:
            status_filter = st.selectbox(
                "Status",
                ["all", "received", "pending_info", "quoted", "declined", "renewal_expected", "renewal_not_received"],
                key="dash_sub_status",
            )
        with f3:
            outcome_filter = st.selectbox(
                "Outcome",
                ["all", "pending", "waiting_for_response", "bound", "lost", "declined"],
                key="dash_sub_outcome",
            )

        sub_df = _load_recent_submissions_cached(
            search=sub_search or None,
            status=status_filter,
            outcome=outcome_filter,
            limit=75,
        )
        if sub_df is None or sub_df.empty:
            st.info("No submissions match your filters.")
        else:
            sub_df = sub_df.copy()
            sub_df["open"] = sub_df["id"].apply(lambda x: f"/submissions?selected_submission_id={x}")
            sub_df["id"] = sub_df["id"].astype(str).str[:8]
            sub_df["submission_status"] = sub_df["submission_status"].apply(_format_status)
            sub_df["submission_outcome"] = sub_df["submission_outcome"].apply(_format_outcome)

            st.dataframe(
                sub_df[
                    [
                        "open",
                        "id",
                        "date_received",
                        "applicant_name",
                        "account_name",
                        "submission_status",
                        "submission_outcome",
                        "annual_revenue",
                        "naics_primary_title",
                    ]
                ],
                use_container_width=True,
                hide_index=True,
                column_config={
                    "open": st.column_config.LinkColumn("Open", display_text="Open"),
                    "id": st.column_config.TextColumn("ID", width="small"),
                    "date_received": st.column_config.DateColumn("Received", format="MM/DD/YY"),
                    "applicant_name": st.column_config.TextColumn("Company"),
                    "account_name": st.column_config.TextColumn("Account"),
                    "annual_revenue": st.column_config.NumberColumn("Revenue", format="compact"),
                    "naics_primary_title": st.column_config.TextColumn("Industry"),
                    "submission_status": st.column_config.TextColumn("Status", width="small"),
                    "submission_outcome": st.column_config.TextColumn("Outcome", width="small"),
                },
                height=520,
            )

    with account_tab:
        # ───────────────────────── Top controls (compact, full-width) ─────────────────────────
        c_search, c_select, c_recent = st.columns([5, 6, 1], vertical_alignment="bottom")
        with c_search:
            query = st.text_input(
                "Find",
                key="account_dash_search",
                placeholder="Search accounts…",
                label_visibility="collapsed",
            ).strip()

        if query:
            accounts = _search_accounts_cached(query, limit=25)
        else:
            accounts = _get_all_accounts_cached(limit=50, offset=0)

        label_to_id: dict[str, str] = {_account_label(a): str(a["id"]) for a in accounts} if accounts else {}

        current_account = None
        if selected_account_id:
            current_account = acct.get_account(str(selected_account_id))
            if current_account:
                current_label = f"{current_account['name']} – {str(current_account['id'])[:8]}"
                if current_label not in label_to_id:
                    label_to_id = {current_label: str(current_account["id"]), **label_to_id}

        options = list(label_to_id.keys()) or ["—"]
        default_idx = 0
        if current_account:
            current_label = f"{current_account['name']} – {str(current_account['id'])[:8]}"
            if current_label in options:
                default_idx = options.index(current_label)

        with c_select:
            chosen_label = st.selectbox(
                "Account",
                options,
                index=default_idx,
                key="account_dash_select",
                label_visibility="collapsed",
            )

        chosen_id = label_to_id.get(chosen_label)
        if chosen_id and chosen_id != selected_account_id:
            st.session_state.selected_account_id = chosen_id
            st.rerun()

        with c_recent:
            with st.popover("⋯"):
                st.caption("Recent accounts")
                for a in _get_recent_accounts_cached(limit=10):
                    label = _account_label(a)
                    if st.button(label, key=f"recent_account_btn_{a['id']}", use_container_width=True):
                        st.session_state.selected_account_id = str(a["id"])
                        st.rerun()
                st.divider()
                if st.button("Clear selection", key="clear_account_selection", use_container_width=True):
                    st.session_state.pop("selected_account_id", None)
                    st.rerun()

        if not selected_account_id:
            st.info("Search/select an account to see linked submissions.")
            return

        account = acct.get_account(str(selected_account_id))
        if not account:
            st.warning("Account not found.")
            st.session_state.pop("selected_account_id", None)
            return

        subs = acct.get_account_submissions(str(selected_account_id))
        submission_count = len(subs)
        latest = subs[0] if subs else None
        written_premium = _account_written_premium_cached(str(selected_account_id))

        # ───────────────────────── Summary (single, dense strip) ─────────────────────────
        with st.container(border=True):
            import html as _html

            c1, c2, c3, c4 = st.columns([7, 2, 2, 2], vertical_alignment="center")

            # Build compact details block (reduced vertical spacing).
            addr_parts = []
            for k in ["address_street", "address_street2"]:
                if account.get(k):
                    addr_parts.append(str(account[k]))
            city = account.get("address_city")
            state = account.get("address_state")
            zip_code = account.get("address_zip")
            csz = ", ".join([p for p in [city, state] if p])
            if csz:
                addr_parts.append(csz + (f" {zip_code}" if zip_code else ""))
            elif zip_code:
                addr_parts.append(str(zip_code))
            address = " · ".join([p for p in addr_parts if p])

            website = (account.get("website") or "").strip()
            website_url = ""
            if website:
                website_url = website if website.startswith(("http://", "https://")) else f"https://{website}"
            website_html = (
                f"<a href='{_html.escape(website_url)}' target='_blank'>{_html.escape(website)}</a>"
                if website_url
                else ""
            )

            industry = account.get("naics_title") or account.get("industry") or ""
            latest_text = ""
            if latest:
                latest_text = f"Latest: {_format_status(latest.get('submission_status'))} · {_format_outcome(latest.get('submission_outcome'))}"

            line1_parts = [p for p in [website_html, _html.escape(address)] if p]
            line2_parts = [p for p in [_html.escape(latest_text) if latest_text else "", _html.escape(industry) if industry else ""] if p]

            with c1:
                name = _html.escape(account.get("name", "Account"))
                st.markdown(
                    f"""
<div style="line-height:1.25">
  <div style="font-size:28px;font-weight:700;color:#111827;margin:0 0 4px 0">{name}</div>
  <div style="color:#6b7280;font-size:13px;margin:0">{' · '.join(line1_parts) if line1_parts else '&nbsp;'}</div>
  <div style="color:#6b7280;font-size:13px;margin:6px 0 0 0">{' · '.join(line2_parts) if line2_parts else '&nbsp;'}</div>
</div>
                    """,
                    unsafe_allow_html=True,
                )

            with c2:
                st.metric("Submissions", submission_count)

            with c3:
                st.metric("Written Premium", _format_currency(written_premium))

            with c4:
                if latest:
                    st.link_button("Open latest", f"/submissions?selected_submission_id={latest['id']}")
                else:
                    st.caption("No submissions yet")

        # ───────────────────────── Submissions table ─────────────────────────
        st.subheader("Submissions")
        if not subs:
            st.info("No submissions linked to this account yet.")
            return

        df = pd.DataFrame(subs)
        df["open"] = df["id"].apply(lambda x: f"/submissions?selected_submission_id={x}")
        df["id"] = df["id"].astype(str).str[:8]
        df["submission_status"] = df["submission_status"].apply(_format_status)
        df["submission_outcome"] = df["submission_outcome"].apply(_format_outcome)

        st.dataframe(
            df[
                [
                    "open",
                    "id",
                    "date_received",
                    "submission_status",
                    "submission_outcome",
                    "annual_revenue",
                    "naics_primary_title",
                ]
            ],
            use_container_width=True,
            hide_index=True,
            column_config={
                "open": st.column_config.LinkColumn("Open", display_text="Open"),
                "id": st.column_config.TextColumn("ID", width="small"),
                "date_received": st.column_config.DateColumn("Received", format="MM/DD/YY"),
                "annual_revenue": st.column_config.NumberColumn("Revenue", format="compact"),
                "naics_primary_title": st.column_config.TextColumn("Industry"),
                "submission_status": st.column_config.TextColumn("Status", width="small"),
                "submission_outcome": st.column_config.TextColumn("Outcome", width="small"),
            },
        )
