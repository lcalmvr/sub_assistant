# Premium/Term Model Implementation Plan (QuotePageV3)

Purpose
- Support annual vs actual premium, premium basis (annual/pro‑rata/minimum/flat), and per‑layer term overrides.
- Preserve annual for renewals, reporting, and rate change regardless of short‑term bind.
- Integrate into the refactored QuotePageV3 stack.

Assumptions from product
- Flat premium has no fixed rule; UW can set any actual premium regardless of pro‑rata.
- Renewals must surface prior annual premiums (from the bound term) for rate/rate change and reporting.
- UI must be low‑clutter; final display should be validated with mockups.

Phase 0 — Decisions + UX framing (1 week)
Deliverables
- Decide how to persist prior‑year annual premiums for renewals.
- Decide UI strategy (toggle vs inline display) using 2–3 mockups.

Open decisions to resolve
1) Prior‑year storage:
   - Option A (recommended): store bound annual premiums on the bound policy/tower snapshot and pull into renewal submissions.
   - Option B: add explicit `prior_annual_premium` fields on renewal submissions (per layer).
   - Option C: compute from policy history each time (risk: coupling + slower).
2) UI pattern:
   - Option A: toggle view (Annual / Actual) at tower level.
   - Option B: show annual with subtle “Term: actual” line for short‑term layers.
   - Option C: compact summary + drill‑down popover.

Phase 1 — Data model + compatibility layer (1–2 weeks)
Deliverables
- `premiumUtils.js` in main with normalize/serialize + calculations (annual/actual/basis + term inheritance).
- DB backfill migration (optional) to add annual/actual/basis on existing layers.

Tasks
- Add layer fields to tower_json:
  - `annual_premium`, `actual_premium`, `premium_basis`, `term_start`, `term_end`.
- Ensure read compatibility:
  - Default annual/actual to legacy `premium` if missing.
- Ensure write compatibility:
  - Always write legacy `premium` = `actual_premium`.
- Optional: backfill script to populate existing data.

Phase 2 — Backend + API normalization (1–2 weeks)
Deliverables
- API responses normalized to include annual/actual/basis/term fields.
- Bound policy snapshot includes the new premium model.

Tasks
- Add normalization in API response layer for tower_json (if not already). 
- Ensure bind flows persist annual/actual/basis/term for reporting and renewals.
- Add a resolver to pull prior annual premiums into renewal submissions.

Phase 3 — UI integration (tower editor + summary) (2–3 weeks)
Deliverables
- Tower editor supports annual input, short‑term pro‑rata, minimum override, flat premium.
- Per‑layer term editor available for non‑concurrent towers.
- Summary cards display annual vs actual appropriately.

Tasks
- Integrate `LayerPremiumEditor` into `frontend/src/components/quote/TowerEditor.jsx`.
- Integrate `LayerTermEditor` into tower rows (term button or popover).
- Add a tower‑level toggle (Annual / Actual) or inline actual line (based on Phase 0 decision).
- Ensure RPM/ILF calculations use **annual**, not actual.

Phase 4 — Renewal + reporting flows (2–3 weeks)
Deliverables
- Renewals show prior annual premiums from bound term.
- Rate change and reporting use annual‑to‑annual basis.

Tasks
- Add prior annual fields to renewal payload, sourced from bound policy snapshot.
- Implement rate change calculations using annual premiums only.
- Update any reporting logic/exports to reference annual premiums.

Phase 5 — QA + rollout (1–2 weeks)
Deliverables
- Test matrix for all basis types (annual/pro‑rata/minimum/flat).
- Non‑concurrent tower scenarios validated (mixed layer terms).
- Migration and backward‑compat checks.

QA scenarios
- Short‑term excess (layer term override) with pro‑rata actual.
- Minimum premium override (actual > pro‑rata).
- Flat premium (actual can be below or above pro‑rata).
- Renewal referencing prior annual premium from bound policy.

Risks
- Data drift if annual/actual are not kept in sync during edits.
- UI overload if annual + actual + basis + term are all displayed at once.
- Legacy code still reading `premium` must continue to work (keep it in sync).

Success criteria
- Annual premium preserved for renewals and reporting.
- Actual premium reflects UW‑chosen basis for the bound term.
- Non‑concurrent term layers supported without breaking tower math.
- UI remains usable and non‑overwhelming.

---

# Mockup Brief (UI Exploration)

Goal
- Determine the least‑cluttered UI for showing annual vs actual premium, premium basis, and per‑layer term overrides.

Deliverables
- 2–3 low‑fidelity mockups (desktop) for the tower table and summary area.
- Each mockup annotated with where the user edits annual, overrides actual (min/flat), and sets custom term.

Mockup options to explore
1) Toggle View (Annual / Actual)
- Tower header toggle switches displayed premium column.
- When in Actual view, show a subtle term badge (e.g., "61d") on layers with custom term.
- Basis displayed only on hover or in popover.

2) Inline Actual Line
- Always show Annual in table.
- If short‑term or override, show a smaller second line: "Term: $X".
- Basis shown in a small badge (e.g., "min" or "flat") next to term line.

3) Compact Badge + Popover
- Premium column shows annual only.
- Small badge (e.g., “adjusted”) opens popover with actual, basis, term, and override controls.

Key interactions to show
- Annual input (main field)
- Minimum/flat override input
- Per‑layer term date override (popover)
- Visual indicator for non‑concurrent layers

Constraints
- Avoid adding more than one extra line per row.
- Keep RPM/ILF displayed off annual, not actual.
- Must be readable at typical tower widths.

---

# Engineering Guardrails (Post‑Refactor)

Context
- QuotePageV3 has been heavily refactored. Summary logic now lives in `frontend/src/components/quote/summary/`, with shared hooks/components (e.g., `AppliesToPopover`, `useCardExpand`).
- The premium‑term prototype branch was built pre‑refactor; all integration must target the current component structure.

Guardrails
- Prefer shared components/hooks over one‑off implementations.
  - Use existing shared UI patterns (card shells, pills, applies‑to popovers).
  - Avoid duplicating behavior in new local components.
- If a new UI pattern is required, implement it once and reuse it across cards.
- Preserve existing behaviors unless explicitly approved (no regressions in edit flows, click‑outside, keyboard handling).
- Keep `premium` legacy field in sync with `actual_premium` for backward compatibility.

Testing
- Re‑run the QuotePageV3 smoke checklist after integration to confirm no regressions.

---

# Phase 1 Implementation Checklist (Current Stack)

Goal
- Wire the premium/term model into the refactored QuotePageV3 UI with no regressions.

Checklist
1) TowerEditor integration
- File: `frontend/src/components/quote/TowerEditor.jsx`
- Use `normalizeTower()` on load, `serializeTower()` on save.
- Replace current premium input with new `LayerPremiumInput` (from reference).
- Add per‑layer term control (use `LayerTermEditor` behavior) and resolve effective term via `getEffectiveTerm()`.
- Ensure RPM/ILF calculations use annual premiums (`getAnnualPremium()` / `calculateNormalizedILF()`).

2) Summary display alignment
- File: `frontend/src/components/quote/summary/SummaryTabContent.jsx`
- Decide view mode (annual vs actual) and use `getDisplayPremium()`.
- Add term/adjustment footnote using `getPremiumFootnote()` where appropriate.

3) Data flow + persistence
- Ensure `premium` legacy field remains synced on write (`serializeTower`).
- Verify tower_json saved from the editor includes annual/actual/basis/term fields.

4) QA targets
- Short‑term layer: annual ≠ actual (pro‑rata)
- Minimum override: actual > pro‑rata
- Flat: actual can be any value (manual)
- Non‑concurrent layer term (term_start/term_end)

Note
- Use existing shared card/interaction patterns from the refactor; no one‑off UI.

---

# Phase 2 UI Review Notes (From Screens)

UX feedback
- Term UI is readable but visually noisy because *every* row shows "47d" and "47d term".
- Amber styling reads like a warning; use it only for exceptions.

Suggested simplifications (behavior‑preserving)
- Show per‑row term badge only when the term is **custom or non‑inherited**.
- If all layers share the same inherited term, show a single column‑header badge (e.g., "Term: 47d (inherited)") and leave rows blank.
- Only show the secondary "Term: $X" line when actual ≠ annual.
- Use gray for inherited, blue for custom; reserve amber for minimum/flat or exceptional states.

Bug observed
- Clicking into the date input closes the popover and does not save changes.

Likely cause
- TowerEditor’s click‑outside handler fires because Radix popovers render in a portal outside the table ref.

Likely fix
- In `frontend/src/components/quote/TowerEditor.jsx`, ignore clicks inside Radix popovers:
  - `if (e.target.closest('[data-radix-popper-content-wrapper]')) return;`
- Or remove `Popover.Portal` so the popover stays within the table DOM.

---

# Phase 2 Follow‑up (New Screens)

UX / behavior changes requested
1) Hide Term column when there is no variance
- If all layers share the inherited term, do not show the Term column at all (like Quota Share behavior).
- Only show the Term column when at least one layer has a custom term or non‑concurrent terms exist.

2) Term edit affordance
- The tiny dash is too precise; the term cell should be an obvious, clickable control in edit mode.
- Proposal: show “Inherited” (muted) or “Set term…” text as the click target.

3) Basis visibility + auto‑proration
- When a term is set, auto‑calculate pro‑rata actual and show a clear basis indicator (“Pro‑rata”, “Minimum”, “Flat”).
- No hidden state; the UI must make it obvious whether values are annual vs actual.
- Consider a shared helper with the policy mid‑term endorsement UI (if applicable).

4) Keep row heights stable
- Adding “15d” under premium increases row height; this should not happen.
- Always reserve space for a secondary line or keep secondary info in a fixed‑height badge to prevent layout shifts.

5) Remove quick presets
- Quick presets in the term popover are likely unnecessary; remove unless there is strong usage evidence.

6) Policy term display
- Changing a layer term does **not** update the policy term card; ensure the UI explains this (term is layer‑specific).

Bug: Done button closes then reopens
- Likely event bubbling: container has `onClick` to expand and the Done button does not stop propagation.
- Fix: add `e.stopPropagation()` on Done, or guard container `onClick` to ignore clicks when closing.

Implementation note
- If Term column show/hide is modeled after Quota Share, it can be shared via a small helper (e.g., `useOptionalColumn`) rather than duplicating logic.

---

# Phase 2 Technical Guidance (Root Causes + Fixes)

Root causes from code review
1) Term column always visible
- Current logic: `showTermColumn = anyLayerHasCustomTerm || layers.length > 1`.
- This makes the Term column show even when all terms are inherited.

2) Term edit affordance too subtle
- Term cell renders a small "Inherited" button; too precise and noisy.

3) Date entry not persisting
- Term inputs are `<input type="date">` with direct writes to layer state; no draft/apply step.
- Typed values may not trigger `onChange` unless in ISO format, so “Done” appears to do nothing.

4) Done button bounce
- TowerEditor uses a document `mousedown` handler on `tableRef` (table only). Clicking the header Done button is "outside" the table, so the handler fires and can close/reopen.

5) Basis UI unclear / not functional
- Inline “Pro‑rata: $X” + dropdown is ambiguous and lacks inputs for minimum/flat values.
- Code references `layer.minimum_premium` / `layer.flat_premium` but these fields aren’t set anywhere.

Fixes to implement (precise)
1) Term column visibility
- Replace logic with:
  - `const showTermColumn = showTermToggle || hasNonConcurrentLayers(layers, quote, submission);`
- Default `showTermToggle = false`, auto‑enable if any custom term exists.
- Hide column entirely when no variance; do **not** render “Inherited” rows.

2) Term cell click target
- Make the entire term cell a button with clear label:
  - Custom: "Jan 30 – Feb 6"
  - Inherited: "Set term…" (muted)

3) Draft + apply for term inputs
- Use local draft state inside popover (`draftStart`, `draftEnd`).
- On Done, apply draft values to layer; on Cancel, discard.
- If you keep `<input type="date">`, show expected format or parse typed values.

4) Done bounce fix
- Expand the click‑outside ref to include the header (not just the table), or
- Add `onMouseDown={(e) => e.stopPropagation()}` to the Done button, or
- Remove TowerEditor’s document click‑outside and rely on card‑level close.

5) Basis UI
- Replace inline dropdown with a small badge + popover (like the reference component).
- Add explicit inputs for Minimum and Flat amounts and store them on the layer (`minimum_premium`, `flat_premium`).
- Always show the actual premium line as `Actual: $X (Basis)` so it’s unambiguous.

6) Row height stability
- Reserve space for the secondary line in both edit and read modes (fixed height).

7) Policy term mismatch
- Clarify in UI that layer term overrides do not change the policy term card (header note or badge).

---

# Premium Term Overrides One-Pager (Tower UI)

Goal
- Support short-term layer premiums while preserving annual premiums for rate comparisons.
- Keep the UI stable, unambiguous, and low-friction.

Out of scope (for now)
- Backfill/migration scripts
- Reporting/renewal UI
- Submission-level term UI

UX rules
- Term column visibility: Hidden by default. Only show if any layer has a custom term, or user toggles Term Overrides on.
- Term Overrides toggle: In edit mode beside Quota Share.
  - If any custom term exists: toggle is ON and disabled.
  - If no custom terms: toggle is optional.
- Term cell content:
  - Inherited: show "Set term..." button (no "Inherited" spam).
  - Custom: show date range pill (e.g., "Jan 12 - Feb 6").
  - Full-cell click target.
- Popover behavior:
  - Draft only; apply on Done.
  - Outside click cancels draft.
  - Inputs accept YYYY-MM-DD or MM/DD/YYYY.
  - Inline errors; popover stays open on errors.

Data/behavior rules
- Policy term stays the same; layer term never mutates the policy term display.
- Save term only when custom (if equals policy term, persist as null).
- Premium fields:
  - annual_premium: base annual price.
  - actual_premium: calculated from term + basis.
  - premium_basis: annual | pro_rata | minimum | flat.
- Basis behavior:
  - When a custom term is first set and basis is Annual, default to Pro-rata.
  - After that, never auto-switch basis.
- Term premium display:
  - Edit mode: show "Term $X" + basis dropdown when term differs or basis != annual.
  - Minimum/Flat: show input box for override amount; recalc actual_premium.
  - Row height must not change.

Interaction guardrails
- Done in Tower card must not trigger click-outside and reopen (no bounce).
- Term column must not appear when all layers are inherited and toggle is off.
- No layout jumps when term or basis changes.

Acceptance checklist
- Term column hidden unless custom exists or toggle is on.
- Toggle disabled if any custom term exists.
- Term cell is full-width click target.
- Date input can be typed; Done applies; outside click cancels.
- Policy term display remains unchanged after layer term edits.
- Term line shows "Term $X (Basis)" and is stable height.
- Done closes the card and stays closed.

---

# Ticket Breakdown (Premium Term Overrides)

Ticket 1: Term column visibility + toggle
- Term column hidden by default; toggle beside Quota Share.
- Toggle disabled if any custom term exists.
- Full-width "Set term..." button for inherited rows.

Ticket 2: Term popover draft + validation
- Draft applies only on Done; outside click discards.
- Accepts YYYY-MM-DD/MM/DD/YYYY; inline errors; no close on typing.

Ticket 3: Basis UI + term premium display
- "Term $X (Basis)" shown when term differs or basis != annual.
- Minimum/Flat input visible and recalcs actual_premium.
- Row height stable.

Ticket 4: Basis behavior rules
- Only auto-set to Pro-rata on first custom term if basis was Annual.
- Never auto-switch after that.

Ticket 5: Done bounce + policy term invariant
- Done closes and stays closed.
- Policy term display never changes from layer edits.
