# Coverage Editor Submission View

**Priority:** Medium
**Added:** 2025-01-24

## Problem

All screens on the quote page have both Quote view and Submission view toggle. Coverage editor currently only has Quote view - missing the Submission view.

## Current State

- Quote/Submission toggle exists at page level
- Other editors show submission-level data when toggled
- Coverage editor only shows quote-specific coverages

## Solution

Add Submission view to coverage editor showing:
- Requested coverages from submission
- Requested limits from application
- What broker/insured asked for vs what we're quoting

## UI Concept

**Quote View (current):**
```
QUOTE DETAILS
┌─────────────────────────────────────┐
│ EXCEPTIONS | ALL              Edit  │
│ Dependent System Failure      $2M   │
│ Social Engineering            $90K  │
└─────────────────────────────────────┘
```

**Submission View (new):**
```
SUBMISSION DETAILS
┌─────────────────────────────────────┐
│ REQUESTED COVERAGES                 │
│ Dependent System Failure   Requested│
│ Social Engineering         Requested│
│ Contingent BI              Requested│
│ Crypto Coverage         Not Requested│
└─────────────────────────────────────┘
```

## What Submission View Shows

- Coverages requested in application
- Limits requested vs limits quoted
- Gap indicator (requested but not quoted)
- Source: extraction from application docs

## Related

- Coverage editor component
- Other editors with Quote/Submission toggle (for pattern reference)
- `submission_extracted_values` table for requested data
