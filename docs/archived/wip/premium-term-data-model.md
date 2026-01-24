# Premium & Term Data Model

## Problem Statement

We need to track multiple premium concepts per layer:
- **Annual Premium**: The 12-month rate (baseline for renewals, ILF, rate monitoring)
- **Actual Premium**: What's charged this policy term
- **Premium Basis**: How actual was derived from annual

We also need per-layer term dates for non-concurrent towers where excess attaches mid-term.

---

## Data Model

### Layer Schema (within `tower_json` JSONB)

```javascript
// Current layer structure
{
  carrier: 'Excess Carrier',
  limit: 5000000,
  attachment: 5000000,
  premium: 25000,           // DEPRECATED - use actual_premium
  ilf: 0.45,
  quota_share: null,
  retention: null,
}

// New layer structure
{
  carrier: 'Excess Carrier',
  limit: 5000000,
  attachment: 5000000,

  // === PREMIUM MODEL ===
  annual_premium: 20000,    // 12-month baseline rate
  actual_premium: 10000,    // What we charge this term
  premium_basis: 'minimum', // How actual derived from annual

  // Legacy field - READ for backward compat, WRITE to actual_premium
  premium: 10000,           // DEPRECATED - mirrors actual_premium

  // === TERM MODEL (optional per-layer override) ===
  term_start: '2025-11-01', // null = inherit from structure
  term_end: '2025-12-31',   // null = inherit from structure

  // === EXISTING FIELDS ===
  ilf: 0.45,
  quota_share: null,
  retention: null,
  rpm: null,
}
```

### Premium Basis Enum

| Value | Description | Actual Calculation |
|-------|-------------|-------------------|
| `annual` | Full 12-month term | actual = annual |
| `pro_rata` | Standard pro-rata | actual = annual × (days / 365) |
| `minimum` | Carrier minimum applies | actual = max(pro_rata, min_premium) |
| `flat` | Flat charge regardless of term | actual = (user-specified) |

### Term Resolution Order

For any layer, effective term is determined by:
1. **Layer-level** `term_start`/`term_end` (if both non-null)
2. **Structure-level** `effective_date_override`/`expiration_date_override`
3. **Submission-level** `effective_date`/`expiration_date`

---

## Backward Compatibility

### Reading Legacy Data

When reading a layer without new fields:
- `annual_premium` defaults to `premium`
- `actual_premium` defaults to `premium`
- `premium_basis` defaults to `'annual'`

This is handled by `normalizeLayer()` in `frontend/src/utils/premiumUtils.js`.

### Writing Data

When saving, we write both `premium` (legacy) and `actual_premium` (new) to ensure old code continues working.

---

## UI Flow (Option A: Annual-First)

```
Annual Premium: [ $20,000 ]
Term: Nov 1 - Dec 31 (61 days) → Pro-rata: $3,340
[ ] Minimum applies? [ $10,000 ]
```

User enters annual, system calculates pro-rata, user can override with minimum/flat.

---

## Example Scenarios

### Scenario 1: Full-Term Primary + Short-Term Excess

```
Primary: Jan 1 - Dec 31 (365 days)
  annual_premium: 50,000
  actual_premium: 50,000
  premium_basis: 'annual'

Excess: Nov 1 - Dec 31 (61 days)
  annual_premium: 20,000
  actual_premium: 10,000  (carrier minimum)
  premium_basis: 'minimum'
  term_start: '2025-11-01'
  term_end: '2025-12-31'
```

**Display (Actual View):**
```
Primary    $5M      $50,000
Excess     $5M      $10,000*
           TOTAL    $60,000

* 61-day term, $20K annualized
```

**ILF:** 20,000 / 50,000 = 40% (uses annual)

### Scenario 2: Renewal of Short-Term to Full-Term

**Year 1 (short-term):**
```
annual_premium: 20,000
actual_premium: 10,000
```

**Year 2 (renewal, full term):**
```
annual_premium: 21,000  (5% increase)
actual_premium: 21,000
```

**Rate Change:** (21,000 - 20,000) / 20,000 = **5%**
(NOT: (21,000 - 10,000) / 10,000 = 110%)
