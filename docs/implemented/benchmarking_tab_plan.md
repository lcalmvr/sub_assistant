# Benchmarking Tab Implementation Plan

Move "Similar Submissions" from UW tab to a dedicated Benchmarking tab with pricing, outcome, and performance data for underwriting decision support.

---

## Overview

**Current State:** Similar submissions panel in UW tab uses vector similarity to find comparable companies. Shows: company name, industry, revenue, similarity score, and side-by-side comparison of business summaries and NIST controls.

**Target State:** Dedicated Benchmarking tab that answers: "What have we done with similar risks, and how did it turn out?"

**Tab Order:** Account → Review → UW → **Benchmark** → Rating → Quote → Policy

---

## Data Model

### Comparable Submission Structure

```python
comparable = {
    # Identity
    "id": str,
    "applicant_name": str,
    "date_received": date,
    "similarity_score": float,  # 0-1 from vector search

    # Exposure Profile
    "annual_revenue": float,
    "naics_primary_code": str,
    "naics_primary_title": str,
    "industry_tags": list[str],

    # Pricing (from insurance_towers where is_bound=True or best quote)
    "layer_type": str,          # "primary" or "excess"
    "attachment_point": float,  # 0 for primary
    "limit": float,
    "retention": float,
    "premium": float,
    "rate_per_mil": float,      # premium / (limit / 1,000,000)

    # Outcome
    "submission_status": str,   # received, quoted, declined
    "submission_outcome": str,  # pending, bound, lost, declined
    "outcome_reason": str,      # if lost/declined

    # Performance (if bound)
    "policy_effective": date,
    "claims_count": int,
    "claims_paid": float,
    "loss_ratio": float,        # claims_paid / premium
}
```

### SQL Query for Comparables

```sql
-- Get comparables with pricing and outcomes
WITH similar AS (
    SELECT
        s.id,
        s.applicant_name,
        s.date_received,
        s.annual_revenue,
        s.naics_primary_code,
        s.naics_primary_title,
        s.industry_tags,
        s.submission_status,
        s.submission_outcome,
        s.outcome_reason,
        s.ops_embedding <=> :query_embedding AS distance
    FROM submissions s
    WHERE s.id <> :current_id
    ORDER BY distance
    LIMIT 20
),
tower_pricing AS (
    SELECT
        t.submission_id,
        t.layer_type,
        t.attachment_point,
        t.limit_amount as limit,
        t.retention,
        COALESCE(t.sold_premium, t.quoted_premium) as premium,
        t.is_bound
    FROM insurance_towers t
    WHERE t.submission_id IN (SELECT id FROM similar)
),
loss_data AS (
    SELECT
        submission_id,
        COUNT(*) as claims_count,
        SUM(paid_amount) as claims_paid
    FROM loss_history
    WHERE submission_id IN (SELECT id FROM similar)
    GROUP BY submission_id
)
SELECT
    s.*,
    1 - s.distance as similarity_score,
    tp.layer_type,
    tp.attachment_point,
    tp.limit,
    tp.retention,
    tp.premium,
    CASE WHEN tp.limit > 0 THEN tp.premium / (tp.limit / 1000000.0) ELSE 0 END as rate_per_mil,
    tp.is_bound,
    ld.claims_count,
    ld.claims_paid,
    CASE WHEN tp.premium > 0 THEN COALESCE(ld.claims_paid, 0) / tp.premium ELSE 0 END as loss_ratio
FROM similar s
LEFT JOIN tower_pricing tp ON tp.submission_id = s.id
LEFT JOIN loss_data ld ON ld.submission_id = s.id
ORDER BY similarity_score DESC;
```

---

## UI Components

### 1. Filter Controls (Top)

```
[Similarity: Operations ▼] [Revenue: ±25% ☑] [Industry: Same NAICS ☑] [Outcome: All ▼]
```

- **Similarity basis:** Operations / Controls / Combined (existing)
- **Revenue filter:** Match within percentage range
- **Industry filter:** Same NAICS code or any
- **Outcome filter:** All / Bound only / Lost only

### 2. Summary Metrics (Cards)

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ 12 Comparables  │ │ Bind Rate: 58%  │ │ Avg Rate: $8.5K │ │ Avg Loss: 32%   │
│ found           │ │ (7 of 12)       │ │ per mil         │ │ ratio           │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 3. Pricing Distribution (Optional Chart)

```
Rate per Mil Distribution (Bound policies)
┌──────────────────────────────────────────┐
│    ▂▃▅▇▇▅▃▂                              │
│    $6K    $9K    $12K                    │
│                                          │
│    Your proposed rate: $9K ✓ (median)    │
└──────────────────────────────────────────┘
```

### 4. Comparables Table

```
┌──────────────┬────────┬─────────┬───────┬────────┬──────────┬────────┬──────────┐
│ Company      │ Rev    │ Industry│ Layer │ Limit  │ Rate/Mil │ Outcome│ Loss Ratio│
├──────────────┼────────┼─────────┼───────┼────────┼──────────┼────────┼──────────┤
│ TechCorp     │ $50M   │ SaaS    │ Pri   │ $2M    │ $9,000   │ ✅ Bound│ 28%      │
│ DataFlow Inc │ $45M   │ SaaS    │ Pri   │ $2M    │ $8,000   │ ✅ Bound│ 45%      │
│ CloudSys     │ $55M   │ Cloud   │ Pri   │ $3M    │ $11,000  │ ❌ Lost │ —        │
│ NetSecure    │ $48M   │ MSP     │ Exc   │ $3M/3M │ $4,000   │ ✅ Bound│ 12%      │
└──────────────┴────────┴─────────┴───────┴────────┴──────────┴────────┴──────────┘
                                                          [Select row for details]
```

Column config:
- Company: Link to submission
- Rev: NumberColumn compact format
- Industry: naics_primary_title truncated
- Layer: Pri/Exc with attachment if excess
- Limit: NumberColumn compact
- Rate/Mil: NumberColumn currency format
- Outcome: Emoji + text (Bound/Lost/Declined/Pending)
- Loss Ratio: Percentage or "—" if not bound

### 5. Detail Comparison (Expander/Modal on row select)

When user selects a row, show side-by-side comparison:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Compare: Current Submission vs TechCorp                                 │
├─────────────────────────────────┬───────────────────────────────────────┤
│ Current                         │ TechCorp (92% similar)                │
├─────────────────────────────────┼───────────────────────────────────────┤
│ Revenue: $48M                   │ Revenue: $50M                         │
│ Industry: Software/SaaS         │ Industry: Software/SaaS               │
│ Employees: 250                  │ Employees: 280                        │
├─────────────────────────────────┼───────────────────────────────────────┤
│ (Your proposed terms)           │ Bound Terms:                          │
│ Limit: $2M                      │ Limit: $2M                            │
│ Retention: $50K                 │ Retention: $50K                       │
│ Premium: TBD                    │ Premium: $18,000                      │
│ Rate/Mil: TBD                   │ Rate/Mil: $9,000                      │
├─────────────────────────────────┼───────────────────────────────────────┤
│                                 │ Performance (18 months):              │
│                                 │ Claims: 1                             │
│                                 │ Paid: $5,200                          │
│                                 │ Loss Ratio: 28%                       │
└─────────────────────────────────┴───────────────────────────────────────┘
```

---

## Files to Create/Modify

### New Files

1. **`pages_components/benchmarking_panel.py`**
   - `render_benchmarking_panel(submission_id, get_conn)`
   - Main component with filters, metrics, table, comparison

2. **`core/benchmarking.py`**
   - `get_comparables(submission_id, filters) -> list[dict]`
   - `get_benchmark_metrics(comparables) -> dict`
   - `get_pricing_distribution(comparables) -> dict`

### Modified Files

1. **`pages_workflows/submissions.py`**
   - Add Benchmark tab between UW and Rating
   - Remove similar_submissions_panel from UW tab
   - Update tab list: `["📋 Account", "⚠️ Review", "🔍 UW", "📊 Benchmark", "💵 Rating", "💰 Quote", "📑 Policy"]`

---

## Implementation Order

1. **Create `core/benchmarking.py`**
   - `get_comparables()` - SQL query with pricing/outcome data
   - `get_benchmark_metrics()` - Calculate summary stats

2. **Create `pages_components/benchmarking_panel.py`**
   - Filter controls
   - Metrics cards
   - Comparables table with column config
   - Row selection for detail comparison

3. **Update `pages_workflows/submissions.py`**
   - Add tab_benchmark
   - Import and render benchmarking_panel
   - Remove similar_submissions_panel call from UW tab

4. **Test & iterate**
   - Verify pricing data shows correctly
   - Check loss ratio calculations
   - Tune similarity filters

---

## Key Queries

### Get submission's current tower for comparison

```sql
SELECT layer_type, attachment_point, limit_amount, retention,
       COALESCE(sold_premium, quoted_premium) as premium
FROM insurance_towers
WHERE submission_id = :submission_id
ORDER BY is_bound DESC, created_at DESC
LIMIT 1;
```

### Calculate rate per mil

```python
rate_per_mil = premium / (limit / 1_000_000) if limit > 0 else 0
```

### Outcome emoji mapping

```python
OUTCOME_DISPLAY = {
    ("quoted", "bound"): "✅ Bound",
    ("quoted", "lost"): "❌ Lost",
    ("declined", "declined"): "🚫 Declined",
    ("quoted", "pending"): "⏳ Pending",
    ("quoted", "waiting_for_response"): "⏳ Waiting",
}
```

---

## Dependencies

- Existing: `submissions` table, `insurance_towers` table, `loss_history` table
- Existing: Vector embeddings (`ops_embedding`, `controls_embedding`)
- Existing: `similar_submissions_panel.py` (to be replaced/removed)

---

## Notes

- Rate per mil is the key normalizing metric for like-for-like comparison
- Excess layers should show attachment point in display
- Loss ratio only meaningful for bound policies with claims history
- Consider caching comparables if query is slow (new `submission_benchmarks` table)

### Loss Signal Thresholds (Comps Tab)

- **Clean:** 0 claims and $0 paid
- **Activity:** claims > 0 but $0 paid
- **Low:** paid < $100K
- **Moderate:** paid $100K–$1M
- **Severe:** paid > $1M
