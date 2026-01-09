# Documentation Index

Reference guides, implementation plans, and troubleshooting documentation for Sub Assistant.

---

## 🗺️ Roadmaps & Planning

**Start here for project planning:**
- **[MASTER_ROADMAP.md](MASTER_ROADMAP.md)** - Central hub for all planning documents and roadmaps
- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Detailed implementation status of all planning documents
- **[PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)** - Main 15-phase development roadmap

---

## Quick Start

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | How to start the Streamlit app (commands, troubleshooting, folder structure) |
| [Developer Guide](developer-guide.md) | Setup, testing, and development reference |
| [Architecture](architecture.md) | System workflow diagrams and component architecture |

---

## Feature Implementation Plans

Detailed plans for features - some implemented, some tabled for future sprints.

**See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for complete status of all plans.**

### Active Plans
| Document | Status | Description |
|----------|--------|-------------|
| [Broker Relationship Management + Outreach Agent](broker_relationship_management_plan.md) | ⚠️ Partial | Broker activities (notes/visits/reminders) + outreach recommendations |
| [Collaborative UW Workflow](collaborative-uw-workflow-spec.md) | ⚠️ Partial | Collaborative voting workflow (database done, UI pending) |
| [Document Library Redesign](document_library_redesign.md) | ❌ Planned | Component-based document editing architecture |
| [Page Consolidation Project](page-consolidation-project.md) | ❌ Planned | Consolidate 7 pages → 5 stages |
| [Retro Schedule Plan](retro_schedule_plan.md) | ❌ Planned | Smart defaults for retro schedule |

### Implemented Plans (Archived)
See [implemented/](implemented/) folder for completed plans:
- [Review/UW Redesign](implemented/review-uw-redesign-roadmap.md) ✅
- [Unified Extraction Panel](implemented/unified-extraction-panel-plan.md) ✅
- [Benchmarking Tab](implemented/benchmarking_tab_plan.md) ✅
- [Conflict Review Implementation](implemented/conflict_review_implementation_plan.md) ✅
- [Coverage Sublimits Plan](implemented/coverage_sublimits_plan.md) ✅
- [Loss History Enhancements](implemented/loss-history-enhancements.md) ✅

### Other Plans
| Document | Status | Description |
|----------|--------|-------------|
| [Quote Tab Design](quote_tab_design.md) | ✅ Implemented | Quote options panel and tower visualization |
| [Post-Bind Lockdown Guide](post_bind_lockdown_guide.md) | Tabled | Field protection after policy binding (research complete) |
| [Caching Implementation](caching_implementation.md) | ✅ Implemented | Streamlit caching for performance optimization |

---

## Reference Guides

Operational guides for common tasks and concepts.

| Document | Description |
|----------|-------------|
| [Product Philosophy](product-philosophy.md) | AI vs. manual development, performance/lag tolerance, Streamlit vs. React |
| [Account & Renewal Guide](account-renewal-guide.md) | Account linking, prior submission context, remarket/renewal workflows |
| [Conflicts Guide](conflicts_guide.md) | Conflict types, detection rules, and application credibility scoring |
| [Supabase Security Fix](supabase-security-fix.md) | RLS setup and security warning fixes |
| [Batch Edit Rollback](batch-edit-rollback.md) | How to roll back batch edit UI changes if needed |

---

## Sub-Project Documentation

Documentation for standalone sub-projects (kept with their respective codebases).

| Project | Files |
|---------|-------|
| `broker_portal/` | README.md, QUICK_START.md |
| `mock_broker_platform/` | README.md, QUICK_START.md, API_CONTRACT.md |

---

## Archived

Old documentation that has been superseded. See `archived/` folder:
- `PROCESS_FLOW.md` - Original process flow (replaced by architecture.md)
- `REVENUE_EXTRACTION_IMPLEMENTATION.md` - Legacy implementation notes
- `DEVELOPER_QUICK_REFERENCE.md` - Superseded by developer-guide.md

---

*Last updated: 2025-12-27*
