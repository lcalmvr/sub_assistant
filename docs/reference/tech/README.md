# API Documentation

This folder contains documentation for third-party APIs used in this project. These documents provide context for Claude Code to understand how each API is used and integrated.

## Available Documentation

| File | API | Purpose |
|------|-----|---------|
| [OPENAI.md](./OPENAI.md) | OpenAI API | LLM completions for parsing, summaries, recommendations |
| [SUPABASE.md](./SUPABASE.md) | Supabase | PostgreSQL database, pgvector, file storage |
| [AWS_TEXTRACT.md](./AWS_TEXTRACT.md) | AWS Textract | Document OCR with bounding boxes, forms extraction |
| [TAVILY.md](./TAVILY.md) | Tavily | Internet search for RAG applications |
| [LANGCHAIN.md](./LANGCHAIN.md) | LangChain | RAG framework, chains, retrievers |
| [WEASYPRINT.md](./WEASYPRINT.md) | WeasyPrint | HTML to PDF generation |
| [STREAMLIT.md](./STREAMLIT.md) | Streamlit | Frontend web framework |

## API Summary

### Core Infrastructure

| API | Environment Variables | Files |
|-----|----------------------|-------|
| **Supabase** | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE` | `core/db.py`, `core/storage.py` |
| **Streamlit** | - | `app.py`, `pages/`, `pages_workflows/`, `pages_components/` |

### AI/ML Services

| API | Environment Variables | Files |
|-----|----------------------|-------|
| **OpenAI** | `OPENAI_API_KEY`, `TOWER_AI_MODEL` | `ai/tower_intel.py`, `ai/market_news_intel.py`, `ai/guideline_rag.py` |
| **LangChain** | (uses OpenAI key) | `ai/guideline_rag.py` |
| **Tavily** | `TAVILY_API_KEY` | `ai/guideline_rag.py` |

### Document Processing

| API | Environment Variables | Files |
|-----|----------------------|-------|
| **AWS Textract** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` | `ai/textract_extractor.py` |
| **WeasyPrint** | - | `core/document_generator.py`, `core/package_generator.py` |

### Email (Not Documented)

| API | Environment Variables | Files |
|-----|----------------------|-------|
| Gmail IMAP/SMTP | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | `ingestion/poll_inbox*.py`, `broker_portal/api/integrations.py` |

## Usage

When working on code that uses these APIs:

1. **Check the relevant documentation file** for usage patterns and best practices
2. **Reference the environment variables** required for each API
3. **Follow project conventions** documented in `CLAUDE.md` and these files

## Adding New API Documentation

When integrating a new third-party API:

1. Create a new `{API_NAME}.md` file in this folder
2. Include:
   - Environment variables required
   - Files that use the API
   - Basic usage examples
   - Project-specific patterns
   - Best practices
   - References to official documentation
3. Update this README with the new API
