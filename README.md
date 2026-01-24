# Sub Assistant - Cyber Insurance Submission Processing System

AI-powered system for processing cyber insurance submissions, analyzing documents, and generating quotes with automated risk assessment.

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (via Supabase)
- OpenAI API key

### Installation
```bash
# Clone and setup
git clone <repository-url>
cd sub_assistant

# Backend setup
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys and Supabase URL

# Frontend setup
cd frontend
npm install
```

### Run the Application
```bash
# Start the API server
uvicorn api.main:app --reload

# Start the React frontend (in another terminal)
cd frontend
npm run dev

# Process test data
python ingest_local.py --dir fixtures/acme/
```

## System Overview

**Architecture:**
- **React Frontend** (primary) - Modern underwriting dashboard at `frontend/`
- **FastAPI Backend** - REST API at `api/main.py` (328 endpoints)
- **Supabase** - PostgreSQL database with auth and storage
- **AI Engine** - Document extraction and underwriting recommendations

**Process Flow:**
```
Email/Upload → Document Processing → AI Analysis → Rating → Quote Generation
```

## Project Structure

```
sub_assistant/
├── frontend/              # React frontend (primary UI)
│   ├── src/
│   │   ├── pages/         # Main page components
│   │   ├── components/    # Reusable UI components
│   │   └── utils/         # Frontend utilities
│   └── mockups/           # UI design mockups
├── api/                   # FastAPI backend
│   └── main.py            # All API endpoints
├── core/                  # Shared business logic
├── rating_engine/         # Premium calculation engine
├── ai/                    # AI/LLM integration
├── ingestion/             # Document ingestion pipeline
├── db_setup/              # Database migrations
├── fixtures/              # Test data
├── docs/                  # Documentation
├── sandbox/               # Side projects and experiments
└── archive/               # Deprecated code (reference only)
```

**Legacy (Streamlit):**
- `app.py` - Streamlit entry point
- `pages/` - Streamlit multipage routing
- `pages_workflows/` - Streamlit page implementations
- `pages_components/` - Streamlit UI components

## Key Features

- **Automated Document Extraction** - AI parses applications and extracts structured data
- **Security Controls Detection** - Identifies MFA, EDR, backups from text
- **AI-Powered Underwriting** - Quote/Decline/Refer recommendations with citations
- **Tower-Based Rating** - Configurable excess tower structures with multiple carriers
- **PDF Quote Generation** - Professional quote documents

## Documentation

See [`docs/`](docs/) directory:
- [Developer Guide](docs/developer-guide.md) - Development setup and conventions
- [Architecture](docs/architecture.md) - System architecture
- [Folder Reference](docs/folder-reference.md) - Complete folder-by-folder guide

## License

[Add your license information here]