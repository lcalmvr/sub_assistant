---
title: Broker Relationship Management + Outreach Agent
status: Planned
owner: Underwriting Platform
last_updated: 2025-12-27
---

# Broker Relationship Management + Outreach Agent (Project Guide)

## Goal
Create a lightweight, maintainable “CRM-lite” inside the Brokers area that:
- Captures broker interactions (notes/calls/meetings/conferences) with minimal friction.
- Turns activity + submission outcomes into **actionable outreach recommendations**.
- Produces value even with incomplete manual data by auto-deriving most signals from existing submission/quote data.

## Non-goals (v1)
- Full email/calendar integrations (roadmap item).
- Full Salesforce-style contact/account management.
- Perfect data completeness requirements.

## Key Product Principles
1) **Default to “Next action”, not “notes”.** Notes exist to support actions and outcomes.
2) **Auto-populate everything possible.** Manual input is only for context you can’t infer.
3) **Append-only event log.** Avoid complex “profiles” that require constant editing.
4) **Every manual entry yields immediate benefit.** After logging an interaction, the user should see a changed recommendation list, reminders, or a better summary.

---

## Data Model (Recommended)

### Existing concepts (current schema intent)
- **Person** (relationship identity that persists across employers)
- **Employment** (person at an org; can change over time)
- **Team** (group of people; can change over time)
- **Organization** (broker org; may have DBAs)

### New primitives (v1)

#### 1) `broker_activities` (append-only)
Represents *one* logged interaction or event.
- `id` (uuid)
- `occurred_at` (timestamp)
- `activity_type` (enum-like text): `note`, `call`, `email`, `meeting`, `conference`, `visit`
- `summary` (short text; 1–2 lines)
- `tags` (text[] or jsonb) – optional: `intro`, `market_update`, `appetite`, `pricing`, `renewal`, `follow_up`, `loss`, `relationship_risk`
- **Primary subject**:
  - `subject_type`: `person` | `team` (start with `person`)
  - `subject_id`: uuid
- **Next step** (optional):
  - `next_step` (short text)
  - `next_step_due_at` (timestamp/date)
  - `next_step_status`: `open` | `done` | `snoozed`
- `created_by` (user id/email)
- `created_at`, `updated_at`

#### 2) `broker_activity_links` (derived or user-confirmed)
Allows one activity to be discoverable from multiple “groupings” (team, org) without duplicating the activity.
- `activity_id`
- `linked_type`: `team` | `org` | `employment` | `submission` (as needed)
- `linked_id`
- `link_reason`: `auto_from_employment_at_time` | `user_selected` | `auto_from_submission`

**Imputation rule (v1):**
- Every activity is created against a **person**.
- On write, infer a best-effort set of links:
  - If person has an active employment at `occurred_at`, link activity → employment + org.
  - If person is part of a team (active membership) at `occurred_at`, link activity → team.
- UI can allow “Also apply to team” as a toggle (creates a `user_selected` link).

#### 3) `broker_outreach_suggestions` (optional, can be computed)
Start with rules-based suggestions computed at runtime (no table), and add persistence later if needed for “snooze/done”.
- If persisted: store `reason_codes`, `score`, `generated_at`, `state` (open/snoozed/done), `snooze_until`.

---

## UX (What Underwriters See)

### A) Brokers Page (per-person view)
Default view should be *actionable*:
1) **Header card**
   - “Last touch” + “Next step due”
   - Submissions last 30/90 days, quote rate, bind rate, written premium
2) **Next steps (top)**
   - Due today / this week
   - One-click: `Done`, `Snooze`, `Log activity`
3) **Timeline**
   - Auto-events from submission lifecycle + manual broker activities interleaved
4) **Log interaction (fast)**
   - Single control with: type + summary + optional next step due date + tags

### B) Outreach Recommendations (global view)
This is where the payoff is:
- List of “who to contact” with **reason chips** and **suggested action**.
- One-click: `Log call`, `Log meeting`, `Snooze 7d`, `Done`.

---

## Signals (Auto-derived, low-maintenance)

### From submissions/quotes (already in system)
- Volume: submissions received by broker/team/org (30/90/365d)
- Funnel: received → quoted → bound → lost/declined
- Speed: avg days to quote/bind (proxy for relationship efficiency)
- Quality: avg premium, avg limit, attachment, volatility
- Recency: last submission date, last bind date

### Manual-only context (minimal)
- Relationship notes (short)
- Next step + due date
- Visit/meeting logs (conference, lunch, etc.)

---

## Recommendation Engine (Phased)

### Phase 1 (Rules-based)
No LLM scoring. Every recommendation includes a reason:
- Strong broker + no touch in 45 days → “Maintain relationship”
- High submission volume + low quote rate → “Reset appetite / educate”
- Recent decline streak → “Expectation setting”
- Bind but falling premium → “Pricing/retention risk”
- High-value submission recently lost → “Post-mortem / winback”

### Phase 2 (LLM for summarization + drafts)
Use LLM for:
- “Since last touch…” broker summary (timeline + outcomes)
- Suggested email/call talking points (grounded in your appetite + recent broker outcomes)
Keep ranking rules-based until the dataset is dense.

### Phase 3 (LLM ranking)
After activity logging is consistent, train/score outreach priority using historical success signals.

---

## Email-to-Notes (High-leverage, low friction)
Underwriters live in email; leverage that.

### Proposed workflow (v2)
1) UW emails a recap to `broker-notes@…` (or forwards a thread).
2) System creates a **Pending Activity**:
   - Extract summary + tags suggestion
   - Match broker person by sender email / domain / known contacts
   - Propose team/org association
3) In-app “Inbox” view:
   - Confirm/adjust person/team
   - Confirm occurred_at (defaults to email time)
   - Approve → writes to `broker_activities` + links

### Why this works
- Natural behavior (send recap) becomes structured data.
- Review step prevents mis-attribution and keeps quality high.

---

## Calendar Integration (Roadmap)
Worth doing later, but only after the core workflow is adopted.

Risks:
- Permissions/security + IT friction
- Bad matching (aliases, personal emails)
- Data volume noise (meetings not actually “broker touchpoints”)

Approach (later):
- Optional per-user integration (Google/Microsoft)
- Pull only meetings where a known broker email is attendee
- Create “Suggested activity” entries requiring confirmation (like email flow)

---

## Success Metrics (to avoid “it’s just data”)
Track outcomes that prove value:
- % of brokers with at least one “touch” in last 60 days (auto + manual)
- # of “Next steps” completed weekly
- Time-to-quote improvements for active brokers
- Increase in quote→bind conversion for brokers that received recommended outreach
- UW-reported usefulness (1-click feedback on recommendations)

---

## Implementation Plan (Suggested Order)
1) **Schema + core APIs**: `broker_activities`, derived links, minimal CRUD.
2) **Brokers UI**: timeline + next steps + “log interaction”.
3) **Outreach list**: rules-based recommendations + snooze/done.
4) **Auto-events**: inject submission lifecycle events into timeline (read-only).
5) **Email-to-notes inbox** (high ROI) + moderation UI.
6) Optional: calendar integration + AI drafting/summarization.

