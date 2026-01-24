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
   - Plan: [active/premium-term-plan.md](active/premium-term-plan.md)

2. **Codebase Cleanup** - In progress
   - Consolidated folder structure
   - Reviewing docs for integration vs archive

---

## Active Work

Features in progress. Each should have a doc in `active/`.

| Feature | Doc | Status |
|---------|-----|--------|
| Premium/Term Model | [premium-term-plan.md](active/premium-term-plan.md) | In progress |
| QuotePageV3 Refinements | [quotepagev3-refactor-plan.md](active/quotepagev3-refactor-plan.md), [quote-v3-formatting.md](active/quote-v3-formatting.md) | Ongoing |

---

## Backlog

Planned but not started:

| Feature | Priority | Notes |
|---------|----------|-------|
| API Router Refactor | Medium | Split api/main.py (15K lines) into routers |
| Update architecture.md | Medium | Currently references old Streamlit files |
| UW Knowledge Base | Medium | Phase 13 - API layer, DB questions |
| Endorsement Management | Medium | Phase 14 - More endorsement types |
| Claims Feedback Loop | Low | Phase 5 - Control → outcome correlation |
| Collaborative Workflow | Low | UI for multi-UW workflow |

---

## Done

Major features completed (detailed docs in `archived/implemented/`):

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

- **Active project docs:** `docs/active/`
- **Completed/archived docs:** `docs/archived/`
- **Historical 15-phase roadmap:** `docs/archived/PROJECT_ROADMAP.md`
