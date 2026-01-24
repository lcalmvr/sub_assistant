# Page Consolidation Project

**Created:** 2025-01-04
**Status:** Planning
**Branch:** `feature/page-consolidation` (to be created)

---

## 1. EXECUTIVE SUMMARY

### Goal
Consolidate the submission workflow from 7 pages to 5 purpose-driven stages with a linear flow.

### Current State (7 pages + Vote Queue)
```
Vote Queue → Account → Review → UW → Comps → Rating → Quote → Policy
```

### Proposed State (5 stages)
```
Vote → Setup → Analyze → Quote → Policy
```

### Key Changes
| Current | Proposed | Change |
|---------|----------|--------|
| Account + Review | **Setup** | Merge into single data verification stage |
| UW + Comps + Rating | **Analyze** | Merge into single risk assessment + pricing stage |
| Quote | **Quote** | Keep (already well-scoped) |
| Policy | **Policy** | Keep (already well-scoped) |
| Vote Queue | **Vote** | Keep (already well-scoped) |

---

## 2. DESIGN RATIONALE

### Why Consolidate?

1. **Single Purpose Per Page** - Each page answers ONE question
2. **Linear Flow** - No jumping between pages to complete a task
3. **Reduced Duplication** - Same data shown once, not 3+ times
4. **Commercialization Ready** - Clean separation of workflow shell vs. pluggable business logic

### Stage Purposes

| Stage | Question Answered | User | Output |
|-------|-------------------|------|--------|
| **Vote** | Should we pursue this? | UW (quick) | Pursue/Decline |
| **Setup** | Is our data accurate? | UW | Verified account |
| **Analyze** | Is this good risk & what price? | UW | Risk assessment + target premium |
| **Quote** | What terms to offer? | UW | Quote document(s) |
| **Policy** | Manage bound policy | Policy Admin | Serviced policy |

---

## 3. DETAILED DESIGN

### Stage 2: SETUP (Account + Review merged)

**Purpose:** Verify AI-extracted data and complete account profile

**Sections:**
```
┌─────────────────────────────────────────────┐
│ DOCUMENT VERIFICATION                        │
│ (Left: PDF viewer | Right: Extractions)      │
│ - Review AI extractions                      │
│ - Accept/edit values                         │
│ - Resolve conflicts                          │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ ACCOUNT PROFILE                              │
│ - Company info (name, website)               │
│ - Broker selection                           │
│ - Policy period (effective/expiration)       │
│ - Renewal linkage                            │
│ - Financial info (revenue, industry)         │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ CREDIBILITY SCORE                            │
│ - Application credibility assessment         │
│ - Data quality indicators                    │
└─────────────────────────────────────────────┘
```

**Removed from current pages:**
- Quick Facts (Review) → redundant
- Business Summary read-only (Account) → moves to Analyze

---

### Stage 3: ANALYZE (UW + Comps + Rating merged)

**Purpose:** Assess risk quality and determine appropriate pricing

**Sections:**
```
┌─────────────────────────────────────────────┐
│ RISK ASSESSMENT                              │
│ - Business Summary (editable)                │
│ - Underwriting Notes (editable)              │
│ - Loss History + Claims                      │
│ - Security Controls                          │
│ - Financial Metrics                          │
│ - Incumbent Carrier                          │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ RATING INPUTS                                │
│ - Hazard Class                               │
│ - Control Adjustments                        │
│ - Experience Mod                             │
│ - [Future: Coverage-level inputs]            │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ PRICING                                      │
│ ┌──────────────┐  ┌──────────────────┐      │
│ │ CALCULATED   │  │ MARKET BENCHMARK │      │
│ │ (Rating)     │  │ (Comps Summary)  │      │
│ │              │  │                  │      │
│ │ $1M: $32K    │  │ Avg: $34K        │      │
│ │ $2M: $52K    │  │ Range: $48-58K   │      │
│ │ $3M: $73K    │  │ 12 comps         │      │
│ └──────────────┘  └──────────────────┘      │
│                                              │
│        [View Full Comp Analysis →]           │
│              (opens modal/drawer)            │
│                                              │
│           [Create $2M Option →]              │
└─────────────────────────────────────────────┘
```

**Key Decision:** Full Comps page (with side-by-side analysis) opens as modal/drawer from "View Full Comp Analysis" link. The dedicated Comps work is preserved, just accessed differently.

---

## 4. VERSION PROTECTION STRATEGY

### Git Branch Strategy

```
main
  └── feature/page-consolidation (new work here)

# Before ANY changes, create backup branch:
git checkout main
git checkout -b backup/pre-consolidation-2025-01-04
git push origin backup/pre-consolidation-2025-01-04
```

### File Backups

Before modifying, copy current files to `_archive/`:

```
frontend/src/pages/_archive/
├── CompsPage.v1.jsx       # Full copy of current CompsPage
├── RatingPage.v1.jsx      # Full copy of current RatingPage
├── UWPage.v1.jsx          # Full copy of current UWPage
├── AccountPage.v1.jsx     # Full copy of current AccountPage
├── ReviewPage.v1.jsx      # Full copy of current ReviewPage
└── VERSION_NOTES.md       # What each backup contains
```

### Rollback Plan

If consolidation doesn't work:
1. `git checkout backup/pre-consolidation-2025-01-04`
2. Or restore from `_archive/` files
3. Document what didn't work for future reference

---

## 5. PROJECT PLAN

### Phase 0: Preparation (Before Any Code Changes)
- [ ] Create `backup/pre-consolidation-2025-01-04` branch
- [ ] Push backup branch to origin
- [ ] Create `frontend/src/pages/_archive/` directory
- [ ] Copy CompsPage.jsx → _archive/CompsPage.v1.jsx
- [ ] Copy RatingPage.jsx → _archive/RatingPage.v1.jsx
- [ ] Copy UWPage.jsx → _archive/UWPage.v1.jsx
- [ ] Copy AccountPage.jsx → _archive/AccountPage.v1.jsx
- [ ] Copy ReviewPage.jsx → _archive/ReviewPage.v1.jsx
- [ ] Create VERSION_NOTES.md in _archive/
- [ ] Create `feature/page-consolidation` branch
- [ ] Verify all backups are in place

### Phase 1: Setup Page (Account + Review Merge)
- [ ] Create new SetupPage.jsx scaffold
- [ ] Move Document Verification section from ReviewPage
- [ ] Move Account Profile sections from AccountPage
- [ ] Move Credibility Score from ReviewPage
- [ ] Remove Quick Facts from ReviewPage (redundant)
- [ ] Update routing (Account → Setup, Review → Setup)
- [ ] Update navigation tabs
- [ ] Test: Can complete account setup in single page?
- [ ] Test: All data saves correctly?

### Phase 2: Analyze Page (UW + Rating + Comps Summary)
- [ ] Rename/refactor UWPage → AnalyzePage
- [ ] Move Rating Inputs section from RatingPage
- [ ] Move Pricing Matrix from RatingPage
- [ ] Add Comps Summary panel (avg, range, count)
- [ ] Add "View Full Comp Analysis" button → opens CompsPage as modal
- [ ] Add "Create Option" action → navigates to Quote
- [ ] Remove simplified comp panel from UW (use summary instead)
- [ ] Update routing (UW → Analyze, Rating → Analyze)
- [ ] Update navigation tabs
- [ ] Test: Rating calculation works?
- [ ] Test: Comps modal opens with full functionality?
- [ ] Test: Create Option flows to Quote correctly?

### Phase 3: Navigation & Flow
- [ ] Update SubmissionLayout tab configuration
- [ ] Rename tabs: Account→Setup, UW→Analyze
- [ ] Remove Rating tab (merged into Analyze)
- [ ] Remove Comps tab (accessed via modal from Analyze)
- [ ] Update any cross-page links
- [ ] Test: Full linear flow Vote→Setup→Analyze→Quote→Policy

### Phase 4: Cleanup
- [ ] Remove dead code from old pages
- [ ] Remove unused imports
- [ ] Update any API calls that referenced old page structure
- [ ] Final testing of all workflows
- [ ] Document any behavioral changes

### Phase 5: Review & Decision
- [ ] Demo to stakeholders
- [ ] Gather feedback
- [ ] Decision: Merge to main OR rollback
- [ ] If merge: Delete backup branch after 2 weeks
- [ ] If rollback: Document learnings

---

## 6. RISK MITIGATION

| Risk | Mitigation |
|------|------------|
| Lose Comps functionality | Full page preserved, opened as modal |
| Lose Rating functionality | All rating code moved intact to Analyze |
| Users confused by change | Same data, just reorganized |
| Something breaks | Backup branch + _archive files |
| Need to rollback | Clean rollback path documented |

---

## 7. SUCCESS CRITERIA

- [ ] User can complete full workflow without leaving linear path
- [ ] All existing functionality preserved (just reorganized)
- [ ] No data loss or corruption
- [ ] Page load times not degraded
- [ ] Comps side-by-side analysis fully functional in modal
- [ ] Rating matrix fully functional in Analyze page
- [ ] Quote creation flow works from Analyze page

---

## 8. FUTURE CONSIDERATIONS

This consolidation sets up for:
1. **Pluggable Rating Engine** - Rating section becomes configurable
2. **Pluggable Coverage Catalog** - Quote page reads from config
3. **Multi-LOB Support** - Workflow shell stays same, business logic varies
4. **Exposure-based Rating** - Rating inputs section can expand

---

## APPENDIX A: Current Page Line Counts

| Page | Lines | After Consolidation |
|------|-------|---------------------|
| AccountPage | 657 | → SetupPage |
| ReviewPage | 889 | → SetupPage |
| UWPage | 1500+ | → AnalyzePage |
| CompsPage | 731 | → Modal (preserved) |
| RatingPage | 323 | → AnalyzePage |
| QuotePage | 2400+ | Unchanged |
| PolicyPage | 1800+ | Unchanged |

---

## APPENDIX B: File Change Summary

| File | Action |
|------|--------|
| `AccountPage.jsx` | Archive → Merge into SetupPage |
| `ReviewPage.jsx` | Archive → Merge into SetupPage |
| `UWPage.jsx` | Archive → Rename to AnalyzePage, add Rating |
| `RatingPage.jsx` | Archive → Merge into AnalyzePage |
| `CompsPage.jsx` | Archive → Keep as modal component |
| `QuotePage.jsx` | No change |
| `PolicyPage.jsx` | No change |
| `SetupPage.jsx` | NEW |
| `AnalyzePage.jsx` | NEW (from UWPage) |
| `CompsModal.jsx` | NEW (wrapper for CompsPage) |
