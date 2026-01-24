## QuotePageV3 Smoke Checklist

Use this list before/after formatting or feature work to catch regressions.

### Navigation & Selection
- Load `quote-v3`; initial option selected; switching options updates summary.
- Toggle summary scope (Quote vs Submission) updates KPI row + table.

### Expected Screenshots
- Quote mode: KPI row + Coverages/Endorsements/Subjectivities grid.
- Submission mode: Quote Options table + KPI row.
- Subjectivities: add row open + library picker open.
- Endorsements: add row open + library picker open.
- Coverages: primary preview + excess preview (filters visible).

### KPI Cards (Quote mode)
- Terms: open/close, edit dates/TBD, Done saves, click-outside closes.
- Retro: open/close, edit schedule, Done saves, Apply to peers works.
- Commission: open/close, edit rate, Apply to peers works.
- Coverages: open/close, primary vs excess filters, edit/save works.

### KPI Cards (Submission mode)
- Terms/Retro/Commission show grouped counts and hover popovers.
- Edit a grouped row; apply to individual quote; Done closes.

### Subjectivities
- Add custom: Enter and Add both create + clear input + exit add mode.
- Library: open, search, select item closes picker + clears search.
- Applies To popover: toggle options, bulk apply, remove from all.
- Edit text (manuscript), status cycle, click-outside saves.

### Endorsements
- Add custom (manuscript): Enter/Add creates + clears input + exits.
- Library: open, search, select item closes picker + clears search.
- Applies To popover: toggle options, bulk apply, remove from all.
- Edit text (manuscript), click-outside saves.

### Coverages
- Primary: Exceptions vs All view, edit/save.
- Excess: Drop-Down/All/Non-Follow filter, edit/save, click-outside save.

### Tower + Notes
- Tower card expand/collapse, edit actions still work.
- Notes: edit/save, persists across refresh.

### Submission Table
- Quote options table renders, premium inline edit works, Escape cancels.

### Document History
- List renders, View link opens.
