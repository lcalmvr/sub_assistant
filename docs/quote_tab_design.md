# Quote Tab Design Specification

## Overview

Redesigned Quote tab with summary table view, inline editing, expandable detail views, and AI batch operations.

## Tab Structure

```
┌─────────┬─────────┬─────────┐
│ Details │ Rating  │ Quote   │
└─────────┴─────────┴─────────┘
```

- **Rating tab** (NEW): Between Details and Quote. Hazard assessment + control adjustments. Run once, applies to all quote options.

---

## Quote Tab Layout

### 1. AI Batch Command Box (Top)

Operates on ALL quote options:
- Create/delete options: "Add $5M option", "Delete all $1M options"
- Batch update sublimits: "Set SE sublimit to $500K on all"
- Batch endorsements: "Add wrongful collection exclusion to all options"
- Batch premium adjustments: "Add $100 to all premiums"

### 2. Quote Options Summary Table

**Primary Options:**
```
┌──────────┬─────────┬─────────┬────────────┬────────────┬─────────────┐
│ Name     │ Limit   │ Ret     │ Technical  │ Sold       │ Actions     │
├──────────┼─────────┼─────────┼────────────┼────────────┼─────────────┤
│ Option 1 │ $1M [e] │ $50K [e]│ $724       │ $750 [e]   │ [▼] [🗑️]   │
│ Option 2 │ $3M [e] │ $50K [e]│ $1,666     │ $1,700 [e] │ [▼] [🗑️]   │
└──────────┴─────────┴─────────┴────────────┴────────────┴─────────────┘
```

**Excess Options:**
```
┌──────────┬─────────┬───────────┬─────────┬────────────┬─────────────┐
│ Name     │ Limit   │ Attach    │ Ret     │ Sold       │ Actions     │
├──────────┼─────────┼───────────┼─────────┼────────────┼─────────────┤
│ Option 1 │ $5M     │ xs $5M    │ $50K    │ $3,500 [e] │ [▼] [🗑️]   │
└──────────┴─────────┴───────────┴─────────┴────────────┴─────────────┘
```

- `[e]` = inline editable
- `[▼]` = expand detail view below
- Technical Premium: Read-only, calculated from rating engine (PRIMARY ONLY)
- Sold Premium: Editable, UW's final price
- When Limit or Retention changes on primary, recalculate Technical Premium

### 3. Detail View (Expandable)

Appears below the row when [▼] clicked. Contains:

**Left Column: Tower**
- AI Tower Box: "Add excess layer at $3M"
- Tower visualization (existing component)
- Inline editable values

**Right Column: Coverages & Endorsements**
- AI Coverages Box: "Add SE sublimit $500K"
- Sublimits list (inline editable)
- Endorsements checkboxes

---

## First-Time Flow (No Saved Quotes)

```
┌───────────────────────────────────────────────────────────────────────┐
│  No quote options yet.                                                │
│                                                                       │
│  Generate defaults:  Retention: [$50K ▼]   [Generate $1M/$3M/$5M]    │
│                                                                       │
│  Or use AI: "Create 1M, 2M, 3M options with 25K retention"           │
└───────────────────────────────────────────────────────────────────────┘
```

Once defaults generated or dismissed, don't show again if quotes exist.

---

## Data Model

### Per-Quote Storage (insurance_towers table)

Each quote option stores independently:
- `tower_json`: Tower layers (carrier, limit, attachment, premium per layer)
- `primary_retention`: Retention amount
- `technical_premium`: Calculated premium from rating (PRIMARY ONLY, NULL for excess)
- `sold_premium`: UW's final quoted premium
- `sublimits`: JSON array of sublimit configurations
- `endorsements`: JSON array of endorsement selections
- `quote_name`: Display name
- `position`: "primary" or "excess"

### Rating Data (submission level)

Stored per submission (not per quote):
- Hazard grade
- Base rate
- Control adjustments (debits/credits)
- Net adjustment percentage

---

## Behavior Rules

1. **Auto-save**: All edits persist immediately to database. No Save button.
2. **Technical Premium recalc**: Triggered when Limit or Retention changes on primary options
3. **Excess quotes**: No technical premium - only sold premium
4. **AI Batch operations**: Affect all quote options matching criteria
5. **AI Detail operations**: Affect only the expanded quote

---

## Implementation Phases

### Phase 1: Database Schema Updates
- Add `technical_premium`, `sold_premium` columns
- Add `endorsements` JSON column
- Add `position` column (primary/excess)

### Phase 2: Summary Table Component
- New component: `quote_options_table.py`
- Render table with inline editing
- Expand/collapse detail view
- Delete functionality
- Auto-save on edit

### Phase 3: Detail View Component
- Tower visualization (reuse existing)
- Sublimits editor
- Endorsements editor
- Split AI boxes (tower vs coverages)

### Phase 4: AI Batch Operations
- Update AI command handler to support batch operations
- Target: all options, or filtered subset

### Phase 5: First-Time Flow
- Default options generation
- Retention input
- Dismiss/accept logic

### Phase 6: Rating Tab (Future)
- Hazard assessment display
- Control adjustments
- Recalculate button
