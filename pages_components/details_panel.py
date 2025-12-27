"""
Details Panel - Account Information Section

Shows the account drilldown with submission history.
Broker info is displayed in the status header above tabs.
Edit via Load/Edit popover.
"""

import streamlit as st
from typing import Optional


def render_details_panel(sub_id: str, applicant_name: str, website: Optional[str] = None, get_conn=None):
    """Render details panel with account information."""
    from core import account_management as acct

    if not sub_id:
        return

    # Check for edit mode (triggered from Load/Edit popover)
    edit_key = f"editing_parties_{sub_id}"
    is_editing = st.session_state.get(edit_key, False)

    if is_editing:
        _render_edit_mode(sub_id, applicant_name, website, edit_key, get_conn)
        return

    # Get current account
    current_account = acct.get_submission_account(sub_id)

    if current_account:
        # Show account drilldown with full header and unlink option
        from pages_components.account_drilldown import render_account_drilldown
        render_account_drilldown(
            account_id=current_account["id"],
            current_submission_id=sub_id,
            show_unlink=True,
            show_metrics=True,
            show_header=True,
            compact=False,
        )
    else:
        # No account linked - show linking options
        _render_account_linking(sub_id, applicant_name, website)


def _render_edit_mode(sub_id: str, applicant_name: str, website: Optional[str], edit_key: str, get_conn):
    """Render edit mode for broker and account."""
    from core.bor_management import get_current_broker, get_all_broker_employments
    from core import account_management as acct

    conn = get_conn() if get_conn else None
    current_broker = get_current_broker(sub_id)
    current_account = acct.get_submission_account(sub_id)

    with st.container(border=True):
        st.markdown("**Edit Broker & Account**")

        # === BROKER ===
        st.caption("Broker")
        employments = get_all_broker_employments()

        new_broker_emp_id = None
        if employments:
            emp_options = {e["id"]: e["display_name"] for e in employments}
            emp_list = list(emp_options.keys())

            current_idx = 0
            if current_broker:
                for i, emp in enumerate(employments):
                    if current_broker.get("broker_name") and current_broker.get("broker_name") in emp.get("display_name", ""):
                        current_idx = i
                        break

            new_broker_emp_id = st.selectbox(
                "Broker", options=emp_list,
                format_func=lambda x: emp_options.get(x, ""),
                index=current_idx, key=f"broker_sel_{sub_id}", label_visibility="collapsed"
            )
        else:
            st.caption("No brokers available")

        # === ACCOUNT ===
        st.caption("Account")
        if current_account:
            col1, col2 = st.columns(2)
            with col1:
                new_name = st.text_input("Name", value=current_account.get("name", ""), key=f"acct_name_{sub_id}")
            with col2:
                new_website = st.text_input("Website", value=current_account.get("website", "") or "", key=f"acct_web_{sub_id}")

            st.caption("Address")
            new_street = st.text_input("Street", value=current_account.get("address_street", "") or "", key=f"acct_street_{sub_id}")
            new_suite = st.text_input("Suite/Unit", value=current_account.get("address_street2", "") or "", key=f"acct_suite_{sub_id}")

            a1, a2, a3 = st.columns([2, 1, 1])
            with a1:
                new_city = st.text_input("City", value=current_account.get("address_city", "") or "", key=f"acct_city_{sub_id}")
            with a2:
                new_state = st.text_input("State", value=current_account.get("address_state", "") or "", key=f"acct_state_{sub_id}")
            with a3:
                new_zip = st.text_input("ZIP", value=current_account.get("address_zip", "") or "", key=f"acct_zip_{sub_id}")

            link_choice = None
        else:
            # No account - show linking options
            matches = acct.find_matching_accounts(applicant_name, threshold=0.25)

            link_choice = "new"
            if matches:
                st.caption("Suggested matches:")
                options = ["new"] + [m["id"] for m in matches[:5]]
                labels = {"new": "Create new account"}
                for m in matches[:5]:
                    labels[m["id"]] = f"{m['name']} ({int(m['score']*100)}%)"

                link_choice = st.radio(
                    "Link to", options=options,
                    format_func=lambda x: labels.get(x, x),
                    key=f"link_choice_{sub_id}", label_visibility="collapsed"
                )

            if link_choice == "new":
                col1, col2 = st.columns(2)
                with col1:
                    new_name = st.text_input("Name", value=applicant_name, key=f"new_acct_name_{sub_id}")
                with col2:
                    new_website = st.text_input("Website", value=website or "", key=f"new_acct_web_{sub_id}")
            else:
                new_name = None
                new_website = None

            new_street = new_suite = new_city = new_state = new_zip = None

        # === BUTTONS ===
        c1, c2, c3 = st.columns([1, 1, 4])
        with c1:
            if st.button("Save", key=f"save_parties_{sub_id}", type="primary"):
                try:
                    # Save broker
                    if new_broker_emp_id and employments and conn:
                        for emp in employments:
                            if emp["id"] == new_broker_emp_id:
                                with conn.cursor() as cur:
                                    cur.execute(
                                        "UPDATE submissions SET broker_org_id = %s, broker_employment_id = %s, updated_at = now() WHERE id = %s",
                                        (emp["org_id"], emp["id"], sub_id)
                                    )
                                break

                    # Save account
                    if current_account:
                        acct.update_account(
                            account_id=current_account["id"],
                            name=new_name.strip() if new_name and new_name.strip() else None,
                            website=new_website.strip() if new_website and new_website.strip() else None,
                        )
                        acct.update_account_address(
                            account_id=current_account["id"],
                            street=new_street.strip() if new_street and new_street.strip() else None,
                            street2=new_suite.strip() if new_suite and new_suite.strip() else None,
                            city=new_city.strip() if new_city and new_city.strip() else None,
                            state=new_state.strip().upper() if new_state and new_state.strip() else None,
                            zip_code=new_zip.strip() if new_zip and new_zip.strip() else None,
                        )
                    else:
                        # Link or create account
                        if link_choice == "new":
                            if new_name and new_name.strip():
                                new_acct = acct.create_account(
                                    name=new_name.strip(),
                                    website=new_website.strip() if new_website and new_website.strip() else None,
                                )
                                acct.link_submission_to_account(sub_id, new_acct["id"])
                        elif link_choice:
                            acct.link_submission_to_account(sub_id, link_choice)

                    st.session_state[edit_key] = False
                    st.rerun()
                except Exception as e:
                    st.error(f"Error saving: {e}")

        with c2:
            if st.button("Cancel", key=f"cancel_parties_{sub_id}"):
                st.session_state[edit_key] = False
                st.rerun()


def _render_account_linking(sub_id: str, applicant_name: str, website: Optional[str]):
    """Render account linking UI when no account is linked."""
    from core import account_management as acct

    with st.container(border=True):
        st.markdown("**Link to Account**")
        st.caption("Associate this submission with an account to track history across policy years.")

        # Find matching accounts
        matches = acct.find_matching_accounts(applicant_name, threshold=0.25)

        if matches:
            st.markdown("**Suggested matches:**")
            options = ["new"] + [m["id"] for m in matches[:5]]
            labels = {"new": "Create new account"}
            for m in matches[:5]:
                labels[m["id"]] = f"{m['name']} ({int(m['score']*100)}% match)"

            link_choice = st.radio(
                "Link to",
                options=options,
                format_func=lambda x: labels.get(x, x),
                key=f"link_choice_{sub_id}",
                label_visibility="collapsed"
            )
        else:
            link_choice = "new"
            st.info("No matching accounts found. Create a new one below.")

        # New account form
        if link_choice == "new":
            col1, col2 = st.columns(2)
            with col1:
                new_name = st.text_input("Account Name", value=applicant_name, key=f"new_acct_name_{sub_id}")
            with col2:
                new_website = st.text_input("Website", value=website or "", key=f"new_acct_web_{sub_id}")

            if st.button("Create & Link Account", key=f"create_link_acct_{sub_id}", type="primary"):
                if new_name and new_name.strip():
                    try:
                        new_acct = acct.create_account(
                            name=new_name.strip(),
                            website=new_website.strip() if new_website else None,
                        )
                        acct.link_submission_to_account(sub_id, new_acct["id"])
                        st.success(f"Created and linked account: {new_name}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error creating account: {e}")
                else:
                    st.warning("Please enter an account name")
        else:
            # Link to existing account
            if st.button("Link to Selected Account", key=f"link_existing_{sub_id}", type="primary"):
                try:
                    acct.link_submission_to_account(sub_id, link_choice)
                    st.success("Account linked successfully")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error linking account: {e}")
