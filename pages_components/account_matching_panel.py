"""
Account Matching Panel - Compact Version

Displays account association for a submission with inline editing.
"""

import streamlit as st
from typing import Optional
import os
import importlib.util

# Import account management module
spec = importlib.util.spec_from_file_location(
    "account_management",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "account_management.py")
)
account_mgmt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(account_mgmt)


def render_account_matching_panel(submission_id: str, applicant_name: str, website: Optional[str] = None):
    """Renders compact account panel for a submission."""
    if not submission_id:
        return

    current_account = account_mgmt.get_submission_account(submission_id)

    if current_account:
        _render_linked_account(submission_id, current_account)
    else:
        _render_unlinked_account(submission_id, applicant_name, website)


def _render_linked_account(submission_id: str, account: dict):
    """Render compact display for linked account."""
    account_id = account["id"]
    edit_key = f"editing_account_{account_id}"
    is_editing = st.session_state.get(edit_key, False)

    if not is_editing:
        # Display mode
        col_display, col_edit, col_unlink = st.columns([5, 1, 1])

        with col_display:
            display = f"**Account:** {account['name']}"
            if account.get('website'):
                display += f" · {account['website']}"
            st.markdown(display)

        with col_edit:
            if st.button("Edit", key=f"edit_acct_btn_{submission_id}", type="secondary"):
                st.session_state[edit_key] = True
                st.rerun()

        with col_unlink:
            if st.button("🔗", key=f"unlink_acct_btn_{submission_id}", type="secondary", help="Unlink account"):
                account_mgmt.unlink_submission_from_account(submission_id)
                st.rerun()

        # Collapsible history
        submissions = account_mgmt.get_account_submissions(account_id)
        if submissions and len(submissions) > 0:
            with st.expander(f"History ({len(submissions)})", expanded=False):
                for sub in submissions:
                    is_current = sub["id"] == submission_id
                    date_str = sub["date_received"].strftime("%m/%d/%y") if sub.get("date_received") else "—"
                    status = (sub.get("submission_status") or "").replace("_", " ").title()
                    outcome = (sub.get("submission_outcome") or "").replace("_", " ").title()
                    status_text = f"{status} ({outcome})" if outcome else status

                    if is_current:
                        st.caption(f"**{date_str}: {status_text}** ← current")
                    else:
                        st.caption(f"[{date_str}](?selected_submission_id={sub['id']}): {status_text}")
    else:
        # Edit mode
        st.markdown("**Edit Account**")
        edit_name = st.text_input("Name", value=account.get("name", ""), key=f"edit_name_{account_id}")
        edit_website = st.text_input("Website", value=account.get("website", "") or "", key=f"edit_web_{account_id}")
        edit_industry = st.text_input("Industry", value=account.get("industry", "") or "", key=f"edit_ind_{account_id}")

        c1, c2, c3 = st.columns([1, 1, 4])
        with c1:
            if st.button("Save", key=f"save_acct_{account_id}", type="primary"):
                account_mgmt.update_account(
                    account_id=account_id,
                    name=edit_name.strip() if edit_name.strip() else None,
                    website=edit_website.strip() if edit_website.strip() else None,
                    industry=edit_industry.strip() if edit_industry.strip() else None,
                )
                st.session_state[edit_key] = False
                st.rerun()
        with c2:
            if st.button("Cancel", key=f"cancel_acct_{account_id}"):
                st.session_state[edit_key] = False
                st.rerun()


def _render_account_edit_form(submission_id: str, account: dict, edit_key: str):
    """Render compact inline edit form."""
    account_id = account["id"]

    with st.form(key=f"edit_account_form_{account_id}"):
        c1, c2, c3 = st.columns([2, 2, 2])

        with c1:
            edit_name = st.text_input("Name", value=account.get("name", ""), key=f"ed_name_{account_id}")
        with c2:
            edit_website = st.text_input("Website", value=account.get("website", "") or "", key=f"ed_web_{account_id}")
        with c3:
            edit_industry = st.text_input("Industry", value=account.get("industry", "") or "", key=f"ed_ind_{account_id}")

        # Address in expandable section
        with st.expander("Address", expanded=False):
            current_address = account_mgmt.get_account_address_dict(account)
            a1, a2 = st.columns(2)
            with a1:
                edit_street = st.text_input("Street", value=current_address.get("street", ""), key=f"ed_st_{account_id}")
                edit_city = st.text_input("City", value=current_address.get("city", ""), key=f"ed_city_{account_id}")
            with a2:
                edit_state = st.text_input("State", value=current_address.get("state", ""), key=f"ed_state_{account_id}")
                edit_zip = st.text_input("ZIP", value=current_address.get("zip", ""), key=f"ed_zip_{account_id}")

        # Buttons
        bc1, bc2, bc3 = st.columns([1, 1, 4])
        with bc1:
            submitted = st.form_submit_button("Save", type="primary")
        with bc2:
            cancelled = st.form_submit_button("Cancel")

    if submitted:
        account_mgmt.update_account(
            account_id=account_id,
            name=edit_name.strip() if edit_name.strip() else None,
            website=edit_website.strip() if edit_website.strip() else None,
            industry=edit_industry.strip() if edit_industry.strip() else None,
        )
        # Update address if any field provided
        account_mgmt.update_account_address(
            account_id=account_id,
            street=edit_street.strip() if edit_street.strip() else None,
            city=edit_city.strip() if edit_city.strip() else None,
            state=edit_state.strip().upper() if edit_state.strip() else None,
            zip_code=edit_zip.strip() if edit_zip.strip() else None,
        )
        st.session_state[edit_key] = False
        st.rerun()

    if cancelled:
        st.session_state[edit_key] = False
        st.rerun()


def _render_unlinked_account(submission_id: str, applicant_name: str, website: Optional[str]):
    """Render compact interface for unlinked submission."""
    link_key = f"linking_account_{submission_id}"
    is_linking = st.session_state.get(link_key, False)

    if not is_linking:
        # Display mode
        col_display, col_btn = st.columns([6, 1])

        with col_display:
            st.markdown("**Account:** Not linked")

        with col_btn:
            if st.button("Link", key=f"link_acct_btn_{submission_id}", type="secondary"):
                st.session_state[link_key] = True
                st.rerun()
    else:
        # Link mode
        if st.button("Cancel", key=f"cancel_link_{submission_id}"):
            st.session_state[link_key] = False
            st.rerun()

        # Find matches
        matches = account_mgmt.find_matching_accounts(applicant_name, threshold=0.25)

        if matches:
            st.caption("**Suggested matches:**")
            for match in matches[:5]:
                score_pct = int(match["score"] * 100)
                label = f"{match['name']} ({score_pct}%)"
                if match.get("website"):
                    label += f" · {match['website']}"

                c1, c2 = st.columns([5, 1])
                with c1:
                    st.markdown(f"· {label}")
                with c2:
                    if st.button("Link", key=f"link_m_{submission_id}_{match['id']}", type="primary"):
                        account_mgmt.link_submission_to_account(submission_id, match["id"])
                        st.session_state[link_key] = False
                        st.rerun()

        st.divider()
        st.caption("**Or create new:**")
        new_name = st.text_input("Name", value=applicant_name, key=f"new_name_{submission_id}")
        new_website = st.text_input("Website", value=website or "", key=f"new_web_{submission_id}")

        if st.button("Create & Link", key=f"create_link_{submission_id}", type="primary"):
            if new_name.strip():
                account = account_mgmt.create_account(
                    name=new_name.strip(),
                    website=new_website.strip() if new_website.strip() else None,
                )
                account_mgmt.link_submission_to_account(submission_id, account["id"])
                st.session_state[link_key] = False
                st.rerun()


def _render_link_interface(submission_id: str, applicant_name: str, website: Optional[str], link_key: str):
    """Render account linking interface."""

    # Cancel button
    if st.button("Cancel", key=f"cancel_link_{submission_id}"):
        st.session_state[link_key] = False
        st.rerun()

    # Find matches
    matches = account_mgmt.find_matching_accounts(applicant_name, threshold=0.25)

    if matches:
        st.caption("**Suggested matches:**")
        for match in matches[:5]:  # Limit to top 5
            score_pct = int(match["score"] * 100)
            label = f"{match['name']} ({score_pct}%)"
            if match.get("website"):
                label += f" · {match['website']}"

            c1, c2 = st.columns([5, 1])
            with c1:
                st.markdown(f"· {label}")
            with c2:
                if st.button("Link", key=f"link_m_{submission_id}_{match['id']}", type="primary"):
                    account_mgmt.link_submission_to_account(submission_id, match["id"])
                    st.session_state[link_key] = False
                    st.rerun()

        st.divider()

    # Create new - compact form
    st.caption("**Or create new:**")

    with st.form(key=f"create_acct_form_{submission_id}"):
        c1, c2, c3 = st.columns([2, 2, 1])

        with c1:
            new_name = st.text_input("Name", value=applicant_name, key=f"new_name_{submission_id}", label_visibility="collapsed", placeholder="Account name")
        with c2:
            new_website = st.text_input("Website", value=website or "", key=f"new_web_{submission_id}", label_visibility="collapsed", placeholder="Website")
        with c3:
            if st.form_submit_button("Create", type="primary"):
                if new_name.strip():
                    try:
                        account = account_mgmt.create_account(
                            name=new_name.strip(),
                            website=new_website.strip() if new_website.strip() else None,
                        )
                        account_mgmt.link_submission_to_account(submission_id, account["id"])
                        st.session_state[link_key] = False
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error: {e}")


def render_account_search_panel():
    """Standalone panel for searching accounts."""
    st.subheader("Account Search")

    search_query = st.text_input("Search accounts by name", key="account_search_query")

    if search_query:
        results = account_mgmt.search_accounts(search_query, limit=20)

        if results:
            st.markdown(f"Found {len(results)} account(s)")
            for account in results:
                submissions = account_mgmt.get_account_submissions(account["id"])
                st.markdown(f"· **{account['name']}** - {len(submissions)} submission(s)")
        else:
            st.info("No accounts found")
    else:
        accounts = account_mgmt.get_all_accounts(limit=10)
        if accounts:
            st.caption("**Recent Accounts:**")
            for account in accounts:
                count = account.get("submission_count", 0)
                st.markdown(f"· **{account['name']}** ({count})")
