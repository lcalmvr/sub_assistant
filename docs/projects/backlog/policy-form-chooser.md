# Policy Form Chooser

**Priority:** Medium
**Added:** 2025-01-24
**Status:** Needs scoping

## Problem

Some carriers (including us) have multiple primary policy forms. UWs need ability to choose which form applies to a quote/layer.

## Examples

- Carrier A: Standard Cyber, Enhanced Cyber, Tech E&O
- Our forms: Form A (claims-made), Form B (occurrence), Manuscript

## Questions to Scope

### Data Model
- Where do policy forms live? Per-carrier config?
- Is form selection per-quote or per-layer?
- What metadata do forms have? (name, code, PDF template?)

### UI Location Options
1. **Quote setup** - Select form when creating quote
2. **Tower editor** - Select form per layer/carrier
3. **Coverage section** - Alongside coverage selections
4. **Policy page** - During issuance

### Form Implications
- Does form choice affect available coverages?
- Does it affect endorsements?
- Does it affect PDF generation template?

## Rough Concept

```
┌─────────────────────────────────────┐
│ Policy Form                         │
│ ┌─────────────────────────────────┐ │
│ │ Standard Cyber Policy      ▼    │ │
│ └─────────────────────────────────┘ │
│ • Claims-made                       │
│ • Includes breach response          │
└─────────────────────────────────────┘
```

## Implementation Considerations

- Carrier config needs to define available forms
- Form selection should cascade to PDF templates
- May need form-specific coverage/endorsement rules

## Next Steps

1. Define where forms are configured (carrier settings?)
2. Decide: per-quote or per-layer selection
3. Identify downstream impacts (coverages, endorsements, PDFs)
4. Design UI placement
