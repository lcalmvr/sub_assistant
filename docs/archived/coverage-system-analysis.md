# Coverage Editing System Analysis

**Date:** January 18, 2026
**Status:** Complete analysis with recommendations

---

## Executive Summary

The coverage editing system has evolved with multiple components handling primary vs excess quote editing. While the core architecture is sound, there are several bugs and inconsistencies that cause confusing behavior. This document maps the complete system and provides a prioritized fix list.

---

## Architecture Overview

### Components

| Component | Location | Purpose | Data Structure |
|-----------|----------|---------|----------------|
| `CoverageEditor` | `components/CoverageEditor.jsx` | Primary quote coverage editing | `structure.coverages` |
| `ExcessCoverageEditor` | `components/ExcessCoverageEditor.jsx` | Standalone excess editor with document extraction | `structure.sublimits` |
| `ExcessCoverageCompact` | `pages/QuotePageV3.jsx:9754` | Compact inline excess editor | `structure.sublimits` |

### Data Structures

**Primary Quotes** (`structure.coverages`):
```javascript
{
  aggregate_coverages: {
    network_security: 3000000,
    tech_eo: 3000000,
    // ... standard coverages at full limit
  },
  sublimit_coverages: {
    social_engineering: 250000,
    funds_transfer: 250000,
    // ... sublimits with customizable values
  }
}
```

**Excess Quotes** (`structure.sublimits`):
```javascript
[
  {
    coverage: "Network Security",
    primary_limit: 1000000,      // Primary carrier's limit
    treatment: "follow_form",    // or "different", "no_coverage", "exclude"
    our_limit: null,             // null = proportional, or custom value
    our_attachment: null,        // null = proportional, or custom value
    coverage_normalized: ["network_security"],  // standard tags
    source: "extracted"          // or "manual"
  }
]
```

### Business Logic

**Primary Position:**
- CMAI is the primary carrier
- User edits CMAI's coverage limits directly
- All values in `coverages` represent what CMAI offers
- Sharing between primary quotes is valid (all use same structure)

**Excess Position:**
- CMAI sits above another carrier (attachment > 0)
- `sublimits` array represents the PRIMARY carrier's coverage schedule
- CMAI "follows form" or applies different limits
- System calculates proportional limits based on tower structure:
  ```
  ratio = our_limit / primary_aggregate_limit
  coverage_limit = primary_coverage_limit * ratio
  ```

---

## Position Detection

**Function:** `getStructurePosition(structure)` at `QuotePageV3.jsx:118`

```javascript
function getStructurePosition(structure) {
  const tower = structure?.tower_json || [];
  if (tower.length === 0) {
    return structure?.position === 'excess' ? 'excess' : 'primary';
  }
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  if (cmaiIdx < 0) {
    return structure?.position === 'excess' ? 'excess' : 'primary';
  }
  const attachment = calculateAttachment(tower, cmaiIdx);
  return attachment > 0 ? 'excess' : 'primary';
}
```

**Logic:** If CMAI's attachment (sum of limits below) > 0, it's excess.

**Decision Points Using This:**
| Location | Line | Purpose |
|----------|------|---------|
| Summary tab | 7491 | `isExcessQuote = getStructurePosition(structure) === 'excess'` |
| CoveragesTabContent | 9724 | `if (getStructurePosition(structure) === 'excess')` |
| Scope filtering | 138-141 | Filter quotes by position for bulk operations |
| Quote filtering | 2034-2035 | Separate primary vs excess IDs |
| Subjectivity scope | 10132, 10552 | Default scope based on position |

---

## Identified Bugs

### Bug 1: Coverage Preview Uses Wrong Data for Excess

**Location:** `QuotePageV3.jsx:6495-6507`

**Problem:** The summary card preview always reads from `structure.coverages.sublimit_coverages`:
```javascript
const coverages = structure?.coverages || {};
const sublimits = coverages.sublimit_coverages || {};
const coverageExceptions = SUBLIMIT_COVERAGES
  .filter(cov => sublimits[cov.id] !== undefined && sublimits[cov.id] !== cov.default)
```

For excess quotes, this returns empty/default values because excess quotes store data in `structure.sublimits`, not `structure.coverages`.

**Impact:** Excess quote previews show "All standard limits" even when they have exceptions.

**Fix:** Add position check and use appropriate data source:
```javascript
const isExcess = getStructurePosition(structure) === 'excess';
if (isExcess) {
  // Use structure.sublimits with different display logic
} else {
  // Current primary logic
}
```

### Bug 2: Sharing Popover Shows Incompatible Quotes

**Location:** `CoverageEditor.jsx` - `getCoverageAcrossQuotes` function

**Problem:** The sharing popover shows all quotes (primary + excess) for comparison. However:
- Excess quotes don't have `coverages.sublimit_coverages` structure
- Comparing `primaryQuote.coverages.social_engineering` to `excessQuote.sublimits[x].primary_limit` is meaningless
- Different data models = no valid comparison

**Current Mitigation:** "Apply to" buttons filter by position (line ~1025):
```javascript
const applicableQuotes = otherQuotes.filter(q =>
  getQuotePosition(q) === currentPosition && q.value !== currentValue
);
```

**Impact:**
- Excess quotes show in list but with potentially wrong/default values
- User confusion about why values don't match

**Fix Options:**
1. Filter excess quotes from display entirely when viewing primary
2. Show excess quotes grayed out with "N/A" indicator
3. For excess viewing primary, show "Different coverage model"

### Bug 3: Bound Quote Editing Confusion

**Location:** `CoverageEditor.jsx` - sharing popover

**Current State:**
- Bound quotes appear in popover list
- "Apply to" buttons hidden for bound quotes (correct)
- Bound quotes shown with red lock icon above separator (correct)

**Remaining Issue:**
- Users can still see editing UI on bound quotes
- Should entire CoverageEditor be read-only for bound quotes?

**Backend Protection:** 403 error with `"Cannot modify bound quote"` - works correctly.

### Bug 4: Click Outside Save Uses Stale Draft

**Location:** `CoverageEditor.jsx:447` and `ExcessCoverageCompact:9907`

**Problem:** The `handleClickOutside` effect captured stale `draft` value.

**Fix Applied:** Added `draftRef` pattern:
```javascript
const draftRef = useRef(draft);
draftRef.current = draft;
// In handleClickOutside:
if (hasChanges(draftRef.current)) { handleSave(); }
```

**Status:** Already fixed in both components.

### Bug 5: Popover Click Detection

**Location:** `CoverageEditor.jsx:460`

**Problem:** Clicking inside Radix popover triggered `handleClickOutside`.

**Fix Applied:** Added check:
```javascript
if (e.target.closest('[data-radix-popover-content]')) return;
```

**Status:** Already fixed.

### Bug 6: First Click Not Registering on Popover Buttons

**Location:** `CoverageEditor.jsx` - apply buttons in popover

**Problem:** Radix Popover's focus management interfered with `onClick`.

**Fix Applied:** Changed to `onPointerDown` and added `onPointerDownOutside` handler.

**Status:** Already fixed.

---

## Keyboard Behavior Analysis

### Current Behavior (All Editors)

| Key | Action |
|-----|--------|
| Enter | Move to next row |
| Tab | Navigate columns |
| Arrows | Navigate cells |
| Escape | **Save all changes**, exit |
| Click outside | Save and exit |

### Issue

**Escape = Save is non-standard.** Universal UX expectation:
- Escape = Cancel/discard changes
- Enter or Ctrl+S = Save

**Risk:** Users trained in Excel/Sheets may hit Escape expecting to discard, accidentally saving unwanted changes.

### Proposed Future Model

| Key | Action |
|-----|--------|
| Enter | Move to next row |
| Tab | Navigate columns |
| Arrows | Navigate cells |
| Escape | **Discard all changes**, exit |
| Ctrl+Enter / Cmd+Enter | **Save all changes**, exit |
| Click outside | Save (convenience) |

**Files to update:**
- `QuotePageV3.jsx` - TowerEditor, Subjectivities, Endorsements
- `CoverageEditor.jsx` - handleKeyDown

---

## Recommendations (Priority Order)

### P0 - Critical (User-Facing Bugs)

1. **Fix coverage preview for excess quotes**
   - Add position detection to summary card preview
   - Display excess sublimits data instead of empty primary data

2. **Filter incompatible quotes from sharing popover**
   - Primary CoverageEditor should not show excess quotes
   - ExcessCoverageCompact sharing (if implemented) should not show primary

### P1 - High (Consistency)

3. **Standardize keyboard behavior**
   - Change Escape to cancel
   - Add Ctrl/Cmd+Enter to save
   - Document the pattern for all editors

4. **Read-only mode for bound quotes**
   - Pass `isBound` flag to editors
   - Disable all editing UI, show "Bound - View Only" indicator

### P2 - Medium (Polish)

5. **Unify excess editors**
   - `ExcessCoverageEditor` (standalone) and `ExcessCoverageCompact` (embedded) have similar but divergent logic
   - Consider extracting shared logic or using one component for both contexts

6. **Add error boundary**
   - Wrap coverage editors in error boundary
   - Gracefully handle missing/malformed data

### P3 - Nice to Have

7. **Coverage catalog integration**
   - `ExcessCoverageEditor` has document extraction and coverage normalization
   - Consider adding similar capability to primary editor

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        QuotePageV3                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ getStructurePosition(structure)                           │   │
│  │   → Derives position from tower_json                      │   │
│  │   → Returns 'primary' or 'excess'                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────┐    ┌────────────────┐                       │
│  │ position ==    │    │ position ==    │                       │
│  │ 'primary'      │    │ 'excess'       │                       │
│  └───────┬────────┘    └───────┬────────┘                       │
│          │                     │                                 │
│          ▼                     ▼                                 │
│  ┌────────────────┐    ┌────────────────┐                       │
│  │ CoverageEditor │    │ExcessCoverage- │                       │
│  │                │    │Compact         │                       │
│  └───────┬────────┘    └───────┬────────┘                       │
│          │                     │                                 │
│          ▼                     ▼                                 │
│  ┌────────────────┐    ┌────────────────┐                       │
│  │ structure.     │    │ structure.     │                       │
│  │ coverages      │    │ sublimits      │                       │
│  └────────────────┘    └────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Reference

| File | Lines | Key Functions |
|------|-------|---------------|
| `QuotePageV3.jsx` | 118-131 | `getStructurePosition()` |
| `QuotePageV3.jsx` | 6495-6507 | Coverage preview (BUG: wrong data for excess) |
| `QuotePageV3.jsx` | 7485-7597 | Summary tab coverage card |
| `QuotePageV3.jsx` | 9715-9751 | `CoveragesTabContent` component |
| `QuotePageV3.jsx` | 9754-10100+ | `ExcessCoverageCompact` component |
| `CoverageEditor.jsx` | 1-100 | `getQuotePosition()`, constants |
| `CoverageEditor.jsx` | 400-500 | Click outside handling |
| `CoverageEditor.jsx` | 850-1050 | Sharing popover, `getCoverageAcrossQuotes` |
| `ExcessCoverageEditor.jsx` | 46-107 | Tower context calculation |
| `ExcessCoverageEditor.jsx` | 140-557 | Main editor component |

---

## Next Steps

1. Review this analysis with stakeholder
2. Prioritize fixes based on user impact
3. Implement P0 fixes first
4. Consider keyboard behavior change (may need user testing)
