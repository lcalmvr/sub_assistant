# Quote Page Redesign Plan

## Overview

Comprehensive redesign of QuotePageV2 based on mockup review (v2, v4, v9, v11, v15) and UX feedback.

**Goal:** Create a cleaner, more efficient quote configuration experience with proper handling of term variations, commission overrides, and cross-option management.

**Approach:** Build visual mockup first (v16), validate UX, then design backend architecture.

---

## Design Requirements

### 1. A/B Variation Model

**Problem:** User needs to offer same tower structure with different terms (e.g., 12-month standard vs 18-month extended) where everything EXCEPT terms/commission stays identical.

**Current state:** Clone creates independent records that can drift apart.

**Desired UX (from v2, v11):**
- Quote options represent tower structures (e.g., "$5M xs $5M")
- Each structure can have term variations (A, B, C...)
- Variation A = Standard (inherits all defaults)
- Variation B = Override (different term, commission, etc.)
- Tower, endorsements, subjectivities stay synced across variations
- Visual indicator when a variation overrides a default (unlock icon)

**What varies between A/B:**
- Policy period (12mo, 18mo, custom)
- Commission % (broker default vs override)
- Premium (calculated based on term)

**What stays identical:**
- Tower structure (layers, limits, attachments)
- Endorsements
- Subjectivities
- Retro schedule
- Coverage schedule
- Policy form

### 2. Unified Side Panel

**Problem:** Settings scattered across page (dates at top AND below tower, separate endt/subj panels).

**Solution:** Single side editor panel with tabs (from v15 concept).

**Tabs:**
| Tab | Contents |
|-----|----------|
| **Terms** | Policy period, retro schedule, policy form chooser |
| **Premium** | Technical, risk-adjusted, sold premium, commission (with default/override) |
| **Endts** | Cross-option matrix with search, add, required/auto/manual indicators |
| **Subjs** | Cross-option matrix with status badges, search, add |
| **Flags** | Drift warnings, bind readiness checklist |

### 3. Button Placement

**Location:** Top of side panel (sticky)

**Buttons:**
- **Preview** - View PDF without saving changes (new feature)
- **Generate** - Save changes + create document
- **Bind** - Existing bind flow

### 4. Policy Form Chooser

**Location:** Terms tab in side panel

**Primary quotes:**
- Default to standard primary form
- Single option (or minimal dropdown)

**Excess quotes:**
- Dropdown with options:
  - Standard Excess Form (default)
  - Follow Form
  - MOI (Manuscript of Insurance)
  - Custom...
- "Custom" shows text input for form name/number

**Backend:** Need to create `policy_forms` table with common forms.

### 5. Commission Management

**Hierarchy:**
1. Broker organization has `default_commission` %
2. Submission inherits broker default
3. Quote variation can override

**UI Pattern (from v11):**
- Show broker default: "15% (Broker Default)"
- Override shows unlock icon + different color: "🔓 20%"
- System calculates premium net of commission when requested

**New UI needed:**
- Broker admin page to manage default commission per broker org
- Display broker default on submission
- Override field per quote variation

### 6. Matrix Improvements (v9 Style)

**Filter toggles above matrix:**
- **Required only** - Show mandatory items (🔒)
- **Auto only** - Show auto-attached items (⚡)
- **Differences only** - Show items NOT on all quotes (key feature)

**Visual indicators:**
- 🔒 Required - Locked, cannot uncheck
- ⚡ Auto - From enhancements/rules
- ➕ Manual - User-added, can toggle

**Interaction:**
- Checkboxes to toggle per-option assignment
- "Apply to all" bulk action
- Search/filter by name

### 7. Coverage Schedule Cleanup

**Problem:** Current UI is bulky with old coverage tags visible.

**Solution:**
- Hide coverage tags by default
- Click to expand/view tags
- Don't preload tags in card preview
- Simpler, less overwhelming presentation
- Could move to sidebar area

### 8. Tower Visual (v11 Style)

**Location:** Left side of main content area

**Features:**
- Visual stack showing layer positions
- Our layer highlighted (purple)
- Shows limit and attachment for each layer
- Clickable to edit tower

**Future exploration:**
- Could show rate-on-line visually (bar width)
- Could be dropdown for quick layer selection

### 9. Flags & Warnings (Renamed from "Bind Readiness")

**Content:**
- Bind blockers (errors)
- Warnings (non-blocking)
- **Drift indicators** (new):
  - "Option 2 has different retro schedule"
  - "Biometric Exclusion only on Options 1, 3"
  - Comparison between variations

### 10. Mobile Responsiveness

**Pattern:** Reference v7 - stacks vertically as window compresses

### 11. Configurable Colors (Future)

**Location:** User settings

**Feature:** Color palette selection for UI theme

---

## UI Component Inventory

### Header Row
- Quote option tabs (structure selector)
- Policy period display
- Clone / New / Delete buttons

### Left Column (8 units)
- Tower visual (v11 style)
- Tower table (editable)
- A/B Variation cards showing term differences
- Coverage schedule (collapsible)

### Right Column (4 units) - Side Panel
- Action buttons (Preview, Generate, Bind)
- Tab navigation (Terms, Premium, Endts, Subjs, Flags)
- Tab content area
- Sticky positioning

---

## Data Model Considerations

*To be finalized after UX validation*

### Option A: Linked Variations
```sql
quotes
  - id
  - submission_id
  - variation_parent_id (FK to quotes, null for primary)
  - variation_label ('A', 'B', 'C')
  - tower_json (inherited from parent if variation)
  - policy_period_months
  - commission_override
  - sold_premium
```

### Option B: Variations JSON
```sql
quotes
  - id
  - submission_id
  - tower_json
  - variations JSONB [
      {label: 'A', period: 12, commission: null, premium: 50000},
      {label: 'B', period: 18, commission: 20, premium: 75000}
    ]
```

### Option C: Sync-on-Save
```sql
quotes
  - id
  - submission_id
  - variation_group_id (links related variations)
  - tower_json
  - policy_period_months
  - commission_override
```
- UI prompts to sync when tower/endts/subjs change

### New Tables Needed
```sql
policy_forms
  - id
  - name
  - form_number
  - position ('primary', 'excess', 'both')
  - is_default
  - carrier (nullable)

broker_organizations (existing, add field)
  - default_commission DECIMAL
```

---

## Mockup Plan (v16)

### What to Build
1. Full page layout with left/right columns
2. Quote option tabs with A/B variation indicator
3. Tower visual (v11 style) on left
4. Variation cards showing A vs B terms
5. Unified side panel with all tabs
6. Action buttons at top of side panel
7. Policy form dropdown in Terms tab
8. Commission with default/override in Premium tab
9. Matrix with diff toggles in Endts/Subjs tabs
10. Flags section with drift indicators

### Mock Data
- 2 quote structures: "$5M xs $5M" (excess), "$2M x $25K" (primary)
- First structure has A/B variations
- Mix of endorsements (required, auto, manual, some with differences)
- Subjectivities with various statuses
- Sample drift scenarios

---

## Implementation Phases

| Phase | Scope | Dependencies |
|-------|-------|--------------|
| **Mockup** | Build v16 to validate UX | None |
| **Phase 1** | UI polish (icons, rename, cleanup) | Mockup approval |
| **Phase 2** | Side panel consolidation | Phase 1 |
| **Phase 3** | Matrix improvements | Phase 2 |
| **Phase 4** | Commission/broker management | DB schema |
| **Phase 5** | A/B variation architecture | Architecture decision |
| **Phase 6** | Drift detection | Phase 5 |
| **Phase 7** | Polish (mobile, colors, etc.) | All above |

---

## Open Questions

1. **Variation architecture**: Options A/B/C - decide after mockup review
2. **Policy form catalog**: What forms to seed? Need list from UW team
3. **Commission calculation**: Formula for "net of commission" display
4. **Drift resolution UX**: What actions when drift detected? (Sync, ignore, view diff)
5. **NIST tooltip**: Separate task for Analyze2 page

---

## References

- **v2** - Term variations, A/B concept, commission per variation
- **v4** - Quick reference sidebar (secondary priority)
- **v9** - Matrix with diff toggles, filter buttons
- **v11** - Tower visual, structure defaults, override indicators
- **v15** - Unified side panel concept
