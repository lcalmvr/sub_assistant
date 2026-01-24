"""
Compliance Management Page
==========================
Reference library and rules engine for compliance requirements
"""

import streamlit as st
from typing import Dict, Any

from core.compliance_management import (
    get_all_compliance_rules,
    get_compliance_rule_by_code,
    get_compliance_stats,
    check_table_exists,
)


CATEGORY_LABELS = {
    "ofac": "OFAC Compliance",
    "service_of_suit": "Service of Suit",
    "nyftz": "NY Free Trade Zone",
    "state_rule": "State Rules",
    "notice_stamping": "Notice & Stamping",
    "other": "Other",
}

PRIORITY_COLORS = {
    "critical": "🔴",
    "high": "🟠",
    "normal": "🟡",
    "low": "🟢",
}


def escape_dollar_signs(text: str) -> str:
    """Escape dollar signs in text to prevent LaTeX math mode in markdown.
    
    Note: This only escapes unescaped dollar signs. If the text already has
    escaped dollar signs (\\$), they will not be double-escaped.
    """
    if not text:
        return text
    # Only escape $ that are not already escaped
    # Replace $ with \$ only if not preceded by a backslash
    import re
    return re.sub(r'(?<!\\)\$', r'\\$', text)


def render():
    """Main render function for the compliance page."""
    st.title("⚖️ Compliance Resources")
    st.caption("Reference library and rules engine for compliance requirements")

    # Check if table exists first
    if not check_table_exists():
        st.error("""
        ⚠️ **Database Setup Required**
        
        The compliance_rules table has not been created yet. Please run the migration script:
        
        ```bash
        python db_setup/run_compliance_migration.py
        ```
        
        Or execute the SQL file directly:
        
        ```bash
        psql $DATABASE_URL -f db_setup/create_compliance_rules.sql
        ```
        
        Then seed the initial rules:
        
        ```bash
        python db_setup/seed_compliance_rules.py
        ```
        """)
        return

    # Stats overview
    _render_stats_section()

    st.markdown("---")

    # Tab navigation
    tab_browse, tab_search, tab_reference = st.tabs([
        "📂 Browse by Category",
        "🔍 Search Rules",
        "📚 Quick Reference",
    ])

    with tab_browse:
        _render_browse_by_category()

    with tab_search:
        _render_search()

    with tab_reference:
        _render_quick_reference()


def _render_stats_section():
    """Render compliance statistics."""
    try:
        stats = get_compliance_stats()

        col1, col2, col3, col4, col5 = st.columns(5)

        with col1:
            st.metric("Total Rules", stats["total"])
        with col2:
            st.metric("Active Rules", stats["active"])
        with col3:
            st.metric("OFAC Rules", stats["ofac_count"])
        with col4:
            st.metric("NYFTZ Rules", stats["nyftz_count"])
        with col5:
            st.metric("State Rules", stats["state_rule_count"] + stats["notice_stamping_count"])
    except Exception as e:
        if "does not exist" in str(e):
            st.error("""
            ⚠️ **Database Setup Required**
            
            The compliance_rules table has not been created yet. Please run the migration script:
            
            ```bash
            python db_setup/run_compliance_migration.py
            ```
            
            Or execute the SQL file directly:
            
            ```bash
            psql $DATABASE_URL -f db_setup/create_compliance_rules.sql
            ```
            
            Then seed the initial rules:
            
            ```bash
            python db_setup/seed_compliance_rules.py
            ```
            """)
        else:
            st.error(f"Error loading compliance statistics: {e}")


def _render_browse_by_category():
    """Render rules organized by category."""
    
    # Category filter
    selected_category = st.selectbox(
        "Filter by Category",
        options=[None] + list(CATEGORY_LABELS.keys()),
        format_func=lambda x: "All Categories" if x is None else CATEGORY_LABELS.get(x, x),
        key="browse_category_filter"
    )
    
    # State filter
    states = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
              "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
              "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
              "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
              "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"]
    
    selected_state = st.selectbox(
        "Filter by State (optional)",
        options=[None] + states,
        key="browse_state_filter"
    )
    
    # Product filter
    selected_product = st.selectbox(
        "Filter by Product (optional)",
        options=[None, "cyber", "tech_eo", "both"],
        format_func=lambda x: "All Products" if x is None else x.title(),
        key="browse_product_filter"
    )

    # Get filtered rules
    rules = get_all_compliance_rules(
        category=selected_category,
        state=selected_state,
        product=selected_product,
        status="active"
    )

    if not rules:
        st.info("No compliance rules found matching the selected filters.")
        return

    st.subheader(f"Rules ({len(rules)})")

    # Group by category if viewing all
    if selected_category is None:
        categories = {}
        for rule in rules:
            cat = rule["category"]
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(rule)
        
        for category, cat_rules in categories.items():
            with st.expander(f"{CATEGORY_LABELS.get(category, category)} ({len(cat_rules)})", expanded=True):
                for rule in cat_rules:
                    _render_rule_card(rule)
    else:
        for rule in rules:
            _render_rule_card(rule)


def _render_search():
    """Render search functionality."""
    
    search_query = st.text_input("Search rules by title, description, or code", key="compliance_search")
    
    if not search_query:
        st.info("Enter a search term to find compliance rules.")
        return
    
    # Get all active rules and filter in Python (could be optimized with full-text search)
    all_rules = get_all_compliance_rules(status="active")
    
    query_lower = search_query.lower()
    filtered_rules = [
        rule for rule in all_rules
        if (query_lower in rule["code"].lower() or
            query_lower in rule["title"].lower() or
            query_lower in (rule.get("description") or "").lower() or
            query_lower in (rule.get("requirements") or "").lower())
    ]
    
    if not filtered_rules:
        st.warning(f"No rules found matching '{search_query}'")
        return
    
    st.subheader(f"Search Results ({len(filtered_rules)})")
    
    for rule in filtered_rules:
        _render_rule_card(rule)


def _render_quick_reference():
    """Render quick reference guide."""
    
    st.markdown("### Quick Reference Guides")
    
    # OFAC Quick Guide
    with st.expander("🔴 OFAC Compliance Checklist", expanded=True):
        st.markdown("""
        **Key Requirements:**
        - Screen all parties (insured, officers, beneficiaries) against SDN list
        - Screen at application, policy changes, claims, and payments
        - Block transactions if match found
        - Report to OFAC within 10 business days
        - Maintain records for 5 years
        """)
        
        ofac_rules = get_all_compliance_rules(category="ofac", status="active")
        for rule in ofac_rules:
            st.markdown(f"- **{rule['code']}**: {rule['title']}")
    
    # NYFTZ Quick Guide
    with st.expander("🟠 NY Free Trade Zone Eligibility", expanded=False):
        st.markdown("""
        **Eligibility Criteria:**
        - **Class 1**: Premium ≥ \\$100K for one kind, or ≥ \\$200K for multiple (no single kind > \\$100K)
        - **Class 2**: Unusual, high hazard, or difficult to place risks
        
        **Requirements:**
        - Insurer must hold Article 63 license
        - File Annual FTZ Report
        - File Schedule C-1 quarterly reports
        - Comply with NYDFS Cybersecurity Regulation for cyber policies
        """)
        
        nyftz_rules = get_all_compliance_rules(category="nyftz", status="active")
        for rule in nyftz_rules:
            st.markdown(f"- **{rule['code']}**: {rule['title']}")
    
    # Service of Suit Quick Guide
    with st.expander("🔵 Service of Suit Requirements", expanded=False):
        st.markdown("""
        **General Requirements:**
        - Include Service of Suit clause in all policies
        - Designate agent authorized to accept service of process
        - Ensure compliance with state-specific requirements
        
        **State-Specific:**
        - California: Designate CA-licensed agent or Insurance Commissioner
        - Other states: Follow NAIC Service of Suit Model Regulation
        """)
        
        sos_rules = get_all_compliance_rules(category="service_of_suit", status="active")
        for rule in sos_rules:
            st.markdown(f"- **{rule['code']}**: {rule['title']}")
    
    # State Rules Quick Guide
    with st.expander("🟢 State-Specific Requirements", expanded=False):
        st.markdown("""
        **Common State Requirements:**
        - **Surplus Lines Stamping**: Required in FL, TX, IL, and others
        - **Cancellation Notices**: Vary by state (CA: 10-60 days)
        - **Disclosure Notices**: Required in NY and other states
        - **Tax Requirements**: State-specific surplus lines taxes
        """)
        
        state_rules = get_all_compliance_rules(category="state_rule", status="active")
        notice_rules = get_all_compliance_rules(category="notice_stamping", status="active")
        all_state = state_rules + notice_rules
        
        # Group by state
        by_state = {}
        for rule in all_state:
            states = rule.get("applies_to_states") or ["All"]
            for state in states:
                if state not in by_state:
                    by_state[state] = []
                by_state[state].append(rule)
        
        for state in sorted(by_state.keys()):
            with st.expander(f"{state} ({len(by_state[state])} rules)", expanded=False):
                for rule in by_state[state]:
                    st.markdown(f"- **{rule['code']}**: {rule['title']}")


def _render_rule_card(rule: Dict[str, Any]):
    """Render a single compliance rule card."""
    
    with st.container():
        # Header with priority indicator
        priority_icon = PRIORITY_COLORS.get(rule["priority"], "⚪")
        category_label = CATEGORY_LABELS.get(rule["category"], rule["category"])
        
        col_header, col_meta = st.columns([3, 1])
        
        with col_header:
            st.markdown(f"**{priority_icon} {rule['code']}: {rule['title']}**")
            st.caption(f"{category_label}" + (f" · {rule['subcategory']}" if rule.get('subcategory') else ""))
        
        with col_meta:
            st.caption(f"Priority: {rule['priority'].title()}")
            if rule.get("applies_to_states"):
                st.caption(f"States: {', '.join(rule['applies_to_states'])}")
            elif rule.get("applies_to_jurisdictions"):
                st.caption(f"Jurisdictions: {', '.join(rule['applies_to_jurisdictions'])}")
            else:
                st.caption("All jurisdictions")
        
        # Description
        description = escape_dollar_signs(rule.get('description', ''))
        st.markdown(f"**Description:** {description}")
        
        # Requirements
        if rule.get("requirements"):
            with st.expander("📋 Requirements", expanded=False):
                st.markdown(escape_dollar_signs(rule["requirements"]))
        
        # Procedures
        if rule.get("procedures"):
            with st.expander("⚙️ Procedures", expanded=False):
                st.markdown(escape_dollar_signs(rule["procedures"]))
        
        # Compliance flags
        flags = []
        if rule.get("requires_endorsement"):
            flags.append(f"📄 Requires Endorsement: {rule.get('required_endorsement_code', 'N/A')}")
        if rule.get("requires_notice"):
            flags.append("📢 Requires Notice")
            if rule.get("notice_text"):
                with st.expander("📢 Required Notice Text", expanded=False):
                    st.text(rule["notice_text"])
        if rule.get("requires_stamping"):
            flags.append(f"🏷️ Requires Stamping: {rule.get('stamping_office', 'N/A')}")
        
        if flags:
            st.info(" | ".join(flags))
        
        # Legal reference and source
        if rule.get("legal_reference") or rule.get("source_url"):
            col_ref, col_url = st.columns(2)
            with col_ref:
                if rule.get("legal_reference"):
                    st.caption(f"📜 Legal: {rule['legal_reference']}")
            with col_url:
                if rule.get("source_url"):
                    st.markdown(f"[🔗 Source]({rule['source_url']})", unsafe_allow_html=True)
        
        # Rule type and check config
        if rule.get("rule_type") == "automatic_check" and rule.get("check_config"):
            with st.expander("🤖 Automated Check Configuration", expanded=False):
                st.json(rule["check_config"])
        
        st.markdown("---")

