"""
Conflict Detection Configuration

Central configuration for the conflict detection and review system.
Supports switching between eager, lazy, and hybrid detection strategies.

See docs/conflict_review_implementation_plan.md for full documentation.
"""

from __future__ import annotations

import os
from enum import Enum
from typing import Literal


class DetectionStrategy(Enum):
    """
    Detection strategy determines WHEN conflict detection runs.

    EAGER: Run detection immediately after each field value write.
           Pros: Conflicts visible instantly, no latency on read.
           Cons: Higher write overhead, may detect conflicts user doesn't care about.

    LAZY: Run detection only when conflicts are requested (on UI load).
          Pros: No write overhead, only compute what's needed.
          Cons: First page load may be slower.

    HYBRID: Eager for critical fields, lazy for everything else.
            Pros: Balance of responsiveness and performance.
            Cons: More complex, need to maintain critical field list.
    """
    EAGER = "eager"
    LAZY = "lazy"
    HYBRID = "hybrid"


# =============================================================================
# STRATEGY CONFIGURATION
# =============================================================================

def get_detection_strategy() -> DetectionStrategy:
    """
    Get the current detection strategy.

    Checks in order:
    1. Environment variable CONFLICT_DETECTION_STRATEGY
    2. Default to EAGER

    To switch strategies, set the environment variable:
        export CONFLICT_DETECTION_STRATEGY=lazy
    """
    strategy_str = os.getenv("CONFLICT_DETECTION_STRATEGY", "eager").lower()
    try:
        return DetectionStrategy(strategy_str)
    except ValueError:
        return DetectionStrategy.EAGER


# =============================================================================
# TYPE DEFINITIONS
# =============================================================================

ConflictType = Literal[
    "VALUE_MISMATCH",           # Same field has different values from different sources
    "LOW_CONFIDENCE",           # AI extraction confidence below threshold
    "MISSING_REQUIRED",         # Required field not extracted or empty
    "CROSS_FIELD",              # Logical inconsistency between related fields
    "DUPLICATE_SUBMISSION",     # Potential duplicate of existing submission
    "OUTLIER_VALUE",            # Value outside expected range
    "APPLICATION_CONTRADICTION", # Contradictory answers within the application
    "VERIFICATION_REQUIRED",    # Core sign-off item requiring human verification
]

ConflictPriority = Literal["high", "medium", "low"]

ReviewStatus = Literal["pending", "approved", "rejected", "deferred"]

SourceType = Literal[
    "ai_extraction",      # Extracted by AI from documents
    "document_form",      # Parsed from structured form fields
    "user_edit",          # Manually entered/edited by user
    "broker_submission",  # Provided in broker submission email
    "carried_over",       # Carried from prior/renewal submission
]


# =============================================================================
# FIELD CONFIGURATION
# =============================================================================

# Fields that are tracked for conflict detection
# Only these fields will have their values stored in field_values table
TRACKED_FIELDS: set[str] = {
    # Critical business info
    "applicant_name",
    "annual_revenue",
    "website",

    # Policy dates
    "effective_date",
    "expiration_date",

    # Classification
    "naics_primary_code",
    "naics_primary_title",
    "naics_secondary_code",

    # Broker info
    "broker_email",
    "broker_company",
}

# Fields that get EAGER detection even in HYBRID mode
# These are the most critical fields where conflicts matter most
EAGER_FIELDS: set[str] = {
    "applicant_name",
    "annual_revenue",
    "effective_date",
    "expiration_date",
    "broker_email",
}

# Fields that are REQUIRED for a submission to be complete
REQUIRED_FIELDS: list[str] = [
    "applicant_name",
    "annual_revenue",
    "effective_date",
]


# =============================================================================
# CONFIDENCE THRESHOLDS
# =============================================================================

class ConfidenceThreshold:
    """Thresholds for confidence-based review decisions."""

    # Above this: auto-accept, no review needed
    AUTO_ACCEPT: float = 0.90

    # Above this but below AUTO_ACCEPT: flag for quick verification
    NEEDS_VERIFICATION: float = 0.70

    # Below NEEDS_VERIFICATION: requires manual review/entry


# Default threshold for flagging low confidence
CONFIDENCE_THRESHOLD: float = ConfidenceThreshold.NEEDS_VERIFICATION


# =============================================================================
# VALIDATION RULES
# =============================================================================

# Cross-field validation rules
# Each rule defines fields that must satisfy a logical relationship
CROSS_FIELD_RULES: list[dict] = [
    {
        "name": "date_order",
        "fields": ["effective_date", "expiration_date"],
        "check": "effective_date_before_expiration",
        "message": "Expiration date must be after effective date",
    },
]

# Outlier detection ranges
# field_name -> (min_value, max_value)
# None means no bound on that side
OUTLIER_RANGES: dict[str, tuple[float | None, float | None]] = {
    "annual_revenue": (10_000, 100_000_000_000),  # $10K to $100B
}


# =============================================================================
# APPLICATION CONTRADICTION RULES
# =============================================================================
# Rules to detect contradictory answers within the same application form.
# Each rule checks: if field_a has value_a, then field_b should/shouldn't have value_b

APPLICATION_CONTRADICTION_RULES: list[dict] = [
    # EDR contradictions
    {
        "name": "edr_vendor_without_edr",
        "field_a": "hasEdr",
        "value_a": [False, "No", "no", "false"],
        "field_b": "edrVendor",
        "condition": "should_be_empty",  # field_b should be empty if field_a matches
        "message": "EDR vendor specified but EDR is marked as not present",
        "priority": "medium",
    },
    {
        "name": "edr_no_vendor",
        "field_a": "hasEdr",
        "value_a": [True, "Yes", "yes", "true"],
        "field_b": "edrVendor",
        "condition": "should_not_be_empty",  # field_b should have value if field_a matches
        "message": "EDR marked as present but no vendor specified",
        "priority": "low",
    },
    # MFA contradictions
    {
        "name": "mfa_type_without_mfa",
        "field_a": "hasMfa",
        "value_a": [False, "No", "no", "false"],
        "field_b": "mfaType",
        "condition": "should_be_empty",
        "message": "MFA type specified but MFA is marked as not present",
        "priority": "medium",
    },
    {
        "name": "remote_mfa_conflict",
        "field_a": "remoteAccessMfa",
        "value_a": [False, "No", "no", "false"],
        "field_b": "mfaForRemoteAccess",
        "condition": "should_not_be",
        "conflict_values": [True, "Yes", "yes", "true"],
        "message": "Conflicting answers about MFA for remote access",
        "priority": "high",
    },
    # Backup contradictions
    {
        "name": "backup_frequency_without_backups",
        "field_a": "hasBackups",
        "value_a": [False, "No", "no", "false"],
        "field_b": "backupFrequency",
        "condition": "should_be_empty",
        "message": "Backup frequency specified but backups marked as not present",
        "priority": "medium",
    },
    {
        "name": "immutable_without_backups",
        "field_a": "hasBackups",
        "value_a": [False, "No", "no", "false"],
        "field_b": "immutableBackups",
        "condition": "should_not_be",
        "conflict_values": [True, "Yes", "yes", "true"],
        "message": "Immutable backups enabled but backups marked as not present",
        "priority": "medium",
    },
    # Phishing training contradictions
    {
        "name": "phishing_frequency_without_training",
        "field_a": "conductsPhishingSimulations",
        "value_a": [False, "No", "no", "false"],
        "field_b": "phishingFrequency",
        "condition": "should_be_empty",
        "message": "Phishing simulation frequency specified but simulations marked as not conducted",
        "priority": "medium",
    },
    # Employee count vs security program
    {
        "name": "large_company_no_security_team",
        "field_a": "employeeCount",
        "value_a_check": "greater_than",
        "value_a_threshold": 500,
        "field_b": "hasDedicatedSecurityTeam",
        "condition": "should_not_be",
        "conflict_values": [False, "No", "no", "false"],
        "message": "Large organization (500+ employees) without dedicated security team",
        "priority": "medium",
    },
]


# =============================================================================
# CORE SIGN-OFF ITEMS
# =============================================================================
# Mandatory verification items that should be created for every submission.
# These require human sign-off regardless of whether there are conflicts.

CORE_SIGN_OFF_ITEMS: list[dict] = [
    {
        "name": "verify_broker",
        "field": "broker_email",
        "message": "Verify broker assignment is correct",
        "priority": "medium",
        "priority_if_auto": "high",  # Higher priority if broker was auto-assigned
        "description": "Confirm the submitting broker was correctly identified from the email chain",
    },
    {
        "name": "verify_revenue",
        "field": "annual_revenue",
        "message": "Verify annual revenue is accurate",
        "priority": "high",
        "description": "Confirm the extracted revenue matches the application and is reasonable for this business",
    },
    {
        "name": "verify_industry",
        "field": "naics_primary_code",
        "message": "Verify industry classification is correct",
        "priority": "medium",
        "description": "Confirm the AI-assigned NAICS code and industry tags accurately describe this business",
    },
    {
        "name": "verify_business_description",
        "field": "business_summary",
        "message": "Verify business description is accurate",
        "priority": "medium",
        "description": "Confirm the AI-generated business summary correctly describes what this company does",
    },
]


# =============================================================================
# CACHE CONFIGURATION
# =============================================================================

# How long to cache conflict detection results (seconds)
# After this, results are considered stale and will be re-detected on next read
CACHE_TTL_SECONDS: int = 3600  # 1 hour

# For EAGER mode, minimum seconds between re-detections for same submission
# Helps batch multiple rapid writes
DEBOUNCE_SECONDS: int = 5


# =============================================================================
# FIELD PRIORITY MAPPING
# =============================================================================

# High priority: Critical fields that may block workflow
_HIGH_PRIORITY_FIELDS: set[str] = {
    "applicant_name",
    "annual_revenue",
    "effective_date",
    "expiration_date",
}

# Medium priority: Important fields that should be reviewed
_MEDIUM_PRIORITY_FIELDS: set[str] = {
    "naics_primary_code",
    "broker_email",
    "website",
}


def get_field_priority(field_name: str) -> ConflictPriority:
    """
    Get the priority level for conflicts on a given field.

    High priority: Critical fields that may block workflow
    Medium priority: Important fields that should be reviewed
    Low priority: Nice-to-have fields, can be deferred
    """
    if field_name in _HIGH_PRIORITY_FIELDS:
        return "high"
    elif field_name in _MEDIUM_PRIORITY_FIELDS:
        return "medium"
    else:
        return "low"


def is_field_tracked(field_name: str) -> bool:
    """Check if a field should be tracked in field_values table."""
    return field_name in TRACKED_FIELDS


def is_eager_field(field_name: str) -> bool:
    """Check if a field should trigger eager detection in HYBRID mode."""
    return field_name in EAGER_FIELDS
