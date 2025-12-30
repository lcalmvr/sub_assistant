# Project Context for Claude

This file provides context for Claude Code sessions working on this project.

## Tech Stack

- **Frontend**: Streamlit 1.50+ (Python-based reactive web framework)
- **Database**: Supabase (PostgreSQL with auth and storage)
- **Language**: Python 3.11+
- **Key Libraries**: pandas, psycopg2, python-dotenv

## Documentation References

- Streamlit API Reference: https://docs.streamlit.io/develop/api-reference
- Streamlit Changelog: https://docs.streamlit.io/develop/quick-reference/changelog

**IMPORTANT**: Always fetch and check these docs before suggesting workarounds for Streamlit issues - features change frequently. Many "known limitations" have been fixed in recent versions.

## Streamlit Conventions

### Tab State Management
- `st.tabs()` has a `default` parameter for setting the initially active tab
- Use `default=tab_label` to control which tab is shown on rerun
- Tab state is managed via `utils/tab_state.py` - see `rerun_on_*_tab()` helpers
- Use `on_change` callbacks on widgets to set `_active_tab` session state BEFORE Streamlit's natural rerun

### Rerun Patterns
- **Single rerun preferred**: Double reruns cause issues (messages showing every-other-click, jerkiness)
- For buttons: Use `on_click` callback for tab state, but avoid explicit `st.rerun()` when possible
- For selectboxes: Use `on_change` callback for tab state; DB saves happen during natural rerun

### Fragments
- `@st.fragment` can isolate reruns to a section, but has issues with first-render content
- Avoid for content that must render on initial page load
- Good for: list operations, toggles, isolated CRUD

### Session State
- Prefix internal keys with `_` (e.g., `_active_tab`, `_create_option_success`)
- Clear/pop state after consuming to avoid stale data

## Code Style Preferences

See `STYLE_GUIDE.md` for detailed UI conventions. Key points:

- **Currency**: Always escape `$` as `\\$` in `st.markdown()` and `st.caption()`
- **Separators**: Use middot (`·`) not pipes or dashes
- **Spacing**: Use single markdown block with soft line breaks (`  \n`) to avoid double spacing
- **No emojis** unless user explicitly requests them

## Architecture Notes

### Directory Structure
```
app.py                  # Main entry point
pages/                  # Streamlit multipage app pages (thin wrappers)
pages_workflows/        # Heavy page implementations (submissions.py is main workflow)
pages_components/       # Reusable UI components
core/                   # Business logic (DB operations, document generation, etc.)
rating_engine/          # Premium calculation engine
utils/                  # Shared utilities (tab_state.py, formatting, etc.)
ai/                     # AI/LLM integration
db_setup/               # SQL migrations and setup scripts
docs/                   # Internal documentation
```

### Main Workflow
The primary workflow is in `pages_workflows/submissions.py` which renders:
- 7 main tabs: Account, Review, UW, Comps, Rating, Quote, Policy
- Tab state preserved via `st.tabs(default=...)` and `_active_tab` session state

### Component Patterns
- Components in `pages_components/` receive `sub_id` and render their section
- Use `get_conn()` from `core/db.py` for database connections
- Tower/quote data managed via `pages_components/tower_db.py`

## Known Gotchas

1. **Tab bouncing**: Solved with `st.tabs(default=...)` parameter (Streamlit 1.41+)
2. **Double rerun issues**: Avoid calling `st.rerun()` after `on_click`/`on_change` callbacks - the natural rerun is usually sufficient
3. **Dollar sign rendering**: `$` in markdown triggers LaTeX mode - always escape as `\\$`
4. **Message persistence**: `st.success()` only lasts one render - if calling `st.rerun()`, message disappears
5. **Nested tabs**: CSS that hides tabs can affect nested tabs too - be careful with global selectors

## Session Instructions

1. **Streamlit issues**: Before suggesting workarounds, fetch current docs from https://docs.streamlit.io/develop/api-reference - many old limitations are fixed
2. **Pattern establishment**: When we establish a new pattern or preference, offer to add it to this file
3. **Tab state**: For any widget on a tab that triggers rerun, use the appropriate `on_change_stay_on_*` callback from `utils/tab_state.py`
4. **Testing changes**: After Streamlit UI changes, verify no tab bouncing and messages display correctly

## Project-Specific Documentation

See `docs/` folder for detailed guides:
- `tab-state-and-performance.md` - Tab state management patterns
- `architecture.md` - System architecture overview
- `developer-guide.md` - Development setup and conventions
- `product-philosophy.md` - Product vision, audience, and design principles
