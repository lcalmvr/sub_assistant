# Project Context for Claude

This file provides context for Claude Code sessions working on this project.

## Product Philosophy

**Audience**: Internal underwriting tool for commercial insurance.

**AI-first approach**: AI proposes, human disposes. AI extracts data, suggests conflicts, drafts documents - humans review and approve. Don't build elaborate manual UI for things AI should just do.

### When to Build AI-First vs Manual-First

| Build Manual-First When | Build AI-First When |
|-------------------------|---------------------|
| Domain is complex, still learning it | Task is clearly automatable |
| Failure is costly (wrong premium, missed exclusion) | Failure is cheap to fix |
| Users need to trust/verify output | Manual would be tedious busywork |
| Need baseline to measure AI accuracy | You already understand the domain |

### Performance Expectations

| Interaction | Frustrating | Tolerable | Good |
|-------------|-------------|-----------|------|
| Button click | >500ms | 200-500ms | <100ms |
| Tab switch | >1s | 300ms-1s | <300ms |
| Form submit | >2s | 500ms-2s | <500ms |
| Page load | >3s | 1-3s | <1s |

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: FastAPI (Python)
- **Database**: Supabase (PostgreSQL with auth and storage)
- **Language**: Python 3.11+ (backend), JavaScript/JSX (frontend)
- **Key Libraries**: anthropic, openai, pandas, psycopg2, weasyprint

## Documentation Structure

The project uses a simple documentation structure. **Keep this current as we work.**

```
CLAUDE.md              # This file - patterns, conventions, session instructions
docs/
  ROADMAP.md           # Master orchestrator - vision, priorities, links to active work
  folder-reference.md  # Detailed inventory of every folder/file in codebase
  architecture.md      # How the system is built (data flow, components)
  guides/              # Operational how-to docs (stable, accurate)
  projects/
    active/            # Docs for work in progress
    backlog/           # Planned but not yet started
    implemented/       # Completed feature plans (historical reference)
    legacy/            # Outdated, abandoned, superseded docs
```

### What Each Doc Is For

| Doc | Purpose | When to Check | When to Update |
|-----|---------|---------------|----------------|
| `CLAUDE.md` | Patterns, conventions, how to work | Start of session | When we establish new patterns |
| `ROADMAP.md` | Master orchestrator - priorities, links to active projects | Before starting work | After completing features, changing priorities |
| `folder-reference.md` | WHERE things are - file inventory, what's legacy vs active | "Where does X live?" / "What is this folder?" | When adding/moving/archiving folders |
| `architecture.md` | HOW things work - data flow, component interaction | "How does data flow?" / Working on cross-system features | When architecture changes |
| `guides/` | Operational how-to docs | "How do I do X?" | When procedures change |
| `projects/active/` | Current work in progress | When working on a specific feature | When starting new work |
| `projects/backlog/` | Planned but not started | When planning future work | When specs are written |
| `projects/implemented/` | Completed feature plans | When you need context on how something was built | When a feature is done |
| `projects/legacy/` | Outdated/abandoned docs | Rarely - only if you need historical context | When docs become obsolete |

### Keeping Docs Updated

1. **Starting new work**: Create doc in projects/active/, link from ROADMAP.md
2. **After completing a feature**: Move doc from projects/active/ to projects/implemented/, update ROADMAP.md
3. **After abandoning a plan**: Move doc to projects/legacy/, note in ROADMAP.md
4. **When docs become outdated**: Move to projects/legacy/
5. **When establishing new patterns**: Add to this file (CLAUDE.md)
6. **When architecture changes**: Update architecture.md
7. **When adding/moving folders**: Update folder-reference.md

## Directory Structure

```
frontend/              # React frontend (PRIMARY UI)
  src/
    pages/             # Page components (QuotePageV3 is main quote page)
    components/        # Reusable UI components
    utils/             # Frontend utilities
  mockups/             # UI design mockups and prototypes

api/                   # FastAPI backend
  main.py              # All API endpoints (TODO: split into routers)

core/                  # Shared business logic
rating_engine/         # Premium calculation
ai/                    # AI/LLM integration (extraction, classification)
ingestion/             # Document ingestion pipeline
db_setup/              # Database migrations
utils/                 # Python utilities
archive/streamlit/     # Archived Streamlit frontend (reference only)
```

## Code Style

- **No emojis** unless user explicitly requests them
- **Avoid over-engineering** - only make changes that are directly requested
- **Don't add features beyond what was asked** - a bug fix doesn't need surrounding code cleaned up
- **Currency formatting**: Use standard `$` formatting

## React Patterns

- Quote page: `QuotePageV3` at `frontend/src/pages/QuotePageV3.jsx` is the current version
- API calls: Use fetch to `/api/...` endpoints
- State: Component-level state, lift when needed

## Session Instructions

1. **Check ROADMAP.md** at start of significant work to understand priorities
2. **Check architecture.md** when working on features that span multiple systems
3. **Update docs as you go** - don't let them drift from reality
4. **When we establish a new pattern**, offer to add it to this file
5. **Prefer editing existing files** over creating new ones

## Streamlit (Archived)

Streamlit frontend has been archived to `archive/streamlit/`. React has full parity.

Do not use or extend archived code. Reference only if needed for historical context.
