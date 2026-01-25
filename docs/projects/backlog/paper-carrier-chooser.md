# Paper Carrier Chooser

**Priority:** Medium
**Added:** 2025-01-24
**Status:** Needs scoping

## Problem

An insurer can write on multiple paper companies (fronting/issuing carriers). UWs need ability to select which paper to use for a quote.

## Examples

- Insurer writes on: Berkley Paper, Markel Paper
- Different papers may have different: admitted status, state filings, ratings

## Questions to Scope

### Data Model
- Where are paper carriers configured? Per-insurer?
- Is paper selection per-quote or per-layer?
- What metadata? (name, AM Best rating, admitted states, NAIC code?)

### UI Location Options
1. **Quote setup** - Select paper when creating quote
2. **Tower editor** - Select paper per layer
3. **Policy page** - During issuance
4. **Carrier dropdown** - Show as "Carrier (Paper)" combined

### Paper Implications
- Affects policy issuance documents
- May affect state filing requirements
- May affect surplus lines taxes
- Affects certificate of insurance

## Rough Concept

```
┌─────────────────────────────────────┐
│ Issuing Carrier                     │
│ ┌─────────────────────────────────┐ │
│ │ Berkley Insurance Company  ▼    │ │
│ └─────────────────────────────────┘ │
│ AM Best: A+ (Superior)              │
│ Admitted in: All 50 states          │
└─────────────────────────────────────┘
```

## Relationship to Policy Form

- Paper + Form may be linked (certain papers only offer certain forms)
- Or independent selections
- Consider combined chooser: Paper → Form cascade

## Next Steps

1. Define where paper carriers are configured
2. Map paper → form relationships (if any)
3. Decide: per-quote or per-layer selection
4. Identify downstream impacts (docs, filings, taxes)
5. Design UI placement
