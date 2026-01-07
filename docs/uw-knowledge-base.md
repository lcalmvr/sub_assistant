# UW Knowledge Base Documentation

This document describes the underwriting knowledge base system, including conflict detection rules, credibility scoring, and market news.

## Overview

The UW Knowledge Base consists of three integrated systems:

1. **Conflict Detection** - Finds contradictions and implausibilities in application data
2. **Credibility Scoring** - Rates application quality on a 0-100 scale
3. **Market News** - Team-curated articles about cyber insurance and threats

---

## Conflict Detection System

### Rule Lifecycle

Rules flow through three stages:

```
system → llm_discovered → uw_added
```

| Source | Description | How Created |
|--------|-------------|-------------|
| `system` | Built-in rules shipped with the platform | Hardcoded in `conflict_config.py` |
| `llm_discovered` | Patterns detected by AI during analysis | Promoted from `ai/conflict_analyzer.py` findings |
| `uw_added` | Rules created by underwriters | Added via UW Guide UI or direct SQL |

### Naming Conventions

Rule names follow snake_case with category prefix:

```
{category}_{specific_pattern}
```

Examples:
- `edr_vendor_without_edr` - EDR category
- `mfa_type_without_mfa` - MFA category
- `backup_frequency_without_backups` - Backup category
- `large_company_no_security_team` - Scale category

### Categories

| Category | Description |
|----------|-------------|
| `edr` | Endpoint detection and response |
| `mfa` | Multi-factor authentication |
| `backup` | Backup and recovery |
| `access_control` | Access management and PAM |
| `incident_response` | IR plans and SOC |
| `data_handling` | PII, PHI, and data storage |
| `business_model` | B2B/B2C/industry-specific |
| `scale` | Company size-based expectations |

### Severity Definitions

| Severity | Weight | Description | Example |
|----------|--------|-------------|---------|
| `critical` | 3.0 | Direct logical impossibility | "Has no EDR" but "EDR coverage = 100%" |
| `high` | 2.0 | Conditional violation | Answered "No" but filled "If yes..." |
| `medium` | 1.0 | Unlikely combination | Large company without security team |
| `low` | 0.5 | Unusual but possible | High revenue without cyber insurance |

### Stats Tracking

Each rule tracks usage statistics:

- `times_detected` - How often the rule has triggered
- `times_confirmed` - How often UWs confirmed the conflict was real
- `times_dismissed` - How often UWs dismissed as false positive

Confirmation rate = `times_confirmed / times_detected`

Rules with low confirmation rates may be candidates for tuning or removal.

### Adding New Rules

**Via UW Guide UI:**
1. Navigate to UW Guide > Common Conflicts
2. Click "Add Rule"
3. Fill in rule details (name, category, severity, pattern)
4. Rule is saved with `source = 'uw_added'`

**Via SQL:**
```sql
INSERT INTO conflict_rules (
    rule_name, category, severity, title, description,
    detection_pattern, source, is_active
) VALUES (
    'custom_rule_name',
    'edr',
    'medium',
    'Custom Rule Title',
    'Description of what this rule detects',
    '{"field_a": "hasEdr", "value_a": [false], "field_b": "edrVendor"}',
    'uw_added',
    true
);
```

---

## Credibility Score System

### Three Dimensions

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Consistency** | 40% | Internal coherence of answers |
| **Plausibility** | 35% | Business context fit |
| **Completeness** | 25% | Answer quality and thoroughness |

### Score Labels

| Score Range | Label | Meaning |
|-------------|-------|---------|
| 90-100 | Excellent | Consistent, plausible, thorough |
| 80-89 | Good | Minor issues, likely mistakes |
| 70-79 | Fair | Some concerns, extra scrutiny |
| 60-69 | Poor | Multiple issues, request clarification |
| 0-59 | Very Poor | Significant credibility issues |

### Consistency Rules

Located in `core/credibility_config.py` under `CONSISTENCY_RULES`.

These detect contradictions between field pairs:
- "Has no EDR" + "EDR coverage 100%"
- "No backups" + "Backup frequency: daily"
- "No SOC" + "24x7 SOC coverage"

### Plausibility Rules

Located in `core/credibility_config.py` under `PLAUSIBILITY_RULES`.

These check business context fit:
- B2C company claims no PII collection
- Healthcare provider claims no PHI
- 500+ employee company has no security team

Context factors:
- `business_model` - B2B, B2C, B2G
- `naics_prefix` - Industry classification
- `industry_keywords` - Business description terms
- `employee_count_min` / `revenue_min` - Size thresholds

### Completeness Scoring

Points awarded/deducted for response quality:

| Signal | Points | Description |
|--------|--------|-------------|
| Question answered | +1 | Basic response provided |
| Specific vendor named | +2 | "CrowdStrike" vs "Yes" |
| Percentage provided | +2 | "95%" vs "Most" |
| Date provided | +2 | Specific date given |
| Freeform explanation | +2 | >20 chars in text field |
| Blank required | -3 | Required field empty |
| Nonsense text | -5 | "asdf", "test", "xxx" |
| All-yes pattern | -2 | Suspiciously uniform answers |

---

## Database Tables

### conflict_rules

Master catalog of all detection rules.

```sql
CREATE TABLE conflict_rules (
    id UUID PRIMARY KEY,
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    severity VARCHAR(20),
    title VARCHAR(200),
    description TEXT,
    detection_pattern JSONB,
    example_bad TEXT,
    example_explanation TEXT,
    times_detected INT DEFAULT 0,
    times_confirmed INT DEFAULT 0,
    times_dismissed INT DEFAULT 0,
    source VARCHAR(50) DEFAULT 'system',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### detected_conflicts

Instance tracking per submission.

```sql
CREATE TABLE detected_conflicts (
    id UUID PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id),
    rule_id UUID REFERENCES conflict_rules(id),
    rule_name VARCHAR(100),
    field_values JSONB,
    llm_explanation TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### credibility_scores

Cached scores per submission.

```sql
CREATE TABLE credibility_scores (
    id UUID PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id),
    total_score NUMERIC,
    label VARCHAR(20),
    consistency_score NUMERIC,
    plausibility_score NUMERIC,
    completeness_score NUMERIC,
    issues JSONB,
    calculated_at TIMESTAMPTZ DEFAULT now()
);
```

### market_news

Team-curated articles.

```sql
CREATE TABLE market_news (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    url TEXT,
    source VARCHAR(100),
    category VARCHAR(50),
    tags JSONB,
    summary TEXT,
    published_at DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by VARCHAR(100)
);
```

---

## Key Files

| File | Purpose |
|------|---------|
| `core/conflict_config.py` | Detection strategy, field lists, contradiction rules |
| `core/conflict_detection.py` | Core detection logic (890 lines) |
| `core/conflict_service.py` | Orchestration with eager/lazy/hybrid modes |
| `ai/conflict_analyzer.py` | LLM-based analysis and pattern discovery |
| `core/credibility_config.py` | Score weights, consistency/plausibility rules |
| `core/credibility_score.py` | Score calculation engine |
| `core/market_news.py` | Market news CRUD operations |
| `ai/guideline_rag.py` | Guideline retrieval with vector search |

---

## API Endpoints

```
# Conflict Rules
GET  /api/conflict-rules              - List all rules
GET  /api/conflict-rules/{id}         - Get rule details
POST /api/conflict-rules              - Create rule
PATCH /api/conflict-rules/{id}        - Update rule
DELETE /api/conflict-rules/{id}       - Deactivate rule

# Submission Conflicts
GET  /api/submissions/{id}/conflicts  - Get detected conflicts
POST /api/submissions/{id}/conflicts/{cid}/resolve - Resolve conflict

# Credibility Score
GET  /api/submissions/{id}/credibility-score - Get score breakdown

# Market News
GET  /api/market-news                 - List articles
POST /api/market-news                 - Create article
DELETE /api/market-news/{id}          - Delete article
```

---

## Usage Examples

### Check a submission's credibility

```python
from core.credibility_score import calculate_credibility_score

score = calculate_credibility_score(submission_id)
print(f"Score: {score.total_score} ({score.label})")
for issue in score.all_issues:
    print(f"  - [{issue.severity}] {issue.message}")
```

### Add a custom conflict rule

```python
from core.conflict_detection import add_conflict_rule

add_conflict_rule(
    rule_name="custom_b2c_no_payment",
    category="business_model",
    severity="high",
    title="B2C without payment processing",
    detection_pattern={
        "context": {"business_model": ["B2C"]},
        "field": "acceptsCreditCards",
        "implausible_values": [False]
    }
)
```

### Query conflict statistics

```sql
SELECT
    rule_name,
    times_detected,
    times_confirmed,
    ROUND(times_confirmed::numeric / NULLIF(times_detected, 0) * 100, 1) as confirm_rate
FROM conflict_rules
WHERE times_detected > 10
ORDER BY confirm_rate DESC;
```
