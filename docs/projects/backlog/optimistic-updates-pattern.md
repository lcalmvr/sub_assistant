# Optimistic Updates Pattern

**Priority:** Medium
**Added:** 2025-01-24
**Source:** Gemini analysis notes

## Summary

Adopt optimistic updates for UI responsiveness, but carefully distinguish between inputs (safe to optimistically update) and outputs (must wait for server).

## The Rule

| Type | Examples | Approach |
|------|----------|----------|
| **Inputs** | Toggles, checkboxes, text fields, date pickers, list reordering | Optimistic - update instantly |
| **Outputs** | Premium, commission, taxes, calculated ratios | Loading state - show "Calculating..." until server returns |

## Why This Matters

- Insurance UIs deal with financial data and binding authority
- If premium "flashes" or changes without user action, it destroys trust
- Underwriters need to trust the numbers implicitly

## Implementation Pattern

1. **User action** - User toggles an endorsement checkbox
2. **Optimistic input** - Checkbox updates instantly, feels responsive
3. **Stale outputs** - Premium card shows "calculating" state (spinner/grey)
4. **Server response** - Real premium value replaces loading state
5. **Rollback** - If server rejects, revert the checkbox with error message

## Where to Apply

### Optimistic (instant update)
- Endorsement toggles in TowerEditor
- Coverage checkboxes
- Date pickers (effective date, etc.)
- Retention/limit dropdowns (the selection, not the premium effect)
- Notes/text fields
- Row reordering in tables

### Loading State (wait for server)
- Premium cards (charged, annual, pro-rata)
- Commission calculations
- Tax calculations
- Any "total" or "summary" value
- Rating engine outputs

## Technical Approach

Use TanStack Query (React Query) which provides:
- `useMutation` with `onMutate` for optimistic updates
- Automatic rollback on error
- Background refetch after mutation
- Cache invalidation

```javascript
// Example pattern
const mutation = useMutation({
  mutationFn: updateEndorsement,
  onMutate: async (newValue) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['quote', quoteId])

    // Snapshot previous value
    const previous = queryClient.getQueryData(['quote', quoteId])

    // Optimistically update input
    queryClient.setQueryData(['quote', quoteId], old => ({
      ...old,
      endorsements: [...old.endorsements, newValue]
    }))

    // Invalidate premium (triggers loading state)
    queryClient.invalidateQueries(['premium', quoteId])

    return { previous }
  },
  onError: (err, newValue, context) => {
    // Rollback on error
    queryClient.setQueryData(['quote', quoteId], context.previous)
  },
})
```

## UI Components Needed

1. **CalculatingState** - Skeleton/spinner overlay for premium cards
2. **StaleIndicator** - Subtle visual cue that a value may be outdated
3. **RollbackToast** - Error message when server rejects a change

## Related

- Current premium calculation: `frontend/src/utils/premiumUtils.js`
- Tower editor: `frontend/src/components/quote/TowerEditor.jsx`
