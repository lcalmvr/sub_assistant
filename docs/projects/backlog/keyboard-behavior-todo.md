# Keyboard Behavior: Save/Cancel/Navigate Pattern

**Status:** Awaiting user feedback
**Date:** January 18, 2026

---

## Current Implementation

All inline editors (TowerEditor, CoverageEditor, Subjectivities, Endorsements) now share this pattern:

| Key | Action |
|-----|--------|
| Enter | Move to next row (stay in edit mode) |
| Tab | Navigate columns/rows |
| Arrows | Navigate |
| Escape | **Save all changes**, exit edit mode |
| Click outside | Save and exit |

---

## The Problem

**Escape = Save is non-standard.** Traditional UX:
- Escape = Cancel/discard changes
- Enter or Ctrl+S = Save

**Current risks:**
1. Users trained in other apps may hit Escape expecting to discard, accidentally saving unwanted changes
2. No keyboard path to discard changes (must refresh page)
3. Mental model mismatch for power users from Excel/Sheets

---

## Why It Ended Up This Way

1. **Without Escape saving, how does user exit and save from keyboard?**
   - Enter was repurposed for "move to next row"
   - No other obvious key for "save and exit"

2. **Granularity of undo is complex:**
   - If user edits Row 1 → Enter → edits Row 2 → Escape...
   - What gets discarded? Just Row 2? Or both?
   - Current architecture: all changes accumulate in draft state
   - Discard = discard entire edit session (all-or-nothing)

---

## Proposed Future Model

| Key | Action |
|-----|--------|
| Enter | Move to next row |
| Tab | Navigate columns/rows |
| Arrows | Navigate |
| **Escape** | **Discard all changes**, exit edit mode |
| **Ctrl+Enter** (Cmd+Enter on Mac) | **Save all changes**, exit edit mode |
| Click outside | Save and exit (convenience) |

**Benefits:**
- Escape = Cancel (matches universal expectation)
- Ctrl+Enter = Submit (familiar from Slack, GitHub, forms)
- Clear mental model: "drafting until explicit save or cancel"
- Real cancel path exists

**Trade-off:**
- Slightly more effort to save (Ctrl+Enter vs Escape)
- Need to handle both Ctrl and Cmd for cross-platform

---

## Files Affected

When implementing, update keyboard handlers in:

1. `frontend/src/pages/QuotePageV3.jsx`
   - TowerEditor (`handleKeyDown` ~line 549, `handleArrowNav` ~line 573)
   - Subjectivities Grid View (~line 3706)
   - Subjectivities Summary card (~line 8976)
   - Endorsements Summary card (~line 8095)

2. `frontend/src/components/CoverageEditor.jsx`
   - Global `handleKeyDown` (~line 366)
   - `handleArrowNav` (~line 299)

---

## Decision Needed

Get user feedback on:
1. Is the current "Escape saves" behavior causing confusion?
2. Would users prefer Ctrl+Enter to save?
3. Is discarding changes (cancel) a common need?

Then revisit this document.
