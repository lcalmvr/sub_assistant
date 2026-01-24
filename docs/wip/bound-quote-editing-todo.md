# Bound Quote Editing Behavior

**Status:** Needs exploration
**Date:** January 18, 2026

---

## Current Behavior

The backend correctly rejects modifications to bound quotes with a 403 Forbidden response:

```json
{
  "detail": {
    "message": "Cannot modify bound quote",
    "protected_fields": ["coverages"],
    "hint": "Unbind the policy to make changes or use the endorsement workflow"
  }
}
```

This protection is appropriate - bound quotes represent finalized agreements.

---

## The Question

**Should users even see editing UI for bound quotes?**

Current state:
- Coverage sharing badges/popovers appear on bound quotes
- Users can click "Apply to" buttons, only to get an error
- This creates a confusing experience

User feedback (Jan 18, 2026):
> "There's no reason for someone to even be messing around with this post bind"

---

## Options to Explore

### Option A: Hide Sharing UI for Bound Quotes
- Don't show per-coverage sharing badges on bound quotes
- Simplest fix, prevents confusion

### Option B: Visual Indicator + Disabled Buttons
- Show badges but gray them out
- Disable "Apply to" buttons with tooltip: "Quote is bound"
- Users can still see values across quotes for comparison

### Option C: Read-Only Mode
- Entire coverage editor becomes read-only when viewing a bound quote
- Consistent with the policy being finalized

---

## Files Affected

When implementing, check bound status in:

1. **`frontend/src/components/CoverageEditor.jsx`**
   - Per-coverage sharing badges and popovers (~line 938)
   - Should check if target quotes are bound before showing "Apply to"

2. **`frontend/src/pages/QuotePageV3.jsx`**
   - May need to pass `isBound` flag to CoverageEditor
   - Or filter bound quotes from `allQuotes` prop

---

## Related

- The endorsement workflow exists for making changes post-bind
- This is the correct path for coverage modifications after binding

---

## Decision Needed

Get product feedback on:
1. Should editing UI be hidden entirely for bound quotes?
2. Or should it be visually disabled with explanation?
3. Is there ever a legitimate reason to "Apply to" a bound quote from another quote?
