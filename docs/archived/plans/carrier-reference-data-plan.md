# Carrier Reference Data & Tower Normalization Plan

**Date:** January 18, 2026
**Status:** Planning
**Priority:** Future Enhancement

---

## Problem Statement

Currently, carrier names in tower structures are freeform text stored in a JSON blob. This creates two issues:

1. **Inconsistent data**: "XL", "XL Insurance", "xl" are all different entries
2. **Missing business concept**: No distinction between trading name (XL) and paper carrier (Greenwich Insurance Company, Indian Harbor Insurance Company)

This limits our ability to:
- Build market profiles (e.g., "show me all accounts where XL is on the tower")
- Track which paper carriers are being used
- Analyze carrier participation across the book

---

## Business Context: Paper Carrier vs Trading Name

In commercial insurance, there's an important distinction:

| Concept | Example | Usage |
|---------|---------|-------|
| **Trading Name** | XL, Chubb, AIG | How underwriters refer to the company day-to-day |
| **Paper Carrier** | Greenwich Insurance Company, Indian Harbor Insurance Company | The actual legal entity that issues the policy |

- Some carriers always use the same paper (1:1)
- Some carriers have multiple paper options (1:many)
- Paper carrier selection can affect filing, admitted vs non-admitted status, etc.

**Critical Requirement:** Paper carrier (not trading name) is what must display on quotes and policy documents when referencing:
- Primary carrier
- Underlying carriers
- Quota share carriers

This makes paper carrier data essential for document generation, not just analytics.

---

## Current State

### Data Model
```sql
-- Tower stored as JSON array in insurance_towers
tower_json JSONB NOT NULL
-- Example: [{"carrier": "XL", "limit": 1000000, "premium": 15000}, ...]
```

### Limitations
- No carrier master data
- Freeform text entry prone to inconsistency
- Can query JSONB but no index support, awkward syntax
- No paper carrier tracking at all

---

## Proposed Data Model

### Phase 1: Carrier Reference Tables

```sql
-- Master list of carriers (trading names)
CREATE TABLE carriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trading_name TEXT NOT NULL UNIQUE,  -- "XL", "Chubb", "AIG"
    display_name TEXT,                   -- Optional formatted name
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Paper carriers (legal entities)
CREATE TABLE paper_carriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_id UUID REFERENCES carriers(id),
    legal_name TEXT NOT NULL,            -- "Greenwich Insurance Company"
    naic_code TEXT,                      -- Optional: NAIC identifier
    am_best_id TEXT,                     -- Optional: AM Best identifier
    admitted_states TEXT[],              -- States where admitted
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now()
);

-- Index for lookups
CREATE INDEX idx_paper_carriers_carrier_id ON paper_carriers(carrier_id);
```

### Phase 2: Normalized Tower Layers (Optional)

```sql
-- Individual tower layers with proper references
CREATE TABLE tower_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES insurance_towers(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,           -- Order in tower (0 = primary, 1 = first excess, etc.)
    carrier_id UUID REFERENCES carriers(id),
    paper_carrier_id UUID REFERENCES paper_carriers(id),  -- Optional
    layer_limit NUMERIC,
    attachment_point NUMERIC,            -- NULL for primary
    retention NUMERIC,                   -- Only for primary layer
    premium NUMERIC,
    rpm NUMERIC,                         -- Rate per million
    ilf NUMERIC,                         -- Increased limit factor
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_tower_layers_quote_id ON tower_layers(quote_id);
CREATE INDEX idx_tower_layers_carrier_id ON tower_layers(carrier_id);
```

---

## Migration Strategy

### Step 1: Create Reference Tables & Seed Data
1. Create `carriers` and `paper_carriers` tables
2. Extract unique carrier names from existing `tower_json` data
3. Manually review and consolidate (e.g., merge "XL" and "XL Insurance")
4. Seed the carriers table with clean data
5. Add known paper carrier mappings

```sql
-- Extract unique carriers from existing data
SELECT DISTINCT layer->>'carrier' as carrier_name, COUNT(*) as usage_count
FROM insurance_towers, jsonb_array_elements(tower_json) layer
GROUP BY layer->>'carrier'
ORDER BY usage_count DESC;
```

### Step 2: Update UI to Use Dropdowns
1. Change carrier input from freetext to searchable dropdown
2. Dropdown pulls from `carriers` table
3. Allow "Add new carrier" flow for unknown carriers
4. Optional: Add paper carrier selection for detailed quotes

### Step 3: Backfill Existing Data (Optional)
1. Create mapping table: freeform name → carrier_id
2. Update existing `tower_json` to include `carrier_id` alongside `carrier` text
3. Or: Migrate to `tower_layers` table

### Step 4: Normalize to tower_layers (Optional)
Only if cross-tower queries become frequent:
1. Create `tower_layers` table
2. Migrate existing `tower_json` arrays to rows
3. Update save/load logic to use rows instead of JSON
4. Keep `tower_json` as denormalized cache if needed for performance

---

## UI Changes

### Carrier Dropdown (Phase 1)
```
Tower Structure Editor:
┌─────────────────────────────────────────────────────────┐
│ Carrier: [XL                              ▼] ← Dropdown │
│ Limit:   [$1,000,000                       ]            │
│ Premium: [$15,000                          ]            │
└─────────────────────────────────────────────────────────┘
```

### Paper Carrier Selection (Phase 1, Optional)
```
┌─────────────────────────────────────────────────────────┐
│ Carrier: [XL                              ▼]            │
│ Paper:   [Greenwich Insurance Company     ▼] ← Optional │
│ Limit:   [$1,000,000                       ]            │
└─────────────────────────────────────────────────────────┘
```

### Market Profile Query (Future)
```
Carrier Analysis:
┌─────────────────────────────────────────────────────────┐
│ Carrier: [XL ▼]  Position: [Any ▼]  Year: [2025 ▼]     │
│                                                         │
│ Results: 47 quotes                                      │
│ ├─ Primary: 23 (49%)                                   │
│ ├─ Excess: 24 (51%)                                    │
│ └─ Avg Premium: $18,500                                │
│                                                         │
│ Paper Carriers Used:                                    │
│ ├─ Greenwich Insurance: 31 (66%)                       │
│ └─ Indian Harbor: 16 (34%)                             │
└─────────────────────────────────────────────────────────┘
```

---

## Benefits

| Benefit | Phase 1 (Reference Tables) | Phase 2 (Normalized Layers) |
|---------|---------------------------|----------------------------|
| Consistent carrier names | ✓ | ✓ |
| Paper carrier tracking | ✓ | ✓ |
| Cross-tower queries | Partial (still JSONB) | ✓ Full SQL |
| Market profiles | Basic | Advanced |
| Per-layer history | ✗ | ✓ |
| Stable layer IDs (for UI) | ✗ | ✓ |

---

## Effort Estimate

| Phase | Scope | Complexity |
|-------|-------|------------|
| 1a | Create tables + seed data | Low |
| 1b | UI dropdown for carriers | Medium |
| 1c | Paper carrier UI | Medium (required for docs) |
| 1d | Document generation integration | Medium |
| 2 | Normalize to tower_layers | High |

**Recommendation:** Phase 1 (including 1c) is required for proper document generation. Start there. Phase 2 only if analytics needs justify the migration complexity.

---

## Open Questions

1. **How many unique carriers do we work with?** If <50, manual curation is easy. If hundreds, need fuzzy matching.
2. ~~**Do we need paper carrier on every quote?**~~ **ANSWERED:** Yes - paper carrier is required for document generation (quotes, policies).
3. **Historical data**: How important is backfilling old quotes vs. clean data going forward?
4. **CMAI layer**: Should "CMAI" be a carrier in the reference table, or handled specially?
5. **When to capture paper carrier?** At quote creation? At bind? Should default paper be auto-selected if carrier has only one?

---

## Appendix: Sample Carrier Data

| Trading Name | Paper Carriers |
|--------------|----------------|
| XL | Greenwich Insurance Company, Indian Harbor Insurance Company |
| Chubb | Federal Insurance Company, Vigilant Insurance Company |
| AIG | National Union Fire Insurance, American Home Assurance |
| Beazley | Beazley Insurance Company Inc |
| Coalition | Coalition Insurance Company (single paper) |

*To be expanded based on actual market data.*
