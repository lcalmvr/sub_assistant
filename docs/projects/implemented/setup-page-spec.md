# Setup Page Specification

**Purpose:** Verify AI-extracted submission data before underwriting analysis

**Design Principle:** This page is about verification, not data entry. AI extracts data from documents; humans review and confirm.

---

## Flow

```
Documents uploaded → AI extracts data → SetupPage for verification → AnalyzePage for underwriting
```

1. **Documents arrive** (via email, broker portal, or manual upload)
2. **AI processes documents** - extracts company info, revenue, dates, answers
3. **UW opens Setup page** to verify:
   - Is this the right company?
   - Did AI extract the correct revenue?
   - Is the broker linked correctly?
   - Are there any data conflicts?
4. **UW checks off verified items** (Human-in-the-Loop checklist)
5. **UW proceeds to Analyze** once data is confirmed

---

## Page Sections

### 1. HITL Verification Checklist
**What it is:** A checklist of items the UW must confirm before proceeding.

**Items to verify:**
- [ ] Company identity confirmed (AI analyzed the correct company)
- [ ] Revenue verified (extracted amount matches source documents)
- [ ] Broker confirmed (correct broker contact linked)
- [ ] Policy period confirmed (dates are accurate)
- [ ] Industry classification verified (NAICS/description is accurate)

**Behavior:**
- Shows what AI extracted for each field
- UW clicks to confirm or clicks to correct
- All items must be checked before Analyze page shows "ready" state
- Corrections flow back to submission record

### 2. Application Credibility Score
**What it is:** A flag about the quality/sophistication of the application itself.

**This is NOT about data accuracy.** It's about:
- Is the applicant sophisticated? (complete answers, consistent information)
- Are there red flags? (e.g., says "no PHI" but is a healthcare provider)
- Are backup question answers consistent with main answers?
- How complete is the application?

**Display:**
- Score with label (High/Medium/Low credibility)
- Dimension breakdown (completeness, consistency, sophistication)
- Issue flags if any (clickable to see details)

**Used for:** Informs underwriting judgment, not blocking verification

### 3. Conflicts Requiring Resolution
**What it is:** Data mismatches that AI detected and cannot auto-resolve.

**Examples:**
- Revenue on application says $5M, loss run says $8M
- Effective date on submission email differs from application
- Company name variations across documents

**Behavior:**
- Show each conflict with source references
- UW can approve (accept AI's choice), override, or defer
- High-priority conflicts flagged prominently

### 4. Document Verification
**What it is:** Side-by-side PDF viewer and extraction panel.

**Features:**
- View uploaded documents
- See what AI extracted from each
- Click extraction → highlights source in PDF
- Accept/correct extracted values
- Upload additional documents

---

## What's NOT on This Page

These belong elsewhere:

| Item | Where it belongs | Why |
|------|-----------------|-----|
| Revenue/Industry entry | Analyze page (Quick Metrics) | Rating inputs, not verification |
| Business Summary editing | Analyze page | UW analysis, not data verification |
| Opportunity Notes | Pre-screen voting card | Broker request context for triage |
| Submission Status | Header badge | Global context, not a form field |
| Manual company info entry | Nowhere (AI extracts it) | We're AI-first |

---

## State Management

**Verification status per field:**
- `pending` - Not yet reviewed
- `confirmed` - UW verified AI extraction is correct
- `corrected` - UW made a correction
- `conflict` - Waiting for conflict resolution

**Page completion:**
- Track which HITL items are checked
- Show progress indicator
- AnalyzePage can show "Setup incomplete" warning if needed

---

## Open Questions

1. Should broker selection remain here as a verification item, or move entirely to pre-intake?
2. Do we need a "verified by" audit trail for compliance?
3. Should verification checklist be submission-level or document-level?
