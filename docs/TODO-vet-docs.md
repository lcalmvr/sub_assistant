# TODO: Vet Documentation

**Created**: 2024-01-24
**Updated**: 2024-01-24
**Purpose**: Review all docs to determine if they're active resources or dead-end artifacts

## Summary

71 total markdown files in docs/. Priority review needed for `plans/` (10 files) and `wip/` (17 files).

## Action Required

Go through each folder and for each doc ask:
1. Is this actively used/referenced?
2. Is this an incomplete plan that should become an action item?
3. Is this stale and should be archived?

## Folders to Review

### Priority (likely has stale content)

- [ ] `docs/plans/` (10 files) - Are these plans active? Completed? Abandoned?
- [ ] `docs/wip/` (17 files) - What's the status of each WIP item?

### Lower Priority (likely stable)

- [ ] `docs/guides/` (6 files) - Are these guides current and accurate?
- [ ] `docs/specs/` (10 files) - Are these specs implemented? If yes, move to `implemented/`
- [ ] `docs/reference/tech/` (8 files) - Are these still accurate?

### Already Triaged

- `docs/archived/` (4 files) - Already archived
- `docs/implemented/` (6 files) - Already marked complete

## Notes from Quick Scan

**plans/ candidates for `implemented/`:**
- `quote-page-redesign.md` - V3 is live
- `PLAN_midterm_endorsement_redesign.md` - Mostly complete per IMPL_STATUS

**plans/ candidates for `archived/`:**
- `page-consolidation-project.md` - Streamlit-focused

**wip/ candidates to move:**
- `IMPLEMENTATION_STATUS.md` - Useful tracker, move to docs/ root
- `supabase-*.md` - Setup guides, move to `guides/`
- `page-*.md` - Streamlit analysis, archive

**wip/ needs status check:**
- `quote-v3-*.md` - May be done
- `quotepagev3-refactor-plan.md` - May be done
- `batch-edit-rollback.md` - May be done

## Outcome

Each doc should end up as:
- **Active resource** → stays in place, linked from README
- **Action item** → converted to GitHub issue or task
- **Completed** → move to `implemented/`
- **Stale/abandoned** → move to `archived/`
