# Page Archive - Version Notes

**Created:** 2025-01-04
**Purpose:** Backup of current pages before consolidation project

---

## Archived Files

| File | Original | Lines | Description |
|------|----------|-------|-------------|
| AccountPage.v1.jsx | AccountPage.jsx | 657 | Company info, broker, policy period, renewal linking |
| ReviewPage.v1.jsx | ReviewPage.jsx | 889 | Document verification, extractions, credibility, decision |
| UWPage.v1.jsx | UWPage.jsx | 1500+ | Risk assessment, controls, loss history, adjustments |
| CompsPage.v1.jsx | CompsPage.jsx | 731 | Full comparable analysis with side-by-side |
| RatingPage.v1.jsx | RatingPage.jsx | 323 | Rating parameters, premium matrix |

---

## Backup Branch

```
backup/pre-consolidation-2025-01-04
```

This branch contains the full codebase state before consolidation.

---

## How to Restore

### Option 1: Full Rollback (entire codebase)
```bash
git checkout backup/pre-consolidation-2025-01-04
```

### Option 2: Restore Single File
```bash
# From archive
cp frontend/src/pages/_archive/CompsPage.v1.jsx frontend/src/pages/CompsPage.jsx

# Or from backup branch
git checkout backup/pre-consolidation-2025-01-04 -- frontend/src/pages/CompsPage.jsx
```

---

## What These Pages Contained

### AccountPage.v1.jsx
- Company Information (applicant_name, website)
- Broker selection with search
- Policy Period (effective/expiration dates)
- Renewal Information (prior policy linking)
- Opportunity/Broker Request notes
- Financial Information (revenue, NAICS)
- Business Summary (read-only)
- Key Points (read-only)
- Submission metadata

### ReviewPage.v1.jsx
- Credibility Score card
- Conflicts list with resolve actions
- Document viewer with PDF highlighting
- Extraction panel with source verification
- Underwriting Decision (accept/refer/decline)
- AI Recommendation display
- Guideline Citations
- Quick Facts summary

### UWPage.v1.jsx
- Business Summary (editable)
- Underwriting Notes (editable)
- Security Controls Panel
- Financial Metrics Panel
- Incumbent Carrier Panel
- Comparable Submissions Panel (simplified)
- Loss History with claims
- Underwriting Adjustments (hazard, controls)

### CompsPage.v1.jsx
- Advanced filters (layer, date, revenue, industry, similarity)
- Metrics summary (count, avg RPM, rate range)
- Sortable comparables table
- Side-by-side Detail Comparison
- Attachment range filtering for excess

### RatingPage.v1.jsx
- Rating Parameters (retention, hazard, control adj, retro)
- Premium by Limit grid with Create Quote
- Rating Factors display

---

## Notes

- These archives are from `main` branch as of 2025-01-04
- Feature branches may have additional changes not in these archives
- The backup branch is the definitive rollback point
