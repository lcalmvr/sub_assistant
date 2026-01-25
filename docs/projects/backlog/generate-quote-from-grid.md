# Generate Quote from Grid

**Priority:** Medium
**Added:** 2025-01-24

## Problem

To generate a quote PDF, UW must click into the quote detail page first. No quick action from the quote options grid.

## Solution

Add "Generate" action directly on each row in the quote options grid.

## UI Concept

```
#  TYPE  QUOTE OPTION     PREMIUM   STATUS   ACTIONS
1  XS    $5M xs $10M      $40,910   Draft    [Generate] [...]
2  PRI   $2M x $25K       $40,910   Draft    [Generate] [...]
```

Or as icon buttons:
```
1  XS    $5M xs $10M      $40,910   Draft    📄 ⋮
                                             ↑
                                        Generate PDF
```

## Behavior

1. Click Generate on row
2. Generate quote PDF for that option
3. Show success toast with download/view link
4. Or: Open preview modal

## Considerations

- Should validate quote is complete before generating
- Show spinner/loading state during generation
- Handle errors gracefully
- Maybe batch generate multiple quotes?

## Related

- Quote options grid (needs redesign anyway)
- PDF generation endpoint
- Existing Generate button on quote detail page
