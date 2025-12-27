# Documentation Index

Reference guides, implementation plans, and troubleshooting documentation for Sub Assistant.

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

| Document | Status | Description |
|----------|--------|-------------|
| [Broker Relationship Management + Outreach Agent](broker_relationship_management_plan.md) | Planned | Broker activities (notes/visits/reminders) + outreach recommendations |
| [Conflict Review Implementation](conflict_review_implementation_plan.md) | Implemented | Dynamic conflict detection with LLM-based analysis |
| [Coverage Sublimits Plan](coverage_sublimits_plan.md) | Implemented | Sublimit/coinsurance structure for coverages |
| [Quote Tab Design](quote_tab_design.md) | Implemented | Quote options panel and tower visualization |
| [Document Library Redesign](document_library_redesign.md) | Planned | Component-based document editing architecture |
| [Post-Bind Lockdown Guide](post_bind_lockdown_guide.md) | Tabled | Field protection after policy binding (research complete) |
| [Caching Implementation](caching_implementation.md) | Implemented | Streamlit caching for performance optimization |

---

## Reference Guides

Operational guides for common tasks and concepts.

| Document | Description |
|----------|-------------|
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

*Last updated: 2025-12-26*
