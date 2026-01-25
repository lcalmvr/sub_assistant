# Simplify Setup Page

**Priority:** Low
**Added:** 2025-01-24

## Problem

Setup page has a header card that may be unnecessary. Page should focus on document extraction.

## Solution

- Remove the setup header card
- Simplify page to focus on document extraction workflow
- Cleaner, more focused UI

## Current State

```
┌─────────────────────────────────────┐
│ Setup Header Card                   │  ← Remove this
│ [various info/actions]              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Document Extraction                 │  ← Keep/enhance
│ ...                                 │
└─────────────────────────────────────┘
```

## Target State

```
┌─────────────────────────────────────┐
│ Document Extraction                 │
│ - Upload documents                  │
│ - Run extraction                    │
│ - Review extracted data             │
└─────────────────────────────────────┘
```

## Related

- Setup page component
- Document extraction workflow
