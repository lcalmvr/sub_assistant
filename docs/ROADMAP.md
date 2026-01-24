# Project Roadmap

**Last Updated:** 2026-01-24

## Vision

AI-powered cyber insurance underwriting platform. AI extracts, analyzes, and recommends - humans review and decide.

**Primary UI:** React frontend (`frontend/`)
**Backend:** FastAPI + Supabase
**Legacy:** Streamlit (maintenance only, will archive)

---

## Current Priorities

What we're focused on right now:

1. **Premium/Term Model** - Layer-level term dates for short-term/annual premium calculation
   - Branch: `feature/annual-short-term-premium`
   - Plan: See active plan file in `.claude/plans/`

2. **Codebase Cleanup** - Complete (this session)
   - Consolidated folder structure
   - Updated documentation system

---

## Active Work

Features in progress:

| Feature | Status | Notes |
|---------|--------|-------|
| Premium/Term Model | In progress | Term date configuration modal planned |
| QuotePageV3 | Active | Main quote interface |

---

## Backlog

Planned but not started:

| Feature | Priority | Notes |
|---------|----------|-------|
| API Router Refactor | Medium | Split api/main.py (15K lines) into routers |
| Update architecture.md | Medium | Currently references old Streamlit files |
| Vet docs (plans/, wip/) | Medium | Review and archive stale docs |
| UW Knowledge Base | Medium | Phase 13 - API layer, DB questions |
| Endorsement Management | Medium | Phase 14 - More endorsement types |
| Claims Feedback Loop | Low | Phase 5 - Control → outcome correlation |
| Collaborative Workflow | Low | UI for multi-UW workflow |

---

## Done

Major features completed:

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

## Archive

Historical plans and completed specs are in `docs/archived/`.

For detailed phase breakdown of the original 15-phase roadmap, see `docs/archived/PROJECT_ROADMAP.md`.
