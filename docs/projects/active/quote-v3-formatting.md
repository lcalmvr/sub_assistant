# QuotePageV3 Card Formatting Review

Goal
- Make card shells visually consistent across Quote and Submission modes.
- Reduce per-card styling divergence by using shared card shell/header/body styles.

Findings (current code)
- Card background mismatch between KPI cards and detail cards.
  - KPI cards: `TermsCardContent.jsx`, `RetroCardContent.jsx`, `CommissionCardContent.jsx` use `bg-white` on the root wrapper.
  - Detail cards: `CoveragesCardContent.jsx`, `EndorsementsCard.jsx`, `SubjectivitiesCard.jsx` do not set `bg-white` on the root wrapper, so the body inherits the page background.
  - Effect: detail card bodies render slightly gray compared to KPI cards.

- Premium card uses a different shell style than the other KPI cards.
  - `SummaryTabContent.jsx` renders the premium card with `bg-gray-50` and no shared shell.
  - Effect: the premium card reads as a different component from the other KPI cards.

- Header row presentation differs by mode and by card type.
  - KPI cards (Terms/Retro/Commission) only show the gray header bar in submission mode; quote mode uses a centered label with different padding (`px-3 py-2`).
  - Detail cards always show a gray header bar with `px-4 py-2`.
  - `CoveragesCardContent.jsx` header swaps the title for filter buttons, which visually changes header height and typography relative to other cards.

- Body padding and spacing are inconsistent.
  - KPI cards (submission collapsed) use `px-4 py-3`.
  - Detail cards use `p-4`.
  - Premium card uses `px-4 py-3` but is a different background.

Recommendations (short-term fixes)
- Standardize root card backgrounds by adding `bg-white` to detail card wrappers.
  - Target files: `CoveragesCardContent.jsx`, `EndorsementsCard.jsx`, `SubjectivitiesCard.jsx`.

- Normalize header row styles across all cards.
  - Adopt a single header class set for all cards: `bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between`.
  - For Coverages, wrap the filter buttons in a container that keeps the same text size/leading as other headers (ex: add `leading-none` or set `min-h` on the header row).

- Bring the premium card into the same visual system as the KPI cards.
  - Change `SummaryTabContent.jsx` premium card shell to match the KPI card wrapper and apply a consistent header/body style.

Recommendations (shared component approach)
- Introduce a shared card shell to prevent divergence.
  - Example file: `frontend/src/components/quote/summary/SummaryCardShell.jsx` (or a style helper in `summaryStyles.js`).
  - Responsibilities:
    - Root: `bg-white border border-gray-200 rounded-lg overflow-hidden`.
    - Header slot: consistent padding, typography, and divider.
    - Body slot: consistent padding and background.

- Migrate all cards to the shared shell in this order:
  1) Coverages, Endorsements, Subjectivities (visible inconsistencies)
  2) Premium card (SummaryTabContent)
  3) Terms/Retro/Commission (unify quote/submission header behavior)

Open decision
- Do we want a header row in quote mode for KPI cards, or do we keep the centered label layout and accept that KPI cards are visually distinct from the detail cards? The shared shell can support both, but the choice should be consistent across all KPI cards.
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

---

# KPI Card Content Consistency (Quote vs Submission)

Issue
- Top KPI cards (Policy Term, Retro, Commission) present content differently between quote mode and submission mode.
- Submission mode layout is more structured (header + rows + right‑aligned pills) and is perceived as nicer.
- Quote mode layout uses a centered label + single line summary, so the visual language diverges across modes.

Files involved
- `frontend/src/components/quote/summary/TermsCardContent.jsx`
- `frontend/src/components/quote/summary/RetroCardContent.jsx`
- `frontend/src/components/quote/summary/CommissionCardContent.jsx`

Recommendation
- Align quote‑mode collapsed content with the submission‑mode collapsed layout.
  - Keep the same header bar and row structure.
  - For single‑quote context, show a single row with the value and an optional x/y pill (typically 1/1).
  - If showing the pill feels noisy in quote mode, hide the pill when `totalCount === 1` but keep row alignment.
- This is a presentation‑only change; no state or calculations need to move.

Expected result
- The top cards look consistent across quote and submission modes, with uniform header, typography, and row alignment.

---

# Keyboard Behavior Standardization (Tower, Coverages, Endorsements, Subjectivities)

Question
- Keystroke behavior (Arrow keys, Enter, Escape, Tab/Shift‑Tab) appears to be implemented separately across components. Can this be standardized?

Current state (separate logic)
- `frontend/src/components/quote/summary/SubjectivitiesCard.jsx` (Enter, Escape, ArrowUp/Down, Tab/Shift‑Tab)
- `frontend/src/components/quote/summary/EndorsementsCard.jsx` (Enter, Escape, ArrowUp/Down, Tab/Shift‑Tab)
- `frontend/src/components/quote/TowerEditor.jsx` (ArrowLeft/Right/Up/Down, Enter, Escape, Tab)
- `frontend/src/components/quote/ExcessCoverageCompact.jsx` (ArrowLeft/Right/Up/Down, Escape)
- `frontend/src/components/quote/summary/SummaryTabContent.jsx` (global Escape + click‑outside close)

Recommendation
- Standardize via two shared utilities/hooks:
  1) List editor navigation (`Subjectivities`, `Endorsements`)
     - Shared hook: `useListKeyboardNav({ onCommit, onCancel, onMoveUp, onMoveDown, onNext, onPrev })`.
     - Centralize logic for Enter/Tab/Shift‑Tab/ArrowUp/ArrowDown/Escape.
  2) Grid editor navigation (`TowerEditor`, `ExcessCoverageCompact`)
     - Shared hook: `useGridKeyboardNav({ rows, cols, onCommit, onCancel, onMove })`.
     - Centralize ArrowLeft/Right/Up/Down + Enter behavior.

Notes
- Keep the existing UX behavior the same; the goal is consistency and maintainability, not a UX change.
- If desired, document the expected behavior in a short spec (one table) and implement from there.

---

# Numeric Input Enhancement (K/M/B Suffix + Auto‑Scale)

Goal
- Allow number fields to accept suffixes (k/m/b) and optionally auto‑scale small numbers for large‑money fields.

Proposed rules
- Explicit suffix always wins:
  - `12k` → 12,000
  - `1.2m` → 1,200,000
  - `0.75b` → 750,000,000
- No suffix (optional auto‑scale rule for large‑money fields only):
  - `1–99` → millions
  - `100–999` → thousands
  - `>=1000` → literal (no scaling)

UX safety
- Show a helper hint near the field (or tooltip) if auto‑scale is enabled.
- On blur, normalize display to the expanded number with commas so the user sees the conversion immediately.
- Consider feature‑flagging per field to avoid accidental scaling in small‑value inputs.

Notes
- This is a behavior change; do not apply globally until a list of target fields is agreed.

---

# Click‑to‑Edit Consistency (Subjectivities / Endorsements)

Issue
- Most cards enter edit mode by clicking empty card space.
- Subjectivities does not; you must click Edit or a row.
- Endorsements has little empty space but also lacks a card‑level click handler.

Cause
- Click‑to‑expand behavior is not standardized.
  - KPI cards (Terms/Retro/Commission/Coverages) use card‑level `onClick` to expand.
  - Subjectivities/Endorsements use `useCardExpand` but only toggle from the Edit button.

Recommendation
- Standardize click‑to‑expand for all cards:
  - Add a card‑level `onClick` that triggers `toggle()` when not expanded, while ignoring clicks on interactive elements.
  - Alternatively, extend `useCardExpand` to return a `getContainerProps()` helper with a safe click handler.
- Apply to:
  - `frontend/src/components/quote/summary/SubjectivitiesCard.jsx`
  - `frontend/src/components/quote/summary/EndorsementsCard.jsx`

Notes
- Ensure buttons/inputs stop propagation to avoid accidental expand.

---

# useCardExpand Consolidation (Preserve Behavior)

Question
- If we migrate KPI cards to `useCardExpand` and remove the global click‑outside handler in `SummaryTabContent`, do we preserve behavior?

Constraints to preserve
- Coverages: click‑outside triggers `excessCoverageSaveRef.current()` (save‑then‑close). Escape just closes without save. Also must reset `cachedIsExcess` on close.
- Tower: `TowerEditor` already has its own click‑outside/Escape save logic; avoid double handlers or unintended saves.

Recommendation
- Extend `useEditMode`/`useCardExpand` to support distinct handlers:
  - `onClickOutside` (save‑then‑close for Coverages)
  - `onEscape` (close without save)
  - `onBeforeClose` for cleanup (`cachedIsExcess` reset)
- Migrate KPI cards to the hook, then remove the global click‑outside handler in `frontend/src/components/quote/summary/SummaryTabContent.jsx`.

Outcome
- Standardized expand/close behavior across all cards without losing Coverages save semantics or TowerEditor behavior.

---

# De‑dup Scope Note (Behavior‑Preserving Only)

Constraint
- Any de‑duplication within Policy Term, Retro, Commission, Endorsements, and Subjectivities should be behavior‑preserving. UI/UX should remain the same unless explicitly approved.

Guidance
- Shared helpers/components should mirror current layout, copy, and interactions.
- If a shared component introduces visual changes, treat that as a separate design decision and do not bundle with refactor work.

---

# Duplication Audit (QuotePageV3 Cards)

Scope
- Cards reviewed: Policy Term, Retro, Commission, Endorsements, Subjectivities.
- Goal: identify repeated logic/UI inside each card that can be shared without changing behavior.

Policy Term (`frontend/src/components/quote/summary/TermsCardContent.jsx`)
- Repeated Applies‑To UI/logic in:
  - `DisplayTermRow` popover
  - `AppliesToPopoverInline` (edit mode)
  - `AddNewTermSection` checkbox list
- Repeated “apply to all / apply to single” loops across the three sections.
- Recommendation: extract a shared `applyTermToQuotes({ datesTbd, eff, exp, quoteIds })` helper and a single `AppliesToPicker` component used by display/edit/add.

Retro (`frontend/src/components/quote/summary/RetroCardContent.jsx`)
- Same Applies‑To duplication as Terms in `DisplayRetroRow`, `AppliesToPopoverInline`, and `AddNewRetroSection`.
- Repeated “apply schedule to quotes” loops in edit and add flows.
- Recommendation: shared `applyRetroToQuotes({ schedule, quoteIds })` helper and shared Applies‑To picker.

Commission (`frontend/src/components/quote/summary/CommissionCardContent.jsx`)
- Applies‑To popover duplicated in `DisplayCommissionRow` and `AppliesToPopoverInline`, plus separate list in `AddNewCommissionSection`.
- Repeated “apply commission rate to quotes” loops in edit and add flows.
- Recommendation: shared `applyCommissionToQuotes({ rate, quoteIds })` helper and shared Applies‑To picker.

Endorsements (`frontend/src/components/quote/summary/EndorsementsCard.jsx`)
- Manuscript edit row logic is duplicated across submission and quote paths (input handlers + save/cancel).
- “Missing from peers” block appears in both collapsed and expanded quote views with the same layout.
- Quote‑mode applies‑to popover is custom, while submission uses `AppliesToPopover` (two systems).
- Recommendation: extract `EditableEndorsementRow`, `MissingFromPeersList`, and unify applies‑to via the shared component.

Subjectivities (`frontend/src/components/quote/summary/SubjectivitiesCard.jsx`)
- Add‑new row + library picker block duplicated twice (submission expanded + quote expanded).
- “Missing from peers” block duplicated (collapsed and expanded quote views).
- Quote‑mode applies‑to popover is custom; submission uses shared `AppliesToPopover` (two systems).
- Recommendation: extract `SubjectivityAddActions`, `MissingFromPeersList`, and unify applies‑to via shared component.

Note
- All recommendations are intended to be behavior‑preserving; do not change UX unless explicitly requested.

---

# Suggested Priority Order

1) Visual consistency fixes (card shells, KPI content alignment, x/y pills)
2) Click‑to‑edit behavior alignment
3) Keyboard behavior standardization (list/grid hooks)
4) Duplication clean‑up inside cards (behavior‑preserving)
5) Numeric input enhancement (spec + field selection)
6) Optional: useCardExpand consolidation after stabilizing the above

---

# NEW: Visual Adjustments After Latest Pass

Context
- These are new follow‑ups after the latest round of formatting changes. Please treat as the current instructions.

Issues observed
- KPI header styling in quote mode feels too bold/heavy compared to submission.
- Header row height mismatch: Coverages header is taller than Endorsements/Subjectivities (or vice‑versa).
- Notes card body reads as “all gray” and inconsistent with other cards.
- Premium card still uses a gray fill and looks like a different component.

Recommended adjustments (behavior‑preserving)
1) Soften KPI header typography
- Files: `frontend/src/components/quote/summary/TermsCardContent.jsx`, `frontend/src/components/quote/summary/RetroCardContent.jsx`, `frontend/src/components/quote/summary/CommissionCardContent.jsx`
- Suggested header class: `text-xs font-medium text-gray-400 uppercase tracking-wide` (avoid `font-bold` + darker gray).

2) Normalize header height across detail cards
- Files: `frontend/src/components/quote/summary/CoveragesCardContent.jsx`, `frontend/src/components/quote/summary/EndorsementsCard.jsx`, `frontend/src/components/quote/summary/SubjectivitiesCard.jsx`
- Standardize header padding and height (ex: `px-4 py-2 min-h-[36px] flex items-center`), so all three align.

3) Bring Notes card into shared card shell
- File: `frontend/src/components/quote/summary/NotesCard.jsx`
- Use the same header/body styling as other cards (white body, gray header bar).

4) Align Premium card with KPI card shell
- File: `frontend/src/components/quote/summary/SummaryTabContent.jsx`
- Replace gray fill with the standard card shell + header style used by KPI cards.

Note
- These are visual consistency tweaks only. No functional behavior changes required.

---

# NEW: Retro Card Quote‑Mode Formatting Preference

Observation
- Quote‑mode Retro card (image #1) reads heavier and more overwhelming than the submission view (image #2), even though it shows less information.

Requested change
- Make quote‑mode Retro collapsed content match the submission‑mode layout (multi‑row with lighter typographic hierarchy).
- Keep the same information, just adopt the submission presentation style for consistency and readability.

File
- `frontend/src/components/quote/summary/RetroCardContent.jsx`

Note
- This is a presentation change only; behavior should remain unchanged.

---

# NEW: Hard Spec for Header Height Consistency

Problem
- Headers still render at different heights because `min-h` allows expansion from line-height, padding, or wrapped controls.

Spec (use exactly)
- Header container: `h-9 px-4 flex items-center justify-between bg-gray-50 border-b border-gray-200` (no `py-*`).
- Header text/buttons: add `leading-none` to prevent extra vertical height.
- Coverages filter container: add `whitespace-nowrap` to avoid wrapping.

Verification
- Use DevTools to confirm identical `clientHeight` for all card headers (target 36px with `h-9`).

Files
- `frontend/src/components/quote/summary/TermsCardContent.jsx`
- `frontend/src/components/quote/summary/RetroCardContent.jsx`
- `frontend/src/components/quote/summary/CommissionCardContent.jsx`
- `frontend/src/components/quote/summary/CoveragesCardContent.jsx`
- `frontend/src/components/quote/summary/EndorsementsCard.jsx`
- `frontend/src/components/quote/summary/SubjectivitiesCard.jsx`
- `frontend/src/components/quote/summary/NotesCard.jsx`
- Premium card header in `frontend/src/components/quote/summary/SummaryTabContent.jsx`
