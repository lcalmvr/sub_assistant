# Mid-Term Fill-Ins / Additional Insured Schedule

**Priority:** Medium
**Added:** 2025-01-24
**Status:** Needs scoping

## Problem

Need workflow for managing additional insureds mid-term (after policy issuance).

## Questions to Scope

- How are additional insureds added today?
- Is this an endorsement flow or separate process?
- What info is needed per additional insured?
- Is there a schedule/list view of all AIs?
- Premium impact? (flat fee, pro-rata, included?)
- Certificate generation tied to this?
- Bulk upload needed?

## Rough Concept

```
Additional Insured Schedule
───────────────────────────
+ Add Additional Insured

Company Name          Type              Added      Status
─────────────────────────────────────────────────────────
Acme Corp            Blanket           01/15/25   Active
BigCo LLC            Scheduled         02/01/25   Pending
```

## Next Steps

1. Understand current AI workflow
2. Identify pain points
3. Define data model for AI schedule
4. Design endorsement integration
