#!/bin/bash

# Quick start script for Mock Broker Platform

echo "🚀 Starting Mock Broker Platform..."
echo ""

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Start Python HTTP server in background
echo "Starting server on http://localhost:8080..."
python3 -m http.server 8080 > /dev/null 2>&1 &
SERVER_PID=$!

# Wait a moment for server to start
sleep 1

# Open browser (works on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:8080
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:8080 2>/dev/null || echo "Please open http://localhost:8080 in your browser"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    start http://localhost:8080
else
    echo "Please open http://localhost:8080 in your browser"
fi

echo ""
echo "✅ Server running at http://localhost:8080"
echo "📝 Press Ctrl+C to stop the server"
echo ""

# Wait for user to stop
trap "kill $SERVER_PID 2>/dev/null; exit" INT TERM
wait $SERVER_PID

