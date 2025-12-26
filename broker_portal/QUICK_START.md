# Quick Start Guide

## Prerequisites

1. Python 3.8+ with virtual environment activated
2. Node.js 16+ installed
3. Database connection configured in `.env`

## Quick Start

### Option 1: Use the startup script

```bash
cd broker_portal
./start.sh
```

### Option 2: Manual startup

#### Terminal 1 - Backend:
```bash
cd broker_portal/api
python3 -m uvicorn main:app --reload --port 8000
```

#### Terminal 2 - Frontend:
```bash
cd broker_portal/frontend
npm install  # First time only
npm run dev
```

## First Time Setup

1. **Install Python dependencies:**
```bash
pip install fastapi uvicorn[standard] python-multipart email-validator python-jose[cryptography] passlib[bcrypt] sqlalchemy
```

2. **Run database migration:**
```bash
psql $DATABASE_URL -f db_setup/create_broker_auth_tables.sql
```

Or using Python:
```python
from core.db import get_conn
from sqlalchemy import text
conn = next(get_conn())
sql = open('db_setup/create_broker_auth_tables.sql').read()
conn.execute(text(sql))
conn.commit()
```

3. **Install Node dependencies:**
```bash
cd broker_portal/frontend
npm install
```

4. **Set environment variables** (in `.env`):
```bash
BROKER_PORTAL_DEV_MODE=true
BROKER_PORTAL_FRONTEND_URL=http://localhost:3000
```

## Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Testing

1. Navigate to http://localhost:3000/login
2. Enter a broker email (must exist in `broker_contacts` or `brkr_employments`)
3. In dev mode, you'll get a token to login directly
4. Or check your email for the magic link (if dev mode is off)

