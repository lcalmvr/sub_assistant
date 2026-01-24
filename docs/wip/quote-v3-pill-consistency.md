# QuotePageV3 Pill Consistency (Endorsements + Subjectivities)

Goal
- Use the same x/y pill style across Endorsements + Subjectivities in both submission and quote modes.
- Show the pill on the quote screen (collapsed view) for both cards.

Current Behavior
- Endorsements pills are implemented locally and differ by mode:
  - Quote mode (expanded): custom “Only here / +N” pill in `frontend/src/components/quote/summary/EndorsementsCard.jsx`.
  - Submission mode (collapsed): gray “x options” pill in `frontend/src/components/quote/summary/EndorsementsCard.jsx`.
- Subjectivities submission mode (collapsed) uses x/y pills with hover preview in `frontend/src/components/quote/summary/SubjectivitiesCard.jsx`.
- Quote mode (collapsed) shows no x/y pill for either card (see image #3).

Target Behavior
- Always show x/y pill (linkedCount/totalCount) for Endorsements and Subjectivities, in both submission and quote modes.
- Keep “On peers” badge for missing items if desired; use x/y for aligned/unique rows.

Change List (implementation guidance)
1) Add x/y pill to quote‑mode collapsed views
- `frontend/src/components/quote/summary/EndorsementsCard.jsx`
  - In `QuoteModeCollapsedContent`, compute:
    - `linkedCount = item.quoteIds?.length || 0`
    - `totalCount = allOptions.length`
  - Render pill with the same styles as Subjectivities submission mode (x/y).
- `frontend/src/components/quote/summary/SubjectivitiesCard.jsx`
  - In `QuoteModeCollapsedContent`, add x/y pill for `uniqueSubjectivities` and `alignedSubjectivities` rows using the same formula above.

2) Normalize endorsements submission‑mode collapsed pill
- `frontend/src/components/quote/summary/EndorsementsCard.jsx`
  - In the collapsed branch of `SubmissionModeContent`, replace the current gray “x options” badge with the x/y pill styling used by Subjectivities.

3) Optional: extract a shared pill component
- Create a tiny shared component (example: `frontend/src/components/quote/summary/QuoteOptionCountPill.jsx`) that accepts:
  - `linkedQuoteIds`, `allOptions`, `size` (optional), `showHoverPreview` (optional)
- Use it in both Endorsements and Subjectivities for submission and quote modes.

Notes
- Do not use `getSharedQuoteCount` or `getEndorsementSharedQuoteCount` for this change; those return “other quotes” counts, not x/y.
- Keep hover preview consistent with current Subjectivities behavior if desired; otherwise, use a simple pill only.
