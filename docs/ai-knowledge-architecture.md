# AI Knowledge Architecture

## Overview

The AI underwriting assistant uses a **two-layer knowledge architecture** that separates formal guidelines from observed patterns. This ensures:

1. **Governance**: Guidelines only change through deliberate approval
2. **Transparency**: AI shows both rules and typical practice
3. **Flexibility**: Most underwriting rules are advisory, not rigid
4. **Continuous Learning**: Patterns are tracked without auto-modifying rules

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   LAYER 1: FORMAL GUIDELINES (Source of Truth)                      │
│   ════════════════════════════════════════════                      │
│                                                                     │
│   Tables:                                                           │
│   • uw_appetite              - Industry classification & appetite   │
│   • uw_mandatory_controls    - Required security controls by tier   │
│   • uw_declination_rules     - When to decline (hard vs soft)       │
│   • uw_referral_triggers     - When to escalate to senior UW        │
│   • uw_pricing_guidelines    - Rate guidance by hazard/revenue      │
│   • uw_geographic_restrictions - Territory-based appetite           │
│                                                                     │
│   Each rule has:                                                    │
│   • enforcement_level: 'hard' | 'advisory' | 'flexible'             │
│   • Only changed via deliberate approval (audit trail)              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   LAYER 2: OBSERVED PATTERNS (Descriptive, Never Prescriptive)      │
│   ════════════════════════════════════════════════════════════      │
│                                                                     │
│   Tables:                                                           │
│   • uw_decision_log          - Every AI rec vs UW final decision    │
│   • uw_drift_patterns        - Aggregated divergence from rules     │
│                                                                     │
│   Purpose:                                                          │
│   • Track what UWs actually do vs what guidelines say               │
│   • Surface patterns for human review                               │
│   • NEVER auto-modify Layer 1 rules                                 │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   AI DECISION ENGINE                                                │
│   ══════════════════                                                │
│                                                                     │
│   Input:                                                            │
│   • Submission data (industry, controls, revenue, etc.)             │
│   • Formal guidelines (Layer 1) - filtered by relevance             │
│   • Observed patterns (Layer 2) - similar past decisions            │
│   • RAG context - embedded guideline documents                      │
│                                                                     │
│   Output:                                                           │
│   • Recommendation: Quote / Refer / Decline                         │
│   • Guideline basis: "Per uw_declination_rules.no_mfa..."           │
│   • Pattern note: "Similar cases approved 6/8 times when..."        │
│   • Confidence level based on rule enforcement + pattern alignment  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Enforcement Levels

Rules are categorized by how strictly they should be followed:

| Level | Behavior | AI Handling | Example |
|-------|----------|-------------|---------|
| `hard` | Must follow - no exceptions without override | AI recommends decline/refer, flags as mandatory | No MFA, excluded industry, active breach |
| `advisory` | Strong guidance - deviations should be justified | AI recommends action, notes typical practice | Missing EDR on hazard 3+, no backup testing |
| `flexible` | Guideline exists but UW judgment prevails | AI surfaces rule + patterns, UW decides | Revenue thresholds, geographic considerations |

### Default Enforcement by Table

| Table | Default Level | Rationale |
|-------|---------------|-----------|
| `uw_declination_rules` (severity=hard) | `hard` | Regulatory/compliance reasons |
| `uw_declination_rules` (severity=soft) | `advisory` | Strong recommendation |
| `uw_mandatory_controls` (is_declination_trigger=true) | `hard` | Non-negotiable controls |
| `uw_mandatory_controls` (is_referral_trigger=true) | `advisory` | Escalation path exists |
| `uw_referral_triggers` | `advisory` | Guidance for escalation |
| `uw_appetite` (status=excluded) | `hard` | Outside appetite |
| `uw_appetite` (status=restricted) | `advisory` | Extra scrutiny required |
| `uw_pricing_guidelines` | `flexible` | Rate guidance, not mandates |

---

## Decision Logging

Every AI recommendation is logged alongside the final UW decision:

```sql
CREATE TABLE uw_decision_log (
    id UUID PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id),

    -- AI recommendation
    ai_recommendation VARCHAR(20),      -- 'quote', 'refer', 'decline'
    ai_confidence DECIMAL(3,2),         -- 0.00 to 1.00
    ai_reasoning TEXT,                  -- Full AI response
    rules_applied JSONB,                -- [{rule_id, rule_type, enforcement_level}]
    patterns_noted JSONB,               -- [{pattern_id, similar_cases, approval_rate}]

    -- UW decision
    uw_decision VARCHAR(20),            -- 'quote', 'refer', 'decline'
    uw_matches_ai BOOLEAN,              -- Quick flag for alignment
    override_reason TEXT,               -- If UW overrode AI, why?
    decided_by VARCHAR(100),
    decided_at TIMESTAMPTZ,

    -- Context for pattern analysis
    submission_snapshot JSONB,          -- Key fields at decision time

    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Drift Detection

Drift patterns are aggregated views that surface when UW behavior diverges from guidelines:

```sql
-- Example: Rules that are frequently overridden
SELECT
    rule_type,
    rule_id,
    rule_name,
    enforcement_level,
    times_applied,
    times_overridden,
    ROUND(times_overridden::decimal / NULLIF(times_applied, 0) * 100, 1) as override_rate,
    common_override_reasons
FROM uw_drift_patterns
WHERE override_rate > 20  -- More than 20% override rate
ORDER BY times_applied DESC;
```

### Drift Review Workflow

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│   Drift Detected                                              │
│   "No EDR" rule overridden 35% of time                        │
│   Common reason: "EDR deployment in progress, 60-day plan"    │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│   Review Options:                                             │
│                                                               │
│   [Accept & Amend Rule]                                       │
│   → Add exception: "EDR deployment plan < 90 days = advisory" │
│   → Creates audit record of rule change                       │
│   → Updates enforcement_level or adds condition               │
│                                                               │
│   [Reject & Flag for Training]                                │
│   → Pattern noted but rule unchanged                          │
│   → Generates UW training reminder                            │
│   → Tracks continued divergence                               │
│                                                               │
│   [Dismiss]                                                   │
│   → Acknowledged, no action                                   │
│   → Resets drift counter                                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## AI Prompt Structure

When generating recommendations, the AI receives structured context:

```
## Formal Guidelines (Source of Truth)

### Applicable Declination Rules
- [HARD] No MFA: "MFA is required for all remote access. Cannot bind without MFA."
- [ADVISORY] No EDR: "EDR recommended for hazard class 3+. Refer to senior UW if missing."

### Industry Appetite
- Industry: Healthcare Providers
- Hazard Class: 4
- Status: RESTRICTED
- Requirements: HIPAA compliance, full security stack
- Max Limit: $3M

### Mandatory Controls for This Risk
- [HARD] MFA - Required for all risks
- [HARD] Offline Backups - Required for all risks
- [ADVISORY] EDR - Required for hazard > 2
- [ADVISORY] Security Training - Required for revenue > $25M

---

## Observed Patterns (For Context Only)

Note: These patterns describe past UW behavior. They do not override guidelines.

### Similar Cases (Healthcare, Hazard 4, $50-100M revenue)
- 12 cases in last 6 months
- 8 quoted (67%), 2 referred (17%), 2 declined (17%)

### Override Patterns for Missing EDR
- 6 cases with missing EDR in this segment
- 4 approved with condition: "EDR implementation within 60 days"
- 2 declined due to other factors

---

## Submission Summary

[Business summary, controls, exposures...]

---

## Your Task

Recommend Quote, Refer, or Decline based on the formal guidelines.
Note any relevant patterns that the underwriter should consider.
Clearly distinguish between guideline requirements and observed patterns.
```

---

## Key Principles

1. **Guidelines are authoritative** - AI recommendations are based on formal rules
2. **Patterns are informational** - They help UWs understand context, not override rules
3. **Drift is surfaced, not acted upon** - Humans decide if rules should change
4. **Enforcement levels provide flexibility** - Not all rules are equal
5. **Full audit trail** - Every decision, override, and rule change is logged
6. **Underwriting is fluid** - The system supports judgment, not just compliance

---

## Database Tables

### Layer 1: Formal Guidelines
- `uw_appetite` - Industry appetite matrix
- `uw_mandatory_controls` - Required controls by tier
- `uw_declination_rules` - Decline criteria
- `uw_referral_triggers` - Escalation triggers
- `uw_pricing_guidelines` - Rate guidance
- `uw_geographic_restrictions` - Territory restrictions

### Layer 2: Observed Patterns
- `uw_decision_log` - Individual decision records
- `uw_drift_patterns` - Aggregated divergence analysis

### Governance
- `uw_rule_amendments` - Audit trail of rule changes

---

## See Also

- `ai/guideline_rag.py` - RAG implementation for document-based context
- `core/ai_decision.py` - Decision engine with rule + pattern injection
- `docs/uw-knowledge-base.md` - UW Guide documentation
