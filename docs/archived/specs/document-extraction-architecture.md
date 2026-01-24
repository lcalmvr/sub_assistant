# Document Extraction Architecture

## Overview

This document describes the intelligent document routing and extraction system that optimizes for cost, speed, and accuracy by using different extraction strategies based on document type and leveraging a policy form catalog to avoid redundant extraction.

## Design Principles

1. **Right tool for the job** - Use Textract for structured forms, Claude for unstructured text
2. **Extract once, reuse forever** - Catalog policy forms to avoid re-extracting boilerplate
3. **Extract only what you need** - Skip boilerplate pages, focus on variable data
4. **On-demand deep analysis** - Don't pre-extract everything; answer questions when asked

---

## Document Routing

### Router Decision Tree

```
DOCUMENT INGESTION
       │
       ▼
┌─────────────────┐
│  Classify Doc   │
│  Count Pages    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                        ROUTER                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  APPLICATION (5-15 pages)                                   │
│  └─→ Textract Forms (all pages)                             │
│      └─→ Claude field mapping                               │
│                                                              │
│  LOSS RUNS / FINANCIALS (5-50 pages)                        │
│  └─→ Textract Tables (all pages)                            │
│      └─→ Claude analysis                                    │
│                                                              │
│  EMAIL / NARRATIVE (1-5 pages)                              │
│  └─→ Claude Vision direct                                   │
│                                                              │
│  UNDERLYING QUOTE (1-50 pages)                              │
│  └─→ Quote extraction strategy (see below)                  │
│                                                              │
│  POLICY DOCUMENT (20-150 pages)                             │
│  └─→ Tiered policy extraction (see below)                   │
│                                                              │
│  UNKNOWN / OTHER                                            │
│  └─→ Claude Vision direct                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Cost by Strategy

| Strategy | Cost/Page | Best For |
|----------|-----------|----------|
| Textract DetectText | $0.0015 | Page scanning, keyword search |
| Textract Tables | $0.015 | Loss runs, financials, schedules |
| Textract Forms | $0.05 | Applications, checkboxes, key-value |
| Claude Vision | $0.01-0.02 | Unstructured, context-heavy |

---

## Extraction Strategies

### 1. Application Forms

**Characteristics**: Checkboxes, structured fields, 5-15 pages

**Strategy**: Textract Forms → Claude Mapping

```
┌──────────────────────────────────────────────────────────────┐
│  INPUT: Application PDF (e.g., At Bay Ransomware App)        │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  TEXTRACT FORMS ($0.05/page)                                 │
│  • Checkbox detection (SELECTION_ELEMENT)                    │
│  • Key-value pair extraction                                 │
│  • Bounding boxes for all fields                             │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  CLAUDE FIELD MAPPING                                        │
│  • Map Textract keys → canonical field names                 │
│  • Resolve ambiguous values                                  │
│  • Cross-field validation                                    │
│  • Preserve bbox references                                  │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  OUTPUT: Structured extraction with bboxes                   │
│  {                                                           │
│    "emailMfa": {                                             │
│      "value": true,                                          │
│      "confidence": 0.98,                                     │
│      "source": { "page": 3, "bbox": {...} }                  │
│    }                                                         │
│  }                                                           │
└──────────────────────────────────────────────────────────────┘
```

**Cost**: ~$0.50 for 10-page application

---

### 2. Loss Runs & Financials

**Characteristics**: Tables, numbers, dates, 10-50 pages

**Strategy**: Textract Tables → Claude Analysis

```
┌──────────────────────────────────────────────────────────────┐
│  TEXTRACT TABLES ($0.015/page)                               │
│  • Table structure detection                                 │
│  • Cell extraction with row/column context                   │
│  • Number and date parsing                                   │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  CLAUDE ANALYSIS                                             │
│  • Identify claim records                                    │
│  • Calculate loss ratios                                     │
│  • Flag large losses                                         │
│  • Trend analysis                                            │
└──────────────────────────────────────────────────────────────┘
```

**Cost**: ~$0.30 for 20-page loss run

---

### 3. Underlying Quotes

**Characteristics**: Quote summary (1-5 pages) OR quote + full policy (30-100 pages)

**Strategy**: Adaptive based on page count

```
┌──────────────────────────────────────────────────────────────┐
│  QUOTE ROUTING                                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  if page_count <= 5:                                         │
│      # Quote summary only                                    │
│      → Textract Forms on all pages                           │
│      → Extract: carrier, limits, premium, dates              │
│                                                              │
│  else:                                                       │
│      # Quote + attached policy form                          │
│      → Textract Forms on pages 1-3 (dec pages)               │
│      → Cheap scan rest to find endorsement fill-ins          │
│      → Skip policy boilerplate                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key fields to extract**:
- Carrier name
- Policy number
- Limits (per occurrence, aggregate)
- Retention / deductible
- Premium
- Effective / expiration dates
- Coverage parts included
- Key exclusions

**Cost**: ~$0.20-0.30 regardless of attached policy length

---

### 4. Policy Documents (Tiered Extraction)

**Characteristics**: 20-150 pages, mix of boilerplate and variable data

**Strategy**: Three-tier extraction

```
┌──────────────────────────────────────────────────────────────┐
│                 TIER 1: ALWAYS EXTRACT                       │
│                 (Every policy, upfront)                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  DECLARATIONS PAGE (pages 1-3)                               │
│  • Textract Forms ($0.15)                                    │
│  • Extract:                                                  │
│    - Named insured                                           │
│    - Policy number                                           │
│    - Effective/expiration dates                              │
│    - Limits by coverage part                                 │
│    - Retentions/deductibles                                  │
│    - Premium by coverage                                     │
│    - Broker/agent info                                       │
│                                                              │
│  ENDORSEMENT SCHEDULE                                        │
│  • List of attached endorsements with form numbers           │
│  • Usually on dec page or page 4-5                           │
│                                                              │
│  ENDORSEMENT FILL-INS                                        │
│  • Scan endorsement pages for fill-in values                 │
│  • Sublimits, scheduled items, specific exclusions           │
│  • Textract Forms only on pages with fill-ins                │
│                                                              │
│  Cost: ~$0.20-0.50                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 TIER 2: CATALOG LOOKUP                       │
│                 (Extract once, reuse forever)                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  IDENTIFY FORM NUMBERS                                       │
│  • Base policy form (e.g., "ISO CG 00 01 04 13")            │
│  • Endorsement forms (e.g., "CY 00 02 05 19")               │
│                                                              │
│  CATALOG CHECK                                               │
│  • Form already in catalog?                                  │
│    YES → Pull pre-extracted coverage/exclusion data          │
│    NO  → Queue for one-time full extraction                  │
│                                                              │
│  Cost: $0 for known forms                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 TIER 3: ON-DEMAND                            │
│                 (When user asks a question)                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  USER QUESTION: "Does this policy cover ransomware?"         │
│                                                              │
│  RESOLUTION:                                                 │
│  1. Look up base form in catalog → coverage provisions       │
│  2. Check endorsement fill-ins → any ransomware sublimit?    │
│  3. Check endorsement catalog → any ransomware exclusion?    │
│  4. If still unclear → RAG search policy text                │
│                                                              │
│  Cost: ~$0.01 for catalog lookup, more if RAG needed         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Policy Form Catalog

### Purpose

Insurance policies reuse standard forms. A carrier might issue thousands of policies using the same base form (e.g., "Beazley Cyber Policy Form CY 01 2023"). By cataloging these forms, we:

1. **Avoid redundant extraction** - Extract form language once
2. **Enable instant answers** - "What does this policy exclude?" → catalog lookup
3. **Track form versions** - Know when forms change
4. **Build institutional knowledge** - Understand coverage across carriers

### What Gets Cataloged

| Item | Example | Extract Once? |
|------|---------|---------------|
| Base policy forms | ISO CG 00 01 | Yes |
| Carrier-specific forms | Beazley CY 01 | Yes |
| Standard endorsements | ISO CG 21 06 | Yes |
| Carrier endorsements | AIG Cyber Ext 01 | Yes |
| Fill-in values | "$500K sublimit" | No (per-policy) |
| Declarations | Limits, dates | No (per-policy) |

### Catalog Matching

```
INCOMING POLICY
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  CHEAP SCAN: Find form numbers ($0.0015/page)               │
│  • Regex: /[A-Z]{2,3}\s*\d{2}\s*\d{2}(\s*\d{2}\s*\d{2})?/   │
│  • Look for "Form", "Edition", "Policy Number"              │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  CATALOG LOOKUP                                             │
│  • SELECT * FROM policy_form_catalog                        │
│    WHERE form_number IN (detected_forms)                    │
└─────────────────────────────────────────────────────────────┘
      │
      ├─── ALL FOUND ───▶ Use cached analysis
      │
      └─── SOME MISSING ──▶ Queue for extraction
                               │
                               ▼
                    ┌─────────────────────────┐
                    │  FULL EXTRACTION        │
                    │  • Textract full form   │
                    │  • Claude analysis      │
                    │  • Add to catalog       │
                    └─────────────────────────┘
```

---

## Cost Projections

### Per-Submission (Typical)

| Document | Pages | Strategy | Cost |
|----------|-------|----------|------|
| Application | 10 | Textract Forms | $0.50 |
| Loss runs | 20 | Textract Tables | $0.30 |
| Financials | 5 | Textract Tables | $0.08 |
| Broker email | 2 | Claude Vision | $0.03 |
| Underlying quote | 40 | Tiered (dec only) | $0.25 |
| **Total** | **77** | | **$1.16** |

### Policy Extraction

| Scenario | Cost |
|----------|------|
| 50-page policy, known forms | $0.25 (dec + fill-ins only) |
| 50-page policy, new carrier | $2.75 (full extraction, one-time) |
| 10 policies from same carrier | $2.50 + $2.25 = $4.75 |
| 100 policies from same carrier | $2.50 + $22.50 = $25.00 |

### Annual Projections (1000 submissions/year)

| Approach | Annual Cost |
|----------|-------------|
| Full extraction everything | ~$15,000 |
| Smart routing | ~$3,000 |
| Smart routing + catalog | ~$1,500 |

---

## Implementation Phases

### Phase 1: Document Router
- Add extraction strategy field to document classification
- Implement routing logic
- Wire up Textract Forms/Tables extractors

### Phase 2: Application Extraction
- Textract Forms → Claude mapping pipeline
- Bbox preservation through pipeline
- Update extraction_provenance table

### Phase 3: Policy Catalog
- Schema for policy_form_catalog
- Form number detection
- Catalog matching logic

### Phase 4: Tiered Policy Extraction
- Dec page extraction
- Endorsement fill-in detection
- On-demand question answering

---

## Related Files

- `ai/textract_extractor.py` - Textract integration
- `core/document_router.py` - Routing logic (to be created)
- `core/policy_catalog.py` - Catalog management (to be created)
- `db_setup/policy_catalog_tables.sql` - Database schema (to be created)
