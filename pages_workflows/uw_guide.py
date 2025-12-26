"""
UW Guide Workflow
=================
Underwriter reference guide with conflict catalog, guidelines, and best practices.
"""

import streamlit as st
from sqlalchemy import text
import json

from core.db import get_conn


def render():
    """Main render function for UW Guide page."""
    st.title("📚 Underwriter Guide")
    st.markdown("Reference materials and tools for underwriting decisions")

    # Create tabs
    tab1, tab2, tab3, tab4 = st.tabs([
        "🔍 Common Conflicts",
        "📋 Field Definitions",
        "📖 Guidelines",
        "❓ Supplemental Questions",
    ])

    with tab1:
        render_conflicts_tab()

    with tab2:
        render_field_definitions_tab()

    with tab3:
        render_guidelines_tab()

    with tab4:
        render_supplemental_questions_tab()


def render_conflicts_tab():
    """Render the Common Conflicts tab with conflict catalog."""
    st.header("Common Application Conflicts")
    st.markdown("""
    This catalog contains known contradiction patterns found in cyber insurance applications.
    These conflicts are automatically detected during application processing.
    """)

    # Filters
    col1, col2, col3 = st.columns(3)
    with col1:
        category_filter = st.selectbox(
            "Category",
            ["All", "edr", "mfa", "backup", "business_model", "scale", "access_control", "incident_response", "data_handling"],
            key="conflict_category_filter",
        )
    with col2:
        severity_filter = st.selectbox(
            "Severity",
            ["All", "critical", "high", "medium", "low"],
            key="conflict_severity_filter",
        )
    with col3:
        source_filter = st.selectbox(
            "Source",
            ["All", "system", "llm_discovered", "uw_added"],
            key="conflict_source_filter",
        )

    # Load conflict rules
    rules = load_conflict_rules(
        category=category_filter if category_filter != "All" else None,
        severity=severity_filter if severity_filter != "All" else None,
        source=source_filter if source_filter != "All" else None,
    )

    if not rules:
        st.info("No conflict rules found matching the filters.")
        return

    # Display summary stats
    st.markdown(f"**{len(rules)} conflict rules** in catalog")

    # Display each rule as an expandable card
    for rule in rules:
        render_conflict_rule_card(rule)


def render_conflict_rule_card(rule: dict):
    """Render a single conflict rule as an expandable card."""
    severity = rule.get("severity", "medium")
    severity_colors = {
        "critical": "🔴",
        "high": "🟠",
        "medium": "🟡",
        "low": "🟢",
    }
    severity_icon = severity_colors.get(severity, "⚪")

    # Header with severity indicator
    title = rule.get("title", rule.get("rule_name", "Unknown"))
    category = rule.get("category", "general")
    times_detected = rule.get("times_detected", 0)
    times_confirmed = rule.get("times_confirmed", 0)
    times_dismissed = rule.get("times_dismissed", 0)

    # Calculate confirmation rate
    total_resolutions = times_confirmed + times_dismissed
    conf_rate = (times_confirmed / total_resolutions * 100) if total_resolutions > 0 else None

    header = f"{severity_icon} **{title}**"
    if times_detected > 0:
        header += f" — *{times_detected} detections*"

    with st.expander(header, expanded=False):
        # Rule metadata
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.markdown(f"**Category:** `{category}`")
        with col2:
            st.markdown(f"**Severity:** `{severity}`")
        with col3:
            source = rule.get("source", "system")
            source_labels = {
                "system": "📦 System",
                "llm_discovered": "🤖 AI Discovered",
                "uw_added": "👤 UW Added",
            }
            st.markdown(f"**Source:** {source_labels.get(source, source)}")
        with col4:
            if conf_rate is not None:
                st.markdown(f"**Confirmation Rate:** {conf_rate:.0f}%")
            else:
                st.markdown("**Confirmation Rate:** N/A")

        # Description
        description = rule.get("description")
        if description:
            st.markdown("---")
            st.markdown(f"**Description:**\n{description}")

        # Example
        example_bad = rule.get("example_bad")
        example_explanation = rule.get("example_explanation")
        if example_bad:
            st.markdown("---")
            st.markdown("**Example of Conflict:**")
            if isinstance(example_bad, str):
                try:
                    example_bad = json.loads(example_bad)
                except json.JSONDecodeError:
                    pass

            if isinstance(example_bad, dict):
                st.json(example_bad)
            else:
                st.code(str(example_bad))

            if example_explanation:
                st.markdown(f"*{example_explanation}*")

        # Detection pattern (for advanced users)
        detection_pattern = rule.get("detection_pattern")
        if detection_pattern:
            with st.expander("Detection Pattern (Technical)", expanded=False):
                if isinstance(detection_pattern, str):
                    try:
                        detection_pattern = json.loads(detection_pattern)
                    except json.JSONDecodeError:
                        pass
                st.json(detection_pattern)

        # Status indicators
        if rule.get("requires_review"):
            st.warning("⚠️ This rule was discovered by AI and needs review")

        if not rule.get("is_active", True):
            st.error("❌ This rule is currently disabled")


def load_conflict_rules(
    category: str | None = None,
    severity: str | None = None,
    source: str | None = None,
) -> list[dict]:
    """Load conflict rules from the database with optional filters."""
    try:
        with get_conn() as conn:
            where_clauses = ["is_active = true"]
            params = {}

            if category:
                where_clauses.append("category = :category")
                params["category"] = category
            if severity:
                where_clauses.append("severity = :severity")
                params["severity"] = severity
            if source:
                where_clauses.append("source = :source")
                params["source"] = source

            where_sql = " AND ".join(where_clauses)

            result = conn.execute(text(f"""
                SELECT
                    id, rule_name, category, severity, title, description,
                    detection_pattern, example_bad, example_explanation,
                    times_detected, times_confirmed, times_dismissed,
                    source, is_active, requires_review,
                    created_at, updated_at, last_detected_at
                FROM conflict_rules
                WHERE {where_sql}
                ORDER BY
                    CASE severity
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        ELSE 4
                    END,
                    times_detected DESC,
                    rule_name
            """), params)

            return [
                {
                    "id": str(row[0]),
                    "rule_name": row[1],
                    "category": row[2],
                    "severity": row[3],
                    "title": row[4],
                    "description": row[5],
                    "detection_pattern": row[6],
                    "example_bad": row[7],
                    "example_explanation": row[8],
                    "times_detected": row[9] or 0,
                    "times_confirmed": row[10] or 0,
                    "times_dismissed": row[11] or 0,
                    "source": row[12],
                    "is_active": row[13],
                    "requires_review": row[14],
                    "created_at": row[15],
                    "updated_at": row[16],
                    "last_detected_at": row[17],
                }
                for row in result.fetchall()
            ]
    except Exception as e:
        st.error(f"Error loading conflict rules: {e}")
        return []


def render_field_definitions_tab():
    """Render field definitions for reference."""
    st.header("Application Field Definitions")
    st.markdown("Reference guide for common application fields and their meanings.")

    # EDR Section
    with st.expander("🛡️ EDR (Endpoint Detection & Response)", expanded=False):
        st.markdown("""
        **hasEdr** - Does the organization have EDR deployed?

        **edrVendor** - Which EDR product is used? Common vendors:
        - CrowdStrike Falcon
        - SentinelOne
        - Microsoft Defender for Endpoint
        - Carbon Black
        - Cortex XDR

        **edrEndpointCoveragePercent** - What percentage of endpoints have EDR installed?

        **eppedrOnDomainControllers** - Is EDR specifically deployed on domain controllers?
        """)

    # MFA Section
    with st.expander("🔐 MFA (Multi-Factor Authentication)", expanded=False):
        st.markdown("""
        **hasMfa** - Does the organization use MFA?

        **mfaType** - Type of MFA used:
        - Authenticator App (TOTP)
        - Hardware Token (FIDO2/YubiKey)
        - SMS (less secure)
        - Push Notification
        - Biometric

        **remoteAccessMfa** - Is MFA required for remote access?

        **mfaForRemoteAccess** - Alternate field for same concept

        **mfaForCriticalInfoAccess** - Is MFA required for accessing critical systems?

        **emailMfa** - Is MFA required for email access?
        """)

    # Backup Section
    with st.expander("💾 Backups", expanded=False):
        st.markdown("""
        **hasBackups** - Does the organization perform regular backups?

        **backupFrequency** - How often are backups performed?
        - Real-time / Continuous
        - Daily
        - Weekly
        - Monthly

        **offlineBackups** - Are backups stored offline (air-gapped)?

        **offsiteBackups** - Are backups stored at a different location?

        **immutableBackups** - Are backups immutable (cannot be modified or deleted)?

        **encryptedBackups** - Are backups encrypted?

        **backupTestingFrequency** - How often are backup restorations tested?
        """)

    # Business Model Section
    with st.expander("🏢 Business Model", expanded=False):
        st.markdown("""
        **businessModel** - B2B, B2C, or B2B2C

        **collectsPii** - Does the business collect Personally Identifiable Information?
        - B2C businesses almost always collect PII

        **handlesCreditCards** - Does the business handle credit card data?
        - E-commerce businesses typically handle payment data

        **hasCustomerData** - Does the business store customer data?

        **employeeCount** - Number of employees
        - Used for scale-based plausibility checks
        """)


def render_guidelines_tab():
    """Render general underwriting guidelines."""
    st.header("Underwriting Guidelines")
    st.markdown("General guidelines and best practices for cyber underwriting.")

    with st.expander("📊 Credibility Score Interpretation", expanded=True):
        st.markdown("""
        The **Application Credibility Score** measures the consistency and sophistication
        of application responses. It has three dimensions:

        | Dimension | Weight | What it Measures |
        |-----------|--------|------------------|
        | Consistency | 40% | Are answers internally coherent? |
        | Plausibility | 35% | Do answers fit the business model? |
        | Completeness | 25% | Were questions answered thoughtfully? |

        **Score Interpretation:**

        | Score | Label | Meaning | Recommended Action |
        |-------|-------|---------|-------------------|
        | 90-100 | Excellent | Consistent, plausible, thorough | Standard review |
        | 80-89 | Good | Minor issues, likely mistakes | Note issues, proceed |
        | 70-79 | Fair | Some concerns | Extra scrutiny |
        | 60-69 | Poor | Multiple issues | Request clarification |
        | <60 | Very Poor | Significant credibility issues | May need new application |
        """)

    with st.expander("🚨 Red Flags to Watch For", expanded=False):
        st.markdown("""
        **Direct Contradictions:**
        - "No EDR" but names an EDR vendor
        - "No MFA" but specifies MFA type
        - "No backups" but specifies backup frequency

        **Business Model Implausibility:**
        - B2C e-commerce claiming no PII collection
        - Healthcare provider claiming no PHI
        - SaaS company claiming no customer data

        **Scale Mismatches:**
        - 500+ employees with no dedicated security team
        - $100M+ revenue with no written security policies
        - Large company with no incident response plan

        **Answer Pattern Red Flags:**
        - All security questions answered "Yes"
        - Identical answers in multiple free-form fields
        - Nonsense or placeholder text
        """)

    with st.expander("✅ Mandatory Controls", expanded=False):
        st.markdown("""
        The following controls are considered mandatory for most cyber policies:

        **Authentication:**
        - MFA for email access
        - MFA for remote access
        - MFA for privileged accounts

        **Endpoint Security:**
        - EDR on all endpoints
        - EDR on domain controllers

        **Backup & Recovery:**
        - Regular backups
        - Offline/air-gapped backups
        - Encrypted backups
        - Immutable backups

        **Training:**
        - Phishing simulation training

        Controls marked as "Not Asked" in the application may require follow-up.
        """)


def render_supplemental_questions_tab():
    """Render supplemental questions for specific risk areas."""
    st.header("Supplemental Questions")
    st.markdown("""
    Use these supplemental questions when the application or business profile indicates
    specific risk exposures that require deeper investigation.
    """)

    # Filter by category
    categories = [
        "All",
        "Wrongful Collection",
        "Biometric Data",
        "OT/ICS Exposure",
        "Healthcare/PHI",
        "Financial Services",
        "Cryptocurrency",
        "AI/ML Operations",
        "Media/Content",
    ]
    selected_category = st.selectbox("Filter by Risk Area", categories)

    # Wrongful Collection
    if selected_category in ["All", "Wrongful Collection"]:
        with st.expander("🔒 Wrongful Collection / Privacy Violations", expanded=selected_category == "Wrongful Collection"):
            st.markdown("""**When to Ask:** B2C companies, marketing/advertising firms, data brokers,
companies with significant web presence, mobile apps, or customer analytics.""")
            st.markdown("---")
            st.markdown("""**Data Collection Practices:**

1. Do you collect personal data from website visitors (cookies, tracking pixels, analytics)?
2. Do you purchase or license consumer data from third-party data brokers?
3. Do you share or sell consumer data to third parties?
4. Do you use pixel tracking or similar technologies from Meta, Google, or other ad networks?""")
            st.markdown("""**Consent & Compliance:**

5. Do you have a documented process for obtaining consent before collecting personal data?
6. Is your privacy policy reviewed by legal counsel at least annually?
7. Do you have a mechanism for consumers to opt-out of data collection or request deletion?
8. Have you conducted a data mapping exercise to identify all PII/sensitive data collected?""")
            st.markdown("""**State Privacy Law Compliance:**

9. Are you aware of and compliant with CCPA/CPRA (California)?
10. Do you have processes to handle consumer rights requests (access, deletion, correction)?
11. Do you track which states your customers/users reside in for privacy law applicability?""")
            st.markdown("""**Historical Issues:**

12. Have you received any complaints or regulatory inquiries related to data collection practices?
13. Have you been named in any class action lawsuits related to privacy or data collection?
14. Have you ever had to modify data collection practices due to legal concerns?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- No privacy policy or outdated policy
- Uses tracking pixels without clear disclosure
- Purchases consumer data without documented consent chain
- B2C company claiming "no PII collection"
""")

    # Biometric Data
    if selected_category in ["All", "Biometric Data"]:
        with st.expander("👁️ Biometric Data Exposure", expanded=selected_category == "Biometric Data"):
            st.markdown("""**When to Ask:** Companies using facial recognition, fingerprint scanners,
voice recognition, employee time clocks with biometrics, or physical access controls.""")
            st.markdown("---")
            st.markdown("""**Biometric Data Collection:**

1. Do you collect any biometric data (fingerprints, facial geometry, voiceprints, retinal scans)?
2. What is the purpose of biometric data collection (employee access, customer authentication, other)?
3. Approximately how many individuals' biometric data do you store?
4. Where is biometric data stored (on-premise, cloud, third-party vendor)?""")
            st.markdown("""**BIPA Compliance (Illinois Biometric Information Privacy Act):**

5. Do you have a written policy for biometric data retention and destruction?
6. Do you obtain written consent before collecting biometric data?
7. Is consent obtained separately from general employment/service agreements?
8. Do you inform individuals of the specific purpose and duration of biometric data use?""")
            st.markdown("""**Security Controls:**

9. Is biometric data encrypted at rest and in transit?
10. Who has access to raw biometric data within your organization?
11. Do you share biometric data with any third parties?
12. What is your retention period for biometric data after the relationship ends?""")
            st.markdown("""**Vendor Management:**

13. If using a third-party biometric system, have you reviewed their BIPA compliance?
14. Does your vendor contract include indemnification for biometric data claims?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- Uses biometric time clocks but unaware of BIPA
- No written biometric data policy
- Biometric data shared with vendors without contractual protections
- Illinois employees/customers with biometric data collection
""")

    # OT/ICS Exposure
    if selected_category in ["All", "OT/ICS Exposure"]:
        with st.expander("🏭 Operational Technology (OT/ICS) Exposure", expanded=selected_category == "OT/ICS Exposure"):
            st.markdown("""**When to Ask:** Manufacturing, utilities, oil & gas, transportation,
water treatment, building automation, or any company with industrial control systems.""")
            st.markdown("---")
            st.markdown("""**OT Environment Overview:**

1. Do you operate any industrial control systems (ICS), SCADA, PLCs, or other OT systems?
2. What critical processes are controlled by OT systems (manufacturing, utilities, building systems)?
3. Are OT systems connected to the corporate IT network in any way?
4. Do you have remote access capabilities to OT systems?""")
            st.markdown("""**Network Segmentation:**

5. Is there a demilitarized zone (DMZ) between IT and OT networks?
6. Are OT systems on a physically or logically separate network?
7. What controls prevent lateral movement from IT to OT networks?
8. Do you use unidirectional security gateways (data diodes)?""")
            st.markdown("""**Access Controls:**

9. Is MFA required for any remote access to OT systems?
10. Are default passwords changed on all OT devices and systems?
11. Do you maintain an inventory of all OT assets and their firmware versions?
12. Who has administrative access to OT systems?""")
            st.markdown("""**Patching & Monitoring:**

13. What is your patching cadence for OT systems?
14. Do you have visibility/monitoring of OT network traffic?
15. Are OT systems included in your vulnerability scanning program?
16. Do you have an OT-specific incident response plan?""")
            st.markdown("""**Safety & Redundancy:**

17. Can critical processes be operated manually if OT systems fail?
18. What physical safety systems are in place independent of digital controls?
19. Have you conducted a cyber-physical impact assessment?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- OT systems directly connected to internet
- No network segmentation between IT and OT
- Default credentials on OT devices
- No visibility into OT network traffic
- Remote access without MFA
""")

    # Healthcare/PHI
    if selected_category in ["All", "Healthcare/PHI"]:
        with st.expander("🏥 Healthcare / PHI Exposure", expanded=selected_category == "Healthcare/PHI"):
            st.markdown("""**When to Ask:** Healthcare providers, health tech companies, insurers,
business associates, or any company handling protected health information.""")
            st.markdown("---")
            st.markdown("""**PHI Handling:**

1. Do you create, receive, maintain, or transmit protected health information (PHI)?
2. Approximately how many patient/member records do you maintain?
3. Do you process PHI on behalf of covered entities (business associate)?
4. Is PHI stored in cloud environments? If so, which providers?""")
            st.markdown("""**HIPAA Compliance:**

5. Have you conducted a HIPAA Security Risk Assessment in the past 12 months?
6. Do you have documented HIPAA policies and procedures?
7. Do you have a designated HIPAA Security Officer and Privacy Officer?
8. Do all workforce members complete HIPAA training annually?""")
            st.markdown("""**Technical Safeguards:**

9. Is PHI encrypted at rest and in transit?
10. Do you maintain audit logs of PHI access?
11. Are there automatic session timeouts for systems containing PHI?
12. Do you have data loss prevention (DLP) controls for PHI?""")
            st.markdown("""**Business Associates:**

13. Do you have BAAs (Business Associate Agreements) with all vendors handling PHI?
14. Do you assess the security posture of business associates?
15. How do you handle PHI in your software development/testing environments?""")
            st.markdown("""**Incident History:**

16. Have you experienced any breaches involving PHI in the past 5 years?
17. Have you reported any breaches to HHS/OCR?
18. Have you been subject to OCR audits or investigations?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- No recent HIPAA risk assessment
- PHI in unencrypted emails
- Missing BAAs with vendors
- No designated HIPAA officers
""")

    # Financial Services
    if selected_category in ["All", "Financial Services"]:
        with st.expander("🏦 Financial Services / PCI Exposure", expanded=selected_category == "Financial Services"):
            st.markdown("""**When to Ask:** Banks, credit unions, fintech, payment processors,
e-commerce with payment processing, or companies with PCI scope.""")
            st.markdown("---")
            st.markdown("""**Payment Card Data:**

1. Do you store, process, or transmit payment card data?
2. What is your PCI DSS compliance level (1-4)?
3. When was your last PCI DSS assessment/SAQ completed?
4. Do you use a payment gateway/processor, or handle card data directly?""")
            st.markdown("""**Financial Regulations:**

5. Are you subject to GLBA, SOX, or state financial regulations?
6. Do you have a written information security program (WISP)?
7. Have you completed a SOC 2 audit? Type I or Type II?
8. Do you have cyber insurance requirements from regulators or banking partners?""")
            st.markdown("""**Wire Transfer / Payment Controls:**

9. What controls are in place for wire transfers or large payments?
10. Do you require dual authorization for payments above a threshold?
11. Do you use out-of-band verification for payment instruction changes?
12. Have you experienced any business email compromise (BEC) attempts?""")
            st.markdown("""**Third-Party Risk:**

13. Do you use third-party payment processors or banking APIs?
14. How do you assess the security of fintech/banking partners?
15. Do you have contractual security requirements for financial service providers?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- Storing card data without PCI compliance
- No dual controls on wire transfers
- Direct card processing without tokenization
- Missing SOC 2 for customer-facing financial services
""")

    # Cryptocurrency
    if selected_category in ["All", "Cryptocurrency"]:
        with st.expander("₿ Cryptocurrency / Digital Assets", expanded=selected_category == "Cryptocurrency"):
            st.markdown("""**When to Ask:** Crypto exchanges, DeFi platforms, NFT marketplaces,
companies holding crypto treasury, or blockchain/Web3 companies.""")
            st.markdown("---")
            st.markdown("""**Digital Asset Holdings:**

1. Do you hold cryptocurrency or digital assets on behalf of customers?
2. What is the approximate value of digital assets under custody?
3. Do you hold cryptocurrency in your corporate treasury?
4. What cryptocurrencies/tokens do you support or hold?""")
            st.markdown("""**Wallet Security:**

5. What percentage of assets are held in cold storage vs. hot wallets?
6. Do you use multi-signature wallets for significant holdings?
7. What is your key management process for private keys?
8. Are private keys stored in hardware security modules (HSMs)?""")
            st.markdown("""**Smart Contract Risk:**

9. Do you deploy or interact with smart contracts?
10. Have your smart contracts been audited by a reputable firm?
11. Do you have a bug bounty program for smart contract vulnerabilities?
12. Have you experienced any smart contract exploits or losses?""")
            st.markdown("""**Regulatory & Compliance:**

13. Are you registered as a Money Services Business (MSB)?
14. Do you have AML/KYC procedures in place?
15. Have you been subject to any regulatory actions related to digital assets?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- Majority of assets in hot wallets
- No smart contract audits
- Single-signature wallets for large holdings
- Unregistered money transmission
""")

    # AI/ML Operations
    if selected_category in ["All", "AI/ML Operations"]:
        with st.expander("🤖 AI/ML Operations", expanded=selected_category == "AI/ML Operations"):
            st.markdown("""**When to Ask:** Companies deploying AI/ML in production, especially for
decision-making, content generation, or customer-facing applications.""")
            st.markdown("---")
            st.markdown("""**AI/ML Usage:**

1. Do you use AI/ML models in production systems?
2. What decisions or outputs are influenced by AI/ML (underwriting, content, recommendations)?
3. Do you use third-party AI services (OpenAI, Anthropic, Google) or build your own models?
4. Are AI outputs reviewed by humans before customer-facing use?""")
            st.markdown("""**Training Data & Bias:**

5. What data is used to train your AI models?
6. Have you assessed your models for bias or discriminatory outcomes?
7. Do you have documentation of training data sources and provenance?
8. How do you handle personal data in training datasets?""")
            st.markdown("""**Content Generation Risk:**

9. Do you use generative AI for content creation (text, images, code)?
10. Do you have policies governing AI-generated content attribution?
11. How do you review AI outputs for accuracy and appropriateness?
12. Have you had any issues with AI-generated content (hallucinations, copyright)?""")
            st.markdown("""**Governance & Controls:**

13. Do you have an AI governance policy or ethics framework?
14. Is there human oversight for high-stakes AI decisions?
15. Do you maintain audit trails of AI model versions and decisions?
16. How do you handle AI model failures or unexpected outputs?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- AI making autonomous high-stakes decisions
- No bias testing on ML models
- Training on data without proper rights
- No human review of AI outputs
""")

    # Media/Content
    if selected_category in ["All", "Media/Content"]:
        with st.expander("📺 Media / Content Liability", expanded=selected_category == "Media/Content"):
            st.markdown("""**When to Ask:** Publishers, broadcasters, ad agencies, social media companies,
user-generated content platforms, or companies with significant content operations.""")
            st.markdown("---")
            st.markdown("""**Content Operations:**

1. Do you publish, broadcast, or distribute content (news, entertainment, advertising)?
2. Do you host user-generated content on your platforms?
3. What content moderation practices do you have in place?
4. Do you use AI for content moderation or generation?""")
            st.markdown("""**Intellectual Property:**

5. Do you have processes to verify rights/licenses for content you publish?
6. How do you handle DMCA takedown requests?
7. Have you received any copyright infringement claims in the past 3 years?
8. Do you use stock media, and if so, do you verify licensing compliance?""")
            st.markdown("""**Defamation & Liability:**

9. Do you have editorial review processes before publication?
10. Do you publish opinion/editorial content that could be considered defamatory?
11. Have you been named in any defamation or libel lawsuits?
12. Do you have media liability insurance separate from cyber?""")
            st.markdown("""**User-Generated Content:**

13. What are your terms of service regarding user content?
14. Do you have a process for handling complaints about user content?
15. How quickly can you remove content flagged for legal issues?
16. Do you retain records of removed content and removal reasons?""")
            st.markdown("---")
            st.markdown("""**Red Flags:**
- No content moderation for UGC platforms
- No editorial review process
- History of IP or defamation claims
- Unclear content licensing practices
""")
