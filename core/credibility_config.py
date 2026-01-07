"""
Application Credibility Score Configuration

Defines rules and weights for calculating the credibility score of application responses.
The score measures consistency, plausibility, and completeness of answers.

Three dimensions (weighted):
- Consistency (40%): Internal answer coherence via CONSISTENCY_RULES
- Plausibility (35%): Business context fit via PLAUSIBILITY_RULES
- Completeness (25%): Answer quality via COMPLETENESS_POINTS

Score labels: excellent (90-100), good (80-89), fair (70-79), poor (60-69), very_poor (0-59)

See docs/uw-knowledge-base.md for full documentation.
"""

from __future__ import annotations

from typing import Literal


# =============================================================================
# SCORE WEIGHTS
# =============================================================================

# How much each dimension contributes to the final score
DIMENSION_WEIGHTS = {
    "consistency": 0.40,    # Are answers internally coherent?
    "plausibility": 0.35,   # Do answers fit the business model?
    "completeness": 0.25,   # Were questions answered thoughtfully?
}

# =============================================================================
# SEVERITY WEIGHTS FOR CONTRADICTIONS
# =============================================================================

SeverityLevel = Literal["critical", "high", "medium", "low"]

SEVERITY_WEIGHTS: dict[SeverityLevel, float] = {
    "critical": 3.0,  # Direct logical impossibility
    "high": 2.0,      # Conditional violation (answered "No" but filled "If yes...")
    "medium": 1.0,    # Unlikely combination
    "low": 0.5,       # Unusual but possible
}

# =============================================================================
# CONSISTENCY RULES
# =============================================================================
# Rules that detect contradictions between answer pairs.
# These feed into the consistency score.

CONSISTENCY_RULES: list[dict] = [
    # ─────────────── EDR Contradictions ───────────────
    # Field paths match standardized JSON: endpointSecurity.hasEdr, etc.
    {
        "name": "edr_coverage_without_edr",
        "severity": "critical",
        "field_a": "hasEdr",  # endpointSecurity.hasEdr
        "value_a": [False, "No", "no", "false", "FALSE", None],
        "field_b": "edrEndpointCoveragePercent",
        "condition": "should_be_empty_or_zero",
        "message": "Claims no EDR but specified EDR endpoint coverage",
    },
    {
        "name": "edr_server_coverage_without_edr",
        "severity": "critical",
        "field_a": "hasEdr",
        "value_a": [False, "No", "no", "false", "FALSE", None],
        "field_b": "edrServerCoveragePercent",
        "condition": "should_be_empty_or_zero",
        "message": "Claims no EDR but specified EDR server coverage",
    },
    # ─────────────── MFA/Access Contradictions ───────────────
    {
        "name": "email_mfa_without_remote_mfa",
        "severity": "high",
        "field_a": "remoteAccessMfa",  # remoteAccess.remoteAccessMfa
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "emailMfa",  # accessManagement.emailMfa
        "condition": "should_not_be",
        "conflict_values": [True, "Yes", "yes", "true", "TRUE"],
        "message": "Email MFA enabled but remote access MFA disabled",
    },
    {
        "name": "mfa_methods_without_mfa",
        "severity": "critical",
        "field_a": "emailMfa",
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "mfaMethods",
        "condition": "should_be_empty",
        "message": "Claims no email MFA but specified MFA methods",
    },
    {
        "name": "pam_mfa_without_pam",
        "severity": "high",
        "field_a": "privilegedAccessManagement",  # accessManagement.privilegedAccessManagement
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "pamRequiresMfa",
        "condition": "should_not_be",
        "conflict_values": [True, "Yes", "yes", "true", "TRUE"],
        "message": "PAM requires MFA but PAM is not deployed",
    },
    # ─────────────── Backup Contradictions ───────────────
    {
        "name": "backup_media_without_backups",
        "severity": "critical",
        "field_a": "hasBackups",  # backupAndRecovery.hasBackups
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "backupMedia",
        "condition": "should_be_empty",
        "message": "Claims no backups but specified backup media",
    },
    {
        "name": "backup_location_without_backups",
        "severity": "critical",
        "field_a": "hasBackups",
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "backupStorageLocation",
        "condition": "should_be_empty",
        "message": "Claims no backups but specified backup storage location",
    },
    {
        "name": "offline_keys_without_backups",
        "severity": "critical",
        "field_a": "hasBackups",
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "offlineEncryptionKeys",
        "condition": "should_not_be",
        "conflict_values": [True, "Yes", "yes", "true", "TRUE"],
        "message": "Claims offline encryption keys but no backups",
    },
    # ─────────────── Training Contradictions ───────────────
    {
        "name": "phishing_types_without_simulations",
        "severity": "critical",
        "field_a": "conductsPhishingSimulations",  # trainingAndAwareness.conductsPhishingSimulations
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "phishingSimulationTypes",
        "condition": "should_be_empty",
        "message": "Claims no phishing simulations but specified simulation types",
    },
    {
        "name": "phishing_click_rate_without_simulations",
        "severity": "high",
        "field_a": "conductsPhishingSimulations",
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "lastPhishingClickRate",
        "condition": "should_be_empty",
        "message": "Claims no phishing simulations but has click rate data",
    },
    {
        "name": "training_topics_without_training",
        "severity": "critical",
        "field_a": "mandatorySecurityTraining",
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "mandatoryTrainingTopics",
        "condition": "should_be_empty",
        "message": "Claims no mandatory training but specified training topics",
    },
    # ─────────────── SOC Contradictions ───────────────
    {
        "name": "soc_24x7_without_soc",
        "severity": "critical",
        "field_a": "hasSoc",  # securityManagement.hasSoc
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "socIs24x7",
        "condition": "should_not_be",
        "conflict_values": [True, "Yes", "yes", "true", "TRUE"],
        "message": "Claims 24x7 SOC but no SOC exists",
    },
    {
        "name": "soc_management_without_soc",
        "severity": "critical",
        "field_a": "hasSoc",
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "socManagement",
        "condition": "should_be_empty",
        "message": "Claims no SOC but specified SOC management type",
    },
    # ─────────────── Remote Access Contradictions ───────────────
    {
        "name": "rdp_controls_without_rdp",
        "severity": "high",
        "field_a": "rdpEnabled",  # remoteAccess.rdpEnabled
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "rdpControls",
        "condition": "should_be_empty",
        "message": "Claims no RDP but specified RDP controls",
    },
    {
        "name": "remote_solutions_without_remote_access",
        "severity": "critical",
        "field_a": "allowsRemoteAccess",  # remoteAccess.allowsRemoteAccess
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "remoteAccessSolutions",
        "condition": "should_be_empty",
        "message": "Claims no remote access but specified remote access solutions",
    },
    # ─────────────── Patch Management Contradictions ───────────────
    {
        "name": "patch_timeframe_without_patching",
        "severity": "high",
        "field_a": "centralPatchManagement",  # patchManagement.centralPatchManagement
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "criticalPatchTimeframe",
        "condition": "should_be_empty",
        "message": "Claims no central patch management but specified critical patch timeframe",
    },
    # ─────────────── OT Contradictions ───────────────
    {
        "name": "ot_mfa_without_ot_remote",
        "severity": "high",
        "field_a": "otRemotelyAccessible",  # operationalTechnology.otRemotelyAccessible
        "value_a": [False, "No", "no", "false", "FALSE"],
        "field_b": "otRemoteAccessMfa",
        "condition": "should_not_be",
        "conflict_values": [True, "Yes", "yes", "true", "TRUE"],
        "message": "Claims OT remote access MFA but OT is not remotely accessible",
    },
]


# =============================================================================
# PLAUSIBILITY RULES
# =============================================================================
# Rules that check if answers make sense given the business context.
# Context factors: industry, business model (B2B/B2C), company size, revenue.

BusinessModel = Literal["B2B", "B2C", "B2B2C", "B2G", "unknown"]

PLAUSIBILITY_RULES: list[dict] = [
    # ─────────────── B2C Business Model Rules ───────────────
    {
        "name": "b2c_no_pii",
        "severity": "high",
        "context": {"business_model": ["B2C", "B2B2C"]},
        "field": "collectsPii",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "B2C business claims no PII collection",
        "explanation": "Consumer-facing businesses typically collect names, addresses, emails",
    },
    {
        "name": "b2c_ecommerce_no_cards",
        "severity": "high",
        "context": {
            "business_model": ["B2C", "B2B2C"],
            "industry_keywords": ["ecommerce", "e-commerce", "retail", "online store"],
        },
        "field": "acceptsCreditCards",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "E-commerce business claims no credit card processing",
    },
    {
        "name": "b2c_no_customer_data",
        "severity": "medium",
        "context": {"business_model": ["B2C", "B2B2C"]},
        "field": "storesCustomerData",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "B2C business claims no customer data storage",
    },
    # ─────────────── Healthcare Industry Rules ───────────────
    {
        "name": "healthcare_no_phi",
        "severity": "critical",
        "context": {
            "naics_prefix": ["621", "622", "623"],  # Healthcare NAICS codes
            "industry_keywords": ["healthcare", "medical", "hospital", "clinic", "health"],
        },
        "field": "handlesPhi",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "Healthcare provider claims no PHI",
    },
    {
        "name": "healthcare_no_hipaa",
        "severity": "high",
        "context": {
            "naics_prefix": ["621", "622", "623"],
            "industry_keywords": ["healthcare", "medical", "hospital", "clinic"],
        },
        "field": "hipaaCompliant",
        "implausible_values": [False, "No", "no", "false", "FALSE", None],
        "message": "Healthcare provider not HIPAA compliant",
    },
    # ─────────────── Financial Services Rules ───────────────
    {
        "name": "financial_no_pci",
        "severity": "high",
        "context": {
            "naics_prefix": ["522", "523", "524"],  # Finance/Insurance NAICS
            "industry_keywords": ["bank", "financial", "payment", "fintech"],
        },
        "field": "pciCompliant",
        "implausible_values": [False, "No", "no", "false", "FALSE", None],
        "message": "Financial services company claims no PCI scope",
    },
    {
        "name": "financial_no_financial_data",
        "severity": "high",
        "context": {
            "naics_prefix": ["522", "523", "524"],
            "industry_keywords": ["bank", "financial", "payment"],
        },
        "field": "storesFinancialData",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "Financial services claims no financial data storage",
    },
    # ─────────────── SaaS/Tech Rules ───────────────
    {
        "name": "saas_no_customer_data",
        "severity": "medium",
        "context": {
            "industry_keywords": ["saas", "software", "cloud", "platform"],
            "business_model": ["B2B"],
        },
        "field": "storesCustomerData",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "SaaS company claims no customer data",
    },
    # ─────────────── Company Size Rules ───────────────
    {
        "name": "large_company_no_security_team",
        "severity": "medium",
        "context": {"employee_count_min": 500},
        "field": "hasDedicatedSecurityTeam",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "Large company (500+ employees) has no security team",
    },
    {
        "name": "large_company_no_ciso",
        "severity": "medium",
        "context": {"employee_count_min": 1000},
        "field": "hasCiso",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "Large company (1000+ employees) has no CISO",
    },
    {
        "name": "large_company_no_policies",
        "severity": "medium",
        "context": {"employee_count_min": 500},
        "field": "hasWrittenSecurityPolicies",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "Large company has no written security policies",
    },
    # ─────────────── Revenue-Based Rules ───────────────
    {
        "name": "high_revenue_no_cyber_insurance",
        "severity": "low",
        "context": {"revenue_min": 50_000_000},  # $50M+
        "field": "hasCyberInsurance",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "High-revenue company ($50M+) has no cyber insurance",
    },
    {
        "name": "high_revenue_no_ir_plan",
        "severity": "medium",
        "context": {"revenue_min": 25_000_000},  # $25M+
        "field": "hasIrPlan",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "High-revenue company ($25M+) has no IR plan",
    },
    # ─────────────── Government Contractor Rules ───────────────
    {
        "name": "gov_contractor_no_compliance",
        "severity": "high",
        "context": {
            "business_model": ["B2G"],
            "industry_keywords": ["government", "federal", "contractor", "defense"],
        },
        "field": "hasComplianceCertification",
        "implausible_values": [False, "No", "no", "false", "FALSE"],
        "message": "Government contractor claims no compliance certifications",
    },
]


# =============================================================================
# COMPLETENESS SCORING
# =============================================================================
# Points for quality indicators in responses.

COMPLETENESS_POINTS = {
    # Positive signals
    "question_answered": 1,           # Basic: question has a response
    "specific_vendor_named": 2,       # Named an actual vendor (not just "Yes")
    "percentage_provided": 2,         # Gave a specific percentage
    "date_provided": 2,               # Gave a specific date
    "freeform_explanation": 2,        # >20 chars in text field
    "na_with_reason": 1,              # Marked N/A with explanation

    # Negative signals
    "blank_required": -3,             # Required field left blank
    "nonsense_text": -5,              # "asdf", "test", "xxx", etc.
    "placeholder_text": -3,           # "TBD", "TODO", "N/A" without context
    "all_yes_pattern": -2,            # Per security question if all are "Yes"
    "all_no_pattern": -1,             # Per security question if all are "No"
    "identical_freeform": -2,         # Same text in multiple fields
}

# Patterns that indicate nonsense/placeholder text
NONSENSE_PATTERNS: list[str] = [
    r"^\.+$",                   # "...", "...."
    r"^-+$",                    # "---", "----"
    r"^tbd$",                   # "tbd"
    r"^todo$",                  # "todo"
    r"^x{2,}$",                 # "xx", "xxx", "xxxx" (but not single x)
    r"^\?+$",                   # "???", "????"
    r"^asdf",                   # "asdf", "asdfgh"
    r"^test$",                  # "test"
    r"^abc$",                   # "abc"
    r"^123$",                   # "123"
]

# Valid short answers that should NOT be flagged as nonsense
VALID_SHORT_ANSWERS: set[str] = {
    "yes", "no", "n/a", "na", "none", "other", "all", "some", "few",
    "daily", "weekly", "monthly", "quarterly", "annually", "yearly",
    "low", "medium", "high", "true", "false",
}

# Known security vendors (for detecting specific vs generic answers)
KNOWN_VENDORS: set[str] = {
    # EDR
    "crowdstrike", "sentinelone", "carbon black", "vmware carbon black",
    "microsoft defender", "defender for endpoint", "cylance", "sophos",
    "trend micro", "mcafee", "symantec", "cortex xdr", "palo alto",
    # MFA
    "duo", "okta", "microsoft authenticator", "google authenticator",
    "authy", "yubico", "yubikey", "rsa securid", "ping identity",
    # SIEM
    "splunk", "qradar", "sentinel", "azure sentinel", "elastic",
    "logrhythm", "sumo logic", "datadog", "chronicle",
    # PAM
    "cyberark", "beyondtrust", "thycotic", "delinea", "hashicorp vault",
    # Backup
    "veeam", "commvault", "rubrik", "cohesity", "acronis", "datto",
    "veritas", "carbonite", "backblaze",
    # Email Security
    "proofpoint", "mimecast", "barracuda", "abnormal security",
    # Network
    "cloudflare", "akamai", "zscaler", "palo alto", "fortinet",
}


# =============================================================================
# APP COMPLEXITY BASELINES
# =============================================================================
# Expected testable pairs by application type.

APP_COMPLEXITY: dict[str, dict] = {
    "simple": {
        "question_count_range": (1, 25),
        "testable_pairs": 15,
        "description": "Basic security questionnaire",
    },
    "standard": {
        "question_count_range": (26, 75),
        "testable_pairs": 40,
        "description": "Typical cyber application",
    },
    "complex": {
        "question_count_range": (76, 150),
        "testable_pairs": 80,
        "description": "Detailed supplemental application",
    },
    "extensive": {
        "question_count_range": (151, 999),
        "testable_pairs": 120,
        "description": "Full security assessment",
    },
}


def get_app_complexity(question_count: int) -> dict:
    """Determine app complexity tier based on question count."""
    for tier, config in APP_COMPLEXITY.items():
        min_q, max_q = config["question_count_range"]
        if min_q <= question_count <= max_q:
            return {"tier": tier, **config}
    return {"tier": "extensive", **APP_COMPLEXITY["extensive"]}


# =============================================================================
# SCORE INTERPRETATION
# =============================================================================

SCORE_LABELS: dict[str, tuple[int, int, str]] = {
    "excellent": (90, 100, "Consistent, plausible, thorough"),
    "good": (80, 89, "Minor issues, likely mistakes"),
    "fair": (70, 79, "Some concerns, extra scrutiny"),
    "poor": (60, 69, "Multiple issues, request clarification"),
    "very_poor": (0, 59, "Significant credibility issues"),
}


def get_score_label(score: float) -> tuple[str, str]:
    """Get the label and description for a score."""
    for label, (min_score, max_score, description) in SCORE_LABELS.items():
        if min_score <= score <= max_score:
            return label, description
    return "very_poor", SCORE_LABELS["very_poor"][2]
