# PDF Generation Standardization

**Priority:** Medium
**Added:** 2025-01-24

## Problem

PDF generation likely varies across different document types. Need a repeatable, consistent approach.

## Goals

- Standardized PDF generation library/pattern
- Reusable templates
- Consistent styling across documents
- Easy to add new document types

## Document Types to Support

- Quote letters
- Binders
- Policy documents
- Endorsements
- Certificates of insurance
- Invoices
- Schedules (additional insureds, etc.)

## Potential Approach

### Template System
```
templates/
  quote-letter.html (or .jsx)
  binder.html
  policy-dec.html
  endorsement.html
  certificate.html
```

### Shared Components
- Header with logo/branding
- Footer with page numbers
- Standard typography
- Table styles
- Signature blocks

### Generation Flow
```
Data → Template → HTML → PDF
```

### Tech Options
- Puppeteer/Playwright for HTML → PDF
- React-PDF for component-based
- WeasyPrint (Python)
- Existing solution to standardize around?

## Implementation

1. Audit current PDF generation code
2. Identify common patterns
3. Create shared template components
4. Build generation service/utility
5. Migrate existing PDFs to new system
6. Document how to add new templates

## Related

- Current PDF generation in `core/` or `api/`
- Quote generation endpoint
- Binder generation
