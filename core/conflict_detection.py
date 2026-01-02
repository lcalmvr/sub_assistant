"""
Conflict Detection Logic

Pure, stateless detection functions. Takes data in, returns conflicts out.
No database calls, no side effects - easily testable.

See docs/conflict_review_implementation_plan.md for full documentation.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from core.conflict_config import (
    APPLICATION_CONTRADICTION_RULES,
    CONFIDENCE_THRESHOLD,
    CORE_SIGN_OFF_ITEMS,
    CROSS_FIELD_RULES,
    OUTLIER_RANGES,
    REQUIRED_FIELDS,
    ConflictPriority,
    ConflictType,
    get_field_priority,
)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ConflictResult:
    """Structured result from conflict detection."""
    conflict_type: ConflictType
    field_name: str | None  # None for submission-level conflicts
    priority: ConflictPriority
    message: str
    details: dict = field(default_factory=dict)
    conflicting_values: list[dict] = field(default_factory=list)


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def detect_conflicts(
    submission_id: str,
    field_values: list[dict],
    check_duplicates: bool = False,
    existing_submissions: list[dict] | None = None,
    app_data: dict | None = None,
    broker_info: dict | None = None,
    include_sign_offs: bool = True,
) -> list[ConflictResult]:
    """
    Detect all conflicts for a submission based on its field values.

    This is the main entry point. It orchestrates all detection types
    and returns a unified list of conflicts.

    Args:
        submission_id: UUID of the submission being checked
        field_values: List of field value dicts with keys:
            - field_name: str
            - value: any
            - source_type: str
            - confidence: float | None
            - id: str (field_value UUID)
        check_duplicates: Whether to check for duplicate submissions
        existing_submissions: For duplicate check, list of other submissions
            with keys: id, applicant_name, broker_email, date_received
        app_data: Raw application JSON for contradiction detection
        broker_info: Broker assignment info with 'confidence' and 'source' keys
        include_sign_offs: Whether to include core verification sign-off items

    Returns:
        List of ConflictResult objects
    """
    conflicts: list[ConflictResult] = []

    # 1. Value mismatches (same field, different values)
    conflicts.extend(detect_value_mismatches(field_values))

    # 2. Low confidence extractions
    conflicts.extend(detect_low_confidence(field_values))

    # 3. Missing required fields
    conflicts.extend(detect_missing_required(field_values))

    # 4. Cross-field logical conflicts
    conflicts.extend(detect_cross_field_conflicts(field_values))

    # 5. Outlier values
    conflicts.extend(detect_outliers(field_values))

    # 6. Duplicate submissions (optional, requires external data)
    if check_duplicates and existing_submissions:
        current_values = _get_active_values_dict(field_values)
        conflicts.extend(
            detect_duplicate_submission(current_values, existing_submissions)
        )

    # 7. Application contradictions (requires raw app data)
    if app_data:
        conflicts.extend(detect_application_contradictions(app_data))

    # 8. Core sign-off items (verification checkpoints)
    if include_sign_offs:
        conflicts.extend(detect_sign_off_required(field_values, broker_info))

    return conflicts


# =============================================================================
# DETECTION FUNCTIONS
# =============================================================================

def detect_value_mismatches(field_values: list[dict]) -> list[ConflictResult]:
    """
    Detect fields that have conflicting values from different sources.

    Groups field values by field_name, then checks if there are multiple
    distinct values for the same field.
    """
    conflicts = []

    # Group by field name
    by_field: dict[str, list[dict]] = defaultdict(list)
    for fv in field_values:
        if fv.get("is_active", True):  # Only consider active values
            by_field[fv["field_name"]].append(fv)

    for field_name, values in by_field.items():
        if len(values) < 2:
            continue

        # Get unique normalized values
        unique_values: dict[str, list[dict]] = defaultdict(list)
        for v in values:
            normalized = _normalize_for_comparison(v["value"])
            unique_values[str(normalized)].append(v)

        if len(unique_values) > 1:
            # We have a mismatch
            conflicts.append(ConflictResult(
                conflict_type="VALUE_MISMATCH",
                field_name=field_name,
                priority=get_field_priority(field_name),
                message=f"Field '{field_name}' has {len(unique_values)} different values from different sources",
                details={
                    "unique_value_count": len(unique_values),
                    "sources": [v["source_type"] for v in values],
                },
                conflicting_values=values,
            ))

    return conflicts


def detect_low_confidence(field_values: list[dict]) -> list[ConflictResult]:
    """
    Detect AI extractions with confidence below threshold.

    Only checks values with source_type='ai_extraction' that have
    a confidence score.
    """
    conflicts = []

    for fv in field_values:
        if not fv.get("is_active", True):
            continue

        confidence = fv.get("confidence")
        source_type = fv.get("source_type")

        # Only check AI extractions with confidence scores
        if source_type == "ai_extraction" and confidence is not None:
            if confidence < CONFIDENCE_THRESHOLD:
                conflicts.append(ConflictResult(
                    conflict_type="LOW_CONFIDENCE",
                    field_name=fv["field_name"],
                    priority="medium",  # Low confidence is always medium priority
                    message=f"Field '{fv['field_name']}' extracted with low confidence ({confidence:.0%})",
                    details={
                        "confidence": confidence,
                        "threshold": CONFIDENCE_THRESHOLD,
                        "value": fv["value"],
                    },
                    conflicting_values=[fv],
                ))

    return conflicts


def detect_missing_required(field_values: list[dict]) -> list[ConflictResult]:
    """
    Detect required fields that are missing or empty.
    """
    conflicts = []

    # Get set of fields that have non-empty active values
    fields_with_values: set[str] = set()
    for fv in field_values:
        if fv.get("is_active", True) and not _is_empty(fv.get("value")):
            fields_with_values.add(fv["field_name"])

    for required_field in REQUIRED_FIELDS:
        if required_field not in fields_with_values:
            conflicts.append(ConflictResult(
                conflict_type="MISSING_REQUIRED",
                field_name=required_field,
                priority="high",  # Missing required is always high priority
                message=f"Required field '{required_field}' is missing or empty",
                details={
                    "required_fields": REQUIRED_FIELDS,
                },
                conflicting_values=[],
            ))

    return conflicts


def detect_cross_field_conflicts(field_values: list[dict]) -> list[ConflictResult]:
    """
    Detect logical inconsistencies between related fields.

    Uses CROSS_FIELD_RULES to check relationships like
    effective_date < expiration_date.
    """
    conflicts = []

    # Build lookup of current values
    current_values = _get_active_values_dict(field_values)

    for rule in CROSS_FIELD_RULES:
        rule_fields = rule["fields"]

        # Check if all fields in rule are present
        if not all(f in current_values for f in rule_fields):
            continue

        # Run the specific check
        check_name = rule["check"]
        is_valid = _run_cross_field_check(check_name, current_values, rule_fields)

        if not is_valid:
            conflicts.append(ConflictResult(
                conflict_type="CROSS_FIELD",
                field_name=None,  # Involves multiple fields
                priority="high",
                message=rule["message"],
                details={
                    "rule_name": rule["name"],
                    "fields": rule_fields,
                    "values": {f: current_values[f] for f in rule_fields},
                },
                conflicting_values=[],
            ))

    return conflicts


def detect_outliers(field_values: list[dict]) -> list[ConflictResult]:
    """
    Detect values that fall outside expected ranges.
    """
    conflicts = []

    current_values = _get_active_values_dict(field_values)

    for field_name, (min_val, max_val) in OUTLIER_RANGES.items():
        if field_name not in current_values:
            continue

        value = current_values[field_name]
        numeric_value = _to_numeric(value)

        if numeric_value is None:
            continue

        is_outlier = False
        if min_val is not None and numeric_value < min_val:
            is_outlier = True
        if max_val is not None and numeric_value > max_val:
            is_outlier = True

        if is_outlier:
            conflicts.append(ConflictResult(
                conflict_type="OUTLIER_VALUE",
                field_name=field_name,
                priority="medium",
                message=f"Field '{field_name}' value {value} is outside expected range",
                details={
                    "value": value,
                    "numeric_value": numeric_value,
                    "min": min_val,
                    "max": max_val,
                },
                conflicting_values=[],
            ))

    return conflicts


def detect_duplicate_submission(
    current_values: dict[str, Any],
    existing_submissions: list[dict],
    name_similarity_threshold: float = 0.85,
) -> list[ConflictResult]:
    """
    Detect potential duplicate submissions based on company name similarity.

    This is a simple string-based check. For production, consider using
    the ops_embedding vector similarity from the database.

    Args:
        current_values: Dict of field_name -> value for current submission
        existing_submissions: List of existing submissions to check against
        name_similarity_threshold: Minimum similarity score to flag as duplicate

    Returns:
        List of duplicate conflicts (usually 0 or 1)
    """
    conflicts = []

    current_name = current_values.get("applicant_name", "")
    if not current_name:
        return conflicts

    current_name_normalized = _normalize_company_name(current_name)

    for existing in existing_submissions:
        existing_name = existing.get("applicant_name", "")
        if not existing_name:
            continue

        existing_name_normalized = _normalize_company_name(existing_name)

        similarity = _string_similarity(current_name_normalized, existing_name_normalized)

        if similarity >= name_similarity_threshold:
            conflicts.append(ConflictResult(
                conflict_type="DUPLICATE_SUBMISSION",
                field_name=None,
                priority="high",
                message=f"Potential duplicate of existing submission '{existing_name}'",
                details={
                    "existing_submission_id": existing.get("id"),
                    "existing_applicant_name": existing_name,
                    "similarity_score": similarity,
                    "existing_date_received": existing.get("date_received"),
                    "existing_broker_email": existing.get("broker_email"),
                },
                conflicting_values=[],
            ))

    return conflicts


def detect_application_contradictions(app_data: dict) -> list[ConflictResult]:
    """
    Detect contradictory answers within the application form.

    Scans the application JSON for inconsistencies like:
    - hasEDR=No but edrVendor=CrowdStrike
    - hasMFA=No but mfaType specified

    Args:
        app_data: Raw application JSON data

    Returns:
        List of contradiction conflicts
    """
    conflicts = []

    if not app_data:
        return conflicts

    # Flatten nested app data for easier field lookup
    flat_data = _flatten_app_data(app_data)

    for rule in APPLICATION_CONTRADICTION_RULES:
        field_a = rule["field_a"]
        field_b = rule["field_b"]

        # Get field values (case-insensitive lookup with alternate field names)
        value_a = _get_field_case_insensitive(flat_data, field_a)
        # Try alternate field names if primary not found
        if value_a is None and "field_a_alt" in rule:
            for alt_field in rule["field_a_alt"]:
                value_a = _get_field_case_insensitive(flat_data, alt_field)
                if value_a is not None:
                    break

        value_b = _get_field_case_insensitive(flat_data, field_b)
        # Try alternate field names if primary not found
        if value_b is None and "field_b_alt" in rule:
            for alt_field in rule["field_b_alt"]:
                value_b = _get_field_case_insensitive(flat_data, alt_field)
                if value_b is not None:
                    break

        # Skip if field_a doesn't exist
        if value_a is None:
            continue

        # Check if field_a matches trigger condition
        trigger_matched = False

        if "value_a_check" in rule:
            # Numeric comparison
            if rule["value_a_check"] == "greater_than":
                try:
                    if float(value_a) > rule["value_a_threshold"]:
                        trigger_matched = True
                except (ValueError, TypeError):
                    pass
        else:
            # Value list match
            if value_a in rule.get("value_a", []):
                trigger_matched = True

        if not trigger_matched:
            continue

        # Check condition on field_b
        condition = rule["condition"]
        is_contradiction = False

        if condition == "should_be_empty":
            # field_b should be empty/null when field_a matches
            if value_b is not None and value_b != "" and value_b != []:
                is_contradiction = True

        elif condition == "should_not_be_empty":
            # field_b should have a value when field_a matches
            if value_b is None or value_b == "" or value_b == []:
                is_contradiction = True

        elif condition == "should_not_be":
            # field_b should not be one of the conflict values
            conflict_values = rule.get("conflict_values", [])
            if value_b in conflict_values:
                is_contradiction = True

        if is_contradiction:
            conflicts.append(ConflictResult(
                conflict_type="APPLICATION_CONTRADICTION",
                field_name=field_b,
                priority=rule.get("priority", "medium"),
                message=rule["message"],
                details={
                    "rule_name": rule["name"],
                    "field_a": field_a,
                    "field_a_value": value_a,
                    "field_b": field_b,
                    "field_b_value": value_b,
                },
                conflicting_values=[],
            ))

    return conflicts


def detect_sign_off_required(
    field_values: list[dict],
    broker_info: dict | None = None,
) -> list[ConflictResult]:
    """
    Generate core sign-off items that require human verification.

    These are not conflicts per se, but mandatory checkpoints that
    ensure a human has reviewed key extracted data.

    Args:
        field_values: List of field value dicts
        broker_info: Broker assignment info with 'confidence' and 'source' keys

    Returns:
        List of verification required items
    """
    conflicts = []

    # Build lookup of current values
    current_values = _get_active_values_dict(field_values)

    for item in CORE_SIGN_OFF_ITEMS:
        field = item["field"]

        # Skip if field doesn't have a value (will be caught by MISSING_REQUIRED)
        if field not in current_values:
            continue

        # Determine priority
        priority = item["priority"]

        # Special case: broker verification with auto-assignment
        if item["name"] == "verify_broker" and broker_info:
            broker_confidence = broker_info.get("confidence", "high")
            broker_source = broker_info.get("source", "")

            # Higher priority if broker was auto-assigned with low confidence
            if broker_confidence in ("low", "medium") or broker_source == "sender":
                priority = item.get("priority_if_auto", priority)

        conflicts.append(ConflictResult(
            conflict_type="VERIFICATION_REQUIRED",
            field_name=field,
            priority=priority,
            message=item["message"],
            details={
                "sign_off_name": item["name"],
                "description": item.get("description", ""),
                "current_value": current_values.get(field),
            },
            conflicting_values=[],
        ))

    return conflicts


def _flatten_app_data(app_data: dict) -> dict:
    """
    Flatten nested application data structure for easier field lookup.

    Handles the common pattern where app data has a "data" wrapper
    with nested sections.
    """
    flat = {}

    def _flatten(obj: dict, prefix: str = ""):
        for key, value in obj.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                _flatten(value, full_key)
            else:
                # Store both with and without prefix for flexible lookup
                flat[key] = value
                flat[full_key] = value
                flat[key.lower()] = value

    # Handle "data" wrapper if present
    if "data" in app_data and isinstance(app_data["data"], dict):
        _flatten(app_data["data"])
    else:
        _flatten(app_data)

    return flat


def _get_field_case_insensitive(flat_data: dict, field_name: str) -> Any:
    """Get a field value with case-insensitive lookup."""
    # Try exact match first
    if field_name in flat_data:
        return flat_data[field_name]
    # Try lowercase
    if field_name.lower() in flat_data:
        return flat_data[field_name.lower()]
    return None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _normalize_for_comparison(value: Any) -> Any:
    """
    Normalize a value for comparison purposes.

    Handles:
    - Currency strings ("$5M", "$5,000,000") -> numeric
    - Date strings -> date objects
    - Whitespace/case normalization for strings
    """
    if value is None:
        return None

    if isinstance(value, (int, float, Decimal)):
        return float(value)

    if isinstance(value, str):
        # Try currency parsing
        numeric = _parse_currency(value)
        if numeric is not None:
            return numeric

        # Try date parsing
        parsed_date = _parse_date(value)
        if parsed_date is not None:
            return parsed_date

        # Default: normalize string
        return value.strip().lower()

    if isinstance(value, (date, datetime)):
        if isinstance(value, datetime):
            return value.date()
        return value

    return value


def _parse_currency(value: str) -> float | None:
    """
    Parse currency strings like "$5M", "$5,000,000", "5000000".
    """
    if not isinstance(value, str):
        return None

    # Remove currency symbols and whitespace
    cleaned = re.sub(r'[$,\s]', '', value.strip())

    # Handle M/K suffixes
    multiplier = 1
    if cleaned.upper().endswith('M'):
        multiplier = 1_000_000
        cleaned = cleaned[:-1]
    elif cleaned.upper().endswith('K'):
        multiplier = 1_000
        cleaned = cleaned[:-1]
    elif cleaned.upper().endswith('B'):
        multiplier = 1_000_000_000
        cleaned = cleaned[:-1]

    try:
        return float(cleaned) * multiplier
    except ValueError:
        return None


def _parse_date(value: str) -> date | None:
    """
    Parse common date formats.
    """
    if not isinstance(value, str):
        return None

    formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue

    return None


def _to_numeric(value: Any) -> float | None:
    """Convert value to numeric if possible."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return _parse_currency(value)
    return None


def _is_empty(value: Any) -> bool:
    """Check if a value is considered empty."""
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, dict)) and len(value) == 0:
        return True
    return False


def _get_active_values_dict(field_values: list[dict]) -> dict[str, Any]:
    """
    Build a dict of field_name -> value for active field values.

    If multiple active values exist for a field, uses the most recent one
    (assumes list is ordered by created_at).
    """
    result: dict[str, Any] = {}
    for fv in field_values:
        if fv.get("is_active", True):
            # Later entries override earlier ones
            result[fv["field_name"]] = fv["value"]
    return result


def _run_cross_field_check(
    check_name: str,
    values: dict[str, Any],
    fields: list[str],
) -> bool:
    """
    Run a named cross-field validation check.

    Returns True if validation passes, False if it fails.
    """
    if check_name == "effective_date_before_expiration":
        eff = values.get("effective_date")
        exp = values.get("expiration_date")

        # Parse dates if strings
        if isinstance(eff, str):
            eff = _parse_date(eff)
        if isinstance(exp, str):
            exp = _parse_date(exp)

        if eff is None or exp is None:
            return True  # Can't validate, assume OK

        return eff < exp

    # Unknown check - assume passes
    return True


def _normalize_company_name(name: str) -> str:
    """
    Normalize company name for duplicate detection.

    Removes common suffixes, punctuation, and normalizes case.
    """
    if not name:
        return ""

    normalized = name.lower().strip()

    # Remove common suffixes
    suffixes = [
        "inc", "inc.", "incorporated",
        "llc", "l.l.c.",
        "ltd", "ltd.", "limited",
        "corp", "corp.", "corporation",
        "co", "co.", "company",
        "plc", "p.l.c.",
    ]
    for suffix in suffixes:
        if normalized.endswith(f" {suffix}"):
            normalized = normalized[: -(len(suffix) + 1)]

    # Remove punctuation
    normalized = re.sub(r'[^\w\s]', '', normalized)

    # Normalize whitespace
    normalized = ' '.join(normalized.split())

    return normalized


def _string_similarity(s1: str, s2: str) -> float:
    """
    Calculate similarity between two strings using Jaccard similarity
    on character trigrams.

    Returns a score between 0 and 1.
    """
    if not s1 or not s2:
        return 0.0

    if s1 == s2:
        return 1.0

    # Generate trigrams
    def trigrams(s: str) -> set[str]:
        s = f"  {s}  "  # Pad for edge trigrams
        return {s[i:i+3] for i in range(len(s) - 2)}

    t1 = trigrams(s1)
    t2 = trigrams(s2)

    intersection = len(t1 & t2)
    union = len(t1 | t2)

    if union == 0:
        return 0.0

    return intersection / union


# =============================================================================
# CONVERSION HELPERS
# =============================================================================

def conflict_result_to_dict(result: ConflictResult) -> dict:
    """Convert a ConflictResult to a dict for storage/serialization."""
    return {
        "conflict_type": result.conflict_type,
        "field_name": result.field_name,
        "priority": result.priority,
        "message": result.message,
        "details": result.details,
        "conflicting_values": result.conflicting_values,
    }


def conflicts_to_dicts(results: list[ConflictResult]) -> list[dict]:
    """Convert a list of ConflictResults to dicts."""
    return [conflict_result_to_dict(r) for r in results]
