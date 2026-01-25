# Project Roadmap

**Last Updated:** 2026-01-24

## Vision

AI-powered cyber insurance underwriting platform. AI extracts, analyzes, and recommends - humans review and decide.

**Primary UI:** React frontend (`frontend/`)
**Backend:** FastAPI + Supabase
**Legacy:** Streamlit (archived to `archive/streamlit/`)

---

## Current Priorities

What we're focused on right now:

1. **Codebase Cleanup** - In progress
   - Branch: `chore/codebase-cleanup`
   - Consolidated folder structure, archived Streamlit
   - Storage/extraction bug fixes

---

## Active Work

Features in progress. Each should have a doc in `projects/active/`.

| Feature | Doc | Status |
|---------|-----|--------|
| QuotePageV3 Refinements | [quotepagev3-refactor-plan.md](projects/active/quotepagev3-refactor-plan.md), [quote-v3-formatting.md](projects/active/quote-v3-formatting.md) | Ongoing |

---

## Backlog

Planned but not started. Full docs in `docs/projects/backlog/`.

### UI/UX Improvements
| Feature | Priority | Notes |
|---------|----------|-------|
| Quote options grid redesign | Medium | Tighten layout, add columns, consider cards |
| Quote section completion | Medium | "Done" indicators for UW workflow |
| Premium card primary vs excess | Medium | Different display for layer types |
| Coverage editor submission view | Medium | Add missing submission toggle view |
| Policy page rework | Medium | Apply V2/V3 learnings |
| Simplify setup page | Low | Remove header, focus on doc extraction |
| NIST info tooltip | Low | Explain NIST on Analysis V2 tab |

### Workflow Enhancements
| Feature | Priority | Notes |
|---------|----------|-------|
| Prescreen immediate pickup | Medium | Skip voting, claim directly |
| Generate quote from grid | Medium | Quick PDF generation from list |
| Subjectivity + policy issuance | Medium | Needs scoping |
| Mid-term additional insureds | Medium | Needs scoping |

### Configuration/Choosers
| Feature | Priority | Notes |
|---------|----------|-------|
| Policy form chooser | Medium | Carriers have multiple forms - needs scoping |
| Paper carrier chooser | Medium | Insurers write on multiple papers - needs scoping |
| Document type groupings | Low | Group docs by type in UI |

### Tools
| Feature | Priority | Notes |
|---------|----------|-------|
| Endorsement manuscriptor | Medium | Custom endorsement drafting - needs scoping |
| PDF generation standardization | Medium | Repeatable templates/approach |
| Optimistic updates pattern | Medium | UI responsiveness guidelines |

### Infrastructure
| Feature | Priority | Notes |
|---------|----------|-------|
| API Router Refactor | Medium | Split api/main.py into routers |
| Storage fallback tests | Low | Test extraction fallback paths |

### Legacy/Deferred
| Feature | Priority | Notes |
|---------|----------|-------|
| UW Knowledge Base | Low | Phase 13 - API layer, DB questions |
| Claims Feedback Loop | Low | Phase 5 - Control → outcome correlation |
| Collaborative Workflow | Low | UI for multi-UW workflow |

---

## Done

Major features completed (detailed docs in `docs/projects/implemented/`):

### Infrastructure
- Unified data flow (extraction → `submission_extracted_values`)
- Decision snapshots at quote/bind/renewal
- Supabase storage integration
- Document extraction pipeline (Textract + Claude)

### UI/Workflow
- QuotePageV3 with tower visualization
- Review/UW tabs with inline editing
- Conflict detection and review queue
- Benchmarking comparisons
- Loss history display

### Policy Lifecycle
- Policy renewal workflow
- Underwriter assignment
- Policy issuance checklist
- Incumbent/expiring tower comparison

---

## Reference

- **Active project docs:** `docs/projects/active/`
- **Backlog (planned):** `docs/projects/backlog/`
- **Completed feature docs:** `docs/projects/implemented/`
- **Outdated/legacy docs:** `docs/projects/legacy/`
- **Operational guides:** `docs/guides/`
- **Historical 15-phase roadmap:** `docs/projects/implemented/PROJECT_ROADMAP.md`
