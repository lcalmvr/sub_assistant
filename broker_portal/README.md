# Broker Portal

A separate broker-facing portal built with FastAPI and React that allows brokers to view their submissions, statistics, upload documents, and manage designees.

## Features

- **Email Magic Link Authentication** - Passwordless login via email magic links (with dev mode for testing)
- **Submissions View** - View all submissions with status, outcome, and filtering
- **Detailed Statistics** - Premium totals, bound rates, average deal sizes, timeline metrics
- **Document Upload** - Upload documents that notify UW team and update submission status
- **Designee Management** - Grant access to other users to view your submissions

## Architecture

- **Backend**: FastAPI (Python) - `broker_portal/api/`
- **Frontend**: React + Vite - `broker_portal/frontend/`
- **Database**: PostgreSQL (reuses existing database)

## Setup

### Prerequisites

- Python 3.8+
- Node.js 16+
- PostgreSQL database (existing sub_assistant database)

### Backend Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Run database migration:
```bash
# Connect to your database and run:
psql $DATABASE_URL -f db_setup/create_broker_auth_tables.sql
```

3. Set environment variables (add to `.env`):
```bash
DATABASE_URL=postgresql://...
BROKER_PORTAL_DEV_MODE=true  # Set to false in production
BROKER_PORTAL_FRONTEND_URL=http://localhost:3000
BROKER_PORTAL_EMAIL_FROM=noreply@example.com
BROKER_PORTAL_UW_NOTIFICATION_EMAIL=uw-team@example.com

# Email configuration (optional, for production)
SMTP_ENABLED=true
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

4. Run the FastAPI server:
```bash
cd broker_portal/api
python main.py
# Or use uvicorn directly:
uvicorn main:app --reload --port 8000
```

### Frontend Setup

1. Install dependencies:
```bash
cd broker_portal/frontend
npm install
```

2. Create `.env` file:
```bash
VITE_API_URL=http://localhost:8000
```

3. Run development server:
```bash
npm run dev
```

The frontend will be available at http://localhost:3000

## Development Mode

When `BROKER_PORTAL_DEV_MODE=true`, the magic link endpoint will return a token directly instead of sending an email. This allows testing without email configuration.

1. Request magic link with your broker email
2. Copy the dev token from the response
3. Click "Login with Token" button

## API Endpoints

### Authentication
- `POST /api/broker/auth/magic-link` - Request magic link
- `POST /api/broker/auth/callback?token=...` - Validate token and create session
- `POST /api/broker/auth/logout` - Logout

### Submissions
- `GET /api/broker/submissions` - List submissions (with optional status/outcome filters)
- `GET /api/broker/submissions/{id}` - Get submission details

### Statistics
- `GET /api/broker/stats` - Get detailed statistics

### Documents
- `GET /api/broker/submissions/{id}/documents` - List documents
- `POST /api/broker/submissions/{id}/documents` - Upload document

### Designees
- `GET /api/broker/designees` - List designees
- `POST /api/broker/designees` - Add designee
- `DELETE /api/broker/designees/{id}` - Remove designee

## Testing

1. Ensure you have broker contacts in the database (either in `broker_contacts` or `brkr_employments`)
2. Start backend: `cd broker_portal/api && python main.py`
3. Start frontend: `cd broker_portal/frontend && npm run dev`
4. Navigate to http://localhost:3000/login
5. Enter a broker email address
6. In dev mode, use the returned token to login

## Production Deployment

1. Set `BROKER_PORTAL_DEV_MODE=false`
2. Configure SMTP settings for email sending
3. Build frontend: `cd broker_portal/frontend && npm run build`
4. Serve frontend static files via nginx or similar
5. Run FastAPI with gunicorn/uvicorn behind a reverse proxy
6. Configure CORS to allow your frontend domain

## Integration with Existing System

The broker portal integrates with the existing sub_assistant system:

- Uses existing `submissions`, `accounts`, `documents` tables
- Supports both broker systems: `broker_contacts` (simple) and `brkr_employments` (alt)
- Reuses `core/submission_status.py` for status updates
- Document uploads trigger email notifications to UW team
- Document uploads update submission status to `pending_info`

## Security

- Magic links expire after 15 minutes
- Sessions expire after 24 hours
- Single-use magic link tokens
- All API endpoints require authentication
- Brokers can only see their own submissions (or those they're designated to view)
- HTTPS required in production

