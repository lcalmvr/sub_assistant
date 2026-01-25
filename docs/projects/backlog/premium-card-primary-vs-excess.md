# Premium Card: Primary vs Excess Display

**Priority:** Medium
**Added:** 2025-01-24

## Problem

Current premium card shows:
```
PREMIUM
TECHNICAL    SOLD
$37,191      $40,910    +10%
```

This works for **primary** layers (technical vs sold comparison). But:
- Does this make sense for **excess** layers?
- Excess pricing is often rate-per-million or ILF-based
- What's "technical" mean for an excess layer?

## Questions to Answer

### For Primary
- Technical = rating engine output?
- Sold = final negotiated premium?
- Variance = pricing discipline indicator?

### For Excess
- Should we show rate per million instead?
- ILF (increased limit factor) comparison?
- Benchmark vs actual?
- Or just simpler: just show the premium without technical?

## Possible Approaches

### Option A: Different Cards by Layer Type
- Primary card: Technical / Sold / Variance
- Excess card: Premium / Rate per $M / ILF

### Option B: Unified Card with Context
- Show what's relevant based on layer type
- Collapse/hide irrelevant fields

### Option C: Simplify for All
- Just show: Premium / Benchmark / Variance
- Works for both primary and excess

## Current Display (Primary)
```
┌─────────────────────────────────┐
│ PREMIUM                         │
│ TECHNICAL    SOLD               │
│ $37,191      $40,910    +10%    │
└─────────────────────────────────┘
```

## Possible Excess Display
```
┌─────────────────────────────────┐
│ PREMIUM                         │
│ $125,000                        │
│ $25.00 per $M · ILF 1.45        │
└─────────────────────────────────┘
```

## Related

- Premium calculation: `frontend/src/utils/premiumUtils.js`
- Tower card components
