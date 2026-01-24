# Coverage Editor: Primary vs Excess Behavior

**Date:** January 18, 2026
**Status:** Partially implemented, needs review

---

## Current Architecture

### Primary Quotes
- Uses `CoverageEditor` component
- Data stored in `quote.coverages` structure:
  - `aggregate_coverages`: Full-limit coverages (e.g., Network Security, Tech E&O)
  - `sublimit_coverages`: Variable limit coverages (e.g., Social Engineering, Funds Transfer)
- User edits CMAI's coverage limits directly
- Sharing between primary quotes makes sense (all are CMAI primary)

### Excess Quotes
- Uses `ExcessCoverageEditor` / `ExcessCoverageCompact` component
- Data stored in `quote.sublimits` structure (different from primary!):
  - Array of `{ coverage, primary_limit, treatment, our_limit, our_attachment }`
- Shows PRIMARY carrier's coverage limits
- Calculates proportional limit/attachment for CMAI's participation
- "Treatment" options: Follow Form, Different, No Coverage

---

## Files

| Position | Editor Component | Data Field |
|----------|------------------|------------|
| Primary | `CoverageEditor.jsx` | `quote.coverages` |
| Excess | `ExcessCoverageEditor.jsx` | `quote.sublimits` |

Decision logic in `QuotePageV3.jsx:9722`:
```javascript
if (structure?.position === 'excess') {
  return <ExcessCoverageCompact ... />;
}
return <CoverageEditor ... />;
```

---

## Issues with Coverage Sharing Popover

### Current Problem
The sharing popover in `CoverageEditor` shows ALL quotes (primary + excess), but:
1. **Excess quotes don't have `coverages` data** - they have `sublimits` instead
2. Reading `excessQuote.coverages.sublimit_coverages.social_engineering` returns undefined
3. Defaults to standard value, showing misleading comparison

### Correct Behavior
When viewing a PRIMARY quote:
- Sharing popover should ONLY show other PRIMARY quotes
- Excess quotes use completely different coverage model
- No meaningful comparison between primary coverages and excess sublimits

### Fix Applied
In `getCoverageAcrossQuotes`, the "Apply to" buttons now filter to same-position quotes:
```javascript
const applicableQuotes = otherQuotes.filter(q =>
  q.position === currentPosition && q.value !== currentValue
);
```

### Still Shows All in List
The popover list shows all quotes (including excess) for informational purposes.
Consider hiding excess quotes entirely, or showing them grayed out with "N/A".

---

## Bound Quote Behavior

Bound quotes now show:
- Above the separator line
- Red lock icon
- Red text
- Not in "Apply to" buttons (since modifications rejected by backend)

---

## Recommendations

1. **Filter excess quotes from list entirely** when viewing primary coverage sharing
   - They use different data structures, comparison is meaningless

2. **Consider visual indicator** if keeping excess in list:
   - Gray out with "(excess - N/A)" label
   - Or just hide completely

3. **Verify data loading** - If only 4 of 9 quotes show:
   - Check if `structures` query returns all quotes
   - Check if excess quotes are being filtered somewhere upstream
