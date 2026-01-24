# Master Project Roadmap

**Last Updated:** 2026-01-06  
**Purpose:** Single entry point for all project planning and roadmap documents

---

## Overview

This document serves as the central hub for all planning documents and roadmaps in the Sub Assistant project. It provides a high-level view of what's been completed, what's in progress, and what's planned.

**Key Principles:**
- **AI-first approach**: AI proposes, human disposes
- **Streamlit-based**: Main application is built with Streamlit (see `app.py`, `pages_workflows/`, `pages_components/`)
- **Data-driven**: All decisions backed by extraction provenance and feedback loops

**Note:** The project started as and remains primarily a Streamlit application. There is a React frontend in `frontend/` and mockups in `mockup/`, but the main production implementation is Streamlit.

---

## Active Roadmaps

### Main Development Roadmap
- **[PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)** - Comprehensive 15-phase development roadmap
  - Phases 1-4, 7-10, 12: ✅ Complete
  - Phase 13-14: ⚠️ Partially complete
  - Phases 5-6, 11, 15: ❌ Not started

### Feature-Specific Roadmaps
- **[PLAN_midterm_endorsement_redesign.md](../PLAN_midterm_endorsement_redesign.md)** - Endorsement system redesign
  - Status: Mostly complete (Phases 1-7 done, testing pending)

---

## Completed Features

### Core Infrastructure ✅
- **Unified Data Flow** (Phase 1.9) - All extraction sources → `submission_extracted_values`
- **AI Agents** (Phase 3) - React frontend with UW/Admin/Quote assistants
- **Decision Snapshots** (Phase 4) - Frozen snapshots at quote/bind/renewal
- **Remarket Detection** (Phase 7) - Prior submission linking and analytics
- **Policy Renewal** (Phase 8) - Renewal queue, comparison, pricing, automation
- **Underwriter Assignment** (Phase 9) - Assignment tracking and "My Queue"
- **Policy Issuance Workflow** (Phase 10) - Subjectivity tracking and checklist
- **Incumbent/Expiring Tower** (Phase 12) - Tower comparison and win/loss tracking

### UI/UX Improvements ✅
- **Review/UW Redesign** - All 4 phases complete
  - See: [implemented/review-uw-redesign-roadmap.md](implemented/review-uw-redesign-roadmap.md)
- **Unified Extraction Panel** - Phases 1-5 complete
  - See: [implemented/unified-extraction-panel-plan.md](implemented/unified-extraction-panel-plan.md)
- **Benchmarking Tab** - Similar submissions with pricing/outcome data
  - See: [implemented/benchmarking_tab_plan.md](implemented/benchmarking_tab_plan.md)
- **Conflict Detection System** - Full implementation with review queue
  - See: [implemented/conflict_review_implementation_plan.md](implemented/conflict_review_implementation_plan.md)
- **Loss History Enhancements** - All 3 projects complete
  - See: [implemented/loss-history-enhancements.md](implemented/loss-history-enhancements.md)

### Feature Implementations ✅
- **Coverage & Sublimits** - Policy form selection and coverage management
  - See: [implemented/coverage_sublimits_plan.md](implemented/coverage_sublimits_plan.md)
- **Collaborative Workflow** - Database schema and API endpoints (UI pending)
  - See: [collaborative-uw-workflow-spec.md](collaborative-uw-workflow-spec.md)

---

## In Progress

### Partially Implemented ⚠️
- **UW Knowledge Base** (Phase 13)
  - ✅ Frontend complete (5-tab Streamlit dashboard)
  - ⏳ Remaining: API layer, move questions to DB, credibility score UI
  - See: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md#phase-13-uw-knowledge-base-partially-complete)

- **Endorsement Management** (Phase 14)
  - ✅ Schema complete (document_library, quote_endorsements, policy_endorsements)
  - ✅ Quote-level and mid-term endorsements working
  - ⏳ Remaining: Fill-in UI decision, more endorsement types, coverage editor integration
  - See: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md#phase-14-endorsement-management-mostly-complete)

- **Broker Relationship Management**
  - ✅ Schema complete (broker_activities table)
  - ⏳ Remaining: Outreach recommendations, email-to-notes workflow
  - See: [broker_relationship_management_plan.md](broker_relationship_management_plan.md)

- **Unified Extraction Panel**
  - ✅ Phases 1-5 complete
  - ⏳ Phase 6: Testing & cleanup pending
  - See: [implemented/unified-extraction-panel-plan.md](implemented/unified-extraction-panel-plan.md)

---

## Planned (Not Started)

### High Priority
- **Claims Feedback Loop** (Phase 5)
  - Use claims data to evolve importance priorities
  - See: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md#phase-5-claims-feedback-loop-future)

- **Proactive Agent Notifications** (Phase 6)
  - Intelligent notifications that surface issues without user asking
  - See: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md#phase-6-proactive-agent-notifications-future)

### Medium Priority
- **Email Vote Queue** (Phase 11)
  - Allow voting on prescreen submissions via email link
  - See: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md#phase-11-email-vote-queue)

- **UI Enhancements** (Phase 15)
  - Header editing, full-screen setup, responsive improvements, dark mode
  - See: [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md#phase-15-ui-enhancements)

### Lower Priority / Future Considerations
- **Page Consolidation** - Merge 7 pages → 5 stages
  - See: [page-consolidation-project.md](page-consolidation-project.md)
  - Status: Planning phase, not started

- **Document Library Redesign** - Component-based architecture
  - See: [document_library_redesign.md](document_library_redesign.md)
  - Status: Option 1 recommended, not implemented

- **Retro Schedule Smart Defaults** - Auto-populate retro based on position/coverages
  - See: [retro_schedule_plan.md](retro_schedule_plan.md)
  - Status: Planning, not implemented

---

## Implementation Status Index

For detailed implementation status of each planning document, see:
- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Comprehensive status of all planning documents

---

## Related Documentation

### Architecture & Design
- [Architecture](architecture.md) - System architecture and workflows
- [Unified Data Architecture Vision](unified-data-architecture-vision.md) - Data flow design
- [AI Knowledge Architecture](ai-knowledge-architecture.md) - AI knowledge strategy
- [AI Agent API Contract](ai-agent-api-contract.md) - API design
- [AI Agent UI Design](ai-agent-ui-design.md) - UI design

### Reference Guides
- [Product Philosophy](product-philosophy.md) - Design principles
- [Developer Guide](developer-guide.md) - Development setup
- [Getting Started](getting-started.md) - Quick start guide
- [Conflicts Guide](conflicts_guide.md) - Conflict detection reference

### Archived Plans
See [docs/archived/](archived/) for superseded documentation.

---

## Quick Reference: Status by Category

| Category | Complete | Partial | Not Started |
|----------|----------|---------|-------------|
| **Core Infrastructure** | 8 | 0 | 0 |
| **UI/UX Improvements** | 5 | 1 | 0 |
| **Feature Implementations** | 2 | 3 | 0 |
| **Future Features** | 0 | 0 | 6 |

**Total:** 15 Complete, 4 Partial, 6 Not Started

---

## How to Use This Document

1. **Starting a new feature?** Check this document first to see if there's an existing plan
2. **Updating status?** Update both this document and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
3. **Creating a new plan?** Add it to the appropriate section and link from here
4. **Completing a feature?** Move the plan to "Completed Features" and update status

---

*For questions or updates, refer to the individual planning documents linked above.*

