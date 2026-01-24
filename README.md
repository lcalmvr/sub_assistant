# Sub Assistant

AI-powered cyber insurance underwriting platform.

## Quick Start

**Prerequisites:** Python 3.11+, Node.js 18+, Supabase account

```bash
# Backend
pip install -r requirements.txt
cp .env.example .env  # Add your API keys
uvicorn api.main:app --reload

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

App runs at http://localhost:5173

## Documentation

- [ROADMAP.md](docs/ROADMAP.md) - Current priorities and status
- [architecture.md](docs/architecture.md) - How the system works
- [folder-reference.md](docs/folder-reference.md) - What each folder contains