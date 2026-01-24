# Quick Start Guide

## Starting the Mock Broker Platform

### Option 1: Using the Start Script

```bash
cd mock_broker_platform
./start.sh
```

This will:
- Start the server on port 8080
- Automatically open your browser (on macOS)
- Keep the server running until you press Ctrl+C

### Option 2: Manual Start

```bash
cd mock_broker_platform
python3 -m http.server 8080
```

Then manually open your browser and go to:
**http://localhost:8080**

### Option 3: Using Python's Built-in Server (Alternative Port)

If port 8080 is already in use:

```bash
cd mock_broker_platform
python3 -m http.server 3000
```

Then open: **http://localhost:3000**

## Troubleshooting

### Port Already in Use

If you get an error that port 8080 is already in use:

1. Find what's using it:
   ```bash
   lsof -ti:8080
   ```

2. Kill the process:
   ```bash
   kill -9 $(lsof -ti:8080)
   ```

3. Or use a different port (see Option 3 above)

### Browser Doesn't Open Automatically

If the script doesn't open your browser automatically:

1. The server is still running
2. Just manually open your browser
3. Go to: **http://localhost:8080**

### Server Won't Start

Make sure you're in the `mock_broker_platform` directory:

```bash
cd /Users/vincentregina/sub_assistant/mock_broker_platform
python3 -m http.server 8080
```

## Testing the Mock Broker

1. Fill out the form:
   - Company name (required)
   - Annual revenue (required)
   - Industry (required)
   - Security controls (optional)
   - Policy limit (required)
   - Retention (required)

2. Click "Get Quote"

3. You should see a quote result with premium, limits, and details

## Next Steps

- The mock broker uses hardcoded responses (see `mock-api.js`)
- When FastAPI is built, update `mock-api.js` to call the real API
- See `API_CONTRACT.md` for the API specification







