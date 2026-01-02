# ai/conflict_analyzer.py
"""
LLM-based conflict analyzer for application data.
Detects contradictions, implausible answers, and credibility issues.
"""

import os
import json
import re
from typing import Any
from dataclasses import dataclass, asdict
from datetime import datetime

from langchain_openai import ChatOpenAI
from sqlalchemy import text
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from core.db import get_conn


@dataclass
class DetectedConflict:
    """A conflict detected in application data."""
    rule_name: str
    category: str
    severity: str  # critical, high, medium, low
    title: str
    description: str
    field_values: dict  # The actual values that triggered this
    is_known_rule: bool  # True if matched existing catalog rule
    llm_explanation: str | None = None


def get_known_rules() -> list[dict]:
    """Load active rules from the conflict_rules catalog."""
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT rule_name, category, severity, title, description, detection_pattern
                FROM conflict_rules
                WHERE is_active = true
                ORDER BY severity DESC, category
            """))
            return [dict(row._mapping) for row in result.fetchall()]
    except Exception as e:
        print(f"Error loading conflict rules: {e}")
        return []


def check_known_rules(app_data: dict, rules: list[dict]) -> list[DetectedConflict]:
    """Check app data against known rules from the catalog."""
    detected = []

    for rule in rules:
        pattern = rule.get("detection_pattern")
        if not pattern:
            continue

        try:
            # Handle different pattern types
            if "field_a" in pattern and "field_b" in pattern:
                # Simple field comparison
                conflict = _check_field_comparison(app_data, rule, pattern)
                if conflict:
                    detected.append(conflict)
            elif "context_field" in pattern and "check_field" in pattern:
                # Context-based check (e.g., B2C + no PII)
                conflict = _check_context_rule(app_data, rule, pattern)
                if conflict:
                    detected.append(conflict)
        except Exception as e:
            print(f"Error checking rule {rule['rule_name']}: {e}")
            continue

    return detected


def _check_field_comparison(app_data: dict, rule: dict, pattern: dict) -> DetectedConflict | None:
    """Check a simple field comparison rule."""
    field_a = pattern.get("field_a")
    field_b = pattern.get("field_b")
    value_a_triggers = pattern.get("value_a", [])
    condition = pattern.get("condition", "")
    value_b_triggers = pattern.get("value_b", [])

    actual_a = app_data.get(field_a)
    actual_b = app_data.get(field_b)

    # Normalize values for comparison
    actual_a_normalized = _normalize_value(actual_a)

    # Check if field_a matches trigger values
    a_matches = False
    for trigger in value_a_triggers:
        if _normalize_value(trigger) == actual_a_normalized:
            a_matches = True
            break

    if not a_matches:
        return None

    # Now check field_b based on condition
    conflict_found = False

    if condition == "should_be_empty":
        # Field B should be empty/None/blank but isn't
        if actual_b and str(actual_b).strip() and str(actual_b).lower() not in ["none", "n/a", ""]:
            conflict_found = True
    elif condition == "should_be_zero_or_empty":
        # Field B should be 0 or empty
        if actual_b and actual_b != 0 and str(actual_b).strip() not in ["0", "none", "n/a", ""]:
            conflict_found = True
    elif value_b_triggers:
        # Field B should NOT be in these values, but is
        actual_b_normalized = _normalize_value(actual_b)
        for trigger in value_b_triggers:
            if _normalize_value(trigger) == actual_b_normalized:
                conflict_found = True
                break

    if conflict_found:
        return DetectedConflict(
            rule_name=rule["rule_name"],
            category=rule["category"],
            severity=rule["severity"],
            title=rule["title"],
            description=rule["description"],
            field_values={field_a: actual_a, field_b: actual_b},
            is_known_rule=True,
        )

    return None


def _check_context_rule(app_data: dict, rule: dict, pattern: dict) -> DetectedConflict | None:
    """Check a context-based rule (e.g., B2C business + no PII)."""
    context_field = pattern.get("context_field")
    context_values = pattern.get("context_value", [])
    context_condition = pattern.get("context_condition")
    context_threshold = pattern.get("context_value")
    check_field = pattern.get("check_field")
    check_values = pattern.get("check_value", [])

    actual_context = app_data.get(context_field)
    actual_check = app_data.get(check_field)

    # Check if context matches
    context_matches = False

    if context_condition in [">", "<", ">=", "<="]:
        # Numeric comparison
        try:
            actual_num = float(actual_context) if actual_context else 0
            threshold = float(context_threshold) if context_threshold else 0
            if context_condition == ">" and actual_num > threshold:
                context_matches = True
            elif context_condition == "<" and actual_num < threshold:
                context_matches = True
            elif context_condition == ">=" and actual_num >= threshold:
                context_matches = True
            elif context_condition == "<=" and actual_num <= threshold:
                context_matches = True
        except (ValueError, TypeError):
            pass
    else:
        # Value matching
        actual_context_normalized = _normalize_value(actual_context)
        for ctx_val in context_values:
            if _normalize_value(ctx_val) == actual_context_normalized:
                context_matches = True
                break

    if not context_matches:
        return None

    # Check if the check field matches problem values
    actual_check_normalized = _normalize_value(actual_check)
    for check_val in check_values:
        if _normalize_value(check_val) == actual_check_normalized:
            return DetectedConflict(
                rule_name=rule["rule_name"],
                category=rule["category"],
                severity=rule["severity"],
                title=rule["title"],
                description=rule["description"],
                field_values={context_field: actual_context, check_field: actual_check},
                is_known_rule=True,
            )

    return None


def _normalize_value(value: Any) -> str:
    """Normalize a value for comparison."""
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip().lower()


def analyze_with_llm(app_data: dict, submission_context: dict | None = None) -> list[DetectedConflict]:
    """
    Use LLM to find contradictions and issues not caught by known rules.

    Args:
        app_data: The application form data
        submission_context: Optional context (industry, revenue, etc.)

    Returns:
        List of detected conflicts
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Build context string
    context_str = ""
    if submission_context:
        context_str = f"""
Business Context:
- Industry: {submission_context.get('industry', 'Unknown')}
- Business Type: {submission_context.get('business_type', 'Unknown')}
- Annual Revenue: ${submission_context.get('annual_revenue', 'Unknown'):,} if isinstance(submission_context.get('annual_revenue'), (int, float)) else submission_context.get('annual_revenue', 'Unknown')
- Employee Count: {submission_context.get('employee_count', 'Unknown')}
"""

    # Prepare app data summary (limit size for token efficiency)
    app_summary = json.dumps(app_data, indent=2, default=str)
    if len(app_summary) > 8000:
        # Truncate to most important fields
        important_fields = {k: v for k, v in app_data.items()
                          if any(term in k.lower() for term in
                                ['edr', 'mfa', 'backup', 'pii', 'security', 'employee', 'revenue',
                                 'has', 'does', 'is', 'frequency', 'vendor', 'type', 'policy'])}
        app_summary = json.dumps(important_fields, indent=2, default=str)

    prompt = f"""Analyze this cyber insurance application for contradictions, implausible answers, and credibility issues.

{context_str}

Application Data:
{app_summary}

Look for:
1. CONTRADICTIONS: Answers that conflict with each other (e.g., "No EDR" but names EDR vendor)
2. IMPLAUSIBLE ANSWERS: Answers unlikely given business type (e.g., B2C e-commerce with no PII)
3. CONDITIONAL VIOLATIONS: Answered "No" to a question but filled in the "If yes..." follow-up
4. SCALE MISMATCHES: Security posture inconsistent with company size/revenue

For each issue found, respond with a JSON array of objects with these fields:
- rule_name: snake_case identifier (e.g., "edr_vendor_contradiction")
- category: one of [edr, mfa, backup, access_control, incident_response, business_model, scale, data_handling, general]
- severity: one of [critical, high, medium, low]
- title: Short human-readable title
- description: 1-2 sentence explanation
- field_values: Object with the specific field names and values that are problematic
- explanation: Why this is a problem

If no issues found, return an empty array: []

IMPORTANT: Only return real contradictions or implausible answers. Don't flag things that are merely unusual but possible.

Respond with ONLY the JSON array, no other text."""

    try:
        response = llm.invoke([{"role": "user", "content": prompt}])
        content = response.content.strip()

        # Parse JSON from response
        # Handle potential markdown code blocks
        if content.startswith("```"):
            content = re.sub(r"```json?\s*", "", content)
            content = re.sub(r"```\s*$", "", content)

        issues = json.loads(content)

        detected = []
        for issue in issues:
            detected.append(DetectedConflict(
                rule_name=issue.get("rule_name", "unknown"),
                category=issue.get("category", "general"),
                severity=issue.get("severity", "medium"),
                title=issue.get("title", "Unknown Issue"),
                description=issue.get("description", ""),
                field_values=issue.get("field_values", {}),
                is_known_rule=False,
                llm_explanation=issue.get("explanation"),
            ))

        return detected

    except json.JSONDecodeError as e:
        print(f"Error parsing LLM response: {e}")
        return []
    except Exception as e:
        print(f"Error in LLM analysis: {e}")
        return []


def store_detected_conflicts(submission_id: str, conflicts: list[DetectedConflict]) -> None:
    """Store detected conflicts in the database."""
    if not conflicts:
        return

    with get_conn() as conn:
        for conflict in conflicts:
            # Try to find matching rule in catalog
            rule_id = None
            if conflict.is_known_rule:
                result = conn.execute(text("""
                    SELECT id FROM conflict_rules WHERE rule_name = :rule_name
                """), {"rule_name": conflict.rule_name})
                row = result.fetchone()
                if row:
                    rule_id = row[0]

            # Insert detected conflict
            conn.execute(text("""
                INSERT INTO detected_conflicts
                    (submission_id, rule_id, rule_name, field_values, llm_explanation, status)
                VALUES
                    (:submission_id, :rule_id, :rule_name, :field_values, :llm_explanation, 'pending')
                ON CONFLICT (submission_id, rule_name)
                DO UPDATE SET
                    field_values = EXCLUDED.field_values,
                    llm_explanation = EXCLUDED.llm_explanation,
                    detected_at = NOW()
            """), {
                "submission_id": submission_id,
                "rule_id": rule_id,
                "rule_name": conflict.rule_name,
                "field_values": json.dumps(conflict.field_values),
                "llm_explanation": conflict.llm_explanation,
            })

            # Update rule stats if known rule
            if rule_id:
                conn.execute(text("""
                    UPDATE conflict_rules
                    SET times_detected = times_detected + 1,
                        last_detected_at = NOW(),
                        example_submission_ids = array_append(
                            array_remove(example_submission_ids, CAST(:submission_id AS uuid)),
                            CAST(:submission_id AS uuid)
                        )
                    WHERE id = :rule_id
                """), {"rule_id": rule_id, "submission_id": submission_id})

        conn.commit()


def add_to_catalog(conflict: DetectedConflict, submission_id: str) -> str | None:
    """
    Add a newly discovered conflict pattern to the catalog.
    Returns the new rule ID if successful.
    """
    if conflict.is_known_rule:
        return None  # Already in catalog

    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                INSERT INTO conflict_rules
                    (rule_name, category, severity, title, description,
                     detection_pattern, example_bad, example_explanation,
                     source, requires_review, times_detected, example_submission_ids)
                VALUES
                    (:rule_name, :category, :severity, :title, :description,
                     :detection_pattern, :example_bad, :example_explanation,
                     'llm_discovered', true, 1, ARRAY[CAST(:submission_id AS uuid)])
                ON CONFLICT (rule_name) DO UPDATE SET
                    times_detected = conflict_rules.times_detected + 1,
                    example_submission_ids = array_append(
                        array_remove(conflict_rules.example_submission_ids, CAST(:submission_id AS uuid)),
                        CAST(:submission_id AS uuid)
                    ),
                    last_detected_at = NOW()
                RETURNING id
            """), {
                "rule_name": conflict.rule_name,
                "category": conflict.category,
                "severity": conflict.severity,
                "title": conflict.title,
                "description": conflict.description,
                "detection_pattern": json.dumps({"fields": list(conflict.field_values.keys())}),
                "example_bad": json.dumps(conflict.field_values),
                "example_explanation": conflict.llm_explanation,
                "submission_id": submission_id,
            })

            row = result.fetchone()
            conn.commit()
            return str(row[0]) if row else None

    except Exception as e:
        print(f"Error adding to catalog: {e}")
        return None


def analyze_application(
    submission_id: str,
    app_data: dict,
    submission_context: dict | None = None,
    add_new_to_catalog: bool = True,
) -> list[DetectedConflict]:
    """
    Main entry point: Analyze application data for conflicts.

    1. Check against known rules in catalog
    2. Use LLM to find new/unknown conflicts
    3. Store all detected conflicts
    4. Optionally add new patterns to catalog

    Args:
        submission_id: The submission ID
        app_data: Application form data
        submission_context: Optional business context
        add_new_to_catalog: Whether to add LLM-discovered patterns to catalog

    Returns:
        List of all detected conflicts
    """
    all_conflicts = []

    # 1. Check known rules
    known_rules = get_known_rules()
    known_conflicts = check_known_rules(app_data, known_rules)
    all_conflicts.extend(known_conflicts)

    # 2. LLM analysis for new patterns
    llm_conflicts = analyze_with_llm(app_data, submission_context)

    # Filter out duplicates (LLM may find things already in known rules)
    known_names = {c.rule_name for c in known_conflicts}
    new_conflicts = [c for c in llm_conflicts if c.rule_name not in known_names]
    all_conflicts.extend(new_conflicts)

    # 3. Store detected conflicts
    store_detected_conflicts(submission_id, all_conflicts)

    # 4. Add new patterns to catalog
    if add_new_to_catalog:
        for conflict in new_conflicts:
            add_to_catalog(conflict, submission_id)

    return all_conflicts


def get_detected_conflicts(submission_id: str) -> list[dict]:
    """Get all detected conflicts for a submission."""
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT
                    dc.id,
                    dc.rule_name,
                    dc.field_values,
                    dc.llm_explanation,
                    dc.status,
                    dc.resolved_by,
                    dc.resolved_at,
                    dc.resolution_notes,
                    dc.detected_at,
                    cr.category,
                    cr.severity,
                    cr.title,
                    cr.description
                FROM detected_conflicts dc
                LEFT JOIN conflict_rules cr ON dc.rule_id = cr.id
                WHERE dc.submission_id = :submission_id
                ORDER BY
                    CASE cr.severity
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        ELSE 4
                    END,
                    dc.detected_at DESC
            """), {"submission_id": submission_id})

            return [dict(row._mapping) for row in result.fetchall()]
    except Exception as e:
        print(f"Error getting detected conflicts: {e}")
        return []


def resolve_conflict(
    conflict_id: str,
    status: str,  # 'confirmed' or 'dismissed'
    resolved_by: str,
    notes: str | None = None,
) -> bool:
    """Resolve a detected conflict."""
    try:
        with get_conn() as conn:
            # Update the detected conflict
            conn.execute(text("""
                UPDATE detected_conflicts
                SET status = :status,
                    resolved_by = :resolved_by,
                    resolved_at = NOW(),
                    resolution_notes = :notes
                WHERE id = :conflict_id
            """), {
                "conflict_id": conflict_id,
                "status": status,
                "resolved_by": resolved_by,
                "notes": notes,
            })

            # Update rule stats
            if status == "confirmed":
                conn.execute(text("""
                    UPDATE conflict_rules cr
                    SET times_confirmed = times_confirmed + 1
                    FROM detected_conflicts dc
                    WHERE dc.id = :conflict_id
                      AND cr.id = dc.rule_id
                """), {"conflict_id": conflict_id})
            elif status == "dismissed":
                conn.execute(text("""
                    UPDATE conflict_rules cr
                    SET times_dismissed = times_dismissed + 1
                    FROM detected_conflicts dc
                    WHERE dc.id = :conflict_id
                      AND cr.id = dc.rule_id
                """), {"conflict_id": conflict_id})

            conn.commit()
            return True

    except Exception as e:
        print(f"Error resolving conflict: {e}")
        return False
