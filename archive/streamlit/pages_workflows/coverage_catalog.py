"""
Coverage Catalog Admin Page
===========================
Admin interface for managing the coverage catalog:
- View all coverage mappings by carrier
- Review and approve/reject pending submissions
- Edit normalized tags
- View statistics
"""

import streamlit as st
from typing import Optional

from pages_components.coverage_catalog_db import (
    get_catalog_stats,
    get_pending_reviews,
    get_all_carriers,
    get_carrier_coverages,
    approve_coverage,
    reject_coverage,
    update_normalized_tags,
    add_normalized_tag,
    remove_normalized_tag,
    lookup_coverage,
    delete_coverage,
    delete_rejected_coverages,
    reset_to_pending,
)


# Standard normalized tags (must match ai/sublimit_intel.py)
STANDARD_TAGS = [
    "Network Security Liability",
    "Privacy Liability",
    "Privacy Regulatory Defense",
    "Privacy Regulatory Penalties",
    "PCI DSS Assessment",
    "Media Liability",
    "Business Interruption",
    "System Failure (Non-Malicious BI)",
    "Dependent BI - IT Providers",
    "Dependent BI - Non-IT Providers",
    "Cyber Extortion / Ransomware",
    "Data Recovery / Restoration",
    "Reputational Harm",
    "Crisis Management / PR",
    "Technology E&O",
    "Social Engineering",
    "Invoice Manipulation",
    "Funds Transfer Fraud",
    "Telecommunications Fraud",
    "Breach Response / Notification",
    "Forensics",
    "Credit Monitoring",
    "Cryptojacking",
    "Betterment",
    "Bricking",
    "Other",
]


def render():
    """Main render function for the coverage catalog page."""
    st.title("📋 Coverage Catalog")
    st.caption("Manage carrier-specific coverage mappings to standardized tags")

    # Stats overview
    _render_stats_section()

    st.markdown("---")

    # Tab navigation
    tab_pending, tab_browse, tab_search = st.tabs([
        "🔔 Pending Review",
        "📂 Browse by Carrier",
        "🔍 Search",
    ])

    with tab_pending:
        _render_pending_reviews()

    with tab_browse:
        _render_browse_by_carrier()

    with tab_search:
        _render_search()


def _render_stats_section():
    """Render catalog statistics."""
    stats = get_catalog_stats()

    col1, col2, col3, col4, col5 = st.columns(5)

    with col1:
        st.metric("Total Mappings", stats["total"])
    with col2:
        st.metric("Pending Review", stats["pending"], delta=None if stats["pending"] == 0 else f"{stats['pending']} to review")
    with col3:
        st.metric("Approved", stats["approved"])
    with col4:
        st.metric("Carriers", stats["carriers"])
    with col5:
        st.metric("Unique Tags", stats["unique_tags"])


def _render_pending_reviews():
    """Render the pending reviews section."""
    pending = get_pending_reviews()

    if not pending:
        st.info("No coverage mappings pending review.")
        return

    st.subheader(f"Pending Review ({len(pending)})")

    for idx, item in enumerate(pending):
        _render_review_card(item, idx)


def _render_review_card(item: dict, idx: int):
    """Render a single pending review card."""
    item_id = str(item["id"])
    edit_key = f"editing_tags_{item_id}"

    # Get current tags (ensure it's a list)
    current_tags = item.get('coverage_normalized', [])
    if isinstance(current_tags, str):
        current_tags = [current_tags] if current_tags else []

    with st.container():
        # Header row: Carrier/Form + Actions
        col_header, col_actions = st.columns([4, 1])

        with col_header:
            st.markdown(f"**{item['carrier_name']}**" + (f" · {item['policy_form']}" if item.get('policy_form') else ""))

        with col_actions:
            col_approve, col_reject = st.columns(2)
            with col_approve:
                if st.button("✓", key=f"approve_{item_id}", help="Approve", use_container_width=True):
                    approve_coverage(item_id)
                    st.rerun()
            with col_reject:
                if st.button("✗", key=f"reject_{item_id}", help="Reject", use_container_width=True):
                    reject_coverage(item_id)
                    st.rerun()

        # Coverage mapping row
        col_orig, col_arrow, col_tags = st.columns([2, 0.2, 2])

        with col_orig:
            st.markdown(f"_{item['coverage_original']}_")

        with col_arrow:
            st.markdown("→")

        with col_tags:
            # Check if in edit mode
            if st.session_state.get(edit_key):
                # Edit mode: multiselect
                new_tags = st.multiselect(
                    "Tags",
                    options=STANDARD_TAGS,
                    default=current_tags,  # Show all current tags, not filtered
                    key=f"edit_tags_{item_id}",
                    label_visibility="collapsed",
                )
                col_save, col_cancel = st.columns(2)
                with col_save:
                    if st.button("Save", key=f"save_tags_{item_id}", type="primary", use_container_width=True):
                        update_normalized_tags(item_id, new_tags)
                        st.session_state[edit_key] = False
                        st.rerun()
                with col_cancel:
                    if st.button("Cancel", key=f"cancel_tags_{item_id}", use_container_width=True):
                        st.session_state[edit_key] = False
                        st.rerun()
            else:
                # Display mode: show tags as text with edit button
                if current_tags:
                    for tag in current_tags:
                        st.markdown(f"• {tag}")
                else:
                    st.caption("No tags assigned")

                if st.button("Edit tags", key=f"edit_btn_{item_id}", use_container_width=True):
                    st.session_state[edit_key] = True
                    st.rerun()

        # Metadata footer
        meta_parts = []
        if item.get('submitted_by'):
            meta_parts.append(f"by {item['submitted_by']}")
        if item.get('submitted_at'):
            meta_parts.append(str(item['submitted_at'])[:10])
        if item.get('notes'):
            meta_parts.append(item['notes'][:40] + "..." if len(item.get('notes', '')) > 40 else item.get('notes', ''))
        if meta_parts:
            st.caption(" · ".join(meta_parts))

        st.divider()


def _render_browse_by_carrier():
    """Render the browse by carrier section."""
    carriers = get_all_carriers()

    if not carriers:
        st.info("No carriers in the catalog yet. Coverage mappings will appear here as documents are processed.")
        return

    # Top row: Carrier selector + Clear rejected button
    col_select, col_clear = st.columns([3, 1])

    with col_select:
        selected_carrier = st.selectbox(
            "Select Carrier",
            options=carriers,
            key="browse_carrier_select",
        )

    with col_clear:
        st.write("")  # Spacer for alignment
        if st.button("🗑 Clear Rejected", key="clear_rejected_btn", help="Delete all rejected mappings"):
            count = delete_rejected_coverages()
            if count > 0:
                st.success(f"Deleted {count} rejected mappings")
            st.rerun()

    if not selected_carrier:
        return

    # Get coverages for this carrier (including pending)
    coverages = get_carrier_coverages(selected_carrier, approved_only=False)

    if not coverages:
        st.info(f"No coverages found for {selected_carrier}")
        return

    # Group by policy form
    by_form = {}
    for cov in coverages:
        form = cov.get('policy_form') or "Unknown Form"
        if form not in by_form:
            by_form[form] = []
        by_form[form].append(cov)

    # Display by policy form
    for form, form_coverages in by_form.items():
        with st.expander(f"📄 {form} ({len(form_coverages)} coverages)", expanded=True):
            _render_coverage_table(form_coverages)


def _render_coverage_table(coverages: list):
    """Render a table of coverages."""
    # Header
    col_orig, col_norm, col_status, col_actions = st.columns([2, 2, 0.8, 0.8])
    col_orig.caption("Original Name")
    col_norm.caption("Normalized Tags")
    col_status.caption("Status")
    col_actions.caption("Actions")

    for cov in coverages:
        cov_id = str(cov['id'])
        col_orig, col_norm, col_status, col_actions = st.columns([2, 2, 0.8, 0.8])

        with col_orig:
            st.write(cov['coverage_original'])

        with col_norm:
            # Handle array of tags
            tags = cov.get('coverage_normalized', [])
            if isinstance(tags, str):
                tags = [tags] if tags else []
            if tags:
                st.write(", ".join(tags))
            else:
                st.caption("No tags")

        with col_status:
            status = cov.get('status', 'pending')
            if status == 'approved':
                st.caption("✅ Approved")
            elif status == 'rejected':
                st.caption("❌ Rejected")
            else:
                st.caption("⏳ Pending")

        with col_actions:
            status = cov.get('status', 'pending')
            if status == 'rejected':
                col_reset, col_del = st.columns(2)
                with col_reset:
                    if st.button("↩", key=f"reset_{cov_id}", help="Reset to pending"):
                        reset_to_pending(cov_id)
                        st.rerun()
                with col_del:
                    if st.button("🗑", key=f"del_{cov_id}", help="Delete"):
                        delete_coverage(cov_id)
                        st.rerun()
            elif status == 'pending':
                if st.button("🗑", key=f"del_{cov_id}", help="Delete"):
                    delete_coverage(cov_id)
                    st.rerun()


def _render_search():
    """Render the search section."""
    st.subheader("Search Coverage Mappings")

    col_carrier, col_coverage = st.columns(2)

    with col_carrier:
        search_carrier = st.text_input(
            "Carrier Name",
            placeholder="e.g., BCS Insurance",
            key="search_carrier",
        )

    with col_coverage:
        search_coverage = st.text_input(
            "Coverage Name",
            placeholder="e.g., Multimedia Liability",
            key="search_coverage",
        )

    if search_carrier and search_coverage:
        result = lookup_coverage(
            carrier_name=search_carrier,
            coverage_original=search_coverage,
            approved_only=False,
        )

        if result:
            st.success("Found matching coverage mapping:")

            col1, col2 = st.columns(2)
            with col1:
                st.markdown("**Original:**")
                st.write(result['coverage_original'])
            with col2:
                st.markdown("**Normalized Tags:**")
                tags = result.get('coverage_normalized', [])
                if isinstance(tags, str):
                    tags = [tags] if tags else []
                if tags:
                    for tag in tags:
                        st.write(f"• {tag}")
                else:
                    st.caption("No tags")

            st.caption(f"Carrier: {result['carrier_name']} · Form: {result.get('policy_form', 'N/A')} · Status: {result['status']}")
        else:
            st.info("No matching coverage found in the catalog.")

    elif search_carrier or search_coverage:
        st.caption("Enter both carrier name and coverage name to search.")
