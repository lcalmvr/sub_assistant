"""
Pre-Bind Validation Module

Validates that all required data exists before allowing a quote to be bound.
Returns structured errors and warnings for UI display.
"""

from typing import Optional
from dataclasses import dataclass, field
from sqlalchemy import text

import os
import importlib.util

# Import database connection
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn


@dataclass
class ValidationResult:
    """Result of pre-bind validation."""
    can_bind: bool
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "can_bind": self.can_bind,
            "errors": self.errors,
            "warnings": self.warnings,
        }


# Error codes and messages
VALIDATION_MESSAGES = {
    # Account errors
    "missing_applicant_name": "Applicant name is required",
    "missing_account": "Submission must be linked to an account",
    "missing_address": "Mailing address is required",
    "missing_state": "State is required",

    # Broker errors
    "missing_broker": "Broker must be assigned",

    # Policy date errors
    "missing_effective_date": "Policy effective date is required",
    "missing_expiration_date": "Policy expiration date is required",
    "invalid_date_range": "Expiration date must be after effective date",

    # Quote structure errors
    "no_tower_layers": "At least one coverage layer is required",
    "zero_limit": "Coverage limit must be greater than zero",
    "zero_retention": "Retention must be greater than zero",

    # Coverage errors
    "no_coverages": "At least one coverage must be included",
}

VALIDATION_WARNINGS = {
    "zero_premium": "Premium is $0 - confirm this is intentional",
    "open_subjectivities": "There are unresolved subjectivities",
}


def validate_can_bind(quote_id: str) -> ValidationResult:
    """
    Validate whether a quote can be bound.

    Args:
        quote_id: UUID of the insurance_tower (quote option) to validate

    Returns:
        ValidationResult with can_bind flag, errors, and warnings
    """
    errors = []
    warnings = []

    with get_conn() as conn:
        # Get quote and submission data in one query
        result = conn.execute(text("""
            SELECT
                t.id as quote_id,
                t.submission_id,
                t.tower_json,
                t.primary_retention,
                t.coverages,
                t.sold_premium,
                t.position,
                s.applicant_name,
                s.account_id,
                s.broker_employment_id,
                s.broker_email,
                s.effective_date,
                s.expiration_date,
                a.name as account_name,
                a.address_street,
                a.address_city,
                a.address_state,
                a.address_zip
            FROM insurance_towers t
            JOIN submissions s ON t.submission_id = s.id
            LEFT JOIN accounts a ON s.account_id = a.id
            WHERE t.id = :quote_id
        """), {"quote_id": quote_id})

        row = result.fetchone()
        if not row:
            return ValidationResult(
                can_bind=False,
                errors=[{"code": "quote_not_found", "message": "Quote not found"}]
            )

        # Convert row to dict for easier access
        data = row._mapping

        # ─────────────────────────────────────────────────────────────
        # Account Validation
        # ─────────────────────────────────────────────────────────────

        # Check applicant name (on submission)
        if not data.get("applicant_name") or not str(data["applicant_name"]).strip():
            errors.append({
                "code": "missing_applicant_name",
                "message": VALIDATION_MESSAGES["missing_applicant_name"],
                "field": "applicant_name",
                "tab": "Account"
            })

        # Check account is linked
        if not data.get("account_id"):
            errors.append({
                "code": "missing_account",
                "message": VALIDATION_MESSAGES["missing_account"],
                "field": "account_id",
                "tab": "Account"
            })
        else:
            # Check account has required address fields
            if not data.get("address_street") or not str(data["address_street"]).strip():
                errors.append({
                    "code": "missing_address",
                    "message": VALIDATION_MESSAGES["missing_address"],
                    "field": "address_street",
                    "tab": "Account"
                })

            if not data.get("address_state") or not str(data["address_state"]).strip():
                errors.append({
                    "code": "missing_state",
                    "message": VALIDATION_MESSAGES["missing_state"],
                    "field": "address_state",
                    "tab": "Account"
                })

        # ─────────────────────────────────────────────────────────────
        # Broker Validation
        # ─────────────────────────────────────────────────────────────

        if not data.get("broker_employment_id") and not data.get("broker_email"):
            errors.append({
                "code": "missing_broker",
                "message": VALIDATION_MESSAGES["missing_broker"],
                "field": "broker",
                "tab": "Account"
            })

        # ─────────────────────────────────────────────────────────────
        # Policy Date Validation
        # ─────────────────────────────────────────────────────────────

        effective_date = data.get("effective_date")
        expiration_date = data.get("expiration_date")

        if not effective_date:
            errors.append({
                "code": "missing_effective_date",
                "message": VALIDATION_MESSAGES["missing_effective_date"],
                "field": "effective_date",
                "tab": "Account"
            })

        if not expiration_date:
            errors.append({
                "code": "missing_expiration_date",
                "message": VALIDATION_MESSAGES["missing_expiration_date"],
                "field": "expiration_date",
                "tab": "Account"
            })

        if effective_date and expiration_date:
            if expiration_date <= effective_date:
                errors.append({
                    "code": "invalid_date_range",
                    "message": VALIDATION_MESSAGES["invalid_date_range"],
                    "field": "expiration_date",
                    "tab": "Account"
                })

        # ─────────────────────────────────────────────────────────────
        # Quote Structure Validation
        # ─────────────────────────────────────────────────────────────

        tower_json = data.get("tower_json")
        position = data.get("position") or "primary"

        # Parse tower_json if it's a string
        if isinstance(tower_json, str):
            import json
            try:
                tower_json = json.loads(tower_json)
            except (json.JSONDecodeError, TypeError):
                tower_json = None

        # Check tower has at least one layer
        if not tower_json or not isinstance(tower_json, list) or len(tower_json) == 0:
            errors.append({
                "code": "no_tower_layers",
                "message": VALIDATION_MESSAGES["no_tower_layers"],
                "field": "tower_json",
                "tab": "Quote"
            })
        else:
            # Check layers have valid limits
            total_limit = sum(layer.get("limit", 0) or 0 for layer in tower_json)
            if total_limit <= 0:
                errors.append({
                    "code": "zero_limit",
                    "message": VALIDATION_MESSAGES["zero_limit"],
                    "field": "tower_json",
                    "tab": "Quote"
                })

        # Check retention (for primary positions)
        retention = data.get("primary_retention")
        if position == "primary":
            if not retention or retention <= 0:
                errors.append({
                    "code": "zero_retention",
                    "message": VALIDATION_MESSAGES["zero_retention"],
                    "field": "primary_retention",
                    "tab": "Quote"
                })

        # ─────────────────────────────────────────────────────────────
        # Coverage Validation
        # ─────────────────────────────────────────────────────────────

        coverages = data.get("coverages")

        # Parse coverages if it's a string
        if isinstance(coverages, str):
            import json
            try:
                coverages = json.loads(coverages)
            except (json.JSONDecodeError, TypeError):
                coverages = None

        # Check at least one coverage is included
        # Coverage formats vary:
        # 1. {coverage_name: true/false} - boolean include
        # 2. {coverage_name: {include: true/false}} - object with include flag
        # 3. {aggregate_coverages: {coverage: limit}, sublimit_coverages: {coverage: limit}} - limit-based
        has_coverage = False
        if coverages and isinstance(coverages, dict):
            # Check for limit-based format (aggregate_coverages/sublimit_coverages)
            aggregate_coverages = coverages.get("aggregate_coverages", {})
            sublimit_coverages = coverages.get("sublimit_coverages", {})

            # If we have aggregate or sublimit coverages with non-zero limits, we have coverages
            for limit in aggregate_coverages.values():
                if isinstance(limit, (int, float)) and limit > 0:
                    has_coverage = True
                    break

            if not has_coverage:
                for limit in sublimit_coverages.values():
                    if isinstance(limit, (int, float)) and limit > 0:
                        has_coverage = True
                        break

            # Also check for boolean/include format
            if not has_coverage:
                for key, value in coverages.items():
                    if key in ("aggregate_coverages", "sublimit_coverages", "policy_form", "aggregate_limit"):
                        continue  # Skip metadata keys
                    if value is True or (isinstance(value, dict) and value.get("include")):
                        has_coverage = True
                        break

        if not has_coverage:
            errors.append({
                "code": "no_coverages",
                "message": VALIDATION_MESSAGES["no_coverages"],
                "field": "coverages",
                "tab": "Quote"
            })

        # ─────────────────────────────────────────────────────────────
        # Warnings (non-blocking)
        # ─────────────────────────────────────────────────────────────

        # Check for zero premium
        sold_premium = data.get("sold_premium")
        if not sold_premium or sold_premium <= 0:
            warnings.append({
                "code": "zero_premium",
                "message": VALIDATION_WARNINGS["zero_premium"],
                "field": "sold_premium",
                "tab": "Quote"
            })

        # Check for open subjectivities (any status other than received/waived)
        subj_result = conn.execute(text("""
            SELECT COUNT(*) as count
            FROM quote_subjectivities qs
            JOIN submission_subjectivities ss ON qs.subjectivity_id = ss.id
            WHERE qs.quote_id = :quote_id
            AND ss.status NOT IN ('received', 'waived')
        """), {"quote_id": quote_id})
        subj_row = subj_result.fetchone()
        if subj_row and subj_row[0] > 0:
            warnings.append({
                "code": "open_subjectivities",
                "message": f"{subj_row[0]} unresolved subjectivities",
                "field": "subjectivities",
                "tab": "Quote"
            })

    # Determine if binding is allowed
    can_bind = len(errors) == 0

    return ValidationResult(
        can_bind=can_bind,
        errors=errors,
        warnings=warnings
    )


def get_bind_readiness(submission_id: str) -> dict:
    """
    Get bind readiness status for all quotes on a submission.

    Returns a summary showing which quotes are ready to bind and why not.
    Useful for showing "ready to bind" indicators in the UI.

    Args:
        submission_id: UUID of the submission

    Returns:
        Dict with quotes and their readiness status
    """
    with get_conn() as conn:
        # Get all quote options for this submission
        result = conn.execute(text("""
            SELECT id, quote_name, is_bound
            FROM insurance_towers
            WHERE submission_id = :submission_id
            ORDER BY created_at
        """), {"submission_id": submission_id})

        quotes = []
        for row in result.fetchall():
            validation = validate_can_bind(str(row[0]))
            quotes.append({
                "quote_id": str(row[0]),
                "quote_name": row[1],
                "is_bound": row[2],
                "can_bind": validation.can_bind,
                "error_count": len(validation.errors),
                "warning_count": len(validation.warnings),
                "errors": validation.errors,
                "warnings": validation.warnings,
            })

        # Overall submission readiness
        any_can_bind = any(q["can_bind"] for q in quotes)

        return {
            "submission_id": submission_id,
            "any_can_bind": any_can_bind,
            "quote_count": len(quotes),
            "quotes": quotes,
        }
