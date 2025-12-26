"""
Application Credibility Score Calculator

Calculates a multi-dimensional credibility score based on:
1. Consistency (40%) - Are answers internally coherent?
2. Plausibility (35%) - Do answers fit the business model?
3. Completeness (25%) - Were questions answered thoughtfully?

See docs/conflicts_guide.md for full documentation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from core.credibility_config import (
    DIMENSION_WEIGHTS,
    SEVERITY_WEIGHTS,
    CONSISTENCY_RULES,
    PLAUSIBILITY_RULES,
    COMPLETENESS_POINTS,
    NONSENSE_PATTERNS,
    VALID_SHORT_ANSWERS,
    KNOWN_VENDORS,
    get_app_complexity,
    get_score_label,
)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class CredibilityIssue:
    """A single credibility issue found in the application."""
    dimension: str  # "consistency", "plausibility", "completeness"
    rule_name: str
    severity: str
    message: str
    field_name: str | None = None
    field_value: Any = None
    details: dict = field(default_factory=dict)


@dataclass
class DimensionScore:
    """Score for a single dimension."""
    name: str
    score: float  # 0-100
    weight: float
    issues: list[CredibilityIssue]
    details: dict = field(default_factory=dict)

    @property
    def weighted_score(self) -> float:
        return self.score * self.weight


@dataclass
class CredibilityScore:
    """Complete credibility score with all dimensions."""
    total_score: float
    label: str
    description: str
    consistency: DimensionScore
    plausibility: DimensionScore
    completeness: DimensionScore
    app_complexity: dict
    all_issues: list[CredibilityIssue]

    def to_dict(self) -> dict:
        """Convert to dictionary for storage/display."""
        return {
            "total_score": round(self.total_score, 1),
            "label": self.label,
            "description": self.description,
            "dimensions": {
                "consistency": {
                    "score": round(self.consistency.score, 1),
                    "weight": self.consistency.weight,
                    "weighted": round(self.consistency.weighted_score, 1),
                    "issue_count": len(self.consistency.issues),
                },
                "plausibility": {
                    "score": round(self.plausibility.score, 1),
                    "weight": self.plausibility.weight,
                    "weighted": round(self.plausibility.weighted_score, 1),
                    "issue_count": len(self.plausibility.issues),
                },
                "completeness": {
                    "score": round(self.completeness.score, 1),
                    "weight": self.completeness.weight,
                    "weighted": round(self.completeness.weighted_score, 1),
                    "issue_count": len(self.completeness.issues),
                },
            },
            "app_complexity": self.app_complexity,
            "issues": [
                {
                    "dimension": i.dimension,
                    "rule": i.rule_name,
                    "severity": i.severity,
                    "message": i.message,
                    "field": i.field_name,
                }
                for i in self.all_issues
            ],
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _flatten_app_data(app_data: dict, prefix: str = "") -> dict[str, Any]:
    """Flatten nested app data into dot-notation keys."""
    result = {}
    for key, value in app_data.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            result.update(_flatten_app_data(value, full_key))
        else:
            result[full_key] = value
            # Also store without prefix for easier matching
            result[key] = value
    return result


def _normalize_value(value: Any) -> Any:
    """Normalize a value for comparison."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("yes", "true"):
            return True
        if v in ("no", "false"):
            return False
        return v
    return value


def _is_empty(value: Any) -> bool:
    """Check if a value is empty/blank."""
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == "" or value.strip().lower() in ("", "n/a", "na", "none")
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def _is_nonsense(value: Any) -> bool:
    """Check if a value matches nonsense patterns."""
    if not isinstance(value, str):
        return False
    v = value.strip().lower()

    # Don't flag valid short answers as nonsense
    if v in VALID_SHORT_ANSWERS:
        return False

    # Don't flag known vendors as nonsense
    if _contains_vendor(value):
        return False

    for pattern in NONSENSE_PATTERNS:
        if re.match(pattern, v, re.IGNORECASE):
            return True
    return False


def _contains_vendor(value: Any) -> bool:
    """Check if a value contains a known vendor name."""
    if not isinstance(value, str):
        return False
    v = value.lower()
    return any(vendor in v for vendor in KNOWN_VENDORS)


def _extract_number(value: Any) -> float | None:
    """Try to extract a number from a value."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Remove common formatting
        cleaned = re.sub(r"[$,%]", "", value.strip())
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


# =============================================================================
# CONSISTENCY SCORE
# =============================================================================

def calculate_consistency_score(
    app_data: dict,
    testable_pairs: int | None = None,
) -> DimensionScore:
    """
    Calculate consistency score based on contradictions found.

    Consistency = 1 - (weighted_contradictions / testable_pairs)
    """
    if not app_data:
        return DimensionScore(
            name="consistency",
            score=100.0,
            weight=DIMENSION_WEIGHTS["consistency"],
            issues=[],
            details={"testable_pairs": 0, "contradictions": 0},
        )

    flat_data = _flatten_app_data(app_data)
    issues: list[CredibilityIssue] = []
    weighted_contradictions = 0.0

    for rule in CONSISTENCY_RULES:
        field_a = rule["field_a"]
        field_b = rule["field_b"]

        # Get values
        value_a = flat_data.get(field_a)
        value_b = flat_data.get(field_b)

        # Skip if field_a not present
        if value_a is None:
            continue

        # Check if field_a matches trigger values
        trigger_values = rule.get("value_a", [])
        normalized_a = _normalize_value(value_a)

        matches_trigger = False
        for trigger in trigger_values:
            if _normalize_value(trigger) == normalized_a:
                matches_trigger = True
                break

        if not matches_trigger:
            continue

        # Now check the condition on field_b
        condition = rule["condition"]
        is_contradiction = False

        if condition == "should_be_empty":
            is_contradiction = not _is_empty(value_b)
        elif condition == "should_not_be_empty":
            is_contradiction = _is_empty(value_b)
        elif condition == "should_be_empty_or_zero":
            num = _extract_number(value_b)
            is_contradiction = not _is_empty(value_b) and num != 0
        elif condition == "should_not_be":
            conflict_values = rule.get("conflict_values", [])
            normalized_b = _normalize_value(value_b)
            for cv in conflict_values:
                if _normalize_value(cv) == normalized_b:
                    is_contradiction = True
                    break

        if is_contradiction:
            severity = rule.get("severity", "medium")
            weight = SEVERITY_WEIGHTS.get(severity, 1.0)
            weighted_contradictions += weight

            issues.append(CredibilityIssue(
                dimension="consistency",
                rule_name=rule["name"],
                severity=severity,
                message=rule["message"],
                field_name=field_b,
                field_value=value_b,
                details={
                    "trigger_field": field_a,
                    "trigger_value": value_a,
                    "conflict_field": field_b,
                    "conflict_value": value_b,
                },
            ))

    # Determine testable pairs based on app complexity
    if testable_pairs is None:
        # Estimate based on fields present
        question_count = len([k for k, v in flat_data.items() if v is not None])
        complexity = get_app_complexity(question_count)
        testable_pairs = complexity["testable_pairs"]

    # Calculate score
    if testable_pairs > 0:
        contradiction_rate = weighted_contradictions / testable_pairs
        score = max(0, (1 - contradiction_rate) * 100)
    else:
        score = 100.0

    return DimensionScore(
        name="consistency",
        score=score,
        weight=DIMENSION_WEIGHTS["consistency"],
        issues=issues,
        details={
            "testable_pairs": testable_pairs,
            "weighted_contradictions": weighted_contradictions,
            "raw_contradictions": len(issues),
        },
    )


# =============================================================================
# PLAUSIBILITY SCORE
# =============================================================================

@dataclass
class BusinessContext:
    """Business context for plausibility checking."""
    business_model: str | None = None  # B2B, B2C, B2B2C, B2G
    naics_code: str | None = None
    industry_description: str | None = None
    employee_count: int | None = None
    annual_revenue: float | None = None

    @classmethod
    def from_submission(cls, submission: dict) -> "BusinessContext":
        """Extract business context from submission data."""
        return cls(
            business_model=submission.get("business_model") or submission.get("businessModel"),
            naics_code=submission.get("naics_primary_code") or submission.get("naicsPrimaryCode"),
            industry_description=(
                submission.get("industry_description") or
                submission.get("business_summary") or
                submission.get("businessDescription") or
                ""
            ),
            employee_count=_extract_number(
                submission.get("employee_count") or submission.get("employeeCount")
            ),
            annual_revenue=_extract_number(
                submission.get("annual_revenue") or submission.get("annualRevenue")
            ),
        )


def _matches_context(rule_context: dict, business_context: BusinessContext) -> bool:
    """Check if business context matches rule context requirements."""
    # Check business model
    if "business_model" in rule_context:
        if business_context.business_model not in rule_context["business_model"]:
            return False

    # Check NAICS prefix
    if "naics_prefix" in rule_context and business_context.naics_code:
        matches_naics = any(
            business_context.naics_code.startswith(prefix)
            for prefix in rule_context["naics_prefix"]
        )
        if not matches_naics:
            return False

    # Check industry keywords
    if "industry_keywords" in rule_context and business_context.industry_description:
        desc_lower = business_context.industry_description.lower()
        matches_keyword = any(
            kw.lower() in desc_lower
            for kw in rule_context["industry_keywords"]
        )
        # For NAICS rules, keywords are additive (OR)
        # For other rules, they're required
        if "naics_prefix" not in rule_context and not matches_keyword:
            return False

    # Check employee count minimum
    if "employee_count_min" in rule_context:
        if business_context.employee_count is None:
            return False
        if business_context.employee_count < rule_context["employee_count_min"]:
            return False

    # Check revenue minimum
    if "revenue_min" in rule_context:
        if business_context.annual_revenue is None:
            return False
        if business_context.annual_revenue < rule_context["revenue_min"]:
            return False

    return True


def calculate_plausibility_score(
    app_data: dict,
    submission_data: dict | None = None,
) -> DimensionScore:
    """
    Calculate plausibility score based on business context.

    Plausibility = 1 - (weighted_implausibilities / context_checkable_questions)
    """
    if not app_data:
        return DimensionScore(
            name="plausibility",
            score=100.0,
            weight=DIMENSION_WEIGHTS["plausibility"],
            issues=[],
            details={"checkable_questions": 0},
        )

    # Build business context
    context_data = {**(submission_data or {}), **app_data}
    context = BusinessContext.from_submission(context_data)
    flat_data = _flatten_app_data(app_data)

    issues: list[CredibilityIssue] = []
    weighted_implausibilities = 0.0
    applicable_rules = 0

    for rule in PLAUSIBILITY_RULES:
        # Check if rule context matches
        rule_context = rule.get("context", {})
        if not _matches_context(rule_context, context):
            continue

        applicable_rules += 1
        field_name = rule["field"]
        value = flat_data.get(field_name)

        if value is None:
            continue

        # Check if value is implausible
        implausible_values = rule.get("implausible_values", [])
        normalized = _normalize_value(value)

        is_implausible = any(
            _normalize_value(iv) == normalized
            for iv in implausible_values
        )

        if is_implausible:
            severity = rule.get("severity", "medium")
            weight = SEVERITY_WEIGHTS.get(severity, 1.0)
            weighted_implausibilities += weight

            issues.append(CredibilityIssue(
                dimension="plausibility",
                rule_name=rule["name"],
                severity=severity,
                message=rule["message"],
                field_name=field_name,
                field_value=value,
                details={
                    "explanation": rule.get("explanation", ""),
                    "context": {
                        "business_model": context.business_model,
                        "naics_code": context.naics_code,
                        "employee_count": context.employee_count,
                        "revenue": context.annual_revenue,
                    },
                },
            ))

    # Calculate score
    # Use applicable rules as denominator, minimum of 10 to avoid over-penalizing
    checkable = max(applicable_rules, 10)
    if checkable > 0:
        implausibility_rate = weighted_implausibilities / checkable
        score = max(0, (1 - implausibility_rate) * 100)
    else:
        score = 100.0

    return DimensionScore(
        name="plausibility",
        score=score,
        weight=DIMENSION_WEIGHTS["plausibility"],
        issues=issues,
        details={
            "checkable_questions": applicable_rules,
            "weighted_implausibilities": weighted_implausibilities,
            "context": {
                "business_model": context.business_model,
                "naics_code": context.naics_code,
                "employee_count": context.employee_count,
                "revenue": context.annual_revenue,
            },
        },
    )


# =============================================================================
# COMPLETENESS SCORE
# =============================================================================

def calculate_completeness_score(
    app_data: dict,
    required_fields: list[str] | None = None,
) -> DimensionScore:
    """
    Calculate completeness score based on answer quality.

    Measures:
    - Questions answered vs blank
    - Specific details provided (vendors, percentages)
    - Quality of free-form text
    - Red flags (all-yes, nonsense text)
    """
    if not app_data:
        return DimensionScore(
            name="completeness",
            score=100.0,
            weight=DIMENSION_WEIGHTS["completeness"],
            issues=[],
            details={},
        )

    flat_data = _flatten_app_data(app_data)
    issues: list[CredibilityIssue] = []

    points_earned = 0
    points_possible = 0
    yes_count = 0
    no_count = 0
    security_questions = 0
    freeform_values: list[str] = []

    for field_name, value in flat_data.items():
        # Skip metadata fields
        if field_name.startswith("_") or field_name in ("id", "created_at", "updated_at"):
            continue

        points_possible += COMPLETENESS_POINTS["question_answered"]

        # Check if answered
        if _is_empty(value):
            if required_fields and field_name in required_fields:
                points_earned += COMPLETENESS_POINTS["blank_required"]
                issues.append(CredibilityIssue(
                    dimension="completeness",
                    rule_name="blank_required",
                    severity="high",
                    message=f"Required field '{field_name}' is blank",
                    field_name=field_name,
                ))
            continue

        points_earned += COMPLETENESS_POINTS["question_answered"]

        # Check for nonsense
        if _is_nonsense(value):
            points_earned += COMPLETENESS_POINTS["nonsense_text"]
            issues.append(CredibilityIssue(
                dimension="completeness",
                rule_name="nonsense_text",
                severity="high",
                message=f"Nonsense or placeholder text in '{field_name}'",
                field_name=field_name,
                field_value=value,
            ))
            continue

        # Check for specific vendor names
        if _contains_vendor(value):
            points_earned += COMPLETENESS_POINTS["specific_vendor_named"]

        # Check for percentages
        if isinstance(value, str) and "%" in value:
            points_earned += COMPLETENESS_POINTS["percentage_provided"]
        elif isinstance(value, (int, float)) and 0 <= value <= 100:
            # Might be a percentage
            points_earned += COMPLETENESS_POINTS["percentage_provided"]

        # Track yes/no for pattern detection
        normalized = _normalize_value(value)
        if normalized is True:
            yes_count += 1
            security_questions += 1
        elif normalized is False:
            no_count += 1
            security_questions += 1

        # Track freeform text for duplicate detection
        if isinstance(value, str) and len(value.strip()) > 20:
            freeform_values.append(value.strip().lower())
            points_earned += COMPLETENESS_POINTS["freeform_explanation"]

    # Check for all-yes pattern
    if security_questions >= 10 and yes_count == security_questions:
        penalty = COMPLETENESS_POINTS["all_yes_pattern"] * security_questions
        points_earned += penalty
        issues.append(CredibilityIssue(
            dimension="completeness",
            rule_name="all_yes_pattern",
            severity="medium",
            message=f"All {security_questions} security questions answered 'Yes' - possible box-checking",
            details={"yes_count": yes_count, "total": security_questions},
        ))

    # Check for all-no pattern (less severe)
    if security_questions >= 10 and no_count == security_questions:
        penalty = COMPLETENESS_POINTS["all_no_pattern"] * security_questions
        points_earned += penalty
        issues.append(CredibilityIssue(
            dimension="completeness",
            rule_name="all_no_pattern",
            severity="low",
            message=f"All {security_questions} security questions answered 'No'",
            details={"no_count": no_count, "total": security_questions},
        ))

    # Check for duplicate freeform answers
    seen_freeform: dict[str, int] = {}
    for text in freeform_values:
        seen_freeform[text] = seen_freeform.get(text, 0) + 1

    for text, count in seen_freeform.items():
        if count > 1:
            penalty = COMPLETENESS_POINTS["identical_freeform"] * (count - 1)
            points_earned += penalty
            issues.append(CredibilityIssue(
                dimension="completeness",
                rule_name="identical_freeform",
                severity="low",
                message=f"Same text repeated in {count} fields",
                details={"text_preview": text[:50] + "..." if len(text) > 50 else text},
            ))

    # Calculate score
    if points_possible > 0:
        # Normalize to 0-100 scale
        raw_score = (points_earned / points_possible) * 100
        score = max(0, min(100, raw_score))
    else:
        score = 100.0

    return DimensionScore(
        name="completeness",
        score=score,
        weight=DIMENSION_WEIGHTS["completeness"],
        issues=issues,
        details={
            "points_earned": points_earned,
            "points_possible": points_possible,
            "security_questions": security_questions,
            "yes_count": yes_count,
            "no_count": no_count,
            "freeform_count": len(freeform_values),
        },
    )


# =============================================================================
# MAIN CALCULATOR
# =============================================================================

def calculate_credibility_score(
    app_data: dict,
    submission_data: dict | None = None,
    required_fields: list[str] | None = None,
    question_count: int | None = None,
) -> CredibilityScore:
    """
    Calculate the complete credibility score for an application.

    Args:
        app_data: The application form data (security questions, etc.)
        submission_data: Additional submission metadata (NAICS, revenue, etc.)
        required_fields: List of required field names
        question_count: Override for question count (for complexity calculation)

    Returns:
        CredibilityScore with all dimensions and issues
    """
    # Determine app complexity
    if question_count is None:
        flat = _flatten_app_data(app_data) if app_data else {}
        question_count = len([k for k, v in flat.items() if v is not None])

    complexity = get_app_complexity(question_count)

    # Calculate each dimension
    consistency = calculate_consistency_score(
        app_data,
        testable_pairs=complexity["testable_pairs"],
    )

    plausibility = calculate_plausibility_score(
        app_data,
        submission_data=submission_data,
    )

    completeness = calculate_completeness_score(
        app_data,
        required_fields=required_fields,
    )

    # Calculate total score
    total_score = (
        consistency.weighted_score +
        plausibility.weighted_score +
        completeness.weighted_score
    )

    # Get label
    label, description = get_score_label(total_score)

    # Combine all issues
    all_issues = consistency.issues + plausibility.issues + completeness.issues

    # Sort by severity
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_issues.sort(key=lambda i: severity_order.get(i.severity, 99))

    return CredibilityScore(
        total_score=total_score,
        label=label,
        description=description,
        consistency=consistency,
        plausibility=plausibility,
        completeness=completeness,
        app_complexity=complexity,
        all_issues=all_issues,
    )
