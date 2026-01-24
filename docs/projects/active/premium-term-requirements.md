# Premium & Term Model Requirements

Captured from January 2026 discussion. Implementation was started on `feature/premium-term-model` but branch was abandoned due to being based on wrong parent branch.

## Problem Statement

When quoting mid-term excess placements, we need to track:

1. **Annual Premium** - The 12-month baseline rate
   - Used for renewals (what rate to start from next year)
   - Used for ILF calculations (meaningful layer comparisons)
   - Used for rate monitoring (comparing year-over-year)

2. **Actual Premium** - What's charged this term
   - May differ from annual due to pro-rata or minimums
   - This is what gets invoiced

3. **Premium Basis** - How actual was derived
   - `annual` - Full 12-month term
   - `pro_rata` - Standard days/365 calculation
   - `minimum` - Carrier minimum applies (pro-rata was too low)
   - `flat` - Flat charge regardless of term

## Example Scenario

> "2 months left on policy. Our annual premium is $20K, but we can only charge $10K minimum. I need to know we charged $10K this year, BUT I also need to know my intended annual is $20K because when this renews I need that $20K baseline."

- Annual: $20,000
- Pro-rata (2 months): ~$3,333
- Carrier minimum: $10,000
- Actual charged: $10,000 (minimum applies)
- Premium basis: `minimum`

## Data Model

Per-layer fields in `tower_json`:

```javascript
{
  // Existing
  premium: 10000,           // Legacy field, keep in sync with actual_premium

  // New fields
  annual_premium: 20000,    // 12-month baseline
  actual_premium: 10000,    // What's charged this term
  premium_basis: 'minimum', // How actual was derived

  // Optional per-layer term override (for non-concurrent towers)
  term_start: '2025-12-21', // Layer-specific effective date
  term_end: '2026-02-06',   // Layer-specific expiration date
}
```

## Non-Concurrent Towers

Some excess layers attach mid-term with different inception dates than the primary. Each layer can have its own term dates that override the structure-level policy period.

Example: Primary runs Jan 1 - Jan 1, but $5M xs $5M attaches July 1 with 6-month term.

## UI Approach (Annual-First)

1. User enters **annual premium** (what you'd charge for 12 months)
2. System shows calculated **actual** based on term
3. If actual falls below carrier minimum, user can override

## Implementation Notes

Files created on abandoned branch:
- `frontend/src/utils/premiumUtils.js` - Calculation utilities
- `frontend/src/components/LayerPremiumEditor.jsx` - Premium input with minimum override
- `frontend/src/components/LayerTermEditor.jsx` - Per-layer term picker

Key functions:
- `normalizeLayer()` - Backward compatibility with legacy data
- `getProRataFactor()` - Calculate days/365
- `getTheoreticalProRata()` - Annual * factor
- `getAnnualPremium()` / `getActualPremium()` - Safe accessors

## Open Questions

1. Should RPM/ILF be calculated from annual or actual premium?
2. How to handle UI when user is confused by two premium numbers?
3. Is the complexity worth it, or should we just have one premium field?

## Status

Abandoned for now. Revisit when:
- Clear UX design is established
- Branch is created from correct parent (quote-v3-sharing or main after merge)
