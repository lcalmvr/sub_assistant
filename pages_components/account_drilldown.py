"""
Account Drilldown Component

Reusable component for displaying account details and submission history.
Used by: account_dashboard.py, details_panel.py (submissions page)

Includes:
- Account summary (name, website, address, industry)
- Metrics (submission count, written premium)
- Submission history table
- Renewal/remarket linking
- Unlink account option
"""

import streamlit as st
import pandas as pd
from typing import Optional
from datetime import datetime

from core import account_management as acct
from core.db import get_conn
from sqlalchemy import text


def render_account_drilldown(
    account_id: str,
    current_submission_id: Optional[str] = None,
    show_unlink: bool = False,
    show_metrics: bool = True,
    show_header: bool = True,
    compact: bool = False,
):
    """
    Render account drilldown with submission history and linking options.

    Args:
        account_id: UUID of the account
        current_submission_id: Highlight this submission as current
        show_unlink: Show "Unlink Account" button
        show_metrics: Show metrics row (submissions, written premium)
        show_header: Show account name/address header (False if already shown elsewhere)
        compact: Use compact layout for embedding
    """
    if not account_id:
        st.caption("No account linked")
        return

    account = acct.get_account(account_id)
    if not account:
        st.warning("Account not found")
        return

    subs = acct.get_account_submissions(account_id)
    written_premium = _get_written_premium(account_id)

    # === SUMMARY HEADER ===
    if show_header:
        _render_summary_header(
            account,
            subs,
            written_premium,
            show_metrics,
            compact,
            show_unlink=show_unlink,
            current_submission_id=current_submission_id,
        )
    elif show_metrics:
        # Just show metrics without full header
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Submissions", len(subs))
        with col2:
            premium_str = f"${written_premium:,.0f}" if written_premium else "—"
            st.metric("Written", premium_str)

    # === SUBMISSIONS TABLE ===
    if subs:
        _render_submissions_table(subs, current_submission_id, compact)
    else:
        st.caption("No submissions for this account")


def _get_written_premium(account_id: str) -> float:
    """Get total bound premium for account."""
    with get_conn() as conn:
        row = conn.execute(
            text("""
                SELECT COALESCE(SUM(COALESCE(t.sold_premium, 0)), 0)::float
                FROM submissions s
                LEFT JOIN insurance_towers t ON t.submission_id = s.id AND t.is_bound = TRUE
                WHERE s.account_id = :account_id
            """),
            {"account_id": account_id},
        ).fetchone()
    return float(row[0] or 0) if row else 0.0


def _render_summary_header(
    account: dict,
    subs: list,
    written_premium: float,
    show_metrics: bool,
    compact: bool,
    *,
    show_unlink: bool = False,
    current_submission_id: Optional[str] = None,
):
    """Render account summary header with edit capability."""
    import html as _html

    account_id = account.get("id")
    edit_key = f"editing_account_{account_id}"
    is_editing = st.session_state.get(edit_key, False)

    if is_editing:
        _render_account_edit_form(account, edit_key)
        return

    # Build address string
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

    # Website
    website = (account.get("website") or "").strip()
    website_html = ""
    if website:
        url = website if website.startswith(("http://", "https://")) else f"https://{website}"
        website_html = f"<a href='{_html.escape(url)}' target='_blank'>{_html.escape(website)}</a>"

    industry = account.get("naics_title") or account.get("industry") or ""

    # Latest submission info
    latest = subs[0] if subs else None
    latest_text = ""
    if latest:
        status = (latest.get("submission_status") or "").replace("_", " ").title()
        outcome = (latest.get("submission_outcome") or "").replace("_", " ").title()
        latest_text = f"Latest: {status} · {outcome}"

    line1_parts = [p for p in [website_html, _html.escape(address)] if p]
    line2_parts = [p for p in [_html.escape(latest_text), _html.escape(industry)] if p]

    if compact:
        # Compact: just name and key info
        col1, col2 = st.columns([4, 1])
        with col1:
            name = _html.escape(account.get("name", "Account"))
            info_line = " · ".join([p for p in [website, address[:40] + "..." if len(address) > 40 else address] if p])
            st.markdown(f"**{name}**")
            if info_line:
                st.caption(info_line)
        with col2:
            if show_metrics:
                st.metric("Subs", len(subs))
    else:
        # Full: rich summary card (edit via Load/Edit popover)
        with st.container(border=True):
            has_actions = bool(show_unlink and account.get("id"))
            if show_metrics:
                # Give metrics more space: [3, 1.2, 1.2, 0.8] for better visibility
                cols = [3, 1.2, 1.2] + ([0.8] if has_actions else [])
                c = st.columns(cols)
                c1, c2, c3 = c[0], c[1], c[2]
                c4 = c[3] if has_actions else None
            else:
                c1 = st.container()
                c2 = c3 = None

            with c1:
                name = _html.escape(account.get("name", "Account"))
                st.markdown(
                    f"""
<div style="line-height:1.25">
  <div style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px 0">{name}</div>
  <div style="color:#6b7280;font-size:13px;margin:0">{' · '.join(line1_parts) if line1_parts else ''}</div>
  <div style="color:#6b7280;font-size:13px;margin:4px 0 0 0">{' · '.join(line2_parts) if line2_parts else ''}</div>
</div>
                    """,
                    unsafe_allow_html=True,
                )

            if show_metrics and c2 and c3:
                # Use compact custom metrics for better fit
                premium_str = f"${written_premium:,.0f}" if written_premium else "—"
                with c2:
                    st.markdown(
                        f"""<div style="text-align:center">
<div style="font-size:11px;color:#6b7280;margin-bottom:2px">Subs</div>
<div style="font-size:22px;font-weight:600">{len(subs)}</div>
</div>""",
                        unsafe_allow_html=True,
                    )
                with c3:
                    st.markdown(
                        f"""<div style="text-align:center">
<div style="font-size:11px;color:#6b7280;margin-bottom:2px">Written</div>
<div style="font-size:22px;font-weight:600">{premium_str}</div>
</div>""",
                        unsafe_allow_html=True,
                    )

            # Unlink belongs with account context (not below tables)
            if has_actions and c4 is not None:
                with c4:
                    with st.popover("🔗"):
                        st.caption("Account actions")

                        # Create Remarket/Renewal based on bound status
                        if current_submission_id:
                            from core.bound_option import has_bound_option
                            from core.submission_inheritance import get_child_submission, create_submission_from_prior

                            # Check if child already exists (linear chain - no branching)
                            child = get_child_submission(current_submission_id)

                            if child:
                                # Already has a child - show link instead of create button
                                child_type = (child.get("renewal_type") or "submission").title()
                                child_id_short = child["id"][:8]
                                st.markdown(f"**{child_type} exists**")
                                st.markdown(f"[Open {child_id_short}](?selected_submission_id={child['id']})")
                            else:
                                # No child yet - show create button
                                is_bound = has_bound_option(current_submission_id)

                                if is_bound:
                                    if st.button(
                                        "Create Renewal",
                                        key=f"acct_create_renewal_{current_submission_id}",
                                        use_container_width=True,
                                    ):
                                        try:
                                            new_id = create_submission_from_prior(
                                                prior_id=current_submission_id,
                                                renewal_type="renewal",
                                                created_by="user",
                                            )
                                            st.query_params["selected_submission_id"] = new_id
                                            st.rerun()
                                        except Exception as e:
                                            st.error(f"Error: {e}")
                                else:
                                    if st.button(
                                        "Create Remarket",
                                        key=f"acct_create_remarket_{current_submission_id}",
                                        use_container_width=True,
                                    ):
                                        try:
                                            new_id = create_submission_from_prior(
                                                prior_id=current_submission_id,
                                                renewal_type="remarket",
                                                created_by="user",
                                            )
                                            st.query_params["selected_submission_id"] = new_id
                                            st.rerun()
                                        except Exception as e:
                                            st.error(f"Error: {e}")

                        if show_unlink and current_submission_id:
                            if st.button(
                                "Unlink from this submission",
                                key=f"unlink_acct_{current_submission_id}",
                                type="secondary",
                                use_container_width=True,
                            ):
                                acct.unlink_submission_from_account(current_submission_id)
                                st.rerun()


def _render_account_edit_form(account: dict, edit_key: str):
    """Render account edit form."""
    account_id = account.get("id")

    with st.container(border=True):
        st.markdown("**Edit Account**")

        col1, col2 = st.columns(2)
        with col1:
            new_name = st.text_input("Name", value=account.get("name", ""), key=f"edit_name_{account_id}")
        with col2:
            new_website = st.text_input("Website", value=account.get("website", "") or "", key=f"edit_web_{account_id}")

        st.caption("Address")
        new_street = st.text_input("Street", value=account.get("address_street", "") or "", key=f"edit_street_{account_id}")
        new_street2 = st.text_input("Suite/Unit", value=account.get("address_street2", "") or "", key=f"edit_street2_{account_id}")

        a1, a2, a3 = st.columns([2, 1, 1])
        with a1:
            new_city = st.text_input("City", value=account.get("address_city", "") or "", key=f"edit_city_{account_id}")
        with a2:
            new_state = st.text_input("State", value=account.get("address_state", "") or "", key=f"edit_state_{account_id}")
        with a3:
            new_zip = st.text_input("ZIP", value=account.get("address_zip", "") or "", key=f"edit_zip_{account_id}")

        c1, c2, c3 = st.columns([1, 1, 4])
        with c1:
            if st.button("Save", key=f"save_acct_{account_id}", type="primary"):
                try:
                    # Update name/website
                    acct.update_account(
                        account_id=account_id,
                        name=new_name.strip() if new_name and new_name.strip() else None,
                        website=new_website.strip() if new_website and new_website.strip() else None,
                    )
                    # Update address
                    acct.update_account_address(
                        account_id=account_id,
                        street=new_street.strip() if new_street and new_street.strip() else None,
                        street2=new_street2.strip() if new_street2 and new_street2.strip() else None,
                        city=new_city.strip() if new_city and new_city.strip() else None,
                        state=new_state.strip().upper() if new_state and new_state.strip() else None,
                        zip_code=new_zip.strip() if new_zip and new_zip.strip() else None,
                    )
                    st.session_state[edit_key] = False
                    st.rerun()
                except Exception as e:
                    st.error(f"Error saving: {e}")
        with c2:
            if st.button("Cancel", key=f"cancel_acct_{account_id}"):
                st.session_state[edit_key] = False
                st.rerun()


def _render_submissions_table(subs: list, current_submission_id: Optional[str], compact: bool):
    """Render submissions history."""
    st.markdown("**Submissions**")

    if compact and len(subs) <= 5:
        # Compact list view for small number of submissions
        for sub in subs:
            is_current = sub["id"] == current_submission_id
            date_str = sub["date_received"].strftime("%m/%d/%y") if sub.get("date_received") else "—"
            status = (sub.get("submission_status") or "").replace("_", " ").title()
            outcome = (sub.get("submission_outcome") or "").replace("_", " ").title()
            emoji = _get_status_emoji(sub.get("submission_outcome"), sub.get("submission_status"))

            if is_current:
                st.markdown(f"{emoji} **{date_str}** · {outcome} ← current")
            else:
                st.caption(f"{emoji} [{date_str}](?selected_submission_id={sub['id']}) · {outcome}")
    else:
        # Table view
        df = pd.DataFrame(subs)

        # Mark current
        if current_submission_id:
            df["is_current"] = df["id"] == current_submission_id

        # ID as clickable link
        df["id_link"] = df["id"].apply(lambda x: f"/submissions?selected_submission_id={x}")
        df["status"] = df["submission_status"].apply(lambda x: (x or "").replace("_", " ").title())
        df["outcome"] = df["submission_outcome"].apply(lambda x: (x or "").replace("_", " ").title())

        display_cols = ["id_link", "date_received", "status", "outcome"]
        if "annual_revenue" in df.columns:
            display_cols.append("annual_revenue")

        st.dataframe(
            df[display_cols],
            use_container_width=True,
            hide_index=True,
            column_config={
                "id_link": st.column_config.LinkColumn(
                    "ID",
                    display_text=r"\?selected_submission_id=(.{8})",  # Regex to extract first 8 chars of ID
                    width="small"
                ),
                "date_received": st.column_config.DateColumn("Received", format="MM/DD/YY", width="small"),
                "status": st.column_config.TextColumn("Status", width="small"),
                "outcome": st.column_config.TextColumn("Outcome", width="small"),
                "annual_revenue": st.column_config.NumberColumn("Revenue", format="compact", width="small"),
            },
            height=min(len(subs) * 35 + 38, 250),
        )


def _get_status_emoji(outcome: str, status: str) -> str:
    """Get emoji for status/outcome."""
    if outcome == "bound":
        return "✅"
    elif outcome == "lost":
        return "❌"
    elif status == "declined":
        return "🚫"
    elif status == "quoted":
        return "📝"
    elif status == "pending_info":
        return "⏳"
    elif status == "renewal_expected":
        return "🔄"
    else:
        return "📥"


