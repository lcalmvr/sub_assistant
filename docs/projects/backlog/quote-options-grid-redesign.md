# Quote Options Grid Redesign

**Priority:** Medium
**Added:** 2025-01-24

## Problem

The Quote Options grid on the submission page has poor layout:
- Huge empty gap between QUOTE OPTION and PREMIUM columns
- Data pushed to edges, sparse and stretched
- Missing useful context (carrier, effective dates)
- Inconsistent formatting (some have dates appended, some don't)

## Current State

```
#  TYPE  QUOTE OPTION          [huge gap]          PREMIUM   SUBJS   ENDTS   STATUS
1  XS    $5M xs $10M                               $40,910   Mixed   Mixed   Draft
2  PRI   $2M x $25K                                $40,910   2 miss  2 miss  Draft
```

## Goals

1. **Tighten layout** - reduce wasted whitespace
2. **Add useful info** - carrier, effective date, layers count
3. **Consider cards** - may be better than table for this data
4. **Consistent formatting** - standardize how options are displayed

## Design Options

### Option A: Tighter Table
Keep table but add columns and reduce gap:
```
#  TYPE  QUOTE OPTION     CARRIER    EFF DATE   PREMIUM   SUBJS  ENDTS  STATUS
1  XS    $5M xs $10M      Berkley    01/15/25   $40,910   ✓      Mixed  Draft
```

### Option B: Card Grid
Switch to cards showing more detail:
```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ Option 1 · XS · Draft           │  │ Option 2 · PRI · Draft          │
│ $5M xs $10M                     │  │ $2M x $25K                      │
│ Berkley · Eff 01/15/25          │  │ AIG · Eff 01/15/25              │
│ Premium: $40,910                │  │ Premium: $40,910                │
│ Subjs: Mixed (+1,-5)  Endts: ✓  │  │ Subjs: 2 missing  Endts: 2 miss │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

### Option C: Hybrid
Compact table rows that expand to show detail on click.

## Additional Info to Show

- Lead carrier name
- Effective date
- Number of layers in tower
- Total limit (if multi-layer)
- Quick status icons instead of text

## Related Files

- Quote options component (find in frontend/src/components/)
- Submission detail page
