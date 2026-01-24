# Project Context for Claude

This file provides context for Claude Code sessions working on this project.

## Product Philosophy

**Audience**: Internal underwriting tool for commercial insurance.

**AI-first approach**: AI proposes, human disposes. AI extracts data, suggests conflicts, drafts documents - humans review and approve. Don't build elaborate manual UI for things AI should just do.

## Tech Stack

- **Frontend**: React + Vite (primary), Streamlit (legacy)
- **Backend**: FastAPI (Python)
- **Database**: Supabase (PostgreSQL with auth and storage)
- **Language**: Python 3.11+ (backend), JavaScript/JSX (frontend)
- **Key Libraries**: anthropic, openai, pandas, psycopg2, weasyprint

## Documentation Structure

The project uses a simple documentation structure. **Keep this current as we work.**

```
CLAUDE.md              # This file - patterns, conventions, session instructions
docs/
  ROADMAP.md           # Vision → Priorities → Active Work → Done
  architecture.md      # How the system is built
  archived/             # Old plans, completed specs, historical decisions
```

### What Each Doc Is For

| Doc | Purpose | When to Check | When to Update |
|-----|---------|---------------|----------------|
| `CLAUDE.md` | Patterns, conventions, how to work | Start of session | When we establish new patterns |
| `ROADMAP.md` | What we're building, priorities, progress | Before starting work | After completing features, changing priorities |
| `architecture.md` | How the system works | When writing code that touches multiple systems | When architecture changes |
| `archived/` | Historical reference | When you need context on past decisions | When plans complete or are abandoned |

### Keeping Docs Updated

1. **After completing a feature**: Move it from "Active" to "Done" in ROADMAP.md
2. **After abandoning a plan**: Move the plan doc to archived/
3. **When establishing new patterns**: Add to this file (CLAUDE.md)
4. **When architecture changes**: Update architecture.md

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

# Legacy (Streamlit) - do not extend, will archive when React has parity
app.py                 # Streamlit entry point
pages/                 # Streamlit page wrappers
pages_workflows/       # Streamlit page implementations
pages_components/      # Streamlit UI components
```

## Code Style

- **No emojis** unless user explicitly requests them
- **Avoid over-engineering** - only make changes that are directly requested
- **Don't add features beyond what was asked** - a bug fix doesn't need surrounding code cleaned up
- **Currency formatting**: In React, use standard `$` formatting. In Streamlit (legacy), escape as `\\$`

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

## Streamlit (Legacy)

Streamlit is the legacy frontend. Do not extend it. Reference only.

For Streamlit-specific patterns (if needed for maintenance), see `STYLE_GUIDE.md`.

Streamlit-related folders to eventually archive when React has full parity:
- `app.py`, `pages/`, `pages_workflows/`, `pages_components/`
- `utils/tab_state.py`
- Streamlit-only modules in `ai/`
