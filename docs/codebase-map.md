# Codebase Map

Purpose
- Give a quick, accurate map of where things live.
- Help new work land in the right place without re-discovery.

---

## Primary Apps

Frontend (React)
- Root: `frontend/`
- QuoteV3: `frontend/src/components/quote/` and `frontend/src/components/quote/summary/`
- Shared UI: `frontend/src/components/`
- State/data: `frontend/src/utils/`, `frontend/src/hooks/`

Streamlit App
- Entry: `app.py`
- Pages: `pages/`
- Page components: `pages_components/`
- Page workflows: `pages_workflows/`

Backend / Services
- API: `api/`
- Core app logic: `core/`
- Ingestion: `ingestion/`
- Rating engine: `rating_engine/`
- Shared utilities: `utils/`
- DB scripts: `db_setup/`

Other Apps
- Broker portal: `broker_portal/`
- Mock broker platform: `mock_broker_platform/`

---

## Documentation

Primary docs (source of truth)
- Root: `docs/`
- Index: `docs/README.md`
- Plans: `docs/plans/`, `docs/MASTER_ROADMAP.md`
- Implemented: `docs/implemented/`
- Archived: `docs/archived/`

Secondary docs (needs consolidation)
- `documentation/` (provider/tool notes)

---

## Assets / Mockups

Current locations
- `mockup/`, `mockups/`
- Root PDFs: `AtBay.pdf`, `endorsement_test.pdf`, `Quote UI screenshots Comments.pdf`, `v14 feedback.pdf`

Suggested home
- `docs/assets/` (screenshots, PDFs)
- `docs/mockups/` (UI mockups)

---

## Legacy / Parking Lots

Likely legacy or parking
- `archive/`
- `deprecated/`
- `training docs/`
- `uploads/`

Action
- Keep but add a short README in each folder to clarify status and expected usage.

---

## Suggested Light Cleanup (Optional)

1) Move `documentation/` → `docs/reference/tech/`
2) Move PDFs + mockups → `docs/assets/` and `docs/mockups/`
3) Add `README.md` stubs in `archive/`, `deprecated/`, `training docs/` with purpose + “do not use” note if applicable
4) Update `docs/README.md` to link this map

