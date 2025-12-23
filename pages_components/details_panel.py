"""
Details Panel - Business Parties Section

Single container with Broker and Account (with address).
Policy period/dates are now in the status header.
"""

import streamlit as st
from typing import Optional
import os
import importlib.util

# Import account management module
spec_acct = importlib.util.spec_from_file_location(
    "account_management",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "account_management.py")
)
account_mgmt = importlib.util.module_from_spec(spec_acct)
spec_acct.loader.exec_module(account_mgmt)


def render_details_panel(sub_id: str, applicant_name: str, website: Optional[str] = None, get_conn=None):
    """Render details panel with Business Parties section."""
    from core.bor_management import get_current_broker, get_all_broker_employments

    if not sub_id:
        return

    if get_conn is None:
        raise ValueError("get_conn function must be provided")

    conn = get_conn()

    # Broker data
    current_broker = get_current_broker(sub_id)

    # Account data (includes address fields)
    current_account = account_mgmt.get_submission_account(sub_id)

    # Edit mode toggle
    edit_key = f"editing_parties_{sub_id}"
    is_editing = st.session_state.get(edit_key, False)

    # === BUSINESS PARTIES SECTION ===
    with st.container(border=True):
        if not is_editing:
            _render_display_mode(sub_id, current_broker, current_account, edit_key)
        else:
            _render_edit_mode(sub_id, current_broker, current_account, applicant_name, website, edit_key, conn)

    # === ACCOUNT HISTORY EXPANDER ===
    if current_account:
        _render_account_history(sub_id, current_account)


def _render_display_mode(sub_id: str, current_broker: dict, current_account: dict, edit_key: str):
    """Render display mode for business parties."""
    col_content, col_btn = st.columns([6, 1])

    with col_content:
        # Broker line
        if current_broker:
            broker_text = current_broker.get("broker_name", "Unknown")
            if current_broker.get("contact_name"):
                broker_text += f" - {current_broker['contact_name']}"
            if current_broker.get("contact_email"):
                broker_text += f" ({current_broker['contact_email']})"
            st.markdown(f"**Broker:** {broker_text}")
        else:
            st.markdown("**Broker:** Not assigned")

        # Account line
        if current_account:
            acct_text = current_account['name']
            if current_account.get('website'):
                acct_text += f" · {current_account['website']}"
            st.markdown(f"**Account:** {acct_text}")

            # Address line
            addr_parts = []
            street = current_account.get('address_street', '')
            if street:
                addr_parts.append(street)
            street2 = current_account.get('address_street2', '')
            if street2:
                addr_parts.append(street2)
            city = current_account.get('address_city', '')
            state = current_account.get('address_state', '')
            zip_code = current_account.get('address_zip', '')

            csz = []
            if city:
                csz.append(city)
            if state:
                csz.append(state)
            if zip_code:
                csz.append(zip_code)
            if csz:
                addr_parts.append(", ".join(csz))

            if addr_parts:
                st.caption(" · ".join(addr_parts))
        else:
            st.markdown("**Account:** Not linked")

    with col_btn:
        if st.button("Edit", key=f"edit_parties_btn_{sub_id}", type="secondary"):
            st.session_state[edit_key] = True
            st.rerun()


def _render_edit_mode(sub_id: str, current_broker: dict, current_account: dict,
                      applicant_name: str, website: Optional[str], edit_key: str, conn):
    """Render edit mode for business parties."""
    from core.bor_management import get_all_broker_employments

    # === BROKER ===
    st.caption("**Broker**")
    employments = get_all_broker_employments()

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
        new_broker_emp_id = None
        st.caption("No brokers available")

    st.caption("**Account**")

    # === ACCOUNT ===
    if current_account:
        # Name and website row
        c1, c2 = st.columns(2)
        with c1:
            new_name = st.text_input("Name", value=current_account.get("name", ""), key=f"acct_name_{sub_id}")
        with c2:
            new_website = st.text_input("Website", value=current_account.get("website", "") or "", key=f"acct_web_{sub_id}")

        # Address
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
        # No account linked - show linking options
        matches = account_mgmt.find_matching_accounts(applicant_name, threshold=0.25)

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
            c1, c2 = st.columns(2)
            with c1:
                new_name = st.text_input("Name", value=applicant_name, key=f"new_acct_name_{sub_id}")
            with c2:
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
                if new_broker_emp_id and employments:
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
                    account_mgmt.update_account(
                        account_id=current_account["id"],
                        name=new_name.strip() if new_name and new_name.strip() else None,
                        website=new_website.strip() if new_website and new_website.strip() else None,
                    )
                    account_mgmt.update_account_address(
                        account_id=current_account["id"],
                        street=new_street.strip() if new_street and new_street.strip() else None,
                        street2=new_suite.strip() if new_suite and new_suite.strip() else None,
                        city=new_city.strip() if new_city and new_city.strip() else None,
                        state=new_state.strip().upper() if new_state and new_state.strip() else None,
                        zip_code=new_zip.strip() if new_zip and new_zip.strip() else None,
                    )
                else:
                    # Link or create
                    if link_choice == "new":
                        if new_name and new_name.strip():
                            acct = account_mgmt.create_account(
                                name=new_name.strip(),
                                website=new_website.strip() if new_website and new_website.strip() else None,
                            )
                            account_mgmt.link_submission_to_account(sub_id, acct["id"])
                    elif link_choice:
                        account_mgmt.link_submission_to_account(sub_id, link_choice)

                st.session_state[edit_key] = False
                st.rerun()
            except Exception as e:
                st.error(f"Error saving: {e}")

    with c2:
        if st.button("Cancel", key=f"cancel_parties_{sub_id}"):
            st.session_state[edit_key] = False
            st.rerun()


def _render_account_history(sub_id: str, current_account: dict):
    """Render account history expander with unlink option."""
    submissions = account_mgmt.get_account_submissions(current_account["id"])

    with st.expander(f"Account History ({len(submissions) if submissions else 0})", expanded=True):
        if submissions:
            for sub in submissions:
                is_current = sub["id"] == sub_id
                date_str = sub["date_received"].strftime("%m/%d/%y") if sub.get("date_received") else "—"
                status = (sub.get("submission_status") or "").replace("_", " ").title()
                outcome = (sub.get("submission_outcome") or "").replace("_", " ").title()
                status_text = f"{status} ({outcome})" if outcome else status

                if is_current:
                    st.caption(f"**{date_str}: {status_text}** ← current")
                else:
                    st.caption(f"[{date_str}](?selected_submission_id={sub['id']}): {status_text}")
        else:
            st.caption("No submission history")

        # Unlink button at bottom of history
        st.divider()
        if st.button("Unlink Account", key=f"unlink_acct_{sub_id}", type="secondary"):
            account_mgmt.unlink_submission_from_account(sub_id)
            st.rerun()
