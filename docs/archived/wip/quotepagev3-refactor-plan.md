# QuotePageV3 Refactoring Plan

**Goal:** Reduce QuotePageV3.jsx from ~8,700 lines to ~2,500-3,000 lines through systematic extraction and consolidation.

**Current State:** 8,728 lines (down from 14,309 after initial cleanup)

**Target State:** ~2,500-3,000 lines with clean separation of concerns

---

## Phase 1: Quick Wins (Dead Code & Utilities)

### 1.1 Remove Dead Code
- [ ] Delete `SmartSaveModal` function (unused)
- [ ] Delete `SharedRemovalModal` function (unused)
- [ ] Clean up any other unused functions/state identified by diagnostics

### 1.2 Consolidate Utilities
- [ ] Move inline `formatNumberWithCommas` from ExcessCoverageCompact to quoteUtils.js import
- [ ] Move any other inline number/parse helpers to quoteUtils.js
- [ ] Audit for duplicate utility implementations

**Estimated reduction:** ~100-150 lines

---

## Phase 2: Shared Hooks

### 2.1 useEditMode Hook
Extract the repeated click-outside + escape handling pattern into a reusable hook.

**Location:** `src/hooks/useEditMode.js`

**Current pattern (repeated 6+ times):**
```javascript
useEffect(() => {
  if (!isEditing) return;
  const handleClickOutside = (e) => {
    if (ref.current && !ref.current.contains(e.target)) {
      onSave();
      setIsEditing(false);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onSave(); // or onCancel
      setIsEditing(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleKeyDown);
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleKeyDown);
  };
}, [isEditing, ...deps]);
```

**Target API:**
```javascript
const { isEditing, setIsEditing, containerRef } = useEditMode({
  onSave: () => { /* save logic */ },
  onCancel: () => { /* cancel logic */ },
  saveOnClickOutside: true,
  saveOnEscape: true, // vs cancelOnEscape
});
```

### 2.2 useQuoteOptionMutation Hook
Centralize optimistic React Query update patterns.

**Location:** `src/hooks/useQuoteOptionMutation.js`

**Used by:** QuotePageV3, TermsPanel, RetroPanel, CommissionPanel

**Target API:**
```javascript
const mutation = useQuoteOptionMutation({
  mutationFn: (data) => updateQuoteOption(quoteId, data),
  queryKey: ['quoteStructures', submissionId],
  optimisticUpdate: (old, newData) => /* merge logic */,
});
```

**Estimated reduction:** ~200-300 lines (across all usages)

---

## Phase 3: Shared Components

### 3.1 AppliesToPopover Component
Consolidate the repeated "Applies To" popover pattern.

**Location:** `src/components/quote/AppliesToPopover.jsx`

**Current pattern (repeated 10+ times):**
- HoverCard.Root with trigger showing "Option +N" or "All Primary"
- Content showing "On (N)" and "Not On (N)" lists
- Click actions to add/remove from quotes

**Target API:**
```jsx
<AppliesToPopover
  linkedQuoteIds={item.quoteIds}
  allQuotes={structures}
  onAdd={(quoteId) => linkMutation.mutate({ quoteId })}
  onRemove={(quoteId) => unlinkMutation.mutate({ quoteId })}
/>
```

**Estimated reduction:** ~400-500 lines

### 3.2 SummaryContext Provider
Provide shared state to card components without props drilling.

**Location:** `src/components/quote/summary/SummaryContext.jsx`

**Provides:**
- `expandedCard` / `setExpandedCard`
- `summaryScope` (quote vs submission)
- `structures` array
- `activeStructure` / `activeVariation`
- Shared query data (endorsements, subjectivities)
- Common mutations

---

## Phase 4: Card Extraction

Extract each card to its own file under `src/components/quote/summary/`.

### Card Components to Extract:

| Card | Est. Lines | Priority | Notes |
|------|-----------|----------|-------|
| EndorsementsCard | ~800 | High | Largest, complex hover/edit |
| SubjectivitiesCard | ~800 | High | Similar pattern to Endorsements |
| CommissionCard | ~400 | Medium | Includes Net Out logic |
| RetroCard | ~400 | Medium | Schedule editor integration |
| TermsCard | ~300 | Medium | Date pickers, TBD toggle |
| TowerCard | ~300 | Low | Already have TowerEditor extracted |
| CoveragesCard | ~300 | Low | Integrates ExcessCoverageCompact |
| NotesCard | ~100 | Low | Simple textarea |
| DocumentHistoryCard | ~150 | Low | List display |
| QuoteOptionsTable | ~200 | Medium | Submission mode table |

### Extraction Pattern:
1. Create component file with props interface
2. Move JSX and related state/hooks
3. Use SummaryContext for shared data
4. Use useEditMode for edit behavior
5. Import back into SummaryTabContent
6. Test functionality

**Estimated reduction:** ~3,500-4,000 lines from SummaryTabContent

---

## Phase 5: Final Consolidation

### 5.1 QuoteHeaderActions Component
Extract header action buttons and their logic.

**Location:** `src/components/quote/QuoteHeaderActions.jsx`

**Contains:**
- Generate Quote button + modal
- Bind button + validation
- Preview functionality
- Related mutations and state

### 5.2 Unify Excess Coverage Components
Consolidate ExcessCoverageEditor.jsx and ExcessCoverageCompact.

**Options:**
- Single component with `variant="full"` or `variant="compact"`
- Shared utilities with two thin wrapper components

### 5.3 StructurePicker Enhancement
Consider moving StructurePicker to its own file if not already.

---

## Execution Order

1. **Phase 1.1** - Remove dead code (SmartSaveModal, SharedRemovalModal)
2. **Phase 1.2** - Consolidate utilities to quoteUtils.js
3. **Phase 3.2** - Create SummaryContext (needed before card extraction)
4. **Phase 4** - Extract EndorsementsCard (establish pattern)
5. **Phase 2.1** - Create useEditMode hook (based on patterns found)
6. **Phase 3.1** - Create AppliesToPopover component
7. **Phase 4** - Extract SubjectivitiesCard (similar to Endorsements)
8. **Phase 2.2** - Create useQuoteOptionMutation hook
9. **Phase 4** - Extract remaining cards (Terms, Retro, Commission, etc.)
10. **Phase 5** - Final consolidation (header actions, excess coverage)

---

## Current Progress (Updated)

**Starting point:** 8,728 lines
**Current state:** 6,094 lines (2,634 lines removed, 30.2% reduction)

### Completed:
- [x] Phase 1.1: Remove dead code (SmartSaveModal, SharedRemovalModal)
- [x] Phase 1.2: Consolidate utilities to quoteUtils.js (formatNumberWithCommas shared)
- [x] Phase 3.2: Create SummaryContext for shared state
- [x] Phase 2.1: Create useEditMode hook
- [x] Phase 3.1: Create AppliesToPopover component
- [x] Phase 4a: Extract EndorsementsCard (942 lines moved to component)
- [x] Phase 4b: Extract SubjectivitiesCard (1,079 lines removed)
- [x] Phase 2.2: Create useOptimisticMutation hook (274 lines saved)
- [x] Phase 4c: Extract NotesCard + cleanup unused variables (187 lines removed)

### Files Created:
- `src/hooks/useEditMode.js` - Click-outside and escape key handling + useCardExpand hook
- `src/hooks/useOptimisticMutation.js` - Optimistic React Query mutation patterns (138 lines)
- `src/components/quote/summary/SummaryContext.jsx` - Shared state provider
- `src/components/quote/AppliesToPopover.jsx` - Reusable applies-to UI
- `src/components/quote/summary/EndorsementsCard.jsx` - Endorsements management (~710 lines)
- `src/components/quote/summary/SubjectivitiesCard.jsx` - Subjectivities management (~1,354 lines)
- `src/components/quote/summary/NotesCard.jsx` - Notes editing card (~55 lines)

### Remaining:
- [ ] Phase 4c continued: Extract remaining cards (Terms, Retro, Commission, Tower, Coverages)
- [ ] Phase 5: Final consolidation

---

## Success Metrics

- [ ] QuotePageV3.jsx under 3,000 lines (realistic target after SubjectivitiesCard extraction)
- [ ] No component file over 800 lines
- [ ] Shared hooks eliminate 80%+ of duplicate patterns
- [x] All builds pass
- [ ] Manual testing confirms functionality

---

## Files to Create

```
src/
  hooks/
    useEditMode.js
    useQuoteOptionMutation.js
  components/
    quote/
      TowerEditor.jsx (already created)
      AppliesToPopover.jsx
      QuoteHeaderActions.jsx
      summary/
        SummaryContext.jsx
        EndorsementsCard.jsx
        SubjectivitiesCard.jsx
        TermsCard.jsx
        RetroCard.jsx
        CommissionCard.jsx
        TowerCard.jsx
        CoveragesCard.jsx
        NotesCard.jsx
        DocumentHistoryCard.jsx
        QuoteOptionsTable.jsx
  utils/
    quoteUtils.js (already exists, extend)
```

---

## Risk Mitigation

1. **Commit after each phase** - Easy rollback if something breaks
2. **Run build after each extraction** - Catch errors early
3. **Test manually after major changes** - Especially edit/save flows
4. **Keep old code commented briefly** - Remove after confirming new code works
