"""
Remarket & Renewal Linking Component

Handles:
1. Creating remarkets from lost/declined submissions
2. Linking existing submissions as remarket/renewal of a prior
3. Auto-filling empty fields from prior submission
"""

import streamlit as st
from typing import Optional
from datetime import date, timedelta


def render_remarket_actions(
    account_id: str,
    current_submission_id: str,
    submissions: list,
):
    """
    Render remarket/renewal actions for an account's submissions.

    Shows:
    - "Create Remarket" for lost/declined submissions
    - "Link as Remarket of..." if current isn't linked to a prior
    """
    if not submissions or len(submissions) < 1:
        return

    # Find remarketable submissions (lost or declined, not current)
    remarketable = [
        s for s in submissions
        if s["id"] != current_submission_id
        and (s.get("submission_outcome") == "lost" or s.get("submission_status") == "declined")
    ]

    # Find potential prior submissions for linking (any prior submission, not current)
    potential_priors = [
        s for s in submissions
        if s["id"] != current_submission_id
    ]

    # Check if current submission already has a prior link
    from core.db import get_conn
    from sqlalchemy import text

    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT prior_submission_id, renewal_type
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": current_submission_id})
        row = result.fetchone()

    has_prior_link = row and row[0] is not None
    current_renewal_type = row[1] if row else None

    # === CREATE REMARKET SECTION ===
    if remarketable:
        with st.expander("🔁 Create Remarket", expanded=False):
            st.caption("Create a new submission to retry a previously lost account.")

            # Build options
            options = {}
            for sub in remarketable:
                eff_date = sub.get("effective_date")
                date_str = eff_date.strftime("%m/%d/%Y") if eff_date else "N/A"
                outcome = (sub.get("submission_outcome") or "").replace("_", " ").title()
                status = (sub.get("submission_status") or "").replace("_", " ").title()
                label = f"{date_str} - {status}/{outcome}"
                options[sub["id"]] = label

            selected_id = st.selectbox(
                "Create remarket from:",
                options=list(options.keys()),
                format_func=lambda x: options.get(x, x),
                key=f"remarket_select_{current_submission_id}",
            )

            if st.button("Create Remarket Submission", key=f"create_remarket_{current_submission_id}", type="primary"):
                try:
                    from core.submission_inheritance import create_submission_from_prior
                    new_id = create_submission_from_prior(
                        prior_id=selected_id,
                        renewal_type="remarket",
                        created_by="user",
                    )
                    st.success("Remarket created!")
                    st.query_params["selected_submission_id"] = new_id
                    st.rerun()
                except Exception as e:
                    st.error(f"Error creating remarket: {e}")

    # === LINK TO PRIOR SECTION ===
    if potential_priors and not has_prior_link:
        with st.expander("🔗 Link to Prior Submission", expanded=False):
            st.caption("Link this submission to a prior year to track renewal/remarket history and auto-fill data.")

            # Build options
            options = {}
            for sub in potential_priors:
                eff_date = sub.get("effective_date")
                date_str = eff_date.strftime("%m/%d/%Y") if eff_date else "N/A"
                outcome = (sub.get("submission_outcome") or "").replace("_", " ").title()

                # Suggest link type based on prior outcome
                if sub.get("submission_outcome") == "bound":
                    suggested = "Renewal"
                else:
                    suggested = "Remarket"

                label = f"{date_str} - {outcome} ({suggested})"
                options[sub["id"]] = {"label": label, "suggested_type": suggested.lower()}

            selected_prior_id = st.selectbox(
                "Link as continuation of:",
                options=list(options.keys()),
                format_func=lambda x: options.get(x, {}).get("label", x),
                key=f"link_prior_select_{current_submission_id}",
            )

            # Link type
            suggested_type = options.get(selected_prior_id, {}).get("suggested_type", "remarket")
            link_type = st.radio(
                "Link type:",
                options=["renewal", "remarket"],
                index=0 if suggested_type == "renewal" else 1,
                horizontal=True,
                key=f"link_type_{current_submission_id}",
            )

            # Auto-fill option
            auto_fill = st.checkbox(
                "Auto-fill empty fields from prior (broker, industry, description)",
                value=True,
                key=f"auto_fill_{current_submission_id}",
            )

            if st.button("Link to Prior", key=f"link_prior_{current_submission_id}", type="primary"):
                try:
                    from core.submission_inheritance import link_to_prior_with_inheritance
                    result = link_to_prior_with_inheritance(
                        submission_id=current_submission_id,
                        prior_id=selected_prior_id,
                        renewal_type=link_type,
                        inherit_empty_fields=auto_fill,
                    )

                    msg = f"Linked as {link_type}!"
                    if result.get("inherited_fields"):
                        msg += f" Auto-filled: {', '.join(result['inherited_fields'])}"
                    if result.get("conflicts"):
                        conflict_fields = [c["display_name"] for c in result["conflicts"]]
                        st.warning(f"Data conflicts detected: {', '.join(conflict_fields)}")

                    st.success(msg)
                    st.rerun()
                except Exception as e:
                    st.error(f"Error linking: {e}")

    # === SHOW CURRENT LINK STATUS ===
    if has_prior_link:
        # Find the prior submission info
        prior_sub = None
        for sub in submissions:
            if sub["id"] == str(row[0]):
                prior_sub = sub
                break

        if prior_sub:
            eff_date = prior_sub.get("effective_date")
            date_str = eff_date.strftime("%m/%d/%Y") if eff_date else "N/A"
            outcome = (prior_sub.get("submission_outcome") or "").replace("_", " ").title()
            link_type_display = (current_renewal_type or "").replace("_", " ").title()

            st.info(f"🔗 Linked as **{link_type_display}** of {date_str} ({outcome})")

            # Option to unlink
            if st.button("Unlink from prior", key=f"unlink_prior_{current_submission_id}"):
                try:
                    with get_conn() as conn:
                        conn.execute(text("""
                            UPDATE submissions
                            SET prior_submission_id = NULL, renewal_type = NULL, updated_at = now()
                            WHERE id = :submission_id
                        """), {"submission_id": current_submission_id})
                        conn.commit()
                    st.success("Unlinked from prior submission")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error unlinking: {e}")


def render_quick_remarket_button(submission: dict, key_suffix: str = ""):
    """
    Render a small remarket button for a single submission row.

    Use this in submission tables for quick access.
    """
    sub_id = submission["id"]
    outcome = submission.get("submission_outcome")
    status = submission.get("submission_status")

    # Only show for lost or declined
    if outcome != "lost" and status != "declined":
        return False

    if st.button("🔁", key=f"quick_remarket_{sub_id}{key_suffix}", help="Create remarket"):
        try:
            from core.submission_inheritance import create_submission_from_prior
            new_id = create_submission_from_prior(
                prior_id=sub_id,
                renewal_type="remarket",
                created_by="user",
            )
            st.query_params["selected_submission_id"] = new_id
            st.rerun()
        except Exception as e:
            st.error(f"Error: {e}")

    return True
