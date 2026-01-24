# Unified Data Architecture Vision

## The Core Insight

The extraction schema already defines what data points matter for underwriting. It has 220 fields across 19 categories. These fields **are** the controls — there's no need for a separate control catalog.

What's missing is:
1. **Importance weighting** — which fields require confirmation before binding
2. **Versioned priorities** — importance weights that evolve based on claims feedback
3. **Outcome measurement** — comparing loss performance across priority versions

---

## The Model

### Single Source of Truth: Extraction Schema

```
extraction_schemas (already exists)
├── 19 categories (Backup & Recovery, Access Control, etc.)
├── 220 fields (hasOfflineBackups, emailMfa, hasDLP, etc.)
├── Field types (Yes/No, Text, Number, Enum)
├── Versioned (schema can evolve)
└── Self-learning (AI suggests new fields)
```

The extraction schema defines **what to capture**. The AI figures out **how to find it** across different carrier applications.

### Per-Submission Values

When an application is processed:
```
submission_extracted_values (or similar)
├── submission_id
├── field_key (references schema field)
├── value (the extracted answer)
├── source (extraction, broker_response, verbal)
├── confidence (AI confidence score)
├── source_document_id (which doc it came from)
├── source_text (the actual text that yielded this value)
└── updated_at, updated_by (audit trail)
```

This replaces both `bullet_point_summary` (markdown) and `submission_controls` (hardcoded 10 controls).

### Importance Weights (New)

Add to schema fields:
```
schema_fields (extend existing)
├── ... existing columns ...
├── importance (enum: critical, important, nice_to_know, none)
├── importance_rationale (why this matters)
└── importance_version_id (which priority version set this)
```

Or as a separate table for cleaner versioning:
```
field_importance_settings
├── id
├── version_id (references importance_versions)
├── field_key
├── importance (critical, important, nice_to_know, none)
├── rationale (why this level)
└── effective_date
```

### Versioned Underwriting Priorities

```
importance_versions
├── id
├── version_number (v1, v2, v3...)
├── name ("Initial Launch", "Post-Q1 Claims Review", etc.)
├── description (what changed and why)
├── is_active (only one active at a time)
├── created_at
├── created_by
└── based_on_claims_through (date - claims data informing this version)
```

Example versions:
- **v1 (Launch)**: MFA fields = critical, backups = important (industry best practice)
- **v2 (Post-Q1 Claims)**: Immutable backups elevated to critical (claims showed correlation)
- **v3 (Post-ransomware spike)**: EDR coverage % elevated to critical

### Bind-Time Snapshot

When a policy is bound, record which priorities were active:
```
bound_policies (extend existing or new table)
├── ... existing columns ...
├── importance_version_id (which priority version was active)
├── extracted_values_snapshot (JSONB - frozen copy of values at bind)
```

This enables:
- "What did we know when we bound this?"
- "Which priority version were we using?"
- Comparing outcomes across versions

---

## The Feedback Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTAKE                                  │
│                                                                 │
│   Application → Extraction Schema → Extracted Values            │
│                 (what to find)      (per submission)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    UNDERWRITING                                 │
│                                                                 │
│   Importance Weights → "Information Needed" → Broker Follow-up  │
│   (which fields matter)  (gaps to fill)       (get answers)     │
│                                                                 │
│   Priority Version v2 says:                                     │
│   - hasImmutableBackups = CRITICAL (must confirm before bind)   │
│   - hasPhishingTraining = IMPORTANT (should confirm)            │
│   - dlpVendor = NICE_TO_KNOW (don't chase)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BIND                                      │
│                                                                 │
│   Policy bound with:                                            │
│   - Current extracted values (snapshot)                         │
│   - Priority version active at bind (v2)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLAIMS                                     │
│                                                                 │
│   Claim occurs → Root cause analysis:                           │
│   - What vulnerability was exploited?                           │
│   - What field values did this policy have at bind?             │
│   - Which priority version was used?                            │
│                                                                 │
│   Aggregate analysis:                                           │
│   - Policies with hasImmutableBackups=No had 3x loss ratio      │
│   - Policies bound under v1 priorities: 45% loss ratio          │
│   - Policies bound under v2 priorities: 32% loss ratio          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PRIORITY EVOLUTION                            │
│                                                                 │
│   Claims data informs new priority version:                     │
│   - Create v3 priorities                                        │
│   - Elevate fields correlated with losses                       │
│   - Demote fields that don't predict outcomes                   │
│   - Measure v3 performance over time                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Information Needed Widget (Revised)

Instead of querying a separate `submission_controls` table, query:

```sql
SELECT
    sf.field_key,
    sf.display_name,
    sf.category,
    fis.importance
FROM schema_fields sf
JOIN field_importance_settings fis
    ON sf.key = fis.field_key
    AND fis.version_id = (SELECT id FROM importance_versions WHERE is_active)
LEFT JOIN submission_extracted_values sev
    ON sev.field_key = sf.key
    AND sev.submission_id = :submission_id
WHERE fis.importance IN ('critical', 'important')
    AND (sev.value IS NULL OR sev.value = 'not_asked' OR sev.value = '')
ORDER BY fis.importance DESC, sf.category, sf.display_name
```

This shows fields that:
- Are marked critical or important in the active priority version
- Don't have a value (or have "not asked") for this submission

---

## AI Assessments (NIST, etc.)

The NIST framework assessment and other AI-generated summaries are **point-in-time analyses**, not live data.

**When to generate:**
- Initial intake (application processed)
- Pre-bind (if significant values changed since intake)
- Renewal

**What they reference:**
- The extracted values at that moment
- Synthesized into strategic view (Identify/Protect/Detect/Respond/Recover)

**Not regenerated:**
- Every time a single field is updated via broker response
- That would be expensive and potentially inconsistent

The structured extracted values are always current. The AI summaries are periodic snapshots.

---

## Migration Path

### Phase 1: Foundation
- [ ] Add `importance` column to `schema_fields` (or create `field_importance_settings`)
- [ ] Create `importance_versions` table
- [ ] Seed v1 priorities (current "mandatory 10" becomes critical fields)
- [ ] Update "Information Needed" widget to query schema + importance

### Phase 2: Extracted Values
- [ ] Create `submission_extracted_values` table (or extend existing)
- [ ] Migrate from markdown `bullet_point_summary` to structured values
- [ ] Add source tracking (extraction vs broker vs verbal)
- [ ] Controls Checklist UI reads from extracted values

### Phase 3: Bind Snapshot
- [ ] Record `importance_version_id` at bind time
- [ ] Snapshot extracted values at bind
- [ ] Enable "what did we know at bind" queries

### Phase 4: Claims Feedback
- [ ] Claims root cause tagging (which fields/values relevant)
- [ ] Loss ratio by field value analysis
- [ ] Loss ratio by priority version analysis
- [ ] Inform v2, v3 priorities based on data

---

## What This Replaces

| Old | New |
|-----|-----|
| `bullet_point_summary` (markdown) | `submission_extracted_values` (structured) |
| `submission_controls` (10 hardcoded) | Query schema fields by importance |
| `control_definitions` (static list) | `field_importance_settings` + versions |
| Manual "what's important" decisions | Data-driven priority evolution |

---

## Open Questions

1. **Granularity of importance:** Just critical/important/nice-to-know? Or numeric weights (1-10)?

2. **Category-level importance:** Can entire categories be marked important, or always per-field?

3. **Override per-submission:** Can UW mark a field as "not applicable" for a specific submission? (e.g., "backups" for a company with no data)

4. **Frequency of priority updates:** Quarterly? After N claims? On-demand?

5. **A/B testing:** Could we run two priority versions simultaneously on different submissions to compare outcomes faster?
