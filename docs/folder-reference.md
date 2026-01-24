# Folder Reference

Quick reference for what each folder/file in the project root does.

---

## Hidden Files & Folders (dot files)

These are typically tool/environment configs. Most are gitignored.

| Item | What It Is | Gitignored? | Safe to Delete? |
|------|-----------|-------------|-----------------|
| `__pycache__/` | Python bytecode cache. Auto-generated when Python runs. | Yes | Yes - regenerates automatically |
| `.claude/` | Claude Code session data, plans, settings | Yes | Yes - just loses session history |
| `.env` | Environment variables (DB credentials, API keys) | Yes | NO - contains secrets |
| `.envrc` | direnv config - auto-loads .env when entering directory | Usually yes | Only if not using direnv |
| `.git/` | Git repository data. All version history lives here. | N/A | NO - destroys repo |
| `.gitignore` | Tells git which files to ignore | No (tracked) | NO - essential |
| `.playwright-mcp/` | Playwright MCP browser automation data | Yes | Yes - regenerates |
| `.streamlit/` | Streamlit config (themes, settings) | Usually no | Check contents first |
| `.venv/` | Python virtual environment. All installed packages. | Yes | Yes - recreate with `pip install -r requirements.txt` |

---

## Key Takeaways

**Never delete:**
- `.env` (secrets)
- `.git/` (version history)
- `.gitignore` (tracked config)

**Safe to delete (regenerate automatically):**
- `__pycache__/`
- `.venv/` (just reinstall deps)
- `.claude/`
- `.playwright-mcp/`

**Check before deleting:**
- `.streamlit/` - may have custom config
- `.envrc` - only if you don't use direnv

---

## ai/ - AI/LLM Integration

Python modules for AI-powered extraction, classification, and analysis. Called by the API layer.

| File | Lines | Purpose | Used By |
|------|-------|---------|---------|
| `application_extractor.py` | 918 | Extract structured data from insurance apps (Claude) | API |
| `textract_extractor.py` | 431 | AWS Textract PDF text extraction | API |
| `document_classifier.py` | 312 | Classify PDFs (app, quote, loss run, etc.) | API |
| `document_extractor.py` | 221 | Basic text extraction from PDF/DOCX | API |
| `schema_recommender.py` | 284 | Analyze extraction gaps, recommend schema changes | API |
| `sublimit_intel.py` | 378 | Parse coverages from quote documents | API |
| `ai_decision.py` | 625 | Rule-based underwriting decisions | API |
| `ocr_utils.py` | 309 | OCR utilities with fallback | Support module |
| `guideline_rag.py` | 352 | RAG for underwriting guidelines Q&A | core/ (shared) |
| `conflict_analyzer.py` | 536 | Detect conflicts in application data | core/ (shared) |
| `load_guidelines.py` | 68 | Load guidelines into vector store | One-time script |
| `naics_2022_...parquet` | — | NAICS code embeddings | Data file |

### Notes

**Archived to `archive/streamlit/ai/`:**
- `admin_agent.py` - AI chat for admin commands
- `tower_intel.py` - AI for tower commands
- `market_news_intel.py` - AI for news tagging

**Architecture note:** Python backend for AI is correct even with React frontend. Python has superior AI/ML libraries (anthropic, openai, langchain, pandas, AWS SDK). The pattern is:
- React frontend → calls Python API → API uses ai/ modules
- This is industry standard for AI-heavy apps

---

## api/ - Backend API

**What this is (layman's terms):**
This is the "middleman" between the React frontend and the database/AI services. When you click a button in the app, React sends a request to this API, which then fetches data, runs AI extraction, saves to the database, etc., and sends the result back. Think of it as the kitchen in a restaurant - the frontend is the waiter taking orders, the API is the kitchen doing the actual work.

**Framework:** FastAPI (modern Python web framework)

| File | Lines | Purpose |
|------|-------|---------|
| `main.py` | 15,003 | All API endpoints (everything in one file) |
| `__init__.py` | — | Package marker |

**Endpoint breakdown (328 total):**
| Domain | Count | What It Handles |
|--------|-------|-----------------|
| submissions | 73 | Insurance submission workflow |
| uw-guide | 31 | Underwriting guidelines/decisions |
| quotes | 27 | Quote creation and management |
| brkr | 20 | Broker portal integration |
| workflow | 17 | Status transitions, approvals |
| coverage-catalog | 16 | Coverage types/definitions |
| admin | 12 | Admin functions |
| schemas | 11 | Data extraction schemas |
| + 15 more | ~110 | Various other features |

### Is 328 endpoints excessive?

**No, the count is reasonable.** Looking at the endpoint structure:
- Well-designed RESTful patterns (`/submissions/{id}/documents`)
- Logical nesting (`/structures/{id}/variations`)
- Clear action endpoints (`/extractions/{id}/accept`)

For a full-featured insurance underwriting platform with document extraction, quote management, broker integration, and workflow automation - 328 endpoints is appropriate. Enterprise business apps commonly have hundreds of endpoints.

**The problem is purely organizational** - having 15K lines in one file makes it hard to:
- Find what you're looking for
- Avoid merge conflicts when multiple people edit
- Understand the codebase

### TODO: Refactor into routers

**Priority:** Medium (works fine, but painful to maintain)

**Target structure:**
```
api/
  main.py              (~100 lines - just app setup + imports)
  routers/
    submissions.py     (73 endpoints)
    quotes.py          (27 endpoints)
    uw_guide.py        (31 endpoints)
    broker.py          (20 endpoints)
    ...etc
```

FastAPI has built-in support for this via `APIRouter`. Each router file would contain related endpoints, then main.py just imports and registers them.

**When to do this:**
- When you have a slow period
- When a major API change is needed anyway
- Not urgent - it works, just awkward

---

## archive/ - Historical Reference

**Status:** Do not use. Kept for historical reference only.

**What this is (layman's terms):**
A "museum" of old code. When we replaced or abandoned something, it went here instead of being deleted. Useful if you need to see how something used to work, but never import or run this code.

### Root files (old Streamlit pages)

| File | Size | What It Was |
|------|------|-------------|
| `submissions.py` | 42KB | Old submissions workflow |
| `brokers.py` | 32KB | Old broker management |
| `broker_management_v2.py` | 20KB | Broker management iteration |
| `broker_management.py` | 14KB | Earlier broker version |
| `normalize_broker_structure.py` | 8KB | One-time data migration |
| `upload_pdfs_to_storage.py` | 5KB | One-time upload script |
| `update_outcome_constraint.py` | 2KB | DB constraint script |
| `create_loss_history_table.sql` | 2KB | DB migration (already run) |
| `docker-compose.yml` | <1KB | Old Docker config |

### Subfolders

| Folder | Files | Purpose |
|--------|-------|---------|
| `streamlit/` | ~60 | **Complete Streamlit frontend** - app.py, pages/, pages_workflows/, pages_components/, plus Streamlit-only AI and core modules |
| `attachments/` | 2 | Sample test attachments |
| `responses/` | 2 | Sample API response JSON |
| `legacy_viewers/` | 2 | Old Streamlit viewer versions |
| `failed_modular/` | 11 | Over-simplified refactor attempt |
| `mockups-streamlit/` | 5 | UI mockup experiments |
| `dev_scripts/` | 2 | One-time dev utilities |
| `setup_scripts/` | 4 | DB setup scripts (already run) |
| `tests/` | 6 | Old development tests |

### archive/streamlit/ Contents

The complete Streamlit frontend, archived after React reached full parity:

| Folder | Purpose |
|--------|---------|
| `app.py` | Streamlit entry point |
| `pages/` | Streamlit page wrappers |
| `pages_workflows/` | Page implementations (~8K lines) |
| `pages_components/` | Reusable UI components (~21K lines) |
| `ai/` | Streamlit-only AI modules (admin_agent, tower_intel, market_news_intel) |
| `core/` | Streamlit-only core modules (policy_tab_data, market_news) |
| `utils/` | Streamlit utilities (tab_state) |
| `.streamlit/` | Streamlit config |
| `STYLE_GUIDE.md` | Streamlit UI conventions |

### Notes

- README.md documents "do not use" status
- Safe to delete if space needed (check with team first)
- Could slim down by deleting test data (`attachments/`, `responses/`)

---

## sandbox/ - Side Projects & Experiments

**What this is:** A place for side projects, experiments, and demos that aren't part of the main application. Kept in-repo for convenience when running parallel Claude sessions.

| Folder | Description | Status |
|--------|-------------|--------|
| `broker_portal/` | Self-service portal for brokers to view submissions, stats, upload docs | On hold |
| `mock_broker_platform/` | Demo showing how broker platforms would submit new business via API | POC/Demo |
| `financial-crimes/` | Unified Financial Crimes Response - product/endorsement idea | WIP |
| `vendor-marketing/` | Vendor panel marketing collateral | WIP |
| `cyber-application/` | Cyber insurance application/questionnaire mockup | WIP |

**Notes:**
- `broker_portal/` is well-structured (FastAPI + React) - could serve as template for API refactor
- Document projects use Claude for nice PDF generation
- Run `python utils/html_to_pdf.py input.html` for HTML→PDF conversion

---

## docs/ - Documentation

**What this is:** Project documentation organized by lifecycle stage.

**Master file:** `ROADMAP.md` - the orchestrator that links to everything else.

### Structure

```
docs/
├── ROADMAP.md              # Master orchestrator - start here
├── architecture.md         # HOW things work (data flow, components)
├── folder-reference.md     # WHERE things are (this file)
├── projects/               # Project documentation by lifecycle
│   ├── active/             # Currently in progress
│   ├── backlog/            # Planned but not started
│   ├── implemented/        # Completed features
│   └── legacy/             # Abandoned/outdated
└── guides/                 # Stable operational guides
```

### Project Lifecycle

| Folder | Purpose | When to Use |
|--------|---------|-------------|
| `active/` | Work in progress | Feature currently being built |
| `backlog/` | Planned future work | Spec exists, not started |
| `implemented/` | Completed features | Feature shipped, doc is historical reference |
| `legacy/` | Abandoned/outdated | Superseded or no longer accurate |

### Key Files

| File | Purpose |
|------|---------|
| `ROADMAP.md` | Current priorities, active work, backlog overview |
| `architecture.md` | System architecture, data flow, component relationships |
| `folder-reference.md` | File/folder inventory with purpose descriptions |

### Guides

Stable operational documentation:

| Guide | Purpose |
|-------|---------|
| `account-renewal-guide.md` | Account renewal workflow |
| `conflicts_guide.md` | Conflict detection system |
| `document-generation-guide.md` | Document generation system |
| `quote-v3-smoke.md` | QuotePageV3 testing checklist |
| `supabase-security-fix.md` | Supabase security configuration |
| `supabase-storage-setup.md` | Supabase storage setup |

---

## CLAUDE.md - AI Session Instructions

**What this is:** Project instructions that Claude Code reads automatically at the start of every session. Sets context, conventions, and patterns.

**Status:** Needs update - currently Streamlit-focused, should reflect React as primary frontend.

### TODO: Update CLAUDE.md

After completing folder review, update to include:
- [ ] Add note that React is primary frontend, Streamlit is legacy
- [ ] Add React/Vite patterns and conventions
- [ ] Add React component patterns (`frontend/src/components/`)
- [ ] Add API integration patterns for React
- [ ] Add key React utilities (`frontend/src/utils/`)
- [ ] Keep Streamlit section as reference (collapsed/secondary)
- [ ] Update architecture diagram to show React frontend
- [ ] Any other patterns discovered during folder review

---

## core/ - Business Logic

**What this is (layman's terms):**
The "brain" of the application. While `api/` handles HTTP requests and `ai/` handles AI calls, `core/` contains the actual business rules - how submissions flow through the system, how documents get generated, how conflicts are detected, etc. This is the code that knows about insurance, not just about web requests.

**Stats:** 37 modules, ~23,500 lines total

### Modules Used by API (available to React)

| Module | Lines | Purpose |
|--------|-------|---------|
| `extraction_orchestrator.py` | 1,651 | Coordinate document extraction |
| `package_generator.py` | 1,729 | Generate quote/binder packages |
| `document_generator.py` | 1,008 | Generate documents |
| `policy_catalog.py` | 1,231 | Policy form management |
| `endorsement_management.py` | 1,040 | Endorsement handling |
| `credibility_score.py` | 882 | Calculate credibility scores |
| `subjectivity_management.py` | 771 | Manage subjectivities |
| `document_library.py` | 611 | Document library operations |
| `benchmarking.py` | 624 | Benchmarking comparisons |
| `enhancement_management.py` | 533 | Enhancement handling |
| `broker_relationship.py` | 531 | Broker relationships |
| `supplemental_questions.py` | 544 | Supplemental questions |
| `policy_issuance.py` | 503 | Policy issuance |
| `renewal_management.py` | 451 | Renewal handling |
| `agent_notifications.py` | 455 | Agent notifications |
| `bind_validation.py` | 391 | Bind validation |
| `renewal_pricing.py` | 410 | Renewal pricing |
| `claims_correlation.py` | 422 | Claims correlation |
| `expiring_tower.py` | 280 | Expiring tower handling |
| `storage.py` | 217 | File storage operations |

### Modules NOT in API (internal use)

| Module | Lines | Purpose | Notes |
|--------|-------|---------|-------|
| `pipeline.py` | 2,235 | Main submission processing | May be called indirectly |
| `conflict_service.py` | 1,123 | Conflict detection service | Uses ai/conflict_analyzer |
| `conflict_detection.py` | 889 | Conflict detection | Related to conflict_service |
| `bor_management.py` | 691 | Broker of record | May need API exposure |
| `account_management.py` | 612 | Account operations | May need API exposure |
| `credibility_config.py` | 500 | Credibility configuration | Config/support module |
| `bound_option.py` | 470 | Bound option handling | May need API exposure |
| `document_router.py` | 415 | Document routing | Internal routing logic |
| `submission_inheritance.py` | 381 | Submission inheritance | Internal logic |
| `conflict_config.py` | 376 | Conflict configuration | Config module |
| `compliance_management.py` | 301 | Compliance management | May need API exposure |
| `prior_submission.py` | 284 | Prior submission lookup | May need API exposure |
| `status_history.py` | 247 | Status history tracking | Utility |
| `submission_status.py` | 222 | Status utilities | Utility |
| `db.py` | 39 | Database connection | Utility |

**Archived to `archive/streamlit/core/`:**
- `policy_tab_data.py` - Streamlit policy tab support
- `market_news.py` - Streamlit market news feature

### TODO: Potential Refactors

**Large files to consider splitting:**
| File | Lines | Why Consider |
|------|-------|--------------|
| `pipeline.py` | 2,235 | Main orchestration - could split by phase |
| `package_generator.py` | 1,729 | Document generation - could split by doc type |
| `extraction_orchestrator.py` | 1,651 | Complex extraction flow |
| `policy_catalog.py` | 1,231 | Large but domain-cohesive |
| `conflict_service.py` | 1,123 | Could split rules from service |

**Before refactoring:** These work. Only refactor if:
- You're making significant changes anyway
- The file is causing merge conflicts
- New developers struggle to understand it

**Modules to review for API exposure:**
- `account_management.py` - likely needed for React
- `bor_management.py` - broker of record functions
- `bound_option.py` - binding workflow
- `compliance_management.py` - compliance features
- `prior_submission.py` - prior submission lookup

---

## db_setup/ - Database Migrations

**What this is (layman's terms):**
Scripts that create and modify database tables. When you add a new feature that needs to store data, you write a script here to create the table or add columns.

**Stats:** 88 files, ~13,000 lines

| Type | Count | Pattern |
|------|-------|---------|
| Create table | ~25 | `create_*.sql` |
| Alter/migrate | ~20 | `alter_*.sql`, `migrate_*.sql` |
| Seed data | ~8 | `seed_*.sql`, `seed_*.py` |
| Python helpers | ~15 | `*.py` |

**Largest files:**
| File | Lines | Purpose |
|------|-------|---------|
| `seed_comprehensive_schema_v3.sql` | 1,250 | Seed extraction schema |
| `collaborative_workflow_tables.sql` | 678 | Workflow tables |
| `ai_knowledge_governance.sql` | 398 | AI knowledge tables |
| `policy_catalog_tables.sql` | 383 | Policy catalog |

### TODO: Database Schema Maintenance

**Problem:** This folder is incomplete. Not all tables were created via scripts here - some were created directly in Supabase. So you can't reliably set up a fresh DB from these scripts alone.

**Action items:**
1. [ ] Export full schema from Supabase: `pg_dump --schema-only`
2. [ ] Review exported schema vs scripts in this folder
3. [ ] Create a single `full_schema.sql` that can set up a fresh DB
4. [ ] Optionally archive individual migration scripts to `db_setup/migrations_archive/`
5. [ ] Add README explaining:
   - How to set up fresh DB (run `full_schema.sql`)
   - How to add new migrations going forward
   - Which seed scripts are needed for baseline data

**Why this matters:**
- New developer onboarding
- Setting up test/staging environments
- Disaster recovery
- Understanding what the database actually looks like

---

## frontend/ - React App (Primary UI)

**What this is (layman's terms):**
The main user interface. This is the React application that internal underwriters use daily. It talks to the Python API to fetch and save data.

**Stats:** ~55,000 lines across 85 JS/JSX files

**Tech:** React + Vite

### Structure

| Folder | Files | Purpose |
|--------|-------|---------|
| `src/components/` | 50 | Reusable React components |
| `src/pages/` | 28 | Page-level components |
| `src/utils/` | 3 | Utility functions |
| `src/hooks/` | 2 | React hooks |
| `src/api/` | 1 | API client |
| `src/layouts/` | 1 | Layout wrapper |
| `src/pages/_archive/` | 5 | Old page versions (v1) |

### Large Files (potential refactor candidates)

**Pages:**
| File | Lines | Notes |
|------|-------|-------|
| `AdminPage.jsx` | 3,717 | Very large - consider splitting |
| `QuotePage.jsx` | 2,832 | Large |
| `UWGuidePage.jsx` | 2,570 | Large |
| `QuotePageV2.jsx` | 2,389 | Older version |
| `PolicyPage.jsx` | 1,977 | Large |

**Components:**
| File | Lines |
|------|-------|
| `SummaryTabContent.jsx` | 1,936 |
| `SubjectivitiesCard.jsx` | 1,261 |
| `CoverageEditor.jsx` | 1,170 |

### Notes

- **`frontend/docs/`** - HTML mockups for tower visualizations (design experiments). Could move to `sandbox/mockups/`.
- **`src/pages/_archive/`** - Good pattern for keeping old page versions without cluttering main folder.
- **QuotePageV2 vs V3** - Multiple versions exist. May want to consolidate once V3 is stable.

---

## rating_engine/ - Premium Calculation & Document Templates

**Status:** Active - core business logic. **Note: Logic is expected to change.**

**What this is (layman's terms):**
The math behind insurance pricing. Takes inputs (revenue, industry, limits, controls) and outputs a premium. Also contains HTML templates for generating quote/binder/policy documents.

**Python files:**
| File | Lines | Purpose |
|------|-------|---------|
| `coverage_config.py` | 332 | Coverage configuration |
| `engine.py` | 286 | Rating engine core |
| `premium_calculator.py` | 282 | Premium calculations |

**Config files (`config/`):**
| File | Purpose |
|------|---------|
| `hazard_base_rates.yml` | Base rates by hazard class |
| `industry_hazard_map.yml` | Industry to hazard mapping |
| `control_modifiers.yml` | Security control adjustments |
| `limit_factors.yml` | Limit factors |
| `retention_factors.yml` | Retention factors |
| `coverage_defaults.yml` | Default coverage settings |

**Document templates (`templates/`):**
- `quote_primary.html`, `quote_excess.html` - Quote documents
- `binder.html` - Binder document
- `policy_combined.html` - Policy document
- `_base.html`, `_components/`, `policy_forms/` - Template partials

**Used by:**
- API (React-connected)
- `core/document_generator.py`, `core/package_generator.py`
- Streamlit components (will migrate to API)

**Note:** Rating logic is expected to change. When updating:
- Config files (`.yml`) control most adjustable parameters
- `engine.py` and `premium_calculator.py` contain the calculation logic
- Document templates may need updates to reflect new premium structure

---

## fixtures/ - Test Data

**What this is:** Sample submission data for development and testing the ingestion pipeline.

| Folder | Description |
|--------|-------------|
| `acme/` | Sample submission (email + standardized output) |
| `karbon steel/` | Full sample submission (email, PDF app, standardized JSON) |
| `karbon_steel_LM/` | Variant of karbon steel test case |
| `moog/` | Full sample submission with ProAssurance app |
| `email_dumps/` | Sample email JSON dumps for testing email ingestion |

**Usage:** Test document ingestion, email parsing, standardized JSON output format.

**Note:** Gitignored (except README.md) - test data files are local/dev only.

---

## ingestion/ - Document Ingestion Pipeline

**What this is:** Handles getting documents into the system - email inbox polling, local file ingestion, and PDF text extraction.

| File | Lines | Purpose | Used By |
|------|-------|---------|---------|
| `pdf_textract.py` | 413 | AWS Textract PDF extraction | **API** |
| `poll_inbox_background_worker.py` | 223 | Background email polling | Background service |
| `ingest_local.py` | 172 | Local file ingestion | CLI tool |
| `email_polling.py` | 158 | Email polling logic | Background service |

**Relationship to ai/:**
- `ingestion/` = Transport layer (getting files in)
- `ai/` = Intelligence layer (understanding files)

They work together: ingestion fetches → ai extracts/classifies.

---

## utils/ - Utility Functions

| File | Lines | Purpose |
|------|-------|---------|
| `html_to_pdf.py` | 42 | HTML→PDF conversion via WeasyPrint |
| `performance_monitor.py` | 285 | Performance monitoring utilities |
| `policy_summary.py` | 195 | Policy summary generation |
| `quote_formatting.py` | 65 | Quote formatting utilities |
| `quote_option_factory.py` | 430 | Quote option creation |
| `test_extraction_diagnostic.py` | 113 | CLI tool for testing extraction pipeline |

**Notes:**
- `test_extraction_diagnostic.py` - run via `python utils/test_extraction_diagnostic.py file.pdf`
- `tab_state.py` archived to `archive/streamlit/utils/`

---

## training docs/ - Training Materials

Training documents for the AI system.

| Folder | Purpose |
|--------|---------|
| `sample submissions/` | Example submission emails and docs |
| `training applications/` | Insurance application samples |
| `training applications completed/` | Completed application examples |
| `training financials/` | Financial document samples |
| `training industry reports/` | Industry report samples |
| `training loss runs/` | Loss run samples |
| `training policies/` | Policy document samples |
| `training quotes/` | Quote document samples |
| `training marketing material/` | Marketing collateral samples |

**Note:** Gitignored - large binary files for AI training, not tracked in repo.

---

## Root Files

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | Project overview and setup instructions | Active |
| `CLAUDE.md` | AI session instructions for Claude Code | Active |
| `requirements.txt` | Python dependencies | Active |

---

---

## venv/ - Python Virtual Environment

**What this is:** Isolated Python environment with project dependencies installed. Keeps project packages separate from your system Python.

| Item | What It Is |
|------|-----------|
| `venv/` | Virtual environment folder (Python 3.13) |
| `.env` | **NOT a virtual environment** - text file with environment variables (API keys, DB URLs) |

**Gitignored:** Yes
**Safe to delete:** Yes - recreate with:
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Key distinction:**
- `.env` = secrets/config (text file, ~1KB)
- `venv/` = installed Python packages (folder, ~100MB+)

---

## Summary TODOs

Consolidated list of TODOs identified during folder review:

| Priority | Task | Section |
|----------|------|---------|
| Medium | Refactor api/main.py into routers | api/ |
| Low | Export full DB schema from Supabase | db_setup/ |

---

*Document created: 2025-01-24*
*Last updated: 2026-01-24*

