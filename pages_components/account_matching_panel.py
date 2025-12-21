"""
Account Matching Panel

Displays account association for a submission with fuzzy matching suggestions.
Allows UW to link submission to existing account or create new one.
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
    """
    Renders the account matching panel for a submission.

    Args:
        submission_id: UUID of the current submission
        applicant_name: The applicant/company name from the submission
        website: Optional website from submission
    """
    if not submission_id:
        return

    # Check if submission is already linked to an account
    current_account = account_mgmt.get_submission_account(submission_id)

    if current_account:
        _render_linked_account(submission_id, current_account)
    else:
        _render_account_matching(submission_id, applicant_name, website)


def _render_linked_account(submission_id: str, account: dict):
    """Render display for a submission already linked to an account."""

    with st.expander(f"🏢 Account: {account['name']}", expanded=False):
        # Edit mode toggle
        edit_key = f"editing_account_{account['id']}"
        is_editing = st.session_state.get(edit_key, False)

        if not is_editing:
            # Display mode
            col1, col2, col3 = st.columns([2, 2, 1])

            with col1:
                st.markdown(f"**Name:** {account['name']}")
                st.markdown(f"**Website:** {account.get('website') or '—'}")
                address_display = account_mgmt.format_account_address(account)
                st.markdown(f"**Address:** {address_display or '—'}")

            with col2:
                st.markdown(f"**Industry:** {account.get('industry') or '—'}")
                st.markdown(f"**NAICS:** {account.get('naics_title') or '—'}")

            with col3:
                if st.button("✏️ Edit", key=f"edit_acct_{submission_id}"):
                    st.session_state[edit_key] = True
                    st.rerun()
        else:
            # Edit mode
            _render_account_edit_form(submission_id, account, edit_key)

        # Get submission history for this account
        submissions = account_mgmt.get_account_submissions(account["id"])

        if submissions:
            st.divider()
            st.markdown(f"**Account History:** {len(submissions)} submission(s)")

            # Build compact list with clickable links
            history_lines = []
            for sub in submissions:
                is_current = sub["id"] == submission_id

                date_str = sub["date_received"].strftime("%m/%d/%Y") if sub.get("date_received") else "N/A"
                status = (sub.get("submission_status") or "unknown").replace("_", " ").title()
                outcome = (sub.get("submission_outcome") or "").replace("_", " ").title()

                status_text = status + (f" ({outcome})" if outcome else "")

                if is_current:
                    history_lines.append(f"- **{date_str}: {status_text}** ← current")
                else:
                    history_lines.append(f"- [{date_str}](?selected_submission_id={sub['id']}): {status_text}")

            # Render as single markdown block for compact spacing
            if history_lines:
                st.markdown("\n".join(history_lines))

        # Unlink button
        st.divider()
        if st.button("Unlink from Account", key=f"unlink_account_{submission_id}"):
            account_mgmt.unlink_submission_from_account(submission_id)
            st.success("Unlinked from account")
            st.rerun()


def _render_account_edit_form(submission_id: str, account: dict, edit_key: str):
    """Render inline edit form for account details."""
    account_id = account["id"]

    # Get current address
    current_address = account_mgmt.get_account_address_dict(account)

    st.markdown("**Edit Account**")

    # Name and Website
    col1, col2 = st.columns(2)
    with col1:
        edit_name = st.text_input("Name", value=account.get("name", ""), key=f"edit_name_{account_id}")
        edit_website = st.text_input("Website", value=account.get("website", "") or "", key=f"edit_website_{account_id}")
    with col2:
        edit_industry = st.text_input("Industry", value=account.get("industry", "") or "", key=f"edit_industry_{account_id}")

    # Address fields
    st.markdown("**Address**")
    addr_col1, addr_col2 = st.columns(2)
    with addr_col1:
        edit_street = st.text_input("Street", value=current_address.get("street", ""), key=f"edit_street_{account_id}")
        edit_city = st.text_input("City", value=current_address.get("city", ""), key=f"edit_city_{account_id}")
    with addr_col2:
        edit_state = st.text_input("State", value=current_address.get("state", ""), max_chars=2, key=f"edit_state_{account_id}")
        edit_zip = st.text_input("ZIP", value=current_address.get("zip", ""), key=f"edit_zip_{account_id}")

    # Save / Cancel buttons
    btn_col1, btn_col2, btn_col3 = st.columns([1, 1, 4])
    with btn_col1:
        if st.button("💾 Save", key=f"save_acct_{submission_id}"):
            # Update account
            account_mgmt.update_account(
                account_id=account_id,
                name=edit_name.strip() if edit_name.strip() else None,
                website=edit_website.strip() if edit_website.strip() else None,
                industry=edit_industry.strip() if edit_industry.strip() else None,
            )
            # Update address
            account_mgmt.update_account_address(
                account_id=account_id,
                street=edit_street.strip() if edit_street.strip() else None,
                city=edit_city.strip() if edit_city.strip() else None,
                state=edit_state.strip().upper() if edit_state.strip() else None,
                zip_code=edit_zip.strip() if edit_zip.strip() else None,
            )
            st.session_state[edit_key] = False
            st.success("Account updated!")
            st.rerun()
    with btn_col2:
        if st.button("Cancel", key=f"cancel_acct_{submission_id}"):
            st.session_state[edit_key] = False
            st.rerun()


def _render_account_matching(submission_id: str, applicant_name: str, website: Optional[str]):
    """Render account matching interface for unlinked submission."""

    with st.expander("🔍 Link to Account", expanded=True):
        st.markdown("This submission is not linked to an account. Link it to track history across policy years.")

        # Find matching accounts
        matches = account_mgmt.find_matching_accounts(applicant_name, threshold=0.25)

        if matches:
            st.markdown("**Suggested Matches:**")

            for match in matches:
                score_pct = int(match["score"] * 100)
                match_label = f"{match['name']} ({score_pct}% match)"

                if match.get("website"):
                    match_label += f" - {match['website']}"

                col1, col2 = st.columns([4, 1])

                with col1:
                    st.markdown(f"- {match_label}")

                with col2:
                    if st.button("Link", key=f"link_match_{submission_id}_{match['id']}"):
                        account_mgmt.link_submission_to_account(submission_id, match["id"])
                        st.success(f"Linked to {match['name']}")
                        st.rerun()

            st.divider()

        # Create new account option
        st.markdown("**Or create new account:**")

        with st.form(key=f"create_account_form_{submission_id}"):
            new_name = st.text_input("Account Name", value=applicant_name)
            new_website = st.text_input("Website", value=website or "")
            new_industry = st.text_input("Industry", value="")

            # Address fields
            st.markdown("**Address**")
            addr_col1, addr_col2 = st.columns(2)
            with addr_col1:
                new_street = st.text_input("Street", value="")
                new_city = st.text_input("City", value="")
            with addr_col2:
                new_state = st.text_input("State", value="", max_chars=2, placeholder="e.g., CA")
                new_zip = st.text_input("ZIP", value="", max_chars=10)

            new_notes = st.text_area("Notes", value="", placeholder="Optional notes about this account...")

            if st.form_submit_button("Create & Link Account", type="primary"):
                if not new_name.strip():
                    st.error("Account name is required")
                else:
                    try:
                        account = account_mgmt.create_account(
                            name=new_name.strip(),
                            website=new_website.strip() if new_website.strip() else None,
                            industry=new_industry.strip() if new_industry.strip() else None,
                            notes=new_notes.strip() if new_notes.strip() else None
                        )
                        # Update address if provided
                        if any([new_street.strip(), new_city.strip(), new_state.strip(), new_zip.strip()]):
                            account_mgmt.update_account_address(
                                account_id=account["id"],
                                street=new_street.strip() if new_street.strip() else None,
                                city=new_city.strip() if new_city.strip() else None,
                                state=new_state.strip().upper() if new_state.strip() else None,
                                zip_code=new_zip.strip() if new_zip.strip() else None,
                            )
                        account_mgmt.link_submission_to_account(submission_id, account["id"])
                        st.success(f"Created and linked to account: {account['name']}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error creating account: {e}")


def render_account_search_panel():
    """
    Standalone panel for searching and browsing accounts.
    Useful for admin/management views.
    """
    st.subheader("Account Search")

    search_query = st.text_input("Search accounts by name", key="account_search_query")

    if search_query:
        results = account_mgmt.search_accounts(search_query, limit=20)

        if results:
            st.markdown(f"Found {len(results)} account(s)")

            for account in results:
                with st.expander(account["name"]):
                    col1, col2 = st.columns(2)

                    with col1:
                        st.markdown(f"**Website:** {account.get('website', 'N/A')}")
                        st.markdown(f"**Industry:** {account.get('industry', 'N/A')}")

                    with col2:
                        st.markdown(f"**NAICS:** {account.get('naics_title', 'N/A')}")

                    # Show submissions for this account
                    submissions = account_mgmt.get_account_submissions(account["id"])
                    if submissions:
                        st.markdown(f"**Submissions:** {len(submissions)}")
        else:
            st.info("No accounts found matching your search")
    else:
        # Show recent accounts
        accounts = account_mgmt.get_all_accounts(limit=10)

        if accounts:
            st.markdown("**Recent Accounts:**")
            for account in accounts:
                submission_count = account.get("submission_count", 0)
                st.markdown(f"- **{account['name']}** ({submission_count} submission(s))")
