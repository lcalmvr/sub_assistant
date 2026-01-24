# Code Review Follow-ups

Running list of items to review/refactor when time permits.

---

## 2026-01-22: TowerEditor Draft Pattern Consistency

**File:** `src/components/quote/TowerEditor.jsx`

**Issue:** Added `chargedDrafts` state for the Charged column input, but this pattern differs from the established pattern in `ExcessCoverageCompact.jsx`.

**Current approach:**
- Per-field draft state (`chargedDrafts`)
- Commits on blur
- Separate from main `layers` state

**Established pattern (ExcessCoverageCompact):**
- Single `draft` array mirroring full data
- Uses `_fieldInput` prefixed fields (e.g., `_limitInput`, `_attachInput`)
- Commits on Save

**Why it differs:**
The Charged column has "empty = reset to pro-rata" behavior that requires knowing when user is done typing (blur) vs still typing. Other TowerEditor inputs update `layers` directly without drafts.

**Options to consider:**
1. Align with `_chargedInput` pattern stored in layer object
2. Create shared hook for "draft with fallback on empty" pattern
3. Keep as-is (it works, just inconsistent)

**Priority:** Low - functional, just inconsistent with other components

---
