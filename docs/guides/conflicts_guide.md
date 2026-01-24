# Conflict Detection & Application Credibility Guide

## Overview

The conflict detection system identifies issues that require human review before a submission can proceed. This guide covers:
1. Conflict types and detection rules
2. Application Credibility Score - measuring answer consistency and sophistication
3. Core sign-off items

---

## Part 1: Conflict Types

### VALUE_MISMATCH
Same field has different values from different sources.

**Example:**
- AI extracted revenue as $5M from application
- Broker email stated revenue as $50M

**Detection:** Compares field values across sources (ai_extraction, document_form, broker_submission, user_edit)

---

### LOW_CONFIDENCE
AI extraction confidence below threshold (default: 0.70).

**Example:**
- Applicant name extracted with 0.45 confidence due to poor scan quality

**Action:** Human verification required

---

### MISSING_REQUIRED
Required field not extracted or empty.

**Required fields:**
- applicant_name
- annual_revenue
- effective_date

---

### CROSS_FIELD
Logical inconsistency between related fields.

**Rules:**
- `date_order`: Expiration date must be after effective date

---

### OUTLIER_VALUE
Value outside expected range.

**Ranges:**
- `annual_revenue`: $10K - $100B

---

### APPLICATION_CONTRADICTION
Contradictory answers within the same application form. This is a key input to the credibility score.

**Current Rules:**

| Rule | Condition | Contradiction |
|------|-----------|---------------|
| `edr_vendor_without_edr` | hasEdr = No | edrVendor is filled in |
| `edr_no_vendor` | hasEdr = Yes | edrVendor is empty |
| `mfa_type_without_mfa` | hasMfa = No | mfaType is specified |
| `remote_mfa_conflict` | remoteAccessMfa = No | mfaForRemoteAccess = Yes |
| `backup_frequency_without_backups` | hasBackups = No | backupFrequency is specified |
| `immutable_without_backups` | hasBackups = No | immutableBackups = Yes |
| `phishing_frequency_without_training` | conductsPhishingSimulations = No | phishingFrequency is specified |
| `large_company_no_security_team` | employeeCount > 500 | hasDedicatedSecurityTeam = No |

---

### VERIFICATION_REQUIRED
Core sign-off items requiring human verification regardless of conflicts.

**Items:**
- Verify broker assignment (higher priority if auto-assigned)
- Verify annual revenue is accurate
- Verify industry classification is correct
- Verify business description is accurate

---

## Part 2: Application Credibility Score

### Concept

The credibility score measures the **consistency and sophistication** of application responses. It's not about whether answers are "good" or "bad" for underwriting - it's about whether the applicant:

1. **Understands** the questions being asked
2. **Answers consistently** across related questions
3. **Provides plausible** answers given their business type

A low credibility score suggests:
- Careless form completion
- Lack of understanding of security concepts
- Possible deception or box-checking behavior
- Auto-fill errors

### Credibility Signals

#### Category 1: Direct Contradictions (High Impact)

These are explicit logical impossibilities.

| Signal | Pattern | Impact |
|--------|---------|--------|
| **EDR Contradiction** | "No EDR" + names EDR vendor | -20 points |
| **MFA Contradiction** | "No MFA" + specifies MFA type | -20 points |
| **Backup Contradiction** | "No backups" + specifies backup frequency | -20 points |
| **Conditional Answer** | Says "No" but answers follow-up that assumes "Yes" | -15 points |

**Example:**
> Q: Do you have MFA for remote access?
> A: No
> Q: If yes, what percentage of users are enrolled?
> A: 85%

This is a clear contradiction - they answered a conditional question that shouldn't apply.

#### Category 2: Business Model Implausibility (Medium Impact)

Answers that are unlikely given the business type.

| Signal | Pattern | Impact |
|--------|---------|--------|
| **B2C No PII** | B2C business + "No PII" | -15 points |
| **B2C No Cards** | B2C e-commerce + "No credit cards" | -15 points |
| **SaaS No Customer Data** | SaaS company + "No customer data" | -15 points |
| **Healthcare No PHI** | Healthcare provider + "No PHI" | -20 points |
| **Financial No PCI** | Financial services + "No PCI scope" | -15 points |

**Example:**
> Business Type: B2C E-commerce
> "Do you store credit card information?" No
> "Do you collect PII?" No

This is implausible - a B2C e-commerce company must collect at least shipping addresses (PII).

#### Category 3: Scale Mismatches (Medium Impact)

Security posture inconsistent with company size/revenue.

| Signal | Pattern | Impact |
|--------|---------|--------|
| **Large Co No Security Team** | 500+ employees + no dedicated security | -10 points |
| **High Revenue No CISO** | $100M+ revenue + no security leadership | -10 points |
| **Small Co Complex Stack** | <10 employees + enterprise security tools | +5 points (unusual, verify) |
| **Large Co No Policies** | 500+ employees + no written security policies | -15 points |

#### Category 4: Answer Pattern Red Flags (Low-Medium Impact)

Patterns suggesting careless completion.

| Signal | Pattern | Impact |
|--------|---------|--------|
| **All Yes** | Every security question answered "Yes" | -10 points |
| **All No** | Every security question answered "No" | -5 points (may be honest) |
| **Identical Answers** | Same text in multiple free-form fields | -10 points |
| **Nonsense Text** | Random characters or placeholder text | -25 points |
| **Copy-Paste Boilerplate** | Generic policy text detected | -5 points |

#### Category 5: Positive Credibility Signals

Signs of a thoughtful, knowledgeable respondent.

| Signal | Pattern | Impact |
|--------|---------|--------|
| **Specific Vendor Names** | Names actual security vendors (not just "Yes") | +5 points |
| **Detailed Explanations** | Provides context in free-form fields | +5 points |
| **Admits Gaps** | Acknowledges areas for improvement | +10 points |
| **Consistent Stack** | Security tools that make sense together | +5 points |
| **Proper Acronym Usage** | Uses industry terms correctly | +5 points |

### Scoring Framework

The score must account for **application complexity**. A 10-question app with 1 contradiction is worse than a 150-question app with 1 contradiction.

#### Multi-Dimensional Scoring

Instead of a single score, we calculate **three dimensions**:

```
┌─────────────────────────────────────────────────────────────────┐
│  CREDIBILITY SCORE = Weighted Average of:                       │
│                                                                 │
│  1. CONSISTENCY (40%)   - Are answers internally coherent?      │
│  2. PLAUSIBILITY (35%)  - Do answers fit the business model?    │
│  3. COMPLETENESS (25%)  - Were questions answered thoughtfully? │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Dimension 1: Consistency Score (40% of total)

Measures contradictions relative to opportunities for contradiction.

```
                        contradictions found
Consistency = 1 - ─────────────────────────────── × severity_weight
                   testable answer pairs
```

**Testable answer pairs** = number of question relationships we can validate.

| App Type | Typical Testable Pairs | Example |
|----------|------------------------|---------|
| Simple (20 questions) | ~15 pairs | Basic security questionnaire |
| Standard (50 questions) | ~40 pairs | Typical cyber application |
| Complex (150+ questions) | ~120 pairs | Detailed supplemental app |

**Severity weights:**

| Severity | Weight | Example |
|----------|--------|---------|
| Critical | 3.0 | Direct logical impossibility ("No EDR" + "EDR vendor is X") |
| High | 2.0 | Conditional violation (answered "No" but filled "If yes...") |
| Medium | 1.0 | Unlikely combination (B2C + no PII) |
| Low | 0.5 | Unusual but possible (small co with enterprise tools) |

**Example calculations:**

```
Simple App (15 testable pairs):
  - 1 critical contradiction: (1 × 3.0) / 15 = 0.20 → Consistency = 80%
  - 2 medium contradictions:  (2 × 1.0) / 15 = 0.13 → Consistency = 87%

Complex App (120 testable pairs):
  - 1 critical contradiction: (1 × 3.0) / 120 = 0.025 → Consistency = 97.5%
  - 2 medium contradictions:  (2 × 1.0) / 120 = 0.017 → Consistency = 98.3%
```

This normalization means:
- **Simple app, 1 critical error** → 80% consistency (concerning)
- **Complex app, 1 critical error** → 97.5% consistency (likely a mistake)

---

#### Dimension 2: Plausibility Score (35% of total)

Measures whether answers make sense given the business context.

```
                          implausible answers
Plausibility = 1 - ────────────────────────────── × context_weight
                    context-checkable questions
```

**Context factors** (what we know about the business):

| Factor | Checkable Questions | Example Implausibilities |
|--------|---------------------|--------------------------|
| Industry (NAICS) | ~10-20 | Healthcare + "No PHI" |
| Business Model (B2B/B2C) | ~5-10 | B2C ecommerce + "No PII" |
| Company Size | ~5-10 | 500+ employees + "No security policies" |
| Revenue | ~3-5 | $100M+ + "No cyber insurance" |

**Context weight** = How certain we are about the context

| Confidence | Weight | When |
|------------|--------|------|
| High | 1.0 | Industry confirmed, revenue verified |
| Medium | 0.7 | AI-extracted, not verified |
| Low | 0.4 | Guessed or incomplete |

**Example:**

```
B2C E-commerce (verified), $5M revenue:
  Context-checkable questions: 12
  Implausible answers:
    - "No PII collected" (high confidence this is wrong) → weight 1.0
    - "No credit cards" (high confidence this is wrong) → weight 1.0

  Plausibility = 1 - (2 × 1.0) / 12 = 83%
```

---

#### Dimension 3: Completeness Score (25% of total)

Measures quality of engagement with the application.

```
                      quality_points_earned
Completeness = ─────────────────────────────
                quality_points_possible
```

**Quality indicators:**

| Indicator | Points | Detection |
|-----------|--------|-----------|
| Question answered | +1 | Not blank |
| Specific detail provided | +2 | Vendor name, percentage, date |
| Free-form explanation given | +2 | >20 chars in text field |
| "N/A" with reason | +1 | Explains why not applicable |
| Blank required field | -3 | Empty required field |
| Nonsense/placeholder text | -5 | "asdf", "test", "xxx" |
| All identical answers | -2 per | Same answer repeated |

**Example:**

```
50-question app (100 points possible):
  - 48 questions answered: +48
  - 5 with specific vendors named: +10
  - 3 with explanations: +6
  - 2 blank optional fields: +0
  - 1 "N/A - we don't have remote employees": +1

  Total: 65 / 100 = 65%

  But then:
  - All 15 yes/no security questions answered "Yes": -30

  Adjusted: 35 / 100 = 35% (red flag: box-checking behavior)
```

---

#### Combined Score Calculation

```
Final Score = (Consistency × 0.40) + (Plausibility × 0.35) + (Completeness × 0.25)
```

**Interpretation:**

| Score | Label | Meaning | Action |
|-------|-------|---------|--------|
| 90-100 | Excellent | Consistent, plausible, thorough | Standard review |
| 80-89 | Good | Minor issues, likely mistakes | Note issues, proceed |
| 70-79 | Fair | Some concerns | Extra scrutiny |
| 60-69 | Poor | Multiple issues | Request clarification |
| <60 | Very Poor | Significant credibility issues | May need new application |

---

#### Displaying the Score

Show underwriters the breakdown, not just the number:

```
┌─────────────────────────────────────────────────────────┐
│  Application Credibility: 72 (Fair)                     │
├─────────────────────────────────────────────────────────┤
│  Consistency:   85%  ████████░░  (1 issue found)        │
│  Plausibility:  68%  ██████░░░░  (2 issues found)       │
│  Completeness:  58%  █████░░░░░  (box-checking pattern) │
├─────────────────────────────────────────────────────────┤
│  ⚠ Issues:                                              │
│  • "No EDR" but named CrowdStrike as EDR vendor         │
│  • B2C business claims no PII collection                │
│  • All 12 security questions answered "Yes"             │
└─────────────────────────────────────────────────────────┘
```

---

### Implementation Considerations

1. **Score per section** - Track credibility within sections (Security Controls, Business Info, etc.)
2. **Explain deductions** - Show underwriter exactly what caused score reduction
3. **Don't auto-decline** - Score informs review, doesn't replace judgment
4. **Learning opportunity** - Low scores may indicate confusing questions
5. **App complexity metadata** - Store question count, testable pairs count per app type
6. **Baseline by app type** - Different apps have different typical scores

---

## Part 3: Future Contradiction Rules to Add

### EDR Section
- [ ] Has EDR but EDR vendor is "None" or "N/A"
- [ ] Multiple EDR vendors selected (unusual, verify)
- [ ] EDR deployed to "100% of endpoints" but has unmanaged devices

### MFA Section
- [ ] MFA required for email but not for VPN (inconsistent policy)
- [ ] MFA type is "SMS" but claims "phishing-resistant MFA"
- [ ] No MFA but has "zero trust architecture"

### Backup Section
- [ ] Backup frequency "daily" but retention "1 day" (pointless)
- [ ] Air-gapped backups but backup location is "cloud only"
- [ ] No backup testing but claims "verified recovery capability"

### Access Control
- [ ] "Least privilege" but "all employees have admin access"
- [ ] PAM solution deployed but no privileged accounts inventoried
- [ ] SSO deployed but password policy still mentioned

### Incident Response
- [ ] Has IR plan but no IR team or contact
- [ ] IR plan tested "annually" but company is <1 year old
- [ ] Cyber insurance required for IR but no insurance listed

### Business Type Validators
- [ ] E-commerce but no payment processor mentioned
- [ ] Healthcare but no BAAs mentioned
- [ ] Government contractor but no FedRAMP/CMMC mention
- [ ] Handles EU data but no GDPR mention

---

## Part 4: Configuration Reference

### Detection Strategy

Set via environment variable:
```bash
export CONFLICT_DETECTION_STRATEGY=eager  # Run on every write
export CONFLICT_DETECTION_STRATEGY=lazy   # Run on UI load
export CONFLICT_DETECTION_STRATEGY=hybrid # Eager for critical fields only
```

### Confidence Thresholds

```python
AUTO_ACCEPT = 0.90      # No review needed
NEEDS_VERIFICATION = 0.70  # Quick verification
# Below 0.70: Manual review required
```

### Tracked Fields

Fields stored in `field_values` table for conflict detection:
- applicant_name, annual_revenue, website
- effective_date, expiration_date
- naics_primary_code, naics_primary_title, naics_secondary_code
- broker_email, broker_company

### Priority Levels

| Priority | Fields | Meaning |
|----------|--------|---------|
| High | applicant_name, annual_revenue, effective_date, expiration_date | May block workflow |
| Medium | naics_primary_code, broker_email, website | Should be reviewed |
| Low | All others | Can be deferred |

---

## Appendix: Database Schema

### field_values
Stores each value with its source for provenance tracking.

```sql
CREATE TABLE field_values (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL,
    field_name TEXT NOT NULL,
    field_value JSONB,
    source_type TEXT NOT NULL,  -- ai_extraction, document_form, user_edit, etc.
    confidence FLOAT,
    extracted_from TEXT,
    created_at TIMESTAMPTZ,
    created_by TEXT
);
```

### conflicts
Stores detected conflicts and their resolution status.

```sql
CREATE TABLE conflicts (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL,
    conflict_type TEXT NOT NULL,
    field_name TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    details JSONB,
    source_value_ids UUID[],
    created_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT
);
```
