# Subjectivity + Policy Issuance Workflow

**Priority:** Medium
**Added:** 2025-01-24
**Status:** Needs scoping

## Problem

Need a workflow connecting subjectivity clearance to policy issuance.

## Questions to Scope

- What's the current subjectivity tracking flow?
- What triggers "ready to issue"?
- Are all subjectivities required before issuance, or just some?
- Who clears subjectivities? (UW, ops, automated?)
- What documents are needed for clearance?
- What happens if subjectivity isn't cleared by effective date?

## Rough Concept

```
Subjectivities          Policy Issuance
─────────────           ────────────────
[ ] MFA confirmation    [Issue Policy] ← blocked
[ ] SOC2 report
[✓] Signed app

All cleared:
[✓] MFA confirmation    [Issue Policy] ← enabled
[✓] SOC2 report
[✓] Signed app
```

## Next Steps

1. Map current subjectivity workflow
2. Identify pain points
3. Define clearance criteria
4. Design issuance gate logic
