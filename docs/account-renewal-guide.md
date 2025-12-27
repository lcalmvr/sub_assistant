# Account & Renewal Management Guide

How submissions are linked to accounts, how prior year context is displayed, and how to manage renewals and remarkets.

---

## Overview

The system tracks submissions across policy years through two linking mechanisms:

1. **Account Linking** - Groups submissions by insured (company/account)
2. **Prior Submission Linking** - Chains submissions as renewals/remarkets

```
Account: Toyota
├── Submission 2023 (Bound) ─────┐
├── Submission 2024 (Lost) ──────┤ Prior chain
└── Submission 2025 (Current) ◄──┘
```

---

## Account Linking

### What is an Account?

An account represents a unique insured entity. The `accounts` table stores:
- Name, website
- Address (street, city, state, zip)
- Industry (NAICS codes - synced from submissions)

### How Submissions Link to Accounts

| Scenario | What Happens |
|----------|--------------|
| AI Setup | AI extracts applicant name, searches for matching account, links if found or creates new |
| Manual Setup | User links via Account tab or Load/Edit popover |
| Unlinked | Submission shows "Link to Account" prompt on Account tab |

### Account Tab UI

When an account is linked, the Account tab shows:

```
┌─────────────────────────────────────────────────┐
│ Toyota                         Subs: 3  Written: $50K │
│ www.toyota.com · Detroit, MI                    │
│ Latest: Quoted · Lost · Automotive Manufacturing│
├─────────────────────────────────────────────────┤
│ Submissions                                      │
│ ┌──────┬──────────┬────────┬─────────┬─────────┐│
│ │ Open │ ID       │ Date   │ Status  │ Outcome ││
│ ├──────┼──────────┼────────┼─────────┼─────────┤│
│ │ Link │ 6576b5b9 │ 12/15  │ Quoted  │ Lost    ││
│ │ Link │ abc123   │ 12/20  │ Received│ Pending ││
│ └──────┴──────────┴────────┴─────────┴─────────┘│
└─────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `core/account_management.py` | Account CRUD, linking, matching |
| `pages_components/account_drilldown.py` | Account summary card + submissions table |
| `pages_components/details_panel.py` | Account tab container |

---

## Prior Submission Tracking

### Automatic Prior Detection

When viewing a submission linked to an account, the system automatically finds the most recent prior submission for that account (by effective date or received date).

```python
# core/prior_submission.py
get_prior_submission(submission_id)  # Returns prior submission data
```

### What's Shown as Reference

Prior data is displayed but **NOT copied** to avoid stale data issues:

| Location | What's Shown |
|----------|--------------|
| **Account Tab** | Prior summary card (outcome, terms), YoY changes table |
| **Rating Tab** | Prior premium, rate, tower structure |
| **Quote Tab** | Prior bound/quoted terms box |

### YoY Changes Table

Shows year-over-year comparison:

```
┌─────────┬─────────┬─────────┬─────────┬──────┐
│ Metric  │ Prior   │ Current │ Change  │ %    │
├─────────┼─────────┼─────────┼─────────┼──────┤
│ Revenue │ $10M    │ $12M    │ ↑ +$2M  │ +20% │
│ Premium │ $45K    │ $52K    │ ↑ +$7K  │ +15% │
│ Limit   │ $1M     │ $1M     │ → same  │ 0%   │
│ Retention│ $25K   │ $50K    │ ↑ +$25K │+100% │
└─────────┴─────────┴─────────┴─────────┴──────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `core/prior_submission.py` | Prior lookup, YoY calculation |
| `pages_components/show_prior_panel.py` | UI components for prior context |

---

## Remarket & Renewal Linking

### Terminology

| Term | Definition |
|------|------------|
| **Renewal** | Continuation of a bound policy (prior was bound) |
| **Remarket** | Retry of a lost/declined submission (prior was not bound) |

### Explicit Prior Linking

Beyond automatic detection, submissions can be explicitly linked via `prior_submission_id`:

```sql
submissions
├── id
├── prior_submission_id  -- Links to prior year
├── renewal_type         -- 'renewal' or 'remarket'
└── ...
```

### UI: Create Remarket

On the Account tab, for accounts with lost/declined submissions:

```
┌─ 🔁 Create Remarket ─────────────────────────────┐
│ Create a new submission to retry a previously    │
│ lost account.                                    │
│                                                  │
│ Create remarket from: [12/15/2024 - Lost    ▼]  │
│                                                  │
│ [Create Remarket Submission]                     │
└──────────────────────────────────────────────────┘
```

**What happens:**
1. New submission created with `renewal_type = 'remarket'`
2. Policy dates calculated (prior exp + 1 day = new eff)
3. Broker, NAICS, description inherited
4. User redirected to new submission

### UI: Link to Prior

For submissions not yet linked to a prior:

```
┌─ 🔗 Link to Prior Submission ────────────────────┐
│ Link this submission to a prior year to track    │
│ renewal/remarket history and auto-fill data.     │
│                                                  │
│ Link as continuation of: [12/15/2024 - Lost ▼]  │
│                                                  │
│ Link type: ○ Renewal  ● Remarket                 │
│                                                  │
│ ☑ Auto-fill empty fields from prior              │
│   (broker, industry, description)                │
│                                                  │
│ [Link to Prior]                                  │
└──────────────────────────────────────────────────┘
```

### Data Inheritance

When creating a remarket or linking to prior with auto-fill enabled:

| Field | Inherited? | Reason |
|-------|------------|--------|
| `broker_org_id` | ✅ Yes | Usually same broker |
| `broker_employment_id` | ✅ Yes | Usually same contact |
| `naics_primary_code` | ✅ Yes | Industry doesn't change |
| `naics_primary_title` | ✅ Yes | Industry doesn't change |
| `naics_secondary_code` | ✅ Yes | Industry doesn't change |
| `naics_secondary_title` | ✅ Yes | Industry doesn't change |
| `website` | ✅ Yes | Rarely changes |
| `business_summary` | ✅ Yes | Business description stable |
| `annual_revenue` | ❌ No | Changes YoY, show as reference |
| `effective_date` | ❌ Calculated | Prior exp + 1 day |
| `expiration_date` | ❌ Calculated | New eff + 365 days |

### Key Files

| File | Purpose |
|------|---------|
| `core/submission_inheritance.py` | Inheritance logic, field copying |
| `pages_components/remarket_linking.py` | UI for create/link actions |

---

## Workflow Scenarios

### Scenario 1: New Business (No Prior)

1. Submission received via email
2. AI extracts data, creates submission
3. AI searches for matching account
4. No match → creates new account, links submission
5. Account tab shows just this submission

### Scenario 2: Renewal (Prior Bound)

1. Submission received for existing insured
2. AI matches to existing account
3. Account tab shows prior submissions
4. "Prior Policy" card shows last year's bound terms
5. User can explicitly link as "Renewal" for tracking

### Scenario 3: Remarket (Prior Lost)

1. User views account with prior lost submission
2. Clicks "Create Remarket" on Account tab
3. New submission created with inherited data
4. Prior context shows what was quoted before
5. System tracks this as a retry attempt

### Scenario 4: Manual Linking (After the Fact)

1. Submission already exists, not linked to prior
2. User goes to Account tab
3. Clicks "Link to Prior Submission"
4. Selects the prior year submission
5. Chooses "Renewal" or "Remarket" type
6. Optionally auto-fills empty fields

---

## API Reference

### core/prior_submission.py

```python
get_prior_submission(submission_id: str) -> Optional[dict]
    """Find most recent prior submission for same account."""

get_prior_submission_summary(submission_id: str) -> Optional[dict]
    """Get formatted summary for display."""

calculate_yoy_changes(submission_id: str) -> Optional[dict]
    """Calculate year-over-year changes."""
```

### core/submission_inheritance.py

```python
create_submission_from_prior(
    prior_id: str,
    renewal_type: str,  # 'renewal' or 'remarket'
    effective_date: Optional[date] = None,
    created_by: str = "system",
) -> str
    """Create new submission inheriting from prior."""

link_to_prior_with_inheritance(
    submission_id: str,
    prior_id: str,
    renewal_type: str,
    inherit_empty_fields: bool = True,
) -> dict
    """Link existing submission to prior, optionally inherit data."""
```

### pages_components/show_prior_panel.py

```python
render_prior_context_banner(submission_id: str) -> bool
    """Compact banner indicating prior exists."""

render_prior_summary_card(submission_id: str, expanded: bool = False)
    """Collapsible card with prior details."""

render_yoy_changes(submission_id: str, compact: bool = False)
    """Year-over-year changes table."""

render_prior_rating_context(submission_id: str)
    """Prior context for Rating tab."""

render_prior_quote_context(submission_id: str)
    """Prior context for Quote tab."""
```

### pages_components/remarket_linking.py

```python
render_remarket_actions(
    account_id: str,
    current_submission_id: str,
    submissions: list,
)
    """Render create remarket + link to prior UI."""
```

---

## Database Schema

### submissions table (relevant columns)

```sql
submissions
├── id                    UUID PRIMARY KEY
├── account_id            UUID REFERENCES accounts(id)
├── prior_submission_id   UUID REFERENCES submissions(id)
├── renewal_type          TEXT  -- 'renewal', 'remarket', 'new_business'
├── effective_date        DATE
├── expiration_date       DATE
├── submission_status     TEXT
├── submission_outcome    TEXT
└── ...
```

### accounts table

```sql
accounts
├── id              UUID PRIMARY KEY
├── name            TEXT NOT NULL
├── website         TEXT
├── address_street  TEXT
├── address_street2 TEXT
├── address_city    TEXT
├── address_state   TEXT
├── address_zip     TEXT
├── naics_title     TEXT
├── industry        TEXT
└── created_at      TIMESTAMP
```

---

*Last updated: 2025-12-27*
