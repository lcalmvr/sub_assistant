# Document Type Groupings

**Priority:** Low
**Added:** 2025-01-24

## Problem

Document list shows all documents in a flat list. Hard to find specific document types when there are many uploads.

## Solution

Group documents by type in the UI:

```
▼ Applications (2)
  ├── ACORD Application.pdf
  └── Supplemental App.pdf

▼ Loss Runs (3)
  ├── 2023 Loss Run.pdf
  ├── 2022 Loss Run.pdf
  └── 2021 Loss Run.pdf

▼ Financials (1)
  └── 2023 Annual Report.pdf

▼ Other (2)
  ├── Security Questionnaire.pdf
  └── Org Chart.pdf
```

## Document Types

Likely groupings:
- Applications (ACORD, supplemental)
- Loss Runs / Claims History
- Financials (annual reports, audited statements)
- Security (questionnaires, SOC2 reports, pen tests)
- Legal (contracts, bylaws)
- Other / Miscellaneous

## Implementation

- Documents already have `document_type` field
- Group by type in frontend
- Collapsible sections
- Count badge per group
- "Other" for uncategorized

## Related

- Document list component
- `documents.document_type` field in DB
