#!/bin/bash

# Find an available port
PORT=9000
while lsof -ti:$PORT >/dev/null 2>&1; do
    PORT=$((PORT + 1))
done

# Kill any existing server on the chosen port
lsof -ti:$PORT | xargs kill -9 2>/dev/null

# Start the server
cd "$(dirname "$0")"
echo "🚀 Starting Mock Broker Platform..."
echo "📡 Server running at: http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

python3 -m http.server $PORT

