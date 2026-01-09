# Project Roadmap: Unified Data Architecture + AI Agents

## Overview

Two parallel initiatives:
1. **Data Schema Foundation** - Importance weighting for extraction schema fields
2. **AI Agents** - Centralized AI assistants in top bar (React frontend)

---

## AI Knowledge Strategy

### The Question: Does the AI Need Domain Expertise?

Base LLMs (GPT-4, Claude) have general knowledge of cybersecurity, NIST frameworks, and insurance concepts. But their knowledge is:
- **Frozen** at training cutoff (6-12 months stale)
- **Generic** - not tailored to cyber insurance underwriting
- **Missing your context** - no knowledge of your book, your appetite, your claims experience

### What the LLM Knows vs. Doesn't Know

| LLM Has | LLM Lacks |
|---------|-----------|
| NIST CSF framework basics | Latest attack trends (new ransomware variants) |
| General cybersecurity concepts | Current market benchmarks ("average premium for $50M manufacturer") |
| Insurance terminology | Your underwriting guidelines and appetite |
| Common control definitions | Your claims experience (what controls correlated with losses) |
| | Recent regulatory changes (SEC cyber rules, state privacy laws) |
| | Industry-specific nuances (healthcare vs manufacturing risks) |

### "Continuing Education" - Does It Make Sense?

**Traditional UW Model**: UWs attend conferences, read trade publications, study loss reports. Some retain more than others. Knowledge is distributed unevenly across the team.

**AI Equivalent Options**:

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **Trust LLM training** | Use base model knowledge | Zero cost, fast | Stale, generic, no internal context |
| **Prompt injection** | Add context to each prompt | Low cost, flexible | Limited by context window (~128K tokens) |
| **RAG knowledge base** | Retrieve relevant docs per query | Fresh, scalable | Infrastructure cost, retrieval quality varies |
| **Periodic fine-tuning** | Retrain model on your data | Deep integration | Expensive, slow, model-locked |
| **Web search augmentation** | Real-time search for current info | Always current | Latency, cost per query, quality varies |

### Recommendation: Layered Approach

**Layer 1 - Submission Context (Now)**
- Pass industry, revenue, employee count, prior claims to AI
- Zero cost, immediate improvement
- "This is a $50M healthcare company with 500 employees and a ransomware claim 18 months ago"

**Layer 2 - Internal Knowledge Base (Near-term)**
- Your underwriting guidelines
- Your claims data patterns ("companies without MFA have 3x loss ratio")
- Control definitions with your interpretation
- RAG retrieval, moderate infrastructure

**Layer 3 - External Feeds (Future)**
- Threat intelligence feeds (CISA alerts, CVE data)
- Market benchmarks (rate filings, industry reports)
- Regulatory updates
- Higher cost, needs curation

**Layer 4 - Claims Feedback Loop (Future)**
- Automatic correlation: controls at bind → claim outcomes
- Evolve importance weights based on actual loss experience
- This IS Phase 5 of the roadmap

### Cost/Speed/Scale Considerations

| Factor | Prompt Injection | RAG | Fine-tuning | Web Search |
|--------|-----------------|-----|-------------|------------|
| **Cost per query** | ~$0.01 | ~$0.02-0.05 | ~$0.01 | ~$0.05-0.20 |
| **Latency** | Baseline | +200-500ms | Baseline | +1-3s |
| **Freshness** | Static | Hours-days | Months | Real-time |
| **Scales across models** | ✓ | ✓ | ✗ | ✓ |
| **Maintenance** | Low | Medium | High | Low |

### Product Evolution Path

```
Phase 1 (Current): LLM + submission context
    ↓
Phase 2: + Internal knowledge base (guidelines, claims patterns)
    ↓
Phase 3: + External feeds (threat intel, market data)
    ↓
Phase 4: + Automated claims feedback loop
```

### Bottom Line

The LLM's general knowledge is a good starting point but not sufficient for production underwriting decisions. The value comes from layering YOUR context:
1. **Submission data** - what we know about this specific risk
2. **Your guidelines** - how you want to underwrite
3. **Your experience** - what your claims data tells you

"Continuing education" via industry reports makes sense for **Layer 3** but is lower priority than Layers 1-2. The model doesn't need to read reports if you can feed it structured threat intel and market data.

---

## Guideline Evolution Process

### The Model: AI Analyst, Human Decision-Maker

Instead of training the AI to passively absorb industry knowledge, use AI as an **analyst** that synthesizes data and proposes guideline changes for human review.

```
┌─────────────────────────────────────────────────────────────┐
│                    QUARTERLY REVIEW CYCLE                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   INPUTS                      AI ANALYSIS         OUTPUT    │
│   ──────                      ───────────         ──────    │
│                                                             │
│   Claims data ─────────┐                                    │
│   (your book)          │                                    │
│                        ├────► Correlation    ────►  Recommended │
│   Submission patterns ─┤      Analysis             Guideline    │
│   (what you're seeing) │                           Changes      │
│                        │                                    │
│   Industry reports ────┤      Trend                         │
│   (external context)   │      Detection      ────►  Risk        │
│                        │                           Alerts       │
│   Threat intel ────────┘                                    │
│   (CISA, CVEs)                                              │
│                                                             │
│                              ▼                              │
│                                                             │
│                    HUMAN REVIEW & APPROVAL                  │
│                    ──────────────────────                   │
│                    • UW leadership reviews recommendations  │
│                    • Approve, modify, or reject             │
│                    • Changes pushed to production           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What AI Analyzes

| Input | Analysis | Example Output |
|-------|----------|----------------|
| **Claims data** | Control → loss correlation | "Accounts without offline backups had 2.8x loss ratio" |
| **Submission patterns** | Control prevalence trends | "MFA adoption up 15% this quarter, EDR flat" |
| **Industry reports** | Emerging threat patterns | "BEC attacks targeting healthcare CFOs increasing" |
| **Threat intel** | Vulnerability relevance | "New Exchange CVE affects 40% of your book" |

### Output: Recommendation Types

1. **Importance Weight Changes**
   - "Recommend upgrading 'Offline Backups' from important → critical based on ransomware claim correlation"

2. **New Field Additions**
   - "Consider adding 'AI-powered email security' field - emerging differentiator in claims outcomes"

3. **Pricing Factor Adjustments**
   - "Healthcare accounts showing 1.4x expected loss ratio - review industry loading"

4. **Risk Alerts**
   - "3 accounts in book use vulnerable VPN version - consider mid-term outreach"

### Cadence

| Review | Scope | Participants |
|--------|-------|--------------|
| **Quarterly** | Full guideline review | UW leadership, actuarial, claims |
| **Monthly** | Claims pattern check | UW management |
| **Ad-hoc** | Critical threat alerts | Triggered by severity |

### Key Principles

1. **AI proposes, human disposes** - No auto-updates to guidelines
2. **Evidence-based** - Recommendations include supporting data
3. **Auditable** - Track what changed, when, why, who approved
4. **Reversible** - Can roll back guideline versions if needed

### Implementation Notes

- Builds on Phase 4 (Decision-Point Snapshots) - need bind-time data to correlate
- Builds on Phase 5 (Claims Feedback) - claims tagging enables correlation
- Industry report ingestion is optional enhancement - internal data is primary
- Could start with manual quarterly analysis before automating

---

## Existing AI Agent Assets (Streamlit)

The Streamlit project already has AI agent functionality that can inform the React implementation:

| File | Purpose |
|------|---------|
| `ai/admin_agent.py` | Admin agent core: command parser, policy resolver, action executors |
| `pages_components/admin_agent_sidebar.py` | Streamlit sidebar UI for admin actions |
| `pages_components/ai_command_box.py` | Quote/tower/coverage AI command box |

### Existing Admin Intents
- `extend_policy` - Extend policy expiration date
- `process_bor` - Change broker of record
- `mark_subjectivity` - Mark subjectivity as received
- `issue_policy` - Issue/finalize a bound policy
- `file_document` - File a document for a submission

### Existing Quote Intents (ai_command_box.py)
- Generate multiple quote options ("1M, 3M, 5M at 50K retention")
- Build tower structure ("XL primary $5M, CMAI $5M xs $5M")
- Modify coverage sublimits ("set SE to 250K")

---

## Phase 1: Data Schema Foundation

Add importance weighting to extraction schema fields so UW can see "what needs confirmation" based on evolving priorities.

### Tasks

- [x] **1.1** Add `importance` enum column to `schema_fields` table
  - Values: `critical`, `important`, `nice_to_know`, `none`
  - File: `db_setup/extraction_schema_importance.sql`

- [x] **1.2** Create `importance_versions` table
  - Track version history (v1 = launch, v2 = post-Q1 claims, etc.)
  - Columns: id, version_number, name, description, is_active, created_at, based_on_claims_through

- [x] **1.3** Create `field_importance_settings` table
  - Links fields to importance levels by version
  - Columns: id, version_id, field_key, importance, rationale

- [x] **1.4** Seed v1 priorities
  - Map current "mandatory 10" controls to critical fields in extraction schema
  - MFA fields, EDR, backup fields, phishing training

- [x] **1.5** Populate schema_fields table
  - 37 fields across 11 categories from EXTRACTION_SCHEMA
  - File: `db_setup/migrate_to_extraction_values.sql`

- [x] **1.6** Migrate submission_controls → submission_extracted_values
  - Map old control_name to new field_key
  - Preserve status, source_type, source_text, etc.

- [x] **1.7** Create API endpoints for importance settings
  - GET `/api/extraction-schema/importance` - current active importance settings
  - GET `/api/extraction-schema/importance-versions` - all versions
  - POST `/api/extraction-schema/importance-versions` - create new version
  - PUT `/api/extraction-schema/importance-versions/{id}/fields` - update field importance
  - POST `/api/extraction-schema/importance-versions/{id}/activate` - set active version

- [x] **1.8** Update Show Gaps agent action
  - Queries importance settings instead of hardcoded controls
  - Shows critical/important fields that are missing values

- [ ] **1.9** Unified Data Flow (Critical)
  - **Problem**: AI analysis runs on Day 1 data and becomes stale. UW decisions use accumulated knowledge (supplemental apps, broker responses), but AI doesn't see it.
  - **Solution**: All extraction sources → `submission_extracted_values`. AI analysis runs on-demand from current data.

  **Data Sources to Wire Up:**
  - [x] Initial application extraction → `submission_extracted_values` (pipeline.py `_save_extracted_values()`)
  - [x] Supplemental application extraction → `submission_extracted_values` (pipeline.py supplemental loop)
  - [x] Broker email parsing → `submission_extracted_values` (via `_execute_apply_broker_response()`)
  - [x] Manual UW confirmations → `submission_extracted_values` (via `PATCH /extracted-values/{field_key}`)
  - N/A Document extraction (loss runs, etc.) - Loss runs extract claims data to `loss_history` table (different data type); policies extract declarations to policy tables. Security control fields only come from applications.

  **AI Functions to Update (read from current `submission_extracted_values`):**
  - [x] NIST Assessment - compute on-demand, not stored artifact
  - [x] Show Gaps - reads from new table
  - [x] Parse Broker Response - reads/writes new table
  - [x] Summarize - uses current extracted values with fallback to bullet_point_summary

  **API Endpoints:**
  - [x] `GET /api/submissions/{id}/extracted-values` - unified endpoint with importance levels
  - [x] `PATCH /api/submissions/{id}/extracted-values/{field_key}` - manual UW confirmations
  - [x] `GET /api/submissions/{id}/extracted-values/needing-confirmation` - fields needing UW input
  - [x] Migrate UI from `get_submission_controls()` to new endpoints (AnalyzePageV2.jsx)

  **Legacy Code:**
  - [x] `_action_nist_assessment()` → reads from `submission_extracted_values`
  - [x] `_action_parse_broker_response()` → reads/writes `submission_extracted_values`
  - [x] `_execute_apply_broker_response()` → writes to `submission_extracted_values`
  - [x] `_action_summarize()` → uses current extracted values

  **Legacy Endpoints (still write to old table, low priority to migrate):**
  - `POST /api/submissions/{id}/controls/parse-response` - still writes to `submission_controls`
  - `POST /api/submissions/{id}/controls/apply-updates` - still writes to `submission_controls`
  - These can be deprecated once BrokerResponseModal uses AI agent pattern instead

  **Legacy Tables (keep for now, flag for cleanup):**
  - `submission_controls` - legacy writes still happening via modal, new writes go to extracted_values
  - `control_definitions` - stop using, eventually drop

---

## Phase 2: AI Agents - Architecture Design

Design the agent interaction model. The main implementation is in Streamlit (`pages_components/admin_agent_sidebar.py`, `pages_components/ai_command_box.py`), with API endpoints that can also serve a React frontend if needed.

### Tasks

- [x] **2.1** Design agent interaction model
  - Top bar slide-out panel
  - Chat-style conversation
  - Context awareness (knows current submission, page, user role)
  - File: `docs/ai-agent-ui-design.md`

- [x] **2.2** Define UW Assistant capabilities
  - [x] Process broker response → update extracted values
  - [x] Regenerate NIST assessment on demand
  - [x] Show missing critical/important fields
  - [x] Summarize submission

- [x] **2.3** Define Admin Assistant capabilities (port from Streamlit)
  - [x] Extend policy (create endorsement)
  - [x] Process BOR (broker of record change) - stub
  - [x] Mark subjectivity as received - stub

- [x] **2.4** Define Quote Assistant capabilities (port from Streamlit)
  - [x] Generate multiple quote options
  - [x] Build tower structure
  - [x] Modify coverage sublimits

- [x] **2.5** Design API contract for agents
  - POST `/api/agent/chat` - unified chat
  - POST `/api/agent/action` - quick actions
  - POST `/api/agent/confirm` - confirm previews
  - File: `docs/ai-agent-api-contract.md`

---

## Phase 3: AI Agent Implementation

Build the agents. Main implementation is in Streamlit, with API endpoints that can serve both Streamlit and React frontends.

### Tasks

- [x] **3.1** Create backend agent orchestration
  - Shared command parser (port from `ai/admin_agent.py`)
  - Context injection (submission data, user info)
  - Function calling with OpenAI
  - File: `api/main.py` (agent routes at end of file)

- [x] **3.2** Build AI agent UI components (Streamlit)
  - Sidebar panel for admin agent
  - Command box for quote commands
  - Chat interface with message history
  - Files: `pages_components/admin_agent_sidebar.py`, `pages_components/ai_command_box.py`
  - Note: React `AiAgentPanel.jsx` exists in `frontend/` but main implementation is Streamlit

- [x] **3.3** Implement UW Assistant functions
  - Process broker response (parse email, update values)
  - Regenerate NIST assessment
  - Show gaps (query controls)
  - Summarize submission

- [x] **3.4** Implement Admin Assistant functions
  - [x] Extend policy with confirmation flow
  - [x] Change broker (BOR) - ported from Streamlit
  - [x] Mark subjectivity received - ported from Streamlit
  - [x] Issue policy (generate binder) - ported from Streamlit
  - [x] Cancel policy - with reason codes and return premium calc
  - [x] Reinstate policy - undo cancellation
  - [x] Decline submission - with reason codes
  - [x] Add note - append to uw_notes
  - [ ] File document - needs file upload handling

- [x] **3.5** Implement Quote Assistant functions
  - Port from `ai/ai_command_box.py`
  - Generate options, build tower, modify coverages
  - File: `api/main.py` (_action_quote_command and related functions)

- [x] **3.6** Add conversation history / memory
  - Session-based memory (within page session)
  - Submission-scoped context

---

## Phase 4: Decision-Point Snapshots

Preserve "what we knew when we made the decision" as an artifact. Useful for claims analysis and audit trails.

**Key Concept**: AI analysis always runs on CURRENT data (Phase 1.9). But at key decision points (quote, bind), we freeze a snapshot of the extracted values and analysis results for the historical record.

### Tasks

- [x] **4.1** Define decision points to snapshot
  - Quote issued
  - Policy bound
  - Renewal offered
  - File: `db_setup/decision_snapshots.sql`

- [x] **4.2** Snapshot extracted values at decision point
  - `decision_snapshots` table with JSONB `extracted_values` column
  - Records `importance_version_id` that was active
  - `capture_decision_snapshot()` function aggregates all current extracted values

- [x] **4.3** Snapshot AI analysis at decision point
  - Gap analysis (critical/important missing counts and details)
  - Ready for NIST scores and risk summary (columns exist, can populate later)

- [x] **4.4** Implement snapshot capture at decision points
  - `bind_quote()` calls `capture_decision_snapshot('policy_bound')`
  - `generate_quote_document()` calls `capture_decision_snapshot('quote_issued')`

- [x] **4.5** Create snapshot retrieval API endpoints
  - `GET /api/submissions/{id}/snapshots` - all snapshots for submission
  - `GET /api/snapshots/{id}` - full snapshot detail
  - `GET /api/quotes/{id}/snapshots` - snapshots for specific quote
  - `GET /api/quotes/{id}/bind-snapshot` - bind-time snapshot for claims correlation

### Views for Claims Correlation (Phase 5 prep)

- `v_decision_snapshots_summary` - snapshot list with gap counts
- `v_bind_snapshot_for_claims` - bind snapshots formatted for claims analysis

---

## Phase 5: Claims Feedback Loop (Future)

Use claims data to evolve importance priorities.

### Tasks

- [ ] **5.1** Claims root cause analysis UI
- [ ] **5.2** Loss ratio by field value analysis
- [ ] **5.3** Loss ratio by priority version analysis
- [ ] **5.4** Generate v2 priorities from claims data

---

## Phase 6: Proactive Agent Notifications (Future)

Add intelligent notifications that surface issues without user asking.

### Concept

Badge on AI button shows count: `[✨ 3]` meaning "3 things to review"
When panel opens, "Heads up" section shows notifications before chat.
No toast/popup interruptions - user-initiated only.

### Notification Types

**Intake/Setup:**
- [ ] Missing documents detection ("No loss runs found")
- [ ] Stale application warning ("Application is 30+ days old")
- [ ] Duplicate submission detection

**Analyze:**
- [ ] Critical controls gap alert ("3 critical controls not confirmed")
- [ ] Claims history flags ("Ransomware incident 18 months ago")
- [ ] Data anomalies ("Revenue changed 50% from prior year")

**Quote:**
- [ ] Pricing outlier warning ("Premium 40% below peer average")
- [ ] Tower gap detection ("$5M to $10M layer uninsured")

**Policy:**
- [ ] Pending subjectivities with deadline ("2 pending, effective in 5 days")
- [ ] Renewal reminder ("Expires in 30 days")
- [ ] Unprocessed documents ("BOR letter received but not processed")

### Implementation Approach

- [ ] **6.1** Define notification priority levels (critical, warning, info)
- [ ] **6.2** Create notification computation service (runs on submission load)
- [ ] **6.3** Add badge count to AI button
- [ ] **6.4** Build "Heads up" section in agent panel
- [ ] **6.5** Add dismiss/snooze functionality per notification
- [ ] **6.6** Track notification effectiveness (did user act on it?)

---

## Phase 7: Remarket Detection (Prior Submission Linking)

When a submission comes in for an account we've seen before (but didn't bind), leverage prior year data instead of starting from scratch.

### Concept

**Remarket vs Renewal:**
- **Renewal** = Policy approaching expiration → renew with same/similar terms
- **Remarket** = Prior submission exists (quoted but not bound) → new submission for same account

**Value proposition:** Broker sends ABC Corp submission. We quoted them last year but lost to a competitor. Now they're back. We already have:
- Extracted controls and security posture
- Prior year application documents
- UW notes and analysis
- Quote history and pricing
- Decline/loss reason (why we didn't bind)

### Detection Methods

| Method | Reliability | Notes |
|--------|-------------|-------|
| **FEIN match** | High | Federal EIN is unique identifier |
| **Company name fuzzy match** | Medium | "ABC Corp" vs "ABC Corporation" |
| **Domain match** | Medium | insured_domain field |
| **Broker + similar name** | Low | Same broker, similar insured |

### Tasks

- [x] **7.1** Prior submission detection
  - On intake, check for matching FEIN, domain, or company name
  - Score match confidence (exact FEIN = 100%, fuzzy name = 60%)
  - Return list of potential matches with key details
  - File: `db_setup/remarket_detection.sql` (find_prior_submissions function)
  - Auto-detection in `core/pipeline.py` (_detect_remarket)

- [x] **7.2** Remarket linking UI
  - Show "We've seen this account before" prompt
  - Display prior submission summary (date, outcome, premium quoted)
  - "Import prior data" vs "Dismiss" choice
  - Component: `frontend/src/components/RemarketBanner.jsx`
  - Integrated in SubmissionLayout above tab content

- [x] **7.3** Data import from prior submission
  - Copy extracted values (with "prior_submission" source_type)
  - Link documents (reference, don't duplicate)
  - Carry forward UW notes as context
  - API: `POST /submissions/{id}/link-prior`
  - DB function: `import_prior_submission_data()`

- [x] **7.4** Stale data handling
  - Auto-mark imported values as "needs_confirmation"
  - Imported values have source_type = 'prior_submission'
  - TODO: UI to highlight what changed in new application vs prior

- [x] **7.5** Prior submission context for AI
  - Include in agent context: "This account was quoted at $X last year, declined due to [reason]"
  - AI can reference prior analysis when making recommendations
  - Added to `agent_chat()` in `api/main.py`

- [x] **7.6** Remarket analytics
  - Track remarket win rate vs new business
  - Analyze why accounts come back (price? coverage? service?)
  - Time-to-remarket metrics
  - DB views and function: `db_setup/remarket_analytics.sql`
  - API endpoint: `GET /api/analytics/remarket`
  - Component: `frontend/src/components/RemarketAnalyticsCard.jsx`
  - Integrated in AdminPage under "Remarket Analytics" tab

### Data Model

```sql
-- Add to submissions table
ALTER TABLE submissions ADD COLUMN prior_submission_id UUID REFERENCES submissions(id);
ALTER TABLE submissions ADD COLUMN remarket_detected_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN remarket_match_type VARCHAR(20); -- 'fein', 'domain', 'name_fuzzy'
ALTER TABLE submissions ADD COLUMN remarket_match_confidence INTEGER; -- 0-100
```

---

## Phase 8: Policy Renewal Workflow (Future)

Support policy renewal for bound policies approaching expiration.

### Concept

When a policy approaches expiration:
- **Renewal**: Same insured, same/similar terms, updated for new policy period
- Auto-create renewal submission linked to expiring policy
- Compare expiring vs proposed terms

### Tasks

- [x] **8.1** Renewal detection and queue
  - Identify policies expiring in 60/90 days
  - Auto-create renewal submission linked to expiring policy
  - Pre-populate with bind-time data
  - API: `GET /api/renewals/queue` (comprehensive queue)
  - API: `POST /api/renewals/{id}/create-expectation`
  - API: `POST /api/renewals/{id}/mark-received`
  - API: `POST /api/renewals/{id}/mark-not-received`
  - Component: `frontend/src/components/RenewalQueueCard.jsx`
  - AdminPage "Renewals" tab (first tab)

- [x] **8.2** Renewal comparison view
  - Side-by-side: expiring vs renewal terms
  - Highlight changes (coverage, limits, premium)
  - Flag new claims since inception
  - API: `GET /api/submissions/{id}/renewal-comparison`
  - Component: `frontend/src/pages/RenewalPage.jsx`
  - Conditional "Renewal" tab shown for renewal submissions
  - Contextual badge: `frontend/src/components/RenewalContextBadge.jsx`
  - Shows in UnifiedHeader with key change metrics

- [x] **8.3** Renewal pricing
  - Prior year loss ratio calculation
  - Rate change recommendation based on experience
  - Apply renewal credits/debits
  - Module: `core/renewal_pricing.py`
  - API: `GET /api/submissions/{id}/renewal-pricing`
  - UI: Pricing recommendation card in RenewalPage

- [x] **8.4** Decision snapshot for renewals
  - Capture renewal context at bind (prior link, loss ratio, rate change)
  - `capture_renewal_decision_snapshot()` function
  - `v_renewal_decision_history` view for chain tracking
  - API: `GET /api/submissions/{id}/decision-history`
  - Migration: `db_setup/decision_snapshots_renewal.sql`

- [x] **8.5** Renewal automation
  - Auto-create expectations for expiring policies (90 days)
  - Auto-mark overdue expectations as not received (30 days grace)
  - Match incoming submissions to pending expectations
  - Module: `ingestion/renewal_automation.py`
  - APIs: `/api/admin/renewal-automation/*`
  - Pipeline integration for auto-linking

---

## Progress Tracking

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| Phase 1.1-1.8: Data Schema | Complete | 2026-01-06 | 2026-01-06 |
| Phase 1.9: Unified Data Flow | Complete | 2026-01-06 | 2026-01-06 |
| Phase 2: AI Architecture | Complete | 2026-01-05 | 2026-01-05 |
| Phase 3: AI Implementation | Complete | 2026-01-05 | 2026-01-06 |
| Phase 4: Decision Snapshots | Complete | 2026-01-06 | 2026-01-06 |
| Phase 5: Claims Feedback | Not Started | - | - |
| Phase 6: Proactive Notifications | Not Started | - | - |
| Phase 7: Remarket Detection | Complete | 2026-01-06 | 2026-01-06 |
| Phase 8: Policy Renewal | Complete | 2026-01-06 | 2026-01-06 |
| Phase 9: Underwriter Assignment | Complete | 2026-01-06 | 2026-01-06 |
| Phase 10: Policy Issuance Workflow | Complete | 2026-01-06 | 2026-01-06 |
| Phase 11: Email Vote Queue | Not Started | - | - |
| Phase 12: Incumbent/Expiring Tower | Complete | 2026-01-06 | 2026-01-06 |
| Phase 13: UW Knowledge Base | Partial | 2025-12 | - |
| Phase 14: Endorsement Management | Partial | 2025-11 | - |
| Phase 15: UI Enhancements | Not Started | - | - |

### Summary: Done vs Open

**DONE:**
- ✅ Phase 1.1-1.8: Data schema foundation with importance weighting
- ✅ Phase 1.9: Unified Data Flow
  - ✅ Pipeline saves to `submission_extracted_values` (initial + supplemental apps)
  - ✅ All AI functions read from unified table (NIST, gaps, summarize, broker response)
  - ✅ New API endpoints: GET/PATCH extracted-values, needing-confirmation
  - ✅ UI migrated: InformationNeededWidget uses new endpoints
  - ⚠️ Legacy: BrokerResponseModal parse/apply endpoints still write to old table (low priority)
- ✅ Phase 2: AI agent architecture design
- ✅ Phase 3: AI agent implementation
  - ✅ UW Assistant (gaps, summarize, NIST, broker response)
  - ✅ Quote Assistant (generate options, build tower, modify coverages)
  - ✅ Admin: Extend policy, Change broker, Mark subjectivity, Issue policy
  - ✅ Admin: Cancel policy, Reinstate policy, Decline submission, Add note
  - ⚠️ Admin: File document - needs file upload handling
- ✅ Phase 4: Decision-point snapshots
  - ✅ `decision_snapshots` table with frozen extracted values and gap analysis
  - ✅ `capture_decision_snapshot()` function called at quote/bind
  - ✅ 4 API endpoints for snapshot retrieval
  - ✅ Views ready for Phase 5 claims correlation

- ✅ Phase 7: Remarket Detection
  - ✅ Prior submission detection (FEIN, domain, fuzzy name)
  - ✅ Remarket linking UI with import capability
  - ✅ Remarket analytics dashboard
- ✅ Phase 8: Policy Renewal Workflow
  - ✅ Renewal queue UI in AdminPage
  - ✅ Renewal comparison view (dedicated tab + header badges)
  - ✅ Renewal pricing with loss ratio and experience factors
  - ✅ Decision snapshots for renewals
  - ✅ Renewal automation (expectations, matching, overdue handling)
- ✅ Phase 10: Policy Issuance Workflow
  - ✅ `is_critical` flag for subjectivities (blocking vs warning-only)
  - ✅ Deadline enforcement with overdue/due-soon tracking
  - ✅ `get_issuance_status()` with full checklist
  - ✅ PolicyPage issuance checklist UI
  - ✅ Admin dashboard for pending subjectivities (filter by deadline status)
- ✅ Phase 9: Underwriter Assignment
  - ✅ Submission-level assignment fields (`assigned_uw_name`, `assigned_at`, `assigned_by`)
  - ✅ Assignment history tracking table with audit trail
  - ✅ API endpoints: POST /assign, POST /unassign, GET /assignment-history
  - ✅ SubmissionsListPage: "My Queue" filter with quick toggle buttons
  - ✅ SubmissionHeaderCard: Assignment dropdown for reassignment
- ✅ Phase 12: Incumbent/Expiring Tower
  - ✅ `expiring_towers` table for capturing incumbent coverage snapshots
  - ✅ DB functions: `capture_expiring_tower_from_prior()`, `get_tower_comparison()`
  - ✅ `v_incumbent_analytics` view for win/loss tracking by carrier
  - ✅ Core module `core/expiring_tower.py` with CRUD and comparison functions
  - ✅ API endpoints: GET/POST/PATCH/DELETE expiring-tower, tower-comparison
  - ✅ `TowerComparison` component in QuotePage for side-by-side comparison
  - ✅ Comparison shows: limit, retention, premium, RPM with change indicators

**PARTIAL:**
- ⚠️ Phase 13: UW Knowledge Base
  - ✅ UW Guide frontend with 5 tabs (Conflicts, Market News, Field Definitions, Guidelines, Supplemental Questions)
  - ✅ Conflict rules system with AI discovery
  - ✅ Market news with AI tagging/summarization
  - ⏳ Remaining: Organization/docs, move questions to DB, API layer, credibility score UI
- ⚠️ Phase 14: Endorsement Management
  - ✅ Full endorsement schema (document_library, quote_endorsements, policy_endorsements)
  - ✅ Quote-level endorsements with auto-attach rules
  - ✅ Mid-term endorsement lifecycle (draft → issued → void)
  - ✅ Fill-in variables system
  - ⏳ Remaining: Fill-in UI decision, more endorsement types, coverage editor integration

**FUTURE:**
- Phase 5: Claims feedback loop
- Phase 6: Proactive agent notifications
- Phase 11, 15: See detailed sections below

---

## Phase 9: Underwriter Assignment ✅

Track who is working on each submission/account.

### Completed

- [x] **9.1** Submission-level assignment fields
  - `assigned_uw_name` - current assignee (string-based, no users table needed yet)
  - `assigned_at` - when assigned
  - `assigned_by` - who assigned (can be auto or manual)
  - Migration: `db_setup/underwriter_assignment.sql`

- [x] **9.2** Assignment history tracking
  - `submission_assignment_history` table with audit trail
  - `assign_submission()` and `unassign_submission()` DB functions
  - Views: `v_my_submissions`, `v_unassigned_submissions`, `v_assignment_workload`
  - API: `POST /api/submissions/{id}/assign`
  - API: `POST /api/submissions/{id}/unassign`
  - API: `GET /api/submissions/{id}/assignment-history`
  - API: `GET /api/assignment-workload`

- [x] **9.3** Assignment UI
  - SubmissionsListPage: "My Queue" toggle with quick filter buttons
  - SubmissionsListPage: "Viewing as" user selector (persisted to localStorage)
  - SubmissionsListPage: Assigned column showing assignee
  - SubmissionHeaderCard: Assignment dropdown for reassignment
  - Color-coded badges (blue = me, orange = unassigned)

### Future Enhancement
- Auto-assignment logic (round-robin, broker relationship, specialization)

---

## Phase 10: Policy Issuance Workflow ✅

Complete the bind → issue workflow with subjectivity tracking.

### Completed

- [x] **10.1** Subjectivity deadline tracking
  - `is_critical` flag to distinguish blocking vs warning-only
  - `due_date` field with deadline status calculation
  - `get_overdue_subjectivities()`, `check_deadline_warnings()`
  - Migration: `db_setup/subjectivities_deadline.sql`

- [x] **10.2** Policy issuance checklist
  - `get_issuance_status()` returns full checklist with warnings
  - Checklist items: bound, binder generated, subjectivities received, policy issued
  - Blocking items list for what prevents issuance

- [x] **10.3** Issuance workflow UI
  - `IssuanceChecklist` component with color-coded status
  - PolicyPage shows checklist with warnings and blocking items
  - Issue button disabled until requirements met
  - API: `GET /api/submissions/{id}/issuance-status`
  - API: `POST /api/submissions/{id}/issue-policy`

- [x] **10.4** Admin pending subjectivities dashboard
  - Cross-account view of all pending subjectivities
  - Filter by: All / Overdue / Due Soon
  - Quick actions: Mark received, Waive
  - API: `GET /api/admin/pending-subjectivities?filter=`

---

## Phase 11: Email Vote Queue

Allow voting on prescreen submissions via email link.

### Concept

Underwriters receive daily email with prescreen submissions. Each card has voting buttons that work directly from the email (no login required for simple votes).

### Tasks

- [ ] **11.1** Email template design
  - Summary cards for each pending submission
  - Quick vote buttons (Pursue / Pass / Need Info)
  - Links to full submission if more detail needed

- [ ] **11.2** Tokenized vote links
  - Secure tokens that encode: submission_id, voter_id, vote_type
  - Expiration (e.g., 24 hours)
  - One-click voting without login

- [ ] **11.3** Vote aggregation
  - Same logic as web voting
  - Email notification when consensus reached
  - Digest of voting activity

- [ ] **11.4** Scheduled email dispatch
  - Daily digest of pending votes
  - Configurable time (e.g., 7am local)
  - Skip if no pending items

---

## Phase 12: Incumbent/Expiring Tower ✅

Capture and display incumbent carrier information for competitive analysis.

### Completed

- [x] **12.1** Expiring tower data model
  - `expiring_towers` table with carrier, limit, retention, premium, tower_json
  - Links to submission and prior_submission
  - `capture_expiring_tower_from_prior()` DB function
  - `get_tower_comparison()` DB function for comparison data
  - Migration: `db_setup/expiring_towers.sql`

- [x] **12.2** Core module and API
  - `core/expiring_tower.py` with CRUD and comparison functions
  - API: `GET/POST/PATCH/DELETE /api/submissions/{id}/expiring-tower`
  - API: `GET /api/submissions/{id}/tower-comparison`
  - API: `POST /api/submissions/{id}/capture-expiring-tower`
  - API: `GET /api/admin/incumbent-analytics`

- [x] **12.3** Competitive analysis UI
  - `TowerComparison` component in QuotePage
  - Side-by-side: Expiring vs Proposed
  - Shows limit, retention, premium with change indicators
  - Rate per million (RPM) comparison
  - Only displays for renewals with expiring tower data

- [x] **12.4** Win/loss tracking by incumbent
  - `v_incumbent_analytics` view
  - Tracks submission count, won/lost, win rate by carrier
  - Average premium when won

### Future Enhancement
- Extract expiring tower from documents (dec pages, applications)
- Manual entry UI for expiring coverage

---

## Phase 13: UW Knowledge Base (Partially Complete)

Living underwriting guide accessible to AI agents.

### Already Built

- [x] **UW Guide Frontend** (`/uw-guide` route, `pages_workflows/uw_guide.py`)
  - 5-tab Streamlit dashboard: Conflicts, Market News, Field Definitions, Guidelines, Supplemental Questions
  - Full-featured UI with filters, dialogs, CRUD operations

- [x] **Conflict Rules System**
  - `conflict_rules` table with 12 seeded rules (EDR, MFA, Backup, Business Model, Scale)
  - `detected_conflicts` table for instance tracking
  - Detection patterns (field comparison + context-based)
  - AI discovery of new rules (`ai/conflict_analyzer.py`)

- [x] **Market News**
  - `market_news` table with title, URL, source, tags, summary
  - AI-powered tagging and summarization (`ai/market_news_intel.py`)
  - CRUD UI with auto-generate button

- [x] **Field Definitions & Guidelines**
  - Static markdown reference for application fields
  - Credibility score interpretation guide

- [x] **Supplemental Questions**
  - 9 risk area categories with extensive Q&A content
  - Biometric Data, OT/ICS, Healthcare/PHI, Crypto, AI/ML, etc.

### Remaining Work

- [ ] **13.1** Organization & Documentation
  - Document rule naming conventions and lifecycle
  - Define approval workflow for new rules
  - Add version tracking to conflict rules

- [ ] **13.2** Move Supplemental Questions to Database
  - Create `supplemental_questions` and `risk_categories` tables
  - Store `submission_supplemental_answers` for tracking
  - Dynamic form generation based on submission profile

- [ ] **13.3** API Layer for External Access
  - `GET /api/uw-guide/conflicts` - List rules with filters
  - `GET /api/uw-guide/market-news` - Searchable articles
  - Enable broker portal integration

- [ ] **13.4** Credibility Score UI
  - Display score breakdown in Guidelines tab
  - Link to specific contradiction examples
  - Actionable recommendations ("Request clarification on these points")

---

## Phase 14: Endorsement Management (Mostly Complete)

UI for managing endorsements with fill-in fields.

### Already Built

- [x] **Database Schema**
  - `document_library` - Endorsement templates with fill_in_mappings, auto_attach_rules
  - `quote_endorsements` - Junction table with field_values JSONB
  - `policy_endorsements` - Mid-term transactions with status lifecycle
  - `endorsement_component_templates` - Reusable sections (header, lead-in, closing)

- [x] **Quote-Level Endorsements**
  - Three-section selector: Required (locked), Auto-Added (rules), Manual Selection
  - Auto-attach rule evaluation based on quote data
  - `fill_in_mappings` system for placeholder variables
  - `field_values` storage per quote (e.g., additional insured names)

- [x] **Mid-Term Endorsements**
  - Full lifecycle tracking: draft → issued → void
  - Endorsement types: coverage_change, cancellation, extension, name_change, address_change, erp, bor_change, reinstatement
  - Premium calculation (pro-rata, flat methods)
  - Document generation with PDF storage
  - `carries_to_renewal` flag

- [x] **Document Library Admin**
  - CRUD for endorsement templates
  - Auto-attach rule editor
  - Fill-in mapping configuration
  - Component templates management

- [x] **Fill-In Variables System**
  - Policy data: `{{insured_name}}`, `{{effective_date}}`, `{{aggregate_limit}}`, etc.
  - Mid-term data: `{{endorsement_effective_date}}`, `{{previous_broker}}`, `{{new_broker}}`

### Remaining Work

- [ ] **14.1** Fill-In UI Decision
  - **Option A**: Embedded in endorsement selection flow
  - **Option B**: Separate "Additional Information" screen
  - Need to decide where fill-in values are entered and reviewed

- [ ] **14.2** Additional Endorsement Types
  - Additional Insured endorsements with schedule generation
  - Waiver of Subrogation
  - Notice of Cancellation
  - Other carrier-specific forms

- [ ] **14.3** Coverage Change Editor Integration
  - Full CoverageEditor integration for `coverage_change` endorsements
  - Visual diff of before/after coverage
  - See `PLAN_midterm_endorsement_redesign.md`

- [ ] **14.4** Document Generation Polish
  - Placeholder substitution in generated PDFs
  - Preview before finalizing
  - Batch endorsement generation

---

## Phase 15: UI Enhancements

Various UI improvements for usability.

### Tasks

- [ ] **15.1** Header editing
  - Edit revenue directly in header
  - Edit industry/NAICS in header
  - Inline editing pattern

- [ ] **15.2** Setup page full screen
  - Remove sidebar on setup
  - Full-width document viewer
  - Better use of screen real estate

- [ ] **15.3** Responsive improvements
  - Mobile-friendly submission list
  - Tablet layout for underwriting
  - Keyboard navigation

- [ ] **15.4** Dark mode
  - Theme toggle in settings
  - Persist preference
  - System preference detection

---

## Related Work: Page Consolidation

Branch: `feature/page-consolidation`

UI improvements in progress (separate from this roadmap):
- SubmissionHeaderCard - Premium summary card component
- AnalyzePageV2 - Two-column case file layout
- UnifiedHeader - Shared header across submission pages
- Control update workflow spec

---

## Related Planning Documents

This roadmap is part of a larger planning ecosystem. See:

- **[MASTER_ROADMAP.md](MASTER_ROADMAP.md)** - Central hub for all planning documents
- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Detailed status of all planning documents

### Feature-Specific Plans Referenced in This Roadmap

- **[review-uw-redesign-roadmap.md](implemented/review-uw-redesign-roadmap.md)** - Review/UW page redesign (Phase 1-4 complete) ✅
- **[unified-extraction-panel-plan.md](implemented/unified-extraction-panel-plan.md)** - Unified extraction panel (Phases 1-5 complete) ✅
- **[benchmarking_tab_plan.md](implemented/benchmarking_tab_plan.md)** - Benchmarking tab (✅ Complete)
- **[conflict_review_implementation_plan.md](implemented/conflict_review_implementation_plan.md)** - Conflict detection system (✅ Complete)
- **[broker_relationship_management_plan.md](broker_relationship_management_plan.md)** - Broker CRM (⚠️ Partial)
- **[collaborative-uw-workflow-spec.md](collaborative-uw-workflow-spec.md)** - Collaborative voting workflow (⚠️ Partial)
- **[coverage_sublimits_plan.md](implemented/coverage_sublimits_plan.md)** - Coverage/sublimits management (✅ Complete)
- **[loss-history-enhancements.md](implemented/loss-history-enhancements.md)** - Loss history improvements (✅ Complete)
- **[PLAN_midterm_endorsement_redesign.md](../PLAN_midterm_endorsement_redesign.md)** - Endorsement system redesign (✅ Mostly complete)

### Other Planning Documents

- **[page-consolidation-project.md](page-consolidation-project.md)** - Page consolidation (7→5 pages) - ❌ Not started
- **[document_library_redesign.md](document_library_redesign.md)** - Document library component architecture - ❌ Not started
- **[retro_schedule_plan.md](retro_schedule_plan.md)** - Retro schedule smart defaults - ❌ Not started

## Reference Documents

- `/docs/unified-data-architecture-vision.md` - Full architecture vision
- `/ai/admin_agent.py` - Existing admin agent (Streamlit)
- `/pages_components/ai_command_box.py` - Existing quote command box (Streamlit)
