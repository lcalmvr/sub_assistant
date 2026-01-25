# Quote Section Completion Indicators

**Priority:** Medium
**Added:** 2025-01-24

## Problem

On QuotePageV3, UWs need to review/complete multiple sections before quoting. Currently no visual way to track which sections are done vs still need attention.

## Solution

Add a "done" indicator to each card/section so UWs can:
- Mark sections complete as they work through them
- Quickly scan the page to see what's left
- Focus attention on incomplete sections

## UI Concept

### Per-Card Treatment
- **Not done (default):** Normal card appearance
- **Done:** Muted/shaded background, subtle green border or checkmark icon in header

### Interaction Options
1. **Checkmark button** in card header - explicit toggle
2. **Click card header** to toggle - faster but less discoverable
3. **Auto-complete** - some cards could auto-mark done (e.g., if all required fields filled)

### Visual Ideas
```
┌─────────────────────────────┐
│ ☐ Coverage Selection        │  ← Not done (normal)
│   ...                       │
└─────────────────────────────┘

┌─────────────────────────────┐
│ ✓ Endorsements         done │  ← Done (muted bg, check)
│   ...                       │
└─────────────────────────────┘
```

## Extensions

1. **Progress bar** - "4 of 7 sections complete" in page header
2. **Ready to quote validation** - Can't generate quote until required sections done
3. **Persistence** - Save completion state per quote (DB or localStorage)
4. **Required vs optional** - Some sections required, others optional

## Cards on QuotePageV3

Likely candidates (verify current layout):
- Account/Insured info
- Coverage selection
- Endorsements
- Sublimits
- Tower/Layers
- Rating adjustments
- Subjectivities

## Implementation Notes

- State: `{ [cardId]: boolean }` per quote
- Persist: Could store in `quotes.quote_data` JSONB or localStorage
- Component: Wrap existing cards with `<CompletableCard done={} onToggle={} />`
