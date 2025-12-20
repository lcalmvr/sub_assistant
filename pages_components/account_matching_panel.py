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
        # Account info
        col1, col2 = st.columns(2)

        with col1:
            st.markdown(f"**Name:** {account['name']}")
            if account.get("website"):
                st.markdown(f"**Website:** {account['website']}")

        with col2:
            if account.get("industry"):
                st.markdown(f"**Industry:** {account['industry']}")
            if account.get("naics_title"):
                st.markdown(f"**NAICS:** {account['naics_title']}")

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
