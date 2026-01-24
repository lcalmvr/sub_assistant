# Collaborative Underwriting Workflow

## Specification Document

---

## Executive Summary

Transform underwriting from a single-owner model to a collaborative decision-making workflow. AI handles extraction and prep work, freeing UW time for collective judgment on risk decisions.

**Core insight**: When AI does the grunt work, UWs can spend their time making decisions together rather than grinding alone. This removes emotional attachment, distributes knowledge, and improves decision quality.

---

## Problem Statement

### Current State
- Single UW owns each account end-to-end
- Decisions sit on desks while UWs do manual data entry
- Declining feels personal (rejecting someone's work)
- Siloed knowledge (one person's perspective)
- Authority escalation is binary (in/out) rather than collaborative

### Target State
- AI extracts data, UWs verify and decide
- Collective decision-making removes individual attachment
- Multiple eyes on every account
- Fast filtering at pre-screen saves time
- Clear escalation paths for edge cases

---

## Workflow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   INTAKE    │     │ PRE-SCREEN  │     │   UW WORK   │     │   FORMAL    │
│             │────▶│             │────▶│             │────▶│   REVIEW    │
│  AI Preps   │     │ Quick Vote  │     │  Deep Dive  │     │  Team Vote  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                                       │
                          ▼                                       ▼
                    [Fast Decline]                         [Quote/Decline]
```

### Stage 1: Intake (Automated)
- Submission received
- AI extracts data from documents
- AI flags corrections for review
- Account moves to pre-screen queue

### Stage 2: Pre-screen (Quick Vote)
- **Purpose**: Fast gut-check filter before investing UW time
- **Who votes**: All available UWs (need 2 of 3)
- **Time limit**: 4 hours
- **Decision**: Pursue / Pass / Unsure
- **Outcome**: Pass = fast decline, Pursue = moves to work queue

### Stage 3: UW Work (Deep Dive)
- **Purpose**: Verify AI extraction, review docs, build recommendation
- **Assignment**: Claimed from queue or round-robin
- **Activities**:
  - Verify extracted data
  - Review documents
  - Broker conversations
  - Add UW notes
  - Build recommendation
- **Output**: Recommendation (Quote/Decline) with terms and rationale

### Stage 4: Formal Review (Binding Vote)
- **Purpose**: Team approves or rejects the recommendation
- **Who votes**: Other UWs (2 votes needed)
- **Time limit**: 4 hours
- **Decision**: Approve / Decline / Send Back
- **Outcome**: Majority decision is final (escalate if split)

---

## Team Structure

### Standard Flow
- **Cyber team**: 3 UWs, can operate with 2
- **Decision threshold**: 2 votes needed at each stage

### Escalation Triggers
| Trigger | Escalates To |
|---------|--------------|
| Limit > $5M | CUO approval required |
| High hazard industry | CUO approval required |
| Split vote (no majority) | CUO tiebreaker |
| Timeout without quorum | CUO or auto-decline |

---

## Database Schema

### Core Tables

```sql
-- Workflow stage configuration
CREATE TABLE workflow_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_key VARCHAR(50) UNIQUE NOT NULL,
    stage_name VARCHAR(100) NOT NULL,
    stage_order INT NOT NULL,
    required_votes INT DEFAULT 2,
    timeout_hours INT DEFAULT 4,
    timeout_action VARCHAR(20) DEFAULT 'escalate',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Submission workflow state
CREATE TABLE submission_workflow (
    submission_id UUID PRIMARY KEY REFERENCES submissions(id),
    current_stage VARCHAR(50) NOT NULL DEFAULT 'intake',
    stage_entered_at TIMESTAMPTZ DEFAULT now(),
    assigned_uw_id UUID,
    assigned_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    final_decision VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vote capture
CREATE TABLE workflow_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id),
    stage VARCHAR(50) NOT NULL,
    user_id UUID NOT NULL,
    user_name VARCHAR(100),
    vote VARCHAR(20) NOT NULL,
    comment TEXT,
    voted_at TIMESTAMPTZ DEFAULT now(),
    is_tiebreaker BOOLEAN DEFAULT false,
    UNIQUE(submission_id, stage, user_id)
);

-- UW recommendations
CREATE TABLE uw_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id),
    uw_id UUID NOT NULL,
    uw_name VARCHAR(100),
    recommendation VARCHAR(20) NOT NULL,
    summary TEXT,
    suggested_premium NUMERIC(12,2),
    suggested_terms JSONB,
    decline_reasons TEXT[],
    work_started_at TIMESTAMPTZ,
    work_minutes INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    submitted_at TIMESTAMPTZ
);

-- Workflow audit trail
CREATE TABLE workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id),
    from_stage VARCHAR(50),
    to_stage VARCHAR(50) NOT NULL,
    trigger VARCHAR(50) NOT NULL,
    trigger_details JSONB,
    triggered_by UUID,
    triggered_at TIMESTAMPTZ DEFAULT now()
);

-- Escalations
CREATE TABLE escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id),
    reason VARCHAR(50) NOT NULL,
    reason_details JSONB,
    escalated_to_role VARCHAR(50) NOT NULL,
    escalated_to_user UUID,
    status VARCHAR(20) DEFAULT 'pending',
    decision_notes TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    submission_id UUID REFERENCES submissions(id),
    workflow_stage VARCHAR(50),
    read_at TIMESTAMPTZ,
    acted_at TIMESTAMPTZ,
    email_sent_at TIMESTAMPTZ,
    slack_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
```

### Seed Data

```sql
INSERT INTO workflow_stages (stage_key, stage_name, stage_order, required_votes, timeout_hours) VALUES
    ('intake', 'Intake', 0, 0, NULL),
    ('pre_screen', 'Pre-Screen', 1, 2, 4),
    ('uw_work', 'UW Work', 2, 0, NULL),
    ('formal', 'Formal Review', 3, 2, 4);
```

---

## UI Components

### 1. Vote Queue Dashboard

Primary screen for UWs - shows items needing attention.

**Sections:**
- Need My Vote (filtered by stage)
- Ready to Work (passed pre-screen, unclaimed)
- My Active Work (claimed by me)

**Card Display:**
- Account name, industry, limit
- Stage indicator (Pre-screen / Formal)
- Time remaining
- Quick vote buttons (inline)
- View details link

### 2. Pre-screen Vote Card

**Information shown:**
- AI snapshot (revenue, employees, location)
- Controls summary (MFA, EDR, backups)
- Loss history summary
- Prior votes (if any)

**Vote options:**
- Pursue (proceed to work)
- Pass (fast decline)
- Unsure (triggers discussion)

### 3. UW Work Interface

Tabbed workspace for deep-dive review:

| Tab | Purpose |
|-----|---------|
| Summary | Verify AI extraction, business details |
| Controls | Review security controls, add notes |
| Loss | Loss history with UW annotations |
| Docs | Document viewer |
| Notes | Free-form UW notes, attachments |
| Recommendation | Build and submit recommendation |

**Verification tracking:**
- Checkbox for each section verified
- Must complete all before submitting

**Recommendation form:**
- Quote / Decline toggle
- If Quote: Premium, limit, retention, sublimits, conditions
- If Decline: Reason selection, explanation
- Summary for reviewers (required)

### 4. Formal Review Vote Card

**Information shown:**
- UW's recommendation and rationale
- Proposed terms (if quoting)
- Decline reasons (if declining)
- Link to full account details

**Vote options:**
- Approve Quote
- Decline
- Send Back (needs more work)

**Requirements:**
- Comment required for Decline/Send Back
- Reason selection for Decline

### 5. Vote Progress Indicator

Compact display showing vote status:
- Dots for each voter (filled = voted)
- Current tally
- Time remaining

### 6. Submission Timeline

Full audit trail:
- Every vote with timestamp and comment
- Stage transitions
- Escalations
- Final decision

---

## Notification System

### Notification Types

| Type | Trigger | Priority | Delivery |
|------|---------|----------|----------|
| Vote needed | New item in queue | High | In-app, Email, Slack |
| Timeout warning | 1hr before deadline | High | In-app, Email |
| Escalation | Split vote / timeout | Urgent | In-app, Email, Slack |
| Approved | Recommendation approved | Normal | In-app |
| Declined | Recommendation declined | Normal | In-app |
| Sent back | Needs more work | High | In-app, Email |
| Ready to work | Pre-screen passed | Normal | In-app |

### Delivery Channels

1. **In-app**: Bell icon with badge count, dropdown list
2. **Email**: Individual alerts + daily digest option
3. **Slack/Teams**: Channel posts with action buttons

### Daily Digest

Morning email summary:
- Votes needed (with deadlines)
- Accounts ready to work
- Yesterday's results

---

## Escalation System

### Automatic Triggers

| Rule | Threshold | Escalates To | Action |
|------|-----------|--------------|--------|
| High limit | > $5,000,000 | CUO | Approval required |
| Very high limit | > $10,000,000 | President | Approval required |
| High hazard | Industry list | CUO | Approval required |
| Split vote | No majority | CUO | Tiebreaker |
| Pre-screen timeout | 4 hours | - | Auto-decline |
| Formal timeout | 4 hours | CUO | Decision needed |

### High Hazard Industries
- Cryptocurrency / Digital Assets
- Cannabis
- Gambling / Gaming
- Payment Processors (high volume)

### Escalation Queue

CUO/President view showing:
- Pending escalations
- Escalation reason
- Team votes and comments
- Full account access
- Decision buttons

### Escalation Resolution

Options:
- Approve
- Decline
- Request sync discussion
- Return to queue

All decisions logged with notes for team learning.

---

## Analytics Dashboard

### Overview Tab
- Key metrics: Submissions, Quote Rate, Premium, Avg Time
- Decision funnel visualization
- Trend charts (weekly/monthly)

### Pipeline Tab
- Current queue by stage
- Aging analysis
- Bottleneck identification
- Workload distribution
- Stuck accounts list

### Team Tab
- Individual performance metrics
- Accounts worked, quote rate, avg time
- Vote response times
- Contribution over time

### Calibration Tab
- Vote agreement rates (unanimous vs split)
- Head-to-head alignment matrix
- Dissent analysis (who, why, outcomes)
- Notable dissents for review

### Turnaround Tab
- End-to-end time (target vs actual)
- Time by stage
- Vote response times by person
- SLA compliance

### Decision Quality Tab
- Loss experience on bound accounts
- Claims by vote pattern (unanimous vs split)
- Dissenter accuracy tracking
- Claims detail list

### Decline Analysis Tab
- Decline funnel (pre-screen vs formal)
- Decline reasons breakdown
- Time spent on formal declines
- Pattern analysis

---

## Decision Rules

### Pre-screen

| Votes | Result |
|-------|--------|
| 2+ Pursue | → Move to UW Work |
| 2+ Pass | → Auto-decline |
| Split / Unsure | → Discussion or escalate |
| Timeout | → Auto-decline |

### Formal Review

| Votes | Result |
|-------|--------|
| 2+ Approve | → Quote issued |
| 2+ Decline | → Decline with reasons |
| 2+ Send Back | → Returns to UW |
| Split | → Escalate to CUO |
| Timeout | → Escalate to CUO |

---

## Configuration Options

### Workflow Settings
- Stages (add/remove/reorder)
- Required votes per stage
- Timeout hours per stage
- Timeout action (decline/escalate)

### Escalation Rules
- Limit thresholds
- High hazard industry list
- Escalation recipients by role

### Notification Preferences
- Per-user delivery preferences
- Digest vs real-time
- Channel selection

---

## Implementation Phases

### Phase 1: Core Voting (MVP)
- Pre-screen voting
- Formal review voting
- Basic notifications (in-app)
- Simple queue dashboard

### Phase 2: UW Work Interface
- Tabbed workspace
- Verification tracking
- Recommendation builder
- Notes and attachments

### Phase 3: Escalations
- Automatic triggers
- CUO queue
- Tiebreaker flow

### Phase 4: Notifications
- Email integration
- Slack integration
- Daily digest

### Phase 5: Analytics
- Overview dashboard
- Team performance
- Calibration analysis
- Decision quality tracking

---

## Open Questions

1. **Does the UW who worked the account vote in Formal?**
   - Option A: Yes (3 votes, they have context)
   - Option B: No (2 votes, true separation)
   - Recommendation: Yes, but their vote is visible as "recommender"

2. **Pre-screen visibility of other votes?**
   - Option A: Visible immediately (anchoring risk)
   - Option B: Hidden until you vote (independent judgment)
   - Recommendation: Hidden until you vote

3. **Decline messaging differentiation?**
   - Pre-screen decline: Brief form letter
   - Formal decline: Detailed with reasons
   - Recommendation: Yes, different templates

4. **Work queue assignment?**
   - Option A: Self-claimed (first-come)
   - Option B: Round-robin (automatic)
   - Option C: Specialty-based (by industry)
   - Recommendation: Self-claimed with aging alerts

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Avg time to decision | 3+ days | < 24 hrs |
| Pre-screen decline rate | N/A | 20-30% |
| Quote rate | ~50% | 65-70% |
| Team vote alignment | N/A | > 80% |
| Escalation rate | N/A | < 10% |
| UW time per account | 2+ hrs | < 45 min |

---

## Appendix: Vote Types

### Pre-screen
- `pursue` - Proceed to UW work
- `pass` - Fast decline
- `unsure` - Need discussion

### Formal
- `approve` - Accept recommendation
- `decline` - Reject recommendation
- `send_back` - Need more work/info

### Escalation
- `approve` - CUO approves
- `decline` - CUO declines
- `discuss` - Schedule sync discussion
- `return` - Return to normal queue
