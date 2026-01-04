# Page Overlap Analysis

**Date:** 2025-01-04
**Purpose:** Identify redundant sections and fields across submission workflow pages

---

## 1. PAGE INVENTORY

### AccountPage.jsx (657 lines)
| Section | Fields | Editable |
|---------|--------|----------|
| Company Information | applicant_name, website | Yes |
| Broker | broker_contact, submission_status | Yes/No |
| Policy Period | effective_date, expiration_date | Yes |
| Renewal Information | prior_submission link | Yes |
| Opportunity/Broker Request | opportunity_notes | Yes |
| Financial Information | annual_revenue, naics_primary_title | Yes |
| Business Summary | business_summary | **No (read-only)** |
| Key Points | bullet_point_summary | No |
| Submission Details | id, created_at, naics_code | No |

### ReviewPage.jsx (889 lines)
| Section | Fields | Editable |
|---------|--------|----------|
| Application Credibility | score, dimensions, issues | No |
| Conflicts Requiring Review | conflicts list + resolve | Yes (resolve) |
| Source Verification | documents, extractions | View/Accept |
| Underwriting Decision | decision_tag, decision_reason | Yes |
| AI Recommendation | ai_recommendation | No |
| Guideline Citations | ai_guideline_citations | No |
| Quick Facts | applicant_name, industry, revenue, status | **No (READ-ONLY DUPE)** |

### UWPage.jsx (1500+ lines)
| Section | Fields | Editable |
|---------|--------|----------|
| Business Summary | business_summary | **Yes (EDITABLE DUPE)** |
| Underwriting Notes | underwriting_notes | Yes |
| Security Controls Panel | MFA, SSO, PAM, EDR, compliance, backup | No (from extractions) |
| Financial Metrics Panel | revenue, profit, assets, ratios | No (from extractions) |
| Incumbent Carrier Panel | incumbent, competitors | No (from documents) |
| Comparable Submissions | comp table, benchmarks | No |
| Loss History | claims, incurred, reserves | View + notes |
| Underwriting Adjustments | hazard_override, control_overrides | Yes |

### RatingPage.jsx (323 lines)
| Section | Fields | Editable |
|---------|--------|----------|
| Rating Parameters | retention, hazard_class, control_adj, retro_date | Mixed |
| Premium by Limit | calculated grid | No |
| Rating Factors | revenue, industry, hazard, retention | **No (READ-ONLY DUPE)** |

### CompsPage.jsx (731 lines)
| Section | Fields | Editable |
|---------|--------|----------|
| Filters | layer, months, revenue, industry, sim, controls | Yes |
| Metrics | count, avg_rpm, rate_range | No |
| Current Submission Context | applicant, revenue, industry | **No (READ-ONLY DUPE)** |
| Comparable Accounts Table | full list | View |
| Detail Comparison | side-by-side | View |

### QuotePage.jsx (2400+ lines)
| Section | Fields | Editable |
|---------|--------|----------|
| Quote Options tabs | option selector | Yes |
| Premium Summary | sold_premium, risk_adjusted | Yes |
| Policy Configuration | policy_form, is_renewal, quote_status | Yes |
| Tower Structure | layers, limits, attachments | Yes |
| Policy Dates & Retro | effective, expiration, retro | **Yes (DUPE of Account)** |
| Subjectivities | subjectivity list | Yes |
| Endorsements | endorsement list | Yes |
| Generate Document | document generation | Action |
| All Generated Documents | document list | View |

### PolicyPage.jsx (1800+ lines)
| Section | Fields | Editable |
|---------|--------|----------|
| Policy Summary | insured, policy#, effective, expiration, premium, limit, retention | **No (DUPE from bound quote)** |
| Policy Documents | binder, policy docs | View/Generate |
| Policy Issuance | issue policy action | Action |
| Subjectivities | subjectivity tracking | Yes |
| Midterm Endorsements | endorsement list | Yes |
| Renewal | renewal status | View |

---

## 2. FIELD OVERLAP MATRIX

| Field | Account | Review | UW | Rating | Comps | Quote | Policy |
|-------|---------|--------|-----|--------|-------|-------|--------|
| applicant_name | Edit | Read | — | — | Read | — | Read |
| annual_revenue | Edit | Read | — | Read | Read | — | — |
| naics_primary_title | Edit | Read | — | Read | Read | — | — |
| business_summary | Read | — | **Edit** | — | — | — | — |
| effective_date | Edit | — | — | — | — | **Edit** | Read |
| expiration_date | Edit | — | — | — | — | **Edit** | Read |
| hazard_override | — | — | Edit | Read | — | — | — |
| control_overrides | — | — | Edit | Read | — | — | — |
| retro_date | — | — | — | Edit | — | Edit | — |
| decision_tag | — | Edit | — | — | — | — | — |
| sold_premium | — | — | — | — | — | Edit | Read |
| tower_json | — | — | — | — | — | Edit | Read |

---

## 3. IDENTIFIED DUPLICATION ISSUES

### Critical Duplicates (Same field editable in multiple places)

1. **effective_date / expiration_date**
   - Account: Editable (primary)
   - Quote: Editable (per-quote, can differ)
   - **Issue**: Should quote inherit from Account, or be independent?

2. **retro_date**
   - Rating: Editable
   - Quote: Editable
   - **Issue**: Unclear which is authoritative

### Read-Only Duplicates (Same data displayed multiple times)

1. **"Quick Facts" pattern** - applicant, revenue, industry shown in:
   - Review (Quick Facts card)
   - Rating (Rating Factors card)
   - Comps (Current Submission Context)
   - **Issue**: 3 copies of the same read-only data

2. **Policy Summary in PolicyPage**
   - All fields come from bound quote
   - **Issue**: Essentially a read-only copy of QuotePage data

### Overlap Between Pages

1. **UWPage CompAnalysisPanel vs CompsPage**
   - UW has a simplified comp panel (just added)
   - Comps has full-featured comp analysis
   - **Issue**: Two comp views with different features

2. **Subjectivities**
   - Quote: Full subjectivity management
   - Policy: Subjectivity tracking (status only)
   - **Issue**: Why manage on Quote if Policy is where they're tracked?

3. **Endorsements**
   - Quote: Endorsement linking
   - Policy: Full endorsement management
   - **Issue**: Two different endorsement UIs

---

## 4. RECOMMENDED CONSOLIDATION

### Phase 1: Remove Read-Only Duplicates

| Remove | From | Reason |
|--------|------|--------|
| Quick Facts card | ReviewPage | Already in Account, header shows key info |
| Rating Factors card | RatingPage | Already in Premium Grid headers |
| Current Submission Context | CompsPage | Already in header |

### Phase 2: Clarify Field Ownership

| Field | Primary Edit Location | Other Pages |
|-------|----------------------|-------------|
| effective_date / expiration_date | Account | Quote inherits, read-only elsewhere |
| retro_date | Quote (per-option) | Rating shows but doesn't persist |
| business_summary | UW only | Account shows read-only |
| hazard/controls | UW only | Rating shows read-only |

### Phase 3: Merge Overlapping Sections

1. **CompAnalysisPanel on UWPage → Link to Comps tab**
   - Remove embedded panel
   - Add "View Full Analysis →" link

2. **Policy Summary → Show bound quote directly**
   - Instead of duplicating, embed QuoteOptionDetail in read-only mode

3. **Subjectivities → Policy-centric**
   - Create on Quote (pre-bind)
   - Track on Policy (post-bind)
   - Remove duplication

---

## 5. LINE COUNT COMPARISON

| Page | Lines | Complexity |
|------|-------|------------|
| QuotePage | 2400+ | Very High |
| PolicyPage | 1800+ | High |
| UWPage | 1500+ | High |
| ReviewPage | 889 | Medium |
| CompsPage | 731 | Medium |
| AccountPage | 657 | Low |
| RatingPage | 323 | Low |

**Observation**: QuotePage and PolicyPage are massive. Much of PolicyPage is duplicate of QuotePage functionality for bound policies.

---

## 6. QUICK WINS

1. **Remove 3 "Quick Facts" duplicates** - saves ~100 lines
2. **Remove Rating Factors card** - saves ~30 lines
3. **Make effective/expiration read-only on Quote** - inherit from Account
4. **Link to Comps instead of embedding panel** - saves ~150 lines

---

## Next Steps

- [ ] Discuss with team which consolidations make sense
- [ ] Prioritize based on user confusion vs developer overhead
- [ ] Consider "single source of truth" principle for each field
