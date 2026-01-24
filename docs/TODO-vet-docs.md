# TODO: Vet Documentation

**Created**: 2024-01-24
**Purpose**: Review all docs to determine if they're active resources or dead-end artifacts

## Action Required

Go through each folder and for each doc ask:
1. Is this actively used/referenced?
2. Is this an incomplete plan that should become an action item?
3. Is this stale and should be archived?

## Folders to Review

- [ ] `docs/guides/` - Are these guides current and accurate?
- [ ] `docs/specs/` - Are these specs implemented? If yes, move to `implemented/`
- [ ] `docs/plans/` - Are these plans active? Completed? Abandoned?
- [ ] `docs/wip/` - What's the status of each WIP item?

## Outcome

Each doc should end up as:
- **Active resource** → stays in place, linked from README
- **Action item** → converted to GitHub issue or task
- **Completed** → move to `implemented/`
- **Stale/abandoned** → move to `archived/`
