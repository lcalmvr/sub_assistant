# Page Consolidation Review - In Progress

**Date:** 2025-01-04
**Status:** Design review in progress

---

## Summary

After implementing Phase 1 (SetupPage) and Phase 2 (AnalyzePage) of the page consolidation project, we discovered gaps between what was coded and what the UW actually needs. This document captures our analysis.

---

## Current State

### Navigation Flow
```
Setup → Analyze → Quote → Policy
```

### What Was Implemented

**SetupPage** (merges old Account + Review):
- Application Credibility
- Conflicts (conditional - hidden if none)
- Document Verification (conditional - hidden if no docs)
- Company Information
- Broker
- Policy Period
- Opportunity / Broker Request
- Financial Information

**AnalyzePage** (merges old UW + Rating + Comps):
- Quick Metrics (Revenue, Industry, NAICS, Status)
- Pricing (Rating inputs + Calculated Premium + Market Benchmark)
- Loss History
- Business Summary (editable)
- Key Points (editable)
- Security Controls Assessment (editable)
- AI Recommendation (conditional)
- Guideline Citations (conditional)

---

## Issues Identified

### SetupPage Issues

1. **Conditional sections hidden** - Conflicts and Document Verification don't show if empty
   - User can't evaluate page without seeing these
   - Should show with "Upload" or "No conflicts" state

2. **Financial Information placement** - Revenue/Industry entry is here but also shown on Analyze
   - Potential overlap - should this be on Setup or Analyze?

3. **Submission Status in Broker section** - Unclear why status is paired with broker

### AnalyzePage Issues

1. **Missing sections from plan:**
   - Underwriting Decision (Accept/Refer/Decline buttons) - CRITICAL
   - AI Recommendation with inline citations
   - Cyber Exposures
   - Incumbent Carrier
   - Underwriting Notes

2. **Status in Quick Metrics** - Redundant with header status badge

3. **Key Points unclear** - Wired to `bullet_point_summary` but UWs don't know what this is

4. **Security Controls** - Missing the symbol system (⭐ priority, ⚠️ caution, ❌ not answered)

---

## Proposed Layouts

### Setup Page (Revised)

```
┌─────────────────────────────────────────────────────────────┐
│ CREDIBILITY + CONFLICTS (side by side)                       │
│ - Always show both, even if empty                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ DOCUMENT VERIFICATION                                        │
│ - Always show, with upload prompt if no docs                 │
│ - PDF viewer + Extraction panel                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ACCOUNT PROFILE                                              │
│ - Company Info (name, website)                               │
│ - Broker                                                     │
│ - Policy Period                                              │
│ - Opportunity / Broker Request                               │
└─────────────────────────────────────────────────────────────┘

REMOVED: Financial Information (move to Analyze or remove - TBD)
```

### Analyze Page (Revised)

```
┌─────────────────────────────────────────────────────────────┐
│ QUICK METRICS (clickable cards)                              │
│ - Revenue, Industry, Policy Dates                            │
│ - Remove Status (redundant with header)                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ UNDERWRITING DECISION                                        │
│ ┌─────────────────────────┐  ┌────────────────────────────┐ │
│ │ AI Recommendation       │  │ Make Decision              │ │
│ │ + Citations (inline)    │  │ [Accept] [Refer] [Decline] │ │
│ └─────────────────────────┘  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PRICING                                                      │
│ - Rating inputs (Retention, Hazard, Control Adj)             │
│ - Calculated Premium + Market Benchmark side by side         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BUSINESS SUMMARY (full width, editable)                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ RISK PROFILE                                                 │
│ ┌─────────────────────────┐  ┌────────────────────────────┐ │
│ │ Cyber Exposures         │  │ Security Controls          │ │
│ │ (what risks exist)      │  │ (summary + NIST eval)      │ │
│ └─────────────────────────┘  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ LOSS HISTORY (collapsible)                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ INCUMBENT CARRIER                                            │
└─────────────────────────────────────────────────────────────┘

REMOVED: Key Points (unclear purpose), UW Notes (merge into decision),
         standalone Guideline Citations (inline with AI Rec)
```

---

## Design Principles (from discussion)

1. **AI proposes, human disposes** - AI generates, UW reviews/edits
2. **Each page has ONE purpose** - Setup = verify data, Analyze = assess risk + price
3. **Linear flow** - No jumping between pages
4. **Fields must be immediately clear** - If UW doesn't know what it's for, it won't be used
5. **Show sections even when empty** - Users need to see what's available

---

## Next Steps

1. [ ] Make Conflicts section always visible (show "No conflicts" state)
2. [ ] Make Document Verification always visible (show upload prompt if empty)
3. [ ] Add Underwriting Decision section to AnalyzePage
4. [ ] Add Cyber Exposures to AnalyzePage
5. [ ] Add Incumbent Carrier to AnalyzePage
6. [ ] Implement Security Controls with symbol indicators
7. [ ] Inline Guideline Citations with AI Recommendation
8. [ ] Remove/consolidate Key Points
9. [ ] Evaluate Financial Information placement

---

## Open Questions

1. Where should Revenue/Industry entry live - Setup or Analyze?
2. Should NAICS be visible or just used for backend classification?
3. What exactly should "Key Points" (bullet_point_summary) contain?
4. Is Experience Mod used in rating engine? If not, don't add UI for it.
5. Is Retro Date a rating input or quote-level term?
