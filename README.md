# Sub Assistant

AI-powered cyber insurance underwriting platform.

## Quick Start

**Prerequisites:** Python 3.11+, Node.js 18+, Supabase project (required for storage)

```bash
# Backend
pip install -r requirements.txt
cp .env.example .env  # Configure required services (see below)
uvicorn api.main:app --reload

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

App runs at http://localhost:5173

### Required Configuration

The following must be configured in `.env` for the app to function:

| Service | Purpose | Setup |
|---------|---------|-------|
| Supabase | Database + document storage | [supabase-storage-setup.md](docs/guides/supabase-storage-setup.md) |
| Anthropic | AI extraction/analysis | Get key from console.anthropic.com |
| AWS Textract | Document OCR | Configure IAM credentials |

On startup, the API will report configuration status. Missing storage config will cause upload failures.

## Documentation

- [ROADMAP.md](docs/ROADMAP.md) - Current priorities and status
- [architecture.md](docs/architecture.md) - How the system works
- [folder-reference.md](docs/folder-reference.md) - What each folder contains