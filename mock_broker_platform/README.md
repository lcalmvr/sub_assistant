# Mock Broker Platform

A demonstration interface showing how broker platforms would integrate with the insurance quoting API.

## Purpose

This mock broker platform serves as:
1. **Proof of Concept** - Demonstrates broker integration capability
2. **API Design Validation** - Tests the API contract before building FastAPI
3. **Demo Tool** - Shows investors/clients how integration would work
4. **Development Tool** - Helps design the API interface

## Architecture

```
Mock Broker UI (HTML/JS) 
    ↓ (calls)
Mock API (mock-api.js)
    ↓ (will call)
FastAPI Backend (when built)
    ↓ (uses)
Rating Engine + Core Logic
```

## Current Status

- ✅ **Mock UI** - Professional-looking broker interface
- ✅ **Mock API** - Simulates API calls with hardcoded responses
- ⏳ **Real API** - FastAPI layer (to be built)
- ⏳ **Integration** - Connect mock broker to real API

## Files

- `index.html` - Main broker interface
- `styles.css` - Professional styling
- `app.js` - Form handling and UI logic
- `mock-api.js` - Mock API client (simulates FastAPI calls)

## Running the Mock Broker

### Option 1: Simple HTTP Server

```bash
cd mock_broker_platform
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 2: VS Code Live Server

1. Install "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

### Option 3: Any Web Server

Serve the `mock_broker_platform` directory with any web server.

## API Contract (Design)

The mock broker is designed to call these endpoints:

### POST /api/v1/quote

Submit a quote request.

**Request:**
```json
{
  "company_name": "Acme Corporation",
  "website": "https://acme.com",
  "annual_revenue": 5000000,
  "industry": "Software_as_a_Service_SaaS",
  "security_controls": ["MFA", "EDR", "Backups"],
  "policy_limit": 5000000,
  "retention": 50000
}
```

**Response:**
```json
{
  "success": true,
  "quote": {
    "quote_id": "QUOTE-123456",
    "submission_id": "SUB-123456",
    "company_name": "Acme Corporation",
    "premium": 45000,
    "policy_limit": 5000000,
    "retention": 50000,
    "effective_date": "2024-01-01",
    "expiration_date": "2025-01-01",
    "status": "quoted",
    "quote_details": {
      "base_premium": 50000,
      "control_credits": 5000,
      "industry": "Software_as_a_Service_SaaS",
      "revenue": 5000000
    }
  }
}
```

### GET /api/v1/quote/{quote_id}

Get quote status and details.

### POST /api/v1/submission

Create a new submission (optional, for broker-initiated submissions).

## Connecting to Real API

When FastAPI is built:

1. Open `mock-api.js`
2. Set `API_CONFIG.useMock = false`
3. Set `API_CONFIG.baseUrl` to your FastAPI URL
4. Add authentication if needed

The mock broker will then call the real API instead of using hardcoded responses.

## Demo Script

**For Investors/Clients:**

1. **Show the interface** - "This simulates what a broker sees in their platform"
2. **Fill out the form** - Enter company details, revenue, industry, controls
3. **Click "Get Quote"** - Show the API call happening (DevTools → Network tab)
4. **Show the results** - Quote with premium, limits, details
5. **Explain the integration** - "This is the same API any broker platform would call"

## Next Steps

1. ✅ Build mock broker UI (done)
2. ⏳ Design API contract (documented here)
3. ⏳ Build FastAPI layer (implements this contract)
4. ⏳ Connect mock broker to real API
5. ⏳ Add authentication/authorization
6. ⏳ Add ACORD compliance
7. ⏳ Create integration documentation

## Notes

- The mock broker is **completely independent** of the Streamlit app
- It can be built and demoed **before** FastAPI exists
- When FastAPI is ready, just swap mock responses for real API calls
- This validates the API design before building the backend






