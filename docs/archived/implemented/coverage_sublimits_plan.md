# Coverage & Sublimits Implementation Plan

## Overview

Add policy form selection and coverage/sublimit management to the Rating and Quote tabs, supporting Cyber, Cyber/Tech, and Tech policy forms.

---

## Final Coverage Structure

### Aggregate Coverages (11 total)

| # | Coverage Name | Default | Notes |
|---|---------------|---------|-------|
| 1 | Network Security & Privacy Liability | Aggregate | |
| 2 | Privacy Regulatory Proceedings | Aggregate | |
| 3 | Payment Card Industry (PCI) | Aggregate | |
| 4 | Media Liability | Aggregate | |
| 5 | Business Interruption | Aggregate | Malicious attack |
| 6 | System Failure | Aggregate | Non-malicious |
| 7 | Dependent Business Interruption | Aggregate | Malicious |
| 8 | Cyber Extortion | Aggregate | |
| 9 | Data Recovery | Aggregate | |
| 10 | Reputational Harm | Aggregate | |
| 11 | Tech E&O | Per form | $0 for Cyber, Aggregate for Cyber/Tech & Tech |

### Sublimit Coverages (6 total)

| Coverage | Default | Options |
|----------|---------|---------|
| Dependent System Failure | $1,000,000 | 250K, 500K, 1M, Aggregate, Custom |
| Social Engineering | $250,000 | 100K, 250K, 500K, 1M, Custom |
| Invoice Manipulation | $250,000 | 100K, 250K, 500K, 1M, Custom |
| Funds Transfer Fraud | $250,000 | 100K, 250K, 500K, 1M, Custom |
| Telecommunications Fraud | $100,000 | 100K, 250K, 500K, 1M, Custom |
| Cryptojacking | $100,000 | 100K, 250K, 500K, 1M, Custom |

### Policy Form Behavior

| Policy Form | Aggregate Coverages (1-10) | Tech E&O (#11) | Sublimits |
|-------------|---------------------------|----------------|-----------|
| Cyber | Full aggregate | $0 | Active (defaults) |
| Cyber/Tech | Full aggregate | Full aggregate | Active (defaults) |
| Tech | All $0 | Full aggregate | All $0 |

---

## Implementation Steps

### Phase 1: Config File

**File:** `rating_engine/coverage_defaults.yml`

```yaml
policy_forms:
  - id: cyber
    label: "Cyber"
    description: "Cyber coverage only, no Tech E&O"
  - id: cyber_tech
    label: "Cyber/Tech"
    description: "Full cyber coverage plus Tech E&O"
  - id: tech
    label: "Tech"
    description: "Tech E&O only"

default_form: cyber

aggregate_coverages:
  - id: network_security_privacy
    label: "Network Security & Privacy Liability"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: privacy_regulatory
    label: "Privacy Regulatory Proceedings"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: pci
    label: "Payment Card Industry (PCI)"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: media_liability
    label: "Media Liability"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: business_interruption
    label: "Business Interruption"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: system_failure
    label: "System Failure"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: dependent_bi
    label: "Dependent Business Interruption"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: cyber_extortion
    label: "Cyber Extortion"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: data_recovery
    label: "Data Recovery"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: reputational_harm
    label: "Reputational Harm"
    cyber: aggregate
    cyber_tech: aggregate
    tech: 0

  - id: tech_eo
    label: "Tech E&O"
    cyber: 0
    cyber_tech: aggregate
    tech: aggregate

sublimit_coverages:
  - id: dependent_system_failure
    label: "Dependent System Failure"
    default: 1000000
    cyber: sublimit
    cyber_tech: sublimit
    tech: 0

  - id: social_engineering
    label: "Social Engineering"
    default: 250000
    cyber: sublimit
    cyber_tech: sublimit
    tech: 0

  - id: invoice_manipulation
    label: "Invoice Manipulation"
    default: 250000
    cyber: sublimit
    cyber_tech: sublimit
    tech: 0

  - id: funds_transfer_fraud
    label: "Funds Transfer Fraud"
    default: 250000
    cyber: sublimit
    cyber_tech: sublimit
    tech: 0

  - id: telecom_fraud
    label: "Telecommunications Fraud"
    default: 100000
    cyber: sublimit
    cyber_tech: sublimit
    tech: 0

  - id: cryptojacking
    label: "Cryptojacking"
    default: 100000
    cyber: sublimit
    cyber_tech: sublimit
    tech: 0

# Standard dropdown options for sublimits
sublimit_options:
  - 100000
  - 250000
  - 500000
  - 1000000
  # "aggregate" and custom entry also available in UI
```

---

### Phase 2: Database Changes

**File:** `create_insurance_towers_table.sql` (modify existing)

```sql
-- Add to insurance_towers table
ALTER TABLE insurance_towers
ADD COLUMN IF NOT EXISTS policy_form TEXT DEFAULT 'cyber';

-- Add to submissions table (default form at submission level)
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS default_policy_form TEXT DEFAULT 'cyber';
```

**Coverages JSON Structure** (stored in existing `sublimits` field, rename to `coverages`):

```json
{
  "policy_form": "cyber",
  "aggregate_coverages": {
    "network_security_privacy": 1000000,
    "privacy_regulatory": 1000000,
    "pci": 1000000,
    "media_liability": 1000000,
    "business_interruption": 1000000,
    "system_failure": 1000000,
    "dependent_bi": 1000000,
    "cyber_extortion": 1000000,
    "data_recovery": 1000000,
    "reputational_harm": 1000000,
    "tech_eo": 0
  },
  "sublimit_coverages": {
    "dependent_system_failure": 1000000,
    "social_engineering": 250000,
    "invoice_manipulation": 250000,
    "funds_transfer_fraud": 250000,
    "telecom_fraud": 100000,
    "cryptojacking": 100000
  }
}
```

---

### Phase 3: Coverage Config Loader

**File:** `rating_engine/coverage_config.py` (new)

```python
def load_coverage_defaults() -> dict
def get_coverages_for_form(policy_form: str, aggregate_limit: int) -> dict
def get_sublimit_options() -> list
def validate_sublimit(value: int, aggregate: int) -> int  # caps at aggregate
```

---

### Phase 4: Rating Tab UI

**File:** `pages_components/coverage_summary_panel.py` (new)

Location: Below existing rating factors, above premium display

**UI Elements:**
1. Policy Form selector (radio buttons: Cyber | Cyber/Tech | Tech)
2. Coverage summary card showing:
   - "11 Aggregate Coverages @ $X,XXX,XXX" (or "10 @ aggregate, Tech E&O @ $0")
   - "6 Sublimits @ Standard Defaults" with expand toggle
3. Expanded view: Table with sublimit dropdowns + custom entry
4. Changes trigger premium recalc (placeholder for now, wired up later)

---

### Phase 5: Quote Tab UI

**File:** Modify `pages_components/coverages_panel.py`

**UI Elements:**
1. Policy Form display (inherited from Rating, override dropdown if needed)
2. Full coverage schedule table:
   - Section: "Insuring Agreements" (11 aggregate coverages with limits)
   - Section: "Sublimits" (6 sublimits with dropdown + custom)
3. Each sublimit row:
   - Coverage name
   - Dropdown: [100K, 250K, 500K, 1M, Aggregate, Custom]
   - If Custom selected: number input
4. Validation: sublimit cannot exceed aggregate
5. Auto-save on change (existing pattern)

---

### Phase 6: Quote Option Storage

**File:** Modify `pages_components/tower_db.py`

- `save_tower()`: Include coverages JSON
- `update_tower()`: Handle coverage updates
- `clone_quote()`: Copy coverages
- New: `update_quote_coverages()`: Inline coverage updates

---

### Phase 7: PDF Output (Future)

Coverages will render in quote PDF as:

```
COVERAGE SCHEDULE

INSURING AGREEMENTS                              LIMIT OF LIABILITY
Network Security & Privacy Liability             $1,000,000
Privacy Regulatory Proceedings                   $1,000,000
...
Tech E&O                                         $0

SUBLIMITS                                        LIMIT OF LIABILITY
Dependent System Failure                         $1,000,000
Social Engineering                               $250,000
...
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `rating_engine/coverage_defaults.yml` | New | Config file for coverages |
| `rating_engine/coverage_config.py` | New | Loader functions |
| `pages_components/coverage_summary_panel.py` | New | Rating tab coverage UI |
| `pages_components/coverages_panel.py` | Modify | Quote tab full schedule |
| `pages_components/tower_db.py` | Modify | Store/retrieve coverages |
| `create_insurance_towers_table.sql` | Modify | Add policy_form column |

---

## Implementation Order

1. Config file (`coverage_defaults.yml`)
2. Config loader (`coverage_config.py`)
3. Database migration (add columns)
4. Rating tab panel (`coverage_summary_panel.py`)
5. Quote tab modifications (`coverages_panel.py`)
6. Storage integration (`tower_db.py`)
7. Wire up to existing quote workflow

---

## Questions Resolved

- [x] Policy form at submission level with quote-level override
- [x] Tech E&O as 11th coverage
- [x] BI structure: BI, System Failure, Dependent BI (aggregate), Dependent System Failure (sublimit)
- [x] Sublimit UI: dropdowns + custom entry
- [x] Sublimit validation: cannot exceed aggregate
