"""
Policy Panel Component

Lightweight, reusable Policy tab content that can be embedded in different contexts.
Used by: submissions.py (Policy tab), admin.py (inline preview)
"""
from __future__ import annotations

import streamlit as st
import pandas as pd
from datetime import date


def render_policy_panel(
    submission_id: str,
    show_sidebar: bool = True,
    show_renewal: bool = True,
    compact: bool = False
):
    """
    Render the policy panel content.

    Args:
        submission_id: UUID of the submission
        show_sidebar: Whether to show the AI admin sidebar (False for admin console)
        show_renewal: Whether to show the renewal section
        compact: If True, uses more compact layout for embedding
    """
    from core.policy_tab_data import load_policy_tab_data
    from pages_components.endorsements_history_panel import render_endorsements_history_panel
    from pages_components.renewal_panel import render_renewal_panel

    # Load all policy data in one call
    policy_data = load_policy_tab_data(submission_id)
    bound_option = policy_data.get("bound_option")
    effective_state = policy_data.get("effective_state", {})
    submission_info = policy_data.get("submission", {})

    applicant_name = submission_info.get("applicant_name") or "Unknown"

    # Optionally render AI Admin sidebar
    if show_sidebar:
        from pages_components.admin_agent_sidebar import render_admin_agent_sidebar
        render_admin_agent_sidebar(
            submission_id=submission_id,
            applicant_name=applicant_name,
            is_bound=bound_option is not None
        )

    if not bound_option:
        st.info("No bound policy. Bind a quote option on the Quote tab to manage the policy.")
        return

    # ------------------- POLICY SUMMARY --------------------
    if not compact:
        st.markdown("##### Policy Summary")

    # Status indicator
    if effective_state.get("is_cancelled"):
        status_text = "Cancelled"
        status_icon = "🔴"
    elif effective_state.get("has_erp"):
        status_text = "ERP Active"
        status_icon = "🟡"
    else:
        status_text = "Active"
        status_icon = "🟢"

    # Dates
    eff_date = submission_info.get("effective_date")
    exp_date = effective_state.get("effective_expiration") or submission_info.get("expiration_date")
    eff_str = eff_date.strftime("%m/%d/%Y") if eff_date and hasattr(eff_date, 'strftime') else str(eff_date or "—")
    exp_str = exp_date.strftime("%m/%d/%Y") if exp_date and hasattr(exp_date, 'strftime') else str(exp_date or "—")

    # Policy details from bound option
    tower_json = bound_option.get("tower_json") or []
    if tower_json and len(tower_json) > 0:
        primary_layer = tower_json[0]
        limit = primary_layer.get("limit", 0)
        limit_str = f"${limit:,.0f}" if limit else "—"
    else:
        limit_str = "—"

    retention = bound_option.get("primary_retention", 0)
    retention_str = f"${retention:,.0f}" if retention else "—"
    premium = effective_state.get("effective_premium", 0)
    premium_str = f"${premium:,.0f}"
    policy_form = bound_option.get("policy_form") or "—"

    # Display summary
    if compact:
        # Single line compact format
        st.markdown(f"**{applicant_name}** · {status_icon} {status_text} · {eff_str} → {exp_str} · {premium_str}")
    else:
        col1, col2 = st.columns(2)
        with col1:
            st.markdown(f"**Status:** {status_icon} {status_text}  \n**Period:** {eff_str} → {exp_str}  \n**Terms:** {limit_str} / {retention_str} SIR  \n**Premium:** {premium_str}  \n**Form:** {policy_form.title()}")
        with col2:
            if st.button("Unbind Policy", key=f"unbind_{submission_id}"):
                st.session_state[f"confirm_unbind_{submission_id}"] = True

        if st.session_state.get(f"confirm_unbind_{submission_id}"):
            st.warning("This will remove the bound status and delete associated binder documents. Endorsements will also be removed.")
            c1, c2, _ = st.columns([1, 1, 4])
            with c1:
                if st.button("Confirm Unbind", key=f"confirm_unbind_btn_{submission_id}", type="primary"):
                    from core.bound_option import unbind_option
                    tower_id = bound_option.get("id")
                    if tower_id:
                        unbind_option(tower_id)
                        st.session_state.pop(f"confirm_unbind_{submission_id}", None)
                        st.rerun()
            with c2:
                if st.button("Cancel", key=f"cancel_unbind_{submission_id}"):
                    st.session_state.pop(f"confirm_unbind_{submission_id}", None)
                    st.rerun()

        st.divider()

    # ------------------- POLICY DOCUMENTS --------------------
    if not compact:
        st.markdown("##### Policy Documents")

    all_docs = policy_data.get("documents", [])
    policy_docs = [
        d for d in all_docs
        if d.get("document_type") in ("binder", "policy", "endorsement")
        or d.get("is_bound_quote", False)
    ]

    def doc_sort_key(d):
        type_order = {
            "quote_primary": 0, "quote_excess": 0,
            "binder": 1,
            "policy": 2,
            "endorsement": 3
        }
        doc_type = d.get("document_type", "")
        return (type_order.get(doc_type, 99), d.get("created_at") or "")

    policy_docs.sort(key=doc_sort_key)

    if policy_docs:
        doc_rows = []
        for doc in policy_docs:
            doc_type = doc.get("type_label", doc.get("document_type", "Document"))
            doc_number = doc.get("document_number", "")
            pdf_url = doc.get("pdf_url", "")
            created_at = doc.get("created_at")
            date_str = created_at.strftime("%m/%d/%Y") if created_at and hasattr(created_at, 'strftime') else ""

            doc_rows.append({
                "Document": f"{doc_type}: {doc_number}",
                "Date": date_str,
                "PDF": pdf_url or "",
            })

        # Policy document will be added to the list when issued
        # (removed "coming soon" placeholders - now handled by Issue Policy action)

        df = pd.DataFrame(doc_rows)
        st.dataframe(
            df,
            hide_index=True,
            use_container_width=True,
            column_config={
                "Document": st.column_config.TextColumn(width="large"),
                "Date": st.column_config.TextColumn(width="small"),
                "PDF": st.column_config.LinkColumn(display_text="PDF", width="small"),
            },
            height=min((len(doc_rows) * 35) + 38, 250 if compact else 400),
        )
    else:
        st.caption("No policy documents generated yet.")

    # ------------------- POLICY ISSUANCE --------------------
    if not compact:
        st.divider()
        st.markdown("##### Policy Issuance")

        from core.policy_issuance import get_policy_issuance_status, issue_policy

        status = get_policy_issuance_status(submission_id)

        if status["is_issued"]:
            # Policy already issued - show success with link
            col1, col2 = st.columns([3, 1])
            with col1:
                st.success(f"Policy Issued: **{status['policy_number']}**")
            with col2:
                if status.get("pdf_url"):
                    st.link_button("View PDF", status["pdf_url"])

        elif status["can_issue"]:
            # Ready to issue
            st.info("All subjectivities resolved. Ready to issue policy.")

            col1, col2, _ = st.columns([1, 2, 3])
            with col1:
                if st.button("Issue Policy", type="primary", key=f"issue_policy_{submission_id}"):
                    try:
                        result = issue_policy(submission_id, issued_by="user")
                        st.success(f"Policy issued: {result['policy_number']}")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Failed to issue policy: {e}")
            with col2:
                st.caption("Generates Dec Page + Policy Form + Endorsements")

        else:
            # Cannot issue - show blocker
            if status["pending_subjectivities"] > 0:
                count = status["pending_subjectivities"]
                suffix = "y" if count == 1 else "ies"
                st.warning(f"Cannot issue policy: {count} subjectivit{suffix} pending")
                st.caption("Resolve all subjectivities (mark received or waive) before issuing.")
            elif status.get("issue_blocker"):
                st.warning(f"Cannot issue policy: {status['issue_blocker']}")

        st.divider()

    # ------------------- ENDORSEMENTS --------------------
    render_endorsements_history_panel(
        submission_id,
        preloaded_data=policy_data,
    )

    # ------------------- RENEWAL --------------------
    if show_renewal and not compact:
        st.markdown("##### Renewal")
        render_renewal_panel(submission_id)
