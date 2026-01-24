# Retro Schedule - Smart Implementation Plan

## Current State
- `retro_schedule` JSONB on insurance_towers (per-option)
- `default_retro_schedule` JSONB on submissions (unused)
- Manual entry table with Coverage/Limit/Retro columns
- Simple retro date field (rarely used)

## Proposed Changes

### Data Model

**Submission-level default** (applies to all options unless overridden):
```sql
submissions.retro_schedule JSONB  -- renamed from default_retro_schedule
```

**Per-option override** (only when different from submission):
```sql
insurance_towers.retro_schedule JSONB  -- NULL = use submission default
insurance_towers.retro_customized BOOLEAN DEFAULT FALSE  -- flag if manually changed
```

**Retro entry structure:**
```json
{
  "coverage": "cyber",           // cyber, tech_eo, do, epl, fiduciary
  "retro": "full_prior_acts",    // Enum: full_prior_acts, follow_form, inception, date, custom
  "date": "2025-01-01",          // Only if retro = "date"
  "custom_text": "to match expiring"  // Only if retro = "custom"
}
```

### Smart Defaults Logic

**Primary quotes:**
| Coverages Selected | Auto-populate |
|-------------------|---------------|
| Cyber only | Cyber: Full Prior Acts |
| Cyber + Tech E&O | Cyber: Full Prior Acts, Tech E&O: Inception |
| Cyber + Tech + D&O | Cyber: Full Prior Acts, Tech E&O: Inception, D&O: Inception |
| Tech E&O only | Tech E&O: Inception |

**Excess quotes:**
| Coverages Selected | Auto-populate |
|-------------------|---------------|
| Cyber only | Cyber: Follow Form |
| Cyber + Tech E&O | Cyber: Follow Form, Tech E&O: Inception |
| Any | Follow underlying unless specified |

### UI Design

**Remove:**
- Simple Retro Date field
- Manual table entry
- Delete buttons

**Add:**
```
┌─────────────────────────────────────────────────────────────┐
│ Retro Schedule                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Cyber          [Full Prior Acts ✓] [Follow Form] [Date]     │
│                                                             │
│ Tech E&O       [Full Prior Acts] [Inception ✓] [Date]       │
│   └─ $4M xs $1M  [Date: 01/01/2026 ✓]  (limit increase)     │
│                                                             │
│ D&O            [Full Prior Acts] [Inception ✓] [Date]       │
│                                                             │
│ Notes: ________________________________________________     │
│                                                             │
│ [Reset to Defaults]                      [Using: Defaults]  │
│                                              or              │
│                                          [Customized ●]     │
└─────────────────────────────────────────────────────────────┘
```

**Shortcut buttons per coverage:**
- `Full Prior Acts` - Most common for Cyber
- `Follow Form` - For excess layers
- `Inception` - Common for Tech/D&O
- `[calendar icon]` - Opens date picker

**When limit bands differ (e.g., limit increase):**
- Indent sub-row under coverage
- Show limit descriptor (e.g., "$4M xs $1M")
- Allow different retro for that band

### Workflow

1. **Quote created** → Auto-populate retro based on:
   - Position (primary/excess)
   - Coverages enabled

2. **User clicks coverage shortcut** → Updates that coverage's retro

3. **"Reset to Defaults"** → Clears customization, re-applies smart defaults

4. **Status indicator:**
   - "Using Defaults" - gray badge
   - "Customized" - purple badge with dot

### Business Rules Engine

**Auto-add Prior Acts Endorsement:**
```
IF position = 'excess'
   AND any coverage has retro NOT IN ('full_prior_acts', 'follow_form')
THEN
   Auto-link endorsement "Prior Acts Coverage" (need to identify code)
   Show indicator: "Prior Acts Endorsement auto-added"
```

**Validation warnings:**
- Excess with "Full Prior Acts" on Tech E&O → unusual, show warning?
- Date retro without Prior Acts endorsement → warning

### Questions to Resolve

1. **"To match expiring"** - How to handle?
   - Option A: `custom` retro type with text "to match expiring"
   - Option B: New retro type `match_expiring` that pulls from prior policy
   - Option C: Just use `custom_text` field

2. **Prior Acts Endorsement code** - Which one?
   - Need to identify in document_library

3. **Limit bands** - When to show?
   - Only when user explicitly adds one?
   - Auto-detect from tower structure?

4. **Submission vs Option level** - Confirm:
   - Default at submission level
   - Options inherit unless customized
   - "Customized" flag tracks divergence

### Implementation Order

1. Update data model (rename columns, add retro_customized)
2. Build smart defaults function based on position + coverages
3. Redesign UI component with shortcut buttons
4. Add auto-endorsement logic
5. Remove simple date field
6. Test with various coverage combinations

---

## Open Items for User Input

- [ ] Confirm "to match expiring" handling
- [ ] Identify Prior Acts Endorsement code
- [ ] Any other retro types needed? (e.g., "None", "N/A")
- [ ] Should limit bands be auto-detected or manually added?
