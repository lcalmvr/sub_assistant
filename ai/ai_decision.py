"""
AI Decision Engine with Two-Layer Knowledge Architecture

This module enhances the base RAG system with:
1. Formal Guidelines (UW Guide tables) - Source of truth
2. Observed Patterns (decision history) - Descriptive context
3. Decision Logging - For drift detection and feedback

See docs/ai-knowledge-architecture.md for full documentation.
"""

import os
import json
from typing import Optional
from decimal import Decimal

from sqlalchemy import text
from core.db import get_conn

# Import the base RAG for document-based retrieval
from ai.guideline_rag import get_ai_decision as base_get_ai_decision


def get_applicable_rules(
    industry: Optional[str] = None,
    hazard_class: Optional[int] = None,
    annual_revenue: Optional[int] = None,
    has_mfa: Optional[bool] = None,
    has_edr: Optional[bool] = None,
    has_offline_backup: Optional[bool] = None,
) -> dict:
    """
    Query UW Guide tables for rules applicable to this submission.

    Returns dict with:
        - declination_rules: Hard/soft decline triggers
        - referral_triggers: Escalation conditions
        - mandatory_controls: Required controls for this tier
        - appetite: Industry appetite status
    """
    rules = {
        "declination_rules": [],
        "referral_triggers": [],
        "mandatory_controls": [],
        "appetite": None,
    }

    with get_conn() as conn:
        # 1. Check industry appetite
        if industry:
            result = conn.execute(text("""
                SELECT id, industry_name, hazard_class, appetite_status,
                       max_limit_millions, min_retention, special_requirements,
                       declination_reason, enforcement_level
                FROM uw_appetite
                WHERE is_active = true
                  AND LOWER(industry_name) = LOWER(:industry)
                LIMIT 1
            """), {"industry": industry})
            row = result.fetchone()
            if row:
                rules["appetite"] = {
                    "rule_id": str(row.id),
                    "rule_type": "appetite",
                    "rule_name": row.industry_name,
                    "industry": row.industry_name,
                    "hazard_class": row.hazard_class,
                    "status": row.appetite_status,
                    "max_limit_millions": float(row.max_limit_millions) if row.max_limit_millions else None,
                    "min_retention": row.min_retention,
                    "special_requirements": row.special_requirements,
                    "declination_reason": row.declination_reason,
                    "enforcement_level": row.enforcement_level,
                    "would_decline": row.appetite_status == "excluded",
                    "would_refer": row.appetite_status == "restricted",
                }
                # Use appetite's hazard class if not provided
                if not hazard_class and row.hazard_class:
                    hazard_class = row.hazard_class

        # 2. Check declination rules
        result = conn.execute(text("""
            SELECT id, rule_name, description, category, condition_type,
                   condition_field, condition_value, severity,
                   override_allowed, decline_message, enforcement_level
            FROM uw_declination_rules
            WHERE is_active = true
            ORDER BY display_order
        """))
        for row in result.fetchall():
            # Check if this rule applies
            applies = False
            condition_field = row.condition_field

            # Simple field-based matching
            if condition_field == "has_mfa" and has_mfa is False:
                applies = True
            elif condition_field == "has_offline_backup" and has_offline_backup is False:
                applies = True
            elif condition_field == "industry" and industry:
                # Check if industry is in excluded list
                try:
                    excluded_list = json.loads(row.condition_value) if row.condition_value else []
                    if isinstance(excluded_list, list) and industry in excluded_list:
                        applies = True
                except:
                    pass

            if applies:
                rules["declination_rules"].append({
                    "rule_id": str(row.id),
                    "rule_type": "declination",
                    "rule_name": row.rule_name,
                    "description": row.description,
                    "category": row.category,
                    "severity": row.severity,
                    "enforcement_level": row.enforcement_level,
                    "decline_message": row.decline_message,
                    "override_allowed": row.override_allowed,
                    "would_decline": row.severity == "hard",
                    "would_refer": row.severity == "soft",
                })

        # 3. Check mandatory controls
        result = conn.execute(text("""
            SELECT id, control_name, control_key, control_category, description,
                   mandatory_above_hazard, mandatory_above_revenue_millions,
                   is_declination_trigger, is_referral_trigger,
                   credit_if_present, debit_if_missing, enforcement_level
            FROM uw_mandatory_controls
            WHERE is_active = true
            ORDER BY display_order
        """))
        for row in result.fetchall():
            # Check if this control is mandatory for this risk
            is_mandatory = False
            reason = []

            # Check hazard threshold
            if row.mandatory_above_hazard is not None:
                if hazard_class and hazard_class > row.mandatory_above_hazard:
                    is_mandatory = True
                    reason.append(f"hazard class {hazard_class} > {row.mandatory_above_hazard}")
                elif row.mandatory_above_hazard == 0:
                    is_mandatory = True
                    reason.append("required for all risks")

            # Check revenue threshold
            if row.mandatory_above_revenue_millions and annual_revenue:
                threshold = float(row.mandatory_above_revenue_millions) * 1_000_000
                if annual_revenue > threshold:
                    is_mandatory = True
                    reason.append(f"revenue > ${row.mandatory_above_revenue_millions}M")

            if is_mandatory:
                # Check if control is present
                control_present = None
                if row.control_key == "has_mfa":
                    control_present = has_mfa
                elif row.control_key == "has_edr":
                    control_present = has_edr
                elif row.control_key == "has_offline_backup":
                    control_present = has_offline_backup

                rules["mandatory_controls"].append({
                    "rule_id": str(row.id),
                    "rule_type": "control",
                    "rule_name": row.control_name,
                    "control_key": row.control_key,
                    "category": row.control_category,
                    "description": row.description,
                    "mandatory_reason": ", ".join(reason),
                    "enforcement_level": row.enforcement_level,
                    "is_present": control_present,
                    "is_missing": control_present is False,
                    "is_unknown": control_present is None,
                    "is_declination_trigger": row.is_declination_trigger,
                    "is_referral_trigger": row.is_referral_trigger,
                    "would_decline": row.is_declination_trigger and control_present is False,
                    "would_refer": row.is_referral_trigger and control_present is False,
                })

        # 4. Check referral triggers
        result = conn.execute(text("""
            SELECT id, trigger_name, description, category, condition_type,
                   condition_field, condition_value, referral_level,
                   referral_reason, enforcement_level
            FROM uw_referral_triggers
            WHERE is_active = true
            ORDER BY display_order
        """))
        for row in result.fetchall():
            # Check if this trigger applies
            applies = False

            if row.condition_field == "requested_limit":
                # Would need limit info to check
                pass
            elif row.condition_field == "annual_revenue" and annual_revenue:
                try:
                    threshold = json.loads(row.condition_value) if row.condition_value else 0
                    if annual_revenue > threshold:
                        applies = True
                except:
                    pass
            elif row.condition_field == "appetite_status":
                if rules["appetite"] and rules["appetite"]["status"] == "restricted":
                    applies = True
            elif row.condition_field == "has_edr" and has_edr is False:
                # Check if this matters for the hazard class
                if hazard_class and hazard_class >= 3:
                    applies = True
            elif row.condition_field == "has_training":
                # Would need training info
                pass

            if applies:
                rules["referral_triggers"].append({
                    "rule_id": str(row.id),
                    "rule_type": "referral",
                    "rule_name": row.trigger_name,
                    "description": row.description,
                    "category": row.category,
                    "referral_level": row.referral_level,
                    "referral_reason": row.referral_reason,
                    "enforcement_level": row.enforcement_level,
                    "would_decline": False,
                    "would_refer": True,
                })

    return rules


def get_similar_patterns(
    industry: Optional[str] = None,
    hazard_class: Optional[int] = None,
    annual_revenue: Optional[int] = None,
) -> dict:
    """
    Query observed patterns from similar past decisions.

    Returns dict with:
        - similar_cases: Summary of similar past decisions
        - override_patterns: Common overrides for applicable rules
    """
    patterns = {
        "similar_cases": None,
        "override_patterns": [],
    }

    # Determine revenue band
    revenue_band = None
    if annual_revenue:
        if annual_revenue < 10_000_000:
            revenue_band = "under_10m"
        elif annual_revenue < 50_000_000:
            revenue_band = "10m_50m"
        elif annual_revenue < 250_000_000:
            revenue_band = "50m_250m"
        else:
            revenue_band = "over_250m"

    with get_conn() as conn:
        # 1. Get similar case patterns
        if industry or hazard_class:
            sql = """
                SELECT *
                FROM uw_similar_case_patterns
                WHERE 1=1
            """
            params = {}

            if industry:
                sql += " AND LOWER(industry) = LOWER(:industry)"
                params["industry"] = industry
            if hazard_class:
                sql += " AND hazard_class = :hazard_class"
                params["hazard_class"] = hazard_class
            if revenue_band:
                sql += " AND revenue_band = :revenue_band"
                params["revenue_band"] = revenue_band

            sql += " LIMIT 1"

            try:
                result = conn.execute(text(sql), params)
                row = result.fetchone()
                if row:
                    patterns["similar_cases"] = {
                        "industry": row.industry,
                        "hazard_class": row.hazard_class,
                        "revenue_band": row.revenue_band,
                        "total_cases": row.total_cases,
                        "quoted": row.quoted,
                        "referred": row.referred,
                        "declined": row.declined,
                        "quote_rate_pct": float(row.quote_rate_pct) if row.quote_rate_pct else None,
                        "pct_with_mfa": row.pct_with_mfa,
                        "pct_with_edr": row.pct_with_edr,
                        "pct_with_backup": row.pct_with_backup,
                    }
            except Exception as e:
                # View might not have data yet
                print(f"[ai_decision] Similar patterns query failed: {e}")

        # 2. Get override patterns for rules with high override rates
        try:
            result = conn.execute(text("""
                SELECT rule_type, rule_name, enforcement_level,
                       times_applied, times_overridden, override_rate_pct,
                       common_override_reasons
                FROM uw_drift_patterns
                WHERE override_rate_pct >= 15
                ORDER BY times_applied DESC
                LIMIT 5
            """))
            for row in result.fetchall():
                patterns["override_patterns"].append({
                    "rule_type": row.rule_type,
                    "rule_name": row.rule_name,
                    "enforcement_level": row.enforcement_level,
                    "times_applied": row.times_applied,
                    "times_overridden": row.times_overridden,
                    "override_rate_pct": float(row.override_rate_pct) if row.override_rate_pct else 0,
                    "common_reasons": row.common_override_reasons,
                })
        except Exception as e:
            # View might not have data yet
            print(f"[ai_decision] Override patterns query failed: {e}")

    return patterns


def format_rules_for_prompt(rules: dict) -> str:
    """Format rules as structured text for injection into prompt."""
    lines = ["## Formal Guidelines (Source of Truth)\n"]

    # Appetite
    if rules["appetite"]:
        a = rules["appetite"]
        status_emoji = {
            "preferred": "GREEN",
            "standard": "YELLOW",
            "restricted": "ORANGE",
            "excluded": "RED",
        }.get(a["status"], "GRAY")

        lines.append(f"### Industry Appetite")
        lines.append(f"- Industry: {a['industry']}")
        lines.append(f"- Hazard Class: {a['hazard_class']}")
        lines.append(f"- Status: [{status_emoji}] {a['status'].upper()}")
        if a["max_limit_millions"]:
            lines.append(f"- Max Limit: ${a['max_limit_millions']}M")
        if a["special_requirements"]:
            lines.append(f"- Requirements: {json.dumps(a['special_requirements'])}")
        if a["status"] == "excluded":
            lines.append(f"- [HARD DECLINE] {a['declination_reason']}")
        elif a["status"] == "restricted":
            lines.append(f"- [REFER] Restricted class requires senior UW approval")
        lines.append("")

    # Declination rules
    if rules["declination_rules"]:
        lines.append("### Applicable Declination Rules")
        for r in rules["declination_rules"]:
            level = "[HARD]" if r["enforcement_level"] == "hard" else "[ADVISORY]"
            lines.append(f"- {level} {r['rule_name']}: {r['decline_message']}")
        lines.append("")

    # Mandatory controls
    missing_hard = [c for c in rules["mandatory_controls"] if c["is_missing"] and c["is_declination_trigger"]]
    missing_soft = [c for c in rules["mandatory_controls"] if c["is_missing"] and c["is_referral_trigger"]]
    unknown = [c for c in rules["mandatory_controls"] if c["is_unknown"]]

    if missing_hard or missing_soft or unknown:
        lines.append("### Mandatory Controls Issues")
        for c in missing_hard:
            lines.append(f"- [HARD DECLINE] Missing {c['rule_name']} ({c['mandatory_reason']})")
        for c in missing_soft:
            lines.append(f"- [REFER] Missing {c['rule_name']} ({c['mandatory_reason']})")
        for c in unknown:
            lines.append(f"- [UNKNOWN] {c['rule_name']} status not provided")
        lines.append("")

    # Referral triggers
    if rules["referral_triggers"]:
        lines.append("### Referral Triggers")
        for r in rules["referral_triggers"]:
            lines.append(f"- [{r['referral_level'].upper()}] {r['rule_name']}: {r['referral_reason']}")
        lines.append("")

    return "\n".join(lines)


def format_patterns_for_prompt(patterns: dict) -> str:
    """Format patterns as informational context (not prescriptive)."""
    lines = [
        "## Observed Patterns (For Context Only)",
        "",
        "Note: These patterns describe past UW behavior. They do not override guidelines.",
        ""
    ]

    if patterns["similar_cases"]:
        s = patterns["similar_cases"]
        lines.append(f"### Similar Cases ({s['industry']}, Hazard {s['hazard_class']}, {s['revenue_band']})")
        lines.append(f"- {s['total_cases']} cases in last 12 months")
        lines.append(f"- {s['quoted']} quoted ({s['quote_rate_pct']}%), {s['referred']} referred, {s['declined']} declined")
        if s['pct_with_mfa'] is not None:
            lines.append(f"- {s['pct_with_mfa']}% had MFA, {s['pct_with_edr']}% had EDR")
        lines.append("")

    if patterns["override_patterns"]:
        lines.append("### Common Override Patterns")
        for p in patterns["override_patterns"]:
            lines.append(f"- {p['rule_name']}: overridden {p['override_rate_pct']}% of time ({p['times_overridden']}/{p['times_applied']})")
            if p["common_reasons"]:
                for reason in p["common_reasons"][:2]:
                    lines.append(f"  - Common reason: {reason.get('reason', 'Unknown')}")
        lines.append("")

    if not patterns["similar_cases"] and not patterns["override_patterns"]:
        lines.append("No similar case patterns available yet.")
        lines.append("")

    return "\n".join(lines)


def get_ai_decision_with_rules(
    business_summary: str,
    cyber_exposures: str,
    controls_summary: str,
    submission_id: Optional[str] = None,
    industry: Optional[str] = None,
    hazard_class: Optional[int] = None,
    annual_revenue: Optional[int] = None,
    has_mfa: Optional[bool] = None,
    has_edr: Optional[bool] = None,
    has_offline_backup: Optional[bool] = None,
) -> dict:
    """
    Enhanced AI decision with formal rules and observed patterns.

    This function:
    1. Queries applicable UW Guide rules
    2. Queries similar case patterns
    3. Injects both as context for the AI
    4. Logs the decision for feedback collection

    Returns:
        {
            "answer": str,           # AI recommendation markdown
            "citations": list,       # Document citations
            "rules_applied": list,   # Formal rules considered
            "patterns_noted": list,  # Observed patterns
            "decision_log_id": str,  # For feedback tracking
            "recommendation": str,   # 'quote', 'refer', 'decline'
            "confidence": float,     # 0-1 confidence score
        }
    """
    # 1. Get applicable rules
    rules = get_applicable_rules(
        industry=industry,
        hazard_class=hazard_class,
        annual_revenue=annual_revenue,
        has_mfa=has_mfa,
        has_edr=has_edr,
        has_offline_backup=has_offline_backup,
    )

    # 2. Get observed patterns
    patterns = get_similar_patterns(
        industry=industry,
        hazard_class=hazard_class,
        annual_revenue=annual_revenue,
    )

    # 3. Format context for prompt injection
    rules_context = format_rules_for_prompt(rules)
    patterns_context = format_patterns_for_prompt(patterns)

    # 4. Build enhanced prompts
    enhanced_business = f"""
{rules_context}

{patterns_context}

---

## Submission Summary

Business Summary:
{business_summary}
"""

    # 5. Call base RAG with enhanced context
    result = base_get_ai_decision(
        enhanced_business,
        cyber_exposures,
        controls_summary
    )

    # 6. Determine recommendation from AI response
    answer = result.get("answer", "")
    recommendation = "refer"  # Default to refer if unclear
    if "**Decision**: Quote" in answer or "Decision: Quote" in answer:
        recommendation = "quote"
    elif "**Decision**: Decline" in answer or "Decision: Decline" in answer:
        recommendation = "decline"
    elif "**Decision**: Refer" in answer or "Decision: Refer" in answer:
        recommendation = "refer"

    # 7. Calculate confidence based on rule alignment
    confidence = 0.7  # Base confidence

    # Increase confidence if rules clearly indicate decision
    hard_declines = [r for r in rules["declination_rules"] if r["enforcement_level"] == "hard"]
    if hard_declines and recommendation == "decline":
        confidence = 0.95
    elif rules["appetite"] and rules["appetite"]["status"] == "excluded" and recommendation == "decline":
        confidence = 0.98
    elif rules["appetite"] and rules["appetite"]["status"] == "preferred" and recommendation == "quote":
        confidence = 0.85

    # 8. Compile rules applied
    rules_applied = []
    if rules["appetite"]:
        rules_applied.append(rules["appetite"])
    rules_applied.extend(rules["declination_rules"])
    rules_applied.extend([c for c in rules["mandatory_controls"] if c["is_missing"]])
    rules_applied.extend(rules["referral_triggers"])

    # 9. Log the decision
    decision_log_id = None
    if submission_id:
        try:
            context_json = json.dumps({
                "industry": industry,
                "hazard_class": hazard_class,
                "annual_revenue": annual_revenue,
                "has_mfa": has_mfa,
                "has_edr": has_edr,
                "has_offline_backup": has_offline_backup,
            })

            with get_conn() as conn:
                res = conn.execute(text("""
                    SELECT log_ai_decision(
                        :submission_id::uuid,
                        :ai_recommendation,
                        :ai_confidence,
                        :ai_reasoning,
                        :rules_applied::jsonb,
                        :patterns_noted::jsonb,
                        :context::jsonb
                    ) as log_id
                """), {
                    "submission_id": submission_id,
                    "ai_recommendation": recommendation,
                    "ai_confidence": confidence,
                    "ai_reasoning": answer,
                    "rules_applied": json.dumps(rules_applied),
                    "patterns_noted": json.dumps(patterns.get("similar_cases")),
                    "context": context_json,
                })
                row = res.fetchone()
                if row:
                    decision_log_id = str(row.log_id)
        except Exception as e:
            print(f"[ai_decision] Failed to log decision: {e}")

    return {
        "answer": answer,
        "citations": result.get("citations", []),
        "rules_applied": rules_applied,
        "patterns_noted": patterns,
        "decision_log_id": decision_log_id,
        "recommendation": recommendation,
        "confidence": confidence,
    }


def record_uw_decision(
    decision_log_id: str,
    uw_decision: str,
    override_reason: Optional[str] = None,
    override_category: Optional[str] = None,
    decided_by: Optional[str] = None,
) -> bool:
    """
    Record the final UW decision for a logged AI recommendation.

    This enables drift detection by comparing AI vs UW decisions.

    Args:
        decision_log_id: ID from get_ai_decision_with_rules
        uw_decision: 'quote', 'refer', or 'decline'
        override_reason: If overriding AI, why?
        override_category: Category of override (control_mitigation, business_context, etc.)
        decided_by: UW username

    Returns:
        True if recorded successfully
    """
    try:
        with get_conn() as conn:
            conn.execute(text("""
                SELECT record_uw_decision(
                    :decision_log_id::uuid,
                    :uw_decision,
                    :override_reason,
                    :override_category,
                    :decided_by
                )
            """), {
                "decision_log_id": decision_log_id,
                "uw_decision": uw_decision,
                "override_reason": override_reason,
                "override_category": override_category,
                "decided_by": decided_by,
            })
        return True
    except Exception as e:
        print(f"[ai_decision] Failed to record UW decision: {e}")
        return False
